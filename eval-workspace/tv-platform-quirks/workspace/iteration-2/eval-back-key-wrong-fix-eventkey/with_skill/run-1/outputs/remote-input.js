// Global remote-control handling for our web TV app. We ship the same
// build to LG (webOS 5 / 6) and Samsung (Tizen 6.0 / 6.5).
//
// Cross-platform rules baked in here:
//
//  - Branch on event.keyCode, NEVER event.key. webOS reports
//    event.key === "Unidentified" for most remote buttons; Tizen's key
//    names are inconsistent too. keyCode is the only stable discriminator.
//
//  - Back is a DIFFERENT keyCode per platform: 461 on webOS, 10009 on
//    Tizen. Handle both. (The old `case 'Backspace'` never ran on either
//    TV -- on LG, webOS's History-API wiring was calling history.back()
//    for us; on Samsung nothing matched, so Back looked dead on deep
//    screens and hit Tizen's default "exit app" at the root.)
//
//  - On Tizen, colour / media / number keys are NOT delivered to the
//    keydown handler until they are registered at startup with
//    tizen.tvinputdevice. webOS delivers every key with no registration --
//    that is why RED/GREEN work on LG and do nothing on Samsung. The
//    keyCodes (403/404) are identical on both platforms; only delivery
//    differs.
//
//  - webOS only: set "disableBackHistoryAPI": true in appinfo.json so
//    keyCode 461 reaches this handler instead of being consumed by the
//    platform's browser-history wiring. That lets one owned nav stack
//    serve both platforms.

const KEY = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,
  BACK_WEBOS: 461,
  BACK_TIZEN: 10009,
  BACK_DEV: 8, // desktop Chrome Backspace -- dev convenience only
  RED: 403, // ColorF0Red   -- same code on webOS and Tizen
  GREEN: 404, // ColorF1Green -- same code on webOS and Tizen
};

// --- Tizen: register the non-default keys, or they never arrive --------
// Only ArrowLeft/Up/Right/Down, Enter and Back are delivered
// automatically on Tizen. Everything else is silent until registered.
// Guarded by the `tizen` global so this is a harmless no-op on webOS.
if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
  try {
    // Batch form: one IPC round-trip. Add media/number key names here
    // (e.g. 'MediaPlayPause', '0'...'9') if/when those become load-bearing.
    tizen.tvinputdevice.registerKeyBatch(['ColorF0Red', 'ColorF1Green']);
  } catch (err) {
    console.error('Tizen key registration failed', err);
  }
}

// --- single keydown handler, branching on keyCode ---------------------
window.addEventListener('keydown', (e) => {
  switch (e.keyCode) {
    case KEY.LEFT:
      e.preventDefault();
      return app.move('left');
    case KEY.RIGHT:
      e.preventDefault();
      return app.move('right');
    case KEY.UP:
      e.preventDefault();
      return app.move('up');
    case KEY.DOWN:
      e.preventDefault();
      return app.move('down');
    case KEY.ENTER:
      e.preventDefault();
      return app.select();

    // colour buttons -> quick filters (Tizen: only after registerKeyBatch)
    case KEY.RED:
      e.preventDefault();
      return app.toggleFilter('new');
    case KEY.GREEN:
      e.preventDefault();
      return app.toggleFilter('free');

    // Back: 461 on webOS, 10009 on Tizen, 8 for desktop dev
    case KEY.BACK_WEBOS:
    case KEY.BACK_TIZEN:
    case KEY.BACK_DEV:
      e.preventDefault();
      return handleBack();

    default:
      return;
  }
});

// --- Back / exit contract -------------------------------------------
// Back must move up exactly one level, must never dead-end, and from the
// app root it must reach app exit. Own the stack explicitly -- do not
// lean on browser history (Tizen doesn't wire Back to it at all, and on
// webOS we've opted out via disableBackHistoryAPI to handle 461 here).
function handleBack() {
  if (app.canGoBack()) {
    app.goBack();
    return;
  }

  // At the root screen -> exit the app, per platform.
  if (typeof tizen !== 'undefined' && tizen.application) {
    // Tizen: you own the stack; exit explicitly at the root.
    tizen.application.getCurrentApplication().exit();
  } else if (typeof webOS !== 'undefined' && typeof webOS.platformBack === 'function') {
    // webOS: hand off to the standard exit / Home flow (webOSTV.js).
    webOS.platformBack();
  }
}
