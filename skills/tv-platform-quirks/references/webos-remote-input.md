# webOS Remote Control and Input

Input on webOS comes from two devices that behave differently: a plain IR
remote with a D-pad, and the **Magic Remote** — a pointer device with a
gyro cursor and a scroll wheel. Your app must work fully with just the
D-pad; the pointer is additive. LG certification explicitly requires
5-way (D-pad) operability for every screen.

## Key codes

Handle `keydown` and branch on **`event.keyCode`** (or `event.which`).
Do **not** branch on `event.key` — for many remote buttons webOS reports
`key` as `"Unidentified"`, and `keyCode` is the only stable discriminator.

| Button | keyCode |
|---|---|
| Left / Up / Right / Down | 37 / 38 / 39 / 40 |
| OK / Enter (D-pad center) | 13 |
| Back | 461 (0x1CD) |
| Red / Green / Yellow / Blue | 403 / 404 / 405 / 406 |
| Play | 415 |
| Pause | 19 |
| Stop | 413 |
| Rewind | 412 |
| Fast-forward | 417 |
| Number keys 0–9 | 48–57 |

Notes:

- **Home** and **Power** are consumed by the OS — your app is suspended,
  it never sees a keydown.
- **Channel Up/Down**, volume, and the LG-specific launcher buttons are
  also OS-level in the app context; don't design around them.
- Colour-button codes above are for common Magic Remote models; a few
  older/regional remotes differ. If colour buttons are load-bearing in
  your UX, log unknown `keyCode`s in QA on the actual target remotes.
- Key **repeat**: holding a direction fires repeated `keydown`s with no
  reliable `repeat` flag on older engines. Debounce/throttle list
  movement yourself so a held key doesn't overshoot.
- There is no dedicated on-screen keyboard key — a focused `<input>`
  raises the system virtual keyboard; watch `keyboardStateChange`
  (see `webos-lifecycle.md`).

## Back button (461) — behaviour and certification

Back is the most cert-sensitive key on the platform.

**Default (History API mode).** webOS wires Back to browser history. If
you `history.pushState()` on each in-app navigation, Back fires `popstate`
and pops one level. When history is empty (app root) and Back is pressed:

- **webOS 6.0+**: the platform shows an "Exit app?" confirmation popup.
- **webOS 5.0 and earlier**: the app is closed and Home is shown.

**Custom mode.** Set `appinfo.json` `"disableBackHistoryAPI": true` to
receive keyCode 461 directly in your own `keydown` handler and manage the
stack yourself. Then you are responsible for the root behaviour: call
`webOS.platformBack()` (from `webOSTV.js`) to trigger the standard
exit/Home flow, or show your own exit dialog and `window.close()`.

**Certification expectations.** Back must always move the user *up* one
level predictably, must never dead-end, and must reach app exit from the
root. A screen where Back does nothing, or where Back skips levels, is a
common rejection.

## Magic Remote: pointer vs 5-way mode

The remote is in exactly one mode at a time:

- **Pointer mode** — a cursor is on screen. Standard `mouseover`,
  `mousemove`, `mouseout`, `click` fire. The scroll wheel fires `wheel`.
- **5-way mode** — no cursor; only arrow/OK/Back keydowns.

Transitions: pressing any arrow key from pointer mode switches to 5-way;
picking the remote back up / moving it (or shaking) switches back to
pointer. Your app is told via **`cursorStateChange`**
(`e.detail.visibility` Boolean) and `webOSMouse` (`Enter`/`Leave`).

### Consequences for focus handling

- **Keep a single source of truth for "current focus."** When the pointer
  hovers an element, sync your logical focus to it, so that when the user
  switches to 5-way the D-pad continues from where the cursor was — not
  from a stale position.
- **On `cursorStateChange` → hidden**, show your focus ring / highlight
  (5-way just started). On → visible, you may hide the ring since the
  cursor now indicates target; don't lose the logical position.
- **Hover must not be required.** Every action reachable by pointer must
  be reachable by D-pad + OK. No `:hover`-only menus, no pointer-only
  drag.
- **Pointer clicks land on real elements**, so keep hit targets
  reasonably sized and don't stack invisible overlays that swallow
  clicks.
- The **wheel** works in both modes for list/page scroll; support it for
  long content but never make it the only way to move.

See the framework-agnostic focus model in the `tv-focus-and-navigation`
skill; this file only covers what's webOS-specific about the input
sources feeding it.
