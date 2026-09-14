# Remote Input & Focus

## Mental model

At any moment, exactly one component in a Blits app has focus. Key
presses go to that component's `input` handlers first; if it has no
handler for that key, the event bubbles up the component tree (child →
parent → ... → the `Application` root) until something handles it or it
runs out of ancestors. This is conceptually similar to Lightning Core v2's
focus chain, but the API is entirely different — there's no `_getFocused()`
override or `_handleKey`-style method naming. See
`tv-focus-and-navigation` for the framework-agnostic version of this model
(rails/grids/modals, spatial resolution) — this file covers only the Blits
APIs that implement it.

## Declaring key handlers

```js
export default Blits.Component('MyComponent', {
  input: {
    up(e) {
      // handle up arrow
    },
    down(e) {
      // handle down arrow
    },
    enter(e) {
      // handle OK/enter
    },
    back(e) {
      // handle Back
    },
  },
})
```

Named keys include the directional keys (`up`/`down`/`left`/`right`),
`enter`, `space`, `back`, `escape`, and alphanumeric keys. A catch-all
`any(e)` handler fires for a key press not matched by a more specific
named handler:

```js
input: {
  any(e) {
    // runs for any key not handled by a named function above
  },
}
```

## Default bubbling behavior — and how to override it

A component that handles a key implicitly keeps focus and stops the event
from bubbling further. Three explicit escape hatches change that, all via
`this.$parent`:

```js
input: {
  enter() {
    // move focus to the parent, but do NOT bubble this key event
    this.$parent.$focus()
  },
  back(e) {
    // move focus to the parent AND bubble this event to it
    this.$parent.$focus(e)
  },
  escape(e) {
    // let the parent handle this key, without changing who has focus
    this.$parent.$input(e)
  },
}
```

`$focus()` and `$input()` are general-purpose, not `$parent`-only — call
them on any component/element reference (e.g. one obtained via `$select`,
see `components-and-templates.md`) to move focus or forward a key event
somewhere other than up the immediate ancestor chain.

- **`$focus([event])`** — gives the target component focus; fires its
  `focus` hook and sets its `$hasFocus` to `true`. Pass a `KeyboardEvent`
  to also bubble that event through the newly-focused chain.
- **`$input(event)`** — runs a component's input handling for `event`
  *without* changing which component has focus. Use this when a parent
  needs to react to a key (e.g. a global shortcut) but the child should
  visibly stay focused.
- **`$hasFocus`** — reactive boolean, `true` while the component holds
  focus; drive template state off it directly rather than mirroring it
  into your own `state`.

## Key-up handling

Return a function from a key-down handler to run logic on key release:

```js
input: {
  enter() {
    this.pressed = true
    return () => {
      this.pressed = false // runs when the key is released
    }
  },
}
```

## Intercepting input at the Application root

`Blits.Application` accepts its own `input.intercept()`, which runs on
every key press **before** it reaches whichever component currently has
focus — useful for a global override (e.g. a hardware Back button that
must always exit a modal regardless of focus) or logging:

```js
Blits.Application({
  input: {
    intercept(keyboardEvent) {
      // inspect/modify and return the event to continue normal handling,
      // or swallow it by not returning it
      return keyboardEvent
    },
  },
})
```

`intercept()` can be `async`.

## Remapping keys

The default key-name mapping can be extended or overridden in
`Blits.Launch()`'s settings, keyed by JS `KeyboardEvent.keyCode`:

```js
Blits.Launch(App, 'app', {
  keymap: {
    38: 'down', // remap arrow-up to fire the `down` handler
    40: 'up',
    190: 'dot', // add a custom name for a key with no default mapping
    83: 'search',
  },
})
```

Custom entries merge with (rather than replace) the built-in keymap — use
this for platform remotes that emit non-standard codes, cross-referencing
`tv-platform-quirks` for the actual codes a given platform's remote sends.

## Focusable-component checklist

Every component that can receive focus should have:

1. At least one `input` handler (or `any()`), or it silently swallows
   nothing and bubbles everything — usually not what you want for a
   focusable leaf.
2. An explicit `$focus()` call somewhere that puts focus on it — Blits has
   no automatic "first focusable child" tab order; if nothing calls
   `$focus()`, nothing but the Application root ever has focus.
3. A visual focus state driven by `$hasFocus` (reactive attribute), not a
   manually-tracked `state` boolean duplicating it.
