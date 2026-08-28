---
name: tv-performance-constraints
description: Framework-agnostic performance rules for TV/OTT apps running on low-end television hardware — texture/GPU memory budgets, garbage-collection pressure, image sizing/decode/caching, and lazy loading/virtualization of large content lists. Use whenever code that will run on a smart TV or set-top box touches images, poster rails/grids, animations, long-running sessions, or memory — even if the user never says "performance": "build a poster grid," "the app stutters when scrolling," "it crashes after browsing for a while," "images take forever to appear," "add a hero banner with backdrop art," "janky animation on the TV but fine on my laptop." Also use for questions about memory budgets, out-of-memory crashes, GC pauses, image CDN sizing for TV, texture memory, object pooling, or list virtualization. Does NOT cover framework-specific APIs (see `lightningjs-v2-conventions` for Lightning's texture/patch mechanics), focus/navigation UX (`tv-focus-and-navigation`), or per-platform lifecycle/key codes/DRM (`tv-platform-quirks`).
---

# TV Performance Constraints

Most model training data — and most developer intuition — assumes desktop
or mobile hardware. A smart TV is a different machine: a budget SoC with
slow CPU cores, a small GPU, and often only **1 GB of RAM shared with the
OS and the video decoder**. On Android TV's low-RAM device class, the
entire app is expected to stay under ~200 MB, with **30–40 MB total for
GPU textures**. Many 4K panels run the app UI at 1080p or even 720p.
Watchdogs kill apps that grow too big; there is no swap to save you.

The failure mode this skill exists to prevent: code that is *correct* and
*fast on the dev machine* but assumes desktop-class headroom — full-res
images dropped into thumbnail slots, a new object allocated every
animation frame, a 500-item catalog fully instantiated at mount. None of
that shows up in review as a bug. All of it shows up on a 2019 TV chipset
as jank, disappearing images, or a crash twenty minutes into a browsing
session.

The goal is that generated code respects these limits **by default**, not
after a separate performance-review pass.

## How to use this skill

Read the reference file(s) that match the task before writing code:

| Task involves... | Read |
|---|---|
| Texture/GPU memory: the bytes-per-pixel math, budgets per device class, eviction/cleanup behavior, texture reuse, symptoms of pressure | `references/texture-memory.md` |
| GC pauses and jank: what counts as per-frame code, allocation sources hiding in idiomatic JS, scratch objects, object pooling, long-session leaks | `references/gc-and-allocation.md` |
| Images: requesting CDN-sized renditions, decode cost, formats, cache layers, prefetch policy, placeholders and failure states | `references/image-loading.md` |
| Large lists: windowing rails/grids, recycling item views, releasing off-screen resources, pagination, startup rendering order | `references/virtualization.md` |

Each file is self-contained with framework-neutral pseudo-code.

## Non-negotiable conventions for generated code

1. **A budget exists even when nobody stated one.** Unless told the
   hardware floor, assume the low-RAM device class: ~1 GB RAM, tens of MB
   for all textures, UI possibly at 720p. Design for that and better
   hardware simply runs smoother — the reverse direction doesn't work.
2. **Never decode more pixels than the slot shows.** A 4000×6000 poster
   scaled into a 300×450 card still pays full decode CPU and full texture
   memory. Request appropriately sized renditions from the image
   service/CDN; treat a raw full-res `src` in a thumbnail as a bug.
3. **No allocations in per-frame code.** Anything that runs per animation
   tick, per scroll step, or per key-repeat must not construct objects,
   arrays, or closures. Hoist and reuse; pool what genuinely churns.
4. **Virtualize any collection larger than about two screens.** Realize
   items near the viewport, release items far from it. A full catalog
   exists as *data*; only a window of it exists as *views and textures*.
5. **What leaves the screen releases its resources.** Off-screen
   textures, decoded images, timers, and listeners are freed or
   suspended via the component/screen lifecycle — memory use should
   plateau during a long browsing session, not climb.
6. **Placeholders are cheap.** Use a solid color (or one shared tiny
   texture) while an image loads and when it fails — never a second
   image request per slot, and never a hole in the layout.
7. **Animate cheap properties.** Transforms and opacity, not properties
   that force per-frame layout (Flexbox recalculation in canvas
   renderers, top/left reflow in DOM-based apps).
8. **Verify on the floor, not the ceiling.** A measurement from a dev
   machine or emulator proves nothing about the target device. When
   real-device profiling isn't possible, say so and state which device
   class the code was written for.

## Relationship to the other skills

`lightningjs-v2-conventions/references/textures-and-performance.md`
covers the Lightning-v2 mechanics that implement these rules
(`memoryPressure`, texture shorthands, `patch()` batching, Flexbox
cost). This skill deliberately does not repeat those APIs: load the
framework skill for the concrete calls and this one for the budgets and
patterns the result must respect. Virtualization interacts with focus
handling (pagination at rail edges, focus during window moves) — the
UX side of that lives in `tv-focus-and-navigation`.

## What this skill does not cover

- Framework APIs and component lifecycle — see the framework skill
  (`lightningjs-v2-conventions`, `lightningjs-v3-conventions`).
- Per-platform capabilities (image format support, codec/DRM limits,
  lifecycle/visibility events, certification requirements) — see
  `tv-platform-quirks`.
- Video playback performance itself (buffer sizing, ABR ladders,
  decoder selection) — only its side effect matters here: the decoder's
  memory comes out of the same pot as the UI's.
- Network-layer optimization (HTTP/2, compression, API design) beyond
  what image loading requires.
