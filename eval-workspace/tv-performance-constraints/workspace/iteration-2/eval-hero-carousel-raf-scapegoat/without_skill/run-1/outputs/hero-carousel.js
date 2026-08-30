// The home-screen hero banner. Cross-fades between ~8 featured titles.
// Each slide is a full-bleed 1920x1080 backdrop plus a logo image.
// `slides` is [{ backdropUrl, logoUrl, title }].
//
// ------------------------------------------------------------------
// Why the previous version hitched on TV (and not on the laptop)
// ------------------------------------------------------------------
//  1. It passed `src` for the full-bleed 1920x1080 backdrop into patch()
//     on EVERY frame (~60x/sec). Re-supplying a texture URL makes the
//     renderer re-resolve it against its cache and, on any miss/eviction,
//     re-decode and re-upload an ~8 MB texture to the GPU. That upload
//     spike on the advance frame is what froze the whole home screen.
//     A laptop's decoder + bus hide it; a TV SoC cannot.
//  2. The fade moved a fixed 8% per frame and treated every frame as
//     "16 ms". At the TV's real ~30 fps with dropped frames the motion
//     advances in uneven chunks -> visible stutter. Fades must be driven
//     by elapsed wall-clock time, not frame count.
//  3. Every frame it rebuilt an 8-element array (map + object spread +
//     filter) plus throwaway objects just to reach slides[current].
//     That steady garbage causes periodic GC pauses.
//  4. The rAF loop never stopped. All of the above also ran during the
//     4s hold, and kept running after the component left the screen.
//
// requestAnimationFrame is NOT the problem. setInterval would be worse:
// not aligned to the panel refresh (the fade beats against vsync), keeps
// firing while the app is suspended, still on the same main thread as the
// texture upload, and gives no frame timestamp. Moving the easing math to
// a Web Worker changed nothing because that math was never the cost --
// texture upload and GC were, and a worker can touch neither.
// ------------------------------------------------------------------

const HOLD_MS = 5000;   // fully-visible time per slide
const FADE_MS = 400;    // cross-fade length
const WARMUP_MS = 48;   // let the incoming texture decode before ramping alpha

const easeInOut = (t) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export default class HeroCarousel {
  constructor(slides) {
    this.slides = slides || [];
    this.current = 0;
    this.front = 'A';        // layer currently showing the visible slide
    this.running = false;
    this.fade = null;        // non-null only while a cross-fade is in flight
    this.holdTimer = null;
    this._tick = this._tick.bind(this);
  }

  render() {
    const { w, h } = this.viewport || { w: 1920, h: 1080 };
    const a = this.slides[0] || {};
    // Two stacked layers. A cross-fade then only ever animates `alpha` on
    // nodes that already exist; `src` is touched once per advance.
    return [
      { ref: 'BackdropA', type: 'image', x: 0, y: 0, w, h, src: a.backdropUrl, alpha: 1 },
      { ref: 'LogoA',     type: 'image', x: 0, y: 0, w, h, src: a.logoUrl,     alpha: 1 },
      { ref: 'BackdropB', type: 'image', x: 0, y: 0, w, h, alpha: 0 },
      { ref: 'LogoB',     type: 'image', x: 0, y: 0, w, h, alpha: 0 },
    ];
  }

  mount() {
    if (this.slides.length <= 1) return;   // nothing to cross-fade
    this.running = true;
    this._scheduleNext();
  }

  unmount() {
    // Stop all work while off-screen / suspended. Call this from your
    // visibilitychange / platform pause handler too.
    this.running = false;
    clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.fade = null;
  }

  _scheduleNext() {
    if (!this.running) return;
    // Idle between fades: a plain timer, no rAF wakeups for ~5s.
    this.holdTimer = setTimeout(() => {
      if (!this.running) return;
      this.fade = this._beginFade(performance.now());
      raf(this._tick);
    }, HOLD_MS);
  }

  _beginFade(now) {
    const nextIndex = (this.current + 1) % this.slides.length;
    const back = this.front === 'A' ? 'B' : 'A';
    const slide = this.slides[nextIndex];

    // Per-layer style objects and the patch container are created ONCE
    // here, then mutated in place each frame -> the fade loop allocates
    // nothing.
    const fBd = { alpha: 1 };
    const fLg = { alpha: 1 };
    const bBd = { alpha: 0, src: slide.backdropUrl };
    const bLg = { alpha: 0, src: slide.logoUrl };

    const patch = {
      ['Backdrop' + this.front]: fBd,
      ['Logo' + this.front]: fLg,
      ['Backdrop' + back]: bBd,
      ['Logo' + back]: bLg,
    };

    // Assign the incoming src exactly once, now, so its decode/upload
    // overlaps the short warm-up window instead of spiking mid-fade.
    // If the renderer exposes an explicit preload/decode call, use it here.
    this.patch(patch);

    return {
      start: now + WARMUP_MS,
      nextIndex,
      back,
      patch, fBd, fLg, bBd, bLg,
      srcStripped: false,
    };
  }

  _tick() {
    if (!this.running || !this.fade) return;
    const f = this.fade;
    const now = performance.now();
    if (now < f.start) { raf(this._tick); return; }   // still warming up

    const p = Math.min(1, (now - f.start) / FADE_MS);
    const k = easeInOut(p);
    f.fBd.alpha = 1 - k;
    f.fLg.alpha = 1 - k;
    f.bBd.alpha = k;
    f.bLg.alpha = k;

    // The incoming src was set on the first patch; don't keep re-sending it.
    if (!f.srcStripped) {
      delete f.bBd.src;
      delete f.bLg.src;
      f.srcStripped = true;
    }
    this.patch(f.patch);

    if (p >= 1) {
      // Fade complete. Drop the now-hidden layer's src so its full-screen
      // (~8 MB) texture can leave the renderer's LRU cache -- keeps only
      // ~2 backdrops resident across a long browsing session.
      f.fBd.src = undefined;
      f.fLg.src = undefined;
      this.patch(f.patch);

      this.current = f.nextIndex;
      this.front = f.back;
      this.fade = null;
      this._scheduleNext();
      return;
    }
    raf(this._tick);
  }
}
