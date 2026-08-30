// Catalog poster grid, revised for low-end TV hardware (2020 smart-TV class:
// ~1 GB RAM shared with the OS + video decoder, ~30-40 MB total texture budget,
// slow CPU cores, UI composited at 1080p).
//
// `items` is ~120 movie objects: { id, title, artworkUrl }
// artworkUrl returns a 2000x3000 master and also accepts ?w= / ?h= resize params.
//
// Three problems in the original, all invisible on a dev machine:
//
//  1. Full-res masters in a 260x390 slot. A decoded image costs
//     width * height * 4 bytes no matter how small you draw it, so a 2000x3000
//     source is a ~24 MB texture *per poster*, and the decode CPU cost is set by
//     the source size too. render() realizes all ~120 -> ~2.8 GB of texture
//     uploads attempted -> the platform watchdog kills the app ("crashes after a
//     few categories"). The multi-hundred-ms decodes block frames ("images fade
//     in slowly", "cells stay blank while scrolling").
//
//  2. No windowing. render() realizes all 120 cells though the grid is 24 rows
//     (~10,300px) tall and only ~3 rows are ever visible. 21 rows of textures
//     and views are paid for off screen.
//
//  3. render() rebuilt the whole 120-node tree (objects, nested children
//     arrays, .map() closures) and was the only code path -- re-run on every
//     onScroll step, i.e. many times per second while a d-pad key is held. That
//     is heavy per-frame allocation -> GC pauses -> scroll hitches. Nothing was
//     released on unmount either, so browsing category to category staircased
//     memory up to the platform limit.
//
// Fixes below: request a slot-sized rendition from the image service, realize
// only a window of rows around the viewport, precompute per-item data once,
// rebuild the node tree only when the row window moves, drop everything on
// unmount, and back every slot with a cheap shared placeholder.

const COLS = 5;
const GRID_X = 80;
const GRID_Y = 60;

const CELL_W = 260;
const CELL_H = 390;
const COL_STRIDE = 300; // 260 cell + 40 gap
const ROW_STRIDE = 430; // 390 cell + 40 gap

// Image rendition ladder. Pick a few canonical sizes app-wide and round the
// slot up into one -- exact per-slot widths make every slot a distinct CDN
// cache entry and a distinct texture in the renderer's pool. The cell is
// 260x390 on a 1080p UI; the 300-wide rung covers it (kept at the 2:3 master
// aspect). 300x450x4 = ~540 KB per poster vs ~24 MB for the master.
const POSTER_W = 300;
const POSTER_H = 450;

// One shared, opaque placeholder fill for every slot: renders instantly, needs
// no image request, and means a slow decode or a failed load is never a hole in
// the layout or a permanent black rectangle.
const PLACEHOLDER_COLOR = 0xff17171b;

// Rows kept realized beyond the visible ones (roughly one viewport of margin),
// with an extra row on the side we are scrolling toward. This is the memory vs
// smooth-fast-scroll knob: ~5-6 realized rows * 5 cols * ~540 KB ~= 13-16 MB.
const OVERSCAN_ROWS = 1;

export default class PosterGrid {
  constructor(items) {
    this.items = items;

    // Precompute everything derived from the data ONCE, off the scroll path:
    // grid position, title, and the resized poster URL.
    this.cells = items.map((item, i) => {
      const col = i % COLS;
      const row = (i - col) / COLS;
      return {
        id: item.id,
        title: item.title,
        row,
        x: GRID_X + col * COL_STRIDE,
        y: GRID_Y + row * ROW_STRIDE,
        posterUrl: sizedUrl(item.artworkUrl, POSTER_W, POSTER_H),
      };
    });
    this.rowCount = Math.ceil(items.length / COLS);

    this.scrollOffset = 0;
    this._dir = 1; // 1 = scrolling down, -1 = up
    this._firstRow = -1;
    this._lastRow = -1;
    this._tree = null; // cached node tree; rebuilt only when the window moves
  }

  mount() {
    this._recomputeWindow();
  }

  unmount() {
    // Drop references so this screen's poster textures become evictable the
    // moment the grid leaves the tree. This is what stops memory climbing as
    // the user moves through categories.
    this._tree = null;
    this._firstRow = this._lastRow = -1;
  }

  onScroll(offset) {
    this._dir = offset >= this.scrollOffset ? 1 : -1;
    this.scrollOffset = offset;
    // Cheap on every step: only decide whether the realized row window moved.
    // The node tree is rebuilt (in render) only when it actually did.
    this._recomputeWindow();
  }

  render() {
    if (!this._tree) this._buildTree();
    return this._tree;
  }

  // --- internal --------------------------------------------------------------

  _recomputeWindow() {
    const vh = (this.viewport && this.viewport.h) || 1080;
    const leadTop = OVERSCAN_ROWS + (this._dir < 0 ? OVERSCAN_ROWS : 0);
    const leadBot = OVERSCAN_ROWS + (this._dir > 0 ? OVERSCAN_ROWS : 0);

    const firstVisible = Math.floor((this.scrollOffset - GRID_Y) / ROW_STRIDE);
    const lastVisible = Math.floor((this.scrollOffset + vh - GRID_Y) / ROW_STRIDE);

    const first = Math.max(0, firstVisible - leadTop);
    const last = Math.min(this.rowCount - 1, lastVisible + leadBot);

    if (first === this._firstRow && last === this._lastRow) return;
    this._firstRow = first;
    this._lastRow = last;
    this._tree = null; // mark dirty; render() rebuilds on next call
  }

  _buildTree() {
    const first = this._firstRow;
    const last = this._lastRow;
    const children = [];

    for (let k = 0; k < this.cells.length; k++) {
      const cell = this.cells[k];
      if (cell.row < first || cell.row > last) continue; // data only, no views
      children.push({
        type: 'group',
        id: cell.id, // stable identity: lets a diffing host rebind, not recreate
        x: cell.x,
        y: cell.y,
        w: CELL_W,
        h: CELL_H,
        children: [
          // Shared placeholder behind every poster: loading + failure state.
          { type: 'rect', x: 0, y: 0, w: CELL_W, h: CELL_H, color: PLACEHOLDER_COLOR },
          // Slot-sized rendition, not the 2000x3000 master.
          { type: 'image', x: 0, y: 0, w: CELL_W, h: CELL_H, src: cell.posterUrl },
          { type: 'text', y: CELL_H + 5, text: cell.title },
        ],
      });
    }

    this._tree = { type: 'group', x: 0, y: 0, children };
  }
}

// Append the image service's resize params without clobbering an existing query
// string. Quantized width/height keep the URL stable so the CDN and the
// renderer's texture cache can dedupe.
function sizedUrl(masterUrl, w, h) {
  const sep = masterUrl.indexOf('?') === -1 ? '?' : '&';
  return masterUrl + sep + 'w=' + w + '&h=' + h;
}
