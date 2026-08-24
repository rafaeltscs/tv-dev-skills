# lightningjs-typescript (planned)

Status: **not yet written**. Placeholder folder reserving the skill's slot
and name; no `SKILL.md` yet so nothing tries to load or trigger it.

## Scope

Team-level conventions for typing Lightning components in TypeScript,
beyond what's already in
[`lightningjs-v2-conventions/references/typescript.md`](../lightningjs-v2-conventions/references/typescript.md)
(Template Specs, Type Configs, `getByRef` vs. loose `tag()`). Typing
Lightning components is awkward enough — template specs, signal typing,
`this`-context differences between static/instance methods and state
classes — that teams tend to converge on their own house patterns to keep
generated code consistent rather than fighting the type system each time.

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
