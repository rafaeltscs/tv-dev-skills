SKILLS_CONSULTED: tv-platform-quirks

Why: The question is about LG webOS packaging — specifically the `appinfo.json` manifest and one of its fields — which is exactly the "engine baseline, lifecycle, remote input, video/DRM, packaging, or store submission" scope of `tv-platform-quirks`; none of the other four skills (Lightning v2/v3, focus/navigation, performance) touch platform manifests.

Files read: `skills/tv-platform-quirks/SKILL.md`, `references/webos-packaging-and-certification.md`, `references/webos-lifecycle.md`.

---

## Answer

### What goes in `requiredMemory`

- A single integer: your app's **expected peak RAM footprint in megabytes**. It's an optional field in `appinfo.json` at the app root, alongside `id`, `title`, `main`, `version`, etc.
- Set it to an honest estimate of steady-state peak — measured on real hardware, after a long browse → background → resume cycle, not a number pulled from a dev-machine profile. webOS TVs are ~1–1.5 GB devices sharing RAM with the OS and the video decoder, so the realistic budget for an app is well under that.
- Don't pad it "to be safe." An inflated value makes the launcher evict other apps unnecessarily (worse for the overall system and for how your app is perceived); a value lower than your real usage doesn't protect you either (see below).

### Does it reserve anything? No — it's advisory.

- `requiredMemory` is **not a grant or a reservation**. The launcher uses it as a hint at launch time: it decides whether it needs to free/suspend other apps to make room for yours before starting it.
- Once you're running, the number does nothing for you. If your actual footprint exceeds what the system can spare, the webOS **OOM killer still terminates your app** — and suspended/backgrounded apps are the first targets. Exceeding your declared `requiredMemory` doesn't grant extra headroom; it just means your estimate was wrong.
- So the real memory discipline lives in your code, not the manifest: on `visibilitychange → hidden`, synchronously tear down the video pipeline (`pause()`, clear `src`/detach MediaSource, `load()`), unload the DRM client, stop all timers/RAF/observers, drop large rebuildable textures (full-screen backdrops, off-screen rail bitmaps), and persist resume state to `localStorage`. Memory should **plateau** across repeated background/resume cycles; if it climbs each resume, your release path is leaking and no `requiredMemory` value will save you.

### Practical guidance for shipping to LG

- Include `requiredMemory` with a truthful measured value. LG's certification "function test" runs across multiple webOS versions and screen sizes, and two of the recurring rejection causes are directly memory-related: "crash or black screen on resume from Suspended" and "playback failures on the second session" (leaked DRM client / decoder). Those are failures of your release path, and the manifest field won't paper over them.
- Test memory pressure on real devices on your oldest supported webOS model — the Simulator and Emulator explicitly do **not** validate memory pressure, decoder limits, or DRM. That oldest model is also the one review will fail you on.
- While you're in `appinfo.json`: pair this with `splashBackground` (1920×1080 PNG) for a responsive first paint, and make sure `version` (X.Y.Z, all three parts) is bumped for the submission while `id` stays identical to the published app.
