# webOS 6 white-screen: this is your build, not an LG bug

## Short answer

Don't file it with LG. Your bundle is shipping JavaScript syntax that the 2021
sets' browser engine cannot parse. It is fixable entirely on your side with a
real down-level transpile plus a couple of polyfills.

## Why it happens

LG firmware maps to a specific embedded Chromium:

| LG model year | webOS version | Chromium |
|---|---|---|
| 2019 | webOS 4.5 | 68 |
| 2020 | webOS 5.0 | 68 |
| 2021 | webOS 6.0 | 79 |
| 2022 | webOS 22 (7.x) | 94 |
| 2023 | webOS 23 | 108 |
| 2024 | webOS 24 | 120 |

Optional chaining (`?.`) and nullish coalescing (`??`) landed in **Chromium 80**.
webOS 6.0 ships **Chromium 79** — exactly one release short. On the 2021 sets
those operators are a **parse-time `SyntaxError`**, not a runtime error.

A `SyntaxError` in your entry bundle means *none* of that bundle executes: the
framework never mounts, no error boundary fires, nothing paints. That is your
white screen. It also explains why the symptom is a *total* blank rather than
mispositioned or half-drawn UI. A genuine webOS rendering/layout bug would put
*something* on screen; this puts nothing there because zero application JS ran.

`tsconfig` `target: ES2020` is not saving you: at ES2020 these operators are
"supported," so TypeScript **emits `?.` and `??` verbatim**. With no
transpile-down step, nothing else rewrites them either. Your Babel preset
`{ targets: { esmodules: true } }` only asserts "the browser understands
`<script type=module>`" (Chrome 61+); it does not down-level any syntax.

## Why the `<script nomodule>` fallback changed nothing

`nomodule` picks between the module bundle and the classic bundle based on
**ES-module support**, not syntax support. Chromium 79 fully supports ES modules,
so the 2021 sets load your **module** bundle and ignore the `nomodule` one
entirely. That module bundle still contains `?.` / `??`, so it still fails to
parse. And even if the `nomodule` bundle had loaded, without a transpile-down
step it contains the same operators and fails identically. `nomodule` is simply
the wrong lever for this problem.

## Other landmines already in the codebase

From your build notes:

- `Array.prototype.at()` — added in Chromium **92**. Missing on webOS 6 (79)
  *and* webOS 22 (94). Runtime `TypeError`.
- `structuredClone()` — added in Chromium **98**. Missing on webOS 6, webOS 22
  (94), and early webOS 23 builds. Runtime `ReferenceError`.

These are runtime errors, so right now they are masked — the `?.` / `??`
`SyntaxError` kills the bundle before any of this code runs. Once you fix the
syntax, these become your next white screen, including on 2022 sets wherever
those code paths execute. "Runs fine on 2022" today just means you have not hit
them yet.

Also note the range you promised the client is **LG 2019+**, which is webOS 4.5 /
5.0 = **Chromium 68**. Your real compile floor is 68, not 79.

## What to do on your side

1. **Lower the tsconfig target.** Set `"target": "ES2018"` (or `ES2019`). Below
   ES2020, TypeScript itself down-levels `?.`, `??`, and logical-assignment
   (`??=` etc.). This one change fixes the immediate white screen.

2. **Add a real transpile-down step** with `@babel/preset-env` driven by an
   explicit browserslist. `.browserslistrc`:

   ```
   chrome >= 68
   ```

   Replace the `{ targets: { esmodules: true } }` config with
   `{ targets: <browserslist> }` (or let preset-env read `.browserslistrc`).
   Apply it to the bundle that actually loads — your module bundle — not a
   `nomodule` afterthought.

3. **Add polyfills** (`core-js` or targeted shims) for `Array.prototype.at` and
   `structuredClone`, loaded before your app entry. Neither the tsconfig `target`
   change nor Babel syntax transforms add these; they only rewrite syntax, not
   missing APIs.

4. **Drop the `nomodule` split** unless you have another reason for it. It is not
   doing anything on these devices.

5. **Confirm the diagnosis in about a minute.** Enable the webOS web inspector on
   a 2021 set (`ares-inspect`, or the built-in inspector) and reload. You will
   see `SyntaxError: Unexpected token '.'` (or similar) at the top of the main
   bundle and no further execution. That proves parse failure, not layout.

6. **Close the CI gap.** You noted there is no device smoke test. At minimum, add
   a post-build check that the production bundle contains no `?.` / `??` / `??=` /
   `?.[` / `?.(` sequences, or run the built app in a pinned old Chromium
   (headless) and assert it mounts. Lint and type-check will not catch this class
   of bug.

## If you still want to contact LG

You can, but expect it to be closed as "app targets an unsupported engine
version." webOS 6.0 / Chromium 79 is behaving exactly the way that Chromium
version behaves. There is no rendering bug on their end to fix.
