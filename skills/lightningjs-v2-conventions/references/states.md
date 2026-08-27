# Component States

States let a component swap out a set of behavior overrides (handlers,
`_getFocused()`, appearance) based on "what mode it's in," without
sprinkling `if (this.mode === ...)` checks through every method.

## Prefer to avoid this for new components

`_states()` is real, documented API (below), but default to **not** reaching
for it:

- It adds a layer of indirection — state subclasses silently overriding
  methods — that's easy to over-apply for cases a plain `if` or a separate
  method would handle more simply and more traceably.
- It's **v2-only**. Lightning 3 / Blits has no `_states()`/`_setState()`
  equivalent — Blits' "state" is an unrelated concept (a reactive data
  object you mutate directly, similar to Vue's `data()`), not a
  behavior-mode switch ([Blits component state docs](https://lightningjs.io/v3-docs/blits/components/component_state.html)).
  Code built around v2 states doesn't carry any of that structure forward
  if the app ever migrates.

Reach for `_states()` only when a component genuinely has multiple full
behavioral modes (distinct `_handle*` overrides, different `_getFocused()`
targets, different appearance, etc.) that a flat conditional would make
*harder* to read, not simpler. When in doubt, don't.

## Defining states

```js
class MyComponent extends lng.Component {
  static _template() { /* ... */ }

  _handleEnter() {
    // default behavior when no state overrides it
  }

  static _states() {
    return [
      class Browsing extends this {
        _handleEnter() {
          // overrides the root _handleEnter() while in this state
        }
      },
      class Editing extends this {
        _handleEnter() {
          // different override, while in this state
        }
      },
    ];
  }
}
```

Each state class `extends this` — i.e. extends the component class itself —
so it inherits everything and only needs to override what differs for that
state.

## Switching states

```js
this._setState('Editing');
```

## `$enter` / `$exit` hooks

A state class can implement `$enter(event)` / `$exit()` to run logic when
entering/leaving that specific state (e.g. starting/pausing an animation
tied to that mode):

```js
class Editing extends this {
  $enter() {
    this._editAnimation.play();
  }
  $exit() {
    this._editAnimation.pause();
  }
}
```

## States + focus

When states are genuinely justified, the most common production use is
focus delegation — see `focus-and-input.md`. Each state typically overrides
`_getFocused()` to
point at whichever sub-tree should be active while in that mode:

```js
static _states() {
  return [
    class Buttons extends this {
      _getFocused() { return this.tag('Buttons'); }
    },
    class List extends this {
      _getFocused() { return this.tag('List'); }
    },
  ];
}
```

Remember: the focus path is recalculated whenever state changes, so
switching state is often *all* you need to do to move focus — you don't
have to manually call a "focus" method on the target as well.

## Nesting

States can be nested (a state can itself declare further sub-states) for
more complex mode hierarchies — reach for this only when a flat state list
genuinely doesn't express the mode structure; most components need at most
one flat set of states.
