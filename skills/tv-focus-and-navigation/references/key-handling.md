# Key Handling

## The key set

Design for the lowest common denominator across TV remotes:

| Logical key | Purpose | Notes |
|---|---|---|
| Left / Right / Up / Down | Move focus | The only navigation input. Every reachable element must be reachable with these from the screen's entry point. |
| OK / Enter / Select | Activate the focused element | Sometimes reported as a distinct centre-button code, sometimes as Enter. |
| Back | Reverse / dismiss / go up | Present on every remote. Has a mandatory meaning at every level — see below. |

Anything beyond this is a bonus and must be optional: media transport keys
(Play/Pause/FF/RW), colour buttons, number keys, a dedicated Home key.
Never make core navigation depend on a key that some remotes lack. Actual
key codes vary by platform (and some, like Back on Tizen, must be
registered before they're delivered) — that belongs in `tv-platform-quirks`.

## Propagation: capture down, then bubble up

Input is dispatched along the focus path (`focus-model.md`). The near-universal
model — Lightning, DOM events, most navigation libraries — is two phases:

1. **Capture (root → focused leaf):** each ancestor gets first refusal.
   Use this sparingly, for app-global intercepts: a "hold Back to exit,"
   a debug overlay, swallowing input during a page transition.
2. **Bubble (focused leaf → root):** if nothing captured it, the focused
   leaf handles it first, then each ancestor in turn until someone does.

The practical division of labour that falls out of this:

- **Leaf** handles OK/Enter (its own action) and usually lets arrows
  bubble.
- **Container** handles the arrows: move the selected index, or hand focus
  to a sibling container, or let it bubble further if it's at its edge
  (`spatial-navigation.md`).
- **Screen / root** handles Back and any global shortcuts.

A handler signals "I dealt with it, stop" vs. "not mine, keep going" —
by return value (`true`/`false`), `stopPropagation()`, or similar. Letting
an unhandled key bubble is a feature: it's how a card at the right edge of
a rail lets the *rail* (or the screen) decide what right means there.

```js
// container, illustrative
handleRight() {
  if (this.index < this.lastIndex) {
    this.index++;
    this.scrollFocusedIntoView();
    return true;              // consumed
  }
  return false;               // at the edge — let an ancestor handle it
}
```

## Key repeat and long-press

Holding a direction on a TV remote produces a fast stream of repeat
events. Consequences to handle:

- **Don't do heavy work per event.** Debounce or throttle preview loads,
  analytics, and image fetches that are keyed off focus change. Move the
  highlight every event; load the preview after input settles (~150–250 ms
  idle).
- **Guard against overshoot** at list boundaries — a burst of repeats
  shouldn't wrap around three times or blow past a bounds check that
  assumed one press at a time.
- **Distinguish a long-press only when you need it** (e.g. hold-OK for a
  context menu, hold-Back to exit). Track key-down time and act on
  key-up / a timer; make sure the short-press action doesn't also fire.

## Back and Exit semantics

Back is not optional and its meaning is a stack, resolved nearest-first:

1. A transient UI is open (menu drawer, tooltip, on-screen keyboard,
   snackbar with an action) → close it.
2. A modal / dialog is open → dismiss it (equivalent to its Cancel).
3. An expanded/drilled-in state within the screen → collapse to the
   previous state.
4. Otherwise → pop one level of navigation (detail → grid → home).
5. At the app's root screen with nothing to pop → show a "Press Back
   again to exit" / confirm-exit prompt. Do **not** exit silently on the
   first press, and do not trap the user with no way out.

Store enough navigation state to answer "what does Back do from here?"
deterministically. A common bug is two independent Back handlers (a modal's
and the screen's) both firing for one press — make sure the innermost one
consumes the event.

Some platforms also deliver a separate **Exit / Home** key that should
always go straight to the platform launcher; don't try to intercept it for
in-app navigation.

## Checklist

- [ ] Every element reachable by arrows from the screen's initial focus
- [ ] Each container's arrow handlers bounds-checked, with a defined edge
      behavior (consume vs. bubble)
- [ ] OK/Enter handled on leaves, not duplicated on containers
- [ ] Focus-change side effects (previews, fetches) debounced against key
      repeat
- [ ] Back has a defined result at the current level, and only one handler
      consumes it
- [ ] Root-level Back confirms before exiting
