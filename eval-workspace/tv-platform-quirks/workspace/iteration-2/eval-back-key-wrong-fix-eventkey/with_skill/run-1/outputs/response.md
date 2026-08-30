# Back + colour buttons on Tizen vs webOS

## Short answer

There is no `event.key` string that will fix this, and the mental model
("same code, Samsung just reports a different `event.key` for Back") is
not what's happening. You're looking at **two unrelated platform quirks**,
and neither is solved by adding a case to a `event.key` switch:

1. **Back** – webOS and Tizen use different **`keyCode`** values (461 vs
   10009). You must branch on `event.keyCode`, never `event.key`.
   `event.key` is unreliable for remote buttons on *both* platforms –
   webOS literally reports `"Unidentified"` for most of them. Your LG
   build's Back isn't going through your `switch` at all right now: webOS
   wires the Back button to browser history for you, so the platform
   calls `history.back()` itself. Your `case 'Backspace': history.back()`
   line is dead code on the actual TV.

2. **Red / Green** – **not** a key mismatch. The keyCodes (403 / 404) are
   *identical* on webOS and Tizen. Tizen just doesn't hand colour / media
   / number keys to your `keydown` listener until you **register** them at
   startup with `tizen.tvinputdevice.registerKeyBatch([...])`. webOS
   delivers every key with no registration – that's why they work on LG
   and are silent on Samsung.

## The Back keyCode you asked for

| Platform | Back `keyCode` | `event.key` |
|---|---|---|
| LG webOS       | **461**   | `"Unidentified"` – do not use |
| Samsung Tizen  | **10009** | `"Back"` – still don't branch on it |

D-pad (37–40) and Enter (13) are the same everywhere. Add `10009`
alongside `461` in a **keyCode** switch; do not add a `.key` case.

## Why Samsung Back "does nothing on some screens, exits the app on others"

That symptom is the missing navigation-stack management, not a key value:

- Your handler only reacts to `event.key === 'Backspace'`. On Tizen the
  Back button is `keyCode 10009` / `key === 'Back'`, so your `switch`
  never matches and your code does nothing.
- Whatever *does* happen is Tizen's default: unlike webOS, Tizen does
  **not** wire Back to browser history. On a deep screen nothing is
  listening, so it looks dead; at the app root the platform's default
  Return behaviour exits the whole app. Hence "nothing" vs "exits",
  depending where you are.

The Back/exit contract you need on both platforms: Back moves **up
exactly one level**, never dead-ends, and from the **root** it exits the
app – `tizen.application.getCurrentApplication().exit()` on Tizen,
`webOS.platformBack()` on webOS.

### One appinfo.json change for webOS

Because the revised code handles `keyCode 461` itself, set
`"disableBackHistoryAPI": true` in `appinfo.json`. In the default
(History-API) mode webOS consumes Back before your handler sees it; opting
out delivers 461 to your `keydown` and lets you own one stack across both
platforms. (If you'd rather keep History-API mode on webOS, you'd still
need the explicit `10009` handler for Tizen, so a single owned stack is
simpler.)

## Fixing the colour buttons

Keep your `keyCode` check (`403` / `404` are already correct) and add key
registration at startup, guarded so it's a no-op on webOS:

```js
if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
  try {
    tizen.tvinputdevice.registerKeyBatch(['ColorF0Red', 'ColorF1Green']);
  } catch (err) {
    console.error('Tizen colour-key registration failed', err);
  }
}
```

Notes:

- Use `registerKeyBatch` (one IPC round-trip), not repeated
  `registerKey`, which measurably slows startup.
- Registration is process-global, so doing it once at boot is enough.
- Some Samsung remotes have no colour buttons at all – keep a D-pad path
  to the same filters.
- Don't rely on colour keys for Play/Pause etc. later without registering
  those names too (`MediaPlayPause`, `MediaPlay`, `MediaStop`, …).

## Other bugs folded into the revised file

- The two `keydown` listeners were inconsistent – one branched on
  `event.key`, the other on `event.keyCode`. Merged into one listener
  that branches on `keyCode` only.
- `KEY.BACK = 8` was unused. Kept `8` only as an optional desktop-dev
  alias (Chrome Backspace), clearly commented.
- Added `e.preventDefault()` on keys you handle so the platform doesn't
  also act on them.

See `remote-input.js` for the revised implementation. It assumes
`app.canGoBack()` / `app.goBack()` exist; wire those to your real screen
stack (any nav library or a manual array works – the point is that *your*
code owns "am I at the root?", not browser history).
