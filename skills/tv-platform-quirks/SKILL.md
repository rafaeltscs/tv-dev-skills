---
name: tv-platform-quirks
description: Platform-specific quirks for shipping a web-based TV app on LG webOS, Samsung Tizen, VIZIO SmartCast (VIZIO OS), and Amazon Fire TV (Fire OS web apps) — each platform's Chromium engine baseline, app lifecycle/suspend events (visibilitychange plus webOSLaunch/webOSRelaunch on LG; Pause/Resume + app-control on Tizen; plain web semantics on VIZIO and Fire TV), remote key codes and the pointer-vs-D-pad split (Back = 461 on webOS, 10009 on Tizen, verify-on-device on VIZIO and Fire TV; Tizen also requires tizen.tvinputdevice key registration), the Back/exit contract, adaptive streaming and DRM (webOS: HLS-only + luna://com.webos.service.drm; Tizen: AVPlay with DASH/HLS + setDrm; VIZIO & Fire TV: bring-your-own MSE player + Widevine, Fire TV Web App Platform is Widevine L3), and packaging + store review (appinfo.json/.ipk/ares-cli/LG Seller Lounge; config.xml/.wgt/Tizen Studio/Samsung Apps TV Seller Office; VIZIO hosted-URL app + Preferred Developer Program; Fire TV Amazon WebView + amzn_wa.js + Amazon Appstore, plus the Vega OS split). Use whenever code targets an LG, Samsung, VIZIO, or Amazon Fire TV and touches engine/API baseline, lifecycle, remote input, video/DRM, packaging, or store review — e.g. "why does this work on my TV but not the 2019 LG", "handle the back button on Tizen", "our Samsung build crashes coming back from live TV", "which webOS versions support optional chaining", "set up the VIZIO companion library", "does our web app run on Fire TV Vega", "package the app for the LG store". Covers LG webOS, Samsung Tizen, VIZIO SmartCast, and Amazon Fire TV (Fire OS) only — Comcast/RDK and Fire TV Vega OS native apps are not in this skill; say so rather than guessing their behavior from the covered platforms.
---

# TV Platform Quirks

Shipping the same web-based TV app across vendors means each platform has
its own frozen browser engine, its own lifecycle and suspend model, its
own remote key codes, its own media/DRM stack, and its own store review.
Code that is correct on a dev machine — and even on last year's TV — fails
on a specific platform/firmware because an API wasn't there, a resource
wasn't released on background, or a key code was different.

**This skill covers LG webOS, Samsung Tizen, VIZIO SmartCast, and Amazon
Fire TV (the Fire OS web-app path).** Comcast/RDK is planned but not
written, and Fire TV's new **Vega OS** is not a web-app target at all
(React Native / Vega Developer Tools) — for either, say the skill doesn't
cover it rather than extrapolating. The covered platforms are close in
shape (web app, Chromium runtime, suspend-not-close lifecycle,
D-pad-first input) but differ in concrete details — key codes, key
registration, the media API, DRM plumbing, manifest format, delivery
model, store — so **keep them straight and don't assume a webOS fact
holds on Tizen, VIZIO, or Fire TV, or vice versa.** webOS and Tizen are
well documented; VIZIO's and Fire TV's web-app docs are thinner (VIZIO
partner-gated; Fire TV mid-migration), so those reference files flag what
to confirm directly with the vendor.

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

Each file is self-contained and grounded in the vendor's TV developer
docs (VIZIO's and Fire TV's web-app records are thinner — those files
mark their gaps).

## Non-negotiable conventions (all platforms)

1. **Pick an engine baseline and target it, not "modern browsers."** For
   webOS and Tizen, map the target OS version to its Chromium number
   (tables in the `*-runtime-and-web-engine.md` files): webOS 4.x = CR53,
   5.x = CR68, 6.x = CR79; Tizen 3.0 = CR47 (no `async`/`await`), 6.0 =
   CR76 (no optional chaining), 6.5 = CR85. VIZIO and Fire TV publish no
   such table — pick a conservative baseline, read `navigator.userAgent`,
   feature-detect at runtime, and test the oldest hardware. (Fire TV's
   Amazon WebView updates via the Appstore independently of Fire OS, so
   the floor is the oldest AWV in the field, not the oldest OS.) Verify
   on a device or the matching emulator/simulator, never desktop Chrome
   alone.
2. **Release the media pipeline and DRM session on `visibilitychange` →
   hidden.** Stop and fully tear down the player (webOS: clear `src` /
   detach MediaSource + `unload` the DRM client; Tizen: `stop()` →
   `close()` the AVPlay instance), stop timers, persist resume state. A
   suspended app holding the decoder is the number-one termination cause
   and the number-one "crashes on resume" cause.
3. **Every screen must be fully operable with the D-pad + OK/Enter.** The
   pointer (Magic Remote / Samsung Smart Remote) is additive;
   certification requires D-pad operability. No hover-only menus, no
   pointer-only actions.
4. **Branch remote input on `event.keyCode`, never `event.key`.** These
   platforms report `key` unreliably for remote buttons. **Back is `461`
   on webOS, `10009` on Tizen, and inconsistent on VIZIO and Fire TV
   (verify on device; on Fire TV's Amazon WebView it has shown up as 8,
   27, or 461)** — don't hardcode one across platforms.
5. **Honour the Back/exit contract.** Back moves up exactly one level,
   never dead-ends, and reaches app exit from the root. webOS: History
   API by default, or `disableBackHistoryAPI` + `webOS.platformBack()` at
   root. Tizen: you own the stack from the start; call
   `tizen.application.getCurrentApplication().exit()` at root. VIZIO: call
   `window.VIZIO.exitApplication()` at root. Fire TV: intercept Back,
   manage your own stack, and let the app close at the root (AWV's
   default is history-back then close).
6. **Know the adaptive-streaming story per platform.** webOS: **HLS only**
   natively — DASH needs your own MSE player. Tizen: use **AVPlay** for
   HLS/DASH/Smooth Streaming, 4K, and DRM at scale; plain `<video>` only
   for simple progressive clips. VIZIO and Fire TV: no native ABR player —
   bring your own MSE player (hls.js / Shaka / dash.js) for both HLS and
   DASH.
7. **Tear the DRM session / player down on background and exit.** webOS:
   `unload` the `com.webos.service.drm` client before exit / before
   switching DRM type. Tizen: `stop()` → `close()` the AVPlay instance.
   VIZIO / Fire TV: destroy the MSE `MediaSource` / player and clear the
   `<video>`. A leaked session breaks the *next* playback attempt, with a
   symptom far from the cause.
8. **Assume every store submission is re-reviewed from scratch, on your
   oldest supported OS version.** Keep that version in the regression
   pass. webOS/Tizen: bump the manifest version every submission and keep
   the same app identity (webOS `id`; Tizen application ID **and** author
   certificate). VIZIO / Fire TV Web App: the app is hosted, so keep the
   pre-prod / reviewed URL pinned to the submitted build during review
   rather than serving your rolling dev branch.

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
- **Delivery / manifest differ:** webOS `appinfo.json` + `.ipk`; Tizen
  `config.xml` (W3C widget XML) + signed `.wgt`; VIZIO has **no package**
  (register a hosted HTTPS URL); Fire TV wraps a hosted URL or a static
  ZIP into an Amazon Appstore APK (or you build the APK yourself).

## Relationship to the other skills

- Framework APIs (Lightning component lifecycle, focus delegation,
  textures) — `lightningjs-v2-conventions`. This skill is about the
  *platform under the framework*.
- The low-end-hardware budgets that make rule 2 matter —
  `tv-performance-constraints`.
- The framework-agnostic focus model that pointer-vs-D-pad feeds into —
  `tv-focus-and-navigation`.

## What this skill does not cover (yet)

- **Comcast / RDK** — apps on RDK-based operator boxes (Firebolt SDK).
- **Fire TV Vega OS native apps** — React Native 0.72 + Vega Developer
  Tools ("Kepler"). Covered here only as "a web app doesn't run there;
  it's a separate build."
- Native (non-web) platform services beyond what a web app calls through
  `luna://` (webOS), `tizen.*` / `webapis.*` (Tizen), `window.VIZIO`, or
  `amzn_wa.js` (Fire TV).
- VIZIO details behind its partner-gated developer portal, and Fire TV
  Widevine L1 through the Web App wrapper — the reference files list what
  to confirm directly with the vendor.
- Lightning 3 / Blits.

See `PLANNED.md` for the intended shape of the remaining platforms.
