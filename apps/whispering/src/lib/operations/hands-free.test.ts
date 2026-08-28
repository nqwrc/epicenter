/**
 * Hands-Free Push-to-Talk Tests
 *
 * Verifies the double-tap lock wrapper's edge logic in isolation from
 * `push-to-talk.ts`'s own session semantics (covered by `push-to-talk.test.ts`).
 * `createHandsFree` takes its `pushToTalk` slice as a parameter, so the mock
 * controller here is a plain object, not `mock.module('./push-to-talk')`: the
 * latter would replace that module for every test file in the same `bun test`
 * run, including `push-to-talk.test.ts`'s own import of the real thing.
 *
 * Key behaviors:
 * - A single tap starts on Pressed and stops on Released, same as bare push-to-talk
 * - Two Pressed edges within the double-tap window lock hands-free open and
 *   swallow the next Released instead of stopping
 * - A press while locked unlocks and stops, and clears the streak
 * - Two Pressed edges outside the window are treated as two independent taps
 */
import { beforeEach, expect, mock, test } from 'bun:test';
import type { WhisperingApp } from '$lib/whispering/app';
import { createHandsFree, DOUBLE_TAP_WINDOW_MS } from './hands-free';

const start = mock(async () => {});
const stop = mock(async () => {});
const dispose = mock(async () => {});
const handsFree = createHandsFree({ start, stop, dispose });
const app = {} as WhisperingApp;

beforeEach(() => {
	start.mockClear();
	stop.mockClear();
	dispose.mockClear();
	// Every test starts from a clean lock/streak, the same as a fresh UI
	// session would.
	return handsFree.dispose(app);
});

test('a single tap starts on Pressed and stops on Released', () => {
	handsFree.onPressed(app);
	expect(start).toHaveBeenCalledTimes(1);

	handsFree.onReleased(app);
	expect(stop).toHaveBeenCalledTimes(1);
});

test('two Pressed edges within the window lock hands-free and swallow the next Released', () => {
	handsFree.onPressed(app); // tap 1
	handsFree.onReleased(app); // tap 1's release: a normal stop
	expect(stop).toHaveBeenCalledTimes(1);

	handsFree.onPressed(app); // tap 2, inside the window: locks
	expect(start).toHaveBeenCalledTimes(2);

	handsFree.onReleased(app); // tap 2's release: swallowed
	expect(stop).toHaveBeenCalledTimes(1); // unchanged
});

test('a press while locked unlocks and stops, without starting or leaving a stale streak', () => {
	handsFree.onPressed(app); // tap 1
	handsFree.onReleased(app);
	handsFree.onPressed(app); // tap 2: locks
	expect(start).toHaveBeenCalledTimes(2);

	handsFree.onPressed(app); // tap 3: unlocks and stops
	expect(stop).toHaveBeenCalledTimes(2);
	expect(start).toHaveBeenCalledTimes(2); // the unlocking press does not also start

	handsFree.onPressed(app); // an ordinary next tap
	expect(start).toHaveBeenCalledTimes(3);
	handsFree.onReleased(app);
	expect(stop).toHaveBeenCalledTimes(3);
});

test('two Pressed edges outside the window are two independent taps, not a lock', async () => {
	handsFree.onPressed(app); // tap 1
	handsFree.onReleased(app);
	expect(stop).toHaveBeenCalledTimes(1);

	await Bun.sleep(DOUBLE_TAP_WINDOW_MS + 50);

	handsFree.onPressed(app); // tap 2, outside the window
	expect(start).toHaveBeenCalledTimes(2);
	handsFree.onReleased(app);
	expect(stop).toHaveBeenCalledTimes(2); // released normally, not swallowed
});

test('dispose clears the lock so the next session does not start locked', async () => {
	handsFree.onPressed(app); // tap 1
	handsFree.onReleased(app);
	handsFree.onPressed(app); // tap 2: locks
	expect(start).toHaveBeenCalledTimes(2);

	await handsFree.dispose(app);
	expect(dispose).toHaveBeenCalledWith(app);

	handsFree.onPressed(app); // a fresh session's first tap
	expect(start).toHaveBeenCalledTimes(3);
	handsFree.onReleased(app); // must stop, not be swallowed
	expect(stop).toHaveBeenCalledTimes(2);
});
