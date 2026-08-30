# Reality check: browser support vs. what you're shipping

Short version: the current assumptions do not hold. If the shipped bundle
really has untranspiled `?.` / `??` in it, it is a blank screen on every
LG and Samsung TV you promised except roughly 2022-and-newer models, and
almost certainly on the Comcast boxes too. `Array.prototype.at()` and
`structuredClone()` fail on essentially the entire promised fleet. Desktop
Chrome plus one LG C9 is not a representative test matrix, and CI lint +
type-check catches none of this.

---

## 1. What engine you're actually targeting

"Modern smart TVs" is the root problem. TV browser engines are frozen at
the Chromium (or WebKit) version that shipped with that year's firmware and
essentially never move. So "2019+" means "Chromium 53-ish and up," not
"whatever Chrome is now."

Approximate baselines (verify the exact numbers against LG's "webOS TV Web
Engine" release notes and Samsung's Tizen release notes before you sign
anything — vendors publish these):

| Model year | LG webOS | Chromium | Samsung Tizen | Chromium |
|---|---|---|---|---|
| 2019 | webOS 4.5 | ~53 | Tizen 5.0 | ~63 |
| 2020 | webOS 5.0 | ~68 | Tizen 5.5 | ~76 |
| 2021 | webOS 6.0 | ~79 | Tizen 6.0 | ~76 |
| 2022 | webOS 22 | ~87 | Tizen 6.5 | ~94 |
| 2023 | webOS 23 | ~94 | Tizen 7.0 | ~108 |

Your office LG C9 is a 2019 set: webOS 4.5, Chromium ~53. That is your
promised floor on the LG side.

**Comcast X1 / Flex is a different animal.** RDK boxes run RDKBrowser built
on **WPE WebKit, not Chromium.** There is no public version table; Comcast
pins the browser build per device class (legacy X1 STBs like XG1v4 / Xi6,
vs. newer XiOne / Flex 4K) and per firmware, and rolls it out on their
schedule. Legacy boxes can be running a WebKit from ~2019-2020 on
RAM/CPU-constrained ARM hardware. You cannot reason about these from a
"Chrome version" — you need the actual target build string and device
list from Comcast's partner/certification program, plus real boxes.

---

## 2. Feature-by-feature: what breaks

Native support thresholds:

| Feature | Chromium | WebKit/Safari |
|---|---|---|
| `?.` optional chaining, `??` nullish coalescing | 80 | 13.1 |
| `&&=` `||=` `??=` logical assignment | 85 | 14 |
| `Array.prototype.at()` (and String/TypedArray `.at`) | 92 | 15.4 |
| `structuredClone()` | 98 | 15.4 |

Mapped onto the promised devices:

| | LG 2019 (Cr~53) | LG 2021 (Cr~79) | Sam 2019 (Cr~63) | Sam 2021 (Cr~76) | Comcast legacy X1 (WPE WebKit) |
|---|---|---|---|---|---|
| `?.` / `??` | FAIL (parse) | FAIL — misses by one version | FAIL | FAIL | FAIL on old builds |
| logical assignment | FAIL | FAIL | FAIL | FAIL | FAIL on old builds |
| `Array.at()` | FAIL (runtime) | FAIL | FAIL | FAIL | FAIL (pre-15.4) |
| `structuredClone()` | FAIL | FAIL | FAIL | FAIL | FAIL (pre-15.4) |

Notes:

- **`?.` / `??` need Chromium 80.** The first LG that has them natively is
  the 2022 lineup; even **webOS 6 / 2021 is Chromium ~79 and misses by a
  single version.** Samsung's first is the 2022 lineup. So "native, no
  transpile" effectively means **2022+ TVs only** — not 2019+.
- **`structuredClone()` needs Chromium 98 / Safari 15.4.** No webOS through
  webOS 23 (Cr ~94) has it. No Tizen before 2023 has it. It is not present
  on any device you promised. Treat it as unavailable, period.
- **`Array.at()` needs Chromium 92 / Safari 15.4.** Same story — nothing
  before 2022 TVs, and not on legacy RDK.

### How each failure actually presents

- **`?.` / `??` / logical assignment are syntax.** An old engine throws a
  **SyntaxError at parse time**, which means the *entire script file fails
  to execute*. One `?.` anywhere in the bundle (yours or a dependency's) =
  white/black screen, no app. This is the catastrophic one.
- **`.at()` / `structuredClone()` are runtime APIs.** You get a
  `TypeError` ("`...at is not a function`" / "`structuredClone is not
  defined`") when that line runs. Depending on where it fires, that's a
  dead feature, a crashed screen, or a white screen if it's on the boot
  path.

---

## 3. Why your build isn't saving you (and why the C9 "passing" is suspicious)

`@babel/preset-env` with `targets: { esmodules: true }` is a trap:

- `esmodules: true` is **not** "no transpilation." It targets browsers that
  support `<script type=module>` — Chrome 61, Firefox 60, Safari 10.1,
  Edge 16. That's a ~2017 baseline. Against that baseline, preset-env
  **will** down-level `?.`, `??`, and logical assignment (given a
  reasonably recent Babel). So *if this Babel pass actually runs over your
  shipped bundle*, your own syntax is probably fine.
- But it **does not polyfill anything**. `.at()` and `structuredClone()`
  are runtime APIs; preset-env does nothing for them without
  `useBuiltIns: 'usage'` + `core-js`. Those ship raw and break.
- Babel **ignores `node_modules` by default.** Plenty of current npm
  packages ship modern syntax untranspiled. One dependency using `?.` =
  parse failure on old TVs even if all your code is clean.
- You said "no transpile-down step right now" — which suggests Babel may
  not even be wired into the real build (common when the bundler is
  Vite/esbuild/tsc and the Babel config is vestigial). If that's the case,
  `?.` / `??` also ship raw and you get white screens.
- **TypeScript with `target: ES2020` emits `?.` and `??` verbatim** (they
  are ES2020) and emits `.at()` calls verbatim. A tsc-only pipeline ships
  everything modern as-is. Also: `.at()` type-checking *passing* implies
  your `lib` includes ES2022 — that's a config smell worth checking,
  because your lib is looser than your real runtime.

**The C9 canary:** if that C9 genuinely runs Chromium ~53 and the current
bundle contains untranspiled `?.`, it would be a blank screen in your
office right now. Since you believe it works, one of these is true: (a)
something *is* transpiling syntax after all, (b) the C9 was updated or
swapped, or (c) "we test on the C9" doesn't mean "we load the production
bundle on it and click through." Resolve this before promising anything —
it's the difference between "polyfill gap" and "nothing runs."

CI note: lint + type-check will never catch engine gaps. You need a
compat lint rule and on-device execution (below).

---

## 4. What to actually do

### Before you promise the client

1. **Write the real support floor into the SOW.** Not "modern smart TVs" —
   name it: "LG webOS 4.5 (2019) and up, Samsung Tizen 5.0 (2019) and up,
   Comcast RDK device classes X / Y / Z on browser build N." Get the
   Comcast list and build from their partner program; you cannot spec what
   you can't name.
2. **Audit the build pipeline.** Determine exactly what transforms the
   shipped bundle. Then set an explicit target — a `browserslist` naming
   the real TV Chromium versions, or simply `chrome >= 53` — instead of
   `esmodules: true`. Make sure it also covers `node_modules` (Babel
   `overrides`/allowlist, or use a bundler-level target like Vite
   `build.target` / esbuild `target` that applies globally).
3. **Grep for what's already in there:** `?.`, `??`, `??=` `&&=` `||=`,
   `.at(`, `structuredClone`, plus other post-2019 APIs (`Object.hasOwn`,
   `String.replaceAll`, `Promise.any`, `Array.prototype.findLast`,
   top-level await, `RegExp` `/d` flag). Do it against the built bundle,
   not just source, so you catch dependencies.
4. **Get real hardware:** LG 2019 (the C9) *and* LG 2021 (the Chromium-79
   near-miss case), Samsung 2019 and Samsung 2021, one legacy Comcast X1
   box, one Comcast XiOne/Flex.

### Fixes

5. **Transpile syntax down to ~ES2017 for the whole bundle including
   deps.** This makes `?.` / `??` / logical assignment safe everywhere.
6. **Add `core-js@3` with `@babel/preset-env` `useBuiltIns: 'usage'`**
   targeting the same baseline. Covers `Array.prototype.at`,
   `Object.hasOwn`, `String.replaceAll`, `Promise.allSettled`, etc.
7. **Drop `structuredClone()` entirely.** It's one call and it's not
   available on anything you promised. Replace with a small deep-clone
   util, or a JSON round-trip if the payload is plain serializable data.
   The userland polyfills (`@ungap/structured-clone`, core-js) work but
   have real gaps (no transferables, partial Error/DOM support) — for a
   single call site it's cleaner to just remove the dependency on it.
8. **`Array.at()`:** polyfill via core-js, or refactor. `arr.at(-1)` →
   `arr[arr.length - 1]`.
9. **Add `eslint-plugin-compat` (+ `browserslist`)** so lint fails when
   code uses syntax/APIs outside the target baseline. This is what stops
   the next `.at()` from shipping.

### Comcast / RDK specifically

10. It's **WPE WebKit**, not Chromium — your caniuse mental model doesn't
    transfer; the bug surface is different (media, CSS, JS engine quirks).
11. Comcast runs a **formal app certification** on their own device fleet.
    Budget a certification cycle plus a fix pass for their oldest boxes.
    Assume the constraint is the oldest fielded box: old WebKit, limited
    RAM, slow JS. `structuredClone` and `.at()` are absent there;
    performance is a separate risk even once syntax parses.
12. Do not promise "X1/Flex" as a blanket — promise the specific device
    classes Comcast confirms and you've tested.

### Testing / CI

13. **On-device smoke test** in CI or as a release gate: launch the built
    app on real devices via `ares-cli` (webOS) and `sdb` (Tizen), scrape
    the console for errors, screenshot the first screen. Desktop Chrome
    catches almost none of the above.
14. Keep the device lab entries above as the permanent regression matrix,
    with LG 2021 (Cr ~79) explicitly included because it's the sharpest
    edge case for `?.`.

---

## 5. One-line answer for the client conversation

You can support LG 2019+, Samsung 2019+, and Comcast RDK — but only with a
proper transpile-and-polyfill build and a real multi-device test lab. The
current "ES2020, no transpile, test on Chrome + one C9" setup would ship a
blank screen to most of that fleet. Add ~1-2 weeks for build/pipeline
work, hardware procurement, and a first pass through LG and Samsung
certification, plus a separate Comcast certification cycle on their
timeline.
