---
name: lightningjs-v3-conventions
description: PLACEHOLDER — not yet populated. Do not rely on this skill triggering correctly yet. Intended scope is conventions for LightningJS 3 / Blits (single-file-component syntax, reactive state, `Blits.Component`), kept fully separate from Lightning Core v2.
---

# LightningJS 3 / Blits Conventions

This skill is a placeholder. Content to be filled in following the same
pattern as `lightningjs-v2-conventions`: read source documentation
directly (not from memory), write original explanations, keep reference
material split into one file per sub-topic under `references/`.

## Planned scope

- Single-file-component syntax and authoring model (`.js`/`.html`-in-one
  files vs. plain JS/TS classes + template objects)
- Blits' reactive state model — state changes react automatically, unlike
  v2's manual `patch()`/property mutation
- `Blits.Component` lifecycle hooks
- Common web/DOM mental-model pitfalls, likely as relevant here as in v2
- `references/*.md` for components, reactive state, routing, and
  TypeScript typing specific to Blits

## Relationship to lightningjs-v2-conventions

Keep this fully separate rather than merging or treating v3 as "the new
way to write v2 code" — different authoring model, different reactivity,
different lifecycle hooks. A v2 codebase should never get Blits
suggestions and vice versa.

See `PLANNED.md` in this folder for the original scoping notes.
