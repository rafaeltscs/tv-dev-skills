# Build target notes (as written by the team)

- "We support modern smart TVs." Our tsconfig targets ES2020 and we use
  optional chaining (`?.`) and nullish coalescing (`??`) freely across the
  codebase, plus a few `Array.prototype.at()` calls and one
  `structuredClone()`.
- Devices we've promised the client: LG 2019+ and Samsung 2019+, plus
  "whatever Comcast ships" (they want it on their X1/Flex boxes too).
- We test in Chrome on the dev laptops and on one LG C9 in the office.
- No polyfills or transpile-down step right now — Babel is in the project
  but the preset is `{ targets: { esmodules: true } }`.
- CI lints and type-checks; there is no device smoke test in CI.
