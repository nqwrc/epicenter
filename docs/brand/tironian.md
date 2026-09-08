# Tironian

The brand system for the dictation product this fork ships, replacing the
Whispering identity inherited from upstream.

Status: proposed, partially executed. What is executed is listed under
"What this branch changed".

## The name

**Tironian.**

Marcus Tullius Tiro was Cicero's secretary. Around 63 BC he built a system of
signs fast enough to write a speech at the speed it was spoken, and the Roman
Senate used it to keep a record of its debates. The system outlived him by a
thousand years; scribes were still writing Tironian notes in the Carolingian
period.

That is the product, and it is not a metaphor. A person speaks at conversational
speed, and something writes it down accurately enough to be the record. The
first tool that did this was not a neural network, and naming the app after it
puts the emphasis where the product's value actually sits: on the transcript
being correct, not on the model being clever.

### Why not a name in the Wispr family

Wispr AI filed for `FLOW` and `FLOW VOICE` on 2024-08-03. Any name carrying
"flow" in this category walks into a live mark. Anything phonetically adjacent
to "Wispr" or "Whisper" does two bad things at once: it reads as a clone of the
competitor, and it collides with OpenAI's model name, which is also the reason
the upstream name was always slightly wrong. "Whispering" describes the input.
The product's job is the output.

### Availability, checked 2026-09-08

| Asset | State |
| --- | --- |
| `tironian.app` | free |
| `tironian.io` | free |
| npm `tironian` | free |
| Registered software mark | none found; the term is historical and public domain |
| Existing collision | `tiro-notes.org`, a note-taking app. Different name, different category. Low risk, worth a second look before any filing. |

`tironian.com` is registered and is not needed.

Distinctiveness matters here. A dictation app called Steno, Aloud, Verbatim or
Dictate is descriptive or suggestive, which is the weak end of trademark law and
the crowded end of the App Store. "Tironian" is arbitrary in this category:
strong to register, and nothing else is standing on it.

### Alternates

Kept in case Tironian is rejected. Both were checked the same way.

- **Verba.** Latin plural for "words". `verba.so` free, GitHub org `verba` free.
  Shorter and easier to spell, weaker as a mark, and Latin-generic enough that
  something in the category will land on it eventually.
- **Notae.** From *notae Tironianae*, the same story told with a shorter word.
  `notae.io` and npm `notae` free. Loses the story unless you explain it, which
  is what a name should not require.

### Pronunciation and short form

`ty-ROH-nee-an`. Four syllables is long for a consumer app, so the system needs
a short form and has one that is better than an abbreviation: the mark.

## The mark

**U+204A, the Tironian et.**

One Tironian note is still in daily use. The Tironian *et* is the shorthand sign
for "and", and it survived Latin, survived into Old English, and is still set on
Irish road signs today. It is the last living character of the first shorthand
system.

As an app icon it works for reasons that have nothing to do with the story:

- One stroke, no interior detail, legible at 16px in a Windows tray and a macOS
  menu bar.
- Not a microphone, not a soundwave, not a purple gradient orb. Every competitor
  in this category ships one of those three.
- It is a real Unicode character, so the wordmark, the favicon, the tray icon and
  a plain-text signature can all be the same shape with no asset pipeline.
- It reads as a mark rather than a letter at a glance, which an ampersand would
  not.

Construction: single weight, flat terminals, the horizontal bar slightly shorter
than an ampersand's would be so it does not read as a `7`. Recording state is
the same glyph in vermilion; idle is ink.

## Positioning

### The one sentence

Tironian is a dictation app that runs the model on your machine, holds your
transcripts in a store you own, and never needs an account to work.

### Against Wispr Flow

Flow is very good and the reading of its architecture is not in dispute: an
Electron shell with native helper processes on both platforms, an accessibility
layer that reads the focused field, a learning loop fed by your corrections, and
a tuned post-processing pass. That is a real product with real engineering in it.

The competitive claim is not "we transcribe better". It is that Flow's best
features are all mechanisms that require sending your working life to a server:
the screen context it reads, the vocabulary it learns from you, the corrections
it feeds back. A person who is fine with that should use Flow.

Tironian is for the person who is not.

| | Wispr Flow | Tironian |
| --- | --- | --- |
| Where the model runs | their servers | your machine by default, or a provider you chose and pay directly |
| Where transcripts live | their account | a CRDT store on your disk, syncing between your own devices |
| Account required | yes | no |
| Source | closed | AGPL-3.0, auditable, forkable |
| Price shape | subscription per seat | the app is free; you pay the inference provider, or nothing when local |
| Reads your screen | yes, that is the feature | no, and that is the feature |

### What the brand is allowed to claim today

This is the part a rebrand usually gets wrong. Verified against the current tree
on this branch:

**True now, claim freely.**

- Local transcription is the shipped default. `transcriptionService` defaults to
  `local`, whisper.cpp over a GGUF the host manages. A fresh install transcribes
  with no key and no network.
- The cleanup pass is on by default. `polishEnabled` defaults to `true`.
- No telemetry by default. `analyticsEnabled` defaults to `false`, and the
  comment beside it states the reason in the terms this brand is built on.
- Transcripts are a local CRDT store that converges across your own devices with
  no server holding the only copy.
- Snippets expand deterministically and never pass through a model, so an
  address or a signature comes out byte-exact.
- Six cloud providers plus a local route, all bring-your-own-key.
- Runs on macOS and Windows from one Tauri codebase.

**Roadmap. Do not put on the site.**

- Reading the focused field or the active app for context. Not built. The
  architecture is understood: a privileged native helper per platform speaking
  JSON over IPC to the app, which is how Flow does it with a Swift helper on
  macOS and a C# one on Windows. Building it here means deciding first what a
  local-first product is willing to look at, which is a product decision and not
  a schedule item.
- A dictionary that grows from your own corrections. The Dictionary exists but
  is hand-maintained, and on a Whisper route it is clipped to 672 characters by
  the decoder's 224-token prompt ceiling.
- Streaming transcription while you speak. The pipeline is one shot today, and
  most of what people mean when they say a competitor "feels better" is this.
- Learning your style over time.

**Known weak spot, fix before any launch.**

- `transcriptionPrompt` defaults to empty, and it is the only disfluency lever
  that works when Polish is off. It is provider-dependent and interacts with a
  dictionary matcher that ADR-0099 defers, so it needs measurement rather than a
  guess. Left unchanged deliberately.

## Voice

The product writes down what people say, so its own copy should read like
something a person said and meant.

- State the mechanism. "The model runs on your machine" beats "privacy-first".
- Name the failure precisely and say what to do. The existing voice-command error
  is already the standard: "Tironian could not confirm the app the last dictation
  went to, so it sent no backspaces. Select the text and delete it instead."
- No exclamation marks, no "seamlessly", no "effortlessly", no "magic". Flow's
  tagline is "Voice-typing made perfect", and competing on adjectives with a
  funded consumer brand is a losing trade.
- Second person, present tense, active voice.
- Feature names stay plain English nouns and are not branded: Dictionary, Polish,
  Snippets, Recipes, Voice Commands, the Pill. The product has one name.

Taglines, in preference order:

1. **Dictation you own.**
2. **It writes what you said.**
3. **Shorthand, since 63 BC.** (About page, not the header.)

## Color

Built from rubrication: scribes wrote the body in ink and the marks that mattered
in vermilion. Two colors and one accent, which is also what survives a 16px tray
icon and a translucent overlay pill on two operating systems.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ink` | `#141210` | `#F4F1EB` | body text, the idle mark |
| `--vellum` | `#F7F4EE` | `#141210` | app ground |
| `--vermilion` | `#C8442A` | `#E05B3F` | recording state, the one accent |
| `--muted` | `#6B655C` | `#948C80` | secondary text, disabled |
| `--rule` | `#E2DCD1` | `#2A2622` | borders, separators |

Warm neutrals rather than the blue-grey default, and vermilion rather than the
indigo-to-violet gradient that every AI product in this category shipped between
2024 and 2026. The accent appears in exactly one place at a time: whatever is
recording.

Contrast: `--ink` on `--vellum` is above 15:1 in both modes. `--vermilion` on
`--vellum` clears 4.5:1 in light and is used for state and iconography rather
than body text.

## Type

- **Wordmark and display:** an old-style or transitional serif with Roman
  inscriptional bones. Newsreader and Spectral both work and are on Google Fonts.
  The wordmark is set in lowercase except the T, tracked slightly open.
- **UI:** the platform stack. `-apple-system` on macOS, `Segoe UI Variable` on
  Windows. A dictation app that borrows the host OS's own UI font is doing the
  thing a first-party app does, and the alternative is shipping a webfont that
  makes every native control look imported.
- **Transcript text:** the UI stack at a longer measure and looser leading. The
  transcript is the product, so it gets reading typography, not chrome
  typography.
- **Monospace:** shortcut chords and model identifiers only.

## Naming architecture

One product name. No sub-brands, no "Tironian Pro", no capitalized feature names.

- The app is Tironian.
- The desktop host that serves it is upstream's Epicenter and keeps its name in
  the code. It is not marketed, and it is not on the download page.
- Package identifiers, TypeScript types and import paths keep the `whispering`
  and `@epicenter/` names. See the next section for why.

## Rename tiers

The word "Whispering" appears 568 times in `apps/whispering/src`. Roughly 520 of
those are identifiers: `WhisperingApp` alone accounts for 277, and
`$lib/whispering/*` for another 106.

**Tier 1, executed on this branch.** Everything a person or a distributor reads:
window and page titles, UI copy, error strings shown to a user, the workspace
title, the package description, the front-door README, and an attribution
NOTICE.

**Tier 2, deliberately not executed.** Type names, file paths, import subpaths,
package names, and code comments.

The reason is measured, not aesthetic. This fork is 497 commits behind upstream,
and a trial `git merge-tree` already conflicts on 40 files, with the store code
facing a rewritten data vocabulary. Renaming `WhisperingApp` to `TironianApp`
would put a conflict on every one of the 155 files that names it, in a tree that
still wants upstream fixes and still has slices going out as upstream PRs. A
rebrand that makes the fork unmergeable has bought a consistent codebase and sold
the ability to keep up.

Tier 2 becomes correct the day this fork stops tracking upstream. Until then the
internal vocabulary is a historical artifact, which is what the file paths in any
long-lived product are.

## Licensing and attribution

Tironian is a modified version of Whispering, which is part of Epicenter
(`EpicenterHQ/epicenter`), under AGPL-3.0.

A rebrand is the moment attribution goes missing by accident, so it is written
into the work rather than added after:

- The AGPL-3.0 license and all copyright notices stay.
- `NOTICE` at the repo root states that this is a modified version, names the
  upstream project and its URL, and dates the fork.
- The README front door credits upstream above the fold.
- Corresponding source stays public, which the AGPL requires anyway once the app
  is served over a network.
- Upstream's marks are not used. "Whispering" and "Epicenter" appear only as
  factual attribution, never as the product name.

## What this branch changed

Branch `feature/tironian-rebrand`, cut from `feature/whispering-snippets` and
never merged back into it, so the upstream slices stay clean.

1. This document.
2. `NOTICE` and README attribution.
3. One source of truth for the product name,
   `apps/whispering/src/lib/constants/brand.ts`, replacing hardcoded literals so
   the next rename is one line.
4. The Tier 1 string rename.

Not changed: any transcription default. The defaults were checked rather than
assumed, and local-first plus Polish-on were already shipping. The one default
that is arguably wrong, `transcriptionPrompt`, is left for measurement.
