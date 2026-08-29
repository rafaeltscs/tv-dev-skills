# Android TV / Google TV

**Google TV and Android TV are the same target.** Google TV is a
content-forward launcher UI on top of Android TV OS; the app platform,
the APK, the system WebView, and the Play Store listing are identical.
Build and test once for "Android TV" and it runs on both.

Android TV is **native by default** — Kotlin/Java with Jetpack Compose
for TV (the Leanback libraries are deprecated). This skill covers the
**web path**: your HTML/CSS/JS running inside an Android `WebView` that is
hosted by **a small native shell app you write and ship yourself**. That
shell is the Android-TV-specific work; the rest is standard Chromium.

Contrast with the other platforms in this skill: webOS, Tizen, and VIZIO
host your web app directly. On Android TV **there is no web-app host** —
you produce an Android App Bundle, and Google Play requires it to behave
like a real TV app (Leanback launcher entry, D-pad operability, no
touchscreen dependency, a banner). A pure PWA/TWA is not an accepted
Android TV submission.

One consolidated file: the web surface is standard Chromium WebView, so
the platform-specific content is the shell, the manifest, the lifecycle
bridge, and Play policy.

## Runtime: the system WebView

- The `WebView` is **Chromium**, shipped as a **Play Mainline module** —
  it updates through Google Play **independently of the OS**, like on
  phones. So the engine floor is *the oldest WebView still in the field*,
  not the oldest Android TV OS version.
- **But cheap OEM boxes that lack Play certification may never update the
  WebView** — you can hit a genuinely old Chromium on those. Read
  `navigator.userAgent`, target a conservative baseline, transpile down,
  and feature-detect. There is no Android-TV-version → Chromium table to
  plan against.
- **Quality rule TV-WB:** "For web content, the app must only use
  `WebView` components. The app must not attempt to launch a web browser
  app." No `Intent` out to Chrome, no `_blank` that escapes the WebView.
- **Debug** with `WebView.setWebContentsDebuggingEnabled(true)` + desktop
  Chrome `chrome://inspect` over ADB.
- **Resolution:** the UI runs in a landscape Activity; lay out at
  1920×1080 with an overscan-safe inset (quality rules **TV-LO**,
  **TV-OV**: no letterboxing, nothing cut off by the edges).
- Apply the low-RAM budget from `tv-performance-constraints`. Quality
  rule **TV-ME** enforces it: on `ActivityManager.isLowRamDevice()`
  devices the foreground app's memory (Anon+Swap + Graphics + File) must
  stay within Android's published TV limits.

## The native shell

You ship an **Android App Bundle (`.aab`)** — mandatory for TV
(**TV-G1**). `minSdkVersion` **≤ 31** for reasonable device reach
(**TV-PS**). The shell's job:

### Manifest

```xml
<uses-feature android:name="android.hardware.touchscreen" android:required="false" />
<uses-feature android:name="android.software.leanback" android:required="true" />
<!-- do NOT hard-require telephony / camera / location.gps — it delists you from TV -->

<application android:banner="@drawable/tv_banner">   <!-- 320x180, in drawable-xhdpi, with localized app name -->
  <activity android:name=".TvActivity" android:screenOrientation="landscape">
    <intent-filter>
      <action android:name="android.intent.action.MAIN" />
      <category android:name="android.intent.category.LAUNCHER" />
      <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
    </intent-filter>
  </activity>
</application>
```

- **`CATEGORY_LEANBACK_LAUNCHER`** is what makes Play accept it as a TV
  app and what puts it on the home screen (**TV-ML**, **TV-LM**).
- Banner: 320×180 px, `res/drawable-xhdpi/`, contains the app name
  (**TV-LB**, **TV-BN**).
- Any permission that *implies* unsupported hardware also delists —
  audit them.

### WebView configuration

- `settings.javaScriptEnabled = true`
- `settings.domStorageEnabled = true` (localStorage)
- `settings.mediaPlaybackRequiresUserGesture = false` (autoplay after
  user navigation)
- hardware acceleration on; set a non-transparent background
  (**TV-TR**: the app must fill the screen with an opaque background)
- Load your app URL (hosted) or `file:///android_asset/` (bundled). A
  bundled build removes the "app can't fetch its own bundle on flaky
  TV Wi-Fi" failure and is common for store builds.

## Lifecycle — Android Activity, bridged to the web app

There is no `visibilitychange`-from-the-platform contract here; the
**Android Activity lifecycle** is the source of truth and you bridge it
into the WebView.

| Activity callback | Do |
|---|---|
| `onPause()` / `onStop()` (Home, another app, Ambient Mode) | Call a JS hook (`webView.evaluateJavascript(...)`) to **pause and tear down video**, stop timers/animation, persist resume state. Then `webView.onPause()` + `webView.pauseTimers()`. |
| `onResume()` | `webView.onResume()` + `resumeTimers()`, then a JS hook to rebuild and resume from persisted state; re-check network. |
| `onDestroy()` | Destroy the WebView; release the media session. |

- **Video must not play in the background (TV-NP):** "video must be
  paused when the user switches out of the app." Video apps do **not**
  get a Now Playing card. This is a hard review item — wire it to
  `onStop()`.
- **Ambient Mode / screensaver:** hold `FLAG_KEEP_SCREEN_ON` on the
  window **only while the user is actively playing** (**TV-BU**), and
  clear it when playback stops (**TV-BY**). Don't keep the screen on
  across your whole app.
- Register a **`MediaSession`** while playing so the platform knows
  playback state and voice commands ("pause") work (**TV-VC**, playback
  checklist).

## Remote input

Keys reach the WebView as `keydown`, but with Android quirks:

- **D-pad and Select map to standard web values** — arrows **37–40**,
  `DPAD_CENTER` → Enter **13**. Focus handling is otherwise normal DOM
  focus; `div`/`span` need `tabindex` or a JS focus manager (same as
  Fire TV — Amazon's WebView is derived from this one).
- **Back (`KEYCODE_BACK`, native 4) does not reliably reach JS.** The
  Activity/WebView intercepts it for history navigation. Handle it in the
  shell — `onBackPressed()` (or an `OnBackPressedCallback`) — and bridge
  to your web app's navigation:
  - non-root screen → tell the web app to go up one level;
  - **root → `finish()` the Activity.** Quality rule **TV-DB**: "Back
    button presses lead back to the Android TV home screen." Trapping the
    user at the root fails review.
- **Do not depend on a Menu button (TV-DM)** — many remotes don't have
  one. The Google TV remote adds an Assistant/mic button (OS-consumed)
  and often YouTube/Netflix hotkeys (OS-consumed).
- **Media transport keys** (`KEYCODE_MEDIA_PLAY_PAUSE` etc.) may not be
  present on all remotes and may be routed to your `MediaSession` rather
  than the WebView — quality rules **TV-PC/TV-PP** expect D-pad-center to
  toggle play/pause during playback, so make **D-pad the primary
  transport path**.
- Newer OS versions also support pointer remotes / cursor; a hover state
  is a Tier-1 nicety (**TV-TO**), not required — but never make hover the
  only way to reach something.

## Media and DRM

- HTML5 `<video>` + **MSE/EME** in the WebView. Both **HLS and
  MPEG-DASH** need your own MSE player (hls.js / Shaka / dash.js) — the
  WebView has no native ABR player. (If you need more than the WebView
  can give — tight buffer control, tunneled playback, specific codecs —
  the alternative is to play in the native shell with **ExoPlayer/Media3**
  behind a transparent WebView, like the Tizen AVPlay pattern.)
- **DRM:** EME → **Widevine**, backed by Android `MediaDrm`. Retail
  Android TV / Google TV devices and Chromecast-with-Google-TV are
  **L1** (hardware-backed, HD/UHD); many low-cost OEM boxes are **L3**
  (SD-capped for most studios). Check `navigator.requestMediaKeySystem
  Access` with a `robustness` requirement and branch — don't assume L1.
- One active decode; release it on `onStop()` (see lifecycle). PiP is
  possible but has its own strict rules (**TV-IC…TV-IX**) — only for
  continuing an ongoing playback, user-initiated, no UI/ads in the PiP
  window.
- Codec/HDR support is per-device — feature-detect via
  `MediaSource.isTypeSupported` / EME, and read device capabilities;
  4K assets are a Tier-2 item (**TV-4K**).

## Submission — Google Play

- **App Bundle** (`.aab`), TV form factor selected in Play Console.
- Home-screen **banner** (320×180) and at least one **unaltered TV
  screenshot** that depicts the real current app (**TV-G4**).
- **Test credentials** in Play Console if the app needs sign-in
  (**TV-G5**).
- Play runs the TV app-quality review against the **TV-xx** criteria
  above; the frequent failures for a WebView app are: Back doesn't go
  home at the root, a control only reachable by pointer/touch, video
  kept playing (or screen kept on) in the background, banner missing or
  without the app name, and a hard hardware requirement in the manifest.
- **TV-G6** (effective 1 Aug 2026): the app must support 32- and 64-bit
  and comply with the 16 KB page-size requirement — a native-shell build
  concern (your `.so`s / any NDK libs), not the web layer.
- Updates are re-reviewed. Increment `versionCode`; keep the same
  `applicationId` and signing key (Play App Signing).

## What varies / confirm per device

The WebView (Chromium) version on the specific boxes you support — assume
old on non-Play-certified OEM hardware; Widevine level (L1 vs L3) per
device; whether a given remote delivers media keys to the WebView or only
to the `MediaSession`; and 4K/HDR/codec capability.
