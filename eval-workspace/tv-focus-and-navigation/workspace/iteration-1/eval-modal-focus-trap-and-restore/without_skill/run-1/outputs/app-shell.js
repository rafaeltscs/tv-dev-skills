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
