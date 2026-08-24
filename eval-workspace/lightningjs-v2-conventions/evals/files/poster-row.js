import { Lightning, Utils } from '@lightningjs/core';

export default class PosterRow extends Lightning.Component {
  static _template() {
    return {
      Posters: {
        flex: { direction: 'row' },
      },
    };
  }

  set movies(list) {
    this._movies = list;
    this.patch({
      Posters: {
        children: list.map((movie, index) => ({
          ref: `Poster${index}`,
          w: 200,
          h: 300,
          rect: true,
          color: 0xff333333,
          Image: {
            w: 200,
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
  }

  _init() {
    this._selectedIndex = 0;
  }
}
