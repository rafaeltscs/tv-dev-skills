# Transcript — eval-back-key-wrong-fix-eventkey (with_skill, run-1)

## Task

Developer believes Back works on LG but not Samsung because "Samsung's
remote reports a different `event.key` string for Back than webOS does,"
and wants the Tizen `event.key` value for Back to add to their `switch`.
Also reports red/green quick-filter buttons work on LG, do nothing on
Samsung — assumes the same `event.key` mismatch.

Input reviewed: `eval-workspace/tv-platform-quirks/evals/files/remote-input.js`

## Skill + reference files read

- `skills/tv-platform-quirks/SKILL.md`
  - Non-negotiable rule 4: branch on `event.keyCode`, never `event.key`;
    Back = 461 webOS, 10009 Tizen.
  - Non-negotiable rule 5: Back/exit contract — up one level, never
    dead-end, exit at root.
  - Must-know: "Tizen — register your keys." Only arrows/Enter/Back
    arrive automatically; colour/media/number keys silent until
    `tizen.tvinputdevice.registerKeyBatch([...])`. "webOS delivers all
    keys with no registration."
  - Must-know: "webOS — Back wired to browser history by default"; opt
    out with `disableBackHistoryAPI`.
- `skills/tv-platform-quirks/references/tizen-remote-input.md`
  - Back = 10009 (key name `Back`); Exit = 10182 (long-press).
  - Colour keys: 403/404/405/406, names `ColorF0Red`/`ColorF1Green`/…
  - Only `ArrowLeft/Up/Right/Down`, `Enter`, `Back` delivered without
    registration; everything else needs `registerKeyBatch` at startup.
  - `event.key` unreliable for remote buttons — branch on `keyCode`.
  - Tizen does NOT wire Back to browser history; you own the stack from
    the start; at root call
    `tizen.application.getCurrentApplication().exit()`.
- `skills/tv-platform-quirks/references/webos-remote-input.md`
  - Back = 461; `event.key` frequently `"Unidentified"` — `keyCode` is
    the only stable discriminator.
  - Default History-API mode: platform pops history / shows exit popup;
    `disableBackHistoryAPI: true` to receive 461 in your own handler,
    then `webOS.platformBack()` at root.
  - Colour codes 403–406, may differ on older/regional remotes.

## Key reasoning

1. **The premise is wrong.** The bug is not one `event.key` string.
   `event.key` must not be used at all for remote buttons: webOS reports
   `"Unidentified"`, Tizen reports `"Back"` — neither matches the
   existing `case 'Backspace'`. So the current `switch` never handled
   Back on *either* TV.

2. **Why Back "works" on LG:** webOS's default History-API wiring calls
   `history.back()` itself when Back is pressed; the app's JS handler is
   not involved. The `case 'Backspace': history.back()` line is dead code
   on device. Nothing in the shipped code actually handles Back.

3. **Why Back misbehaves on Samsung:** Tizen Back is `keyCode 10009` /
   `key 'Back'` and Tizen does not wire Back to browser history. The
   `switch` never matches → looks dead on deep screens; at the root
   Tizen's default Return exits the whole app → "exits the whole app on
   others." Fix = handle 10009 (and 461), own a nav stack, exit only at
   root.

4. **Answer to the literal question:** Back on Tizen is `keyCode`
   **10009** (`event.key` would be `"Back"`, but do not branch on it).
   webOS is **461** (`event.key` `"Unidentified"`).

5. **Colour buttons are a different quirk, not a key mismatch.** keyCodes
   403/404 are identical on webOS and Tizen, and the existing code
   already checks `e.keyCode === KEY.RED` correctly. They fail on Samsung
   because Tizen does not deliver colour keys to `keydown` until
   registered at startup via
   `tizen.tvinputdevice.registerKeyBatch(['ColorF0Red','ColorF1Green'])`.
   webOS needs no registration — hence works on LG.

6. **webOS appinfo.json note:** since the revised handler consumes
   `keyCode 461`, set `"disableBackHistoryAPI": true` so 461 reaches the
   handler and there's no double-pop; this lets one owned nav stack serve
   both platforms.

## Changes made to remote-input.js

- Merged the two inconsistent `keydown` listeners into one that branches
  on `event.keyCode` only.
- Back: handle `461` (webOS) + `10009` (Tizen); kept `8` as a commented
  desktop-dev alias. Removed reliance on `event.key`.
- Added `handleBack()` implementing the up-one-level / exit-at-root
  contract with per-platform exit (`tizen…exit()` /
  `webOS.platformBack()`).
- Added guarded `tizen.tvinputdevice.registerKeyBatch(['ColorF0Red',
  'ColorF1Green'])` at startup (no-op on webOS).
- Added `e.preventDefault()` on handled keys.
- Documented the `disableBackHistoryAPI` requirement for webOS in a
  header comment.
