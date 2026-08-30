<script lang="ts">
	import type { Snippet } from 'svelte';
	import { viewTransition } from '$lib/utils/viewTransitions';
	import { createVadRecordingController } from './vad-recording-controller.svelte';
	import RecordingActionCard from './RecordingActionCard.svelte';
	import { getWhisperingApp } from '$lib/whispering/context';

	const app = getWhisperingApp();

	let {
		header,
		footer,
		blocker = null,
	}: {
		header?: Snippet;
		footer: Snippet;
		blocker?: string | null;
	} = $props();

	const rec = createVadRecordingController(app);
</script>

<RecordingActionCard
	controller={rec}
	{header}
	{footer}
	{blocker}
	iconViewTransitionName={viewTransition.recordingMode('vad')}
/>
