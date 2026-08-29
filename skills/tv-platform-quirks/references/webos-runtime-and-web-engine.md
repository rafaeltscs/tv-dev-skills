# webOS Runtime and Web Engine

A webOS TV app is a web app: HTML/CSS/JS packaged into an `.ipk`, run
full-screen in a system WebView. There is no evergreen browser under it —
each webOS release freezes a Chromium version for the life of that TV, and
those TVs stay in the field for a decade. The single most common webOS bug
is code that works in dev (desktop Chrome) and fails on a 2019 set because
the API it uses did not exist in that panel's engine.

## Web engine per OS version

From the webOS TV *Web API and Web Engine* specification:

| webOS TV | Year | Web engine |
|---|---|---|
| 1.x | 2014 | WebKit 537.41 |
| 2.x | 2015 | WebKit 538.2 |
| 3.x | 2016–2017 | Chromium 38 |
| 4.x | 2018–2019 | Chromium 53 |
| 5.x | 2020 | Chromium 68 |
| 6.x | 2021 | Chromium 79 |
| 22 | 2022 | Chromium 87 |
| 23 | 2023 | Chromium 94 |
| 24 | 2024 | Chromium 108 |
| 25 | 2025 | Chromium 120 |
| 26 | 2026 | Chromium 132 |

(LG renamed the line from "6.0" to "22" in 2022; there is no webOS 7–21.)
Treat the numbers as the *floor* — the exact minor build varies by model
and firmware, and LG's own docs say Chrome's compat data "may not agree"
for webOS-platform features. Verify on a real device or the matching
simulator image, never on desktop Chrome alone.

### What the freeze means in practice

- **Pick a baseline OS version explicitly** ("we support webOS 5.0+") and
  set your transpile target and polyfill set to that engine, not to
  "modern browsers." webOS 4.x is Chromium 53: no `Array.prototype.flat`,
  no optional chaining, no `ResizeObserver`, partial `IntersectionObserver`,
  no CSS `gap` in flexbox, no `Intl.PluralRules`. webOS 5.x (Chromium 68)
  adds most ES2018 but still no optional chaining / nullish coalescing
  (Chromium 80). webOS 6.x (Chromium 79) is the first that's close to
  "just write modern JS."
- **`caniuse` by Chromium version is the reference.** Map your target
  webOS version to its Chromium number above, then check features against
  that Chromium release.
- **Bundle your framework's runtime; don't rely on the engine.** Core-js
  at the right level, a Promise/fetch polyfill for webOS 3.x, and a
  `Intl`/`Intl.DateTimeFormat` locale-data check.
- **webOS 1.x/2.x use two different engines** for the system browser and
  for web apps — a WebKit build, not Chromium. If you must support these,
  every capability assumption needs device testing; most modern apps set
  the floor at webOS 3.x or 4.x and drop 1.x/2.x.

## The app is rendered at 1920×1080 logical pixels

Regardless of panel resolution (including 4K and 8K sets), the web app's
coordinate space is 1920×1080 by default (`resolution` in `appinfo.json`
can also select `1280x720`). Design and lay out at 1080p; the compositor
scales. Do **not** query `window.innerWidth` and branch layouts on it
expecting 4K numbers — you'll get 1920. Account for TV overscan: keep
interactive content inside a safe area (~5% inset, roughly 96px
horizontal / 54px vertical) so nothing critical sits under a bezel.

## webOSTV.js and Luna service calls

Platform features (device info, network status, DRM, launching other
apps, system settings) are not DOM APIs — they're **Luna service** calls
over an internal bus. Two ways to reach them:

- **`webOSTV.js`** (`webOSTV.js` + `webOSTV-dev.js`, vendored into the
  app, not a CDN). Gives `webOS.*` and `webOSDev.*` wrappers:
  - `webOS.platformBack()` — invoke the standard Back/exit behavior.
  - `webOS.deviceInfo(cb)` — model name, `sdkVersion`, panel resolution,
    and capability flags (`uhd`, `oled`, `hdr10`, `dolbyVision`,
    `dolbyAtmos`, ...). **Branch feature support on these flags, not on
    the model string.**
  - `webOS.systemInfo()` — `country`, `smartServiceCountry`, `timezone`.
  - `webOS.fetchAppId()`, `webOS.fetchAppInfo(cb)`,
    `webOS.fetchAppRootPath()`.
  - `webOS.keyboard.isShowing()` — virtual-keyboard visibility.
  - `webOS.service.request(uri, options)` — raw Luna call with
    `parameters`, `onSuccess`, `onFailure`, `subscribe`.
  - `webOSDev.LGUDID(cb)` — stable per-device UUID (webOS 3.0+); the
    right identifier for device-scoped licensing/analytics.
  - `webOSDev.connection.getStatus({subscribe:true, onSuccess})` —
    connectivity changes.
- **Raw `luna://` calls** via `webOS.service.request` for services the
  wrapper doesn't cover (e.g. `luna://com.webos.service.drm`).

Every Luna call is async and can fail (service not running, permission
not granted, older OS without that method). Always supply `onFailure` and
degrade gracefully — a rejected `deviceInfo` must not block startup.

## PalmSystem vs webOSSystem

The legacy global is `PalmSystem`; webOS 5.0+ also exposes `webOSSystem`.
Prefer `webOSSystem` on 5.0+ and keep a `PalmSystem` fallback only if the
support floor is 4.x or lower. In almost all app code you should be going
through `webOSTV.js` rather than touching either global directly.
