# Hero carousel stutter: it isn't requestAnimationFrame

Short version: `requestAnimationFrame` is not the culprit, and switching to
`setInterval` will make it worse. The Web Worker experiment changed nothing
because the arithmetic it moved off the main thread was never the cost. The
real cost is **texture work and garbage collection happening on every frame**,
and the fade looking uneven because it is **driven by frame count instead of
elapsed time**.

## Why the laptop is fine and the TV isn't

The laptop has a fast image decoder, gigabytes of VRAM, and a wide bus to the
GPU. A TV SoC has a slow decoder, a tight texture-memory budget, and a narrow
upload path. Anything that re-decodes or re-uploads a full-screen image is
invisible on the laptop and a dropped frame on the TV. Same code, very
different budget.

## What the current `hero-carousel.js` actually does wrong

1. **It re-sends `src` for the 1920x1080 backdrop on every frame.**
   ```js
   this.patch({
     Backdrop: { src: filtered[0].backdropUrl, alpha: this.opacity },
     Logo:     { src: filtered[0].logoUrl,     alpha: this.opacity },
   });
   ```
   `patch` runs ~60x/sec and every call hands the renderer a texture URL.
   Re-supplying a `src` forces a cache re-resolve, and on any miss or LRU
   eviction it re-decodes and re-uploads an ~8 MB RGBA texture to the GPU.
   That upload spike on the advance frame is exactly the "whole screen
   hitches every time it advances" symptom. `src` should be assigned **once
   per slide change**, never inside the animation loop. Only `alpha` should
   move per frame.

2. **The fade is frame-counted, not time-based.**
   ```js
   this.opacity = this.opacity + (target - this.opacity) * 0.08; // fixed 8%/frame
   this.timeInPhase = (this.timeInPhase || 0) + 16;              // "16 ms" per frame
   ```
   On the TV the loop runs at ~30 fps and drops frames under load. A fixed
   8% step per frame then advances the fade in uneven jumps, and the phase
   timer drifts (it counts 16 ms for a frame that actually took 33–50 ms).
   That unevenness *is* the stutter. The fade must compute progress from a
   real timestamp: `p = (now - start) / FADE_MS`, clamped, run through an
   easing curve. Then it looks identical at 60, 30, or a stuttery 24 fps.

3. **It allocates garbage every frame.**
   ```js
   const filtered = this.slides
     .map((s, i) => ({ ...s, index: i }))   // 8 fresh objects
     .filter((s) => s.index === this.current); // + 2 arrays
   const delta = { value: ... };               // + object literal
   ```
   This whole dance just to reach `this.slides[this.current]`. ~500+
   short-lived objects per second on a small-heap device produces periodic
   stop-the-world GC pauses — the intermittent hitching between advances.
   Index directly and keep zero allocations in the loop.

4. **The loop never stops.** `raf(step)` reschedules forever, so items 1–3
   run for the full ~4-second hold too, when nothing is visually changing —
   and it keeps running after the component leaves the screen. There is no
   `unmount()` to cancel it.

## On rAF vs setInterval on TV browsers

`requestAnimationFrame` on webOS, Tizen, Fire TV, RDK, and Android TV WebViews
is reliable. It commonly caps at 30 fps and throttles hard when the app is
backgrounded — both are correct behavior telling you the true frame budget —
and it hands you an accurate timestamp so you can be frame-rate independent.

`setInterval(fn, 16)` on a 30 fps panel fires roughly twice per painted frame:
half the callbacks are wasted, none are aligned to the panel refresh (so the
cross-fade visibly beats against vsync), it keeps firing while the app is
suspended, it still runs on the same main thread as the texture upload, and it
gives you no frame time. It removes none of the real costs and adds new ones.

## The Web Worker result, explained

`(target - opacity) * 0.08` costs nanoseconds; moving it to a worker saves
nothing and adds postMessage latency. A worker can't decode textures, can't
call `patch`, and can't relieve main-thread GC, so it can't touch any of the
four problems above. "No change" was the expected result.

## What the revised file does

- **Two stacked layers** (`BackdropA/LogoA` and `BackdropB/LogoB`). A
  cross-fade only ever animates `alpha` on existing layers.
- **`src` assigned once per advance**, on the hidden layer, a couple of
  frames before the alpha ramp so its decode/upload overlaps the tail of the
  hold instead of spiking mid-fade. If your renderer has an explicit
  preload/decode call, that's the place to use it.
- **Time-based easing** from `performance.now()` — smooth at any real frame
  rate.
- **Zero allocation in the fade loop**: the per-layer style objects and the
  patch object are built once when a fade starts and mutated in place.
- **Idle between fades**: a `setTimeout` for the ~5s hold, no rAF wakeups
  during it. rAF is pumped only while a fade is in flight.
- **`unmount()` cancels everything** — wire it to your `visibilitychange` /
  platform pause handler as well so a backgrounded home screen does no work.
- After each fade the outgoing layer's `src` is cleared so its full-screen
  texture can leave the renderer's LRU cache; only ~2 backdrops stay resident
  across a long browsing session.

## If it still drops frames after this

Cross-fading two full-bleed 1080p photo layers is 2x full-screen overdraw plus
a blend for the duration of the fade. On the weakest panels even that is tight.
Options, cheapest first:

- Shorten the fade to ~250 ms (fewer blended frames).
- **Dip to black**: fade the visible layer down to a black `rect`, swap `src`
  while fully black, fade back up. Never composites two photo layers.
- Hard-cut the backdrop and only cross-fade the (small) logo.

Also confirm the backdrop asset is served at exactly 1920x1080 device pixels,
not a 4K master the renderer downsamples — that makes the first decode much
cheaper and keeps texture memory down.
