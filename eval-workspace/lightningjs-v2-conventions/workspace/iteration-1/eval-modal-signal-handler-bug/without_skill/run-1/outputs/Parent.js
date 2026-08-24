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
        // Without this, Back (and any other key) never reaches the modal,
        // because Lightning only calls _handleXxx on the focused branch,
        // and Parent's default _getFocused() never delegates to the modal.
        _getFocused() {
          return this.tag('Modal');
        }

        // Signals dispatch to "$eventName" methods on the owner, resolved
        // through the active state - NOT "_handleEventName". This is the
        // one method that actually runs when Modal calls
        // this.signal('modalClosed').
        $modalClosed() {
          console.log('parent got modalClosed');
          this.tag('Modal').patch({ visible: false });
          this._setState('');
        }
      },
    ];
  }
}
