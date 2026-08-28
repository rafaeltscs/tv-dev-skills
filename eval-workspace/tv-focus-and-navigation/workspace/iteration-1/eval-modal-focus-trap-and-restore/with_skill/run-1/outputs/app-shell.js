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
