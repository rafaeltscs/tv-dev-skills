// Generic TV UI framework — see _framework.md for the conventions.
//
// HomeScreen stacks several Rails vertically. Left/Right already moves
// between Cards within a Rail. Up/Down is supposed to move between Rails
// but currently does nothing useful.

import { Rail } from './rail.js';

export class HomeScreen {
  constructor(rows) {
    // rows: Array<Array<{ title: string, image: string }>>
    this.children = rows.map((items) => new Rail(items));
  }

  getFocused() {
    return this.children[0];
  }

  // no handleUp / handleDown
}
