<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import { Card } from '@epicenter/ui/card';
	import { confirmationDialog } from '@epicenter/ui/confirmation-dialog';
	import { Input } from '@epicenter/ui/input';
	import { Label } from '@epicenter/ui/label';
	import * as Modal from '@epicenter/ui/modal';
	import * as SectionHeader from '@epicenter/ui/section-header';
	import { Textarea } from '@epicenter/ui/textarea';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash';
	import { report } from '$lib/report';
	import { generateDefaultSnippet } from '$lib/state/snippets.svelte';
	import type { Snippet } from '$lib/workspace';
	import { getWhisperingApp } from '$lib/whispering/context';

	const app = getWhisperingApp();

	let editorOpen = $state(false);
	let isEditing = $state(false);
	// The snippet being created or edited. A page-owned copy so edits never touch
	// the live row until Save.
	let working = $state<Snippet>(generateDefaultSnippet());

	// A warning only; another row sharing this trigger never blocks saving.
	const duplicateTrigger = $derived.by(() => {
		const trigger = working.trigger.trim().toLowerCase();
		if (!trigger) return false;
		return app.snippets.all.some(
			(snippet) =>
				snippet.id !== working.id &&
				snippet.trigger.trim().toLowerCase() === trigger,
		);
	});

	function openNew() {
		working = generateDefaultSnippet();
		isEditing = false;
		editorOpen = true;
	}

	function openEdit(snippet: Snippet) {
		working = { ...snippet };
		isEditing = true;
		editorOpen = true;
	}

	async function save() {
		const trigger = working.trigger.trim();
		const replacement = working.replacement.trim();
		if (!trigger) {
			report.info({
				title: 'Name your trigger',
				description: 'The phrase you will say, like "my address".',
			});
			return;
		}
		if (!replacement) {
			report.info({
				title: 'Add a replacement',
				description: 'The text to deliver when you say the trigger.',
			});
			return;
		}
		await app.snippets.set({ ...$state.snapshot(working), trigger, replacement });
		editorOpen = false;
		report.success({ title: isEditing ? 'Snippet updated' : 'Snippet created' });
	}

	function remove(snippet: Snippet) {
		confirmationDialog.open({
			title: `Delete ${snippet.trigger}?`,
			description: 'This removes the snippet everywhere. It cannot be undone.',
			confirm: { text: 'Delete', variant: 'destructive' },
			onConfirm: async () => {
				await app.snippets.delete(snippet.id);
				report.success({ title: 'Snippet deleted' });
			},
		});
	}
</script>

<svelte:head> <title>Snippets</title> </svelte:head>

<main class="flex w-full flex-1 flex-col gap-2 px-4 py-4 sm:px-8 mx-auto">
	<SectionHeader.Root>
		<SectionHeader.Title
			level={1}
			class="scroll-m-20 text-4xl tracking-tight lg:text-5xl"
		>
			Snippets
		</SectionHeader.Title>
		<SectionHeader.Description>
			Say a short phrase and deliver saved text. Expansion happens after
			Polish and is exact, so a snippet arrives word for word.
		</SectionHeader.Description>
	</SectionHeader.Root>

	<Card class="flex flex-col gap-4 p-6">
		<div class="flex items-center justify-between gap-2">
			<h2 class="text-lg font-semibold">Your library</h2>
			<Button variant="outline" onclick={openNew}>
				<PlusIcon class="size-4" /> New snippet
			</Button>
		</div>

		{#if app.snippets.count === 0}
			<p class="text-muted-foreground text-sm">
				No snippets yet. Add one to speak a phrase and deliver saved text.
			</p>
		{:else}
			<ul class="flex flex-col divide-y">
				{#each app.snippets.all as snippet (snippet.id)}
					<li class="flex items-start justify-between gap-4 py-3">
						<div class="min-w-0 flex-1">
							<span class="font-medium">{snippet.trigger}</span>
							<p class="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
								{snippet.replacement}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-1">
							<Button
								tooltip="Edit snippet"
								variant="ghost"
								size="icon"
								onclick={() => openEdit(snippet)}
							>
								<PencilIcon class="size-4" />
							</Button>
							<Button
								tooltip="Delete snippet"
								variant="ghost"
								size="icon"
								onclick={() => remove(snippet)}
							>
								<TrashIcon class="size-4" />
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>
</main>

<Modal.Root bind:open={editorOpen}>
	<Modal.Content>
		<Modal.Header>
			<Modal.Title>{isEditing ? 'Edit snippet' : 'New snippet'}</Modal.Title>
			<Modal.Description>
				A trigger phrase and the text it delivers. Expansion is exact, so the
				replacement arrives word for word.
			</Modal.Description>
		</Modal.Header>
		<div class="space-y-4 p-4">
			<div class="grid gap-2">
				<Label for="snippet-trigger">Trigger phrase</Label>
				<Input
					id="snippet-trigger"
					placeholder="e.g. my address"
					bind:value={working.trigger}
				/>
				{#if duplicateTrigger}
					<p class="text-destructive text-sm">
						Two snippets share this trigger. The one saved first wins.
					</p>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for="snippet-replacement">Replacement</Label>
				<Textarea
					id="snippet-replacement"
					placeholder="123 Main St, Springfield"
					rows={4}
					bind:value={working.replacement}
				/>
			</div>
		</div>
		<Modal.Footer>
			<Button variant="outline" onclick={() => (editorOpen = false)}>Cancel</Button>
			<Button onclick={save}>{isEditing ? 'Save' : 'Create'}</Button>
		</Modal.Footer>
	</Modal.Content>
</Modal.Root>
