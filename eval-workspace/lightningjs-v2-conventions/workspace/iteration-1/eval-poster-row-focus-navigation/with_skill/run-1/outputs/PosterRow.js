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
