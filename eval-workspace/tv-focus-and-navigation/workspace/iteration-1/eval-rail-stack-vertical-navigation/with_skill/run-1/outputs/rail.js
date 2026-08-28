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
