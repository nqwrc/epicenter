<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import { cn } from '@epicenter/ui/utils';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { Snippet } from 'svelte';
	import { polishStatus } from '$lib/operations/run-polish';
	import {
		getSelectedTranscriptionProvider,
		getTranscriptionReadiness,
	} from '$lib/settings/transcription-validation';
	import { getWhisperingApp } from '$lib/whispering/context';
	import { capturePipelineDisclosure } from './capture-pipeline-disclosure.svelte';
	import TranscriptionSetup from './TranscriptionSetup.svelte';

	// One line at rest, the whole pipeline when opened. The screen is looked at
	// least of the surfaces Whispering owns, so the settled pipeline states its
	// result in a sentence and keeps its four controls one press away.
	//
	// An unresolved blocker is the exception: it marks the row, opens it, and
	// carries the fix inline instead of the pipeline controls, which would
	// otherwise offer a second way to change the very setting being set up. That
	// is what replaces the separate setup screen this page used to branch into.
	let {
		children,
	}: {
		/** The pipeline controls, revealed when the row is open and usable. */
		children: Snippet;
	} = $props();

	const app = getWhisperingApp();

	const readiness = $derived(getTranscriptionReadiness(app));
	const polish = $derived(polishStatus(app));
	const disclosure = capturePipelineDisclosure;

	const summary = $derived.by(() => {
		// Short and fixed while blocked: the sentence that explains the blocker is
		// the setup panel's to say, and saying it here too would print it twice in
		// one card.
		if (!readiness.isReady) return 'Set up transcription';
		const provider = getSelectedTranscriptionProvider(app);
		const polishLabel =
			polish === 'on'
				? 'polish on'
				: polish === 'needs-key'
					? 'polish needs a key'
					: 'raw output';
		return [provider?.label, polishLabel].filter(Boolean).join(', ');
	});

	$effect(() => {
		if (!readiness.isReady) disclosure.openForBlocker();
	});
</script>

<div class="flex w-full flex-col gap-2">
	<div class="flex w-full items-center gap-2">
		{#if !readiness.isReady}
			<TriangleAlertIcon class="text-warning size-4 shrink-0" />
		{/if}
		<span
			class={cn(
				'min-w-0 flex-1 truncate text-sm',
				readiness.isReady ? 'text-muted-foreground' : 'text-foreground',
			)}
		>
			{summary}
		</span>
		<Button
			tooltip={disclosure.open ? 'Hide capture pipeline' : 'Show capture pipeline'}
			aria-label={disclosure.open
				? 'Hide capture pipeline'
				: 'Show capture pipeline'}
			aria-expanded={disclosure.open}
			variant="ghost"
			size="icon"
			class="size-7 shrink-0"
			onclick={() => disclosure.toggle()}
		>
			<ChevronDownIcon
				class={cn(
					'size-4 transition-transform duration-200',
					disclosure.open && 'rotate-180',
				)}
			/>
		</Button>
	</div>

	{#if disclosure.open}
		{#if readiness.isReady}
			{@render children()}
		{:else}
			<TranscriptionSetup />
		{/if}
	{/if}
</div>
