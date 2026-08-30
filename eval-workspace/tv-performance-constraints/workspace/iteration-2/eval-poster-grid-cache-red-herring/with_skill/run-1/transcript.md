# Transcript — eval-poster-grid-cache-red-herring / with_skill / run-1

## Skill invoked

`tv-dev-skills:tv-performance-constraints`

## Reference files read

1. `skills/tv-performance-constraints/SKILL.md`
   - Non-negotiable conventions. Load-bearing here: rule 2 (never decode
     more pixels than the slot shows; raw full-res `src` in a thumbnail
     is a bug), rule 4 (virtualize any collection > ~2 screens), rule 5
     (what leaves the screen releases its resources; memory should
     plateau, not climb), rule 6 (color placeholders), rule 8 (verify on
     the floor, not the ceiling).
2. `references/texture-memory.md`
   - `w * h * 4` bytes; file size irrelevant. Android TV low-RAM: 30-40 MB
     graphics memory for the whole app. Eviction is LRU and only frees
     textures no on-screen element references -- "if everything over
     budget is currently visible, there is nothing to evict" -> platform
     OOM. Eviction is a backstop for navigation history, not a license to
     overfill one screen. Symptom table: "App crashes after minutes of
     browsing, no JS error -> cumulative texture growth past platform
     limit." Do the estimate explicitly: slot size x visible count x 4.
3. `references/virtualization.md`
   - Full collection is data; only a window is views + textures. Three
     ranges: visible / realized (visible + ~1 viewport margin) /
     data-only. Items leaving the realized range release textures and
     views but keep data + remembered state. Failure mode: "Memory
     climbs while scrolling one long grid end-to-end -> leave-window
     release isn't actually freeing textures."
4. `references/image-loading.md`
   - Three costs: transfer (cheap), decode (CPU, set by source dims),
     residency (texture bytes, set by source dims). "Request the rendered
     size, never the master." Quantize to a 3-5 width ladder so CDN and
     texture dedupe still work. Bound decode concurrency; visible window
     first. Placeholder is a color, not an image. In-memory decoded cache
     is the expensive one -- bound it (LRU) but never count on it for the
     current screen's working set.
5. `references/gc-and-allocation.md`
   - Per-frame code (incl. key-repeat / scroll handlers) must allocate
     zero in steady state. Precompute per-item derived data when the data
     arrives, not per focus change / per frame. Unbounded caches need an
     LRU cap; healthy session = climb, plateau, return to baseline.

## Fixture files read

- `evals/files/_framework-v2.md` — node model
  `{ type, x, y, w, h, src?, color?, children? }`; `image` + `rect`
  types; `mount`/`unmount`; `onScroll(offset)` fires many times/sec;
  `raf(cb)`; `this.viewport = { w: 1920, h: 1080 }`; **"Whatever
  `render()` returns is realized in full"** + built-in LRU texture cache.
- `evals/files/poster-grid.js` — ~120 items, `artworkUrl` = 2000x3000
  master, resize params exist but unused, 260x390 cells, `render()` maps
  the whole array, no scroll handling, no windowing, no placeholder.

## Key reasoning

The user's hypothesis (renderer leak) is a red herring, and so is their
cache work. Diagnosis:

1. **Oversized renditions.** `2000 * 3000 * 4 = 24 MB` per poster
   texture; the 260x390 slot needs `~0.54 MB`. ~44x overspend each.
   (Fixture states the resize params are available but unused -> this is
   the intended primary finding.)

2. **No virtualization + no release on leave.** `render()` returns all
   ~120 items and the fixture realizes them in full: `120 * 24 MB ~=
   2.9 GB` for one category, against a 30-40 MB budget. Off-screen rows
   are never released, so per texture-memory.md there is nothing
   evictable while the screen is up.

3. **The 500-entry LRU bump is an amplifier, not a fix.** The renderer's
   LRU only frees unreferenced textures (history backstop). Raised to
   500 entries of 24 MB masters = 12 GB ceiling; each category browsed
   adds ~120 more 24 MB textures it now retains. A few categories in ->
   OOM. Matches the symptom-table row exactly ("crashes after minutes,
   no JS error"). The cache change made the crash arrive sooner.

4. **Smooth on the laptop** = rule 8: desktop absorbs 2.9 GB of texture
   and 120 full-res decodes; proves nothing about the TV.

5. **Blank cells / slow pop-in** = decode cost (image-loading.md #2):
   decoding a 2000x3000 JPEG costs the same in a 260px cell as full
   screen; 120 at mount saturate a slow core. Same root cause as #1.

## Changes made to `poster-grid.js`

- `renditionUrl()` appends `?w=&h=` quantized to a `[150, 300, 450]`
  width ladder; 260-wide slot -> `w=300&h=450` -> `~0.54 MB`/texture.
- Constructor precomputes per-cell `x`/`y`/`row`/`posterUrl` once
  (gc-and-allocation: derive when data arrives, not per frame).
- `onScroll(offset)` records a clamped `scrollY` only -- no allocation.
- `_visibleRowRange()` computes realized rows = visible + one viewport
  margin each way; `render()` emits nodes only for those rows (~45
  cells), everything else stays data-only and its textures are freed
  when it leaves the window. Outer group translated by `-scrollY`.
- Each cell gets a `rect` placeholder (shared color) behind the image.
- `unmount()` documents that teardown is not the problem here.
- Header comment carries the texture math and the note to size the
  renderer cache in bytes, not entries.

Result: per-category residency `~2.9 GB -> ~24 MB`, flat across
categories. Not device-profiled (stated in response.md).
