// Generic TV UI framework — see _framework.md for the conventions.
//
// A two-button confirmation dialog, shown via AppShell.showOverlay().
//
// This dialog is a FOCUS TRAP: every directional key is consumed here, at
// every edge, so focus can never move onto the Settings screen behind it.
// Back / Cancel are the same operation and are the only way out.

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
    // Start on Cancel — the non-destructive choice for a sign-out prompt.
    // (Set to 0 if the product wants Confirm pre-selected.)
    this.index = 1;
  }

  getFocused() {
    return this.children[this.index];
  }

  handleLeft() {
    if (this.index > 0) {
      this.index--;
      this.refocus();
    }
    return true; // consume even at the edge — do not let focus escape
  }

  handleRight() {
    if (this.index < this.children.length - 1) {
      this.index++;
      this.refocus();
    }
    return true; // consume even at the edge — do not let focus escape
  }

  // There is nothing above or below inside the dialog, but these presses
  // must still not fall through to the screen underneath.
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
