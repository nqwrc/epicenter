# 0267. Leaving a reposition session is a press on its own backdrop

- **Status:** Accepted
- **Date:** 2026-08-30
- **Amends:** [ADR-0265](0265-a-reposition-session-grows-the-overlay-into-the-work-area.md) at its escape hatch: the way out lives inside the session, not in Settings.

## Context

ADR-0265 decided that a session covers the screen and takes its clicks, and that
the way out was a Settings control which cancels rather than going dead. Running
it showed that control cannot be reached. The session window is `alwaysOnTop`
and spans the work area, so a press aimed at Settings lands on the session and
is ignored. The escape hatch was drawn on the one surface the session hides.

The failure it was built for also turns out to be narrower than assumed. The
window only grows inside the session's own entry path, so a session that is
covering the screen has already proved its webview responds. "Grown but wedged"
needs a webview that resized and then stopped answering, which is a far smaller
target than "the person wants out".

## Decision

**A press on the session's backdrop cancels it.** The session already receives
every press on the screen; that is what made the previous answer unreachable and
what makes this one always reachable. Cancel rather than save, because a stray
press is likelier than a deliberate one and cancel is the outcome that loses
nothing.

Presses inside the pill are a drag starting, not a request to leave, so only a
press whose target is the backdrop itself counts. A line of text at the top of
the session says so, because an invisible gesture is not an escape hatch either.

The Settings control still cancels, and still settles the session locally
whether or not the overlay answers. It is now understood as the path for when
another window has been raised over the session, not as the primary way out.

## Consequences

- The way out is always reachable, because it lives on the surface that is
  guaranteed to be in front.
- A session can be left without committing a placement, by a gesture people
  already expect from dismissing a modal.
- A deliberate press on the backdrop while intending something else cancels the
  session. The cost is re-entering it; nothing is lost.
- ADR-0265's three-layer claim is withdrawn. Two layers survive: this gesture,
  and the main window's force-restore of the overlay geometry on exit.

## Considered alternatives

- **Drop `alwaysOnTop` for the session so Settings can be raised over it.**
  Rejected. The main window is the window that was just clicked, so the session
  would open behind it and be invisible from the start.
- **Register a global shortcut for the session's duration.** Rejected as
  disproportionate. It reaches for the one grant that can collide with a
  person's own shortcuts, to serve a failure mode that the entry path makes
  nearly unreachable.
- **Keep the Settings control as the only way out.** Withdrawn: it is the
  control the session covers.
