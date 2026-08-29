# Tizen Runtime and Web Engine

A Samsung TV web app is an HTML/CSS/JS bundle packaged as a signed `.wgt`
widget, run full-screen in a system WebView. Same shape as webOS, and the
same core hazard: each Tizen release freezes a Chromium version for the
life of that TV, and Samsung sets are in the field for a decade. Code that
runs in desktop Chrome can fail on a 2018 set because the API wasn't in
that engine.

## Web engine per Tizen version

From Samsung's *Web Engine Specifications*:

| Model year | Tizen | Web engine |
|---|---|---|
| 2015 | 2.3 | WebKit |
| 2016 | 2.4 | WebKit r152340 |
| 2017 | 3.0 | Chromium M47 |
| 2018 | 4.0 | Chromium M56 |
| 2019 | 5.0 | Chromium M63 |
| 2020 | 5.5 | Chromium M69 |
| 2021 | 6.0 | Chromium M76 |
| 2022 | 6.5 | Chromium M85 |
| 2023 | 7.0 | Chromium M94 |
| 2024 | 8.0 | Chromium M108 |
| 2025 | 9.0 | Chromium M120 |
| 2026 | 10.0 | Chromium M130 |

Numbers are the *floor*; exact minor build varies by model/firmware, and
Samsung notes web-engine behaviour "may not agree" with generic Chrome
compat data for TV-platform features. Verify on a real set or the matching
emulator.

### What the freeze means in practice

- **Pick a Tizen version floor and target its Chromium engine.** Map the
  target Tizen version to the Chromium number above, then check features
  against that Chromium release on `caniuse`.
- **Concrete cutoffs that bite:**
  - Tizen 3.0 = **M47**: has arrow functions / classes / `Promise`, but
    **no `async`/`await`** (M55), no object spread (M60), no
    `Array.prototype.includes` on some builds.
  - Tizen 4.0 = M56: `async`/`await` yes; still no `IntersectionObserver`
    (M51 — ok), no `ResizeObserver` (M64).
  - Tizen 5.0 = M63: ES2017 fine; no `ResizeObserver` yet.
  - Tizen 6.0 = M76: still **no optional chaining / nullish coalescing**
    (M80).
  - Tizen 6.5 = M85: optional chaining and `??` land here.
  - CSS: no `gap` in flexbox before M84 (Tizen 6.5); container queries
    only from M108 (Tizen 8.0).
- **Bundle polyfills to the floor.** core-js at the right level, a
  `Promise`/`fetch` polyfill for Tizen 2.4/3.0, and don't assume
  `Intl` locale data is complete.
- **Tizen 2.3/2.4 are WebKit**, not Chromium — a substantially different
  engine. Most modern apps set the floor at Tizen 3.0 or 4.0 and drop
  2.x.

## Logical resolution

The app renders at **1920×1080** by default (declared as `screensize` in
`config.xml`); 4K/8K panels composite up. Lay out at 1080p, keep
interactive content inside a ~5% overscan-safe inset, and don't branch
layout on `window.innerWidth` expecting 4K numbers.

## The `webapis` object and `webapis.js`

Standard DOM APIs are joined by two Samsung layers:

- **`tizen.*`** — the Tizen Web Device API (application, filesystem,
  systeminfo, `tvinputdevice`, `tvchannel`, etc.). Available without an
  extra script include, but each namespace needs the matching
  **privilege** declared in `config.xml` or the call throws
  `SecurityError`.
- **`webapis.*`** — Samsung's TV-product extensions (`webapis.avplay`,
  `webapis.avinfo`, `webapis.productinfo`, `webapis.network`,
  `webapis.appcommon`). These require loading Samsung's bootstrap script
  **before your app code**:
  ```html
  <script src="$WEBAPIS/webapis/webapis.js"></script>
  ```
  Forgetting this include is a classic "works in the browser, `webapis is
  undefined` on the TV" failure.

Use `webapis.productinfo.getVersion()` / `getModel()` and
`tizen.systeminfo` to branch capability on the actual set rather than on
the year.

Every `tizen.*` / `webapis.*` call can throw or fail asynchronously
(missing privilege, older firmware without that method). Wrap them and
degrade — a failed `systeminfo` read must not block startup.
