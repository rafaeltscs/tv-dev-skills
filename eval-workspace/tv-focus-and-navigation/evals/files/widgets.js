// Generic TV UI framework — see _framework.md for the conventions.
// Trivial leaf widgets shared by the fixtures.

export class Button {
  constructor(label, onEnter) {
    this.label = label;
    this.onEnter = onEnter;
  }

  handleEnter() {
    this.onEnter?.();
    return true;
  }
}

export class Card {
  constructor(item) {
    this.item = item;
  }

  handleEnter() {
    console.log('open', this.item.title);
    return true;
  }
}
