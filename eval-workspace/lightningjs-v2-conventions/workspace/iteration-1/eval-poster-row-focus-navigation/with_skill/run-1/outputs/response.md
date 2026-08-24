# Adding remote-control navigation to `PosterRow`

## What was wrong

Your component had no key handlers and no focus feedback at all, so the
remote had nothing to act on:

- No `_handleLeft` / `_handleRight` — Lightning didn't know this component
  wanted to react to those keys.
- No `_handleEnter` — nothing ran when the user pressed select.
- No selected-index tracking beyond a static `this._selectedIndex = 0` that
  was set once in `_init()` and never read or updated.
- No visual feedback for which poster is currently selected.

## Design decisions

**The poster tiles are plain template children, not separate Components.**
Your `Posters.children` are built from plain objects (`rect: true`, `Image`,
`Title`) — they're `Element`s, not `Lightning.Component` subclasses. Lightning
only invokes lifecycle hooks like `_focus()`/`_unfocus()` on components, so
individual poster tiles can't react to being focused/unfocused on their own.

Because of that, I kept `PosterRow` itself as the **focus leaf** — it does
*not* implement `_getFocused()` to delegate down to a child. Instead,
`PosterRow` tracks `this._selectedIndex` and directly patches the visual
state (scale + color) of whichever poster tile is currently selected. This is
the standard pattern for TV rails whose items are cheap visual elements
rather than full components, and it avoids the overhead of instantiating a
Component per poster.

(If `PosterRow` sits inside a vertical menu/list, that parent is expected to
delegate focus into this row, e.g. `_getFocused() { return
this.tag('PosterRow'); }` — that's outside this file's scope but worth
knowing when you wire the home screen together.)

**Key handling**: `_handleLeft`/`_handleRight` move `_selectedIndex` with
bounds checks, per the skill's checklist for rail/list components. When
already at the first/last poster, the handlers `return false` so the key
bubbles up — e.g. so a parent vertical menu can move focus to the row above
or below instead of the key being silently swallowed at the row's edge.

**Focus visuals**: `_focus()`/`_unfocus()` fire when `PosterRow` itself
enters/leaves the focus path (e.g. moving between rows), and toggle the
visual state of the currently selected poster. `_select()` (called from the
arrow-key handlers) moves the highlight from the old index to the new one.
Both paths funnel through one `_updateItemVisual(index, focused)` helper so
there's a single source of truth for what "selected" looks like.

**Enter**: `_handleEnter()` looks up the movie at `_selectedIndex` and logs
`movie.title`.

**Edge cases handled**:
- Empty/undefined movie list — handlers bail out instead of throwing.
- Movies list changing while the row already has focus — the setter
  re-applies the focused visual to the new first item via `this.hasFocus()`
  instead of leaving a stale item highlighted.

## Final component

```js
import { Lightning, Utils } from '@lightningjs/core';

const POSTER_W = 200;
const POSTER_H = 300;
const FOCUSED_SCALE = 1.1;
const UNFOCUSED_SCALE = 1;
const FOCUSED_COLOR = 0xffffffff;
const UNFOCUSED_COLOR = 0xff333333;

export default class PosterRow extends Lightning.Component {
  static _template() {
    return {
      Posters: {
        flex: { direction: 'row' },
      },
    };
  }

  set movies(list) {
    this._movies = list || [];
    this._selectedIndex = 0;
    this.patch({
      Posters: {
        children: this._movies.map((movie, index) => ({
          ref: `Poster${index}`,
          w: POSTER_W,
          h: POSTER_H,
          rect: true,
          color: UNFOCUSED_COLOR,
          Image: {
            w: POSTER_W,
            h: 260,
            src: movie.image,
          },
          Title: {
            y: 265,
            text: { text: movie.title, fontSize: 20 },
          },
        })),
      },
    });

    // If this row already owns focus when the list changes (e.g. movies
    // were reloaded), re-apply the focused look to the new first item
    // instead of leaving the old visual state on stale elements.
    if (this.hasFocus()) {
      this._updateItemVisual(this._selectedIndex, true);
    }
  }

  get movies() {
    return this._movies;
  }

  _init() {
    this._selectedIndex = 0;
  }

  // Fired when PosterRow becomes the focused leaf of the app's focus path
  // (a parent component is expected to delegate focus here, e.g. a vertical
  // menu's `_getFocused()` returning `this.tag('PosterRow')`).
  _focus() {
    this._updateItemVisual(this._selectedIndex, true);
  }

  _unfocus() {
    this._updateItemVisual(this._selectedIndex, false);
  }

  _handleLeft() {
    if (!this._movies || !this._movies.length) return false;
    if (this._selectedIndex <= 0) return false; // at the start; let it bubble up
    this._select(this._selectedIndex - 1);
  }

  _handleRight() {
    if (!this._movies || !this._movies.length) return false;
    if (this._selectedIndex >= this._movies.length - 1) return false; // at the end; let it bubble up
    this._select(this._selectedIndex + 1);
  }

  _handleEnter() {
    const movie = this._movies && this._movies[this._selectedIndex];
    if (movie) {
      console.log(movie.title);
    }
  }

  _select(index) {
    this._updateItemVisual(this._selectedIndex, false);
    this._selectedIndex = index;
    this._updateItemVisual(this._selectedIndex, true);
  }

  _updateItemVisual(index, focused) {
    const item = this.tag(`Posters.Poster${index}`);
    if (!item) return;
    item.patch({
      smooth: {
        scale: focused ? FOCUSED_SCALE : UNFOCUSED_SCALE,
        color: focused ? FOCUSED_COLOR : UNFOCUSED_COLOR,
      },
    });
  }
}
```

## Wiring it into the home screen

Make sure whatever places `PosterRow` in the tree delegates focus to it when
appropriate, e.g.:

```js
_getFocused() {
  return this.tag('PosterRow'); // or the currently active row
}
```

Without that, `PosterRow`'s `_focus`/`_handleLeft`/`_handleRight`/`_handleEnter`
will never be reached, since Lightning only routes key events along the
current focus path.
