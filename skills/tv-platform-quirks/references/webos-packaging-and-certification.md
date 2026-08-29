# webOS Packaging and Certification

A webOS app ships as an `.ipk` built from a directory whose root holds
`appinfo.json`. Packaging is simple; getting through LG's store review is
the slow part, and re-review is required for *every* update.

## appinfo.json

Lives at the app root. Required fields:

| Field | Notes |
|---|---|
| `id` | Reverse-DNS, lowercase `a–z` / `0–9` / `-` / `.` only. Immutable once published — this is the store identity. |
| `title` | Shown on the launcher and window. |
| `main` | Entry HTML (e.g. `index.html`). |
| `icon` | 80×80 PNG. |
| `type` | `"web"` (only valid value for TV apps). |
| `version` | `X.Y.Z`, all three parts, digits only. Must increase for each store submission. |

Commonly-used optional fields:

| Field | Purpose |
|---|---|
| `largeIcon` | 130×130 PNG. |
| `vendor` | Displayed owner name. |
| `appDescription` | ≤ 60-char tagline. |
| `resolution` | `"1920x1080"` (default) or `"1280x720"`. |
| `iconColor` | Launcher tile background. |
| `splashBackground` | 1920×1080 PNG loading image. |
| `disableBackHistoryAPI` | `true` → app receives keyCode 461 directly instead of History-API back (see `webos-remote-input.md`). |
| `handlesRelaunch` | `true` → app handles `webOSRelaunch` itself before foregrounding (see `webos-lifecycle.md`). |
| `requiredMemory` | Expected footprint in MB; launcher frees other apps to fit it. |
| `transparent` | Transparent app background (overlay use cases). |
| `enablePigScreenSaver` | Allow the idle picture screensaver over video. |
| `accessibility.supportsAudioGuidance` | Screen-reader / ARIA audio guidance (webOS 3.0+). |

Several fields (`bgColor`, `bgImage`) are webOS 1.x–2.x only; several
(`splashColor`, `supportPortraitMode`, `supportTouchMode`,
`closeOnRotation`, `virtualTouch`) apply only to LG StandbyME (the
portable, rotatable set), not regular TVs.

## Build and deploy tooling

Use the **`@webosose/ares-cli`** npm package (`ares-*` commands). The
older standalone **"webOS TV CLI" is discontinued as of March 2024** —
migrate off it.

| Command | Use |
|---|---|
| `ares-generate` | Scaffold from a template (`basic`, `hosted_webapp`, `js_service`). |
| `ares-package <dir>` | Produce `<id>_<version>_all.ipk`. `--no-minify` for debuggable builds; `--outdir` to place it. |
| `ares-setup-device` | Register a TV (IP + dev-mode key) as a target. |
| `ares-install --device <name> <ipk>` | Install to a TV in Developer Mode (also `--list` / `--remove`). |
| `ares-launch --device <name> <id>` | Launch / close; `--hosted` serves a dev folder without installing. |
| `ares-inspect --device <name> <id>` | Open the Web Inspector against the running app. |
| `ares-novacom` | Dev-mode key management and port forwarding. |

**Developer Mode**: install the *Developer Mode* app from the LG Content
Store on the TV, sign in with an LG Developer account, enable it. The
session expires (~50 hours) and must be re-extended — a frequent "why did
my TV stop accepting installs" surprise.

### Simulator vs Emulator

- **Simulator** — a desktop build of the web engine per webOS version;
  fast, no packaging step (`ares-launch --simulator <version>`). Good for
  layout/JS iteration. **No DRM, no real media pipeline, no Luna
  services** beyond stubs.
- **Emulator** — a full system image in a VM; slower, closer to real
  behaviour, still not a substitute for hardware on media/DRM/performance.
- **Neither validates memory pressure, decoder limits, real remote key
  codes, or HDR.** Certify-critical testing is on devices.

## LG Content Store submission

Account: **LG Seller Lounge** (`seller.lgappstv.com`).

Submission package:

- The `.ipk`.
- Store metadata: description, category, content rating, screenshots
  (1280×720).
- **UX scenario document** — a written walkthrough LG's testers follow to
  exercise the app. Vague or incomplete scenarios get rejected before
  testing starts.
- **Self-checklist** — LG-provided spreadsheet; mark each item
  `PASS` / `FAIL` / `N/A` with real results. Mandatory; a thin or
  contradicted checklist is a rejection.

LG runs three passes: **pretest** (package/metadata validity),
**function test** (behaviour against your UX scenario, across multiple
webOS versions and screen sizes), **content test** (age-appropriateness).

### Recurring rejection causes

- Back button dead-ends or skips levels; no exit from the root.
- A screen not fully operable in 5-way mode (pointer-only controls).
- Slow cold start / unresponsive splash on older supported models.
- Crash or black screen on resume from Suspended (resources not
  released/rebuilt).
- Playback failures on the second session (leaked DRM client / decoder).
- Layout broken at 720p or under TV overscan.
- Claiming support for an OS version the app was never tested on.

### Updates

Approval is **per submission**. A new `version` goes through the whole
review again; shipping changes to an approved `id` without re-approval can
get the app pulled. Budget review time (commonly ~1–2 weeks) into release
planning, and keep the oldest supported webOS version in your regression
pass — that's the one review will fail you on.
