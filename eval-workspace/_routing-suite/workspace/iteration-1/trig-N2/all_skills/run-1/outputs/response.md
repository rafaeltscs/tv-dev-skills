SKILLS_CONSULTED: NONE

Why: All five installed skills are scoped to TV/OTT apps driven by a directional remote (LightningJS renderer conventions, TV focus/navigation UX, low-end-TV performance budgets, and per-platform TV quirks). This question is about a desktop browser single-page app using React Router and the hardware Back button of a normal web browser, which none of the skills cover. `tv-focus-and-navigation` mentions "Back button does the wrong thing," but only for a 5-way TV remote's Back key, not the browser history Back button.

---

# Handling browser Back without losing half-filled form state (React Router, desktop SPA)

The root cause: when you navigate away from the form route, React Router unmounts the form component, so all `useState`/`useReducer` values are discarded. Pressing Back remounts a fresh instance. Fixing this is two independent concerns:

1. **Persist the draft** so it survives unmount (and remount on Back/Forward).
2. **Optionally warn** the user before a navigation that would abandon unsaved work.

Do #1 for real safety. Add #2 only as a UX nicety — do not rely on a confirm dialog as your persistence mechanism.

## 1. Persist the draft (recommended: sessionStorage-backed hook)

Keep form values mirrored into `sessionStorage` on every change (debounced), and seed initial state from storage on mount. `sessionStorage` survives SPA route changes, Back/Forward, and even a full reload, is scoped to the tab, and is cleared when the tab closes.

```jsx
// usePersistentForm.js
import { useState, useEffect, useRef, useCallback } from "react";

export function usePersistentForm(key, initialValues) {
  const storageKey = `draft:${key}`;

  const [values, setValues] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved ? { ...initialValues, ...JSON.parse(saved) } : initialValues;
    } catch {
      return initialValues;
    }
  });

  const timer = useRef();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(values));
      } catch {
        /* quota / private mode - ignore */
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [values, storageKey]);

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);

  return [values, setValues, clearDraft];
}
```

Usage:

```jsx
function SignupForm() {
  const [values, setValues, clearDraft] = usePersistentForm("signup", {
    name: "",
    email: "",
    bio: "",
  });

  const onChange = (e) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    await api.submit(values);
    clearDraft();            // only wipe the draft on SUCCESS
    navigate("/done");
  };

  return (
    <form onSubmit={onSubmit}>
      <input name="name" value={values.name} onChange={onChange} />
      <input name="email" value={values.email} onChange={onChange} />
      <textarea name="bio" value={values.bio} onChange={onChange} />
      <button>Submit</button>
    </form>
  );
}
```

Key points:
- **Key per entity** (`draft:invoice:1234`) if the same form can be open for different records.
- **Clear only on successful submit** (or on an explicit "discard" action), never on unmount.
- **Never persist secrets/PII** (passwords, card numbers, SSNs) to storage — for those, hold state in an in-memory store instead (option below).
- Use `localStorage` instead if you want the draft to survive the tab closing; then add a timestamp and expire old drafts.
- Guard every storage call in `try/catch` (Safari private mode throws, quota can be exceeded).

## Alternative: hoist state so the component never unmounts

If you would rather not touch storage:

- **Lift the form state above `<Routes>`** into a parent component or a React context provider mounted at app root. The values then live outside the route subtree and are untouched by navigation.
- **Use an external store** (Zustand, Jotai, Redux). The store lives outside the React tree, so route changes do not clear it. This is the cleanest option for multi-step wizards and for sensitive data you do not want in `sessionStorage`. Reset the slice on successful submit.

```js
// store.js (Zustand)
import { create } from "zustand";
export const useSignupDraft = create((set) => ({
  values: { name: "", email: "", bio: "" },
  set: (patch) => set((s) => ({ values: { ...s.values, ...patch } })),
  reset: () => set({ values: { name: "", email: "", bio: "" } }),
}));
```

## Alternative: put small forms in the URL

For a few simple fields, store them in the query string via `useSearchParams`. Back/Forward then restore the values for free because they are part of the history entry. Not practical for large or nested forms, and avoid it for anything sensitive.

```jsx
const [params, setParams] = useSearchParams();
const name = params.get("name") ?? "";
// setParams(p => { p.set("name", e.target.value); return p; }, { replace: true });
```

## 2. Warn before abandoning unsaved changes

### In-app navigation (React Router) — `useBlocker`

Requires a data router (`createBrowserRouter` / `RouterProvider`). Stable in React Router v7; `unstable_useBlocker` in v6.

```jsx
import { useBlocker } from "react-router-dom";
import { useEffect } from "react";

function useUnsavedChangesPrompt(isDirty) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("You have unsaved changes. Leave this page?")) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker]);
}
```

`isDirty` = a comparison of current values against the pristine initial values (or a simple "user has typed" flag). If you also implement persistence from section 1, you can skip this entirely or make the copy reassuring ("your draft is saved") rather than alarming.

On React Router v6 without a data router, use `<Prompt>` (v5) or upgrade; there is no supported blocking API in the classic v6 `<BrowserRouter>`.

### Full page unload (refresh, tab close, address-bar navigation) — `beforeunload`

`useBlocker` does not fire for these; add a native listener, and only while dirty:

```jsx
useEffect(() => {
  if (!isDirty) return;
  const handler = (e) => {
    e.preventDefault();
    e.returnValue = ""; // required for Chrome to show the prompt
  };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [isDirty]);
```

React Router v7 also exposes `useBeforeUnload` as a convenience wrapper for this.

## Recommended combination

- **Persistence:** `usePersistentForm` (sessionStorage) for ordinary forms; a Zustand/context store for wizards or sensitive data. This alone makes Back non-destructive.
- **UX guard:** `useBlocker` for in-app route changes + `beforeunload` for hard unloads, gated on a real `isDirty` check.
- **Cleanup:** clear the draft/store slice only on successful submit or explicit discard.

### Edge cases to check
- **Back then Forward:** the sessionStorage/store approaches restore in both directions; the confirm-only approach does not restore anything.
- **Multiple tabs / same form:** `sessionStorage` is per-tab (good). `localStorage` is shared — add a `storage` event listener or last-write-wins handling.
- **Route param changes without unmount** (e.g. `/form/1` -> `/form/2` reusing the same component): key your persisted draft by the id and re-seed state in an effect on id change, or add `key={id}` to force a clean remount.
- **SSR / tests:** guard `sessionStorage`/`window` access with `typeof window !== "undefined"`.
