---
name: tv-focus-and-navigation
description: PLACEHOLDER — not yet populated. Do not rely on this skill triggering correctly yet. Intended scope is framework-agnostic remote-control navigation and focus-management patterns (focus delegation, key handling, grids/rails/modals) for TV apps, one level above any single framework.
---

# TV Focus & Navigation

This skill is a placeholder. Content to be filled in following the same
pattern as `lightningjs-v2-conventions`: read source documentation
directly (not from memory), write original explanations, keep reference
material split into one file per sub-topic under `references/`.

## Planned scope

- Focus delegation patterns
- Key-handling conventions (up/down/left/right/enter/back)
- How a focus path is built and walked
- Conventions for the three UI shapes that show up in almost every TV
  app — grids, rails, and modals (what should own focus when a modal
  opens, how a rail hands focus back to its parent row, etc.)

## Relationship to lightningjs-v2-conventions

`lightningjs-v2-conventions/references/focus-and-input.md` already covers
the Lightning-v2-specific mechanics (`_getFocused()`, `_handle*` naming,
`_focus()`/`_unfocus()`). This skill is meant to sit one level up — the
conceptual/UX patterns that apply whether the app is built in Lightning v2,
Lightning 3/Blits, or something else entirely — not to duplicate the v2
API reference. When this gets written, check for overlap and cross-link
rather than repeat framework-specific mechanics here.

See `PLANNED.md` in this folder for the original scoping notes.
