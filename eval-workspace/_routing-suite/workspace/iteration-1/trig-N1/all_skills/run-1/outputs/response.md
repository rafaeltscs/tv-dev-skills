SKILLS_CONSULTED: NONE

Why: Every skill in this plugin is scoped to web-based TV/OTT apps on smart-TV / set-top hardware (LightningJS, D-pad focus, ~1 GB shared-RAM TV budgets, platform quirks); this is a React app inside Electron on desktop, so the on-topic-sounding triggers ("poster grid", "janky when scrolling", "virtualization") do not actually apply and the question is a standard React/Chromium windowing problem best answered from general knowledge.

---

# Virtualizing a big image grid in React (Electron/Chromium)

Your two symptoms have one root cause: you're mounting thousands of `<img>` nodes at once. That means thousands of DOM elements + layout/paint work on every scroll frame (jank) and thousands of decoded bitmaps held in memory (RAM). Fix both by only rendering the rows near the viewport.

## 1. Use a windowing library (don't hand-roll)

For a uniform grid, the least-effort solid option is **`react-window`**:

```bash
npm i react-window react-window-infinite-loader
```

```tsx
import { FixedSizeGrid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer'; // npm i react-virtualized-auto-sizer

const COLUMN_WIDTH = 200;   // poster cell width  incl. gutter
const ROW_HEIGHT   = 300;   // poster cell height incl. gutter

function PosterWall({ items }: { items: Poster[] }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <AutoSizer>
        {({ width, height }) => {
          const columnCount = Math.max(1, Math.floor(width / COLUMN_WIDTH));
          const rowCount = Math.ceil(items.length / columnCount);
          return (
            <FixedSizeGrid
              width={width}
              height={height}
              columnCount={columnCount}
              rowCount={rowCount}
              columnWidth={COLUMN_WIDTH}
              rowHeight={ROW_HEIGHT}
              overscanRowCount={2}          // render 2 extra rows above/below
              itemData={{ items, columnCount }}
            >
              {Cell}
            </FixedSizeGrid>
          );
        }}
      </AutoSizer>
    </div>
  );
}

const Cell = React.memo(function Cell({ columnIndex, rowIndex, style, data }: any) {
  const { items, columnCount } = data;
  const index = rowIndex * columnCount + columnIndex;
  const poster = items[index];
  if (!poster) return null;
  return (
    <div style={style}>
      <img
        src={poster.thumbUrl}
        width={180}
        height={270}
        loading="lazy"
        decoding="async"
        draggable={false}
        style={{ display: 'block', objectFit: 'cover' }}
        alt={poster.title}
      />
    </div>
  );
});
```

Now only ~(visible rows + overscan) × columns images exist at any moment — typically 30–80 nodes instead of thousands.

**Alternatives:**
- **`@tanstack/react-virtual`** — headless hook (`useVirtualizer`), you render the container yourself. Best when cells have variable height or you want full markup control. Handles dynamic measurement well.
- **`react-virtuoso`** (`VirtuosoGrid`) — highest-level, built-in infinite scroll and responsive grid; less config, slightly less control.

Pick `react-window` for fixed-size cells, `@tanstack/react-virtual` if row heights vary.

## 2. Serve appropriately-sized images

Virtualization stops you decoding 5,000 images, but each visible one still matters. A 1500×2250 poster decoded to a 180×270 slot wastes ~15x the memory of the pixels you show.

- Request a thumbnail at (roughly) the displayed CSS size × devicePixelRatio, not the full-res asset. If images come from a CDN/service, use its resize params; if they're local files, generate thumbnails once (e.g. `sharp`) and cache them.
- Keep `width`/`height` attributes on every `<img>` so layout is stable and there's no reflow as images load (a jank source on scroll).
- `decoding="async"` keeps decode off the main thread; `loading="lazy"` avoids fetching cells that scroll past quickly.

## 3. Reduce per-frame work

- `React.memo` the cell component and make sure `itemData` is a stable reference (`useMemo`) so scrolling doesn't re-render every cell.
- Add `will-change: transform` / `contain: layout paint` **sparingly** on the scroll container, not on every cell — over-promoting layers costs GPU memory.
- Avoid box-shadow/filter/border-radius-heavy CSS on cells; those are expensive to repaint while scrolling. If you need shadows, prefer a pre-baked PNG shadow or a single cheap shadow.
- Don't animate cells on scroll (no per-item transitions keyed to scroll position).

## 4. Load data incrementally

If the 5,000 items themselves are heavy objects (or come from an API), page them in with `react-window-infinite-loader` (or Virtuoso's `endReached`). Combined with windowing, you hold only what's near the viewport in the DOM and can drop far-offscreen data if needed.

## 5. Verify in the Electron DevTools

- Performance tab: record a scroll, confirm frames are ~16 ms and you're not seeing long "Recalculate Style / Layout" bars.
- Memory tab: take a heap snapshot before/after scrolling the whole grid; node count and detached-image memory should stay roughly flat, not grow with distance scrolled.
- Rendering panel: turn on "Frame Rendering Stats" and "Paint flashing" to spot cells repainting unnecessarily.

## Expected outcome

DOM node count drops from O(items) to O(visible), image memory becomes bounded by the viewport, and scroll returns to 60 fps because each frame only lays out and paints a couple dozen cells.
