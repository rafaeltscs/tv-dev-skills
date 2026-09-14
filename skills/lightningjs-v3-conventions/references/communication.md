# Communication & Utility Methods

Blits components expose a set of `$`-prefixed instance methods (distinct
from `$`-prefixed *template* references to state/props/computed/methods —
these are called from component code via `this.$methodName(...)`).

## Events (`$emit` / `$listen`)

A lightweight event bus for parent/child, sibling, or cross-tree
communication that doesn't fit the props-down/reactive-state model:

```js
// anywhere
this.$emit('activate')
this.$emit('changeBackground', { img: './bg.jpg' })
this.$emit('changeBackground', { img: './bg.jpg' }, false) // clone the
                                                            // payload instead
                                                            // of passing it
                                                            // by reference
```

```js
// a listener
hooks: {
  ready() {
    this.$listen('activate', () => {
      this.text = 'Active!'
    })
  },
}
```

- `$unlisten(name)` removes one listener; `$clearListeners()` removes all
  of a component's listeners at once.
- Listeners registered with `$listen` are automatically cleaned up when
  the component is destroyed — you don't need to manually `$unlisten` in
  a `destroy` hook purely for cleanup purposes, only if you need to stop
  listening earlier than that.

Prefer `props`/reactive `state` for straightforward parent→child or
child→parent-via-computed data flow; reach for `$emit`/`$listen` when the
communicating components aren't in a direct ancestor/descendant
relationship, or when you want a fire-and-forget signal rather than a
value binding.

## Selection & focus

Covered in full in `input-and-focus.md`:

- `$select(ref)` — look up a child by its template `ref` attribute.
- `$focus([event])` / `$input(event)` — move focus / forward a key event.
- `$hasFocus` / `$isHovered` — reactive booleans.

## Forcing reactivity

- `$trigger(stateName)` — re-runs watchers/computed dependents of
  `stateName` without changing its value. See `reactive-state.md`.

## Timers

Wrappers around the native timer APIs that auto-clear when the component
is destroyed, so a background timer can't fire against (or leak) a
component that no longer exists — a common source of bugs when porting
plain `setTimeout`/`setInterval` habits into a component-lifecycle world:

```js
this.$setTimeout(() => { /* ... */ }, 1000)
this.$clearTimeout(id)
this.$clearTimeouts() // all timeouts on this component

this.$setInterval(() => { /* ... */ }, 1000)
this.$clearInterval(id)
this.$clearIntervals() // all intervals on this component
```

## Debouncing

Name-based, so calling `$debounce` again with the same name replaces the
pending call rather than stacking a second one:

```js
this.$debounce('search', () => this.runSearch(this.query), 300)
this.$clearDebounce('search')
this.$clearDebounces() // all debounces on this component
```

Use this for anything triggered by rapid repeated input (e.g. remote
d-pad repeat-fire on a search field or a fast-scrolling rail) rather than
hand-rolling a `setTimeout`-based debounce.
