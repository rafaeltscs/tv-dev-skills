SKILLS_CONSULTED: tv-performance-constraints, lightningjs-v2-conventions

This is a Lightning-rendered UI feature (v2 conventions for component structure, texture handling, and declarative animation) whose defining risk is full-screen 4K artwork plus cross-fades on a constrained TV GPU/CPU, which is exactly what the performance skill's texture-memory, image-sizing, and cheap-animation rules exist to govern. (Focus behaviour on the hero is minor here; `tv-focus-and-navigation` would only be relevant for the rail-edge UX below it.)

---

# Building a home-screen hero banner in Lightning that survives a real TV

The short version: the "4K backdrop" is the trap. A smart TV renders the app's graphics plane at 1080p or 720p even on a 4K panel, and its entire texture budget on the low-RAM device class is about 30-40 MB. A single 3840x2160 RGBA texture is ~33 MB on its own; with a cross-fade you have two backdrops resident at once. You must never load master/4K renditions, you must keep exactly two backdrop elements alive, and the fade must be pure opacity.

## 1. Never request 4K art — size to the UI resolution, not the panel

Decode cost and texture residency are both set by the *source* pixel dimensions, not the file size and not the slot. A 90 KB JPEG that happens to be 3840x2160 still costs full 4K decode CPU and `w x h x 4` bytes of GPU memory.

| Backdrop rendition | RGBA texture cost | Two resident (during cross-fade) |
|---|---|---|
| 3840x2160 (4K master) | ~33 MB | ~66 MB — instant OOM on a 1 GB TV |
| 1920x1080 (1080p UI) | ~8.3 MB | ~16.6 MB |
| 1280x720 (720p UI) | ~3.7 MB | ~7.4 MB |

Request from your image service/CDN the rendition that matches the UI resolution you actually render at — ~1920 wide for a 1080p graphics plane, ~1280 for 720p. Treat a raw master `src` on a full-screen element as a bug.

Pick **one canonical hero width app-wide** (a rendition ladder, e.g. 1280 / 1920) and round into it. Exact per-device widths produce a distinct URL per size, which defeats both CDN caching and Lightning's texture cache (it deduplicates by source key / URL).

Also: don't blur or darken the backdrop with an in-app shader or render-to-texture effect — that allocates another full-screen buffer. Bake the darkening into the CDN rendition, or lay a cheap gradient `rect` scrim over it (corner colors, one tiny texture).

## 2. Exactly two backdrop elements, ping-ponged forever

Build the hero with a fixed pair of image elements and alternate between them. Never create a third; never create-per-slide. This caps hero backdrop cost at two textures **regardless of whether you feature 5 shows or 50.**

To advance: set `src` on the *hidden* element to the next show's rendition, wait for its texture-loaded event, then cross-fade (incoming alpha -> 1, outgoing alpha -> 0), then the now-hidden element becomes the next target. Swapping `src` on an existing element reuses the element and its texture-cache entry; destroying and recreating elements to "refresh" pays construction cost again, adds GC pressure, and defeats texture reuse (Lightning v2, `references/textures-and-performance.md`).

## 3. Cross-fade = opacity only, and declarative

The transition is an `alpha` animation on the two backdrop elements. Use Lightning's declarative `animation()` / `patch({ smooth: { alpha: ... } })` — the engine interpolates internally with no per-frame JS allocation. Do **not** hand-roll a `requestAnimationFrame` / tick loop computing alpha each frame: per-frame closures and object literals are the allocation churn that causes a GC hitch mid-fade on a slow core (`gc-and-allocation.md`).

Keep both backdrops absolutely positioned (`x`/`y`/`w`/`h`), not Flexbox children, so the fade never drives a layout recalculation. The title treatment fades/translates the same way — `transform` and `alpha`, never layout properties.

## 4. Hold the five shows as data; realize only current + next

The five featured items live as a small array of `{ title, artUrl }`. At any moment only two backdrop textures exist: the one on screen, and the one you're about to fade to. Set the incoming `src` roughly one slide ahead of the transition so its texture is decoded before the fade starts. The other three are just URLs — no elements, no textures, no requests.

Don't kick off all five image loads at mount; that saturates the decoder right as the screen's entry animation runs. Load slide 1, then trickle.

## 5. Texture load and error must be real states

- Listen for the incoming element's `txLoaded` before starting the cross-fade — otherwise on a slow TV network you fade to a blank rectangle.
- On `txError`, skip that slide or drop in a solid-color / gradient `rect` plus the show title. A failed full-screen image otherwise leaves a permanent black rectangle the user can't dismiss.
- One shared placeholder texture for the whole app.

Lightning v2 exposes these as element texture events (`txLoaded` / `txError`); wire them for any element where a broken image leaves a visibly empty region — a full-bleed hero is the textbook case.

## 6. The rotation timer is a lifecycle citizen

Start the auto-advance interval in `_active()` (or `_enable()`), clear it in `_inactive()` / `_disable()`. A `setInterval` that survives the user navigating away from the home screen keeps the entire hero subtree — including two ~8 MB backdrops — alive and keeps swapping in freshly decoded art for a screen nobody is looking at. TV apps run for hours without restart; that is an hour-two crash, not a code-review bug.

Also pause rotation when the app is backgrounded (`visibilitychange` / the platform suspend event).

## 7. Release the full-screen art on leave

When the home screen goes `_inactive()`, null out both backdrop `src` values so the ~16 MB pair becomes evictable, and re-realize the current slide on return (its remembered index lives with the data, not the element). Lightning's `memoryPressure` cannot free textures that on-screen elements still reference, so while the hero is visible, staying under budget is on you — eviction is a backstop for navigation history, not for one screen.

Set the `memoryPressure` stage option to match the real target device; the default `24e6` pixels (~96 MB) is far above what a 1 GB-class TV tolerates.

## 8. Focus (secondary)

The hero is a single focusable component with an explicit `_getFocused()` path. OK/Enter opens or plays the featured title; `down` moves focus to the rails below; `left`/`right` optionally step between featured items manually. A focus change must not itself trigger the art swap or any navigation — focused is not selected.

---

## Compact shape (Lightning v2)

```js
const HERO_W = 1920; // one canonical rendition width, app-wide
const heroArtUrl = (show, w) => `${show.artBase}?w=${w}&fm=jpg&q=70`;

class HeroBanner extends lng.Component {
  static _template() {
    return {
      w: 1920, h: 1080,
      // exactly two backdrops, ping-ponged
      BackdropA: { w: 1920, h: 1080, alpha: 1 },
      BackdropB: { w: 1920, h: 1080, alpha: 0 },
      // cheap gradient scrim, one small texture
      Scrim: { w: 1920, h: 1080, rect: true, colorLeft: 0xcc000000, colorRight: 0x00000000 },
      Title: { x: 120, y: 720, alpha: 1, text: { text: '', fontSize: 64 } },
    };
  }

  _init() {
    this._shows = this.featured;      // [{ title, artBase }, ...] — data only
    this._index = 0;
    this._front = 'BackdropA';
    this._back  = 'BackdropB';
    this._bind('BackdropA');
    this._bind('BackdropB');
    this._paint(this._shows[0], this._front);
  }

  _active()   { this._timer = setInterval(() => this._advance(), 8000); }
  _inactive() {
    clearInterval(this._timer);
    this._timer = null;
    this.tag('BackdropA').src = null;   // release ~16 MB while off screen
    this.tag('BackdropB').src = null;
  }

  _bind(ref) {
    const el = this.tag(ref);
    el.on('txError', () => { el.src = null; el.patch({ rect: true, color: 0xff101014 }); });
  }

  _paint(show, ref) {
    this.tag(ref).src = heroArtUrl(show, HERO_W);
    this.tag('Title').text.text = show.title;
  }

  _advance() {
    this._index = (this._index + 1) % this._shows.length;
    const next     = this._shows[this._index];
    const incoming = this.tag(this._back);
    const outgoing = this.tag(this._front);

    // fade the title out immediately so it never sits over the wrong art
    this.tag('Title').patch({ smooth: { alpha: [0, { duration: 0.3 }] } });

    incoming.once('txLoaded', () => {
      incoming.patch({ smooth: { alpha: [1, { duration: 0.6 }] } });
      outgoing.patch({ smooth: { alpha: [0, { duration: 0.6 }] } });
      this.tag('Title').text.text = next.title;
      this.tag('Title').patch({ smooth: { alpha: [1, { duration: 0.4 }] } });
      [this._front, this._back] = [this._back, this._front];
    });
    incoming.src = heroArtUrl(next, HERO_W);   // swap src, don't recreate the element
  }

  _getFocused() { return this; }
  _handleEnter() { this.signal('playFeatured', this._shows[this._index]); }
}
```

Key properties of this shape: two textures max for the backdrop no matter how many featured shows; opacity-only declarative transitions (no per-frame allocation); art requested at UI resolution through a single quantized rendition width; the rotation timer and the full-screen textures both tied to the visibility lifecycle; load-error handled as a state rather than a black hole.

## Verify on the floor, not the ceiling

All of the above is written for the low-RAM TV device class (~1 GB RAM, ~30-40 MB texture budget, UI possibly at 720p). A smooth run on your dev machine or an emulator proves nothing about a 2019 chipset. Profile the JS heap over an entering-and-leaving-the-home-screen cycle (diff should return to baseline) and watch texture memory during several rotations (should plateau at the two-backdrop cost, not climb) on the actual target hardware.
