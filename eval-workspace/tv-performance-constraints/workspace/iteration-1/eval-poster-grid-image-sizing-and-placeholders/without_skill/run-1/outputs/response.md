# Why it works on your laptop and dies on the TV

Your laptop has gigabytes of GPU memory, a fast image decoder, and a fast
network. The 2020 TV has a few hundred MB of memory for the whole app, a
slow single-threaded JPEG decoder, and a slow NIC. The component is doing
three things that only the laptop can absorb.

## 1. You're loading a 2000x3000 master into a 260x390 cell

The framework note is the key detail:

> the texture is decoded at the source image's intrinsic pixel size, not the
> node size

So every poster cell uploads a **2000 x 3000 x 4 bytes = ~24 MB** texture
and pays a multi-hundred-millisecond CPU decode for it, even though it's
drawn in a 260x390 box. That decode time *is* the slow fade-in.

**Fix:** the image service accepts `?w=` and `?h=`. Request the image at
cell size:

```
item.artworkUrl + '?w=260&h=390'
```

A 260x390 texture is ~0.4 MB and decodes almost instantly. That's roughly a
**60x** cut in both memory and decode cost per poster. (If posters look soft
from the couch you can go to `?w=390&h=585` — 1.5x — for 2.25x the memory.
1x is the right default for a 1080p render pipeline.)

## 2. You realize all 120 posters at once

`render()` returns a node per item and the framework says:

> whatever `render()` returns is realized in full ... no automatic
> windowing/recycling

So all ~120 textures are live at the same time. Even *after* the resize fix
that's 120 x 0.4 MB, but the real problem is what happens across categories:
each new grid you open stacks another grid's worth of textures on top of the
last, and nothing frees the old ones. With the un-resized masters that's
120 x 24 MB ≈ **2.8 GB** per category — you OOM after browsing two or three.
That's your crash.

**Fix:** window the grid. Track the scroll offset in `onScroll(offset)`,
compute which rows are on screen, and only return nodes for those rows plus
a 2-row buffer above and below. The realized texture set is now bounded
(~7 rows x 5 = 35 posters, ~14 MB) no matter how long the list is or how far
you scroll. Cells load fast because there are only a handful in flight at
once — which also clears up the blank-while-scrolling symptom.

Keep the cells at their original absolute positions and report the full
content height on the container so the framework's scroll math doesn't
change; you're just not realizing the off-screen rows.

Two supporting details:

- `onScroll` fires many times per second while the d-pad is held. Only
  re-render when the first visible row actually changes, not on every tick —
  otherwise you're rebuilding the whole node tree dozens of times a second
  and generating garbage for the GC to chase (another source of TV jank).
- Build the resized URL strings once in the constructor, not inside
  `render()`, so you're not allocating ~35 strings per scroll frame.

## 3. Nothing to look at while a texture uploads

Even with 1 and 2 fixed, there's a beat between a cell entering the window
and its texture being ready. Right now that beat shows as a blank cell.

**Fix:** put a `rect` (a cheap solid fill, no texture upload) behind every
poster. The cell shows a neutral placeholder color immediately and the
poster draws on top when it's decoded.

## 4. Free textures when you leave

Implement `unmount()` to drop the component's references to `items` /
`posterUrls` so the framework can release the textures this grid uploaded
when you switch categories. Without it, every category you visit leaks a
grid's worth of textures — this is what makes the crash happen "after
browsing a few categories" specifically.

---

## What changed in `poster-grid.js`

| Symptom | Cause | Change |
| --- | --- | --- |
| Images fade in slowly | 2000x3000 master decoded per cell | Append `?w=260&h=390`; build URLs once in constructor |
| Blank cells while scrolling | All 120 textures loading; nothing drawn meanwhile | Row windowing (visible rows + 2-row buffer); placeholder `rect` under each poster |
| Crash after a few categories | ~2.8 GB of textures per grid, never freed | Windowing bounds the live set to ~35 posters; `unmount()` drops references so textures free |
| (Latent) scroll jank / GC | Full tree rebuilt on every `onScroll` tick | Re-render only when the first visible row changes |

Constants at the top (`BUFFER_ROWS`, `CELL_W/H`, pitches) are exposed so you
can tune the buffer or bump to 1.5x art without hunting through the render
code. `_requestRender()` guards for a few likely framework method names
since the fixture doesn't document how a re-render is triggered — wire it to
whatever your host actually uses.
