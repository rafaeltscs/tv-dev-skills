SKILLS_CONSULTED: lightningjs-v2-conventions

Why: The task is converting a plain-JS LightningJS Core v2 Component to TypeScript with a real Template Spec (typed child refs and props), which is exactly the "convert a JS Lightning component to TypeScript / TypeScript Template Spec" scope that skill names; no focus, performance-budget, or platform-packaging concern is in play, so the other four skills don't apply.

---

# Converting a Lightning v2 component from plain JS to TypeScript with a real Template Spec

## The short version

A properly typed Lightning v2 component needs **five** coordinated pieces:

1. A **Template Spec interface** that `extends Lightning.Component.TemplateSpec` — lowercase keys = public properties ("props"), uppercase (`PascalCase`) keys = children ("refs").
2. The class declared as `extends Lightning.Component<MySpec>` **and** `implements Lightning.Component.ImplementTemplateSpec<MySpec>`.
3. `static override _template()` typed as `Lightning.Component.Template<MySpec>`.
4. One **getter/setter pair per property** in the spec (the `implements` clause forces this — that's the point).
5. Typed **child accessors** via `getByRef()` — a `!`-asserted class field for always-present children, a `get` that calls `getByRef()` fresh for children that may not exist.

Optionally a sixth piece — a **Type Config** interface — if the component emits events or fires signals and you want those type-checked too.

The naming convention is **load-bearing, not cosmetic**: Lightning's type machinery decides "is this key a property or a child?" purely from the first letter's case. `camelCase` -> property, `PascalCase` -> child. Get this wrong and the types silently go sideways.

---

## Before: the plain-JS component

```js
import Lightning from '@lightningjs/core';

export default class MenuButton extends Lightning.Component {
  static _template() {
    return {
      w: 320,
      h: 72,
      Background: {
        w: (w) => w,
        h: (h) => h,
        rect: true,
        color: 0xff1f1f1f,
        shader: { type: Lightning.shaders.RoundedRectangle, radius: 8 },
      },
      Icon: {
        type: IconView,       // a child Component
        x: 20,
        y: 20,
        w: 32,
        h: 32,
      },
      Label: {                // a plain element with a text texture
        x: 68,
        y: 36,
        mount: 0,
        text: { text: '', fontSize: 28, textColor: 0xffcccccc },
      },
    };
  }

  set label(v) {
    this._label = v;
    this.tag('Label').text.text = v;
  }

  get label() {
    return this._label;
  }

  set selected(v) {
    this._selected = v;
    this.tag('Background').color = v ? 0xff3355ff : 0xff1f1f1f;
  }

  get selected() {
    return this._selected;
  }

  _focus() {
    this.tag('Background').patch({ smooth: { scale: 1.05 } });
  }

  _unfocus() {
    this.tag('Background').patch({ smooth: { scale: 1.0 } });
  }
}
```

---

## After: the TypeScript version

```ts
import Lightning from '@lightningjs/core';
// import { Lightning } from '@lightningjs/sdk';  // use this import instead if you're on the SDK
import IconView, { IconViewTemplateSpec } from './IconView';

/**
 * 1. THE TEMPLATE SPEC
 *
 *  - lowercase keys  -> public properties ("props"). NEVER mark them optional
 *    with `?` — omitting `?` is what makes `implements` force you to write the
 *    getter/setter. Optionality of the *value* is expressed in the type
 *    (`string | undefined`), not with `?` on the key.
 *  - PascalCase keys  -> children ("refs"). Three shapes:
 *      • child Component      -> `typeof TheComponentClass`
 *      • childless element    -> `object`
 *      • element WITH children -> a nested inline object, same rules recursively
 */
export interface MenuButtonTemplateSpec extends Lightning.Component.TemplateSpec {
  // --- properties ---
  label: string;
  selected: boolean;

  // --- children ---
  Background: object;                       // plain element, no children of its own
  Icon: typeof IconView;                    // a child Component
  Label: {                                  // plain element that DOES have sub-structure
    text: Lightning.textures.TextTexture.Settings;
  };
}

/**
 * 2. (optional) THE TYPE CONFIG — only if this component emits events / fires signals.
 *    Skip this whole block if it doesn't.
 */
interface MenuButtonSignalMap extends Lightning.Component.SignalMap {
  pressed(id: string): void;
}
interface MenuButtonTypeConfig extends Lightning.Component.TypeConfig {
  SignalMapType: MenuButtonSignalMap;
}

/**
 * 3. THE CLASS
 *    - first generic  = the Template Spec
 *    - second generic = the Type Config (omit if you skipped step 2)
 *    - `implements ImplementTemplateSpec<Spec>` is what turns "you forgot a
 *      setter" into a compile error.
 */
export default class MenuButton
  extends Lightning.Component<MenuButtonTemplateSpec, MenuButtonTypeConfig>
  implements Lightning.Component.ImplementTemplateSpec<MenuButtonTemplateSpec>
{
  // 4. TEMPLATE — return type ties the object literal to the spec, so a typo'd
  //    ref or a misspelled property is caught here.
  static override _template(): Lightning.Component.Template<MenuButtonTemplateSpec> {
    return {
      w: 320,
      h: 72,
      Background: {
        w: (w: number) => w,
        h: (h: number) => h,
        rect: true,
        color: 0xff1f1f1f,
        shader: { type: Lightning.shaders.RoundedRectangle, radius: 8 },
      },
      Icon: {
        type: IconView,
        x: 20,
        y: 20,
        w: 32,
        h: 32,
      },
      Label: {
        x: 68,
        y: 36,
        mount: 0,
        text: { text: '', fontSize: 28, textColor: 0xffcccccc },
      },
    };
  }

  // 5. TYPED CHILD REFS
  //    Always-present (created in _template, never removed): class field, `!`.
  //    getByRef is preferred over tag() in TS — better inference, slightly faster.
  private readonly _Background = this.getByRef('Background')!;
  private readonly _Label = this.getByRef('Label')!;

  //    getByRef('Icon') is typed as `IconView | undefined`. If Icon is always
  //    there you can also do `this.getByRef('Icon')!`; use a fresh getter when
  //    a child is conditionally added/removed at runtime.
  private get _Icon(): IconView | undefined {
    return this.getByRef('Icon');
  }

  // BACKING FIELDS for the properties
  private _label = '';
  private _selected = false;

  // GETTER/SETTER PER SPEC PROPERTY — mandatory because of `implements`
  get label(): string {
    return this._label;
  }
  set label(v: string) {
    this._label = v;
    this._Label.text!.text = v;        // `_Label.text` is typed from the nested spec
  }

  get selected(): boolean {
    return this._selected;
  }
  set selected(v: boolean) {
    this._selected = v;
    this._Background.color = v ? 0xff3355ff : 0xff1f1f1f;
  }

  // Lifecycle hooks: mark them `override`. Pick the hook that matches intent —
  // focus reactions go in _focus/_unfocus, not _init.
  override _focus(): void {
    this._Background.patch({ smooth: { scale: [1.05, { duration: 0.2 }] } });
  }

  override _unfocus(): void {
    this._Background.patch({ smooth: { scale: 1.0 } });
  }
}
```

---

## Piece-by-piece rationale

### The Template Spec interface

| Key style | Meaning | Type to write |
|---|---|---|
| `label`, `selected` (camelCase) | public property / "prop" | the value type directly (`string`, `boolean`, `MyEnum`) |
| `Background` (PascalCase), no sub-children | plain render-tree element | `object` |
| `Icon` (PascalCase), is a Component | child Component | `typeof IconView` |
| `Label` (PascalCase), plain element but has structure you touch | nested element | inline `{ ... }` object, recursively following the same camel/Pascal rule |

- **Do not use `?` on property keys.** Omitting `?` is deliberate: it makes `implements ImplementTemplateSpec<Spec>` fail to compile until you actually write the getter/setter. If the value can be absent, put that in the value type (`label: string | undefined`), keep the key non-optional.
- `extends Lightning.Component.TemplateSpec` (strict). Only use `Lightning.Component.TemplateSpecLoose` when you're wrapping a not-yet-typed / third-party component and genuinely need arbitrary extra keys. Any component with **no** explicit spec is Loose by default — that's what "a plain-JS-style component in a TS codebase" is, and it's what you're moving away from.

### The class declaration

```ts
extends Lightning.Component<MenuButtonTemplateSpec, MenuButtonTypeConfig>
implements Lightning.Component.ImplementTemplateSpec<MenuButtonTemplateSpec>
```

- First generic: the spec. This is what types `this.getByRef(...)`, `this.patch(...)`, `this.tag(...)`, and the `_template()` return.
- Second generic: the Type Config — only for typed events/signals. Drop it entirely if the component has neither; a Loose Type Config applies by default.
- The `implements` clause is not redundant with `extends`. `extends` wires up the inference; `implements` enforces that every property in the spec has a concrete getter/setter on the class. Without it, a spec property you forgot to implement is not an error.

### `_template()`

```ts
static override _template(): Lightning.Component.Template<MenuButtonTemplateSpec> { ... }
```

Typing the return as `Lightning.Component.Template<Spec>` checks the literal against the spec: an unknown ref key, a misspelled property, or a wrong-typed value is caught at the template instead of at runtime. Add `override` (the base class declares `_template`).

### Typed child refs — `getByRef` vs a getter

- **Created in `_template()` and never removed** -> assign once as a class field with `!`:
  `private readonly _Background = this.getByRef('Background')!;`
  `getByRef('Background')` is typed `Lightning.Element | undefined` here; the `!` is honest because the template guarantees it.
- **May or may not exist at a given moment** (conditionally added/removed, e.g. via `patch({ Foo: undefined })`) -> expose a `get` that calls `getByRef()` fresh each time and returns `T | undefined`, and null-check at call sites.
- **Prefer `getByRef()` over `tag()`** in TypeScript: it reads the child type straight from the spec (so `_Icon` is `IconView | undefined`, `_Label.text` is a `TextTexture.Settings`), and it's marginally faster. `tag()` is still fine in plain JS and for deep dotted paths like `tag('A.B.C')`, but those come back loosely typed.

### Lifecycle hooks

Mark overridden hooks `override` (helped by `noImplicitOverride`). Keep using the semantically-correct hook after conversion: data init in `_init()` (or `_construct()` if it must run before the template spawns), focus reactions in `_focus()`/`_unfocus()`, on-screen/visibility work in `_active()`/`_inactive()`. Conversion to TS is not the moment to consolidate everything into `_init()`.

### Type Config (only if needed)

```ts
interface MenuButtonSignalMap extends Lightning.Component.SignalMap {
  pressed(id: string): void;
}
interface MenuButtonEventMap extends Lightning.Component.EventMap {
  labelChanged(value: string): void;
}
interface MenuButtonTypeConfig extends Lightning.Component.TypeConfig {
  SignalMapType: MenuButtonSignalMap;
  EventMapType: MenuButtonEventMap;
}
```

Pass it as the second generic to `Lightning.Component<Spec, TypeConfig>`. Now `this.signal('pressed', id)`, `this.emit('labelChanged', v)`, and `this.on('labelChanged', ...)` are checked against the maps. Asymmetry to know about: the **call sites** of `this.signal(...)` are checked, but the **signal handler's own parameter list is not** — TS won't catch a handler whose signature drifts from the map.

---

## `tsconfig.json` baseline

Lightning Core has bundled its own type definitions since **v2.7.0** — no `@types/...` package needed. Recommended compiler options:

```json
{
  "compilerOptions": {
    "outDir": "build-ts",
    "target": "ES2019",
    "lib": ["ES2019", "DOM"],
    "moduleResolution": "node",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

`strictNullChecks` (implied by `strict: true`) is effectively mandatory — without it you hit hard-to-diagnose failures deep in Lightning's type system, not just in your own code.

---

## Gotchas that will bite during this conversion (so you can avoid `any`)

- **`Element` vs `Lightning.Element`.** The bare global `Element` is the DOM type. It type-checks silently in Lightning code and is almost always wrong. Always write `Lightning.Element`, `Lightning.Component`, `Lightning.Texture` off the namespace import. Don't import individual class names from deep paths.
- **Deep dot-path property access is not type-safe.** `patch({ smooth: { 'shader.radius': 12 } })`, `.setSmooth('shader.amount', ...)`, and `animation()` targeting nested props (`'shader.amount'`) don't type-check. Cast: `as any` for `smooth`/transitions, or the string-literal casts for animations — `as '$$number'`, `as '$$boolean'`, `as '$$string'`. That's the sanctioned escape hatch, not a smell.
- **Write-only properties read back as `undefined`.** If a Lightning property's doc comment says "WRITE-ONLY," don't read it and branch on the result.
- **Nested spec element access needs `!` on the sub-key.** `this._Label.text` is typed `TextTexture.Settings | undefined` from the spec; write `this._Label.text!.text = v` (or patch: `this._Label.patch({ text: { text: v } })`).
- **Last-resort escape is fine.** If a specific spot fights the type system, `// @ts-expect-error` with a `TODO`, or a narrow `any`, is explicitly endorsed by the Lightning team's own guidance. Use it in one spot rather than degrading the whole component to Loose.

---

## Checklist for the conversion

1. Add/confirm `tsconfig.json` with `strict` + the options above; Lightning >= 2.7.0.
2. Rename the file `.js` -> `.ts`.
3. Write `interface XTemplateSpec extends Lightning.Component.TemplateSpec` — camelCase props, PascalCase refs, no `?` on keys, `typeof` for Component children, `object` for leaf elements, nested inline objects for structured elements.
4. (If it has events/signals) write `XTypeConfig extends Lightning.Component.TypeConfig`.
5. Change the class to `extends Lightning.Component<XTemplateSpec, XTypeConfig?> implements Lightning.Component.ImplementTemplateSpec<XTemplateSpec>`.
6. Type `_template()` as `Lightning.Component.Template<XTemplateSpec>`, add `override`.
7. Replace `this.tag('Ref')` with `getByRef('Ref')` — `!`-field for permanent children, fresh getter for transient ones.
8. Add a getter/setter for every spec property; add `override` to every lifecycle hook.
9. Compile. Resolve deep-path casts with `as any` / `as '$$number'`; use `@ts-expect-error` + TODO only where genuinely stuck.
