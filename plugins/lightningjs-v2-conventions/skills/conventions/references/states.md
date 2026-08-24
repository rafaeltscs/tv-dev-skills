# Component States

States let a component swap out a set of behavior overrides (handlers,
`_getFocused()`, appearance) based on "what mode it's in," without
sprinkling `if (this.mode === ...)` checks through every method.

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

The most common production use of states is focus delegation — see
`focus-and-input.md`. Each state typically overrides `_getFocused()` to
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
