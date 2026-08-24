# Adding remote-control focus navigation to `PosterRow`

## What was wrong

Your `PosterRow` renders poster tiles as plain template objects (`ref: 'Poster0'`, etc.) inside a `Posters` flex container, but it never plugs into Lightning's **focus chain**. In Lightning v2, key events (`Left`, `Right`, `Enter`, ...) are only delivered to whatever is on the current *focus path* — the chain of components from the root down to whichever component `_getFocused()` says owns focus. Since `PosterRow` never implements `_getFocused`, `_handleLeft`, `_handleRight`, or `_handleEnter`, the remote does nothing when this row (or something inside it) is focused: there's simply no handler for Lightning to call.

There's also a smaller issue: because the posters are plain objects and not `Lightning.Component` instances, there's no clean per-tile hook to react to "this poster just became selected" — you'd have to manually reach into `Posters.children[i]` and patch colors by hand everywhere.

## The fix

Two changes:

1. **Extract each tile into its own `Poster` component.** This gives each tile `_focus()` / `_unfocus()` lifecycle methods that Lightning calls automatically whenever that specific tile becomes/stops being the focused element — that's the idiomatic place to do the "highlight the selected poster" visual change (I scale it up and brighten it; adjust to taste).

2. **Implement the focus/key-handling contract on `PosterRow`:**
   - `_getFocused()` — returns the `Poster` child at `this._selectedIndex`. Lightning calls this to determine the actual focus target; whenever the returned instance changes, Lightning automatically fires `_unfocus()` on the old one and `_focus()` on the new one.
   - `_handleLeft()` / `_handleRight()` — move `_selectedIndex` within bounds and call `this._refocus()`, which tells Lightning to re-evaluate `_getFocused()` and update the focus path (triggering the focus/unfocus highlighting).
   - `_handleEnter()` — looks up `this._movies[this._selectedIndex]` and `console.log`s its title.

Key events bubble from the focused leaf component up toward the root (Lightning tries `_handle<Key>` on the focused component first, then its ancestors, stopping at the first one that handles it). Since the `Poster` tiles themselves don't implement `_handleLeft/_handleRight/_handleEnter`, those events bubble straight up to `PosterRow`, which is exactly where we want to handle them.

I also reset `_selectedIndex` to `0` whenever a new `movies` list is assigned, so a stale index can't point past the end of a new (possibly shorter) list.

### Using it from a parent screen

For `PosterRow` to actually receive key events, something above it needs to put it on the focus path — typically your Home screen's own `_getFocused()` returns the `PosterRow` instance (directly, or via a `FocusManager`-style pattern if you have multiple rows):

```js
// In the parent Home component
_getFocused() {
  return this.tag('Row1'); // the PosterRow instance
}
```

If you have multiple rows and want up/down between rows too, that's handled the same way one level higher: the parent tracks which row index is selected and implements `_handleUp` / `_handleDown` / `_getFocused` the same way `PosterRow` now does for its posters.

## Final component

```js
import { Lightning } from '@lightningjs/core';

/**
 * A single poster tile. Extracted into its own Lightning.Component so it
 * can participate in Lightning's focus chain (it gets `_focus()` /
 * `_unfocus()` lifecycle calls whenever it becomes the focused element).
 */
class Poster extends Lightning.Component {
  static _template() {
    return {
      w: 200,
      h: 300,
      rect: true,
      color: 0xff333333,
      Image: {
        w: 200,
        h: 260,
      },
      Title: {
        y: 265,
        text: { fontSize: 20 },
      },
    };
  }

  set movie(movie) {
    this._movie = movie;
    this.patch({
      Image: { src: movie.image },
      Title: { text: { text: movie.title } },
    });
  }

  get movie() {
    return this._movie;
  }

  _focus() {
    this.patch({ color: 0xffffffff, smooth: { scale: [1.08, { duration: 0.15 }] } });
  }

  _unfocus() {
    this.patch({ color: 0xff333333, smooth: { scale: [1, { duration: 0.15 }] } });
  }
}

export default class PosterRow extends Lightning.Component {
  static _template() {
    return {
      Posters: {
        flex: { direction: 'row' },
      },
    };
  }

  _init() {
    this._selectedIndex = 0;
  }

  set movies(list) {
    this._movies = list || [];
    // Clamp the selection so it stays valid if the list shrinks/changes.
    this._selectedIndex = 0;
    this.patch({
      Posters: {
        children: this._movies.map((movie) => ({
          type: Poster,
          movie,
        })),
      },
    });
  }

  get movies() {
    return this._movies;
  }

  get _posterItems() {
    return this.tag('Posters').children;
  }

  // Tells Lightning which child currently owns focus. Whenever the
  // returned component changes, Lightning calls `_unfocus()` on the
  // previous one and `_focus()` on the new one.
  _getFocused() {
    return this._posterItems[this._selectedIndex] || this;
  }

  _handleLeft() {
    if (this._selectedIndex > 0) {
      this._selectedIndex--;
      this._refocus();
    }
  }

  _handleRight() {
    if (this._selectedIndex < this._posterItems.length - 1) {
      this._selectedIndex++;
      this._refocus();
    }
  }

  _handleEnter() {
    const movie = this._movies[this._selectedIndex];
    if (movie) {
      console.log(movie.title);
    }
  }
}
```
