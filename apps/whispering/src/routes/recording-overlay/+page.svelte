<script lang="ts" module>
	import { defineErrors } from 'wellcrafted/error';

	/**
	 * The reposition session runs on window verbs the overlay's Tauri capability
	 * has to grant one by one, so a denied permission shows up here as a rejected
	 * promise rather than a visible failure. Logged rather than swallowed: a
	 * silent no-op is exactly what a missing capability looked like the first
	 * time, and it cost a live debugging session to find.
	 */
	const RecordingOverlayPageError = defineErrors({
		RepositionFailed: ({ cause }: { cause: unknown }) => ({
			message: 'Recording overlay reposition step failed',
			cause,
		}),
	});
</script>

<script lang="ts">
	import type { UnlistenFn } from '@tauri-apps/api/event';
	import {
		currentMonitor,
		getCurrentWindow,
		LogicalPosition,
	} from '@tauri-apps/api/window';
	import { onDestroy, onMount } from 'svelte';
	import { createLogger } from 'wellcrafted/logger';
	import {
		DEFAULT_OVERLAY_ANCHOR,
		formatAnchorLabel,
		type LogicalRect,
		nearestAnchorFromRect,
		type OverlayAnchor,
		resolveAnchorPosition,
	} from '$lib/recording-overlay/anchor-position';
	import {
		OVERLAY_HEIGHT,
		OVERLAY_WIDTH,
	} from '$lib/recording-overlay/constants';
	import {
		recordingOverlayAction,
		recordingOverlayEnterReposition,
		recordingOverlayMicLevel,
		recordingOverlayReady,
		recordingOverlayRepositionResult,
		recordingOverlayStatus,
		revealMainWindow,
	} from '$lib/recording-overlay/events';
	import { foldMicLevel } from '$lib/recording-pill/level';
	import type {
		RecordingPillAction,
		RecordingPillStatus,
	} from '$lib/recording-pill/model';
	import RecordingPill from '$lib/recording-pill/RecordingPill.svelte';
	import RecordingPillReposition from '$lib/recording-pill/RecordingPillReposition.svelte';

	// Tauri adapter for the recording pill. The overlay lives in its own webview,
	// so it cannot read the recorder state modules directly: the main window
	// pushes the current status over a Tauri event and we render from that, and
	// control gestures go back over Tauri events. The pill itself
	// (`RecordingPill`) is platform-free; this route owns the IPC glue.
	let status = $state.raw<RecordingPillStatus | null>(null);

	// Live, smoothed mic loudness, 0 (silent) to 1 (loud). Driven by the
	// `mic-level` event: VAD frames in JS for voice-activated capture, the Rust
	// CPAL worker for manual recording. Both send a raw RMS amplitude; we apply
	// the perceptual curve and smoothing (shared with the web pill) so the bars
	// react to the actual voice rather than looping on a timer.
	let level = $state(0);

	const log = createLogger('whispering/recording-overlay-page');

	/** Run one reposition step, reporting a denied window verb instead of hiding it. */
	function runRepositionStep(step: Promise<void>): void {
		void step.catch((cause) => {
			log.warn(RecordingOverlayPageError.RepositionFailed({ cause }));
		});
	}

	const unlisteners: UnlistenFn[] = [];
	let isDestroyed = false;
	const trackUnlistener = (unlisten: UnlistenFn) => {
		if (isDestroyed) unlisten();
		else unlisteners.push(unlisten);
	};

	// ── Reposition session ──────────────────────────────────────────────────
	//
	// The main window puts this webview into a placement preview: the pill
	// becomes draggable and reports back where it landed. `pendingAnchor` is the
	// only thing a save reads, and it is maintained from the window's own
	// `onMoved` events rather than from the drag call, because `startDragging`
	// hands the window to the OS move loop and resolves at drag START, not at
	// drag end (tao posts WM_NCLBUTTONDOWN and returns). There is no drag-end
	// signal in the Tauri API, so the visible snap runs off a settle timer: if
	// it ever fires while a drag is still going, the OS move loop simply moves
	// the window again and the next `onMoved` restarts the timer.
	let repositioning = $state(false);
	let startingAnchor = $state.raw<OverlayAnchor>(DEFAULT_OVERLAY_ANCHOR);
	let pendingAnchor = $state.raw<OverlayAnchor>(DEFAULT_OVERLAY_ANCHOR);

	/** How long the window has to hold still before the pill snaps into place. */
	const SETTLE_DELAY_MS = 250;

	/**
	 * The monitor as of the last refresh, in logical pixels plus the scale that
	 * converts a `PhysicalPosition` into them. Cached because `onMoved` fires far
	 * too often to ask Tauri for monitor geometry each time; refreshed on every
	 * settle, which is what keeps a drag onto a second display correct.
	 */
	let monitor = $state.raw<{ scale: number; workArea: LogicalRect } | null>(
		null,
	);
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let unlistenMoved: UnlistenFn | undefined;

	async function refreshMonitor(): Promise<void> {
		const current = await currentMonitor();
		if (!current) return;
		const scale = current.scaleFactor;
		monitor = {
			scale,
			workArea: {
				x: current.workArea.position.x / scale,
				y: current.workArea.position.y / scale,
				width: current.workArea.size.width / scale,
				height: current.workArea.size.height / scale,
			},
		};
	}

	function logicalRectAt(x: number, y: number, scale: number): LogicalRect {
		return {
			x: x / scale,
			y: y / scale,
			width: OVERLAY_WIDTH,
			height: OVERLAY_HEIGHT,
		};
	}

	/**
	 * Re-resolve the anchor from where the window actually is, then move it
	 * there. Idempotent on purpose: the move it performs fires another `onMoved`,
	 * and the run that follows finds the window already in place and stops.
	 */
	async function settle(): Promise<void> {
		await refreshMonitor();
		const snapshot = monitor;
		if (!snapshot) return;

		const window = getCurrentWindow();
		const physical = await window.outerPosition();
		const rect = logicalRectAt(physical.x, physical.y, snapshot.scale);
		const anchor = nearestAnchorFromRect(rect, snapshot.workArea);
		pendingAnchor = anchor;

		const target = resolveAnchorPosition(anchor, snapshot.workArea, {
			width: OVERLAY_WIDTH,
			height: OVERLAY_HEIGHT,
		});
		if (Math.abs(target.x - rect.x) < 1 && Math.abs(target.y - rect.y) < 1) {
			return;
		}
		await window.setPosition(new LogicalPosition(target.x, target.y));
	}

	function scheduleSettle(): void {
		clearTimeout(settleTimer);
		settleTimer = setTimeout(() => runRepositionStep(settle()), SETTLE_DELAY_MS);
	}

	async function beginRepositioning(anchor: OverlayAnchor): Promise<void> {
		startingAnchor = anchor;
		pendingAnchor = anchor;
		await refreshMonitor();

		unlistenMoved?.();
		unlistenMoved = await getCurrentWindow().onMoved((event) => {
			const snapshot = monitor;
			if (!snapshot) return;
			pendingAnchor = nearestAnchorFromRect(
				logicalRectAt(event.payload.x, event.payload.y, snapshot.scale),
				snapshot.workArea,
			);
			scheduleSettle();
		});
		if (isDestroyed) {
			unlistenMoved();
			return;
		}
		repositioning = true;
	}

	function endRepositioning(): void {
		clearTimeout(settleTimer);
		settleTimer = undefined;
		unlistenMoved?.();
		unlistenMoved = undefined;
		repositioning = false;
	}

	async function moveToAnchor(anchor: OverlayAnchor): Promise<void> {
		const snapshot = monitor;
		if (!snapshot) return;
		const { x, y } = resolveAnchorPosition(anchor, snapshot.workArea, {
			width: OVERLAY_WIDTH,
			height: OVERLAY_HEIGHT,
		});
		await getCurrentWindow().setPosition(new LogicalPosition(x, y));
	}

	function handleDragStart(): void {
		// Resolves as soon as the OS takes over, so nothing is awaited on it.
		void getCurrentWindow().startDragging();
	}

	async function handleSave(): Promise<void> {
		const anchor = pendingAnchor;
		endRepositioning();
		await moveToAnchor(anchor);
		await recordingOverlayRepositionResult.emit({ type: 'save', anchor });
	}

	async function handleReset(): Promise<void> {
		endRepositioning();
		pendingAnchor = DEFAULT_OVERLAY_ANCHOR;
		await moveToAnchor(DEFAULT_OVERLAY_ANCHOR);
		await recordingOverlayRepositionResult.emit({
			type: 'save',
			anchor: DEFAULT_OVERLAY_ANCHOR,
		});
	}

	async function handleCancel(): Promise<void> {
		const anchor = startingAnchor;
		endRepositioning();
		pendingAnchor = anchor;
		await moveToAnchor(anchor);
		await recordingOverlayRepositionResult.emit({ type: 'cancel' });
	}

	onMount(() => {
		void (async () => {
			trackUnlistener(
				await recordingOverlayStatus.listen((event) => {
					status = event.payload;
				}),
			);
			trackUnlistener(
				await recordingOverlayMicLevel.listen((event) => {
					level = foldMicLevel(level, event.payload);
				}),
			);
			trackUnlistener(
				await recordingOverlayEnterReposition.listen((event) => {
					runRepositionStep(beginRepositioning(event.payload.anchor));
				}),
			);
			// Tell the main window we are ready so it re-sends the latest status.
			// Without this handshake the status emitted right after window creation
			// can land before our listener is attached.
			if (!isDestroyed) await recordingOverlayReady.emit();
		})();
	});

	onDestroy(() => {
		isDestroyed = true;
		endRepositioning();
		for (const unlisten of unlisteners) unlisten();
	});

	function sendAction(action: RecordingPillAction) {
		void recordingOverlayAction.emit(action);
	}
</script>

<!-- The pill hugs its content, so center it within the fixed overlay window (the
     web host centers its own copy). A fixed full-window flex box centers the chip
     regardless of how the layout nests the route. -->
<div class="fixed inset-0 flex items-center justify-center">
	{#if repositioning}
		<RecordingPillReposition
			label={formatAnchorLabel(pendingAnchor)}
			onDragStart={handleDragStart}
			onSave={() => runRepositionStep(handleSave())}
			onReset={() => runRepositionStep(handleReset())}
			onCancel={() => runRepositionStep(handleCancel())}
		/>
	{:else}
		<RecordingPill
			{status}
			{level}
			onStop={() => sendAction('stop')}
			onCancel={() => sendAction('cancel')}
			onShipRaw={() => sendAction('ship-raw')}
			onReveal={() => void revealMainWindow.emit()}
		/>
	{/if}
</div>

<style>
	/* The document-level resets below stay as `:global` CSS: a component cannot
	   apply utilities to `html`/`body` or to the dev-injected inspector host, so
	   these have no Tailwind equivalent. They belong to the overlay webview, not the
	   pill: they are only ever loaded in the dedicated overlay Tauri window, which
	   has its own document. The main app window never navigates here, so its
	   document background is untouched. (The isolation comes from the separate
	   webview document, not from Svelte's component scoping.) The shared
	   `RecordingPill` keeps no document-level styles so it can also mount inside the
	   app on web. */
	:global(html),
	:global(body) {
		background: transparent !important;
		margin: 0;
		overflow: hidden;
		/* The app shell forces a dark theme (ModeWatcher sets color-scheme:dark),
		   which makes the browser paint a dark canvas behind the pill in this
		   transparent webview. Reset it so only the pill is visible. */
		color-scheme: normal !important;
	}

	/* The Svelte inspector toggle (svelte.config.js `showToggleButton: always`)
	   is injected into every dev document, including this overlay webview where
	   it overlaps the pill. Hide it here; this rule lives only in the overlay
	   webview's document, and the host element does not exist in production. */
	:global(#svelte-inspector-host) {
		display: none !important;
	}
</style>
