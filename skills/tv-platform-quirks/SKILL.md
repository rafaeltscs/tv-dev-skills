---
name: tv-platform-quirks
description: Platform-specific quirks for shipping a web-based TV app across six platform families — LG webOS, Samsung Tizen, VIZIO SmartCast, Amazon Fire TV (Fire OS web-app path), Comcast/RDK (Firebolt on WPE WebKit), and Android TV / Google TV (web app in a WebView inside a native shell you ship). Covers, per platform: the browser-engine baseline (Chromium version per webOS/Tizen release; WebKit not Chromium on RDK; no published table for VIZIO/Fire TV/Android TV); app lifecycle and suspend/resume events; remote key codes and the pointer-vs-D-pad split (Back = 461 on webOS, 10009 on Tizen, native onBackPressed on Android TV, verify-on-device elsewhere; Tizen requires tizen.tvinputdevice key registration); the Back/exit contract; adaptive streaming and DRM (native players on webOS/Tizen vs bring-your-own MSE player + Widevine on VIZIO/Fire TV/RDK/Android TV); and packaging + store review. Use whenever code targets an LG, Samsung, VIZIO, Amazon Fire TV, Comcast/RDK/operator box, or Android TV / Google TV and touches engine baseline, lifecycle, remote input, video/DRM, packaging, or store submission — e.g. "why does this work on my TV but not the 2019 LG", "handle the back button on Tizen", "our Samsung build crashes coming back from live TV", "which webOS versions support optional chaining", "set up the VIZIO companion library", "wire up the Firebolt lifecycle for our RDK app", "wrap our web app in a WebView for Android TV". Does not cover Fire TV Vega OS native apps (React Native / Vega Developer Tools), Android TV / Google TV native apps (Jetpack Compose for TV / Leanback), or non-web TV platforms (Roku BrightScript) — say so rather than guessing from the covered platforms.
---

# TV Platform Quirks

Shipping the same web-based TV app across vendors means each platform has
its own browser engine, its own lifecycle and suspend model, its own
remote key codes, its own media/DRM stack, and its own store review. Code
that is correct on a dev machine — and even on last year's TV — fails on a
specific platform/firmware because an API wasn't there, a resource wasn't
released on background, or a key code was different.

**This skill covers six platform families:** LG webOS, Samsung Tizen,
VIZIO SmartCast, Amazon Fire TV (the Fire OS web-app path), Comcast/RDK
(Firebolt), and Android TV / Google TV (a web app in a `WebView` inside a
native shell you ship). It does **not** cover Fire TV's **Vega OS**
(React Native via the Vega Developer Tools), Android TV / Google TV
**native** apps (Jetpack Compose for TV / Leanback), or non-web platforms
(Roku). For those, say the skill doesn't cover it rather than
extrapolating.

The covered platforms are similar in shape (web app, embedded browser,
suspend-not-close lifecycle, D-pad-first input) but differ in concrete
details — engine family, key codes, key registration, the media API, DRM
plumbing, manifest format, delivery model, store — so **keep them
straight and don't assume a fact from one holds on another.** webOS and
Tizen are well documented; VIZIO's and Fire TV's web-app docs are thinner
(VIZIO partner-gated; Fire TV mid-migration); RDK behaviour varies by
operator; Android TV / Google TV are one target (Google TV is a launcher
UI over Android TV OS) but you own the native shell. Those reference
files flag what to confirm directly with the vendor or operator.

## How to use this skill

Read the reference file(s) matching the platform and what the task
touches.

### LG webOS

| Task involves... | Read |
|---|---|
| Safe JS/CSS/web APIs per webOS version; Chromium-per-release table; `webOSTV.js` / Luna calls; `deviceInfo` flags; 1080p logical resolution & overscan | `references/webos-runtime-and-web-engine.md` |
| Start/suspend/resume; `webOSLaunch` / `webOSRelaunch` / `visibilitychange`; release-on-background & rebuild-on-resume; `handlesRelaunch`; `requiredMemory`; splash | `references/webos-lifecycle.md` |
| Key codes (Back = 461, colours, media, numbers); `event.key` = `"Unidentified"`; Magic Remote pointer vs 5-way; `cursorStateChange`; Back / History-API contract & root exit | `references/webos-remote-input.md` |
| `<video>` playback; HLS-only (no DASH); MSE/EME; PlayReady & Widevine via `luna://com.webos.service.drm`; unloading the DRM client; codec/HDR/audio by panel | `references/webos-media-and-drm.md` |
| `appinfo.json`; `ares-*` CLI & `.ipk`; Developer Mode; Simulator vs Emulator vs device; LG Seller Lounge submission, UX scenario, self-checklist, re-review | `references/webos-packaging-and-certification.md` |

### Samsung Tizen

| Task involves... | Read |
|---|---|
| Safe JS/CSS/web APIs per Tizen version; Chromium-per-release table; the `tizen.*` / `webapis.*` layers and the `webapis.js` include; privileges; 1080p logical resolution & overscan | `references/tizen-runtime-and-web-engine.md` |
| Running/Paused/Resumed; `visibilitychange` (also fires on exit); app-control relaunch; release-on-background; re-validating network/URLs on resume; `exit()` / `hide()` | `references/tizen-lifecycle.md` |
| `tizen.tvinputdevice` key registration (`registerKeyBatch`, `getSupportedKeys`); key codes (Back = 10009, Exit = 10182, colours, media, numbers); `event.key` unreliable; Smart Remote pointer; Return-at-root exit | `references/tizen-remote-input.md` |
| AVPlay (`webapis.avplay`) state machine, display-rect overlay, `setStreamingProperty`, `suspend`/`restore`; DASH + HLS + Smooth Streaming; DRM via `setDrm` (`PLAYREADY` / `WIDEVINE_CDM`); `<video>` vs AVPlay | `references/tizen-media-and-drm.md` |
| `config.xml` (Tizen application ID, `required_version`, privileges); signed `.wgt`; author vs distributor certificates & the DUID allowlist; `tizen` CLI; Emulator vs TV; Samsung Apps TV Seller Office launch checklist | `references/tizen-packaging-and-certification.md` |

### VIZIO SmartCast

| Task involves... | Read |
|---|---|
| The hosted-URL delivery model (pre-prod/prod URLs, no package, no local install); the `vizio-companion-lib.js` include and `VIZIO_LIBRARY_DID_LOAD` bind-before-load ordering; `window.VIZIO` methods (`exitApplication`, `getDeviceInformation`, `setClosedCaptionHandler`, …); plain `keydown` input with no long-press detection; minimal-remote key set; `visibilitychange` lifecycle; startup-time gates; bring-your-own MSE player + Widevine; Preferred Developer Program / AIM submission; and what to confirm with VIZIO directly | `references/vizio-smartcast.md` |

### Amazon Fire TV

| Task involves... | Read |
|---|---|
| The Fire OS vs **Vega OS** split (a web app runs on Fire OS only); Amazon WebView (AWV) and its Appstore-independent updates; `navigator.userAgent` engine detection; Web App vs HTML5 Hybrid delivery + `amzn_wa.js` + Web App Tester; remote input (D-pad 37–40 / Enter 13; Back key code inconsistent — handle 8/27/461 + AWV default; Home & mic uncapturable; `div`/`span` not focusable); `visibilitychange` lifecycle; MSE + DASH + HLS with BYO player, Widevine L3 on the Web App Platform; "Prevent Sleep for Video Playback"; Amazon Appstore + Fire TV device targeting review | `references/fire-tv.md` |

### Comcast / RDK (Firebolt)

| Task involves... | Read |
|---|---|
| The **WPE WebKit** engine (not Chromium — use the WebKit/Safari compat column) and why Lightning dominates on RDK; the Firebolt SDK (`@firebolt-js/sdk`), RPC-over-WebSocket transport, module list, and capability/permission grants via the **Firebolt App Manifest**; the formal **Lifecycle** state machine (`initializing` / `inactive` / `foreground` / `background` / `suspended` / `unloading`, `ready()`, `close(reason)`, `finished()`) and the hard GPU/EGL-release requirement on `suspended` (blocking it → termination; RDK App Lifecycle 2.0 / MemCR hibernation); remote keys as plain `keydown` (verify per operator remote) + the `Keyboard` module for text entry; `<video>` + MSE/EME on a hardware plane behind the WPE surface, PlayReady/Widevine per operator/SoC; Mock Firebolt for off-device testing; per-operator ingestion + two-layer (Firebolt + operator premium) certification | `references/comcast-rdk.md` |

### Android TV / Google TV

| Task involves... | Read |
|---|---|
| The native-shell-hosting-a-`WebView` model (there is no web-app host; you ship an `.aab`); the Play Mainline system WebView (Chromium, updates via Play independently of the OS — but stale on non-Play OEM boxes) and `TV-WB` (WebView only, never launch a browser); the manifest (`CATEGORY_LEANBACK_LAUNCHER`, `touchscreen` `required=false`, no telephony/camera/gps, 320×180 banner, `minSdkVersion` ≤ 31); WebView config (`mediaPlaybackRequiresUserGesture=false`, `domStorageEnabled`); the **Activity lifecycle bridged into the WebView** (`onStop` → pause+tear-down video, `webView.onPause()`; video must not play in background per `TV-NP`); `FLAG_KEEP_SCREEN_ON` only during playback (Ambient Mode `TV-BU`/`TV-BY`); D-pad 37–40 / Enter 13, **Back handled natively in `onBackPressed` → go up / `finish()` at root** (`TV-DB`); MSE + HLS/DASH with a BYO player, Widevine via `MediaDrm` (L1 retail / L3 cheap boxes); `MediaSession`; Google Play `.aab` + TV app-quality (`TV-xx`) review | `references/android-tv.md` |

Each file is self-contained and grounded in the vendor's TV developer
docs (VIZIO's and Fire TV's web-app records are thinner, RDK varies by
operator, and Android TV's web path is a native shell around standard
Chromium — those files mark what to confirm directly).

## Non-negotiable conventions (all platforms)

1. **Pick an engine baseline and target it, not "modern browsers."** For
   webOS and Tizen, map the target OS version to its Chromium number
   (tables in the `*-runtime-and-web-engine.md` files): webOS 4.x = CR53,
   5.x = CR68, 6.x = CR79; Tizen 3.0 = CR47 (no `async`/`await`), 6.0 =
   CR76 (no optional chaining), 6.5 = CR85. VIZIO and Fire TV publish no
   such table — conservative baseline, `navigator.userAgent`,
   feature-detect, test the oldest hardware. Fire TV's Amazon WebView and
   Android TV's system WebView both update independently of the OS (Play
   Mainline on Android TV), so the floor is the oldest WebView in the
   field — and it can be genuinely old on non-Play-certified OEM boxes.
   **RDK is WPE WebKit, not Chromium** — check features against the
   WebKit/Safari column, not Chrome. Verify on a real device or the
   matching emulator/simulator, never desktop Chrome alone.
2. **Release the media pipeline and GPU/DRM resources when you leave the
   foreground.** The signal differs: `visibilitychange → hidden`
   (webOS/Tizen/VIZIO/Fire TV), the Firebolt `background`/`suspended`
   transition (RDK), or the Activity's `onStop()` bridged into the
   WebView (Android TV). Stop and fully tear down the player (webOS:
   clear `src` / detach MediaSource + `unload` the DRM client; Tizen:
   `stop()` → `close()` the AVPlay instance; VIZIO/Fire TV/RDK/Android
   TV: destroy the MSE `MediaSource` and clear `<video>`), stop timers,
   and persist resume state. On RDK `suspended` you must **also
   deallocate the EGL surface and GPU textures** or you block MemCR
   hibernation and become the first kill target. On Android TV, **video
   must be paused when the user leaves** (Play rule `TV-NP` — video apps
   get no background playback) and `FLAG_KEEP_SCREEN_ON` must be cleared.
   A backgrounded app holding the decoder is the number-one termination
   cause and the number-one "crashes on resume" cause everywhere.
3. **Every screen must be fully operable with the D-pad + OK/Enter.** The
   pointer (Magic Remote / Samsung Smart Remote) is additive;
   certification requires D-pad operability. No hover-only menus, no
   pointer-only actions.
4. **Branch remote input on `event.keyCode`, never `event.key`.** These
   platforms report `key` unreliably for remote buttons. **Back is `461`
   on webOS, `10009` on Tizen, and not guaranteed to reach JS on VIZIO,
   Fire TV, RDK, or Android TV — verify on the actual device/remote**
   (Fire TV's Amazon WebView has shown 8, 27, or 461; on Android TV Back
   is normally caught by the native shell, not the WebView). D-pad is
   `37`–`40` / Enter `13` everywhere. Don't hardcode one Back value
   across platforms.
5. **Honour the Back/exit contract.** Back moves up exactly one level,
   never dead-ends, and reaches app exit from the root. webOS: History
   API by default, or `disableBackHistoryAPI` + `webOS.platformBack()` at
   root. Tizen: you own the stack from the start; call
   `tizen.application.getCurrentApplication().exit()` at root. VIZIO: call
   `window.VIZIO.exitApplication()` at root. Fire TV: intercept Back,
   manage your own stack, and let the app close at the root (AWV's
   default is history-back then close). RDK: call `Lifecycle.close(reason)`
   at root, then handle `unloading` and call `Lifecycle.finished()`.
   Android TV: handle Back in the shell's `onBackPressed` — bridge to the
   web app's nav, and `finish()` the Activity at the root so it returns
   to the Android TV home screen (Play rule `TV-DB`).
6. **Know the adaptive-streaming story per platform.** webOS: **HLS only**
   natively — DASH needs your own MSE player. Tizen: use **AVPlay** for
   HLS/DASH/Smooth Streaming, 4K, and DRM at scale; plain `<video>` only
   for simple progressive clips. VIZIO, Fire TV, RDK, and Android TV: no
   native ABR player exposed to JS — bring your own MSE player (hls.js /
   Shaka / dash.js) for both HLS and DASH (on Android TV, or where the
   WebView isn't enough, the alternative is native ExoPlayer/Media3
   behind a transparent WebView).
7. **The video plane is often a hardware overlay behind your UI.** Tizen
   (`setDisplayRect`) and RDK (behind the WPE surface) composite decoded
   video on a separate plane — punch a transparent hole in your UI over
   the video rect and keep them aligned on resize. A leaked DRM/decode
   session breaks the *next* playback attempt, with a symptom far from
   the cause, so tear it down (rule 2) on every background/exit.
8. **Every submission is a fresh review, on your oldest supported
   target.** Keep that target in the regression pass. webOS/Tizen: bump
   the manifest version and keep the same app identity (webOS `id`; Tizen
   application ID **and** author certificate). VIZIO / Fire TV Web App:
   the app is hosted — pin the pre-prod / reviewed URL to the submitted
   build during review. RDK: certification is **two layers (Firebolt +
   the operator's premium-app pass) and per-operator** — "ships on
   Comcast" is not "ships on Sky"; each operator is its own ingestion,
   capability grant, and cert. Android TV: ship an `.aab`, bump
   `versionCode`, keep the same `applicationId` + Play signing key; Play's
   TV app-quality review checks the `TV-xx` criteria (Back-to-home,
   D-pad-only, no background video, banner, no hard hardware
   requirements).

## Platform-specific must-knows

- **Tizen — register your keys.** Only arrows, Enter, and Back arrive
  automatically. Colour buttons, media transport, and number keys are
  silent until `tizen.tvinputdevice.registerKeyBatch([...])` at startup.
  webOS delivers all keys with no registration.
- **Tizen — declare privileges and include `webapis.js`.** Every
  `tizen.*` / `webapis.*` namespace needs its `<tizen:privilege>` in
  `config.xml` or the call throws; `webapis.*` also needs
  `<script src="$WEBAPIS/webapis/webapis.js">` before app code.
- **Tizen — the video plane is a hardware overlay behind the DOM.**
  Position it with `webapis.avplay.setDisplayRect(...)` in 1920×1080
  coords and leave a transparent hole in your UI; keep them aligned on
  resize.
- **webOS — the Back button is wired to browser history by default.**
  `history.pushState()` per navigation and handle `popstate`, or opt out
  with `disableBackHistoryAPI`.
- **VIZIO — load `vizio-companion-lib.js` last, bind first.** Attach
  handlers for `VIZIO_LIBRARY_DID_LOAD` (and the other library events)
  *before* the `<script>` that pulls the library from
  `localhost:12345/scfs/cl/js/`, or the API never initialises.
- **VIZIO — no key registration and no long-press detection.** Plain
  `keydown`/`keyup`; drive key-repeat scrolling from the repeated events
  yourself. Many VIZIO remotes have no colour or transport keys.
- **Fire TV — `div`/`span` don't take remote focus.** Only natively
  focusable elements (or `[tabindex]`) do; add `tabindex` or run a JS
  focus manager. Media transport keys aren't on all remotes — make D-pad
  the primary transport path.
- **Fire TV — Fire OS vs Vega OS.** A web app / Amazon WebView build runs
  on **Fire OS only**. Vega OS (newer budget devices) needs a separate
  React Native build with the Vega Developer Tools — decide Fire OS /
  Vega / both up front.
- **RDK — `suspended` is a hard resource-release contract.** On the
  Firebolt `suspended` transition you must deallocate the EGL surface and
  GPU textures/memory, not just pause. The platform shrinks your graphics
  surface (often to 1×1) and may MemCR-hibernate the process; an app that
  holds GPU memory blocks that and gets killed instead.
- **RDK — text entry is a platform module.** Use `Keyboard.email()` /
  `Keyboard.password()` / `Keyboard.standard()`; the platform shows its
  own input UI and returns the string. Don't build your own on-screen
  keyboard.
- **RDK — capabilities are granted, not assumed.** Declare what the app
  needs in the Firebolt App Manifest; a call for an ungranted capability
  rejects at runtime.
- **Android TV — you write and ship the native shell.** There is no
  web-app host: an Android Activity embeds a `WebView`, and Play requires
  it to be a real TV app — `CATEGORY_LEANBACK_LAUNCHER`, `touchscreen`
  `required=false`, no hard telephony/camera/gps, a 320×180 banner with
  the app name. A pure PWA/TWA is not an accepted submission.
- **Android TV — the Activity lifecycle is the contract, not
  `visibilitychange`.** Bridge `onStop()`/`onResume()` into the WebView;
  pause+tear-down video on `onStop()` (no background video, `TV-NP`), and
  hold `FLAG_KEEP_SCREEN_ON` only while actually playing (`TV-BU`/`TV-BY`
  Ambient Mode).
- **Android TV — Back is caught by the shell, not the WebView.** Handle
  it in `onBackPressed`; `finish()` at the root so it returns to the home
  screen (`TV-DB`). Don't rely on a `keydown` for it in JS.
- **Delivery / manifest differ:** webOS `appinfo.json` + `.ipk`; Tizen
  `config.xml` (W3C widget XML) + signed `.wgt`; VIZIO has **no package**
  (register a hosted HTTPS URL); Fire TV wraps a hosted URL or a static
  ZIP into an Amazon Appstore APK (or you build the APK yourself); RDK
  ships a hosted **app URL + Firebolt App Manifest** that the operator
  ingests; Android TV ships a Google Play **`.aab`** whose manifest
  declares the Leanback launcher entry.

## Relationship to the other skills

- Framework APIs (Lightning component lifecycle, focus delegation,
  textures) — `lightningjs-v2-conventions`. This skill is about the
  *platform under the framework*.
- The low-end-hardware budgets that make rule 2 matter —
  `tv-performance-constraints`.
- The framework-agnostic focus model that pointer-vs-D-pad feeds into —
  `tv-focus-and-navigation`.
- On RDK, apps are very often **Lightning** — `lightningjs-v2-conventions`
  covers that framework; this skill covers the platform under it.

## What this skill does not cover

- **Fire TV Vega OS native apps** — React Native 0.72 + Vega Developer
  Tools ("Kepler"). Covered here only as "a web app doesn't run there;
  it's a separate build."
- **Native TV apps** — Roku (BrightScript / SceneGraph), and Android TV /
  Google TV **native** (Jetpack Compose for TV / Leanback). Android TV's
  *WebView* path **is** covered; a native Compose UI is not (beyond the
  thin shell the WebView needs).
- The internals of the Android TV native shell beyond what the WebView
  bridge needs — Media3/ExoPlayer tuning, Compose, Play Billing, App
  Actions. `references/android-tv.md` covers the shell only as the host
  for the web app.
- Smaller web-capable TV OSes not yet written up — Hisense VIDAA, Titan
  OS, Zeasn/WhaleOS, Philips/TP Vision. Same shape as the covered
  platforms; treat their specifics as unverified.
- Native (non-web) platform services beyond what a web app calls through
  `luna://` (webOS), `tizen.*` / `webapis.*` (Tizen), `window.VIZIO`,
  `amzn_wa.js` (Fire TV), the Firebolt SDK (RDK), or a `JavascriptInterface`
  bridge to the native shell (Android TV).
- Vendor details behind partner-gated docs — VIZIO's portal, Fire TV
  Widevine L1 through the Web App wrapper, and per-operator RDK
  specifics. The reference files list what to confirm directly.
- Lightning 3 / Blits.
