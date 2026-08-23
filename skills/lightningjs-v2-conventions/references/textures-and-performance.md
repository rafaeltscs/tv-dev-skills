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

## TV performance constraints (why this matters more than on web)

TV chipsets (especially budget/mid-tier smart TV SoCs and older set-top
boxes) have meaningfully less CPU/GPU headroom and memory than a phone or
laptop. Code that's fine in a browser can visibly stutter on a 2019 TV
chipset. When writing or reviewing Lightning code, watch for:

- **Texture memory pressure.** Don't load full-resolution source images for
  small poster/thumbnail slots — request appropriately sized images from
  your CDN/image service rather than downscaling at render time.
- **Reuse textures instead of recreating them.** Swapping `src` on an
  existing element reuses the element; destroying and recreating elements
  to "refresh" an image is unnecessary GC pressure.
- **Avoid per-frame allocations in animation/update loops.** Constructing
  new objects (arrays, closures capturing large scope) inside a frequently
  called method (e.g. something driven by `animation()` progress callbacks,
  or a custom render-loop hook) creates GC churn that shows up as jank on
  weaker devices, even if it's invisible on a dev machine.
- **Lazy-load off-screen content.** For rails/grids with many items, don't
  eagerly create/fetch textures for items far outside the visible viewport;
  create them as they scroll into range and consider releasing textures for
  items that scroll far enough away.
- **Prefer absolute positioning over Flexbox for anything that changes
  size/position every frame** — Lightning's Flexbox is CPU-bound layout
  work, fine for menus and static-ish compositions, expensive if driven at
  animation frame rates (see `components-and-templates.md`).
- **Batch changes with `patch()`** rather than many sequential property
  writes, to avoid redundant intermediate render-tree recalculations.

None of this needs to be litigated on every change — but if you're
generating a rail, an image-heavy grid, or anything animation-driven, call
out image sizing/lazy-loading/texture-reuse choices explicitly rather than
writing the "obviously correct on web" version and letting the TV
performance implications go unmentioned.
