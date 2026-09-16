---
name: tv-focus-and-navigation
description: Framework-agnostic remote-control navigation and focus management for TV/OTT apps — the UX-level patterns for driving a UI with a 5-way directional remote (up/down/left/right/OK) plus Back. Use whenever focus movement, key handling, or directional navigation is being designed, written, reviewed, or debugged for a living-room app, even when no framework is named — "focus won't move to my list," "d-pad navigation for this grid," "trap focus in the modal," "which card gets focus when this screen opens," "Back button does the wrong thing," "carousel doesn't scroll when I arrow past the edge." Covers the focus model, key handling and propagation, spatial (directional) resolution, and the recurring UI shapes (rails, grids, modals, menus, page transitions). Does NOT cover framework-specific focus APIs — for those use the matching framework skill (`lightningjs-v2-conventions` for Lightning Core v2, `lightningjs-v3-conventions` for Lightning 3/Blits) — nor platform key codes and lifecycle (`tv-platform-quirks`).
---

# TV Focus & Navigation

A living-room app is driven by a directional remote: **up / down / left /
right**, an **OK/Enter** (select) button, and a **Back** button. That's the
whole input surface for most screens. There is no pointer, no hover, no
scroll wheel, no tab order — so every one of those concepts that web/mobile
training data leans on is either absent or actively misleading here.

The failure mode when an LLM (or a web-trained developer) writes TV
navigation code is importing pointer-era assumptions:

- Assuming something can be "not focused," or that focus can be dropped and
  picked up later by a click. On a TV, **exactly one element is focused at
  all times** — losing track of it strands the user.
- Reaching for `tabindex`, DOM `.focus()`, `:hover`, `mousemove`, or
  click handlers as the navigation mechanism. Pointer support on TV is
  optional and secondary; directional keys are the contract.
- Treating a focus change as an activation (firing a network request or
  navigation the moment an item is focused). **Focused ≠ selected.**
- Letting arrow handling accrete onto individual leaf widgets instead of
  the container that owns the layout.
- Forgetting **Back** exists until late, then bolting on behavior that
  exits the app by surprise.

This skill is one level above any single framework. It describes *what* the
navigation should do; the framework skills describe *how* to express it in
their component model.

## How to use this skill

Read the reference file(s) that match the task before writing code:

| Task involves... | Read |
|---|---|
| What "focus" means with no DOM, the focus tree, delegation, focus memory, initial/programmatic focus, recovering lost focus | `references/focus-model.md` |
| Which key does what, capture vs. bubble propagation, key repeat / long-press, Back and Exit semantics | `references/key-handling.md` |
| Turning a direction press into a target: geometric vs. index-based resolution, edge behavior (trap / wrap / pass-through / no-op), off-screen candidates, RTL | `references/spatial-navigation.md` |
| Rails, grids, modals, full-screen menus / side nav, page transitions, non-focusable overlays | `references/ui-patterns.md` |

Each file is self-contained with illustrative (framework-neutral)
pseudo-code.

## Relationship to the framework skills

`lightningjs-v2-conventions/references/focus-and-input.md` covers the
Lightning-v2 mechanics that implement these patterns: `_getFocused()` for
delegation, the `_capture*` / `_handle*` key phases, `_focus()` /
`_unfocus()`, `_refocus()`. This skill deliberately does not repeat those
APIs. When working in a specific framework, load its skill for the concrete
calls and this one for the shape the result should take. Cross-references
in the reference files point both ways rather than duplicating.

## Non-negotiable conventions for generated code

1. **One focus, always.** At any moment exactly one element is focused,
   app-wide. After every screen change, modal open/close, list mutation, or
   async load, the code must have a definite answer to "what is focused
   now?" — never leave it implicit or empty.
2. **Every screen declares its initial focus.** When a screen or route
   becomes active, it explicitly moves focus to a specific element (its
   primary action, the first rail, the previously-focused item on Back).
   Don't rely on document order or "whatever mounted first."
3. **Focus is loud.** The focused element needs a single, unmistakable
   indicator sized for a 3-metre viewing distance — not a subtle web-style
   hover tint. Exactly one focus indicator visible at a time.
4. **Containers navigate, leaves act.** The container that owns a layout
   (rail, grid, menu) handles the arrow keys and tracks the selected
   index; leaf widgets handle OK/Enter and report upward. Don't scatter
   `handleRight` across buttons.
5. **Focused ≠ activated.** Moving focus updates visual state and may
   trigger a lightweight preview, but must not fire the item's real action,
   navigation, or a heavy request. That happens on OK/Enter only.
6. **Focus change implies scroll-into-view.** If focus lands on an element
   that's partly or fully off-screen, the owning container scrolls so it's
   comfortably visible. Never focus something the user can't see.
7. **Back is defined at every level.** Back has a deterministic meaning
   wherever the user is: dismiss the overlay → collapse the panel → go up
   one navigation level → at the root, a confirm-to-exit prompt. Back never
   does nothing and never silently kills the app.
8. **One resolution strategy per container, with deliberate edges.** A
   container resolves direction presses either geometrically or by a
   tracked index — pick one. Decide explicitly what each edge does (trap,
   wrap, hand focus to the parent, or no-op) rather than inheriting
   whatever the library defaults to.
9. **Modals trap and restore.** While an overlay that owns focus is open,
   directional keys cannot escape it. On close, focus returns to the exact
   element that had it before the overlay opened.

## What this skill does not cover

- Framework focus APIs and component lifecycle — see the framework skill
  (`lightningjs-v2-conventions`, `lightningjs-v3-conventions`).
- Concrete remote key codes per platform, and app lifecycle/visibility
  events — see `tv-platform-quirks`.
- Screen-reader / voice-guidance behavior (TalkBack, VoiceView, webOS
  audio guidance) beyond the fact that a clean focus model is its
  precondition.
- Media transport-control UX (scrub bars, skip, up-next) as a design
  problem in its own right — the focus mechanics here apply, the
  player-specific UX doesn't live here.
