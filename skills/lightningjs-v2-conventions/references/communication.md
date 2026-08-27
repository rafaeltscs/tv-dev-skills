# Communication (Signals, Fire Ancestors, Events)

Lightning has no prop-drilling/context system like React. Parent → child
communication is just setting properties or calling methods directly
(`this.tag('Child').someProp = x`). Child → parent communication uses
**signals**.

## Signals (child notifies its direct parent)

A child calls `this.signal('name', ...args)`. The parent opts in by
declaring a `signals` map in the template where that child is instantiated:

```js
// Parent
static _template() {
  return {
    Button: {
      type: ExampleButton,
      signals: {
        toggleText: '_toggleText', // maps signal name -> parent method
        // or just `toggleText: true` if the method name matches exactly
      },
    },
  };
}

_toggleText(alpha, color) {
  // handle it
}
```

```js
// Child
_handleEnter() {
  this.signal('toggleText', 1.0, 'red');
}
```

## Pass signals (bubble a signal further up)

If an intermediate parent doesn't want to handle a signal itself but wants
to forward it to *its* parent, use `passSignals` instead of writing a
manual re-signal handler:

```js
static _template() {
  return {
    Button: {
      type: ExampleButton,
      passSignals: {
        toggleText: true,          // forwarded under the same name
        otherSignal: 'renamedSignal', // forwarded under a new name
      },
    },
  };
}
```

## Fire ancestors (skip straight to a distant ancestor)

`fireAncestors()` sends a signal up the tree to whichever ancestor
implements it, without every intermediate parent needing to declare
`signals`/`passSignals` for it. Both the call and the handler must use a
`$`-prefixed name:

```js
// Deeply nested child
this.fireAncestors('$changeMessage', buttonNumber, color);
```

```js
// Any ancestor, at any depth
$changeMessage(buttonNumber, color) {
  // handle it
}
```

Use `fireAncestors` sparingly — it's convenient for cross-cutting concerns
(e.g. "any button press should update a global status bar") but it bypasses
the explicit signal-wiring that makes data flow traceable. For normal
parent-child UI interactions (a button telling its immediate list container
something happened), prefer `signal`/`passSignals` so the wiring is visible
in the template.

## Choosing between the three

| Situation | Use |
|---|---|
| Direct parent needs to react | `signal()` + `signals` map |
| Immediate parent doesn't care, but *its* parent does | `passSignals` |
| Deeply nested descendant needs to reach a specific distant ancestor, and wiring every intermediate level would be noise | `fireAncestors()` |
