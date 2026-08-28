// Generic TV UI framework — see _framework.md for the conventions.
//
// A two-button confirmation dialog, shown via AppShell.showOverlay().

import { Button } from './widgets.js';

export class ConfirmDialog {
  constructor({ message, onConfirm, onCancel }) {
    this.message = message;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.children = [
      new Button('Confirm', () => this.onConfirm()),
      new Button('Cancel', () => this.onCancel()),
    ];
    this.index = 0;
  }

  getFocused() {
    return this.children[this.index];
  }

  // --- Focus trap ------------------------------------------------------------
  // A modal overlay must consume EVERY navigation key, including the ones
  // that do nothing (already at an edge, or an axis this dialog doesn't
  // use). Returning false lets the key bubble past the overlay and reach
  // the screen behind it.
  handleLeft() {
    if (this.index > 0) {
      this.index--;
      this.refocus();
    }
    return true;
  }

  handleRight() {
    if (this.index < this.children.length - 1) {
      this.index++;
      this.refocus();
    }
    return true;
  }

  handleUp() {
    return true;
  }

  handleDown() {
    return true;
  }

  handleBack() {
    this.onCancel();
    return true;
  }
}
