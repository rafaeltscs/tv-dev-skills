SKILLS_CONSULTED: NONE

Why: All five skills are scoped to WebGL/native TV/OTT apps driven by a 5-way remote (LightningJS components, D-pad focus resolution, TV GPU/memory budgets, per-platform TV quirks); this is a standard DOM/CSS `:focus-visible` question on a marketing website's `<nav>`, which those skills explicitly exclude (`tv-focus-and-navigation` even notes that web focus/tab-order concepts are "absent or actively misleading" in its domain).

---

# Accessible branded `:focus-visible` ring for the top nav

## The short version

`:focus-visible` already does the "don't show on mouse click" part for you. Every current browser applies it only when the browser's heuristic says a focus indicator is warranted — keyboard `Tab`, `Shift+Tab`, arrow keys, programmatic focus on load, etc. A plain mouse click on a link or button does **not** match `:focus-visible` (a click that lands in a text field is the main exception, which won't occur in a nav). So you do not need any JS to suppress the ring on click.

Your job is three things:

1. Draw the ring only on `:focus-visible`.
2. Suppress the legacy `:focus` ring for browsers that predate `:focus-visible` (optional now, see support note).
3. Make the ring meet contrast requirements against whatever it sits on.

## Baseline CSS

```css
:root {
  /* Pick/confirm this against your nav background - see contrast note below */
  --focus-ring: #1a56db;          /* your brand focus color */
  --focus-ring-contrast: #ffffff; /* a color that contrasts the ring on any bg */
}

/* 1. The ring itself - keyboard / non-pointer focus only */
.site-nav a:focus-visible,
.site-nav button:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 3px;
  border-radius: 4px; /* so the ring hugs rounded links; match your link radius */
}

/* 2. Legacy fallback: kill the default ring ONLY where :focus-visible is
      supported and did NOT match (i.e. mouse/touch). Browsers without
      :focus-visible ignore this whole rule and keep their default ring,
      so keyboard users are never left with nothing. */
.site-nav a:focus:not(:focus-visible),
.site-nav button:focus:not(:focus-visible) {
  outline: none;
}
```

That is the whole solution for a modern marketing site. Do **not** put a blanket `*:focus { outline: none }` anywhere - that is the one thing that actually breaks keyboard accessibility.

## Making it contrast-safe on any background

WCAG 2.2 requires the focus indicator to have at least **3:1 contrast against the adjacent colors** (SC 1.4.11 Non-text Contrast; SC 2.4.13 Focus Appearance goes further). A single brand-colored ring fails this if the nav background is close to the brand color, or if links sit on both a light bar and a dark/transparent-over-hero bar.

Robust pattern - a two-tone ring using `outline` plus a `box-shadow` spacer, so one of the two colors always contrasts:

```css
.site-nav a:focus-visible,
.site-nav button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  /* white gap between text and the brand ring; flip the two colors if your
     nav is predominantly light */
  box-shadow: 0 0 0 2px var(--focus-ring-contrast);
  border-radius: 4px;
}
```

If your nav has exactly one known background, skip the two-tone approach and just verify your `--focus-ring` value hits 3:1 against that background with a contrast checker. Blues around `#1a56db`/`#2563eb` clear 3:1 on white easily; a very light or very saturated brand accent often does not.

## Forced-colors / Windows High Contrast Mode

`outline` is honored in forced-colors mode and `box-shadow` is dropped, so the `outline`-based ring survives automatically. If you want to be explicit:

```css
@media (forced-colors: active) {
  .site-nav a:focus-visible,
  .site-nav button:focus-visible {
    outline-color: Highlight; /* system accent; keeps offset/width */
  }
}
```

## Why `outline` and not `border` or `box-shadow` alone

- `outline` does not participate in layout, so the ring never shifts nav items when it appears.
- `outline-offset` gives you the gap between the text and the ring without extra padding.
- Modern `outline` follows `border-radius`, so rounded links get a rounded ring.
- `box-shadow` rings are invisible in forced-colors mode; use it only as the secondary color, backed by an `outline`.

## Browser support

`:focus-visible` (and the `:focus:not(:focus-visible)` pattern) is supported in all browsers released since early 2022 (Chrome/Edge 86+, Firefox 85+, Safari 15.4+). For a public marketing site this is effectively universal. Only if analytics show meaningful Safari <=15.3 or legacy traffic do you need the `focus-visible` JS polyfill (which toggles a `.focus-visible` class you'd mirror in the selectors). Most teams no longer ship it.

## Quick test checklist

- `Tab` through the nav: branded ring appears on each link/button.
- Click a nav link with the mouse: no ring.
- Click a link, then `Tab`: ring returns.
- Check the ring against every background the nav renders on (solid bar, over-hero, sticky/scrolled state) for 3:1 contrast.
- Toggle Windows High Contrast / `forced-colors`: ring still visible.
- Confirm no global `outline: none` is overriding this deeper in the cascade.
