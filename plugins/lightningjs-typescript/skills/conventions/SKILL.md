---
name: lightningjs-typescript
description: PLACEHOLDER — not yet populated. Do not rely on this skill triggering correctly yet. Intended scope is team-level conventions for typing Lightning components in TypeScript (Template Specs, Type Configs, signal typing, `this`-context differences) beyond the baseline covered in lightningjs-v2-conventions.
---

# LightningJS TypeScript Conventions

This skill is a placeholder. Content to be filled in following the same
pattern as `lightningjs-v2-conventions`: read source documentation
directly (not from memory), write original explanations, keep reference
material split into one file per sub-topic under `references/`.

## Planned scope

- Team-level conventions for typing Lightning components, beyond what's
  already in `lightningjs-v2-conventions`'s `references/typescript.md`
- Template Specs and Type Configs, `getByRef` vs. loose `tag()`
- Signal typing
- `this`-context differences between static/instance methods and state
  classes

## Relationship to lightningjs-v2-conventions

There's deliberate overlap with `lightningjs-v2-conventions/references/typescript.md`
today. When this skill gets built, decide whether it:

1. **Replaces** that reference file (this skill becomes the single source
   of truth for Lightning TS typing, and v2-conventions just points to it), or
2. **Extends** it with team/house-specific patterns (stricter typing rules,
   codegen conventions, monorepo-specific type-sharing) on top of the
   baseline API guidance that stays in v2-conventions.

Option 1 is probably cleaner long-term if this ends up covering both v2 and
v3/Blits typing, since then there's one typing skill instead of duplicating
it per framework version. Revisit once there's real content to compare.

See `PLANNED.md` in this folder for the original scoping notes.
