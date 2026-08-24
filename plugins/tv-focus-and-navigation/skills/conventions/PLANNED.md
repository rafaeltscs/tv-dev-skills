# tv-focus-and-navigation (planned)

Status: **not yet written**. Placeholder folder reserving the skill's slot
and name; no `SKILL.md` yet so nothing tries to load or trigger it.

## Scope

Remote-control navigation and focus management as a TV-app UX problem, at a
level above any single framework. Focus handling is the heart of every TV
app and is totally alien to web-trained models (there's no DOM focus, no
tabindex, no click targets — everything is deliberate focus-path management
driven by directional remote input).

Planned content: focus delegation patterns, key-handling conventions
(up/down/left/right/enter/back), how a focus path is built and walked,
and conventions for the three UI shapes that show up in almost every TV
app — grids, rails, and modals (what should own focus when a modal opens,
how a rail hands focus back to its parent row, etc.).

## Relationship to lightningjs-v2-conventions

`lightningjs-v2-conventions/references/focus-and-input.md` already covers
the Lightning-v2-specific mechanics (`_getFocused()`, `_handle*` naming,
`_focus()`/`_unfocus()`). This skill is meant to sit one level up — the
conceptual/UX patterns that apply whether the app is built in Lightning v2,
Lightning 3/Blits, or something else entirely — not to duplicate the v2
API reference. When this gets written, check for overlap and cross-link
rather than repeat framework-specific mechanics here.
