<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import * as Field from '@epicenter/ui/field';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { report } from '$lib/report';
	import { getWhisperingApp } from '$lib/whispering/context';
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

	/** A selection is a set of checkbox keys; this is the one place it becomes
	 * the shape the builder and the applier both take. */
	function selectionFrom(keys: Set<string>): SettingsBundleSelection {
		return {
			preferences: PREFERENCE_CATEGORIES.filter((key) => keys.has(key)),
			snippets: keys.has('snippets'),
			recipes: keys.has('recipes'),
		};
	}

	// ── Export ──────────────────────────────────────────────────────────────

	const exportItems = $derived([
		...PREFERENCE_CATEGORIES.map((key) => ({
			key: key as string,
			label: PREFERENCE_CATEGORY_LABELS[key],
		})),
		{ key: 'snippets', label: `Snippets (${app.snippets.count})` },
		{ key: 'recipes', label: `Recipes (${app.recipes.count})` },
	]);

	// Everything checked to start: the common case is a full backup.
	let exportSelected = $state(
		new Set<string>([...PREFERENCE_CATEGORIES, 'snippets', 'recipes']),
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

<svelte:head> <title>Import & Export - Whispering</title> </svelte:head>

<Field.Set>
	<Field.Legend>Import & Export</Field.Legend>
	<Field.Description>
		Move your preferences, Snippets, and Recipes between installs as one file.
	</Field.Description>
	<Field.Separator />
	<Field.Group>
		<Field.Set>
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
			</Field.Group>
		</Field.Set>

		<Field.Set>
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
	</Field.Group>
</Field.Set>
