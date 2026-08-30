# Rebuilding "Browse all" so it stays fast on a TV

## Why it's slow on the TV but instant on the laptop

The screen realizes the entire catalog in one shot. For 800 titles that is
~134 rows, ~800 `image` nodes, and roughly 5,600 nodes total, all built and
laid out on the frame the screen opens.

Two costs dominate, and both are things a laptop hides from you:

1. **Texture memory / decode.** Per the framework contract, an `image` node
   decodes at the *source image's intrinsic size*, not the node's `w`/`h`.
   A typical poster from a CDN is ~1000x1500. As RGBA that is
   `1000 * 1500 * 4 = 6 MB` of GPU memory *per poster*, regardless of the
   fact that you draw it at 280x400. Times 800:

   | | intrinsic 1000x1500 | sized to 280x400 |
   |---|---|---|
   | per poster | ~6 MB | ~0.45 MB |
   | whole catalog (800) | ~4.7 GB | ~360 MB |
   | windowed (~48 tiles) | ~290 MB | **~21 MB** |

   A desktop GPU has gigabytes of VRAM and a fast, multi-threaded image
   decoder, so 4.7 GB "works" (it spills to system RAM and you never
   notice). A low-end TV has on the order of a 100-200 MB texture budget
   and a slow decoder. You blow the budget before the user has scrolled
   anywhere, and every new poster that comes into view is another
   full-resolution decode on a weak CPU.

2. **Node tree construction + layout.** Building and laying out ~5,600
   nodes synchronously on open is the "several seconds" you see. The
   laptop does it in a few milliseconds.

**Why memory climbs as they scroll down and never falls scrolling up:**
the framework realizes what `render()` returns. If textures are uploaded
lazily as rows first become visible, memory grows as new rows are revealed.
Nothing ever *leaves* the tree (every row is always in `render()`'s
output), so no `unmount()` fires, no texture is ever released, and
scrolling back up frees nothing. On top of that, `onScroll` fires many
times per second while a d-pad key is held and each call does a full
`update()` / rebuild / relayout, which is pure jank and GC pressure.

## How to build it instead

### 1. Virtualize the list (windowing) - the core fix

Only return the rows that intersect the viewport, plus a small **overscan**
band (1-2 rows above and below) so a fast scroll never exposes an empty
row before the next frame.

- Compute the visible row range from `scrollY` and `viewport.h`:
  `start = floor(scrollY / ROW_PITCH) - OVERSCAN`,
  `end = ceil((scrollY + viewH) / ROW_PITCH) + OVERSCAN`, clamped to
  `[0, rowCount - 1]`.
- `render()` emits only `rows[start..end]`, each positioned at its
  absolute `y` minus `scrollY`.
- Rows outside the window are simply absent from the tree, so their
  `unmount()` fires and their textures are freed. That is what makes
  memory *drop* again when the user scrolls back up.

Window size is fixed (~5 visible rows + 2*2 overscan = ~9 rows, ~54 tiles),
so texture memory is flat no matter how big the catalog is or how long the
user browses.

### 2. Request artwork at display size

Append resize parameters to `artworkUrl` so the CDN returns ~280x400
instead of the full-res master. This is what turns "~290 MB for the
window" into "~21 MB for the window." Use 1x device pixels: the app
renders at 1080p even on 4K panels, and at 10-foot viewing distance 1x is
sharp - requesting 2x quadruples the cost for no visible gain. The exact
param format depends on your image service (imgix/Thumbor/Akamai/etc.).

### 3. Coalesce scroll work to one recompute per frame

`onScroll` should only stash the new offset and schedule a single `raf`
callback. In that callback, recompute the window and call `update()`
**only if the row window actually changed**. Sub-row scrolling is just a
change of the group's `y` and does not need a rebuild every pixel. This
removes the per-key-repeat full rebuild.

### 4. Keep the full content height available

The host scroller / scrollbar / focus navigation still needs to know how
tall the *whole* list is even though you only draw a slice. Expose
`contentHeight = rowCount * ROW_PITCH` and set it on the container node.

### 5. Cheap placeholder under every tile

Put a solid `rect` behind each poster so a fast scroll shows grey tiles
that fill in, never empty holes while textures decode.

### 6. Optional niceties

- **Bounded texture cache (LRU).** Keep the ~60 most-recently-seen poster
  URLs "warm" so scrolling back up is instant rather than re-decoding.
  Bounded so a long session can't grow unbounded; the window unmount is
  still the real safety net.
- **Defer image loads during fast scroll.** Render placeholders only while
  scroll velocity is high, swap in `src` when it settles. Keeps the decode
  thread free during the scroll itself.
- **UX for 800 items.** A flat 134-row list is a lot to d-pad through.
  Consider alphabetical jump / section headers / a "load more" chunk, but
  that's a product call, not a perf requirement.

## Focus / navigation note

Because rows unmount when they leave the window, keep the *model* of which
tile is focused as `(rowIndex, colIndex)` in the screen component, not a
reference to a node. When the focused row scrolls back into the window,
reapply focus to the newly realized node. Also make sure the window is
recomputed on focus-driven scrolls, not just d-pad scroll events.

## Expected result

- Open: ~40 nodes and ~30 sized decodes instead of ~5,600 nodes and 800
  full-res decodes - sub-second instead of several seconds.
- Memory: flat at ~20 MB of poster texture regardless of catalog size or
  how far the user scrolls; falls back down when rows leave the window.
- Scroll: one window recompute per frame, no per-key-repeat rebuild.

See `catalog-screen.js` in this folder for a revised implementation on the
fixture framework.

## Key changes in the revised `catalog-screen.js`

- `render()` loops only over `_winStart.._winEnd`, not the whole catalog.
- `_recomputeWindow()` derives that range from `scrollY` + `viewport.h`
  with a 2-row overscan, and returns whether it moved.
- `onScroll()` coalesces to a single `raf`; `update()` runs only on a
  window change.
- `sizedArtworkUrl()` requests 280x400 artwork so each texture is
  ~0.45 MB, not ~6 MB.
- Each tile has a `rect` placeholder behind the `image`.
- `contentHeight` is exposed and set on the container for scroll/focus
  math.
- `unmount()` clears the texture cache so nothing leaks into the next
  screen; a bounded LRU keeps recent posters warm for scroll-back.
