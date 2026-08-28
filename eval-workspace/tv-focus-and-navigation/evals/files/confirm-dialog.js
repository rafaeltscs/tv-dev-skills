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

  handleLeft() {
    if (this.index > 0) {
      this.index--;
      this.refocus();
      return true;
    }
    return false;
  }

  handleRight() {
    if (this.index < this.children.length - 1) {
      this.index++;
      this.refocus();
      return true;
    }
    return false;
  }

  handleBack() {
    this.onCancel();
    return true;
  }
}
