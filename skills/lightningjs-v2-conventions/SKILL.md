---
name: lightningjs-v2-conventions
description: Conventions, patterns, and gotchas for building TV/OTT apps with LightningJS Core v2 (@lightningjs/core, the rdkcentral/Lightning renderer) in TypeScript or JavaScript. Use this any time the user is writing, reviewing, reading, or debugging a Lightning v2 Component, Template, focus/remote-control handling, texture, signal, state, or TypeScript Template Spec — even if they don't say "LightningJS" explicitly, e.g. "add a settings menu to this TV app," "why isn't focus moving to my list," "type this component's template," "make this button react to Enter." Also use when the user asks to scaffold a new Lightning Component, convert a JS Lightning component to TypeScript, or explain why generated code looks like React/DOM instead of Lightning. Do NOT use for Lightning 3 / Blits (single-file-component syntax, reactive state, `Blits.Component`) — that's a different framework with its own skill.
---

# LightningJS v2 Conventions

LightningJS is a WebGL-rendered TV/OTT app framework. There is no DOM, no
CSS, and no React-style reconciliation — everything below exists because of
that. The single most common failure mode when an LLM (or a developer new to
Lightning) writes Lightning code is importing mental models from web/React
development where they don't apply. Watch for and avoid:

- Suggesting CSS, `<div>`s, or DOM APIs — Lightning renders to `<canvas>`
  only; layout is done via `x`/`y`/`w`/`h`, optional Flexbox, and textures.
- Assuming re-renders happen automatically on state change like React —
  Lightning components mutate the render tree directly (`this.x = 10`,
  `this.patch({...})`); there's no virtual DOM diffing.
- Forgetting that **focus** — not DOM focus, but Lightning's own concept —
  drives all key/remote input, and must be explicitly delegated.
- Treating `_init()` like a constructor — Lightning has ~12 distinct
  lifecycle events, and picking the wrong one is a common source of bugs.

This skill covers Lightning **Core v2** (`@lightningjs/core`, developed at
`rdkcentral/Lightning`, formerly `wpe-lightning`). It is not applicable to
Lightning 3 / Blits.

## How to use this skill

Read the reference file(s) that match the task before writing code. Don't
load all of them for a trivial change — pick the ones relevant to what's
being touched:

| Task involves... | Read |
|---|---|
| Creating/structuring a Component, its Template, lifecycle events | `references/components-and-templates.md` |
| Remote control keys, focus delegation, `_getFocused`, `_handle*` | `references/focus-and-input.md` |
| TypeScript: Template Specs, Type Configs, typing an existing JS component | `references/typescript.md` |
| Textures (images, text, rect, gradients), performance of images | `references/textures-and-performance.md` |
| Signals, `fireAncestors`, parent/child communication | `references/communication.md` |
| Component States (`_states()`, `_setState`, nested states) | `references/states.md` |

Each reference file is self-contained with runnable-shape code examples.

## Non-negotiable conventions for generated code

1. **Never invent DOM/CSS syntax.** No `className`, no `style={{...}}`, no
   `<div>`. Lightning templates are plain nested JS/TS objects.
2. **Always use `PascalCase` for child refs** (template keys that represent
   children) and `camelCase` for properties. This isn't just style — it's
   how Lightning's TypeScript Template Specs distinguish properties from
   children (see `references/typescript.md`).
3. **Prefer `getByRef()` over `tag()` in TypeScript** for perf and type
   inference; `tag()` is fine in plain JS or for deep dotted paths.
4. **Every focusable UI needs an explicit `_getFocused()` path.** If a
   component can receive remote input, say so, and show where it sits in
   the app's focus path — don't leave focus delegation implicit.
5. **Match lifecycle event to intent**: initialize data in `_init()`
   (or `_construct()` if it must run before template spawn), react to
   focus in `_focus()`/`_unfocus()`, react to visibility/on-screen changes
   in `_active()`/`_inactive()`, not by piggybacking `_init()` for
   everything.
6. **For TypeScript projects**, default to writing a proper Template Spec
   (`extends Lightning.Component.TemplateSpec`) rather than a Loose one,
   unless the user's existing codebase is predominantly Loose/JS-interop.
7. **Call out performance-sensitive choices** relevant to low-end TV
   hardware when they come up (texture reuse, avoiding per-frame
   allocations in animations, avoiding unnecessary Flexbox on
   frequently-resizing containers) — see `references/textures-and-performance.md`.

## What this skill does not cover (yet)

- Lightning SDK-specific concerns (Router/Pages, Metrics, Profile, VideoPlayer)
- Lightning CLI tooling/build config
- Platform-specific packaging (Tizen, webOS, Fire TV, Vizio/SmartCast)
- Lightning 3 / Blits

If the task clearly needs one of these, say so explicitly rather than
guessing — these deserve their own skill files.
