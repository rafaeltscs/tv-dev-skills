SKILLS_CONSULTED: tv-focus-and-navigation

Why: The question is a framework-agnostic remote-driven TV UX problem — trapping and restoring focus around a modal/overlay — which is exactly the "modals trap and restore" pattern this skill owns; no specific framework (Lightning v2/v3) was named, and platform key codes / performance are not the issue.

---

## The general pattern: capture before, restore after

Your bug is that the overlay never recorded where focus was, so on close the navigation system falls back to "first focusable on the screen" — the top of the page. The fix is a deliberate save/restore pair around the overlay's lifecycle.

### 1. On open — capture, then trap, then place focus

- **Capture the outgoing focus target.** Before the overlay takes focus, read the currently focused element (or its container + index / focus key) and stash it on the overlay instance. Do this *first*, before anything else changes focus.
- **Move focus into the overlay explicitly.** Send focus to the overlay's default action. For destructive prompts ("Delete?"), default to the non-destructive choice (Cancel), not the scary one.
- **Trap focus inside.** While the overlay owns focus, every directional key is consumed at the overlay's edge — up/down/left/right cannot walk back into the page behind it. The screen underneath keeps its focus *state* (don't tear down its selected index) but receives no input.
- **Back == Cancel.** Wire the Back button to the same dismiss path as the overlay's Cancel control.

### 2. On close — restore to the exact element

- Move focus back to the exact element you captured on open — the button that opened the modal — not to the screen's initial focus, not to index 0.
- Then force the navigation system to recompute the focus path (the refocus / re-resolve step). This is the call that's usually missing when focus silently resets.
- Guard the restore: if the captured element was unmounted or hidden while the overlay was up (list re-rendered, item deleted), fall back to its nearest surviving sibling, then the container's first child, then one level up — never leave focus empty.

### 3. Stacked overlays — use a focus stack

If a second overlay can open on top of the first, each overlay pushes its captured target onto a stack and pops on dismiss, so every close restores to the layer directly beneath it.

## Concrete shape (framework-neutral pseudo-code)

```js
function openModal(modal) {
  modal.previousFocus = getCurrentFocusedElement();   // capture FIRST
  focusStack.push(modal.previousFocus);
  modal.trapFocus = true;                              // edges consume all directions
  setFocus(modal.defaultAction);                       // safe default for destructive prompts
}

function closeModal(modal) {
  modal.trapFocus = false;
  const target = focusStack.pop();
  if (isAlive(target)) {
    setFocus(target);
  } else {
    setFocus(nearestSurvivingSibling(target) ?? containerFirstChild(target) ?? parentFallback(target));
  }
  refocus();                                           // recompute the focus path — don't skip this
}
```

## Notes

- Many navigation libraries do this for you: look for `autoRestoreFocus`, a "restore focus on unmount" option, `isFocusBoundary` / focus-trap for the trap, and last-focused-child restore. If you hand-roll, the capture-before-open / restore-after-close pair above is the whole contract.
- The invariant behind all of this: exactly one element is focused at every instant. After the modal closes your code must have a definite answer to "what is focused now?" — restoring to the opener button is that answer.
- If the overlay has no actions (a toast, a spinner, a "now playing" bug), it should not enter the focus tree at all — focus stays on the page and the remote keeps driving the screen underneath. Save/restore only applies to overlays that actually take focus.
