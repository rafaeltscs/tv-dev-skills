// Global remote-control handling for our web TV app.
// Same build ships to LG webOS 5 / 6 and Samsung Tizen 6.0 / 6.5.
//
// What was wrong before, and what this version encodes:
//
//  1. The hardware Back button is keyCode 461 on webOS and 10009 on Tizen.
//     It is NOT 8 (that is desktop Backspace) - which is why Back only
//     ever "worked" in Chrome on the dev laptop. With Back unhandled,
//     Tizen falls back to its own behaviour: it pops webview history
//     (SPA router doesn't react -> "Back does nothing") or, with no
//     history left, it closes the app ("Back exits the whole app").
//     Fix: detect the real codes AND preventDefault() so the platform
//     doesn't also act, then drive Back from our own screen stack.
//
//  2. The colour-key codes (403 red, 404 green, 405 yellow, 406 blue)
//     are correct on BOTH platforms. But Tizen does not deliver those
//     keys to the page until you call tizen.tvinputdevice.registerKey().
//     That is why the coloured buttons "never fire" on the Samsung set.
//     webOS needs no registration.
//     Tizen also needs this privilege in config.xml:
//       <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
//
//  3. e.keyCode (not e.key) is the reliable channel on these TV browsers;
//     remote keys report inconsistent / missing e.key strings, especially
//     on older Tizen. e.key is kept only as a desktop-dev fallback.

// ---- platform detection ------------------------------------------------

const UA = navigator.userAgent || '';
const IS_TIZEN = typeof window.tizen !== 'undefined' || /Tizen/i.test(UA);
const IS_WEBOS =
  typeof window.webOSSystem !== 'undefined' ||
  typeof window.webOS !== 'undefined' ||
  /web0s|webos/i.test(UA);

// ---- semantic key map ------------------------------------------------

// keyCode -> action. Contains webOS + Tizen + desktop codes; they do not
// collide, so one build can carry all of them.
const KEYCODE_TO_ACTION = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'enter',

  // Back / Return
  461: 'back', // webOS
  10009: 'back', // Tizen
  8: 'back', // desktop Backspace (dev only)
  27: 'back', // desktop Esc (dev only)

  // Colour keys - CEA-2014 VK_COLORED_KEY_0..3, identical on webOS + Tizen
  403: 'red',
  404: 'green',
  405: 'yellow',
  406: 'blue',
};

// Desktop-only fallback so the app stays drivable in Chrome devtools.
const KEY_STRING_TO_ACTION = {
  ArrowLeft: 'left',
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  Enter: 'enter',
  Backspace: 'back',
  Escape: 'back',
  XF86Back: 'back',
  BrowserBack: 'back',
  ColorF0Red: 'red',
  ColorF0Green: 'green',
  ColorF0Yellow: 'yellow',
  ColorF0Blue: 'blue',
};

function actionFor(e) {
  return KEYCODE_TO_ACTION[e.keyCode] || KEY_STRING_TO_ACTION[e.key] || null;
}

// ---- Tizen: register the non-default keys ---------------------------

// On Tizen only the arrows, OK and Return (10009) are delivered by
// default. The colour keys and media transport keys must be registered
// or the page never receives a keydown for them.
function registerTizenKeys() {
  if (!IS_TIZEN || !window.tizen || !window.tizen.tvinputdevice) return;
  const names = [
    'ColorF0Red',
    'ColorF0Green',
    'ColorF0Yellow',
    'ColorF0Blue',
    'MediaPlayPause',
    'MediaPlay',
    'MediaPause',
    'MediaStop',
    'MediaRewind',
    'MediaFastForward',
  ];
  names.forEach((name) => {
    try {
      window.tizen.tvinputdevice.registerKey(name);
    } catch (err) {
      // Key not supported on this model - safe to ignore.
    }
  });
}

// ---- Back / exit contract -----------------------------------------

// Back is owned by the app's own navigation state, never history.back().
// history-based Back on a TV either does nothing (router not listening to
// popstate) or exits the app (no web history entry left to pop).
function handleBack() {
  if (app.dismissTopOverlay && app.dismissTopOverlay()) return; // modal / menu / player
  if (app.canGoBackInApp && app.canGoBackInApp()) {
    app.goBack(); // pop one screen in our own stack
    return;
  }
  // At a root screen: confirm, then exit through the platform API.
  if (app.confirmExit) {
    app.confirmExit(exitApp);
  } else {
    exitApp();
  }
}

function exitApp() {
  if (IS_TIZEN && window.tizen && window.tizen.application) {
    // .hide() to background instead, if you prefer not to fully quit.
    window.tizen.application.getCurrentApplication().exit();
    return;
  }
  if (IS_WEBOS) {
    window.close(); // returns to the webOS launcher / last source
    return;
  }
  window.close();
}

// ---- single global listener -------------------------------------

function onKeyDown(e) {
  const action = actionFor(e);
  if (!action) return;

  // Consume the key so the platform default does not also run.
  // Critical on Tizen: an unhandled Back closes the app.
  e.preventDefault();
  e.stopPropagation();

  switch (action) {
    case 'left':
    case 'right':
    case 'up':
    case 'down':
      return app.move(action);
    case 'enter':
      return app.select();
    case 'back':
      return handleBack();
    case 'red':
      return app.toggleFilter('new');
    case 'green':
      return app.toggleFilter('free');
    case 'yellow':
      return app.toggleFilter('hd'); // wire to a real filter or remove
    case 'blue':
      return app.toggleFilter('kids'); // wire to a real filter or remove
    default:
      return;
  }
}

function initRemote() {
  registerTizenKeys();
  // One listener, capture phase, so nothing downstream eats the key first.
  window.addEventListener('keydown', onKeyDown, true);

  // Lifecycle hooks belong in the same module (not the cause of this bug):
  //   webOS:  document.addEventListener('webOSRelaunch', ...);
  //           document.addEventListener('webOSLaunch', ...);
  //   both:   document.addEventListener('visibilitychange', ...);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initRemote);
} else {
  initRemote();
}
