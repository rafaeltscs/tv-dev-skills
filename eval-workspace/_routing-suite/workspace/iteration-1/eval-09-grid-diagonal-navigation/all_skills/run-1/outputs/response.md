SKILLS_CONSULTED: tv-focus-and-navigation

Why: The question is a framework-agnostic directional-resolution problem for a 2-D content grid (diagonal jumps, skipped columns, ragged last row), which is exactly the "d-pad navigation for this grid" / "spatial (directional) resolution" case this skill owns; no framework or platform-specific detail is involved.

---

## Short answer

Your grid is resolving direction presses **geometrically** (scoring every focusable rectangle by weighted distance) when it should be resolving them by a **tracked index**. Geometric scoring on a uniform poster wall is what produces the two bugs you're seeing:

- **Diagonal jumps** – near a ragged last row there's no cell directly to the right, so the scorer's perpendicular-distance term lets a cell one row up or down win. That's a diagonal move dressed up as "Right."
- **Skipped columns** – if inter-cell gaps, sub-pixel layout, or an off-by-a-bit poster width make the "correct" neighbour score slightly worse than the cell beyond it, the scorer picks the farther one. Index tracking can't skip because it only ever does `col ± 1`.

A uniform grid is a clean 2-D array. Resolve it arithmetically and the ambiguity disappears.

## How directional resolution in a grid should actually work

### 1. State: a flat index (or an explicit `row,col`) plus a known column count

Track one integer `index` for the focused cell and a constant `columnCount`. Derive position when you need it:

```
row = Math.floor(index / columnCount)
col = index % columnCount
lastIndex = items.length - 1
lastRow = Math.floor(lastIndex / columnCount)
```

Focus is always delegated to `items[index]` — never computed from geometry.

### 2. Left / Right change the column; Up / Down change the row by ±columnCount

```
handleLeft()  { if (col > 0)             index -= 1; refocus(); }
handleRight() { if (col < columnCount-1 && index < lastIndex) index += 1; refocus(); }
handleUp()    { if (row > 0)             index -= columnCount; refocus(); }
handleDown()  { /* see ragged-row clamp below */ }
```

Right is guarded by **both** `col < columnCount-1` (don't wrap to the next row) **and** `index < lastIndex` (don't walk past the last real cell in a short last row). That single extra guard is what stops the diagonal jump on the right edge of a ragged row.

### 3. Ragged last row — clamp, never land on emptiness

Pressing Down from a full row into a shorter last row must land on a real cell. Clamp the target to the last populated index:

```
handleDown() {
  let target = index + columnCount;
  if (target > lastIndex) {
    if (row === lastRow) return false;      // already on last row → pass through (see edge behaviour)
    target = lastIndex;                     // short last row: snap to its last real cell
  }
  index = target; refocus();
}
```

So a Down press from column 4 of a full row into a 2-item last row lands on item 2 (the rightmost real cell), not an empty slot and not lost focus. Pressing Up from that clamped cell should return toward the column you came from; many apps store an "anchor column" on the first vertical move and restore `col = min(anchorCol, lastPopulatedCol)` so a Down-then-Up round-trips cleanly instead of sticking at the clamped column.

### 4. Pick one strategy per container

Per the skill's non-negotiable rule "one resolution strategy per container": the grid uses **index tracking** internally. Geometric resolution is only for layouts that aren't a clean array (hero areas with overlaid buttons, settings pages mixing a sidebar with inline controls). Don't run both — half-using a geometric library on top of your index math is the usual source of "why did it go *there*."

If your framework's navigation library defaults to geometric spatial nav, either give the grid container an explicit index-based resolver/override, or configure the library's grid primitive so it does `col ± 1` / `row ± columnCount` arithmetic rather than distance scoring.

### 5. Decide every edge explicitly

| Edge | Behaviour |
|---|---|
| Right off the last column of a row | No-op or pass through — do **not** advance into the next row |
| Right off the last real cell in a short last row | No-op / pass through |
| Left from column 0 | Pass through (bubble) so the screen can move focus to a side nav if present |
| Up from row 0 | Pass through — screen moves focus to whatever is above the grid |
| Down from the last row | Pass through — screen moves focus below the grid |

Return `false` / don't consume the key on pass-through so the parent screen gets its turn. Be consistent across the grid's siblings — one region that wraps while others don't feels broken. Avoid wrap (last column → first column of next row) for a content grid; the user can't tell they've looped.

### 6. Entering and leaving the grid

- Entering from above: land on the column nearest to where focus was (or the grid's remembered cell), not always column 0.
- Leaving upward from row 0 / downward from the last row: pass through as above.
- Letter-jump or "back to top": compute the target index, set it, *then* scroll — a programmatic focus move, not a directional one.

### 7. Focus and scroll are independent

Moving `index` does not scroll anything by itself. On every focus change the grid must translate its viewport so the focused row has a comfortable margin above and below (not jammed against the edge). Order: move focus first, then scroll to the new focused cell. If the grid virtualizes rows, realize the row you're about to focus **before** focusing it, or focus lands on nothing.

### 8. When a real gap exists, use a focus guide — not geometry

If you have a genuinely irregular spot (e.g., a promo tile spanning two columns, or a deliberately empty slot), don't switch the whole grid back to geometric scoring to handle it. Add a focus guide: an explicit "a Right press from this cell goes to *that* cell" redirect for that one case, and keep the arithmetic everywhere else.

## Why this fixes your two symptoms

- **No more diagonal moves:** Left/Right only ever change `col` within the same row and stop at the row boundary; they can never resolve to a cell in a different row, ragged last row or not.
- **No more skipped columns:** movement is `index ± 1` / `index ± columnCount`. There is no distance comparison that a slightly-mismeasured rectangle can lose, so the adjacent cell is always the one chosen.
