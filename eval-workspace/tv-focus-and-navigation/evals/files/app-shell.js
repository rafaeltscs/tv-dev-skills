// Generic TV UI framework — see _framework.md for the conventions.
//
// AppShell is the root node. It renders one root screen and, optionally,
// one overlay on top of it.

export class AppShell {
  constructor(rootScreen) {
    this.rootScreen = rootScreen;
    this.rootScreen.parent = this;
    this.overlay = null;
  }

  getFocused() {
    return this.overlay || this.rootScreen;
  }

  showOverlay(node) {
    node.parent = this;
    this.overlay = node;
    this.refocus();
  }

  closeOverlay() {
    this.overlay = null;
    this.refocus();
  }
}
