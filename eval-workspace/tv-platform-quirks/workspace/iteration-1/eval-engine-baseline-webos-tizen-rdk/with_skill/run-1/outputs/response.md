# Reality check: browser-support assumptions vs. LG 2019+, Samsung 2019+, Comcast X1/Flex

Short version: "we support modern smart TVs" is not true for the devices you've
promised. Three of the four modern features you use freely are missing on most of
the LG and Samsung fleet you're targeting, and RDK is a different engine family
entirely. Your test setup (desktop Chrome + one LG C9) cannot catch any of it.

---

## 1. The features you use, and when each engine actually got them

| Feature | Chromium | Safari/WebKit |
|---|---|---|
| Optional chaining `?.` | 80 | 13.1 |
| Nullish coalescing `??` | 80 | 13.1 |
| `Array.prototype.at()` | 92 | 15.4 |
| `structuredClone()` | 98 | 15.4 |

`?.` and `??` are **syntax**; `.at()` and `structuredClone()` are **runtime APIs**.
That distinction matters for what your build can and can't save you from (section 5).

### Engine baseline per platform release

webOS (LG): 4.x/2018-2019 = Chromium 53 · 5.x/2020 = CR68 · 6.x/2021 = CR79 ·
"22"/2022 = CR87 · 23/2023 = CR94 · 24/2024 = CR108 · 25/2025 = CR120.

Tizen (Samsung): 5.0/2019 = M63 · 5.5/2020 = M69 · 6.0/2021 = M76 · 6.5/2022 = M85 ·
7.0/2023 = M94 · 8.0/2024 = M108.

RDK (Comcast X1/Flex): **WPE WebKit, not Chromium.** No public version-per-release
table; the build on a fielded box is SoC/operator-specific and "often years old."
You must check against the Safari/WebKit column and get the actual version from
Comcast.

---

## 2. LG webOS — "2019+"

"2019" LG sets run webOS 4.5 = Chromium 53. Your office **LG C9 is exactly this**
(2019, webOS 4.5, CR53 — LG never bumps the engine on a shipped panel).

| Feature | Breaks on... | First LG model year that's safe |
|---|---|---|
| `?.` / `??` (native CR80) | webOS 4.x, 5.x, 6.x natively — but see section 5, your build likely lowers these | 2022 ("22", CR87) natively |
| `Array.prototype.at()` (CR92) | webOS 4.x, 5.x, 6.x, **and 2022 "22" (CR87)** | 2023 (webOS 23, CR94) |
| `structuredClone()` (CR98) | webOS 4.x through **2023 (webOS 23, CR94)** | 2024 (webOS 24, CR108) |

So on the LG side, `structuredClone()` alone excludes essentially **every LG TV
from 2019 through 2023**. `Array.prototype.at()` excludes 2019-2022. On the C9
specifically, any code path that reaches `.at()` or `structuredClone()` throws
(`undefined is not a function` / `structuredClone is not defined`).

---

## 3. Samsung Tizen — "2019+"

"2019" Samsung sets run Tizen 5.0 = Chromium M63. **You have no Samsung test
device at all** — the entire Tizen fleet is currently unverified.

| Feature | Breaks on... | First Samsung model year that's safe |
|---|---|---|
| `?.` / `??` (native M80) | Tizen 5.0, 5.5, 6.0 natively (6.5/2022 adds them) — but see section 5 | 2022 (Tizen 6.5, M85) natively |
| `Array.prototype.at()` (M92) | Tizen 5.0, 5.5, 6.0, **and 6.5 (M85)** | 2023 (Tizen 7.0, M94) |
| `structuredClone()` (M98) | Tizen 5.0 through **2023 (Tizen 7.0, M94)** | 2024 (Tizen 8.0, M108) |

Same shape as LG: `structuredClone()` excludes 2019-2023 Samsungs, `.at()`
excludes 2019-2022.

Note also Tizen-specific things you'll hit the moment you test on a real Samsung
(not engine-baseline, but they'll bite): non-arrow/non-Enter/non-Back keys
(colour, media, number) are silent until `tizen.tvinputdevice.registerKeyBatch()`
at startup; `webapis.*` needs `<script src="$WEBAPIS/webapis/webapis.js">` before
app code; Back is keyCode `10009`, not `461`.

---

## 4. Comcast / RDK (X1 / Flex)

- **Different engine: WPE WebKit, not Chromium.** `caniuse`-by-Chrome reasoning
  does not transfer. Use the Safari/WebKit column and feature-detect.
- `Array.prototype.at()` and `structuredClone()` both landed in **Safari 15.4
  (early 2022)**. WPE builds on fielded X1/Flex boxes are typically older than
  that, so assume **both break across the board** on RDK until Comcast tells you
  the exact WPE version.
- `?.` / `??` landed in Safari 13.1. Older WPE builds may lack them natively — so
  your build lowering them (section 5) is what protects RDK here, if it's actually
  happening.
- There is **no universal RDK emulator**. You test on Comcast's actual dev box
  (they provide units) plus **Mock Firebolt** for lifecycle. You currently have
  neither.
- Beyond browser support, shipping on X1 also requires: the Firebolt `Lifecycle`
  state machine wired up (`ready()`, `close(reason)`, `finished()`), **GPU/EGL
  surface + texture release on the `suspended` transition** (block it and the
  platform kills you first via MemCR), capabilities declared in the Firebolt App
  Manifest and granted by Comcast, DRM (Widevine L1) confirmed per SoC, the remote
  key map verified (Back is not guaranteed to be `461`/`10009`), and a
  **two-layer, per-operator certification** (Firebolt conformance + Comcast's
  premium-app pass — the slow one). "Ships on Comcast" also won't mean "ships on
  Sky/Charter/Cox" — each operator is its own ingestion and cert.

---

## 5. Why your test setup hides all of this — and the Babel subtlety

**Desktop Chrome** is evergreen (CR120+). Every feature above works there. It is a
guaranteed false green and tells you nothing about the field.

**The LG C9** is a genuinely useful worst-case *engine* for LG (CR53) — but it's
one data point, it says nothing about Tizen or WPE WebKit, and if the app
currently appears to "work" on it, that's itself a clue worth chasing (see below).

**Your Babel config is doing more than you think — but not enough.**
`{ targets: { esmodules: true } }` resolves to the browsers that support
`<script type=module>` (roughly Chrome 61+, Safari 11+, Edge 16+). That set is
*below* the optional-chaining threshold, so if `@babel/preset-env` is actually in
your build pipeline, **it is lowering `?.` and `??`** to ES2017-compatible output.
That's probably why the C9 isn't white-screening.

But:
- `useBuiltIns` is not set and there's no `corejs` entry, so **no runtime
  polyfills are injected**. `Array.prototype.at()` and `structuredClone()` are
  runtime APIs — preset-env transpiles syntax, it does not shim these. They ship
  as-is and throw on every engine below CR92 / CR98 (and old WPE).
- preset-env by default **does not process `node_modules`**. Modern dependencies
  increasingly publish `?.` in their built output. Any such dependency reaches the
  device untranspiled and **syntax-errors the whole bundle → white screen** on
  webOS 4.x/5.x/6.x, Tizen ≤ 6.0, and older WPE.
- If preset-env is *not* actually wired in (Babel "in the project" can just be a
  leftover dep, or Jest-only), then `?.`/`??` are also shipping raw and the app
  hard-fails to parse on the same engines. **Confirm which of these is true
  first** — it's the difference between "some calls throw" and "nothing renders."

---

## 6. What to actually do

**Before you promise the client anything:**

1. **Pick explicit baselines and write them down.** e.g. webOS 4.5 (CR53) /
   Tizen 5.0 (M63) / a conservative WPE WebKit for RDK (get the real number from
   Comcast). Put those in `browserslist` and drive `@babel/preset-env` from them
   instead of `esmodules: true`.
2. **Turn on runtime polyfills.** `@babel/preset-env` with
   `useBuiltIns: "usage"` + `corejs: 3`. That covers `Array.prototype.at()` and
   many others automatically. `structuredClone` — add a polyfill (core-js has one)
   or stop using it: replace with a small deep-clone util, or
   `JSON.parse(JSON.stringify(x))` where you don't need structured-clone semantics.
3. **Transpile the offending dependencies.** Don't blanket-exclude `node_modules`
   — add modern deps to Babel's include path, or use a bundler config that lowers
   dependency syntax. Add `es-check` (or similar) against ES2017 on the final
   bundle in CI so untranspiled `?.` can't ship.
4. **Add real-device testing.** Minimum: one 2019 Samsung (Tizen 5.0) and the
   LG C9 you already have; request a Comcast X1/Flex dev box. Use the webOS
   Simulator and Tizen Emulator images pinned to the baseline versions for a
   pre-merge smoke check; Mock Firebolt for RDK lifecycle. Keep the oldest target
   in every regression pass.
5. **Add a compile-time guard.** `eslint-plugin-compat` pointed at the declared
   `browserslist` so a newer API (the next `structuredClone`) can't slip in
   silently. Lint + type-check in CI is not a substitute for this.
6. **RDK track, separately.** Confirm with Comcast: WPE WebKit version on fielded
   X1/Flex, remote key map (Back code), granted Firebolt capabilities, DRM level,
   App Manifest schema, and their certification checklist/cadence. Implement the
   Firebolt Lifecycle + GPU-release-on-`suspended` contract. Treat every other
   operator as a fresh cert.
7. **Reset the client expectation.** As the code stands today, `structuredClone()`
   alone means the real floor is **LG 2024+ and Samsung 2024+**, plus RDK broken.
   Either (a) raise the floor you promise, or (b) do items 1-3 so "2019+" becomes
   actually true — and don't sign off on "2019+" until a 2019 Samsung and the
   2019 LG C9 have run the real build with the real code paths exercised.
