SKILLS_CONSULTED: NONE

Why: The question is about Roku SceneGraph / BrightScript framework APIs (`setFocus`, `observeField`), and none of the five skills cover Roku — `tv-platform-quirks` explicitly scopes itself to web-based platforms and says to say so rather than guess about "non-web TV platforms (Roku BrightScript)", `lightningjs-v2/v3-conventions` are Lightning-only, `tv-performance-constraints` is about memory/GPU, and `tv-focus-and-navigation` covers framework-agnostic focus UX but explicitly excludes framework-specific focus APIs.

---

## Answer (general knowledge — no skill covers Roku SceneGraph)

### 1. How `setFocus` propagates to child nodes

Short version: **it doesn't cascade downward the way you might expect.** In SceneGraph there is exactly **one focused node in the entire component tree at any time**. `node.setFocus(true)` makes *that specific node* the focused node and implicitly calls `setFocus(false)` on whoever previously held it. It returns a `Boolean` indicating success (it fails silently-ish if the node isn't currently renderable / attached).

What actually "propagates" is the **focus chain**, not focus itself:

- The focus chain is the path from the root Scene down to the single focused node.
- Every ancestor of the focused node is "on the focus chain." Query this with `node.isInFocusChain()` — returns `true` if the node itself **or any descendant** currently has focus. This is the mechanism a container uses to know "focus is somewhere inside me."
- Setting focus on a container (a `Group`, `LayoutGroup`, `Rectangle`, custom component, etc.) does **not** forward focus to a child. The container just becomes the focused node. If you want a specific leaf (e.g. a poster in your grid) to receive key events, you must call `setFocus(true)` on that leaf, or keep focus on the container and let it handle keys.

Key-event dispatch is where the "propagation" people expect actually happens — **upward, not downward**:

- `onKeyEvent(key as String, press as Boolean) as Boolean` is invoked first on the focused node, then **bubbles up the focus chain** through each ancestor until one returns `true` (handled). Return `false` to let it keep bubbling.
- So the common grid pattern is: focus sits on the container component; its `onKeyEvent` intercepts `"up"/"down"/"left"/"right"`, updates an internal selection index, and moves a highlight rectangle. Individual cells never take focus. Alternatively, focus moves cell-to-cell and a parent catches edge cases via bubbling.

Practical notes for porting a content grid:

- Prefer the built-in `RowList` / `MarkupGrid` / `ArrayGrid` (or `Rowlist`'s grid mode). They manage internal focus, scrolling and wrapping for you. You give the container `setFocus(true)` once; it handles everything below.
- Call `setFocus(true)` only after the node tree is built and visible — typically at the end of `init()`, or from an observer on `visible`/`focusable`. Calling it on an unrendered/`visible=false` subtree won't stick.
- Don't try to have two things "focused." Model per-row highlight state yourself (e.g. a `focusPercent` field driven by animation) separate from the single real focus.

### 2. Observing focus changes in BrightScript

There is **no observable `focus` field** on an arbitrary node. You have three tools:

**a) `focusedChild` (the main one).** Every node has a read-only `focusedChild` field. It points to the **immediate child of that node that lies on the focus chain** (not necessarily the actual focused leaf). Observe it:

```brightscript
sub init()
    m.top.observeField("focusedChild", "onFocusChanged")
end sub

sub onFocusChanged()
    if m.top.isInFocusChain()
        ' focus entered or moved within this component
        m.highlight.visible = true
    else
        m.highlight.visible = false
    end if
end sub
```

Observing `focusedChild` on `m.top` is the idiomatic "did my component gain/lose focus" hook. To reach the real focused leaf, walk down repeatedly: `node = node.focusedChild` until it's `invalid`.

**b) `isInFocusChain()`** — call this inside the handler (as above) to distinguish "focus is inside me" from "focus left me." `focusedChild` alone can be `invalid` in both the "never had it" and "just lost it" cases.

**c) Built-in grid/list fields** — if you use `RowList` / `MarkupGrid` / `ArrayGrid`, observe their purpose-built fields instead of `focusedChild`:

- `itemFocused` (Int) — index of the currently focused item; fires on every d-pad move.
- `rowItemFocused` (2-element array `[row, col]`) — for `RowList`.
- `itemSelected` (Int) — fires on OK/Enter press.
- `itemUnfocused`, `jumpToItem`, `animateToItem`, `focusRow` — related control/observation fields.

```brightscript
m.grid.observeField("itemFocused", "onItemFocused")
m.grid.observeField("itemSelected", "onItemSelected")

sub onItemFocused()
    idx = m.grid.itemFocused
    ' prefetch art, update metadata panel, etc.
end sub
```

**Field-scope caveat:** by default `observeField` callbacks run on the render thread. For a grid, keep the callback light (update UI, kick off a task node). Use `observeFieldScoped` / the `"permanent"` or task-thread variants only if you understand the threading implications.

### Summary for your port

- One focus holder tree-wide; `setFocus(true)` moves it, doesn't cascade to children.
- Downward "propagation" = the focus chain (`isInFocusChain()`); real propagation of input is `onKeyEvent` bubbling **up** the chain.
- Observe `focusedChild` on your component root (+ `isInFocusChain()` to disambiguate) for generic focus gain/loss; observe `itemFocused` / `itemSelected` on `RowList`/`MarkupGrid` for grid navigation — that's the least-code path for a content grid.
