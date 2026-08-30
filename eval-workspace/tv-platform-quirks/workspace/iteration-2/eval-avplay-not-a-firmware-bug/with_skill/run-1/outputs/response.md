# Samsung Tizen: black screen + AVPlay error after returning from live TV

## Short answer

This is almost certainly **not** an AVPlay firmware bug, and you should not
escalate it to Samsung yet. It's the single most common Tizen playback
defect: the app never releases the AVPlay pipeline when it loses the
foreground, so the next `play()` runs against a decode session the platform
already tore down under you. The `setTimeout` + retry loop can't help,
because there is nothing valid to retry against - only a fresh pipeline
works, which is exactly why kill-and-relaunch is the only thing that clears
it.

## Why it happens

AVPlay is a **single hardware pipeline**: one video decoder, one secure
decode session, one video-overlay plane, and it is shared with the rest of
the TV. The live-TV input is another client of that same hardware.

The sequence in your bug:

1. Content is playing through AVPlay (state `PLAYING`).
2. User switches to the TV's live-TV / tuner input. On Tizen this is a
   background transition exactly like Home or app-switch: `document.hidden`
   becomes true and the app is suspended. The tuner takes the hardware
   decoder and the overlay plane.
3. Your current handler only calls `avplay.pause()`. The AVPlay object still
   looks alive to your JS, but its underlying pipeline has been reclaimed.
4. User returns to the app. Your handler calls `avplay.play()` (or, with the
   new code, `startPlayback` retries). You're calling `play()` on a stale
   instance whose decoder and secure session are gone - result is a black
   frame plus an AVPlay error.
5. Kill + relaunch works because process restart is the only thing that
   forces `webapis.avplay` back to a clean `NONE` state and a new pipeline.

The 2-second delay and 3x retry don't address any of this - they just delay
and repeat the same invalid call. A leaked/evicted decode or DRM session
breaks the *next* playback attempt with a symptom (black screen) far from
the cause, which is why it reads like a firmware bug but isn't.

Note this is the same root cause as the "press Home mid-playback, come back,
black screen" case in the file's header comment - Home and the live-TV input
are the same lifecycle transition.

## The fix: release on background, rebuild on resume

**On `visibilitychange -> hidden`** (which also fires when switching to a TV
source, and on app exit): stop and fully close AVPlay -
`webapis.avplay.stop()` then `webapis.avplay.close()`. `close()` returns the
instance to `NONE` and releases the decoder, the overlay plane, and any DRM
session. Save the playhead first (`getCurrentTime()`), because a low-memory
set may terminate you with no further callback.

**On `visibilitychange -> visible`**: rebuild from scratch -
`open(url)` -> `setDisplayRect(...)` -> `prepareAsync(...)` -> `seekTo(saved
position)` -> `play()`. `prepareAsync` *is* the "wait until the pipeline is
ready" primitive; with a proper rebuild you don't need an arbitrary
`setTimeout` or a retry loop. Re-sign / refresh the media URL and any DRM
license URL before re-opening - signed URLs and licenses routinely expire
during suspension, and Samsung explicitly warns against trusting elapsed
-time math across a suspend.

`webapis.avplay.suspend()` / `restore()` exists for keeping a *prepared*
pipeline across a short background trip, but support varies by model and it
does **not** survive the live-TV case, where the tuner actually reclaims the
decoder. Full teardown + rebuild is the one path that is robust for both
Home and live-TV, so use it unconditionally.

## Other defects in the current file (fix alongside the main one)

- **`startPlayback` never closes a prior session before `open()`.** Opening
  a second AVPlay session over a live one fails or evicts the first. Call
  `stop()` -> `close()` defensively at the top of `startPlayback`.
- **No `onerror` in `setListener`.** Real runtime errors are currently
  invisible; only `prepareAsync`'s error arg is logged. Add `onerror` and
  route it to teardown.
- **Double `play()`** - both `onbufferingcomplete` and the `prepareAsync`
  success callback call it. Keep one.
- **No playhead persistence**, so even a correct rebuild restarts from zero.
  Track it via `oncurrentplaytime` / `getCurrentTime()`.
- **No `setDisplayRect` and no transparent hole in the DOM.** The video
  plane is a hardware overlay behind the web layer; if your UI paints an
  opaque background over the video rect you get a black screen independent
  of the pipeline issue. Position the rect in 1920x1080 coords and keep a
  transparent hole aligned with it on resize.
- **`pause()` / `play()` called with no state guard.** These throw if the
  instance isn't in a valid state (e.g. `play()` from `IDLE`). Gate on
  `getState()`.

The revised `player-lifecycle.js` in this folder implements all of the
above: a single `teardown()` (state-guarded `stop()` -> `close()`), a
`startPlayback()` that tears down first and rebuilds from a saved position,
playhead tracking, an `onerror` handler, `setDisplayRect`, a `urlProvider`
hook for re-signing on resume, and a `visibilitychange` handler that
releases on hidden and rebuilds on visible with no timer or retry loop.

## When it *would* be worth escalating to Samsung

Only after the teardown/rebuild is in place and you still reproduce, on
current firmware, with a minimal case. A credible report needs: exact model
+ firmware/Tizen version, a minimal repro app, the AVPlay error code/message
from `onerror`, the `getState()` value at each step, and confirmation that a
clean `open` -> `prepareAsync` -> `play` from `NONE` (no leftover instance)
still fails after the live-TV round trip. Known genuine firmware quirks tend
to be model-specific `suspend()`/`restore()` breakage - which is a reason to
avoid that API, not to block on Samsung.
