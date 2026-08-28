// Generic TV UI framework — see _framework.md for the conventions.
//
// A Rail is one horizontal strip of Cards inside a vertically-stacked
// HomeScreen (see home-screen.js).

import { Card } from './widgets.js';

export class Rail {
  constructor(items) {
    this.items = items;
    this.children = items.map((item) => new Card(item));
    this.index = 0;
  }

  getFocused() {
    return this.children[this.index];
  }

  handleLeft() {
    this.index--;
    this.refocus();
    return true;
  }

  handleRight() {
    this.index++;
    this.refocus();
    return true;
  }

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
}
