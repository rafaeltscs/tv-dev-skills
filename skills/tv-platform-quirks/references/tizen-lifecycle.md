# Tizen App Lifecycle

Like webOS, Tizen *suspends* a backgrounded TV app rather than closing it,
and will terminate a suspended app under memory pressure — "models which
have low memory specifications might not support multitasking" at all, in
which case backgrounding is effectively a kill. The lifecycle events are
your one chance to shed resources and persist state.

## States

| State | Meaning |
|---|---|
| Running | Foreground, visible, JS executing. |
| Paused / Hidden | Backgrounded (user pressed Home, switched app, or went to a TV source). `document.hidden === true`; JS execution is paused; app must have saved state to RAM. |
| Resumed | Back to foreground; restore from the saved state. |
| Terminated | Process gone. Next entry is a cold launch. |

There is no dedicated "about to be killed" callback — the transition to
hidden **is** the warning.

## The signal: `visibilitychange`

```js
document.addEventListener('visibilitychange', function () {
  if (document.hidden) { /* releasing path */ }
  else { /* restoring path */ }
});
```

- Fires on every foreground/background transition.
- **Also fires when the app is exiting** — so the releasing path must be
  safe to run as teardown too.
- On the WebKit-era engines (Tizen 2.x) also check
  `document.webkitVisibilityState` / `webkitHidden`.

There is no `webOSRelaunch` equivalent. A re-launch with new arguments
(e.g. a deep link) arrives through the **Application Control** mechanism:
read `tizen.application.getCurrentApplication().getRequestedAppControl()`
on startup and register an app-control handler for while you're running.

## The releasing path (on `hidden`)

Samsung's guidance is explicit — treat hiding as equivalent to the user
pressing Return out of playback:

1. **Stop media.** `pause()` then `close()` the `AVPlay` instance (or
   clear `<video>` `src` and `load()`); on some models `webapis.avplay
   .suspend()` / `.restore()` is the supported way to keep a prepared
   pipeline across a short background trip — test per target. A suspended
   app holding the decoder is the top termination cause.
2. **Save state to RAM** — current screen, scroll/focus position,
   playhead — because a low-memory set may terminate you with no further
   callback.
3. **Stop everything periodic** — `clearInterval`/`clearTimeout`, cancel
   `requestAnimationFrame`, disconnect observers, pause carousels.
4. **Halt network activity.** Analytics beacons, prefetch, polling.
5. **Drop large rebuildable textures/images.**

## The restoring path (on visible again)

- **Re-verify connectivity** before resuming network work:
  `webapis.network.isConnectedToGateway()`. The network may have changed
  while suspended.
- **Re-validate anything time-sensitive** — login sessions, signed media
  URLs, DRM license/proxy URLs may have expired. Samsung explicitly warns
  against trusting an internal elapsed-time calculation across suspension.
- Rebuild released textures, restart timers/observers.
- Re-init the player from the persisted playhead.
- Handle any pending app-control request (deep link that arrived while
  hidden).

## Exit

- To close from your own code:
  `tizen.application.getCurrentApplication().exit()`.
- To background without exiting:
  `tizen.application.getCurrentApplication().hide()`.
- Pressing **Return (10009)** at the app root should call `exit()` — see
  `tizen-remote-input.md`. Failing to exit from the root (trapping the
  user) is a certification failure.

## Memory

- Treat the set as a low-RAM device (see `tv-performance-constraints`):
  budget tens of MB for all textures, expect the OOM killer to target
  suspended apps first.
- `config.xml` can request background execution
  (`<tizen:setting background-support="enable"/>` /
  `<tizen:app-control>` + the `application.launch` privilege) but this is
  for narrow cases (e.g. audio) and does not exempt you from the memory
  ceiling — an oversized background app is still killed.
- Memory should plateau across browse → background → resume cycles; a
  climb every resume means the releasing path leaks.
