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
