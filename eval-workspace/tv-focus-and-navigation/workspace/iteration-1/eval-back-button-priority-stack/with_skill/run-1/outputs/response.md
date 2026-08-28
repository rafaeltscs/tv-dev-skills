# Restructuring Back: a priority stack, not a single `router.pop()`

Your `handleBack()` currently does one thing unconditionally. The fix isn't
more `if`s scattered around the app — it's recognising that **Back has a
fixed meaning at every level, resolved nearest‑first**, and putting that
resolution in exactly one place.

## The model

Back is a priority stack. Walk it top‑to‑bottom on every press; the first
rule that applies wins and consumes the event:

| # | If… | Back does |
|---|---|---|
| 1 | a transient overlay is open (filter drawer, on‑screen keyboard, tooltip with an action) | close the top one |
| 2 | a modal / dialog is open | cancel it (same as its Cancel button) |
| 3 | a drilled‑in / expanded state inside the screen | collapse to the previous state |
| 4 | there's a screen to go back to (`stackDepth > 1`) | `router.pop()` |
| 5 | home screen, nothing left to pop | show **"Press Back again to exit"**, don't quit |

Your three problems are just three entries in this table:

- **Filter drawer open on a grid screen** → level 1. Close the drawer, stay
  on the screen.
- **Detail → grid → home** → level 4. Unchanged from today, this part
  already worked.
- **Back on the home grid with an empty stack** → level 5. Confirm instead
  of calling `pop()` at depth 1 (which lets the platform kill the app).

Levels 1–3 are all "a layer is open," so they collapse into **one
mechanism**: a stack of dismissable layers. New overlay/modal types then
slot in without you touching the Back resolver again.

## Rules that keep it from breaking

1. **One consumer.** `NavController.handleBack()` returns `true` on *every*
   path — including the first press of the exit confirm. If any branch
   falls through, the un‑consumed Back reaches the platform and closes the
   app, which is the surprise you're trying to kill. The classic bug here
   is two handlers firing for one press (a drawer's own `handleBack` *and*
   the screen's). Pick one owner. In the sketch below the drawer has **no**
   `handleBack` — Back bubbles past it to `NavController`, which closes it
   via the layer stack.

2. **The exit prompt does not steal focus.** "Press Back again to exit" is
   a passive hint (toast / snackbar without an action). It renders above
   everything but stays **out of the focus tree** — focus stays on the home
   grid, the remote keeps driving the grid, and a second Back within a few
   seconds exits. After the window lapses, disarm and hide. (If you'd
   rather have an explicit Yes/No dialog, that's level‑2 behaviour instead:
   it traps focus, defaults to the safe choice "Stay", and restores focus
   to the grid on cancel.)

3. **Every dismissal re‑resolves focus.** Opening a layer pushes it and
   calls `refocus()` so the focus path runs into it; closing pops it and
   `refocus()`s so focus lands back on the layer beneath — and ultimately
   on the **exact grid cell** that was focused before the drawer opened.
   Capture that index when you open the drawer and restore it on close —
   unless applying a filter swapped the grid's data, in which case reset to
   the first cell (a remembered index into stale data lands nowhere).

4. **The drawer traps while open.** Every direction key is consumed at the
   drawer's edge so focus can't wander back onto the grid behind it. That's
   what makes level 1's "an overlay is open" match what the user sees.

## Where the code lives

- `NavController` (near the root of the focus path) owns the whole
  resolver: the layer stack for levels 1–3, the `stackDepth` check for
  level 4, and the two‑press exit confirmation for level 5.
- Overlays/modals don't each re‑implement Back. They **register** while
  open (`nav.pushLayer({ type, close })`) and **deregister** on close. The
  resolver just calls `close()` on the top of the stack.
- Screens and leaf widgets keep doing what they do (arrows, OK/Enter).
  They never call `router.pop()` directly any more.

This keeps Back testable as a pure function of `{ layers, stackDepth,
_exitArmedAt }` and makes "what does Back do from here?" answerable at any
instant.

## `nav-controller.js` (full rewrite)

```js
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
```

## Integration sketch (`filter-drawer.js`)

Shows the grid screen + drawer sitting on top of the resolver: the drawer
owns focus while open, traps direction keys, and deliberately has **no**
`handleBack`.

```js
export class GridScreen {
  constructor(nav) {
    this.nav = nav;
    this.grid = new PosterGrid();
    this.drawer = new FilterDrawer(nav, this);
    this._focusBeforeDrawer = null;
  }

  // While the drawer is open it IS the focus path; otherwise the grid is.
  getFocused() {
    return this.nav.filterDrawerOpen ? this.drawer : this.grid;
  }

  handleEnter() {
    if (this.grid.focusedItemIsFilterButton) {
      this._focusBeforeDrawer = this.grid.selectedIndex; // capture for restore
      this.nav.openFilterDrawer();                       // push layer + refocus()
      return true;
    }
    return false;
  }

  onDrawerClosed({ filtersChanged }) {
    this.grid.selectedIndex = filtersChanged ? 0 : this._focusBeforeDrawer;
    this.refocus();
  }
  // NOTE: no handleBack() here either.
}

export class FilterDrawer {
  constructor(nav, screen) { this.nav = nav; this.screen = screen; this.index = 0; this.options = []; }

  getFocused() { return this.options[this.index]; }

  // Trap: consume every direction at the drawer's edge.
  handleUp()    { if (this.index > 0) { this.index--; this.refocus(); } return true; }
  handleDown()  { if (this.index < this.options.length - 1) { this.index++; this.refocus(); } return true; }
  handleLeft()  { return true; }
  handleRight() { return true; }
  // no handleBack() — Back bubbles to NavController, which closes this via the layer stack.

  applyAndClose() {
    const filtersChanged = /* compare selection to current */ true;
    this.nav.closeFilterDrawer();                 // pop layer + refocus()
    this.screen.onDrawerClosed({ filtersChanged });
  }
}
```

Wiring at the root:

```js
const toast = new ToastHost();                 // renders above everything,
                                               // NOT in the focus tree
const nav   = new NavController(router, { toast });
```

## Test cases to lock in

- Drawer open on a grid screen, press Back → drawer closes, still on the
  screen, focus back on the cell you left from. `router.pop` not called.
- Detail screen, no layers, press Back → `router.pop()`, one level up.
- Home grid, no layers, first Back → toast shows, app still running,
  focus still on the grid. Second Back within 3 s → app exits. Second Back
  *after* 3 s → toast again, no exit.
- Stacked layers (drawer + a modal on top) → each Back dismisses one,
  innermost first, before any navigation happens.
- Every `handleBack()` call returns `true`.

## If you'd rather not centralise

The equivalent distributed structure: let each layer consume its own Back
locally (`handleBack() { this.close(); return true; }`) so it never reaches
`NavController`, and `NavController` only owns levels 4–5. Same five‑level
result. The one hard rule either way: **exactly one handler consumes each
Back press** — don't do both.
