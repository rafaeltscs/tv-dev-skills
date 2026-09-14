---
name: lightningjs-v3-conventions
description: Conventions, patterns, and gotchas for building TV/OTT apps with LightningJS 3 / Blits (@lightningjs/blits) in TypeScript or JavaScript — the single-file-component config object (`Blits.Component`/`Blits.Application`), its XML-style `template` string, built-in reactivity (`state`, `props`, `computed`, `watch`), remote-control `input` handling and the focus chain, the `<Layout>`/`<Text>` built-ins, `.transition` animations, and the built-in router. Use this any time the user is writing, reviewing, reading, or debugging a Blits component, template, reactive state, focus/remote-control input, transition, or route — even if they don't say "Blits" explicitly, e.g. "add a settings page to this Lightning 3 app," "why doesn't my UI update when this state changes," "add a poster rail with the built-in Layout," "make this row react to Enter." Also use when asked to scaffold a new Blits component or explain why generated code looks like Vue/React/DOM instead of Blits. Do NOT use for Lightning Core v2 (`@lightningjs/core`, `static _template()`, `lng.Component`, manual `patch()`) — that's a different framework with its own skill, `lightningjs-v2-conventions`.
---

# LightningJS 3 / Blits Conventions

Blits is the official application framework for Lightning 3 — a
single-file-component model (one config object per component, passed to
`Blits.Component()`) with an XML-style template string and reactivity
built in. It is **not** a new version of Lightning Core v2's API; it's a
different framework built on a different renderer, with a different
authoring model, different reactivity, and different lifecycle hooks. The
two frameworks happen to share a marketing name ("LightningJS") and that is
the single biggest source of confusion when generating code for either one:

- Don't write v2 syntax here: no `static _template()`, no `lng.Component`,
  no manual `this.patch({...})` to force a re-render. Blits re-renders
  automatically when a referenced state/prop/computed value changes.
- Don't invent Vue/React/DOM syntax either, despite the template
  *looking* like markup: no `v-if`/`v-for` (Blits uses `:show`/`:for`), no
  JSX, no `className`, no real DOM elements underneath — it still compiles
  down to the Lightning 3 renderer's scene graph.
- Templates are **strings**, not JS objects — there is no v2-style
  Template Spec typing the render tree; see `references/typescript.md`
  for what TypeScript does and doesn't check here.
- Flexbox does not exist in Blits — layout flow goes through the built-in
  `<Layout>` component instead; see `references/layout-and-text.md`.
- Focus is still a single-owner chain like v2, but the API is entirely
  different (`$focus()`/`$input()`/`this.$parent`, not `_getFocused()`).

## How to use this skill

Read the reference file(s) that match the task before writing code. Don't
load all of them for a trivial change — pick the ones relevant to what's
being touched:

| Task involves... | Read |
|---|---|
| Creating/structuring a component, template syntax (`$`/`:` attributes, `:for`/`:range`, `:show`, `is`), the Application root, file layout | `references/components-and-templates.md` |
| `state`, `props`, `computed`, `watch`, `$trigger` | `references/reactive-state.md` |
| Remote input (`input` key), focus delegation, `$focus`/`$input`/`$select`, key bubbling, `Blits.Application`'s `input.intercept()` | `references/input-and-focus.md` |
| The `<Layout>` built-in, `<Text>` styling/fonts, the `@loaded` event | `references/layout-and-text.md` |
| `.transition` modifiers, easing, transition hooks | `references/transitions.md` |
| Multi-page apps, `<RouterView>`, route params, `this.$router` | `references/routing.md` |
| `$emit`/`$listen` events, `$setTimeout`/`$debounce` utility methods | `references/communication.md` |
| TypeScript: what's typed vs. not, plugin type augmentation | `references/typescript.md` |

Each reference file is self-contained with runnable-shape code examples.

## Non-negotiable conventions for generated code

1. **Never write Lightning Core v2 syntax in a Blits file.** No
   `static _template()`, no `lng.Component`, no `this.patch({...})`. If
   the codebase actually uses v2, that's `lightningjs-v2-conventions`, not
   this skill — don't blend the two APIs in one component.
2. **Get the `$` vs `:` attribute distinction right.** A `$`-prefixed
   attribute reads once at initial render; a `:`-prefixed one is reactive
   and re-renders on change. Using `$` where `:` was needed is the most
   common Blits bug shape — the UI renders once, then silently stops
   updating.
3. **Never manually trigger a re-render.** Assigning `this.someState = x`
   is enough; there's no `patch()`/`forceUpdate()` equivalent to reach
   for. If something isn't updating, the fix is almost always the `$`/`:`
   distinction above, not a missing manual refresh call.
4. **Keep `computed` pure; put side effects in `watch`.** A `computed`
   that assigns to `state` risks a reactive loop and is the wrong tool
   regardless — see `references/reactive-state.md`.
5. **Treat `props` as read-only in the receiving component.** Derive
   transformed values via `computed`, don't assign back into a prop.
6. **Every focusable component needs an explicit path to get focus and a
   handler for the keys it cares about.** Blits has no automatic tab
   order — if nothing calls `$focus()` on a component, it never receives
   input. Say where in the app's focus chain a new focusable component
   sits, don't leave it implicit.
7. **No Flexbox.** Reach for the built-in `<Layout>` component for flow
   positioning (rails, menus, forms); use absolute `x`/`y` for anything
   that resizes every frame. See `references/layout-and-text.md`.
8. **State function, not an arrow function.** `state() { return {...} }`
   — an arrow function loses the `this` binding Blits relies on.
9. **Call out where TypeScript can't help.** The `template` string isn't
   type-checked — a typo'd `ref` or reactive attribute fails at runtime,
   not compile time. Don't imply v2-style Template Spec safety exists
   here; see `references/typescript.md`.

## What this skill does not cover (yet)

- Blits plugins (Global App State, Language, Theme) beyond the minimal
  type-augmentation pattern in `references/typescript.md`
- Lightning 3's underlying renderer APIs used directly, bypassing Blits
- Blits CLI/build tooling (`npm create @lightningjs/app`, dev server config)
- Lightning Core v2 — see `lightningjs-v2-conventions`
- Framework-agnostic performance budgets and rules (texture memory math,
  GC/allocation discipline, image sizing, virtualization) — see
  `tv-performance-constraints`; this skill covers only the Blits-specific
  mechanic for list virtualization (`:range`, in
  `references/components-and-templates.md`)
- Framework-agnostic focus/navigation UX patterns (rails, grids, modals,
  spatial resolution) — see `tv-focus-and-navigation`; this skill covers
  only the Blits focus APIs (`references/input-and-focus.md`)

If the task clearly needs one of these, say so explicitly rather than
guessing — these deserve their own skill files or a follow-up expansion of
this one.
