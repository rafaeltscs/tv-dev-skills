# Focus & Remote/Keyboard Input

This is the area where AI-generated Lightning code most often goes wrong,
because there's no DOM focus to lean on. Get this file right before writing
any component that a user is supposed to navigate to with a remote.

## The focus path

Lightning tracks one **active component chain** at a time, called the focus
path: the App itself, plus whichever descendant chain is currently
"focused." It's recomputed by recursively calling `_getFocused()` starting
at the App:

- If a component doesn't implement `_getFocused()` (or it returns
  `undefined`), the focus path stops there — that component is the active
  end of the chain.
- If it returns a child, that child is added to the path and `_getFocused()`
  is called on it too, recursively, until the chain bottoms out.

The focus path is only recalculated when: a component's state changes, a key
is pressed, or `_refocus()` is called explicitly.

## Delegating focus

The idiomatic pattern is to delegate via **Component States** (see
`states.md`), one state per "focus mode":

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

For dynamically generated children (lists, grids, rails), track an index and
delegate to `this.children[this.index]`:

```js
_init() {
  this.index = 0;
}

_handleLeft() {
  if (this.index > 0) this.index--;
}

_handleRight() {
  if (this.index < this.children.length - 1) this.index++;
}

_getFocused() {
  return this.children[this.index];
}

resetToStart() {
  this.index = 0;
  this._refocus(); // force a focus-path recalculation
}
```

**When generating a rail/grid/list component, always include the
`_getFocused()` override and the index bounds-checks** — a list without
either is unnavigable, and it's the single most common broken pattern to
watch for in generated code.

## Reacting to focus changes

`_focus()` / `_unfocus()` fire on a component when it enters/leaves the
active end of the focus path. Use them for visual focus state, not for
business logic:

```js
_focus() {
  this.patch({ smooth: { alpha: 1, scale: 1.1 } });
}

_unfocus() {
  this.patch({ smooth: { alpha: 0.8, scale: 1 } });
}
```

## Key handling

Two handler families, searched in this order when a key is pressed:

1. **Capture phase, top-down**: from the App down toward the focused leaf,
   Lightning looks for `_capture{KeyName}()` or the catch-all
   `_captureKey()`.
2. **Handle phase, bottom-up**: if nothing captured it, Lightning searches
   from the focused leaf back up toward the App for `_handle{KeyName}()` or
   the catch-all `_handleKey()`.

Returning `false` from a handler means "don't stop propagation" — the next
component up (or down, for capture) still gets a chance to handle it.

Default key names: `Left`, `Right`, `Up`, `Down`, `Enter`, `Back`
(`Backspace`), `Exit` (`Escape`). Anything else needs an explicit key map or
falls through to `_handleKey()`.

```js
const options = { stage: { w: 1920, h: 1080 } };
options.keys = {
  38: 'Up', 40: 'Down', 37: 'Left', 39: 'Right', 13: 'Enter',
  83: 'Search', // custom: map keyCode 83 ('s') to a "Search" handler name
};
```

```js
_handleSearch() {
  // fires for the custom "Search" key above
}
```

## Checklist for any new focusable component

- [ ] `_getFocused()` implemented if this component has focusable children
- [ ] Index/selection state bounds-checked in `_handleLeft`/`_handleRight`/etc.
- [ ] `_focus()`/`_unfocus()` give clear visual feedback
- [ ] `_handleEnter()` (or the relevant action key) does the actual action
- [ ] If focus can be lost from outside (e.g. items removed), call
      `_refocus()` after mutating the children/index so the path recalculates
