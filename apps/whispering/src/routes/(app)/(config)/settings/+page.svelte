<!--
	Capture: everything about how this machine records, from the moment a capture
	starts to the moment the text lands somewhere. It absorbed the old Recording
	and Sound pages, which were a menu entry each for one select and eight
	switches.

	The microphone is deliberately absent. It is a live control, so it lives in
	the pipeline row on the record screen, where a person deciding which
	microphone is hot is already looking.
-->
<script lang="ts">
	import * as Alert from '@epicenter/ui/alert';
	import { Button } from '@epicenter/ui/button';
	import * as Field from '@epicenter/ui/field';
	import { Link } from '@epicenter/ui/link';
	import InfoIcon from '@lucide/svelte/icons/info';
	import OutputDeliveryControls from '$lib/components/OutputDeliveryControls.svelte';
	import { SettingSelect, SettingSwitch } from '$lib/components/settings';
	import {
		BITRATE_OPTIONS,
		RECORDING_TRIGGER_OPTIONS,
	} from '$lib/constants/audio';
	import { formatAnchorLabel } from '$lib/recording-overlay/anchor-position';
	import {
		cancelOverlayRepositionSession,
		startOverlayRepositionSession,
	} from '$lib/recording-overlay/window-manager.tauri';
	import { report } from '$lib/report';
	import { deviceConfig } from '$lib/state/device-config.svelte';
	import { os } from '#platform/os';
	import { tauri } from '#platform/tauri';
	import { getWhisperingApp } from '$lib/whispering/context';
	import AutostartSwitch from './AutostartSwitch.svelte';

	const app = getWhisperingApp();

	const overlayAnchorLabel = $derived(
		formatAnchorLabel({
			xAnchor: app.settings.get('recordingOverlayXAnchor'),
			xMarginPx: app.settings.get('recordingOverlayXMarginPx'),
			yAnchor: app.settings.get('recordingOverlayYAnchor'),
			yMarginPx: app.settings.get('recordingOverlayYMarginPx'),
		}),
	);

	// A session fills the screen with the overlay window and takes its clicks, so
	// this button doubles as the way out: while one is running it cancels rather
	// than going dead, and that path does not depend on the overlay answering.
	let repositioning = $state(false);

	async function toggleReposition() {
		if (repositioning) {
			await cancelOverlayRepositionSession();
			return;
		}
		repositioning = true;
		const { error } = await startOverlayRepositionSession(app);
		repositioning = false;
		if (error) {
			report.error({ title: "Couldn't start repositioning", cause: error });
		}
	}
</script>

<svelte:head> <title>Capture Settings - Whispering</title> </svelte:head>

<Field.Set>
	<Field.Legend>Capture</Field.Legend>
	<Field.Description>
		How this machine records, what it sounds like, and where the text goes when
		a capture finishes.
	</Field.Description>
	<Field.Separator />
	<Field.Group>
		<Field.Set id="recording" class="scroll-mt-20">
			<Field.Legend variant="label">Recording</Field.Legend>
			<Field.Description>
				How a capture starts and what it does to the rest of your machine.
			</Field.Description>
			<Field.Group>
				<SettingSelect
					store={app.settings}
					key="recordingTrigger"
					label="Recording Trigger"
					items={RECORDING_TRIGGER_OPTIONS}
					description="Choose how recording starts: {RECORDING_TRIGGER_OPTIONS.map(
						(option) => option.label.toLowerCase(),
					).join(', ')}"
				/>

				<SettingSwitch
					key="recordingPausePlayback"
					label="Pause playback while recording"
					description="Whispering pauses media playing on your computer (music, video, browser tabs) while your voice is being captured, then tries to resume it after. In voice activated mode it pauses only while you actually speak, so music keeps playing between phrases. Works with most apps in your system media controls. A few can't be paused, and on macOS the resume can occasionally wake a different app that was already paused."
				/>

				{#if app.recordings.remoteAvailable}
					<SettingSwitch
						key="recordingAutoUpload"
						label="Upload new recordings"
						description="After saving a new recording on this device, try once to copy its audio to your online storage. Failed uploads stay local and are not retried automatically."
					/>
				{/if}

				{#if app.settings.get('recordingTrigger') === 'vad'}
					{#if os.isLinux}
						<Alert.Root variant="destructive">
							<InfoIcon class="size-4" />
							<Alert.Title>Voice Activated not supported on Linux</Alert.Title>
							<Alert.Description>
								Voice Activated Detection (VAD) requires the browser's Navigator
								API, which is not fully supported in Tauri on Linux. Device
								enumeration and recording will fail. Please use Manual recording
								instead.
								<Link
									href="https://github.com/EpicenterHQ/epicenter/issues/839"
									target="_blank"
								>
									Learn more →
								</Link>
							</Alert.Description>
						</Alert.Root>
					{:else}
						{#if tauri && os.isApple}
							<Alert.Root variant="warning">
								<InfoIcon class="size-4" />
								<Alert.Title>Global Shortcuts May Be Unreliable</Alert.Title>
								<Alert.Description>
									VAD uses browser-owned capture. macOS App Nap may delay
									browser recording logic when Whispering is not in focus.
								</Alert.Description>
							</Alert.Root>
						{/if}
						<Alert.Root>
							<InfoIcon class="size-4" />
							<Alert.Title>Voice Activated Detection</Alert.Title>
							<Alert.Description>
								VAD uses the browser's Web Audio API for real-time voice
								detection. Captured speech is encoded to uncompressed WAV
								format.
							</Alert.Description>
						</Alert.Root>
					{/if}
				{/if}

				{#if app.settings.get('recordingTrigger') === 'manual' && !tauri}
					<SettingSelect
						store={deviceConfig}
						key="recording.navigator.bitrateKbps"
						label="Bitrate"
						items={BITRATE_OPTIONS}
						description="The bitrate of the recording. Higher values mean better quality but larger file sizes."
					/>
				{/if}
			</Field.Group>
		</Field.Set>

		<Field.Separator />

		<Field.Set id="output" class="scroll-mt-20">
			<Field.Legend variant="label">Output</Field.Legend>
			<Field.Description>Where the text goes once it is ready.</Field.Description>
			<Field.Group>
				<Field.Set>
					<Field.Legend variant="label">Transcription output</Field.Legend>
					<Field.Description>
						Applies immediately after an audio transcription finishes.
					</Field.Description>
					<Field.Group>
						<OutputDeliveryControls scope="transcription" />
					</Field.Group>
				</Field.Set>

				<Field.Set>
					<Field.Legend variant="label">Recipe output</Field.Legend>
					<Field.Description>
						Applies after you run a Recipe on your selection or clipboard.
					</Field.Description>
					<Field.Group>
						<OutputDeliveryControls scope="recipe" />
					</Field.Group>
				</Field.Set>
			</Field.Group>
		</Field.Set>

		<Field.Separator />

		<Field.Set id="sounds" class="scroll-mt-20">
			<Field.Legend variant="label">Sounds</Field.Legend>
			<Field.Description>
				Audio cues for the moments you cannot see, like a capture that started
				while another window has focus.
			</Field.Description>
			<Field.Group>
				<SettingSwitch
					key="soundManualStart"
					label="Play sound when starting manual recording"
				/>
				<SettingSwitch
					key="soundManualStop"
					label="Play sound when stopping manual recording"
				/>
				<SettingSwitch
					key="soundManualCancel"
					label="Play sound when canceling manual recording"
				/>
				<SettingSwitch
					key="soundVadStart"
					label="Play sound when starting VAD recording session"
				/>
				<SettingSwitch key="soundVadCapture" label="Play sound on VAD capture" />
				<SettingSwitch
					key="soundVadStop"
					label="Play sound when stopping VAD recording session"
				/>
				<SettingSwitch
					key="soundTranscriptionComplete"
					label="Play sound after transcription"
				/>
				<SettingSwitch
					key="soundRecipeComplete"
					label="Play sound after a recipe runs"
				/>
			</Field.Group>
		</Field.Set>

		{#if tauri}
			<Field.Separator />

			<Field.Set id="app" class="scroll-mt-20">
				<Field.Legend variant="label">Whispering on this machine</Field.Legend>
				<Field.Description>
					Whether Whispering is running and ready to capture, and where it shows
					that it is.
				</Field.Description>
				<Field.Group>
					<AutostartSwitch autostart={tauri.autostart} />

					<Field.Field>
						<Field.Label>Recording pill position</Field.Label>
						<Field.Description>
							Where the floating pill appears while you dictate. Currently: {overlayAnchorLabel}.
						</Field.Description>
						<div class="flex gap-2">
							<Button
								variant={repositioning ? 'secondary' : 'outline'}
								size="sm"
								class="w-fit"
								onclick={toggleReposition}
							>
								{repositioning ? 'Cancel repositioning' : 'Reposition'}
							</Button>
						</div>
						{#if repositioning}
							<p class="text-muted-foreground text-sm">
								Drag the pill on your screen, then save it there.
							</p>
						{/if}
					</Field.Field>
				</Field.Group>
			</Field.Set>
		{/if}
	</Field.Group>
</Field.Set>
