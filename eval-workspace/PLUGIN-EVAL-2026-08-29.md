# tv-dev-skills — plugin-level eval pass (2026-08-29)

Goal: confirm the skills are linked correctly and that the plugin actually
makes a coding agent better at building/debugging TV/OTT apps.

The skill-creator loop has no "whole plugin" mode — it is per-skill. This
pass ran it per-skill for the two skills that had no evals, and added a
cross-cutting **routing suite** as the plugin-level check.

## 1. Structure & linking audit — PASS

- Every `references/*.md` link in every `SKILL.md` resolves.
- Cross-skill references (`lightningjs-v2-conventions/references/…` etc.)
  all resolve; the four real skills form a complete "Relationship to the
  other skills" mesh (v2 ↔ perf ↔ focus ↔ platform, both directions).
- `README.md` status table, `NOTICE.md` attribution, and every
  `SKILL.md` `name:` (matches its directory) are consistent.
- `lightningjs-v3-conventions` placeholder is correctly inert — its
  description opens with `PLACEHOLDER — not yet populated. Do not rely on
  this skill triggering…`.
- No `hooks/` dir (the old always-on v2 preload is gone, per `AGENTS.md`).

No structural fixes required.

## 2. Routing suite (the plugin-level test) — 10/10

`_routing-suite/` — 10 realistic prompts, none naming a skill. Each run
saw all 5 frontmatter descriptions, picked which skill(s) to consult,
then answered. See `workspace/iteration-1/routing-scorecard.md`.

- 8 positive prompts routed to the right skill (or right pair for the two
  cross-cutting ones — hero-banner → perf + v2; webOS/Tizen Back →
  platform + focus).
- `react-native-mobile-adjacent-miss` correctly routed to **NONE**
  despite heavy keyword overlap ("navigation", "focus", "rows",
  "settings").
- `blits-typescript-placeholder-guard` correctly **did not** apply
  `lightningjs-v2-conventions` to Blits work; it recognised the v3
  placeholder and answered from general knowledge with a "not covered"
  caveat.

Conclusion: the descriptions carve cleanly. Triggering is precise in both
directions.

## 3. Per-skill evals

### tv-performance-constraints — 3 evals, `evals/` + `workspace/iteration-1/`
### tv-platform-quirks — 3 evals, same layout

| skill | pass (with) | pass (without) | Δ pass | Δ time | Δ tokens |
|---|---|---|---|---|---|
| tv-performance-constraints | 15/15 | 15/15 | +0.00 | +99s | +21k |
| tv-platform-quirks | 15/15 | 15/15 | +0.00 | +0.9s | +25k |

**The baseline (no skill) already passes every assertion.** Sonnet 5
unaided produces essentially the same diagnosis and fix on all six
prompts: image-rendition sizing, virtualization + release-on-leave,
per-frame-allocation/GC, `keyCode` vs `key`, Back = 461/10009,
`registerKeyBatch`, AVPlay `stop()`+`close()` teardown, engine-baseline
transpile/polyfill.

What the skill adds is **precision, not correctness**: exact
Chromium-per-release numbers (webOS 4.x=CR53 / 5=CR68 / 6=CR79; Tizen
6.0=CR76 / 6.5=CR85) where the baseline says "~53" and "verify against
release notes"; canonical rendition-rung / texture-budget arithmetic
(30–40 MB); RDK `suspended` EGL/MemCR specifics; and consistent framing
against the skill's numbered rules. It costs ~20–25k extra tokens per
task.

### Caveat on these evals

They don't discriminate. Two reasons, both fixture-design:

1. The fixtures telegraph the answer — e.g. `tv-performance-constraints`'s
   `_framework.md` literally states "textures decode at the source image's
   intrinsic pixel size", which is the single insight the skill exists to
   teach.
2. The prompts are clean bug-hunt setups where the model already has the
   knowledge.

For iteration 2 the fixtures should hide the mechanism and the prompts
should push toward a plausible wrong answer (e.g. "we added a bigger
texture cache and it still crashes" — steering toward cache tuning rather
than rendition sizing), so the skill's value shows up as a pass/fail
delta, matching how `lightningjs-v2-conventions` (baseline 67%) and
`tv-focus-and-navigation` (baseline 95%) were built.

## 4. Description triggering

`run_loop.py` (the automated optimiser) needs Python + `claude -p`,
neither available here, so this was a manual pass seeded by the routing
suite (10/10, no mis-triggers).

One worthwhile change: **`tv-platform-quirks`'s frontmatter `description`
is ~400 words / one sentence** — 4–5× the other skills. It always sits in
context. It works (routing was clean) but it's fragile and expensive. A
~200-word version keeps every trigger phrase and every exclusion and
drops only the exhaustive per-platform API/tooling enumeration (which
already lives in the SKILL body and reference tables). Proposed text in
`workspace/iteration-1/proposed-tv-platform-quirks-description.md`.

The other four descriptions are fine as-is.

## Artifacts

- `tv-performance-constraints/workspace/iteration-1/review.html`
- `tv-platform-quirks/workspace/iteration-1/review.html`
- `_routing-suite/workspace/iteration-1/review.html`
- `_routing-suite/workspace/iteration-1/routing-scorecard.md`
- `*/workspace/iteration-1/benchmark.md`

---

# Follow-up pass (same day)

## Description edit applied

`tv-platform-quirks` frontmatter `description` shortened ~400 -> 265 words
(clean clauses; all six platform families, all three exclusions, trigger
phrases kept; per-platform manifest/CLI/portal enumeration dropped —
it's in the body). `plugin.json` 1.9.0 -> 1.9.1.

## Automated description optimiser (`run_loop.py`) — not viable here

- POSIX-only `select()` on a pipe: patched a Windows-safe thread-drained
  reader into a local copy (`scratchpad/skill-creator/`).
- The installed CLI (2.1.241) doesn't emit `stream_event` partials, so the
  loop's early trigger-detection is dead; only the final-message fallback
  works.
- More fundamental: a capable model answers these knowledge questions
  directly instead of calling the `Skill` tool, so the harness measures
  ~0% trigger regardless of description. The skill-creator docs note this
  ("simple queries won't trigger skills regardless of description
  quality").

Substitute: expanded the routing/triggering matrix (below), which forces
an explicit routing decision and measures that instead.

## Triggering matrix — 22/22

Routing suite (10) + iteration-2 re-check after the description edit (4) +
new triggering matrix (8: 4 oblique should-trigger, 4 near-miss
should-not — Electron desktop grid, desktop SPA Back, marketing-site
focus ring, Roku SceneGraph). Every prompt routed to the right skill,
right pair, or correctly to NONE. The shortened `tv-platform-quirks`
description still pulls the skill on all platform prompts (#4/#6/#10/T3)
and the RN-mobile / Roku / Electron near-misses still route to NONE.
Scorecard: `_routing-suite/workspace/iteration-1/routing-scorecard.md`.

## Harder iteration-2 evals for the two new skills

Fixtures rewritten to hide the mechanism (`_framework-v2.md` no longer
states that textures decode at source resolution or that there's no
virtualization) and every prompt now leads with a plausible wrong
diagnosis the team already chased (bigger LRU cache / "decoder too slow" /
"rAF is unreliable" / a different `event.key` / "firmware bug" + retries /
"webOS rendering bug" + `nomodule`).

| skill | pass (with) | pass (without) | delta |
|---|---|---|---|
| tv-performance-constraints (iter 2) | 15/15 | 15/15 | +0.00 |
| tv-platform-quirks (iter 2) | 15/15 | 14/15 | +0.07 |

Even with the lures, the baseline model still refuses the wrong diagnosis
and reaches the right fix on 5 of 6 prompts. The **one** assertion the
baseline missed and the skill caught: on the AVPlay / live-TV eval the
baseline's on-background handler leads with `suspend()`/`restore()`
("not `pause()`") and treats full `stop()`+`close()` teardown as a
fallback; the skill's guidance — which the with-skill run followed — is
that `suspend()`/`restore()` won't survive the tuner reclaiming the
decoder, so full teardown is the on-background path. That's the shape of
where this skill adds value: not "does the model know AVPlay", but "does
it pick the release strategy that survives the awkward case".

## Standing conclusion

- **Linking / routing: solid.** 22/22 routing, complete cross-reference
  mesh, clean structure. The plugin does what it's for — an agent working
  a TV/OTT task pulls the right domain knowledge without being told which
  skill to use, and doesn't misfire on adjacent desktop/mobile/Roku work.
- **Per-skill lift on `tv-performance-constraints` and `tv-platform-quirks`
  is small on measured pass rate** because Sonnet 5 already carries most
  of this. The value is in precision (exact engine-version tables, budget
  arithmetic, RDK EGL/MemCR, the release-strategy call above) at a
  ~20-25k-token cost per task. If a future iteration wants a larger
  measurable delta, push the fixtures further toward genuinely
  ambiguous / underspecified prompts where the specific number or the
  strategy choice decides correctness.
