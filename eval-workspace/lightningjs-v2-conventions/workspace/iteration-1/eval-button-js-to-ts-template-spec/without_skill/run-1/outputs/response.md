# Button.js → Button.ts

Here's the TypeScript conversion. I aimed for real typing throughout rather than falling back to `any`:

- **Template spec**: I declared a `ButtonTemplateSpec` interface extending `Lightning.Component.TemplateSpec` that describes the two children (`Background`, `Label`) and their patchable properties. `static _template()` is annotated to return `Lightning.Component.Template<ButtonTemplateSpec>`, so the template object literal is checked against that shape.
- **Typed refs**: Instead of calling `this.tag('Label')` / `this.tag('Background')` (which types loosely), the class implements `Lightning.Component.ImplementTemplateSpec<ButtonTemplateSpec>` and declares `readonly Background = this.getByRef('Background')!` and `readonly Label = this.getByRef('Label')!`. That gives you real, non-`any` element references for `.patch(...)` calls, resolved once instead of looked up by string on every access.
- **`label` setter**: typed to accept `string`, matching the `text.text` field in the template spec, and now writes through the typed `Label` ref.
- **`onEnter` prop**: I introduced a small `ButtonOnEnterCallback = () => void` alias and typed both the private backing field (`_onEnter: ButtonOnEnterCallback | null`) and the setter (`cb: ButtonOnEnterCallback | null`) with it, so callers get a real function-shaped type instead of `any`.
- **Lifecycle methods**: `_init`, `_focus`, `_unfocus`, and `_handleEnter` are marked `override` (they override `Lightning.Component` base methods), which lets the compiler catch typos in method names against the base class.
- The `w`/`h` inline functions on `Background` are explicitly typed as `(w: number) => w` / `(h: number) => h` since template dimension callbacks receive numbers.

## Final code

```ts
import { Lightning } from '@lightningjs/core';

/**
 * Template spec describing the shape of this component's template tree.
 * Extending Lightning.Component.TemplateSpec gives the base w/h/etc.
 * properties, and lets `_template()` and the typed refs below be checked
 * against the same source of truth.
 */
export interface ButtonTemplateSpec extends Lightning.Component.TemplateSpec {
  Background: {
    color: number;
  };
  Label: {
    text: {
      text: string;
      fontSize: number;
    };
  };
}

/** Shape of the `onEnter` callback prop. */
export type ButtonOnEnterCallback = () => void;

export default class Button
  extends Lightning.Component<ButtonTemplateSpec>
  implements Lightning.Component.ImplementTemplateSpec<ButtonTemplateSpec>
{
  private _onEnter: ButtonOnEnterCallback | null = null;

  // Typed template refs (resolved once, reused by _focus/_unfocus/label).
  readonly Background = this.getByRef('Background')!;
  readonly Label = this.getByRef('Label')!;

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

  override _init() {
    this._onEnter = null;
  }

  set onEnter(cb: ButtonOnEnterCallback | null) {
    this._onEnter = cb;
  }

  set label(value: string) {
    this.Label.patch({ text: { text: value } });
  }

  override _focus() {
    this.Background.patch({ color: 0xff4b9fff });
  }

  override _unfocus() {
    this.Background.patch({ color: 0xff2b2b2b });
  }

  override _handleEnter() {
    if (this._onEnter) this._onEnter();
  }
}
```

## Notes / things to double-check in your project

- `getByRef` and `ImplementTemplateSpec` are the typed-ref mechanism used by `@lightningjs/core`'s TypeScript definitions; if your installed version of `@lightningjs/core` predates that API, you'd fall back to `this.tag('Label') as Lightning.Element` casts instead — let me know if you want that variant.
- I made `onEnter` accept `null` in addition to the callback type, since `_init` resets `_onEnter` to `null` and the setter should be able to clear it the same way.
- If you have a `tsconfig.json` with `useDefineForClassFields` enabled, the `readonly Background = this.getByRef(...)` class field initializers run in declaration order at construction time, after `_template()`'s refs exist — this is the standard pattern and should work as-is, but flag it if your build setup does anything unusual with field initialization order.
