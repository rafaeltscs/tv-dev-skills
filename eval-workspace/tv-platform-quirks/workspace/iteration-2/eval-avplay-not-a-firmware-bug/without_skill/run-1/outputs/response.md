# Samsung Tizen: black screen + AVPlay error after returning from the live-TV input

## Short answer

This is almost certainly **not** a Samsung firmware bug, and I would not escalate
it yet. It is an application-side resource-lifecycle problem. Your current resume
code (delay + retry `play()`) can't fix it because it is retrying the wrong
operation on a pipeline that the platform has already destroyed.

## What is actually happening

`webapis.avplay` is a thin wrapper around a **single hardware media pipeline** on
the TV: a video decoder that is shared with the tuner, plus one video plane /
display surface. There is effectively one of these on the box.

When the user switches to the TV's live-TV input (or, often, when the app is
backgrounded via Home), the platform **preempts that pipeline** and hands the
decoder and the video plane to the tuner. Your in-memory `avplay` object is now a
handle to a pipeline that no longer exists. Its display surface binding is gone.

So on resume:

- `avplay.play()` on that stale handle throws / no-ops and you get a black
  screen. This is expected, not a defect.
- A `setTimeout` before `play()` doesn't help, because nothing "settles" - the
  resource was taken away, not left in a transient state.
- A 3x retry loop doesn't help, because every retry calls `play()` on the same
  dead pipeline.
- Killing and relaunching "works" only because relaunch builds a brand-new
  pipeline from scratch - which is exactly what your resume path needs to do.

## The fix (in order of preference)

1. **Use `suspend()` / `restore()` for background transitions.** These AVPlay
   methods exist specifically for foreground/background and preserve the play
   position internally:
   - on `document.hidden` -> `avplay.suspend()` (not `pause()`)
   - on visible again -> `avplay.restore()` (not `play()`)

2. **Fall back to a full rebuild when `restore()` fails.** After the live-TV
   input has hard-preempted the decoder, `restore()` will often throw or come
   back in a bad `getState()`. When that happens, do a real teardown and
   rebuild: `avplay.close()` -> `avplay.open(url)` -> `setDisplayRect(...)` ->
   `prepareAsync()` -> `seekTo(lastPosition)` -> `play()`. Track the current URL
   and the last `oncurrentplaytime` value so you can resume in place.

3. **Recover on `onerror` too.** The live-TV case does not always deliver a
   `visibilitychange` - sometimes the WebView stays "visible" while only the
   video plane is stolen, so your only signal is the AVPlay error callback. Wire
   `setListener({ onerror })` to the same full-rebuild routine.

4. **Always `close()` in teardown.** Your `stopPlayback()` calls `stop()` only.
   `stop()` does not release the decoder; `close()` does. Leaking the pipeline
   across a live-TV excursion is a large part of why you end up needing a
   relaunch.

Also minor: `avplay` is a singleton object, not a constructor, so any bad state
from a previous session carries over - always `close()` before `open()`; and
after any rebuild you must call `setDisplayRect()` again because the surface does
not survive preemption.

The revised `player-lifecycle.js` in this folder implements all of the above.

## If you still want to escalate to Samsung

Do the rebuild-on-resume fix first. If a correct `close()` -> `open()` ->
`prepareAsync()` -> `play()` sequence *also* yields a black screen, then it is
worth a ticket. Include:

- Exact Tizen version and TV model + firmware build.
- The AVPlay error string you get (e.g. `PLAYER_ERROR_INVALID_STATE`,
  `PLAYER_ERROR_INVALID_PARAMETER`, a resource/connection error). The specific
  code tells them - and you - whether this is state, parameter, or genuine
  resource-allocation failure.
- A minimal repro app that does nothing but open/prepare/play, switch to live
  TV, come back, and rebuild.
- Whether it reproduces on more than one model (if it is only one panel /
  firmware, that strengthens the firmware-bug case).
