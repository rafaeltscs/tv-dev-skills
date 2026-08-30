SKILLS_CONSULTED: tv-performance-constraints

Why: The symptom set — OOM kill on a low-RAM Fire TV stick after ~20 minutes of rail browsing while the desktop JS heap profiler stays flat — is the textbook signature of GPU/texture memory growth plus missing release-on-leave, which is exactly what this skill's texture-memory, virtualization, and gc-and-allocation references cover; the desktop-vs-device discrepancy is itself one of the failure modes the skill exists to catch.

---

## Short answer

Your JS heap being flat is the tell, not a reassurance. On a Fire TV stick the resource that runs out first is **GPU texture memory**, and a desktop JS heap profiler does not show it at all. The usual culprit for "crashes ~20 minutes into browsing" is **textures (decoded images + rendered text) accumulating because off-screen rails and visited screens never release their resources** — the working set climbs a staircase instead of plateauing until the platform watchdog OOM-kills the app. A slower-burning secondary cause is a **long-session JS leak** (listeners/timers/closures/unbounded caches) that a 5-minute desktop session never surfaces.

## Why the desktop profiler misleads you

- A Fire TV stick is a ~1 GB-RAM-class device sharing memory with the OS and the video decoder. Guidance for that device class is roughly **30–40 MB total for all GPU textures** for the whole app. Your dev machine has gigabytes of VRAM and simply absorbs the same leak.
- Texture cost is set by pixel dimensions, not file size: a 90 KB JPEG of a 1920x1080 backdrop is an **~8.3 MB** texture. A typical 300x450 poster card is ~540 KB; one rail of 8 is ~4.3 MB; a browse screen with a backdrop and 4 realized rails is ~25 MB — already at the edge of the budget for one screen.
- Canvas/WebGL renderers (Lightning et al.) also spend texture memory on **every distinct rendered text string** (title + metadata lines per card) and on **effect buffers** (blur, drop shadow, rounded-corner masks, render-to-texture). None of that appears in a JS heap snapshot.
- So the profiler view you want is not the JS heap. You want: memory growth over a scripted browse session measured **on the device** (Fire TV's own tooling / `adb shell dumpsys meminfo <pkg>` for total PSS, or remote-debug the graphics memory), watching whether total app memory plateaus or staircases while you d-pad up and down through rails.

## The specific mechanism behind "20 minutes then dead"

1. User scrolls rails up/down. Each newly seen rail realizes item views and decodes images into textures.
2. Rails that scroll off-screen — and detail/backdrop screens that get visited — **do not release** their views, decoded images, and textures.
3. Renderer eviction (e.g. Lightning v2 `memoryPressure`) is least-recently-used and **only frees textures nothing on-screen references**. It is a backstop for navigation history, not a fix for an ever-growing retained set. If your default threshold is the stock value (~96 MB-equivalent), it is set far above what the stick tolerates and fires too late anyway.
4. Retained texture bytes cross the platform limit. No JS exception — the OS just kills the process. Hence "no error, just gone, after N minutes."

If instead of a hard crash you see **images blanking and reloading every time you scroll back**, that is the same budget problem one notch less severe: eviction thrash, working set hovering right at the threshold.

## What to check / fix, in priority order

1. **Release resources on leave.** Off-screen rails must drop their item views, decoded images, and textures; keep only rail metadata + remembered focus index. Detail-screen backdrops (~8 MB each) must be freed on exit, not left to accumulate one per visited title. Target shape: memory climbs while a screen loads, **plateaus** while browsing, returns near baseline after leaving. A staircase that never comes down is the bug.
2. **Virtualize both axes.** Realize only visible rails ± 1 (images loaded), ± 2–3 (views only, images deferred), data-only beyond. Same horizontally within each rail: ~10 recycled card views for a rail showing 7, rebound (swap `src`/text on the existing element, clear to placeholder first) as the window moves — never create/destroy per d-pad step.
3. **Request CDN-sized renditions, never masters.** A 300x450 slot should fetch a ~300px-wide image, not the 4000px master (that is ~40x the pixels for both decode CPU and texture bytes). Size for the UI plane resolution (many TVs run the app at 720p/1080p even on a 4K panel), and quantize to 3–5 canonical widths app-wide so CDN caching and renderer texture-dedup actually work.
4. **Do the texture budget arithmetic for one browse screen:** sum of (slot w x h x 4) x visible count + backdrop + text. If it exceeds ~60–70% of ~35 MB, cut before shipping — smaller renditions, fewer realized rows, shared/tinted textures for masks and focus rings — rather than leaning on eviction.
5. **Lower the renderer's memory-pressure / eviction threshold** to match the real device (tens of MB, not the stock default), so cleanup of navigation-history textures actually runs on the stick.
6. **Normalize image URLs.** Ten cards with slightly different query params on the same image = ten textures. One canonical URL = one texture. Use one shared solid-color placeholder texture app-wide; never a second image request per slot for placeholder/failure.
7. **Audit the long-session JS leak in parallel** (this is the flat-heap-today, crash-at-hour-two path): every `setInterval`/listener registered on screen-enter has a matching clear on screen-exit; image/response/scroll-position caches have an LRU cap; no globally registered callback captures a screen object and keeps its whole subtree alive after navigation. Verify with heap snapshots **diffed before/after entering-and-leaving a screen** — the diff should be near zero.
8. **Bound decode concurrency.** Kicking off ~40 decodes at screen-mount saturates the slow CPU during the entry animation. Load the visible window first, then trickle the rest; keep the image worker thread on.

## How to confirm it is textures and not JS

- On-device total memory (PSS) staircases upward across a scripted up/down browse loop while your desktop JS heap stays flat → texture retention / missing release-on-leave. This is the likely case.
- On-device JS heap itself staircases over a long session, snapshot diff after enter/leave a screen is clearly positive → JS leak (listeners/timers/closures/caches).
- Images visibly blank and reload on every scroll-back, app survives → eviction thrash; working set too close to threshold, shrink it via smaller renditions / fewer realized rows.

Note: none of the above can be validated on the dev machine or an emulator — the numbers that matter come from the Fire TV stick itself.
