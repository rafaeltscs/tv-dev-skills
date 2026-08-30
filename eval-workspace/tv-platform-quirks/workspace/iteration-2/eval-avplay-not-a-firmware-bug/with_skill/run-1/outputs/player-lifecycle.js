// Video playback wrapper for our Samsung Tizen app (Tizen 6.0+ / Chromium 76).
//
// WHY THE "BLACK SCREEN + AVPlay ERROR AFTER RETURNING FROM LIVE TV / HOME"
// HAPPENS, and why the 2s setTimeout + 3x retry did not fix it:
//
//   AVPlay is a single hardware pipeline - one decoder, one secure-decode
//   session, one video-overlay plane - shared with the rest of the TV. When
//   the app leaves the foreground (Home, app switch, OR switching to the
//   TV's live-TV / tuner input) Tizen suspends it and the tuner takes the
//   hardware decoder and overlay plane. The AVPlay instance we left merely
//   pause()d is now stale: its pipeline was torn down underneath us. Calling
//   play() on it afterwards can only produce a black frame and an error, no
//   matter how long we wait or how many times we retry - there is nothing to
//   retry against. Kill + relaunch "fixes" it only because it forces a fresh
//   pipeline.
//
//   This is standard Tizen lifecycle hygiene, NOT an AVPlay firmware bug.
//   The fix: fully release AVPlay (stop -> close) on every loss of the
//   foreground, and rebuild it from scratch (open -> prepareAsync -> play)
//   from the saved playhead on return. The old visibilitychange handler
//   only called pause()/play(), so the pipeline was never released and the
//   resume path played into a dead instance.

let prepared = false;          // true only between prepareAsync success and stop/close
let currentUrl = null;
let resumePositionMs = 0;
let resumeAfterForeground = false;

// The video plane is a hardware overlay BEHIND the DOM, positioned in
// 1920x1080 coordinates. Leave a transparent hole in the UI over this rect
// (no opaque background on the elements covering it) or our own UI hides the
// video - an independent way to get a "black screen". Keep this aligned with
// the DOM hole on every resize / resolution change.
const DISPLAY_RECT = { x: 0, y: 0, w: 1920, h: 1080 };

// The app overrides this so we re-sign / refresh the URL on resume. Signed
// media URLs and DRM license/proxy URLs routinely expire while the app is
// suspended, and Samsung warns against trusting elapsed-time math across a
// suspension. Default is a passthrough for the no-DRM / non-expiring case.
let urlProvider = function (lastUrl) { return lastUrl; };
export function setUrlProvider(fn) { urlProvider = fn; }

function safeGetState() {
  try {
    return webapis.avplay.getState();   // NONE | IDLE | READY | PLAYING | PAUSED
  } catch (e) {
    return 'NONE';
  }
}

// Persist the playhead while the pipeline still exists.
function rememberPosition() {
  try {
    const t = webapis.avplay.getCurrentTime();
    if (typeof t === 'number' && t > 0) resumePositionMs = t;
  } catch (e) { /* not in a state that has a time - keep last known */ }
}

// Full release: the ONLY correct response to losing the foreground or hitting
// a runtime error. Safe to call from any state, including as exit teardown.
function teardown() {
  const state = safeGetState();
  if (state === 'NONE') { prepared = false; return; }
  rememberPosition();
  try {
    if (state === 'PLAYING' || state === 'PAUSED' || state === 'READY') {
      webapis.avplay.stop();
    }
    webapis.avplay.close();       // -> NONE; releases decoder, overlay, DRM session
  } catch (e) {
    console.error('avplay teardown failed', e);
  }
  prepared = false;
}

export function startPlayback(url, startAtMs) {
  // Defensive: never open() on top of an existing or half-dead pipeline.
  teardown();

  currentUrl = url;
  if (typeof startAtMs === 'number') resumePositionMs = startAtMs;

  webapis.avplay.open(url);
  webapis.avplay.setDisplayRect(
    DISPLAY_RECT.x, DISPLAY_RECT.y, DISPLAY_RECT.w, DISPLAY_RECT.h
  );

  webapis.avplay.setListener({
    oncurrentplaytime: function (ms) { resumePositionMs = ms; },
    onstreamcompleted: function () { stopPlayback(); },
    onerror: function (err) {
      // Real runtime error path (was previously invisible - the old code
      // only logged prepareAsync's error arg). Rebuild once from the saved
      // position instead of calling play() on a dead instance.
      console.error('avplay onerror', err);
      teardown();
    },
  });

  webapis.avplay.prepareAsync(
    function onReady() {
      prepared = true;
      if (resumePositionMs > 0) {
        try { webapis.avplay.seekTo(resumePositionMs); } catch (e) {}
      }
      webapis.avplay.play();     // single play() call - old code played twice
    },
    function onPrepareError(err) {
      console.error('avplay prepareAsync failed', err);
      teardown();
    }
  );
}

export function stopPlayback() {
  rememberPosition();
  teardown();
}

// Tizen lifecycle signal. visibilitychange fires on Home, app switch,
// switching to a TV source (live TV / tuner), AND on app exit - so the
// hidden branch must be safe as teardown too (it is).
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    // Releasing path: we are losing the hardware decoder either way.
    const state = safeGetState();
    resumeAfterForeground = (state === 'PLAYING' || state === 'PAUSED');
    teardown();                  // stop() -> close(); records resumePositionMs
  } else {
    // Restoring path: rebuild the pipeline from scratch. No setTimeout, no
    // retry loop - prepareAsync IS the "wait for the pipeline" primitive,
    // and its onError already routes to teardown.
    if (resumeAfterForeground && currentUrl) {
      resumeAfterForeground = false;
      const freshUrl = urlProvider(currentUrl);   // re-sign / refresh first
      startPlayback(freshUrl, resumePositionMs);
    }
  }
});
