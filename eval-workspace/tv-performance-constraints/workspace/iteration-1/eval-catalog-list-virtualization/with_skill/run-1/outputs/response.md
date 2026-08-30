# "Browse all" — why it's slow, and how to build it instead

## What the current screen does

`render()` walks the entire `catalog` (400–800 titles) and returns a node
tree for **every** row: ~70–135 row groups, ~2,400–4,800 tile sub-nodes,
and one `type: 'image'` per title whose `src` is `item.artworkUrl` — the
master rendition. There is no windowing (the fixture framework realizes
"whatever `render()` returns … in full"), and `onScroll` re-runs that
whole `render()` on every scroll step.

That maps directly onto the three symptoms:

| Symptom | Cause |
|---|---|
| Several seconds to open on the TV | 500+ view groups and thousands of child nodes instantiated at mount, on a slow CPU, plus hundreds of full-size image decodes kicked off at once. |
| Memory climbs the whole time you scroll down | Every row is in the returned tree permanently. As each row scrolls into view its `<image>` texture gets uploaded (`width × height × 4` bytes — a ~2000×3000 master poster is a **~24 MB texture** regardless of the 280×400 slot), and nothing is ever released. |
| Never drops when you scroll back up | Nothing left the tree, so no texture is unreferenced, so the renderer's LRU eviction has nothing to reclaim. The working set only grows until the platform watchdog kills the app. |
| Instant on a laptop | Desktop has ~100× the RAM and texture budget and a fast CPU/GPU. The code is *correct*; it just assumes desktop-class headroom that a ~1 GB TV SoC (30–40 MB total texture budget) does not have. |

A held d-pad key also makes `onScroll` → `render()` rebuild the full node
tree many times per second, with a `catalog.slice()` + `.map()` +
hundreds of object literals each time — steady-state allocation churn that
turns into GC hitches on a TV.

## How it should be built: a virtualized, recycling list

> The full catalog exists as **data**. Only a window of it exists as
> **views and textures**.

### 1. Windowing — realize a band, not the catalog

Track three ranges of rows, recomputed from `scrollY`:

- **Visible** — rows in the 1080-px viewport (~3 rows at 430 px pitch).
- **View window** — visible ± 2 rows. These rows have view nodes.
- **Image window** — visible ± 1 row. These rows also have image
  textures. Rows in the view window but outside the image window keep
  their view but show only the placeholder rect.
- **Everything else** — data only. No nodes, no textures, no requests.

As the window moves (one discrete step per key press on a TV — no flings,
no scrollbar), rows entering the view window get a view and rows leaving
it release textures and return their view to a pool. Vertical
virtualization is the whole point here; horizontal doesn't matter at 6
tiles per row.

### 2. Recycle a fixed pool of row views — don't create/destroy

Per-step view construction/destruction at the window edges is exactly the
per-frame allocation the GC can't absorb on a TV. Instead keep a fixed
pool (~8 row views for ~3 visible rows + margin) and **rebind** a view
when it's reused: on rebind, clear each tile's image to the placeholder
*first* (so the previous poster can't flash), invalidate any in-flight
load for the old item, then set the new `src` and title. View count and
allocation rate stay constant regardless of catalog size.

### 3. `onScroll` does almost nothing

Per scroll tick: update `scrollY` and translate the container (`y`
offset — a cheap transform). Only when the integer row index actually
changes (a few times per second) does it re-sync the window, and that
re-sync early-outs if no row crossed a view/image boundary. No
`slice`/`map`/object literals on the hot path — steady-state silence.

### 4. Request slot-sized renditions, never the master

The slot is 280 px wide on a 1080p UI. Ask the image service for the
canonical rendition at or just above that (e.g. `?w=300`), quantized to
one of 3–4 app-wide widths so every card shares the URL (the renderer
dedupes textures by URL; the CDN/HTTP cache stays warm). This cuts each
poster from a multi-MB decode + texture to ~300×450×4 ≈ **540 KB**, and
it's the single highest-leverage change. If the backend has no resizing
service, that's a backend gap to raise — client-side downscaling doesn't
fix the decode cost.

### 5. Release on leave

A row leaving the view window sets every tile's `src` to `null` (frees the
GPU texture) and drops/guards any queued or in-flight load, then parks the
view in the pool. Memory now **plateaus** during a long scroll instead of
climbing, and scrolling back up re-realizes from data (instant) with the
remembered scroll offset.

### 6. Cheap placeholders and a real failure state

Behind every poster is one solid `rect` (a shared color, ~free). It shows
while the image loads and stays visible if the load fails — with the title
text it's a labelled card, not a permanent black rectangle the user can't
dismiss. Never a second image request per slot for a fallback.

### 7. Bounded decode concurrency + startup ordering

At mount, render the shell and the first viewport's placeholders
immediately, then load images for the visible window only, capped at ~6
concurrent decodes so the burst doesn't saturate the CPU during the entry
animation. Margin rows and everything below the fold are realized later,
on scroll / idle — not at mount. Don't fetch or instantiate anything the
first paint doesn't need.

### 8. Remembered state lives with the screen, not the view

`scrollY` (and a focused-index if focus is added) are stored on the
screen/data so leaving and returning is instant and focus restore works.
Recycled views carry no per-item state.

### 9. Data pagination (optional but recommended)

400–800 objects is tolerable to hold as pure data, but ideally page the
API too: fetch the next page when focus comes within ~one viewport of the
loaded edge, keep focus on the last real item while it loads, append
without re-laying-out realized rows, and guard against a held key firing
the fetch trigger repeatedly.

### 10. Letter-jump / "back to top"

Treat any non-adjacent jump as a **window teleport**: realize the new
focus row synchronously, show placeholders for its neighbours, and let the
image window fill in. (Focus-during-window-move UX is in
`tv-focus-and-navigation`.)

## Texture budget check

- **Current**, worst case: ~800 image textures, master-sized. Even at a
  modest 300×450 that's 800 × 540 KB ≈ **430 MB**; with true masters it's
  far higher — against a 30–40 MB whole-app budget.
- **Redesigned**: image window ≈ 5–6 rows × 6 = **~33 posters** ×
  ~540 KB ≈ **~18 MB**, plus ~48 short title textures and one placeholder.
  Roughly half the budget, and *flat* — rows leaving the window free their
  textures. One `render()` pass instantiates ~8 row views, not 500+.

## Verify on the floor, not the ceiling

These numbers are written for the low-RAM TV device class (~1 GB RAM, UI
at 1080p, 30–40 MB texture budget). They need confirming on real target
hardware: a heap-allocation timeline during a hold-to-scroll gesture
(should be near-flat), before/after heap snapshots for enter-then-leave
(diff near zero), and total texture memory staying flat while scrolling
the catalog end to end. Emulator/laptop numbers only establish the shape.

## Revised implementation

See `catalog-screen.js` in this folder — same fixture framework, same
public surface (`constructor(catalog)`, `render()`, `onScroll()`, plus
`mount()`/`unmount()`), with the windowing, recycling pool, two-tier
view/image window, slot-sized renditions, colour placeholders, release-on-
leave, and bounded decode queue described above.
