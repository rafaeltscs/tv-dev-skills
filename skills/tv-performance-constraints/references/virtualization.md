# Lazy Loading & Virtualization

A catalog screen's data set (hundreds of rails × dozens of items) is two
orders of magnitude bigger than what fits on screen (~5 visible rails ×
~7 visible cards). On desktop you can often get away with realizing all
of it; on a TV you cannot — the texture math alone (see
`texture-memory.md`) forbids it, and instantiating hundreds of views at
mount blows the app-launch budget on a slow CPU. The structural answer
is always the same:

> **The full collection exists as data. Only a window of it exists as
> views and textures.**

## The windowing model

Per scrollable collection, maintain three ranges:

- **Visible**: what's on screen.
- **Realized**: visible plus a margin (typically one viewport, biased
  toward the direction of travel) — these items have views, and their
  images are loading or loaded.
- **Everything else**: data only. No views, no textures, no requests.

As the window moves, items entering the realized range get views and
start image loads; items leaving it release textures and views but
**keep their data and their remembered state** (selected index, scroll
offset) so returning is instant and focus restore works.

TV makes this easier than pointer platforms: scrolling is focus-driven
and discrete — the window moves one step per key press, in a known
direction, with no flings and no scrollbar teleports (letter-jump /
"back to top" are the exceptions: treat them as a window teleport and
show placeholders while the new window realizes).

## Recycle, don't create/destroy

Two ways to implement the window:

- **Create/destroy** views at the window edges. Simple, but per-step
  view construction and destruction is exactly the per-frame allocation
  churn `gc-and-allocation.md` bans — on a slow CPU, a held d-pad key
  turns edge-of-window construction into a visible hitch.
- **Recycle a fixed pool** of item views — visible count plus margin,
  e.g. ~10 card views for a rail showing 7. A view leaving the window
  is rebound to the item entering on the other side: update image
  source, text, badges; reset transient state (previous image must
  never flash — clear to placeholder before rebinding, and drop any
  in-flight load bound to the old item).

Recycling is the default choice. It's the list-view pattern every UI
toolkit converges on, and it caps both view count and allocation rate
at a constant regardless of catalog size.

## Both axes

Virtualize vertically as well as horizontally: off-screen **rails**
release their items' views and textures too, keeping only rail metadata
and the remembered index. A common balanced policy for a browse screen:

| Rail position | State |
|---|---|
| Visible ± 1 | Fully realized, images loaded |
| ± 2–3 | Views exist, images released/deferred |
| Beyond | Data + remembered index only |

## Pagination (lazy data)

The window also drives *data* fetching for long collections:

- Fetch the next page when focus comes within N items of the loaded
  edge (N ≈ one viewport), so the user never waits at the boundary.
- While a page loads, keep focus stable on the last real item — never
  on a spinner or an empty slot that's about to be replaced. Rail-edge
  UX for this is in `tv-focus-and-navigation/references/ui-patterns.md`.
- Appending a page must not re-lay-out or re-bind already-realized
  items.
- Guard against re-entrant fetches (a held key reaches the trigger zone
  many times before the response arrives).

## Startup ordering

The same visible-first principle applies at t=0. App-launch budget on a
TV is dominated by CPU, so order work by what the user sees:

1. Render the shell and the first viewport's placeholders immediately.
2. Realize and load images for the first viewport.
3. Only then trickle in the margin, remaining rails' data, and any
   below-the-fold work — idle-time, not mount-time.

Everything not needed for the first paint is deferred: don't fetch the
full catalog, don't instantiate screens the user hasn't visited, don't
warm caches speculatively at launch.

## Failure modes checklist

When reviewing or generating a virtualized collection, check:

- Recycled slot shows the previous item's image briefly → clear to
  placeholder on rebind; cancel/guard in-flight loads.
- Focus lands on a not-yet-realized item after a jump → realize the
  focus target synchronously, placeholders for its neighbors.
- Memory climbs while scrolling one long grid end-to-end → leave-window
  release isn't actually freeing textures.
- Scroll hitches at a regular cadence → per-step view construction
  (switch to recycling) or decode burst (bound concurrency, see
  `image-loading.md`).
- Remembered state lost when a rail re-realizes → state must live with
  the data, not the view.

## Framework pointers

Lightning v2: implement rebinding by swapping `src`/text on existing
elements rather than re-creating children, and gate realization on
`_active()`/`_inactive()` visibility lifecycle — see
`lightningjs-v2-conventions/references/textures-and-performance.md` and
`components-and-templates.md`. DOM apps: the browser won't window for
you — `content-visibility` and `loading="lazy"` help at the margins,
but a rail/grid still needs an explicit realized-window component.
