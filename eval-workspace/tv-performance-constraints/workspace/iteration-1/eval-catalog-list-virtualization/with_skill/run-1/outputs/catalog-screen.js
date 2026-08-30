// The "Browse all" screen — rebuilt to run on low-end TV hardware.
//
// `catalog` is still the full API result set (400-800 objects
// { id, title, artworkUrl }). The change is structural: the catalog is
// now DATA ONLY. At any moment only a small window of rows exists as view
// nodes, and an even smaller window has image textures. Rows leaving the
// window release their textures and their view is recycled, so memory
// plateaus while browsing instead of climbing forever.
//
// Rules applied (tv-performance-constraints skill):
//   virtualization.md    - realize a window, recycle a fixed pool of views,
//                          keep remembered state with the data
//   texture-memory.md     - release textures on leave; keep the working set
//                          well under the ~30-40 MB whole-app texture budget
//   image-loading.md      - request slot-sized renditions, colour
//                          placeholders, bounded decode concurrency
//   gc-and-allocation.md  - onScroll allocates nothing in the steady state

const COLS      = 6;
const TILE_W    = 280;
const TILE_H    = 400;
const COL_PITCH = 320;   // TILE_W + 40 px gutter
const ROW_PITCH = 430;   // TILE_H + label + gap
const ORIGIN_X  = 60;
const ORIGIN_Y  = 40;

// One of 3-4 canonical rendition widths used app-wide. The slot is 280 px
// on the 1080p UI, so round up to 300 and let every card share that URL
// (the renderer dedupes textures by URL; the CDN cache stays warm).
// NEVER the master: a ~2000x3000 poster costs full decode CPU and a
// ~24 MB texture no matter how small it is drawn.
const RENDITION_W = 300;

// Rows within this many rows of the visible band keep a view (recycled).
const VIEW_MARGIN_ROWS  = 2;
// Rows within this many rows of the visible band also get image textures.
// Outside it the view stays but the tile shows only its placeholder rect.
const IMAGE_MARGIN_ROWS = 1;

// Never start more than this many decodes at once - a burst at mount
// saturates a slow CPU exactly during the entry animation.
const MAX_INFLIGHT_DECODES = 6;

const PLACEHOLDER_COLOR = 0xff17171b;
const VIEWPORT_ROWS = Math.ceil(1080 / ROW_PITCH);

function posterUrl(item) {
  // Real backends: `?w=300`, or a rendition ladder (w185/w342/w500...).
  return `${item.artworkUrl}?w=${RENDITION_W}`;
}

export default class CatalogScreen {
  constructor(catalog) {
    this.catalog  = catalog;                          // DATA only
    this.rowCount = Math.ceil(catalog.length / COLS);
    this.scrollY  = 0;                                // remembered with the screen

    // Fixed pool of recycled row views + the currently realized rows.
    this._pool      = [];
    this._realized  = new Map();                      // rowIndex -> row view node
    this._active    = [];                             // stable children array
    this._container = { type: 'group', x: ORIGIN_X, y: ORIGIN_Y, children: this._active };

    // Window bounds, so we can early-out when nothing crossed a boundary.
    this._viewStart = this._viewEnd = -1;
    this._imgStart  = this._imgEnd  = -1;
    this._lastFirstVisible = -1;

    // Bounded decode queue; per-node token rejects stale/late loads.
    this._queue    = [];
    this._inflight = 0;

    // Label strings precomputed once per item, not per bind.
    this._titles = new Map();
  }

  mount() {
    // Startup ordering: shell + first viewport now. The margin rows are
    // realized on the first scroll; nothing below the fold is touched.
    this._syncWindow(true);
  }

  unmount() {
    // Everything leaving the screen releases its resources.
    for (const rowIndex of this._realized.keys()) this._releaseRow(rowIndex);
    this._realized.clear();
    this._pool.length   = 0;
    this._active.length  = 0;
    this._queue.length   = 0;
    this._inflight       = 0;
  }

  onScroll(offset) {
    this.scrollY = offset;
    // Cheap: translate the whole list. No re-render, no allocation.
    this._container.y = ORIGIN_Y - offset;

    // Only touch the pool when the integer row window actually moves
    // (a few times per second, not on every scroll tick).
    const firstVisible = (offset / ROW_PITCH) | 0;
    if (firstVisible !== this._lastFirstVisible) {
      this._lastFirstVisible = firstVisible;
      this._syncWindow(false);
    }
    this.update();
  }

  render() {
    if (this._viewEnd < 0) this._syncWindow(true);   // safety if mount() was skipped
    return this._container;
  }

  // --- windowing ---------------------------------------------------------

  _syncWindow(initial) {
    const firstVisible = (this.scrollY / ROW_PITCH) | 0;
    const lastVisible  = firstVisible + VIEWPORT_ROWS;

    const viewStart = Math.max(0, firstVisible - VIEW_MARGIN_ROWS);
    const viewEnd   = Math.min(this.rowCount - 1, lastVisible + VIEW_MARGIN_ROWS);
    const imgStart  = Math.max(0, firstVisible - IMAGE_MARGIN_ROWS);
    const imgEnd    = Math.min(this.rowCount - 1, lastVisible + IMAGE_MARGIN_ROWS);

    if (!initial &&
        viewStart === this._viewStart && viewEnd === this._viewEnd &&
        imgStart  === this._imgStart  && imgEnd  === this._imgEnd) {
      return;                                         // nothing crossed a boundary
    }

    // Release rows that fell outside the view window (frees textures,
    // returns the view to the pool, keeps nothing but data).
    for (const rowIndex of this._realized.keys()) {
      if (rowIndex < viewStart || rowIndex > viewEnd) this._releaseRow(rowIndex);
    }

    // Realize / rebind rows inside the view window.
    for (let r = viewStart; r <= viewEnd; r++) {
      const wantImages = r >= imgStart && r <= imgEnd;
      let view = this._realized.get(r);
      if (!view) {
        view = this._pool.pop() || this._createRowView();
        view.y = r * ROW_PITCH;
        this._realized.set(r, view);
        this._bindRow(view, r, wantImages);
      } else if (wantImages !== view._hasImages) {
        this._bindRowImages(view, r, wantImages);     // only crossed the image edge
      }
    }

    this._viewStart = viewStart; this._viewEnd = viewEnd;
    this._imgStart  = imgStart;  this._imgEnd  = imgEnd;

    // Rebuild the (small, ~8-element) children array only here, never per tick.
    this._active.length = 0;
    for (let r = viewStart; r <= viewEnd; r++) {
      const v = this._realized.get(r);
      if (v) this._active.push(v);
    }
  }

  // --- row views (recycled, never destroyed) ---------------------------

  _createRowView() {
    const children = new Array(COLS);
    for (let c = 0; c < COLS; c++) {
      const rect  = { type: 'rect',  x: 0, y: 0, w: TILE_W, h: TILE_H, color: PLACEHOLDER_COLOR };
      const image = { type: 'image', x: 0, y: 0, w: TILE_W, h: TILE_H, src: null };
      const text  = { type: 'text',  x: 0, y: TILE_H + 5, text: '' };
      image._token = 0;
      children[c] = {
        type: 'group', x: c * COL_PITCH, w: TILE_W, h: TILE_H,
        children: [rect, image, text],       // rect first: placeholder / failure state
      };
    }
    return { type: 'group', x: 0, y: 0, _hasImages: false, children };
  }

  _bindRow(view, rowIndex, wantImages) {
    const base = rowIndex * COLS;
    for (let c = 0; c < COLS; c++) {
      const item = this.catalog[base + c];
      const tile = view.children[c];
      const image = tile.children[1];
      const text  = tile.children[2];
      // Clear to placeholder BEFORE rebinding so the previous poster can
      // never flash in a recycled slot; invalidate any in-flight load.
      image.src = null;
      image._token++;
      tile.w   = item ? TILE_W : 0;                   // no hole, no half row
      text.text = item ? this._titleFor(item) : '';
    }
    view._hasImages = false;
    if (wantImages) this._bindRowImages(view, rowIndex, true);
  }

  _bindRowImages(view, rowIndex, wantImages) {
    const base = rowIndex * COLS;
    for (let c = 0; c < COLS; c++) {
      const item  = this.catalog[base + c];
      const image = view.children[c].children[1];
      if (wantImages && item) {
        this._enqueueDecode(image, posterUrl(item));
      } else {
        image.src = null;                             // release texture on leave
        image._token++;                               // reject any late load
        image._pendingUrl = null;                     // drop a queued-but-unstarted load
      }
    }
    view._hasImages = wantImages;
  }

  _releaseRow(rowIndex) {
    const view = this._realized.get(rowIndex);
    if (!view) return;
    for (let c = 0; c < COLS; c++) {
      const image = view.children[c].children[1];
      image.src = null;                               // free the GPU texture
      image._token++;
      image._pendingUrl = null;
    }
    view._hasImages = false;
    this._realized.delete(rowIndex);
    this._pool.push(view);                            // recycle, don't destroy
  }

  // --- bounded image decode -------------------------------------------

  _enqueueDecode(image, url) {
    image._token++;
    image._pendingUrl = url;
    this._queue.push(image);
    this._pump();
  }

  _pump() {
    while (this._inflight < MAX_INFLIGHT_DECODES && this._queue.length) {
      const image = this._queue.shift();
      const url   = image._pendingUrl;
      image._pendingUrl = null;
      if (url == null) continue;                      // released before it started
      const token = image._token;
      this._inflight++;
      image.src = url;
      // Renderer texture load/error events (Lightning: 'txLoaded' / 'txError').
      // One bounded closure per decode start - off the per-scroll path.
      image.onLoad = image.onError = () => {
        this._inflight--;
        // A late callback must not leave a stale poster in a slot that was
        // recycled to a different item.
        if (image._token !== token) image.src = null;
        this._pump();
      };
    }
  }

  // --- misc ----------------------------------------------------------

  _titleFor(item) {
    let t = this._titles.get(item.id);
    if (t === undefined) {
      t = item.title.length > 32 ? item.title.slice(0, 31) + '…' : item.title;
      this._titles.set(item.id, t);
    }
    return t;
  }
}
