---
name: tv-platform-quirks
description: Platform-specific quirks for shipping a web-based TV app on LG webOS (webOS TV) — frozen Chromium engine per OS version, app lifecycle/suspend events (webOSLaunch, webOSRelaunch, visibilitychange), Magic Remote vs D-pad input and remote key codes (Back = 461), the Back-button/History-API contract, HLS-only adaptive streaming, PlayReady/Widevine DRM via luna://com.webos.service.drm, appinfo.json, ares-cli packaging to .ipk, and LG Content Store certification. Use whenever code targets an LG TV / webOS / "the LG app" and touches engine/API baseline, lifecycle, remote input, video/DRM, packaging, or store review — e.g. "why does this work on my TV but not the 2019 LG", "handle the back button on webOS", "our LG build crashes coming back from live TV", "package the app for the LG store". Covers LG webOS ONLY for now — Samsung Tizen, Vizio/SmartCast, and Fire TV are not yet in this skill; say so rather than guessing their behavior from webOS.
---

# TV Platform Quirks

Shipping the same web-based TV app across vendors means each platform has
its own frozen browser engine, its own lifecycle and suspend model, its
own remote key codes, its own media/DRM stack, and its own store review.
Code that is correct on a dev machine — and even on last year's TV — fails
on a specific platform/firmware because an API wasn't there, a resource
wasn't released on background, or a key code was different.

**This skill currently covers LG webOS only.** Samsung Tizen,
Vizio/SmartCast, and Fire TV are planned but not written. If the task is
about one of those, say the skill doesn't cover it yet rather than
extrapolating from webOS — the lifecycle events, key codes, and DRM
plumbing genuinely differ.

## How to use this skill

Read the reference file(s) that match what the task touches:

| Task involves... | Read |
|---|---|
| Which JS/CSS/web APIs are safe on a given webOS version; the Chromium-per-release table; `webOSTV.js` / Luna service calls; `deviceInfo` capability flags; 1080p logical resolution & overscan | `references/webos-runtime-and-web-engine.md` |
| App start/suspend/resume; `webOSLaunch` / `webOSRelaunch` / `visibilitychange`; what to release on background and rebuild on resume; `handlesRelaunch`; `requiredMemory`; splash / first paint | `references/webos-lifecycle.md` |
| Remote key codes (Back = 461, colours, media, numbers); `event.key` being `"Unidentified"`; Magic Remote pointer vs 5-way mode; `cursorStateChange`; the Back-button / History-API contract and root-exit behaviour | `references/webos-remote-input.md` |
| `<video>` playback; HLS-only (no DASH) adaptive streaming; MSE/EME; PlayReady & Widevine via `luna://com.webos.service.drm`; unloading the DRM client; codec/HDR/audio support that varies by panel | `references/webos-media-and-drm.md` |
| `appinfo.json` fields; `ares-*` CLI and `.ipk`; Developer Mode; Simulator vs Emulator vs device; LG Seller Lounge submission, UX scenario, self-checklist, re-review on every update | `references/webos-packaging-and-certification.md` |

Each file is self-contained and grounded in LG's webOS TV developer docs.

## Non-negotiable conventions for webOS code

1. **Pick a webOS version floor and target its Chromium engine, not
   "modern browsers."** webOS 4.x is Chromium 53, 5.x is 68, 6.x is 79.
   Map the target version to its engine (table in
   `references/webos-runtime-and-web-engine.md`), set transpile/polyfill
   to that, and verify on a device or the matching simulator — never on
   desktop Chrome alone.
2. **Release the media pipeline and DRM client on `visibilitychange` →
   hidden.** `pause()`, drop `src` / detach MediaSource, `video.load()`,
   `unload` the DRM client, stop timers, persist resume state. A suspended
   app holding the decoder is the number-one OOM-kill and the number-one
   "crashes on resume" cause.
3. **Every screen must be fully operable with the D-pad + OK.** The Magic
   Remote pointer is additive; certification requires 5-way. No
   hover-only menus, no pointer-only actions.
4. **Branch remote input on `event.keyCode`, never `event.key`.** webOS
   reports `key` as `"Unidentified"` for many remote buttons. Back is
   `461`.
5. **Honour the Back contract.** Back moves up exactly one level, never
   dead-ends, and reaches app exit from the root (a confirm popup on
   webOS 6.0+, Home on 5.x). Use the History API or set
   `disableBackHistoryAPI` and manage the stack yourself with
   `webOS.platformBack()` at the root.
6. **HLS is the only natively supported adaptive protocol.** No
   MPEG-DASH, no Smooth Streaming. If you need DASH you ship your own
   MSE-based player.
7. **`unload` the DRM client before exit or before switching DRM type.**
   A leaked client breaks the *next* playback session, with a symptom far
   from the cause.
8. **Assume every store submission is re-reviewed from scratch, and that
   review runs on your oldest supported webOS version.** Keep that
   version in the regression pass; bump `version` in `appinfo.json` every
   submission.

## Relationship to the other skills

- Framework APIs (Lightning component lifecycle, focus delegation,
  textures) — see `lightningjs-v2-conventions`. This skill is about what
  the *platform under the framework* does.
- The general low-end-hardware budgets that make rule 2 matter —
  `tv-performance-constraints`.
- The framework-agnostic focus/navigation model that webOS pointer vs
  5-way mode feeds into — `tv-focus-and-navigation`.

## What this skill does not cover (yet)

- **Samsung Tizen** — different lifecycle (`tizen.application`,
  `visibilitychange` semantics), key codes (Back = `10009`), AVPlay media
  API, DASH support, `.wgt` packaging, Seller Portal.
- **Vizio / SmartCast**, **Fire TV** (web / Amazon WebView), **Comcast /
  RDK**.
- Native (non-web) webOS services beyond what a web app calls over Luna.
- Lightning 3 / Blits.

See `PLANNED.md` for the intended shape of the remaining platforms.
