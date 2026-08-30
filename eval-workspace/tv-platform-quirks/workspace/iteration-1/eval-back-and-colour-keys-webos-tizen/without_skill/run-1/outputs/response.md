# Back button and colour keys on webOS + Tizen from one web build

## TL;DR

Three separate problems, all masked by testing in desktop Chrome:

1. **Your `BACK` key code is wrong for TVs.** You listen for `Backspace` /
   keyCode `8`. The hardware Back button is **461 on webOS** and **10009 on
   Tizen**. Your handler never matches, so `history.back()` is never called and
   the *platform's* default Back behaviour takes over instead — which is exactly
   why it "does nothing on some screens and exits the app on others".
2. **Tizen does not deliver the colour keys to your page until you register
   them.** The key codes you picked (403 red, 404 green) are actually correct on
   Tizen too, but `tizen.tvinputdevice.registerKey(...)` must be called at
   startup or the `keydown` events for those keys never reach JavaScript. webOS
   needs no such registration, which is why nobody noticed on LG.
3. **`history.back()` is the wrong mechanism for a TV app.** Back on a 10-foot
   app must be driven by your own screen/overlay stack, and the hardware key
   event must be `preventDefault()`-ed so the platform doesn't also act on it.

Fixing #1 and #2 makes the keys fire. Fixing #3 is what makes Back behave
predictably instead of sometimes quitting the app.

---

## Why it all works in Chrome on the dev laptop

Desktop Chrome sends `e.key === 'ArrowLeft'…`, `'Enter'`, and `'Backspace'`, so
your directional + select + back paths all resolve. Nobody presses a physical
red/green button on a laptop, and there is no platform "Back closes the app"
contract in a browser tab. The dev environment exercises none of the code paths
that differ on a TV.

---

## Bug 1 — the Back key code

```js
BACK: 8, // backspace on the keyboard while developing
...
case 'Backspace': return history.back();
```

| Platform | Back / Return key code | `e.key` (unreliable) |
|---|---|---|
| LG webOS 5 / 6 | **461** | often `undefined` or `XF86Back` |
| Samsung Tizen 6.0 / 6.5 | **10009** | often `undefined` on older builds |
| Desktop Chrome | 8 (Backspace), 27 (Esc) | `Backspace`, `Escape` |

On the Samsung set, `e.key` for the Back button is not `'Backspace'` (frequently
it is empty/`Unidentified`), and `e.keyCode` is `10009`. Your first listener
switches on `e.key`, so nothing matches and `history.back()` is never invoked.

### Why "nothing on some screens, exits on others"

Because your code never consumes the Back press (no `preventDefault()`), Tizen
applies its **built-in** hardware-Back behaviour for a web app:

- On a screen that still has a web history entry to pop (you used the History
  API / `pushState` to route), Tizen pops one entry. But your SPA router does not
  listen to `popstate`, so the URL changes and **the visible UI does not** →
  *"Back does nothing."*
- On the first screen, or any screen with no remaining history entry, Tizen has
  nothing to pop and **closes the application** → *"Back exits the whole app."*

That per-screen split is the signature of an unhandled hardware Back key combined
with history-based navigation. The fix is to detect the key correctly, call
`preventDefault()`, and drive Back from an explicit in-app stack (below).

webOS would have the same class of problem with key 461 unhandled; QA just tested
the Samsung set.

---

## Bug 2 — colour keys never fire on Tizen

```js
RED: 403,
GREEN: 404,
```

These constants are fine on **both** platforms (CEA-2014 `VK_COLORED_KEY_0..3` =
403/404/405/406; webOS and Tizen both follow it). The problem is Tizen-only
**key delivery**:

- On Tizen, only a fixed default set of keys is delivered to a web app: the four
  arrows, OK/Enter, and Return (10009). Everything else — the four colour keys,
  the media transport keys, channel keys, etc. — must be requested with
  `tizen.tvinputdevice.registerKey('ColorF0Red')` (and `ColorF0Green`,
  `ColorF0Yellow`, `ColorF0Blue`). Until you do, no `keydown` is dispatched for
  those keys at all → "never fire".
- This needs the privilege in `config.xml`:
  `<tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>`
- webOS delivers colour keys without any registration step.

So: register the keys on Tizen at startup, no code change needed for webOS.

---

## Bug 3 — `history.back()` and `e.key`

- **Don't route Back through `history.back()` on a TV.** Client-side routers on
  TV apps generally should not be tied to the browser history stack — it leads to
  exactly the "sometimes exits the app" behaviour above. Own a navigation stack
  (screens) and an overlay stack (modals, menus, the video player) and let Back
  walk them explicitly. Only at a root screen do you invoke the platform exit.
- **Use `e.keyCode`, not `e.key`, as the primary channel.** `keyCode` is
  deprecated in the general web platform but it is the stable identifier on
  webOS/Tizen browsers; the `e.key` strings for remote keys are inconsistent or
  missing across OS versions. Keep an `e.key` map only as a desktop-dev fallback.
- **One listener, capture phase.** You currently attach two `keydown` listeners
  (one on `e.key`, one on `e.keyCode`). Consolidate to a single listener on
  `window` in the capture phase so nothing downstream swallows the key first, and
  so there is exactly one place that decides whether to `preventDefault()`.

---

## How to structure remote handling for both platforms

A small, layered module:

1. **Platform detect** (once): `window.tizen` / UA `Tizen` → Tizen;
   `window.webOSSystem` / `window.webOS` / UA `web0s` → webOS.
2. **Semantic key map**: `keyCode → action` table containing *both* platforms'
   codes plus desktop codes (they don't collide), and a secondary `e.key →
   action` table for desktop. A single `actionFor(e)` resolves to
   `'left' | 'up' | ... | 'back' | 'red' | ...` or `null`.
3. **Tizen key registration** at startup: `registerKey` for the four colour keys
   and any media keys you use; wrap each in try/catch (not every model supports
   every key). Add the `tv.inputdevice` privilege to `config.xml`. No-op on
   webOS.
4. **One global `keydown` listener** (capture): resolve the action; if it's a key
   you own, `preventDefault()` + `stopPropagation()` immediately, then dispatch.
   The `preventDefault()` on `back` is what stops Tizen from closing the app.
5. **Back dispatcher owned by the app**, not the browser:
   - overlay open? close the top overlay, done.
   - not on a root screen? pop one screen in your stack, done.
   - on a root screen? show an "Exit?" confirm; on confirm call the platform
     exit:
     - Tizen: `tizen.application.getCurrentApplication().exit()`
       (or `.hide()` to background instead of quitting).
     - webOS: `window.close()` (returns to the launcher / last source).
6. **If you keep a History-API router**, you must also handle `popstate` and
   render from it — and still `preventDefault()` the hardware key so the platform
   doesn't double-act. Simpler to keep routing entirely in-app.
7. **Lifecycle** (adjacent, not the bug here but wire it in the same module):
   webOS `webOSLaunch` / `webOSRelaunch` on `document` plus `visibilitychange`;
   Tizen `visibilitychange` (and `tizen.application` app-control on relaunch).

### Key reference

| Action | webOS 5/6 | Tizen 6.0/6.5 | Desktop |
|---|---|---|---|
| Left / Up / Right / Down | 37 / 38 / 39 / 40 | 37 / 38 / 39 / 40 | same |
| OK / Enter | 13 | 13 | 13 |
| Back | **461** | **10009** | 8 (Backspace), 27 (Esc) |
| Red / Green / Yellow / Blue | 403 / 404 / 405 / 406 | 403 / 404 / 405 / 406 — **registerKey required** | — |
| Play / Pause | 415 / 19 | 10252 (toggle) / 19 | — |
| Stop / Rewind / Fast-fwd | 413 / 412 / 417 | 413 / 412 / 417 — registerKey required | — |

Treat this table as a starting point and **verify the codes on real devices**
per OS version; TV key codes are notoriously firmware-dependent.

---

## Revised `remote-input.js`

See the file alongside this one. Summary of changes:

- `keyCode`-based semantic map covering webOS **461** and Tizen **10009** for
  Back, plus 403–406 colour keys, plus desktop fallbacks; `e.key` map kept only
  for desktop dev.
- `registerTizenKeys()` called at init — registers the colour + media keys via
  `tizen.tvinputdevice`; no-op on webOS. (Add the `tv.inputdevice` privilege to
  `config.xml`.)
- Single capture-phase `keydown` listener; `preventDefault()` +
  `stopPropagation()` on every key we own — this is what stops Tizen from exiting
  the app on Back.
- Back goes through `handleBack()`, which walks overlay stack → screen stack →
  platform exit (`tizen.application…exit()` on Tizen, `window.close()` on webOS).
  `history.back()` removed.
- Colour keys mapped to `app.toggleFilter(...)` for all four (wire yellow/blue to
  real filters or drop them).
