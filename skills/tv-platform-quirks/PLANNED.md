# tv-platform-quirks (partial)

Status: **LG webOS, Samsung Tizen, VIZIO SmartCast, and Amazon Fire TV
(Fire OS web-app path) written; Comcast/RDK not yet.** `SKILL.md` has real
triggering frontmatter scoped to the four written platforms so it does not
claim to cover ones it hasn't been written for.

## Done

- **LG webOS** — five `webos-*.md` references:
  `webos-runtime-and-web-engine.md`, `webos-lifecycle.md`,
  `webos-remote-input.md`, `webos-media-and-drm.md`,
  `webos-packaging-and-certification.md`.
- **Samsung Tizen** — five `tizen-*.md` references:
  - `tizen-runtime-and-web-engine.md` — Chromium-per-Tizen-version table
    (2.4=WebKit, 3.0=CR47 … 8.0=CR108 …), engine-freeze cutoffs, the
    `tizen.*` / `webapis.*` layers + `webapis.js` include, privileges,
    1080p logical resolution.
  - `tizen-lifecycle.md` — Running/Paused/Resumed, `visibilitychange`
    (also fires on exit), app-control relaunch, releasing/restoring
    paths, re-validating network/URLs on resume, `exit()` / `hide()`.
  - `tizen-remote-input.md` — `tizen.tvinputdevice` key registration
    (`registerKeyBatch`, `getSupportedKeys`), key code table (Back =
    10009, Exit = 10182, colours, media, numbers), Smart Remote pointer,
    Return-at-root exit.
  - `tizen-media-and-drm.md` — AVPlay state machine, display-rect
    hardware overlay, `setStreamingProperty`, `suspend`/`restore`, DASH +
    HLS + Smooth Streaming, DRM via `setDrm` (`PLAYREADY` /
    `WIDEVINE_CDM`), `<video>` vs AVPlay.
  - `tizen-packaging-and-certification.md` — `config.xml` (Tizen
    application ID, `required_version`, privileges), signed `.wgt`,
    author vs distributor certificates + DUID allowlist, `tizen` CLI,
    Emulator vs TV, Samsung Apps TV Seller Office launch checklist.
- **VIZIO SmartCast (VIZIO OS)** — one consolidated `vizio-smartcast.md`
  (the public surface doesn't fill five files): hosted-URL delivery model
  (pre-prod/prod URLs, no package), `vizio-companion-lib.js` +
  `VIZIO_LIBRARY_DID_LOAD` bind-before-load ordering, `window.VIZIO.*`
  methods, plain `keydown` with no long-press detection, minimal remote,
  `visibilitychange` lifecycle + startup-time gates, BYO MSE player +
  Widevine, Preferred Developer Program / AIM submission, and an explicit
  "confirm with VIZIO" list for the partner-gated gaps.
- **Amazon Fire TV** — one consolidated `fire-tv.md` (mostly
  Chromium-on-Android with a thin Amazon layer): the **Fire OS vs Vega
  OS** split (web app runs on Fire OS only; Vega needs a React Native /
  Vega Developer Tools build), Amazon WebView (AWV) and its
  Appstore-independent updates, `navigator.userAgent` engine detection,
  Web App vs HTML5 Hybrid delivery + `amzn_wa.js` + Web App Tester,
  remote input (D-pad 37–40 / Enter 13; Back key code inconsistent —
  8/27/461 + AWV default; Home & mic uncapturable; `div`/`span` not
  focusable), `visibilitychange` lifecycle, MSE + DASH + HLS with a BYO
  player and Widevine L3 on the Web App Platform, "Prevent Sleep for
  Video Playback", Amazon Appstore + Fire TV device-targeting review.

## Still to write

Each is a separate divergence with its own lifecycle, key codes, media
API, DRM stack, and store — add as its own reference file(s) under the
same `SKILL.md`, and widen the frontmatter `description` when it lands:

- **Comcast / RDK** — where a web app runs on RDK-based operator boxes;
  the Firebolt SDK, RDK lifecycle, operator certification.

Not planned as a web-app target: **Fire TV Vega OS** native apps (React
Native 0.72 + Vega Developer Tools). `fire-tv.md` covers it only as "your
web app needs a separate Vega build."

When adding a platform, keep it generic/public-knowledge (vendor SDK docs
are public) and not tied to any one app's build pipeline — see the root
`README.md` and `AGENTS.md`.

## Promotion checklist (when the last platform lands)

Delete this file; confirm `README.md` status row reads fully **Ready**;
confirm `NOTICE.md` lists every platform's sources; re-check the skill
count in `AGENTS.md` rule 7.
