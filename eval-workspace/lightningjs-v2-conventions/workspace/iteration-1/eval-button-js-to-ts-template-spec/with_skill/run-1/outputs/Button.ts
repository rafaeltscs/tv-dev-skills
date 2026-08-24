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
