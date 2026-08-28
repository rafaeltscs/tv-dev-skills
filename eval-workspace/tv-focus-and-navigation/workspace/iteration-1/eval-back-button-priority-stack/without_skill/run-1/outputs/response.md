# Structuring Back as a priority-ordered "dismiss stack"

The bug is that `handleBack()` has exactly one behavior (`router.pop()`) for
three different situations. The fix isn't a bigger `if/else` inside
`handleBack()` — that chain grows every time you add a modal, a search
overlay, a "now playing" panel, and the ordering silently rots. Model Back as
an **ordered list of "dismiss layers"**. On each press you walk the list from
the top; the first layer that is *currently active* handles the key and you
stop.

## The layers, highest priority first

| # | Layer | Active when | What Back does |
|---|-------|-----------|----------------|
| 1 | `filterDrawer` (and any future overlay/modal) | `filterDrawerOpen` | close the drawer, stay on the screen |
| 2 | `screen` | `router.stackDepth > 1` | `router.pop()` — go back one screen |
| 3 | `exitGuard` | always (last resort → only reached at `stackDepth === 1`) | 1st press: show "Press Back again to exit"; 2nd press within 3s: actually exit |

Because layer 2 only claims the key when there *is* something to pop, "on the
home screen with nothing to go back to" falls through to layer 3 by
construction — you never test for "am I on home" explicitly.

Each layer is a tiny `{ name, isActive(), handle() }` object, so:

- priority is one readable array, not scattered branch order;
- each behavior is independently unit-testable;
- adding an overlay = push one entry (usually at the top), nothing else changes;
- the "a normal Back press cancels a pending "exit?" prompt" rule lives in
  exactly one place (the loop), instead of being re-derived per branch.

## Updated `nav-controller.js`

```js
// Generic TV UI framework — see _framework.md for the conventions.
//
//   router.pop()         navigates back one screen
//   router.stackDepth    number of screens on the stack
//                        (1 == home; pop() at depth 1 closes the app)
//
// Back is handled as an ORDERED LIST of "dismiss layers". On each Back
// press we ask each layer, in priority order, whether it is active. The
// first active layer consumes the key and we stop.

const EXIT_CONFIRM_MS = 3000;

export class NavController {
  constructor(router, { platform } = {}) {
    this.router = router;
    this.platform = platform; // optional; must expose exitApp() if provided

    this.filterDrawerOpen = false;

    this.exitArmed = false;
    this._exitTimer = null;

    // Priority order, highest first.
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
    return true; // Back is always handled globally; never let it escape
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

  // --- exit-hint UI hooks (wire to your own toast/banner) --------------

  showExitHint() {
    if (this.exitHint) this.exitHint.visible = true;
  }

  hideExitHint() {
    if (this.exitHint) this.exitHint.visible = false;
  }

  // --- lifecycle ---------------------------------------------------------
  detach() {
    this.disarmExit(); // kill a pending timer if the tree goes away
  }
}
```

## How each scenario now plays out

- **Home grid, drawer closed, press Back** → layer 1 inactive, layer 2
  inactive (`stackDepth === 1`), layer 3 arms the hint and starts a 3s timer.
  Press Back again inside 3s → `exitArmed` is true → `exitApp()`. Wait it out
  → timer disarms, next Back arms again. The app never quits on a single
  press.
- **Drawer open on any grid screen, press Back** → layer 1 fires,
  `closeFilterDrawer()`, you stay exactly where you were. The screen never
  navigates.
- **Detail screen (`stackDepth > 1`), press Back** → layer 1 inactive, layer
  2 fires `router.pop()` — unchanged from today.
- **Drawer open on home, Back, Back** → first Back closes the drawer (and
  clears any armed exit), second Back arms the exit hint.

## Focus delegation must agree with the priority list

The layer list decides what Back *does*; it does not move focus. While the
drawer is open, focus has to actually be on the drawer or the arrow keys and
Enter still drive the grid behind it. Wherever your controller delegates
focus, put the drawer first:

```js
getFocused() {
  if (this.filterDrawerOpen) return this.filterDrawer;
  return this.currentScreen;
}
```

## Alternative: let the drawer consume its own Back

If your `FilterDrawer` is a real node in the focus path, the most colocated
option is to have it handle Back itself and only fall through to
`NavController` for layers 2–3:

```js
class FilterDrawer {
  handleBack() {
    this.nav.closeFilterDrawer();
    return true; // consumed here; never reaches NavController
  }
}
```

Then `NavController.backLayers` drops the `filterDrawer` entry. This keeps
each overlay's dismiss logic next to the overlay and leans on the framework's
"focused node first, then bubble to parent" rule. Use the in-controller
registry (above) when overlay state is centralized (as it is in the current
fixture, where `filterDrawerOpen` lives on `NavController`); use per-component
`handleBack()` when each overlay owns its own state and is in the focus path.
The two compose — anything a child consumes never reaches the registry.

## Tests worth writing

- Back on home with empty stack does **not** call `router.pop()` on the first
  press; it does on the second press within `EXIT_CONFIRM_MS`.
- After the timeout, `exitArmed` is back to `false` and the hint is hidden.
- Back with `filterDrawerOpen` calls `closeFilterDrawer()` and **not**
  `router.pop()`, at any stack depth.
- Opening the drawer, or a successful `router.pop()`, disarms a pending exit
  confirmation.
- `handleBack()` returns `true` in every branch (Back never bubbles past the
  controller / out of the app unintentionally).
- `detach()` clears the pending timer.
