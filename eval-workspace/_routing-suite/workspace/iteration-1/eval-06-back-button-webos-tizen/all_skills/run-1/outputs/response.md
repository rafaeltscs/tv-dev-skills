SKILLS_CONSULTED: tv-platform-quirks, tv-focus-and-navigation

Why: The symptoms are half platform wiring (webOS routes Back through browser history and Tizen uses a different key code / owns its own stack — `tv-platform-quirks`) and half navigation-stack UX (what Back must mean at each level and at the root — `tv-focus-and-navigation`); you need both to make Back behave the same on LG and Samsung.

---

# Wiring Back correctly on LG (webOS) and Samsung (Tizen)

## Why it misbehaves today

**"Dumps the user out of the app" — LG / webOS.**
By default webOS wires the Back button to **browser history**. If your app navigates by swapping views/components without calling `history.pushState()` on each in-app navigation, the history stack is empty, so *every* Back press is treated as "Back at the root." On webOS 5.x and earlier that closes the app and returns to Home; on 6.0+ it pops the platform "Exit app?" dialog. Either way, Back from a detail screen throws the user out instead of going up one level.

**"Does nothing" — Samsung / Tizen.**
Back on Tizen is key code **10009**, not **461** (webOS). A handler that checks `461`, or that branches on `event.key` instead of `event.keyCode`, never matches on Tizen. And because Tizen does **not** wire Back to history the way webOS does — you own the navigation stack from the first frame — nothing else catches the press either, so Back is silently dead.

Secondary contributors worth checking: branching on `event.key` (reports `"Unidentified"` on webOS, unreliable on Tizen — always use `event.keyCode`/`event.which`); and two Back handlers (a modal's and the screen's) both firing for one press, which skips two levels.

## The target design

One logical Back action, one owner of the navigation stack, identical control flow on both platforms. Don't lean on webOS's history integration — opt out of it so both platforms run the same code path.

### 1. Take ownership of Back on webOS

In `appinfo.json`:

```json
{ "disableBackHistoryAPI": true }
```

Now key code **461** is delivered straight to your `keydown` handler (like Tizen's 10009), and you are responsible for root-exit behaviour. Tizen needs no equivalent switch — you already own the stack there. Back (`Back`) is one of the keys Tizen delivers automatically, so no `tizen.tvinputdevice` registration is required for it (registration only matters for colour/media/number keys).

### 2. One key handler, both codes mapped to one action

```js
const BACK_KEYCODES = new Set([461, 10009]); // webOS, Tizen
const TIZEN_EXIT_KEYCODE = 10182;            // Tizen Back/Exit long-press

function exitApp() {
  if (typeof tizen !== 'undefined' && tizen.application) {
    tizen.application.getCurrentApplication().exit();          // Tizen
  } else if (typeof webOS !== 'undefined' && webOS.platformBack) {
    webOS.platformBack();                                      // webOS (from webOSTV.js)
  } else {
    window.close();                                            // fallback
  }
}

window.addEventListener('keydown', (e) => {
  if (e.keyCode === TIZEN_EXIT_KEYCODE) {   // long-press: exit immediately
    saveResumeState();
    exitApp();
    return;
  }
  if (BACK_KEYCODES.has(e.keyCode)) {
    e.preventDefault();
    handleBack();
  }
});
```

On the Samsung Smart Remote the single physical Back/Exit button sends **Back (10009)** on a short press and **Exit (10182)** on a long press; Exit should save state and quit right away. webOS has no separate Exit key.

### 3. Resolve Back nearest-first

Back has a mandatory, deterministic meaning at every level. Resolve it against the current UI state, innermost first:

```js
function handleBack() {
  if (closeTopTransient())      return; // drawer, tooltip, on-screen keyboard, snackbar
  if (dismissTopModal())        return; // dialog/modal → same as its Cancel
  if (collapseExpandedState())  return; // drilled-in/expanded panel → previous state
  if (navStack.length > 1) {           // detail → grid → home
    navStack.pop();
    activateScreen(navStack.top());    // screen restores its remembered focus
    return;
  }
  // at the root screen, nothing left to pop:
  if (!exitArmed) {
    exitArmed = true;
    showToast('Press Back again to exit');
    setTimeout(() => { exitArmed = false; }, 3000);
    return;
  }
  exitApp();
}
```

Rules that keep this cert-safe on both LG Seller Lounge and Samsung Seller Office:

- Back moves **up exactly one level** — never skips levels, never dead-ends, never does nothing.
- Back always **reaches app exit from the root**, but never exits silently on the first press at the root — show a confirm / "press again" prompt.
- **Exactly one handler consumes each Back press.** If your framework dispatches Back through the focus tree (e.g. a modal component with its own Back handler), that innermost handler must consume the event (`return true` / `stopPropagation()`) so the screen-level handler doesn't also fire. Don't run both a focus-tree handler and the global `window` listener for the same press — pick one dispatch path.
- When a modal closes on Back, **restore focus** to the exact element that had it before the modal opened, so the next Back continues from a known position.

### 4. Root-exit calls, per platform

| Platform | At root, on Back-to-exit |
|---|---|
| webOS (with `disableBackHistoryAPI: true`) | `webOS.platformBack()` for the standard exit/Home flow, or show your own dialog then `window.close()` |
| Tizen | `tizen.application.getCurrentApplication().exit()` |

## Checklist

- [ ] `"disableBackHistoryAPI": true` in `appinfo.json` (webOS)
- [ ] Single `keydown` handler branches on `event.keyCode`, never `event.key`
- [ ] `461` and `10009` both map to the same `handleBack()`
- [ ] Tizen `10182` (long-press Exit) saves state and exits immediately
- [ ] `handleBack()` resolves nearest-first: transient → modal → collapse → pop nav → root-confirm → exit
- [ ] Every screen restores its remembered focus when Back pops back to it
- [ ] Only one handler consumes each Back press (no double-pop from modal + screen)
- [ ] Root Back shows a confirm/"press again" prompt before `exitApp()`
- [ ] Verified on a real 2019-era LG and a real Samsung, not just desktop Chrome
