# TypeScript

Blits ships its own type declarations (`index.d.ts` in the package) with
generic support for a component's `props`, `state`, `methods`, `computed`,
and `watch`. `Blits.Component()` and `Blits.Application()` are both
generic over those five, and — as with most TS APIs shaped this way — you
don't write the generics out by hand; TypeScript infers them structurally
from the config object literal you pass in:

```ts
import Blits from '@lightningjs/blits'

export default Blits.Component('Card', {
  props: {
    title: 'Untitled',
  },
  state() {
    return { hovered: false }
  },
  computed: {
    borderColor() {
      return this.hovered ? '#fff' : '#333' // `this.hovered` is inferred boolean
    },
  },
})
```

Author components directly as `.ts` files this way — there's no
JS-with-JSDoc requirement to get inference, unlike some comparable
options-object frameworks. JSDoc annotations (`@type {number|undefined}`
on a `props` entry) remain useful in plain `.js` files that don't go
through a TS compiler at all.

## The key gap vs. Lightning Core v2: the template isn't typed

v2's TypeScript story centers on the Template Spec — an interface that
makes the render-tree itself type-checked (child refs, property types,
`getByRef()` inference). Blits' `template` is a plain XML-style **string**,
so there is no equivalent structural check on it: a typo'd `ref`, a
misspelled reactive attribute, or passing a prop name the component
doesn't declare all fail silently at runtime, not at compile time. Type
safety in Blits covers the config object (`state`/`props`/`computed`/
`watch`/`methods` and their mutual references via `this`) but not the
markup. Don't tell someone "TypeScript will catch that" for a
template-string mistake in Blits the way you correctly could in a v2
Template Spec — see `lightningjs-v2-conventions`'s `typescript.md` for
contrast if the codebase actually mixes both frameworks (which itself
should be rare — see that skill's non-negotiables on keeping v2 and Blits
apart).

## Plugin type augmentation

A plugin that adds properties to every component's `this` (e.g. the
Global App State plugin) is typed by hand-writing a `blits.d.ts` at the
project root that augments the module:

```ts
// blits.d.ts
import '@lightningjs/blits'
import { AppStatePlugin } from '@lightningjs/blits/plugins/appstate'

declare module '@lightningjs/blits' {
  interface CustomComponentProperties {
    $appState: AppStatePlugin
  }
}
```

This is opt-in per plugin you actually use — don't add it speculatively
for plugins the project doesn't install.

## Not yet covered here

- Whether/how a Component Config's generics can be constrained explicitly
  for a reusable, subclassable base component (the v2 equivalent problem
  is documented in `lightningjs-v2-conventions/references/typescript.md`'s
  "Subclassable / generic base components" section) — verify current
  Blits capability before assuming parity, since the authoring model
  (object literal vs. class) doesn't map onto that pattern directly.
