import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
	currentMonitor,
	LogicalPosition,
	primaryMonitor,
} from '@tauri-apps/api/window';
import { defineErrors, type InferErrors } from 'wellcrafted/error';
import { once } from 'wellcrafted/function';
import { createLogger } from 'wellcrafted/logger';
import { Ok, type Result } from 'wellcrafted/result';
import { whisperingPath } from '$lib/constants/urls';
import {
	type LogicalRect,
	type OverlayAnchor,
	resolveAnchorPosition,
} from '$lib/recording-overlay/anchor-position';
import {
	OVERLAY_HEIGHT,
	OVERLAY_WIDTH,
} from '$lib/recording-overlay/constants';
import {
	type OverlayRepositionResult,
	RECORDING_OVERLAY_WINDOW_LABEL,
	recordingOverlayEnterReposition,
	recordingOverlayReady,
	recordingOverlayRepositionResult,
	recordingOverlayStatus,
} from '$lib/recording-overlay/events';
import type { RecordingPillStatus } from '$lib/recording-pill/model';
import type { WhisperingApp } from '$lib/whispering/app';

const log = createLogger('whispering/recording-overlay');

const RecordingOverlayError = defineErrors({
	WindowCreateFailed: ({ payload }: { payload: unknown }) => ({
		message: 'Failed to create recording overlay window',
		payload,
	}),
	SynchronizeFailed: ({ cause }: { cause: unknown }) => ({
		message: 'Failed to synchronize the recording overlay window',
		cause,
	}),
});
export type RecordingOverlayError = InferErrors<typeof RecordingOverlayError>;

let latestStatus: RecordingPillStatus | null = null;
let queue: Promise<void> = Promise.resolve();

/**
 * Whether a reposition session owns the overlay window right now.
 *
 * While it does, dictation status changes are still recorded in `latestStatus`
 * but not applied: the session is showing the pill as a placement preview, and
 * moving or hiding it underneath the person mid-drag is the one thing they did
 * not ask for. Whatever status accumulated is applied when the session ends.
 */
let repositionActive = false;

/**
 * The anchor a reposition session is waiting to hand to the overlay, or null
 * outside a session. A session that had to create the overlay window emits its
 * enter event before the page mounts, so the ready handshake re-sends it.
 */
let pendingRepositionAnchor: OverlayAnchor | null = null;

/**
 * The current monitor's usable work area, already in logical pixels.
 *
 * Work area excludes the taskbar/dock, so every margin is measured from the
 * usable desktop edge rather than the raw monitor edge.
 */
async function currentMonitorWorkArea(): Promise<LogicalRect | null> {
	const monitor = (await currentMonitor()) ?? (await primaryMonitor());
	if (!monitor) return null;

	const scale = monitor.scaleFactor;
	return {
		x: monitor.workArea.position.x / scale,
		y: monitor.workArea.position.y / scale,
		width: monitor.workArea.size.width / scale,
		height: monitor.workArea.size.height / scale,
	};
}

function readOverlayAnchor(app: WhisperingApp): OverlayAnchor {
	return {
		xAnchor: app.settings.get('recordingOverlayXAnchor'),
		xMarginPx: app.settings.get('recordingOverlayXMarginPx'),
		yAnchor: app.settings.get('recordingOverlayYAnchor'),
		yMarginPx: app.settings.get('recordingOverlayYMarginPx'),
	};
}

async function computeOverlayPosition(
	app: WhisperingApp,
): Promise<LogicalPosition | null> {
	const workArea = await currentMonitorWorkArea();
	if (!workArea) return null;

	const { x, y } = resolveAnchorPosition(readOverlayAnchor(app), workArea, {
		width: OVERLAY_WIDTH,
		height: OVERLAY_HEIGHT,
	});
	return new LogicalPosition(x, y);
}

/** Keep the ready listener live before a newly created overlay can emit. */
const ensureReadyListener = once(
	(): Promise<void> =>
		recordingOverlayReady
			.listen(() => {
				if (latestStatus) void recordingOverlayStatus.emit(latestStatus);
				if (pendingRepositionAnchor) {
					void recordingOverlayEnterReposition.emit({
						anchor: pendingRepositionAnchor,
					});
				}
			})
			.then(() => undefined),
);

async function createOverlayWindow(): Promise<WebviewWindow | null> {
	await ensureReadyListener();
	const overlayUrl = new URL(
		whisperingPath('/recording-overlay'),
		window.location.origin,
	).href;

	const overlay = new WebviewWindow(RECORDING_OVERLAY_WINDOW_LABEL, {
		url: overlayUrl,
		title: 'Recording',
		width: OVERLAY_WIDTH,
		height: OVERLAY_HEIGHT,
		transparent: true,
		decorations: false,
		shadow: false,
		alwaysOnTop: true,
		visibleOnAllWorkspaces: true,
		skipTaskbar: true,
		resizable: false,
		maximizable: false,
		minimizable: false,
		closable: false,
		focus: false,
		focusable: false,
		visible: false,
	});

	return new Promise<WebviewWindow | null>((resolve) => {
		overlay.once('tauri://created', () => resolve(overlay));
		overlay.once('tauri://error', (event) => {
			log.warn(
				RecordingOverlayError.WindowCreateFailed({ payload: event.payload }),
			);
			resolve(null);
		});
	});
}

async function getOrCreateOverlayWindow(): Promise<WebviewWindow | null> {
	const existing = await WebviewWindow.getByLabel(
		RECORDING_OVERLAY_WINDOW_LABEL,
	);
	if (existing) return existing;
	return createOverlayWindow();
}

async function applyOverlayStatus(
	app: WhisperingApp,
	status: RecordingPillStatus | null,
) {
	const isSuperseded = () => status !== latestStatus || repositionActive;
	if (isSuperseded()) return;

	if (!status) {
		const overlay = await WebviewWindow.getByLabel(
			RECORDING_OVERLAY_WINDOW_LABEL,
		);
		if (overlay) await overlay.hide();
		return;
	}

	const overlay = await getOrCreateOverlayWindow();
	if (!overlay || isSuperseded()) return;

	const position = await computeOverlayPosition(app);
	if (isSuperseded()) return;
	if (position) await overlay.setPosition(position);
	if (isSuperseded()) return;

	await overlay.show();
	if (isSuperseded()) {
		// A reposition session that started mid-flight owns the window now, so
		// leave it up even with no dictation behind it.
		if (!latestStatus && !repositionActive) await overlay.hide();
		return;
	}

	await recordingOverlayStatus.emit(status);
}

/** Synchronize the native overlay without letting cosmetic failures stop capture. */
export function synchronizeRecordingOverlayWindow(
	app: WhisperingApp,
	status: RecordingPillStatus | null,
): void {
	latestStatus = status;
	queue = queue
		.then(() => applyOverlayStatus(app, status))
		.catch((cause) => {
			log.warn(RecordingOverlayError.SynchronizeFailed({ cause }));
		});
}

function writeOverlayAnchor(app: WhisperingApp, anchor: OverlayAnchor): void {
	app.settings.set('recordingOverlayXAnchor', anchor.xAnchor);
	app.settings.set('recordingOverlayXMarginPx', anchor.xMarginPx);
	app.settings.set('recordingOverlayYAnchor', anchor.yAnchor);
	app.settings.set('recordingOverlayYMarginPx', anchor.yMarginPx);
}

/**
 * Drive one reposition session, start to finish.
 *
 * Shows the overlay (creating it if no dictation ever has), switches it into
 * the draggable placement preview, and waits for the person to save, reset, or
 * cancel. A save is persisted here rather than in the overlay because settings
 * belong to the main window's app; the overlay only reports where it landed.
 *
 * The session is one at a time: a second call while one is in flight is a
 * no-op rather than a second listener over the same window.
 */
export async function startOverlayRepositionSession(
	app: WhisperingApp,
): Promise<Result<void, RecordingOverlayError>> {
	if (repositionActive) return Ok(undefined);

	const anchor = readOverlayAnchor(app);
	repositionActive = true;
	pendingRepositionAnchor = anchor;
	let unlisten: (() => void) | undefined;

	try {
		let reportResult: (result: OverlayRepositionResult) => void = () => {};
		const settled = new Promise<OverlayRepositionResult>((resolve) => {
			reportResult = resolve;
		});
		// Listen before the overlay can answer: a window that already exists
		// renders the preview and could report back within the same tick.
		unlisten = await recordingOverlayRepositionResult.listen((event) =>
			reportResult(event.payload),
		);

		const overlay = await getOrCreateOverlayWindow();
		if (!overlay) {
			return RecordingOverlayError.WindowCreateFailed({ payload: null });
		}

		await overlay.show();
		await recordingOverlayEnterReposition.emit({ anchor });

		const result = await settled;
		if (result.type === 'save') writeOverlayAnchor(app, result.anchor);
		return Ok(undefined);
	} finally {
		unlisten?.();
		pendingRepositionAnchor = null;
		repositionActive = false;
		// Hand the window back to whatever dictation is doing now, which may
		// have started or ended while the session held it.
		synchronizeRecordingOverlayWindow(app, latestStatus);
	}
}
