# Repositionable recording pill

**Status**: Draft
**Type**: Feature (new interaction mode on an existing window, new settings)
**Scope**: `apps/whispering/src/lib/recording-overlay/`, `apps/whispering/src/lib/recording-pill/`, `apps/whispering/src/lib/workspace/index.ts`, `apps/whispering/src/lib/whispering/app.ts`, `apps/whispering/src/routes/(app)/(config)/settings/`

## Problem

The recording pill's position is one hardcoded formula in
`computeOverlayPosition()` (`recording-overlay/window-manager.tauri.ts`):
horizontally centered, 72 logical px above the work-area bottom edge. Every
user gets the same spot regardless of what else lives on their screen. There
is no settings surface and no interaction that changes it.

## Position model

Generalize the existing formula instead of replacing it. Today's default is
already an anchor-plus-margin statement in disguise: x is centered (no margin
needed), y is anchored to the bottom edge with a fixed margin. Widening that to
a 3x3 anchor grid covers every placement a drag-to-snap interaction can
produce without inventing a second coordinate system:

```
xAnchor: 'left' | 'center' | 'right'
xMarginPx: number   // distance from that edge; 0 when xAnchor is 'center'
yAnchor: 'top' | 'center' | 'bottom'
yMarginPx: number   // distance from that edge; 0 when yAnchor is 'center'
```

Default: `{ xAnchor: 'center', xMarginPx: 0, yAnchor: 'bottom', yMarginPx: 72 }`,
byte-for-byte the current behavior. `computeOverlayPosition()` reads these four
settings instead of the two hardcoded constants; `OVERLAY_BOTTOM_MARGIN`
becomes the default value, not a formula constant.

This stays resolution- and monitor-independent the same way the current
default already is: an anchor+margin is re-evaluated against whichever
monitor's work area is current (`currentMonitor() ?? primaryMonitor()`, the
existing selection logic — unchanged, per the one-position-any-monitor
decision).

**Rejected: store a raw `{x, y}` pixel pair.** Breaks the instant a user's
monitor resolution or scale factor changes, and centering (the default's own
x-axis) has no exact pixel expression that survives an odd window width. The
anchor model is what the current code already assumes; a pixel pair would be a
regression hiding inside a "more flexible" storage shape.

## Reposition session

Triggered from Settings, not from the live pill during an actual dictation —
the overlay window is `focusable: false` and its buttons already claim every
click during real recording (`RecordingPill.svelte`'s stop/cancel handlers
call `event.stopPropagation()`), so overloading that surface with drag would
either fight the existing controls or require a modifier-key contortion. A
dedicated session, entered deliberately from Settings, has neither problem and
matches the "drag it, then save" flow requested.

```
Settings "Reposition" click
  -> main window emits recordingOverlayEnterReposition (with the current
     saved position, so the preview starts exactly where the pill really sits)
  -> overlay switches its render mode from `status`-driven to a reposition
     preview: pill rendered at its `recording`-phase size (the widest state,
     so you place it at the size you actually see while dictating), draggable,
     with an inline confirm row replacing the normal control cluster
  -> drag: overlay calls the current window's startDragging() on pointerdown,
     which resolves when the OS-level drag ends (mouse released); while it
     runs, onMoved samples the live window position so the pill can snap
     itself and update its placement label the moment a snap condition is met
     (see "Snap behavior" — no separate guide-line window)
  -> Save: overlay resolves its final rect to the nearest anchor+margin,
     emits recordingOverlayPositionSaved(position) back to the main window
  -> Reset: same, but with the default anchor+margin, applied and saved
     immediately (no separate confirm)
  -> Cancel / window closed mid-session: overlay re-applies the position it
     started the session with and emits nothing; settings are untouched
```

This reuses the existing main<->overlay event channel
(`recording-overlay/events.ts`, the same `defineWindowEvent`/
`defineWindowSignal` pair `recordingOverlayStatus` and `recordingOverlayAction`
already use) rather than inventing a second transport.

**Not a `RecordingPillStatus` phase.** That union is closed over dictation
phases (`recording`, `transcribing`, `polishing`, `delivered`, `failed`) and
`RecordingPillAction` is closed over dictation gestures (`stop`, `cancel`,
`ship-raw`). Repositioning is neither: it can run with no dictation in
progress and has its own actions (drag, save, reset, cancel). Widening those
two closed unions to carry an unrelated concern would make every existing
`switch` over them grow a branch that has nothing to do with dictation.
Instead the overlay's `+page.svelte` holds a sibling boolean/mode
(`repositioning: boolean`, or a small closed type if reposition ever grows a
second sub-state) that shows the reposition preview instead of the normal
`status`-driven render when true, and the two new events above are their own
pair, independent of `recordingOverlayStatus` / `recordingOverlayAction`.

## Snap behavior

Two guide types, per the chosen option (center lines and edge margin, not a
full thirds/quarters grid) — evaluated independently per axis (x can snap
while y stays free), against a shared threshold (12 logical px) and a shared
standard margin (`EDGE_SNAP_MARGIN_PX`, 72px, the current default's own bottom
margin, reused as the one "comfortable distance from an edge" for any edge):

- **Center**: the window's center is within the threshold of the work area's
  center on that axis → anchor `center`, margin 0.
- **Edge**: otherwise, the window is closer to one edge than the other on that
  axis; if that distance is within the threshold of the standard margin, it
  snaps exactly to the standard margin. Otherwise the literal dragged distance
  is kept (rounded to the nearest px) — a rect is never left un-anchored, it
  simply isn't snapped to a round number.

**No full-screen guide lines.** The overlay window is sized to the pill
(300x72 logical px, not the monitor), so it cannot paint a line spanning the
screen without a second, monitor-sized window purely for that purpose. That
cost isn't worth paying for this feature: instead, the pill itself is the
feedback. It snaps its own visible position to the exact target the instant a
snap condition is met (a small spring, not a jump cut) and a one-line label
beneath the confirm row names the resolved placement ("Center, 72px from
bottom"), updated live as you drag. The "auto lock" the request asked for is
delivered as *the pill locking into place*, not as drawn guides.

## Settings and UI

One new control on the top-level Settings page (`settings/+page.svelte`),
gated on `tauri` the same way `AutostartSwitch` already is — the overlay is a
desktop-only window and this control has nothing to show on a web build:

- A "Recording pill position" field showing the current placement in words
  (e.g. "Bottom center", "Top right") derived from the anchor pair.
- A "Reposition" button that starts the session above.
- A "Reset to default" action beside it.

No dedicated settings sub-page: this is a single field plus two buttons, the
same weight as `AutostartSwitch`, not a page of its own.

## Failure handling

| Situation | Behavior |
| --- | --- |
| `startDragging()` fails to start (no window-manager support) | Reposition session does not enter drag; the confirm row still offers Reset/Cancel, `report.error` once |
| Settings write fails on Save | Overlay reverts to its pre-session position (same as Cancel), `report.error`; nothing is left half-saved because the anchor+margin write is one call |
| Saved anchor/margin is missing or malformed (fresh install, corrupted device KV) | Not an error: `computeOverlayPosition()` falls back to the default constants, identical to today's unconditional behavior |
| Monitor is smaller than the saved margin would place the pill on (e.g. moved to a laptop screen after saving on an ultrawide) | Not handled by clamping in this feature — same exposure the current hardcoded formula already has if a monitor is narrower than `OVERLAY_WIDTH`. Out of scope; flagged under Deferred |

## Testing

- Unit: `computeOverlayPosition()` (or its post-refactor equivalent) against
  all 9 anchor combinations, at a couple of monitor sizes and scale factors,
  confirming the current default (`center`/`bottom`, 0/72) reproduces today's
  exact pixel output.
- Unit: anchor+margin resolution from a raw rect (the function Save uses to
  turn a dragged window rect into the nearest anchor), including the
  mixed-axis case (snaps one axis, keeps a literal margin on the other).
- Manual, in the running Tauri app: enter reposition from Settings, drag to
  each corner/edge/center and confirm the pill snaps and the placement label
  updates, Save and restart dictation to confirm the pill reappears in the
  saved spot, Reset, Cancel mid-drag.

## Files

New: none expected — this composes existing modules rather than adding new
ones (the reposition mode lives inside `recording-overlay/+page.svelte` and
`window-manager.tauri.ts`, which already own the overlay's lifecycle).

Edited: `recording-overlay/window-manager.tauri.ts` (anchor-based
`computeOverlayPosition()`, the two new emit/listen calls),
`recording-overlay/events.ts` (two new event definitions),
`routes/recording-overlay/+page.svelte` (reposition render mode),
`recording-pill/RecordingPill.svelte` or a small sibling component (the
draggable preview + inline confirm row — final call belongs to the
implementation plan, depending on how much the existing component can share),
`workspace/index.ts` (four new kv fields), `whispering/app.ts` (their
defaults), `routes/(app)/(config)/settings/+page.svelte` (the new field +
buttons).

## Deferred / Non-goals

- **Per-monitor saved positions.** One position, any monitor, per the scope
  decision above; revisit if multi-monitor users report the pill landing
  somewhere unusable on a secondary screen.
- **Thirds/quarters (rule-of-thirds) guides.** Center lines and edge margin
  only; a denser guide set is a snap-behavior change, not a structural one, so
  it can be added later without touching the position model or event flow.
- **Dragging the pill during a live dictation**, without going through
  Settings first. Rejected in "Reposition session" above.
- **Clamping to the current monitor's bounds** when a saved margin no longer
  fits (moving to a smaller screen). The current code has the same exposure
  today and this feature does not change that surface.
