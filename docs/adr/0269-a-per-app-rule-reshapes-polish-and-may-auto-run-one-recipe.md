# 0269. A per-app rule reshapes Polish and may auto-run one recipe

- **Status:** Accepted
- **Date:** 2026-08-31
- **Amends:** [ADR-0099](0099-replace-transformations-with-a-dictionary-polish-and-a-portable-recipe-library.md) at two points: its runtime ordering gains one optional step between Polish and delivery, and its deferred "auto-running a reshaping Recipe" alternative lands here in the per-context shape it named as the correct version.

## Context

ADR-0099 rejected a global auto-run pin because "the correct version is
per-context (per-app), not a global default you forget is on", and deferred
it. The context is now readable: the host reports the foreground application
(`get_foreground_context`, ADR-0268's sibling capability), so a dictation can
know what it was aimed at.

Dictating into a terminal and dictating into an email client want different
text. Today the only lever is the one global Polish directive.

## Decision

**A rule is a row that binds an app identity to two optional overrides.** The
`appRules` table holds a display name, one identifier per platform
(`matchWindowsExe`, a lowercased exe file name; `matchMacosBundleId`), an
optional Polish directive, an optional recipe id, and an enabled flag. One
rule carries both platform identifiers, so a synced "Terminal" rule
(ADR-0233) works on every device and simply never matches where its field is
null.

**Identity is sampled at capture start and never re-resolved.** The app in
front when the person pressed the hotkey is what they were dictating into; a
slow transcription plus an alt-tab must not silently reshape the text for a
window they never spoke at. The snapshot is in-memory pipeline context only,
never written to the recording row: app usage stays out of the synced
replica. Window titles are refused outright in the host capability, because
they carry document names, URLs, and subjects, the data class this feature
must keep out of prompts, logs, and rows.

**Matching is a pure exact comparison.** Case-insensitive equality against
the platform's own field, no globs; a matcher is `operations/match-app-rule.ts`
and the UI refuses saving a second rule with the same identifier, with row-id
ordering as the deterministic tiebreak sync cannot flip.

**The Polish override rides inside the fixed scaffold.** A rule's directive
replaces `polishInstructions` for that one pass; `buildPolishSystemPrompt`'s
anti-injection scaffold wraps whichever directive arrives, so a rule can
never widen what Polish is allowed to do.

**The recipe auto-run is the one new pipeline step.** ADR-0099's ordering now
reads: transcribe, command-mode intercept, Polish, then, only when a matched
rule names one, a single recipe over the polished text, then snippet
expansion, then one delivery. Best-effort like Polish: a dangling id or a
failed AI call degrades to the polished text with a notice, never a failed
dictation. It is a second AI call on every dictation into that app, which is
why it only ever happens because the person named a recipe on the rule, and
the rule editor says so.

## Consequences

- Rules are edited on a dedicated settings page ("App rules") with a
  "use current app" helper that fills this platform's identifier from the
  foreground probe. The page carries one privacy sentence pointing at the
  Text destination on Privacy & Processing, which stays the single owner of
  destination facts (ADR-0101).
- Commands stay senior to routing: the command-mode intercept runs before the
  rule is even resolved, so "scratch that" behaves identically in every app.
- A recipe-reshaped delivery earns the `polishedTranscript` history write even
  in speed mode, because history should show what actually shipped.
- Elevated windows and other identity refusals degrade to no match and the
  global behavior, unchanged; there is nothing to configure for the failure
  case.
