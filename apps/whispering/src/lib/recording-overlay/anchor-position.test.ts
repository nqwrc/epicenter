import { expect, test } from 'bun:test';
import {
	DEFAULT_OVERLAY_ANCHOR,
	formatAnchorLabel,
	nearestAnchorFromRect,
	resolveAnchorPosition,
} from './anchor-position';

const MONITOR = { x: 0, y: 0, width: 1920, height: 1080 };
const SIZE = { width: 300, height: 72 };

test("the default anchor reproduces today's exact formula", () => {
	expect(resolveAnchorPosition(DEFAULT_OVERLAY_ANCHOR, MONITOR, SIZE)).toEqual({
		x: (1920 - 300) / 2,
		y: 1080 - 72 - 72,
	});
});

test('resolves each of the 9 anchor combinations', () => {
	expect(
		resolveAnchorPosition(
			{ xAnchor: 'left', xMarginPx: 40, yAnchor: 'top', yMarginPx: 20 },
			MONITOR,
			SIZE,
		),
	).toEqual({ x: 40, y: 20 });

	expect(
		resolveAnchorPosition(
			{ xAnchor: 'right', xMarginPx: 40, yAnchor: 'bottom', yMarginPx: 20 },
			MONITOR,
			SIZE,
		),
	).toEqual({ x: 1920 - 300 - 40, y: 1080 - 72 - 20 });

	expect(
		resolveAnchorPosition(
			{ xAnchor: 'center', xMarginPx: 0, yAnchor: 'center', yMarginPx: 0 },
			MONITOR,
			SIZE,
		),
	).toEqual({ x: (1920 - 300) / 2, y: (1080 - 72) / 2 });
});

test('resolves against a monitor not rooted at the origin (a secondary display)', () => {
	const monitor = { x: 1920, y: -200, width: 1440, height: 900 };
	expect(
		resolveAnchorPosition(
			{ xAnchor: 'left', xMarginPx: 0, yAnchor: 'top', yMarginPx: 0 },
			monitor,
			SIZE,
		),
	).toEqual({ x: 1920, y: -200 });
});

test('a rect at the default position resolves back to the default anchor', () => {
	const { x, y } = resolveAnchorPosition(DEFAULT_OVERLAY_ANCHOR, MONITOR, SIZE);
	expect(nearestAnchorFromRect({ x, y, ...SIZE }, MONITOR)).toEqual(
		DEFAULT_OVERLAY_ANCHOR,
	);
});

test('snaps to center within the threshold, not just exactly centered', () => {
	const { x, y } = resolveAnchorPosition(
		{ xAnchor: 'center', xMarginPx: 0, yAnchor: 'center', yMarginPx: 0 },
		MONITOR,
		SIZE,
	);
	expect(
		nearestAnchorFromRect({ x: x + 5, y: y - 5, ...SIZE }, MONITOR),
	).toEqual({
		xAnchor: 'center',
		xMarginPx: 0,
		yAnchor: 'center',
		yMarginPx: 0,
	});
});

test('outside every threshold keeps the literal dragged margin', () => {
	// 300px from the left, nowhere near center (960) or the standard 72px margin.
	expect(nearestAnchorFromRect({ x: 300, y: 40, ...SIZE }, MONITOR)).toEqual({
		xAnchor: 'left',
		xMarginPx: 300,
		yAnchor: 'top',
		yMarginPx: 40,
	});
});

test('a near-standard margin snaps exactly to it', () => {
	// 68px measured, within the 12px threshold of the standard 72px margin.
	expect(
		nearestAnchorFromRect({ x: 68, y: 1080 - 72 - 68, ...SIZE }, MONITOR),
	).toEqual({
		xAnchor: 'left',
		xMarginPx: 72,
		yAnchor: 'bottom',
		yMarginPx: 72,
	});
});

test('picks the nearer edge on each axis independently', () => {
	// x is near the right edge, y is near the top: independent per axis.
	const rect = { x: 1920 - 300 - 10, y: 15, ...SIZE };
	expect(nearestAnchorFromRect(rect, MONITOR)).toEqual({
		xAnchor: 'right',
		xMarginPx: 10,
		yAnchor: 'top',
		yMarginPx: 15,
	});
});

test('formats a label naming the default placement', () => {
	expect(formatAnchorLabel(DEFAULT_OVERLAY_ANCHOR)).toBe('Bottom Center');
});

test('formats a label calling out a non-standard margin', () => {
	expect(
		formatAnchorLabel({
			xAnchor: 'left',
			xMarginPx: 40,
			yAnchor: 'top',
			yMarginPx: 0,
		}),
	).toBe('Top Left (40px from left, flush with the top edge)');
});
