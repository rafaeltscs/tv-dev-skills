import { Lightning } from '@lightningjs/core';

export default class Button extends Lightning.Component {
  static _template() {
    return {
      w: 300,
      h: 80,
      Background: {
        w: (w) => w,
        h: (h) => h,
        rect: true,
        color: 0xff2b2b2b,
      },
      Label: {
        x: 20,
        y: 20,
        text: { text: 'Click me', fontSize: 28 },
      },
    };
  }

  _init() {
    this._onEnter = null;
  }

  set onEnter(cb) {
    this._onEnter = cb;
  }

  set label(value) {
    this.tag('Label').patch({ text: { text: value } });
  }

  _focus() {
    this.tag('Background').patch({ color: 0xff4b9fff });
  }

  _unfocus() {
    this.tag('Background').patch({ color: 0xff2b2b2b });
  }

  _handleEnter() {
    if (this._onEnter) this._onEnter();
  }
}
