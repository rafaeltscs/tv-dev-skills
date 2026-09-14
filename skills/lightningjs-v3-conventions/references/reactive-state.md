# Reactive State, Props, Computed & Watch

## Mental model

Blits has reactivity built in: template re-renders, watchers, and computed
properties all fire automatically when a referenced state value, prop, or
computed value changes. You never call anything to trigger a re-render —
just assign the new value. This is the biggest departure from Lightning
Core v2, where nothing re-renders until you call `patch()` or assign a
render-tree property directly; don't carry v2's "I must manually push this
update" instinct into Blits code.

## State

Declared as a `state()` function (a **regular** function — not an arrow
function; arrow functions don't get the right `this` binding here)
returning a plain object:

```js
export default Blits.Component('MyComponent', {
  state() {
    return {
      active: false,
      items: [],
      color: 'tomato',
      style: {
        positions: { x: 100 },
        dimensions: { h: 100 },
      },
    }
  },
})
```

- Each component instance gets its own independent copy of this state.
- Avoid deep nesting where you can — it works, but adds reactivity-tracking
  overhead and makes dot-path watchers (below) more verbose.

Access rules — this `$` vs no-`$` split applies to state, props, and
computed alike:

| Where | How |
|---|---|
| Template | `$`-prefixed: `:color="$color"`, `:x="$style.positions.x"` |
| Component code (hooks/methods/watch) | No prefix, via `this`: `this.active = true`, `this.style.positions.x += 10` |

## Props

Props are how a parent passes data into a child. **Object syntax is
current** — each key is a prop name, its value the default used when the
parent doesn't pass one:

```js
props: {
  position: 1,
  color: 'red',
  index: undefined,
  alpha: 1,
}
```

The older **array syntax** (`props: ['bgColor', 'primaryColor', 'index']`)
still works but is deprecated and loses default-value support — prefer
object syntax in new code, and flag it if you see array syntax being
extended rather than migrated.

Type annotations for tooling/TypeScript use JSDoc directly on the props
object:

```js
props: {
  bgColor: 'red', // inferred as string
  /**
   * @type {number|undefined}
   */
  height: undefined,
}
```

**Props are read-only inside the child.** Don't assign to `this.someProp`
in the component that received it — derive a new value with a `computed`
property instead (below) if you need a transformed version of a prop.

Parent usage looks identical to any other attribute — dynamic (`$`) if the
value never needs to change after mount, reactive (`:`) if it does:

```xml
<Card :title="$movieTitle" />
```

## Computed properties

Pure derivations of state/props, defined under `computed`:

```js
computed: {
  offset() {
    return this.index * 100
  },
  bgColor() {
    return this.focused === true ? 'aqua' : '#ccc'
  },
}
```

- Reference like state: `$offset`/`$bgColor` in templates, `this.offset` in
  code.
- Dependencies (whatever state/prop/computed values are read inside the
  function) are tracked automatically; the computed value recalculates
  whenever any of them changes.
- **Must be pure — no side effects.** Don't assign to `this.someState`
  inside a computed property; besides being the wrong tool, an assignment
  that itself changes a dependency of the same computed property can loop.
  Side-effecting logic belongs in a `watch` handler instead.

## Watchers

Defined under `watch`, keyed by the state/prop/computed name being
observed. The handler receives `(newValue, oldValue)`:

```js
state() {
  return { alpha: 0.2 }
},
watch: {
  alpha(value, oldValue) {
    if (value > oldValue) {
      // side-effecting logic goes here — this is what watch is for,
      // where computed is not
    }
  },
}
```

Nested state can be watched with a dot-path key:

```js
state() {
  return { size: { w: 0, h: 0 } }
},
watch: {
  'size.h'(h) {
    // fires only when size.h changes, not size.w
  },
}
```

Watchers work identically whether the observed name is a state variable, a
prop, or a computed property — the `watch` key doesn't care which.

## Forcing a re-evaluation without changing the value

`this.$trigger('stateName')` fires whatever watchers/computed properties
depend on `stateName` without actually changing it — useful for cases like
"re-run this computed's dependents because the component just regained
focus," where the underlying value didn't change but the derived
UI/behavior should still refresh.

## Cross-reference

For how these reactive attributes drive focus and remote-control input,
see `input-and-focus.md`. For the `$emit`/`$listen` event bus (a separate
mechanism from state reactivity, for parent/child or sibling
communication), see `communication.md`.
