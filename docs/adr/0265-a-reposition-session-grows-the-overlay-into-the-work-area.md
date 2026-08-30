# 0265. A reposition session grows the overlay into the work area

- **Status:** Accepted
- **Date:** 2026-08-30
- **Relates:** [ADR-0264](0264-the-recording-overlays-position-is-a-snapped-anchor-not-a-pixel-pair.md)
- **Amended by:** [ADR-0267](0267-leaving-a-reposition-session-is-a-press-on-its-own-backdrop.md) at its escape hatch: the Settings control it named cannot be reached while a session runs, so leaving is a press on the session's own backdrop.

## Context

Placing the overlay needs a drag, and the overlay window is 300x72 logical
pixels, transparent, `alwaysOnTop`, and `focusable: false`.

Two things follow from that size, and both were discovered against the running
app rather than reasoned about. A chip-sized window cannot paint an alignment
guide across the screen, so the first design refused guides outright and made
the pill's own movement the only feedback. And dragging the OS window means
`startDragging`, which on Windows posts `WM_NCLBUTTONDOWN` and returns
immediately: it resolves at drag *start*, not at drag end. Tauri exposes no
drag-end signal, so placement had to be inferred from window-move events plus a
settle timer that guessed when movement had stopped.

The window is also `focusable: false`, so it cannot receive a key event. Escape
is not available to leave a session.

## Decision

**For the length of a reposition session the overlay window resizes to the
current monitor's work area, and the pill becomes an ordinary positioned
element inside it.** The session is entered deliberately from Settings, never by
dragging the live pill during a dictation, because that surface's buttons
already claim every click.

Inside one webview the window's coordinates are both CSS pixels and the logical
pixels the anchor model speaks in, so nothing converts between them. The drag is
pointer capture: `pointerdown`, `pointermove`, `pointerup`. Guides are two
absolutely positioned elements. On exit the window resizes back to a chip and
moves to the resolved anchor.

Because the session covers the screen and takes its clicks, it must have a way
out that does not depend on the window being healthy. The Settings control
cancels rather than going dead while a session runs. That cancel asks the
overlay to leave first, so it restores its own geometry the normal way, then
settles the session locally whether or not the overlay answered; the session's
exit path resizes the overlay back to a chip from the main window regardless.

The overlay's Tauri capability grants exactly the window verbs this uses:
`current-monitor`, `set-position`, and `set-size`, and nothing else.

## Consequences

- Alignment guides become possible without a second monitor-sized window whose
  only job is to draw them.
- The drag reports its own end exactly, so the settle timer is deleted and the
  `start-dragging` and `outer-position` permissions are withdrawn rather than
  granted. The mechanism has fewer moving parts than the one it replaces.
- A session is modal: it dims the screen and swallows clicks across it, the way
  a screenshot region selector does. This is deliberate, and it is why the
  cancel path above is required rather than optional.
- A session is confined to one monitor, so the pill cannot be dragged onto
  another display. Nothing is lost: a stored anchor is monitor-relative and
  resolved against the current monitor at show time, so which display it was
  placed on never persisted.
- A denied window permission surfaces as a rejected promise inside the overlay.
  Those are logged rather than swallowed, because a silent no-op is exactly what
  the missing capability looked like the first time it happened.

## Considered alternatives

- **A second, monitor-sized always-on-top window purely to draw guides.**
  Rejected. It needs its own window label, its own capability, and its own
  z-order relationship with the pill, and it leaves the imprecise OS drag in
  place.
- **Keep the OS window drag and infer the end.** Withdrawn. There is no
  drag-end signal in Tauri, so it rests on a settle timer that can fire mid-drag
  whenever a hand pauses.
- **No guides; let the pill's own movement be the feedback.** The original
  decision, withdrawn after use. The pill moving says where it is, not that it
  is aligned with anything.
- **Leave the pill's own close button as the only exit.** Rejected. It is drawn
  by the very window that would be stuck, so it fails in exactly the case an
  escape hatch exists for.
