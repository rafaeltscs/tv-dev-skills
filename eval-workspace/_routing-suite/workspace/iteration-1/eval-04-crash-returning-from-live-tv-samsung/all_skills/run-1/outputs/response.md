SKILLS_CONSULTED: tv-platform-quirks

Why: The bug is Samsung-Tizen-specific, only reproduces on real TV hardware (never in the browser), and centers on app lifecycle + the AVPlay/DRM/video-overlay pipeline when the app is backgrounded by a switch to live TV and resumed — exactly the "our Samsung build crashes coming back from live TV" case this skill is scoped to (its Tizen lifecycle and media/DRM reference files).

---

## Short answer

This is almost certainly the classic Tizen failure: **your app is not tearing down the AVPlay media pipeline (and its DRM session / secure decoder) when it goes to the background.** Switching to live TV backgrounds your app exactly like pressing Home. Two things then go wrong, and you're probably seeing both depending on timing:

1. **Crash / cold relaunch** — a suspended app still holding the video decoder is the number-one thing the Tizen OOM killer targets on a low-RAM set. When you come "back" you're actually getting a fresh cold launch, and if your startup path doesn't expect that (or throws), it looks like a crash.
2. **Black screen on the next `play()`** — the hardware video plane is a scarce singleton, and the live-TV tuner takes it while you're backgrounded. A leaked AVPlay instance / DRM session / secure-decoder handle then breaks the *next* playback attempt, with a symptom (black video, silent failure, or an `onerror` far from the cause) that looks unrelated to the source switch.

It never happens in desktop Chrome because none of that machinery exists there: no AVPlay, no hardware overlay plane, no secure-decoder singleton, no suspend-and-OOM-kill, and plenty of RAM. Tab visibility changes in a browser don't force you to release a singleton decoder, so the whole failure class is invisible.

Engine baseline is not the issue here: a 2022 Samsung set is Tizen 6.5 / Chromium M85 (optional chaining, `??`, flexbox `gap` all fine). This is a lifecycle/resource bug, not a syntax-support bug.

## What to do

### 1. Add a real releasing path on `visibilitychange → hidden`

```js
document.addEventListener('visibilitychange', function () {
  if (document.hidden) releaseForBackground();
  else restoreFromBackground();
});
```

`releaseForBackground()` must actually tear the player down, not just pause it:

- `webapis.avplay.pause()` then `webapis.avplay.stop()` then `webapis.avplay.close()` — full teardown to `NONE`. `close()` releases the DRM session and the secure decoder; a bare `pause()` does not.
- Persist resume state to RAM **now**: `getCurrentTime()` playhead, current screen, focus position — a low-memory set may terminate you with no further callback.
- Stop everything periodic: `clearInterval` / `clearTimeout`, cancel `requestAnimationFrame`, disconnect observers, pause carousels.
- Halt network: analytics beacons, prefetch, polling.
- Drop large rebuildable textures/images.
- Make this function **idempotent and exception-safe** — `visibilitychange` also fires on app exit, so it runs as your teardown path too. Wrap every `webapis.avplay.*` call in try/catch and check state first (calling `play()` on a closed instance, or `open()` twice without `close()`, throws).

### 2. Rebuild on the restoring path (`visible` again)

- Re-check connectivity: `webapis.network.isConnectedToGateway()`.
- **Re-validate time-sensitive things before you replay**: signed media URLs and DRM license/proxy URLs may have expired while you sat on live TV. An expired signed URL or license is itself a common "black screen, no error" cause. Do not trust an internal elapsed-time calculation across the suspension — Samsung explicitly warns against it.
- Rebuild AVPlay from scratch: `open(url)` → `setDisplayRect(...)` → `setStreamingProperty(...)` → `setDrm(...)` (in `IDLE`, before prepare) → `prepareAsync(...)` → `seekTo(savedPlayhead)` → `play()`.
- Re-align the transparent "hole" in your DOM with `setDisplayRect` in 1920×1080 coords — resolution/overlay state can change across the switch.
- Restart timers/observers, rebuild dropped textures.

### 3. Don't run rebuild twice

If the app was actually OOM-killed, the switch back is a cold launch — your normal startup runs, and it should read the persisted playhead (and any `getRequestedAppControl()` deep link). If the app was only suspended, your `visible` handler rebuilds. Guard so you don't do both.

### 4. Optionally try the lightweight path, but verify on the actual set

`webapis.avplay.suspend()` / `restore()` can hold a prepared pipeline across a short background trip, which is nicer than a full rebuild — but support varies by model and firmware. Test it specifically on the 2022 set; if it's flaky there, fall back to full `stop()`/`close()` + rebuild.

### 5. Handle AVPlay errors instead of letting them throw

Register `setListener({ onerror, ondrmevent, onstreamcompleted, ... })` and recover gracefully (surface a retry, rebuild the player). An unhandled throw out of an AVPlay callback can take the whole app down and present as "the crash."

## How to confirm the diagnosis

- Reproduce on the real 2022 set with Tizen Studio / remote web inspector attached — not the emulator (DRM doesn't work there anyway). Log entry/exit of your releasing and restoring paths.
- Check whether the "return" is actually a **cold launch** (your top-level init runs again) → that's the OOM-kill path, meaning your teardown isn't freeing enough / isn't running.
- Watch memory across `browse → switch to live TV → back` several times. It should plateau. A climb every cycle means the releasing path is leaking (most likely the AVPlay instance or DRM session not being `close()`d).
- On the black-screen case, capture the AVPlay `onerror` / `ondrmevent` code on the failed next `play()` — a decoder-busy or DRM-session error confirms a leaked secure-decoder/DRM handle from before the switch.
- Confirm `visibilitychange` actually fires (and fires in time) when you drop to the live-TV source on this firmware. If it's late or unreliable there, also hook the Tizen application Pause/Resume path (`webapis.appcommon` / app-control) so your teardown still runs.
