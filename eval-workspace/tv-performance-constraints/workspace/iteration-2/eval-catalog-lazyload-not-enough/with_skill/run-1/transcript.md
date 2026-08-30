# Transcript — eval-catalog-lazyload-not-enough / with_skill / run-1

## Task

Developer scenario: the "Browse all" screen (400–800 titles) is slow to
open on the TV and memory climbs as the user scrolls and never comes back
down. They already made every poster lazy-load its image only once it's
near the viewport (helped open time "a bit"), and are now concluding the
TV's image decoder is too slow and underpowered.

Deliverables: `response.md`, revised `catalog-screen.js`, this transcript.

## Reference files read

Skill entry point:

- `skills/tv-performance-constraints/SKILL.md` — non-negotiable
  conventions; routing table to the four reference files.

Skill references (all four read, because the scenario touches lists,
images, GPU memory, and per-frame cost at once):

- `references/virtualization.md` — full collection as data / window as
  views+textures; visible / realized / everything-else ranges; recycle a
  fixed pool rather than create-destroy at edges; release-on-leave;
  startup ordering (shell → visible images → margin at idle); failure-mode
  checklist ("memory climbs while scrolling one long grid → leave-window
  release isn't actually freeing textures").
- `references/texture-memory.md` — `w × h × 4` bytes; master JPEG file
  size is irrelevant to texture size; ~24 MB for a master poster;
  30–40 MB whole-app budget; **canvas renderers draw each distinct text
  string into its own texture** (per-card title cost); eviction is LRU and
  can only touch textures no on-screen element references — "if everything
  over budget is currently visible, there is nothing to evict."
- `references/image-loading.md` — three costs (transfer / decode /
  residency); decode and residency are set by **source** dimensions, so a
  master in a thumbnail slot pays full decode + full texture; request the
  rendered size, quantize to a 3–5 width ladder for URL/texture/cache
  reuse; placeholder is a colour not an image; failure is a state not a
  hole; bound decode concurrency at mount.
- `references/gc-and-allocation.md` — per-frame code includes key-repeat /
  scroll handlers; `slice`/`map`/spread/object-literals/closures allocate;
  hoist and reuse scratch; precompute per-item derived data on data
  arrival; "healthy session: climbs while loading, plateaus while
  browsing, returns to baseline after leaving — a staircase that never
  comes down is a leak."

Fixture files:

- `evals/files/_framework-v2.md` — node shape `{type,x,y,w,h,src?,color?,
  children?}`; `type:'image'` loads `src`; `type:'rect'` is a solid fill;
  `mount()`/`unmount()` on tree enter/leave; `onScroll(offset)` fires many
  times/sec under a held key; `raf(cb)`; `this.viewport` = 1920×1080;
  **"Whatever `render()` returns is realized in full"** and the renderer
  keeps a built-in LRU texture cache.
- `evals/files/catalog-screen.js` — starting point (below).

Also skimmed `workspace/iteration-1/eval-catalog-list-virtualization/
with_skill/run-1/outputs/response.md` for house style / structure of a
prior answer to the non-scapegoat version of this scenario.

## Starting code (fixture)

`render()` loops the whole `catalog` in steps of 6 and returns a row group
per 6 titles, each tile = `image(src: item.artworkUrl)` + `text`. No
windowing. `onScroll` sets `scrollY` and calls `this.update()` → full
`render()` again.

## Key reasoning

1. **Reject the decoder diagnosis on the shape of the evidence.** A slow
   decoder shows up as slow-to-*appear* posters and a scroll hitch timed
   to new rows — not as monotonic memory growth. Memory that keeps
   climbing while re-visiting already-decoded rows is a retention/lifetime
   bug: something holds every texture ever shown. Decoding is idempotent
   for memory. Confirmation test offered: scroll to bottom then back to
   top and watch memory — a throughput problem falls back toward baseline,
   this staircases.

2. **Explain why lazy image loading helped only "a bit".** The fixture
   realizes the entire returned node tree. Deferring image decode removes
   one slice of the *open* cost, but the 500+ view groups and the
   400–800 per-title text textures are still built at mount on a slow CPU.
   And lazy-*in* without release-*out* still only grows: the row node that
   owns each poster texture never leaves the tree, so the texture is never
   unreferenced, so LRU eviction is never allowed to reclaim it.

3. **Three real root causes**, mapped to the three symptoms in a table:
   (a) no view virtualization → slow open + node/text-texture cost;
   (b) no release-on-leave → memory climbs and never drops, eviction
   powerless because everything is still referenced;
   (c) `src = item.artworkUrl` is the master rendition → ~24 MB texture
   and a full-size decode per 280×400 slot, which is also the grain of
   truth behind "decoder feels slow" — smaller source decodes faster.
   Plus per-scroll-step `render()` rebuild churn (`slice`+`map`+literals).

4. **Texture budget math stated explicitly** (skill convention #2 /
   texture-memory.md): now ≈ up to 800 × 540 KB ≈ 430 MB (masters far
   more) + ~25 MB title text, vs redesigned ≈ 30 posters × 540 KB ≈
   16 MB, flat.

5. **Design of the revised screen**, within the v2 fixture's constraints
   (no separate transform channel; `render()` returns a tree that is
   realized wholesale; LRU frees only unreferenced textures):
   - Row windowing from `scrollY`: view window = visible ± 1,
     image window = visible ± 1. Rows outside the view window are not
     returned → their textures go unreferenced → LRU can reclaim. That is
     the release-on-leave.
   - Fixed pool of ~5 row view-nodes, indexed by `rowIndex -
     firstRealizedRow`. Crossing a boundary rebinds pooled nodes (field
     writes only), never constructs a new tile tree — keeps allocation
     rate constant vs catalog size (virtualization.md "recycle, don't
     create/destroy"; gc-and-allocation.md pooling).
   - Stable `_root` + `children` array mutated in place; a sub-row scroll
     step allocates nothing. `row.y` updated every step (cheap); the
     title/`src` rebind pass gated on `boundRow`/`boundImages` change.
   - `renditionUrl()` quantizes to a 3-width ladder (140/300/500) and
     appends `?w=300` for the 280 px slot — slot-sized, shared URL, texture
     dedupe + warm cache (image-loading.md).
   - Rebind clears `img.src = null` before setting the new value so a
     recycled slot can't flash the previous poster and a late load can't
     paint into it (virtualization.md failure-mode checklist).
   - One shared solid-colour `rect` behind every tile = load state and
     failure state; transparent for empty trailing tiles in the last row.
   - `mount()` loads posters for the visible band only, widens to the
     margin one frame later via `raf` → bounded decode burst at startup
     (image-loading.md concurrency; virtualization.md startup ordering).
   - `unmount()` nulls every pooled `src` and clears the pool so leaving
     the screen releases all textures; `scrollY` remains on the screen
     object so return is instant (state lives with data, not the view).
   - Public surface unchanged: `constructor(catalog)`, `render()`,
     `onScroll()`, plus `mount()`/`unmount()`.

6. **Verify-on-device caveat** (skill convention #8): stated the device
   class the code targets and the four measurements that would confirm it
   (texture memory flat while scrolling end-to-end and back; near-flat
   allocation timeline under hold-to-scroll; ~zero enter/leave heap diff;
   open-time drop from node/text-texture reduction). Laptop establishes
   shape only.

## Output files

- `outputs/response.md`
- `outputs/catalog-screen.js`
