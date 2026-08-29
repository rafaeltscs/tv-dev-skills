# Amazon Fire TV

Fire TV is mid-transition between two operating systems, and "does the app
run on Fire TV" now has two answers:

- **Fire OS** (Android-based) — the established platform. A web app runs
  as HTML/CSS/JS inside **Amazon WebView (AWV)**, a Chromium-derived
  WebView, wrapped in an APK distributed through the Amazon Appstore.
- **Vega OS** (Linux-based, launched Oct 2025 on the Fire TV Stick 4K
  Select) — **not Android, and not a web-app host.** Apps are built with
  the **Vega Developer Tools** (formerly "Kepler" SDK): React Native
  0.72 + TypeScript. An AWV hybrid app does **not** run natively on Vega;
  it needs a separate Vega build.

Amazon has stated a multi-OS strategy: Fire OS continues in parallel for
years, new budget devices ship Vega. So **"support Fire TV" is now a
scoping decision** — Fire OS only, Vega only, or both — not a single
target. The rest of this file is about the **Fire OS / web-app** path;
Vega is out of scope for a web-based TV app beyond "you will need a
distinct build."

One consolidated file (not the five-way split used for webOS/Tizen)
because most of the Fire OS web surface is just Chromium-on-Android with a
thin Amazon layer.

## Runtime: Amazon WebView

- **AWV is a transparent replacement for the Android system `WebView`**
  on Fire OS 5+ (Fire TV and 3rd-gen+ Fire tablets), custom-built
  Chromium with GPU/video optimisation for the hardware. Amazon's **Silk
  browser** and AWV are both Chromium but "components may not always
  support the same features" — don't infer AWV support from Silk.
- **AWV updates through the Appstore independently of Fire OS.** So the
  engine floor is *the oldest AWV version still in the field*, not the
  oldest Fire OS. Historical waypoints from Amazon's notes: AWV **v84**
  restricted loads to HTTPS-only; **v87** auto-upgrades mixed-content
  images. Assume HTTPS-everything and no mixed content.
- **No published AWV-version → Chromium-version table.** Read
  `navigator.userAgent` at runtime (it carries a Chrome version), target
  a conservative baseline, transpile down, feature-detect. Test on the
  oldest device you support — an early Fire TV Stick is far behind a
  current Fire TV Cube.
- **Debug** with Chrome DevTools: `chrome://inspect` from desktop Chrome
  against a Fire TV in ADB developer mode.
- **Resolution:** UI runs at 1080p or 720p depending on device/output;
  lay out at 1920×1080 with an overscan-safe inset. Some devices need a
  viewport-meta / CSS-transform scale workaround to render the UI at the
  intended size.
- Apply the low-RAM budget from `tv-performance-constraints` — the stick
  form factors are the constraint.

## App shape and `amzn_wa.js`

Two web delivery models, both ending as an Appstore APK:

| Model | You provide | Amazon does |
|---|---|---|
| **Web App** | A hosted HTTPS URL, or a ZIP of static assets, plus metadata in the developer console | Generates and signs the APK wrapper |
| **HTML5 Hybrid App** | A full APK you build with the Android SDK, embedding AWV and your assets | Just store review |

- **`amzn_wa.js`** — the Amazon Web App API. Include it to get **in-app
  purchasing (IAP)** and platform hooks; it is required for IAP and for
  some Appstore features. Reference the Amazon-hosted copy so it stays
  current.
- **Web App Tester** — a free app from the Fire TV Appstore that loads
  your pre-prod URL / local ZIP on the actual device for testing without
  packaging. Primary iteration loop.
- Test-install a packaged APK with `adb install`.

## Remote input

The Fire TV remote is minimal: D-pad, Select, Back, and (on some) a
Menu/Options key, a mic/Voice button, and — only on newer remotes —
Play/Pause / Rewind / Fast-Forward. Some remotes are D-pad + Select +
Back only.

- **Delivered to the WebView as `keydown`:** D-pad and Select map to the
  standard web values — arrows **37–40**, Select/Enter **13**. Menu is
  usually **18**.
- **Cannot be captured:** **Home** and **Voice/Search (mic)** — system
  events, your app is just backgrounded.
- **Media transport keys are not on all remotes** — capture D-pad
  transport controls (Select on a play/pause button in your UI) as the
  primary path; treat hardware media keys as a bonus.
- **The Back key code is inconsistent across AWV versions and devices** —
  it has been observed as `8` (Backspace), `27` (Escape), `461`, and as a
  native intercept that never reaches JS. **Handle all of these**, and
  also handle AWV's default Back behaviour (see below). Feature-test on
  your target devices; don't hardcode one value.
- **No pointer/cursor** from the standard remote — `mousemove` /
  motion events are not raised. (Bluetooth game controllers are
  supported via the Gamepad API, where Back == Select and Menu == Start.)
- **`div` / `span` are not focusable by the remote.** Only natively
  focusable elements (`a`, `button`, `input`, `video`, `[tabindex]`)
  take D-pad focus — add `tabindex` or run your own JS focus manager
  (see `tv-focus-and-navigation`).

### Back-at-root

By default AWV routes Back to WebView history, and at the first entry it
closes the app. If you manage your own navigation stack, intercept Back,
`history.pushState()` per in-app navigation or track depth yourself, and
at the root let the app close (or call `window.close()` / the Amazon web
app close hook). Trapping the user at the root fails Appstore review.

## Lifecycle

- **`visibilitychange` / `document.hidden`** — standard web semantics; no
  webOS/Tizen-style platform relaunch event. Fires on background
  (Home/other app) and on the way to exit.
- Releasing path on `hidden`: stop and tear down video, stop
  timers/observers, halt network, persist resume state. Fire OS will
  reclaim a backgrounded app under memory pressure, and the stick
  devices hit that quickly.
- Restoring path on visible: rebuild, re-check network, resume from
  persisted state.
- Deep links / launch intents arrive through the APK's Android intent
  handling; for the Web App model, Amazon surfaces launch parameters
  through the console configuration and `amzn_wa.js`.

## Media and DRM

- **HTML5 `<video>` + MSE/EME.** MSE is supported; **both MPEG-DASH and
  HLS** work through MSE (use hls.js / Shaka / dash.js — there is no
  native ABR player API like Tizen's AVPlay). `.mov` is explicitly
  unsupported.
- **DRM:** the **Web App Platform supports Widevine L3**. L1
  (hardware-backed, needed by most studios for HD/UHD) is available to
  native/AWV apps on capable hardware but **not guaranteed via the Web
  App wrapper** — confirm the path for your content tier. PlayReady is
  not the standard Fire TV route.
- One active decode; release it on `visibilitychange → hidden`. On the
  low-end sticks, a leaked decoder during long playback is the classic
  crash.
- Codec/HDR support varies by device (H.264 everywhere, HEVC + 4K +
  HDR10/HLG on the 4K devices, Dolby Vision/Atmos on Cube-class). Read
  the UA / device model and feature-detect via EME
  `requestMediaKeySystemAccess` and `MediaSource.isTypeSupported`.
- In the Appstore submission, tick **"Prevent Sleep for Video Playback"**
  or long playback is interrupted by the screensaver / sleep timer.

## Submission

- Amazon **Developer Console** → Amazon Appstore; select **Fire TV** as a
  supported device and pick specific Fire TV models / generations.
- Provide: APK or Web App URL/ZIP, description, screenshots, a **1080p+
  feature graphic / banner** for the Fire TV launcher row, content
  rating, IAP items if any.
- Review checks Fire TV essentials: launches and is navigable within the
  time budget, **fully operable with D-pad only**, Back behaves and exits
  at root, playback doesn't sleep, no broken links, no non-Amazon
  billing.
- Updates are re-reviewed. The Web App model still re-reviews on metadata
  change; a pure content change behind a fixed hosted URL does not, but
  keep that URL pinned to the reviewed build during review.
- Amazon also runs a **"Living Room" / device-targeting** compatibility
  check — an app can be live for mobile Fire tablets but rejected for
  Fire TV on remote-navigation grounds.

## If the target is Vega OS

Stop treating it as a web-app target. You need the **Vega Developer
Tools** (VS Code extension + CLI), a React Native 0.72 codebase, and a
separate Appstore submission for the Vega device class. Shared logic can
be factored out, but the view layer is React Native, not DOM. That
migration is its own project and outside this skill.
