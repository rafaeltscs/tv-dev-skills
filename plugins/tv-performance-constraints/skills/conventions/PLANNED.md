# tv-performance-constraints (planned)

Status: **not yet written**. Placeholder folder reserving the skill's slot
and name; no `SKILL.md` yet so nothing tries to load or trigger it.

## Scope

Performance rules specific to low-end TV chipsets, which are far more
constrained than the desktop/mobile hardware most model training data
assumes. Planned content:

- Texture memory limits and budgets (how many/how large textures a scene
  can hold before eviction or OOM on weak hardware)
- GC pressure — avoiding per-frame allocations in render/update loops,
  object pooling patterns
- Image sizing and caching strategy for poster/thumbnail-heavy UIs
- Lazy loading and virtualization of off-screen rails/grids

The goal is that generated code respects TV hardware limits by default
(e.g. "never allocate a new object inside an animation tick", "always use
a texture preset for poster images") instead of needing a separate
performance-review pass after the fact.

This is meant to be framework-agnostic where possible (the underlying
constraints — texture memory, GC pauses, decode cost — apply whether the
app is Lightning v2, Blits, or another TV framework), with framework-
specific implementation notes (e.g. Lightning's texture/rectangle-atlas
APIs) added as needed.
