# Routing suite scorecard — tv-dev-skills plugin

Each prompt names no skill. A subagent saw all 5 frontmatter descriptions, chose which skill(s) to consult, then answered. "Correct" = chose every expected skill, no must-not skill, extras only from the acceptable list.

| # | scenario | expected | routed to | verdict |
|---|---|---|---|---|
| 1 | rail-focus-no-framework-named | tv-focus-and-navigation | tv-focus-and-navigation | PASS |
| 2 | typescript-template-spec-lightning | lightningjs-v2-conventions | lightningjs-v2-conventions | PASS |
| 3 | scroll-jank-tv-only | tv-performance-constraints | tv-performance-constraints | PASS |
| 4 | crash-returning-from-live-tv-samsung | tv-platform-quirks | tv-platform-quirks | PASS |
| 5 | hero-banner-4k-art-lightning | lightningjs-v2-conventions, tv-performance-constraints | tv-performance-constraints, lightningjs-v2-conventions | PASS |
| 6 | back-button-webos-tizen | tv-platform-quirks | tv-platform-quirks, tv-focus-and-navigation | PASS |
| 7 | blits-typescript-placeholder-guard | NONE | lightningjs-v3-conventions(placeholder-recognized) | PASS |
| 8 | react-native-mobile-adjacent-miss | NONE | NONE | PASS |
| 9 | grid-diagonal-navigation | tv-focus-and-navigation | tv-focus-and-navigation | PASS |
| 10 | adaptive-streaming-firetv-vizio | tv-platform-quirks | tv-platform-quirks | PASS |

**10/10 correct.**

Notes:
- #7 (Blits/v3 TS): the v3 skill is a placeholder; the run correctly refused to apply lightningjs-v2-conventions to Blits and answered from general knowledge with an explicit "not covered" caveat — the intended behaviour.
- #8 (React Native mobile): correctly routed to NONE despite "navigation"/"focus"/"rows"/"settings" keyword overlap with tv-focus-and-navigation.
- #5 and #6 pulled two skills each, matching the expected primary + acceptable-also set.
---

## Iteration 2 — re-check after shortening the `tv-platform-quirks` description (plugin 1.9.1)

Re-ran the four routing-sensitive prompts against the new ~265-word description:

| # | scenario | expected | routed to (iter 2) | verdict |
|---|---|---|---|---|
| 4 | crash-returning-from-live-tv-samsung | tv-platform-quirks | tv-platform-quirks | PASS |
| 6 | back-button-webos-tizen | tv-platform-quirks | tv-platform-quirks, tv-focus-and-navigation | PASS |
| 8 | react-native-mobile-adjacent-miss | NONE | NONE | PASS |
| 10 | adaptive-streaming-firetv-vizio | tv-platform-quirks | tv-platform-quirks | PASS |

4/4 — the shorter description preserves routing (positives still hit the skill; the RN-mobile near-miss still routes to NONE).

---

## Triggering matrix (supplements the routing suite)

8 more prompts, none naming a skill: 4 oblique should-trigger, 4 near-miss should-not. Same harness (see all 5 descriptions, choose, answer).

| id | intent | expected | routed to | verdict |
|---|---|---|---|---|
| T1 | Lightning _getFocused/_handleEnter, no framework word | lightningjs-v2-conventions | lightningjs-v2-conventions, tv-focus-and-navigation | PASS |
| T2 | Fire TV OOM after 20min browsing, flat desktop heap | tv-performance-constraints | tv-performance-constraints | PASS |
| T3 | appinfo.json requiredMemory semantics | tv-platform-quirks | tv-platform-quirks | PASS |
| T4 | restore focus after modal close on a TV UI | tv-focus-and-navigation | tv-focus-and-navigation | PASS |
| N1 | Electron desktop React poster-wall virtualization | NONE | NONE | PASS |
| N2 | desktop SPA browser-Back losing form state | NONE | NONE | PASS |
| N3 | marketing site :focus-visible ring styling | NONE | NONE | PASS |
| N4 | Roku SceneGraph setFocus / BrightScript | NONE | NONE | PASS |

**8/8.** Combined with the 10-prompt routing suite and the 4-prompt iteration-2 re-check: **22/22 prompts routed correctly** (right skill / right pair / correctly NONE).
