SKILLS_CONSULTED: tv-performance-constraints

Why: The symptoms — smooth on a dev machine but stuttering scroll and slow-to-appear images on real TV hardware — are the exact "janky animation on the TV but fine on my laptop" / "images take forever to appear" failure mode this skill exists to diagnose, and none of the other skills (framework APIs, focus UX, per-platform lifecycle/DRM) are implicated by "it's the same code."

---

## What's going on

"Same code" is the clue, not the mystery. Your laptop is a fast multi-core CPU, a real GPU, and gigabytes of headroom. A smart TV is a budget SoC: slow CPU cores, a small GPU, and often only ~1 GB of RAM shared with the OS and the video decoder. On the low-RAM device class the whole app is expected to stay under ~200 MB, with only **30–40 MB total for GPU textures**. Many 4K sets even run the app's graphics plane at 720p or 1080p. Code that assumes desktop headroom isn't "buggy" — it just quietly relies on slack the TV doesn't have.

Two distinct things are failing, and they have different root causes:

### 1. Images "take ages to show up" — you're loading the master rendition

You almost certainly point `src` at the full-size image and let the layout scale it into a ~300×450 card. Three costs are paid per image, and the last two are set by the **source dimensions**, not the display size:

- **Decode** (compressed file → pixels) is CPU work. A 4000×6000 poster costs the same multi-hundred-millisecond decode whether it's shown full-screen or in a thumbnail. On a slow core that blocks long enough to drop frames — which is exactly why images "take ages" *and* why the scroll hitches at the moment a new row appears.
- **Residency**: the decoded bitmap becomes a texture at `width × height × 4` bytes. A 90 KB JPEG of a 1920×1080 backdrop is an **~8 MB texture**. File size is irrelevant.

On your laptop the decode is a few ms and the memory is free, so you never noticed.

**Fixes:**

- **Request the rendered size from your image CDN/service**, never the master. Use the width/quality parameter or rendition ladder (e.g. `w300`) closest to (at or just above) the slot's on-screen pixel size. A 300×450 card → ask for ~300px wide, which is roughly 1/40th of the pixels of a master.
- **Size for the UI resolution, not the panel.** If the graphics plane is 720p, a "half-screen" hero is ~640px wide — request that, not 1920.
- **Quantize to a ladder.** Pick 3–5 canonical widths app-wide and round up into them. Exact per-slot widths give every card a unique URL, which defeats CDN caching and (in renderers that dedupe textures by URL) texture sharing.
- **Decode off the main thread and bound concurrency.** Use the platform's off-thread decode path (image worker thread in canvas renderers — Lightning enables one by default, don't disable it; `createImageBitmap()` / `img.decode()` in DOM apps). Don't kick off 40 decodes at mount — load the visible window first, then trickle the rest.
- **Placeholder is a color, not an image.** One shared solid-rect (or dominant color from the API) texture for the whole app while loading and on failure. Never a second image request per slot, never a hole in the layout.
- If no resizing service exists, that's a backend gap worth naming — client-side downscaling doesn't recover the decode cost.

### 2. Scroll "stutters badly" — GC pauses and/or per-step view churn

At 60 fps you have 16.7 ms per frame (33 ms at 30). On a TV SoC:

- **A minor GC pause of a few ms** — invisible on desktop — eats a real slice of that budget; a major collection freezes the app for tens to hundreds of ms. It looks "random" because GC timing doesn't line up with any one line of code. You can't tune the collector; you allocate less.
- A **held d-pad key** fires many times per second, so your scroll/navigation handlers are *per-frame code*. They must run with **zero new allocations** in the steady state. Common hidden allocators in idiomatic JS: `{x, y}` / `[a, b]` literals per call, `.map()`/`.filter()`/`.slice()`/spread, inline arrows or `.bind(this)` passed as callbacks each tick, template-string keys, `Object.assign({})`, and patch/setState calls built with a fresh config object every frame.
- If your grid **creates and destroys card views at the window edges** as you scroll, that construction/destruction *is* the per-frame allocation churn — on a slow CPU a held key turns it into a visible hitch at a regular cadence.

**Fixes:**

- **Virtualize the grid** (any collection bigger than ~2 screens). Full catalog exists as *data*; only a window exists as *views and textures*: Visible, Realized (visible + ~1 viewport in the direction of travel), and everything else data-only. Virtualize both axes — off-screen rows release their textures too.
- **Recycle a fixed pool of card views**, don't create/destroy. ~10 views for a row showing 7; a view leaving the window is rebound to the item entering the other side (swap image `src` and text, reset transient state). Clear to placeholder before rebinding so the previous image never flashes, and cancel/guard any in-flight load bound to the old item so a late response can't write into a recycled slot.
- **Hoist and reuse scratch objects** in hot paths; write into preallocated storage instead of returning `{x, y}`. Bind handlers once in the constructor/init.
- **Prefer declarative animations** (from/to declared once, engine interpolates) over hand-rolled per-frame property math — the engine already reuses its scratch state.
- **Animate cheap properties only** — transform and opacity, never properties that force per-frame layout (Flexbox recalculation in canvas renderers, `top`/`left` reflow in DOM apps).
- **Keep remembered state (selected index, scroll offset) with the data, not the view**, so re-realizing a row after scrolling back is instant.

### 3. The lurking third problem: it may also crash

One ordinary browse screen — backdrop + ~4 realized rows of posters + rendered metadata text — already sits around 25 MB, at the edge of a 30–40 MB budget. If you're realizing off-screen rows and loading masters, you're far over. Watch for:

- App dies after minutes of browsing with no JS error → cumulative texture growth past the platform limit; check that leaving a screen/row actually releases textures and views.
- Images blank and reload every time you scroll back and forth → eviction thrash; working set too close to the renderer's cleanup threshold (in Lightning v2, `memoryPressure` defaults to ~96 MB — set it to the real target).
- Detail pages degrade over time → full-screen backdrops (~8 MB each) accumulating; release them on screen exit.

Eviction is a backstop for *navigation history*, not a license to overfill *one screen* — if everything over budget is currently visible, there's nothing to evict and the app hits OOM.

## Do this next

1. Point every poster/backdrop at a CDN-sized rendition on a 3–5 rung width ladder. This alone usually fixes "images take ages" and a large share of the scroll hitching.
2. Add a recycled-view virtualized window to the grid (both axes), with color placeholders and stale-load guards.
3. Profile the JS heap on the actual device (or the platform's profiler) over a scripted hold-to-scroll: the allocation timeline during the gesture should be near-flat (a sawtooth means per-frame code is allocating), and a before/after heap diff for entering-and-leaving the screen should be near-zero.
4. Do the texture estimate explicitly — slot size × visible count × 4 bytes, plus backdrop, plus text — and if it's above ~60–70% of the target's budget, cut renditions or realized rows before shipping.

Measurements from your laptop establish the *shape* of the problem; only an on-device run tells you whether it's fast enough. Verify on the floor, not the ceiling — and state which device class you targeted if real-device profiling isn't available.

Framework-specific mechanics (Lightning v2 texture shorthands, `memoryPressure`, `patch()` batching, `_active()`/`_inactive()` gating) are in `lightningjs-v2-conventions/references/textures-and-performance.md`; the rail-edge focus/pagination UX is in `tv-focus-and-navigation`.
