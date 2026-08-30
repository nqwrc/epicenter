<script lang="ts">
	import type { Snippet } from 'svelte';
	import { viewTransition } from '$lib/utils/viewTransitions';
	import { createManualRecordingController } from './manual-recording-controller.svelte';
	import RecordingActionCard from './RecordingActionCard.svelte';
	import { getWhisperingApp } from '$lib/whispering/context';

	const app = getWhisperingApp();

	let {
		header,
		footer,
		blocked = false,
	}: {
		header?: Snippet;
		footer: Snippet;
		blocked?: boolean;
	} = $props();

	const rec = createManualRecordingController(app);
</script>

<RecordingActionCard
	controller={rec}
	{header}
	{footer}
	{blocked}
	iconViewTransitionName={viewTransition.recordingMode('manual')}
/>
