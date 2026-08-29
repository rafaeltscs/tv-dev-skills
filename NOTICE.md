# Notice

The technical content in `skills/lightningjs-v2-conventions/` was written by
synthesizing and paraphrasing publicly available documentation for
LightningJS Core v2:

- https://lightningjs.io/docs/
- https://github.com/rdkcentral/Lightning (Apache License 2.0)

No text was copied verbatim from those sources beyond short property/method
names and minimal illustrative code patterns of the kind found in any
LightningJS tutorial. No proprietary or employer-owned source code was used
in producing this material.

The content in `skills/tv-focus-and-navigation/` was written the same way,
synthesizing publicly available documentation on TV/remote spatial
navigation:

- Norigin Spatial Navigation developer docs — https://devportal.noriginmedia.com/docs/Norigin-Spatial-Navigation/ (MIT)
- CSS Spatial Navigation Level 1 (W3C CSS WG draft) — https://drafts.csswg.org/css-nav-1/
- WICG spatial-navigation explainer and polyfill — https://github.com/WICG/spatial-navigation
- Enact Spotlight (LG Electronics, Apache 2.0) — https://github.com/enactjs/enact/tree/master/packages/spotlight

No text was copied verbatim beyond short API names and minimal
illustrative patterns. The reference examples are framework-neutral
pseudo-code, not lifted from any one library.

The content in `skills/tv-performance-constraints/` was written the same
way, synthesizing publicly available documentation on TV hardware
constraints and performance practice:

- LightningJS Core v2 runtime configuration docs (texture memory / `memoryPressure`) — https://github.com/rdkcentral/Lightning/tree/master/docs (Apache License 2.0)
- Android TV memory optimization guide (device-class RAM/graphics budgets, image sizing) — https://developer.android.com/training/tv/playback/memory
- Samsung Tizen TV application performance / launch-time optimization guides — https://developer.samsung.com/smarttv/develop/guides/application-performance-improvement/application-performance-improvement.html

The texture-size arithmetic is plain math (width × height × 4 bytes
RGBA); the pseudo-code examples are original and framework-neutral. No
text was copied verbatim beyond short option/API names.

The LG webOS content in `skills/tv-platform-quirks/` was written the same
way, synthesizing publicly available LG webOS TV developer documentation:

- webOS TV Developer — App Lifecycle Management, webOS Events, Back Button,
  Magic Remote guides — https://webostv.developer.lge.com/develop/guides/
- webOS TV Developer — Web API and Web Engine, Streaming Protocol and DRM,
  Audio and Video Format specifications — https://webostv.developer.lge.com/develop/specifications/
- webOS TV Developer — `appinfo.json`, `webOSTV.js` / webOSDev API, DRM
  API references — https://webostv.developer.lge.com/develop/references/
- webOS TV Developer — CLI Developer Guide and App Approval Process — https://webostv.developer.lge.com/develop/tools/ and https://webostv.developer.lge.com/distribute/app-approval-process

The Samsung Tizen content in the same skill was written the same way,
synthesizing publicly available Samsung Tizen TV / Tizen developer
documentation:

- Samsung Smart TV Developer — Web Engine Specifications, Remote Control
  guide, Multitasking guide, Playback Using AVPlay — https://developer.samsung.com/smarttv/develop/
- Samsung Smart TV Developer — TVInputDevice API and Application API
  references — https://developer.samsung.com/smarttv/develop/api-references/
- Samsung Smart TV Developer — Creating Certificates, and the TV Seller
  Office launch checklist — https://developer.samsung.com/smarttv/develop/getting-started/ and https://developer.samsung.com/tv/distribute/launch-checklist
- Tizen Docs — Input Device and application lifecycle guides — https://docs.tizen.org/application/web/

The VIZIO SmartCast content in the same skill was written the same way,
from the limited publicly available material (VIZIO's developer portal is
partner-gated):

- VIZIO Developer Portal and Platform+ — https://developer.vizio.com/ and https://platformplus.vizio.com/
- Publicly published third-party integration write-ups on the VIZIO
  companion library, hosted-app model, and submission flow (TO THE NEW
  engineering blog; the socialvibe/truex CTV reference app's VIZIO notes)

The VIZIO reference file explicitly marks the points that need
confirmation from VIZIO's partner documentation rather than stating them
as established fact.

Remote key codes, the Chromium-per-OS-version tables, `window.VIZIO`
method names, and manifest field names (`appinfo.json`, `config.xml`) are
short factual identifiers; the explanations and code patterns are
original. No vendor text was reproduced verbatim. Fire TV and Comcast/RDK
are not yet covered by that skill.

If you fork or extend this repo with your own team's internal conventions,
keep employer-specific code, credentials, asset paths, and business logic
out of it — see the "Keeping this project-agnostic" section of
[AGENTS.md](AGENTS.md).
