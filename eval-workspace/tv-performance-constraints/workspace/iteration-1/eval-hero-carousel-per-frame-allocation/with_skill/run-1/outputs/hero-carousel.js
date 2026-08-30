// The home-screen hero banner. Cross-fades between ~8 featured titles.
//
// Why this rewrite:
//   * The fade stutter was per-frame GC pressure: the old step() built a
//     map()/filter() array of spread-copied slides, a `delta` wrapper
//     object, and a fresh patch() config tree every single frame (~15
//     allocations/frame). A desktop GC hides that; a TV SoC pauses.
//   * The advance hitch was a synchronous full-screen texture swap: each
//     advance pointed a live element at an un-preloaded 1920x1080 image
//     (~8 MB texture + full-frame decode on the UI thread).
//
// Fixes:
//   * Two stacked layers (front / back). The back layer is armed with the
//     NEXT slide's images at alpha 0 well before the fade, so fetch +
//     decode happen off-thread. Advancing is then just an alpha ramp.
//   * step() allocates nothing: method bound once, module-level scratch
//     objects reused, only `alpha` written per frame, `src` touched only
//     on advance.
//   * Timing is driven by the real raf timestamp, so it behaves the same
//     at 30 fps and 60 fps.
//   * Backdrops are requested at the 1080p UI width, never the master.
//   * unmount() stops the loop and releases both ~8 MB backdrop textures.

const HOLD_MS = 4000; // fully-visible dwell time per slide
const FADE_MS = 600; // cross-fade duration

// The app renders its UI plane at 1080p even on 4K panels (this.viewport
// is 1920x1080), so request a 1920-wide rendition. Use 1280 if the UI
// plane is ever 720p. Never request the master: the texture decodes at
// the source's intrinsic size, so a 4K/master backdrop is a ~33 MB
// texture and a multi-hundred-ms decode on a TV core.
const UI_WIDTH = 1920;

// Ask the image service for a TV-sized rendition. Adapt the parameter to
// your CDN; the load-bearing part is "ask for UI_WIDTH, not the master".
function sizedBackdrop(url, w) {
  if (!url) return url;
  return `${url}${url.indexOf('?') === -1 ? '?' : '&'}w=${w}`;
}

// Module-level scratch. Allocated once, mutated forever. The contract:
// patch() reads these synchronously and never retains a reference.
const SCRATCH_FRONT = { alpha: 1 };
const SCRATCH_BACK = { alpha: 0 };
const SCRATCH_PATCH = { Layer0: null, Layer1: null };

export default class HeroCarousel {
  constructor(slides) {
    this.slides = slides || [];
    this.current = 0;
    this.next = this.slides.length > 1 ? 1 : 0;

    this.front = 0; // which layer index (0|1) is currently visible
    this.phase = 'hold'; // 'hold' | 'fade'
    this.phaseStart = 0; // raf timestamp (ms) the current phase began
    this.running = false;

    // Bound once here — not per raf call, not per render.
    this.step = this.step.bind(this);
  }

  mount() {
    if (this.slides.length === 0) return;

    // Prime the front layer with the first slide; back layer empty.
    this.patch({
      Layer0: {
        alpha: 1,
        Backdrop: { src: sizedBackdrop(this.slides[0].backdropUrl, UI_WIDTH) },
        Logo: { src: this.slides[0].logoUrl },
      },
      Layer1: { alpha: 0 },
    });

    // A single featured title never advances — nothing to animate.
    if (this.slides.length === 1) return;

    this.running = true;
    this.phase = 'hold';
    this.phaseStart = 0; // set from the real timestamp on the first tick
    this.armNextSlide(); // begin loading slide 1 into the hidden layer now
    raf(this.step);
  }

  unmount() {
    // Stop the loop (step() will not re-arm raf once this is false) and
    // let the renderer reclaim both full-screen backdrop textures instead
    // of leaving ~16 MB resident behind the next screen.
    this.running = false;
    this.patch({
      Layer0: { Backdrop: { src: null }, Logo: { src: null } },
      Layer1: { Backdrop: { src: null }, Logo: { src: null } },
    });
  }

  // Point the hidden (back) layer at the upcoming slide so its texture is
  // fetched and decoded off-thread long before we start fading it in.
  armNextSlide() {
    const backLayer = this.front === 0 ? 'Layer1' : 'Layer0';
    const slide = this.slides[this.next];
    this.patch({
      [backLayer]: {
        alpha: 0,
        Backdrop: { src: sizedBackdrop(slide.backdropUrl, UI_WIDTH) },
        Logo: { src: slide.logoUrl },
      },
    });
    // On a real framework, also listen for this layer's Backdrop texture
    // `load`/`decode` event and only allow the 'fade' phase to start once
    // it fires, so a slow network can't fade to a blank layer.
  }

  step(now) {
    if (!this.running) return; // unmounted — do not re-arm raf

    if (this.phaseStart === 0) this.phaseStart = now;
    const elapsed = now - this.phaseStart;

    if (this.phase === 'hold') {
      if (elapsed >= HOLD_MS) {
        this.phase = 'fade';
        this.phaseStart = now;
      }
      // else: idle tick, nothing allocated, nothing written
    } else {
      // Cross-fade. Only `alpha` changes, and it is written into reused
      // scratch objects — no array, closure, spread, or fresh tree here.
      const t = elapsed >= FADE_MS ? 1 : elapsed / FADE_MS;
      const frontKey = this.front === 0 ? 'Layer0' : 'Layer1';
      const backKey = this.front === 0 ? 'Layer1' : 'Layer0';

      SCRATCH_FRONT.alpha = 1 - t;
      SCRATCH_BACK.alpha = t;
      SCRATCH_PATCH[frontKey] = SCRATCH_FRONT;
      SCRATCH_PATCH[backKey] = SCRATCH_BACK;
      this.patch(SCRATCH_PATCH);

      if (t >= 1) {
        // Swap roles, advance indices, preload the following slide.
        this.front = this.front === 0 ? 1 : 0;
        this.current = this.next;
        this.next = (this.next + 1) % this.slides.length;
        this.phase = 'hold';
        this.phaseStart = now;
        this.armNextSlide();
      }
    }

    raf(this.step);
  }
}
