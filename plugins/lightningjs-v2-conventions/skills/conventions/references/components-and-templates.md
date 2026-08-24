# Components & Templates

## Mental model

A Lightning app is a tree of **Components** and plain render-tree
**Elements**. A `static _template()` method returns a plain nested object
describing that tree: keys starting with an uppercase letter are children
(refs); everything else is a property of the current element. There is no
JSX and no return-based re-render — once the tree exists, you mutate it
directly (`this.x = 100`, `this.patch({...})`, `this.tag('Foo').color = ...`).

## Creating a Component

```js
class MyComponent extends lng.Component {
  static _template() {
    return {
      rect: true,
      w: 200,
      h: 60,
      color: 0xff1f1f1f,
      Label: {
        x: 100, y: 30, mount: 0.5,
        text: { text: '', fontSize: 24 },
      },
    };
  }

  _init() {
    // Runs once the component is first attached. Good place to read
    // constructor-time arguments and set initial derived state.
  }
}
```

Instantiate it as a child in a parent's template by giving it a `type`:

```js
static _template() {
  return {
    MyComponentInstance: {
      type: MyComponent,
      someProp: 'hello', // arbitrary data passed down, read via this.someProp
    },
  };
}
```

Values passed alongside `type` become readable properties on the instance
during `_init()` — this is Lightning's equivalent of "props," but there's no
enforced prop contract in plain JS (TypeScript Template Specs add one — see
`typescript.md`).

## Lifecycle events (use the right one)

Lightning has more lifecycle granularity than most web mental models expect.
Pick based on what you actually need, not habit:

| Event | Fires when | Typical use |
|---|---|---|
| `_construct()` | Instance created, *before* template is spawned | Rarely needed; state that must exist before children exist |
| `_build()` | Instance created, template spawned | Post-processing the freshly built tree |
| `_setup()` | First attached to render tree (top-down) | One-time setup that needs descendants already built |
| `_init()` | First attached | The default "constructor-ish" hook — most component setup goes here |
| `_attach()` / `_detach()` | Attached/detached from render tree (bottom-up) | Subscribing/unsubscribing to external things (timers, event buses) |
| `_firstEnable()` / `_enable()` / `_disable()` | Enabled = attached AND visible AND alpha > 0 | Start/stop animations or polling tied to visibility |
| `_firstActive()` / `_active()` / `_inactive()` | Active = enabled AND actually on-screen | Expensive work you only want while genuinely on-screen (e.g. video decode, live data polling) |

A common bug: doing expensive setup in `_init()` that should really wait for
`_active()`, causing off-screen or backgrounded components to do work they
shouldn't.

## Tags vs refs

Any child keyed with an uppercase name in the template becomes reachable via
`this.tag('ChildName')`, including nested paths: `this.tag('A.B.C')`. In
TypeScript, prefer `this.getByRef('ChildName')` — it's slightly faster and,
crucially, gives you real inferred types from the Template Spec instead of a
loosely-typed tag lookup (see `typescript.md`).

## Patching

`patch()` lets you update multiple properties (including nested children) of
an element/component at once, and is the idiomatic way to apply a batch of
changes — including smooth/animated transitions via the `smooth` key:

```js
this.tag('Card').patch({
  color: 0xffffffff,
  smooth: { alpha: 1, scale: 1.1 },
});
```

Avoid writing many individual property assignments in a row when a single
`patch()` call expresses the same change more clearly and atomically.

## Flexbox (layout)

Lightning has its own Flexbox implementation (`flex` on a container,
`flexItem` on children) — similar to CSS Flexbox but **not** identical:

- Only boolean wrap/no-wrap (no `wrap-reverse`).
- No `order`, no `flex-basis` (behaves like `auto`).
- `alignItems: 'baseline'` is unsupported.
- An element with `visible: false` is excluded from layout; `alpha: 0` still
  takes up space.
- A flex container with unset/zero `w`/`h` sizes to fit its content on that
  axis (both axes, unlike CSS's asymmetric default).

Flexbox is layout-engine work and is comparatively CPU-expensive — reach for
it when composing static-ish UI (menus, forms, rails with stable item
counts), not for things that resize every frame; use absolute positioning
(`x`/`y`) for anything performance-sensitive that changes constantly.

```js
Wrapper: {
  flex: { direction: 'row', padding: 20, wrap: true },
  rect: true,
  Item1: { w: 50, h: 100, flexItem: { margin: 10 }, rect: true },
  Item2: { w: 50, h: 100, flexItem: { margin: 10 }, rect: true },
}
```

After layout, `finalX`/`finalY`/`finalW`/`finalH` hold the computed values
(call `this.stage.update()` first if you need them without a render pass).
