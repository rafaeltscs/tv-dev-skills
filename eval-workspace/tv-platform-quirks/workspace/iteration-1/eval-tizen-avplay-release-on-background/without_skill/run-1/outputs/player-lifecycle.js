// Video playback wrapper for our Samsung Tizen app (Tizen 6.0+).
// Main content plays through AVPlay.
//
// Root cause of the "black screen + AVPlay error after Home / live-TV return"
// bug:
//
//   AVPlay is a singleton in front of a hardware video decoder and a video
//   plane. When the app is backgrounded (Home key) or another source takes the
//   decoder (returning from the TV's live-TV input), the platform tears down
//   that native pipeline. The JS `webapis.avplay` handle survives, but its
//   native session is gone: getState() drops to 'NONE'/'IDLE' and the display
//   surface is invalid. Calling pause()/play() on that dead handle throws an
//   AVPlay error and shows black. Only a process restart rebuilds the native
//   session -- hence "kill and relaunch fixes it".
//
// Fix: treat background / preemption as a hard teardown. On hide, save the
// position and fully stop() + close() AVPlay. On return, rebuild the pipeline
// from scratch (open -> listeners -> setDisplayRect -> prepareAsync -> seekTo
// -> play). Never call play() on resume without re-preparing. Recover the same
// way from the onerror callback, which is what fires on live-TV preemption when
// no visibilitychange is delivered.

let avplay = null;
let currentUrl = null;
let resumePositionMs = 0;
let isPreparing = false;
let wantPlayback = false; // true between startPlayback() and stopPlayback()

// Match this to the app's real canvas resolution (3840x2160 for a 4K app).
const DISPLAY_RECT = { x: 0, y: 0, width: 1920, height: 1080 };

function buildListener() {
  return {
    onbufferingcomplete: () => {
      // Only auto-start when playback is actually wanted and we are not
      // mid-prepare/seek. The old code called play() on every buffering event.
      if (wantPlayback && !isPreparing) {
        safePlay();
      }
    },
    onstreamcompleted: () => stopPlayback(),
    onerror: (err) => {
      console.error('AVPlay error', err);
      // Decoder / video plane was pulled out from under us (common when coming
      // back from the TV's live-TV input). Rebuild the whole pipeline.
      recoverPlayback();
    },
  };
}

function safePlay() {
  if (!avplay) return;
  try {
    const state = avplay.getState();
    if (state === 'READY' || state === 'PAUSED') {
      avplay.play();
    }
  } catch (e) {
    console.error('safePlay failed, recovering', e);
    recoverPlayback();
  }
}

// Fully release the native AVPlay session and the hardware decoder.
function teardown() {
  if (!avplay) return;
  try {
    const state = avplay.getState();
    if (state !== 'NONE' && state !== 'IDLE') {
      avplay.stop(); // stop() -> IDLE, frees the decoder
    }
  } catch (e) {
    console.error('avplay.stop failed', e);
  }
  try {
    avplay.close(); // close() releases the native session fully
  } catch (e) {
    console.error('avplay.close failed', e);
  }
  avplay = null;
  isPreparing = false;
}

function preparePipeline(url, startAtMs) {
  avplay = webapis.avplay;
  isPreparing = true;

  avplay.open(url);
  avplay.setListener(buildListener());

  // Re-establish the video plane every time -- the old surface is invalid
  // after a background / input-switch cycle.
  avplay.setDisplayRect(
    DISPLAY_RECT.x,
    DISPLAY_RECT.y,
    DISPLAY_RECT.width,
    DISPLAY_RECT.height
  );

  avplay.prepareAsync(
    () => {
      isPreparing = false;
      if (startAtMs && startAtMs > 0) {
        try {
          avplay.seekTo(startAtMs); // play resumes via onbufferingcomplete
        } catch (e) {
          console.error('seekTo failed', e);
        }
      }
      if (wantPlayback) safePlay();
    },
    (err) => {
      isPreparing = false;
      console.error('prepareAsync failed', err);
    }
  );
}

export function startPlayback(url) {
  wantPlayback = true;
  currentUrl = url;
  resumePositionMs = 0;
  teardown(); // in case a previous session is still open
  preparePipeline(url, 0);
}

export function stopPlayback() {
  wantPlayback = false;
  resumePositionMs = 0;
  teardown();
}

// Save position and release the decoder BEFORE the platform suspends us.
function suspendPlayback() {
  if (!avplay || !wantPlayback) return;
  try {
    resumePositionMs = avplay.getCurrentTime() || 0;
  } catch (e) {
    resumePositionMs = 0;
  }
  teardown();
}

// Rebuild the pipeline from scratch on return (or after an AVPlay error).
function recoverPlayback() {
  if (!wantPlayback || !currentUrl) return;
  teardown();
  preparePipeline(currentUrl, resumePositionMs);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    suspendPlayback();
  } else {
    recoverPlayback();
  }
});
