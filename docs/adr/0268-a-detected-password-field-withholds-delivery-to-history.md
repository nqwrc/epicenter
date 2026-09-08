# 0268. A detected password field withholds delivery to history

- **Status:** Accepted
- **Date:** 2026-08-31
- **Amends:** [ADR-0040](0040-a-cursor-write-that-cannot-paste-falls-back-to-the-clipboard-decided-from-the-grant.md) at its no-history-only rule: a refusal announced to the user is not the accidental stranding it abolished.

## Context

Nothing stopped a dictation from pasting into a password field, or a secret
spoken near one from being copied to the clipboard. The host can now ask the
platform whether the focused UI element is a secure field: UI Automation's
`IsPassword` on Windows, the `AXSecureTextField` role on macOS behind the
Accessibility grant the paste path already reads (`get_foreground_context` in
`src-tauri/src/foreground.rs`).

Both probes are flaky exactly where users live: elevated target windows,
remote desktop, some Electron apps, a missing grant. A guard that converts
that flakiness into "dictation randomly refuses to deliver" would kill trust
in the whole app.

## Decision

**Only an affirmative secure verdict blocks; everything else passes.** The
probe answers `secure`, `notSecure`, or `unknown`, and `unknown` always fails
open. The guard is defense-in-depth against the common accident of focus
sitting in a password box, not a security guarantee, and the settings copy
says so plainly.

**The withhold is total, and it lands in history.** When delivery re-probes at
paste time and gets `secure`, the ledger sink substitutes for whatever was
configured: no synthetic paste, and no clipboard write either, because
"copied to clipboard" beside a password field invites the exact wrong paste.
The transcript survives on the recordings row, and the dictation pill shows a
persistent "kept in history" outcome instead of a green delivered receipt.
This reintroduces a deliberate history-only ending, which ADR-0040 abolished
for accidental stranding; an announced refusal is a different thing from text
silently marooned where nobody looks, so ADR-0040's rule now reads "never
strand accidentally".

**Delivery re-probes; routing does not.** The guard protects wherever the
paste physically lands, which is the focus at paste time. A residual race
remains between the probe and the synthetic paste's settle sleeps; it is
accepted, the same trade the backspace-count undo already makes.

**The capture gate is opt-in.** A second toggle
(`secureFieldCaptureGateEnabled`, default off) refuses to start a manual
recording while a password field has focus. It is the only part that keeps a
dictated secret from ever reaching a cloud transcription or Polish provider,
but it is also the only part that can visibly refuse a recording, so it ships
off while the delivery withhold (`secureFieldGuardEnabled`) ships on. It
gates manual capture only: a VAD session is armed once and speaks much later,
so a focus check at arming time would attest to nothing.

Both toggles live on Privacy & Processing, because "what may leave the
device" is that page's territory (ADR-0101).

## Consequences

- The pure decision is one function (`operations/secure-field-guard.ts`),
  tested apart from the platform probes; `deliverToSink` is the one funnel
  every delivery already passes through, so no caller can skip the guard.
- A `DeliveryOutcome` now carries `withheld`, and the dictation lifecycle has
  a `withheld` outcome the pill renders like a reduced reach: amber, and
  persistent until the next dictation, because no landed text corroborates it.
- On macOS without the Accessibility grant the guard is silently inert
  (`unknown`), and the Privacy & Processing row reuses the existing grant
  prompt flow rather than adding an onboarding step.
- An undo ("scratch that") has nothing to take back after a withhold, so the
  pipeline records no last delivery for one.
