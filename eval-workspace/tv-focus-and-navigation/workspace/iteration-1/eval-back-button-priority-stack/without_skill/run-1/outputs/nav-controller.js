// Generic TV UI framework — see _framework.md for the conventions.
//
// NavController sits near the root of the focus path and is where global
// Back handling lives.
//
//   router.pop()         navigates back one screen
//   router.stackDepth    number of screens on the stack
//                        (1 == the home screen, nothing left to pop;
//                         pop() at depth 1 makes the platform close the app)
//
// Instead of hard-wiring Back to `router.pop()`, Back is handled as an
// ORDERED LIST of "dismiss layers". On each Back press we ask each layer,
// in priority order, whether it is currently active. The first active layer
// consumes the key and we stop.
//
//   1. overlays    a dismissible layer is open (filter drawer, and any
//                  future modal / context menu) -> close the top one
//   2. screen      there is a screen to go back to -> router.pop()
//   3. exitGuard   we are on the home screen with nothing to pop ->
//                  first Back arms a "Press Back again to exit" hint;
//                  a second Back within the timeout actually exits
//
// Adding a new overlay later is one entry in `backLayers`, not another
// branch bolted onto a growing if/else chain.

const EXIT_CONFIRM_MS = 3000;

export class NavController {
  constructor(router, { platform } = {}) {
    this.router = router;
    this.platform = platform; // optional; must expose exitApp() if provided

    this.filterDrawerOpen = false;

    this.exitArmed = false;
    this._exitTimer = null;

    // Priority order, highest first. Each layer is:
    //   isActive() -> boolean   can this layer handle Back right now?
    //   handle()   -> void      do the "nearest meaningful thing"
    this.backLayers = [
      {
        name: 'filterDrawer',
        isActive: () => this.filterDrawerOpen,
        handle: () => this.closeFilterDrawer(),
      },
      {
        name: 'screen',
        isActive: () => this.router.stackDepth > 1,
        handle: () => this.router.pop(),
      },
      {
        name: 'exitGuard',
        isActive: () => true, // always the last resort
        handle: () => this.confirmExit(),
      },
    ];
  }

  handleBack() {
    for (const layer of this.backLayers) {
      if (!layer.isActive()) continue;

      // Any Back press that is NOT the exit guard itself cancels a pending
      // "press again to exit", so an armed state can never leak across a
      // screen change or a drawer close.
      if (layer.name !== 'exitGuard') this.disarmExit();

      layer.handle();
      return true; // consumed — stop the key bubbling to the parent
    }
    return true; // Back is always "handled" globally; never let it escape
  }

  // --- layer 1: dismissible overlays --------------------------------------

  openFilterDrawer() {
    this.filterDrawerOpen = true;
    this.disarmExit(); // opening UI invalidates a pending exit confirmation
    this.refocus();
  }

  closeFilterDrawer() {
    this.filterDrawerOpen = false;
    this.refocus();
  }

  // --- layer 3: exit guard ---------------------------------------------------

  confirmExit() {
    if (this.exitArmed) {
      this.disarmExit();
      this.exitApp();
      return;
    }
    this.exitArmed = true;
    this.showExitHint(); // render "Press Back again to exit"
    this._exitTimer = setTimeout(() => {
      this._exitTimer = null;
      this.exitArmed = false;
      this.hideExitHint();
    }, EXIT_CONFIRM_MS);
  }

  disarmExit() {
    if (this._exitTimer) {
      clearTimeout(this._exitTimer);
      this._exitTimer = null;
    }
    if (this.exitArmed) {
      this.exitArmed = false;
      this.hideExitHint();
    }
  }

  exitApp() {
    if (this.platform && typeof this.platform.exitApp === 'function') {
      this.platform.exitApp();
    } else {
      this.router.pop(); // at depth 1 the platform closes the app
    }
  }

  // --- exit-hint UI hooks -------------------------------------------------
  // Wire these to your own toast / banner component. Kept as no-op-safe
  // stubs so the controller works before the UI is built.

  showExitHint() {
    if (this.exitHint) this.exitHint.visible = true;
  }

  hideExitHint() {
    if (this.exitHint) this.exitHint.visible = false;
  }

  // --- lifecycle ---------------------------------------------------------
  // Call this if the controller is ever torn down, so a pending timer
  // cannot fire after the tree is gone.
  detach() {
    this.disarmExit();
  }

  // --- focus delegation (adapt to your existing wiring) -----------------
  //
  // The Back priority list and focus delegation must agree: while the
  // drawer is open, focus has to be ON the drawer, or arrow keys / Enter
  // still drive the grid behind it. If your NavController already has a
  // getFocused(), add the drawer branch at the top:
  //
  //   getFocused() {
  //     if (this.filterDrawerOpen) return this.filterDrawer;
  //     return this.currentScreen;
  //   }
}
