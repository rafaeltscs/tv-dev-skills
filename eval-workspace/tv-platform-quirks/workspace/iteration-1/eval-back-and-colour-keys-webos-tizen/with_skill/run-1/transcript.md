# Transcript

## Reference files read

1. `skills/tv-platform-quirks/SKILL.md` — routing + the 8 non-negotiable
   conventions. Relevant: rule 4 (branch on `event.keyCode`, not
   `event.key`; Back = 461 webOS / 10009 Tizen), rule 5 (Back/exit
   contract per platform), and the "Tizen — register your keys"
   must-know.
2. `references/tizen-remote-input.md` — key registration (only
   arrows/Enter/Back auto-delivered; colour/media/number need
   `registerKeyBatch` at startup; `getSupportedKeys`), key-code table
   (Back 10009, colours 403–406), Return-at-root →
   `tizen.application.getCurrentApplication().exit()`, Tizen does not
   wire Back to history.
3. `references/webos-remote-input.md` — key-code table (Back 461,
   colours 403–406), `event.key` = "Unidentified", Back default History
   API mode vs `disableBackHistoryAPI` + `webOS.platformBack()`, all keys
   delivered with no registration.
4. `references/tizen-runtime-and-web-engine.md` — Tizen 6.0 = Chromium
   M76 (no optional chaining / `??`), 6.5 = M85; `tizen.*` namespaces
   need the matching `<tizen:privilege>` in `config.xml`.

## Key reasoning

- Input file branches on `event.key` and sets `BACK: 8` (keyboard
  Backspace). Works in Chrome (real Backspace → `'Backspace'`) and on
  webOS (all keys delivered; History-API Back still does something).
- Samsung symptoms map cleanly to two Tizen quirks:
  - Back = `10009`, never `'Backspace'` → no `case` matches → "does
    nothing"; and with no `preventDefault()` the Tizen platform default
    for Return runs → "exits the whole app".
  - Colour buttons (403/404) are not delivered on Tizen until
    `tizen.tvinputdevice.registerKeyBatch([...])` at startup (+
    `tv.inputdevice` privilege). webOS needs no registration, so the
    same code works on LG.
- Colour key *codes* (403/404) were already correct for both platforms;
  only Tizen registration was missing.
- Recommended structure: detect platform once → shared
  `keyCode→action` map with a per-platform Back entry → Tizen key
  registration at startup → one capture-phase `keydown` listener
  branching on `keyCode`, `preventDefault()` on handled keys →
  app-owned nav stack, exit only at root via
  `tizen.application...exit()` / `webOS.platformBack()`.
- Manifest follow-ups: `appinfo.json` `"disableBackHistoryAPI": true`
  (webOS, so 461 reaches JS); `config.xml` `tv.inputdevice` privilege
  (Tizen). Plus engine-baseline note: no `?.` / `??` on Tizen 6.0 /
  webOS 5–6, transpile to ~CR68.
