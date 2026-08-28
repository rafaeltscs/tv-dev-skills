# Generic TV UI framework (fixture convention)

The eval fixture files use a small, made-up component framework so the
tests stay framework-agnostic. Conventions:

- `getFocused()` returns the child node that should currently hold focus
  (focus delegation). Returning `undefined` means "the focus path stops
  here."
- `handleUp()` / `handleDown()` / `handleLeft()` / `handleRight()` /
  `handleEnter()` / `handleBack()` are remote-key handlers. They run on the
  focused node first, then bubble to `parent`, then its parent, and so on.
  Return `true` to mark the key handled (stop bubbling); return `false` or
  nothing to let it bubble to the parent.
- `focus()` / `unfocus()` fire when a node enters / leaves the focused
  position — use them for visual state only.
- `this.children` is an array of child nodes; `this.parent` is the parent
  node; `refocus()` asks the framework to recompute the focus path from the
  root.
- `Button` / `Card` are trivial leaf widgets: they hold focus and invoke a
  callback on `handleEnter()`.
