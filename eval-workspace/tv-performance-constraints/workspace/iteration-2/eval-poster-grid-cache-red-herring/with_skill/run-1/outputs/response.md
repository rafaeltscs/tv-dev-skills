# The renderer isn't leaking — the working set is ~100x the texture budget

## Short answer

There is no leak in the renderer. Every texture it is holding, it holds
because your code asked for it and nothing ever told it the texture could
be released. Three things stack up, and the cache change made the last one
worse:

1. **You load 2000x3000 master images into 260x390 cells.**
   `artworkUrl` returns the master; the resize params exist but "nobody
   uses them here." Texture residency is `width x height x 4 bytes`, set
   by the *source* dimensions, not the slot: `2000 x 3000 x 4 = 24 MB`
   per poster. A 260x390 slot needs ~0.5 MB. That is ~44x overspend on
   every single poster, before you count how many are alive.

2. **The grid realizes all ~120 posters at once and never releases the
   off-screen ones.** `render()` returns the entire `items` array, and
   the fixture realizes "whatever `render()` returns ... in full." One
   category on screen is `120 x 24 MB = ~2.9 GB` of texture, on a device
   whose entire graphics budget is 30-40 MB. It limps along at first
   only because the renderer's LRU is evicting frantically.

3. **Bumping the LRU cache to 500 entries removed the backstop that was
   keeping you alive.** The renderer's LRU can only free textures that
   nothing on-screen references — it exists to cover *navigation
   history*, not to make one over-budget screen fit. At 500 entries of
   24 MB masters that is a 12 GB ceiling. Each category you browse adds
   another ~120 textures of 24 MB that the cache now holds instead of
   dropping. Three or four categories in you are several GB deep and the
   platform watchdog kills the process — "crashes after browsing a few
   categories, no JS error." That is cumulative texture residency, not a
   leak, and raising the cache made the OOM arrive *sooner*.

Smooth on the dev laptop because a desktop GPU and CPU absorb 2.9 GB of
textures and 120 full-res JPEG decodes without a visible cost. That
measurement says nothing about the TV.

The blank cells and slow pop-in while scrolling are the same root cause
#1 seen from the CPU side: decoding a 2000x3000 JPEG costs the same
whether it lands in a 260px cell or full screen, and 120 of them fired at
mount saturate a slow core.

## Where the "leak" actually is

| Suspected | Reality |
|---|---|
| Renderer leaking textures | Renderer is doing exactly what the tree tells it. No leak. |
| Image LRU cache too small | Cache at 500 entries is *pinning* ~500 oversized textures across category switches. Actively harmful. |
| Component teardown leak | You already checked; with the grid windowed there is almost nothing left to leak, and this component holds no timers or listeners. |
| **Oversized source renditions** | **Root cause A: 24 MB/texture instead of ~0.5 MB.** |
| **No virtualization / no release on leave** | **Root cause B: the whole catalog resident, nothing evictable while on screen, residency grows per category.** |

## The fix (three changes in `poster-grid.js`)

### 1. Request a rendition sized for the slot
The image service accepts `?w=&h=`. A 260x390 slot on a 1080p UI wants
~300x450. Quantize to a small app-wide width ladder (150 / 300 / 450) so
URLs stay CDN- and texture-dedupe-friendly.
Result: `24 MB -> ~0.54 MB` per poster.

### 2. Virtualize the grid — realize a window, not the catalog
Keep all 120 items as *data*. Derive the visible row range from the
scroll offset and return from `render()` only the rows in view plus one
viewport of margin each way (~9 rows x 5 = ~45 cells). Rows outside that
contribute no nodes, no `src`, no texture. Scrolling moves the window;
rows that leave it drop out of the tree and their textures are freed.
Realized-window cost: `~45 x 0.54 MB = ~24 MB` plus ~45 small title
textures — inside the 30-40 MB budget, and *flat*: it does not grow as
you scroll or switch categories.

### 3. Solid-color placeholder per cell
A `rect` behind each image fills the cell instantly while the decode runs
and if it fails — no hole in the grid, no second image request.

## What to do about the cache
Stop tuning it. Size the renderer's texture cache in *bytes* to a
fraction of the device's graphics budget (or just leave it small). With
sized renditions plus windowing it goes back to being a navigation-
history backstop, which is all it was ever meant to be. 500 entries is a
liability.

## Numbers

| | Before | After |
|---|---|---|
| Per-poster texture | 2000x3000x4 = 24 MB | 300x450x4 = 0.54 MB |
| Posters realized per category | ~120 (all) | ~45 (window) |
| Texture residency, one category | ~2.9 GB | ~24 MB |
| After browsing 4 categories | unbounded growth -> OOM | ~24 MB, flat |
| Decodes fired at mount | ~120 full-res | ~45 slot-res, visible window first |

## Caveats
Written for the low-RAM TV class (~1 GB RAM, 30-40 MB texture budget),
UI at 1920x1080 per the fixture. Not profiled on device — verify with a
heap/texture profile over a scripted multi-category browse: residency
should plateau, not staircase. The fixture's toy renderer rebuilds the
node tree each `render()`; a production renderer should recycle item
views and swap `src` rather than recreate children (see the framework
skill).
