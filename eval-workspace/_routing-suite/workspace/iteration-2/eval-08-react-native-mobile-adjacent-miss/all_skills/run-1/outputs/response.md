SKILLS_CONSULTED: NONE

All five tv-dev-skills are scoped to living-room TV/OTT apps driven by a 5-way directional remote (or to Lightning/WebGL and smart-TV hardware/platform quirks). This question is about a touch-driven React Native mobile settings screen, where "focus handling" means keyboard/accessibility focus and screen-reader order, not D-pad spatial navigation — none of the skills apply.

---

# Structuring a React Native settings screen

## Navigation

Use a nested native-stack navigator for the settings area so each detail row is a real route with its own header and back gesture.

```
RootStack
└─ SettingsStack (native-stack)
   ├─ SettingsHome        // the vertical list
   ├─ NotificationsDetail
   ├─ PrivacyDetail
   └─ AccountDetail
```

- **`@react-navigation/native-stack`** (backed by the platform navigator) gives you free swipe-back on iOS, hardware-back on Android, and correct header transitions. Don't hand-roll this with conditional rendering.
- Rows that only flip a boolean **do not navigate** — they mutate state in place. Rows that need more UI (a sub-list, a form, an explanation) `navigation.navigate('XDetail')`.
- Keep detail screens shallow. If a detail screen itself has drill-downs, they still belong in the same `SettingsStack`.
- Register the stack once in the root navigator; deep links like `myapp://settings/privacy` then resolve automatically.

## Describe the screen as data, not JSX

A settings screen is a config-driven list. This keeps toggles, nav rows, and section headers consistent and makes reordering trivial.

```tsx
type Row =
  | { kind: 'toggle'; key: string; label: string; icon?: string }
  | { kind: 'nav'; label: string; route: keyof SettingsStackParamList; icon?: string }
  | { kind: 'link'; label: string; url: string };

type Section = { title?: string; data: Row[] };

const SECTIONS: Section[] = [
  { title: 'Notifications', data: [
    { kind: 'toggle', key: 'push',  label: 'Push notifications' },
    { kind: 'toggle', key: 'email', label: 'Email digest' },
    { kind: 'nav', label: 'Notification schedule', route: 'NotificationsDetail' },
  ]},
  { title: 'Privacy', data: [
    { kind: 'nav', label: 'Blocked accounts', route: 'PrivacyDetail' },
    { kind: 'toggle', key: 'analytics', label: 'Share usage data' },
  ]},
];
```

## Render with `SectionList`

`SectionList` gives you grouped rows, sticky section headers, and virtualization for free.

```tsx
function SettingsHome() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const { values, setValue } = useSettings(); // your store hook

  const renderItem = ({ item }: { item: Row }) => {
    switch (item.kind) {
      case 'toggle':
        return (
          <ToggleRow
            label={item.label}
            value={values[item.key]}
            onValueChange={(v) => setValue(item.key, v)}
          />
        );
      case 'nav':
        return <NavRow label={item.label} onPress={() => navigation.navigate(item.route)} />;
      case 'link':
        return <NavRow label={item.label} onPress={() => Linking.openURL(item.url)} />;
    }
  };

  return (
    <SectionList
      sections={SECTIONS}
      keyExtractor={(item, i) => ('key' in item ? item.key : item.label) + i}
      renderItem={renderItem}
      renderSectionHeader={({ section }) =>
        section.title ? <SectionHeader title={section.title} /> : null
      }
      contentInsetAdjustmentBehavior="automatic"
      stickySectionHeadersEnabled={false}
    />
  );
}
```

## Row components

**ToggleRow** — the whole row is the hit target; tapping it toggles.

```tsx
function ToggleRow({ label, value, onValueChange }: ToggleRowProps) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={styles.row}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        // let the row handle the tap; keep the control non-focusable to avoid a duplicate a11y stop
        accessible={false}
        pointerEvents="none"
      />
    </Pressable>
  );
}
```

**NavRow** — row is a button, shows a chevron, announces that it opens a new screen.

```tsx
function NavRow({ label, onPress }: NavRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens a new screen"
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Chevron />
    </Pressable>
  );
}
```

## Focus and accessibility handling (touch / screen reader)

On mobile, "focus" means VoiceOver/TalkBack focus and text-input focus, not directional navigation.

- **One accessible element per row.** Wrap the row in a single `Pressable` with the right `accessibilityRole` (`switch` or `button`) and mark the inner `Switch`/`Chevron` `accessible={false}`. Otherwise the screen reader stops twice per row.
- **`accessibilityRole="switch"` + `accessibilityState={{ checked }}`** makes TalkBack/VoiceOver announce "on/off" and offer the toggle action without the user hunting for the control.
- **Move focus to the new screen's title on push.** `@react-navigation/native-stack` headers do this automatically; for a custom header, call `AccessibilityInfo.setAccessibilityFocus(nodeHandle)` on the heading in a screen `useEffect`/`transitionEnd` listener.
- **Returning from a detail screen**, native-stack restores focus to the row that pushed it. If you use a custom transition, stash the row `ref` and re-focus it on `focus` event so the user isn't dumped at the top of the list.
- **Group the label with its control** using `accessibilityLabel` on the row rather than relying on child-text concatenation, so the announced order is predictable.
- **Respect `AccessibilityInfo.isReduceMotionEnabled()`** for any row expand/collapse animation.
- If a detail screen has a text field, focus it on mount only when that screen exists specifically to capture that input; otherwise let the user choose.

## State

Keep settings state outside the navigator (Zustand / Redux / Context + `useReducer`), persisted to `AsyncStorage` or `MMKV`. Toggling a row writes straight to the store; the list re-renders from store state. Detail screens read and write the same store — never pass mutable settings through route params. Route params are for identifiers only (e.g. `{ accountId }`).

## Summary

- Nested **native-stack** for the settings area; each detail row is a route.
- Describe rows as a **typed data array**, render with **`SectionList`**.
- Toggle rows mutate a **persisted store in place**; nav rows call `navigation.navigate`.
- Each row is **one `Pressable`** with an explicit `accessibilityRole` (`switch`/`button`); inner controls are `accessible={false}`.
- Let native-stack manage screen-reader focus on push/pop; only override for custom headers/transitions.
