// Generic TV UI framework — see _framework.md for the conventions.
//
// NavController sits near the root of the focus path and is the single
// place global Back handling lives. Back is NOT "always router.pop()".
// It is a priority stack, resolved nearest-meaningful-thing first:
//
//   1. a transient overlay is open (filter drawer, on-screen keyboard, …) -> close the top one
//   2. a modal / dialog is open                                           -> cancel it (same as its Cancel)
//   3. a drilled-in / expanded state inside the screen                    -> collapse it
//   4. there is a screen to go back to                                    -> router.pop()
//   5. we are on the home screen with nothing to pop                      -> "Press Back again to exit"
//
// Levels 1–3 are all "an open layer" — they share one mechanism (a stack
// of dismissable layers) so new overlay/modal types slot in without
// touching this resolver.
//
// router.pop() navigates back one screen; router.stackDepth is the number
// of screens on the stack (1 == home, nothing left to pop). Calling pop()
// at depth 1 lets the platform close the app — so that only happens as the
// deliberate *second* press of the exit confirmation.

const EXIT_CONFIRM_WINDOW_MS = 3000;

export class NavController {
  constructor(router, { toast } = {}) {
    this.router = router;

    // Stack of dismissable layers (overlays + modals), innermost last.
    // Each entry: { type: 'overlay' | 'modal', close: () => void }
    this.layers = [];

    // Non-focusable host for the "Press Back again to exit" hint. It must
    // NOT enter the focus tree — focus stays on the home grid throughout.
    // Optional: if absent, the confirmation still works, just without the
    // visible hint.
    this.toast = toast;
    this._exitArmedAt = 0;
    this._exitTimer = null;

    // Back-compat mirror so existing call sites can still read this flag.
    this.filterDrawerOpen = false;
    this._drawerDispose = null;
  }

  // --- global Back resolver ----------------------------------------------

  handleBack() {
    // Levels 1–3: dismiss the nearest open layer, if any.
    if (this.layers.length > 0) {
      const top = this.layers[this.layers.length - 1];
      top.close();
      return true; // consumed HERE — Back never bubbles past NavController
    }

    // Level 4: there is a screen to return to.
    if (this.router.stackDepth > 1) {
      this.router.pop();
      return true;
    }

    // Level 5: home screen, nothing to pop — confirm before quitting.
    return this._handleRootBack();
  }

  _handleRootBack() {
    const now = Date.now();

    // Second press inside the window -> the user meant it. Exit.
    if (this._exitArmedAt && now - this._exitArmedAt <= EXIT_CONFIRM_WINDOW_MS) {
      this._disarmExit();
      this.router.pop(); // depth 1 -> platform closes the app (intended now)
      return true;
    }

    // First press -> arm the confirmation, show the hint, stay in the app.
    this._exitArmedAt = now;
    this.toast?.show('Press Back again to exit');
    clearTimeout(this._exitTimer);
    this._exitTimer = setTimeout(() => this._disarmExit(), EXIT_CONFIRM_WINDOW_MS);
    return true; // still consumed — the first press must not quit
  }

  _disarmExit() {
    this._exitArmedAt = 0;
    clearTimeout(this._exitTimer);
    this._exitTimer = null;
    this.toast?.hide();
  }

  // --- layer registration ----------------------------------------------

  // Any transient overlay or modal registers itself while open and calls
  // the returned disposer when it closes by its own means (Cancel button,
  // a selection made, etc.) so the stack stays in sync. Stacked layers
  // dismiss one at a time, innermost first.
  pushLayer(layer) {
    this.layers.push(layer);
    this.refocus(); // let the focus path re-resolve into the new layer
    return () => this._removeLayer(layer);
  }

  _removeLayer(layer) {
    const i = this.layers.indexOf(layer);
    if (i === -1) return;
    this.layers.splice(i, 1);
    this.refocus(); // focus returns to the layer beneath (or the screen)
  }

  // --- filter drawer (named convenience over pushLayer) ----------------

  openFilterDrawer() {
    if (this.filterDrawerOpen) return;
    this.filterDrawerOpen = true;
    this._drawerDispose = this.pushLayer({
      type: 'overlay',
      close: () => this.closeFilterDrawer(),
    });
  }

  closeFilterDrawer() {
    if (!this.filterDrawerOpen) return;
    this.filterDrawerOpen = false;
    const dispose = this._drawerDispose;
    this._drawerDispose = null;
    dispose?.(); // removes it from the layer stack + refocus()
  }
}
