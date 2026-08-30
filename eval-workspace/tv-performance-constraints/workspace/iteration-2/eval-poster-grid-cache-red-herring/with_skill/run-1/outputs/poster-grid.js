// A catalog poster grid. `items` is ~120 movie objects from the API:
//   { id, title, artworkUrl }
// artworkUrl points at the image service; it returns a 2000x3000 master
// image but also accepts ?w=&h= resize params -- which this file now
// uses.
//
// Each poster renders into a 260x390 cell.
//
// WHY THIS FILE CHANGED (the app was OOM-crashing on a 2020 TV after the
// user browsed a few categories):
//
//   The renderer was not leaking. It was holding every texture the tree
//   asked for, and the tree never let any go.
//
//   1. It requested the 2000x3000 master for every 260x390 cell.
//      Texture residency = width * height * 4 bytes, set by the SOURCE
//      dimensions, not the slot: 2000*3000*4 ~= 24 MB PER poster. The
//      slot needs ~0.5 MB. ~44x overspend on every poster.
//   2. render() returned all ~120 items and the renderer realizes
//      whatever render() returns in full -> ~120 * 24 MB ~= 2.9 GB of
//      texture for ONE category, on a device with a ~30-40 MB graphics
//      budget. Nothing off-screen was released, so each category browsed
//      added another ~2.9 GB the renderer's LRU could not evict (its
//      entries were referenced by the live tree). A few categories in
//      -> platform OOM. That is the "leak": unbounded texture residency
//      by design.
//   (Raising the image LRU cache to 500 entries made this worse, not
//   better -- it pinned ~500 oversized textures across category
//   switches. Size that cache in bytes, not entries, and keep it small.)
//
// FIXES:
//   - Request a slot-sized rendition, quantized to a small width ladder.
//   - Virtualize: keep all items as data; realize only the rows in view
//     (+ one viewport of margin). Rows that leave the window drop out of
//     the tree and their textures are freed. Residency is then flat
//     regardless of catalog size or categories browsed.
//   - Solid-color placeholder behind each cell so scrolling shows
//     filled cells, not holes, and never fires a second request.
//
// Realized-window texture cost: ~45 cells * (300*450*4 ~= 0.54 MB)
//   ~= 24 MB, plus ~45 small title textures. Inside budget, and flat.

const COLS = 5;
const CELL_W = 260;
const CELL_H = 390;
const COL_PITCH = 300;
const ROW_PITCH = 430;
const GRID_X = 80;
const GRID_Y = 60;

// Canonical rendition widths (CDN- and texture-dedupe-friendly). Round
// the slot width up into one of these rather than requesting exact
// per-slot sizes.
const WIDTH_LADDER = [150, 300, 450];
const PLACEHOLDER_COLOR = '#1a1d24';

function renditionUrl(masterUrl, slotW, slotH) {
  let w = WIDTH_LADDER[WIDTH_LADDER.length - 1];
  for (let i = 0; i < WIDTH_LADDER.length; i++) {
    if (WIDTH_LADDER[i] >= slotW) {
      w = WIDTH_LADDER[i];
      break;
    }
  }
  const h = Math.round(w * (slotH / slotW)); // keep the 2:3 aspect
  const sep = masterUrl.indexOf('?') === -1 ? '?' : '&';
  return `${masterUrl}${sep}w=${w}&h=${h}`;
}

export default class PosterGrid {
  constructor(items) {
    this.items = items;
    this.scrollY = 0;

    // Precompute per-item layout + rendition URL once, when the data
    // arrives -- not per scroll step and not per render() (GC
    // discipline: no allocation in code that runs while the UI moves).
    this.cells = items.map((item, i) => ({
      id: item.id,
      title: item.title,
      row: Math.floor(i / COLS),
      x: (i % COLS) * COL_PITCH,
      y: Math.floor(i / COLS) * ROW_PITCH,
      posterUrl: renditionUrl(item.artworkUrl, CELL_W, CELL_H),
    }));

    this.totalRows = Math.ceil(items.length / COLS);
  }

  mount() {}

  unmount() {
    // Nothing to tear down: this component holds no timers or listeners,
    // and off-screen textures are released by virtualization (rows leave
    // the tree), not on unmount.
  }

  _vp() {
    return this.viewport || { w: 1920, h: 1080 };
  }

  // Fires many times per second while a d-pad key is held. Kept
  // allocation-free: just record the clamped offset. render() derives
  // the realized window from it.
  onScroll(offset) {
    const vpH = this._vp().h;
    const maxScroll = Math.max(0, this.totalRows * ROW_PITCH - vpH);
    this.scrollY = offset < 0 ? 0 : offset > maxScroll ? maxScroll : offset;
  }

  _visibleRowRange() {
    const vpH = this._vp().h;
    const margin = vpH; // one viewport of realize-margin each way
    let first = Math.floor((this.scrollY - margin) / ROW_PITCH);
    let last = Math.ceil((this.scrollY + vpH + margin) / ROW_PITCH);
    if (first < 0) first = 0;
    if (last > this.totalRows) last = this.totalRows;
    return [first, last];
  }

  render() {
    const [firstRow, lastRow] = this._visibleRowRange();
    const children = [];

    for (let c = 0; c < this.cells.length; c++) {
      const cell = this.cells[c];
      if (cell.row < firstRow || cell.row >= lastRow) continue; // data only

      children.push({
        type: 'group',
        x: cell.x,
        y: cell.y,
        w: CELL_W,
        h: CELL_H,
        children: [
          // Instant, ~free placeholder: a filled cell while the poster
          // decodes and if it fails. Shared color, no image request.
          { type: 'rect', w: CELL_W, h: CELL_H, color: PLACEHOLDER_COLOR },
          { type: 'image', w: CELL_W, h: CELL_H, src: cell.posterUrl },
          { type: 'text', y: CELL_H + 5, text: cell.title },
        ],
      });
    }

    return {
      type: 'group',
      x: GRID_X,
      y: GRID_Y - this.scrollY, // translate the realized window
      children,
    };
  }
}
