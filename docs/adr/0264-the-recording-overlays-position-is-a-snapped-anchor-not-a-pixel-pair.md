# 0264. The recording overlay's position is a snapped anchor, not a pixel pair

- **Status:** Accepted
- **Date:** 2026-08-30
- **Relates:** [ADR-0039](0039-dictation-feedback-is-a-projection-of-one-lifecycle-state.md), [ADR-0265](0265-a-reposition-session-grows-the-overlay-into-the-work-area.md)

## Context

The recording overlay's placement was one hardcoded formula: horizontally
centred, 72 logical pixels above the work area's bottom edge. Every person got
the same spot regardless of what else lived on their screen, and there was no
setting and no gesture that changed it.

Making it configurable forces a storage question. A dragged window produces a
pixel pair, and storing that pair is the obvious move. It is also the wrong one:
a pair breaks the moment a monitor's resolution or scale factor changes, and
centring, which is the current default's own x axis, has no exact pixel
expression that survives an odd window width.

The first snapping model shipped with a 12 pixel threshold and margins that
otherwise kept whatever distance the drag happened to end at. In use that was
fiddly: most drops produced an arbitrary margin, so finding a good spot took
repeated attempts and nothing confirmed when one was reached.

## Decision

**The overlay's position is stored as an anchor and a margin per axis, and a
drag resolves to the nearest canonical placement.**

The stored shape is four device-KV settings: `recordingOverlayXAnchor`
(`left | center | right`), `recordingOverlayXMarginPx`,
`recordingOverlayYAnchor` (`top | center | bottom`), and
`recordingOverlayYMarginPx`. The default is `center` / `0` / `bottom` / `72`,
which reproduces the replaced formula exactly. A position is resolved against
whichever monitor's work area is current at show time, so one stored anchor
means the same placement on any monitor.

Each axis has three canonical targets: `EDGE_SNAP_MARGIN_PX` (72) from the near
edge, centred, and the same margin from the far edge. A drag landing within
`SNAP_THRESHOLD_PX` (40) of a target locks onto it. Outside every target the
axis keeps its literal measured margin, so free placement still exists as the
deliberate exception rather than the ordinary result. The axes resolve
independently, so every corner and edge midpoint is reachable without
satisfying both at once.

A locked axis draws an alignment guide along it: through the pill's centre when
that axis is centred, along the measured edge otherwise. The guide appearing is
the confirmation that the placement is exact.

Repositioning is not a `RecordingPillStatus` phase. That union is closed over
dictation phases and `RecordingPillAction` over dictation gestures; a placement
mode is neither, and can run with no dictation in progress. It is a sibling
mode on the overlay route with its own event pair.

## Consequences

- A stored position survives a resolution change, a scale-factor change, and a
  move to a different monitor, because nothing stores absolute pixels.
- The nine canonical placements are what an ordinary drag produces. Reaching a
  free margin now takes deliberate effort, which is the intended inversion.
- The snap threshold and the standard margin are two constants, so the feel is
  tunable without touching the model.
- The margin is measured from the work area, not the raw monitor, so a
  placement clears the taskbar or dock by construction.
- A saved margin is not clamped to the current monitor's bounds. Moving to a
  smaller screen can place the pill somewhere unusable. This is the same
  exposure the replaced formula already had and is deliberately left open.
- Per-monitor saved positions are refused. One position, any monitor.

## Considered alternatives

- **Store a raw `{x, y}` pixel pair.** Rejected. It breaks on any resolution or
  scale change, and it cannot express centring, which the default itself needs.
- **A denser guide set (thirds or quarters).** Rejected for now. It is a
  snap-behaviour change, not a structural one, so it can be added later without
  touching the storage model or the event flow.
- **A tight snap threshold with free margins as the norm.** Tried and withdrawn
  after use. It made placement fiddly and gave no signal that a good spot had
  been reached.
- **Widen `RecordingPillStatus` with a reposition phase.** Rejected. Every
  existing `switch` over a closed dictation union would grow a branch that has
  nothing to do with dictation.
