# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses a single version for the whole plugin (see `AGENTS.md`)
rather than versioning each skill independently.

## [Unreleased]

## [1.0.0] - 2026-09-14

Initial public release.

### Added

- `lightningjs-v2-conventions` — Components, Templates, lifecycle,
  focus/remote-control input, textures & performance, signals, Component
  States, and TypeScript Template Specs for LightningJS Core v2.
- `lightningjs-v3-conventions` — Lightning 3 / Blits single-file components,
  built-in reactivity (state/props/computed/watch), remote input & focus,
  the `<Layout>`/`<Text>` built-ins, transitions, and the built-in router.
- `tv-focus-and-navigation` — framework-agnostic remote-control navigation:
  the focus model, key handling & propagation, spatial (directional)
  resolution, and recurring UI shapes (rails, grids, modals, menus, page
  transitions).
- `tv-performance-constraints` — framework-agnostic performance rules for
  low-end TV hardware: texture memory budgets, GC pressure & allocation
  discipline, image sizing/decode/caching, and lazy loading/virtualization
  of rails/grids.
- `tv-platform-quirks` — per-platform quirks across six platform families
  (LG webOS, Samsung Tizen, VIZIO SmartCast, Amazon Fire TV, Comcast/RDK,
  Android TV / Google TV): engine baseline, lifecycle/suspend events,
  remote key codes, the Back/exit contract, adaptive streaming + DRM, and
  packaging + store review.
- `tools/install.mjs` — installer that vendors these skills into projects
  for agents without Claude Code's on-demand skill loading (Codex /
  `AGENTS.md`, Cursor, GitHub Copilot), and can be run without cloning via
  `npx github:rafaeltscs/tv-dev-skills`.
- MIT license; see `NOTICE.md` for attribution of the public documentation
  and source repositories this content was written from.

[Unreleased]: https://github.com/rafaeltscs/tv-dev-skills/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/rafaeltscs/tv-dev-skills/releases/tag/v1.0.0
