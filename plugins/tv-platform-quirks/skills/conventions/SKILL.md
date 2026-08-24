---
name: tv-platform-quirks
description: PLACEHOLDER — not yet populated. Do not rely on this skill triggering correctly yet. Intended scope is the platform-support matrix for shipping a TV app across Tizen, webOS, Vizio/SmartCast, and Fire TV — lifecycle events, remote key codes, DRM/player quirks, packaging.
---

# TV Platform Quirks

This skill is a placeholder. Content to be filled in following the same
pattern as `lightningjs-v2-conventions`: read source documentation
directly (not from memory), write original explanations, keep reference
material split into one file per sub-topic under `references/`.

## Planned scope

The platform-support matrix for shipping a TV app across Tizen (Samsung),
webOS (LG), Vizio/SmartCast, and Fire TV — each of which has its own:

- Lifecycle events (visibility/suspend/resume hooks differ per platform)
- Remote key codes (the same physical button can report different key
  codes across platforms/firmware versions)
- DRM and video-player quirks (supported DRM schemes, player API
  differences, codec/container support gaps)
- Packaging and submission steps (app manifests, signing, store review
  requirements)

Keep this generic/public-knowledge (platform SDK docs are public) rather
than tied to any specific app's build pipeline, consistent with the rest
of this repo's project-agnostic approach — see the root `README.md`.

See `PLANNED.md` in this folder for the original scoping notes.
