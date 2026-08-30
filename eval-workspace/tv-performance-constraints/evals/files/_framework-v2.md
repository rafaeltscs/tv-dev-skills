# Generic TV UI framework (fixture convention — v2)

A small made-up component framework so tests stay framework-agnostic.

- A component is a class with a `render()` returning a plain node tree.
  Nodes: `{ type, x, y, w, h, src?, color?, children? }`.
- `type: 'image'` with `src` loads that URL and draws it in the node's box.
- `type: 'rect'` with `color` is a solid fill.
- `mount()` / `unmount()` fire when the component enters / leaves the tree.
- `onScroll(offset)` fires on every scroll step (many times/second while a
  d-pad key is held).
- `raf(cb)` schedules `cb` for the next frame.
- `this.viewport` is `{ w: 1920, h: 1080 }`.
- The renderer keeps a built-in LRU cache of recently used image textures
  and evicts the least-recently-used when it needs room. Whatever
  `render()` returns is realized in full.
