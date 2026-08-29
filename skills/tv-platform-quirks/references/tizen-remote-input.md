# Tizen Remote Control and Input

The webOS/Tizen split on input is the same idea with two concrete
differences you must code around:

1. **Back is `10009`**, not `461`. (webOS is `461`.)
2. **Most keys are not delivered until you register them** with
   `tizen.tvinputdevice`. On webOS every key just arrives.

Samsung TVs ship with a basic IR remote and the **Samsung Smart Remote**
(a pointer-capable remote with a mic and a limited button set). Your app
must be fully operable with the D-pad; the pointer is additive.

## Key registration

Only these arrive automatically, no registration:

> `ArrowLeft`, `ArrowUp`, `ArrowRight`, `ArrowDown`, `Enter`, `Back`

Everything else (colour buttons, media transport, number keys, `Exit`,
volume/channel where permitted) must be registered at startup or your
`keydown` handler never sees it:

```js
tizen.tvinputdevice.registerKey('MediaPlayPause');
// batch form — one IPC round-trip, register everything you need at once:
tizen.tvinputdevice.registerKeyBatch(
  ['MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward',
   'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
   '0','1','2','3','4','5','6','7','8','9']
);
```

- `registerKeyBatch()` exists from 2016 models; prefer it — per-key
  `registerKey()` at launch measurably slows startup.
- `tizen.tvinputdevice.getSupportedKeys()` → array of
  `{name, code}` for this set. Register from this list; don't assume a
  key exists.
- `tizen.tvinputdevice.unregisterKey(name)` when leaving a screen that
  needed an unusual key.
- Registration state is process-global, not per-page.

## Key codes

Handle `keydown` and branch on **`event.keyCode`** — like webOS,
`event.key` is unreliable for TV remote buttons.

| Button | keyCode | Key name |
|---|---|---|
| Left / Up / Right / Down | 37 / 38 / 39 / 40 | `ArrowLeft` … |
| Enter / OK | 13 | `Enter` |
| Return (Back) | **10009** | `Back` |
| Exit | 10182 | `Exit` |
| Red / Green / Yellow / Blue | 403 / 404 / 405 / 406 | `ColorF0Red` / `ColorF1Green` / `ColorF2Yellow` / `ColorF3Blue` |
| Play | 415 | `MediaPlay` |
| Pause | 19 | `MediaPause` |
| Play/Pause toggle | 10252 | `MediaPlayPause` |
| Stop | 413 | `MediaStop` |
| Rewind | 412 | `MediaRewind` |
| Fast-forward | 417 | `MediaFastForward` |
| Previous / Next track | 10232 / 10233 | `MediaTrackPrevious` / `MediaTrackNext` |
| Record | 416 | `MediaRecord` |
| Volume Up / Down / Mute | 447 / 448 / 449 | `VolumeUp` / `VolumeDown` / `VolumeMute` |
| Channel Up / Down | 427 / 428 | `ChannelUp` / `ChannelDown` |
| Number keys 0–9 | 48–57 | `'0'`…`'9'` |
| Minus (for multi-digit channel) | 189 | `Minus` |
| Info | 457 | `Info` |
| Caption / Subtitle | 10221 | `Caption` |

Volume, channel, `Menu`, `Tools`, `Info`, `Source`, `Guide` etc. are
often intercepted by the platform even if you register them — don't build
core UX on them. **Smart Hub / Home and Power** are always OS-consumed;
your app is simply hidden.

## Return (10009) and Exit (10182)

- On the Smart Remote there is one physical **Back/Exit** button: a short
  press sends `Back` (10009), a long press sends `Exit` (10182).
- **`Back` at a non-root screen** → navigate up one level.
- **`Back` at the app root** → call
  `tizen.application.getCurrentApplication().exit()`. Certification fails
  an app that traps the user at the root or where Back dead-ends / skips
  levels.
- **`Exit`** (long-press) → exit immediately, saving state first.
- Tizen does **not** wire Back to browser history the way webOS does by
  default — you own the navigation stack from the start. There's no
  `disableBackHistoryAPI` equivalent to think about.

## Samsung Smart Remote pointer

- When the pointer is active you get standard `mousemove` / `click` /
  `wheel`; when the user switches to the D-pad the pointer disappears.
- Keep one source of truth for "current focus" and sync it to pointer
  hover, so D-pad navigation resumes from where the cursor was.
- Every pointer-reachable action must also be D-pad + Enter reachable. No
  hover-only menus.
- The Smart Remote also has a **microphone / voice** path; voice results
  arrive through Samsung's own APIs, not as key events — out of scope
  here.

See `tv-focus-and-navigation` for the framework-agnostic focus model this
feeds.
