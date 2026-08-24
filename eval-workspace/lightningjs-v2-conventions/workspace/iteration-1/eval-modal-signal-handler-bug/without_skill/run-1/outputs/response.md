# Why the parent never hears `modalClosed`

There are actually **two** separate Lightning v2 convention mistakes stacked on
top of each other here. Either one alone would be enough to break the flow,
which is why it looks like "nothing happens" when the modal should close.

## Bug 1 (the root cause): the modal never receives the Back key at all

`Modal._handleBack()` is a **key handler**. Lightning only invokes
`_handleXxx` methods (`_handleBack`, `_handleEnter`, `_handleKey`, etc.) on
components that are part of the currently *focused* branch of the component
tree. Focus is resolved by calling `_getFocused()` recursively, starting at
the `Application` root and delegating downward — each component decides
which child (if any) should receive focus next.

`Parent` never overrides `_getFocused()`. So even after `openModal()` sets
`visible: true` and switches to the `Modal` state, focus never actually moves
to `this.tag('Modal')`. The Back key keeps being handled wherever focus
already was (typically still `Parent` itself, or higher up), so
`Modal._handleBack()` is never called, so `this.signal('modalClosed')` is
never called, and everything downstream is dead in the water.

**Fix:** add a `_getFocused()` override to the `Modal` state so that while
the modal is open, key events (including Back) are routed to it:

```js
_getFocused() {
  return this.tag('Modal');
}
```

## Bug 2: `_handleModalClosed` is the wrong naming convention for a signal handler

Even once the signal *does* fire, `_handleModalClosed()` on `Parent` will
**never** be invoked by it. That's not a focus problem, it's a naming
mismatch:

- `_handleXxx` is the convention for **key/focus handlers**, invoked by
  Lightning's remote-control key routing (what Bug 1 is about).
- `signal(event, ...args)` uses a completely different lookup: it calls
  `$<event>` on the owner (`this.cparent`), resolved through whatever state
  is currently active. So `this.signal('modalClosed')` looks for a method
  literally named `$modalClosed`.

Your code already has a correctly named handler — `$modalClosed()` inside
the `Modal` state — and *that* is the one actually responsible for hiding
the modal and calling `_setState('')`. The `_handleModalClosed()` method at
the bottom of `Parent` is unreachable dead code, presumably written by
analogy with `_handleBack`/`_handleEnter` instead of the `$`-prefixed signal
convention. It will never run, with or without the focus fix.

**Fix:** delete `_handleModalClosed()` and fold whatever it was meant to do
(the debug log) into the real `$modalClosed()` handler.

## Corrected `parent.js`

```js
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
```

`modal.js` needs no changes — `this.signal('modalClosed')` inside
`_handleBack()` is correct Lightning v2 usage. It was only unreachable
because the parent never gave it focus.

## Quick recap of the two conventions to keep straight

| Convention | Who calls it | Used for |
|---|---|---|
| `_handleBack`, `_handleEnter`, `_handleKey`, ... | Lightning's key-routing, along the focused branch (`_getFocused()`) | Remote-control / keyboard input |
| `$eventName` | `signal(eventName, ...)`, called on the owner (`this.cparent`), resolved through the active state | Child-to-parent notifications |

If a `$`-handler "never fires," check two things in order: (1) is the event
actually being triggered (in this case, does the component signalling it
even get focus/input), and (2) is the receiving method actually named with
the `$` prefix and reachable in whatever state is currently active.
