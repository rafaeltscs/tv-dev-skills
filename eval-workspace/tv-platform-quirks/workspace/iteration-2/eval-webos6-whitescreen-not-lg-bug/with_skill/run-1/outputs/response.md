# webOS 6 white-screen on 2021 LG TVs

## Short answer

Don't file it with LG. This is not a webOS 6 rendering or layout bug. It's
your build output: you are shipping ES2020 **syntax** (`?.` and `??`) that
the 2021 LG engine cannot *parse*, so the whole bundle is thrown out before
a single line runs — hence a white screen and not a partial render.

The 2022-vs-2021 split is the tell, and it lines up exactly with a Chromium
version boundary:

| LG model year | webOS line | Chromium | `?.` / `??` (needs CR80) |
|---|---|---|---|
| 2021 | webOS 6.x | **Chromium 79** | **not supported — SyntaxError at parse time** |
| 2022 | webOS 22 | Chromium 87 | supported |
| 2023 | webOS 23 | Chromium 94 | supported |

Optional chaining and nullish coalescing shipped in Chromium **80**. webOS
6.x froze at Chromium **79** for the life of those panels. So every 2021 LG
set hits `SyntaxError: Unexpected token '.'` (or `'?'`) the moment it loads
your main script, discards the entire script, and paints nothing. 2022+ sets
are on Chromium 87+, parse the same file fine, and run.

## Why the `<script nomodule>` fallback changed nothing

`module` / `nomodule` selects *which file* loads based on ES-module support.
It does nothing about *which syntax the parser accepts*. Three reasons it was
a no-op here:

1. **webOS 6 (Chromium 79) fully supports ES modules.** The 2021 set loads
   your `<script type="module">` bundle and ignores the `nomodule` one
   entirely. The fallback is never even fetched.
2. **The fallback bundle isn't actually transpiled down.** Your Babel preset
   is `{ targets: { esmodules: true } }`, and there's "no separate
   transpile-down step." `tsconfig` `target: ES2020` tells TypeScript that
   `?.` and `??` are *native* — `tsc` emits them verbatim. So both bundles
   contain raw `?.` / `??`.
3. **A parse error can't be caught.** A SyntaxError rejects the whole script
   before execution, so no `try/catch`, no `if (!window.foo)` feature guard,
   and no `nomodule` fallback inside that script can rescue it. This is why
   "we added fallbacks and it made no difference" — there was nothing for
   them to run against.

## What's actually wrong in the pipeline

- **`tsconfig` `target: ES2020` is not a downlevel target for your oldest
  device.** ES2020 *includes* `?.` and `??`, so TypeScript passes them
  through untouched.
- **Babel `targets: { esmodules: true }` is not an engine floor.** It's a
  fixed "browsers that support `<script type=module>`" list; even where it
  would transform syntax, nothing in your flow guarantees Babel runs over
  the emitted JS, and the effective result is that `?.` / `??` reach the
  bundle.
- **No polyfills.** Even after you fix the syntax, two library features in
  the baseline notes will throw at runtime on these engines:
  - `Array.prototype.at()` — Chromium **92** (breaks on webOS 6 *and* webOS
    22 / CR87; OK from webOS 23 / CR94).
  - `structuredClone()` — Chromium **98** (breaks on webOS 6, 22, *and* 23;
    OK from webOS 24 / CR108).
  These are runtime errors at the call site rather than white-screens, but
  they're latent crashes on exactly the fleet you're trying to support.

## Fix on your side

1. **Set an explicit engine baseline and target *that*, not "modern TVs."**
   Your promised device list (LG 2019+, Samsung 2019+, "whatever Comcast
   ships") actually floors lower than webOS 6:
   - LG 2019 = webOS 4.x = Chromium 53
   - Samsung 2019 = Tizen 5.0 ≈ Chromium 63
   - Comcast/RDK = WPE **WebKit**, not Chromium at all — check the
     WebKit/Safari column; `?.` / `??` there is Safari 13.1 (2020) and older
     RDK images predate it.

   If you truly must keep LG/Samsung 2019, the realistic transpile target is
   roughly **Chromium 53–63** plus a WebKit pass for RDK. If the client will
   accept LG/Samsung **2021+**, target **Chromium 79**. Pick one, write it
   down, and drive the toolchain from it.

2. **Add a real transpile-down + polyfill step over the emitted JS.**
   - `@babel/preset-env` with an explicit `targets` / browserslist for the
     baseline above (e.g. `"chrome >= 79"`, or lower if keeping 2019), run
     over the `tsc`/bundler output — not the `esmodules` shortcut.
   - `core-js@3` at `useBuiltIns: "usage"` (or "entry") matched to the same
     targets, to cover `Array.prototype.at()`.
   - A `structuredClone` polyfill (core-js doesn't ship one — use
     `@ungap/structured-clone` or a small manual one), or stop using it.
   - **Fastest one-line stopgap to stop the white-screen today:** set
     `tsconfig` `target` to `ES2019`. TypeScript will then itself downlevel
     `?.` and `??` to compatible checks. This unblocks parsing on webOS 6;
     you still need core-js for `.at()` and `structuredClone()`.

3. **Verify on the real engine, not desktop Chrome.** Reproduce on a 2021 LG
   set (or the webOS 6 simulator image) with the Web Inspector open — you
   should see the `SyntaxError` on script load, which confirms this
   diagnosis before you change anything. Grep the production bundle for
   literal `?.` and `??`; their presence is the smoking gun.

4. **Add a device smoke test to CI on the oldest supported target.** CI
   currently only lints and type-checks — neither catches "this syntax
   won't parse on Chromium 79." At minimum, add a lint rule / browserslist
   check that fails the build when unsupported syntax reaches the bundle.

## What to tell LG

Nothing to file. If you want to reduce future surprises, the actionable item
is internal: define the engine baseline, transpile and polyfill to it, and
test on that engine in CI.
