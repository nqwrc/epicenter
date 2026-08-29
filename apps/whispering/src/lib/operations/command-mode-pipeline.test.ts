/**
 * The pipeline branch Command Mode adds.
 *
 * What these lock down is the placement argument: a command intercepts the
 * transcript before Polish, before snippets, before the completion sound and
 * before delivery, and only when it is both enabled and applicable.
 */
import { afterEach, expect, mock, test } from 'bun:test';
import { generateBlobId } from '@epicenter/blobs';
import { Ok } from 'wellcrafted/result';
import type { RecordingId } from '$lib/workspace';
import { expandSnippets } from './expand-snippets';
import { matchCommand } from './match-command';

let commandModeEnabled = true;
let transcript = 'scratch that';
let applies = true;
const runVoiceCommand = mock(async () => {});
const deliverTranscriptionResult = mock(async () => ({
	outcome: {
		reach: 'output',
		sinkKind: 'cursor',
		pressedEnter: false,
	} as const,
	notice: { title: 'done' },
}));
const playSoundIfEnabled = mock(async () => Ok(undefined));
const recordDelivery = mock();
const dictationReset = mock();

mock.module('$lib/operations/expand-snippets', () => ({ expandSnippets }));
// The matcher is pure, so the real one runs here: a stub would hide the very
// coupling this file exists to check.
mock.module('$lib/operations/match-command', () => ({ matchCommand }));
mock.module('$lib/operations/run-voice-command', () => ({
	commandApplies: () => applies,
	runVoiceCommand,
}));
mock.module('$lib/operations/delivery', () => ({ deliverTranscriptionResult }));
mock.module('$lib/operations/run-polish', () => ({
	polishWillRun: () => false,
	runPolish: async (_app: unknown, { input }: { input: string }) => Ok(input),
}));
mock.module('$lib/operations/sound', () => ({ playSoundIfEnabled }));
mock.module('$lib/operations/transcribe', () => ({
	transcribeAndPersist: async () =>
		Ok({ text: transcript, history: Ok(undefined) }),
}));
mock.module('$lib/operations/transcription-history', () => ({
	saveRecordingHistory: mock(async () => Ok(undefined)),
}));
mock.module('$lib/report', () => ({
	log: { warn: mock() },
	report: {
		info: mock(),
		error: mock(),
		loading: () => ({ resolve: mock(), reject: mock() }),
	},
}));
mock.module('$lib/state/dictation-lifecycle.svelte', () => ({
	dictationLifecycle: {
		reset: dictationReset,
		markTranscribing: mock(),
		markFailed: mock(),
		markPolishing: mock(),
		markDelivered: mock(),
	},
}));
mock.module('$lib/state/polish-hud.svelte', () => ({
	polishHud: { begin: mock(), end: mock() },
}));
mock.module('$lib/state/last-delivery.svelte', () => ({
	lastDelivery: { record: recordDelivery, take: mock(), clear: mock() },
}));

const { processRecordingPipeline } = await import('./pipeline.js');
type WhisperingApp = import('$lib/whispering/app').WhisperingApp;

const app = {
	settings: {
		get: (key: string) =>
			key === 'commandModeEnabled' ? commandModeEnabled : false,
	},
	recordings: {
		create: (fields: Record<string, unknown>) => ({
			...fields,
			id: 'recording-1' as RecordingId,
		}),
		uploadAudio: mock(async () => Ok(undefined)),
		update: mock(async () => Ok(undefined)),
	},
	snippets: { all: [] },
} as unknown as WhisperingApp;

function run(deliverySource: 'recording' | 'import' = 'recording') {
	return processRecordingPipeline(app, {
		audioBlobId: generateBlobId(),
		durationMs: 100,
		deliverySource,
	});
}

afterEach(() => {
	commandModeEnabled = true;
	transcript = 'scratch that';
	applies = true;
	runVoiceCommand.mockClear();
	deliverTranscriptionResult.mockClear();
	playSoundIfEnabled.mockClear();
	recordDelivery.mockClear();
	dictationReset.mockClear();
});

test('a command runs instead of being delivered', async () => {
	await run();
	expect(runVoiceCommand).toHaveBeenCalledTimes(1);
	expect(runVoiceCommand).toHaveBeenLastCalledWith(app, 'scratchThat');
	expect(deliverTranscriptionResult).not.toHaveBeenCalled();
	// No text arrived anywhere, so there is no receipt to sound.
	expect(playSoundIfEnabled).not.toHaveBeenCalled();
	// A command delivers no text, so the "Transcribing" marker set on the way in
	// must be cleared, or the pill spins forever on work that already finished.
	expect(dictationReset).toHaveBeenCalledTimes(1);
});

test('ordinary speech is untouched', async () => {
	transcript = 'scratch that idea and move on';
	await run();
	expect(runVoiceCommand).not.toHaveBeenCalled();
	expect(deliverTranscriptionResult).toHaveBeenCalledTimes(1);
});

test('the setting gates the whole branch', async () => {
	commandModeEnabled = false;
	await run();
	expect(runVoiceCommand).not.toHaveBeenCalled();
	expect(deliverTranscriptionResult).toHaveBeenLastCalledWith(app, {
		text: 'scratch that',
		source: 'recording',
	});
});

test('an inapplicable command delivers as text instead of vanishing', async () => {
	transcript = 'stop listening';
	applies = false;
	await run();
	expect(runVoiceCommand).not.toHaveBeenCalled();
	expect(deliverTranscriptionResult).toHaveBeenLastCalledWith(app, {
		text: 'stop listening',
		source: 'recording',
	});
});

test('an imported file never fires a command', async () => {
	await run('import');
	expect(runVoiceCommand).not.toHaveBeenCalled();
	expect(deliverTranscriptionResult).toHaveBeenCalledTimes(1);
});

test('a delivered dictation is held for undo, an import is not', async () => {
	transcript = 'hello world';
	await run();
	expect(recordDelivery).toHaveBeenCalledTimes(1);
	expect(recordDelivery).toHaveBeenLastCalledWith({
		text: 'hello world',
		sinkKind: 'cursor',
		reach: 'output',
		pressedEnter: false,
	});

	recordDelivery.mockClear();
	await run('import');
	expect(recordDelivery).not.toHaveBeenCalled();
});
