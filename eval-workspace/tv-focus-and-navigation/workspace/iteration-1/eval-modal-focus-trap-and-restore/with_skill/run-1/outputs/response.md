# Both bugs are the two halves of the same rule: a modal must **trap** focus while open and **restore** it on close.

Right now the dialog does neither. Here's what's actually happening and how to fix each half.

---

## Bug 1 — focus leaks onto the buttons behind the dialog

### Why

When the dialog is open the focus path is:

```
AppShell → ConfirmDialog → Button(Confirm|Cancel)
```

A Left/Right press is delivered to the focused `Button` (no handler), then
bubbles to `ConfirmDialog`. Look at its edge handling:

```js
handleLeft() {
  if (this.index > 0) { this.index--; this.refocus(); return true; }
  return false;   // <-- at the left edge: NOT consumed
}
handleRight() {
  if (this.index < this.children.length - 1) { ... return true; }
  return false;   // <-- at the right edge: NOT consumed
}
```

At either edge the dialog returns `false`, so the key keeps bubbling up
past the overlay to `AppShell` / the screen underneath, which is free to
move focus among the Settings buttons that are still in the layout behind
the dialog. `ConfirmDialog` also has **no `handleUp` / `handleDown`**, so
those presses *always* fall straight through.

An overlay that owns focus is a boundary: directional keys must not be able
to escape it until it's dismissed. This one is porous on all four edges.

### Fix

Consume every directional key in the dialog, **including at the edges** —
move the index when there's somewhere to move, but return `true`
unconditionally so nothing bubbles out. Add `handleUp` / `handleDown` that
simply consume. (`handleEnter` on the buttons and `handleBack` are the only
ways out, which is what you want.)

```js
handleLeft() {
  if (this.index > 0) { this.index--; this.refocus(); }
  return true;                 // consume even at the edge
}
handleRight() {
  if (this.index < this.children.length - 1) { this.index++; this.refocus(); }
  return true;                 // consume even at the edge
}
handleUp()   { return true; }  // nothing above inside the dialog, but don't leak
handleDown() { return true; }  // nothing below inside the dialog, but don't leak
```

I also added a **backstop in `AppShell`**: while `this.overlay` is set, its
own `handleUp/Down/Left/Right` return `true`. With the dialog trapping
correctly nothing reaches that far, but it guarantees no future overlay can
reintroduce this bug by forgetting to consume an edge.

---

## Bug 2 — after close, focus lands on the first Settings button, not "Sign out"

### Why

`AppShell.closeOverlay()` just clears the overlay and re-resolves:

```js
closeOverlay() {
  this.overlay = null;
  this.refocus();
}
```

`refocus()` walks `getFocused()` from the root again:
`AppShell → SettingsRow → SettingsRow.children[SettingsRow.index]`. Nothing
ever recorded which button opened the dialog, and nothing restores it.
Focus goes wherever `SettingsRow.index` happens to point now — index `0`,
the first button — instead of back to "Sign out".

(Bug 1 makes this worse: the stray presses that leaked through while the
dialog was open can walk `SettingsRow.index` down to 0 themselves. But even
with the trap in place, `closeOverlay()` still has to *deliberately* put
focus back — never rely on a container's index having survived a modal.)

### Fix

Capture the focus target **before** the overlay opens, restore it **after**
it closes — the "trap and restore" pair. I did this generically in
`AppShell` so every overlay gets it (this is what libraries call
`autoRestoreFocus`):

```js
showOverlay(node) {
  this._focusBeforeOverlay = this._captureFocusPath(); // snapshot first
  node.parent = this;
  this.overlay = node;
  this.refocus();
}

closeOverlay() {
  this.overlay = null;
  const saved = this._focusBeforeOverlay;
  this._focusBeforeOverlay = null;
  if (saved) this._restoreFocusPath(saved); // re-point containers
  this.refocus();                            // then re-resolve
}
```

`_captureFocusPath()` walks `getFocused()` from the root screen and records
every container on the path together with the child it was pointing at.
`_restoreFocusPath()` sets each of those containers' `index` back to that
child before the final `refocus()`. So the path that was
`SettingsRow → Button("Sign out")` at open time is exactly what gets
re-selected at close time — regardless of Confirm vs. Cancel, and
regardless of anything that nudged `SettingsRow.index` in between.

No change is needed in `settings-row.js`; its `onConfirm` / `onCancel`
already call `this.app.closeOverlay()`, which now restores correctly.

---

## Other small things worth doing (not required for the two bugs)

- **Default the dialog to "Cancel"** for a destructive prompt like sign-out,
  so a double-OK doesn't sign the user out by accident. I set
  `this.index = 1` in the constructor; flip it back to `0` if the product
  wants Confirm pre-selected.
- The focus indicator on the dialog buttons should be the single, loud,
  unmistakable highlight while the dialog is up — make sure the Settings
  buttons behind it don't still show a highlight (they keep their focus
  *state* but must not look focused).

---

## Full changed files

### `confirm-dialog.js`

```js
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
```

### `app-shell.js`

```js
// Generic TV UI framework — see _framework.md for the conventions.
//
// AppShell is the root node. It renders one root screen and, optionally,
// one overlay on top of it.
//
// Overlay contract (skill: "Modals trap and restore"):
//   * While an overlay is open, no directional key may reach the screen
//     behind it — the overlay is a focus boundary.
//   * When the overlay closes, focus returns to the exact element that had
//     it before the overlay opened, not to some container's first child.

export class AppShell {
  constructor(rootScreen) {
    this.rootScreen = rootScreen;
    this.rootScreen.parent = this;
    this.overlay = null;
    this._focusBeforeOverlay = null;
  }

  getFocused() {
    return this.overlay || this.rootScreen;
  }

  // --- Overlay handling --------------------------------------------------

  showOverlay(node) {
    // Snapshot what is focused underneath BEFORE the overlay takes focus,
    // so closeOverlay() can put it back exactly.
    this._focusBeforeOverlay = this._captureFocusPath();
    node.parent = this;
    this.overlay = node;
    this.refocus();
  }

  closeOverlay() {
    this.overlay = null;
    const saved = this._focusBeforeOverlay;
    this._focusBeforeOverlay = null;
    if (saved) this._restoreFocusPath(saved);
    this.refocus();
  }

  // Hard backstop for the focus trap. The overlay itself already consumes
  // every direction at its edges (see ConfirmDialog); this guarantees that
  // even an overlay that forgets to do so cannot leak a directional press
  // onto the content behind it. Only active while an overlay is open.
  handleUp() { return !!this.overlay; }
  handleDown() { return !!this.overlay; }
  handleLeft() { return !!this.overlay; }
  handleRight() { return !!this.overlay; }

  // --- Focus save / restore -------------------------------------------

  // Walk the focus-delegation chain under the root screen and record, for
  // every container on the path, which child it is currently pointing at.
  _captureFocusPath() {
    const path = [];
    let node = this.rootScreen;
    while (node && typeof node.getFocused === 'function') {
      const child = node.getFocused();
      if (!child) break;
      path.push({ container: node, child });
      node = child;
    }
    return path;
  }

  // Re-point each container on the saved path at the child it had before
  // the overlay opened. Containers in this framework track their focused
  // child with a numeric `index` into `children`.
  _restoreFocusPath(path) {
    for (const { container, child } of path) {
      if (Array.isArray(container.children) && typeof container.index === 'number') {
        const i = container.children.indexOf(child);
        if (i >= 0) container.index = i;
      }
    }
  }
}
```
