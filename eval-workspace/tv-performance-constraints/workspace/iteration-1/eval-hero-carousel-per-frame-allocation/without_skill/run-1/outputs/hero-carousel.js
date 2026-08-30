// The home-screen hero banner. Cross-fades between ~8 featured titles.
// Each slide: a full-bleed 1920x1080 backdrop plus a logo image.
// `slides` is [{ backdropUrl, logoUrl, title }].
//
// Why the original stuttered on TV (smooth on a laptop):
//
//  1. The per-frame loop ALLOCATED on every frame:
//        const delta = { value: ... };
//        this.slides.map((s, i) => ({ ...s, index: i })).filter(...)
//     For ~8 slides that's ~8 objects + 2 arrays + 2 closures every 16 ms,
//     purely to look up this.slides[this.current]. A low-end TV GC is
//     effectively stop-the-world; those minor collections land mid-fade as
//     visible 5-30 ms hitches. A laptop GC hides it.
//
//  2. patch({ src }) ran EVERY frame even though the URL changes once every
//     ~5 s. The real cost lands on advance: the next backdrop had never been
//     touched, so the swap frame had to fetch + decode a full 1920x1080 image
//     and upload a GPU texture synchronously (~50-150 ms on a TV SoC). That is
//     the whole-screen hitch on every advance. Nothing was preloaded.
//
//  3. The fade was frame-rate-locked (opacity += (target-opacity) * 0.08,
//     timeInPhase += 16). When the TV drops to 30-40 fps the fade runs slow
//     and in coarse opacity steps and the phase clock drifts.
//
//  4. advanceLoop() never stopped: no unmount, no visibility handling, raf
//     handle never tracked. It kept working (and leaking frame budget) after
//     you left the home screen, and could stack a second loop on remount.
//
// The rewrite: do NO work while a slide is held, allocate NOTHING in the frame
// loop, and move image decode off the frame that needs it.

const BACKDROP_W = 1920;
const BACKDROP_H = 1080;
const LOGO_W = 960; // request at 2x the on-screen logo box, then draw at half
const LOGO_H = 540;

const HOLD_MS = 4000; // time a slide stays fully visible
const FADE_MS = 600;  // duration of each fade-out / fade-in

export default class HeroCarousel {
  constructor(slides) {
    this.slides = slides;
    this.current = 0;
    this.pending = null; // index we are transitioning to
    this.opacity = 1;

    this.phase = 'hold'; // 'hold' | 'out' | 'in'
    this.phaseStart = 0;

    this.holdTimer = null;
    this.loopToken = 0; // bumped to invalidate any in-flight raf loop / preload

    this._onVisibility = () => {
      const hidden =
        typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (hidden) this.pause();
      else this.resume();
    };
  }

  // --- lifecycle ---------------------------------------------------------

  mount() {
    this.phase = 'hold';
    this.opacity = 1;
    this.applySlide(this.current, 1); // exactly one patch, not per-frame
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', this._onVisibility);
    }
    this.scheduleAdvance();
  }

  unmount() {
    this.pause();
    if (typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('visibilitychange', this._onVisibility);
    }
  }

  // Stop all work: kill the hold timer and invalidate any running raf loop.
  pause() {
    this.loopToken++;
    if (this.holdTimer != null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  // Resume from wherever we were. A held slide just re-arms its timer; a slide
  // caught mid-fade restarts the fade loop from the current opacity.
  resume() {
    if (this.holdTimer != null) return; // already running
    if (this.phase === 'hold') {
      this.scheduleAdvance();
    } else {
      this.phaseStart = now(); // restart the current phase cleanly
      this.runFadeLoop();
    }
  }

  // --- transition driving ----------------------------------------------

  // Between transitions there is NO raf loop and NO patch: just one timer.
  // Steady-state CPU and GC pressure are zero while a slide is held.
  scheduleAdvance() {
    if (this.slides.length < 2) return;
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      this.beginTransition();
    }, HOLD_MS);
  }

  // Decode the next slide's art BEFORE touching opacity, so the swap frame
  // does no fetch / decode / first-time upload work.
  beginTransition() {
    const token = this.loopToken;
    const upcoming = (this.current + 1) % this.slides.length;

    preload(this.slides[upcoming]).then(() => {
      if (token !== this.loopToken) return; // unmounted / paused during preload
      this.pending = upcoming;
      this.phase = 'out';
      this.phaseStart = now();
      this.runFadeLoop();
    });
  }

  // The only place raf is used. Runs for ~2 * FADE_MS per transition, then stops.
  runFadeLoop() {
    const token = ++this.loopToken;

    const step = () => {
      if (token !== this.loopToken) return; // superseded by pause/unmount/new loop

      const t = clamp((now() - this.phaseStart) / FADE_MS, 0, 1);

      if (this.phase === 'out') {
        this.setAlpha(1 - ease(t));
        if (t >= 1) {
          // Swap: src changes exactly once, with art already decoded.
          this.current = this.pending;
          this.pending = null;
          this.applySlide(this.current, 0);
          this.phase = 'in';
          this.phaseStart = now();
        }
      } else {
        this.setAlpha(ease(t));
        if (t >= 1) {
          this.setAlpha(1);
          this.phase = 'hold';
          this.loopToken++; // end this loop
          this.scheduleAdvance();
          return;
        }
      }

      raf(step);
    };

    raf(step);
  }

  // --- patch helpers (dedupe every write) ----------------------------

  applySlide(index, alpha) {
    const slide = this.slides[index];
    this.opacity = alpha;
    this.patch({
      Backdrop: { src: sized(slide.backdropUrl, BACKDROP_W, BACKDROP_H), alpha },
      Logo: { src: sized(slide.logoUrl, LOGO_W, LOGO_H), alpha },
    });
  }

  setAlpha(alpha) {
    if (alpha === this.opacity) return; // no redundant patch
    this.opacity = alpha;
    this.patch({ Backdrop: { alpha }, Logo: { alpha } });
  }

  render() {
    const slide = this.slides[this.current];
    return {
      type: 'group',
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
      children: [
        {
          type: 'image',
          ref: 'Backdrop',
          x: 0,
          y: 0,
          w: 1920,
          h: 1080,
          src: sized(slide.backdropUrl, BACKDROP_W, BACKDROP_H),
          alpha: this.opacity,
        },
        {
          type: 'image',
          ref: 'Logo',
          x: 120,
          y: 620,
          w: LOGO_W / 2,
          h: LOGO_H / 2,
          src: sized(slide.logoUrl, LOGO_W, LOGO_H),
          alpha: this.opacity,
        },
      ],
    };
  }
}

// --- module-level helpers (allocated once, never in the frame loop) -----

function now() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// easeInOutQuad - cheap, branch + a couple of multiplies, no allocation.
function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
}

// Ask the CDN for art at the size it will actually be drawn. The framework
// decodes a texture at the source image's intrinsic size, so serving a 4K
// master to a 1080p panel costs a 4x decode and 4x texture memory for nothing.
// Adjust the query params to match your image CDN.
function sized(url, w, h) {
  if (!url) return url;
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return url + sep + 'w=' + w + '&h=' + h + '&fit=cover';
}

// Fetch + decode the next slide's images off the critical path. Resolves once
// the bitmaps are ready, so the frame that swaps src does zero decode work.
// Falls back to a resolved promise where Image is unavailable (SSR / tests).
function preload(slide) {
  if (typeof Image === 'undefined') return Promise.resolve();

  const urls = [
    sized(slide.backdropUrl, BACKDROP_W, BACKDROP_H),
    sized(slide.logoUrl, LOGO_W, LOGO_H),
  ];

  return Promise.all(
    urls.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () =>
            img.decode ? img.decode().then(resolve, resolve) : resolve();
          img.onerror = resolve; // never block the carousel on a bad asset
          img.src = src;
        })
    )
  );
}
