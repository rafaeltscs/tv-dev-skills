// Generic TV UI framework — see _framework.md for the conventions.
//
// A row of buttons on the Settings screen. "Sign out" opens a confirm
// dialog as an overlay.

import { Button } from './widgets.js';
import { ConfirmDialog } from './confirm-dialog.js';

export class SettingsRow {
  constructor(app) {
    this.app = app; // the AppShell
    this.children = [
      new Button('Profile', () => openProfile()),
      new Button('Playback', () => openPlayback()),
      new Button('Sign out', () => this.openSignOutConfirm()),
    ];
    this.index = 0;
  }

  getFocused() {
    return this.children[this.index];
  }

  handleLeft() {
    if (this.index > 0) this.index--;
    this.refocus();
    return true;
  }

  handleRight() {
    if (this.index < this.children.length - 1) this.index++;
    this.refocus();
    return true;
  }

  openSignOutConfirm() {
    // Remember which button opened the dialog so focus returns to it
    // exactly, no matter what happens while the dialog is open.
    const openerIndex = this.index;
    const restoreFocus = () => {
      this.index = openerIndex;
    };

    const dialog = new ConfirmDialog({
      message: 'Sign out of your account?',
      onConfirm: () => {
        this.app.closeOverlay();
        signOut();
      },
      onCancel: () => {
        this.app.closeOverlay();
      },
    });

    this.app.showOverlay(dialog, { onClose: restoreFocus });
  }
}
