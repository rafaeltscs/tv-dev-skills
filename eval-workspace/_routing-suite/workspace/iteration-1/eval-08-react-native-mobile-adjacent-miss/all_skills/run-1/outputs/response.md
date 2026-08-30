SKILLS_CONSULTED: NONE

Why: All five plugin skills target TV/OTT apps — Lightning renderers, or a directional-remote (d-pad/OK/Back) input model and low-end TV hardware/platform quirks — none of which applies to a touch-driven React Native mobile settings screen, where "focus" means accessibility/screen-reader focus and React Navigation screen re-focus, not spatial remote navigation.

---

# A clean structure for a React Native settings screen

Two concerns, kept separate: (1) navigation between the list and its detail screens, (2) "focus" handling, which on mobile means accessibility focus and React Navigation's screen focus lifecycle — not d-pad navigation.

## 1. Navigation

### Use a dedicated native-stack navigator for the settings flow

```tsx
// SettingsNavigator.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  SettingDetail: { key: SettingKey };   // pass an id/key, never objects or callbacks
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerLargeTitle: true }}>
      <Stack.Screen name="SettingsHome" component={SettingsHomeScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="SettingDetail" component={SettingDetailScreen} />
    </Stack.Navigator>
  );
}
```

Nest this navigator wherever settings lives (a tab, a modal stack, or the root). `native-stack` gives you platform-native push transitions, swipe-back, and header behavior for free.

Rules that keep it clean:
- Push detail screens with `navigation.navigate('SettingDetail', { key })`. Pass only a serializable id/key. The detail screen selects its own data from the store — this keeps params serializable (deep linking, state persistence) and avoids stale closures.
- Toggle rows never navigate. Only "link" rows push.

### Make the list data-driven

Describe the screen as data, then render it generically. This is what keeps a settings screen maintainable as it grows.

```tsx
type Row =
  | { kind: 'toggle'; key: SettingKey; label: string; subtitle?: string }
  | { kind: 'link'; key: SettingKey; label: string; value?: string }
  | { kind: 'action'; key: SettingKey; label: string; destructive?: boolean };

type Section = { title?: string; data: Row[] };

const SECTIONS: Section[] = [
  { title: 'General', data: [
      { kind: 'toggle', key: 'notifications', label: 'Notifications' },
      { kind: 'toggle', key: 'haptics', label: 'Haptic feedback' },
      { kind: 'link',   key: 'language', label: 'Language', value: currentLanguageLabel },
  ]},
  { title: 'Account', data: [
      { kind: 'link',   key: 'profile', label: 'Profile' },
      { kind: 'action', key: 'signOut', label: 'Sign out', destructive: true },
  ]},
];
```

Render with `SectionList` (grouped rows + section headers are exactly its shape):

```tsx
function SettingsHomeScreen() {
  return (
    <SectionList
      sections={SECTIONS}
      keyExtractor={(row) => row.key}
      renderSectionHeader={({ section }) =>
        section.title ? <SectionHeader title={section.title} /> : null}
      renderItem={({ item }) => <SettingRow row={item} />}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    />
  );
}
```

### One component per row kind

```tsx
function SettingRow({ row }: { row: Row }) {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  switch (row.kind) {
    case 'toggle': {
      const value = useSettings((s) => s.values[row.key] as boolean);
      const setValue = useSettings((s) => s.set);
      return (
        <RowContainer
          accessibilityRole="switch"
          accessibilityLabel={row.label}
          accessibilityState={{ checked: value }}
          onPress={() => setValue(row.key, !value)}   // whole row toggles
        >
          <RowText title={row.label} subtitle={row.subtitle} />
          <Switch
            value={value}
            onValueChange={(v) => setValue(row.key, v)}
            // let the row own the press; keep the switch itself out of the a11y tree
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </RowContainer>
      );
    }
    case 'link':
      return (
        <RowContainer
          accessibilityRole="button"
          accessibilityHint={`Opens ${row.label} settings`}
          onPress={() => navigation.navigate('SettingDetail', { key: row.key })}
        >
          <RowText title={row.label} />
          <RowTrailing value={row.value} chevron />
        </RowContainer>
      );
    case 'action':
      return (
        <RowContainer
          accessibilityRole="button"
          onPress={() => runAction(row.key)}
        >
          <RowText title={row.label} destructive={row.destructive} />
        </RowContainer>
      );
  }
}
```

`RowContainer` is a single `Pressable` with a consistent min height (44pt iOS / 48dp Android), hitSlop, and pressed style. Every row is one touch target.

### State lives in a store, not in row components

Put settings values in a small store (Zustand shown; Context + `useReducer` is fine too) with persistence (MMKV or AsyncStorage):

```tsx
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      values: DEFAULTS,
      set: (key, value) => set((s) => ({ values: { ...s.values, [key]: value } })),
    }),
    { name: 'settings', storage: createJSONStorage(() => mmkvStorage) },
  ),
);
```

Why: toggles must persist, and a value changed on a detail screen has to be reflected on the list when you pop back. If rows hold local `useState`, they won't. With a store, the list re-renders automatically — no manual refresh on focus needed.

If a setting write is async (server round-trip), update the store optimistically, then roll back on failure and surface an error.

## 2. Focus handling

### Screen focus (React Navigation lifecycle)

- If a detail screen changes something the list can't derive from the store (e.g. it triggers a permission prompt, or reads a value from the OS), refresh it when the list regains focus:

  ```tsx
  useFocusEffect(useCallback(() => {
    refreshOsBackedValues();
  }, []));
  ```

- Use `useIsFocused()` to pause expensive work (subscriptions, timers) while the screen is covered by a pushed detail screen.
- With a store-backed list, ordinary toggle values need none of this — they update reactively.

### Accessibility focus (this is what "focus" means here)

- Each row exposes the right semantics: `accessibilityRole="switch"` + `accessibilityState={{ checked }}` for toggles, `accessibilityRole="button"` + `accessibilityHint` for links. Collapse the row into a single focusable element (hide the inner `<Switch>` from the a11y tree, as above) so a screen-reader user swipes once per setting.
- On screen entry, let the native-stack header take initial screen-reader focus (default). Only call `AccessibilityInfo.setAccessibilityFocus(reactTag)` manually if you have a specific reason to move it (e.g. after a destructive action, focus a confirmation).
- Announce out-of-band changes with `AccessibilityInfo.announceForAccessibility(...)` — e.g. "Notifications turned off".
- Respect `AccessibilityInfo.isReduceMotionEnabled()` for any custom row animations.

### Hardware keyboard / external input (optional)

Only relevant if you support Bluetooth keyboards or Android d-pad on tablets/foldables. `FlatList`/`SectionList` handle arrow scrolling. For explicit tab order on Android, set `focusable`, `nextFocusDown`/`nextFocusUp` on `RowContainer`. Do not reach for `hasTVPreferredFocus` or `TVEventHandler` — those are react-native-tvos APIs and don't apply to a standard mobile build.

## Summary

- One `native-stack` navigator: `SettingsHome` + `SettingDetail`, params are keys only.
- List is a `SectionList` driven by a typed `Row[]` config; one component per row kind.
- Settings values in a persisted store; toggles read/write the store so state survives navigation and app restarts.
- Toggle rows toggle on row press and never navigate; link rows push detail.
- "Focus" work is: `useFocusEffect`/`useIsFocused` for the navigation lifecycle, and proper `accessibilityRole`/`accessibilityState` plus single-focusable rows for screen readers.
