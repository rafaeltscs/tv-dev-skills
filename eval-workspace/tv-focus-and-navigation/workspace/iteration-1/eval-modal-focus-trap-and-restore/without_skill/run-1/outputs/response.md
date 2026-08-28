# Fixing the sign-out confirm dialog: focus escapes the modal, and doesn't come back

Both symptoms come from the same root cause: **the dialog is drawn as an overlay, but nothing is actually *trapping* focus inside it.** The Settings screen underneath is still mounted and still willing to handle remote keys. Fix that and the "wrong button on close" problem mostly disappears too — but you should also make the return-focus explicit so it never depends on luck.

---

## Bug 1 — left/right leak through to the Settings row behind the dialog

### Why it happens

Look at how keys travel (from `_framework.md`): a key runs on the focused node first, then **bubbles up the focus path** — focused child → parent → parent's parent — and stops as soon as a handler returns `true`.

While the dialog is open the focus path is:

```
AppShell  ->  overlay (ConfirmDialog)  ->  Button ("Confirm" / "Cancel")
```

Now press **Left** while "Confirm" (index 0) is focused:

1. `Button` has no `handleLeft` → bubble.
2. `ConfirmDialog.handleLeft()` runs. `this.index` is already `0`, so it does **not** decrement — and it `return false`. That `false` is the bug: it tells the framework "not handled, keep bubbling."
3. The key now escapes the overlay. `AppShell` has no key handlers, so nothing above the dialog stops it, and it reaches the still-live `SettingsRow`, whose `handleLeft()` happily moves `this.index`.

Same story for **Right** at the last button, and for **Up/Down** always — `ConfirmDialog` has no `handleUp`/`handleDown` at all, so those bubble straight through every time.

The core mistake: **a modal's navigation handlers must swallow the key unconditionally**, including when the key does nothing (already at an edge, or an axis the dialog doesn't use). `ConfirmDialog` only returns `true` when it actually moves the cursor.

### The fix

Two layers, both cheap:

1. **Make `ConfirmDialog` a real focus trap** — every navigation key returns `true`, whether or not it changed anything. Add `handleUp`/`handleDown` that just return `true`.
2. **Add a shell-level backstop in `AppShell`** — while `this.overlay` is set, `AppShell` swallows any navigation key that bubbled up to it. `AppShell` sits directly above the overlay on the focus path, so this guarantees nothing reaches `rootScreen` even if a future overlay forgets to trap something.

---

## Bug 2 — on close, focus jumps to the first Settings button instead of "Sign out"

### Why it happens

`SettingsRow` remembers the focused button in `this.index`. You opened the dialog from "Sign out", so `this.index === 2`. When the dialog closes, `AppShell.closeOverlay()` calls `refocus()`, the framework recomputes the path, `AppShell.getFocused()` returns `rootScreen`, and `SettingsRow.getFocused()` returns `this.children[this.index]`.

If `this.index` were still `2`, focus would land back on "Sign out" correctly. It doesn't, because **Bug 1 already mutated it** — every Left you pressed while the dialog was open walked `SettingsRow.index` down toward `0`. By the time you hit Confirm/Cancel, the row's cursor is sitting on "Profile".

So fixing Bug 1 removes the mechanism that corrupts the index. **But don't stop there.** Relying on "the screen underneath happened to keep its cursor" is fragile — any stray key, a re-render, or a different overlay path can still leave it wrong. The correct TV pattern is **explicit focus save/restore**: capture the element that opened the overlay, and put focus back on it when the overlay closes.

### The fix

1. `AppShell.showOverlay(node, { onClose })` accepts an `onClose` callback and stores it.
2. `AppShell.closeOverlay()` invokes that callback **before** `refocus()`, so the path is recomputed with the cursor already restored.
3. `SettingsRow.openSignOutConfirm()` captures `this.index` at open time and passes a restore function that writes it back.

Now closing the dialog — via Confirm, via Cancel, or via Back — always returns focus to "Sign out", regardless of what happened while it was open.

---

## Changed files

### `app-shell.js`

```js
// Generic TV UI framework — see _framework.md for the conventions.
//
// AppShell is the root node. It renders one root screen and, optionally,
// one overlay on top of it.

export class AppShell {
  constructor(rootScreen) {
    this.rootScreen = rootScreen;
    this.rootScreen.parent = this;
    this.overlay = null;
    this._onOverlayClose = null;
  }

  getFocused() {
    return this.overlay || this.rootScreen;
  }

  // `onClose` is called when this overlay is dismissed, before focus is
  // recomputed — use it to restore focus to whatever opened the overlay.
  showOverlay(node, { onClose } = {}) {
    node.parent = this;
    this.overlay = node;
    this._onOverlayClose = onClose || null;
    this.refocus();
  }

  closeOverlay() {
    this.overlay = null;
    const onClose = this._onOverlayClose;
    this._onOverlayClose = null;
    // Restore the caller's focus BEFORE refocus() so the framework
    // recomputes the focus path with the cursor already put back.
    if (onClose) onClose();
    this.refocus();
  }

  // --- Shell-level focus trap --------------------------------------------
  // Key handlers bubble focused-node -> parent up the focus path. While an
  // overlay is open that path is AppShell -> overlay -> overlay's child, so
  // AppShell is the last stop above the overlay. Swallow any navigation key
  // the overlay didn't handle here so it can never fall through to the
  // screen behind the modal. When there is no overlay these return false
  // and bubbling is unaffected.
  handleLeft() {
    return this.overlay != null;
  }

  handleRight() {
    return this.overlay != null;
  }

  handleUp() {
    return this.overlay != null;
  }

  handleDown() {
    return this.overlay != null;
  }
}
```

### `confirm-dialog.js`

```js
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
```

### `settings-row.js`

```js
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
```

---

## Why this covers both bugs

| | Before | After |
|---|---|---|
| Left/Right at a dialog edge | `return false` → key bubbles to `SettingsRow` | `return true` → consumed by the dialog |
| Up/Down while dialog open | no handler → bubbles straight through | `return true` in dialog, plus `AppShell` swallows it while `overlay` is set |
| `SettingsRow.index` while dialog open | walked around by leaked keys | never receives a key |
| Focus after Confirm / Cancel / Back | `children[index]`, index possibly corrupted → "Profile" | `restoreFocus()` runs before `refocus()` → always "Sign out" |

The dialog-level trap is the primary fix; the `AppShell` trap is a backstop so the next overlay someone adds can't reintroduce Bug 1. The explicit `onClose` restore is what makes Bug 2 stay fixed instead of just accidentally working.
