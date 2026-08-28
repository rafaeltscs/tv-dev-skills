// Generic TV UI framework — see _framework.md for the conventions.
//
// Integration sketch: how a grid screen and its filter drawer sit on top
// of the NavController's Back priority stack. The drawer is an overlay
// that OWNS focus while open (modal trap), but it does NOT implement its
// own handleBack — Back is resolved in exactly one place (NavController),
// so there is never a double-handler race.

export class GridScreen {
  constructor(nav) {
    this.nav = nav;                 // NavController instance
    this.grid = new PosterGrid();   // tracked-index 2-D container
    this.drawer = new FilterDrawer(nav, this);
    this._focusBeforeDrawer = null;
  }

  // Focus delegation: while the drawer is open it is the focus path;
  // otherwise the grid is. This is what makes Back's level-1 check
  // ("a transient overlay is open") line up with what the user sees.
  getFocused() {
    return this.nav.filterDrawerOpen ? this.drawer : this.grid;
  }

  // Screen's initial focus (forward nav vs. Back handled by focus memory
  // on the grid itself).
  focus() {
    this.refocus();
  }

  // The grid bubbles an unhandled key up to here; only the drawer-open
  // action is the screen's business. Back is NOT handled here.
  handleEnter() {
    if (this.grid.focusedItemIsFilterButton) {
      this.openDrawer();
      return true;
    }
    return false;
  }

  openDrawer() {
    this._focusBeforeDrawer = this.grid.selectedIndex; // capture for restore
    this.nav.openFilterDrawer();                       // pushes the layer + refocus()
  }

  onDrawerClosed({ filtersChanged }) {
    // Modal convention: restore focus to exactly where it was — unless the
    // grid's data was just swapped by a new filter, in which case reset to
    // the first cell (a remembered index into stale data lands nowhere).
    this.grid.selectedIndex = filtersChanged ? 0 : this._focusBeforeDrawer;
    this.refocus();
  }
}

export class FilterDrawer {
  constructor(nav, screen) {
    this.nav = nav;
    this.screen = screen;
    this.options = [/* … */];
    this.index = 0;
  }

  focus()   { /* loud focus indicator on the drawer */ }
  unfocus() { /* dim it */ }

  getFocused() { return this.options[this.index]; }

  // Trap: every direction is consumed at the drawer's edge so focus can't
  // leak back to the grid behind it while the drawer is open.
  handleUp()    { if (this.index > 0) this.index--, this.refocus(); return true; }
  handleDown()  { if (this.index < this.options.length - 1) this.index++, this.refocus(); return true; }
  handleLeft()  { return true; }
  handleRight() { return true; }

  // NOTE: no handleBack(). Back bubbles past the drawer to NavController,
  // which sees layers.length > 0 and calls this drawer's registered
  // close(). One consumer, one code path.

  applyAndClose() {
    const filtersChanged = /* compare selection to current */ true;
    this.nav.closeFilterDrawer();               // pops the layer + refocus()
    this.screen.onDrawerClosed({ filtersChanged });
  }
}

// --- wiring at the app root ---------------------------------------------
//
//   const toast = new ToastHost();      // renders above everything,
//                                       // NOT inserted into the focus tree
//   const nav   = new NavController(router, { toast });
//
// PosterGrid / ToastHost are ordinary framework nodes; omitted here.
