# Transcript — eval-webos6-whitescreen-not-lg-bug (with_skill, run-1)

## Reference files read

1. `skills/tv-platform-quirks/SKILL.md` — skill entrypoint. Non-negotiable
   convention #1 ("Pick an engine baseline and target it, not 'modern
   browsers'") and its explicit mapping: **webOS 6.x = Chromium 79**;
   Tizen 6.0 = CR76 "no optional chaining". Routing table points JS/CSS/web-
   API-per-version questions to `references/webos-runtime-and-web-engine.md`.
2. `skills/tv-platform-quirks/references/webos-runtime-and-web-engine.md` —
   engine-per-OS table and the "what the freeze means" section.
   Load-bearing facts:
   - webOS 6.x (2021) = **Chromium 79**; webOS 22 (2022) = CR87; webOS 23
     (2023) = CR94; webOS 24 = CR108.
   - Explicit statement: "webOS 5.x (Chromium 68) ... still no optional
     chaining / nullish coalescing (Chromium 80). webOS 6.x (Chromium 79)
     is the first that's close to 'just write modern JS.'" — i.e. CR79 is
     *below* the `?.` / `??` line.
   - "Pick a baseline OS version explicitly ... set your transpile target
     and polyfill set to that engine, not to 'modern browsers.'"
   - "Verify on a real device or the matching simulator, never on desktop
     Chrome alone."
3. `skills/tv-platform-quirks/references/webos-lifecycle.md` — read to rule
   lifecycle/suspend out as the cause. Not relevant: a white-screen at
   first load is not a suspend/resume resource-release failure.
4. `eval-workspace/.../evals/files/engine-baseline.md` — team's build notes:
   tsconfig `target: ES2020`; `?.` / `??` used freely; also
   `Array.prototype.at()` and one `structuredClone()`; **no polyfills, no
   transpile-down step**; Babel present but preset is
   `{ targets: { esmodules: true } }`; promised devices LG 2019+, Samsung
   2019+, plus Comcast/RDK X1/Flex; testing only in desktop Chrome + one
   LG C9; CI lints + type-checks, no device smoke test.

## Key reasoning chain

1. **Symptom shape.** White screen = nothing renders = failure *before*
   app code executes. Contrast with a partial render / thrown error mid-
   run. That points to a **parse-time** failure of the main script, not a
   layout or rendering bug.
2. **Version boundary matches exactly.** Fails on 2021 LG, fine on 2022+.
   2021 LG = webOS 6.x = Chromium 79. 2022 = webOS 22 = Chromium 87.
   Optional chaining (`?.`) and nullish coalescing (`??`) shipped in
   **Chromium 80**. CR79 < CR80 → SyntaxError; CR87 ≥ CR80 → parses. The
   boundary is not approximate — it is one Chromium version.
3. **Toolchain produces the untranspiled syntax.** `tsconfig`
   `target: ES2020` → TypeScript treats `?.` / `??` as native and emits
   them verbatim. Babel `targets: { esmodules: true }` is a fixed module-
   support browser list, not an engine floor, and the team confirms "no
   separate transpile-down step." So raw `?.` / `??` reach the shipped
   bundle(s).
4. **Why `<script nomodule>` was a no-op** (three reasons):
   a. webOS 6 / CR79 supports ES modules, so the 2021 set runs the
      `type="module"` bundle and never fetches the `nomodule` fallback.
   b. The fallback bundle is built by the same toolchain with no real
      downleveling → it also contains `?.` / `??`.
   c. A SyntaxError discards the whole script before execution, so no
      in-script `try/catch` / feature-detect / fallback can run. This
      directly explains "we added fallbacks and it made no difference."
5. **Not an LG bug → do not file.** It is a build-configuration defect:
   shipping syntax newer than the chosen (implicit) engine baseline.
6. **Latent runtime issues beyond the parse error** (from the baseline
   notes, cross-checked against the engine table):
   - `Array.prototype.at()` = Chromium 92 → also breaks on webOS 22
     (CR87); OK from webOS 23 (CR94).
   - `structuredClone()` = Chromium 98 → breaks on webOS 6, 22, and 23;
     OK from webOS 24 (CR108).
   These throw at the call site rather than white-screening, but are real
   crashes on the target fleet.
7. **Real baseline is lower than webOS 6.** Promised devices include LG
   2019 (webOS 4.x / CR53), Samsung 2019 (Tizen 5.0 ≈ CR63), and
   Comcast/RDK (WPE **WebKit**, not Chromium — `?.` is Safari 13.1). If
   those stay in scope the transpile target must be ~CR53–63 plus a WebKit
   pass, not CR79. (Skill convention #1 + Tizen/RDK routing notes.)

## Recommendation delivered

- Don't file with LG.
- Set an explicit engine baseline (per skill non-negotiable #1); decide
  whether 2019 devices stay in scope.
- Add `@babel/preset-env` with an explicit `targets`/browserslist run over
  the emitted JS, plus `core-js@3` (for `.at()`) and a `structuredClone`
  polyfill.
- Fastest stopgap: `tsconfig` `target: ES2019` so `tsc` itself downlevels
  `?.` / `??` (still need core-js for the library features).
- Reproduce on a real 2021 set / webOS 6 simulator with Web Inspector to
  confirm the `SyntaxError` on load; grep the prod bundle for literal `?.`
  / `??`.
- Add an oldest-target check (browserslist/lint or device smoke test) to
  CI, which today only lints + type-checks.
