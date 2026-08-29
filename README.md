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
| [`tv-platform-quirks`](skills/tv-platform-quirks/) | **Ready** | Per-platform quirks for web-based TV apps across five families — LG webOS, Samsung Tizen, VIZIO SmartCast, Amazon Fire TV (Fire OS), Comcast/RDK (Firebolt on WPE WebKit): engine baseline, lifecycle/suspend events, pointer-vs-D-pad remote key codes (Back = 461 webOS / 10009 Tizen / verify elsewhere; Tizen key registration), the Back/exit contract, adaptive streaming + DRM (webOS HLS-only + `luna://` DRM; Tizen AVPlay + DASH + `setDrm`; VIZIO/Fire TV/RDK BYO MSE player + Widevine), and packaging + store review (`.ipk`/`ares-cli`/LG Seller Lounge; `.wgt`/Tizen Studio/Samsung Seller Office; VIZIO hosted-URL app; Fire TV Amazon WebView + Appstore + the Fire OS→Vega OS split; RDK Firebolt App Manifest + per-operator ingestion & certification). |

"Planned" skills are inert placeholders — they won't trigger and add no
guidance yet.

Each skill loads on demand: it enters context only when your prompt
matches what that skill covers, so installing the plugin adds nothing to a
session until a relevant task comes up.

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
