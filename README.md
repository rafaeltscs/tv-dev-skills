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
| [`lightningjs-v3-conventions`](skills/lightningjs-v3-conventions/) | **Ready** | Lightning 3 / Blits — single-file components, built-in reactivity (state/props/computed/watch), remote input & focus, the `<Layout>`/`<Text>` built-ins, transitions, and the built-in router. Kept fully separate from v2 since the two frameworks don't share syntax. |
| [`tv-focus-and-navigation`](skills/tv-focus-and-navigation/) | **Ready** | Framework-agnostic remote-control navigation: the focus model, key handling & propagation, spatial (directional) resolution, and the recurring shapes (rails, grids, modals, menus, page transitions). |
| [`tv-performance-constraints`](skills/tv-performance-constraints/) | **Ready** | Framework-agnostic performance rules for low-end TV hardware: texture memory budgets & the bytes-per-pixel math, GC pressure & allocation discipline, image sizing/decode/caching, lazy loading & virtualization of rails/grids. |
| [`tv-platform-quirks`](skills/tv-platform-quirks/) | **Ready** | Per-platform quirks for web-based TV apps across six families — LG webOS, Samsung Tizen, VIZIO SmartCast, Amazon Fire TV (Fire OS), Comcast/RDK (Firebolt on WPE WebKit), Android TV / Google TV (WebView in a native shell): engine baseline, lifecycle/suspend events, pointer-vs-D-pad remote key codes (Back = 461 webOS / 10009 Tizen / native `onBackPressed` on Android TV / verify elsewhere; Tizen key registration), the Back/exit contract, adaptive streaming + DRM (webOS HLS-only + `luna://` DRM; Tizen AVPlay + DASH + `setDrm`; VIZIO/Fire TV/RDK/Android TV BYO MSE player + Widevine), and packaging + store review (`.ipk`/`ares-cli`/LG Seller Lounge; `.wgt`/Tizen Studio/Samsung Seller Office; VIZIO hosted-URL app; Fire TV Amazon WebView + Appstore + the Fire OS→Vega OS split; RDK Firebolt App Manifest + per-operator certification; Android TV `.aab` + `CATEGORY_LEANBACK_LAUNCHER` + Play TV app-quality review). |

"Planned" skills are inert placeholders — they won't trigger and add no
guidance yet.

Each skill loads on demand: it enters context only when your prompt
matches what that skill covers, so installing the plugin adds nothing to a
session until a relevant task comes up.

## Installing (Claude Code)

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

## Installing (Codex, Cursor, GitHub Copilot, other agents)

Agents outside Claude Code have no on-demand skill loader, so the installer
**vendors the skill markdown into your project** and wires up a router that
tells the agent to open a `SKILL.md` only when the task matches it.

From your project root:

```bash
npx github:rafaeltscs/tv-dev-skills
```

or, if you've cloned this repo:

```bash
node path/to/tv-dev-skills/tools/install.mjs --dir=/path/to/your/app
```

That does two things:

1. Copies the skills to `.agent-skills/tv-dev-skills/` in your project.
2. Writes a marker-delimited router block into `AGENTS.md` and
   `.github/copilot-instructions.md`, plus one `.cursor/rules/tv-dev-skills-*.mdc`
   per skill (each with the skill's `description`, so Cursor attaches it by
   relevance).

Flags: `--targets=agents,cursor,copilot` to pick a subset, `--dest=PATH` to
change where skills land, `--dry-run` to preview. Re-run any time to pull
updates — the generated blocks and rule files are replaced in place and
stale ones are pruned.

Commit `.agent-skills/` (and the generated router files) for a reproducible
checkout, or add `.agent-skills/` to `.gitignore` and re-run the installer
after each pull.

## License

MIT — see [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json).
