<!--
	Account and data: who you are signed in as, what leaves this machine, and the
	files that carry your setup to another one. It absorbed the old Import &
	Export and Analytics pages, which were the same subject split across three
	menu entries.
-->
<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import * as Field from '@epicenter/ui/field';
	import { Link } from '@epicenter/ui/link';
	import { toastOnError } from '@epicenter/ui/sonner';
	import { Spinner } from '@epicenter/ui/spinner';
	import { createMutation } from '@tanstack/svelte-query';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import LogOut from '@lucide/svelte/icons/log-out';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { resultMutationOptions } from 'wellcrafted/query';
	import { auth } from '#platform/auth';
	import { tauri } from '#platform/tauri';
	import { SettingSwitch } from '$lib/components/settings';
	import { logAnalyticsEvent } from '$lib/operations/analytics';
	import { report } from '$lib/report';
	import { recordingActive } from '$lib/state/recording-active.svelte';
	import { getWhisperingApp } from '$lib/whispering/context';
	import { exportRecordingsMarkdown } from '$lib/whispering/recordings-markdown-export';
	import { exportSettingsBundle } from '$lib/whispering/settings-bundle-export';
	import {
		applySettingsBundle,
		availableCategoriesIn,
		parseSettingsBundle,
	} from '$lib/whispering/settings-bundle-import';
	import type {
		SettingsBundleFile,
		SettingsBundleSelection,
	} from '$lib/whispering/settings-bundle-types';
	import {
		PREFERENCE_CATEGORIES,
		PREFERENCE_CATEGORY_LABELS,
	} from '$lib/whispering/settings-categories';
	import CategoryCheckboxList from './CategoryCheckboxList.svelte';

	const app = getWhisperingApp();

	// ── Account ─────────────────────────────────────────────────────────────

	// Identity (email) is shown by the footer AccountPopover, which owns the
	// /api/session query. This page is for the sign in / sign out actions, so it
	// reads auth.state directly and does not re-fetch the profile.
	const isSignedIn = $derived(auth.state.status === 'signed-in');

	// Sign in/out reloads the page (Option A) and a reload kills an in-flight
	// browser recording, so block account changes while a capture is active.
	const accountLocked = $derived(recordingActive.current);

	const startSignIn = createMutation(() =>
		resultMutationOptions({
			mutationKey: ['account', 'startSignIn'],
			mutationFn: () => auth.startSignIn(),
		}),
	);

	const signOut = createMutation(() =>
		resultMutationOptions({
			mutationKey: ['account', 'signOut'],
			mutationFn: () => auth.signOut(),
			onError: (error) => toastOnError(error, 'Failed to sign out'),
		}),
	);

	// ── Export ──────────────────────────────────────────────────────────────

	/** A selection is a set of checkbox keys; this is the one place it becomes
	 * the shape the builder and the applier both take. */
	function selectionFrom(keys: Set<string>): SettingsBundleSelection {
		return {
			preferences: PREFERENCE_CATEGORIES.filter((key) => keys.has(key)),
			snippets: keys.has('snippets'),
			recipes: keys.has('recipes'),
			appRules: keys.has('appRules'),
		};
	}

	const exportItems = $derived([
		...PREFERENCE_CATEGORIES.map((key) => ({
			key: key as string,
			label: PREFERENCE_CATEGORY_LABELS[key],
		})),
		{ key: 'snippets', label: `Snippets (${app.snippets.count})` },
		{ key: 'recipes', label: `Recipes (${app.recipes.count})` },
		{ key: 'appRules', label: `App rules (${app.appRules.count})` },
	]);

	// Everything checked to start: the common case is a full backup.
	let exportSelected = $state(
		new Set<string>([...PREFERENCE_CATEGORIES, 'snippets', 'recipes', 'appRules']),
	);

	async function handleExport() {
		const { data, error } = await exportSettingsBundle(
			app,
			selectionFrom(exportSelected),
		);
		if (error) {
			report.error({ title: 'Export failed', cause: error });
			return;
		}
		if (data.categoryCount === 0) {
			report.info({
				title: 'Nothing to export',
				description: 'Check at least one category first.',
			});
			return;
		}
		report.success({
			title: `Exported ${data.categoryCount} ${data.categoryCount === 1 ? 'category' : 'categories'}`,
		});
	}

	// Audio is not part of the settings bundle: it is large, and it moves as its
	// own zip of Markdown files rather than inside a file meant to configure a
	// fresh install.
	const exportRecordings = createMutation(() =>
		resultMutationOptions({
			mutationKey: ['recordings', 'export'],
			mutationFn: () => exportRecordingsMarkdown(app),
		}),
	);

	// ── Import ──────────────────────────────────────────────────────────────

	let importInput = $state<HTMLInputElement>();
	let importFile = $state.raw<SettingsBundleFile | null>(null);
	let importProblem = $state<string | null>(null);
	let importSelected = $state(new Set<string>());

	const importItems = $derived.by(() => {
		if (!importFile) return [];
		const available = availableCategoriesIn(importFile);
		return [
			...available.preferences.map((key) => ({
				key: key as string,
				label: PREFERENCE_CATEGORY_LABELS[key],
			})),
			...(available.snippets
				? [
						{
							key: 'snippets',
							label: `Snippets (${importFile.snippets?.length ?? 0})`,
						},
					]
				: []),
			...(available.recipes
				? [
						{
							key: 'recipes',
							label: `Recipes (${importFile.recipes?.length ?? 0})`,
						},
					]
				: []),
			...(available.appRules
				? [
						{
							key: 'appRules',
							label: `App rules (${importFile.appRules?.length ?? 0})`,
						},
					]
				: []),
		];
	});

	async function onImportFileChosen(
		event: Event & { currentTarget: HTMLInputElement },
	) {
		const [file] = Array.from(event.currentTarget.files ?? []);
		// Reset so picking the same file again still fires `change`.
		event.currentTarget.value = '';
		if (!file) return;

		const { data, error } = parseSettingsBundle(await file.text());
		if (error) {
			importFile = null;
			importSelected = new Set();
			importProblem =
				error.type === 'NotJson'
					? 'That file is not valid JSON.'
					: error.type === 'NotAnObject'
						? 'Expected a settings file, not a bare value or list.'
						: 'This is not a settings file Whispering recognizes.';
			return;
		}

		importFile = data;
		importProblem = null;
		const available = availableCategoriesIn(data);
		importSelected = new Set<string>([
			...available.preferences,
			...(available.snippets ? ['snippets'] : []),
			...(available.recipes ? ['recipes'] : []),
			...(available.appRules ? ['appRules'] : []),
		]);
	}

	function handleApplyImport() {
		if (!importFile) return;
		const summary = applySettingsBundle(
			app,
			importFile,
			selectionFrom(importSelected),
		);
		const applied = summary.appliedPreferenceCategories.length;
		const details = [
			summary.snippets &&
				`${summary.snippets.created} snippet${summary.snippets.created === 1 ? '' : 's'} added`,
			summary.recipes &&
				`${summary.recipes.created} recipe${summary.recipes.created === 1 ? '' : 's'} added`,
			summary.appRules &&
				`${summary.appRules.created} app rule${summary.appRules.created === 1 ? '' : 's'} added`,
			summary.skippedFields > 0 &&
				`${summary.skippedFields} unreadable ${summary.skippedFields === 1 ? 'value' : 'values'} skipped`,
		].filter((part): part is string => Boolean(part));

		report.success({
			title: `Imported ${applied} settings ${applied === 1 ? 'category' : 'categories'}`,
			description: details.length > 0 ? details.join(', ') : undefined,
		});
		importFile = null;
		importSelected = new Set();
	}
</script>

<svelte:head> <title>Account & Data - Whispering</title> </svelte:head>

<Field.Set>
	<Field.Legend>Account &amp; data</Field.Legend>
	<Field.Description>
		Who you are signed in as, what moves between installs, and what leaves this
		machine.
	</Field.Description>
	<Field.Separator />
	<Field.Group>
		<Field.Set id="account" class="scroll-mt-20">
			<Field.Legend variant="label">Account</Field.Legend>
			<Field.Description>
				Sign in to your Epicenter account. Whispering works fully offline
				without one; your account is what device sync will use.
			</Field.Description>
			<Field.Group>
				{#if accountLocked}
					<Field.Description class="text-muted-foreground">
						Stop recording to change your account.
					</Field.Description>
				{/if}
				{#if isSignedIn}
					<Field.Field orientation="horizontal">
						<Field.Content>
							<Field.Label>Signed in</Field.Label>
							<Field.Description>
								Your Epicenter account is connected on this device.
							</Field.Description>
						</Field.Content>
						<Button
							variant="outline"
							onclick={() => signOut.mutate()}
							disabled={signOut.isPending || accountLocked}
						>
							{#if signOut.isPending}
								<Spinner class="size-4" />
							{:else}
								<LogOut class="size-4" />
							{/if}
							Sign out
						</Button>
					</Field.Field>
				{:else}
					<Field.Field>
						{#if startSignIn.error}
							<Field.Description class="text-destructive">
								{startSignIn.error.message}
							</Field.Description>
						{/if}
						<Button
							class="w-full sm:w-auto sm:self-start"
							onclick={() => startSignIn.mutate()}
							disabled={startSignIn.isPending || accountLocked}
						>
							{#if startSignIn.isPending}
								<Spinner class="size-4" />
								Signing in...
							{:else if auth.state.status === 'reauth-required'}
								Reconnect
							{:else}
								Sign in with Epicenter
							{/if}
						</Button>
					</Field.Field>
				{/if}

				<Field.Field>
					<Field.Label>Sync</Field.Label>
					<Field.Description>
						{#if tauri}
							On the desktop, your recordings and settings stay on this computer
							for now; signing in powers hosted transcription. Use Whispering in
							the browser to sync them across devices.
						{:else}
							While signed in, your recordings, transcripts, and settings sync
							across your devices. Audio files stay on the device that recorded
							them. Live sync status shows in the account menu in the sidebar.
						{/if}
					</Field.Description>
				</Field.Field>
			</Field.Group>
		</Field.Set>

		<Field.Separator />

		<Field.Set id="data" class="scroll-mt-20">
			<Field.Legend variant="label">Export</Field.Legend>
			<Field.Description>
				Pick what to include, then save it as one file.
			</Field.Description>
			<Field.Group>
				<CategoryCheckboxList
					idPrefix="export"
					items={exportItems}
					bind:selected={exportSelected}
				/>
				<div class="flex">
					<Button onclick={handleExport} disabled={exportSelected.size === 0}>
						<DownloadIcon class="size-4" />
						Export selected
					</Button>
				</div>

				<Field.Field>
					<Field.Label>Export recordings</Field.Label>
					<Button
						variant="outline"
						class="w-fit"
						onclick={() => {
							exportRecordings.mutate(undefined, {
								onSuccess: (data) => {
									if (data.written === 0) {
										report.info({
											title: 'Nothing to export',
											description: 'You have no recordings yet.',
										});
										return;
									}
									report.success({
										title: 'Recordings exported',
										description: `Saved ${data.written} ${data.written === 1 ? 'recording' : 'recordings'} as a zip file.`,
									});
								},
								onError: (error) => {
									// Cancelling the Save dialog is not a failure.
									if (error.name === 'SaveCancelled') return;
									report.error({
										title: 'Export failed',
										cause: error,
									});
								},
							});
						}}
						disabled={exportRecordings.isPending}
					>
						{exportRecordings.isPending
							? 'Exporting...'
							: 'Export recordings (.zip)'}
					</Button>
					<Field.Description>
						Download every recording as a zip of Markdown files. This is a
						snapshot: later edits in Whispering do not change the downloaded
						file.
					</Field.Description>
				</Field.Field>
			</Field.Group>
		</Field.Set>

		<Field.Separator />

		<Field.Set id="import" class="scroll-mt-20">
			<Field.Legend variant="label">Import</Field.Legend>
			<Field.Description>
				Checked preferences replace your current values. Snippets and Recipes
				are added alongside what you already have, never overwriting a trigger
				or a name you are using.
			</Field.Description>
			<Field.Group>
				<input
					bind:this={importInput}
					type="file"
					accept="application/json,.json"
					class="hidden"
					onchange={onImportFileChosen}
				/>
				<div class="flex">
					<Button variant="outline" onclick={() => importInput?.click()}>
						<UploadIcon class="size-4" />
						Choose file
					</Button>
				</div>

				{#if importProblem}
					<p class="text-destructive text-sm">{importProblem}</p>
				{/if}

				{#if importFile}
					<CategoryCheckboxList
						idPrefix="import"
						items={importItems}
						bind:selected={importSelected}
					/>
					<div class="flex">
						<Button
							onclick={handleApplyImport}
							disabled={importSelected.size === 0}
						>
							Apply import
						</Button>
					</div>
				{/if}
			</Field.Group>
		</Field.Set>

		<Field.Separator />

		<Field.Set id="analytics" class="scroll-mt-20">
			<Field.Legend variant="label">Analytics</Field.Legend>
			<Field.Description>
				Off unless you turn it on. With it on, Whispering logs anonymized
				events so we can see which features are used most, and the switch is
				the whole of it: off means nothing is sent.
			</Field.Description>
			<Field.Group>
				<SettingSwitch
					key="analyticsEnabled"
					label="Share anonymized events"
					description={'We log simple events like "recording started" or "transcription completed". No personal data is attached to any of these events.'}
					onCheckedChange={(checked) => {
						// Log the change (only actually sends if analytics is now enabled).
						if (checked) {
							void logAnalyticsEvent(app, {
								type: 'settings_changed',
								section: 'analytics',
							});
						}
					}}
				/>

				<div class="grid gap-x-8 gap-y-4 sm:grid-cols-2">
					<div class="space-y-1.5">
						<p class="text-sm font-medium">Events we log</p>
						<ul class="text-muted-foreground space-y-1 text-sm leading-relaxed">
							<li>Button clicks (which features you use)</li>
							<li>Completion times (how long things take)</li>
							<li>Error messages (when something fails)</li>
						</ul>
					</div>
					<div class="space-y-1.5">
						<p class="text-sm font-medium">Never collected</p>
						<ul class="text-muted-foreground space-y-1 text-sm leading-relaxed">
							<li>Your actual transcriptions or recordings</li>
							<li>Device IDs or user identifiers</li>
							<li>API keys or any personal data</li>
						</ul>
					</div>
				</div>

				<Field.Description>
					All analytics code is open source and auditable:
					<Link
						href="https://github.com/EpicenterHQ/epicenter/blob/main/apps/whispering/src/lib/services/analytics/types.ts"
						target="_blank"
						rel="noopener noreferrer"
					>
						event definitions
					</Link>,
					<Link
						href="https://github.com/search?q=repo%3AEpicenterHQ%2Fepicenter+logEvent&type=code"
						target="_blank"
						rel="noopener noreferrer"
					>
						where events are logged
					</Link>, and
					<Link
						href="https://github.com/aptabase"
						target="_blank"
						rel="noopener noreferrer"
					>
						Aptabase
					</Link>, the service that receives them.
				</Field.Description>
			</Field.Group>
		</Field.Set>
	</Field.Group>
</Field.Set>
