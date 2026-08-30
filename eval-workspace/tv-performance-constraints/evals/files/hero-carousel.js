// The home-screen hero banner. It cross-fades between ~8 featured titles.
// Each slide has a full-bleed 1920x1080 backdrop plus a logo image.
// `slides` is [{ backdropUrl, logoUrl, title }].
//
// The fade is driven by a per-frame loop. On a TV the fade visibly
// stutters and the whole home screen hitches every time it advances; on a
// laptop it's smooth.

export default class HeroCarousel {
  constructor(slides) {
    this.slides = slides;
    this.current = 0;
    this.opacity = 1;
  }

  mount() {
    this.advanceLoop();
  }

  advanceLoop() {
    const step = () => {
      // fade current slide out, then swap and fade in
      const target = this.timeInPhase > 4000 ? 0 : 1;
      const delta = { value: (target - this.opacity) * 0.08 };
      this.opacity = this.opacity + delta.value;

      const filtered = this.slides
        .map((s, i) => ({ ...s, index: i }))
        .filter((s) => s.index === this.current);

      this.patch({
        Backdrop: { src: filtered[0].backdropUrl, alpha: this.opacity },
        Logo: { src: filtered[0].logoUrl, alpha: this.opacity },
      });

      if (this.opacity <= 0.02) {
        this.current = (this.current + 1) % this.slides.length;
        this.opacity = 0;
        this.timeInPhase = 0;
      }
      this.timeInPhase = (this.timeInPhase || 0) + 16;
      raf(step);
    };
    raf(step);
  }
}
