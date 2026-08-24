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
