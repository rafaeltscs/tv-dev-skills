# Tizen AVPlay black screen after Home / live-TV return

## The actual problem

AVPlay is not an ordinary object you can park and resume. `webapis.avplay` is a
singleton in front of a **hardware video decoder plus a video plane / display
surface**. On Tizen TV there is essentially one of these for foreground app
content, and the platform reclaims it whenever your app is not the thing that
should own the screen:

- **Home key** -> your app is suspended. The system tears down the native media
  pipeline behind AVPlay to give resources back to the launcher / other apps.
- **Returning from the TV's live-TV input** -> the tuner path owned the decoder
  and the video plane while you were away. Coming back, that native pipeline is
  gone or invalidated.

In both cases the *JavaScript* handle (`avplay`) is still there and looks fine,
but its native session is dead:

- `avplay.getState()` has dropped to `'NONE'` / `'IDLE'`.
- The display rectangle / surface it was bound to is no longer valid.
- The decoder it held has been freed.

Your `visibilitychange` handler then calls `avplay.pause()` on hide and
`avplay.play()` on show. `pause()`/`play()` are only legal from
`READY` / `PLAYING` / `PAUSED`. Calling them on a torn-down instance throws the
AVPlay error you see, and because nothing is bound to the video plane the screen
stays black. Nothing in the running process rebuilds that native session, so the
only thing that clears it is killing the process and letting a fresh AVPlay
instance be created on relaunch. That is exactly the symptom you described.

Root cause in one line: **you are treating "backgrounded" as "pause", when on
Tizen it has to be treated as "release the decoder and rebuild later".**

Secondary bugs in the current file that make it worse:

1. No `onerror` listener. The live-TV preemption often surfaces as an AVPlay
   error callback rather than a clean `visibilitychange`, and you have nowhere
   to recover from it.
2. `onbufferingcomplete: () => avplay.play()` fires on *every* buffering event,
   including ones triggered while you are trying to pause or seek, so playback
   state fights itself.
3. `prepareAsync` and the display rectangle are only ever set once, at first
   `startPlayback`. After a background cycle the surface must be re-established.
4. No saved playback position, so even a correct rebuild would restart from 0.
5. `avplay` is never `close()`d, so even an explicit teardown leaks the native
   session.

## The fix

Treat background / preemption as a hard teardown and rebuild:

**On hide (or on an AVPlay error):**

1. `resumePositionMs = avplay.getCurrentTime()` (guarded).
2. `avplay.stop()` if state is not already `NONE`/`IDLE` -> frees the decoder.
3. `avplay.close()` -> releases the native session fully.

**On return:**

1. `avplay.open(url)` again.
2. Re-attach `setListener(...)`.
3. `avplay.setDisplayRect(...)` (or `setDisplayMethod`) again -- the old surface
   is invalid.
4. `avplay.prepareAsync(...)`.
5. In the prepare success callback, `avplay.seekTo(resumePositionMs)` if > 0,
   then `play()`.

Never call `play()` on resume without going back through `open` -> `prepareAsync`.
Gate every `play()` on `getState()` being `READY` or `PAUSED`, and route any
failure or `onerror` through the same rebuild path so the live-TV case is
covered even when no `visibilitychange` arrives.

### Lighter alternative

Tizen also exposes `webapis.avplay.suspend()` / `webapis.avplay.restore(url)`
for exactly this lifecycle. `suspend()` on hide keeps the position internally;
`restore(url)` on return rebuilds. It is less code, but `restore()` is
historically flaky across firmware and does **not** reliably cover the
external-input preemption, so the explicit `stop()` + `close()` + rebuild path
above is the robust choice. If you adopt `suspend()`/`restore()`, still keep the
`onerror` -> full-rebuild fallback.

### Other notes

- Keep a `wantPlayback` flag (true between `startPlayback` and `stopPlayback`)
  so lifecycle handlers know whether a rebuild is even wanted, and so
  `onbufferingcomplete` only auto-plays when appropriate.
- `visibilitychange` on Tizen TV does fire on Home; the mistake was the handler
  body, not the event choice. The `onerror` recovery is what backstops the
  input-switch path.
- Re-registering `setDisplayRect` with your real resolution (1920x1080 for a
  1080p app; 3840x2160 if your app canvas is 4K) after each `open` is required,
  not optional.

The revised `player-lifecycle.js` implements all of the above.
