# Settings import and export

**Status**: Draft
**Type**: Feature (new export/import surface generalizing an existing pattern)
**Scope**: `apps/whispering/src/lib/whispering/`, `apps/whispering/src/lib/workspace/index.ts`, `apps/whispering/src/routes/(app)/(config)/settings/`

## Problem

Every preference in `settingsKv` (sounds, output delivery, recording
behavior, transcription provider/model choices, Dictation and Polish,
Command Mode, Dictionary, shortcuts, analytics, and now the recording pill's
position) lives only on the device it was set on, with no way to move it.
Snippets already have a working export/import pair
(`snippets-export.ts` / `snippets-import.ts`); Recipes and every kv
preference have none. Setting up a new install, or recovering after a reset,
means redoing every one of those choices by hand.

## Bundle scope and shape

One JSON file, one checkbox screen, both directions. The categories are named
groups of `settingsKv` keys that mirror the existing Settings sub-pages, plus
the two content tables that have no page of their own for this purpose yet:

| Category | Keys |
| --- | --- |
| Sounds | `sound*` (8 keys) |
| Output delivery | `output*` (6 keys) |
| Recording | `recordingTrigger`, `recordingPausePlayback`, `recordingAutoUpload`, `recordingOverlay*` (the pill position, 4 keys) |
| Transcription | `transcriptionService`, every `transcription*Model`, `transcriptionLanguage`, `transcriptionPrompt` |
| Processing | `completionProvider`, `completionModel` |
| Dictation & Polish | `polishEnabled`, `polishInstructions` |
| Command Mode | `commandModeEnabled` |
| Dictionary | `dictionary` |
| Shortcuts | every `shortcut*` key |
| Analytics | `analyticsEnabled` |
| Snippets | the whole `snippets` table |
| Recipes | the whole `recipes` table (user-owned rows only; built-ins ship in code and are not exportable data) |

Recordings are out of scope entirely: they are audio blobs with per-item
download and a markdown export already; a JSON settings bundle is the wrong
shape for them.

```ts
type SettingsBundleFile = {
	version: 1;
	exportedAt: string; // ISO instant
	preferences: Partial<Record<PreferenceCategory, Record<string, unknown>>>;
	snippets?: { trigger: string; replacement: string }[];
	recipes?: { name: string; instructions: string; icon: string | null }[];
};
```

Only checked categories appear as keys. `version` exists so a future
incompatible reshape can be detected and refused rather than silently
misapplied; there is no migration path yet because there is nothing to
migrate from.

**No secrets to redact.** None of Whispering's settings hold API keys:
credentials are host-brokered separately (ADR-0226), never part of the CRDT
document this bundle reads from. Confirmed by inspecting every field in
`settingsKv`, not assumed.

## The completeness guarantee

The part that actually answers "make sure new settings are always included":
a test asserts every key in `settingsKv` (read at runtime off
`whisperingDefinition.kv`, not hand-copied) belongs to exactly one category in
the export's own category map. Add a setting later and forget to categorize
it, and this test fails at build time, not at some future point where a user
notices their backup is missing something. This is an invariant, not a
checklist entry to remember.

## Mechanics

**Export.** Pick categories via checkboxes (all checked by default), hit
Export, get one file. Reuses `exportSnippets`'s underlying row-mapping logic
for the Snippets category rather than a second implementation; Recipes gets a
parallel export (none exists today).

**Import.** Pick a file. The screen shows checkboxes only for categories the
file actually contains (pre-checked, individually uncheckable) — so import
gets the same picker as export, in both directions, per the request. Hit
Apply.

**kv categories overwrite.** A boolean, a select, a string: none of them has
a meaningful "merge". The import screen states plainly that a checked
category replaces the matching current values. A field present in the
category's own key list but missing from the imported JSON (an older export,
predating a setting this version added) is left untouched rather than reset
to a default: the import is a paste on top, not a wholesale replacement of
the category if the file is a partial snapshot of it.

**Snippets and Recipes stay additive.** Dedupe against what already exists,
report a count, never overwrite silently, matching `importSnippets`'s
existing convention exactly. Recipes dedupe by exact `name` match
(case-insensitive), the closest analogue to how Snippets dedupe by trigger,
since a recipe has no other natural collision key.

**Per-field validation, not per-category.** A malformed value inside an
otherwise-good category does not fail the whole category: it is skipped and
counted, the same "drop the bad entry, keep the rest" rule
`parseSnippetsImport` already applies to individual rows. A field whose
runtime type does not match its current default's type (a string where a
number belongs, for instance) is the concrete check; it catches the ordinary
corruption case (hand-edited JSON, a very old or very new export) without
this feature re-declaring every field's exact allowed domain a second time.

## Where it lives

A new "Import & Export" page in the Settings sidebar, alongside
Dictation/Recording/Shortcuts/etc. The Snippets page keeps its existing
quick export/import buttons as a shortcut for that one library; both routes
call the same underlying functions, so there is exactly one implementation of
"export snippets to JSON," not two that can drift.

## Failure handling

| Situation | Behavior |
| --- | --- |
| The chosen file is not JSON, or has no recognizable shape | Import refuses with a plain message; nothing is applied |
| `version` is missing or is not `1` | Import refuses: "This file isn't a format Whispering recognizes" |
| A category the file claims to have is empty or malformed at the category level | That category is dropped from the available-to-import list, others are unaffected |
| A field inside a checked category fails its type check | That one field is skipped and counted; the rest of the category still applies |
| Export selection is empty (nothing checked) | The Export button stays disabled; there is nothing to name a click here |
| Snippets/Recipes import finds only duplicates | Reports 0 created, N skipped, same as `importSnippets` already does |

## Testing

- Unit: the category-to-keys map is exhaustive and non-overlapping against
  every real settings key (the completeness guarantee above).
- Unit: building a bundle includes only checked categories and their exact
  keys; building with every category checked round-trips through applying it
  back and reproduces the original values.
- Unit: applying a bundle overwrites only checked-and-present categories,
  leaves an unchecked category untouched, and skips a single malformed field
  without dropping its whole category.
- Unit: Recipes import dedupes by name the way Snippets import dedupes by
  trigger (extending the existing snippets-import test file's shape).
- Manual: export everything, reset all settings, import the file back, spot
  check a setting from each category actually returned.

## Deferred / Non-goals

- **Recordings.** Audio blobs, already served by other means; out of scope
  entirely, not just deferred.
- **Cloud or automatic backup.** Manual, user-triggered, local file only,
  matching every other export/import already in the app.
- **Schema migration UI.** The `version` field makes a future reshape
  representable; writing the migration itself is a problem for whenever a
  version 2 actually exists, not now.
- **Per-field conflict resolution on import** (e.g. "keep mine" vs "use
  imported" per individual setting). Whole-category overwrite only; finer
  granularity is more UI than the request asked for.
