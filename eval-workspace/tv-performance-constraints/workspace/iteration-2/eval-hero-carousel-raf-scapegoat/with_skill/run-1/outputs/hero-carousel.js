// The home-screen hero banner. Cross-fades between ~8 featured titles.
// Each slide has a full-bleed 1920x1080 backdrop plus a logo image.
// `slides` is [{ backdropUrl, logoUrl, title }].
//
// Why the old version stuttered on TV (and was smooth on the laptop):
//
//  1. GC pressure. `step()` ran every frame and allocated ~15
//     objects/arrays/closures per tick: `slides.map(s => ({ ...s }))`,
//     `.filter(...)`, `const delta = { value }`, and a fresh
//     `patch({ Backdrop, Logo })` config tree. Roughly 900 allocations/sec
//     of pure churn; on a slow SoC that means minor-GC pauses landing
//     inside the 16-33 ms frame. That is the fade "stutter" -- and it is
//     why moving the easing multiply into a Web Worker changed nothing:
//     the cost was never the arithmetic.
//
//  2. Synchronous full-screen decode on advance. Every advance pointed a
//     LIVE element at a brand-new, un-preloaded 1920x1080 backdrop: an
//     ~8 MB texture upload plus a full-frame JPEG decode on the UI thread
//     at the instant of the swap -> the whole home screen hitches once per
//     advance. Also does not move to a Worker.
//
// requestAnimationFrame is NOT the problem, and setInterval would be worse
// (not vsync-aligned -> beat-frequency stutter; keeps firing while the app
// is backgrounded; still clamps/coalesces under load). This version keeps
// rAF but: runs it only during the ~400 ms fade, allocates nothing per
// frame, drives timing off a real timestamp, preloads the incoming backdrop
// during the idle dwell, and stops cleanly on unmount.

const UI_WIDTH = 1920;          // graphics-plane width (fixture viewport is 1920x1080)
const DWELL_MS = 5000;          // slide held fully visible
const FADE_MS = 400;            // cross-fade duration
const PRELOAD_LEAD_MS = 1500;   // realise the next slide's textures this far ahead of the fade

// Layer-key orderings as module constants so selecting one costs no
// allocation. [frontBackdrop, frontLogo, backBackdrop, backLogo].
const KEYS_A = ['BackdropA', 'LogoA', 'BackdropB', 'LogoB'];
const KEYS_B = ['BackdropB', 'LogoB', 'BackdropA', 'LogoA'];

// Quantise to one canonical width: a stable URL keeps the CDN cache and the
// renderer's texture cache working (per-slot widths defeat both). Adapt the
// query param to your image service; the non-negotiable part is "request a
// rendition sized for the UI plane, never the master".
function sizedUrl(url, w) {
  if (!url) return url;
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return url + sep + 'w=' + w;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export default class HeroCarousel {
  constructor(slides) {
    this.slides = slides || [];
    this.current = 0;
    this.upcoming = this.slides.length > 1 ? 1 : 0;

    // 'A'/'B' name the two stacked layers. `front` is the one showing; the
    // other is pre-armed with the next slide at alpha 0, then faded up.
    this.front = 'A';

    this.running = false;
    this.dwellTimer = null;
    this.preloadTimer = null;
    this.fadeStart = 0;
    this.rafPending = false;

    // Hoisted scratch config: mutated in place, read synchronously by
    // patch(). The fade loop allocates nothing.
    this._cfg = {
      BackdropA: { src: null, alpha: 1 },
      LogoA: { src: null, alpha: 1 },
      BackdropB: { src: null, alpha: 0 },
      LogoB: { src: null, alpha: 0 },
    };

    // Bound once, not per raf() call.
    this._tick = this._tick.bind(this);
  }

  mount() {
    if (this.slides.length === 0) return;

    const first = this.slides[this.current];
    this._cfg.BackdropA.src = sizedUrl(first.backdropUrl, UI_WIDTH);
    this._cfg.LogoA.src = sizedUrl(first.logoUrl, UI_WIDTH);
    this._cfg.BackdropA.alpha = 1;
    this._cfg.LogoA.alpha = 1;
    this._cfg.BackdropB.src = null;
    this._cfg.LogoB.src = null;
    this._cfg.BackdropB.alpha = 0;
    this._cfg.LogoB.alpha = 0;
    this.patch(this._cfg);

    this.running = true;
    this._scheduleDwell();
  }

  unmount() {
    // Stop the loop and let the renderer's LRU reclaim the two full-screen
    // backdrop textures (~8 MB each) behind the next screen.
    this.running = false;
    if (this.dwellTimer) { clearTimeout(this.dwellTimer); this.dwellTimer = null; }
    if (this.preloadTimer) { clearTimeout(this.preloadTimer); this.preloadTimer = null; }
    this._cfg.BackdropA.src = null;
    this._cfg.LogoA.src = null;
    this._cfg.BackdropB.src = null;
    this._cfg.LogoB.src = null;
    this.patch(this._cfg);
  }

  _scheduleDwell() {
    if (!this.running || this.slides.length < 2) return;

    // Arm the hidden layer with the upcoming slide EARLY, at alpha 0, so its
    // full-bleed backdrop is fetched and decoded now -- during the idle
    // dwell -- not on the frame the fade starts. This is what removes the
    // per-advance screen hitch. In a real framework, also gate the fade
    // start on this layer's texture load/decode event so a slow network
    // cannot fade to a blank layer.
    this.preloadTimer = setTimeout(() => {
      if (!this.running) return;
      const k = this.front === 'A' ? KEYS_A : KEYS_B;
      const next = this.slides[this.upcoming];
      this._cfg[k[2]].src = sizedUrl(next.backdropUrl, UI_WIDTH);
      this._cfg[k[3]].src = sizedUrl(next.logoUrl, UI_WIDTH);
      this._cfg[k[2]].alpha = 0;
      this._cfg[k[3]].alpha = 0;
      this.patch(this._cfg);
    }, Math.max(0, DWELL_MS - PRELOAD_LEAD_MS));

    this.dwellTimer = setTimeout(() => {
      if (!this.running) return;
      this.fadeStart = performance.now();
      this._requestTick();
    }, DWELL_MS);
  }

  _requestTick() {
    if (this.rafPending) return;
    this.rafPending = true;
    raf(this._tick);
  }

  _tick() {
    this.rafPending = false;
    if (!this.running) return;

    let t = (performance.now() - this.fadeStart) / FADE_MS;
    if (t > 1) t = 1;
    const p = easeInOut(t);

    // Per-frame work: four numeric alpha writes into reused objects + one
    // patch() with the reused tree. No arrays, closures, spreads, literals.
    const k = this.front === 'A' ? KEYS_A : KEYS_B;
    this._cfg[k[0]].alpha = 1 - p;
    this._cfg[k[1]].alpha = 1 - p;
    this._cfg[k[2]].alpha = p;
    this._cfg[k[3]].alpha = p;
    this.patch(this._cfg);

    if (t < 1) {
      this._requestTick();
      return;
    }

    // Fade complete: the back layer becomes the front layer.
    this.front = this.front === 'A' ? 'B' : 'A';
    this.current = this.upcoming;
    this.upcoming = (this.upcoming + 1) % this.slides.length;

    // Release the backdrop just faded out -- full-screen art must not
    // accumulate across a long browsing session. After the swap the old
    // front layer is entries [2]/[3].
    const s = this.front === 'A' ? KEYS_A : KEYS_B;
    this._cfg[s[2]].src = null;
    this._cfg[s[3]].src = null;
    this._cfg[s[2]].alpha = 0;
    this._cfg[s[3]].alpha = 0;
    this.patch(this._cfg);

    this._scheduleDwell();
  }
}
