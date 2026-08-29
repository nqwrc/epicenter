/**
 * Command Mode's effect runner.
 *
 * Key behaviors:
 * - `commandApplies` is the single enforcement point for the design's safety
 *   property: a matched but inapplicable command falls through and is typed
 *   as text instead of vanishing.
 * - `scratchThat` never sends a synthetic backspace on the no-op paths
 *   (nothing held, over the undo cap), only on a genuine held record.
 * - A backspace failure reports rather than throwing.
 * - `stopListening` reaches the VAD recorder exactly once.
 */
import { expect, mock, test } from 'bun:test';
import { Err, Ok, type Result } from 'wellcrafted/result';
import type { TextError } from '$lib/services/text/types';
import type { WhisperingApp } from '$lib/whispering/app';

let vadActive = false;
const simulateBackspaces = mock(
	async (): Promise<Result<void, TextError>> => Ok(undefined),
);
const take = mock((): { graphemes: number } | null => null);
const reportInfo = mock();
const reportError = mock();
const stopVadRecording = mock(async () => {});

mock.module('$lib/operations/recording', () => ({
	isVadRecordingActive: () => vadActive,
	stopVadRecording,
}));
mock.module('$lib/services', () => ({
	services: { text: { simulateBackspaces } },
}));
mock.module('$lib/state/last-delivery.svelte', () => ({
	lastDelivery: { take, record: mock(), clear: mock() },
}));
mock.module('$lib/report', () => ({
	report: { info: reportInfo, error: reportError },
}));

const { commandApplies, runVoiceCommand } = await import(
	'./run-voice-command.js'
);

const app = {} as unknown as WhisperingApp;

test("commandApplies('stopListening') follows whether VAD is live", () => {
	vadActive = false;
	expect(commandApplies('stopListening')).toBe(false);
	vadActive = true;
	expect(commandApplies('stopListening')).toBe(true);
	vadActive = false;
});

test("commandApplies('scratchThat') is true regardless of VAD state", () => {
	vadActive = false;
	expect(commandApplies('scratchThat')).toBe(true);
	vadActive = true;
	expect(commandApplies('scratchThat')).toBe(true);
	vadActive = false;
});

test('scratchThat with nothing held sends no backspaces and reports an info notice', async () => {
	take.mockReturnValueOnce(null);
	await runVoiceCommand(app, 'scratchThat');
	expect(simulateBackspaces).not.toHaveBeenCalled();
	expect(reportInfo).toHaveBeenLastCalledWith({
		title: 'Nothing to undo',
		description:
			'There is no dictation at your cursor to remove. Only text Whispering pasted at the cursor can be taken back.',
	});
});

test('scratchThat over the cap sends no backspaces and reports an info notice', async () => {
	take.mockReturnValueOnce({ graphemes: 2001 });
	await runVoiceCommand(app, 'scratchThat');
	expect(simulateBackspaces).not.toHaveBeenCalled();
	expect(reportInfo).toHaveBeenLastCalledWith({
		title: 'That dictation is too long to undo',
		description:
			'Undo is capped at 2000 characters, so nothing was removed. Select the text and delete it instead.',
	});
});

test('scratchThat with a held record sends exactly one backspace call for its graphemes', async () => {
	take.mockReturnValueOnce({ graphemes: 12 });
	await runVoiceCommand(app, 'scratchThat');
	expect(simulateBackspaces).toHaveBeenCalledTimes(1);
	expect(simulateBackspaces).toHaveBeenLastCalledWith(12);
});

test('a failing simulateBackspaces reports an error notice and does not throw', async () => {
	take.mockReturnValueOnce({ graphemes: 5 });
	const cause = { name: 'SimulateKeystroke' } as unknown as TextError;
	simulateBackspaces.mockImplementationOnce(async () => Err(cause));
	await runVoiceCommand(app, 'scratchThat');
	expect(reportError).toHaveBeenLastCalledWith({
		title: "Couldn't undo the last dictation",
		cause,
	});
});

test("runVoiceCommand(app, 'stopListening') reaches the VAD recorder exactly once", async () => {
	stopVadRecording.mockClear();
	await runVoiceCommand(app, 'stopListening');
	expect(stopVadRecording).toHaveBeenCalledTimes(1);
	expect(stopVadRecording).toHaveBeenLastCalledWith(app);
});
