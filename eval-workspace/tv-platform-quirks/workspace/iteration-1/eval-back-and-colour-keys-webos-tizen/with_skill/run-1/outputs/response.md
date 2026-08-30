# Back button and colour keys: LG webOS vs Samsung Tizen

## Short version

The current `remote-input.js` is written for a desktop keyboard, not a TV
remote. It branches on `event.key` and hardcodes `BACK: 8` (keyboard
Backspace). That happens to work in Chrome on the dev laptop and it
mostly works on the LG sets, because webOS is forgiving: it delivers
every remote key to the page with no setup. Samsung Tizen is not
forgiving, and that is why every symptom shows up only on the Samsung
set:

| Symptom (Samsung) | Cause |
|---|---|
| Back "does nothing" on some screens | The remote Back button on Tizen is `keyCode 10009`, not `8`, and it never arrives as `event.key === 'Backspace'`. No `case` matches, so the handler does nothing. |
| Back "exits the whole app" on other screens | Because the app never handles the key and never calls `preventDefault()`, the Tizen platform runs its **default** action for the Return/Back button, which at many states is "exit the application". |
| Coloured quick-filter buttons never fire | On Tizen, colour / media / number keys are **not delivered to the app at all** until you register them at startup with `tizen.tvinputdevice.registerKeyBatch([...])`. Until then your `keydown` handler simply never sees `keyCode 403/404`. webOS delivers them with no registration, so the same code works on LG. |
| Fine in Chrome on the dev laptop | The physical Backspace key really does produce `event.key === 'Backspace'` / `keyCode 8`, so the one `case` matches; and there are no red/green keys on the laptop, so nobody notices they are unregistered. |

The colour-button key *codes* in the file (`RED: 403`, `GREEN: 404`) are
actually correct for both platforms — 403–406 is Red/Green/Yellow/Blue on
webOS and on Tizen. The only thing missing for colour buttons on Tizen is
the registration call.

## Why this is a platform-quirk problem, not a bug in `app.*`

Two hard facts from the platforms differ between LG and Samsung and the
shared build has to account for both:

1. **Key codes.** Branch on `event.keyCode`, never `event.key` — both
   platforms report `event.key` unreliably for remote buttons (webOS
   often reports `"Unidentified"`). D-pad is `37`–`40` and OK is `13`
   everywhere. **Back is `461` on webOS and `10009` on Tizen** — you must
   map it per platform, not pick one constant.

2. **Key delivery.** webOS hands the page every key. Tizen hands the page
   only the arrows, `Enter`, and `Back` automatically; **everything else
   (colour, media transport, digits) is silent until
   `tizen.tvinputdevice.registerKeyBatch()` runs at startup**, and the
   `tizen.tvinputdevice` namespace needs
   `<tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>`
   in `config.xml` or the call throws.

3. **The Back / exit contract.** Back must move up exactly one level,
   never dead-end, and reach app exit from the root — this is a
   certification item on both stores. The mechanism differs:
   - **Tizen:** you own the navigation stack from the first screen. At a
     non-root screen, navigate up. At the root, call
     `tizen.application.getCurrentApplication().exit()`. An unhandled
     Back closes the app, so you must `preventDefault()` every Back you
     handle.
   - **webOS:** by default Back is wired to browser history
     (`history.pushState()` per navigation → `popstate` pops a level).
     For a shared build it is cleaner to opt out: set
     `"disableBackHistoryAPI": true` in `appinfo.json`, receive
     `keyCode 461` directly, manage your own stack, and at the root call
     `webOS.platformBack()` (from `webOSTV.js`) to run the standard
     exit / "Exit app?" flow.

## How to structure remote handling for both platforms

Aim for one input module that is identical on both platforms except for
two small per-platform tables.

1. **Detect the platform once** at startup (`typeof webOS`,
   `typeof tizen`, `navigator.userAgent`) and store a `PLATFORM`
   constant.

2. **One `keyCode → semantic action` map.** A shared base
   (`37..40`, `13`, `403..406`) plus a per-platform `Back` entry
   (`461` for webOS, `10009` for Tizen). Add media/number codes to the
   base map when you need them — they are the same on both platforms.

3. **Register keys on Tizen at startup.** Call
   `tizen.tvinputdevice.getSupportedKeys()` to see what the set offers,
   then `registerKeyBatch()` the colour / media / digit keys you use.
   Wrap in `try/catch`; do nothing on webOS. Add the
   `tv.inputdevice` privilege to `config.xml`.

4. **One `keydown` listener**, registered once, in the capture phase.
   Branch on `event.keyCode` via the map. For any key you handle, call
   `event.preventDefault()` and `event.stopPropagation()` — this is what
   stops Tizen from also running its "exit app" default on Back.

5. **App-owned navigation stack on both platforms.** `Back` →
   `app.canGoBack() ? app.goBack() : exitToPlatform()`. `exitToPlatform()`
   is the only place with a platform branch:
   `tizen.application.getCurrentApplication().exit()` on Tizen,
   `webOS.platformBack()` on webOS (with `disableBackHistoryAPI: true`
   set in `appinfo.json`).

6. **Do not branch on `event.key`, and do not keep two separate
   `keydown` listeners.** Fold the colour-filter handling into the same
   switch.

### Also worth fixing while the build is shared

- **Engine baseline.** Tizen 6.0 is Chromium M76, webOS 6.0 is Chromium
  ~M79, webOS 5.0 is ~M68. None of those support optional chaining (`?.`)
  or nullish coalescing (`??`) — those land at M80 / Tizen 6.5. If the
  shared bundle uses them untranspiled it will run on the Tizen 6.5 sets
  and break on the Tizen 6.0 / webOS 5 sets. Transpile and polyfill down
  to roughly Chromium 68 and test on the oldest hardware, not just
  desktop Chrome.
- **Key repeat.** Holding a direction fires repeated `keydown`s with no
  reliable `repeat` flag on these engines. Throttle list movement so a
  held key does not overshoot. (Not the cause of the current bug, but the
  same input module should own it.)

## Corrected key handling

See `remote-input.js` in this folder for the full revised file. The shape
is:

```js
const PLATFORM = (() => {
  const ua = navigator.userAgent || '';
  if (typeof webOS !== 'undefined' || /web0s|webos/i.test(ua)) return 'webos';
  if (typeof tizen !== 'undefined' || /tizen/i.test(ua)) return 'tizen';
  return 'browser';
})();

const BASE_KEYS = {
  37: 'LEFT', 38: 'UP', 39: 'RIGHT', 40: 'DOWN', 13: 'OK',
  403: 'RED', 404: 'GREEN', 405: 'YELLOW', 406: 'BLUE',
};
const BACK_KEYCODE = { webos: 461, tizen: 10009, browser: 8 };
const KEYMAP = { ...BASE_KEYS, [BACK_KEYCODE[PLATFORM]]: 'BACK' };

function registerTizenKeys() {
  if (PLATFORM !== 'tizen' || typeof tizen === 'undefined' || !tizen.tvinputdevice) return;
  const wanted = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
    'MediaRewind', 'MediaFastForward', '0','1','2','3','4','5','6','7','8','9'];
  try {
    const supported = tizen.tvinputdevice.getSupportedKeys().map((k) => k.name);
    tizen.tvinputdevice.registerKeyBatch(wanted.filter((n) => supported.indexOf(n) !== -1));
  } catch (err) { console.warn('[remote] key registration failed', err); }
}

function handleBack() {
  if (app.canGoBack()) { app.goBack(); return; }
  if (PLATFORM === 'tizen') {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
  } else if (PLATFORM === 'webos') {
    if (typeof webOS !== 'undefined' && webOS.platformBack) webOS.platformBack();
    else window.close();
  } else {
    history.back();
  }
}

function onKeyDown(e) {
  const action = KEYMAP[e.keyCode];
  if (!action) return;
  e.preventDefault();
  e.stopPropagation();
  switch (action) {
    case 'LEFT':  return app.move('left');
    case 'RIGHT': return app.move('right');
    case 'UP':    return app.move('up');
    case 'DOWN':  return app.move('down');
    case 'OK':    return app.select();
    case 'BACK':  return handleBack();
    case 'RED':   return app.toggleFilter('new');
    case 'GREEN': return app.toggleFilter('free');
    default: return;
  }
}

function initRemote() {
  registerTizenKeys();
  window.addEventListener('keydown', onKeyDown, true);
}
initRemote();
```

### Manifest changes that go with this

- **`appinfo.json` (webOS):** `"disableBackHistoryAPI": true` so
  `keyCode 461` reaches `onKeyDown` instead of driving browser history.
- **`config.xml` (Tizen):**
  `<tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>`
  so `tizen.tvinputdevice.registerKeyBatch` does not throw.
