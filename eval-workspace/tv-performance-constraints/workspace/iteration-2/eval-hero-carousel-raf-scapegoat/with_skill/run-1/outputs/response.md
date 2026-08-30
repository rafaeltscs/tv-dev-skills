# Hero carousel stutter on TV — rAF is not the culprit

## Direct answer to the question

**Don't switch to `setInterval`.** `requestAnimationFrame` is reliable on
every TV browser you'll ship on, and `setInterval` would make this *worse*:

- **No vsync alignment.** A 33 ms interval on a 60 Hz panel drifts against
  the scanout, so frames land unevenly — you get beat-frequency judder even
  when every callback is cheap. rAF is handed to you aligned to the
  compositor.
- **It keeps firing when the app is backgrounded.** On TV the home screen
  gets suspended behind full-screen playback and app switches. rAF pauses;
  `setInterval` keeps running (burning CPU, generating heat) and then
  dumps a backlog of coalesced callbacks on resume.
- **It still isn't precise under load.** Timers clamp and coalesce exactly
  when the main thread is busy — which is the moment you care about.

Every serious TV UI stack (Lightning and friends) drives animation off
rAF. The primitive isn't the problem.

## Why the Web Worker experiment is the tell

You moved the easing math into a Worker and nothing changed. That's the
diagnostic, not a dead end. The "easing math" here is:

```js
const delta = { value: (target - this.opacity) * 0.08 };
```

One subtraction and one multiply — nanoseconds. Offloading it *had* to do
nothing. The frame budget is being eaten by two things that a Worker can't
touch and a different timer can't fix:

### Cause 1 — the fade stutter: garbage collection from per-frame allocations

`step()` runs on every rAF tick while the banner is on screen, and in the
steady state it must allocate **nothing**. It currently allocates, per
frame:

| Code | Allocated every frame |
|---|---|
| `const delta = { value: ... }` | a wrapper object for one number |
| `this.slides.map((s, i) => ({ ...s, index: i }))` | a new array + **one spread-copy object per slide** (~8) + the map closure |
| `.filter((s) => s.index === this.current)` | another array + another closure |
| `this.patch({ Backdrop: {...}, Logo: {...} })` | a fresh 3-object config tree |

That's roughly 15 allocations per frame — about 900/second — to compute
something that is literally `this.slides[this.current]`. On a heap profile
it's a sawtooth: grow, collect, repeat. Each collection is a few-ms pause
on a slow TV core, landing inside a 16–33 ms frame. The pauses aren't
correlated with any one line, so it reads as "random" stutter. On your
laptop the generational GC absorbs the same garbage for free.

This is the skill's rule 3 verbatim: *no allocations in per-frame code —
`.map`/`.filter`/spread and "patch/setState-style calls with a fresh
config object per frame" are named sources; hoist and reuse.*

### Cause 2 — the whole-screen hitch on advance: synchronous full-screen decode

Every advance points a **live** element at a brand-new, un-preloaded
**1920×1080 backdrop**. Regardless of the JPEG's file size, that's an
~8 MB texture upload plus a full-frame decode, and nothing here fetches or
decodes it ahead of time — so it happens on the UI thread at the instant
of the swap. That single blocked frame is the hitch, and it recurs on
every advance because every advance does it again. If `backdropUrl` is a
master/4K asset it's several times worse (the texture decodes at the
source's intrinsic size). The skill: *"Decode on the UI thread shows up as
a hitch exactly when a rail of new posters scrolls into view… load the
visible window first."* Full-screen art has to be armed on a hidden layer
and decoded **before** you start showing it.

### Contributing issues in the same file

- **`src` is written every frame**, not just on advance. Even an unchanged
  URL invites the renderer to re-resolve the texture 60×/s. Per frame,
  only `alpha` should move.
- **Full-res source, no rendition.** `backdropUrl` is used raw. The UI
  plane is 1080p (`this.viewport` is 1920×1080), so request a 1920-wide
  rendition — never the master (skill: *"request the rendered size, never
  the master; size for the UI resolution, not the panel"*).
- **Frame-rate-dependent timing.** `opacity += (target-opacity)*0.08` and
  `timeInPhase += 16` both assume 16 ms frames. If the TV runs the loop at
  30 fps the fade is half-speed and the 4 s hold becomes ~8 s — which by
  itself looks like "stutter." `this.timeInPhase` is also `undefined` on
  the first tick. Drive timing from `performance.now()`.
- **The loop never stops.** `mount()` starts it; there's no `unmount()`,
  and `step` re-arms `raf` unconditionally. After you navigate off the
  home screen it keeps ticking, keeps allocating, and keeps decoding a new
  8 MB backdrop every few seconds behind whatever screen is now in front,
  with both backdrop textures still resident. Skill: *"listeners and
  timers registered on screen enter must be removed on screen exit; memory
  should plateau during a long session, not climb."*
- **It isn't actually a cross-fade** — it's one element dipping to
  ~0 alpha and back, so you get a fade to black between slides. A real
  cross-fade needs two layers, which is also where the incoming backdrop
  gets preloaded.

## The fix (see `hero-carousel.js`)

Structure: **two stacked layers** (`A` / `B`), each a `Backdrop` + `Logo`.
One is the visible front; the other is armed with the upcoming slide at
`alpha: 0`. Phases are explicit:

1. **Dwell** (`setTimeout`, ~5 s) — no per-frame work at all. A multi-
   second wall-clock wait doesn't belong on a rAF loop.
2. **Preload** — `PRELOAD_LEAD_MS` before the fade, set `src` on the hidden
   layer so its backdrop fetches and decodes during the idle dwell.
3. **Fade** (`raf`, ~400 ms) — the only phase that runs per frame. Each
   tick does four numeric `alpha` writes into **reused scratch objects**
   and one `patch()` with a **reused config tree**: zero arrays, closures,
   spreads, or literals. Progress is `(performance.now() - fadeStart) /
   FADE_MS` eased — identical behaviour at 30 and 60 fps.
4. **Swap** — front/back roles flip; the old front layer's `src` is set to
   `null` so the renderer's LRU reclaims that ~8 MB backdrop. Full-screen
   art doesn't accumulate.

`unmount()` clears `running` (the loop stops re-arming), clears both
timers, and nulls every `src`. Single-slide input renders statically and
never starts a loop.

Peak texture cost: two 1920×1080 backdrops resident only during the
~400 ms fade (~16 MB) and briefly during the preload lead; ~8 MB the rest
of the time. `sizedUrl(url, 1920)` — adapt the parameter to your image
service; if the UI plane is ever 720p, drop it to 1280.

## Verify on the target, not the laptop

Written for the low-RAM TV device class (~1 GB RAM, ~30–40 MB total
texture budget, UI at 1080p). Confirm on a real device: heap-profile one
full rotation — the allocation timeline during the fade should be flat —
and check that memory returns to baseline after navigating away from the
home screen. A clean profile in a desktop browser proves the *shape*
only, not that it's fast enough.
