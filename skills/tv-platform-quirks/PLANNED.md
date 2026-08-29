# tv-platform-quirks (partial)

Status: **LG webOS written; other platforms not yet.** `SKILL.md` now has
real triggering frontmatter, scoped explicitly to webOS so it does not
claim to cover platforms it hasn't been written for.

## Done

- **LG webOS** — `SKILL.md` + five references:
  - `webos-runtime-and-web-engine.md` — Chromium-per-OS-version table,
    engine-freeze consequences, `webOSTV.js` / Luna services, 1080p
    logical resolution, `deviceInfo` capability flags.
  - `webos-lifecycle.md` — states, `webOSLaunch` / `webOSRelaunch` /
    `visibilitychange`, releasing/restoring paths, `handlesRelaunch`,
    `requiredMemory`, splash.
  - `webos-remote-input.md` — key code table, `key` = `"Unidentified"`,
    Magic Remote pointer vs 5-way, `cursorStateChange`, Back / History
    API contract.
  - `webos-media-and-drm.md` — HLS-only, MSE/EME, PlayReady + Widevine
    via `luna://com.webos.service.drm`, DRM-client unload discipline,
    codec/HDR/audio by panel.
  - `webos-packaging-and-certification.md` — `appinfo.json`, `ares-*`
    CLI / `.ipk`, Developer Mode, Simulator vs Emulator, Seller Lounge
    review.

## Still to write

Each is a separate divergence with its own lifecycle, key codes, media
API, DRM stack, and store — add as its own reference file(s) under the
same `SKILL.md`, and widen the frontmatter `description` when it lands:

- **Samsung Tizen** — `tizen.application` lifecycle, Back = `10009`,
  AVPlay media API, native DASH, `.wgt` packaging + signing, Samsung
  Seller Portal / VD app review.
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
