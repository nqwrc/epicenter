import type { WhisperingApp } from '$lib/whispering/app';

/**
 * Wispr Flow-style hands-free lock over push-to-talk: double-tap the hold
 * chord (two Pressed edges within {@link DOUBLE_TAP_WINDOW_MS}) and the mic
 * stays open past the second tap's own release; the next single press (or
 * whatever else ends the recording underneath us, see below) closes it.
 *
 * A thin wrapper rather than a change to `push-to-talk.ts`: that module owns
 * one press/release session and does not know about a two-tap pattern above
 * it, and it stays that way (its id-scoped, startup-safe session tracking is
 * exactly what the hands-free lock's `start`/`stop` calls lean on). This
 * module owns only the "is the next Released real" question; `push-to-talk.ts`
 * still owns everything about what a session is.
 *
 * Pure logic only: `createHandsFree` takes its `pushToTalk` slice as a
 * parameter rather than importing the real singleton itself, so this file has
 * no runtime dependency on `push-to-talk.ts` (`hands-free.test.ts` hands it a
 * mock controller directly). The production instance -- built over the real
 * `pushToTalk`, shared by the command handler and session teardown -- is
 * composed in `hands-free-instance.ts`. Importing the real `pushToTalk` here
 * too would make every importer of this module, including the test file,
 * eagerly load its dependency chain (`$lib/report`, `manual-recorder.svelte`,
 * `operations/recording`); `push-to-talk.test.ts` mocks those same modules via
 * `mock.module`, which replaces them for the rest of the `bun test` process,
 * so a stray real load from here left its mocks unable to take effect.
 */

export const DOUBLE_TAP_WINDOW_MS = 400;

/** The slice of `pushToTalk` this wrapper drives. */
export type PushToTalkController = {
	start: (app: WhisperingApp) => Promise<void>;
	stop: (app: WhisperingApp) => Promise<void>;
	dispose: (app: WhisperingApp) => Promise<void>;
};

export function createHandsFree(controller: PushToTalkController) {
	let locked = false;
	// The previous Pressed's timestamp, or 0 when there is none to compare
	// against (first press, or the streak was just consumed by a lock).
	let lastPressedAt = 0;

	function onPressed(app: WhisperingApp) {
		if (locked) {
			// Third press: release the lock and stop the held-open recording.
			locked = false;
			lastPressedAt = 0;
			return controller.stop(app);
		}

		if (
			lastPressedAt !== 0 &&
			Date.now() - lastPressedAt <= DOUBLE_TAP_WINDOW_MS
		) {
			// Second tap inside the window: lock hands-free open instead of
			// starting a normal timed streak over again.
			locked = true;
			lastPressedAt = 0;
			// `start` is idempotent either way `push-to-talk.ts` finds things:
			// tap 1's session is usually already gone by now (its Released
			// landed first and stopped it, the ordinary case for a real
			// double-tap), so this begins the hands-free recording; if tap 1
			// is somehow still held, `start` no-ops and hands-free just keeps
			// that same session going.
			return controller.start(app);
		}

		lastPressedAt = Date.now();
		return controller.start(app);
	}

	function onReleased(app: WhisperingApp) {
		// Locked: this Released belongs to a press we are deliberately
		// recording through (the second tap, or any stray release while
		// hands-free is open). Ignored, not stopped.
		if (locked) return;
		return controller.stop(app);
	}

	// Two known ways `locked` can end up stale (true with nothing recording),
	// both accepted rather than chased, because fixing them needs state that
	// `push-to-talk.ts` deliberately keeps private:
	// - The 5-minute cap fires while locked: it stops the recording (the same
	//   stuck-on safety fuse as an ordinary hold), but nothing here hears it,
	//   so `locked` stays true. The next press only unlocks; a second press
	//   starts again. Acceptable: the cap is a rare backstop, not a path a
	//   hands-free user takes often.
	// - Cancel (Escape/the cancel command) stops the recording directly
	//   through `manualRecorder`, bypassing `pushToTalk` entirely, so the same
	//   desync happens: `locked` outlives the recording it was guarding.
	// - A rarer gap: if tap 1's mic startup is still in flight when its
	//   Released lands, `push-to-talk.ts` latches that release internally
	//   (`stopRequested`) rather than dropping it. Tap 2 then finds a live,
	//   non-stale session and `start` no-ops, so once startup resolves the
	//   latched stop fires anyway -- hands-free locks with nothing recording,
	//   silently. Only visible from outside as "double-tap did nothing."

	async function dispose(app: WhisperingApp) {
		// A torn-down session should not leave the next one to start locked.
		locked = false;
		lastPressedAt = 0;
		await controller.dispose(app);
	}

	return { onPressed, onReleased, dispose };
}
