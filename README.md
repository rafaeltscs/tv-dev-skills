# tv-dev-skills

A Claude Code plugin for TV/OTT app development — one install, a growing
collection of skills.

Content is written from scratch based on publicly available documentation
and source repositories. See
[NOTICE.md](NOTICE.md) for attribution.

## Skills

| Skill | Status | Covers |
|---|---|---|
| [`lightningjs-v2-conventions`](skills/lightningjs-v2-conventions/) | **Ready** | Components, Templates, lifecycle, focus/remote-control input, textures & performance, signals, Component States, TypeScript Template Specs. |
| [`lightningjs-v3-conventions`](skills/lightningjs-v3-conventions/) | Planned | Lightning 3 / Blits — kept fully separate from v2 since the two frameworks don't share syntax. |
| [`tv-focus-and-navigation`](skills/tv-focus-and-navigation/) | **Ready** | Framework-agnostic remote-control navigation: the focus model, key handling & propagation, spatial (directional) resolution, and the recurring shapes (rails, grids, modals, menus, page transitions). |
| [`tv-performance-constraints`](skills/tv-performance-constraints/) | **Ready** | Framework-agnostic performance rules for low-end TV hardware: texture memory budgets & the bytes-per-pixel math, GC pressure & allocation discipline, image sizing/decode/caching, lazy loading & virtualization of rails/grids. |
| [`tv-platform-quirks`](skills/tv-platform-quirks/) | Planned | The Tizen/webOS/Vizio/Fire TV support matrix: lifecycle events, key codes, DRM/player quirks, packaging. |

"Planned" skills are inert placeholders — they won't trigger and add no
guidance yet.

Installing the plugin also loads a short list of non-negotiable LightningJS
v2 conventions into context at the start of every session, so the basics
are in effect even before a skill triggers for a specific prompt.

## Installing

**One-off, in a single project:**

```
/plugin marketplace add rafaeltscs/tv-dev-skills
/plugin install tv-dev-skills@tv-dev-skills
```

**For a team, so it's automatic on clone:**

Commit this to the project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "tv-dev-skills": {
      "source": { "source": "github", "repo": "rafaeltscs/tv-dev-skills" }
    }
  },
  "enabledPlugins": {
    "tv-dev-skills@tv-dev-skills": true
  }
}
```

Anyone who clones the project gets the plugin enabled with no manual
`/plugin` step.

## License

MIT — see [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json).
