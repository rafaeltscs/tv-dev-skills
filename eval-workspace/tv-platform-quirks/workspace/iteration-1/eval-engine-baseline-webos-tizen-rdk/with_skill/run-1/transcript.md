# Transcript — engine-baseline reality check (with skill)

## Reference files read

- `skills/tv-platform-quirks/SKILL.md` — routing + the 8 non-negotiable
  conventions. Convention 1 ("pick an engine baseline, map OS version to Chromium
  number, RDK is WebKit not Chromium, never test desktop Chrome alone") is the
  spine of this answer.
- `references/webos-runtime-and-web-engine.md` — webOS Chromium-per-release table
  (4.x=CR53, 5.x=CR68, 6.x=CR79, 22=CR87, 23=CR94, 24=CR108); explicit callout
  that webOS 5.x still lacks optional chaining (CR80) and 6.x is first "modern JS".
- `references/tizen-runtime-and-web-engine.md` — Tizen Chromium-per-release table
  (5.0=M63, 5.5=M69, 6.0=M76, 6.5=M85, 7.0=M94, 8.0=M108); callout that 6.0 still
  has no `?.`/`??`, 6.5 adds them.
- `references/comcast-rdk.md` — RDK is WPE WebKit not Chromium; check Safari/WebKit
  column; no version table, engine "often years old"; transpile down + test on
  operator box; no universal emulator; Mock Firebolt; Lifecycle + GPU release on
  `suspended`; per-operator two-layer cert.
- Input: `eval-workspace/.../files/engine-baseline.md` — team's build notes
  (ES2020 tsconfig, `?.`/`??`/`.at()`/`structuredClone()` used freely, LG+Samsung
  2019+, Comcast X1/Flex, test = desktop Chrome + one LG C9, Babel preset
  `{ targets: { esmodules: true } }`, no polyfills, CI lint/typecheck only).

## Key reasoning

- Feature landing versions: `?.`/`??` = CR80 / Safari 13.1; `Array.prototype.at()`
  = CR92 / Safari 15.4; `structuredClone()` = CR98 / Safari 15.4.
- Mapped each against the skill's per-release tables:
  - LG "2019+" starts at webOS 4.5 = CR53. `.at()` breaks through webOS 22
    (2022, CR87); `structuredClone` breaks through webOS 23 (2023, CR94).
  - Samsung "2019+" starts at Tizen 5.0 = M63. `.at()` breaks through Tizen 6.5
    (2022, M85); `structuredClone` breaks through Tizen 7.0 (2023, M94).
  - RDK = WPE WebKit; `.at()`/`structuredClone` are Safari 15.4, so assume broken
    on fielded X1/Flex until Comcast confirms the WPE version.
- The office LG C9 = 2019 / webOS 4.5 / CR53 — their one test device is the
  worst-case LG engine, yet `.at()`/`structuredClone` calls would throw there.
- Babel nuance: `esmodules: true` resolves to a browser set below the `?.`
  threshold, so `@babel/preset-env` (if actually wired in) *does* lower `?.`/`??`
  syntax — but with no `useBuiltIns`/`corejs` it injects zero runtime polyfills,
  so `.at()`/`structuredClone()` still ship raw. Also preset-env skips
  `node_modules` by default → a dep shipping `?.` can still syntax-error the
  bundle. Flagged "confirm preset-env is actually in the pipeline" as step 0.
- Recommendations follow conventions 1 and 8: explicit baselines in browserslist,
  `useBuiltIns: usage` + corejs3, transpile deps, `es-check`/`eslint-plugin-compat`
  guards, real-device + simulator/emulator + Mock Firebolt testing, RDK Firebolt
  lifecycle/cert track called out separately, and reset the "2019+" promise
  (real floor today is 2024+ on both LG and Samsung).
