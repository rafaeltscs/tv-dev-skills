# Why the hero carousel is janky on TV (and fine on your laptop)

There are three separate problems stacked on top of each other. Two of them cause
the fade *stutter*; one causes the whole‑home‑screen *hitch on advance*. Your
laptop hides all three because it has a fast CPU/GPU, a fast image decoder, a
warm HTTP cache, and a garbage collector that can clean up in the gaps between
frames. A low‑end TV SoC has none of that.

---

## 1. The per‑frame loop allocates garbage on every frame → GC stutter

Inside `step()` (which runs ~60x/sec) the code does this **every frame**:

```js
const delta = { value: (target - this.opacity) * 0.08 };   // 1 object

const filtered = this.slides
  .map((s, i) => ({ ...s, index: i }))   // N spread-copied objects + 1 array + 1 closure
  .filter((s) => s.index === this.current); // 1 more array + 1 more closure
```

For ~8 slides that is roughly **8 new objects + 2 arrays + 2 closures + 1 wrapper
object, every 16 ms** — on the order of 600–800 short‑lived allocations per
second, produced solely to look up `this.slides[this.current]`.

On a TV the JS heap is small and the collector is effectively stop‑the‑world.
Those allocations fill the nursery every couple of seconds and the resulting
minor GC pauses (5–30 ms each) land *in the middle of the fade*, which is exactly
when you can see them: the opacity ramp freezes for a frame or two and jumps.
On your laptop the same collection finishes in well under a frame and you never
notice.

`map().filter()` is also just the wrong tool here — the slide index is already
known (`this.current`), so this is O(N) allocation to avoid an O(1) array index.

## 2. `patch({ src })` runs every frame → texture churn, and a synchronous decode on advance

```js
this.patch({
  Backdrop: { src: filtered[0].backdropUrl, alpha: this.opacity },
  Logo:     { src: filtered[0].logoUrl,     alpha: this.opacity },
});
```

The `src` is written on **every frame**, even though it only changes once every
~5 seconds. Re‑assigning `src` asks the renderer to (re)resolve, (re)decode and
(re)upload a **1920×1080** texture. Best case the renderer dedupes it and you
just waste cycles; worst case you get repeated GPU uploads.

The real damage happens on advance. When `this.current` finally increments, the
*next* backdrop has never been touched before, so on that one frame the renderer
has to: fetch the image (or read it from disk cache), **decode a full 1080p
JPEG**, and **upload it to a GPU texture** — all synchronously with the frame
that swaps it in. A 1920×1080 decode is ~5–15 ms on a laptop but **50–150 ms on
a TV SoC**, and the texture upload stalls the render thread on top of that.
That single blocked frame is the "whole home screen hitches every time it
advances." Nothing is preloaded, so it happens on every transition.

(If your CDN serves the backdrop larger than 1920×1080 — e.g. a 4K master — it is
even worse: per the framework notes the texture is decoded at the source image's
intrinsic size, not the node size, so you pay a 3840×2160 decode and 4× the
texture memory to fill a 1080p panel.)

## 3. The animation is frame‑rate‑locked → coarse, slow fade when the TV drops frames

```js
this.opacity = this.opacity + (target - this.opacity) * 0.08;  // per-frame lerp
this.timeInPhase = (this.timeInPhase || 0) + 16;               // assumes 60fps
```

Both the easing and the phase clock assume a solid 60 fps. When the TV dips to
30–40 fps (which #1 and #2 guarantee), the fade advances at half the intended
rate and in visibly coarser opacity steps, and the "4000 ms" hold is really
"4000 ticks × whatever the real frame time is." So even the frames that *aren't*
GC‑blocked look choppy and the timing drifts.

## 4. (Bonus) the loop never stops

`advanceLoop()` calls `raf(step)` forever. There is no `unmount()`, nothing keys
off visibility, and the raf handle is never stored. Navigate away from the home
screen and this keeps decoding images, patching a detached subtree and
generating GC pressure for the rest of the session; come back and you can stack a
second loop. On a long‑lived TV session that is a slow leak of frame budget.

---

## The fix

Principles: **do no work while a slide is held, allocate nothing in the frame
loop, and move image decode off the frame that needs it.**

1. **Zero allocation in `step()`.** Index the slide directly
   (`this.slides[this.current]`). No `map`, no `filter`, no spread, no `{ value }`
   wrapper. All helpers (`ease`, `clamp`, `now`, `preload`, `sized`) are
   module‑level functions defined once.

2. **Idle between transitions.** A slide is visible and unchanging for ~4 s, so
   during that window there is **no `raf` loop and no `patch` at all** — just a
   single `setTimeout` for the next advance. Steady‑state CPU and GC drop to
   zero, so the home screen is calm except during the ~600 ms fade.

3. **Preload the next slide before fading.** `beginTransition()` decodes the
   upcoming backdrop + logo via an off‑DOM `Image` + `img.decode()` and only
   starts the opacity ramp once they are ready. The frame that swaps `src` then
   does no decode and no first‑time upload — the hitch on advance is gone.

4. **Write `src` only on the swap; write `alpha` only while fading.** `setAlpha()`
   dedupes against the last value so no redundant `patch` goes out. During
   `hold` nothing is written.

5. **Time‑based easing.** Opacity is `ease(elapsed / FADE_MS)` using real
   timestamps from `performance.now()`, so the fade takes the same wall‑clock
   time and looks identical at 60, 40 or 30 fps.

6. **Request art at display size.** `sized(url, w, h)` appends the target
   dimensions so the CDN returns a 1920×1080 backdrop (and a 2× logo), never a 4K
   master. Adjust the query params to match your CDN.

7. **Lifecycle.** `mount()` shows the first slide with one patch and schedules the
   first advance. `unmount()` and `visibilitychange` cancel the timer and
   invalidate the running loop via a generation token (`this.loopToken`), so no
   stale `raf` callback and no stacked loops survive a navigation or a
   backgrounded app.

### What to expect after the change

- Between slides: no frame activity, so unrelated home‑screen scrolling/focus is
  no longer competing with the carousel.
- During the fade: a smooth, allocation‑free opacity ramp; the only GC is
  whatever the rest of the app produces.
- On advance: the backdrop is already decoded, so the swap is a single `alpha`
  reset with no decode/upload spike.

### Verifying on device

- DevTools Performance trace on the TV (or `PerformanceObserver` for `longtask`):
  the periodic 5–30 ms GC sawtooth during the fade should be gone, and the
  100 ms+ task on advance should drop to a normal frame.
- Watch texture memory: it should stay flat at two in‑use backdrop textures
  instead of climbing/thrashing.
- Force the renderer to ~30 fps and confirm the fade still takes ~600 ms and
  looks smooth (proves the time‑based easing).

The revised file is `hero-carousel.js` alongside this document.
