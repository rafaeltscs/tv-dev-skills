# Textures & Performance

## Texture types

An element renders nothing until it has a texture. Shorthands cover the
common cases directly on the element:

| Shorthand | Type | Use |
|---|---|---|
| `rect: true` | Rectangle | Solid color or gradient background |
| `src: 'path/or/url.png'` | Image | Loads and renders an image |
| `text: { text: '...' }` | Text | Renders text as a texture |

Solid color uses `color`; a gradient uses corner colors like `colorUl`
(upper-left) / `colorBr` (bottom-right), etc.

For more control, specify a full `texture` object instead of the shorthand
(needed for Canvas textures, custom shaders' source textures, or explicit
texture type selection):

```js
MyImage: {
  x: 100, y: 100,
  texture: { type: lng.textures.ImageTexture, src: 'assets/hero.png' },
}
```

You can listen for texture load success/failure via the element's texture
events — do this for anything where a broken/slow image would leave a
visibly empty region (hero art, poster thumbnails), so you can show a
fallback/placeholder state instead of a hole in the UI.

## Lightning-specific performance mechanics

The general case for why any of this matters on TV hardware — texture
memory budgets, GC pressure, image sizing, virtualization — lives in the
`tv-performance-constraints` skill; load it for the rules and the "why."
This section is only the Lightning-specific API surface that implements
those rules:

- **`memoryPressure` stage option.** Caps GPU memory as a pixel count
  (default `24e6`, i.e. ~96MB at 4 bytes/pixel — well above what a
  low-end TV tolerates; set it to match your real target). When the cap
  is hit, Lightning frees least-recently-used textures that nothing
  on-screen currently references — it cannot free textures still visibly
  in use, so staying under budget is still on you, not the engine.
- **Reuse textures instead of recreating them.** Swapping `src` on an
  existing element reuses the element and its texture-cache entry;
  destroying and recreating elements to "refresh" an image pays setup
  cost again and is unnecessary GC pressure.
- **Prefer absolute positioning over Flexbox for anything that changes
  size/position every frame** — Lightning's Flexbox is CPU-bound layout
  work, fine for menus and static-ish compositions, expensive if driven
  at animation frame rates (see `components-and-templates.md`).
- **Batch changes with `patch()`** rather than many sequential property
  writes, to avoid redundant intermediate render-tree recalculations —
  this is Lightning's answer to the general "batch writes" allocation
  advice.

If you're generating a rail, an image-heavy grid, or anything
animation-driven, call out image sizing/lazy-loading/texture-reuse
choices explicitly (`tv-performance-constraints` for the budget math)
rather than writing the "obviously correct on web" version and letting
the TV performance implications go unmentioned.
