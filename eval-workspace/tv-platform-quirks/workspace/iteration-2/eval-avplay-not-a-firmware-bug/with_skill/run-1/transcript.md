# Transcript - eval-avplay-not-a-firmware-bug (with_skill, run-1)

## Task

Samsung Tizen app. After returning from the TV's live-TV input, the next
`play()` is a black screen + AVPlay error until kill/relaunch. Team already
added a 2s `setTimeout` before `play()` on resume plus a 3x retry loop; still
black. Question: known AVPlay firmware bug to escalate to Samsung, or a
workaround?

## Skill invoked

`tv-dev-skills:tv-platform-quirks`

## Reference files read

1. `skills/tv-platform-quirks/SKILL.md` - routing + the 8 non-negotiable
   conventions. Relevant: rule 2 (release the media pipeline and GPU/DRM
   resources on `visibilitychange -> hidden`; Tizen: `stop()` -> `close()`
   the AVPlay instance; "a backgrounded app holding the decoder is the
   number-one 'crashes on resume' cause"), rule 7 (video plane is a hardware
   overlay; "a leaked DRM/decode session breaks the *next* playback attempt,
   with a symptom far from the cause").
2. `references/tizen-media-and-drm.md` - AVPlay state machine
   (`NONE -> IDLE -> READY -> PLAYING <-> PAUSED`, `stop()` back to IDLE,
   `close()` to NONE). "The video overlay is a scarce singleton. One AVPlay
   instance at a time; a second concurrent decode typically fails or evicts
   the first. `close()` it fully before opening the next asset, and on
   `visibilitychange -> hidden`." `suspend()`/`restore()` support "varies by
   model - test". Playback hygiene checklist: `stop()` -> `close()` on hidden
   and on exit; re-validate signed media + license URLs after resume.
3. `references/tizen-lifecycle.md` - `visibilitychange` is the signal; it
   **also fires on app exit**, and Paused/Hidden covers "user pressed Home,
   switched app, or **went to a TV source**" (i.e. the live-TV input is the
   same transition as Home). Releasing path step 1: "`pause()` then `close()`
   the AVPlay instance ... A suspended app holding the decoder is the top
   termination cause." Restoring path: re-verify connectivity; re-validate
   time-sensitive things - login, signed media URLs, DRM license/proxy URLs
   "may have expired"; "Samsung explicitly warns against trusting an internal
   elapsed-time calculation across suspension"; re-init the player from the
   persisted playhead.

## Key reasoning

- The reported trigger (live-TV input) is, on Tizen, an ordinary
  background/suspend transition - the lifecycle ref lists "went to a TV
  source" alongside Home. The file header comment already notes Home
  mid-playback produces the identical bug, confirming one root cause.
- AVPlay is a single shared hardware pipeline (decoder + secure session +
  overlay plane). The live-TV tuner is another client of that hardware; while
  the app is suspended the tuner reclaims the decoder/overlay.
- The existing `visibilitychange` handler only calls `avplay.pause()` on
  hidden and `avplay.play()` on visible. It never releases the pipeline, so
  after the tuner round trip the JS object is stale - its decode session is
  gone. `play()` on it yields a black frame + AVPlay error. Only a process
  restart returns `webapis.avplay` to a clean `NONE`, which is why
  kill/relaunch is the sole fix today.
- Therefore the `setTimeout` + 3x retry cannot work: they delay and repeat an
  invalid call against a dead instance. Not a timing problem.
- Conclusion: not a firmware bug. Fix = release on background
  (`stop()` -> `close()`), rebuild on resume
  (`open` -> `setDisplayRect` -> `prepareAsync` -> `seekTo` -> `play`) from a
  saved playhead, with URL re-signing on resume. `prepareAsync` replaces the
  hand-rolled wait; no retry loop needed. `suspend()`/`restore()` rejected as
  the primary path (model-dependent, and won't survive the tuner reclaiming
  the decoder).
- Escalate to Samsung only if the bug still reproduces on current firmware
  after teardown/rebuild, with a minimal repro, the `onerror` code, and
  `getState()` values captured at each step.

## Secondary defects flagged in the revised file

`startPlayback` never `close()`s a prior session before `open()`; no
`onerror` in `setListener` (real errors invisible); double `play()`
(`onbufferingcomplete` + `prepareAsync` success); no playhead persistence; no
`setDisplayRect` / no transparent DOM hole (independent black-screen risk);
`pause()`/`play()` with no `getState()` guard (throws from wrong state).

## Outputs written

- `outputs/response.md`
- `outputs/player-lifecycle.js` (revised)
- `transcript.md` (this file)
