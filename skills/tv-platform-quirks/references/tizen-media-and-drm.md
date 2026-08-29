# Tizen Media and DRM

The big divergence from webOS: Tizen ships **AVPlay** (`webapis.avplay`),
a native player exposed to JS, and it is the expected path for real OTT
playback. HTML5 `<video>` + MSE/EME works for simple cases, but adaptive
streaming, 4K/UHD, many subtitle formats, and robust DRM are AVPlay
territory. Unlike webOS, **MPEG-DASH is natively supported** (through
AVPlay).

## When to use AVPlay vs `<video>`

| Need | Path |
|---|---|
| Short clip, progressive MP4, no DRM | HTML5 `<video>` is fine |
| HLS / DASH / Smooth Streaming ABR | **AVPlay** |
| 4K / UHD, HDR | **AVPlay** |
| PlayReady / Widevine at scale | **AVPlay** `setDrm()` (EME also possible but AVPlay is the supported/tested route) |
| TTML / SMPTE-TT / multiple sidecar subtitle formats | **AVPlay** |

## AVPlay state machine

`NONE → IDLE → READY → PLAYING ⇄ PAUSED`, back to `IDLE` via `stop()`,
to `NONE` via `close()`.

Core calls:

- `webapis.avplay.open(url)` — load; enters `IDLE`.
- `webapis.avplay.setDisplayRect(x, y, w, h)` — the video plane is a
  hardware overlay positioned in 1920×1080 coordinates, **behind** the
  web layer. Your DOM draws on top; to "show" video you leave a
  transparent hole in your UI over the rect.
- `webapis.avplay.setStreamingProperty(type, value)` — e.g.
  `ADAPTIVE_INFO`, `SET_MODE_4K`, `PROPERTYTYPE_WIDEVINE`.
- `webapis.avplay.prepare()` / `prepareAsync(onSuccess, onError)` —
  buffer; enters `READY`.
- `webapis.avplay.play()` / `pause()` / `seekTo(ms)` / `stop()` /
  `close()`.
- `webapis.avplay.setSpeed(n)` — trick-play (−16×…+16×, format
  permitting).
- `webapis.avplay.suspend()` / `restore()` — hold/resume a prepared
  pipeline across a short background trip (support varies by model —
  test).
- `webapis.avplay.setListener({ onbufferingprogress, onstreamcompleted,
  oncurrentplaytime, onerror, ondrmevent, onsubtitlechange, ... })`.

The **video overlay is a scarce singleton**. One AVPlay instance at a
time; a second concurrent decode (background trailer under a foreground
clip) typically fails or evicts the first. `close()` it fully before
opening the next asset, and on `visibilitychange → hidden` (see
`tizen-lifecycle.md`).

## DRM

Reached with `webapis.avplay.setDrm(drmType, operation, jsonData)`, called
in `IDLE` before `prepare()`:

- **PlayReady** — `setDrm('PLAYREADY', 'SetProperties', json)` with
  `LicenseServer`, optional `CustomData`, `DeleteLicenseAfterUse`. Also
  `'InstallLicense'` for pre-delivered licenses.
- **Widevine Modular** — `setDrm('WIDEVINE_CDM', 'SetProperties', json)`
  with `AppSession`, `DataType` (e.g. `'MPEG-DASH'`), license/proxy URL.
- **Verimatrix**, **Marlin**, **Secure Media** also supported via the
  same call.
- License errors and challenge/response events surface through
  `ondrmevent(type, data)` — for the manual challenge flow you pull the
  challenge from AVPlay, POST it to the license server yourself, and feed
  the response back.

Security levels: PlayReady SL2000/SL3000 and Widevine **L1** on modern
sets (HW-backed path required by most studios for HD/UHD); older/entry
models may only offer L3. **DRM does not work on the emulator** —
validate on hardware.

There is no separate `luna://`-style "load the DRM client" service call
as on webOS; provisioning is inside `setDrm`. But the same discipline
applies: tear the player down (`stop()` → `close()`) on exit and on
background so the DRM session and secure decoder are released — a leaked
session breaks the *next* playback attempt.

## Codecs, HDR, audio

Query with `webapis.avinfo` / `tizen.systeminfo` and
`webapis.productinfo` capability flags (`isUdPanelSupported()`,
`is8KPanelSupported()`, HDR support) — decide renditions from the panel,
not the model string. Broad shape on modern sets: H.264 up to 1080p high,
HEVC/H.265 to 4K60 (and 8K on 8K panels), VP9 and AV1 on newer models;
HDR10 / HLG / HDR10+ widely, Dolby Vision on select lines; audio AAC /
AC-3 / E-AC-3 broadly, Dolby AC-4 / Atmos and DTS variants "specific
models only". Confirm against the *Media Specifications* page for your
target Tizen version rather than assuming.

## Playback hygiene checklist

- One AVPlay instance; `close()` before the next asset.
- `stop()` → `close()` (and release DRM) on `visibilitychange → hidden`
  and on exit.
- Keep the web layer's hole aligned with `setDisplayRect` on every
  resize / resolution change.
- Re-validate signed media + license URLs after a resume from background.
