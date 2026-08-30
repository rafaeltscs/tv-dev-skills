SKILLS_CONSULTED: lightningjs-v3-conventions (placeholder — no usable content)

Why: The question is squarely in the intended scope of `lightningjs-v3-conventions` (Lightning 3 / Blits, `Blits.Component`, single-file components), but that skill is an unpopulated placeholder — its `SKILL.md` and `PLANNED.md` contain only scoping notes and explicitly say "not yet written," while `lightningjs-v2-conventions` explicitly excludes Blits and the other three skills are framework-agnostic (focus, performance, platform quirks) and don't touch component typing — so there is no skill content to apply and the answer below is from general knowledge.

---

# Typing a Blits component in TypeScript

## Caveat first

No skill in this plugin currently covers this. The `lightningjs-v3-conventions`
skill is a reserved placeholder with no content, and `lightningjs-v2-conventions`
deliberately does not apply to Blits. The guidance below is general knowledge
about `@lightningjs/blits` and should be checked against the TypeScript page of
the current Blits docs for your installed version — TS support matured across the
1.x line and the exact generic signature has changed over time.

## The mental model

A Blits component is a plain configuration object passed to
`Blits.Component('Name', { ... })` (or `Blits.Application({ ... })` for the root).
There is no class to `implements` and no `.tsx`. You get type safety by:

1. Passing your `Props` and `State` shapes to `Blits.Component` as generic type
   arguments, which types `this` inside every method, hook, computed, and watcher.
2. Keeping the **runtime** `props` array/objects and the `state()` function in
   place — the generics are compile-time only; Blits still needs the runtime
   `props` declaration to know which attributes to reactively bind, and still
   needs `state()` to produce the initial reactive object.

So you declare each field twice in spirit: once as a TS type, once as the runtime
contract. They should mirror each other.

## Props

Runtime, props are declared either as a string array or as an array of validator
objects:

```ts
props: [
  'title',
  {
    key: 'index',
    type: Number,      // Number | String | Boolean | Array | Object
    default: 0,
    required: false,
    // cast: (v) => Number(v)   // optional coercion
  },
]
```

The matching TS type is a normal interface. Optional here should line up with
having a `default` / `required: false` at runtime:

```ts
interface PosterProps {
  title: string
  index: number
}
```

## State

Runtime `state` is a function returning the initial object; type it with an
explicit return annotation so the shape can't drift:

```ts
interface PosterState {
  focused: boolean
  offsetX: number
}

state(): PosterState {
  return {
    focused: false,
    offsetX: 0,
  }
}
```

Only include genuine internal reactive state here. Anything derived belongs in
`computed`; anything passed in belongs in `props`.

## Wiring it together

```ts
import Blits from '@lightningjs/blits'

interface PosterProps {
  title: string
  index: number
}

interface PosterState {
  focused: boolean
  offsetX: number
}

export default Blits.Component<PosterProps, PosterState>('Poster', {
  template: `
    <Element :x="$offsetX" :alpha="$focused ? 1 : 0.5">
      <Text :content="$title" />
    </Element>
  `,
  props: [
    'title',
    { key: 'index', type: Number, default: 0 },
  ],
  state(): PosterState {
    return { focused: false, offsetX: 0 }
  },
  computed: {
    // return types are inferred; annotate if you want them pinned
    label(): string {
      return `${this.index + 1}. ${this.title}`
    },
  },
  hooks: {
    ready() {
      this.offsetX = this.index * 300   // this.index: number, this.offsetX: number
    },
  },
  input: {
    enter() {
      this.focused = !this.focused      // type-checked against PosterState
    },
  },
})
```

Inside `computed`, `methods`, `watch`, `hooks`, and `input` handlers, `this`
exposes props and state as typed members plus your own methods/computed. If your
Blits version's `Blits.Component` takes a single generic (an object type with
`Props` / `State` / `Methods` / `Computed` members) rather than two positional
generics, use that form instead — same idea, check the docs for which your
version expects.

## `.blits` single-file components

If you author `.blits` SFCs (handled by the Blits Vite plugin) rather than `.ts`
files, put `lang="ts"` on the script block and apply exactly the same pattern in
it:

```html
<template>
  <Element :x="$offsetX"><Text :content="$title" /></Element>
</template>

<script lang="ts">
import Blits from '@lightningjs/blits'

interface PosterProps { title: string; index: number }
interface PosterState { focused: boolean; offsetX: number }

export default Blits.Component<PosterProps, PosterState>('Poster', {
  props: ['title', { key: 'index', type: Number, default: 0 }],
  state(): PosterState { return { focused: false, offsetX: 0 } },
})
</script>
```

The template stays a string/markup block and is not type-checked against your
interfaces — only the script config is. That's the main reason to keep `$title` /
`$offsetX` bindings thin and do real logic in typed `computed`/`methods`.

## Practical notes

- Blits ships its own type declarations; make sure you're on a recent
  `@lightningjs/blits` and that your `tsconfig.json` picks them up. The Blits
  create/CLI scaffold (`npx @lightningjs/blits@latest`) has a TypeScript option
  that sets this up correctly — use it as the reference for config.
- Don't try to replace the runtime `props` array or `state()` with types alone;
  both layers are required.
- Prefer explicit return-type annotations on `state()` and on `computed` entries
  so a typo in the returned object is a compile error rather than a silent
  `any`.
- Keep prop optionality, `default`, and `required` consistent between the TS
  interface and the runtime validator objects.
