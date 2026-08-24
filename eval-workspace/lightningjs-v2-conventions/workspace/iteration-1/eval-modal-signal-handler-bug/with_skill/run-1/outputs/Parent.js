import { Lightning } from '@lightningjs/core';
import Modal from './modal.js';

export default class Parent extends Lightning.Component {
  static _template() {
    return {
      Modal: {
        type: Modal,
        visible: false,
        // A child's this.signal(...) call is dropped unless the parent
        // opts in with a `signals` map at the point where the child is
        // instantiated. This was the missing piece.
        signals: { modalClosed: '_handleModalClosed' },
      },
    };
  }

  openModal() {
    this.tag('Modal').patch({ visible: true });
    this._setState('Modal');
  }

  static _states() {
    return [
      class Modal extends this {
        // Add state-specific overrides here (e.g. _getFocused() to
        // delegate remote-control focus to the Modal child, and
        // _handleBack()/_handleEnter() as needed). Signal handling for
        // modalClosed is intentionally left on the root class below so it
        // fires no matter which state Parent is in when the signal
        // arrives — state classes inherit it via `extends this`.
      },
    ];
  }

  _handleModalClosed() {
    console.log('parent got modalClosed');
    this.tag('Modal').patch({ visible: false });
    this._setState('');
  }
}
