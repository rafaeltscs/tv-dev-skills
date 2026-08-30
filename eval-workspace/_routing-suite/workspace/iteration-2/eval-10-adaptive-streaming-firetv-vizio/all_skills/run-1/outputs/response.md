SKILLS_CONSULTED: tv-platform-quirks

The question is entirely about per-platform adaptive streaming and DRM plumbing on two specific web-based TV platforms (Fire TV and VIZIO), which is exactly what `tv-platform-quirks` covers; no framework, focus, or raw-performance skill applies.

---

# Adaptive streaming (HLS + DASH) on Fire TV and VIZIO

Your read is correct: neither platform exposes a native ABR/streaming player to JavaScript. There is no AVPlay (Tizen) or webOS-style native HLS pipeline here. On both, the runtime is a Chromium-derived engine and your only playback surface is **HTML5 `<video>` + MSE/EME**. So the setup is the same in shape on both, with platform-specific caveats.

## 1. Core architecture (both platforms)

- **Bring your own MSE player.** Use hls.js, Shaka Player, or dash.js. Shaka is the pragmatic single choice because it handles **both** HLS and DASH through one MSE/EME code path and one DRM integration; otherwise pair hls.js (HLS) + dash.js (DASH) and branch on manifest type.
- Feed segments through `MediaSource` / `SourceBuffer` to a single `<video>` element. There is no packager-side or platform-side ABR; the JS player does bitrate selection.
- **Tune the player for low-end CPU.** These are budget SoCs (Fire TV sticks, VIZIO D-series). Cap the top rendition to the panel's real resolution (1080p or often 720p UI), keep the ABR buffer modest, avoid aggressive segment-parsing on the main thread, and prefer the player's lightest-weight ABR config. Assume the low-RAM TV budget.
- **HTTPS everything, no mixed content.** Fire TV's Amazon WebView blocks non-HTTPS loads (v84+) and VIZIO requires HTTPS for the hosted app; manifests, segments, and license URLs must all be HTTPS.
- **One active decode at a time.** Only one `<video>` / decode session; don't create a second for preview/trailer without tearing down the first.
- **Codec/HDR varies by device.** Gate renditions with `MediaSource.isTypeSupported(...)` and `navigator.requestMediaKeySystemAccess(...)`, plus the device-info call (`window.VIZIO.getDeviceInformation()` on VIZIO; UA / model string on Fire TV). H.264 is safe everywhere; HEVC/4K/HDR only on the 4K-class hardware.

## 2. DRM

Both platforms are **Widevine via EME** — that is the Chromium-native path. PlayReady is not the standard route on either (PlayReady on VIZIO is "confirm per model"; not the Fire TV route at all).

- **Widevine L3 is what you can count on.** Fire TV's Web App Platform supports **Widevine L3**. VIZIO exposes Widevine through Chromium EME but does **not publicly specify L1 vs L3 per model**.
- **L1 (hardware-backed, required by most studios for HD/UHD protected playback) is not guaranteed through the web/Web-App path on either platform.** On Fire TV, L1 is available to native/AWV apps on capable hardware but not guaranteed via the Web App wrapper. On VIZIO it's partner-gated info. If your content licenses demand L1 for HD/UHD, get the path confirmed in writing (Amazon; your VIZIO App Integration Manager) before committing — you may be limited to SD/L3 on the web path, or forced to a hybrid/native APK on Fire TV.
- Configure your MSE player's DRM module with `com.widevine.alpha`, your license server URL, and any required request headers/service certificate. Shaka's `drm.servers` config or dash.js's `setProtectionData` / hls.js EME controller all work.
- **Tear down the DRM session on background** (see lifecycle below). A leaked MediaKeys/decode session breaks the *next* playback attempt, with a symptom far from the cause.

## 3. Lifecycle — release the pipeline when backgrounded

Both use plain web semantics: **`visibilitychange` / `document.hidden`** is the signal (no webOS/Tizen platform relaunch event).

On `hidden`:
1. `video.pause()`, then fully tear down the MSE player — `player.destroy()` (Shaka) / `hls.destroy()` / `player.reset()` (dash.js).
2. Detach MediaSource, clear `video.src` / `removeAttribute('src')` and `video.load()`.
3. Close the EME key session / drop `MediaKeys`.
4. Stop ABR timers and segment fetches; persist the resume position.

On `visible`: rebuild the player, re-check network, resume from the saved position.

A backgrounded app holding the decoder is the number-one cause of both termination and "crashes on resume" on the memory-constrained sticks and the VIZIO D-series. During long playback specifically, do not leak the decoder.

## 4. Platform-specific items

**Fire TV**
- `.mov` is explicitly unsupported; ship fMP4 or TS segments.
- In the Amazon Developer Console submission, tick **"Prevent Sleep for Video Playback"** or the screensaver/sleep timer interrupts long playback.
- If you also need to target **Vega OS** devices (Fire TV Stick 4K Select and newer budget hardware), the web app does not run there — that's a separate React Native build. Decide Fire OS / Vega / both up front.
- Include `amzn_wa.js` if you need IAP; not required for playback itself.
- Iterate with the **Web App Tester** app on-device against your pre-prod URL.

**VIZIO**
- App is a **hosted HTTPS URL** — no package. Cache-bust your player bundle and segment/manifest URLs deliberately; the Chromium HTTP cache will hold stale assets.
- Load `vizio-companion-lib.js` last but bind `VIZIO_LIBRARY_DID_LOAD` first; use `getDeviceInformation()` for codec/HDR capability detection.
- Startup gate: splash within ~10s, navigable within ~15s on their hardware — lazy-load the streaming player and don't block first paint on it.
- Treat the **D-series** as your performance floor for long-playback memory behaviour.
- Route Back-at-root to `window.VIZIO.exitApplication()` (verify the Back/Exit key codes on real hardware — not necessarily 461/10009).

## 5. Recommended concrete stack

- **Shaka Player** as the single MSE player for both HLS and DASH and both platforms (one DRM integration, actively maintained, good low-end config surface). Fallback: hls.js + dash.js if you hit a Shaka compat issue on an old WebView/firmware.
- Widevine (`com.widevine.alpha`) EME, L3 assumed, L1 confirmed per platform with the vendor if your licenses require it.
- A shared playback-manager module that: picks player/DRM config from a capability probe at startup, owns the single `<video>`, and wires `visibilitychange` to full teardown/rebuild.
- Test matrix: oldest Fire TV Stick you support + a current 4K device; a VIZIO D-series + a current VIZIO OS set. Desktop Chrome is not a valid proxy for either.

## 6. What to confirm with the vendors

- **Amazon:** whether Widevine **L1** is reachable on your Fire TV Web App build for your content tier, or whether HD/UHD protected content forces an HTML5 Hybrid (self-built) APK.
- **VIZIO (via your AIM):** Widevine security level and PlayReady availability per model line; the Chromium baseline of your oldest supported firmware; exact Back/Exit key codes.
