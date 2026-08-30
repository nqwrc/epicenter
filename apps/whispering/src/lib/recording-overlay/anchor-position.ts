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

export type LogicalRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};
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
 * across all four edges rather than configured per edge: one value users learn
 * once, and it is today's own bottom margin, so the default keeps meaning the
 * same thing it always did.
 */
export const EDGE_SNAP_MARGIN_PX = 72;

/** Where an anchor+margin places a `size` window inside `monitorWorkArea`. */
export function resolveAnchorPosition(
	anchor: OverlayAnchor,
	monitorWorkArea: LogicalRect,
	size: LogicalSize,
): { x: number; y: number } {
	return {
		x: resolveAxisPosition(
			anchor.xAnchor,
			anchor.xMarginPx,
			monitorWorkArea.x,
			monitorWorkArea.width,
			size.width,
		),
		y: resolveAxisPosition(
			anchor.yAnchor,
			anchor.yMarginPx,
			monitorWorkArea.y,
			monitorWorkArea.height,
			size.height,
		),
	};
}

function resolveAxisPosition(
	anchor: XAnchor | YAnchor,
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
	return {
		xAnchor: x.anchor,
		xMarginPx: x.marginPx,
		yAnchor: y.anchor,
		yMarginPx: y.marginPx,
	};
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

	const distanceFromNear = pos - monitorPos;
	const distanceFromFar = monitorPos + monitorSize - (pos + size);
	const isNearer = distanceFromNear <= distanceFromFar;
	const anchor = isNearer ? nearSide : farSide;
	const distance = isNearer ? distanceFromNear : distanceFromFar;

	const marginPx =
		Math.abs(distance - EDGE_SNAP_MARGIN_PX) <= SNAP_THRESHOLD_PX
			? EDGE_SNAP_MARGIN_PX
			: Math.max(0, Math.round(distance));
	return { anchor, marginPx };
}

/** A human label for the placement, for the Settings field and the drag label. */
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
