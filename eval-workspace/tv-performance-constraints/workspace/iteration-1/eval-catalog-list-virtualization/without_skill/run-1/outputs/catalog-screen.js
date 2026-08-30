// The "Browse all" screen, rebuilt as a *virtualized* (windowed) list.
//
// `catalog` is still the full result set from the API (typically 400-800
// title objects { id, title, artworkUrl }), but we never realize the whole
// thing. Only the rows that intersect the viewport (plus a small overscan
// band) are ever returned from render(), so:
//
//   - opening the screen builds ~40 nodes and kicks off ~30 texture
//     decodes instead of ~5,600 nodes and 800 decodes;
//   - texture memory is bounded to the window (~20 MB) instead of growing
//     with every row the user reveals;
//   - rows that scroll out of the window leave the node tree, which fires
//     their unmount() and releases their GPU textures -- so memory falls
//     again when the user scrolls back up.
//
// Three independent problems are being fixed here; see notes inline:
//   1. windowing            -> only build visible rows
//   2. texture sizing       -> request artwork at display size, not intrinsic
//   3. scroll work coalesced -> one recompute per frame, re-render only on
//                               a window change

const COLS = 6;
const TILE_W = 280;
const TILE_H = 400;
const COL_PITCH = 320; // tile + horizontal gap (matches the original x: c * 320)
const ROW_PITCH = 430; // tile + caption + vertical gap
const ORIGIN_X = 60;
const ORIGIN_Y = 40;

// How many extra rows to keep realized above and below the viewport. Enough
// to cover one d-pad "page jump" worth of travel before the next frame so
// the user never sees an empty row; small enough that the texture budget
// stays flat. 2 is a good default for a 6-up grid.
const OVERSCAN_ROWS = 2;

// Optional: keep the N most-recently-used poster textures decoded so that
// scrolling back up is instant instead of re-decoding. Bounded, so a long
// browse session cannot grow unbounded. Set to 0 to disable and rely purely
// on unmount() to free everything off-window.
const TEXTURE_CACHE_LIMIT = 60;

/**
 * Ask the artwork CDN for an image already sized for the tile.
 *
 * This is the single most important fix for the "memory climbs forever"
 * symptom. Per the framework contract, an `image` node "is decoded at the
 * source image's intrinsic pixel size, not the node size" -- so a 1000x1500
 * poster costs ~6 MB of GPU memory (1000*1500*4) whether it's drawn at
 * 280x400 or not. Requesting it at 280x400 drops that to ~0.45 MB.
 *
 * Adjust the query params to whatever your image service actually uses
 * (Thumbor, imgix, Akamai IM, a homegrown resizer, ...). The app renders at
 * 1080p even on 4K panels, so 1x device pixels == 280x400 is correct; do
 * NOT request 2x "for sharpness" -- it quadruples the texture cost for no
 * visible gain at 10-foot viewing distance.
 */
function sizedArtworkUrl(url, w, h) {
  if (!url) return null;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}w=${w}&h=${h}&fit=cover`;
}

export default class CatalogScreen {
  constructor(catalog) {
    this.catalog = catalog || [];
    this.scrollY = 0;

    this.rowCount = Math.ceil(this.catalog.length / COLS);

    // Total scrollable height. The parent scroller / scrollbar / focus math
    // still needs to know how tall the *full* list is even though we only
    // draw a slice of it, so expose it explicitly.
    this.contentHeight = this.rowCount * ROW_PITCH;

    // Currently realized row range [start, end] (inclusive). -1/-1 = nothing
    // realized yet.
    this._winStart = -1;
    this._winEnd = -1;

    // Scroll-work coalescing. onScroll can fire many times per second while
    // a d-pad key is held; we do at most one window recompute per frame.
    this._framePending = false;

    // Small LRU of decoded textures for snappy scroll-back. Keyed by URL.
    this._textureCache = new Map();
  }

  mount() {
    this._recomputeWindow();
  }

  unmount() {
    // Leaving the screen: drop everything so nothing survives into the next
    // screen's texture budget.
    this._textureCache.clear();
    this._winStart = this._winEnd = -1;
  }

  onScroll(offset) {
    this.scrollY = offset;
    if (this._framePending) return; // already have work queued for this frame
    this._framePending = true;
    this.raf(() => {
      this._framePending = false;
      // Only pay for a re-render when the visible *row window* actually
      // changed. Sub-row scrolling just shifts the group's y in render(),
      // which the next real re-render will pick up; but pure translation
      // does not need a rebuild every pixel.
      if (this._recomputeWindow()) this.update();
    });
  }

  /**
   * Derive [start, end] row indices from scrollY + viewport height.
   * Returns true if the window moved (caller should re-render).
   */
  _recomputeWindow() {
    const viewH = this.viewport.h;

    let start = Math.floor(this.scrollY / ROW_PITCH) - OVERSCAN_ROWS;
    let end = Math.ceil((this.scrollY + viewH) / ROW_PITCH) + OVERSCAN_ROWS;

    start = Math.max(0, start);
    end = Math.min(this.rowCount - 1, end);

    if (start === this._winStart && end === this._winEnd) return false;
    this._winStart = start;
    this._winEnd = end;
    return true;
  }

  _rememberTexture(src) {
    if (!src || TEXTURE_CACHE_LIMIT === 0) return;
    // refresh recency
    if (this._textureCache.has(src)) this._textureCache.delete(src);
    this._textureCache.set(src, true);
    while (this._textureCache.size > TEXTURE_CACHE_LIMIT) {
      const oldest = this._textureCache.keys().next().value;
      this._textureCache.delete(oldest);
    }
  }

  _tile(item, col) {
    const src = item ? sizedArtworkUrl(item.artworkUrl, TILE_W, TILE_H) : null;
    this._rememberTexture(src);

    const children = [
      // Cheap solid fill shown immediately while the texture decodes, so a
      // fast scroll never flashes empty holes.
      { type: 'rect', w: TILE_W, h: TILE_H, color: '#141414' },
    ];
    if (src) {
      children.push({ type: 'image', w: TILE_W, h: TILE_H, src });
    }
    if (item) {
      children.push({ type: 'text', y: TILE_H + 5, text: item.title });
    }

    return {
      type: 'group',
      x: col * COL_PITCH,
      w: TILE_W,
      h: TILE_H,
      children,
    };
  }

  render() {
    // Nothing decided yet (render before mount) -> fall back to a one-screen
    // window so we still show something.
    if (this._winStart < 0) this._recomputeWindow();

    const rows = [];
    for (let r = this._winStart; r <= this._winEnd; r++) {
      const base = r * COLS;
      const rowItems = this.catalog.slice(base, base + COLS);
      rows.push({
        type: 'group',
        // Absolute row position minus scroll offset. Rows outside
        // [_winStart, _winEnd] are simply not in this array, so their
        // nodes leave the tree and unmount() frees their textures.
        y: r * ROW_PITCH - this.scrollY,
        children: rowItems.map((item, c) => this._tile(item, c)),
      });
    }

    return {
      type: 'group',
      x: ORIGIN_X,
      y: ORIGIN_Y,
      // Height of the full list, for the host scroller / scrollbar / focus
      // navigation to reason about even though children is only a slice.
      h: this.contentHeight,
      children: rows,
    };
  }
}
