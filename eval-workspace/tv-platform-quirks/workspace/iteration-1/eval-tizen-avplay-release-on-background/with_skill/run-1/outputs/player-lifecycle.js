// Video playback wrapper for our Samsung Tizen app (Tizen 6.0+), using
// AVPlay (webapis.avplay) for the main content.
//
// Why this file changed:
// AVPlay owns a SINGLETON hardware video overlay + secure decoder + DRM
// session. When the app is backgrounded (Home) or the TV switches to
// another input (live TV), the platform reclaims/invalidates that
// hardware. An AVPlay instance that was only pause()d is now stale, and
// play() on it throws -> "black screen + AVPlay error until relaunch".
// So we fully tear the pipeline down when we leave the foreground and
// rebuild it from scratch on return.
//
// Requires the media privileges in config.xml and $WEBAPIS/webapis/webapis.js
// loaded before app code.

let avplay = null;
let currentUrl = null;
let resumeTimeMs = 0;
let starting = false; // re-entrancy guard around open()/prepareAsync()

function avplayState() {
  try {
    return avplay && avplay.getState ? avplay.getState() : 'NONE';
  } catch (e) {
    return 'NONE';
  }
}

function attachListeners() {
  avplay.setListener({
    onbufferingcomplete: function () {
      // First play() is driven by the prepareAsync success callback below.
      if (starting) return;
      try { avplay.play(); } catch (e) { console.error(e); }
    },
    oncurrentplaytime: function (ms) {
      resumeTimeMs = ms; // keep a live playhead for rebuild/resume
    },
    onstreamcompleted: function () {
      stopPlayback();
    },
    onerror: function (err) {
      console.error('AVPlay error', err);
      // Covers the "lost the decoder while backgrounded" case even if a
      // visibility transition was missed: rebuild instead of going black.
      rebuildAfterLoss();
    },
  });
}

// Full release: stop -> close -> drop listener -> null the handle.
// Safe to call from any state, and safe as app-exit teardown
// (visibilitychange also fires on exit).
function teardown() {
  if (!avplay) {
    starting = false;
    return;
  }
  try { avplay.stop(); } catch (e) { /* not in a stoppable state */ }
  try { avplay.close(); } catch (e) { /* returns pipeline to NONE, frees overlay + DRM */ }
  try { avplay.setListener({}); } catch (e) { /* ignore */ }
  avplay = null;
  starting = false;
}

export function startPlayback(url, startAtMs) {
  // Never open() a second time on top of a live instance.
  teardown();

  avplay = webapis.avplay;
  currentUrl = url;
  resumeTimeMs = startAtMs || 0;
  starting = true;

  avplay.open(url); // NONE -> IDLE

  // The video plane is a hardware overlay behind the DOM. Position it in
  // 1920x1080 coords and keep a transparent hole in the UI over this rect
  // (re-apply on resize / resolution change).
  avplay.setDisplayRect(0, 0, 1920, 1080);

  attachListeners();

  // If the stream is DRM-protected, call avplay.setDrm(...) HERE, while
  // IDLE, before prepareAsync, with a freshly fetched license URL, e.g.:
  //   avplay.setDrm('WIDEVINE_CDM', 'SetProperties', JSON.stringify({
  //     AppSession: sessionId, DataType: 'MPEG-DASH', LicenseServer: licUrl
  //   }));

  avplay.prepareAsync(
    function onReady() {
      if (resumeTimeMs > 0) {
        try { avplay.seekTo(resumeTimeMs); } catch (e) { console.error(e); }
      }
      starting = false;
      try { avplay.play(); } catch (e) { console.error(e); }
    },
    function onPrepareError(err) {
      console.error('AVPlay prepareAsync failed', err);
      starting = false;
    }
  );
}

export function stopPlayback() {
  // Persist the playhead before releasing the pipeline.
  try {
    if (avplay && avplayState() !== 'NONE' && avplay.getCurrentTime) {
      resumeTimeMs = avplay.getCurrentTime();
    }
  } catch (e) { /* ignore */ }
  teardown(); // stop() -> close(): releases the DRM session + hardware overlay
}

function rebuildAfterLoss() {
  if (!currentUrl) return;
  const at = resumeTimeMs;
  teardown();
  // Re-validate connectivity and refresh any expired signed-media / DRM
  // license URLs here before reopening.
  startPlayback(currentUrl, at);
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    // Releasing path: Home press, app switch, or switch to another TV
    // input. Also fires on app exit, so this must be safe as teardown.
    stopPlayback(); // save playhead, then stop() -> close(), release DRM + overlay
    // Also stop timers / analytics beacons / prefetch / carousels here.
  } else {
    // Restoring path: do NOT call play() on the old instance -- it no
    // longer owns the decoder. Rebuild from the saved playhead.
    if (currentUrl) {
      // Re-check connectivity (webapis.network.isConnectedToGateway())
      // and refresh expired media/license URLs before this call.
      startPlayback(currentUrl, resumeTimeMs);
    }
  }
});

// --- Optional fast path for very short Home-and-back trips -------------
// webapis.avplay.suspend()/restore() can hold a prepared pipeline across
// a brief background trip, but support varies by model (test per target)
// and it does NOT survive a real memory-pressure kill or the live-TV
// input case (the hardware plane was handed to another consumer). If you
// add it, always fall back to a full rebuild on any failure:
//
//   try {
//     avplay.restore();
//   } catch (e) {
//     startPlayback(currentUrl, resumeTimeMs);
//   }
//
// and always full-rebuild after an input/source change.
