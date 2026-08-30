# Transcript - poster-grid image sizing and placeholders (with skill)

## Skill / reference files read

1. `skills/tv-performance-constraints/SKILL.md` - the routing table and the
   8 non-negotiable conventions (budget exists by default; never decode more
   pixels than the slot shows; no per-frame allocations; virtualize collections
   > ~2 screens; release resources on leave; placeholders are cheap; animate
   cheap properties; verify on device).
2. `references/image-loading.md` - "request the rendered size, never the
   master"; the three per-image costs (transfer / decode / residency) and that
   decode + residency are set by source dimensions; quantize to a 3-5 rung
   ladder; placeholder is a color not an image; failure is a state not a hole;
   visible-first then prefetch one viewport; bound decode concurrency.
3. `references/texture-memory.md` - `w x h x 4` bytes math and the asset table;
   one browse screen already sits near a 30-40 MB budget; eviction is a
   backstop for navigation history, not a license to overfill one screen; "if
   everything over budget is visible there is nothing to evict" -> OOM;
   dedupe by URL, keep rendition URLs stable; symptom table (crash after
   minutes with no JS error = cumulative texture growth; blank/reload on
   scroll-back = eviction thrash).
4. `references/virtualization.md` - full collection is data, only a window is
   views + textures; visible / realized (visible + ~1 viewport, biased to
   travel) / data-only ranges; recycle a fixed pool rather than create/destroy
   at edges; clear to placeholder before rebind and drop in-flight loads;
   virtualize both axes; startup ordering (shell + placeholders, then visible
   images, then trickle).
5. `references/gc-and-allocation.md` - key-repeat handlers are per-frame code;
   `.map()`/closures/object literals per tick allocate; hoist and precompute
   per-item derived data when the data arrives; steady-state silence while
   holding a d-pad key; long-session leaks from retained trees/listeners.
6. `eval-workspace/.../files/_framework.md` - fixture framework: node tree
   `{type,x,y,w,h,src?,color?,children?}`; `image` texture is decoded at the
   source's intrinsic pixel size (not the node size) - so URL resizing is the
   only lever; `rect` is a cheap fill; `mount`/`unmount`; `onScroll(offset)`
   fires many times/sec; `this.viewport` = 1920x1080; no automatic
   windowing/recycling.
7. `eval-workspace/.../files/poster-grid.js` - the component under review.

## Key reasoning steps

- Mapped the three reported symptoms to causes via the skill's symptom tables:
  - "crashes after a few categories" = cumulative texture growth past the
    platform limit (texture-memory.md) - driven by full-res masters + no
    windowing + no release on unmount.
  - "images fade in slowly" + "cells stay blank while scrolling" = decode CPU
    cost, which is set by source dimensions (image-loading.md), plus no
    placeholder so the gap is visible.
  - Implicit: `render()` rebuilding 120 nodes on every `onScroll` step is
    per-frame allocation (gc-and-allocation.md).
- Did the texture arithmetic explicitly (SKILL convention 8 / texture-memory.md
  "writing code against a budget"): 2000x3000x4 = ~24 MB/poster x 120 = ~2.8 GB
  attempted -> OOM. Target: request 300x450 (slot is 260x390 on 1080p UI,
  round up into one canonical rung) -> ~540 KB/poster.
- Chose windowing over "just shrink the images" because 120 x 540 KB = ~65 MB
  still exceeds a 30-40 MB budget (convention 4). Realized window = visible
  rows + OVERSCAN_ROWS each side, extra row on the scroll-leading side
  (virtualization.md "biased toward direction of travel"). ~25-30 cells
  realized = ~13-16 MB.
- Moved all derived data (grid x/y, sized URL) into the constructor; `onScroll`
  now only recomputes the row range and marks the tree dirty; `render()`
  returns a cached tree rebuilt only on window change - removes per-scroll
  allocation.
- Added a single shared `PLACEHOLDER_COLOR` rect behind every poster for the
  loading and failure states (convention 6; image-loading.md).
- Added `unmount()` that nulls the cached tree so a multi-category browse
  session plateaus instead of climbing (convention 5).
- Named the fixture's limits in the response (no load/error events -> can't
  cancel stale loads or bound decode concurrency here; declarative tree ->
  recommended a recycled view pool for a real renderer; gave each cell a
  stable `id` for host-side diffing) and the on-device verification caveat
  (convention 8).
