<script lang="ts">
	import { FileDropZone } from '@epicenter/ui/file-drop-zone';
	import { Link } from '@epicenter/ui/link';
	import * as SectionHeader from '@epicenter/ui/section-header';
	import type { UnlistenFn } from '@tauri-apps/api/event';
	import { onDestroy, onMount } from 'svelte';
	import { defineErrors, extractErrorMessage } from 'wellcrafted/error';
	import { tryAsync } from 'wellcrafted/result';
	import DictationCapabilityNotice from '$lib/components/DictationCapabilityNotice.svelte';
	import { TranscriptionSelector } from '$lib/components/settings';
	import ManualDeviceSelector from '$lib/components/settings/selectors/ManualDeviceSelector.svelte';
	import VadDeviceSelector from '$lib/components/settings/selectors/VadDeviceSelector.svelte';
	import {
		IMPORT_ACCEPT,
		IMPORTABLE_AUDIO_EXTENSIONS,
		IMPORTABLE_VIDEO_EXTENSIONS,
		MAX_IMPORT_FILES,
		MAX_IMPORT_FILE_SIZE,
	} from '$lib/constants/import-formats';
	import { whisperingPath } from '$lib/constants/urls';
	import { deleteRecordingsWithConfirmation } from '$lib/operations/delete-recordings';
	import { importFiles } from '$lib/operations/import';
	import { report } from '$lib/report';
	import { getTranscriptionReadiness } from '$lib/settings/transcription-validation';
	import { captureSurface } from '$lib/state/capture-surface.svelte';
	import { getRecordingShortcutLabel } from '$lib/utils/recording-shortcut';
	import { viewTransition } from '$lib/utils/viewTransitions';
	import { getWhisperingApp } from '$lib/whispering/context';
	import studioMicrophone from '$lib/assets/studio-microphone.png';
	import { tauri } from '#platform/tauri';
	import CaptureBehaviorPopover from './_components/CaptureBehaviorPopover.svelte';
	import CapturePipeline from './_components/CapturePipeline.svelte';
	import CapturePipelineDisclosure from './_components/CapturePipelineDisclosure.svelte';
	import CaptureShell from './_components/CaptureShell.svelte';
	import CaptureSurfaceSwitch from './_components/CaptureSurfaceSwitch.svelte';
	import ManualRecordingAction from './_components/ManualRecordingAction.svelte';
	import PolishStatusLink from './_components/PolishStatusLink.svelte';
	import RecordingResult from './_components/RecordingResult.svelte';
	import VadRecordingAction from './_components/VadRecordingAction.svelte';

	// One action, and everything else one press away. The surface switcher and
	// the pipeline both fold into the capture card, so this screen is a single
	// object: a person who has already set Whispering up sees the thing they came
	// to press and nothing competing with it.
	//
	// Setup is not a second layout. When transcription cannot run, the card stays
	// where it is, the action reports the blocker, and the pipeline row opens
	// itself with the fix inline. That keeps first run and every run after it the
	// same screen.
	const app = getWhisperingApp();

	const latestRecording = $derived(app.recordings.sorted[0]);
	const transcriptionReadiness = $derived(getTranscriptionReadiness(app));
	const blocker = $derived(
		transcriptionReadiness.isReady
			? null
			: (transcriptionReadiness.primaryIssue ?? 'Set up transcription first.'),
	);
	const hasActiveShortcut = $derived.by(() => {
		const surface = captureSurface.current(app);
		if (surface === 'import') return false;
		return !!getRecordingShortcutLabel(app, surface);
	});

	const PageError = defineErrors({
		DragDropListenerFailed: ({ cause }: { cause: unknown }) => ({
			message: `Failed to set up drag drop listener: ${extractErrorMessage(cause)}`,
			cause,
		}),
		FileRejected: ({
			fileName,
			reason,
		}: {
			fileName: string;
			reason: string;
		}) => ({
			message: `${fileName}: ${reason}`,
			fileName,
			reason,
		}),
	});

	let unlistenDragDrop: UnlistenFn | undefined;

	onMount(async () => {
		const desktop = tauri;
		if (!desktop) return;
		const { error } = await tryAsync({
			try: async () => {
				const isAudio = async (path: string) =>
					IMPORTABLE_AUDIO_EXTENSIONS.includes(
						(await desktop.fs.extension(
							path,
						)) as (typeof IMPORTABLE_AUDIO_EXTENSIONS)[number],
					);
				const isVideo = async (path: string) =>
					IMPORTABLE_VIDEO_EXTENSIONS.includes(
						(await desktop.fs.extension(
							path,
						)) as (typeof IMPORTABLE_VIDEO_EXTENSIONS)[number],
					);

				unlistenDragDrop = await desktop.fs.onDragDrop(
					async (paths) => {
						const pathResults = await Promise.all(
							paths.map(async (path) => ({
								path,
								isValid: (await isAudio(path)) || (await isVideo(path)),
							})),
						);
						const validPaths = pathResults
							.filter(({ isValid }) => isValid)
							.map(({ path }) => path);

						if (validPaths.length === 0) {
							report.info({
								title: 'No valid files',
								description: 'Please drop audio or video files',
							});
							return;
						}

						const { data: files, error } =
							await desktop.fs.pathsToFiles(validPaths);

						if (error) {
							report.error({ cause: error, title: 'Failed to read files' });
							return;
						}

						if (files.length > 0) {
							await importFiles(app, { files });
						}
					},
				);
			},
			catch: (error) =>
				PageError.DragDropListenerFailed({
					cause: error,
				}),
		});
		if (error) report.error({ cause: error });
	});

	onDestroy(() => {
		unlistenDragDrop?.();
	});
</script>

<svelte:head> <title>Whispering</title> </svelte:head>

{#snippet surfaceSwitch()}
	<CaptureSurfaceSwitch />
{/snippet}

<div
	class="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-start gap-5 px-4 pt-8 pb-24 sm:justify-center sm:py-12"
>
	<SectionHeader.Root class="flex w-full flex-col gap-2">
		<div class="flex items-center gap-2.5">
			<img src={studioMicrophone} alt="" class="size-8" />
			<SectionHeader.Title level={1} class="text-3xl">Whispering</SectionHeader.Title>
		</div>
		<SectionHeader.Description class="text-base">
			Press shortcut, speak, get text. Free and open source.
		</SectionHeader.Description>
	</SectionHeader.Root>

	<DictationCapabilityNotice />

	{#if captureSurface.current(app) === 'manual'}
		<ManualRecordingAction header={surfaceSwitch} {blocker}>
			{#snippet footer()}
				<CapturePipelineDisclosure>
					<CapturePipeline>
						<ManualDeviceSelector
							iconViewTransitionName={viewTransition.pipeline.device}
						/>
						<TranscriptionSelector
							variant="pipeline"
							iconViewTransitionName={viewTransition.pipeline.transcription}
						/>
						<PolishStatusLink />
						<CaptureBehaviorPopover />
					</CapturePipeline>
				</CapturePipelineDisclosure>
			{/snippet}
		</ManualRecordingAction>
	{:else if captureSurface.current(app) === 'vad'}
		<VadRecordingAction header={surfaceSwitch} {blocker}>
			{#snippet footer()}
				<CapturePipelineDisclosure>
					<CapturePipeline>
						<VadDeviceSelector
							iconViewTransitionName={viewTransition.pipeline.device}
						/>
						<TranscriptionSelector
							variant="pipeline"
							iconViewTransitionName={viewTransition.pipeline.transcription}
						/>
						<PolishStatusLink />
						<CaptureBehaviorPopover />
					</CapturePipeline>
				</CapturePipelineDisclosure>
			{/snippet}
		</VadRecordingAction>
	{:else if captureSurface.current(app) === 'import'}
		<CaptureShell header={surfaceSwitch}>
			<div class="px-3 pt-2 pb-3">
				{#if blocker}
					<div
						class="border-border text-muted-foreground flex h-32 w-full items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm sm:h-36"
					>
						{blocker}
					</div>
				{:else}
					<FileDropZone
						accept={IMPORT_ACCEPT}
						maxFiles={MAX_IMPORT_FILES}
						maxFileSize={MAX_IMPORT_FILE_SIZE}
						onUpload={async (files) => {
							if (files.length > 0) {
								await importFiles(app, { files });
							}
						}}
						onFileRejected={({ file, reason }) => {
							report.error({
								cause: PageError.FileRejected({
									fileName: file.name,
									reason,
								}).error,
								title: 'File rejected',
							});
						}}
						class="h-32 w-full sm:h-36"
					/>
				{/if}
			</div>
			{#snippet footer()}
				<CapturePipelineDisclosure>
					<CapturePipeline>
						<TranscriptionSelector
							variant="pipeline"
							iconViewTransitionName={viewTransition.pipeline.transcription}
						/>
						<PolishStatusLink />
					</CapturePipeline>
				</CapturePipelineDisclosure>
			{/snippet}
		</CaptureShell>
	{/if}

	{#if latestRecording}
		<RecordingResult
			recordingId={latestRecording.id}
			audioBlobId={latestRecording.audioBlobId}
			transcript={latestRecording.polishedTranscript ?? latestRecording.transcript}
			rows={1}
			onDelete={() => {
				deleteRecordingsWithConfirmation(app, latestRecording);
			}}
		/>
	{/if}

	{#if captureSurface.current(app) !== 'import'}
		<p class="text-muted-foreground w-full text-sm">
			{#if hasActiveShortcut}
				Your shortcut works
				{tauri ? 'from any app.' : 'while this window is focused.'}
				<Link href={whisperingPath('/settings/shortcuts')}>Configure shortcuts</Link>
			{:else}
				<Link href={whisperingPath('/settings/shortcuts')}>Set a shortcut</Link>
				{tauri ? 'to dictate from any app.' : 'to start recording.'}
			{/if}
		</p>
	{/if}

	{#if !tauri}
		<p class="text-muted-foreground w-full text-sm font-light">
			Tired of switching tabs?
			<Link
				tooltip="Get Whispering for desktop"
				href="https://epicenter.so/whispering"
				target="_blank"
				rel="noopener noreferrer"
			>
				Get the native desktop app
			</Link>
		</p>
	{/if}
</div>
