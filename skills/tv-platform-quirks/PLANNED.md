# tv-platform-quirks (partial)

Status: **LG webOS and Samsung Tizen written; other platforms not yet.**
`SKILL.md` has real triggering frontmatter scoped to those two platforms
so it does not claim to cover ones it hasn't been written for.

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

## Still to write

Each is a separate divergence with its own lifecycle, key codes, media
API, DRM stack, and store — add as its own reference file(s) under the
same `SKILL.md`, and widen the frontmatter `description` when it lands:

- **Vizio / SmartCast** — SmartCast web runtime, engine baseline, remote
  map, store process.
- **Fire TV** — web app / Amazon WebView (Amazon Silk vs system), Amazon
  device messaging, Amazon Appstore submission, remote (including the
  Alexa Voice Remote) key map.
- **Comcast / RDK** — where an app runs on RDK-based operator boxes.

When adding a platform, keep it generic/public-knowledge (vendor SDK docs
are public) and not tied to any one app's build pipeline — see the root
`README.md` and `AGENTS.md`.

## Promotion checklist (when the last platform lands)

Delete this file; confirm `README.md` status row reads fully **Ready**;
confirm `NOTICE.md` lists every platform's sources; re-check the skill
count in `AGENTS.md` rule 7.
