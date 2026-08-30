# Why it works on your laptop but dies on the TV

Your laptop has gigabytes of GPU memory and fast cores, so none of this bites.
A 2020 smart TV is a ~1 GB-RAM machine that shares that RAM with the OS and the
video decoder, gives you roughly **30-40 MB total for all textures**, and runs
the UI on slow cores. Three separate things in the component blow past that.

## 1. You're loading 2000x3000 masters into 260x390 slots

The image service returns a 2000x3000 master and the grid uses it as-is.

- **Texture memory:** a decoded image costs `width x height x 4` bytes,
  regardless of the JPEG's file size or the box you draw it in.
  2000 x 3000 x 4 = **~24 MB per poster**. `render()` realizes all ~120, so the
  screen asks for **~2.8 GB of texture uploads**. The platform watchdog kills
  the app. That is your "crashes after a few categories" (and each category
  mounts a fresh grid while the previous one's textures are still retained -
  see #3).
- **Decode CPU:** decoding a 2000x3000 JPEG takes the same few hundred
  milliseconds whether it ends up fullscreen or in a thumbnail, and it runs on
  a slow core. That is "images fade in slowly" and most of "cells stay blank
  while scrolling."

**Fix:** ask the image service for the size you actually draw. It already
accepts `?w=` / `?h=`. The cell is 260x390 on a 1080p UI, so request a 300x450
rendition: 300 x 450 x 4 = **~540 KB per poster**, ~45x less memory and a decode
that finishes in a frame or two.

Quantize, don't request exact per-slot pixels - every distinct URL is its own
CDN cache entry and its own texture in the renderer's pool. Pick 3-5 canonical
widths app-wide and round up. Here every slot is one size, so it is just the
single 300-wide rung.

## 2. Nothing is windowed - all 120 cells are realized at once

The grid is 24 rows / ~10,300px tall; about 3 rows are ever visible. The other
~21 rows of textures and views are built and paid for off screen. Even at the
correct rendition, 120 x 540 KB = ~65 MB, still double the budget.

**Fix:** realize only a window of rows around the viewport (visible rows plus
~one viewport of margin, biased toward the scroll direction) and leave the rest
as plain data. `onScroll` recomputes which row range is realized; rows that
leave the window drop out of the returned tree, so their textures become
evictable. The realized set is now ~5-6 rows x 5 = 25-30 cells
(**~13-16 MB**) and stays flat however far you scroll.

## 3. Nothing is released, and the whole tree is rebuilt every scroll step

- **No `unmount` cleanup.** Browsing category -> category mounts new grids while
  the previous ones' node trees (and the textures they reference) stay
  retained. Memory staircases up to the platform limit. The revised version
  drops its tree on `unmount`.
- **`render()` rebuilt all 120 nodes** - objects, nested `children` arrays,
  `.map()` closures - and it was the only code path, re-run on every
  `onScroll` (many times per second while a d-pad key is held). That is heavy
  per-frame allocation -> GC pauses -> scroll hitches. The revised version
  precomputes per-item data (URL, position) once in the constructor and
  rebuilds the tree only when the realized row range actually changes.

## 4. Blank and failed slots are holes

While a poster decodes the slot is empty; if the art 404s it is a permanent
black rectangle. **Fix:** one shared opaque placeholder `rect` behind every
image. No texture upload, no second request, renders instantly, and covers both
the loading gap and the failure state so the layout is never a hole.

## Texture budget, before vs after

| | Per poster | Realized at once | Total |
|---|---|---|---|
| Before | 2000x3000 -> ~24 MB | all ~120 | **~2.8 GB attempted -> OOM** |
| After | 300x450 -> ~540 KB | ~25-30 (window) | **~13-16 MB** + title text + 1 shared fill |

That lands under ~60-70% of a 30-40 MB budget, leaving room for the app chrome.

## What changed in the component

- `sizedUrl()` appends `?w=300&h=450` to the master URL (canonical size, kept
  stable so the CDN and texture cache dedupe).
- Constructor precomputes each cell's grid position, title, and sized URL once.
- `onScroll` only recomputes the realized row window (cheap); it does not
  rebuild the tree unless the window moved.
- `render()` returns a cached tree, rebuilt lazily, containing only cells whose
  row is inside `[firstRow, lastRow]` - visible rows plus ~one viewport of
  margin, extra on the leading edge.
- Each cell = shared placeholder `rect` + `image` at the sized URL + title
  `text`.
- `unmount()` drops the tree so the category's textures are released on leave.
- `OVERSCAN_ROWS` is the tuning knob: raise for smoother fast-scroll, lower for
  tighter memory.

## Limits of this fix / next steps

- **Recycling.** This still returns a declarative subtree and lets the host
  realize it. On a real renderer, go one step further: keep a fixed pool of
  ~30 card views and rebind `src`/`text` as the window moves (clearing each to
  the placeholder before rebind), rather than creating/destroying views at the
  window edge - that construction is itself per-step allocation. Each cell
  group already carries a stable `id` so a diffing host can rebind instead of
  recreate.
- **Stale loads.** The fixture exposes no load/error events, so I can't
  literally cancel the request for a card you scrolled past or guard a late
  callback from writing into a reused slot. With a real image API, do both.
- **Decode concurrency.** Also no hook here. On a real platform, load the
  visible row first and trickle the margin instead of kicking off ~30 decodes
  at mount.
- **Verify on device.** These figures are the arithmetic from the low-RAM TV
  budget, not a measurement. Profile texture memory and the JS heap on an
  actual 2020 unit (or the lowest model you support) with a scripted
  scroll-the-whole-grid plus hop-between-categories pass: memory should plateau
  during scroll and return to baseline after leaving the screen.
