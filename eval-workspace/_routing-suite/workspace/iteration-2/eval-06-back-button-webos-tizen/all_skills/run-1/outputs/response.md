SKILLS_CONSULTED: tv-platform-quirks, tv-focus-and-navigation

The bug is half platform contract (webOS wires Back to browser history and Tizen does not; the key codes differ — 461 vs 10009; `event.key` is unreliable) and half navigation model (Back needs one deterministic, nearest-first handler with a confirm-to-exit at the root), so both skills apply. No Lightning skill because no framework was named, and nothing here touches performance budgets.

---

# Wiring the Back button for LG webOS + Samsung Tizen

## Why it misbehaves today

**"Does nothing"**
- You are almost certainly branching on `event.key`. Both webOS and Tizen report `key` as `"Unidentified"` / unreliable for remote buttons. Only `event.keyCode` is stable.
- Or there is no Back handler at the level the user is on, so the press falls through to a no-op.

**"Dumps the user out of the app entirely"**
- **webOS**: Back (461) is wired to **browser history by default**. If you never call `history.pushState()` on in-app navigation, history is empty on every screen, so Back at *any* screen behaves as Back-at-root: on webOS 6.0+ the platform shows an "Exit app?" popup, on **webOS 5.0 and earlier it closes straight to Home with no prompt**. That is the "dumps the user out" symptom.
- **Tizen**: Back (10009) is *not* wired to history — you own the stack from the first frame. If your only handler calls `tizen.application.getCurrentApplication().exit()` unconditionally (a common copy-paste), every Back press kills the app.

## The fix: one shared back-stack, fed by a keyCode branch

### 1. Detect the key by `keyCode`, matching both platforms

```js
const BACK_KEYCODES = new Set([461, 10009]); // 461 = webOS, 10009 = Tizen

window.addEventListener('keydown', (e) => {
  if (!BACK_KEYCODES.has(e.keyCode)) return;
  e.preventDefault();
  e.stopPropagation();
  handleBack();
});
```

Do not hardcode a single value. On Tizen, Back is one of the few keys delivered without `tizen.tvinputdevice` registration (arrows, Enter, Back only), so no `registerKey` call is needed just for Back. D-pad is 37–40 / Enter 13 on both platforms.

### 2. Take webOS off the History API so both platforms run the same code

In `appinfo.json`:

```json
{ "disableBackHistoryAPI": true }
```

Now webOS delivers keyCode 461 straight to your `keydown` handler and you manage the stack yourself — identical to Tizen. The alternative (staying on History API mode for webOS) means maintaining `pushState`/`popstate` plumbing on one platform and an explicit stack on the other, with divergent root behaviour and a version-dependent exit popup. One model is far less error-prone.

### 3. Resolve Back nearest-first, one handler consumes it

```js
function handleBack() {
  if (transientUI.isOpen())   return transientUI.close();   // drawer, tooltip, on-screen keyboard, snackbar
  if (modalStack.length)      return modalStack.pop().cancel(); // dialog = its Cancel
  if (screen.canCollapse())   return screen.collapse();     // expanded / drilled-in state
  if (navStack.length > 1) { navStack.pop(); return renderTop(); } // detail -> grid -> home
  confirmExit();                                            // at the root, nothing left to pop
}
```

Rules that keep this out of trouble:
- **Back is defined at every level** — it never does nothing and never silently kills the app.
- **Exactly one handler consumes each press.** The classic bug is a modal's Back handler and the screen's Back handler both firing for one press; make the innermost one consume and stop propagation.
- Moving up is always **exactly one level** — never skip levels, never dead-end. Both LG and Samsung certification reject screens where Back does nothing, skips levels, or traps the user.

### 4. Root exit — confirm, then call the platform exit

```js
function confirmExit() {
  showDialog('Exit the app?', { onConfirm: platformExit, onCancel: closeDialog });
}

function platformExit() {
  if (window.webOS && webOS.platformBack) return webOS.platformBack();          // webOS (from webOSTV.js)
  if (window.tizen) return tizen.application.getCurrentApplication().exit();     // Tizen
  window.close();                                                               // fallback
}
```

- Never exit on the first root press. Show a confirm dialog (or a "Press Back again to exit" toast with a ~2s window).
- webOS: `webOS.platformBack()` triggers the standard exit/Home flow. Requires `webOSTV.js` to be loaded.
- Tizen: `tizen.application.getCurrentApplication().exit()`.

### 5. Tizen long-press = Exit (10182), separate from Back

The Smart Remote has one physical Back/Exit button: short press sends Back (10009), **long press sends Exit (10182)**. Exit means "leave now" — save resume state and let it exit immediately; do not try to repurpose it for in-app navigation. To observe it you must `tizen.tvinputdevice.registerKey('Exit')` at startup; if you don't register it, the platform handles the long-press itself and exits, which is acceptable. webOS has no equivalent long-press split.

## Verification checklist

- [ ] Branch on `event.keyCode`, never `event.key`.
- [ ] webOS `appinfo.json` has `"disableBackHistoryAPI": true` (if you chose the shared-stack approach).
- [ ] From every screen, Back moves up exactly one level.
- [ ] Modal/drawer/on-screen-keyboard open: Back closes that first, and only that.
- [ ] At the root, Back shows a confirm prompt; confirming calls `webOS.platformBack()` (webOS) / `getCurrentApplication().exit()` (Tizen).
- [ ] Only one handler consumes each Back press (no double-fire).
- [ ] Held Back doesn't burst past a level boundary (throttle / guard against key repeat).
- [ ] Tested on your **oldest** supported firmware for each vendor — webOS 5.x behaves differently from 6.x on root Back, and every store submission is re-reviewed against that target.
- [ ] Works identically in D-pad (5-way) and Magic Remote / Smart Remote pointer mode — keep a single source of truth for current focus so Back's context is the same in both.
