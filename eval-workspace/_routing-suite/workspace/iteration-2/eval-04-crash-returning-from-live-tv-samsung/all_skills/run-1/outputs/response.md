SKILLS_CONSULTED: tv-platform-quirks

Why: The failure is Samsung-specific, browser-clean, and triggered by leaving/re-entering the app around a live-TV (tuner) source switch — that is a Tizen app-lifecycle + AVPlay/decoder/DRM teardown problem, which is exactly what `tv-platform-quirks` (Samsung Tizen: lifecycle, media/DRM) covers.

---

## Short answer

You are almost certainly leaking the video pipeline when the app goes to the background. Switching to live TV hides your app and hands the single hardware video decoder / overlay plane to the tuner. If your app never tore its `AVPlay` (or `<video>`/MSE) instance down, then on the way back the next `prepare()`/`play()` collides with a stale decoder + DRM session. Symptom is either a black video plane on the next play, or a native crash that takes the whole app down. It never reproduces in a desktop browser because the browser has no suspend/resume lifecycle and no scarce hardware overlay singleton — it just uses a software/MSE path.

A 2022 Samsung set is Tizen 6.5 / Chromium M85. The engine version is not the issue here; the lifecycle and the native player are.

## What is actually happening

1. User hits the TV/source button. Tizen backgrounds your app: `document.hidden` becomes `true`, `visibilitychange` fires (Tizen also raises Pause/Resume, and the same event fires on exit).
2. The live-TV tuner grabs the hardware decoder and the video overlay plane. The overlay is a **scarce singleton** — one `AVPlay` instance at a time, and a second consumer evicts or fails against the first.
3. Your app either keeps a prepared `AVPlay` instance alive, or keeps a decrypt/decode (DRM) session open, or both.
4. User comes back. Your code calls `play()` / `restore()` / re-`prepare()` on an instance whose underlying decoder was yanked, or opens a *second* instance while the first is still allocated. Result: `onerror` from the AVPlay listener and a black plane, or a native-layer crash.
5. If it is a hard crash rather than black, the secondary cause is memory: a backgrounded app still holding the decoder plus its UI textures, while live TV also runs, trips the low-memory killer. Same fix.

## Fix: release on hidden, rebuild on visible

### Releasing path — run on `visibilitychange` when `document.hidden`

Treat backgrounding exactly like the user pressing Return out of playback. Make this path idempotent and safe to run as teardown (it also fires on exit).

```js
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releasePlayback();
  else restorePlayback();
});

function releasePlayback() {
  try {
    savePlayhead(webapis.avplay.getCurrentTime()); // to RAM; low-mem set can kill you with no further callback
    const state = webapis.avplay.getState();
    if (state !== 'NONE' && state !== 'IDLE') webapis.avplay.stop();
    webapis.avplay.close();          // NONE — frees decoder, overlay plane, and DRM session
  } catch (e) { /* log, do not rethrow */ }
  // if you also use <video>/MSE anywhere: video.pause(); video.removeAttribute('src'); video.load();
  clearAllTimersAndRaf();
  stopNetwork();                     // analytics, prefetch, polling
  dropLargeTextures();
}
```

Key points:
- `stop()` then `close()`. `close()` (back to `NONE`) is what releases the secure decoder and the DRM session. A leaked DRM/decode session is the classic "breaks the *next* playback" bug — the symptom shows up far from the cause.
- Do **not** lean on `webapis.avplay.suspend()` / `restore()` for this. That is meant for a short background trip where the pipeline can be held; support varies by model, and a live-TV switch fully repossesses the decoder, so a held/suspended instance is exactly what comes back broken. Full `close()` + rebuild is the reliable path.
- Only ever hold one `AVPlay` instance. Guard `open()` so a resume can't create a second one.

### Restoring path — run on `visibilitychange` when visible again

Rebuild from scratch; do not assume anything survived.

```js
function restorePlayback() {
  if (!webapis.network.isConnectedToGateway()) { showRetryUI(); return; }
  // signed media URLs and DRM license/proxy URLs may have expired while live TV was on-screen
  const { manifestUrl, licenseUrl } = refreshPlaybackUrls();

  webapis.avplay.open(manifestUrl);
  webapis.avplay.setDisplayRect(x, y, w, h);          // 1920x1080 coords; realign the transparent hole in your UI
  webapis.avplay.setStreamingProperty('ADAPTIVE_INFO', /* ... */);
  webapis.avplay.setDrm('WIDEVINE_CDM', 'SetProperties', { /* ..., licenseUrl */ }); // or PLAYREADY, in IDLE, before prepare
  webapis.avplay.setListener({ onerror: logAndSurface, /* ... */ });
  webapis.avplay.prepareAsync(() => {
    webapis.avplay.seekTo(loadPlayhead());
    webapis.avplay.play();
  }, logAndSurface);
}
```

- Re-validate time-sensitive things: login session, signed CDN URLs, DRM license URL. Samsung explicitly warns against trusting an internal elapsed-time calc across suspension — the user may have watched live TV for an hour.
- Re-check connectivity with `webapis.network.isConnectedToGateway()` before any network work.
- Recompute and reapply `setDisplayRect`, and re-punch the transparent hole in your DOM over the video rect — resolution/overscan state can differ after the source round-trip.
- Guard every `webapis.*` call in try/catch and check `getState()` before transitions (don't call `play()` unless `READY`/`PAUSED`).

## Confirming it on the device

- Attach the Web Inspector (`sdb`/`tizen` CLI, Tizen Studio) to the set. Reproduce the switch and watch the console plus the `AVPlay` `onerror` callback on the return.
- Log `webapis.avplay.getState()` immediately before and after the transition in both directions — you'll likely see a non-`NONE` state persisting across the background, or two `open()` calls.
- Check the platform log (`sdb dlog`) at the moment of the crash for a native media-pipeline fault or an OOM/lowmem kill signature — that tells you whether you're chasing the decoder leak or the memory ceiling (the fix above addresses both).
- Verify memory plateaus across watch -> live TV -> back cycles. A climb every return means the releasing path is still leaking (textures or listeners).

## Also worth checking

- Make sure the same releasing path runs on Return-at-root / `exit()` too, so you don't leave a session behind on the way out.
- If any part of your player stack is plain `<video>` + MSE (e.g. hls.js), it needs the same discipline: destroy the `MediaSource`, clear `src`, call `load()` on hidden.
- The `webapis.js` bootstrap (`<script src="$WEBAPIS/webapis/webapis.js">`) must load before app code, and the AVPlay/DRM privileges must be in `config.xml` — if either is missing you get a different "works in browser, undefined on TV" failure, but it's cheap to rule out.
