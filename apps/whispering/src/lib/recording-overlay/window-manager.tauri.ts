import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
	currentMonitor,
	LogicalPosition,
	primaryMonitor,
} from '@tauri-apps/api/window';
import { defineErrors } from 'wellcrafted/error';
import { once } from 'wellcrafted/function';
import { createLogger } from 'wellcrafted/logger';
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
	RECORDING_OVERLAY_WINDOW_LABEL,
	recordingOverlayReady,
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

let latestStatus: RecordingPillStatus | null = null;
let queue: Promise<void> = Promise.resolve();

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
	const isSuperseded = () => status !== latestStatus;
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
		if (!latestStatus) await overlay.hide();
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
