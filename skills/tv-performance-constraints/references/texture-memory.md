# Texture Memory

Every image, every piece of rendered text, and every off-screen effect
buffer ends up as a GPU texture. Texture memory is the resource TV apps
exhaust first, and the math is unforgiving enough that it's worth doing
in your head while writing the template, not after the crash report.

## The math

An uncompressed RGBA texture costs `width × height × 4` bytes (some
platforms pad to more). The compressed size of the *file* is irrelevant —
a 90 KB JPEG of a 1920×1080 backdrop still becomes an ~8 MB texture.

| Asset | Dimensions | Texture memory |
|---|---|---|
| Full-HD backdrop / background | 1920×1080 | ~8.3 MB |
| 720p backdrop | 1280×720 | ~3.7 MB |
| Large poster card | 500×750 | ~1.5 MB |
| Typical poster card | 300×450 | ~540 KB |
| Thumbnail | 200×112 | ~90 KB |
| One rail of 8 typical posters | — | ~4.3 MB |
| A browse screen: backdrop + 4 realized rails | — | ~25 MB |

That last row is the point: **one ordinary browse screen sits at the
edge of a low-end device's entire texture budget** (Android TV's low-RAM
guidance allows 30–40 MB of graphics memory for the whole app). There is
no slack for oversized sources, duplicate textures, or realizing
off-screen rows.

## What counts against the budget

- **Images** — posters, backdrops, logos, avatars.
- **Rendered text.** Canvas-based renderers (Lightning and similar) draw
  each distinct text string into its own texture. A grid where every
  card renders two lines of metadata carries a real per-card text cost.
- **Effect/render-to-texture buffers** — blur, shadow, rounded-corner
  masks, and "render this subtree off-screen" features allocate
  additional full-size buffers. Use them deliberately, not decoratively.
- **The framework's own buffers** — render targets, glyph atlases.

## Eviction: what cleanup can and cannot save

Renderers track texture usage and free **unused** textures when a
threshold is reached — e.g. Lightning v2's `memoryPressure` stage option
(default 24e6 pixels; at 4 bytes/pixel that's ~96 MB, far above what a
1 GB-class device tolerates — set it to match the real target). Two
consequences:

1. Cleanup is least-recently-used and only touches textures no on-screen
   element references. **If everything over budget is currently visible,
   there is nothing to evict** — the app hits platform OOM and dies.
   Eviction is a backstop for *navigation history*, not a license to
   overfill *one screen*.
2. If the working set hovers just above the threshold, the app enters
   eviction thrash: textures freed, then immediately re-decoded when the
   user scrolls back. Symptom: images that visibly blank and reload on
   every back-and-forth scroll.

## Reuse and deduplication

Renderers deduplicate textures by source key (URL, text string + style,
rect parameters). Work with that:

- **Same URL, one texture.** Ten cards showing the same fallback image
  cost one texture. Ten *slightly different* CDN URLs for the same image
  (differing query params) cost ten — normalize rendition URLs.
- **Tint shared textures instead of baking variants.** One white
  rounded-rect texture colorized per card beats a per-card pre-colored
  asset. Same for focus rings, gradients, badges.
- **Swap the source on an existing element** to change an image;
  destroying and recreating the element re-pays setup and defeats
  texture reuse.
- **Fixed-size slots.** If cards in a rail share dimensions, their
  masks, backgrounds, and focus effects can all share textures. A design
  with per-card size variation silently multiplies texture count.

## Symptoms of texture pressure

| Symptom | Likely cause |
|---|---|
| App crashes after minutes of browsing, no JS error | Cumulative texture growth past platform limit — check release-on-leave (see `virtualization.md`) |
| Images blank/reload when scrolling back | Eviction thrash — working set too close to threshold |
| Whole screen goes black, app survives | GL context loss on some platforms under memory pressure |
| First screen fine, detail pages degrade over time | Backdrops accumulating; full-screen art must be released on exit |

## Writing code against a budget

When generating a screen, do the estimate explicitly: slot sizes ×
visible count × 4 bytes, plus backdrop, plus text. If it lands above
~60–70% of the target device's texture budget, cut before shipping —
smaller renditions, fewer realized rows, shared textures — rather than
relying on eviction. State the estimate in review when the screen is
image-heavy; it's a one-line calculation that prevents the class of bug
that only reproduces on hardware nobody on the team has on their desk.

## Framework pointers

Lightning v2: texture shorthands, `memoryPressure`, texture load/error
events, and Flexbox cost are covered in
`lightningjs-v2-conventions/references/textures-and-performance.md`.
For DOM-based TV apps (Tizen/webOS web apps), the same math applies to
`<img>`/canvas bitmaps — the browser's decoded-image cache is the
texture pool, and CSS effects (filters, shadows) are the render-target
cost.
