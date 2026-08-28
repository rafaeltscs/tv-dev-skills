# Fixing up/down navigation between rails

## What was wrong

Two bugs, both in `rail.js`:

```js
handleUp() {
  this.index = 0;
  this.refocus();
  return true;
}
handleDown() {
  this.index = 0;
  this.refocus();
  return true;
}
```

1. **`return true` swallows the key.** Per `_framework.md`, a handler that
   returns `true` marks the key handled and stops it bubbling. So up/down
   never reached `HomeScreen`, and `HomeScreen` was the only node that
   could move focus from one rail to the next. It also had no
   `handleUp`/`handleDown` and its `getFocused()` was hard-coded to
   `this.children[0]`, so it had no concept of a "current rail" anyway.

2. **`this.index = 0` throws away your place.** Every up/down press reset
   the rail to its first card. That's the "jumps back to its first card"
   symptom.

There was also a latent bug in `handleLeft`: `this.index--` at card 0
would go to `-1`, and `getFocused()` would then return `undefined`.

## The fix

**`rail.js`**

- **Deleted `handleUp` / `handleDown` entirely.** With no handler, the
  framework bubbles vertical keys to `parent` (the `HomeScreen`), which is
  what moves focus between rails.
- **`index` is left untouched by vertical navigation.** It already lives
  on the instance, so when focus leaves a rail and later returns,
  `getFocused()` naturally hands back the same card the user last had
  focused — not card 0. No extra "remembered index" bookkeeping needed.
- **Clamped `handleLeft` / `handleRight`** so focus can't run off either
  end of the rail. They still return `true` (left/right stays "handled",
  matching the behaviour you said already felt right).
- **Added `scrollX`**, recomputed on every card move, for the renderer to
  follow focus horizontally. Plus `focus()` / `unfocus()` for visual
  state.

**`home-screen.js`**

- **Added `this.index`** — the focused rail — and made `getFocused()`
  return `this.children[this.index]`. The focus path is then
  HomeScreen -> focused Rail -> that Rail's last focused Card.
- **Added `handleUp` / `handleDown`** that move `index` by one, clamped to
  the ends (they return `false` at the top/bottom edge so the key can
  bubble to anything wrapping the HomeScreen; `true` otherwise), then call
  `refocus()`.
- **Added `scrollY`**, recomputed on every rail move, for the renderer to
  follow focus vertically.

The framework in `_framework.md` has no concrete layout/scroll API, so
"scroll to follow focus" is exposed as plain offsets: `HomeScreen.scrollY`
(current rail) and `Rail.scrollX` (current card), both updated on every
focus move. Wire your renderer to read those — the `_syncScroll()`
methods are where you'd swap the simple top-/left-align math for
"only scroll when the target would leave the viewport".

## Updated files

### rail.js

```js
// Generic TV UI framework — see _framework.md for the conventions.
//
// A Rail is one horizontal strip of Cards inside a vertically-stacked
// HomeScreen (see home-screen.js).

import { Card } from './widgets.js';

// Horizontal stride between cards (card width + gap), in px. Only used to
// compute `scrollX` so a renderer can keep the focused card in view.
const DEFAULT_CARD_STRIDE = 320;

export class Rail {
  constructor(items, options = {}) {
    this.items = items;
    this.children = items.map((item) => new Card(item));

    // `index` is the card this rail currently has focused. It lives on the
    // instance, so when focus leaves the rail (user presses up/down) and
    // later comes back, the framework's getFocused() returns the same card
    // the user last looked at here — not card 0.
    this.index = 0;

    this.cardStride = options.cardStride ?? DEFAULT_CARD_STRIDE;

    // Scroll offset a renderer can read to follow focus horizontally.
    this.scrollX = 0;

    // Visual-only flag toggled by focus()/unfocus().
    this.focused = false;
  }

  getFocused() {
    return this.children[this.index];
  }

  focus() {
    this.focused = true;
  }

  unfocus() {
    this.focused = false;
  }

  handleLeft() {
    if (this.index > 0) {
      this.index--;
      this._syncScroll();
      this.refocus();
    }
    // Swallow the key at the left edge too, so focus never falls off the
    // rail into a negative index.
    return true;
  }

  handleRight() {
    if (this.index < this.children.length - 1) {
      this.index++;
      this._syncScroll();
      this.refocus();
    }
    return true;
  }

  // NOTE: there is deliberately no handleUp / handleDown here.
  //
  // The old versions did `this.index = 0; this.refocus(); return true;`,
  // which caused both bugs in the report:
  //   * returning true swallowed the key, so it never reached HomeScreen
  //     and focus could not move between rails;
  //   * resetting index to 0 threw away the user's place in the rail.
  //
  // By not handling up/down at all, the framework bubbles those keys to
  // `parent` (the HomeScreen), which moves focus between rails.

  _syncScroll() {
    // Left-align the focused card. Swap this for whatever "keep the
    // focused card on screen" math your renderer needs.
    this.scrollX = this.index * this.cardStride;
  }
}
```

### home-screen.js

```js
// Generic TV UI framework — see _framework.md for the conventions.
//
// HomeScreen stacks several Rails vertically. Left/Right moves between
// Cards within a Rail (handled by Rail). Up/Down moves focus between
// Rails and scrolls the view to follow.

import { Rail } from './rail.js';

// Vertical stride between rails (rail height + gap), in px. Only used to
// compute `scrollY` so a renderer can keep the focused rail in view.
const DEFAULT_RAIL_STRIDE = 400;

export class HomeScreen {
  constructor(rows, options = {}) {
    // rows: Array<Array<{ title: string, image: string }>>
    this.children = rows.map((items) => new Rail(items));

    // Which rail currently has focus. Each Rail remembers its own last
    // focused card, so the HomeScreen only has to track the row.
    this.index = 0;

    this.railStride = options.railStride ?? DEFAULT_RAIL_STRIDE;

    // Scroll offset a renderer can read to follow focus vertically.
    this.scrollY = 0;
  }

  getFocused() {
    // Delegate into the focused rail; that rail delegates on to the card
    // it last had focused (Rail.index persists across visits).
    return this.children[this.index];
  }

  handleUp() {
    if (this.index === 0) {
      return false; // already at the top rail — let the key bubble
    }
    this.index--;
    this._syncScroll();
    this.refocus();
    return true;
  }

  handleDown() {
    if (this.index >= this.children.length - 1) {
      return false; // already at the bottom rail — let the key bubble
    }
    this.index++;
    this._syncScroll();
    this.refocus();
    return true;
  }

  _syncScroll() {
    // Top-align the focused rail. Swap this for whatever "keep the focused
    // rail on screen" math your renderer needs (e.g. only scroll once the
    // rail would leave the viewport).
    this.scrollY = this.index * this.railStride;
  }
}
```

## Quick trace

- Focus starts at HomeScreen -> rail 0 -> card 0.
- Right, right: rail 0 `index` -> 2, `scrollX` follows.
- Down: Rail has no `handleUp`/`handleDown`, so it bubbles to HomeScreen;
  `handleDown` moves `index` 0 -> 1, `scrollY` follows, `refocus()` lands
  on rail 1 -> card 0.
- Right: rail 1 `index` -> 1.
- Up: bubbles to HomeScreen; `index` 1 -> 0; focus returns to rail 0,
  whose `index` is still 2 — back on the card you left, not card 0.
- Up at the top rail: `handleDown`/`handleUp` return `false`, nothing
  jumps.
