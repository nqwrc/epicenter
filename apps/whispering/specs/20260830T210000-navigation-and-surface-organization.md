# Navigation and surface organization: where each function should live

**Status**: Draft
**Type**: Organization (routes, navigation, and which surface owns which control)
**Scope**: `apps/whispering/src/routes/(app)/`, `apps/whispering/src/lib/components/settings/`

## Problem

Whispering has grown a set of top-level sections and a settings sidebar that no
longer divide along one line. Two changes just landed and make the seam visible:

- Dictation moved out of the settings sidebar and became a top-level section
  (`(app)/(config)/dictation/+page.svelte`), so `polishEnabled`, the dictionary,
  and command mode are now a place rather than a settings page.
- The record screen folded its capture-surface switcher and its pipeline into
  one card (`(app)/+page.svelte`, `_components/CaptureShell.svelte`), so setup
  and steady state are one layout instead of two branches.

Both were the right call for their own reason, and neither was made against a
stated rule for what earns a top-level section. This proposes that rule and then
applies it to everything else.

## The rule

A top-level section is a **thing you keep**: a library of objects that accrues,
that you browse, edit, and reuse.

Settings is **how one machine behaves**: a device, a key, a hotkey, a sound.

Everything else is a **control**, and a control belongs on the surface where the
work happens, not in a list of preferences.

Measured against that:

| Section | Holds | Verdict |
| --- | --- | --- |
| Recordings | transcripts, growing | keep |
| Recipes | named reshapes you author | keep |
| Snippets | trigger/replacement pairs you author | keep |
| Dictation | polish intent, dictionary terms, command mode | keep, as just landed |
| Settings | device, keys, shortcuts, sound, account, data | keep |

Dictation is the interesting case, and it passes: the dictionary is a library
that accrues, and command mode is a vocabulary. The Polish toggle riding along
with them is the part that does not fit, which is the first proposal below.

## Proposals

### 1. Polish belongs to the pipeline, not to a settings page

`polishEnabled` is a per-capture decision presented as a preference. Today it is
set in the Dictation section and reported on the record screen by
`_components/PolishStatusLink.svelte`, which links back to Dictation. The person
reads the status where the work is and travels somewhere else to change it.

Make the pipeline row own it: `PolishStatusLink` becomes a control that toggles
`polishEnabled` in place, in the same footer as the device and transcription
selectors. Dictation keeps the things that are genuinely a library: the polish
instructions, the dictionary, command mode.

Evidence: the link already computes the full state it would need
(`polishStatus(app)` returns `on` / `off` / `needs-key`), and the neighbouring
`_components/CaptureBehaviorPopover.svelte` is already a control, not a link.

### 2. Recording device selection is a control, not a setting

`(config)/settings/recording/` holds `ManualSelectRecordingDevice.svelte` and
`VadSelectRecordingDevice.svelte`, while the record screen renders
`selectors/ManualDeviceSelector.svelte` and `selectors/VadDeviceSelector.svelte`
in the pipeline footer for the same values. Two components, two surfaces, one
setting.

Collapse to one: the pipeline selector is the control, and the Recording
settings page keeps only what is genuinely device policy (bitrate, the capture
behavior toggles). A person who has to think about which microphone is active
is thinking about it while looking at the record screen.

### 3. Privacy & Processing is two pages wearing one name

`settings/processing` currently answers "which transcription provider, with
which key, at which endpoint" and "which completion provider" at once. The
record screen already has to reach into it three different ways for the
transcription half alone: `_components/TranscriptionSetup.svelte` renders
`ProviderConfigFields` inline for a key provider, routes to Epicenter Home for
the on-device route, and links to the page for everything else.

Split it: **Transcription** and **Completion**. They have different providers,
different failure modes, and different consumers. `polishStatus`'s `needs-key`
branch points at the completion half, and the record screen's blocker points at
the transcription half; today both land on the same page and the person has to
find their half.

### 4. The settings sidebar should be ordered by how often it is opened

Current order in `settings/SidebarNav.svelte`: General, Recording, Privacy &
Processing, Shortcuts, Sound, Analytics, Account, Import & Export. That is
roughly the order the pages were written in.

Shortcuts is the page a new person needs first and the page an existing person
returns to most: it is the only place the global hotkey lives, and the record
screen's own hint line links to it. Put Shortcuts second, after General.

### 5. `(config)` no longer names what it groups

The route group holds `recordings/`, `recipes/`, `snippets/`, `dictation/`, and
`settings/`. Four of those five are libraries, not configuration. The group
exists to attach one header (`(config)/+layout.svelte`), and its name now
misleads anyone reading the tree.

Rename it to `(shell)`, or drop the group and move the header into
`(app)/+layout.svelte` beside the nav it already sits with. The second is
smaller and removes a directory rather than renaming one.

### 6. The record screen should not be the only place a blocker is reported

`getTranscriptionReadiness` is consumed by the record screen and by
`CapturePipelineDisclosure` only. `operations/recording.ts` does not consult it:
`startManualRecording` and `startVadRecording` begin capture regardless, and the
failure surfaces later in the pipeline.

That is why the record button being disabled does not actually prevent a
recording started from the global shortcut. Either the operations gate on
readiness and report the blocker themselves, or the button should stop
pretending to be a gate. The first is the honest fix and belongs in the
operations layer, where AGENTS.md already says the logic goes.

## Not proposed

- Merging Snippets into Recipes. They look similar and are not: a snippet is
  verbatim and runs after Polish, a recipe is a reshape you pick. Their own page
  copy says so, and the distinction is worth two sections.
- Moving Recordings under Dictation. Recordings is the largest library in the
  app and the only one with a detail view; it earns the top level on its own.

## Order

1 and 2 are the two that remove a round trip for something a person does every
day. 6 is the correctness one. 3, 4, and 5 are cleanups that can wait for the
next time each file is opened.
