# Components & Templates

## Mental model

A Blits component is a single JS/TS object literal passed to
`Blits.Component(name, config)` — not a class, and not a separate template
file. The `template` key holds an XML-style **string** describing the
render tree; everything else (`state`, `props`, `computed`, `watch`,
`methods`, `hooks`, `input`) configures behavior around it. Blits owns
reactivity: assigning `this.foo = 'bar'` re-renders whatever in the
template depends on `foo`, automatically. There is no `patch()` call, no
manual re-render trigger, and no virtual-DOM diffing to reason about.

This is a different authoring model from Lightning Core v2
(`static _template()` returning a plain object, manual `this.patch({...})`)
— see `lightningjs-v2-conventions` if that's what the codebase actually
uses. Don't blend the two: a `_template()` method, `lng.Component`, or a
manual `patch()` call has no meaning in a Blits file.

## Creating a component

```js
import Blits from '@lightningjs/blits'

export default Blits.Component('Card', {
  template: `
    <Element w="300" h="180" color="#1f1f1f">
      <Text content="$title" size="28" y="140" />
    </Element>
  `,
  props: {
    title: 'Untitled',
  },
})
```

Use it from a parent by importing and registering it in `components`:

```js
import Blits from '@lightningjs/blits'
import Card from './components/Card.js'

export default Blits.Component('Home', {
  components: { Card },
  template: `
    <Element>
      <Card title="$movieTitle" x="40" y="40" />
    </Element>
  `,
  state() {
    return { movieTitle: 'Arrival' }
  },
})
```

Convention: component file names start with a capital letter matching the
component name (`Card.js`, `MenuItem.js`). Reusable components live under
`src/components`; full-screen route components are usually split out into
`src/pages` even though, mechanically, a page is just a regular component.

## The `<Element>` and `<Text>` built-ins

`<Element>` is the base render-tree node (position, size, color, texture).
`<Text>` is a built-in text node — see `layout-and-text.md` for its
attributes and the `<Layout>` built-in for flow positioning. Both are
available in every template with no import.

## Template attribute types — the most important distinction in Blits

Three ways to set an attribute, each behaving differently:

```xml
<Element w="100" h="100" color="#0891b2" />
<!-- hardcoded: never changes -->

<Element w="$width" h="$height" color="$color" />
<!-- dynamic ($-prefix): reads state/prop/computed once, at initial render -->

<Element :w="$changingWidth" :color="$highlight" :x="Math.floor($base / 2)" />
<!-- reactive (:-prefix): re-evaluates and re-renders whenever a referenced
     state/prop/computed value changes; the value can be a small expression -->
```

**The single most common Blits bug pattern**: using a plain `$`-prefixed
attribute where a `:`-prefixed one was needed. The UI renders correctly
once, then silently stops updating when the underlying state changes,
because a dynamic attribute is read exactly once. If an attribute needs to
track a value that changes after mount, it needs the `:` prefix.

## Conditional rendering and lists

```xml
<Element :show="$isActive" />
<!-- truthy/falsey visibility toggle -->

<Tile :for="(item, index) in $items" :key="$item.id" w="200" h="120" />
<!-- one Tile instance per array item; access `item`/`index` in the
     Tile's own template scope -->

<Tile :for="(item, index) in $items" :range="{from: $range, to: $range + 7}" :key="$item.id" />
<!-- render only the [from, to) slice of $items — see
     tv-performance-constraints for the general virtualization rationale;
     this is the Blits-specific mechanic for it. Keep `from: 0` and only
     grow `to` if you want previously-rendered items to stay mounted
     instead of being recreated on scroll-back. -->
```

```xml
<Component is="$activeVariant" />
<!-- dynamically instantiate a component by name from state/props;
     `activeVariant` must resolve to a component registered in `components` -->
```

## `ref` and `$select`

Give an element or component a `ref` attribute to look it up imperatively
(e.g. for focus delegation without a declarative `:show`/`is` path):

```xml
<Element ref="submitButton" w="200" h="60" />
```

```js
methods: {
  focusSubmit() {
    this.$select('submitButton').$focus()
  },
}
```

## The `methods` key

Business logic that doesn't belong inline in a hook or watcher goes in
`methods`. Reference a method from the template with a `$` prefix (for
event-binding attributes like `@loaded`, see `layout-and-text.md`); call it
from component code via `this` with no prefix:

```js
export default Blits.Component('Carousel', {
  template: `<Element><!-- ... --></Element>`,
  state() {
    return { items: [], page: 0 }
  },
  hooks: {
    ready() {
      this.fetchData()
    },
  },
  input: {
    down() {
      this.page++
      this.fetchData()
    },
  },
  methods: {
    async fetchData() {
      this.items = await api.getItems(this.page)
    },
  },
})
```

## Lifecycle hooks

Defined under the `hooks` key, in the order they fire over a component's
life:

| Hook | Fires when | Notes |
|---|---|---|
| `init()` | Instantiation, before render instructions are sent to the renderer | Template elements are **not** yet available |
| `ready()` | Fully initialized and rendered | The usual place for initial data fetching (see example above) |
| `focus()` | Component receives focus | Can fire multiple times over the component's life; `$hasFocus` becomes `true` |
| `unfocus()` | Component loses focus | Can fire multiple times; `$hasFocus` becomes `false` |
| `hover()` / `unhover()` | Pointer enters/leaves (mouse input only) | `$isHovered` tracks this |
| `destroy()` | Component being removed | Cleanup point — though timers/listeners registered via `$setTimeout`/`$listen` etc. already auto-clean, see `communication.md` |

Two renderer-level hooks are also available and fire independently of any
one component's lifecycle: `idle()` (renderer finished a render pass and
went idle — good for non-blocking work like telemetry) and `frameTick(data)`
/ `fpsUpdate(fps)` (per-frame / periodic FPS reporting — expensive to hook
into per component, reserve for real perf instrumentation).

A common bug ported over from v2 habits: doing expensive setup in `init()`
that should wait for `ready()` (template not built yet) or should be
scoped to `focus()`/visibility instead of running unconditionally.

## The Application root

Exactly one component per app is created with `Blits.Application(config)`
instead of `Blits.Component(name, config)` — conventionally `src/App.js`.
It's a regular component under the hood, augmented to own top-level key
handling (see `input-and-focus.md` for `input.intercept()`) and typically
hosts the router's `<RouterView />` placeholder (see `routing.md`). You
can't have more than one.

```js
// src/index.js
import Blits from '@lightningjs/blits'
import App from './App.js'

Blits.Launch(App, 'app', {
  w: 1920,
  h: 1080,
  // fonts, keymap, and other launch settings — see typescript.md and
  // input-and-focus.md for the keymap option
})
```

## Conventional file layout

```
src/
  index.js       # entry point — calls Blits.Launch(App, target, settings)
  App.js         # Blits.Application() — the single root component
  components/    # reusable components, PascalCase filenames
  pages/         # route-level components (mechanically the same as any
                 # other component — split out for clarity, not required)
```

## Not yet covered here

- Plugins (`Global App State`, `Language`, `Theme`) that extend `this`
  with extra reactive namespaces — out of scope for this skill for now.
