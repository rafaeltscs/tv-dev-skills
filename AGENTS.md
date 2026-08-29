# AGENTS.md

Instructions for whoever (human or agent) works on this repo's content.
End users installing the plugin don't need any of this — see
[README.md](README.md) for that.

TV app development diverges hard from the web/mobile work most model
training data covers: no DOM, no CSS, alien focus/remote-navigation models,
brutal low-end hardware constraints, and a fragmented platform landscape
(webOS, Tizen, VIZIO, Fire TV, Comcast/RDK, Android TV / Google TV). This
plugin supplies that missing domain knowledge, starting with LightningJS.

## Structure

```
tv-dev-skills/
├── .claude-plugin/
│   ├── marketplace.json     # 1 plugin entry, source: "./"
│   └── plugin.json          # the plugin manifest
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md         # frontmatter description controls triggering
│       └── references/*.md  # loaded on demand, one file per sub-topic
└── eval-workspace/
    └── <skill-name>/        # eval fixtures + benchmark runs, dev tooling only
```

Each skill is loaded on demand: when a prompt matches a skill's
frontmatter `description`, Claude Code pulls in that `SKILL.md` (and only
the reference files it then needs). Nothing is force-loaded at session
start — an installed plugin costs nothing until a relevant task shows up,
so keep every skill's triggering to its `description`.

This is **one plugin bundling many skills** (all install/update/version
together), not a marketplace of independently-installable plugins — an
earlier iteration of this repo tried the latter and it was replaced. The
structure was inspired by how [mattpocock/skills](https://github.com/mattpocock/skills)
organizes a single plugin's worth of skills; this repo is not a fork or
derivative of that content.

`eval-workspace/` holds eval fixtures and benchmark/iteration data used to
develop and score a skill's content. It's dev tooling, not something a
consuming project needs — keep it out of anything the plugin manifest
points to.

### `plugin.json` gotcha

Don't add an explicit `skills` field to `plugin.json` pointing at the
default `skills/` location — it's auto-discovered already. Declaring
default locations explicitly has caused load failures in the past
(a "duplicate hooks file" error when `hooks` was set this way). Only add
such fields if content lives somewhere non-default.

## Adding a skill

1. Create `skills/<name>/SKILL.md` with real frontmatter (`name`,
   `description`) — the description is what controls triggering, so be
   specific about what it covers and what it explicitly doesn't (see
   `lightningjs-v2-conventions`'s exclusion of Blits work as an example).
2. Split non-trivial detail into `references/*.md`, one file per sub-topic,
   and point to them from a lookup table in `SKILL.md` rather than inlining
   everything.
3. Write content from source documentation directly, not from model memory
   — paraphrase and verify against primary docs, don't reproduce vendor
   text verbatim.
4. Don't merge a new skill's scope into an existing one just because
   they're topically adjacent ("TV stuff") — a separate skill per real
   divergence keeps triggering precise, since a task usually only needs one
   loaded.
5. Bump `version` in `.claude-plugin/plugin.json` for any content change —
   versioning is per-plugin, not per-skill.
6. To reserve a skill's slot before it has real content, ship a
   placeholder `SKILL.md` whose description starts with `PLACEHOLDER — not
   yet populated. Do not rely on this skill triggering correctly yet.` plus
   a `PLANNED.md` describing the intended scope, so nothing tries to
   trigger it prematurely. Before writing one, check whether the planned
   scope is already covered elsewhere — `lightningjs-typescript` was
   dropped for exactly this reason (its planned content duplicated
   `lightningjs-v2-conventions/references/typescript.md`).
7. If the flat `skills/` listing ever gets hard to scan, consider category
   subfolders (`skills/frameworks/`, `skills/platform/`, etc.) — not worth
   it yet with four real skills and one placeholder.

## Refreshing the local install after a content change

`claude plugin marketplace update <name>` only refreshes marketplace
metadata — it does **not** update an already-installed plugin's version.
Use `claude plugin update <name>` instead (or uninstall/reinstall) so
`claude plugin list` reflects the new version.

## No session-start preload

An earlier version shipped a `SessionStart` hook (`hooks/core-conventions.md`)
that `cat`-ed a LightningJS v2 cheat sheet into every session. That was
dropped once the plugin grew past a single skill: it loaded v2 conventions
even for sessions that never touch Lightning, and a one-plugin structure
has no way to scope a hook to one skill. The skills' frontmatter
`description` triggering already covers "load it when the task needs it,"
which is all that preload was really for. If some future skill genuinely
needs always-on context, prefer a narrowly scoped hook (matched to file
edits or prompt content) over a blanket `SessionStart` one, and document
why here.

## Keeping this project-agnostic

Do **not** add real component code, business logic, API endpoints, asset
paths, or anything else identifying a specific employer's app into this
repo. Examples in reference files should stay generic (`MyComponent`,
`ButtonList`, placeholder colors) — that's what keeps this shareable across
freelance, employer-owned, and personal projects.
