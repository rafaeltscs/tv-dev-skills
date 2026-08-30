// The "Browse all" screen. `catalog` is the full result set from the API —
// typically 400-800 title objects { id, title, artworkUrl }. It is laid out
// as one long vertical list of horizontal rows (6 tiles per row).
//
// Why this screen was slow to open and grew memory forever (it is NOT the
// TV's image decoder):
//
//   1. No windowing. The old render() returned a node tree for the ENTIRE
//      catalog, and the framework "realizes whatever render() returns in
//      full". Lazy-loading each poster's bitmap cut decode work at open, but
//      all 400-800 image nodes still lived in the tree permanently. Once a
//      poster's texture was created it was never released, because its node
//      never left the tree, so the renderer's LRU cache could never evict it.
//      A slow decoder makes images appear late; it does not make memory grow
//      without bound. Retention does.
//
//   2. Garbage on every scroll step. onScroll -> update() -> render() rebuilt
//      the whole tree (a slice, a map, hundreds of fresh node objects) many
//      times per second while the d-pad was held. On the TV that allocation
//      rate forces GC pauses = the scroll jank.
//
//   3. Oversized source images. Tiles draw at 280x400 but artworkUrl is
//      almost certainly full-res art (1000x1500+). The TV keeps an RGBA
//      texture sized to the SOURCE: ~13 MB at 1500x2250 vs ~0.45 MB at
//      280x400.
//
// Fixes below: build only the rows near the viewport (open time is now a
// screenful, not the catalog); let off-screen rows leave the tree so their
// textures become evictable; fold scroll-driven re-renders into one per
// frame; ask the CDN for art at display size.

const COLS = 6;
const TILE_W = 280;
const TILE_H = 400;
const COL_STRIDE = 320; // tile box + horizontal gutter
const ROW_STRIDE = 430; // tile height + caption + vertical gutter
const LIST_X = 60;
const LIST_Y = 40;

// Rows to build above and below the visible band so a fast scroll doesn't
// flash empty gaps before the next frame catches up.
const OVERSCAN_ROWS = 3;

// Ask the image CDN for art at roughly the size it will be drawn, so the TV
// isn't decoding and storing a 1500px poster just to paint it 280px wide.
// Adjust the param names to whatever your CDN uses — the point is never to
// hand the TV an image materially larger than its box.
function sizedArtwork(url, w, h) {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}w=${w}&h=${h}&fit=cover`;
}

export default class CatalogScreen {
  constructor(catalog) {
    this.catalog = catalog;
    this.scrollY = 0;
    this.rowCount = Math.ceil(catalog.length / COLS);

    // Scroll coalescing state.
    this._pendingScrollY = 0;
    this._frameScheduled = false;
  }

  onScroll(offset) {
    // Fires many times per second while a key is held. Don't render per
    // event — keep the latest position and render once on the next frame.
    this._pendingScrollY = offset;
    if (this._frameScheduled) return;
    this._frameScheduled = true;
    this.raf(() => {
      this._frameScheduled = false;
      if (this._pendingScrollY === this.scrollY) return;
      this.scrollY = this._pendingScrollY;
      this.update();
    });
  }

  // Row indices that fall in (or near) the viewport right now.
  _visibleRange() {
    const first = Math.max(
      0,
      Math.floor(this.scrollY / ROW_STRIDE) - OVERSCAN_ROWS
    );
    const onScreenRows = Math.ceil(this.viewport.h / ROW_STRIDE);
    const last = Math.min(
      this.rowCount - 1,
      first + onScreenRows + OVERSCAN_ROWS * 2
    );
    return [first, last];
  }

  render() {
    const [firstRow, lastRow] = this._visibleRange();

    const rows = [];
    for (let r = firstRow; r <= lastRow; r++) {
      const start = r * COLS;
      const rowItems = this.catalog.slice(start, start + COLS);
      rows.push({
        type: 'group',
        // Absolute row position minus scroll. Only ~12 of these exist at a
        // time now, so recomputing them every frame is cheap.
        y: r * ROW_STRIDE - this.scrollY,
        children: rowItems.map((item, c) => ({
          type: 'group',
          x: c * COL_STRIDE,
          w: TILE_W,
          h: TILE_H,
          children: [
            {
              type: 'image',
              w: TILE_W,
              h: TILE_H,
              src: sizedArtwork(item.artworkUrl, TILE_W, TILE_H),
            },
            { type: 'text', y: TILE_H + 5, text: item.title },
          ],
        })),
      });
    }

    // Rows outside [firstRow, lastRow] are simply not returned, so the
    // renderer drops their nodes and their poster textures become
    // LRU-evictable. That is what makes memory plateau instead of climb.
    return { type: 'group', x: LIST_X, y: LIST_Y, children: rows };
  }
}
