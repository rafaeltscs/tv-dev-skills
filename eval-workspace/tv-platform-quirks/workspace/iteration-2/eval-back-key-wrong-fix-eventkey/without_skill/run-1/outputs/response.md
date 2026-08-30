# Back button + colour buttons on Tizen vs webOS

## Short answer

There is **no reliable `event.key` string for the Back button on Tizen** that you
can just drop into your `switch (e.key)`. Samsung's remote doesn't send you a
different `key` string for Back the way you're picturing it does for webOS - it
sends a **numeric key code**, and `event.key` for that button is not a
standardised value you can depend on across firmware (it tends to come through as
`"Unidentified"`, `"XF86Back"`, or similar, and can change between Tizen
releases). Same story for webOS: the Back button there is a number, not a
meaningful `key` string.

The values you actually want are the **key codes**:

| Button | LG webOS | Samsung Tizen | Dev keyboard |
|---|---|---|---|
| Back / Return | `461` | `10009` | `8` (Backspace) |
| Red | `403` | `403` | - |
| Green | `404` | `404` | - |
| Yellow | `405` | `405` | - |
| Blue | `406` | `406` | - |

So the fix is not "add one more `case` to the `e.key` switch" - it's **switch on
`e.keyCode` instead of `e.key`** and list the numeric codes. Your D-pad and Enter
work on both sets today only because `ArrowLeft/Right/Up/Down` and `Enter` *do*
happen to have stable `event.key` strings; Back and the colour buttons do not,
which is exactly the subset that's broken.

## Why Back "works on LG but not Samsung" with the same code

Your handler only ever matches `e.key === 'Backspace'`. Neither remote sends
that. On **webOS** it still appears to work because when the app doesn't consume
the Back key, webOS runs its own default (a history back, then exit when history
is empty) - so it looks handled. On **Tizen**, an unhandled `10009` gets the
platform default too, but there the default is "background / close the app" -
which is your "exits the whole app on some screens" report. On screens where
something else calls `history.back()` first, you get "does nothing." In both
cases your `switch` never actually fired.

Fix: match the Back codes, and call `e.preventDefault()` so the platform stops
running its own exit behaviour. You still need a guard for "already at the root
screen" - calling `history.back()` with an empty history stack will exit on
Tizen. Handle root-level Back explicitly (show an exit confirm, or call
`tizen.application.getCurrentApplication().exit()` on purpose).

## Why the red/green buttons "do nothing" on Samsung

This one isn't a key-code mismatch at all - your second listener already checks
`e.keyCode === 403 / 404`, which are the right numbers on both platforms.

The difference is **key registration**. On Tizen, only the D-pad, Enter and
Return (`10009`) are delivered to your app by default. The colour buttons (and
media / number keys) are swallowed by the OS until you ask for them with:

```js
tizen.tvinputdevice.registerKey('ColorF0Red');   // 403
tizen.tvinputdevice.registerKey('ColorF1Green');  // 404
tizen.tvinputdevice.registerKey('ColorF2Yellow'); // 405
tizen.tvinputdevice.registerKey('ColorF3Blue');   // 406
```

Do that once at startup. webOS needs no equivalent, which is why the same code
works on LG. After registration the events arrive with the key codes in the
table above and your existing handler logic works.

## Changes made to `remote-input.js`

1. Switched the main handler from `switch (e.key)` to `switch (e.keyCode)` so the
   remote buttons that have no stable `event.key` (Back, colour keys) are handled
   the same way as the ones that do.
2. Added Back codes for all three environments: `461` (webOS), `10009` (Tizen),
   `8` (dev keyboard).
3. Added `e.preventDefault()` on Back so webOS/Tizen don't also run their default
   exit-on-Back, and left a marker where root-screen Back needs its own guard.
4. Register the colour keys on Tizen at startup via
   `tizen.tvinputdevice.registerKey(...)`; guarded so it's a no-op on webOS and
   in desktop Chrome.
5. Folded the two `keydown` listeners into one so ordering / `preventDefault`
   between navigation and filters is predictable.
6. Filled in the `YELLOW` / `BLUE` codes in the `KEY` map for completeness (not
   wired to actions yet).
