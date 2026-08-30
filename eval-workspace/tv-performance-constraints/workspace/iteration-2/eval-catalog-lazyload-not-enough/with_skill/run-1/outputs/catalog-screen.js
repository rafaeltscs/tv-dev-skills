// The "Browse all" screen. `catalog` is the full result set from the API —
// typically 400-800 title objects { id, title, artworkUrl }, laid out as a
// vertical list of rows, 6 tiles per row.
//
// Design target: the low-RAM TV device class — ~1 GB RAM shared with the OS
// and the video decoder, ~30-40 MB total for ALL GPU textures, slow CPU
// cores, UI graphics plane at 1080p. These numbers are written for that
// floor and need confirming with an on-device heap/texture profile (see the
// response for what to measure); a laptop only establishes the shape.
//
// Core rule: the full catalog exists only as DATA. At any moment only a
// small window of rows exists as VIEWS and TEXTURES. Rows that leave the
// window release their poster textures so memory PLATEAUS while browsing
// instead of climbing.

const COLS = 6;
const TILE_W = 280;
const TILE_H = 400;
const TILE_PITCH_X = 320;
const ROW_PITCH_Y = 430;
const GRID_X = 60;
const GRID_Y = 40;

// Canonical rendition ladder the image service/CDN exposes. Three widths,
// app-wide: every equal-size slot rounds up into the SAME width, so it
// resolves to the SAME url — the renderer dedupes textures by url and the
// HTTP cache stays warm. We never request the master rendition.
const RENDITION_WIDTHS = [140, 300, 500];

// Rows kept as views on each side of the visible band. Cheap: a view with
// no poster is one solid rect + one short text texture.
const VIEW_MARGIN_ROWS = 1;
// Rows that ALSO carry poster textures on each side of the visible band.
// This is the knob that sets GPU memory — keep it small.
const IMAGE_MARGIN_ROWS = 1;

// One shared solid-colour placeholder for the whole screen. Renders
// instantly, costs ~nothing, and is BOTH the loading state and the failure
// state — never a second image request per slot, never a hole in the grid.
const PLACEHOLDER_COLOR = 0xff17171b;
const TRANSPARENT = 0x00000000;

// Pick the smallest ladder width >= the slot's on-screen width.
function renditionUrl(masterUrl, slotCssWidth) {
  let w = RENDITION_WIDTHS[RENDITION_WIDTHS.length - 1];
  for (let i = 0; i < RENDITION_WIDTHS.length; i++) {
    if (RENDITION_WIDTHS[i] >= slotCssWidth) {
      w = RENDITION_WIDTHS[i];
      break;
    }
  }
  const sep = masterUrl.indexOf('?') === -1 ? '?' : '&';
  return masterUrl + sep + 'w=' + w;
}

export default class CatalogScreen {
  constructor(catalog) {
    this.catalog = catalog;
    this.scrollY = 0;
    this.rowCount = Math.ceil(catalog.length / COLS);

    // Per-item derived data computed ONCE, now, while any GC pause is hidden
    // behind the loading spinner — not on the scroll hot path. The poster
    // url is quantised to the ladder here so it's a plain field lookup later,
    // never a string built per frame.
    this.items = new Array(catalog.length);
    for (let i = 0; i < catalog.length; i++) {
      const it = catalog[i];
      this.items[i] = {
        id: it.id,
        title: it.title,
        posterUrl: renditionUrl(it.artworkUrl, TILE_W),
      };
    }

    // Fixed pool of row view-nodes: visible rows + margin, both sides.
    // Reused across every render() pass. Crossing a row boundary REBINDS
    // these nodes (property writes only) instead of allocating a fresh tile
    // tree — view count and allocation rate stay constant no matter how big
    // the catalog is.
    this._rowPool = [];
    this._firstRealizedRow = 0;
    this._lastFirstRow = -1;
    this._lastLastRow = -1;

    // Stable root + children array, mutated in place so a scroll step that
    // doesn't cross a row boundary allocates nothing at all.
    this._root = { type: 'group', x: GRID_X, y: GRID_Y, children: [] };

    // Start with posters for the visible band only; widen to the margin one
    // frame later so the burst of decodes at mount stays bounded and the
    // entry animation isn't fighting the CPU.
    this._imageMargin = 0;
    this._mounted = false;
  }

  mount() {
    this._mounted = true;
    // Startup ordering: shell + visible placeholders + visible posters this
    // frame; margin posters on the next idle frame, not at mount.
    this.raf(() => {
      if (!this._mounted) return;
      this._imageMargin = IMAGE_MARGIN_ROWS;
      this.update();
    });
  }

  unmount() {
    // Leaving the screen: drop every texture reference so the renderer's LRU
    // can actually reclaim them. Remembered scroll position stays on the
    // screen object (this.scrollY), so coming back is instant and re-realizes
    // from data.
    this._mounted = false;
    for (let s = 0; s < this._rowPool.length; s++) {
      const row = this._rowPool[s];
      if (!row) continue;
      for (let c = 0; c < COLS; c++) row.children[c].children[1].src = null;
    }
    this._rowPool.length = 0;
    this._root.children.length = 0;
    this._lastFirstRow = -1;
    this._lastLastRow = -1;
  }

  onScroll(offset) {
    // TV scrolling is discrete and focus-driven — one step per key press, no
    // flings, no scrollbar teleports. So this just records the offset and
    // re-syncs; the heavy work is gated on the row window actually moving.
    this.scrollY = offset;
    this.update();
  }

  // --- windowing ---------------------------------------------------------

  _firstVisibleRow() {
    const r = Math.floor(this.scrollY / ROW_PITCH_Y);
    return r < 0 ? 0 : r;
  }

  _lastVisibleRow() {
    const r = Math.floor((this.scrollY + this.viewport.h) / ROW_PITCH_Y);
    return r > this.rowCount - 1 ? this.rowCount - 1 : r;
  }

  render() {
    const firstVis = this._firstVisibleRow();
    const lastVis = this._lastVisibleRow();

    let firstRow = firstVis - VIEW_MARGIN_ROWS;
    let lastRow = lastVis + VIEW_MARGIN_ROWS;
    if (firstRow < 0) firstRow = 0;
    if (lastRow > this.rowCount - 1) lastRow = this.rowCount - 1;

    let firstImg = firstVis - this._imageMargin;
    let lastImg = lastVis + this._imageMargin;
    if (firstImg < 0) firstImg = 0;
    if (lastImg > this.rowCount - 1) lastImg = this.rowCount - 1;

    this._firstRealizedRow = firstRow;

    const children = this._root.children;
    children.length = 0;
    for (let row = firstRow; row <= lastRow; row++) {
      children.push(this._row(row, row >= firstImg && row <= lastImg));
    }

    this._lastFirstRow = firstRow;
    this._lastLastRow = lastRow;
    return this._root;
  }

  // Build-or-rebind one row from the pool. `withImages` means this row is
  // inside the image window and should carry poster textures.
  _row(rowIndex, withImages) {
    const slot = rowIndex - this._firstRealizedRow;
    let row = this._rowPool[slot];

    if (!row) {
      row = {
        type: 'group',
        y: 0,
        boundRow: -1,
        boundImages: false,
        children: [],
      };
      for (let c = 0; c < COLS; c++) {
        row.children.push({
          type: 'group',
          x: c * TILE_PITCH_X,
          w: TILE_W,
          h: TILE_H,
          children: [
            { type: 'rect', w: TILE_W, h: TILE_H, color: PLACEHOLDER_COLOR },
            { type: 'image', w: TILE_W, h: TILE_H, src: null },
            { type: 'text', y: TILE_H + 5, text: '' },
          ],
        });
      }
      this._rowPool[slot] = row;
    }

    // Cheap, every step: reposition. Just a y offset on the group — no
    // per-child relayout.
    row.y = rowIndex * ROW_PITCH_Y - this.scrollY;

    // Costlier, so only when this pooled slot's identity or image tier
    // changed — a few times per second at most, never on the sub-row scroll
    // steps in between. No allocation here either: pure field writes into
    // nodes that already exist.
    if (row.boundRow !== rowIndex || row.boundImages !== withImages) {
      const base = rowIndex * COLS;
      for (let c = 0; c < COLS; c++) {
        const tile = row.children[c];
        const bg = tile.children[0];
        const img = tile.children[1];
        const label = tile.children[2];
        const item = this.items[base + c];

        if (!item) {
          // Last row, fewer than COLS titles: park the tile invisibly.
          bg.color = TRANSPARENT;
          img.src = null;
          label.text = '';
          continue;
        }

        bg.color = PLACEHOLDER_COLOR;
        label.text = item.title;

        // Clear before (re)setting so a recycled slot can't flash the
        // previous poster for a frame, and a late-arriving load for the old
        // item can't paint into this slot.
        const wantSrc = withImages ? item.posterUrl : null;
        if (img.src !== wantSrc) {
          img.src = null;
          img.src = wantSrc;
        }
      }
      row.boundRow = rowIndex;
      row.boundImages = withImages;
    }

    return row;
  }
}
