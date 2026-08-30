# The decoder isn't the problem — retained nodes and full-tree rebuilds are

Short version: a slow decoder makes images show up *late*. It does not make
memory *grow without bound*, and it does not make the screen take seconds to
*open*. Both of your symptoms point at architecture, not silicon. A 1080p TV
only ever needs to have a screenful of ~280x400 posters decoded at once
(roughly a dozen tiles). This screen is currently asking it to create and then
hold onto all 400-800 of them.

## What's actually happening

### 1. There is no windowing — `render()` returns the entire catalog every time

The framework note is explicit: *"Whatever `render()` returns is realized in
full."* Your `render()` builds a node tree for every row in the catalog, so
every one of the 400-800 posters is a live `image` node in the tree from the
moment the screen mounts.

Making each poster lazy-load its bitmap when it nears the viewport trimmed the
*decode* work at open time (that's the "helped a bit" you saw), but it did
nothing about the 800 nodes themselves. As you scroll, each poster eventually
comes near the viewport, loads its texture... and then **never releases it**,
because the node never leaves the tree. The renderer's LRU texture cache can
only evict textures that are no longer referenced by the tree. Nothing is ever
unreferenced here, so nothing is ever evicted. That is your monotonic memory
climb, and it's why scrolling back up doesn't help — those rows were never
gone.

### 2. Every scroll step rebuilds the whole tree — that's the scroll jank / GC growth

`onScroll` fires many times per second while a d-pad key is held, and each call
goes straight to `update()` -> `render()`. Every one of those calls allocates a
fresh `slice()`, a fresh `map()`, and several hundred brand-new node objects
for the full catalog. On your laptop the GC keeps up and you never notice. On
the TV, that allocation rate forces frequent GC pauses, which drop frames —
the stutter you feel while scrolling. It also makes the renderer diff and
re-realize a huge tree every frame.

### 3. The source images are almost certainly far bigger than 280x400

Tiles draw at 280x400 but `item.artworkUrl` is very likely full-res box art
(1000x1500 or larger). The TV decodes every source pixel and keeps an RGBA
texture sized to the *source*, not the box:

- 280x400  -> ~0.45 MB texture
- 1500x2250 -> ~13.5 MB texture

Thirty of those on screen is ~14 MB vs ~400 MB. This is the part that *looks*
like "the decoder is too slow" — it's doing 25x the work it needs to per
image, and every retained texture (problem 1) costs 25x more than it should.

## The fixes (see the revised `catalog-screen.js`)

1. **Virtualize the list.** `render()` now computes which rows fall in the
   viewport (plus a few rows of overscan) and builds *only those*. Open time
   becomes proportional to one screen, not the catalog. Rows that scroll out
   of the band drop out of the returned tree, their `image` nodes are released,
   and the LRU cache can finally evict those textures — memory plateaus
   instead of climbing. Roughly a dozen live `image` nodes at any moment
   regardless of whether the catalog is 400 or 4000.

2. **Coalesce scroll renders to one per frame.** `onScroll` now just records
   the latest offset and schedules a single `raf` callback; the actual
   `update()` happens once per frame with the newest position. Same visual
   result, a fraction of the allocation, no GC storm.

3. **Request art at display size.** `sizedArtwork()` appends width/height
   params so the CDN hands back an image sized for the tile. Adjust the param
   names to your CDN — the principle is never to give the TV an image
   materially larger than the box it's drawn in.

Your existing "load the bitmap when near the viewport" logic is still fine to
keep for the overscan rows, but with windowing in place it's no longer doing
the heavy lifting — the structural fix is not keeping 800 nodes alive in the
first place.

## Expectations after this

- Open time: from "several seconds" to roughly constant, set by ~2 rows of
  posters decoding, not 130 rows of nodes being realized.
- Memory: rises to a steady-state working set (visible band + overscan +
  whatever the LRU cache holds) and stays flat while scrolling, up or down.
- Scroll smoothness: no periodic GC hitch, because per-frame allocation is now
  tiny.

If memory is *still* climbing after this, look for retention outside this
component (a growing cache keyed by title id, event listeners added per tile
and never removed, analytics buffers). But the code as written was guaranteed
to grow regardless of how fast the decoder is.
