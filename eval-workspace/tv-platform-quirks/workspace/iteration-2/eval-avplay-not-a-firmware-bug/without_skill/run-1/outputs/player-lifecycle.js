// Video playback wrapper for our Samsung Tizen app (Tizen 6.0+). We use
// AVPlay for the main content.
//
// Why the "black screen + AVPlay error after Home / after the live-TV input"
// happens, and why the 2s setTimeout + 3x retry loop never fixed it:
//
// webapis.avplay is a thin wrapper over a SINGLE hardware media pipeline -
// a video decoder shared with the tuner, plus one video plane / display
// surface. When the TV switches to its live-TV input (or the app is
// backgrounded), the platform PREEMPTS that pipeline and gives the decoder
// and the video plane to the tuner. Our in-memory `avplay` handle now
// points at a pipeline that no longer exists and a surface that is no
// longer ours.
//
// Calling play() on that dead handle - even after a delay, even retried -
// can never bring it back. The only recovery is:
//   1. suspend()/restore() for ordinary background transitions, or
//   2. a full teardown (close) + rebuild (open -> prepareAsync -> seek ->
//      play) when restore() fails or the pipeline errors out under us.
// Killing + relaunching "works" only because it rebuilds from scratch.

let avplay = null;
let currentUrl = null;
let lastPositionMs = 0;
let rebuilding = false;

function getState() {
  try {
    return avplay ? avplay.getState() : 'NONE';
  } catch (e) {
    return 'NONE';
  }
}

export function startPlayback(url) {
  currentUrl = url;
  lastPositionMs = 0;
  buildPipeline(url, 0, true);
}

// Build a BRAND-NEW pipeline. Always used for first play and for recovery -
// we never try to reuse a pipeline that may have been preempted.
function buildPipeline(url, startAtMs, autoplay) {
  avplay = webapis.avplay;

  // Fully release anything we might still be holding. stop() alone does NOT
  // free the decoder; close() does. Skipping this is a big reason the app
  // eventually needs a relaunch.
  try {
    avplay.close();
  } catch (e) {
    /* nothing was open */
  }

  avplay.open(url);

  // Re-bind the display surface every build - it does not survive a
  // preemption by the live-TV input.
  try {
    avplay.setDisplayRect(0, 0, 1920, 1080);
  } catch (e) {
    console.error('setDisplayRect failed', e);
  }

  avplay.setListener({
    onbufferingcomplete: () => {
      if (autoplay && getState() === 'PAUSED') avplay.play();
    },
    oncurrentplaytime: (ms) => {
      lastPositionMs = ms;
    },
    onstreamcompleted: () => stopPlayback(),
    onerror: (eventType) => {
      // The pipeline died under us. This is the ONLY signal in the case
      // where the live-TV input steals the video plane without firing a
      // visibilitychange. Rebuild from scratch.
      console.error('AVPlay onerror', eventType);
      recover();
    },
  });

  avplay.prepareAsync(
    () => {
      if (startAtMs > 0) {
        try {
          avplay.seekTo(startAtMs);
        } catch (e) {
          console.error('seekTo failed', e);
        }
      }
      if (autoplay) avplay.play();
    },
    (err) => {
      console.error('prepareAsync failed', err);
      recover();
    }
  );
}

// Full teardown + rebuild at the last known position. THIS is the operation
// that actually clears the black screen; retrying play() does not.
function recover() {
  if (rebuilding || !currentUrl) return;
  rebuilding = true;

  const resumeAt = lastPositionMs;
  try {
    avplay.close();
  } catch (e) {
    /* ignore */
  }

  // Small delay so the platform can finish releasing the decoder it just
  // reclaimed - NOT to let a reused pipeline "settle" (we are not reusing
  // it). ~500ms is plenty in practice.
  setTimeout(() => {
    try {
      buildPipeline(currentUrl, resumeAt, true);
    } finally {
      rebuilding = false;
    }
  }, 500);
}

export function stopPlayback() {
  if (!avplay) return;
  try {
    avplay.stop();
  } catch (e) {
    /* ignore */
  }
  try {
    avplay.close(); // release the pipeline - stop() does not
  } catch (e) {
    /* ignore */
  }
  avplay = null;
}

// Background / foreground handling.
//
// Preferred path: suspend() when we lose the foreground, restore() when we
// get it back. These AVPlay APIs are built for exactly this transition and
// preserve the play position internally - use them instead of pause()/play().
//
// Fallback path: if restore() throws or leaves us in a bad state (which is
// what happens once the live-TV input has hard-preempted the decoder), do a
// full close()/open() rebuild via recover().
document.addEventListener('visibilitychange', () => {
  if (!avplay) return;

  if (document.hidden) {
    try {
      avplay.suspend();
    } catch (e) {
      console.error('suspend failed', e);
    }
  } else {
    let restored = false;
    try {
      avplay.restore(); // resumes from the suspended position
      const s = getState();
      restored = s === 'PLAYING' || s === 'PAUSED';
      if (restored && s === 'PAUSED') avplay.play();
    } catch (e) {
      console.error('restore failed', e);
    }
    if (!restored) recover();
  }
});
