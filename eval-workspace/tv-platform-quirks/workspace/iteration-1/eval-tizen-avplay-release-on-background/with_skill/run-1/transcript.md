# Transcript — eval-tizen-avplay-release-on-background (with_skill, run-1)

## Reference files read

1. `skills/tv-platform-quirks/SKILL.md` — routing + non-negotiable conventions.
   - Rule 2: "Release the media pipeline and GPU/DRM resources when you leave the
     foreground" — Tizen path is `stop()` -> `close()` the AVPlay instance on
     `visibilitychange -> hidden`. "A backgrounded app holding the decoder is the
     number-one termination cause and the number-one 'crashes on resume' cause."
   - Rule 7: video plane is a hardware overlay; "a leaked DRM/decode session
     breaks the *next* playback attempt, with a symptom far from the cause."
   - Must-know: "the video plane is a hardware overlay behind the DOM" +
     `setDisplayRect`.
2. `references/tizen-media-and-drm.md` — AVPlay state machine
   (`NONE -> IDLE -> READY -> PLAYING <-> PAUSED`, `stop()` -> IDLE, `close()` ->
   NONE); "video overlay is a scarce singleton"; `close()` before next asset and
   on `visibilitychange -> hidden`; DRM via `setDrm` while IDLE before prepare;
   `suspend()`/`restore()` support varies by model; playback-hygiene checklist
   ("`stop()` -> `close()` (and release DRM) on hidden and on exit",
   "re-validate signed media + license URLs after resume").
3. `references/tizen-lifecycle.md` — `visibilitychange` also fires on exit;
   releasing path = stop media (`pause()` then `close()`, or `suspend()`/
   `restore()` per model), save playhead to RAM, stop timers/network; restoring
   path = re-verify connectivity, re-validate time-sensitive URLs (don't trust
   elapsed-time math across suspension), re-init player from persisted playhead.

## Key reasoning

- Bug code's `visibilitychange -> hidden` handler only calls `avplay.pause()`.
  The suspended app keeps the singleton hardware overlay + secure decoder + DRM
  session allocated.
- Home: OOM killer targets the suspended decoder holder; more importantly the
  "prepared" instance is invalid after the platform reclaims the pipeline.
- Live-TV input: the TV's live tuner takes over the same shared hardware video
  plane. Coming back, the AVPlay instance still reports READY/PAUSED but its
  decoder is gone. Same failure, different trigger — matches "returning from the
  TV's live-TV input does the same thing."
- `visible` handler blindly calls `avplay.play()` on that stale instance -> AVPlay
  error + black screen. No `close()` anywhere, so only a process kill + cold
  relaunch rebuilds the pipeline — matches "until the app is fully killed and
  relaunched."
- `stopPlayback()` calls `stop()` but never `close()` — leaks the DRM/decoder
  session on every stop.

## Fix applied to player-lifecycle.js

- `teardown()` helper: `stop()` -> `close()` -> `setListener({})` -> null handle;
  safe from any state and as exit teardown.
- `hidden`: save playhead, then full `teardown()` (via `stopPlayback()`).
- `visible`: rebuild via `startPlayback(url, savedPlayhead)` instead of `play()`;
  marked hooks for connectivity re-check + media/license URL refresh.
- `startPlayback()`: tears down first (re-entrancy guard), `setDisplayRect`,
  marked `setDrm` slot while IDLE, `seekTo(resume)` in prepare success before a
  single `play()`.
- `onerror` -> `rebuildAfterLoss()` so a missed transition still recovers.
- Playhead tracked via `oncurrentplaytime`.
- Documented `suspend()`/`restore()` as an optional fast path that must fall back
  to full rebuild (and always full-rebuild after an input/source change).
