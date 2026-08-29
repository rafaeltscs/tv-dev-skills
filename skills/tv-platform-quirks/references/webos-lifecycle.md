# webOS App Lifecycle

webOS does not "close" a backgrounded app — it *suspends* it, and reserves
the right to kill a suspended app that holds too much memory. The lifecycle
events exist so your app can shed resources on the way down and restore
them on the way back. Treating them as optional is how you get "the app
crashes when I come back from live TV" bug reports that never reproduce on
the dev machine.

## States

| State | Meaning |
|---|---|
| Not Launched | Not running. |
| Launched | Running, foreground, visible. |
| Suspended | Still running, backgrounded, `document.hidden === true`. JS timers are throttled/paused; the app may be terminated from here under memory pressure. |
| Terminated | Process gone. Next entry is a cold `webOSLaunch`. |

The user reaches Suspended by pressing Home, switching to another app, or
going to live TV. There is no guaranteed "you are about to be killed"
callback — the transition to `hidden` **is** your warning.

## Events

Register with `document.addEventListener(name, handler, true)` early —
before `DOMContentLoaded` completes for launch events, or you can miss the
first one.

- **`webOSLaunch`** — cold start. `e.detail` carries launch parameters
  (deep-link payload, `intent`, etc.). Do first-run init here.
- **`webOSRelaunch`** — the app was already running (Launched or
  Suspended) and something launched it again, e.g. a new deep link. Read
  the *new* `e.detail` params and route accordingly. If
  `appinfo.json` `handlesRelaunch` is `false` (default) the platform also
  brings you to the foreground automatically; set it `true` only if you
  need to do background work first, and then you must call the activate
  path yourself.
- **`visibilitychange`** / `document.hidden` (also `document.webkitHidden`
  on the WebKit-era engines) — the core signal. `hidden === true` →
  releasing path; `hidden === false` → restoring path. This fires for
  every foreground/background transition, including ones with no
  accompanying `webOSRelaunch`.
- **`webOSLocaleChange`** — user changed system language/region while the
  app was running. Re-read locale, re-render strings; don't assume locale
  is fixed for the session.
- **`keyboardStateChange`** — `e.detail.visibility` (Boolean). The virtual
  keyboard overlays the bottom of the screen; move focused inputs above it.
- **`cursorStateChange`** — `e.detail.visibility` (Boolean). Magic Remote
  pointer appeared/disappeared. See `webos-remote-input.md`.
- **`webOSMouse`** — `e.detail.type` is `"Enter"` or `"Leave"` as the
  pointer enters/leaves the app surface.
- Network status is **not** a document event — subscribe via
  `webOSDev.connection.getStatus({subscribe:true, ...})` or
  `luna://com.palm.connectionmanager/getStatus`.

## The releasing path (on `hidden`)

Do this synchronously in the `visibilitychange` handler:

1. **Pause and unload video.** Call `pause()`, remove `src` / detach
   MediaSource, and `load()` so the platform can reclaim the decoder
   pipeline. A suspended app still holding the decoder is the #1 kill
   reason. Unload the DRM client too (see `webos-media-and-drm.md`).
2. **Stop everything periodic.** `clearInterval`/`clearTimeout`, cancel
   `requestAnimationFrame`, pause carousels and progress pollers,
   `disconnect()` observers. Timers are unreliable while hidden anyway.
3. **Drop large textures / images you can rebuild** — full-screen
   backdrops, off-screen rail bitmaps. Keep just enough state to repaint.
4. **Persist resume state** (current screen, scroll position, playhead)
   to `localStorage` now, because Terminated gives no further callback.
5. Stop network chatter (analytics beacons, prefetch).

## The restoring path (on visible again)

- Re-read `e.detail` if this came with `webOSRelaunch` (new deep link).
- Rebuild released textures, restart timers/observers.
- Re-init the player and DRM client from the persisted playhead.
- Re-check network and locale — both may have changed while suspended.
- Keep it fast: this runs while the user is looking at a blank/stale
  screen.

## Memory

- The low-RAM budget from `tv-performance-constraints` applies with full
  force here — a webOS TV is a ~1–1.5 GB device sharing RAM with the OS
  and decoder, and the OOM killer targets suspended apps first.
- `appinfo.json` `requiredMemory` (MB) declares your expected footprint;
  the launcher uses it to decide whether to free other apps before
  launching yours. Set it honestly. It is not a grant — exceeding it
  still gets you killed.
- Memory should **plateau** across a long browse-then-background-then-
  resume cycle. If it climbs every resume, the releasing path is leaking.

## Splash and first paint

- `appinfo.json` `splashBackground` (1920×1080 PNG) shows during load.
- Certification expects a responsive first screen quickly (target a few
  seconds to interactive on the oldest supported model). Defer catalog
  fetches, heavy JS, and analytics init until after first paint.
