// A catalog poster grid, tuned for 2020-era smart TV hardware.
//
// `items` is ~120 movie objects from the API: { id, title, artworkUrl }.
// artworkUrl points at the image service, which returns a 2000x3000 master
// image but also accepts ?w=&h= resize params.
//
// Three separate things break this component on a real TV:
//
// 1. Image size. The GPU decodes a texture at the *source* image's
//    intrinsic size, not the node size. Every 260x390 cell was therefore
//    uploading a 2000x3000 (~6 MP) texture: 2000*3000*4 = ~24 MB of GPU
//    memory and a multi-hundred-millisecond CPU decode per poster. That is
//    the "images pop in slowly".
//
// 2. No windowing. render() realized all ~120 posters at once. 120 * 24 MB
//    is ~2.8 GB of texture memory on a device that has a few hundred MB for
//    the whole app. Browse two or three categories (each new grid piling
//    textures on top of the last) and it runs out of memory and dies.
//
// 3. Nothing to draw while a texture uploads, so cells are blank during the
//    scroll instead of showing something.
//
// Fixes below:
//   - Ask the image service for cell-sized images via ?w=&h= (~24 MB ->
//     ~0.4 MB per poster, and a fast decode).
//   - Only render the rows near the viewport, plus a small buffer, so the
//     realized texture set stays bounded no matter how long the list is.
//   - Draw a solid placeholder rect under every poster (a rect costs no
//     texture upload) so a scrolling cell is never blank.
//   - Release references on unmount so the old grid's textures can be freed
//     when switching categories.

const COLS = 5;
const CELL_W = 260;
const CELL_H = 390;
const COL_PITCH = 300;
const ROW_PITCH = 430;
const BUFFER_ROWS = 2; // rows kept realized above and below the viewport
const PLACEHOLDER_COLOR = '#1b1b22';

export default class PosterGrid {
  constructor(items) {
    this.items = items || [];
    this.scrollY = 0;
    this.rowCount = Math.ceil(this.items.length / COLS);
    this._lastFirstRow = -1;

    // Pre-build one resized URL per item. Doing this once in the
    // constructor (instead of inside render()) keeps us from allocating
    // ~35 new strings on every scroll frame, which matters for GC pressure
    // on a weak TV CPU.
    this.posterUrls = this.items.map((item) =>
      withSize(item.artworkUrl, CELL_W, CELL_H)
    );
  }

  mount() {
    this._mounted = true;
  }

  unmount() {
    // Switching categories unmounts this grid and mounts a new one. Drop
    // our references so the framework can free the textures we uploaded;
    // otherwise every category we visit leaks a full grid's worth of
    // textures and the app OOMs after a few.
    this._mounted = false;
    this.items = [];
    this.posterUrls = [];
  }

  onScroll(offset) {
    this.scrollY = offset;

    // onScroll fires many times per second while a d-pad key is held.
    // Re-rendering the node tree on every tick is wasted work, so only
    // re-render when the set of visible rows actually changes.
    const firstRow = this._firstVisibleRow();
    if (firstRow !== this._lastFirstRow) {
      this._lastFirstRow = firstRow;
      this._requestRender();
    }
  }

  _requestRender() {
    // Framework hook to re-invoke render(). Named defensively so this file
    // still works if the host calls it something else.
    if (typeof this.update === 'function') this.update();
    else if (typeof this.invalidate === 'function') this.invalidate();
    else if (typeof this.requestRender === 'function') this.requestRender();
  }

  _firstVisibleRow() {
    const firstOnScreen = Math.floor(this.scrollY / ROW_PITCH);
    return clamp(firstOnScreen - BUFFER_ROWS, 0, Math.max(0, this.rowCount - 1));
  }

  render() {
    const items = this.items || [];
    const viewportH = (this.viewport && this.viewport.h) || 1080;

    const firstRow = this._firstVisibleRow();
    const rowsInView = Math.ceil(viewportH / ROW_PITCH);
    const lastRow = Math.min(
      this.rowCount,
      firstRow + rowsInView + BUFFER_ROWS * 2
    );

    const children = [];
    for (let row = firstRow; row < lastRow; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        if (i >= items.length) break;

        children.push({
          type: 'group',
          // Absolute positions, unchanged from the original layout, so the
          // framework's scroll translation still lands each cell correctly
          // even though we only realize a slice of the rows.
          x: col * COL_PITCH,
          y: row * ROW_PITCH,
          w: CELL_W,
          h: CELL_H,
          children: [
            {
              type: 'rect',
              w: CELL_W,
              h: CELL_H,
              color: PLACEHOLDER_COLOR,
            },
            {
              type: 'image',
              w: CELL_W,
              h: CELL_H,
              src: this.posterUrls[i],
            },
            {
              type: 'text',
              y: CELL_H + 5,
              text: items[i].title,
            },
          ],
        });
      }
    }

    return {
      type: 'group',
      x: 80,
      y: 60,
      // Report the full content height so the scroll range is unchanged;
      // only the realized children are windowed.
      h: this.rowCount * ROW_PITCH,
      children,
    };
  }
}

// Append cell-sized resize params to the image-service URL. Requesting the
// image at display size is the single biggest win: the texture memory and
// decode cost of a poster drop by ~60x versus the 2000x3000 master. The app
// renders at 1080p even on 4K panels, so a 260x390 cell wants a 260x390
// image (bump to 1.5x if posters look soft from the couch, at 2.25x the
// memory).
function withSize(url, w, h) {
  if (!url) return url;
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return url + sep + 'w=' + w + '&h=' + h;
}

function clamp(n, lo, hi) {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
