import { Lightning } from '@lightningjs/core';
import Modal from './modal.js';

export default class Parent extends Lightning.Component {
  static _template() {
    return {
      Modal: { type: Modal, visible: false },
    };
  }

  openModal() {
    this.tag('Modal').patch({ visible: true });
    this._setState('Modal');
  }

  static _states() {
    return [
      class Modal extends this {
        $modalClosed() {
          this.tag('Modal').patch({ visible: false });
          this._setState('');
        }
      },
    ];
  }

  // This never seems to fire when the modal closes.
  _handleModalClosed() {
    console.log('parent got modalClosed');
  }
}
