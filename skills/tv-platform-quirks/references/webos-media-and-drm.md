# webOS Media and DRM

webOS plays media through the system media pipeline behind a normal
`<video>` element. What bites you is the gap between what desktop Chrome
of the same Chromium version supports and what the TV pipeline actually
accepts: the adaptive-streaming story is narrower, DRM has a webOS-specific
setup step, and codec/HDR support varies by *panel*, not just OS version.

## Streaming protocols

From the *Streaming Protocol and DRM* specification:

| Protocol | Support |
|---|---|
| HTTP / HTTPS progressive | All versions. HTTP/2 on webOS 5.0+. HTTP/3: no. |
| **HLS** | Native on all versions (the emulator only from 5.0). |
| **MPEG-DASH** | **Not natively supported.** |
| Smooth Streaming (MSS) | Not supported. |

Implications:

- **If you need DASH, you ship your own player.** Use `MediaSource`
  Extensions (MSE) with dash.js / Shaka / hls.js and feed segments
  yourself. Native `<video src="...m3u8">` only covers HLS.
- HLS version support tracks the OS: HLSv3 on webOS 2.x–3.x, v5 on
  4.0/4.5, v7 on 5.0+.
- MSE/EME is available webOS 3.0+; 5.0+ implements the 2016/2017 W3C
  Recommendations. On webOS 3.x expect rough edges (buffer eviction
  quirks, `SourceBuffer` timing).

## DRM

Supported DRM systems: **PlayReady** and **Widevine Modular**. Both work
through HTML5 MSE + EME. **Widevine Classic is deprecated from webOS 23**
— do not use it. Widevine **L1 / `HW_SECURE_ALL`** is available on webOS
3.5+; below that, expect L3 (SD-only for many studios). Neither DRM works
on the emulator/simulator — DRM testing requires a real TV.

### The webOS-specific step: load the DRM client

Beyond standard EME, webOS wants you to provision a DRM client through the
Luna service `luna://com.webos.service.drm` before playback:

| Method | Purpose |
|---|---|
| `load` | Create a DRM client. Params: `drmType` (`"playready"` / `"widevine"`), `appId`. Returns `clientId`. |
| `sendDrmMessage` | Pass rights/challenge data. Params: `clientId`, `msgType`, `msg`, `drmSystemId`. Returns `msgId`, `resultCode`, `resultMsg`. |
| `getRightsError` | Subscribe (`subscribe: true`) for license errors: `contentId`, `errorState`, `drmSystemId`, `rightIssueUrl`. |
| `unload` | Destroy the client. Params: `clientId`. |

`webOSDev.drmAgent(drmType)` in `webOSTV-dev.js` wraps this flow.

The `clientId` is then threaded into playback via a `mediaOption` blob
encoded into the source's MIME type, e.g.:

```js
options.option.drm.type = drmType;
options.option.drm.clientId = clientId;
source.setAttribute(
  'type',
  'video/mp4;mediaOption=' + encodeURIComponent(JSON.stringify(options))
);
```

**Non-negotiable: `unload` the DRM client before the app exits or before
switching `drmType`.** A leaked DRM client causes the *next* playback
session (or the next app launch) to fail to acquire a license, and the
symptom shows up nowhere near the code that caused it. Wire `unload` into
your `visibilitychange` → hidden path and your teardown path.

For PlayReady in OTT, use the post-delivery (license acquired at playback)
model, not pre-delivery.

## Codecs, HDR, audio — vary by panel

Per-version *Audio and Video Format* specs (webOS 24 shown; check the page
for your target version):

- **Video:** H.264 up to HP@L4.2 (1080p) / L5.1 (4K@30); HEVC
  Main/Main10 to L5.1 (4K@60) and L6.1 (8K on 8K models); VP9 and AV1 to
  4K@60 on supported models, 8K on some. Bitrate ceilings ~40–60 Mbps
  (1080p/4K), up to ~100 Mbps for 8K HEVC.
- **Containers:** mp4, mov, m4v, mkv, ts/trp/tp/mts, 3gp, avi, asf, wmv,
  mpg/mpeg, vob, and more.
- **Audio:** AAC, Dolby Digital (AC3), Dolby Digital Plus (E-AC3), MP3,
  Opus, FLAC, Vorbis, LPCM/PCM, WMA. **"Specific models only":** Dolby
  AC-4, MPEG-H 3D Audio, DTS / DTS-HD / DTS:X. AAC **Main profile is not
  supported**; streams using GMC or Qpel are not supported.
- **Subtitles (sidecar):** WebVTT `.vtt`.
- **HDR:** HDR10 / HLG / Dolby Vision depend on the panel. Query
  `webOS.deviceInfo()` flags (`hdr10`, `dolbyVision`, `dolbyAtmos`,
  `uhd`, `oled`) and pick renditions from that — never from the model
  string, and never assume a 4K set does Dolby Vision.

## Playback hygiene

- **Release the pipeline when hidden.** `pause()`, clear `src` / detach
  MediaSource, `video.load()`, `unload` the DRM client. See
  `webos-lifecycle.md`. A backgrounded app holding the decoder is the
  top OOM-kill cause.
- **One active `<video>` at a time.** The pipeline is a scarce singleton
  on lower-end SoCs; a second concurrent decode (e.g. a background trailer
  under a foreground clip) often fails silently or evicts the first.
- **`enablePigScreenSaver`** (`appinfo.json`, webOS 3.0+) controls
  whether the "picture-in-picture / picture image" screensaver may start
  over your video during long idle — set deliberately for
  playback-centric apps.
