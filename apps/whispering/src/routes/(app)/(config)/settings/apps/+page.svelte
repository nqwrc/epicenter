<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import { Card } from '@epicenter/ui/card';
	import { confirmationDialog } from '@epicenter/ui/confirmation-dialog';
	import { Input } from '@epicenter/ui/input';
	import { Label } from '@epicenter/ui/label';
	import * as Modal from '@epicenter/ui/modal';
	import * as SectionHeader from '@epicenter/ui/section-header';
	import * as Select from '@epicenter/ui/select';
	import { Switch } from '@epicenter/ui/switch';
	import { Textarea } from '@epicenter/ui/textarea';
	import CrosshairIcon from '@lucide/svelte/icons/crosshair';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash';
	import { os } from '#platform/os';
	import { report } from '$lib/report';
	import { services } from '$lib/services';
	import { generateDefaultAppRule } from '$lib/state/app-rules.svelte';
	import type { AppRule } from '$lib/workspace';
	import { getWhisperingApp } from '$lib/whispering/context';

	const app = getWhisperingApp();

	let editorOpen = $state(false);
	let isEditing = $state(false);
	// The rule being created or edited. A page-owned mutable copy so edits
	// never touch the live row until Save.
	type EditableAppRule = { -readonly [K in keyof AppRule]: AppRule[K] };
	let working = $state<EditableAppRule>(generateDefaultAppRule());

	// This device's identifier field: the one "Use current app" can fill and
	// the one shown first. The other platform's field stays editable so a rule
	// authored here still matches on the other machine (ADR-0233).
	const thisPlatformIsMac = os.isApple;

	// A duplicate identifier blocks saving: matching is exact, so two enabled
	// rules naming the same app would race on row id, and "first" should never
	// decide a real match.
	const duplicateIdentifier = $derived.by(() => {
		const exe = working.matchWindowsExe?.trim().toLowerCase() || null;
		const bundle = working.matchMacosBundleId?.trim().toLowerCase() || null;
		return app.appRules.all.some(
			(rule) =>
				rule.id !== working.id &&
				((exe !== null && rule.matchWindowsExe?.trim().toLowerCase() === exe) ||
					(bundle !== null &&
						rule.matchMacosBundleId?.trim().toLowerCase() === bundle)),
		);
	});

	const recipeName = $derived.by(() => {
		if (working.recipeId === null) return 'None (Polish only)';
		const recipe = app.recipes.pickable.find(
			(candidate) => candidate.id === working.recipeId,
		);
		return recipe?.name ?? 'Missing recipe';
	});

	function openNew() {
		working = generateDefaultAppRule();
		isEditing = false;
		editorOpen = true;
	}

	function openEdit(rule: AppRule) {
		working = { ...rule };
		isEditing = true;
		editorOpen = true;
	}

	// "Use current app": a short countdown so the person can focus the target
	// window, then one foreground probe fills this platform's identifier and,
	// when the name is still blank, the display name.
	let captureCountdown = $state(0);
	let captureTimer: ReturnType<typeof setInterval> | undefined;

	function useCurrentApp() {
		if (captureTimer !== undefined) return;
		captureCountdown = 3;
		captureTimer = setInterval(async () => {
			captureCountdown -= 1;
			if (captureCountdown > 0) return;
			clearInterval(captureTimer);
			captureTimer = undefined;
			const { appId, appName } = await services.context.getForegroundContext();
			if (appId === null) {
				report.info({
					title: "Couldn't identify the app",
					description:
						'The system refused to name the foreground app. Type its identifier instead.',
				});
				return;
			}
			if (thisPlatformIsMac) {
				working.matchMacosBundleId = appId;
			} else {
				working.matchWindowsExe = appId;
			}
			if (!working.name.trim() && appName) working.name = appName;
		}, 1000);
	}

	async function save() {
		const name = working.name.trim();
		const exe = working.matchWindowsExe?.trim().toLowerCase() || null;
		const bundle = working.matchMacosBundleId?.trim() || null;
		if (!name) {
			report.info({
				title: 'Name the rule',
				description: 'What you call the app, like "Terminal".',
			});
			return;
		}
		if (exe === null && bundle === null) {
			report.info({
				title: 'Identify the app',
				description:
					'Add at least one identifier: a Windows exe name or a macOS bundle id.',
			});
			return;
		}
		if (duplicateIdentifier) {
			report.info({
				title: 'Another rule already matches this app',
				description: 'Edit that rule instead of adding a second one.',
			});
			return;
		}
		await app.appRules.set({
			...$state.snapshot(working),
			name,
			matchWindowsExe: exe,
			matchMacosBundleId: bundle,
			polishInstructions: working.polishInstructions?.trim() || null,
		});
		editorOpen = false;
		report.success({ title: isEditing ? 'Rule updated' : 'Rule created' });
	}

	function remove(rule: AppRule) {
		confirmationDialog.open({
			title: `Delete ${rule.name}?`,
			description: 'This removes the rule everywhere. It cannot be undone.',
			confirm: { text: 'Delete', variant: 'destructive' },
			onConfirm: async () => {
				await app.appRules.delete(rule.id);
				report.success({ title: 'Rule deleted' });
			},
		});
	}

	function describeMatch(rule: AppRule): string {
		return [rule.matchWindowsExe, rule.matchMacosBundleId]
			.filter(Boolean)
			.join(' · ');
	}
</script>

<svelte:head> <title>App rules - Whispering</title> </svelte:head>

<main class="flex w-full flex-1 flex-col gap-2">
	<SectionHeader.Root>
		<SectionHeader.Title level={1}>App rules</SectionHeader.Title>
		<SectionHeader.Description>
			Shape dictation per app: when you start dictating with a matched app in
			front, the rule can replace the Polish directive and auto-run a recipe.
			A per-app directive still goes to the Text destination configured on
			Privacy &amp; Processing.
		</SectionHeader.Description>
	</SectionHeader.Root>

	<Card class="flex flex-col gap-4 p-6">
		<div class="flex items-center justify-between gap-2">
			<h2 class="text-lg font-semibold">Your rules</h2>
			<Button variant="outline" onclick={openNew}>
				<PlusIcon class="size-4" /> New rule
			</Button>
		</div>

		{#if app.appRules.count === 0}
			<p class="text-muted-foreground text-sm">
				No rules yet. Add one to give an app its own dictation behavior, like
				plain unpunctuated text in a terminal or a formal tone in email.
			</p>
		{:else}
			<ul class="flex flex-col divide-y">
				{#each app.appRules.all as rule (rule.id)}
					<li class="flex items-start justify-between gap-4 py-3">
						<div class="min-w-0 flex-1">
							<span class="font-medium" class:opacity-50={!rule.enabled}>
								{rule.name}
							</span>
							<p class="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
								{describeMatch(rule)}
								{#if !rule.enabled}
									· disabled
								{/if}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-1">
							<Button
								tooltip="Edit rule"
								variant="ghost"
								size="icon"
								onclick={() => openEdit(rule)}
							>
								<PencilIcon class="size-4" />
							</Button>
							<Button
								tooltip="Delete rule"
								variant="ghost"
								size="icon"
								onclick={() => remove(rule)}
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
			<Modal.Title>{isEditing ? 'Edit rule' : 'New rule'}</Modal.Title>
			<Modal.Description>
				Matched against the app in front when you start dictating.
			</Modal.Description>
		</Modal.Header>
		<div class="space-y-4 p-4">
			<div class="grid gap-2">
				<Label for="rule-name">Name</Label>
				<Input id="rule-name" placeholder="e.g. Terminal" bind:value={working.name} />
			</div>
			<div class="grid gap-2">
				<div class="flex items-center justify-between">
					<Label for={thisPlatformIsMac ? 'rule-bundle' : 'rule-exe'}>
						{thisPlatformIsMac ? 'macOS bundle id' : 'Windows app (exe name)'}
					</Label>
					<Button variant="ghost" size="sm" onclick={useCurrentApp}>
						<CrosshairIcon class="size-4" />
						{captureCountdown > 0
							? `Switch to the app… ${captureCountdown}`
							: 'Use current app'}
					</Button>
				</div>
				{#if thisPlatformIsMac}
					<Input
						id="rule-bundle"
						placeholder="com.googlecode.iterm2"
						bind:value={
							() => working.matchMacosBundleId ?? '',
							(value) => (working.matchMacosBundleId = value || null)
						}
					/>
				{:else}
					<Input
						id="rule-exe"
						placeholder="wt.exe"
						bind:value={
							() => working.matchWindowsExe ?? '',
							(value) => (working.matchWindowsExe = value || null)
						}
					/>
				{/if}
				{#if duplicateIdentifier}
					<p class="text-destructive text-sm">
						Another rule already matches this app.
					</p>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for={thisPlatformIsMac ? 'rule-exe' : 'rule-bundle'}>
					{thisPlatformIsMac
						? 'Windows app (exe name, optional)'
						: 'macOS bundle id (optional)'}
				</Label>
				{#if thisPlatformIsMac}
					<Input
						id="rule-exe"
						placeholder="wt.exe"
						bind:value={
							() => working.matchWindowsExe ?? '',
							(value) => (working.matchWindowsExe = value || null)
						}
					/>
				{:else}
					<Input
						id="rule-bundle"
						placeholder="com.googlecode.iterm2"
						bind:value={
							() => working.matchMacosBundleId ?? '',
							(value) => (working.matchMacosBundleId = value || null)
						}
					/>
				{/if}
				<p class="text-muted-foreground text-xs">
					One rule can carry both identifiers, so it also works on your other
					devices.
				</p>
			</div>
			<div class="grid gap-2">
				<Label for="rule-polish">Polish directive (optional)</Label>
				<Textarea
					id="rule-polish"
					placeholder="e.g. No punctuation, all lowercase, keep technical terms exactly as spoken."
					rows={3}
					bind:value={
						() => working.polishInstructions ?? '',
						(value) => (working.polishInstructions = value || null)
					}
				/>
				<p class="text-muted-foreground text-xs">
					Replaces your global Polish directive while dictating into this app.
				</p>
			</div>
			<div class="grid gap-2">
				<Label for="rule-recipe">Auto-run recipe (optional)</Label>
				<Select.Root
					type="single"
					bind:value={
						() => working.recipeId ?? 'none',
						(value) => (working.recipeId = value === 'none' ? null : value)
					}
				>
					<Select.Trigger id="rule-recipe" class="w-full">
						{recipeName}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="none" label="None (Polish only)" />
						{#each app.recipes.pickable as recipe (recipe.id)}
							<Select.Item value={recipe.id} label={recipe.name} />
						{/each}
					</Select.Content>
				</Select.Root>
				<p class="text-muted-foreground text-xs">
					Runs after Polish on every dictation into this app: a second AI call,
					so delivery takes a little longer.
				</p>
			</div>
			<div class="flex items-center justify-between">
				<Label for="rule-enabled">Enabled</Label>
				<Switch id="rule-enabled" bind:checked={working.enabled} />
			</div>
		</div>
		<Modal.Footer>
			<Button variant="outline" onclick={() => (editorOpen = false)}>Cancel</Button>
			<Button onclick={save}>{isEditing ? 'Save' : 'Create'}</Button>
		</Modal.Footer>
	</Modal.Content>
</Modal.Root>
