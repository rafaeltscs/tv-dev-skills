# Hero carousel jank on TV — diagnosis and fix

## Short version

Two separate things are going wrong, and both are invisible on a laptop:

1. **The fade stutters** because the per-frame loop allocates ~15 objects/
   arrays/closures *every frame*. A desktop generational GC sweeps that for
   free; a TV SoC's slow cores take a few-ms minor-GC pause that lands
   inside the 16–33 ms frame budget, so you drop frames at random.
2. **The whole screen hitches when it advances** because each advance
   swaps a full-bleed **1920×1080 backdrop** into a live element. That is
   an ~8 MB texture upload plus a full-frame JPEG decode. If it happens
   synchronously on the UI thread at the moment of the swap — and nothing
   here preloads it — it blocks the frame. If `backdropUrl` points at a
   master/4K asset it is far worse (the texture decodes at the source's
   intrinsic size, ~33 MB and a multi-hundred-ms decode).

Neither is a logic bug, so neither shows up in review. Both reproduce only
on the target hardware.

---

## What's in the code, line by line

### 1. Per-frame allocations (the fade stutter)

Everything inside `step()` runs on every `raf` tick while the banner is on
screen. In the steady state it must allocate **nothing**. It currently
allocates:

| Code | Allocates per frame |
|---|---|
| `const delta = { value: ... }` | one wrapper object for a single number |
| `this.slides.map((s, i) => ({ ...s, index: i }))` | a new array + **one spread-copy object per slide** (~8) + the `.map` closure |
| `.filter((s) => s.index === this.current)` | another array + another closure |
| `this.patch({ Backdrop: {...}, Logo: {...} })` | a fresh 3-object config tree every frame |

That is roughly 15 allocations per frame — about 900/second of pure churn —
to accomplish something that is just `this.slides[this.current]`. On the
heap profile this is a sawtooth (grow, cliff, repeat); each cliff is a
pause.

The skill's rule: *"No allocations in per-frame code… Hoist and reuse; pool
what genuinely churns."* And specifically: `.map`/`.filter`/spread and
"patch/setState-style calls with a fresh config object per frame" are
named allocation sources.

### 2. `src` is set on every frame, not just on advance

The per-frame `patch()` includes `src: filtered[0].backdropUrl` and
`src: filtered[0].logoUrl` on every tick. Even when the URL string is
unchanged, handing `src` to the renderer every frame invites it to
re-resolve/re-check the texture 60×/second. `src` should be touched
**only when the slide actually changes**; per frame, only `alpha` moves.

### 3. The advance does a synchronous full-screen texture swap (the hitch)

When `opacity <= 0.02`, `this.current` advances and the next frame's
`patch()` points `Backdrop` at a new 1920×1080 image with nothing having
fetched or decoded it beforehand. That decode/upload is the home-screen
hitch. Skill: *"Decode on the UI thread shows up as a hitch exactly when
a rail of new posters scrolls into view… Load the visible window first,
then trickle the rest."* Full-screen art needs to be **loaded into a
hidden layer and decoded off-thread before** you start showing it.

### 4. The backdrop source size is never constrained

`backdropUrl` is used raw. On a TV the graphics plane here is 1080p even
on a 4K panel (`this.viewport` is 1920×1080, and the fixture says so
explicitly), so the correct request is a **1920-wide rendition** — never
the master. Skill: *"Request the rendered size, never the master,"* and
*"Size for the UI resolution, not the panel."* Raw master in a full-screen
slot is a decode-cost and texture-memory bug even when the pixels
displayed look right.

### 5. Frame-rate-dependent timing

`this.opacity += (target - this.opacity) * 0.08` and
`this.timeInPhase = (this.timeInPhase || 0) + 16` both assume 16 ms
frames. On a TV running the loop at 30 fps the fade is half speed and the
"4000 ms" hold is really ~8 s. Drive timing from the real timestamp
`raf` passes to the callback.

### 6. The loop never stops — long-session waste / leak

`mount()` starts `advanceLoop()`, which re-arms `raf(step)` forever with
no stop condition and there is no `unmount()`. When the user navigates off
the home screen the loop keeps ticking: it keeps calling `patch()`, keeps
allocating, and keeps decoding a new 8 MB backdrop every ~4 s behind
whatever screen is now in front — and both full-screen backdrop textures
stay resident. Skill: *"Listeners and timers registered on screen enter
must be removed on screen exit… memory use should plateau during a long
browsing session, not climb."*

### 7. Minor

- `this.timeInPhase` is `undefined` on the first tick (`undefined > 4000`
  is `false`), so the first cycle's timing is accidental, not designed.
- It's a dip-to-black on one element, not a cross-fade — the comment says
  cross-fade. A real cross-fade needs two layers anyway (see the fix),
  which also gives you the place to preload the incoming backdrop.
- `map().filter()` to find one item by index is just
  `this.slides[this.current]`.

---

## The fix

Principles applied: animate only `alpha`; touch `src` only on advance;
preload the next slide into a hidden second layer so the swap never
blocks; zero allocation in `step()` (module-level scratch objects,
method bound once); real-time-based timing; request a 1920-wide
rendition; stop the loop and drop the textures in `unmount()`.

Structure: **two stacked layers** (`Layer0` / `Layer1`), each with a
`Backdrop` + `Logo`. One is the visible "front"; the other is pre-armed
with the upcoming slide at `alpha: 0`. A cross-fade just ramps the two
alphas past each other, then the roles swap and the new back layer is
armed with the following slide. At most two full-screen backdrops are
resident (~16 MB, only during the ~600 ms fade; ~8 MB the rest of the
time) instead of risking 8 × 8.3 MB if each slide got its own element.

Per-frame cost in the fade is now: two numeric `alpha` writes into
reused scratch objects and one `patch()` call with a reused tree — no
arrays, no closures, no spreads, no new objects. During the hold phase
the tick only compares two numbers.

See `hero-carousel.js` for the revised component. Key points in it:

- `sizedBackdrop(url, 1920)` — adapt the parameter to your image service;
  the non-negotiable part is "ask for a 1920 rendition, not the master."
  Drop to 1280 if the app ever runs its UI plane at 720p.
- `armNextSlide()` sets `src` on the hidden layer well before the fade,
  so fetch + decode happen off-thread. On a real framework, gate the
  start of the fade on the texture's `load`/`decode` event (noted in a
  comment) so a slow network can't produce a fade to a blank layer.
- `step(now)` is bound once in the constructor; it early-returns and
  does **not** re-arm `raf` when `this.running` is false.
- `unmount()` clears `running` and nulls both layers' `src` so the
  renderer can reclaim the ~8 MB backdrop textures behind the next
  screen.
- Timing (`HOLD_MS`, `FADE_MS`) is compared against `now` from the
  `raf` callback, so it behaves the same at 30 fps and 60 fps.
- Single-slide input skips the loop entirely.

## Verify on the target, not the laptop

This was written for the low-RAM TV device class (≈1 GB RAM, ~30–40 MB
total texture budget, UI at 1080p). Confirm on a real device by heap-
profiling one full rotation of the carousel: the allocation timeline
during the fade should be flat, and memory should return to baseline
after navigating away from the home screen. A clean profile on a desktop
browser proves only the *shape*, not that it's fast enough.
