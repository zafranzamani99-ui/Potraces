# Dark Mode & Light Mode: Comprehensive Research for React Native / Expo

> Deep-dive research compiled May 2026. Covers color system architecture, RN/Expo specifics, pitfalls, performance, real-world patterns, accessibility, and transitions.

---

## 1. Color System Architecture

### 1.1 The Full Token Hierarchy

Modern design systems use a **3-tier token architecture**:

```
┌─────────────────────────────────────────────────┐
│  TIER 1: Primitive (Raw) Tokens                 │
│  Raw color values. Never used directly in UI.   │
│  e.g. blue-500: #3B82F6, gray-900: #111827      │
├─────────────────────────────────────────────────┤
│  TIER 2: Semantic (Alias) Tokens                │
│  Named by PURPOSE, not by color.                │
│  Value changes per theme. Name stays constant.  │
│  e.g. color-surface-base, color-text-primary,   │
│       color-interactive-default                  │
├─────────────────────────────────────────────────┤
│  TIER 3: Component Tokens                       │
│  Per-component customization. Reference          │
│  semantic tokens as defaults.                    │
│  e.g. button-bg-primary, card-border-color      │
└─────────────────────────────────────────────────┘
```

**Key insight**: "Dark is not a variant of light — it is a first-class design system context with its own visual logic, its own elevation language, and its own token architecture." (Muzli)

Components should ONLY reference semantic or component tokens, never primitive tokens directly. When you switch modes, the semantic token resolves to a different primitive — the component code never changes.

#### shadcn/ui Pattern (Industry Best Practice)

shadcn/ui uses **semantic background/foreground pairs**:

```css
/* Light mode */
:root {
  --background: oklch(1 0 0);        /* white */
  --foreground: oklch(0.145 0 0);    /* near-black */
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0.006 285.885);
  --primary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.97 0.001 286.375);
  --muted-foreground: oklch(0.556 0.003 286.033);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0.004 286.032);
  --ring: oklch(0.871 0.006 286.286);
}

/* Dark mode — same token names, different values */
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0.006 285.885);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0.004 286.032);
  --primary-foreground: oklch(0.205 0.006 285.885);
  --muted: oklch(0.269 0.005 285.885);
  --muted-foreground: oklch(0.611 0.004 285.885);
  --border: oklch(0.269 0.005 285.885);
}
```

The rule: **components use `bg-background`, `text-foreground`, etc. — never raw color values. Never manual `dark:` overrides.**

#### Shopify Polaris Token Naming Convention

Polaris uses a structured naming pattern:
```
color-{element}-{role?}-{prominence?}-{state?}

Examples:
  color-bg-surface           (background, surface level)
  color-bg-surface-hover     (+ hover state)
  color-text-primary         (text, primary role)
  color-text-secondary       (text, secondary/muted)
  color-border-input         (border, input context)
  color-icon-emphasis        (icon, emphasis role)
```

Polaris builds its global palette using **HSLuv** (Hue, Saturation, Lightness with perceptual uniformity) to ensure consistent perceived lightness across hues.

### 1.2 Apple HIG Dynamic Colors

Apple's system provides **semantic colors** that automatically adapt:

| Semantic Name | Light | Dark |
|---|---|---|
| `systemBackground` | White | #000000 (true black for OLED) |
| `secondarySystemBackground` | #F2F2F7 | #1C1C1E |
| `tertiarySystemBackground` | #FFFFFF | #2C2C2E |
| `label` (primary text) | #000000 | #FFFFFF |
| `secondaryLabel` | #3C3C43 60% | #EBEBF5 60% |
| `separator` | #3C3C43 29% | #545458 60% |
| `systemGroupedBackground` | #F2F2F7 | #000000 |

Apple provides **3 levels of background** (primary, secondary, tertiary) for both grouped and ungrouped contexts, giving 6 background semantic colors that all auto-adapt.

**Liquid Glass (2025+)**: Apple's latest design language emphasizes translucency, depth, and fluid responsiveness — but the foundational semantic color system remains the same.

### 1.3 Material Design 3 Dynamic Color

MD3 uses **tonal palettes** generated from a source color:

- A source color generates a complete **tonal palette** (0–100 lightness scale)
- From this palette, **color roles** are assigned: `primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer`, `surface`, `onSurface`, etc.
- On Android 12+, **Dynamic Color** generates the entire scheme from the user's wallpaper
- The scheme produces both light AND dark variants automatically

**MD3 has 40+ color tokens** organized into roles:
- Primary, Secondary, Tertiary (and their containers/on-colors)
- Surface (with surface-dim, surface-bright, surface-container-lowest through -highest)
- Error, Outline, Shadow, Scrim

### 1.4 Surface Elevation in Dark Mode vs Light Mode

This is one of the most critical differences:

**Light mode**: Higher elevation = **darker shadow cast below** the surface. The surface color itself stays the same. Depth is communicated through shadow.

**Dark mode**: Shadows are invisible on dark backgrounds. Instead, **higher elevation = lighter surface color**. Depth is communicated through luminance.

#### Material Design 2 Elevation Overlay Values

MD2 defined precise overlay opacities for dark theme elevation:

| Elevation | White Overlay Opacity | Resulting Color (on #121212) |
|---|---|---|
| 0dp (base) | 0% | #121212 |
| 1dp | 5% | ~#1E1E1E |
| 2dp | 7% | ~#232323 |
| 3dp | 8% | ~#252525 |
| 4dp | 9% | ~#272727 |
| 6dp | 11% | ~#2C2C2C |
| 8dp | 12% | ~#2E2E2E |
| 12dp | 14% | ~#333333 |
| 16dp | 15% | ~#353535 |
| 24dp | 16% | ~#383838 |

The overlay color is `colorOnSurface` (typically white) applied at these alpha percentages.

#### MD3 Approach (Tonal Elevation)

MD3 replaced opacity overlays with **tonal color** from the primary palette:
- `surface-container-lowest` → `surface-container-low` → `surface-container` → `surface-container-high` → `surface-container-highest`
- Each step uses the primary color at increasing tonal values, making elevation feel more brand-integrated

#### Practical Implementation for React Native

```typescript
// Define 4-5 surface levels stepping up 5-8% in luminance
const DARK_SURFACES = {
  base:    '#121212',  // 0dp — app background
  raised:  '#1E1E1E',  // 1dp — cards, sheets
  overlay: '#2C2C2C',  // 6dp — modals, dialogs
  high:    '#333333',  // 12dp — menus, tooltips
  highest: '#383838',  // 24dp — snackbars, FABs
};
```

### 1.5 Shadows in Dark Mode

**The problem**: Drop shadows (dark color on dark background) are invisible in dark mode.

**Solutions by platform**:

| Technique | When to Use |
|---|---|
| **Increase shadow opacity** | 0.1 in light → 0.4+ in dark |
| **Use light-colored glow** | Subtle `rgba(255,255,255,0.05)` shadow |
| **Replace with surface tint** | Lighter bg = higher elevation (MD3 approach) |
| **Add subtle border** | 1px border with `rgba(255,255,255,0.08-0.12)` |
| **Combine approaches** | Border + slight surface lightening |

```typescript
// Dynamic shadow computation
const getShadow = (elevation: number, isDark: boolean) => {
  if (isDark) {
    return {
      // Shadows are nearly invisible in dark mode — supplement with border
      shadowColor: '#000',
      shadowOpacity: 0.4,    // Much higher than light mode
      shadowRadius: elevation * 1.5,
      shadowOffset: { width: 0, height: elevation },
      elevation: elevation,
      // Add visible border as primary depth cue
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
    };
  }
  return {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: elevation,
    shadowOffset: { width: 0, height: elevation / 2 },
    elevation: elevation,
    borderWidth: 0,
  };
};
```

### 1.6 Borders and Dividers

**Light mode**: Borders use dark colors at low opacity — `rgba(0,0,0,0.12)` typical
**Dark mode**: Borders use light colors at low opacity — `rgba(255,255,255,0.08-0.15)` typical

Apple's system:
- Light separator: `#3C3C43` at 29% opacity
- Dark separator: `#545458` at 60% opacity

**Key principle**: In dark mode, borders do MORE work because shadows are invisible. Dividers may need to be slightly more prominent than in light mode.

```typescript
const TOKENS = {
  light: {
    border: 'rgba(0, 0, 0, 0.12)',
    borderStrong: 'rgba(0, 0, 0, 0.24)',
    divider: 'rgba(0, 0, 0, 0.08)',
  },
  dark: {
    border: 'rgba(255, 255, 255, 0.12)',
    borderStrong: 'rgba(255, 255, 255, 0.24)',
    divider: 'rgba(255, 255, 255, 0.08)',
  },
};
```

### 1.7 Images and Illustrations

**Icons**: Use React Native's `tintColor` style property. One icon asset, dynamically colored per theme. Solid, non-transparent pixels get recolored.

**Photos**: Generally need no adjustment. Optional: reduce brightness/opacity slightly in dark mode to avoid eye strain.

**Illustrations with white/light backgrounds**: These will "blow out" in dark mode. Solutions:
1. Provide two versions (light + dark)
2. Add a subtle dark card/container behind them
3. Use vector illustrations with theme-aware colors
4. Add a subtle rounded-rect mask with the dark surface color

**Charts and graphs**: Must use theme-aware colors for axes, gridlines, labels, and data series.

**Shadows in images**: Images with baked-in light-mode shadows look wrong on dark backgrounds — use separate assets or dynamically overlay.

---

## 2. React Native / Expo Specifics

### 2.1 `useColorScheme()` Hook

```typescript
import { useColorScheme } from 'react-native';

const colorScheme = useColorScheme(); // 'light' | 'dark' | null
```

**How it works**: Maps to the user's system-level Light/Dark preference on iOS 13+ and Android 10+ (API 29+).

**Limitations**:
- Returns `null` if the platform doesn't support it
- **iOS background issue**: When the app goes to background, the `Appearance.addChangeListener` fires with a WRONG color scheme value (documented bug, GitHub issue #28525)
- **iOS screenshot issue**: Taking a screenshot causes the color scheme to flicker between light and dark because iOS takes snapshots in both modes
- Does NOT update when the app is in background on iOS — only fires when returning to foreground

**Best practice**: Don't cache the value. Call `useColorScheme()` on every render. The hook handles subscriptions internally.

### 2.2 `Appearance` API (Event Listener)

```typescript
import { Appearance } from 'react-native';

// One-time read
const scheme = Appearance.getColorScheme(); // 'light' | 'dark' | null

// Listen for changes
const subscription = Appearance.addChangeListener(({ colorScheme }) => {
  // colorScheme: 'light' | 'dark' | null
  // WARNING: Fires with wrong value when app goes to background on iOS
});

// Cleanup
subscription.remove();
```

**Prefer `useColorScheme()` hook** over raw event listeners — it handles the subscription lifecycle and causes proper re-renders.

### 2.3 System Preference vs User Override (3 States)

The standard pattern: user can choose `'light'`, `'dark'`, or `'system'` (follow device):

```typescript
// In your settings store (Zustand example)
interface SettingsState {
  themePreference: 'light' | 'dark' | 'system';
}

// In your theme hook
function useResolvedTheme() {
  const { themePreference } = useSettingsStore();
  const systemScheme = useColorScheme();

  if (themePreference === 'system') {
    return systemScheme ?? 'light'; // fallback if null
  }
  return themePreference;
}
```

### 2.4 StatusBar Handling

```typescript
import { StatusBar } from 'expo-status-bar';
// or
import { StatusBar } from 'react-native';

// Expo approach (simpler)
<StatusBar style={isDark ? 'light' : 'dark'} />

// React Native approach
<StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

// Android-specific: also set background color
<StatusBar
  barStyle={isDark ? 'light-content' : 'dark-content'}
  backgroundColor={isDark ? '#121212' : '#FFFFFF'}
/>
```

**Values**:
- `'light-content'` = white text/icons (use on dark backgrounds)
- `'dark-content'` = dark text/icons (use on light backgrounds)
- `'default'` = platform default

**Gotcha**: On Android, a React Native `Modal` automatically changes StatusBar to `'light-content'` when opened (issue #34350). Must explicitly reset.

### 2.5 NavigationContainer Theme

```typescript
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';

// Custom theme matching your design system
const MyLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#4F5104',       // your brand primary
    background: '#F9F9F7',    // screen backgrounds
    card: '#FFFFFF',          // header/tab bar bg
    text: '#1A1A1A',          // default text
    border: 'rgba(0,0,0,0.12)', // header/tab borders
    notification: '#B2780A',  // badge color
  },
};

const MyDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#8B9A2B',       // lighter version of brand
    background: '#121212',
    card: '#1E1E1E',
    text: '#F0EDE8',
    border: 'rgba(255,255,255,0.12)',
    notification: '#DEAB22',
  },
};

// In your app root
<NavigationContainer theme={isDark ? MyDarkTheme : MyLightTheme}>
  {/* ... */}
</NavigationContainer>
```

**What this controls automatically**:
- Screen background colors
- Header background and text colors
- Tab bar background and icon colors
- Default border colors on headers
- Navigation card backgrounds

### 2.6 Expo Configuration

In `app.json` / `app.config.js`:

```json
{
  "expo": {
    "userInterfaceStyle": "automatic",
    "ios": {
      "userInterfaceStyle": "automatic"
    },
    "android": {
      "userInterfaceStyle": "automatic"
    },
    "splash": {
      "image": "./assets/splash.png",
      "backgroundColor": "#F9F9F7"
    },
    "android": {
      "splash": {
        "image": "./assets/splash.png",
        "backgroundColor": "#F9F9F7",
        "dark": {
          "image": "./assets/splash-dark.png",
          "backgroundColor": "#121212"
        }
      }
    }
  }
}
```

**`userInterfaceStyle` values**:
- `"automatic"` — follow system (recommended default)
- `"light"` — force light mode at native level
- `"dark"` — force dark mode at native level

**Note**: `"automatic"` is the default in new Expo projects. Setting it to `"light"` or `"dark"` restricts at the native level, which means `useColorScheme()` will always return that value.

### 2.7 Reanimated Color Interpolation for Smooth Transitions

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';

function ThemedView({ children }) {
  const progress = useSharedValue(isDark ? 1 : 0);

  // Animate on theme change
  useEffect(() => {
    progress.value = withTiming(isDark ? 1 : 0, { duration: 300 });
  }, [isDark]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['#F9F9F7', '#121212']  // light bg → dark bg
    ),
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}
```

**Limitation**: This animates individual components. For a full-app transition, you need a wrapper approach or the `react-native-theme-switch-animation` library.

---

## 3. Common Pitfalls & Anti-Patterns

### 3.1 Hardcoded Colors

**Anti-pattern**:
```typescript
// ❌ Colors scattered through components
<View style={{ backgroundColor: '#FFFFFF' }}>
  <Text style={{ color: '#333333' }}>Hello</Text>
</View>
```

**Fix**: All colors must come from the theme/token system:
```typescript
// ✅ All colors from theme
const C = useCalm(); // returns CALM or CALM_DARK
<View style={{ backgroundColor: C.surface }}>
  <Text style={{ color: C.textPrimary }}>Hello</Text>
</View>
```

### 3.2 Pure Black (#000000) in Dark Mode

**Why it's bad**:
- Pure black on pure white = 21:1 contrast ratio (too harsh, causes halation)
- On OLED screens, pure black next to lit pixels creates a visible "smearing" effect during scrolling
- Apple uses true black for base backgrounds on iPhone (OLED) but elevated surfaces are always gray (#1C1C1E, #2C2C2E)
- Material Design recommends #121212 as the base dark surface color
- Dark gray (#1A1A1A) on off-white (#F5F5F5) achieves ~12:1 (ideal contrast)

**OLED battery savings myth**: Pure black (#000000) saves less than 1% additional battery over dark gray (#121212) on AMOLED screens. Not worth the UX tradeoff.

**Recommended base dark colors**:
- `#121212` (Material Design standard)
- `#1A1A1A` (slightly warmer)
- `#0F0F0F` (if you want very dark but not pure black)
- For warm palettes: tint the dark base slightly warm (e.g., `#161412`)

### 3.3 Opacity/Alpha Values Differ Between Modes

**The problem**: `rgba(0, 0, 0, 0.6)` overlay on a white background looks like medium gray. The same `0.6` opacity on a dark background is nearly invisible.

**Fix**: Define opacity tokens per mode:

```typescript
const TOKENS = {
  light: {
    overlayDim: 'rgba(0, 0, 0, 0.4)',
    textSecondary: 'rgba(0, 0, 0, 0.6)',
    textDisabled: 'rgba(0, 0, 0, 0.38)',
  },
  dark: {
    overlayDim: 'rgba(0, 0, 0, 0.6)',      // needs MORE opacity to dim
    textSecondary: 'rgba(255, 255, 255, 0.6)',
    textDisabled: 'rgba(255, 255, 255, 0.38)',
  },
};
```

Material Design dark mode text hierarchy:
- High emphasis: 87% white opacity
- Medium emphasis: 60% white opacity
- Disabled: 38% white opacity

### 3.4 Images/Icons That Only Work on Light Backgrounds

**Symptoms**: Black icons on dark background = invisible. Illustrations with white backgrounds = blinding.

**Fixes**:
- Use `tintColor` on `Image` for monochrome icons — dynamically set per theme
- Provide dark variants for illustrations
- Wrap images in themed containers
- For logos, keep both light and dark variants

### 3.5 Module-level StyleSheet.create with Hardcoded Colors

**Anti-pattern**:
```typescript
// ❌ Created once at module load — can never change
const styles = StyleSheet.create({
  container: { backgroundColor: '#FFFFFF' },
  text: { color: '#333333' },
});
```

**Fix**: The `makeStyles` pattern:
```typescript
// ✅ Function that creates styles from theme
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { backgroundColor: C.surface },
  text: { color: C.textPrimary },
});

function MyComponent() {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  // ...
}
```

### 3.6 Forgetting to Theme Modals, Alerts, Action Sheets, Pickers

These are commonly overlooked:
- **Modals**: Background color, overlay opacity
- **Alert.alert()**: Uses system theme on iOS (automatic), but custom alerts need manual theming
- **Action sheets**: System ones auto-theme, custom ones don't
- **Date/time pickers**: iOS pickers have `themeVariant` prop; Android follows system
- **Bottom sheets**: Need explicit background color from theme
- **Toast/snackbar**: Often hardcoded white

### 3.7 StatusBar Not Matching Theme

**Symptom**: Dark mode active but status bar text is dark (invisible against dark bg).

**Fix**: Always synchronize StatusBar with theme:
```typescript
<StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
```

### 3.8 Keyboard Appearance Not Matching

**iOS**: Use `keyboardAppearance` prop on TextInput:
```typescript
<TextInput
  keyboardAppearance={isDark ? 'dark' : 'light'}
  // ...
/>
```

**Android**: The keyboard follows the system theme automatically. `keyboardAppearance` is iOS-only. The only reliable cross-platform approach is to set `keyboardAppearance` conditionally on iOS.

### 3.9 Text Selection / Cursor Color

```typescript
<TextInput
  selectionColor={isDark ? 'rgba(139, 154, 43, 0.4)' : 'rgba(79, 81, 4, 0.3)'}
  cursorColor={isDark ? '#8B9A2B' : '#4F5104'}
  // cursorColor is RN 0.70+ — sets cursor independently of selection
/>
```

---

## 4. Performance Patterns

### 4.1 Re-render Cost of Theme Changes

Theme change = every visible component re-renders. This is unavoidable but manageable.

**Key question**: How many components re-render, and how expensive is each re-render?

### 4.2 useMemo for Styles vs StyleSheet.create

| Approach | Pros | Cons |
|---|---|---|
| `StyleSheet.create` (static) | Validated once, no re-creation cost | Cannot respond to theme changes |
| `useMemo(() => makeStyles(C), [C])` | Re-creates only when theme changes | Slight cost on theme switch |
| Inline styles `{{ color: C.text }}` | Simplest, always current | New object every render, no RN optimization |

**Recommended**: The `makeStyles` + `useMemo` pattern:

```typescript
// Outside component — no re-creation on re-render
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { backgroundColor: C.bg, padding: 16 },
  title: { color: C.textPrimary, fontSize: 18 },
});

// Inside component — re-created only when C changes
function Screen() {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Title</Text>
    </View>
  );
}
```

**Why this works**: `StyleSheet.create` validates the style object and sends it to native once. `useMemo` ensures this only happens when the theme object reference changes (which is only on theme switch). During normal renders, `styles` is the same memoized reference.

### 4.3 Context vs Zustand for Theme State

| Approach | Re-render Scope | Performance |
|---|---|---|
| React Context | All consumers re-render on ANY context value change | Can cause cascading re-renders if context has multiple values |
| Zustand (with selectors) | Only components that select `themePreference` re-render | More surgical — best for large apps |
| useColorScheme() directly | Re-renders calling component only | Lightest, but no user override support |

**Best for Potraces**: Zustand (already using it) with a `useCalm()` hook that reads from `settingsStore.themePreference` + system `useColorScheme()`. This is already the current architecture.

**Optimization**: If you have components that only need the boolean (dark vs light), expose a `useIsDark()` hook that returns just the boolean — prevents re-renders when the full palette object reference changes but the mode is the same.

### 4.4 When Should Styles Be Generated?

**Answer**: Once per theme switch, NOT on every render.

```typescript
// ✅ Generated once per theme switch
const styles = useMemo(() => makeStyles(C), [C]);

// ❌ Generated every render (wasteful)
const styles = makeStyles(C);

// ❌ Generated every render (even worse — new objects)
<View style={{ backgroundColor: C.surface, padding: SPACING.md }}>
```

**Exception**: Inline styles are fine for truly dynamic values (animation progress, user-controlled sizes, etc.) — just not for theme colors that only change on theme switch.

---

## 5. Real-World Patterns from Top Apps

### 5.1 iOS Settings App

- Uses Apple's semantic system colors exclusively
- Background: `systemGroupedBackground` (light gray in light, true black in dark)
- Card/row backgrounds: `secondarySystemGroupedBackground` (white in light, #1C1C1E in dark)
- Separators: system separator color (auto-adjusts opacity per mode)
- Toggle tints: system green (auto-adapts)
- No transition animation — instant swap when system preference changes

### 5.2 Stripe

- Uses a comprehensive design token system for their embedded components
- Tokens: `colorPrimary`, `colorBackground`, `colorText`, `colorDanger`, `colorComponentBackground`, `colorComponentBorder`
- Each merchant customizes their own light + dark token sets via the Appearance API
- Surfaces are layered with subtle borders rather than shadows in dark mode
- Uses LCH-based color tokens for perceptual uniformity

### 5.3 Linear

- One of the best dark mode implementations in production
- Uses a **paired color scale** approach: light and dark modes are designed simultaneously, not as adaptations of each other
- Surface hierarchy in dark mode: carefully stepped luminance values
- Strong brand consistency — accent colors adjust saturation/lightness per mode
- Borders are used as primary depth cues in dark mode (not shadows)
- Uses LCH color space for their token system

### 5.4 Notion

- Dark mode uses a warm dark gray base (not pure black)
- Text hierarchy maintained through opacity: primary 100%, secondary ~60%, faint ~38%
- Uses system-level switching (follows OS preference by default, with manual override)
- Inline content (code blocks, callouts) uses subtle background tinting rather than borders

### 5.5 Tailwind CSS / shadcn/ui (Web Best Practice, Applicable Pattern)

**The pattern that's considered state of the art**:

1. **CSS variables** define all colors (in OKLCH for perceptual uniformity)
2. **Semantic token pairs**: every `--{name}` has a matching `--{name}-foreground`
3. **Dark mode via `.dark` class** on `<html>` — same token names, different values
4. **Components never use raw colors** — always `bg-background`, `text-foreground`, etc.
5. **No `dark:` prefix on components** — the variable system handles everything
6. **Single source of truth**: change a token, everything updates

**React Native equivalent**: Replace CSS variables with a theme object from Zustand, and the `.dark` class with a `useCalm()` hook that returns the right object.

---

## 6. Accessibility Considerations

### 6.1 WCAG Contrast Ratios in Both Modes

**WCAG 2.1 Level AA Requirements**:
| Element | Minimum Ratio |
|---|---|
| Normal text (< 18pt) | 4.5:1 |
| Large text (≥ 18pt or 14pt bold) | 3:1 |
| UI components & graphical objects | 3:1 |
| Decorative / disabled elements | No requirement |

**Critical**: WCAG requires accessible contrast IN BOTH MODES. Having dark mode does NOT exempt you from meeting contrast ratios — each mode must independently pass.

**Common dark mode failures**:
- Muted text on dark surface falls below 4.5:1
- Colored text (brand colors) that works on white but fails on dark gray
- Disabled states that are invisible in dark mode
- Border colors too faint to meet 3:1 against adjacent surfaces

### 6.2 "Increase Contrast" / High Contrast Mode

**iOS**: Users can enable "Increase Contrast" (Settings → Accessibility → Display → Increase Contrast).

**React Native detection**:
```typescript
import { AccessibilityInfo } from 'react-native';

// Query current state
const isHighContrast = await AccessibilityInfo.isDarkerSystemColorsEnabled();

// Listen for changes
AccessibilityInfo.addEventListener('darkerSystemColorsChanged', (isEnabled) => {
  // Adjust your palette for higher contrast
});
```

**What to do when high contrast is enabled**:
- Increase text opacity to 100% (no transparency)
- Make borders more visible
- Increase surface luminance stepping
- Use bolder dividers
- Speed up or skip animations

### 6.3 Reduced Transparency

```typescript
const isReduceTransparency = await AccessibilityInfo.isReduceTransparencyEnabled();

AccessibilityInfo.addEventListener('reduceTransparencyChanged', (isEnabled) => {
  // Replace translucent overlays with opaque backgrounds
  // Replace blur effects with solid colors
});
```

**When enabled**: Replace all `rgba()` transparent overlays with solid opaque colors. Remove blur/vibrancy effects. Use solid backgrounds for headers, tab bars, modals.

### 6.4 Color-Blind Safe Palettes in Both Modes

**8% of men and 0.5% of women** have some form of color vision deficiency.

**Rules**:
- **Never convey meaning with color alone** (WCAG 1.4.1). Always pair with: icon, label, pattern, position, or shape
- Red/green distinction is the most common failure — use shape + color
- For Potraces semantic colors: the Terracotta (#C1694F) vs Olive (#4F5104) distinction works because they differ in both hue AND luminance — not just hue
- Test with simulators: iOS Accessibility Inspector, Android developer tools, or browser extensions

**Safe combinations**: Pair colors that differ in BOTH hue and luminance. Blue/orange and blue/yellow are generally safe for most color vision types.

---

## 7. Transition & Animation

### 7.1 Should Theme Switching Be Animated?

**Industry split**:

| App | Transition |
|---|---|
| iOS (system) | Instant swap |
| Android (system) | Instant swap |
| Telegram | Circular reveal animation (masking) |
| Twitter/X | Instant swap |
| Notion | Instant swap |
| Linear | Instant swap |
| WhatsApp | Instant swap |

**Verdict**: Most production apps use instant swap. Animated transitions are a nice-to-have, not expected. If you do animate, circular reveal (from the toggle button) is the most polished option.

### 7.2 Animation Options for React Native

**Option A: Instant Swap (Recommended)**
```typescript
// Just change the store value — all components re-render with new colors
settingsStore.setState({ themePreference: 'dark' });
```

**Option B: Circular Reveal Animation**
```bash
npm install react-native-theme-switch-animation
```

```typescript
import { switchTheme } from 'react-native-theme-switch-animation';

switchTheme({
  switchThemeFunction: () => {
    settingsStore.setState({ themePreference: isDark ? 'light' : 'dark' });
  },
  animationConfig: {
    type: 'circular',
    duration: 500,
    startingPoint: { cx: buttonX, cy: buttonY },
  },
});
```

**Option C: Cross-fade with Reanimated**
```typescript
// Shared value drives all animated colors
const progress = useSharedValue(0);
progress.value = withTiming(1, { duration: 300 });
// Use interpolateColor for each color property
```

### 7.3 Preventing Flash of Wrong Theme on App Launch

**The "White Flash of Death"**:
1. Native splash screen shows
2. JS bundle loads — no theme info yet
3. App defaults to light theme (white flash)
4. AsyncStorage resolves → switches to dark

**Solutions (in order of effectiveness)**:

**1. Use MMKV instead of AsyncStorage (best)**
```typescript
import { MMKV } from 'react-native-mmkv';
const storage = new MMKV();

// SYNCHRONOUS read — no flash
const theme = storage.getString('themePreference') ?? 'system';
```

MMKV is synchronous, so the theme is available BEFORE the first render. No async gap = no flash.

**2. Match splash screen to dark theme**
```json
// app.json
{
  "splash": {
    "backgroundColor": "#121212",  // dark bg
    "dark": {
      "backgroundColor": "#121212"
    }
  }
}
```

**3. Hold splash screen until theme resolves**
```typescript
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

// After theme is loaded from storage
SplashScreen.hideAsync();
```

**4. Set NavigationContainer background to match**
```typescript
// Match the native splash screen color
<NavigationContainer
  theme={{
    ...theme,
    colors: { ...theme.colors, background: '#121212' },
  }}
>
```

### 7.4 Respecting Accessibility for Transitions

```typescript
import { AccessibilityInfo } from 'react-native';

const isReduceMotion = await AccessibilityInfo.isReduceMotionEnabled();

if (isReduceMotion) {
  // Instant swap — no animation
  switchTheme();
} else {
  // Animated transition
  switchThemeAnimated({ duration: 400 });
}
```

---

## Appendix A: Complete Checklist for Dark Mode Implementation

### Foundation
- [ ] Define 3-tier token system (primitive → semantic → component)
- [ ] Both modes designed as first-class (not dark as an afterthought)
- [ ] All colors referenced through semantic tokens, never hardcoded
- [ ] Theme state in Zustand with `'light' | 'dark' | 'system'`

### Surfaces & Depth
- [ ] 4-5 surface elevation levels defined for dark mode
- [ ] Shadows adjusted: higher opacity OR replaced with borders/surface tint
- [ ] Divider/border colors swap appropriately
- [ ] Card backgrounds use raised surface, not base

### System Integration
- [ ] `app.json` → `userInterfaceStyle: "automatic"`
- [ ] Dark splash screen configured
- [ ] StatusBar `barStyle` matches theme
- [ ] NavigationContainer theme prop set
- [ ] KeyboardAppearance on TextInputs matches theme
- [ ] Selection/cursor colors match theme

### Components
- [ ] Every Modal background themed
- [ ] Every bottom sheet background themed
- [ ] Toast/snackbar themed
- [ ] Empty states themed
- [ ] Loading skeletons themed
- [ ] Icons use `tintColor` from theme

### Performance
- [ ] `makeStyles(C)` + `useMemo` pattern (not inline styles)
- [ ] MMKV for synchronous theme persistence (no flash)
- [ ] Splash screen held until theme resolves

### Accessibility
- [ ] All text passes 4.5:1 contrast in BOTH modes
- [ ] UI components pass 3:1 contrast in BOTH modes
- [ ] High contrast mode detected and responded to
- [ ] Reduce transparency mode replaces translucent elements
- [ ] Reduce motion skips theme transition animations
- [ ] Color never conveys meaning alone (always + icon/label/shape)

### Testing
- [ ] Test both modes on physical iOS device
- [ ] Test both modes on physical Android device
- [ ] Test system → manual override → system cycling
- [ ] Test mode switch while on different screens
- [ ] Test modals/sheets open during mode switch
- [ ] Verify splash → app transition in both modes
- [ ] Run contrast checker on all text/bg combinations in both modes

---

## Appendix B: Potraces-Specific Recommendations

Given Potraces' existing architecture (`useCalm()`, `CALM/CALM_DARK`, `makeStyles` pattern, Zustand with `settingsStore`):

1. **Already well-architected**: The `useCalm()` / `makeStyles` / `useMemo` pattern is correct and matches industry best practice.

2. **Consider MMKV migration**: Replace AsyncStorage with MMKV for the settings store specifically, to eliminate the white flash on dark mode startup. The `zustand-mmkv-storage` adapter makes this straightforward.

3. **Audit shadow behavior**: Go through all cards/surfaces and verify shadows are visible in dark mode. Add `borderWidth: 1` + `borderColor: withAlpha(CALM_DARK.textPrimary, 0.08)` as a dark mode depth cue.

4. **Audit contrast ratios**: Verify that `CALM_DARK.textSecondary` on `CALM_DARK.surface` meets 4.5:1. Same for `CALM_DARK.textMuted` on both `bg` and `surface`.

5. **Add `keyboardAppearance`**: Every `TextInput` should get `keyboardAppearance={isDark ? 'dark' : 'light'}`.

6. **Add `selectionColor` / `cursorColor`**: Match to theme accent color.

7. **Dark splash screen**: Configure in `app.json` → `android.splash.dark` and `ios.splash.dark`.

8. **NavigationContainer theme**: Ensure the navigation theme colors match `CALM_DARK` values exactly.

9. **Respond to accessibility**: Add listeners for `isDarkerSystemColorsEnabled` and `isReduceTransparencyEnabled` to optionally tighten contrast and remove blur/transparency effects.

---

## Sources

### Apple & Material Design
- [Apple HIG: Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
- [Apple HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [Apple: Supporting Dark Mode in Your Interface](https://developer.apple.com/documentation/uikit/supporting-dark-mode-in-your-interface)
- [Material Design 2: Dark Theme](https://m2.material.io/design/color/dark-theme.html)
- [Material Design 3: Color System](https://m3.material.io/styles/color/system/overview)

### React Native & Expo
- [React Native: Appearance API](https://reactnative.dev/docs/appearance)
- [React Native: TextInput](https://reactnative.dev/docs/textinput)
- [React Native: AccessibilityInfo](https://reactnative.dev/docs/0.77/accessibilityinfo)
- [Expo: Color Themes](https://docs.expo.dev/develop/user-interface/color-themes/)
- [Expo: app.json Configuration](https://docs.expo.dev/versions/latest/config/app/)
- [Expo: SplashScreen](https://docs.expo.dev/versions/latest/sdk/splash-screen/)
- [React Navigation: Themes](https://reactnavigation.org/docs/themes/)
- [react-native-reanimated: interpolateColor](https://docs.swmansion.com/react-native-reanimated/docs/utilities/interpolateColor/)
- [react-native-mmkv](https://github.com/mrousavy/react-native-mmkv)
- [react-native-theme-switch-animation](https://github.com/WadhahEssam/react-native-theme-switch-animation)

### Design System Token Architecture
- [Dark Mode Design Systems: Complete Guide (Muzli)](https://muz.li/blog/dark-mode-design-systems-a-complete-guide-to-patterns-tokens-and-hierarchy/)
- [Color Tokens Guide to Light and Dark Modes (Medium)](https://medium.com/design-bootcamp/color-tokens-guide-to-light-and-dark-modes-in-design-systems-146ab33023ac)
- [Shopify Polaris: Color Tokens](https://polaris-react.shopify.com/design/colors/color-tokens)
- [Shopify Polaris: Palettes and Roles](https://polaris-react.shopify.com/design/colors/palettes-and-roles)
- [shadcn/ui: Theming](https://ui.shadcn.com/docs/theming)

### Production Implementation Patterns
- [How Production Apps Handle Dark Mode in React Native (Silversky)](https://silverskytechnology.com/how-production-apps-handle-dark-mode-in-react-native/)
- [Implementing Dark Mode in React Native (Thoughtbot)](https://thoughtbot.com/blog/react-native-dark-mode)
- [The White Flash of Death: Solving Theme Flickering (Medium)](https://medium.com/@ripenapps-technologies/the-white-flash-of-death-solving-theme-flickering-in-react-native-production-apps-d732af3b4cae)
- [Smooth Theme Transition Animations (Medium)](https://medium.com/@wadahesam/smooth-dark-light-theme-transition-animations-in-react-native-17c0632ecec4)
- [React Native Dark Mode Icons with tintColor (Medium)](https://medium.com/@r.mataityte/react-native-dark-mode-icons-made-easy-with-tintcolor-77aad2e8a265)
- [zustand-mmkv-storage](https://github.com/1mehdifaraji/zustand-mmkv-storage)

### Accessibility
- [WebAIM: Contrast and Color Accessibility](https://webaim.org/articles/contrast/)
- [WCAG 2.1: Contrast Minimum (W3C)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [Color Contrast Accessibility Guide 2025 (AllAccessible)](https://www.allaccessible.org/blog/color-contrast-accessibility-wcag-guide-2025)
- [Dark Mode Best Practices for Accessibility (DubBot)](https://dubbot.com/dubblog/2023/dark-mode-a11y.html)

### Design Philosophy
- [Why Linear Design Systems Break in Dark Mode](https://chyshkala.com/blog/why-linear-design-systems-break-in-dark-mode-and-how-to-fix-them)
- [Designing Semantic Colors for Your System (Imperavi)](https://imperavi.com/blog/designing-semantic-colors-for-your-system/)
- [Atlassian Design: Elevation](https://atlassian.design/foundations/elevation)
- [A Guide to Dark Mode Design (James Robinson)](https://www.jamesrobinson.io/post/a-guide-to-dark-mode-design)
