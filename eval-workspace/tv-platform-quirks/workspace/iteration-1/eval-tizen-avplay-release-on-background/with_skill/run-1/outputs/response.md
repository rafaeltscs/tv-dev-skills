# Samsung Tizen: black screen + AVPlay error after Home / live-TV, until relaunch

## Short answer

The wrapper never tears the AVPlay pipeline down when the app leaves the
foreground. On `visibilitychange -> hidden` it only calls `avplay.pause()`, so the
suspended app keeps holding AVPlay's **singleton hardware video overlay, secure
decoder, and DRM session**. While you are backgrounded (Home) or while the TV's
own live-TV input takes over that same shared hardware video plane, the platform
reclaims/invalidates the decoder out from under your still-"prepared" AVPlay
instance. On return the code blindly calls `avplay.play()` on that now-stale
instance, which throws an AVPlay error and leaves the screen black. Nothing in the
code can recover it because it never calls `close()` — only a process kill and
cold relaunch rebuilds the pipeline.

Fix: on `hidden`, run the full release path (`stop()` -> `close()`, release DRM,
persist the playhead). On return to `visible`, do **not** call `play()` on the old
instance — rebuild the pipeline from scratch (`open` -> `setDisplayRect` ->
re-`setDrm` -> `prepareAsync` -> `seekTo(saved playhead)` -> `play`), after
re-validating connectivity and refreshing any expired signed-media / license URLs.

## Root cause in detail

### 1. `visibilitychange -> hidden` only pauses; it must release

Samsung's lifecycle guidance is explicit: treat "hidden" exactly like the user
pressing Return out of playback. The releasing path must `pause()` then `close()`
the AVPlay instance (or on some models use `suspend()`/`restore()`), save state to
RAM, and stop all timers/network. This code does none of that — it just pauses.

Consequences of staying "prepared" while suspended:

- **The video overlay is a scarce singleton.** One AVPlay decode session exists
  system-wide. A suspended app that still owns it is the number-one OOM-kill
  target, and it conflicts with any other consumer of that plane.
- **The live-TV input is another consumer of the same hardware plane.** Switching
  the TV to its live tuner hands the shared hardware video decoder/overlay to the
  TV's own playback. When you come back, your AVPlay instance still *thinks* it is
  READY/PAUSED but the decoder underneath it is gone. This is why "returning from
  the TV's live-TV input does the same thing" — it is the same failure as Home,
  reached by a different route.
- **A leaked DRM / secure-decoder session breaks the _next_ playback attempt**,
  with a symptom (black screen, generic AVPlay error) far from the cause.

### 2. `visibilitychange -> visible` blindly calls `avplay.play()`

Even if the instance survived, this is wrong. After a background trip you must:

- re-verify connectivity (`webapis.network.isConnectedToGateway()`) — the network
  may have changed;
- re-validate/refresh time-sensitive URLs — login session, signed media URL, DRM
  license/proxy URL may have expired (Samsung warns against trusting an internal
  elapsed-time calculation across suspension);
- re-init the player from the persisted playhead.

Calling `play()` on a stale instance throws; calling it on an instance whose
signed URL expired fails the license/segment fetch. Both give you the black
screen.

### 3. `stopPlayback()` calls `stop()` but never `close()`

`stop()` moves AVPlay `PLAYING/PAUSED -> IDLE`. The instance still holds the
overlay and the DRM session. Only `close()` returns it to `NONE` and frees those
resources. So every "stop" in this app leaks the secure decoder until the process
dies. The AVPlay teardown contract is `stop()` **then** `close()`, plus dropping
the listener.

### 4. Minor issues folded into the rewrite

- `avplay = webapis.avplay` is re-assigned on every `startPlayback` with no guard
  against `open()`-ing on top of a live instance. Tear down first.
- Both the `prepareAsync` success callback and `onbufferingcomplete` call
  `play()` — redundant double-start on the first buffer.
- The listener is never detached and `avplay` is never nulled, so stale callbacks
  can fire against a closed pipeline.
- No `setDisplayRect` / transparent-hole handling (not the bug, but required for
  the overlay to be visible and stay aligned on resize).
- No playhead tracking, so a rebuild cannot resume where the user was.

## The fix (see revised `player-lifecycle.js`)

Key changes:

1. **`teardown()` helper**: `stop()` -> `close()` -> `setListener({})` -> null the
   handle. Safe from any state, safe as exit teardown (`visibilitychange` also
   fires on app exit).
2. **`visibilitychange -> hidden`** calls the full release (`stopPlayback()` ->
   `teardown()`) after saving the playhead; also the place to stop timers,
   analytics and prefetch.
3. **`visibilitychange -> visible`** rebuilds from scratch via `startPlayback(url,
   savedPlayhead)` instead of `play()`. Hook for connectivity re-check and
   media/license URL refresh is marked in the code.
4. **`startPlayback()`** now: tears down any existing instance first; sets
   `setDisplayRect(0,0,1920,1080)`; has a marked slot for `setDrm(...)` while IDLE
   before `prepareAsync`; seeks to the resume position in the prepare success
   callback before the single `play()`.
5. **`onerror`** triggers a rebuild (`rebuildAfterLoss()`) instead of leaving a
   black screen — this catches the "lost the decoder in the background" case even
   if a transition event is missed.
6. **Playhead tracking** via `oncurrentplaytime` so a rebuild resumes correctly.

### About `suspend()` / `restore()`

`webapis.avplay.suspend()` / `restore()` is the supported way to hold a *prepared*
pipeline across a **short** background trip, and support varies by model — it must
be tested per target device. It is a valid optimization for the quick Home-and-back
case, but it is **not** a substitute for full teardown:

- it will not survive a real memory-pressure termination;
- it will **not** survive the live-TV-input case, because the hardware plane was
  actually handed to another consumer — `restore()` there fails and you must fall
  back to a full rebuild anyway.

So the robust default is full `close()` + rebuild (what the rewrite does). If you
add `suspend()`/`restore()` for the fast path, guard it with a `try/restore()` and
fall back to `startPlayback(url, playhead)` on any failure, and always full-rebuild
after an input/source change.

### DRM note

Provisioning lives inside `avplay.setDrm('PLAYREADY'|'WIDEVINE_CDM',
'SetProperties', json)`, called while IDLE before `prepareAsync`. Because the
rewrite fully closes on background, the DRM session is released cleanly every time,
and re-`setDrm` on rebuild picks up a fresh license URL. DRM does not work on the
emulator — validate this flow on real hardware.
