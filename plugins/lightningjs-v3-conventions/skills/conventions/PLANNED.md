# lightningjs-v3-conventions (planned)

Status: **not yet written**. This folder is a placeholder reserving the
skill's slot and name; it intentionally has no `SKILL.md` yet so nothing
tries to load or trigger it.

## Scope

Conventions for **Lightning 3 / Blits** (`@lightningjs/blits`) — the
single-file-component syntax, reactive state model, and `Blits.Component`
API. This is a different framework from Lightning Core v2, not a version
bump: different authoring model (SFC-style `.js`/`.html`-in-one files vs.
plain JS/TS classes + template objects), different reactivity (Blits reacts
to state changes automatically; v2 requires manual `patch()`/property
mutation), different lifecycle hooks.

Keep this **fully separate** from [`lightningjs-v2-conventions`](../lightningjs-v2-conventions/SKILL.md)
rather than merging them or treating v3 as "the new way to write v2 code" —
conflating the two would confuse triggering (a v2 codebase should never get
Blits suggestions and vice versa) and would blur two APIs that don't share
syntax.

## When building this skill

Follow the same shape as `lightningjs-v2-conventions`: a `SKILL.md` with the
common pitfalls (web/DOM mental-model bleed-through is likely just as much
of a problem here) plus `references/*.md` for components, reactive state,
routing, and TypeScript typing specific to Blits.
