# Routing

Blits ships a built-in router, configured on the `Application` root
alongside its `routes` array. Pages are plain Blits components — there's
no special "page" base class.

## Configuring routes

```js
import Blits from '@lightningjs/blits'
import Home from './pages/Home.js'
import Account from './pages/Account.js'

export default Blits.Application({
  template: `
    <Element>
      <RouterView x="300" y="200" w="1520" h="680" />
    </Element>
  `,
  routes: [
    { path: '/', component: Home },
    { path: '/details', component: () => import('./pages/Details.js') },
    { path: '/account', component: Account },
  ],
})
```

Each route entry supports:

| Key | Purpose |
|---|---|
| `path` | URL hash pattern, e.g. `/movies/:genre/:id` |
| `component` | A direct component reference, or `() => import(...)` for a lazy-loaded chunk |
| `hooks` | Code to run before navigating to/away from this route |
| `options` | Behavior flags, e.g. `keepAlive`, `inHistory` |
| `transition` | A page-transition effect for entering this route |
| `meta` | Arbitrary data attached to the route, readable in hooks |

`<RouterView>` is the placeholder the router renders the active page into.
It behaves like any other template child for positioning (`x`/`y`/`w`/`h`).
Give it a `name` attribute to run more than one independently-routed view
region, retrievable via `this.$router.get('viewName')`.

## Dynamic segments become props

```js
{ path: '/movies/:genre/:id', component: MovieDetails }
```

matches `#/movies/sci-fi/65281918`, and — if `MovieDetails` declares
`props: ['genre', 'id']` — those segments arrive as ordinary reactive
props, no separate "route params" API to learn. The same applies to query
parameters (`#/series/simpsons/5/10?id=100&name=john`): declare the prop
name up front and it's populated the same way.

## Navigating

```js
this.$router.to('/movie/details', { id: '1', img: 'details.png' }, { inHistory: false })
// path, optional data object, optional behavior options

this.$router.back()
```

`this.$router.currentRoute` reads the active route. `this.$router.state`
is itself reactive (`{ path, navigating }`), so you can bind to it in a
template or watch it directly rather than polling.

## Cross-reference

For the general "what should live on which screen, how does focus reset on
navigation" UX questions, see `tv-focus-and-navigation` — this file covers
only the Blits router mechanics.
