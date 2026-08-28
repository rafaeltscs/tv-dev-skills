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
