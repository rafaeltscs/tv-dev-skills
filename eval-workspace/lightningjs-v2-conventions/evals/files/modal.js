import { Lightning } from '@lightningjs/core';

export default class Modal extends Lightning.Component {
  static _template() {
    return {
      rect: true,
      w: 600,
      h: 400,
      color: 0xdd000000,
      Message: {
        x: 40,
        y: 40,
        text: { text: 'Are you sure?', fontSize: 30 },
      },
    };
  }

  _handleBack() {
    this.signal('modalClosed');
  }
}
