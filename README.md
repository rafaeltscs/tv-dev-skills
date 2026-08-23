# lightningjs-skills

Reusable Claude skills for LightningJS TV app development, kept intentionally
separate from any single (proprietary) codebase so they can be dropped into
any project — freelance, employer-owned, or personal — without leaking
project-specific code.

Content is written from scratch based on the public LightningJS documentation
and source repositories (`rdkcentral/Lightning`, `lightningjs.io/docs`), not
copied from any private project. See `NOTICE.md` for attribution.

## Layout

```
skills/
  lightningjs-v2-conventions/   # Lightning Core v2 (rdkcentral/Lightning)
    SKILL.md
    references/
  lightningjs-v3-conventions/   # planned — Lightning 3 / Blits
```

Each top-level folder under `skills/` is a self-contained Claude skill:
a `SKILL.md` (loaded when it triggers) plus `references/*.md` files that
Claude reads on demand for deeper detail on a specific sub-topic.

## Using this in a project

You have three options, roughly in order of convenience:

**1. Git submodule (recommended for teams)**

```bash
git submodule add https://github.com/<your-org>/lightningjs-skills.git .claude/external/lightningjs-skills
```

Then symlink (or copy, if your Claude client doesn't follow symlinks) the
skill folder you need into your project's skills directory, e.g.:

```bash
ln -s ../../external/lightningjs-skills/skills/lightningjs-v2-conventions \
      .claude/skills/lightningjs-v2-conventions
```

**2. Copy the folder directly**

Skills are just markdown, so you can literally copy
`skills/lightningjs-v2-conventions/` into wherever your Claude setup looks
for skills (e.g. `/mnt/skills/user/` on claude.ai, or your project's
`.claude/skills/` for Claude Code). No build step, no dependency.

**3. Package as a `.skill` file**

If you're using Claude's skill-creator tooling, run:

```bash
python -m scripts.package_skill skills/lightningjs-v2-conventions
```

This produces a single `.skill` file that can be uploaded/installed through
a Claude client that supports skill installation.

## Extending

Each domain (components, focus/input, textures, TypeScript typing, etc.) has
its own reference file so any one of them can be updated independently as
LightningJS itself evolves, without bloating the main `SKILL.md`. When
Lightning 3 / Blits work starts, it'll live in its own sibling skill folder
rather than being merged into the v2 one — the two frameworks are different
enough (WebGL renderer + template DSL vs. Blits' single-file-component +
reactive model) that conflating them would confuse triggering.

## Keeping this project-agnostic

Do **not** add real component code, business logic, API endpoints, asset
paths, or anything else identifying a specific employer's app into this
repo. Examples in the reference files should stay generic (`MyComponent`,
`ButtonList`, placeholder colors) — that's what keeps this shareable.
