# Transitions & Animations

## Mental model

There's no separate "animation API" call to make (contrast Lightning Core
v2's `this.animation({...}).start()`). Instead, you add a `.transition`
modifier directly to a reactive attribute, and Blits animates it whenever
the underlying value changes:

```xml
<Element :x.transition="$x" :y.transition="$y" />
```

The default is `ease` easing over `300ms`. Because this rides on the same
reactive-attribute mechanism as everything else, the trigger is always
"the referenced state/prop/computed value changed" — there's no imperative
"play this animation now" call outside of that.

## Customizing duration, easing, delay

Pass an object instead of a bare value reference:

```xml
<Element :x.transition="{value: $x, duration: 300, easing: 'ease-in-back', delay: 400}" />
```

| Key | Required | Notes |
|---|---|---|
| `value` | yes | The state/prop/computed reference driving the transition |
| `duration` | no | Milliseconds |
| `easing` | no | See below |
| `delay` | no | Milliseconds before the transition starts |

Every key except `value` can itself be a dynamic reference
(`duration: $dynamicDuration`) rather than a literal.

Easing options include `ease`, `ease-in`, `ease-out`, `ease-in-out`, and
`sine`/`cubic`/`circ`/`back` variants of each, plus a raw
`cubic-bezier(x1, y1, x2, y2)` string for a fully custom curve.

## Transition lifecycle hooks

Three optional callbacks observe a transition's progress, wired up as
`$`-prefixed method references inside the same transition object:

```xml
<Element color="gold" w="100" h="100"
  :x.transition="{value: $x, start: $transitionBegin, end: $transitionEnd, progress: $transitionProgress}"
/>
```

```js
methods: {
  transitionBegin() {
    // fires once the transition begins (after any `delay`)
  },
  transitionEnd() {
    // fires on completion
  },
  transitionProgress(element, prop, progress, previousProgress) {
    // fires every frame; progress/previousProgress are 0–1
  },
}
```

Use `progress` sparingly — it runs on every frame of the transition, so
put only cheap work in it.

## Contrast with v2

Lightning Core v2 has two separate mechanisms — `smooth` (property-level,
via `patch()`) and a full `animation()` builder for multi-step timelines.
Blits collapses this to the single reactive-attribute `.transition`
modifier; there's no equivalent yet to v2's multi-keyframe `animation()`
timeline API documented here. If a task needs a genuinely multi-step
sequenced animation, verify current Blits capability before assuming it
exists — don't reach for v2 `animation()` syntax, it has no meaning here.
