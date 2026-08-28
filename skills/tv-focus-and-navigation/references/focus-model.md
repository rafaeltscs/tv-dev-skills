# The Focus Model

On the web, focus is a browser-owned property of one DOM node, it can be
absent, and a click can move it anywhere. None of that holds on a TV. Get
this mental model straight before writing any navigation code.

## Focus is a single, always-present app state

There is one focused element for the whole app, at all times. There is no
"nothing is focused" state to fall back on — if your code loses track of
what's focused, the remote stops doing anything useful and the user is
stranded. Treat "what is focused right now?" as a question your code must
be able to answer at every instant.

Two related states that web code tends to conflate, and that you must keep
separate:

- **Focused** — the element the remote is currently pointed at. Changes on
  every arrow press. Cheap: update the highlight, maybe show a preview.
- **Selected / activated** — what the user committed to with OK/Enter.
  Expensive: navigate, play, submit, open a detail page.

Firing selection behavior on focus change is the single most common TV UX
bug. Arrowing across a row of 20 posters must not kick off 20 detail
fetches.

## The focus tree

Almost every framework and navigation library models the UI as a tree of
two kinds of nodes:

- **Focusable leaves** — buttons, cards, list items. They can hold focus
  and they handle OK/Enter.
- **Focusable containers** — rails, grids, menus, screens, the app root.
  They don't "hold" focus themselves; they *route* it to one of their
  children.

The **focus path** is the chain from the root down to the current leaf:
`App → HomeScreen → SecondRail → Card[3]`. Input travels along this path
(see `key-handling.md`). When focus needs to move, each container on the
path decides which child is active; ask the container "who's your focused
child?" recursively until you hit a leaf.

Framework mechanics for this delegation:
`lightningjs-v2-conventions/references/focus-and-input.md` (`_getFocused()`
returning the active child); React libraries use a focus-context provider
plus a per-container focus key; Enact Spotlight uses container decorators.
The shape is the same everywhere — **a container names its focused child.**

## Focus memory (last-focused child)

When focus leaves a container and later comes back, it should return to the
child that was focused before, not reset to the first one. Example: focus
is on the 5th item of a rail, the user goes up to the nav bar, then comes
back down — they expect the 5th item again, not the 1st.

Implement this as: each container remembers the index/key of its
last-focused child and restores it when focus re-enters. Libraries expose
it as a flag (`saveLastFocusedChild`, `preferredChildFocusKey`, a
"default element" selector). Two judgement calls:

- **Menus and side nav:** almost always remember. The user is toggling
  between "where am I" and "what's here."
- **A rail whose contents changed** (new page loaded, filter applied):
  reset to the start instead — a remembered index into stale data lands
  nowhere sensible.

## Initial focus

Every screen must place focus deliberately when it becomes active:

- A content screen → its primary action or first rail.
- A dialog → the safe/default button (often "Cancel" for destructive
  prompts).
- Returning to a screen via Back → the element the user left from (see
  focus memory, plus `ui-patterns.md` on page transitions).

Never depend on mount order or "the first focusable in the DOM." Write the
line that moves focus.

## Programmatic focus moves

Beyond arrow-key navigation, focus is moved by code in these situations —
each needs an explicit call:

| Situation | Move focus to |
|---|---|
| Screen / route becomes active | That screen's initial focus target |
| Modal / overlay opens | First actionable element inside it |
| Modal / overlay closes | The element focused before it opened |
| Focused element is removed (item deleted, rail re-rendered) | Nearest surviving sibling, or the container's new first child |
| Async content replaces a loading placeholder | The first real item (not left on the now-gone spinner) |
| A "jump to top" / letter-jump / deep link | The computed target, then scroll it into view |

After any of these, force the navigation system to recompute the focus
path (frameworks call this refocus / re-resolve / `_refocus()`).

## Recovering lost focus

If focus ends up on a detached or hidden element — the usual cause is
mutating a list without updating the selected index — the remote goes
dead. Defensive pattern for any dynamic container:

```js
// after children change
if (this.index >= this.children.length) {
  this.index = Math.max(0, this.children.length - 1);
}
if (this.children.length === 0) {
  // nothing focusable here — hand focus back up to the parent
  this.parent.focusFallback();
} else {
  this.refocus();
}
```

Bounds-check the index on every mutation, and always have a fallback target
one level up so an empty container can surrender focus instead of
swallowing it.
