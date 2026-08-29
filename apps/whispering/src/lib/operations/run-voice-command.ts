/**
 * The effect half of Command Mode. `match-command` stays pure and app-free;
 * everything that touches live state lives here.
 *
 * See `specs/20260829T120000-command-mode.md`.
 */
import { createLogger } from 'wellcrafted/logger';
import type { VoiceCommandId } from '$lib/operations/match-command';
import {
	isVadRecordingActive,
	stopVadRecording,
} from '$lib/operations/recording';
import { report } from '$lib/report';
import { services } from '$lib/services';
import { lastDelivery } from '$lib/state/last-delivery.svelte';
import type { WhisperingApp } from '$lib/whispering/app';

const log = createLogger('whispering/voice-command');

/**
 * The most backspaces one undo may send, mirroring the host's own cap. Checked
 * here as well so an over-long dictation gets a calm notice rather than the
 * host's opaque refusal surfacing as an error.
 */
const MAX_BACKSPACES = 2000;

/**
 * Whether this command has anything to act on right now.
 *
 * A matched phrase is not enough to swallow an utterance. `isDictation` is true
 * in manual mode as well as VAD, so "stop listening" during a manual dictation
 * would otherwise match, do nothing, and eat the words: no text and no action.
 * An inapplicable command falls through and delivers as ordinary text instead.
 *
 * `scratchThat` always applies: it reports its own "nothing to undo" case
 * rather than doing nothing silently.
 */
export function commandApplies(id: VoiceCommandId): boolean {
	switch (id) {
		case 'scratchThat':
			return true;
		case 'stopListening':
			return isVadRecordingActive();
	}
}

export async function runVoiceCommand(
	app: WhisperingApp,
	id: VoiceCommandId,
): Promise<void> {
	switch (id) {
		case 'scratchThat':
			return scratchThat();
		case 'stopListening':
			log.info('Voice command stopped the listening session');
			return stopVadRecording(app);
	}
}

async function scratchThat(): Promise<void> {
	const undo = lastDelivery.take();
	if (undo === null) {
		report.info({
			title: 'Nothing to undo',
			description:
				'There is no dictation at your cursor to remove. Only text Whispering pasted at the cursor can be taken back.',
		});
		return;
	}

	if (undo.graphemes > MAX_BACKSPACES) {
		report.info({
			title: 'That dictation is too long to undo',
			description:
				'Undo is capped at 2000 characters, so nothing was removed. Select the text and delete it instead.',
		});
		return;
	}

	const { error } = await services.text.simulateBackspaces(undo.graphemes);
	if (error !== null) {
		// The held record is already gone, which is what we want: after a partial
		// delete the count no longer describes what is on screen.
		report.error({ title: "Couldn't undo the last dictation", cause: error });
		return;
	}
	log.info('Voice command undid the last dictation', {
		graphemes: undo.graphemes,
	});
}
