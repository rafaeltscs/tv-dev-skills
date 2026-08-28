# Image Sizing, Decode & Caching

Poster- and backdrop-heavy UIs live or die on image handling. Three
separate costs are paid per image, and desktop intuition underestimates
all of them on a TV SoC:

1. **Transfer** — TV network stacks and Wi-Fi radios are mediocre, but
   this is the *least* important cost; it's async and off-thread.
2. **Decode** — turning the compressed file into pixels is CPU work.
   Decoding a 4000×6000 source takes the same time whether it's shown
   full-screen or in a 300×450 card, and on a slow core it can block
   long enough to drop frames.
3. **Residency** — the decoded bitmap becomes a texture at
   `width × height × 4` bytes (see `texture-memory.md`).

Costs 2 and 3 are both set by the **source dimensions**, which is why
the single highest-leverage rule exists:

## Request the rendered size, never the master

Every serious content backend exposes an image service or CDN that
resizes on request (a width/quality parameter, or a rendition ladder
like TMDB's `w185`/`w342`/`w500`). Generated code should always ask for
the rendition closest to (at or slightly above) the slot's on-screen
pixel size:

```js
// slot is 300×450 on a 1080p UI
posterUrl(item, { w: 300 });          // right
posterUrl(item);                      // wrong: master rendition, ~40× the pixels
```

Two refinements:

- **Size for the UI resolution, not the panel.** Many TVs run the app's
  graphics plane at 1280×720 or 1920×1080 even on a 4K panel. A "half
  screen" hero on a 720p UI is ~640px wide — request that, not 1920.
- **Quantize to a ladder.** Requesting exact per-slot widths defeats CDN
  and browser caching (every slot size is a distinct URL) and, in
  renderers that deduplicate textures by URL, defeats texture sharing
  too. Pick 3–5 canonical widths app-wide and round up into them.

If no resizing service exists, that's a backend gap worth naming in
review — client-side downscaling of masters cannot fix the decode cost
and only partially fixes residency (and in most TV renderers doesn't
even do that).

## Decode off the main thread

Decode on the UI thread shows up as a hitch exactly when a rail of new
posters scrolls into view. Use the platform's off-thread path: image
worker threads in canvas renderers (Lightning enables one by default —
don't turn it off), `createImageBitmap()` / `img.decode()` in DOM apps.
And bound the *concurrency*: kicking off 40 decodes at screen-mount
saturates the CPU right when the entry animation runs. Load the visible
window first (see `virtualization.md`), then trickle the rest.

## Formats

- **JPEG** for photographic content (posters, backdrops, stills). It has
  universal support and hardware-friendly decode everywhere.
- **PNG** only where alpha is required (logos, badges); PNG posters are
  several times the transfer size for no benefit.
- **WebP/AVIF** cut transfer, but support depends on the platform's
  browser/renderer version, which on TV can be years old — check the
  target matrix (`tv-platform-quirks`) and negotiate via the CDN
  (Accept-header or URL parameter with JPEG fallback) rather than
  hardcoding one format. Remember they only reduce *transfer*: the
  decoded texture is identical, so format choice never fixes a memory
  problem.

## Cache layers, each with a job

- **CDN/HTTP cache**: works only if URLs are stable and quantized (see
  ladder rule). TV disk caches are small and evict aggressively —
  don't design cold-start UX around a warm HTTP cache.
- **In-memory decoded cache** (the renderer's texture pool or the
  browser's image cache): the expensive one. Bound it (LRU) and let
  eviction reclaim what navigation history holds — but never count on
  it for the current screen's working set.
- **Do not** hand-roll a base64/blob in-JS image cache: it double-pays
  memory in the JS heap on top of the texture and adds GC load.

## Loading policy for content UIs

- **Visible first, then ahead.** Load images in the realized window;
  prefetch roughly one viewport in the current scroll/navigation
  direction; nothing beyond that.
- **Cancel or ignore stale loads.** Fast d-pad scrolling through a rail
  queues dozens of requests for cards the user has already passed —
  cancel on leave-window, and guard callbacks so a late response can't
  write into a recycled slot showing a different item.
- **Placeholder is a color, not an image.** A solid rect (or dominant
  color from the API when available) renders instantly, costs ~nothing,
  and avoids a second request per slot. One shared placeholder texture
  serves the entire app.
- **Failure is a state, not a hole.** Every image slot handles load
  failure with the placeholder plus (if the slot is large) a title —
  broken art on a TV is otherwise a permanent black rectangle the user
  can't dismiss.
- **Full-screen art is transient.** A detail screen's backdrop is ~8 MB;
  release it on exit rather than letting a browse session accumulate a
  backdrop per visited title.

## Framework pointers

Lightning v2: `src` shorthand vs explicit `ImageTexture`, texture
load/error events for the failure state, and the image worker are in
`lightningjs-v2-conventions/references/textures-and-performance.md`.
DOM apps: `loading="lazy"` is a hint, not a windowing strategy — for
rails/grids, drive loading from the virtualization window
(`virtualization.md`), which knows scroll direction and focus.
