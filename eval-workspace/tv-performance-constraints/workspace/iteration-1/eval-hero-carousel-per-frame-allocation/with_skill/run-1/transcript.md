# Transcript — eval-hero-carousel-per-frame-allocation (with_skill, run-1)

## Skill invoked

`tv-dev-skills:tv-performance-constraints`

## Reference files read

- `skills/tv-performance-constraints/SKILL.md` — routing table + the 8
  non-negotiable conventions (no per-frame allocation; animate cheap
  properties; release off-screen resources; size images to the slot;
  verify on the floor not the ceiling).
- `references/gc-and-allocation.md` — primary. "What counts as per-frame
  code" (raf loops), the table of hidden allocation sources
  (`.map`/`.filter`/spread, inline closures, `.bind` at call site,
  "patch/setState-style calls with a fresh config object per frame"),
  hoist-and-reuse scratch objects + the synchronous-read contract,
  prefer declarative animation over hand-rolled tick math, steady-state
  silence, listeners/timers removed on screen exit.
- `references/texture-memory.md` — the w*h*4 math: 1920x1080 backdrop =
  ~8.3 MB texture regardless of file size; 8 slides retained = ~66 MB,
  over the whole low-end budget; swap `src` on one element rather than
  per-slide elements; release full-screen art on exit.
- `references/image-loading.md` — decode cost is set by source
  dimensions not slot size; "request the rendered size, never the
  master"; size for UI resolution (1080p here) not the 4K panel; decode
  off the main thread / preload the visible item first; full-screen art
  is transient, release on exit.
- Input: `evals/files/_framework.md` (fixture: nodes, `type: 'image'`
  decodes at intrinsic size, `raf`, `mount`/`unmount`, `this.viewport`
  = 1920x1080, no automatic windowing) and `evals/files/hero-carousel.js`.

## Key reasoning

Two independent defects, both hidden on a laptop:

1. **Fade stutter = per-frame GC.** `step()` runs every raf tick and
   allocates ~15 things/frame: `this.slides.map((s,i)=>({...s,index:i}))`
   (array + 8 spread objects + closure), `.filter(...)` (array +
   closure), `const delta = { value }`, and `this.patch({Backdrop,Logo})`
   (fresh 3-object tree). ~900 allocations/sec → sawtooth heap → minor-GC
   pauses inside the 16–33 ms frame on slow TV cores. Fix: module-level
   scratch objects, method bound once in constructor, `this.slides[this.current]`
   instead of map/filter, write only `alpha` per frame.

2. **Advance hitch = synchronous full-screen texture swap.** Each advance
   points a live `Backdrop` at a new, un-preloaded 1920x1080 image → ~8 MB
   upload + full-frame JPEG decode on the UI thread at the swap instant.
   Fix: two stacked layers; arm the hidden layer with the NEXT slide's
   `src` well ahead of time (decode off-thread), then the advance is just
   an alpha ramp. Note added to gate the fade on the texture load event
   in a real framework.

Supporting fixes:
- `sizedBackdrop(url, 1920)` — request the 1080p-UI rendition, never the
  master (fixture: texture decodes at intrinsic size).
- Timing from the raf `now` timestamp, not `+= 16` / `* 0.08` per frame
  (was frame-rate-dependent; also `this.timeInPhase` started undefined).
- `unmount()` added: clears `this.running` (loop stops re-arming raf) and
  nulls both layers' `src` so the two ~8 MB backdrop textures are
  reclaimed behind the next screen. Original had no teardown — loop +
  allocations + a new backdrop decode every 4 s ran forever after
  navigation.
- Single-slide input skips the loop.
- At most 2 backdrops resident (~16 MB, only during the fade) vs. the
  66 MB risk of per-slide elements.

## Outputs written

- `outputs/response.md` — full diagnosis + fix write-up.
- `outputs/hero-carousel.js` — revised component.
