# 0266. A settings bundle overwrites preferences and appends tables

- **Status:** Accepted
- **Date:** 2026-08-30
- **Relates:** [ADR-0206](0206-a-rows-id-comes-from-whoever-knows-it-and-one-relation-holds-every-fact.md), [ADR-0226](0226-a-host-serves-bundles-and-brokers-credentials-it-owns-no-application-data.md), [ADR-0264](0264-the-recording-overlays-position-is-a-snapped-anchor-not-a-pixel-pair.md)

## Context

Every preference in Whispering's `settingsKv` lived only on the device it was
set on. Snippets already had an export and import pair; Recipes and every kv
preference had none, so a new install or a reset meant redoing each choice by
hand.

Moving settings between installs raises one question that the existing snippets
importer did not have to answer. Snippets are rows, and rows append. A boolean,
a select, or a string has no meaningful merge, so a preference has to be
replaced or left alone, and the two kinds of data cannot share one rule.

The other risk is silent omission. A bundle that quietly drops a setting added
after it was written is worse than one that refuses, because nothing surfaces
until someone restores a backup and finds a gap.

## Decision

**A bundle is one versioned JSON file, selected by category in both
directions. A checked preference category replaces the matching current values;
a checked table category is appended to what is already there.**

The file carries `version: 1`, an `exportedAt` instant, a `preferences` object
keyed by category, and optional `snippets` and `recipes` arrays. A category the
export did not include is absent rather than empty, so the import screen offers
exactly what the file carries. Row ids never travel, because an id is minted by
the store that holds it (ADR-0206).

Preference categories overwrite. A key listed in the category but missing from
the file, which is what an older export looks like, is left untouched rather
than reset: an import is a paste on top, not a wholesale replacement of a
category the file only partly describes. Snippets and Recipes append, deduping
against the live table and reporting counts, never overwriting silently.
Recipes dedupe on name, case-insensitively, being the closest analogue to a
snippet's trigger.

**Every `settingsKv` key belongs to exactly one category, and a test enforces
it.** The map is written by hand rather than derived from a key-name prefix,
because a prefix match is itself the silent-drop hazard: it fails the moment a
key does not fit the pattern it assumes, and it fails quietly. The test reads
the real keys off `whisperingDefinition.kv` at runtime, so adding an
uncategorised setting fails the build instead of shipping a lossy backup.

Validation is per field, not per category. A value is applied only when its
runtime type matches that setting's current default. That catches ordinary
corruption without this feature re-declaring every field's allowed domain a
second time; a wrong-but-same-typeof value still passes, and that residual risk
is accepted.

## Consequences

- A new setting cannot silently escape the bundle. The failure lands on
  whoever adds it, at build time.
- The two data kinds behave differently on import, which the UI has to say out
  loud rather than leave to be discovered.
- Nothing in the bundle needs redacting. No Whispering setting holds a
  credential; those are host-brokered and never part of this document
  (ADR-0226). That was confirmed field by field, not assumed, and it is a
  property to re-check if a secret-shaped setting is ever added.
- The pure bundle builder is a separate module from the download wrapper. The
  wrapper reaches the platform download seam, which pulls in Tauri plugins and
  a `$lib` import that `bun test` cannot resolve, so merging the two back
  together would make the builder untestable.
- The feature is only verifiable in the desktop shell. Whispering's browser
  build cannot boot at all, because several `#platform/*` seams resolve to a
  `.tauri.ts` file with no `default` variant, and the file save dialog is
  Tauri-only regardless.
- `version` makes a future incompatible reshape refusable. Writing the
  migration is deferred until a version 2 exists.

## Considered alternatives

- **Derive the category map from key-name prefixes.** Rejected. It is the
  silent-drop failure the completeness guarantee exists to prevent, and it
  breaks quietly on the first key that does not match its pattern.
- **Replace the Snippets and Recipes tables on import.** Rejected. A table is
  work rather than configuration, and replacing it would delete rows nobody
  asked to lose.
- **Reset a category's missing keys to their defaults.** Rejected. It makes an
  older export destructive in proportion to its age.
- **Per-field conflict resolution on import.** Rejected as more interface than
  the problem needs. Whole-category overwrite only.
- **Include recordings.** Refused outright rather than deferred. They are audio
  blobs with their own per-item download and markdown export; a JSON settings
  bundle is the wrong shape.
- **Validate each field against its full declared domain.** Rejected as a second
  declaration of the schema that would drift from the first.
