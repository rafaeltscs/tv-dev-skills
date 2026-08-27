# TypeScript

Lightning Core has shipped bundled type definitions since v2.7.0. Getting
good type inference requires a bit more ceremony than a plain JS component —
this is the ceremony, and when it's worth skipping.

## Baseline setup

Recommended `tsconfig.json` starting point:

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

`strictNullChecks` (implied by `strict: true`) is effectively mandatory —
without it you'll hit hard-to-diagnose errors elsewhere in the type system.

## Import once, use the namespace

```ts
import { Lightning } from '@lightningjs/sdk'; // if using the SDK
// or
import Lightning from '@lightningjs/core';    // Core only

const el: Lightning.Element;
const comp: Lightning.Component;
const tmpl: Lightning.Component.Template;
```

Don't import individual class names from scattered paths — everything
public hangs off this one namespace import.

## Template Specs — the core pattern

A Template Spec is an interface describing a component's public properties
(lowercase keys) and children (uppercase keys):

```ts
export interface MyComponentTemplateSpec extends Lightning.Component.TemplateSpec {
  // Properties: lower-case keys, never optional (`?`) — omitting `?` lets
  // TS enforce that you actually implement the getter/setter.
  title: string;
  isActive: boolean;

  // Children: upper-case keys.
  // - Component child:      typeof SomeComponent
  // - Childless element:    object
  // - Element with children: nested inline object, same rules recursively
  Label: object;
  Icon: typeof IconComponent;
}
```

Wire it up on the class:

```ts
class MyComponent
  extends Lightning.Component<MyComponentTemplateSpec>
  implements Lightning.Component.ImplementTemplateSpec<MyComponentTemplateSpec>
{
  static override _template(): Lightning.Component.Template<MyComponentTemplateSpec> {
    return {
      Label: { text: { text: '' } },
      Icon: { type: IconComponent },
    };
  }

  // The interface forces you to implement a getter/setter per property
  get title(): string { return this._title; }
  set title(v: string) { this._title = v; /* apply to template */ }

  get isActive(): boolean { return this._isActive; }
  set isActive(v: boolean) { this._isActive = v; }

  private _title = '';
  private _isActive = false;

  // Prefer getByRef over tag() in TS — better inference, slightly faster.
  private _Label = this.getByRef('Label')!; // `!` because we know it exists from _template
  get Icon() { return this.getByRef('Icon'); } // getter if the child may not exist at all times
}
```

Rule of thumb for `getByRef` vs a getter:

- Child is created in `_template()` and never removed → assign once as a
  class field with `!` (non-null assertion).
- Child may or may not exist at any given time → expose as a `get` that
  calls `getByRef()` fresh each time, and check for `undefined` at call
  sites.

## Loose components (opt-out of strictness)

Extend `Lightning.Component.TemplateSpecLoose` instead of `TemplateSpec` to
allow arbitrary extra properties/children — useful when wrapping a
third-party or not-yet-typed component. **Every component without an
explicit Template Spec is Loose by default**, so this is also just "what
plain-JS-style components look like in a TS codebase."

## Type Configs (events & signals)

A second, optional generic parameter types a component's Events and Signals:

```ts
interface MyComponentEventMap extends Lightning.Component.EventMap {
  titleLoaded(): void;
  ratingColor(color: number, visible: boolean): void;
}

interface MyComponentSignalMap extends Lightning.Component.SignalMap {
  toggleText(alpha: number, color: string): void;
}

interface MyComponentTypeConfig extends Lightning.Component.TypeConfig {
  EventMapType: MyComponentEventMap;
  SignalMapType: MyComponentSignalMap;
}

class MyComponent
  extends Lightning.Component<MyComponentTemplateSpec, MyComponentTypeConfig>
  implements Lightning.Component.ImplementTemplateSpec<MyComponentTemplateSpec> {
  // this.emit(...), this.on(...), this.signal(...) are now type-checked
  // against the maps above.
}
```

Note the asymmetry: `this.signal('toggleText', ...)` call sites are
type-checked, but the **signal handler's own signature is not** — don't
assume TS will catch a mismatched handler parameter list.

If no Type Config is given, a Loose one applies by default (same
opt-out philosophy as Template Specs).

## Known gotchas

- **`Element` vs `Lightning.Element`**: TypeScript's global `Element` is the
  DOM interface. Using the bare `Element` type in Lightning code silently
  type-checks but is almost always wrong — use `Lightning.Element`.
- **Dot-notation deep property access is not type-safe.** For `smooth`
  transitions or `animation()` targeting nested properties
  (e.g. `'shader.amount'`), you must cast: `as any` for transitions, or the
  special string-literal casts for animations: `as '$$number'`,
  `as '$$boolean'`, `as '$$string'`.
- **Write-only properties** return `undefined` if read — if a property's
  doc comment warns "WRITE-ONLY," don't read it back and branch on the
  result.
- If you get stuck on a typing dead end: use `// @ts-expect-error` (with a
  `TODO`) or `any` rather than fighting the type system for an hour — this
  is explicitly sanctioned by the Lightning team's own guidance, not a
  shortcut to feel bad about.

## Subclassable / generic base components

If designing a base component meant to be subclassed with a variable child
type (e.g. a `PageBase<T>` where `T` is the content component type), pass
the generic through the Template Spec and the class, but note that
`_template()`'s return type **cannot reference the class's own generic
parameter** — TypeScript doesn't allow that. Leave the base `_template()`
untyped against `T` and have subclasses assert the more specific template
type after calling `super._template()`. Reach for `references/components-and-templates.md`
for the plain (non-generic) version of Template Specs first if this doesn't
come up.

## Not yet covered

- `this`-context differences between static/instance methods and Component
  States classes — worth its own section once there's a concrete case to
  document against.
