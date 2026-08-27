# tv-dev-skills

A Claude Code plugin — one install, growing collection of skills — for
TV/OTT app development, kept intentionally separate from any single
(proprietary) codebase so it can be dropped into any project — freelance,
employer-owned, or personal — without leaking project-specific code.

TV app development diverges hard from the web/mobile work most model
training data covers: no DOM, no CSS, alien focus/remote-navigation models,
brutal low-end hardware constraints, and a fragmented platform landscape
(Tizen, webOS, Vizio, Fire TV). Skills earn their keep exactly where a stack
diverges from what a model has seen most — so this is a growing collection
of skills that supply that missing domain knowledge, starting with
LightningJS.

Content is written from scratch based on publicly available documentation
and source repositories, not copied from any private project. See
[NOTICE.md](NOTICE.md) for attribution.

Structured the way [mattpocock/skills](https://github.com/mattpocock/skills)
is: a single plugin (`.claude-plugin/marketplace.json` + `plugin.json`) that
bundles every skill, rather than a separate installable plugin per skill.
One install brings the whole collection along; each skill's own `SKILL.md`
description is what controls whether it actually triggers for a given task
(e.g. `lightningjs-v2-conventions` explicitly excludes Blits work), so
carrying skills you don't currently need costs a bit of manifest weight, not
incorrect suggestions.

## Layout

```
tv-dev-skills/
├── .claude-plugin/
│   ├── marketplace.json           # 1 plugin entry, source: "./"
│   └── plugin.json                # the plugin manifest
├── hooks/
│   ├── hooks.json                 # SessionStart hook (see below)
│   └── core-conventions.md
├── skills/
│   ├── lightningjs-v2-conventions/   # Lightning Core v2 — done
│   │   ├── SKILL.md
│   │   └── references/
│   ├── lightningjs-v3-conventions/   # planned — Lightning 3 / Blits
│   ├── lightningjs-typescript/       # planned — Lightning TS typing conventions
│   ├── tv-focus-and-navigation/      # planned — remote nav & focus, framework-agnostic
│   ├── tv-performance-constraints/   # planned — low-end TV hardware constraints
│   └── tv-platform-quirks/           # planned — Tizen/webOS/Vizio/Fire TV matrix
└── eval-workspace/                 # eval harnesses + benchmark runs, not shipped in the plugin
    └── lightningjs-v2-conventions/
```

Skills load automatically from `skills/<name>/SKILL.md` — no manifest entry
needed per skill. Each real skill is a `SKILL.md` (loaded when it triggers)
plus `references/*.md` files Claude reads on demand for deeper detail on a
specific sub-topic. Skills that don't have real content yet ship a
placeholder `SKILL.md` marked `PLACEHOLDER` in its description (so nothing
tries to trigger it prematurely) plus a `PLANNED.md` with the intended
scope.

`eval-workspace/` holds the eval fixtures and benchmark/iteration data used
to develop and score a skill's content. It's dev tooling, not something a
consuming project needs, which is why it lives outside anything the plugin
manifest points to.

If the skill count grows large enough that a flat `skills/` listing gets
hard to scan, consider grouping into category subfolders the way Matt
Pocock's repo does (`skills/engineering/`, `skills/productivity/`) — not
worth doing yet with one real skill and five placeholders.

## Skills

| Skill | Status | Covers |
|---|---|---|
| [`lightningjs-v2-conventions`](skills/lightningjs-v2-conventions/) | **Done** | Templates, components, states, signals/events, the render tree vs. DOM distinction, TS Template Specs, focus/input, textures & performance. |
| [`lightningjs-v3-conventions`](skills/lightningjs-v3-conventions/) | Placeholder | Lightning 3 / Blits — kept fully separate from v2 since the two frameworks don't share syntax. |
| [`lightningjs-typescript`](skills/lightningjs-typescript/) | Placeholder | Typing conventions for Lightning components (Template Specs, Type Configs, signal typing, `this` contexts), currently living inside `lightningjs-v2-conventions`'s `typescript.md` reference until this is built out on its own. |
| [`tv-focus-and-navigation`](skills/tv-focus-and-navigation/) | Placeholder | Remote-navigation and focus-management patterns (focus delegation, key handling, grids/rails/modals) at a level above any single framework. |
| [`tv-performance-constraints`](skills/tv-performance-constraints/) | Placeholder | Texture memory limits, GC pressure, image sizing/caching, lazy loading — the rules that keep generated code respecting low-end TV hardware from the start. |
| [`tv-platform-quirks`](skills/tv-platform-quirks/) | Placeholder | The Tizen/webOS/Vizio/Fire TV support matrix: lifecycle events, key codes, DRM/player quirks, packaging. |

`hooks/` ships a `SessionStart` hook that loads a short list of
non-negotiable LightningJS v2 conventions into context once per session, so
the basics are present even before the skill itself triggers on a matching
prompt. As more skills gain real content, revisit whether a single blanket
SessionStart hook is still the right mechanism, or whether it should become
more targeted (e.g. scoped to matching file edits) so an unrelated skill's
conventions don't load into every session regardless of relevance.

## Using this in a project

**1. One-off install**

```
/plugin marketplace add <your-github-username>/tv-dev-skills
/plugin install tv-dev-skills@tv-dev-skills
```

(Replace `<your-github-username>/tv-dev-skills` once this repo has been
pushed to a GitHub remote — it doesn't have one yet. Locally, before pushing
anywhere, you can instead run `/plugin marketplace add ./tv-dev-skills` from
a sibling directory, or `/plugin marketplace add ./` from inside this repo.)

**2. Automatic registration for a team/project**

Commit an entry to the project's `.claude/settings.json` so anyone who
clones the repo gets the plugin enabled automatically, with no manual
`/plugin` step:

```json
{
  "extraKnownMarketplaces": {
    "tv-dev-skills": {
      "source": { "source": "github", "repo": "<your-github-username>/tv-dev-skills" }
    }
  },
  "enabledPlugins": {
    "tv-dev-skills@tv-dev-skills": true
  }
}
```

## Extending

Each domain (components, focus/input, textures, TypeScript typing, etc.)
within a skill has its own reference file so any one of them can be updated
independently as the underlying framework evolves, without bloating the
main `SKILL.md`. Lightning 3 / Blits conventions live in their own sibling
skill (`lightningjs-v3-conventions/`) rather than being merged into the v2
one — the two frameworks are different enough (WebGL renderer + template
DSL vs. Blits' single-file-component + reactive model) that conflating them
would confuse triggering. The same "separate skill per real divergence"
principle applies to the other planned skills above — don't merge
platform-quirks content into performance-constraints just because they're
both "TV stuff", for example, since a task usually only needs one of them
loaded.

Bump `version` in `.claude-plugin/plugin.json` when any skill's content
changes — versioning is per-plugin (i.e. per-repo) here, not per-skill,
since everything installs and updates together.

## Keeping this project-agnostic

Do **not** add real component code, business logic, API endpoints, asset
paths, or anything else identifying a specific employer's app into this
repo. Examples in the reference files should stay generic (`MyComponent`,
`ButtonList`, placeholder colors) — that's what keeps this shareable.
