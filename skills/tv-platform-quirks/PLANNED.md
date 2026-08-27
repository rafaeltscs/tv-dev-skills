# tv-platform-quirks (planned)

Status: **not yet written**. Placeholder folder reserving the skill's slot
and name; no `SKILL.md` yet so nothing tries to load or trigger it.

## Scope

The platform-support matrix for shipping a TV app across Tizen (Samsung),
webOS (LG), Vizio/SmartCast, and Fire TV — each of which has its own:

- Lifecycle events (visibility/suspend/resume hooks differ per platform)
- Remote key codes (the same physical button can report different key
  codes across platforms/firmware versions)
- DRM and video-player quirks (supported DRM schemes, player API
  differences, codec/container support gaps)
- Packaging and submission steps (app manifests, signing, store review
  requirements)

The point of documenting this as a skill is to save re-explaining the same
"which platform am I on and what does it need" context every time a
platform-specific bug or packaging question comes up.

Keep this generic/public-knowledge (platform SDK docs are public) rather
than tied to any specific app's build pipeline, consistent with the rest
of this repo's project-agnostic approach — see the root `README.md`.
