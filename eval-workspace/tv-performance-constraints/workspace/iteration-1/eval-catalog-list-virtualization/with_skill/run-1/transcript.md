# Transcript — eval-catalog-list-virtualization / with_skill / run-1

## Skill invoked
- `tv-dev-skills:tv-performance-constraints`

## Reference files read
- `skills/tv-performance-constraints/SKILL.md` — routing table + the 8
  non-negotiable conventions (budget assumed, slot-sized decodes, no
  per-frame allocation, virtualize > 2 screens, release on leave, cheap
  placeholders, animate transforms, verify on real hardware).
- `references/virtualization.md` — primary. Windowing model (visible /
  realized / data-only), recycle-don't-create a fixed view pool, both-axes
  table (visible ±1 images, ±2–3 views, beyond = data), pagination,
  startup ordering, failure-mode checklist.
- `references/texture-memory.md` — `w×h×4` math (2000×3000 master ≈ 24 MB;
  300×450 card ≈ 540 KB), 30–40 MB whole-app budget, LRU eviction only
  reclaims *unreferenced* textures, URL dedup / rendition-ladder
  quantization.
- `references/image-loading.md` — request the rendered size not the
  master, quantize to 3–5 canonical widths, off-thread + bounded-
  concurrency decode, colour placeholder (not an image), failure is a
  state not a hole, visible-first load policy, guard stale loads into
  recycled slots.
- `references/gc-and-allocation.md` — key-repeat / scroll handlers are
  per-frame code; ban slice/map/literals/closures there; hoist + reuse;
  steady-state silence; long-session leaks (listeners, unbounded caches).

## Input files read
- `evals/files/_framework.md` — fixture node model (`{type,x,y,w,h,src?,
  color?,children?}`), image decodes at intrinsic source size, `mount/
  unmount`, `onScroll` fires many times/sec, `raf`, viewport 1920×1080,
  no automatic windowing.
- `evals/files/catalog-screen.js` — the screen under review.

## Key reasoning
1. Diagnosed 4 root causes and mapped each to a stated symptom:
   - No windowing → 500+ view groups + thousands of nodes at mount →
     "several seconds to open".
   - Full tree always returned + textures upload as rows enter view +
     nothing released → "memory climbs scrolling down".
   - Nothing leaves the tree → no unreferenced texture → LRU eviction has
     nothing to reclaim → "never drops scrolling back up".
   - `onScroll` → full `render()` with `slice`/`map`/literals many
     times/sec → GC hitch on TV (secondary).
   - `src: item.artworkUrl` = master rendition → ~24 MB texture per slot.
2. Redesign = virtualized recycling list: data-only catalog; visible /
   view-window (±2 rows) / image-window (±1 row) / data-only tiers; fixed
   recycled row-view pool with clear-to-placeholder-before-rebind and
   stale-load guard; `onScroll` only translates the container and re-syncs
   the window on integer-row change (with early-out); slot-sized quantized
   renditions (`?w=300`); release `src` on leave so memory plateaus;
   shared colour placeholder rect doubling as failure state; bounded decode
   queue (6); startup renders first viewport only; remembered `scrollY`
   lives on the screen; noted data pagination + letter-jump teleport +
   cross-ref to `tv-focus-and-navigation`.
3. Texture budget stated explicitly: current worst case ≈ 430 MB+ vs
   redesigned ≈ 18 MB flat, against a 30–40 MB budget.
4. Flagged that numbers are for the low-RAM device class and must be
   confirmed with on-device heap/texture profiling.

## Outputs written
- `outputs/response.md` — full diagnosis + redesign.
- `outputs/catalog-screen.js` — revised screen in the fixture framework,
  same public surface plus `mount()`/`unmount()`.
