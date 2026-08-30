// Global remote-control handling for our web TV app. We ship the same
// build to LG (webOS 5 / 6) and Samsung (Tizen 6.0 / 6.5).
//
// IMPORTANT: key handling is done on NUMERIC key codes (e.keyCode), not on
// event.key strings. TV remotes do not give you a stable, cross-platform
// event.key value for Back or the coloured buttons -- webOS and Tizen each
// send their own number, and on Tizen some of these keys are not delivered
// to the app at all until they are registered (see registerKey below).
// event.key is only dependable for the D-pad arrows and Enter, which is why
// navigation already works on both sets while Back and the colour buttons
// were silently doing nothing.

const KEY = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,

  // Back / Return -- same physical button, three different codes:
  BACK_KEYBOARD: 8,   // Backspace on a dev keyboard in desktop Chrome
  BACK_WEBOS: 461,    // LG webOS remote BACK
  BACK_TIZEN: 10009,  // Samsung Tizen remote RETURN / BACK

  // Coloured buttons (CEA-2014 codes -- identical on webOS and Tizen once
  // the OS actually delivers them to the app).
  RED: 403,
  GREEN: 404,
  YELLOW: 405,
  BLUE: 406,
};

const BACK_KEYS = [KEY.BACK_KEYBOARD, KEY.BACK_WEBOS, KEY.BACK_TIZEN];

// --- Tizen: claim the keys the platform withholds by default -----------------
// Arrows, Enter and Return (10009) are delivered without registration. The
// coloured buttons (and media / number keys) are swallowed by the OS until
// registerKey() is called -- this is why RED / GREEN "do nothing" on Samsung
// even though the key codes (403 / 404) are already correct. webOS needs no
// equivalent, and the guard makes this a no-op in desktop Chrome.
if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
  ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'].forEach((name) => {
    try {
      tizen.tvinputdevice.registerKey(name);
    } catch (err) {
      console.warn('tvinputdevice.registerKey failed for', name, err);
    }
  });
}

window.addEventListener('keydown', (e) => {
  const code = e.keyCode || e.which;

  switch (code) {
    case KEY.LEFT: return app.move('left');
    case KEY.RIGHT: return app.move('right');
    case KEY.UP: return app.move('up');
    case KEY.DOWN: return app.move('down');
    case KEY.ENTER: return app.select();

    // colour buttons -> quick filters
    case KEY.RED: return app.toggleFilter('new');
    case KEY.GREEN: return app.toggleFilter('free');
  }

  if (BACK_KEYS.indexOf(code) !== -1) {
    // Consume the event so webOS / Tizen do not ALSO run their own default
    // Back handling. On Tizen an unhandled 10009 backgrounds / exits the app
    // (QA's "exits the whole app on some screens"); on webOS the default is a
    // history back, which is why LG looked like it worked.
    e.preventDefault();

    // TODO: guard the root screen. history.back() with an empty history stack
    // will still exit the app on Tizen -- handle root-level Back explicitly
    // (exit confirm dialog, or an intentional
    // tizen.application.getCurrentApplication().exit()).
    return history.back();
  }
});
