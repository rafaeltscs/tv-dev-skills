// Global remote-control handling for our web TV app.
// Same build ships to LG webOS 5 / 6 and Samsung Tizen 6.0 / 6.5.
//
// Structure:
//   1. Detect the platform once at startup.
//   2. Build a keyCode -> semantic-action map for that platform
//      (Back is the only D-pad/colour code that differs).
//   3. On Tizen, register the keys the platform does NOT deliver by
//      default (colour / media / number). webOS needs no registration.
//   4. ONE keydown listener. Branch on e.keyCode, never e.key.
//      preventDefault() anything we handle so the platform default
//      (on Tizen: "unhandled Back closes the app") does not also run.
//   5. App owns its own navigation stack. Back moves up exactly one
//      level and only exits at the root, through the platform's own
//      exit call.

/* ------------------------------------------------------------------ */
/* 1. platform detection                                              */
/* ------------------------------------------------------------------ */

const PLATFORM = (() => {
  const ua = navigator.userAgent || '';
  if (typeof webOS !== 'undefined' || /web0s|webos/i.test(ua)) return 'webos';
  if (typeof tizen !== 'undefined' || /tizen/i.test(ua)) return 'tizen';
  return 'browser'; // dev laptop / Chrome
})();

/* ------------------------------------------------------------------ */
/* 2. keyCode -> semantic action                                      */
/* ------------------------------------------------------------------ */
// D-pad + OK are 37-40 / 13 on every platform.
// Colour buttons are 403-406 on BOTH webOS and Tizen.
// Back is the one that differs: 461 on webOS, 10009 on Tizen.
// (Backspace 8 kept only so the dev laptop can still drive "back".)

const BASE_KEYS = {
  37: 'LEFT',
  38: 'UP',
  39: 'RIGHT',
  40: 'DOWN',
  13: 'OK',
  403: 'RED',
  404: 'GREEN',
  405: 'YELLOW',
  406: 'BLUE',
};

const BACK_KEYCODE = {
  webos: 461,
  tizen: 10009,
  browser: 8,
};

const KEYMAP = { ...BASE_KEYS, [BACK_KEYCODE[PLATFORM]]: 'BACK' };

/* ------------------------------------------------------------------ */
/* 3. Tizen: register the non-default keys                            */
/* ------------------------------------------------------------------ */
// Only ArrowLeft/Up/Right/Down, Enter and Back arrive automatically on
// Tizen. Colour / media / number keys never reach keydown until they
// are registered here at startup. Needs, in config.xml:
//   <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
// webOS delivers every key with no registration.

function registerTizenKeys() {
  if (PLATFORM !== 'tizen') return;
  if (typeof tizen === 'undefined' || !tizen.tvinputdevice) return;

  const wanted = [
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
    'MediaRewind', 'MediaFastForward',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  ];

  try {
    // Register only what this set actually reports as supported.
    const supported = tizen.tvinputdevice
      .getSupportedKeys()
      .map((k) => k.name);
    const toRegister = wanted.filter((name) => supported.indexOf(name) !== -1);
    // registerKeyBatch = one IPC round-trip; per-key registerKey() at
    // launch measurably slows startup.
    tizen.tvinputdevice.registerKeyBatch(toRegister);
  } catch (err) {
    console.warn('[remote] tvinputdevice registration failed', err);
  }
}

/* ------------------------------------------------------------------ */
/* 4. Back / exit contract - app owns the stack on BOTH platforms     */
/* ------------------------------------------------------------------ */

function handleBack() {
  if (app.canGoBack()) {
    app.goBack(); // up exactly one level - never dead-end, never skip
    return;
  }

  // At the root -> exit through the platform.
  if (PLATFORM === 'tizen') {
    try {
      tizen.application.getCurrentApplication().exit();
    } catch (err) {
      console.warn('[remote] tizen exit failed', err);
    }
    return;
  }

  if (PLATFORM === 'webos') {
    // Requires appinfo.json: "disableBackHistoryAPI": true
    // so keyCode 461 reaches this handler instead of driving browser
    // history. webOS then runs the standard exit / "Exit app?" flow.
    if (typeof webOS !== 'undefined' && webOS.platformBack) {
      webOS.platformBack();
    } else {
      window.close();
    }
    return;
  }

  history.back(); // browser / dev laptop
}

/* ------------------------------------------------------------------ */
/* 5. single keydown handler                                          */
/* ------------------------------------------------------------------ */

function onKeyDown(e) {
  const action = KEYMAP[e.keyCode];
  if (!action) return; // not a key we own - let it through

  // We are handling this key. Stop the platform default: on Tizen an
  // unhandled Back/Return closes the whole app.
  e.preventDefault();
  e.stopPropagation();

  switch (action) {
    case 'LEFT': return app.move('left');
    case 'RIGHT': return app.move('right');
    case 'UP': return app.move('up');
    case 'DOWN': return app.move('down');
    case 'OK': return app.select();
    case 'BACK': return handleBack();
    case 'RED': return app.toggleFilter('new');
    case 'GREEN': return app.toggleFilter('free');
    case 'YELLOW': return; // reserved
    case 'BLUE': return;   // reserved
    default: return;
  }
}

/* ------------------------------------------------------------------ */
/* init                                                               */
/* ------------------------------------------------------------------ */

function initRemote() {
  registerTizenKeys();
  // One listener, capture phase, so we see the key before app widgets.
  window.addEventListener('keydown', onKeyDown, true);
}

initRemote();
