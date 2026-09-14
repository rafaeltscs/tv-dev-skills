# Layout & Text

## No Flexbox — use `<Layout>`

Unlike Lightning Core v2 (which ships a CSS-Flexbox-like `flex`/`flexItem`
system), Blits has **no Flexbox at all**. The reasoning is performance:
relative/recursive layout recalculation is comparatively expensive, and TV
apps mostly render into a fixed viewport where absolute `x`/`y` is cheaper.
Don't reach for v2 Flexbox mental models (`flex: { direction, wrap }`,
`flexItem: { margin }`) here — they have no equivalent.

Instead, Blits ships a built-in `<Layout>` component that auto-positions
its children without the cost of a full Flexbox implementation:

```xml
<Layout direction="horizontal" gap="10" align-items="center" padding="{x: 20}">
  <Element w="40" h="40" color="red" />
  <Element w="80" h="40" color="blue" />
  <Text>Hello world</Text>
</Layout>
```

Attributes:

| Attribute | Values | Notes |
|---|---|---|
| `direction` | `horizontal` (default) \| `vertical` | Flow axis |
| `gap` | pixel number | Spacing between children |
| `align-items` | `start` (default) \| `center` \| `end` | Cross-axis alignment |
| `padding` | number, or `{top, bottom, left, right, x, y}` | Internal spacing |

Children generally need explicit `w`/`h` for `<Layout>` to position them
correctly. `<Text>` is the one built-in exception — its dimensions
populate once the text is actually loaded/measured (see `@loaded` below).
For a component whose own size is dynamic and not known up front, expose
it via the `$size()` utility method rather than hardcoding a guess.

For anything performance-sensitive that changes every frame (not a
mostly-static menu/rail layout), prefer plain absolute `x`/`y` over
`<Layout>` — same tradeoff v2's Flexbox docs call out, just with a
different API on this side.

## `<Text>`

Built-in, no import needed:

```xml
<Text
  content="Hello world"
  font="ComicSans"
  size="$fontSize"
  :color="$changingColor"
/>
```

| Attribute | Default | Notes |
|---|---|---|
| `content` | — | The string to render; hardcoded/dynamic/reactive like any attribute |
| `font` | `sans-serif` or the launch default | Must match a font registered at launch (below) |
| `size` | `32` | Font size in px |
| `color` | `white` | HTML name, hex, or `rgb(a)` |
| `letterspacing` | `0` | Pixels between characters |
| `align` | `left` | `left` \| `right` \| `center` — centering needs `maxwidth` set |
| `maxwidth` | — | Enables word wrap at this pixel width |
| `maxlines` | — | Caps rendered line count |
| `maxheight` | — | Caps rendered block height |
| `lineheight` | — | Pixel spacing between lines |

## The `@loaded` event

`<Element>` (for textures) and `<Text>` support an `@loaded` template
attribute that fires once the resource is actually ready, handing the
resolved dimensions to a method — useful for positioning something
relative to content whose size isn't known until it renders (e.g. an
underline under a headline of variable length):

```xml
<Text content="$headline" @loaded="$textLoaded" />
```

```js
methods: {
  textLoaded(dimensions) {
    this.underlineWidth = dimensions.w
    this.underlineY = dimensions.h + 8
  },
}
```

Reference a method in a template event-binding attribute (`@loaded`,
`@error`) with the same `$` prefix used for state/props/computed — Blits
resolves it against the component's `methods`.

## Custom fonts

Registered once at launch, then referenced by name from any `<Text>`:

```js
// src/index.js
Blits.Launch(App, 'app', {
  fonts: [
    {
      family: 'ComicSans',
      type: 'msdf',
      file: 'fonts/Comic-Sans.ttf',
    },
  ],
})
```

```xml
<Text font="ComicSans" content="Styled text" />
```
