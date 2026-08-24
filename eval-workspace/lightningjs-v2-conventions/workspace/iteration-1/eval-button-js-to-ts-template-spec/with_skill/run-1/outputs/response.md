# Button.js → Button.ts

Here's the TypeScript conversion, using a proper **Template Spec** rather than
falling back to a Loose component or `any`.

## What changed and why

**1. A `ButtonTemplateSpec` interface describes the public contract.**
Lower-case keys (`label`, `onEnter`) are properties; upper-case keys
(`Background`, `Label`) are template children. This is what lets
`getByRef()`, `patch()`, and the property getters/setters all get real
inference instead of `any`.

```ts
export interface ButtonTemplateSpec extends Lightning.Component.TemplateSpec {
  label: string;
  onEnter: (() => void) | null;

  Background: object;
  Label: object;
}
```

**2. The class wires the spec in two places**: as the generic argument to
`Lightning.Component<ButtonTemplateSpec>`, and via
`implements Lightning.Component.ImplementTemplateSpec<ButtonTemplateSpec>`.
The `implements` clause is what forces the compiler to make sure `label` and
`onEnter` actually exist as typed accessors on the class — if you typo'd one
or left it untyped, this is what would catch it.

**3. `label` is now a real `get`/`set` pair, not just a setter.**
The original only had `set label(value)`. I kept the setter's behavior
identical (patch the `Label` ref's text) but added a backing field
(`_label`) and a matching getter, both typed `string`. This matches the
Template Spec rule that a property must be genuinely readable/writable, and
it also fixes a latent gap in the original — reading `button.label` back
used to silently return `undefined`.

**4. `onEnter` is typed as `(() => void) | null`.**
That's the real shape of the callback prop: it takes no arguments, returns
nothing, and can be explicitly cleared by assigning `null` (which `_init()`
already did). I added a getter here too for the same "real accessor, not
half of one" reason as `label`.

**5. `Background` and `Label` are grabbed once via `getByRef()`** instead of
repeated `this.tag('Background')` / `this.tag('Label')` calls. Per the
skill's rule of thumb: a child created in `_template()` and never removed
should be captured once as a class field with a non-null assertion (`!`),
because we know it exists from the template. This is also the reason to
prefer `getByRef` over `tag` in TS — it's typed off the spec instead of
returning a loosely-typed lookup result.

**6. `static _template()` is typed as
`Lightning.Component.Template<ButtonTemplateSpec>`**, and the inline width/
height functions on `Background` (`(w) => w`, `(h) => h`) got explicit
`(w: number) => number` / `(h: number) => number` signatures — those were
implicitly-`any` parameters in the original that TS would otherwise flag
under `strict`.

**7. `override` on lifecycle hooks.** With `noImplicitOverride` (the
recommended tsconfig setting for Lightning TS projects), any method that
actually overrides a base `Lightning.Component` method — `_template`,
`_init`, `_focus`, `_unfocus` — needs the `override` keyword. `_handleEnter`
does **not** get `override`: it isn't a declared base-class method, it's
picked up dynamically by Lightning's key-handling convention (see
`_handle{KeyName}` in the framework's focus/input model), so there's nothing
in the base class type for it to override.

**8. Refs kept `PascalCase`, properties kept `camelCase`** — unchanged from
the original, since that convention is exactly what lets the Template Spec
distinguish properties from children.

No behavior changes versus the original component — same default label text,
same focus colors, same Enter-key callback semantics. The only functional
addition is that `label` and `onEnter` are now actually readable, which they
implicitly should have been.

## Final code

```ts
import { Lightning } from '@lightningjs/core';

/**
 * Template Spec: describes Button's public contract.
 * - Lower-case keys are properties (read/write via getters/setters below).
 * - Upper-case keys are template children (refs).
 */
export interface ButtonTemplateSpec extends Lightning.Component.TemplateSpec {
  /** Text shown on the button's label. */
  label: string;
  /** Called when the button is activated via the remote's Enter key. */
  onEnter: (() => void) | null;

  Background: object;
  Label: object;
}

export default class Button
  extends Lightning.Component<ButtonTemplateSpec>
  implements Lightning.Component.ImplementTemplateSpec<ButtonTemplateSpec>
{
  private _label = 'Click me';
  private _onEnter: (() => void) | null = null;

  // Both children are created in _template() and never removed, so grab
  // them once as class fields (see typescript.md: getByRef vs getter rule
  // of thumb) instead of re-resolving them via tag() on every use.
  private _Background = this.getByRef('Background')!;
  private _Label = this.getByRef('Label')!;

  static override _template(): Lightning.Component.Template<ButtonTemplateSpec> {
    return {
      w: 300,
      h: 80,
      Background: {
        w: (w: number) => w,
        h: (h: number) => h,
        rect: true,
        color: 0xff2b2b2b,
      },
      Label: {
        x: 20,
        y: 20,
        text: { text: 'Click me', fontSize: 28 },
      },
    };
  }

  override _init(): void {
    this._onEnter = null;
  }

  get onEnter(): (() => void) | null {
    return this._onEnter;
  }

  set onEnter(cb: (() => void) | null) {
    this._onEnter = cb;
  }

  get label(): string {
    return this._label;
  }

  set label(value: string) {
    this._label = value;
    this._Label.patch({ text: { text: value } });
  }

  override _focus(): void {
    this._Background.patch({ color: 0xff4b9fff });
  }

  override _unfocus(): void {
    this._Background.patch({ color: 0xff2b2b2b });
  }

  // Not a base-class override: `_handleEnter` is picked up by name via
  // Lightning's key-handling convention (see focus-and-input.md), so it
  // does not carry the `override` keyword.
  _handleEnter(): void {
    if (this._onEnter) this._onEnter();
  }
}
```
