# Fixing up/down navigation on the home screen

## What was actually wrong

Two separate bugs, and they were fighting each other:

1. **`Rail` was eating up/down.** `Rail.handleUp()` / `handleDown()` did
   `this.index = 0; this.refocus(); return true;`. That's the "jumps back to
   the first card" you're seeing — every up/down press resets the rail's
   selected card. And because it returns `true`, the key is marked handled
   and never bubbles to the `HomeScreen`, so the screen never gets a chance
   to move focus to another rail.

2. **`HomeScreen` had no up/down handlers at all.** Even if the key did
   bubble up, nothing up there moved focus between rails, and
   `getFocused()` was hard-coded to `this.children[0]`, so the screen could
   only ever point at the first rail.

The division of labour for a vertical stack of rails is: **the rail owns
left/right, the screen owns up/down.** The rail should simply not have
up/down handlers, so those keys bubble to the screen.

## The fixes

### `rail.js`

- **Removed `handleUp` / `handleDown` entirely.** With no handler, the
  framework bubbles those keys to `HomeScreen`. The rail no longer touches
  its `index` on a vertical press, which is what makes focus memory work
  (see below).
- **Bounds-checked `handleLeft` / `handleRight`.** They were doing bare
  `this.index--` / `this.index++` with no guard, so mashing left on the
  first card drove `index` to `-1` and `getFocused()` returned `undefined`
  (dead remote). Now each edge returns `false` (pass-through) so the press
  bubbles to the screen instead of corrupting the index.
- **Added `scrollToFocused()`** — sets `this.scrollX` so the focused card
  is pinned near the left third of the viewport. Called on every
  left/right move, and by `HomeScreen` when focus re-enters the rail.

### `home-screen.js`

- **Added `handleUp` / `handleDown`** that move `this.index` between rails,
  bounds-checked. At the top rail, up returns `false`; at the bottom rail,
  down returns `false` — pass-through, so an app shell / top nav could take
  over later. Nothing above or below today means it's just a harmless
  no-op instead of the rail resetting itself.
- **`getFocused()` now returns `this.children[this.index]`** instead of
  always `[0]`, so the screen can actually point at the focused rail.
  Initial focus is still deliberately rail 0.
- **Per-rail focus memory comes for free.** Each `Rail` instance keeps its
  own `index`, and nothing resets it now. When `moveToRail()` lands on a
  rail, that rail still has the index of the card the user last had
  focused on it; we just call `rail.scrollToFocused()` to re-sync its
  horizontal scroll to that card.
- **Added `scrollToFocused()`** — sets `this.scrollY` so the focused rail
  sits in a stable band a fixed margin below the top. Called on every
  up/down move.

Order of operations in `moveToRail()` matches the "move focus first, then
scroll" rule: update `index`, sync the target rail's horizontal scroll,
scroll the stack vertically, then `refocus()`.

## Note on stale data

Focus memory is only correct while a rail's contents are stable. If you
later reload a rail's items (pagination, a filter, a personalised reshuffle),
reset that rail's `index` to `0` at the same time — a remembered index into
swapped-out data lands nowhere sensible.

## `rail.js`

```js
// Generic TV UI framework — see _framework.md for the conventions.
//
// A Rail is one horizontal strip of Cards inside a vertically-stacked
// HomeScreen (see home-screen.js).
//
// Ownership (TV focus & navigation conventions):
//   - The rail owns Left/Right. It tracks the selected card index and
//     translates the strip so the focused card sits at a stable on-screen
//     position.
//   - Up/Down are NOT the rail's job. The rail has no handlers for them, so
//     they bubble to the HomeScreen, which moves focus to the rail
//     above/below.
//   - The rail keeps `index` when focus leaves it, so when focus comes
//     back the last-focused card is restored — never card 0.

import { Card } from './widgets.js';

// Layout constants — abstract units; a real renderer would treat them as px.
const CARD_WIDTH = 300;
const CARD_GAP = 20;
const CARD_STRIDE = CARD_WIDTH + CARD_GAP;
// Pin the focused card near the left third of the viewport rather than the
// centre (the common rail convention).
const RAIL_LEADING = 120;

export class Rail {
  constructor(items) {
    this.items = items;
    this.children = items.map((item) => new Card(item));
    this.index = 0;
    // Horizontal translation of the strip. The renderer applies this as
    // x = -scrollX (or transform: translateX(-scrollX)).
    this.scrollX = 0;
  }

  getFocused() {
    // Defensive: keep the index in range even if `items` ever changes.
    if (this.index > this.children.length - 1) {
      this.index = Math.max(0, this.children.length - 1);
    }
    return this.children[this.index];
  }

  handleLeft() {
    if (this.index === 0) return false; // left edge — let the screen decide
    this.index--;
    this.scrollToFocused();
    this.refocus();
    return true;
  }

  handleRight() {
    if (this.index >= this.children.length - 1) return false; // right edge
    this.index++;
    this.scrollToFocused();
    this.refocus();
    return true;
  }

  // No handleUp / handleDown on purpose: they bubble to HomeScreen.

  // Re-sync the horizontal scroll to the focused card. Called on every
  // Left/Right move, and by HomeScreen when focus re-enters this rail.
  scrollToFocused() {
    this.scrollX = Math.max(0, this.index * CARD_STRIDE - RAIL_LEADING);
  }
}
```

## `home-screen.js`

```js
// Generic TV UI framework — see _framework.md for the conventions.
//
// HomeScreen stacks several Rails vertically.
//   - Left/Right are handled inside each Rail (card-to-card).
//   - Up/Down are the screen's job: they move focus between rails. The
//     screen tracks which rail is focused, lets the newly focused rail keep
//     its own last-focused card, and translates the stack so the focused
//     rail stays in a stable band near the top.
//   - At the top / bottom edge, Up/Down bubble (pass-through) so an app
//     shell or top nav could take over. With nothing above or below, that
//     is simply a harmless no-op.

import { Rail } from './rail.js';

// Layout constants — abstract units; a real renderer would treat them as px.
const RAIL_HEIGHT = 360;
const RAIL_GAP = 40;
const RAIL_STRIDE = RAIL_HEIGHT + RAIL_GAP;
// Keep the focused rail this far below the top of the viewport.
const STACK_TOP_MARGIN = 80;

export class HomeScreen {
  constructor(rows) {
    // rows: Array<Array<{ title: string, image: string }>>
    this.children = rows.map((items) => new Rail(items));
    // The screen's initial focus is deliberate: first rail, first card.
    this.index = 0;
    // Vertical translation of the stack. The renderer applies this as
    // y = -scrollY (or transform: translateY(-scrollY)).
    this.scrollY = 0;
  }

  getFocused() {
    return this.children[this.index];
  }

  handleUp() {
    if (this.index === 0) return false; // top edge — let it bubble
    this.moveToRail(this.index - 1);
    return true;
  }

  handleDown() {
    if (this.index >= this.children.length - 1) return false; // bottom edge
    this.moveToRail(this.index + 1);
    return true;
  }

  moveToRail(nextIndex) {
    this.index = nextIndex;
    // The target rail still holds the index of the card the user last had
    // focused on it. Just re-sync its horizontal scroll to that card, then
    // scroll the stack vertically and recompute the focus path.
    this.children[this.index].scrollToFocused();
    this.scrollToFocused();
    this.refocus();
  }

  scrollToFocused() {
    this.scrollY = Math.max(0, this.index * RAIL_STRIDE - STACK_TOP_MARGIN);
  }
}
```
