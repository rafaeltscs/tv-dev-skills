# The renderer isn't leaking. Your `render()` is.

Short version: there is no leak in the renderer. It's doing exactly what you
told it to do. Two things in `poster-grid.js` produce an unbounded amount of
live texture memory, and the LRU change you made ("bumped it to 500 entries")
is not a fix — it's what turned a bad situation into an OOM.

## What's actually happening

### 1. You decode 2000x3000 masters into 260x390 cells

`item.artworkUrl` returns the 2000x3000 master, and nothing rewrites it. The
image service accepts `?w=&h=` but the code never uses them.

A texture's memory cost is set by the **source pixel count**, not by the box
you draw it in. So each poster costs roughly:

```
2000 * 3000 * 4 bytes  ≈ 24 MB   (decoded RGBA in GPU/texture memory)
```

The cell only needs about `260 * 390 * 4 ≈ 0.4 MB`. You're paying ~60x per
poster for pixels the panel physically cannot show.

### 2. `render()` realizes the whole catalog at once

`this.items.map(...)` builds a node for all ~120 items every render. The
framework doc is explicit: "Whatever `render()` returns is realized in full."
There is no windowing / virtualization, so one grid instance means ~120 live
image textures:

```
120 * 24 MB ≈ 2.8 GB   just for the posters that are currently mounted
```

Those textures are **attached to the live tree**, so the LRU cache cannot
evict them — an LRU only reclaims entries that are no longer referenced. 2.8 GB
is therefore your *floor*, before any caching, and it's already far past what a
2020 TV gives a web app (realistically a couple hundred MB of texture budget,
sometimes less).

### 3. The 500-entry LRU is the OOM, not the safety net

The renderer's cache is bounded by **entry count**, not bytes. With 24 MB
entries:

```
500 entries * 24 MB ≈ 12 GB ceiling
```

When the user leaves a category, that grid unmounts and its ~120 textures
become "recently used, now unreferenced" — exactly what the LRU is designed to
keep around. So each category the user visits deposits up to ~120 x 24 MB into
a cache you've authorized to grow to 12 GB. Memory climbs as they browse, never
comes back down, and the app dies after "a few categories."

That profile reads exactly like a renderer leak, but it's the cache obeying a
limit expressed in the wrong unit. Raising it from the default to 500 made the
cliff further away and much taller — it did not remove it.

### Why it's fine on the dev laptop

The laptop has multi-GB RAM and VRAM and a fast JPEG decoder, so it never
reaches the ceiling and decodes a 24 MB bitmap in a few ms. The TV SoC decodes
the same ~1-2 MB JPEG into a 24 MB bitmap in hundreds of ms — that's your
"blank cells while scrolling, images pop in slowly" — and then runs out of room.

### Why your cache/teardown audit came back clean

Because both are genuinely fine. The problem isn't retention of dead objects or
a missing `unmount()`. It's (a) the byte size of each live texture, (b) the
number of textures you mount simultaneously, and (c) a cache whose limit is
counted in entries instead of bytes. None of those show up as a "leak" in a
teardown review.

## The fix (see revised `poster-grid.js`)

1. **Ask the image service for the size you draw.** Append `?w=260&h=390`.
   Per-poster texture cost drops from ~24 MB to ~0.4 MB. This one line is what
   stops the OOM.

2. **Virtualize the grid.** Only build cells for the visible row range plus a
   small buffer (~40 nodes instead of 120). Track the scroll offset in
   `onScroll`, recompute the visible window in `render()`, and coalesce
   re-renders with `raf` so a held d-pad key doesn't rebuild every step.

3. **Put the LRU cache back down**, and ideally give it a *byte* budget rather
   than an entry count. After steps 1-2 the on-screen working set is
   ~40 x 0.4 MB ≈ 16 MB; even a modest 100-entry cache is ~40 MB worst case,
   which is a sane number for a 2020 TV. The 500-entry setting should be
   reverted — it's actively harmful now.

Net effect: mounted poster memory goes from ~2.8 GB to ~16 MB, cached poster
memory from up to 12 GB to a few tens of MB, and the TV stops decoding pixels
it can't display.
