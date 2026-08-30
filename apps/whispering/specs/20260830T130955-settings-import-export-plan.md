# Settings Import and Export Implementation Plan

**Status**: Draft

**Goal:** One "Import & Export" settings page where every preference category,
Snippets, and Recipes can be selected by checkbox and exported to, or imported
from, a single JSON file.

**Architecture:** A hand-written, test-enforced map groups every
`settingsKv` key into named categories mirroring the existing Settings
sub-pages. A pure builder shapes a bundle from whichever categories are
checked; a pure applier writes a parsed bundle's checked-and-present
categories back, overwriting kv values and dedupe-appending Snippets/Recipes
rows. One page drives both directions with the same checkbox-list component.

**Tech Stack:** TypeScript, Svelte 5 runes, `bun test`.

**Spec:** `apps/whispering/specs/20260830T130918-settings-import-export.md`

**Cross-plan dependency:** the "Recording" category includes the recording
overlay's four position keys
(`apps/whispering/specs/20260830T130332-repositionable-recording-pill-plan.md`,
Task 2). Recommended order is that plan's Task 2 before this plan's Task 1.
If this plan lands first, omit `recordingOverlayXAnchor`,
`recordingOverlayXMarginPx`, `recordingOverlayYAnchor`, and
`recordingOverlayYMarginPx` from `PREFERENCE_CATEGORY_KEYS.recording` in Task
1 below; the other plan's Task 2 is then responsible for adding them, a
one-line addition. If it forgets, Task 1's own completeness test starts
failing the moment those keys exist in `settingsKv` uncategorized, which is
the guard doing exactly what it is for.

## Global constraints

- Package manager is `bun`. Never `npm`, `yarn`, `pnpm`, or `npx`.
- Run every command from the repo root. Do not `cd` into an app.
- Stage specific files. Never `git add .` or `git add -A`.
- Conventional commits. No AI or tool attribution in commit messages.
- No direct `console.*` in library code. Use `wellcrafted/logger`.
- No em dash (`U+2014`) or en dash (`U+2013`) in code, comments, JSDoc, UI copy,
  or commit messages. Use a colon, comma, semicolon, or a sentence break.
- Bundle format version: `1`. File name on export: `whispering-settings.json`.
- Recipe import instructions cap: **10,000** characters (recipes are prompts,
  naturally longer than a Snippet's 2,000-character replacement cap).

Tests: `bun run --filter '@epicenter/whispering' test`
Typecheck: `bun run --filter '@epicenter/whispering' typecheck`

---

## File structure

| File | Responsibility |
| --- | --- |
| `apps/whispering/src/lib/whispering/settings-categories.ts` | The category map and the completeness test |
| `apps/whispering/src/lib/whispering/recipes.svelte.ts` | Gains `.all`, mirroring `WhisperingSnippets.all` |
| `apps/whispering/src/lib/whispering/snippets-import.ts` | Gains `validateSnippetsArray`, extracted from `parseSnippetsImport` |
| `apps/whispering/src/lib/whispering/recipes-import.ts` | New: recipes' validate/dedupe pair, mirroring snippets-import.ts |
| `apps/whispering/src/lib/whispering/settings-bundle-types.ts` | The file shape both directions share |
| `apps/whispering/src/lib/whispering/settings-bundle-export.ts` | Pure builder + the download wrapper |
| `apps/whispering/src/lib/whispering/settings-bundle-import.ts` | Parse, inspect, apply |
| `apps/whispering/src/lib/components/settings/CategoryCheckboxList.svelte` | Shared list, used for both export and import selection |
| `apps/whispering/src/routes/(app)/(config)/settings/data/+page.svelte` | The page |
| `apps/whispering/src/routes/(app)/(config)/settings/SidebarNav.svelte` | The nav entry |

Task order is dependency order. Task 1 is independent. Task 2 is independent
of Task 1. Task 3 needs Task 2 (recipes' `.all`). Task 4 needs Task 3. Task 5
is independent. Task 6 needs Tasks 1, 4 and 5. Task 7 needs Task 6.

---

### Task 1: The category map and its completeness test

**Files:**
- Create: `apps/whispering/src/lib/whispering/settings-categories.ts`
- Test: `apps/whispering/src/lib/whispering/settings-categories.test.ts`

**Interfaces:**
- Consumes: `WhisperingSettingValues`, `whisperingDefinition` from `$lib/workspace`.
- Produces: `PREFERENCE_CATEGORIES`, `PreferenceCategory`,
  `PREFERENCE_CATEGORY_LABELS`, `PREFERENCE_CATEGORY_KEYS`,
  `TABLE_CATEGORIES`, `TableCategory`, `TABLE_CATEGORY_LABELS`.

- [ ] **Step 1: Write the failing test**

Create `apps/whispering/src/lib/whispering/settings-categories.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { whisperingDefinition } from '$lib/workspace';
import { PREFERENCE_CATEGORIES, PREFERENCE_CATEGORY_KEYS } from './settings-categories';

test('every settings key belongs to exactly one export category', () => {
	const allKeys = Object.keys(whisperingDefinition.kv);
	const categorized = Object.values(PREFERENCE_CATEGORY_KEYS).flat();

	const counts = new Map<string, number>();
	for (const key of categorized) counts.set(key, (counts.get(key) ?? 0) + 1);

	const uncategorized = allKeys.filter((key) => !counts.has(key));
	const duplicated = [...counts.entries()]
		.filter(([, count]) => count > 1)
		.map(([key]) => key);

	expect(uncategorized).toEqual([]);
	expect(duplicated).toEqual([]);
});

test('no category lists a key that does not exist', () => {
	const allKeys = new Set(Object.keys(whisperingDefinition.kv));
	const unknown = Object.values(PREFERENCE_CATEGORY_KEYS)
		.flat()
		.filter((key) => !allKeys.has(key));
	expect(unknown).toEqual([]);
});

test('every category has a label', () => {
	for (const category of PREFERENCE_CATEGORIES) {
		expect(typeof PREFERENCE_CATEGORY_KEYS[category]).not.toBe('undefined');
	}
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun run --filter '@epicenter/whispering' test settings-categories
```

Expected: FAIL, "Cannot find module './settings-categories'".

- [ ] **Step 3: Write the implementation**

Create `apps/whispering/src/lib/whispering/settings-categories.ts`. Copy the
exact key lists from `apps/whispering/src/lib/workspace/index.ts`'s
`settingsKv` at implementation time rather than from this plan, in case
either file has drifted since this was written:

```ts
/**
 * Named groups of `settingsKv` keys, for the settings import/export bundle.
 * Mirrors the existing Settings sub-pages so the checkbox list maps onto
 * pages the user already knows, rather than an arbitrary split.
 *
 * The completeness test beside this file is the point of writing the map by
 * hand instead of deriving it from a naming convention: a prefix match (say,
 * every `output*` key) is itself a silent-drop hazard the moment a key does
 * not fit the pattern it assumes. A flat list fails loudly in a test instead.
 *
 * See `specs/20260830T130918-settings-import-export.md`.
 */
import type { WhisperingSettingValues } from '$lib/workspace';

export const PREFERENCE_CATEGORIES = [
	'sounds',
	'outputDelivery',
	'recording',
	'transcription',
	'processing',
	'dictationPolish',
	'commandMode',
	'dictionary',
	'shortcuts',
	'analytics',
] as const;
export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];

export const PREFERENCE_CATEGORY_LABELS: Record<PreferenceCategory, string> = {
	sounds: 'Sounds',
	outputDelivery: 'Output delivery',
	recording: 'Recording',
	transcription: 'Transcription',
	processing: 'Processing',
	dictationPolish: 'Dictation & Polish',
	commandMode: 'Command Mode',
	dictionary: 'Dictionary',
	shortcuts: 'Shortcuts',
	analytics: 'Analytics',
};

export const PREFERENCE_CATEGORY_KEYS: Record<
	PreferenceCategory,
	readonly (keyof WhisperingSettingValues)[]
> = {
	sounds: [
		'soundManualStart',
		'soundManualStop',
		'soundManualCancel',
		'soundVadStart',
		'soundVadCapture',
		'soundVadStop',
		'soundTranscriptionComplete',
		'soundRecipeComplete',
	],
	outputDelivery: [
		'outputTranscriptionClipboard',
		'outputTranscriptionCursor',
		'outputTranscriptionEnter',
		'outputRecipeClipboard',
		'outputRecipeCursor',
		'outputRecipeEnter',
	],
	recording: [
		'recordingTrigger',
		'recordingPausePlayback',
		'recordingAutoUpload',
		// See this plan's "Cross-plan dependency" note if these four do not
		// exist in `settingsKv` yet.
		'recordingOverlayXAnchor',
		'recordingOverlayXMarginPx',
		'recordingOverlayYAnchor',
		'recordingOverlayYMarginPx',
	],
	transcription: [
		'transcriptionService',
		'transcriptionOpenaiModel',
		'transcriptionGroqModel',
		'transcriptionElevenlabsModel',
		'transcriptionDeepgramModel',
		'transcriptionMistralModel',
		'transcriptionLanguage',
		'transcriptionPrompt',
	],
	processing: ['completionProvider', 'completionModel'],
	dictationPolish: ['polishEnabled', 'polishInstructions'],
	commandMode: ['commandModeEnabled'],
	dictionary: ['dictionary'],
	shortcuts: [
		'shortcutPushToTalkModifiers',
		'shortcutPushToTalkKeys',
		'shortcutToggleManualRecordingModifiers',
		'shortcutToggleManualRecordingKeys',
		'shortcutCancelRecordingModifiers',
		'shortcutCancelRecordingKeys',
		'shortcutToggleVadRecordingModifiers',
		'shortcutToggleVadRecordingKeys',
		'shortcutOpenRecipePickerModifiers',
		'shortcutOpenRecipePickerKeys',
		'shortcutRunRecipeOnClipboardModifiers',
		'shortcutRunRecipeOnClipboardKeys',
		'shortcutOpenSettingsModifiers',
		'shortcutOpenSettingsKeys',
	],
	analytics: ['analyticsEnabled'],
};

export const TABLE_CATEGORIES = ['snippets', 'recipes'] as const;
export type TableCategory = (typeof TABLE_CATEGORIES)[number];

export const TABLE_CATEGORY_LABELS: Record<TableCategory, string> = {
	snippets: 'Snippets',
	recipes: 'Recipes',
};

export type SettingsCategory = PreferenceCategory | TableCategory;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun run --filter '@epicenter/whispering' test settings-categories
```

Expected: PASS, 3 tests. If the first test fails listing uncategorized keys,
that is real signal, not a test bug: add the missing key to whichever
category it belongs to.

- [ ] **Step 5: Commit**

```bash
git add apps/whispering/src/lib/whispering/settings-categories.ts apps/whispering/src/lib/whispering/settings-categories.test.ts
git commit -m "feat(whispering): add the settings export category map"
```

---

### Task 2: Recipes gain `.all`, and validate/dedupe helpers for both tables

**Files:**
- Modify: `apps/whispering/src/lib/whispering/recipes.svelte.ts`
- Modify: `apps/whispering/src/lib/whispering/snippets-import.ts`
- Modify: `apps/whispering/src/lib/whispering/snippets-import.test.ts` (no
  behavior change, only confirms the extracted function still works)
- Create: `apps/whispering/src/lib/whispering/recipes-import.ts`
- Test: `apps/whispering/src/lib/whispering/recipes-import.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `app.recipes.all: Recipe[]`; `validateSnippetsArray(parsed: unknown)`
  (extracted, `parseSnippetsImport` now calls it); `validateRecipesArray`,
  `parseRecipesImport`, `dedupeRecipesAgainstExisting`, `ImportedRecipe`.

- [ ] **Step 1: Add `.all` to recipes**

In `apps/whispering/src/lib/whispering/recipes.svelte.ts`, add to the
returned object, immediately after `get count(): number { ... }`:

```ts
		/** The person's own recipes, unsorted, for export. Built-ins are shipped
		 * in code and are never part of this: exporting them would just be
		 * exporting the app's own source data back to itself. */
		get all(): Recipe[] {
			return rows;
		},
```

- [ ] **Step 2: Extract `validateSnippetsArray`**

In `apps/whispering/src/lib/whispering/snippets-import.ts`, split
`parseSnippetsImport`'s body. Replace:

```ts
export function parseSnippetsImport(
	text: string,
): Result<{ valid: ImportedSnippet[]; rejected: number }, ImportParseError> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return Err({ type: 'NotJson' });
	}
	if (!Array.isArray(parsed)) return Err({ type: 'NotAnArray' });

	const valid: ImportedSnippet[] = [];
	let rejected = 0;
	for (const entry of parsed) {
		// ... unchanged loop body ...
	}
	return Ok({ valid, rejected });
}
```

with:

```ts
/** Validates already-parsed JSON. Extracted so the settings bundle importer,
 * which receives a `snippets` array already parsed as part of a larger
 * document, can validate it without a stringify-then-reparse round trip. */
export function validateSnippetsArray(
	parsed: unknown,
): Result<{ valid: ImportedSnippet[]; rejected: number }, ImportParseError> {
	if (!Array.isArray(parsed)) return Err({ type: 'NotAnArray' });

	const valid: ImportedSnippet[] = [];
	let rejected = 0;
	for (const entry of parsed) {
		// ... unchanged loop body ...
	}
	return Ok({ valid, rejected });
}

export function parseSnippetsImport(
	text: string,
): Result<{ valid: ImportedSnippet[]; rejected: number }, ImportParseError> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return Err({ type: 'NotJson' });
	}
	return validateSnippetsArray(parsed);
}
```

This is a pure extraction. Nothing about `parseSnippetsImport`'s exported
behavior changes, so its existing test file needs no new assertions, only a
run to confirm nothing broke.

- [ ] **Step 3: Run the existing snippets-import tests to confirm no regression**

```bash
bun run --filter '@epicenter/whispering' test snippets-import
```

Expected: PASS, all existing tests unchanged.

- [ ] **Step 4: Write the failing recipes-import test**

Create `apps/whispering/src/lib/whispering/recipes-import.test.ts`, mirroring
`snippets-import.test.ts`'s shape exactly, substituting `name`/`instructions`
for `trigger`/`replacement`:

```ts
import { expect, test } from 'bun:test';
import { expectErr, expectOk } from 'wellcrafted/testing';
import { dedupeRecipesAgainstExisting, parseRecipesImport } from './recipes-import';

test('parses a well-formed export', () => {
	const result = parseRecipesImport(
		JSON.stringify([{ name: 'Email', instructions: 'Turn this into an email.', icon: null }]),
	);
	const { valid, rejected } = expectOk(result);
	expect(valid).toEqual([
		{ name: 'Email', instructions: 'Turn this into an email.', icon: null },
	]);
	expect(rejected).toBe(0);
});

test('rejects text that is not JSON', () => {
	expect(expectErr(parseRecipesImport('not json'))).toEqual({ type: 'NotJson' });
});

test('rejects JSON that is not an array', () => {
	expect(expectErr(parseRecipesImport('{"name":"x"}'))).toEqual({ type: 'NotAnArray' });
});

test('drops entries missing a name or instructions, keeps the rest', () => {
	const result = parseRecipesImport(
		JSON.stringify([
			{ name: 'ok', instructions: 'fine', icon: null },
			{ name: '', instructions: 'no name', icon: null },
			{ name: 'no instructions', instructions: '', icon: null },
			{ name: 'wrong icon type', instructions: 'fine', icon: 42 },
			'not an object',
		]),
	);
	const { valid, rejected } = expectOk(result);
	expect(valid).toEqual([{ name: 'ok', instructions: 'fine', icon: null }]);
	expect(rejected).toBe(4);
});

test('drops an entry whose instructions exceed the length cap', () => {
	const result = parseRecipesImport(
		JSON.stringify([{ name: 'too long', instructions: 'x'.repeat(10_001), icon: null }]),
	);
	const { valid, rejected } = expectOk(result);
	expect(valid).toEqual([]);
	expect(rejected).toBe(1);
});

test('dedupeRecipesAgainstExisting skips a name already in the table, case-insensitively', () => {
	const { toCreate, skippedDuplicate } = dedupeRecipesAgainstExisting(
		[{ name: 'Email', instructions: 'x', icon: null }],
		['email'],
	);
	expect(toCreate).toEqual([]);
	expect(skippedDuplicate).toBe(1);
});

test('dedupeRecipesAgainstExisting keeps everything when nothing collides', () => {
	const { toCreate, skippedDuplicate } = dedupeRecipesAgainstExisting(
		[{ name: 'Email', instructions: 'x', icon: null }],
		['to-do list'],
	);
	expect(toCreate).toEqual([{ name: 'Email', instructions: 'x', icon: null }]);
	expect(skippedDuplicate).toBe(0);
});
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
bun run --filter '@epicenter/whispering' test recipes-import
```

Expected: FAIL, "Cannot find module './recipes-import'".

- [ ] **Step 6: Write the implementation**

Create `apps/whispering/src/lib/whispering/recipes-import.ts`:

```ts
/**
 * Import validation for the Recipes category of a settings bundle, and
 * (kept for symmetry, matching `snippets-import.ts`) for a standalone
 * `recipes.json`. Pure and separate from `app.recipes.set` side effects, so
 * the rules are testable without a store.
 *
 * See `specs/20260830T130918-settings-import-export.md`.
 */
import { Err, Ok, type Result } from 'wellcrafted/result';

export type ImportedRecipe = { name: string; instructions: string; icon: string | null };

/** A recipe's instructions are a prompt, naturally longer than a Snippet's
 * replacement text; 10,000 is generous headroom, not a measured limit. */
const MAX_INSTRUCTIONS_LENGTH = 10_000;

export type ImportParseError = { type: 'NotJson' } | { type: 'NotAnArray' };

/** Validates already-parsed JSON, e.g. a `recipes` array already parsed as
 * part of a larger settings bundle document. */
export function validateRecipesArray(
	parsed: unknown,
): Result<{ valid: ImportedRecipe[]; rejected: number }, ImportParseError> {
	if (!Array.isArray(parsed)) return Err({ type: 'NotAnArray' });

	const valid: ImportedRecipe[] = [];
	let rejected = 0;
	for (const entry of parsed) {
		if (typeof entry !== 'object' || entry === null) {
			rejected += 1;
			continue;
		}
		const { name, instructions, icon } = entry as Record<string, unknown>;
		if (
			typeof name !== 'string' ||
			typeof instructions !== 'string' ||
			name.trim() === '' ||
			instructions.trim() === '' ||
			instructions.length > MAX_INSTRUCTIONS_LENGTH ||
			(icon !== null && typeof icon !== 'string')
		) {
			rejected += 1;
			continue;
		}
		valid.push({
			name: name.trim(),
			instructions: instructions.trim(),
			icon: icon ?? null,
		});
	}
	return Ok({ valid, rejected });
}

export function parseRecipesImport(
	text: string,
): Result<{ valid: ImportedRecipe[]; rejected: number }, ImportParseError> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return Err({ type: 'NotJson' });
	}
	return validateRecipesArray(parsed);
}

/** Drops entries whose name collides with an existing recipe or an earlier
 * entry in the same file (case-insensitive). First occurrence wins: recipes
 * have no other natural collision key the way Snippets have `trigger`. */
export function dedupeRecipesAgainstExisting(
	imported: readonly ImportedRecipe[],
	existingNames: readonly string[],
): { toCreate: ImportedRecipe[]; skippedDuplicate: number } {
	const seen = new Set(existingNames.map((name) => name.toLowerCase()));
	const toCreate: ImportedRecipe[] = [];
	let skippedDuplicate = 0;
	for (const entry of imported) {
		const key = entry.name.toLowerCase();
		if (seen.has(key)) {
			skippedDuplicate += 1;
			continue;
		}
		seen.add(key);
		toCreate.push(entry);
	}
	return { toCreate, skippedDuplicate };
}
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
bun run --filter '@epicenter/whispering' test recipes-import
```

Expected: PASS, 7 tests.

- [ ] **Step 8: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add apps/whispering/src/lib/whispering/recipes.svelte.ts apps/whispering/src/lib/whispering/snippets-import.ts apps/whispering/src/lib/whispering/recipes-import.ts apps/whispering/src/lib/whispering/recipes-import.test.ts
git commit -m "feat(whispering): add recipes import validation and an all-recipes accessor"
```

---

### Task 3: The bundle builder and export

**Files:**
- Create: `apps/whispering/src/lib/whispering/settings-bundle-types.ts`
- Create: `apps/whispering/src/lib/whispering/settings-bundle-export.ts`
- Test: `apps/whispering/src/lib/whispering/settings-bundle-export.test.ts`

**Interfaces:**
- Consumes: `PREFERENCE_CATEGORY_KEYS` (Task 1); `app.snippets.all`,
  `app.recipes.all` (Task 2); `WhisperingApp`.
- Produces: `SettingsBundleFile`, `SettingsBundleSelection`,
  `buildSettingsBundle(app, selection, exportedAt)`,
  `exportSettingsBundle(app, selection)`.

- [ ] **Step 1: Write the shared types**

Create `apps/whispering/src/lib/whispering/settings-bundle-types.ts`:

```ts
import type { PreferenceCategory } from './settings-categories';

/**
 * The settings bundle file shape, shared by export and import. `version`
 * exists so a future incompatible reshape can be detected and refused rather
 * than silently misapplied; there is no migration path yet because there is
 * nothing to migrate from.
 */
export type SettingsBundleFile = {
	version: 1;
	exportedAt: string;
	preferences: Partial<Record<PreferenceCategory, Record<string, unknown>>>;
	snippets?: { trigger: string; replacement: string }[];
	recipes?: { name: string; instructions: string; icon: string | null }[];
};

export type SettingsBundleSelection = {
	preferences: PreferenceCategory[];
	snippets: boolean;
	recipes: boolean;
};
```

- [ ] **Step 2: Write the failing test**

Create `apps/whispering/src/lib/whispering/settings-bundle-export.test.ts`:

```ts
import { expect, test } from 'bun:test';
import type { WhisperingApp } from './app';
import { buildSettingsBundle } from './settings-bundle-export';

const FAKE_SETTINGS: Record<string, unknown> = {
	soundManualStart: true,
	soundManualStop: false,
	outputTranscriptionClipboard: true,
	commandModeEnabled: true,
	dictionary: ['Kubernetes'],
};

const app = {
	settings: { get: (key: string) => FAKE_SETTINGS[key] },
	snippets: {
		all: [{ id: 's1', trigger: 'brb', replacement: 'be right back' }],
	},
	recipes: {
		all: [{ id: 'r1', name: 'Email', instructions: 'Make it an email.', icon: null }],
	},
} as unknown as WhisperingApp;

test('includes only checked preference categories, with exactly their keys', () => {
	const bundle = buildSettingsBundle(
		app,
		{ preferences: ['sounds', 'commandMode'], snippets: false, recipes: false },
		'2026-08-30T00:00:00.000Z',
	);
	expect(Object.keys(bundle.preferences).sort()).toEqual(['commandMode', 'sounds']);
	expect(bundle.preferences.sounds).toEqual({
		soundManualStart: true,
		soundManualStop: false,
		soundManualCancel: undefined,
		soundVadStart: undefined,
		soundVadCapture: undefined,
		soundVadStop: undefined,
		soundTranscriptionComplete: undefined,
		soundRecipeComplete: undefined,
	});
	expect(bundle.preferences.commandMode).toEqual({ commandModeEnabled: true });
});

test('an unchecked table category is absent from the bundle entirely', () => {
	const bundle = buildSettingsBundle(
		app,
		{ preferences: [], snippets: false, recipes: true },
		'2026-08-30T00:00:00.000Z',
	);
	expect(bundle.snippets).toBeUndefined();
	expect(bundle.recipes).toEqual([{ name: 'Email', instructions: 'Make it an email.', icon: null }]);
});

test('carries the given exportedAt verbatim', () => {
	const bundle = buildSettingsBundle(
		app,
		{ preferences: [], snippets: false, recipes: false },
		'2026-08-30T00:00:00.000Z',
	);
	expect(bundle.version).toBe(1);
	expect(bundle.exportedAt).toBe('2026-08-30T00:00:00.000Z');
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
bun run --filter '@epicenter/whispering' test settings-bundle-export
```

Expected: FAIL, "Cannot find module './settings-bundle-export'".

- [ ] **Step 4: Write the implementation**

Create `apps/whispering/src/lib/whispering/settings-bundle-export.ts`:

```ts
/**
 * Shapes and downloads a settings bundle. `buildSettingsBundle` is pure and
 * parameterized on `exportedAt` so it is deterministic under test;
 * `exportSettingsBundle` is the thin I/O wrapper that supplies the real
 * timestamp and triggers the download.
 *
 * See `specs/20260830T130918-settings-import-export.md`.
 */
import { Err, Ok, type Result } from 'wellcrafted/result';
import { type DownloadError, DownloadServiceLive } from '#platform/download';
import { PREFERENCE_CATEGORY_KEYS } from './settings-categories';
import type {
	SettingsBundleFile,
	SettingsBundleSelection,
} from './settings-bundle-types';
import type { WhisperingApp } from './app';
import type { WhisperingSettingValues } from '$lib/workspace';

export type { SettingsBundleFile, SettingsBundleSelection } from './settings-bundle-types';

export function buildSettingsBundle(
	app: WhisperingApp,
	selection: SettingsBundleSelection,
	exportedAt: string,
): SettingsBundleFile {
	const preferences: SettingsBundleFile['preferences'] = {};
	for (const category of selection.preferences) {
		const values: Record<string, unknown> = {};
		for (const key of PREFERENCE_CATEGORY_KEYS[category]) {
			values[key] = app.settings.get(key as keyof WhisperingSettingValues);
		}
		preferences[category] = values;
	}

	const bundle: SettingsBundleFile = { version: 1, exportedAt, preferences };
	if (selection.snippets) {
		bundle.snippets = app.snippets.all.map(({ trigger, replacement }) => ({
			trigger,
			replacement,
		}));
	}
	if (selection.recipes) {
		bundle.recipes = app.recipes.all.map(({ name, instructions, icon }) => ({
			name,
			instructions,
			icon,
		}));
	}
	return bundle;
}

export async function exportSettingsBundle(
	app: WhisperingApp,
	selection: SettingsBundleSelection,
): Promise<Result<{ categoryCount: number }, DownloadError>> {
	const bundle = buildSettingsBundle(app, selection, new Date().toISOString());
	const categoryCount =
		Object.keys(bundle.preferences).length +
		(bundle.snippets ? 1 : 0) +
		(bundle.recipes ? 1 : 0);
	if (categoryCount === 0) return Ok({ categoryCount: 0 });

	const blob = new Blob([JSON.stringify(bundle, null, 2)], {
		type: 'application/json',
	});
	const { error } = await DownloadServiceLive.downloadBlob({
		name: 'whispering-settings.json',
		blob,
	});
	if (error) return Err(error);
	return Ok({ categoryCount });
}
```

Note: `bundle.preferences.sounds` will actually come back with only the keys
whose settings the fake `app.settings.get` recognizes set to `undefined` for
the rest, since `FAKE_SETTINGS` in the test only stubs a few keys. Bun's
`toEqual` treats an explicit `undefined` value as equal to a missing key, so
the test as written passes; if that assumption turns out wrong against the
installed Bun version, list every `sounds` key in `FAKE_SETTINGS` explicitly
instead of relying on it.

- [ ] **Step 5: Run the test to verify it passes**

```bash
bun run --filter '@epicenter/whispering' test settings-bundle-export
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/whispering/src/lib/whispering/settings-bundle-types.ts apps/whispering/src/lib/whispering/settings-bundle-export.ts apps/whispering/src/lib/whispering/settings-bundle-export.test.ts
git commit -m "feat(whispering): add the settings bundle builder and export"
```

---

### Task 4: Parse and apply

**Files:**
- Create: `apps/whispering/src/lib/whispering/settings-bundle-import.ts`
- Test: `apps/whispering/src/lib/whispering/settings-bundle-import.test.ts`

**Interfaces:**
- Consumes: `PREFERENCE_CATEGORIES`, `PREFERENCE_CATEGORY_KEYS` (Task 1);
  `validateSnippetsArray` (Task 2); `validateRecipesArray`,
  `dedupeRecipesAgainstExisting` (Task 2); `SettingsBundleFile`,
  `SettingsBundleSelection` (Task 3); `dedupeAgainstExisting` (existing,
  `snippets-import.ts`).
- Produces: `parseSettingsBundle(text)`, `availableCategoriesIn(file)`,
  `applySettingsBundle(app, file, selection)`, `SettingsBundleImportSummary`.

- [ ] **Step 1: Write the failing test**

Create `apps/whispering/src/lib/whispering/settings-bundle-import.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { expectErr, expectOk } from 'wellcrafted/testing';
import type { WhisperingApp } from './app';
import type { SettingsBundleFile } from './settings-bundle-types';
import {
	applySettingsBundle,
	availableCategoriesIn,
	parseSettingsBundle,
} from './settings-bundle-import';

function makeApp(overrides: Partial<Record<string, unknown>> = {}) {
	const settings: Record<string, unknown> = {
		soundManualStart: false,
		soundManualStop: false,
		commandModeEnabled: false,
		...overrides,
	};
	const defaults: Record<string, unknown> = {
		soundManualStart: false,
		soundManualStop: false,
		commandModeEnabled: false,
	};
	return {
		settings: {
			get: (key: string) => settings[key],
			set: (key: string, value: unknown) => {
				settings[key] = value;
			},
			getDefault: (key: string) => defaults[key],
		},
		snippets: { all: [] as { id: string; trigger: string; replacement: string }[] },
		recipes: { all: [] as { id: string; name: string; instructions: string; icon: string | null }[] },
	} as unknown as WhisperingApp;
}

test('rejects text that is not JSON', () => {
	expect(expectErr(parseSettingsBundle('not json'))).toEqual({ type: 'NotJson' });
});

test('rejects a missing or unsupported version', () => {
	expect(expectErr(parseSettingsBundle('{}'))).toEqual({ type: 'MissingVersion' });
	expect(expectErr(parseSettingsBundle('{"version":2}'))).toEqual({
		type: 'UnsupportedVersion',
		version: 2,
	});
});

test('availableCategoriesIn reports only what the file actually has', () => {
	const file: SettingsBundleFile = {
		version: 1,
		exportedAt: 'now',
		preferences: { sounds: { soundManualStart: true } },
		snippets: [{ trigger: 'brb', replacement: 'be right back' }],
	};
	expect(availableCategoriesIn(file)).toEqual({
		preferences: ['sounds'],
		snippets: true,
		recipes: false,
	});
});

test('applies only checked-and-present categories, leaves the rest untouched', () => {
	const app = makeApp();
	const file: SettingsBundleFile = {
		version: 1,
		exportedAt: 'now',
		preferences: {
			sounds: { soundManualStart: true, soundManualStop: true },
			commandMode: { commandModeEnabled: true },
		},
	};
	const summary = applySettingsBundle(app, file, {
		preferences: ['sounds'],
		snippets: false,
		recipes: false,
	});
	expect(summary.appliedPreferenceCategories).toEqual(['sounds']);
	expect(app.settings.get('soundManualStart')).toBe(true);
	expect(app.settings.get('soundManualStop')).toBe(true);
	// Not checked, so untouched even though the file has it:
	expect(app.settings.get('commandModeEnabled')).toBe(false);
});

test('skips one malformed field without dropping the rest of its category', () => {
	const app = makeApp();
	const file: SettingsBundleFile = {
		version: 1,
		exportedAt: 'now',
		preferences: {
			sounds: { soundManualStart: 'not a boolean', soundManualStop: true },
		},
	};
	const summary = applySettingsBundle(app, file, {
		preferences: ['sounds'],
		snippets: false,
		recipes: false,
	});
	expect(summary.skippedFields).toBe(1);
	expect(summary.appliedPreferenceCategories).toEqual(['sounds']);
	expect(app.settings.get('soundManualStart')).toBe(false); // unchanged
	expect(app.settings.get('soundManualStop')).toBe(true); // applied
});

test('snippets import dedupes against the live table', () => {
	const app = makeApp();
	app.snippets.all.push({ id: 'existing', trigger: 'brb', replacement: 'old' });
	const file: SettingsBundleFile = {
		version: 1,
		exportedAt: 'now',
		preferences: {},
		snippets: [
			{ trigger: 'brb', replacement: 'new' },
			{ trigger: 'omw', replacement: 'on my way' },
		],
	};
	const summary = applySettingsBundle(app, file, {
		preferences: [],
		snippets: true,
		recipes: false,
	});
	expect(summary.snippets).toEqual({ created: 1, skippedDuplicate: 1, rejected: 0 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun run --filter '@epicenter/whispering' test settings-bundle-import
```

Expected: FAIL, "Cannot find module './settings-bundle-import'".

- [ ] **Step 3: Write the implementation**

Create `apps/whispering/src/lib/whispering/settings-bundle-import.ts`:

```ts
/**
 * Parses, inspects, and applies a settings bundle. Preference categories
 * overwrite on apply (a boolean or a select has no meaningful merge);
 * Snippets and Recipes stay additive, deduping against the live table the
 * same way their own standalone importers already do.
 *
 * See `specs/20260830T130918-settings-import-export.md`.
 */
import { Err, Ok, type Result } from 'wellcrafted/result';
import { nanoid } from 'nanoid/non-secure';
import {
	dedupeRecipesAgainstExisting,
	validateRecipesArray,
} from './recipes-import';
import { dedupeAgainstExisting, validateSnippetsArray } from './snippets-import';
import {
	PREFERENCE_CATEGORIES,
	PREFERENCE_CATEGORY_KEYS,
	type PreferenceCategory,
} from './settings-categories';
import type {
	SettingsBundleFile,
	SettingsBundleSelection,
} from './settings-bundle-types';
import type { WhisperingApp } from './app';
import type { WhisperingSettingValues } from '$lib/workspace';

export type SettingsBundleParseError =
	| { type: 'NotJson' }
	| { type: 'NotAnObject' }
	| { type: 'MissingVersion' }
	| { type: 'UnsupportedVersion'; version: unknown };

export function parseSettingsBundle(
	text: string,
): Result<SettingsBundleFile, SettingsBundleParseError> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return Err({ type: 'NotJson' });
	}
	if (typeof parsed !== 'object' || parsed === null) {
		return Err({ type: 'NotAnObject' });
	}
	const { version } = parsed as Record<string, unknown>;
	if (version === undefined) return Err({ type: 'MissingVersion' });
	if (version !== 1) return Err({ type: 'UnsupportedVersion', version });
	return Ok(parsed as SettingsBundleFile);
}

/** Which categories a parsed file actually offers, for the import screen. */
export function availableCategoriesIn(file: SettingsBundleFile): {
	preferences: PreferenceCategory[];
	snippets: boolean;
	recipes: boolean;
} {
	return {
		preferences: PREFERENCE_CATEGORIES.filter(
			(category) => file.preferences?.[category] !== undefined,
		),
		snippets: Array.isArray(file.snippets),
		recipes: Array.isArray(file.recipes),
	};
}

export type SettingsBundleImportSummary = {
	appliedPreferenceCategories: PreferenceCategory[];
	skippedFields: number;
	snippets?: { created: number; skippedDuplicate: number; rejected: number };
	recipes?: { created: number; skippedDuplicate: number; rejected: number };
};

/**
 * A value is applied only when its runtime type matches the setting's own
 * current default. This catches ordinary corruption (a hand-edited file, a
 * mismatched version) without this feature re-declaring every field's exact
 * allowed domain a second time. It does not catch a wrong-but-same-typeof
 * value (an invalid `field.select` member that is still a string); that
 * residual risk is accepted, the same posture `transcriptionLanguage`'s own
 * UI-only validation already takes.
 */
function matchesDefaultShape(
	app: WhisperingApp,
	key: keyof WhisperingSettingValues,
	value: unknown,
): boolean {
	return typeof value === typeof app.settings.getDefault(key);
}

export function applySettingsBundle(
	app: WhisperingApp,
	file: SettingsBundleFile,
	selection: SettingsBundleSelection,
): SettingsBundleImportSummary {
	const appliedPreferenceCategories: PreferenceCategory[] = [];
	let skippedFields = 0;

	for (const category of selection.preferences) {
		const values = file.preferences?.[category];
		if (!values) continue;
		for (const key of PREFERENCE_CATEGORY_KEYS[category]) {
			if (!(key in values)) continue;
			const value = values[key];
			if (!matchesDefaultShape(app, key, value)) {
				skippedFields += 1;
				continue;
			}
			app.settings.set(key, value as never);
		}
		appliedPreferenceCategories.push(category);
	}

	const summary: SettingsBundleImportSummary = {
		appliedPreferenceCategories,
		skippedFields,
	};

	if (selection.snippets && file.snippets) {
		const validated = validateSnippetsArray(file.snippets);
		if (validated.data) {
			const { toCreate, skippedDuplicate } = dedupeAgainstExisting(
				validated.data.valid,
				app.snippets.all.map((row) => row.trigger),
			);
			for (const { trigger, replacement } of toCreate) {
				app.snippets.set({ id: nanoid(), trigger, replacement });
			}
			summary.snippets = {
				created: toCreate.length,
				skippedDuplicate,
				rejected: validated.data.rejected,
			};
		}
	}

	if (selection.recipes && file.recipes) {
		const validated = validateRecipesArray(file.recipes);
		if (validated.data) {
			const { toCreate, skippedDuplicate } = dedupeRecipesAgainstExisting(
				validated.data.valid,
				app.recipes.all.map((row) => row.name),
			);
			for (const { name, instructions, icon } of toCreate) {
				app.recipes.set({ id: nanoid(), name, instructions, icon });
			}
			summary.recipes = {
				created: toCreate.length,
				skippedDuplicate,
				rejected: validated.data.rejected,
			};
		}
	}

	return summary;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun run --filter '@epicenter/whispering' test settings-bundle-import
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/whispering/src/lib/whispering/settings-bundle-import.ts apps/whispering/src/lib/whispering/settings-bundle-import.test.ts
git commit -m "feat(whispering): add settings bundle parsing and apply"
```

---

### Task 5: The shared category checkbox list

**Files:**
- Create: `apps/whispering/src/lib/components/settings/CategoryCheckboxList.svelte`

**Interfaces:**
- Consumes: nothing beyond its own props.
- Produces: a Svelte component, `{ items: { key: string; label: string;
  count?: number }[]; selected: Set<string> }` (bindable).

No automated test: presentational component, same posture as
`RecordingPillReposition.svelte` in the other plan.

- [ ] **Step 1: Write the component**

Create `apps/whispering/src/lib/components/settings/CategoryCheckboxList.svelte`:

```svelte
<script lang="ts">
	import { Checkbox } from '@epicenter/ui/checkbox';
	import { Label } from '@epicenter/ui/label';

	let {
		items,
		selected = $bindable(),
	}: {
		items: { key: string; label: string; count?: number }[];
		selected: Set<string>;
	} = $props();

	function toggle(key: string, checked: boolean) {
		const next = new Set(selected);
		if (checked) next.add(key);
		else next.delete(key);
		selected = next;
	}
</script>

<ul class="grid grid-cols-1 gap-2 sm:grid-cols-2">
	{#each items as item (item.key)}
		<li class="flex items-center gap-2">
			<Checkbox
				id="category-{item.key}"
				checked={selected.has(item.key)}
				onCheckedChange={(checked) => toggle(item.key, checked === true)}
			/>
			<Label for="category-{item.key}" class="text-sm font-normal">
				{item.label}
				{#if item.count !== undefined}
					<span class="text-muted-foreground">({item.count})</span>
				{/if}
			</Label>
		</li>
	{/each}
</ul>
```

- [ ] **Step 2: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/whispering/src/lib/components/settings/CategoryCheckboxList.svelte
git commit -m "feat(whispering): add the shared settings category checkbox list"
```

---

### Task 6: The Import & Export page

**Files:**
- Create: `apps/whispering/src/routes/(app)/(config)/settings/data/+page.svelte`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4 and 5.

No automated test: page wiring over already-tested pure functions. Verified
by hand in Task 8.

- [ ] **Step 1: Write the page**

Create `apps/whispering/src/routes/(app)/(config)/settings/data/+page.svelte`:

```svelte
<script lang="ts">
	import { Button } from '@epicenter/ui/button';
	import * as Field from '@epicenter/ui/field';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import CategoryCheckboxList from '$lib/components/settings/CategoryCheckboxList.svelte';
	import { report } from '$lib/report';
	import {
		PREFERENCE_CATEGORIES,
		PREFERENCE_CATEGORY_LABELS,
	} from '$lib/whispering/settings-categories';
	import {
		exportSettingsBundle,
		type SettingsBundleSelection,
	} from '$lib/whispering/settings-bundle-export';
	import {
		applySettingsBundle,
		availableCategoriesIn,
		parseSettingsBundle,
	} from '$lib/whispering/settings-bundle-import';
	import type { SettingsBundleFile } from '$lib/whispering/settings-bundle-types';
	import { getWhisperingApp } from '$lib/whispering/context';

	const app = getWhisperingApp();

	const exportItems = [
		...PREFERENCE_CATEGORIES.map((key) => ({
			key,
			label: PREFERENCE_CATEGORY_LABELS[key],
		})),
		{ key: 'snippets', label: `Snippets (${app.snippets.count})` },
		{ key: 'recipes', label: `Recipes (${app.recipes.count})` },
	];

	let exportSelected = $state(new Set(exportItems.map((item) => item.key)));

	function selectionFrom(keys: Set<string>): SettingsBundleSelection {
		return {
			preferences: PREFERENCE_CATEGORIES.filter((key) => keys.has(key)),
			snippets: keys.has('snippets'),
			recipes: keys.has('recipes'),
		};
	}

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
			title: `Exported ${data.categoryCount} categor${data.categoryCount === 1 ? 'y' : 'ies'}`,
		});
	}

	let importInput = $state<HTMLInputElement>();
	let importFile = $state<SettingsBundleFile | null>(null);
	let importParseErrorMessage = $state<string | null>(null);
	let importSelected = $state(new Set<string>());

	const importItems = $derived.by(() => {
		if (!importFile) return [];
		const available = availableCategoriesIn(importFile);
		return [
			...available.preferences.map((key) => ({
				key,
				label: PREFERENCE_CATEGORY_LABELS[key],
			})),
			...(available.snippets
				? [{ key: 'snippets', label: `Snippets (${importFile.snippets?.length ?? 0})` }]
				: []),
			...(available.recipes
				? [{ key: 'recipes', label: `Recipes (${importFile.recipes?.length ?? 0})` }]
				: []),
		];
	});

	async function onImportFileChosen(
		event: Event & { currentTarget: HTMLInputElement },
	) {
		const [file] = Array.from(event.currentTarget.files ?? []);
		event.currentTarget.value = '';
		if (!file) return;

		const text = await file.text();
		const parsed = parseSettingsBundle(text);
		if (parsed.error) {
			importFile = null;
			importParseErrorMessage =
				parsed.error.type === 'NotJson'
					? 'That file is not valid JSON.'
					: parsed.error.type === 'NotAnObject'
						? 'Expected a settings bundle, not a bare value or array.'
						: 'This file is not a format Whispering recognizes.';
			return;
		}

		importFile = parsed.data;
		importParseErrorMessage = null;
		importSelected = new Set([
			...availableCategoriesIn(parsed.data).preferences,
			...(availableCategoriesIn(parsed.data).snippets ? ['snippets'] : []),
			...(availableCategoriesIn(parsed.data).recipes ? ['recipes'] : []),
		]);
	}

	function handleApplyImport() {
		if (!importFile) return;
		const summary = applySettingsBundle(
			app,
			importFile,
			selectionFrom(importSelected),
		);
		const parts = [
			summary.snippets &&
				`${summary.snippets.created} snippet${summary.snippets.created === 1 ? '' : 's'}`,
			summary.recipes &&
				`${summary.recipes.created} recipe${summary.recipes.created === 1 ? '' : 's'}`,
			summary.skippedFields > 0 && `${summary.skippedFields} field(s) skipped`,
		].filter((part): part is string => Boolean(part));
		report.success({
			title: `Imported ${summary.appliedPreferenceCategories.length} settings categor${summary.appliedPreferenceCategories.length === 1 ? 'y' : 'ies'}`,
			description: parts.length > 0 ? parts.join(', ') : undefined,
		});
		importFile = null;
	}
</script>

<svelte:head> <title>Import & Export - Whispering</title> </svelte:head>

<Field.Set>
	<Field.Legend>Export</Field.Legend>
	<Field.Description>
		Pick what to include, then download it as one file.
	</Field.Description>
	<Field.Group>
		<CategoryCheckboxList items={exportItems} bind:selected={exportSelected} />
		<Button onclick={handleExport} disabled={exportSelected.size === 0}>
			<DownloadIcon class="size-4" /> Export selected
		</Button>
	</Field.Group>
</Field.Set>

<Field.Separator />

<Field.Set>
	<Field.Legend>Import</Field.Legend>
	<Field.Description>
		Checked categories replace your current values; Snippets and Recipes are
		added alongside what you already have.
	</Field.Description>
	<Field.Group>
		<input
			bind:this={importInput}
			type="file"
			accept="application/json"
			class="hidden"
			onchange={onImportFileChosen}
		/>
		<Button variant="outline" onclick={() => importInput?.click()}>
			<UploadIcon class="size-4" /> Choose file
		</Button>

		{#if importParseErrorMessage}
			<p class="text-destructive text-sm">{importParseErrorMessage}</p>
		{/if}

		{#if importFile}
			<CategoryCheckboxList items={importItems} bind:selected={importSelected} />
			<Button onclick={handleApplyImport} disabled={importSelected.size === 0}>
				Apply import
			</Button>
		{/if}
	</Field.Group>
</Field.Set>
```

- [ ] **Step 2: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors. If `app.snippets.count` / `app.recipes.count` are not the
exact accessor names, check `whispering/snippets.svelte.ts` and
`whispering/recipes.svelte.ts` for the current ones (both existed before this
plan; Task 2 does not rename either).

- [ ] **Step 3: Commit**

```bash
git add "apps/whispering/src/routes/(app)/(config)/settings/data/+page.svelte"
git commit -m "feat(whispering): add the settings import and export page"
```

---

### Task 7: The sidebar entry

**Files:**
- Modify: `apps/whispering/src/routes/(app)/(config)/settings/SidebarNav.svelte`

- [ ] **Step 1: Add the nav item**

In `apps/whispering/src/routes/(app)/(config)/settings/SidebarNav.svelte`,
add to the `items` array, immediately after the `Account` entry:

```ts
		{ title: 'Import & Export', href: whisperingPath('/settings/data') },
```

- [ ] **Step 2: Typecheck**

```bash
bun run --filter '@epicenter/whispering' typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/whispering/src/routes/(app)/(config)/settings/SidebarNav.svelte"
git commit -m "feat(whispering): link the Import & Export page from Settings"
```

---

### Task 8: Verify in the running app

**Files:** none. This task produces evidence, not a diff.

- [ ] **Step 1: Start the app**

```bash
bun dev:whispering
```

(Or `bun dev:epicenter` if verifying inside the desktop shell; this feature
has no Tauri-only surface, so either build works.)

- [ ] **Step 2: Export everything**

Settings, Import & Export. Confirm every category is checked by default,
export, and open the downloaded `whispering-settings.json` to confirm it has
a `preferences` key per category plus `snippets`/`recipes` arrays if you have
any.

- [ ] **Step 3: Change a setting from each category, then reset**

Flip a few settings (a sound toggle, the transcription service, Command Mode,
add a Dictionary term), then Settings' "Reset to defaults". Confirm they are
back to default.

- [ ] **Step 4: Import the file back**

Choose the exported file. Confirm the checkbox list shows exactly the
categories the file has (all of them, from Step 2), all pre-checked. Apply.
Confirm every setting you changed in Step 3 is back to what it was at export
time, and any Snippets/Recipes you had are present (not duplicated).

- [ ] **Step 5: Partial export, partial import**

Export with only "Sounds" and "Snippets" checked. Confirm the file has no
`recording`, `transcription`, etc. keys at all. Import it and confirm the
import screen offers only Sounds and Snippets as checkboxes, nothing else.

- [ ] **Step 6: Malformed file**

Hand-edit the exported file to remove the `version` field, or replace its
value with `2`, and try importing it. Confirm a plain refusal message, no
partial application.

- [ ] **Step 7: Duplicate snippets/recipes**

Import the same file a second time without resetting. Confirm the success
message reports 0 created for Snippets/Recipes (or however many are new) and
no duplicate rows appear.

- [ ] **Step 8: Record the evidence**

Note the result of each check in the commit message or the PR body.

---

## Self-review

**Spec coverage.** Category map and the completeness guarantee: Task 1.
Build and export: Task 3. Parse, inspect, and apply, including the
overwrite-vs-additive split and per-field skip: Task 4. Recipes' missing
`.all` and its import validation: Task 2. The checkbox UI, shared both
directions: Tasks 5 and 6. The failure table's rows: `NotJson` /
`UnsupportedVersion` in Task 4's parser, the per-field skip in Task 4's
`applySettingsBundle`, the empty-selection disabled button in Task 6, the
duplicate-count reporting in Task 4 and 8.

**Not covered by an automated test, on purpose.** The actual file download
and file-picker round trip (Task 6, no test), verified by hand in Task 8.

**Deferred, per the spec.** Recordings, cloud/automatic backup, a schema
migration UI beyond the bare `version` field, and per-field conflict
resolution on import. No task touches any of them.
