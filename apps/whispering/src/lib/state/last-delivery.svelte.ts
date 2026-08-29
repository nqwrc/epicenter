/**
 * The one delivery "scratch that" can undo.
 *
 * Session-scoped and deliberately not persisted: a transcript delivered before
 * a restart is not something a backspace can find its way back to.
 *
 * Consumed once. A second "scratch that" must find nothing held rather than
 * deleting another paste's worth of characters.
 *
 * See `specs/20260829T120000-command-mode.md`.
 */
import type { DeliveryReach } from '$lib/operations/delivery-reach';
import type { SinkKind } from '$lib/operations/sink';

type Held = {
	text: string;
	sinkKind: SinkKind;
	reach: DeliveryReach;
	pressedEnter: boolean;
};

let held: Held | null = null;

/**
 * Graphemes, not code units: one Backspace deletes one grapheme cluster, so a
 * `text.length` count would overshoot on an emoji or a combining mark and eat
 * the words the user typed before the paste.
 */
function countGraphemes(text: string): number {
	const segmenter = new Intl.Segmenter(undefined, {
		granularity: 'grapheme',
	});
	let count = 0;
	for (const _ of segmenter.segment(text)) count += 1;
	return count;
}

/**
 * Only a clean cursor paste with no Enter after it can be undone. The clipboard
 * and ledger sinks never touch the keyboard; a cursor write that fell back to
 * `clipboard` did not paste; and an Enter may have submitted the text out of the
 * input, so the characters are not reliably still at the cursor.
 */
function isUndoable(record: Held): boolean {
	return (
		record.sinkKind === 'cursor' &&
		record.reach === 'output' &&
		!record.pressedEnter
	);
}

export const lastDelivery = {
	/** Hold what was just delivered. Replaces anything held before it. */
	record(next: Held): void {
		held = next;
	},

	/**
	 * Take the held delivery, clearing it either way. Returns the number of
	 * backspaces that would undo it, or null when nothing is held or what is
	 * held never reached the cursor.
	 */
	take(): { graphemes: number } | null {
		const record = held;
		held = null;
		if (record === null || !isUndoable(record)) return null;
		return { graphemes: countGraphemes(record.text) };
	},

	/** Drop the held delivery without undoing it. */
	clear(): void {
		held = null;
	},
};
