SKILLS_CONSULTED: tv-focus-and-navigation

The question is a pure remote-control focus/navigation problem ("focus won't move from one row to the next" in a vertical stack of horizontal rails) with no UI framework named, which is exactly the framework-agnostic scope of `tv-focus-and-navigation`; the Lightning skills only apply when that framework is in use, and performance / platform-quirks skills don't bear on why directional focus won't cross rows.

---

# Why up/down does nothing

On a TV there is no tab order and no geometric "just move to the nearest thing below" unless something implements it. Focus moves because a **container** owns a layout, handles the arrow keys for its axis, and delegates focus to one child. Your rails clearly do this for Left/Right. The reason Up/Down are dead is almost always one (or more) of these:

1. **Nothing owns the vertical axis.** You have rails, but no screen-level container that stacks them, tracks a "current row" index, and handles Up/Down to move focus between rails. Left/Right work because each rail handles them; Up/Down go unhandled and nothing above catches them.
2. **The rail (or its poster) consumes Up/Down.** If a card's or rail's key handler returns `true` / calls `stopPropagation()` for *every* arrow — or has a catch‑all "consume the key" — then Up/Down never bubble up to a screen that could act on them. A rail must handle only Left/Right and let Up/Down pass through.
3. **Focus is moving but you can't see it.** The row above/below is off-screen and the container never scrolls it into view, or the target rail is virtualized/empty and focus lands on nothing. Looks identical to "nothing happened."
4. **(Check first, cheaply)** the Up/Down key codes aren't arriving at all on your device — a platform key-map issue rather than a navigation bug. Log raw key events to rule this out before touching navigation code.

The governing rule: **containers navigate, leaves act**, and **one resolution strategy per container**. The rail's strategy is "tracked index on the horizontal axis; vertical bubbles to my parent." The missing piece is a parent whose strategy is "tracked index on the vertical axis."

# The fix

## 1. Add / wire a screen-level vertical container that owns the rows

It holds a `rowIndex`, delegates focus to `rails[rowIndex]`, and handles Up/Down:

```js
// HomeScreen — owns the vertical stack of rails. Illustrative pseudo-code.
class HomeScreen {
  rows = [rail0, rail1, rail2, ...];
  rowIndex = 0;

  // The navigation system asks "who is your focused child?" — answer with the current rail.
  getFocused() { return this.rows[this.rowIndex]; }

  handleUp() {
    if (this.rowIndex > 0) {
      this.rowIndex--;
      this.refocus();              // force the focus path to recompute
      this.scrollRowIntoView();    // focus does NOT scroll anything by itself
      return true;                 // consumed
    }
    return false;                  // top edge: let it bubble (usually a no-op)
  }

  handleDown() {
    if (this.rowIndex < this.rows.length - 1) {
      this.rowIndex++;
      this.refocus();
      this.scrollRowIntoView();
      return true;
    }
    return false;                  // bottom edge: bubble
  }

  // Left/Right are not this container's job — it never handles them;
  // they reach the focused rail, which does.
}
```

## 2. Make each rail handle only Left/Right, and let Up/Down bubble

```js
// Rail — owns the horizontal axis only.
class Rail {
  index = 0;
  getFocused() { return this.cards[this.index]; }

  handleLeft()  { if (this.index > 0)                    { this.index--; this.refocus(); this.scrollToFocused(); return true; } return false; }
  handleRight() { if (this.index < this.cards.length-1)  { this.index++; this.refocus(); this.scrollToFocused(); return true; } return false; }

  handleUp()   { return false; }   // NOT the rail's problem — must bubble to HomeScreen
  handleDown() { return false; }   // ditto
}
```

If today you have a single handler that consumes all four directions, or the poster/card components have their own `handleUp`/`handleDown`, that's the bug — remove the vertical handling from the rail and the cards. Cards should handle **OK/Enter only** (their own activation) and let all arrows bubble.

## 3. Scroll the newly focused row into view

Moving focus does not translate the viewport on a TV. After `rowIndex` changes, the screen must translate the rail stack so the focused rail sits comfortably in view (keep a margin above/below; don't jam it against the edge). Order matters: **move focus first, then scroll.** If your rails are virtualized, make sure the target rail (and the card inside it that will receive focus) is realized before you focus it, or focus lands on nothing.

## 4. Restore each rail's last-focused column (focus memory)

When focus leaves rail 1 at card 5, goes up to rail 0, then comes back down, the user expects card 5 again — not card 0. Each rail keeps its own `index` and simply doesn't reset it on focus re-entry. Exception: if the rail's data was swapped (new page, filter applied), reset `index` to 0 so you don't restore into stale data.

## 5. Declare the screen's initial focus

When Home mounts, explicitly set `rowIndex = 0` and move focus to `rails[0]`'s first (or remembered) card. Don't rely on mount order.

# Verification checklist

- [ ] Raw Up/Down key events actually reach your app on the target device (rules out a platform key-map issue vs. a navigation bug).
- [ ] Exactly one container owns the vertical axis and tracks a row index.
- [ ] Rails handle Left/Right only; `handleUp`/`handleDown` on the rail and on the cards return "not handled" so the key bubbles.
- [ ] No catch-all handler consuming every arrow key.
- [ ] Each row change calls refocus and then scroll-into-view; virtualized rows are realized before focus moves.
- [ ] Top row Up and bottom row Down have a deliberate edge behavior (pass-through / no-op — do **not** wrap a content stack; looping rails is disorienting).
- [ ] Each rail restores its last column on re-entry (unless its data changed).
- [ ] Home sets its initial focus explicitly on mount.

# If you're on a specific framework

The shape above is framework-neutral. For the concrete delegation and refocus calls: Lightning Core v2 uses `_getFocused()` + `_handleUp/_handleDown` + `_refocus()` (see the `lightningjs-v2-conventions` skill); React navigation libraries (Norigin spatial-navigation, LRUD, Enact Spotlight) give you rail/row focus contexts and last-focused-child restore out of the box — there you mostly need to stop the rail from capturing the vertical axis and let the library's spatial resolution move between rows.
