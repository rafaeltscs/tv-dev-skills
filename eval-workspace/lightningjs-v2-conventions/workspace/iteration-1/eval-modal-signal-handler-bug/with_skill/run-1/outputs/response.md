# Why `_handleModalClosed` never fires

## Root cause

`Modal` correctly calls `this.signal('modalClosed')` in `_handleBack()`. That
part is fine. The bug is on the **parent** side: in Lightning v2, a child's
`this.signal(name, ...)` call is only delivered to the parent if the parent
**opts in** by declaring a `signals` map at the exact spot in its template
where that child is instantiated:

```js
Modal: {
  type: Modal,
  signals: { modalClosed: '_handleModalClosed' }, // <-- this was missing
},
```

Your `Parent._template()` instantiates `Modal` with no `signals` entry at
all:

```js
static _template() {
  return {
    Modal: { type: Modal, visible: false },
  };
}
```

With no `signals` map, Lightning has no idea `_handleModalClosed` should be
called for the `modalClosed` signal — the signal is simply dropped when it
reaches the parent. This isn't a typo-level bug (like a misspelled method
name); it's a missing opt-in that's easy to forget because nothing throws an
error — the signal call succeeds "silently" and just goes nowhere.

## A second, related problem: two competing/broken handlers

Your `Parent` actually has *two* handlers that look like they're meant to
react to the modal closing, and neither was reachable:

```js
static _states() {
  return [
    class Modal extends this {
      $modalClosed() { ... }   // (1) inside a state
    },
  ];
}

_handleModalClosed() { ... }   // (2) on the root class
```

- `_handleModalClosed()` (root) is the correct target for `signal()` +
  `signals` map — but was unreachable only because the `signals` map was
  missing (see above).
- `$modalClosed()` (inside the `Modal` state) uses the `$`-prefixed naming
  convention, which is how **`fireAncestors()`** targets are named, *not*
  how direct `signal()` targets are named. Since `Modal` (the component)
  calls `this.signal('modalClosed')` — not
  `this.fireAncestors('$modalClosed')` — this handler was never going to be
  invoked no matter what the template said. It's dead code that happened to
  look plausible because it's sitting right next to `_setState('Modal')`.

Mixing the two mechanisms (`signal`/`signals` vs. `fireAncestors`/`$name`)
on the same event is what made this confusing to debug — there were two
plausible-looking handlers and both were broken for different reasons.

## Fix

1. Add the `signals` map to the `Modal` entry in `Parent._template()`,
   pointing at the existing `_handleModalClosed` method.
2. Consolidate the "hide the modal + leave the Modal state" logic into that
   one root-level `_handleModalClosed()` method (it was previously stranded
   in the unreachable `$modalClosed()` inside the state). Because Lightning
   state classes `extends this`, a handler defined on the root class is
   inherited by every state unless a state overrides it — so
   `_handleModalClosed` will fire correctly whether Parent is currently in
   the `Modal` state or any other state.
3. Remove the dead `$modalClosed()` state handler (or repurpose that state
   class for actual state-specific overrides, e.g. `_getFocused()`).

### `parent.js` (corrected)

```js
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
```

`modal.js` needs no changes — its `this.signal('modalClosed')` call was
already correct:

```js
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
```

## One more thing worth checking (not shown in the provided files)

`Parent`'s `Modal` state doesn't override `_getFocused()`. For `Modal`'s
`_handleBack()` to run at all, remote-control focus needs to actually be
delegated down to the `Modal` child while that state is active — otherwise
Back-key presses will be handled by whatever *does* currently own focus
(possibly `Parent` itself, which has no `_handleBack`), and `Modal` would
never get the chance to call `this.signal('modalClosed')` in the first
place. If closing the modal via Back isn't working either, add this to the
`Modal` state:

```js
class Modal extends this {
  _getFocused() {
    return this.tag('Modal');
  }
}
```
