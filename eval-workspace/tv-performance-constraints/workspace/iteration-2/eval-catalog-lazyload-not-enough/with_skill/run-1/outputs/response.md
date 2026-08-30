# "Browse all" — the decoder isn't the problem

Short version: the image decoder is not what's wrong here. The memory
graph you're describing — climbs while scrolling, never comes back down —
is a **resource-lifetime bug**, not a speed problem, and a slow decoder
cannot produce that shape. Near-viewport lazy image loading was the right
instinct but it only trimmed one cost off the open path and left the two
that actually matter untouched.

## Why "the decoder is too slow" doesn't fit the evidence

A slow, underpowered decoder has a specific signature:

- posters take a beat to **appear** after they scroll on;
- you get a scroll **hitch** timed to a rail of new posters entering view
  (decode work landing on the UI thread);
- it is **not** correlated with total memory.

What you actually have is monotonic growth that survives scrolling back
over rows whose images were already decoded once. Decoding is idempotent
for memory — decode the same poster twice and you still hold one bitmap.
If memory keeps climbing as you re-visit rows, something is **retaining**
every texture you've ever shown. That's lifetime, not throughput.

A 60-second test to confirm before touching anything: open the screen,
scroll to the bottom, scroll back to the top, and watch texture/heap
memory. A decoder bottleneck gives you a curve that rises and then
**falls back** toward baseline as off-screen textures are released. What
you'll see instead is a staircase that only goes up. That rules the
decoder out.

## What the current screen does

`render()` walks the **entire** `catalog` (400–800 titles) and returns a
node for every row: 67–134 row groups and ~2,400–4,800 child nodes,
including one `text` node per title. The fixture framework realizes
"whatever `render()` returns … in full," and there is no windowing — so
all of that is instantiated at mount, and `onScroll` re-runs the whole
`render()` (with a `catalog.slice()` + `.map()` + thousands of object
literals) on every scroll step.

Mapping that to your three symptoms:

| Symptom | Cause |
|---|---|
| Slow to open, even after lazy images | 500+ view groups and thousands of child nodes built at mount on a slow CPU. Canvas renderers also rasterize **each distinct title string into its own texture** — 400–800 of them up front. Deferring the *image* decodes (what lazy-load did) removed one slice of the open cost; the node construction and the per-card text textures are still all paid at t=0. That's why it only helped "a bit." |
| Memory climbs the whole time you scroll | Every row is in the returned tree permanently. As a row scrolls into view its poster texture is uploaded — `width × height × 4` bytes, and because `src` is `item.artworkUrl` (the **master** rendition) a ~2000×3000 poster is a **~24 MB texture** for a 280×400 slot. Nothing is ever released. |
| Never drops when you scroll back up | Nothing left the node tree, so no texture is unreferenced, so the renderer's LRU eviction has nothing it's allowed to reclaim. Eviction is a backstop for navigation history, not a license to overfill one screen. The working set only grows until the platform watchdog kills the app. |
| Instant on a laptop | Desktop has ~100× the RAM and texture budget and a fast CPU/GPU. The code is *correct*; it just assumes desktop-class headroom a ~1 GB TV SoC (30–40 MB total texture budget) doesn't have. |

Near-viewport lazy loading, layered on top of this, defers *when* each
poster's texture is created but not *whether* it is kept. The row node
that owns it never leaves the tree, so the texture it references is never
eligible for release. Lazy-in without release-out still only grows.

## Texture budget check

- **Now**, worst case: up to 800 poster textures, master-sized. Even at a
  modest 300×450 that's 800 × 540 KB ≈ **430 MB**; with real masters it's
  many times that — against a **30–40 MB whole-app** budget. Plus
  ~25 MB of title-text textures (800 strings, each its own texture).
- **Redesigned**: image window ≈ 5 rows × 6 = **~30 posters** ×
  ~540 KB ≈ **~16 MB**, plus ~30 short title textures and one shared
  placeholder. Under half the budget, and **flat** — a row leaving the
  window frees its textures. One `render()` pass touches ~5 pooled row
  views, not 500+.

## How it should be built: a virtualized, recycling list

> The full catalog exists as **data**. Only a window of it exists as
> **views and textures**.

The revised `catalog-screen.js` in this folder keeps the same public
surface (`constructor(catalog)`, `render()`, `onScroll()`, plus
`mount()` / `unmount()`) and does the following.

### 1. Window the rows — realize a band, not the catalog

From `scrollY`, compute the visible rows (~3 at a 430 px pitch in a
1080 px viewport). Realize:

- **View window** = visible ± 1 row — these rows have view nodes.
- **Image window** = visible ± 1 row — these rows also have poster
  textures. (Kept equal here; widen the image margin only if profiling
  shows spare budget.)
- **Everything else** — data only. No nodes, no textures, no requests.

Rows outside the view window are simply not returned from `render()`, so
their textures become unreferenced and the LRU can reclaim them. That is
the release-on-leave that makes memory plateau.

### 2. Recycle a fixed pool of row views — don't create/destroy

Per-step view construction/destruction at the window edges is exactly the
allocation churn a TV's GC can't absorb under a held d-pad key. Instead
the screen keeps a fixed pool of ~5 row views and **rebinds** one when
the window moves: on rebind it clears each tile's image to `null` *first*
(so the previous poster can't flash and a late load can't paint into the
recycled slot), then sets the new title and `src`. View count and
allocation rate stay constant regardless of catalog size.

### 3. `onScroll` / `render` allocate nothing in the steady state

Per scroll step: update `scrollY` and set each pooled row's `y` offset (a
cheap transform, no per-child relayout). The root node and its children
array are reused in place. The costlier rebind pass — title and `src`
writes — runs only when a row actually crosses a view/image boundary (a
few times per second), and even then it's pure field writes into nodes
that already exist. No `slice` / `map` / object literals on the hot path.

### 4. Request slot-sized renditions, never the master

The slot is 280 px wide on a 1080p UI. The code asks the image service
for a canonical rendition at or just above that (`?w=300`), quantized to
one of three app-wide widths so every card shares the URL — the renderer
dedupes textures by URL and the HTTP cache stays warm. This is the single
highest-leverage change: it cuts each poster from a multi-MB
decode + texture to ~300×450×4 ≈ **540 KB**, and a smaller source also
decodes faster — which is the part of "the decoder feels slow" that's
real and fixable. (Decode cost is set by **source** dimensions, not slot
size: a master poster costs the same decode whether it's shown full-screen
or in a thumbnail.) If the backend has no resizing service, that's a
backend gap to raise — client-side downscaling can't fix the decode cost.

### 5. Cheap placeholders and a real failure state

Behind every poster is one shared solid `rect`. It shows while the image
loads and stays visible if the load fails — with the title text it's a
labelled card, not a permanent black rectangle the user can't dismiss.
Never a second image request per slot for a fallback.

### 6. Startup ordering

`mount()` renders the shell and the first viewport's placeholders, loads
posters for the **visible** band only, then widens to the margin one
frame later via `raf`. The mount burst of decodes stays bounded so it
isn't competing with the entry animation on a slow core. Nothing below
the fold is fetched or instantiated at mount.

### 7. Remembered state lives with the screen

`scrollY` stays on the screen object, so leaving and returning is instant
and re-realizes from data. Recycled row views carry no per-item state.

### 8. Letter-jump / "back to top"

Any non-adjacent jump is handled as a window teleport: the new `scrollY`
recomputes the window from scratch, placeholders render immediately, and
the image window fills in. (Focus-during-window-move UX is in
`tv-focus-and-navigation`.)

## Verify on the floor, not the ceiling

These figures are for the low-RAM TV device class (~1 GB RAM, UI at
1080p, 30–40 MB texture budget). Confirm on real target hardware:

- **Texture memory** while scrolling the catalog end to end, then back —
  should rise to the image-window plateau (~16 MB) and stay flat, not
  staircase.
- **Heap-allocation timeline** during a hold-to-scroll gesture — should
  be near-flat (no sawtooth).
- **Before/after heap snapshots** for enter-then-leave the screen — diff
  near zero.
- **Open time** with the row window in place — the node-construction and
  text-texture cost at mount drops from 400–800 cards' worth to ~5 rows'.

Emulator and laptop numbers only establish the shape; only an on-device
run establishes whether it's fast enough.
