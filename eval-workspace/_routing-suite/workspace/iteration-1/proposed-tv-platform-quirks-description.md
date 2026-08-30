# Proposed shorter `description:` for tv-platform-quirks

## Why

The current description is ~400 words in a single sentence — 4–5× the
length of the other four skills' descriptions. Skill frontmatter
descriptions are always in context, so this one is a standing cost. The
routing suite (10/10, 0 mis-triggers) shows the *current* text works, so
this is a cost/robustness change, not a correctness fix. The exhaustive
per-platform API/tooling list it carries (`appinfo.json`/`.ipk`/`ares-cli`/
LG Seller Lounge; `config.xml`/`.wgt`/Tizen Studio; …) is already in the
SKILL.md body and the per-platform reference tables — the description
doesn't need it to trigger.

## Proposed text (~200 words)

> Platform-specific quirks for shipping a web-based TV app across six
> platform families — LG webOS, Samsung Tizen, VIZIO SmartCast, Amazon
> Fire TV (Fire OS web-app path), Comcast/RDK (Firebolt on WPE WebKit),
> and Android TV / Google TV (web app in a WebView inside a native shell
> you ship). Covers, per platform: the browser-engine baseline
> (Chromium-per-release for webOS/Tizen; WebKit not Chromium on RDK); app
> lifecycle and suspend/resume events; remote key codes and the
> pointer-vs-D-pad split (Back = 461 webOS / 10009 Tizen / native
> onBackPressed on Android TV / verify elsewhere; Tizen requires
> tizen.tvinputdevice key registration); the Back/exit contract; adaptive
> streaming + DRM (native players vs bring-your-own MSE + Widevine); and
> packaging + store review. Use whenever code targets an LG, Samsung,
> VIZIO, Fire TV, Comcast/RDK/operator box, or Android TV / Google TV and
> touches engine baseline, lifecycle, remote input, video/DRM, packaging,
> or store submission — e.g. "why does this work on my TV but not the
> 2019 LG", "handle the back button on Tizen", "our Samsung build crashes
> coming back from live TV", "set up the VIZIO companion library", "wire
> up the Firebolt lifecycle for our RDK app", "wrap our web app in a
> WebView for Android TV". Does NOT cover Fire TV Vega OS native apps
> (React Native / Vega Developer Tools), Android TV / Google TV native
> apps (Jetpack Compose for TV / Leanback), or non-web TV platforms (Roku
> BrightScript) — say so rather than guessing from the covered platforms.

## Kept vs dropped

- **Kept:** all six platform families; "web-based TV app"; the six topic
  buckets (engine / lifecycle / remote / Back / streaming+DRM /
  packaging); Back key codes 461 / 10009; Tizen key registration; all six
  representative trigger phrases; all three exclusions.
- **Dropped (now body-only):** per-platform manifest/package filenames,
  CLI names, store portal names, DRM plumbing call names, the
  Chromium-version numbers per OS release, the Vega OS split detail.

## If applied

Bump `version` in `.claude-plugin/plugin.json` (per `AGENTS.md`), then
re-run the routing suite to confirm the three platform prompts (#4, #6,
#10) still route to `tv-platform-quirks` and #8 still routes to NONE.
