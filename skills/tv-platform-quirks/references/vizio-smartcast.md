# VIZIO SmartCast (VIZIO OS)

VIZIO's TV platform — branded **SmartCast**, more recently **VIZIO OS** —
runs apps as **hosted web apps** in a Chromium-based runtime. It is the
most sparsely documented of the platforms in this skill: the developer
portal (`developer.vizio.com`) is partner-gated, there is no public SDK
download, and onboarding goes through VIZIO's **Preferred Developer
Program** and an assigned **App Integration Manager (AIM)**. This file
collects what is publicly established; treat anything not here as
"confirm with VIZIO partner docs," and prefer runtime feature-detection
over assumptions.

This is one consolidated file rather than the five-way split used for
webOS and Tizen, because the public surface doesn't fill five.

## Hosting and delivery model

- **No package, no local install.** You host the app (HTML/CSS/JS) on
  your own HTTPS server. You register a **pre-prod URL** and a **prod
  URL** with VIZIO; the TV loads your app from that URL. There is no
  `.ipk` / `.wgt` equivalent and no on-device bundle.
- Consequences of hosted delivery:
  - **Ship fixes by deploying your server** — no store re-review for a
    code change (asset/metadata changes may still use a provisional
    submission form). This cuts both ways: a bad deploy is live
    immediately on every set.
  - **Cache-bust deliberately.** The Chromium HTTP cache will hold your
    old bundle; version your asset URLs.
  - **The app must survive flaky TV networking at load** — a hosted app
    that can't fetch its own entry bundle shows nothing.
  - **CSP / mixed content:** serve everything over HTTPS; older
    dev-mode workarounds needed Chrome's `--allow-running-insecure-content`
    and that is not a shipping option.
- **SmartCast 2 vs SmartCast 3+:** newer sets use a "Conjure" launcher
  that pairs a sender via PIN and launches apps by REST command; older
  sets used a Cast-style launcher. Low-end lines (historically the
  **D-series**) are memory-constrained enough that VIZIO's own guidance
  singles them out for long-playback memory care — treat them as the
  floor.

## The runtime

- **Chromium-based**, tuned for 10-foot UI. **VIZIO publishes no
  Chromium-version-per-firmware table**, so you can't do the "map OS
  version → engine" planning that webOS and Tizen allow. Practical
  approach:
  - Target a conservative baseline (assume something several years
    behind desktop Chrome on older sets), transpile down, and polyfill.
  - **Feature-detect at runtime** (`'IntersectionObserver' in window`,
    `CSS.supports(...)`) rather than version-branching.
  - Test on the oldest real hardware you intend to support; there is no
    reliable emulator story.
- **Debugging:** dev-mode-enabled sets expose Chrome DevTools via
  `chrome://inspect` from a desktop Chrome on the same network.
- **Resolution:** 1080p logical canvas; lay out at 1920×1080 with an
  overscan-safe inset, same as the other platforms.
- Assume the low-RAM TV budget from `tv-performance-constraints`.

## The VIZIO companion library

Platform hooks come from a script served **by the TV itself**:

```
http://localhost:12345/scfs/cl/js/vizio-companion-lib.js
```

**Ordering matters:** define and bind your handlers for the library's
events — above all `VIZIO_LIBRARY_DID_LOAD` — *before* the
`<script>` that loads the library. If you attach listeners after it
loads, you miss the load event and the API never initialises.

Documented `window.VIZIO` surface (names as used in VIZIO integration
guides; the partner docs are authoritative):

| Call / event | Purpose |
|---|---|
| `VIZIO_LIBRARY_DID_LOAD` (event) | Library ready; do platform init here. |
| `window.VIZIO.exitApplication()` | Exit the app back to the launcher. This is your Back-at-root / Exit action. |
| `window.VIZIO.getDeviceId(cb)` | Device identifier. |
| `window.VIZIO.getDeviceInformation()` | Model / firmware / capability info. |
| `window.VIZIO.setClosedCaptionHandler(cb)` | Fires on CC on/off + style changes; you render captions to match. |
| `window.VIZIO.setDeviceLanguageHandler(cb)` | System language; re-render strings on change. |
| `window.VIZIO.Chromevox.play("…")` | Speak a string via the platform screen reader. |
| `VIZIO_TTS_ENABLED` / `VIZIO_TTS_DISABLED` (events) | Screen-reader toggled; adjust your a11y behaviour. |
| Advertising ID (IFA) API | Required for apps that serve ads. |
| Content Change API | Notify the platform of content/section changes (recommendations, resume). |

Anything not exposed here is **plain web platform** — you use standard
DOM APIs, not a VIZIO wrapper.

## Remote input

- **Plain `keydown` / `keyup` on `document`.** No key-registration step
  (unlike Tizen), no proprietary key object (unlike webOS/Tizen).
- **The companion library does not detect long-press / held keys** —
  design without relying on key-hold, and if you need repeat-to-scroll,
  drive it from the stream of repeated `keydown` events yourself.
- VIZIO remotes are **minimal**: D-pad, OK, Back, and often a dedicated
  Exit; many models have **no colour buttons** and no dedicated media
  transport cluster. Do not make colour buttons or transport keys
  load-bearing.
- Standard codes apply: arrows 37–40, Enter 13. **Verify Back / Exit
  codes on real VIZIO hardware** — they are not consistently the webOS
  `461` or Tizen `10009`, and VIZIO's own docs are the reference. Handle
  whatever the device reports and route Back-at-root to
  `window.VIZIO.exitApplication()`.
- The pointer/cursor model of Magic Remote / Samsung Smart Remote has no
  VIZIO equivalent — it's D-pad only, which at least simplifies focus
  handling (see `tv-focus-and-navigation`).

## Lifecycle

- **`visibilitychange` / `document.hidden`** is the signal — standard web
  semantics, no `webOSRelaunch` / app-control analogue.
- On hidden: run the same releasing path as the other platforms — stop
  and tear down video, stop timers/observers, halt network, persist
  resume state. Memory-constrained sets will reclaim a backgrounded app.
- On visible: rebuild, re-check network and language, resume from
  persisted state.
- **Startup performance is a hard gate:** VIZIO expects the **splash
  within ~10 seconds** and the app **navigable within ~15 seconds** of
  launch, measured on their hardware. Defer catalog fetches and heavy JS
  past first paint; this is stricter in practice than it sounds on a
  cold D-series.

## Media and DRM

- Playback is through standard HTML5 `<video>` + **MSE/EME**; **Widevine**
  is the Chromium-native DRM path. PlayReady availability and Widevine
  security level (L1 vs L3) are **not publicly specified per model** —
  confirm with VIZIO before promising HD/UHD protected playback.
- There is **no native ABR player** exposed to JS (no AVPlay equivalent).
  For HLS or DASH you run your own MSE-based player (hls.js / Shaka /
  dash.js), tuned for low-end CPU.
- One active `<video>` / decode at a time; release it on `hidden`. The
  D-series memory note above is really a "don't leak the decoder during
  long playback" warning.
- Codec/HDR support varies by panel; read `getDeviceInformation()` and
  feature-detect rather than assuming.

## Submission and certification

- Onboard through the **VIZIO Preferred Developer Program**; you get an
  **App Integration Manager (AIM)** contact and a **pre-certification
  checklist**.
- Submit via VIZIO's app-submission form (historically
  `platform.vizio.com/docs/app_submission.html`); asset-only or
  metadata-only changes use a separate provisional form.
- Because the app is hosted, "the build under review" is whatever your
  **pre-prod URL** serves — keep it pinned to the version you submitted,
  not your rolling dev branch.
- Expect review to cover: startup-time gates, D-pad-only operability,
  Back/Exit behaviour (must exit cleanly via `exitApplication()`),
  closed-caption handling via `setClosedCaptionHandler`, screen-reader
  behaviour, and ad-ID compliance if you serve ads.
- No public SLA for review turnaround — plan with your AIM.

## What to nail down with VIZIO partner docs

Because the public record is thin, get these in writing from your AIM
before building on them: exact Back/Exit key codes per model line; the
Chromium baseline for the oldest supported firmware; PlayReady support
and Widevine level; any required companion-library calls for
certification (Content Change API, IFA); and the current submission-form
URLs.
