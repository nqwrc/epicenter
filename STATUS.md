# status

state: active
remote: github-public
updated: 2026-09-08
stale-after-days: 30

## kpi
| kpi | target | current | as-of |
|---|---|---|---|
| fork-pr-open | 0 | 1 (nqwrc/epicenter#1, 100 commits, +16330 -2054, base main) | 2026-09-07 |
| upstream-prs-by-nqwrc | 1 | 0 | 2026-09-07 |

## focus
- Fork of epicenter-md/epicenter (remote `origin`), work on `feature/whispering-snippets` pushed to `fork` (nqwrc/epicenter): Windows dictation finishes a round trip, then the recording pill, snippets, voice commands and settings become portable; imported recipes and app rules are treated as content, not directives, and Polish drops the words the speaker did not mean to say.
- The upstream repo keeps its own AGENTS.md/CLAUDE.md (Codex owns execution, Claude is an advisory lane): this file is the harness kit only and stays out of any upstream PR.

## next
- Decide whether the branch goes upstream as one PR or is split (platform fixes first, then pill, snippets, commands, settings); rebase on origin/main before either.
- `transcriptionPrompt` defaults to empty (app.ts:138) and is the only disfluency lever that works with Polish off, which is the fresh-install state. A clean-prose default biases the first pass; it is provider-dependent and interacts with the dictionary matcher ADR-0099 defers, so it needs measuring before it is changed.
- Untracked .sentry-native/ and a modified .claude/settings.local.json sit in the working tree: gitignore the first, keep the second local.

## blockers
- none
