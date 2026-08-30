SKILLS_CONSULTED: tv-platform-quirks

The question is entirely about the per-platform adaptive-streaming and DRM story for two specific web-based TV platforms (Amazon Fire TV Fire OS and VIZIO SmartCast), which is exactly what `tv-platform-quirks` covers; the framework skills don't apply (no framework named) and performance tuning is only a secondary cross-reference.

---

# Adaptive streaming (HLS + DASH) on Fire TV and VIZIO

## Your premise is correct

Neither platform exposes a native adaptive-bitrate player to JavaScript. There is no equivalent of Samsung's AVPlay or webOS's Luna DRM service. Both Fire TV (Fire OS web-app path) and VIZIO SmartCast are Chromium-based runtimes where your only media primitives are the HTML5 `<video>` element plus **MSE** (`MediaSource` / `SourceBuffer`) and **EME** (`requestMediaKeySystemAccess`). Native `<video>` playback of a URL is only good for simple unprotected progressive clips.

So the setup on both is the same in shape: **bring your own MSE-based player for both HLS and DASH, with Widevine through EME for DRM.**

## The player

- Both platforms are Chromium, so MSE and EME are available. Use a JS player library:
  - **Shaka Player** handles both HLS and DASH through one MSE pipeline and one EME/DRM abstraction. This is the single-library, single-codepath option and the natural pick if you want one player for both container formats.
  - Or **hls.js** for HLS + **dash.js** for DASH if you'd rather use the format-specific libraries.
- Tune the player for a slow CPU: modest ABR buffer target, conservative starting rendition, cap concurrent segment fetches, avoid large `SourceBuffer` appends. The stick-class Fire TV devices and VIZIO's low-end D-series lines are the constraint. See `tv-performance-constraints` for the buffer/GC budgets.
- The video plane on these two platforms is a **standard in-DOM `<video>` element** — there is no hardware-overlay plane you have to position and keep aligned (unlike Tizen's `setDisplayRect` or RDK). Compositing is simpler here.

## DRM

- **Widevine is the Chromium-native CDM on both platforms.** PlayReady is not the standard route on Fire TV, and on VIZIO its availability is unspecified in public docs.
- **Fire TV:** the Web App Platform supports **Widevine L3**. **L1** (hardware-backed, which most studios require for protected HD/UHD) is available to native / Amazon WebView apps on capable hardware but is **not guaranteed through the Web App wrapper** — confirm the path for your content tier with Amazon. If your licensing mandates L1 for HD and the pure Web App path can't deliver it, your options are the HTML5 Hybrid model (you build the APK embedding AWV yourself, giving you more control over the native layer) or accepting SD on that path.
- **VIZIO:** Widevine is the path, but **L1 vs L3 per model line, and PlayReady availability, are not publicly specified.** Get this in writing from your VIZIO App Integration Manager (AIM) before promising protected HD/UHD.
- **Feature-detect DRM at runtime**, don't assume: call `navigator.requestMediaKeySystemAccess('com.widevine.alpha', [...])` with the robustness levels you actually need, and use `MediaSource.isTypeSupported(...)` for codec support. Capability varies by device on both platforms (Fire TV Stick vs Cube; VIZIO D-series vs newer panels).
- License requests go over HTTPS to your license server.

## Engine baseline / feature detection

- Neither vendor publishes a Chromium-version-per-firmware table.
  - **Fire TV:** the app runs in **Amazon WebView (AWV)**, a custom Chromium build that updates through the Appstore **independently of Fire OS** — so your engine floor is the oldest AWV still in the field, which can be genuinely old on early sticks.
  - **VIZIO:** Chromium-based, no version table, portal is partner-gated.
- Practical approach for both: read `navigator.userAgent` at runtime (it carries a Chrome version), target a conservative baseline, transpile down, and **feature-detect rather than version-branch**. Test on the oldest hardware you support (an early Fire TV Stick; a VIZIO D-series set). There is no reliable emulator for either.
- **HTTPS everything, no mixed content.** AWV v84+ is HTTPS-only and v87 auto-upgrades mixed-content images; VIZIO's CSP requires HTTPS and `--allow-running-insecure-content` is not a shipping option. Your app entry bundle, manifests, media segments, and license endpoints must all be HTTPS.

## Lifecycle — the part that bites you

Both platforms use **plain web `visibilitychange` / `document.hidden`** semantics. There is no webOS/Tizen-style platform relaunch or pause/resume event.

On `visibilitychange → hidden` you **must fully tear the player down**, not just pause:

- `pause()` then `stop()` / `destroy()` the MSE player instance
- detach the `MediaSource`, clear `<video>.src` (and call `load()`)
- close the CDM / `MediaKeys` session so no DRM session leaks
- stop all timers, observers, and in-flight segment fetches
- persist the resume position

On the way back to `visible`, rebuild the player, re-check the network, and resume from the persisted state. Only one active decode / `<video>` at a time.

A backgrounded app that holds the video decoder or a DRM session is the number-one cause of the OS killing your app under memory pressure, **and** the number-one cause of "the next playback attempt fails" or "crashes on resume" — and the symptom typically shows up far from the cause. The low-RAM stick and D-series devices hit memory pressure fast.

## Fire TV specifics

- **Two delivery models, same player code:**
  - *Web App* — you give Amazon a hosted HTTPS URL or a static ZIP; Amazon generates and signs the APK wrapper.
  - *HTML5 Hybrid* — you build the APK yourself with the Android SDK, embedding AWV. More control over the WebView/native layer (relevant if you need to reach for Widevine L1).
- Include **`amzn_wa.js`** (the Amazon-hosted copy) if you need in-app purchasing or other Appstore hooks. Not required just for playback.
- Iterate with **Web App Tester** (free app from the Fire TV Appstore — loads your pre-prod URL / local ZIP on the real device without packaging). Debug with `chrome://inspect` from desktop Chrome against a device in ADB developer mode.
- **In the Appstore submission, tick "Prevent Sleep for Video Playback"** or the screensaver / sleep timer interrupts long playback.
- `.mov` is explicitly unsupported. H.264 is everywhere; HEVC + 4K + HDR10/HLG only on 4K devices; Dolby Vision / Atmos on Cube-class. Feature-detect via EME and `MediaSource.isTypeSupported`.
- `div` / `span` are not remote-focusable — matters for your transport-control UI. Use `[tabindex]` or a JS focus manager, and make D-pad the primary transport path since media keys aren't on every remote.

## VIZIO specifics

- **Hosted-URL model, no package.** You host the app on your HTTPS server and register a pre-prod URL and a prod URL. Code fixes ship by deploying your server (no store re-review for a code change) — but a bad deploy is instantly live on every set. **Version / cache-bust your asset URLs deliberately**; the Chromium HTTP cache will otherwise hold your old bundle.
- **Companion library:** load `http://localhost:12345/scfs/cl/js/vizio-companion-lib.js`, and bind your handler for `VIZIO_LIBRARY_DID_LOAD` (and the other library events) **before** the `<script>` tag that pulls the library — otherwise you miss the load event and `window.VIZIO` never initialises. Your MSE player itself is plain web; only device-info and platform hooks go through `window.VIZIO`.
- Wire your player's caption rendering to **`window.VIZIO.setClosedCaptionHandler(cb)`** (fires on CC on/off and style changes) — required for certification.
- Use **`window.VIZIO.getDeviceInformation()`** to read model / firmware / codec / HDR capability and feature-detect.
- **Startup gate:** VIZIO expects the splash within ~10 s and the app navigable within ~15 s, measured on their hardware. Defer loading the player library and catalog fetches past first paint — this is strict on a cold D-series.
- Treat the **D-series** as the memory floor; VIZIO's own guidance singles it out for long-playback memory care (i.e. don't leak the decoder).
- Confirm with your AIM before building on them: Widevine security level, PlayReady support, and the Chromium baseline for the oldest firmware you support.

## Concrete shared setup

1. One MSE player that does both HLS and DASH — **Shaka Player** for a single codepath, or hls.js + dash.js.
2. **Widevine via EME.** Plan for L3 unless you have written confirmation of L1 from Amazon / VIZIO. License requests over HTTPS.
3. **Startup capability probe:** UA parse + `MediaSource.isTypeSupported()` + `requestMediaKeySystemAccess()` → decide max rendition, codec, and DRM robustness before you start the player.
4. **Rigorous teardown on `visibilitychange → hidden`** (player destroyed, MediaSource detached, `<video>.src` cleared, CDM session closed, timers stopped, resume state saved); rebuild on `visible`. Never hold the decoder or a DRM session in the background.
5. Standard in-DOM `<video>` — no overlay-plane positioning on either platform.
6. HTTPS for app bundle, manifests, segments, and license server; zero mixed content.
7. Test on the oldest hardware (Fire TV Stick, VIZIO D-series); tune ABR buffer and segment concurrency for a slow CPU (`tv-performance-constraints`).
