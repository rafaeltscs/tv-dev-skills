# Recurring UI Shapes

Almost every TV app is assembled from five navigation shapes. Each has a
settled convention for who owns focus and how it's handed off. Get these
right and most of the app's navigation is done.

## Rail (horizontal content strip)

A row of cards; the screen stacks several rails vertically.

- The **rail** owns Left/Right: it tracks a selected index and scrolls the
  strip so the focused card stays at a fixed on-screen position (commonly
  the left third, not the centre).
- Up/Down are **not** the rail's job — it lets them bubble so the
  **screen** moves focus to the rail above/below.
- Each rail remembers its last-focused index. When focus returns from
  another rail, it restores that index — unless the rail's data was
  swapped, in which case it resets to 0.
- At the right edge: pass through (usually a no-op — nothing is right of a
  rail) or, if the rail paginates, trigger the next-page load and keep
  focus on the last item until new items arrive.
- Left edge from index 0: pass through so the screen can move focus to a
  side nav if there is one.

```js
// rail, illustrative
handleRight() {
  if (this.index < this.items.length - 1) { this.index++; this.scrollToFocused(); return true; }
  this.loadNextPage?.();          // optional
  return false;                    // let Up/Down-style bubbling logic stand; nothing to the right
}
handleUp()   { return false; }    // screen's problem
handleDown() { return false; }
```

## Grid (2-D)

A wall of posters, N per row.

- Track `(row, col)` or a flat index plus a known column count. Left/Right
  change column; Up/Down change row by ±`columnCount`.
- **Ragged last row:** pressing Down from a full row into a short last row
  must land on a real cell — clamp `col` to the last populated column
  rather than focusing an empty slot or losing focus.
- Scroll vertically so the focused row has a comfortable margin above and
  below; for long grids, page by a row at a time, keeping the focused row
  at a stable band.
- Entering the grid from above: land on the column nearest to where focus
  was, or on the remembered cell. Leaving from row 0 upward / last row
  downward: pass through.
- Letter-jump / "back to top": compute the target index, set it, then
  scroll — a programmatic focus move (`focus-model.md`).

## Modal / dialog / overlay that owns focus

Confirm prompts, detail sheets, sign-in panels.

- On open: **trap** focus inside (every direction consumed at the
  overlay's edge — `spatial-navigation.md`) and move focus to the default
  action. For destructive prompts, default to the non-destructive choice.
- The content behind it keeps its focus *state* but receives no input.
  Don't tear down the underlying screen's selected index.
- Back and the overlay's Cancel are the same operation.
- On close: restore focus to the exact element that had it before the
  overlay opened. Libraries do this automatically (`autoRestoreFocus`);
  if you hand-roll, capture the current focus target before opening and
  restore it after.
- Stacked overlays form a focus stack — each dismiss restores to the layer
  beneath.

## Full-screen menu / side navigation

A persistent left nav, or a drawer that expands over content.

- Two regions — **nav** and **content** — with focus memory on both.
  Right from the nav enters content at its remembered position; Left from
  content's left edge returns to the nav's remembered item.
- A drawer that expands on focus: expand in `focus` / collapse in
  `unfocus`, but don't move focus as a side effect of expanding.
- Changing the nav selection usually **previews** in the content area;
  it **commits** (and moves focus into content) on OK/Enter — the
  focused-vs-activated split from `focus-model.md`.
- Back from content returns to the nav; Back from the nav's top-level item
  goes to the confirm-exit prompt.

## Page / route transitions

- The outgoing screen records its focused element (for restore on Back).
- During the transition animation, swallow input in the capture phase so a
  mashed key doesn't act on a half-mounted screen.
- The incoming screen sets its initial focus explicitly once mounted
  (`focus-model.md`): forward navigation → primary target; Back navigation
  → the recorded element.
- If the incoming screen loads async, focus a stable skeleton element,
  then move focus to the first real item when content arrives — never
  leave focus on a spinner that's about to unmount.

## Overlays that must NOT take focus

Toasts, snackbars without actions, loading spinners, "now playing" bugs,
volume indicators.

- These render above everything but are **not** in the focus tree. Focus
  stays wherever it was; the remote keeps driving the screen underneath.
- A snackbar *with* an action ("Undo") is a judgement call: either give it
  a timed focus grab, or leave focus put and bind the action to a colour
  key — don't yank focus for something that auto-dismisses in 4 seconds.
- When such an overlay appears, verify it didn't accidentally get inserted
  as a focusable sibling that geometric resolution can now wander into.

## Framework pointers

Delegation, index tracking, and refocus calls for these shapes in
Lightning v2 are in
`lightningjs-v2-conventions/references/focus-and-input.md`. React
navigation libraries provide rail/grid focus context, `isFocusBoundary`
for the modal trap, and last-focused-child restore out of the box.
