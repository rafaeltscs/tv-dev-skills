# tv-dev-skills

A Claude Code **plugin marketplace** for TV/OTT app development, kept
intentionally separate from any single (proprietary) codebase so plugins can
be dropped into any project — freelance, employer-owned, or personal —
without leaking project-specific code.

TV app development diverges hard from the web/mobile work most model
training data covers: no DOM, no CSS, alien focus/remote-navigation models,
brutal low-end hardware constraints, and a fragmented platform landscape
(Tizen, webOS, Vizio, Fire TV). Skills earn their keep exactly where a stack
diverges from what a model has seen most — so this marketplace is a growing
collection of plugins that supply that missing domain knowledge, starting
with LightningJS.

Content is written from scratch based on publicly available documentation
and source repositories, not copied from any private project. See
[NOTICE.md](NOTICE.md) for attribution.

## Layout

```
tv-dev-skills/
├── .claude-plugin/
│   └── marketplace.json           # the catalog — lists every plugin below
├── plugins/
│   ├── lightningjs-v2-conventions/   # Lightning Core v2 (rdkcentral/Lightning) — done
│   ├── lightningjs-v3-conventions/   # planned — Lightning 3 / Blits
│   ├── lightningjs-typescript/       # planned — Lightning TS typing conventions
│   ├── tv-focus-and-navigation/      # planned — remote nav & focus, framework-agnostic
│   ├── tv-performance-constraints/   # planned — low-end TV hardware constraints
│   └── tv-platform-quirks/           # planned — Tizen/webOS/Vizio/Fire TV matrix
└── eval-workspace/                # eval harnesses + benchmark runs, not shipped in any plugin
    └── lightningjs-v2-conventions/
```

Each plugin under `plugins/` is independently installable — a project only
registers the plugins it actually needs. Each plugin's skill content lives at
`plugins/<name>/skills/conventions/` (a `SKILL.md` plus `references/*.md`
files Claude reads on demand for deeper detail on a specific sub-topic).
Plugins that don't have real content yet ship a placeholder `SKILL.md` marked
`PLACEHOLDER` in its description (so nothing tries to trigger it prematurely)
plus a `PLANNED.md` with the intended scope.

`eval-workspace/` holds the eval fixtures and benchmark/iteration data used to
develop and score a plugin's skill content. It's dev tooling, not part of any
installable plugin, which is why it lives outside `plugins/`.

## Plugins

| Plugin | Status | Covers |
|---|---|---|
| [`lightningjs-v2-conventions`](plugins/lightningjs-v2-conventions/) | **Done** | Templates, components, states, signals/events, the render tree vs. DOM distinction, TS Template Specs, focus/input, textures & performance. |
| [`lightningjs-v3-conventions`](plugins/lightningjs-v3-conventions/) | Placeholder | Lightning 3 / Blits — kept as a fully separate plugin from v2 since the two frameworks don't share syntax. |
| [`lightningjs-typescript`](plugins/lightningjs-typescript/) | Placeholder | Typing conventions for Lightning components (Template Specs, Type Configs, signal typing, `this` contexts), currently living inside `lightningjs-v2-conventions`'s `typescript.md` reference until this is built out on its own. |
| [`tv-focus-and-navigation`](plugins/tv-focus-and-navigation/) | Placeholder | Remote-navigation and focus-management patterns (focus delegation, key handling, grids/rails/modals) at a level above any single framework. |
| [`tv-performance-constraints`](plugins/tv-performance-constraints/) | Placeholder | Texture memory limits, GC pressure, image sizing/caching, lazy loading — the rules that keep generated code respecting low-end TV hardware from the start. |
| [`tv-platform-quirks`](plugins/tv-platform-quirks/) | Placeholder | The Tizen/webOS/Vizio/Fire TV support matrix: lifecycle events, key codes, DRM/player quirks, packaging. |

`lightningjs-v2-conventions` also ships a `SessionStart` hook
(`plugins/lightningjs-v2-conventions/hooks/`) that loads a short list of
non-negotiable conventions into context once per session, so the basics are
present even before the skill itself triggers on a matching prompt.

## Using this in a project

**1. One-off install**

```
/plugin marketplace add <your-github-username>/tv-dev-skills
/plugin install lightningjs-v2-conventions@tv-dev-skills
```

(Replace `<your-github-username>/tv-dev-skills` once this repo has been
pushed to a GitHub remote — it doesn't have one yet. Locally, before pushing
anywhere, you can instead run `/plugin marketplace add ./tv-dev-skills` from
a sibling directory, or `/plugin marketplace add .` from inside this repo.)

Only install the plugins a given project actually needs — e.g. a Blits
project would install `lightningjs-v3-conventions` instead of the v2 one.

**2. Automatic registration for a team/project**

Commit an entry to the project's `.claude/settings.json` so anyone who
clones the repo gets the marketplace and the right plugins enabled
automatically, with no manual `/plugin` step:

```json
{
  "extraKnownMarketplaces": {
    "tv-dev-skills": {
      "source": { "source": "github", "repo": "<your-github-username>/tv-dev-skills" }
    }
  },
  "enabledPlugins": {
    "lightningjs-v2-conventions@tv-dev-skills": true
  }
}
```

This is the actual "automatic on clone" mechanism — commit this file to
each consuming project once, adding one `enabledPlugins` line per plugin
the project needs.

## Versioning

Versioned per plugin, not per repo — each plugin changes on its own
schedule. `plugin.json`'s `version` field is authoritative; `marketplace.json`
intentionally omits `version` per plugin entry to avoid the two drifting
(when both are set, `plugin.json`'s value silently wins). Bump a plugin's
`version` in its own `plugin.json` when that plugin's content changes.

## Extending

Each domain (components, focus/input, textures, TypeScript typing, etc.) has
its own reference file so any one of them can be updated independently as
the underlying framework evolves, without bloating the main `SKILL.md`.
Lightning 3 / Blits conventions live in their own sibling plugin
(`lightningjs-v3-conventions/`) rather than being merged into the v2 one —
the two frameworks are different enough (WebGL renderer + template DSL vs.
Blits' single-file-component + reactive model) that conflating them would
confuse triggering. The same "separate plugin per real divergence" principle
applies to the other planned plugins above — don't merge platform-quirks
content into performance-constraints just because they're both "TV stuff",
for example, since a task usually only needs one of them loaded.

## Keeping this project-agnostic

Do **not** add real component code, business logic, API endpoints, asset
paths, or anything else identifying a specific employer's app into this
repo. Examples in the reference files should stay generic (`MyComponent`,
`ButtonList`, placeholder colors) — that's what keeps this shareable.
