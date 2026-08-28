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
