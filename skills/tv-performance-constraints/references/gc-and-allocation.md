# GC Pressure & Allocation Discipline

At 60 fps a frame is 16.7 ms; at 30 fps, 33 ms. On a TV SoC's slow CPU
cores, a minor garbage-collection pause of a few milliseconds — invisible
on a desktop — eats a meaningful slice of that budget, and a major
collection can freeze the app for tens to hundreds of milliseconds.
The user sees it as a scroll hitch or an animation stutter that happens
"randomly," because GC timing isn't correlated with any one line of
code. The fix is not tuning the collector (you can't); it's allocating
less, and allocating at the right times.

## What counts as per-frame code

Any code path that runs repeatedly while the UI is in motion:

- animation progress/tick callbacks and transition steps
- `requestAnimationFrame` loops
- scroll/position update handlers
- **key-repeat handlers** — a held d-pad key fires many times per
  second, so navigation handlers are per-frame code in practice
- media `timeupdate` / progress callbacks (fire several times a second
  for the entire playback session)
- anything called from the framework's render/update hook

The discipline: these paths run with **zero new allocations** in the
steady state. Setup allocates; the loop reuses.

## Where allocations hide in idiomatic JS

Each of these is fine in cold code and a problem per-frame:

| Idiom | Allocates |
|---|---|
| `{x, y}` / `[a, b]` literals returned or passed per call | one object per call |
| `.map()` / `.filter()` / `.slice()` / spread | a new array (plus a closure) |
| inline arrow passed as a callback each tick | a new closure per tick |
| `.bind(this)` at call site | a new function per call |
| string building for labels/keys (`` `${x},${y}` ``) | a new string per call |
| `Object.assign({}, …)` / destructure-with-rest | new objects |
| promise chains per tick | promise + closure per tick |
| patch/setState-style calls with a fresh config object per frame | object tree per frame |

## Patterns that remove the churn

**Hoist and reuse scratch objects.** The per-frame version writes into
preallocated storage:

```js
// cold path: allocate once
const scratch = { x: 0, y: 0 };

// hot path: reuse
function updatePosition(t) {
  scratch.x = startX + dx * t;
  scratch.y = startY + dy * t;
  applyPosition(scratch);        // callee must not retain it
}
```

The contract that makes this safe: the callee reads the scratch object
synchronously and never stores a reference to it. Note that in
frameworks whose animation API takes a declarative description
(from/to values declared once, engine interpolates), the engine already
does this for you — prefer declarative animations over hand-rolled
per-frame property math wherever possible.

**Bind callbacks once.** Member handlers are bound in the constructor or
init, not at each subscription or each render.

**Precompute per-item derived data.** Formatted durations, label
strings, layout positions — compute when the data arrives, not in the
code that runs per focus change or per frame.

**Object pooling — for genuinely high-churn objects only.**

```js
const pool = [];
function acquireParticle() { return pool.pop() ?? { x: 0, y: 0, vx: 0, vy: 0 }; }
function releaseParticle(p) { p.x = p.y = p.vx = p.vy = 0; pool.push(p); }
```

Pool things created and discarded many times per second (particles,
per-item animation state in a large grid, reusable row views — see
`virtualization.md` for view recycling, which is pooling applied to
list items). Don't pool everything: a pool is a leak with extra steps
if its objects retain references to big structures after release, and
pooled code is harder to read. Reset on release; cap the pool size.

## Allocate at the right time

GC pressure is about *when* as much as *how much*. Loading a screen,
parsing an API response, building item view-models — all of that may
allocate freely, because a GC pause during a loading spinner is
invisible. The rule is **steady-state silence**: once the screen is
interactive, holding a d-pad key to scroll a rail end-to-end should
cause no allocation-driven pauses. If a heap profile during that
gesture shows a sawtooth (rapid growth, cliff, repeat), per-frame code
is allocating.

## Long-session leaks

TV apps run for hours and are rarely restarted; slow leaks that no
desktop session would surface will crash a TV app at hour two:

- **Listeners and timers** registered on screen enter must be removed on
  screen exit — tie them to the component lifecycle, and audit every
  `setInterval` for a matching clear.
- **Unbounded caches** (image maps, response caches, "remember scroll
  position" maps keyed by content id) need an LRU cap.
- **Closures retaining screens.** A callback registered globally that
  captures a screen object keeps the entire subtree — views, textures,
  data — alive after navigation.

Expected shape of a healthy session: memory climbs while a screen
loads, plateaus while browsing, and returns to roughly the same
baseline after leaving. A staircase that never comes down is a leak.

## Measuring

Profile the JS heap over a scripted browse session (Chrome DevTools
remote-debugging the device where the platform allows it, or the
platform's own profiler). Two views matter: the allocation timeline
during a hold-to-scroll gesture (should be near-flat), and heap
snapshots before/after entering-and-leaving a screen (diff should be
near-zero). Numbers from a desktop browser establish the *shape*;
only on-device runs establish whether it's *fast enough*.

## Framework pointers

Lightning v2: prefer declarative `animation()`/transitions over manual
tick math, batch property writes with `patch()` (one recalc instead of
many), and avoid Flexbox on containers that resize per frame — see
`lightningjs-v2-conventions/references/textures-and-performance.md`.
DOM-based apps: the same discipline applies to style writes — batch
them, and animate `transform`/`opacity` rather than layout properties.
