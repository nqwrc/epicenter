# Repositionable Recording Pill Implementation Plan

**Status**: Draft

**Goal:** The recording pill's on-screen position becomes a setting the user
can drag into place from Settings, instead of a hardcoded bottom-center
formula.

**Architecture:** Today's formula is generalized into an anchor+margin model
(3 x-anchors times 3 y-anchors, each with a margin in logical px) resolved by
a pure module shared between the normal show path and a new reposition
session. The session is driven from Settings over the existing main-window
<-> overlay-window Tauri event channel: the overlay switches into a draggable
preview mode, snaps itself using the same pure anchor math run in reverse
(rect to nearest anchor), and reports the result back for Settings to persist.

**Tech Stack:** TypeScript, Svelte 5 runes, `bun test`, `@tauri-apps/api/window`
(`startDragging`, `onMoved`, `outerPosition`, `setPosition`).

**Spec:** `apps/whispering/specs/20260830T124813-repositionable-recording-pill.md`

## Global constraints

- Package manager is `bun`. Never `npm`, `yarn`, `pnpm`, or `npx`.
- Run every command from the repo root. Do not `cd` into an app.
- Stage specific files. Never `git add .` or `git add -A`.
- Conventional commits. No AI or tool attribution in commit messages.
- No direct `console.*` in library code. Use `wellcrafted/logger`.
- No em dash (`U+2014`) or en dash (`U+2013`) in code, comments, JSDoc, UI copy,
  or commit messages. Use a colon, comma, semicolon, or a sentence break.
- Snap threshold: **12** logical px. Standard edge margin: **72** logical px
  (today's `OVERLAY_BOTTOM_MARGIN`, promoted to a shared constant reused by
  every edge, not just the bottom).
- New setting keys: `recordingOverlayXAnchor` (`'left' | 'center' | 'right'`),
  `recordingOverlayXMarginPx` (number), `recordingOverlayYAnchor`
  (`'top' | 'center' | 'bottom'`), `recordingOverlayYMarginPx` (number).
  Defaults: `center` / `0` / `bottom` / `72`, byte-for-byte today's behavior.

Tests: `bun run --filter '@epicenter/whispering' test`
Typecheck: `bun run --filter '@epicenter/whispering' typecheck`

---

## File structure

| File | Responsibility |
| --- | --- |
| `apps/whispering/src/lib/recording-overlay/constants.ts` | `OVERLAY_WIDTH`/`OVERLAY_HEIGHT`, shared by the window manager and the overlay page |
| `apps/whispering/src/lib/recording-overlay/anchor-position.ts` | Pure: anchor+margin <-> logical rect, both directions |
| `apps/whispering/src/lib/workspace/index.ts`, `whispering/app.ts` | The four new fields and their defaults |
| `apps/whispering/src/lib/recording-overlay/events.ts` | Reposition session events |
| `apps/whispering/src/lib/recording-overlay/window-manager.tauri.ts` | Reads the anchor for the normal show path; owns the reposition session's main-window side |
| `apps/whispering/src/lib/dictation-indicator/DictationIndicator.tauri.svelte` | Threads `app` through the (now anchor-aware) sync call |
| `apps/whispering/src/routes/recording-overlay/+page.svelte` | The reposition render mode, drag/snap mechanics |
| `apps/whispering/src/lib/recording-pill/RecordingPillReposition.svelte` | The draggable preview + inline Save/Reset/Cancel row |
| `apps/whispering/src/routes/(app)/(config)/settings/+page.svelte` | The "Recording pill position" field and its buttons |

Task order is dependency order. Tasks 1 and 2 are independent of each other.
Task 3 needs 1 and 2. Task 4 needs 1, 2 and 3. Task 5 needs 1 and 4. Task 6
needs 5. Task 7 needs 4 and 6. Task 8 needs everything.

---

### Task 1: Anchor position math

**Files:**
- Create: `apps/whispering/src/lib/recording-overlay/anchor-position.ts`
- Test: `apps/whispering/src/lib/recording-overlay/anchor-position.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `OverlayAnchor`, `LogicalRect`, `DEFAULT_OVERLAY_ANCHOR`,
  `resolveAnchorPosition(anchor, monitorWorkArea, size)`,
  `nearestAnchorFromRect(windowRect, monitorWorkArea)`,
  `formatAnchorLabel(anchor)`.

- [ ] **Step 1: Write the failing test**

Create `apps/whispering/src/lib/recording-overlay/anchor-position.test.ts`:

```ts
import { expect, test } from 'bun:test';
import {
	DEFAULT_OVERLAY_ANCHOR,
	formatAnchorLabel,
	nearestAnchorFromRect,
	resolveAnchorPosition,
} from './anchor-position';

const MONITOR = { x: 0, y: 0, width: 1920, height: 1080 };
const SIZE = { width: 300, height: 72 };

test('the default anchor reproduces today\'s exact formula', () => {
	expect(resolveAnchorPosition(DEFAULT_OVERLAY_ANCHOR, MONITOR, SIZE)).toEqual({
		x: (1920 - 300) / 2,
		y: 1080 - 72 - 72,
	});
});

test('resolves each of the 9 anchor combinations', () => {
	expect(resolveAnchorPosition(
		{ xAnchor: 'left', xMarginPx: 40, yAnchor: 'top', yMarginPx: 20 },
		MONITOR, SIZE,
	)).toEqual({ x: 40, y: 20 });

	expect(resolveAnchorPosition(
		{ xAnchor: 'right', xMarginPx: 40, yAnchor: 'bottom', yMarginPx: 20 },
		MONITOR, SIZE,
	)).toEqual({ x: 1920 - 300 - 40, y: 1080 - 72 - 20 });

	expect(resolveAnchorPosition(
		{ xAnchor: 'center', xMarginPx: 0, yAnchor: 'center', yMarginPx: 0 },
		MONITOR, SIZE,
	)).toEqual({ x: (1920 - 300) / 2, y: (1080 - 72) / 2 });
});

test('resolves against a monitor not rooted at the origin (a secondary display)', () => {
	const monitor = { x: 1920, y: -200, width: 1440, height: 900 };
	expect(resolveAnchorPosition(
		{ xAnchor: 'left', xMarginPx: 0, yAnchor: 'top', yMarginPx: 0 },
		monitor, SIZE,
	)).toEqual({ x: 1920, y: -200 });
});

test('a rect at the default position resolves back to the default anchor', () => {
	const { x, y } = resolveAnchorPosition(DEFAULT_OVERLAY_ANCHOR, MONITOR, SIZE);
	expect(nearestAnchorFromRect({ x, y, ...SIZE }, MONITOR)).toEqual(DEFAULT_OVERLAY_ANCHOR);
});

test('snaps to center within the threshold, not just exactly centered', () => {
	const { x, y } = resolveAnchorPosition(
		{ xAnchor: 'center', xMarginPx: 0, yAnchor: 'center', yMarginPx: 0 },
		MONITOR, SIZE,
	);
	expect(nearestAnchorFromRect({ x: x + 5, y: y - 5, ...SIZE }, MONITOR)).toEqual({
		xAnchor: 'center', xMarginPx: 0, yAnchor: 'center', yMarginPx: 0,
	});
});

test('outside every threshold keeps the literal dragged margin', () => {
	// 300px from the left, nowhere near center (960) or the standard 72px margin.
	expect(nearestAnchorFromRect({ x: 300, y: 40, ...SIZE }, MONITOR)).toEqual({
		xAnchor: 'left', xMarginPx: 300, yAnchor: 'top', yMarginPx: 40,
	});
});

test('a near-standard margin snaps exactly to it', () => {
	// 68px measured, within the 12px threshold of the standard 72px margin.
	expect(nearestAnchorFromRect({ x: 68, y: 1080 - 72 - 68, ...SIZE }, MONITOR)).toEqual({
		xAnchor: 'left', xMarginPx: 72, yAnchor: 'bottom', yMarginPx: 72,
	});
});

test('picks the nearer edge on each axis independently', () => {
	// x is near the right edge, y is near the top: independent per axis.
	const rect = { x: 1920 - 300 - 10, y: 15, ...SIZE };
	expect(nearestAnchorFromRect(rect, MONITOR)).toEqual({
		xAnchor: 'right', xMarginPx: 10, yAnchor: 'top', yMarginPx: 15,
	});
});

test('formats a label naming the default placement', () => {
	expect(formatAnchorLabel(DEFAULT_OVERLAY_ANCHOR)).toBe('Bottom Center');
});

test('formats a label calling out a non-standard margin', () => {
	expect(formatAnchorLabel({ xAnchor: 'left', xMarginPx: 40, yAnchor: 'top', yMarginPx: 0 }))
		.toBe('Top Left (40px from left, flush with the top edge)');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun run --filter '@epicenter/whispering' test anchor-position
```

Expected: FAIL, "Cannot find module './anchor-position'".

- [ ] **Step 3: Write the implementation**

Create `apps/whispering/src/lib/recording-overlay/anchor-position.ts`:

```ts
/**
 * The recording overlay's position, generalized from today's hardcoded
 * "centered, 72px above the bottom" formula into a 3x3 anchor grid with a
 * margin per axis. Pure and platform-free: the `.tauri.ts` window manager
 * converts monitor geometry to logical px before calling in here, and the
 * overlay page converts a dragged window rect the same way before asking
 * `nearestAnchorFromRect` what it resolves to.
 *
 * See `specs/20260830T124813-repositionable-recording-pill.md`.
 */

export type XAnchor = 'left' | 'center' | 'right';
export type YAnchor = 'top' | 'center' | 'bottom';

export type OverlayAnchor = {
	xAnchor: XAnchor;
	xMarginPx: number;
	yAnchor: YAnchor;
	yMarginPx: number;
};

export type LogicalRect = { x: number; y: number; width: number; height: number };
export type LogicalSize = { width: number; height: number };

/** Byte-for-byte today's hardcoded formula: centered, 72px above the bottom. */
export const DEFAULT_OVERLAY_ANCHOR: OverlayAnchor = {
	xAnchor: 'center',
	xMarginPx: 0,
	yAnchor: 'bottom',
	yMarginPx: 72,
};

/** How close a drag has to land, in logical px, before it snaps to something. */
export const SNAP_THRESHOLD_PX = 12;

/**
 * The one "comfortable distance from an edge" every edge snaps to. Reused
 * across all four edges rather than configured per edge: one value users
 * learn once, and it is today's own bottom margin, so the default keeps
 * meaning the same thing it always did.
 */
export const EDGE_SNAP_MARGIN_PX = 72;

/** Where an anchor+margin places a `size` window inside `monitorWorkArea`. */
export function resolveAnchorPosition(
	anchor: OverlayAnchor,
	monitorWorkArea: LogicalRect,
	size: LogicalSize,
): { x: number; y: number } {
	const x = resolveAxisPosition(
		anchor.xAnchor,
		anchor.xMarginPx,
		monitorWorkArea.x,
		monitorWorkArea.width,
		size.width,
	);
	const y = resolveAxisPosition(
		anchor.yAnchor,
		anchor.yMarginPx,
		monitorWorkArea.y,
		monitorWorkArea.height,
		size.height,
	);
	return { x, y };
}

function resolveAxisPosition(
	anchor: 'left' | 'center' | 'right' | 'top' | 'center' | 'bottom',
	marginPx: number,
	monitorPos: number,
	monitorSize: number,
	size: number,
): number {
	switch (anchor) {
		case 'left':
		case 'top':
			return monitorPos + marginPx;
		case 'center':
			return monitorPos + (monitorSize - size) / 2;
		case 'right':
		case 'bottom':
			return monitorPos + monitorSize - size - marginPx;
	}
}

/**
 * Reduce a dragged window's final rect to the nearest anchor+margin.
 *
 * Every rect resolves to something: a rect nowhere near center or a standard
 * margin still gets an anchor (whichever edge it is closer to) and keeps its
 * literal measured margin. Snapping only decides whether that margin gets
 * rounded to 0-at-center or to the standard edge margin; it never leaves a
 * rect un-anchored.
 */
export function nearestAnchorFromRect(
	windowRect: LogicalRect,
	monitorWorkArea: LogicalRect,
): OverlayAnchor {
	const x = resolveAxisAnchor(
		windowRect.x,
		windowRect.width,
		monitorWorkArea.x,
		monitorWorkArea.width,
		'left',
		'right',
	);
	const y = resolveAxisAnchor(
		windowRect.y,
		windowRect.height,
		monitorWorkArea.y,
		monitorWorkArea.height,
		'top',
		'bottom',
	);
	return { xAnchor: x.anchor, xMarginPx: x.marginPx, yAnchor: y.anchor, yMarginPx: y.marginPx };
}

function resolveAxisAnchor<TSide extends string>(
	pos: number,
	size: number,
	monitorPos: number,
	monitorSize: number,
	nearSide: TSide,
	farSide: TSide,
): { anchor: TSide | 'center'; marginPx: number } {
	const center = pos + size / 2;
	const monitorCenter = monitorPos + monitorSize / 2;
	if (Math.abs(center - monitorCenter) <= SNAP_THRESHOLD_PX) {
		return { anchor: 'center', marginPx: 0 };
	}

	const distFromNear = pos - monitorPos;
	const distFromFar = monitorPos + monitorSize - (pos + size);
	const [side, distance] =
		distFromNear <= distFromFar ? [nearSide, distFromNear] : [farSide, distFromFar];

	const marginPx =
		Math.abs(distance - EDGE_SNAP_MARGIN_PX) <= SNAP_THRESHOLD_PX
			? EDGE_SNAP_MARGIN_PX
			: Math.max(0, Math.round(distance));
	return { anchor: side, marginPx };
}

/** A human label for the current placement, for the Settings field and the live drag label. */
export function formatAnchorLabel(anchor: OverlayAnchor): string {
	const base =
		anchor.xAnchor === 'center' && anchor.yAnchor === 'center'
			? 'Center'
			: `${capitalize(anchor.yAnchor)} ${capitalize(anchor.xAnchor)}`;

	const notes = [
		marginNote(anchor.xAnchor, anchor.xMarginPx),
		marginNote(anchor.yAnchor, anchor.yMarginPx),
	].filter((note): note is string => note !== null);

	return notes.length > 0 ? `${base} (${notes.join(', ')})` : base;
}

function marginNote(edge: XAnchor | YAnchor, marginPx: number): string | null {
	if (edge === 'center') return null;
	if (marginPx === EDGE_SNAP_MARGIN_PX) return null;
	if (marginPx === 0) return `flush with the ${edge} edge`;
	return `${marginPx}px from ${edge}`;
}

function capitalize<T extends string>(word: T): Capitalize<T> {
	return (word.charAt(0).toUpperCase() + word.slice(1)) as Capitalize<T>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun run --filter '@epicenter/whispering' test anchor-position
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/whispering/src/lib/recording-overlay/anchor-position.ts apps/whispering/src/lib/recording-overlay/anchor-position.test.ts
git commit -m "feat(whispering): add anchor-based recording overlay position math"
```

---

### Task 2: The settings fields

**Files:**
- Modify: `apps/whispering/src/lib/workspace/index.ts`
- Modify: `apps/whispering/src/lib/whispering/app.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `app.settings.get('recordingOverlayXAnchor')` and its three
  siblings, typed as `XAnchor` / `number` / `YAnchor` / `number`.

- [ ] **Step 1: Declare the fields**

In `apps/whispering/src/lib/workspace/index.ts`, in `settingsKv`, immediately
after `recordingAutoUpload: field.boolean(),`:

```ts
	recordingOverlayXAnchor: field.select(['left', 'center', 'right']),
	recordingOverlayXMarginPx: field.number(),
	recordingOverlayYAnchor: field.select(['top', 'center', 'bottom']),
	recordingOverlayYMarginPx: field.number(),
```

- [ ] **Step 2: Give them defaults**

In `apps/whispering/src/lib/whispering/app.ts`, in `APPLICATION_DEFAULTS`,
immediately after `recordingAutoUpload: false,`:

```ts
	recordingOverlayXAnchor: 'center',
	recordingOverlayXMarginPx: 0,
	recordingOverlayYAnchor: 'bottom',
	recordingOverlayYMarginPx: 72,
```

- [ ] **Step 3: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/whispering/src/lib/workspace/index.ts apps/whispering/src/lib/whispering/app.ts
git commit -m "feat(whispering): add recording overlay position settings"
```

---

### Task 3: Wire the normal show path to the anchor

**Files:**
- Create: `apps/whispering/src/lib/recording-overlay/constants.ts`
- Modify: `apps/whispering/src/lib/recording-overlay/window-manager.tauri.ts`
- Modify: `apps/whispering/src/lib/dictation-indicator/DictationIndicator.tauri.svelte`

**Interfaces:**
- Consumes: `resolveAnchorPosition`, `OverlayAnchor` (Task 1); the four
  settings (Task 2).
- Produces: `synchronizeRecordingOverlayWindow(app, status)` (signature
  gains `app` as its first parameter, a breaking change to its one caller).

No automated test: this file only reaches a real Tauri window, which `bun
test` cannot open. Verified by hand in Task 8.

- [ ] **Step 1: Extract the size constants**

Create `apps/whispering/src/lib/recording-overlay/constants.ts`:

```ts
/**
 * Fixed overlay window size in logical px, shared by the window manager (to
 * create the window) and the overlay page (to resolve where a drag ends).
 * Must fit the pill's widest state (260x44, `listening` in RecordingPill)
 * plus bleed room for its drop shadow and glow, both painted as CSS inside
 * the webview and clipped hard at the window edge.
 */
export const OVERLAY_WIDTH = 300;
export const OVERLAY_HEIGHT = 72;
```

- [ ] **Step 2: Read the anchor from settings**

In `apps/whispering/src/lib/recording-overlay/window-manager.tauri.ts`:

Replace the `OVERLAY_WIDTH` / `OVERLAY_HEIGHT` / `OVERLAY_BOTTOM_MARGIN`
constants block with an import from the new module:

```ts
import { OVERLAY_HEIGHT, OVERLAY_WIDTH } from '$lib/recording-overlay/constants';
import {
	type LogicalRect,
	type OverlayAnchor,
	resolveAnchorPosition,
} from '$lib/recording-overlay/anchor-position';
import type { WhisperingApp } from '$lib/whispering/app';
```

Delete `const OVERLAY_BOTTOM_MARGIN = 72;` entirely (it is now
`recordingOverlayYMarginPx`'s default, not a formula constant).

Replace `computeOverlayPosition` with:

```ts
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
```

- [ ] **Step 3: Thread `app` through the show path**

Still in `window-manager.tauri.ts`, add `app: WhisperingApp` as the first
parameter of `applyOverlayStatus` and pass it through to
`computeOverlayPosition(app)`, then do the same for the exported
`synchronizeRecordingOverlayWindow`:

```ts
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
```

- [ ] **Step 4: Update the one caller**

In `apps/whispering/src/lib/dictation-indicator/DictationIndicator.tauri.svelte`,
change both call sites:

```ts
	$effect(() => {
		synchronizeRecordingOverlayWindow(app, status);
	});

	onDestroy(() => synchronizeRecordingOverlayWindow(app, null));
```

- [ ] **Step 5: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/whispering/src/lib/recording-overlay/constants.ts apps/whispering/src/lib/recording-overlay/window-manager.tauri.ts apps/whispering/src/lib/dictation-indicator/DictationIndicator.tauri.svelte
git commit -m "feat(whispering): position the recording overlay from settings"
```

---

### Task 4: The reposition session's main-window side

**Files:**
- Modify: `apps/whispering/src/lib/recording-overlay/events.ts`
- Modify: `apps/whispering/src/lib/recording-overlay/window-manager.tauri.ts`

**Interfaces:**
- Consumes: `OverlayAnchor` (Task 1); `readOverlayAnchor`,
  `getOrCreateOverlayWindow` (already in the file / Task 3).
- Produces: `startOverlayRepositionSession(app): Promise<Result<void, RecordingOverlayError>>`.

No automated test: Tauri event plumbing, verified by hand in Task 8.

- [ ] **Step 1: Add the reposition events**

In `apps/whispering/src/lib/recording-overlay/events.ts`, add after the
existing exports:

```ts
import type { OverlayAnchor } from '$lib/recording-overlay/anchor-position';

/** main -> overlay: enter the draggable reposition preview, starting at `anchor`. */
export const recordingOverlayEnterReposition = defineWindowEvent<{
	anchor: OverlayAnchor;
}>('recording-overlay:enter-reposition');

/** overlay -> main: the reposition session ended, saved or not. */
export type OverlayRepositionResult =
	| { type: 'save'; anchor: OverlayAnchor }
	| { type: 'cancel' };
export const recordingOverlayRepositionResult =
	defineWindowEvent<OverlayRepositionResult>(
		'recording-overlay:reposition-result',
	);
```

- [ ] **Step 2: Add the session orchestration**

In `apps/whispering/src/lib/recording-overlay/window-manager.tauri.ts`, add
the import and the exported function:

```ts
import {
	recordingOverlayEnterReposition,
	recordingOverlayRepositionResult,
} from '$lib/recording-overlay/events';
import { Err, Ok, type Result } from 'wellcrafted/result';

function writeOverlayAnchor(app: WhisperingApp, anchor: OverlayAnchor): void {
	app.settings.set('recordingOverlayXAnchor', anchor.xAnchor);
	app.settings.set('recordingOverlayXMarginPx', anchor.xMarginPx);
	app.settings.set('recordingOverlayYAnchor', anchor.yAnchor);
	app.settings.set('recordingOverlayYMarginPx', anchor.yMarginPx);
}

/**
 * Drives one reposition session: shows the overlay (if it was hidden),
 * switches it into the draggable preview, waits for the user to save,
 * reset, or cancel, persists a save/reset, then restores the overlay's
 * visibility to whatever it was before the session started.
 */
export async function startOverlayRepositionSession(
	app: WhisperingApp,
): Promise<Result<void, RecordingOverlayError>> {
	const overlay = await getOrCreateOverlayWindow();
	if (!overlay) {
		return Err(RecordingOverlayError.WindowCreateFailed({ payload: null }));
	}

	const wasVisible = latestStatus !== null;
	await overlay.show();

	const result = await new Promise<OverlayRepositionResult>((resolve) => {
		void recordingOverlayRepositionResult
			.listen((event) => resolve(event.payload))
			.then((unlisten) => {
				// The promise this resolves has already fired by the time a real
				// unlisten call would matter, since the session is one-shot; this
				// exists only so a listener never outlives the session it belongs to.
				void resultUnlisten.then((fn) => fn());
				resultUnlisten = Promise.resolve(unlisten);
			});
	});

	if (result.type === 'save') writeOverlayAnchor(app, result.anchor);
	if (!wasVisible) await overlay.hide();

	return Ok(undefined);
}

let resultUnlisten: Promise<() => void> = Promise.resolve(() => {});
```

Then, wherever the session is started, emit the enter event after `show()`
resolves and the listener above is registered:

```ts
	await recordingOverlayEnterReposition.emit({ anchor: readOverlayAnchor(app) });
```

Insert this `emit` call in `startOverlayRepositionSession`, immediately after
`await overlay.show();` and before the `await new Promise(...)` block, so the
overlay is told to enter reposition mode before the main window starts
waiting for its result.

**Note for the implementer:** the `resultUnlisten` juggling above exists only
to avoid leaking a listener if `startOverlayRepositionSession` is ever called
again before a previous session resolved (it should not be reachable from the
UI, since Task 7's button disables itself while a session is in flight, but a
dangling listener is a real bug class if that guard is ever bypassed). If this
reads as more ceremony than the one-call-at-a-time reality of Task 7 justifies,
simplify: `recordingOverlayRepositionResult.listen` returning an `UnlistenFn`
that the `.then()` immediately invokes once, no shared outer variable. Judge
this at implementation time against how `ensureReadyListener`'s `once()`
wrapper already handles a similar one-time-registration concern in this same
file, and prefer matching that existing idiom over introducing a new one.

- [ ] **Step 3: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/whispering/src/lib/recording-overlay/events.ts apps/whispering/src/lib/recording-overlay/window-manager.tauri.ts
git commit -m "feat(whispering): add the recording overlay reposition session"
```

---

### Task 5: The overlay's reposition render mode and drag mechanics

**Files:**
- Modify: `apps/whispering/src/routes/recording-overlay/+page.svelte`

**Interfaces:**
- Consumes: `recordingOverlayEnterReposition`, `recordingOverlayRepositionResult`
  (Task 4); `resolveAnchorPosition`, `nearestAnchorFromRect`, `OverlayAnchor`
  (Task 1); `OVERLAY_WIDTH`, `OVERLAY_HEIGHT` (Task 3).
- Produces: nothing new exported; this is a route, not a library module.

No automated test: real window dragging cannot run under `bun test`.
Verified by hand in Task 8.

**Grounding check before writing this task:** confirm against the installed
`@tauri-apps/api` types (`node_modules/.bun/@tauri-apps+api@*/node_modules/@tauri-apps/api/window.d.ts`)
that `Window.startDragging(): Promise<void>` still resolves when the OS-level
drag ends (button released), and that `Window.onMoved` still delivers a
`PhysicalPosition`. Both were true as of `@tauri-apps/api@2.11.0` when this
plan was written; a version bump between then and implementation is exactly
the kind of drift the `tauri` skill's load-before-touching-commands rule
exists to catch, and this task is Tauri window API surface even though it
touches no Rust.

- [ ] **Step 1: Add reposition state and the monitor-in-logical-px helper**

In `apps/whispering/src/routes/recording-overlay/+page.svelte`, add imports
and state:

```ts
import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
import { currentMonitor } from '@tauri-apps/api/window';
import { OVERLAY_HEIGHT, OVERLAY_WIDTH } from '$lib/recording-overlay/constants';
import {
	type LogicalRect,
	type OverlayAnchor,
	DEFAULT_OVERLAY_ANCHOR,
	formatAnchorLabel,
	nearestAnchorFromRect,
	resolveAnchorPosition,
} from '$lib/recording-overlay/anchor-position';
import {
	recordingOverlayEnterReposition,
	recordingOverlayRepositionResult,
} from '$lib/recording-overlay/events';
import RecordingPillReposition from '$lib/recording-pill/RecordingPillReposition.svelte';

let repositioning = $state(false);
let startingAnchor = $state<OverlayAnchor>(DEFAULT_OVERLAY_ANCHOR);
let pendingAnchor = $state<OverlayAnchor>(DEFAULT_OVERLAY_ANCHOR);

/** The current monitor's work area, already converted to logical px. */
async function workAreaLogical(): Promise<LogicalRect | null> {
	const monitor = await currentMonitor();
	if (!monitor) return null;
	const scale = monitor.scaleFactor;
	return {
		x: monitor.workArea.position.x / scale,
		y: monitor.workArea.position.y / scale,
		width: monitor.workArea.size.width / scale,
		height: monitor.workArea.size.height / scale,
	};
}
```

- [ ] **Step 2: Listen for the session start**

In `onMount`, alongside the existing `trackUnlistener` calls:

```ts
	trackUnlistener(
		await recordingOverlayEnterReposition.listen((event) => {
			startingAnchor = event.payload.anchor;
			pendingAnchor = event.payload.anchor;
			repositioning = true;
		}),
	);
```

- [ ] **Step 3: Write the drag handler**

Add a plain function (not exported; passed as a prop to the new component):

```ts
async function moveToAnchor(anchor: OverlayAnchor): Promise<LogicalRect | null> {
	const workArea = await workAreaLogical();
	if (!workArea) return null;
	const { x, y } = resolveAnchorPosition(anchor, workArea, {
		width: OVERLAY_WIDTH,
		height: OVERLAY_HEIGHT,
	});
	await getCurrentWindow().setPosition(new LogicalPosition(x, y));
	return workArea;
}

async function handleDragStart() {
	const win = getCurrentWindow();
	const scale = (await currentMonitor())?.scaleFactor ?? 1;

	const unlistenMove = await win.onMoved((event) => {
		void workAreaLogical().then((workArea) => {
			if (!workArea) return;
			const rect: LogicalRect = {
				x: event.payload.x / scale,
				y: event.payload.y / scale,
				width: OVERLAY_WIDTH,
				height: OVERLAY_HEIGHT,
			};
			pendingAnchor = nearestAnchorFromRect(rect, workArea);
		});
	});

	// Resolves when the OS-level drag ends (button released), per the
	// grounding check above.
	await win.startDragging();
	unlistenMove();

	// Snap the pill's visible position to exactly what `pendingAnchor`
	// resolved to, so the drop reads as a lock rather than a loose stop.
	await moveToAnchor(pendingAnchor);
}

async function handleSave() {
	await recordingOverlayRepositionResult.emit({ type: 'save', anchor: pendingAnchor });
	repositioning = false;
}

async function handleReset() {
	pendingAnchor = DEFAULT_OVERLAY_ANCHOR;
	await moveToAnchor(DEFAULT_OVERLAY_ANCHOR);
	await recordingOverlayRepositionResult.emit({ type: 'save', anchor: DEFAULT_OVERLAY_ANCHOR });
	repositioning = false;
}

async function handleCancel() {
	await moveToAnchor(startingAnchor);
	await recordingOverlayRepositionResult.emit({ type: 'cancel' });
	repositioning = false;
}
```

- [ ] **Step 4: Branch the render**

Replace the template's single `<RecordingPill ... />` with a branch:

```svelte
<div class="fixed inset-0 flex items-center justify-center">
	{#if repositioning}
		<RecordingPillReposition
			label={formatAnchorLabel(pendingAnchor)}
			onDragStart={handleDragStart}
			onSave={handleSave}
			onReset={handleReset}
			onCancel={handleCancel}
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
```

- [ ] **Step 5: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors (this will fail until Task 6 creates
`RecordingPillReposition.svelte`; do Task 6 first if working strictly in
order, or accept a transient red typecheck between the two).

- [ ] **Step 6: Commit**

```bash
git add "apps/whispering/src/routes/recording-overlay/+page.svelte"
git commit -m "feat(whispering): drive the overlay's reposition preview from drag events"
```

---

### Task 6: The reposition preview component

**Files:**
- Create: `apps/whispering/src/lib/recording-pill/RecordingPillReposition.svelte`

**Interfaces:**
- Consumes: nothing beyond its own props.
- Produces: a Svelte component, `{ label: string; onDragStart: () => void;
  onSave: () => void; onReset: () => void; onCancel: () => void }`.

No automated test: presentational component, same as `RecordingPill.svelte`
itself (which also has no test file).

- [ ] **Step 1: Write the component**

Create `apps/whispering/src/lib/recording-pill/RecordingPillReposition.svelte`,
reusing `RecordingPill.svelte`'s `.wispr-pill` visual language rather than the
component itself (its internals branch on dictation `status`, which has
nothing to do with repositioning):

```svelte
<script lang="ts">
	import { cn } from '@epicenter/ui/utils';
	import CheckIcon from '@lucide/svelte/icons/check';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import XIcon from '@lucide/svelte/icons/x';

	let {
		label,
		onDragStart,
		onSave,
		onReset,
		onCancel,
	}: {
		/** The currently resolved placement, e.g. "Bottom Center". */
		label: string;
		/** Start an OS-level window drag. Resolves when the drag ends. */
		onDragStart: () => void;
		onSave: () => void;
		onReset: () => void;
		onCancel: () => void;
	} = $props();

	const actionBase =
		'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/90 transition duration-150 ease-out hover:scale-[1.08] active:scale-95';
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="wispr-pill-reposition box-border flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-white/90 select-none"
	style="width: {260}px;"
	onmousedown={onDragStart}
>
	<span class="cursor-grab truncate text-[12px] font-medium tracking-tight text-white/85 active:cursor-grabbing">
		{label}
	</span>
	<div class="flex items-center gap-1.5">
		<button
			type="button"
			class={cn(actionBase, 'bg-emerald-500/70 text-white hover:bg-emerald-500/90')}
			aria-label="Save position"
			title="Save position"
			onclick={(event) => {
				event.stopPropagation();
				onSave();
			}}
		>
			<CheckIcon class="size-3.5" />
		</button>
		<button
			type="button"
			class={cn(actionBase, 'hover:bg-white/20')}
			aria-label="Reset to default position"
			title="Reset to default position"
			onclick={(event) => {
				event.stopPropagation();
				onReset();
			}}
		>
			<RotateCcwIcon class="size-3.5" />
		</button>
		<button
			type="button"
			class={cn(actionBase, 'hover:bg-[#faa2ca]/20 hover:text-[#ffd2e4]')}
			aria-label="Cancel"
			title="Cancel"
			onclick={(event) => {
				event.stopPropagation();
				onCancel();
			}}
		>
			<XIcon class="size-3.5" />
		</button>
	</div>
</div>

<style>
	/* Same material as `.wispr-pill` in RecordingPill.svelte; kept as a
	   separate declaration rather than a shared class because the two
	   components' markup shapes differ enough that a shared CSS class would
	   need :has()/structural selectors to fit both. */
	.wispr-pill-reposition {
		background: rgba(18, 18, 20, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(16px) saturate(180%);
		-webkit-backdrop-filter: blur(16px) saturate(180%);
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.45),
			0 2px 6px rgba(0, 0, 0, 0.3);
		transition: transform 150ms ease-out;
	}
</style>
```

- [ ] **Step 2: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors (this resolves the transient error Task 5 left open).

- [ ] **Step 3: Commit**

```bash
git add apps/whispering/src/lib/recording-pill/RecordingPillReposition.svelte
git commit -m "feat(whispering): add the reposition preview's confirm row"
```

---

### Task 7: The Settings entry point

**Files:**
- Modify: `apps/whispering/src/routes/(app)/(config)/settings/+page.svelte`

**Interfaces:**
- Consumes: `startOverlayRepositionSession` (Task 4); `formatAnchorLabel`
  (Task 1).

No automated test: thin UI wiring over an already-tested pure function and an
already-planned-for-manual-verification session. Verified by hand in Task 8.

- [ ] **Step 1: Add the field**

In `apps/whispering/src/routes/(app)/(config)/settings/+page.svelte`, add
imports:

```ts
import { formatAnchorLabel } from '$lib/recording-overlay/anchor-position';
import { startOverlayRepositionSession } from '$lib/recording-overlay/window-manager.tauri';
import { report } from '$lib/report';

let repositioning = $state(false);

const overlayAnchorLabel = $derived(
	formatAnchorLabel({
		xAnchor: app.settings.get('recordingOverlayXAnchor'),
		xMarginPx: app.settings.get('recordingOverlayXMarginPx'),
		yAnchor: app.settings.get('recordingOverlayYAnchor'),
		yMarginPx: app.settings.get('recordingOverlayYMarginPx'),
	}),
);

async function reposition() {
	repositioning = true;
	const { error } = await startOverlayRepositionSession(app);
	repositioning = false;
	if (error) report.error({ title: "Couldn't start repositioning", cause: error });
}
```

Then, inside the existing `{#if tauri}` block, immediately after
`<AutostartSwitch autostart={tauri.autostart} />`:

```svelte
			<Field.Set>
				<Field.Legend variant="label">Recording pill position</Field.Legend>
				<Field.Description>
					Where the floating pill appears while you dictate.
					Currently: {overlayAnchorLabel}.
				</Field.Description>
				<Field.Group>
					<div class="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={repositioning}
							onclick={reposition}
						>
							{repositioning ? 'Drag the pill on your screen...' : 'Reposition'}
						</Button>
					</div>
				</Field.Group>
			</Field.Set>
```

`Button` is already imported by this file for the "Reset to defaults"
control elsewhere on the page; no new import needed for it. The Reset button
lives on the pill itself during the session (Task 6), not here, matching the
spec's "inline on the pill" decision, so this entry point only needs the one
"Reposition" action.

- [ ] **Step 2: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/whispering/src/routes/(app)/(config)/settings/+page.svelte"
git commit -m "feat(whispering): add the recording pill reposition entry point"
```

---

### Task 8: Verify in the desktop shell

Dragging a real OS window, the snap feel, and the label text cannot run
under `bun test`. This is the same class of manual verification Command Mode's
keystroke path got.

**Files:** none. This task produces evidence, not a diff.

- [ ] **Step 1: Start the desktop app**

```bash
bun dev:epicenter
```

- [ ] **Step 2: Confirm the default is unchanged**

Start a dictation (manual or VAD). The pill should appear exactly where it
always has: centered, just above the taskbar. This is the regression check
for Task 3's refactor.

- [ ] **Step 3: Open the reposition session**

Settings, the new "Recording pill position" field, click "Reposition". The
pill should appear (or stay, if a dictation just ended) draggable, showing its
current placement label and the three inline buttons.

- [ ] **Step 4: Drag to each edge and corner**

Drag to all four corners, all four edge midpoints, and dead center. At each
stop, confirm the label updates and the pill visibly snaps (a small settle,
not a jump) when near a snap point, and drifts freely with the cursor
otherwise.

- [ ] **Step 5: Save and confirm it persists**

Drag somewhere non-default, hit the check mark. Start a new dictation and
confirm the pill appears at the saved spot, not the old default. Reopen
Settings and confirm the label matches.

- [ ] **Step 6: Reset**

Reopen reposition, hit the reset icon. Confirm the pill jumps straight back to
the exact default position and the session ends immediately (no separate save
step), and that Settings' label now reads "Bottom Center" again.

- [ ] **Step 7: Cancel mid-drag**

Drag somewhere, then hit cancel instead of save. Confirm the pill returns to
wherever it was when the session started (not the default, unless that is
what it started at) and Settings' label is unchanged from before the session.

- [ ] **Step 8: Multi-monitor, if available**

Move the mouse to a second monitor before starting a dictation, so it becomes
the "current" monitor, and confirm the pill appears there at the same saved
anchor, scaled correctly for that monitor's resolution and scale factor.

- [ ] **Step 9: Record the evidence**

Note the result of each check in the commit message or the PR body.

---

## Self-review

**Spec coverage.** Anchor model and its default: Task 1 and 2. The normal
show path reading it: Task 3. The reposition session's event contract and
main-window orchestration: Task 4. The overlay's draggable preview and
snap-on-release mechanics: Task 5. The inline Save/Reset/Cancel row: Task 6.
The Settings entry point and label: Task 7. Manual drag/snap/persist
verification: Task 8.

**Deviation from the spec, called out explicitly.** The spec's "Snap
behavior" section was written before this plan discovered the overlay window
is sized to the pill (300x72), not the monitor, and so cannot paint full-screen
guide lines without a second monitor-sized window. The spec was edited in
place (see its "No full-screen guide lines" note) to describe what Task 5 and
6 actually build instead: the pill snapping itself plus a live label, no
guide-line window. This is the one place the plan's technical grounding changed
the design, not just its wiring.

**Not covered by an automated test, on purpose.** Tasks 3 through 8: real
window creation, real OS-level dragging, and the snap "feel", none of which
`bun test` can open.
