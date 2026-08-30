# Generic TV UI framework (fixture convention)

The eval fixtures use a small, made-up component framework so the tests
stay framework-agnostic (not Lightning, not React).

- A component is a class with a `render()` that returns a plain node tree.
  Nodes are `{ type, x, y, w, h, src?, color?, children? }`.
- `type: 'image'` with a `src` loads that URL into a GPU texture sized to
  the node's `w`/`h` on screen (the texture is decoded at the source
  image's intrinsic pixel size, not the node size).
- `type: 'rect'` with a `color` is a cheap solid fill (no texture upload).
- `mount()` / `unmount()` fire when the component enters / leaves the tree.
- `onScroll(offset)` fires on every scroll step (many times per second
  while a d-pad key is held).
- `raf(cb)` schedules `cb` for the next frame; call it again from inside
  `cb` for a per-frame loop.
- `this.viewport` is `{ w: 1920, h: 1080 }` (the app renders at 1080p even
  on 4K panels).
- There is no automatic windowing/recycling — whatever `render()` returns
  is realized in full.
