import { beforeEach, expect, test } from 'bun:test';
import { lastDelivery } from './last-delivery.svelte';

beforeEach(() => lastDelivery.clear());

test('a clean cursor paste is undoable, counted in graphemes', () => {
	lastDelivery.record({ text: 'hello', sinkKind: 'cursor', reach: 'output' });
	expect(lastDelivery.take()).toEqual({ graphemes: 5 });
});

test('an emoji and a combining mark each count as one backspace', () => {
	// One backspace deletes one grapheme cluster, so a UTF-16 length would
	// overshoot and eat the words before it.
	lastDelivery.record({ text: '👨‍👩‍👧', sinkKind: 'cursor', reach: 'output' });
	expect(lastDelivery.take()).toEqual({ graphemes: 1 });

	// Written as e + U+0301 on purpose: a combining mark, not the single
	// precomposed character, or the test proves nothing.
	lastDelivery.record({ text: 'é', sinkKind: 'cursor', reach: 'output' });
	expect(lastDelivery.take()).toEqual({ graphemes: 1 });
});

test('nothing that skipped the keyboard is undoable', () => {
	lastDelivery.record({ text: 'hello', sinkKind: 'clipboard', reach: 'output' });
	expect(lastDelivery.take()).toBeNull();

	lastDelivery.record({ text: 'hello', sinkKind: 'ledger', reach: 'output' });
	expect(lastDelivery.take()).toBeNull();

	// A cursor write that could not paste left the text on the clipboard.
	lastDelivery.record({ text: 'hello', sinkKind: 'cursor', reach: 'clipboard' });
	expect(lastDelivery.take()).toBeNull();
});

test('the record is consumed once', () => {
	lastDelivery.record({ text: 'hello', sinkKind: 'cursor', reach: 'output' });
	expect(lastDelivery.take()).toEqual({ graphemes: 5 });
	expect(lastDelivery.take()).toBeNull();
});

test('nothing held reads as nothing to undo', () => {
	expect(lastDelivery.take()).toBeNull();
});
