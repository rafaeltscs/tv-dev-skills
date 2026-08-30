// A catalog poster grid. `items` is ~120 movie objects from the API:
//   { id, title, artworkUrl }
// artworkUrl points at the image service and returns a 2000x3000 master
// image. The service also accepts ?w=&h= resize params, and we now use
// them: a poster cell is 260x390, so downloading/decoding a 2000x3000
// master (~24 MB decoded) per cell is ~60x more texture memory than the
// panel can display. On a 2020 TV, 120 of those at once is ~2.8 GB and
// the app OOMs after a couple of category switches.
//
// Two changes vs. the original:
//   1. Request a pre-scaled image (?w=&h=) so each texture is ~0.4 MB.
//   2. Virtualize: only realize the poster cells in (or near) the
//      viewport instead of all ~120 at once.
//
// Note: the renderer's LRU image cache is bounded by *entry count*. With
// small textures a low limit (~100) is fine; a 500-entry limit sized for
// 24 MB masters is ~12 GB and should be reverted.

const COLS = 5;
const COL_PITCH = 300; // x distance between cell origins
const ROW_PITCH = 430; // y distance between cell origins
const CELL_W = 260;
const CELL_H = 390;
const ORIGIN_X = 80;
const ORIGIN_Y = 60;

// Extra rows rendered above and below the viewport so fast scrolling
// doesn't outrun texture loading.
const ROW_BUFFER = 2;

export default class PosterGrid {
  constructor(items) {
    this.items = items;
    this.scrollY = 0;
    this._frameQueued = false;
  }

  // Fires many times/second while a d-pad key is held. Just record the
  // offset and let render() recompute the window; coalesce any explicit
  // re-render through raf so we rebuild at most once per frame.
  onScroll(offset) {
    this.scrollY = offset;
    if (this._frameQueued || typeof this.update !== 'function') return;
    this._frameQueued = true;
    this.raf(() => {
      this._frameQueued = false;
      this.update();
    });
  }

  // Index range [start, end) of items that should be realized for the
  // current scroll position.
  _visibleRange() {
    const viewH = (this.viewport && this.viewport.h) || 1080;
    const firstRow =
      Math.floor((this.scrollY - ORIGIN_Y) / ROW_PITCH) - ROW_BUFFER;
    const rowsOnScreen = Math.ceil(viewH / ROW_PITCH) + 1;
    const lastRow = firstRow + rowsOnScreen + ROW_BUFFER;

    const start = Math.max(0, firstRow * COLS);
    const end = Math.min(this.items.length, Math.max(0, lastRow) * COLS);
    return { start, end };
  }

  render() {
    const { start, end } = this._visibleRange();

    const children = [];
    for (let i = start; i < end; i++) {
      const item = this.items[i];
      const row = Math.floor(i / COLS);
      const col = i % COLS;

      children.push({
        type: 'group',
        x: col * COL_PITCH,
        y: row * ROW_PITCH,
        w: CELL_W,
        h: CELL_H,
        children: [
          {
            type: 'image',
            w: CELL_W,
            h: CELL_H,
            src: posterUrl(item.artworkUrl, CELL_W, CELL_H),
          },
          {
            type: 'text',
            y: CELL_H + 5,
            text: item.title,
          },
        ],
      });
    }

    // The group is positioned at the grid origin; individual cells keep
    // their absolute row/col coordinates so the framework can translate
    // the group by scrollY without re-realizing off-screen cells.
    return {
      type: 'group',
      x: ORIGIN_X,
      y: ORIGIN_Y,
      children,
    };
  }
}

// Ask the image service for the size we actually draw. A 260x390 poster
// decodes to ~0.4 MB instead of ~24 MB for the 2000x3000 master, and the
// TV downloads a few KB instead of 1-2 MB per cell.
function posterUrl(url, w, h) {
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return `${url}${sep}w=${w}&h=${h}`;
}
