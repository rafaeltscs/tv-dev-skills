# Spatial (Directional) Navigation

When the user presses a direction, something has to decide *which* element
gets focus next. There are two strategies. Pick one per container
deliberately; don't half-use both.

## Strategy 1: tracked index

The container keeps an integer (or row/column pair) for the selected
child and moves it on each press. Focus is delegated to
`children[index]`.

```js
handleRight() { if (this.index < this.lastIndex) { this.index++; this.refocus(); } }
handleLeft()  { if (this.index > 0)             { this.index--; this.refocus(); } }
```

Best for the common cases: a rail, a single-column list, a uniform grid, a
menu. It's predictable, cheap, testable, and never "jumps" to a
surprising element. **Default to this.**

## Strategy 2: geometric resolution

The navigation system knows every focusable element's on-screen rectangle.
On a direction press it:

1. Filters to candidates that lie in that direction from the current
   element.
2. Scores each by a weighted distance — distance *along* the axis of
   travel (primary) plus distance *perpendicular* to it (secondary), with
   elements that overlap the current one on the perpendicular axis
   strongly preferred over diagonal ones.
3. Focuses the lowest score.

The reference points used for the measurement matter: near corners give
precise matching for uniform grids; full edges are more forgiving for
rows of varying-size items; centre points suit sparse, scattered layouts.
Libraries expose this as a `corners` / `edges` / `center` option.

Best for layouts that aren't a clean 1-D or 2-D array: a hero area with
overlaid buttons, a settings page mixing a sidebar with inline controls, a
sports scoreboard. The cost is unpredictability — misaligned elements
produce "why did it go *there*" moments — so verify it visually with the
library's debug overlay rather than trusting the scores.

## Hybrid

A large app is usually: geometric resolution *between* top-level regions
(nav bar ↔ content ↔ side panel), index tracking *inside* each region
(the rail, the grid). A container can also override just one axis — "left
and right are my index, up and down bubble to the screen."

## Edge behavior — decide it explicitly

When focus is on the last child and the user presses further in that
direction, the container must do one of:

| Behavior | When to use |
|---|---|
| **Pass through** (let it bubble, parent moves focus elsewhere) | The default for most containers — right off the last card moves to whatever is right of the rail, or nothing. |
| **Trap** (consume, focus stays put) | Modals and any region focus must not leave until dismissed. See `ui-patterns.md`. |
| **Wrap** (last → first) | Use sparingly. Acceptable for a short, closed set the user cycles (a segmented toggle, an A–Z picker). Disorienting for content rails — the user can't tell they've looped. |
| **No-op** (consume, nothing happens) | Rare; only when bubbling would move focus somewhere genuinely wrong and there's no better target. |

Whatever you choose, be consistent across siblings — one rail that wraps
and three that don't will feel broken.

## Off-screen candidates and scroll-into-view

Focus and scroll are independent on a TV — moving focus does not scroll
anything on its own. The owning container must, on every focus change,
scroll/translate its viewport so the focused child sits comfortably in
view (not jammed against the edge — keep a margin, and for rails many apps
keep the focused item pinned at a fixed position and move the strip
beneath it).

Two ordering rules:

- Move focus first, then scroll to the new focused element — not the
  reverse.
- If a container virtualizes its children (only mounts what's near the
  viewport), make sure the element you're about to focus is realized
  *before* you focus it, or focus lands on nothing.

## Focus guides / redirects

Geometric resolution fails when there's no candidate in a direction but
there logically should be one — a gap in a ragged grid, a narrow button
that doesn't overlap the wide element above it. The fix is a **focus
guide**: an invisible redirect that says "a press in this direction from
this region goes to *that* specific element." Android exposes it as
`TVFocusGuideView` / `nextFocusDown` attributes; other stacks let a
container supply an explicit resolver function. Use it to paper over
layout gaps rather than nudging the visual design to satisfy the
algorithm.

## RTL

In right-to-left layouts, swap the *meaning* of Left and Right: pressing
Right moves to the element that is visually to the left, matching reading
order. Up/Down are unchanged. Navigation libraries have an `rtl` flag that
does this globally; if you hand-roll index math, the container's "next" is
`index - 1` for a Right press under RTL. Don't also swap it in the key
map — do it in one place.

## Relationship to framework mechanics

`lightningjs-v2-conventions/references/focus-and-input.md` shows the
index-tracking pattern in Lightning (`_getFocused()` +
`_handleLeft/_handleRight` + `_refocus()`); Lightning v2 has no built-in
geometric resolver, so strategy 2 there means a navigation library or your
own rectangle math. React apps typically get both strategies from the
navigation library.
