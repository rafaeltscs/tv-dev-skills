# Transcript — eval-hero-carousel-raf-scapegoat (with_skill, run-1)

## Skill invoked

`tv-dev-skills:tv-performance-constraints`

## Reference files read

- `skills/tv-performance-constraints/SKILL.md` — routing table + the 8
  non-negotiable conventions. Relevant here: rule 3 (no allocations in
  per-frame code — animation ticks / rAF loops named explicitly), rule 5
  (what leaves the screen releases its resources; timers tied to
  lifecycle), rule 7 (animate cheap properties — opacity), rule 8 (verify
  on the floor, not the ceiling).
- `references/gc-and-allocation.md` — primary. "What counts as per-frame
  code" lists `requestAnimationFrame` loops. The hidden-allocation table:
  `.map`/`.filter`/spread (array + closure), inline arrow per tick,
  `{x,y}` literals, "patch/setState-style calls with a fresh config object
  per frame". Fix patterns: hoist-and-reuse scratch objects with the
  synchronous-read contract; bind callbacks once; prefer declarative
  animation over hand-rolled tick math; steady-state silence; audit every
  timer for a matching clear; closures retaining screens.
- `references/texture-memory.md` — `w*h*4`: a 1920x1080 backdrop is an
  ~8.3 MB texture regardless of the JPEG's file size; one browse screen
  already sits near a low-end device's whole 30–40 MB budget; LRU
  eviction only frees textures nothing on-screen references; swap `src`
  on an existing element rather than recreating; release full-screen art
  on exit.
- `references/image-loading.md` — decode cost is set by source
  dimensions, not slot size; "request the rendered size, never the
  master"; size for the UI plane (1080p here) not the 4K panel; decode
  off the main thread and preload the visible item before showing it;
  quantise rendition widths to a ladder so URLs stay cache-stable;
  full-screen art is transient, release on exit.
- Inputs: `evals/.../files/_framework-v2.md` (fixture: node tree,
  `type:'image'` with `src` loads+draws that URL, `mount`/`unmount`,
  `raf(cb)`, `this.viewport` = 1920x1080, renderer has a built-in LRU
  texture cache, "whatever render() returns is realized in full") and
  `evals/.../files/hero-carousel.js`.

## The question and its framing

User asks whether `requestAnimationFrame` is unreliable on TV browsers
and whether to drive the fade off `setInterval` instead. They also report
that moving the fade's easing math into a Web Worker produced no change.
Both are misdiagnoses; the Worker null result is actually the key clue.

## Key reasoning

**The scapegoat.** rAF is the correct primitive on every TV browser.
`setInterval` is strictly worse: not vsync-aligned (beat-frequency judder
against scanout), keeps firing while the app is suspended behind playback
/ app switches (then dumps a coalesced backlog on resume), and still
clamps/coalesces under main-thread load. No TV UI framework drives
animation off `setInterval`. Recommendation: keep rAF.

**Why the Worker changed nothing.** The "easing math" is
`(target - this.opacity) * 0.08` — one subtract, one multiply,
nanoseconds. It was never the cost, so offloading it could not help. The
frame budget is consumed by two things a Worker cannot touch and a
different timer cannot fix:

1. **Fade stutter = per-frame GC.** `step()` allocates ~15
   objects/arrays/closures every tick:
   `this.slides.map((s,i)=>({...s,index:i}))` (array + ~8 spread objects +
   closure), `.filter(...)` (array + closure), `const delta = {value}`,
   and `this.patch({Backdrop,Logo})` (fresh 3-object tree) — ~900
   allocations/sec to compute `this.slides[this.current]`. Sawtooth heap
   → minor-GC pauses inside a 16–33 ms frame on slow TV cores; invisible
   on the laptop's generational GC.

2. **Advance hitch = synchronous full-screen texture swap.** Each advance
   points a live element at a new, un-preloaded 1920x1080 backdrop → ~8 MB
   upload + full-frame decode on the UI thread at the swap instant. Recurs
   every advance. Worse if `backdropUrl` is a master asset.

**Supporting defects in the file:** `src` reassigned every frame (not just
on advance); raw full-res source, no sized rendition for the 1080p UI
plane; frame-rate-dependent timing (`+= 16`, `* 0.08` assume 16 ms
frames; `this.timeInPhase` starts `undefined`); no `unmount()` and the
loop re-arms `raf` unconditionally, so it runs forever after navigation
(allocations + an 8 MB backdrop decode every few seconds behind the next
screen, both backdrops resident); it's a dip-to-black on one element, not
a real cross-fade.

## Fix implemented

- **Two stacked layers (A/B).** Front shows; back is armed with the next
  slide at `alpha 0` and faded up. Real cross-fade, and the place to
  preload.
- **Explicit phases.** Dwell = `setTimeout` (~5 s), no per-frame work at
  all. Preload = set `src` on the hidden layer `PRELOAD_LEAD_MS` before
  the fade so the backdrop decodes during the idle dwell (note added to
  gate on the texture load/decode event in a real framework). Fade =
  `raf` for ~400 ms only.
- **Zero-allocation fade loop.** One hoisted `_cfg` scratch tree mutated
  in place; module-const key orderings `KEYS_A`/`KEYS_B` selected without
  allocating; `_tick` bound once in the constructor; per frame = four
  numeric `alpha` writes + one `patch()` with the reused tree.
- **Time-based progress.** `(performance.now() - fadeStart) / FADE_MS`
  eased — identical at 30 and 60 fps. (Used `performance.now()` rather
  than assume the fixture's `raf` passes a timestamp.)
- **Release on swap and on exit.** After each fade the old front layer's
  `src` → `null` so the LRU reclaims the ~8 MB backdrop. `unmount()`
  clears `running`, clears both timers, nulls every `src`.
- **`sizedUrl(url, 1920)`** — rendition for the 1080p UI plane, quantised
  to a single canonical width so the URL stays cache-stable; documented
  to drop to 1280 for a 720p plane.
- Single-slide input renders statically, no loop.
- Peak texture: 2 backdrops (~16 MB) only during the fade + preload lead;
  ~8 MB otherwise.
- Kept the component's existing `this.patch()` API (present in the input
  file) rather than rewriting to the v2 fixture's `render()` model.

## Outputs written

- `outputs/response.md` — rebuttal of the rAF/setInterval hypothesis, the
  Web Worker null-result explanation, both root causes + contributing
  defects, the fix, and the on-device verification note.
- `outputs/hero-carousel.js` — revised component.
