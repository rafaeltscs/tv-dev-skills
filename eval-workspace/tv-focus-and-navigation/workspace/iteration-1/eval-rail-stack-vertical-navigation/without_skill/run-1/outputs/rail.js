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
