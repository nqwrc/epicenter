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
	import TranscriptionSetup from './TranscriptionSetup.svelte';

	// One line at rest, the whole pipeline when opened. The screen is looked at
	// least of the surfaces Whispering owns, so the settled pipeline states its
	// result in a sentence and keeps its four controls one press away.
	//
	// An unresolved stage is the exception: it marks itself, opens on mount, and
	// carries the fix inline. That is what replaces the separate setup screen
	// this page used to branch into, so setup and steady state are one layout.
	let {
		children,
	}: {
		/** The pipeline controls, revealed when the row is open. */
		children: Snippet;
	} = $props();

	const app = getWhisperingApp();

	const readiness = $derived(getTranscriptionReadiness(app));
	const polish = $derived(polishStatus(app));

	const summary = $derived.by(() => {
		if (!readiness.isReady) {
			return readiness.primaryIssue ?? 'Transcription needs setup';
		}
		const provider = getSelectedTranscriptionProvider(app);
		const polishLabel =
			polish === 'on'
				? 'polish on'
				: polish === 'needs-key'
					? 'polish needs a key'
					: 'raw output';
		return [provider?.label, polishLabel].filter(Boolean).join(', ');
	});

	// Opened by the person, or forced open by a blocker they have to clear. The
	// override is one-way on purpose: closing a row that still cannot record
	// would hide the only thing standing between them and a transcript.
	let openedByUser = $state(false);
	const open = $derived(openedByUser || !readiness.isReady);
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
			tooltip={open ? 'Hide capture pipeline' : 'Show capture pipeline'}
			aria-label={open ? 'Hide capture pipeline' : 'Show capture pipeline'}
			aria-expanded={open}
			disabled={!readiness.isReady}
			variant="ghost"
			size="icon"
			class="size-7 shrink-0"
			onclick={() => (openedByUser = !openedByUser)}
		>
			<ChevronDownIcon
				class={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
			/>
		</Button>
	</div>

	{#if open}
		{#if !readiness.isReady}
			<TranscriptionSetup />
		{/if}
		{@render children()}
	{/if}
</div>
