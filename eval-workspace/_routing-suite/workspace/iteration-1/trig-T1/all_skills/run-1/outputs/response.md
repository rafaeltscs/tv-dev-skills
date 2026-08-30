SKILLS_CONSULTED: lightningjs-v2-conventions, tv-focus-and-navigation

Why: `_getFocused` / `_handleEnter` are Lightning Core v2 focus-path APIs, so `lightningjs-v2-conventions` (and its `references/focus-and-input.md`) is the primary source; `tv-focus-and-navigation` supplies the framework-agnostic focus-tree / capture-vs-bubble model that explains why a returned child still may not be on the active path.

---

## Short answer

In Lightning v2 a child receives key handling only when it sits on the **focus path** — an unbroken `_getFocused()` chain from the `Application` root all the way down to that child — **and** that path has actually been recalculated since your delegation changed. Key events are then dispatched along that path (capture phase top-down, then handle phase bottom-up), so `_handleEnter` on your child fires only if the child is the active leaf of the path, nothing above it captured the key, and the platform OK/Select keycode is mapped to the name `Enter`.

Your `_getFocused()` returning the child is necessary but not sufficient. Walk these, roughly in order of likelihood:

### 1. The path above the parent is broken (most common)

`_getFocused()` on your parent only matters if the parent is itself on the focus path. Every ancestor between the parent and the `Application` must also return the next link:

```
Application._getFocused() -> Page -> ... -> YourParent -> YourChild
```

If any ancestor doesn't implement `_getFocused()`, returns `undefined`, or returns a *different* sibling, the path stops there and your child is never reached. Key handling then bubbles from whatever the real leaf is — often the parent — which is why "pressing OK does nothing on the child": the parent (with no `_handleEnter`) is actually the leaf.

Check it directly: `this.application.focusPath` (array of components in the path) or `child.hasFocus()`. If the child isn't in that array, this is your bug.

### 2. The focus path is stale — you changed delegation without triggering a recalculation

The focus path is recomputed **only** when: a component's state changes, a key is pressed, or `_refocus()` is called explicitly. If you changed what `_getFocused()` returns from outside a key handler — after a list mutation, an async data load, a new index set programmatically, a modal open — the cached path still points at the old target, so `_handleEnter` runs on the old component, not your child.

Fix: call `this._refocus()` right after mutating the index / children / delegation condition.

```js
resetToStart() {
  this.index = 0;
  this._refocus(); // force focus-path recalculation
}
```

(Inside `_handleLeft`/`_handleRight` you usually don't need it — the key press itself recalculates.)

### 3. Something higher is capturing Enter

Before the bottom-up handle phase, Lightning runs a **capture phase top-down** from the App toward the leaf, looking for `_captureEnter()` / `_captureKey()`. If any ancestor has one and it doesn't return `false`, the key is consumed before your child ever sees it. Grep the ancestor chain for `_captureEnter` / `_captureKey` and make sure they `return false` when they don't mean to swallow the key.

### 4. The OK button never becomes an "Enter"

The handle phase searches for `_handle{KeyName}()`. The name has to be `Enter`. Default key map sends keyCode `13` -> `Enter`. If the app passes a custom `options.keys` map (common, because real remotes send platform-specific OK keycodes, not 13) and that map omits the device's OK code, the press falls through to `_handleKey()` and no `_handleEnter` runs *anywhere*. Confirm the actual keycode on-device and map it:

```js
options.keys = { 37:'Left', 39:'Right', 38:'Up', 40:'Down', 13:'Enter', /* + device OK code */ };
```

Quick isolation test: add `_handleKey(e) { console.log(e.keyCode) }` on the child and press OK — if it logs, the child *is* on the path and the problem is purely the key-name mapping (#4); if it doesn't log, the child is not the active leaf (#1/#2/#3).

### 5. The "child" isn't a Lightning.Component

`_getFocused()` can return any tag/ref, but lifecycle and `_handle*` methods only exist on `Lightning.Component` subclasses. If the ref points at a plain template object (a `Rectangle`/`Text` element, or a POJO with an `_handleEnter` key), Lightning won't invoke it. The returned thing must be an actual component instance.

### 6. Method name / signature typos

It's `_handleEnter` (capital E, single leading underscore), defined as a class method on the component — not `handleEnter`, not `_onEnter`, not a template property. Returning `false` from it only affects propagation; it still runs.

## Checklist to wire a child for key handling

- [ ] Unbroken `_getFocused()` chain from `Application` down to the child (verify via `this.application.focusPath` / `child.hasFocus()`).
- [ ] `_refocus()` called after any programmatic change to index/children/delegation condition.
- [ ] No ancestor `_captureEnter`/`_captureKey` swallowing the key (they `return false` unless intentionally consuming).
- [ ] Device OK/Select keycode mapped to `'Enter'` in `options.keys`.
- [ ] The delegated ref is a real `Lightning.Component` instance.
- [ ] Method is exactly `_handleEnter()` on that component's class.
