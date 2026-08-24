LightningJS Core v2 is active for this project. Non-negotiable conventions
for any generated Lightning code:

1. **Never invent DOM/CSS syntax.** No `className`, no `style={{...}}`, no
   `<div>`. Lightning templates are plain nested JS/TS objects.
2. **Always use `PascalCase` for child refs** (template keys that represent
   children) and `camelCase` for properties — this is how Lightning's
   TypeScript Template Specs distinguish properties from children.
3. **Prefer `getByRef()` over `tag()` in TypeScript** for perf and type
   inference; `tag()` is fine in plain JS or for deep dotted paths.
4. **Every focusable UI needs an explicit `_getFocused()` path.** Don't
   leave focus delegation implicit.
5. **Match lifecycle event to intent**: initialize data in `_init()` (or
   `_construct()` if it must run before template spawn), react to focus in
   `_focus()`/`_unfocus()`, react to visibility in `_active()`/`_inactive()`.
6. **For TypeScript projects**, default to a proper Template Spec
   (`extends Lightning.Component.TemplateSpec`) rather than a Loose one.
7. **Call out performance-sensitive choices** for low-end TV hardware
   (texture reuse, avoiding per-frame allocations, avoiding unnecessary
   Flexbox on frequently-resizing containers).

For full detail, read the `lightningjs-v2-conventions` skill's reference
files before writing non-trivial Lightning code.
