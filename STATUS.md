# status

state: active
remote: github-public
updated: 2026-09-08
stale-after-days: 30

## kpi
| kpi | target | current | as-of |
|---|---|---|---|
| fork-pr-open | 0 | 1 (nqwrc/epicenter#1, 100 commits, +16330 -2054, base main) | 2026-09-07 |
| upstream-prs-by-nqwrc | 1 | 2 open, 0 merged (EpicenterHQ/epicenter#2498, #2499) | 2026-09-08 |

## focus
- Fork of EpicenterHQ/epicenter (remote `origin`, pointed at the current URL on 2026-09-08: the org renamed from `epicenter-md`, and GitHub redirects the clone URL but the search API rejects the old name). Work on `feature/whispering-snippets` pushed to `fork` (nqwrc/epicenter): Windows dictation finishes a round trip, then the recording pill, snippets, voice commands and settings become portable; imported recipes and app rules are treated as content, not directives, and Polish drops the words the speaker did not mean to say.
- The upstream repo keeps its own AGENTS.md/CLAUDE.md (Codex owns execution, Claude is an advisory lane): this file is the harness kit only and stays out of any upstream PR.

- Two upstream PRs are open against EpicenterHQ/epicenter, both cut from `origin/main` at base 825a9954a6 and pushed to `fork` on 2026-09-08 with Nicola's word. Opened, not merged: the KPI target of 1 is met by count, the M0 evidence contract is not, since that reads on a merge. `nqwrc/epicenter#1` targets the fork's own main with 117 commits over 219 files and can never be the upstream PR - it is the holding pen the slices come out of.
  - #2498 `feature/windows-tauri-build` (2 commits, 4 files, +45): the host does not compile on Windows and its tests cannot start. Reproduced from clean `origin/main` in order - `tauri-build` panics on the missing `icons/icon.ico`, then `E0599` on the macOS-only `RunEvent::Reopen` at `lib.rs:822`, then `cargo test --lib` links but dies at `STATUS_ENTRYPOINT_NOT_FOUND` because cargo's test executables carry no manifest and bind comctl32 v5.82. Verified on origin/main, not on the working branch: all 8 workflow jobs in `.github/workflows` run Linux, none asks for a Windows or macOS runner, and `auto.release.yml` is held behind `if: false` until v8.0.0. After the branch, `cargo check` is clean and the suite runs: 109 passed, 9 failed.
  - #2499 `feature/windows-cpu-fallback` (1 commit, 1 file, +10 -27): addresses upstream #840, open since 2025-09-26 and labelled bug/windows/Critical. `load_gguf_model` named a backend per target, and naming one is a hard requirement - an explicit `Backend::Vulkan` on a machine without the runtime returns `TRANSCRIBE_ERR_BACKEND` instead of degrading. `Backend::Auto` is documented as "CPU is the always-present fallback" and is already what `bench/backend-latency` uses. No `Closes #840`: the reporter is on a 7.5.0 binary describing a startup crash, and the only mechanism reproduced here is the model-load path in the current tree, so the issue is left for the maintainer to judge. `cargo check` on this branch alone cannot run on Windows - it has no `icon.ico` and an unguarded `Reopen` - so the clean check was measured with #2498 applied, and the PR body claims nothing else.
  - The 9 remaining test failures are in `app_data` and `recorder` (platform-root resolution, blob staging), which is what `96c249072d` fixes - but that commit also bumps `@tauri-apps/plugin-http` and `bun.lock`, so it needs a scope decision before it becomes the third slice. #848 (tray, 18 reactions, top of the tracker) is untouched by all 117 commits: the branch has the recording pill, which is a different thing.

## next
- Watch #2498 and #2499 for maintainer review; neither has CI that can run them, since no upstream workflow builds on Windows. A merge, not the opening, is what M0 reads as evidence.
- Decide the scope of slice 3 (the 9 Windows test failures) given that `96c249072d` mixes Rust fixes with a JS dependency bump.
- Decide whether the branch goes upstream as one PR or is split (platform fixes first, then pill, snippets, commands, settings); rebase on origin/main before either. Measured 2026-09-08 (the clone was shallow until then, so earlier divergence numbers were graft artifacts): fork point 3ef2103a72 on 2026-08-27, upstream 497 commits ahead, 78 of them breaking. A trial `git merge-tree` conflicts on 40 files, of which 24 are free because our only edit there is the formatter commit ee777c80ae; the cost is not the markers but that workspace/index.ts and the rest of our store code face a rewritten data vocabulary. Deliberately not merged: 37 upstream commits touch apps/whispering and nearly all are refactor(data)! dragging it along as a consumer. Exactly one is a fix(whispering), and it repairs a hazard upstream introduced in the same window. Merge, not rebase, when it happens: a rebase rewrites 119 commits and needs a force push.
- `transcriptionPrompt` defaults to empty (app.ts:138) and is the only disfluency lever that works with Polish off, which is the fresh-install state. A clean-prose default biases the first pass; it is provider-dependent and interacts with the dictionary matcher ADR-0099 defers, so it needs measuring before it is changed.
- .claude/settings.local.json is tracked upstream but holds machine-local auto-mode config, so it carries a local skip-worktree flag: the tree reads clean and the flag shows up in `git ls-files -v` if a rebase ever trips on it. Asking upstream to untrack it is still the durable fix; .sentry-native/ is gitignored.

## blockers
- none
