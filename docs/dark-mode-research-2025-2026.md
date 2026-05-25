# Dark Mode / Light Mode: Deep Research Report (2025-2026)

Compiled May 2026. Covers cutting-edge techniques, libraries, color science, design system case studies, platform changes, performance, and testing.

---

## 1. React Native / Expo Dark Mode Libraries & Approaches

### 1.1 The Library Landscape (2025-2026)

| Library | Version | Approach | Key Advantage |
|---------|---------|----------|---------------|
| `react-native-unistyles` | v3 (Nitro) | C++ Shadow Tree | **Zero re-renders** on theme change |
| `Uniwind` (+ Pro) | v1+ | Tailwind + C++ engine | NativeWind alternative with zero-rerender Pro tier |
| `NativeWind` | v5 | Tailwind CSS v4 + `prefers-color-scheme` | CSS variables, familiar Tailwind API |
| `react-native-paper` | v5.x | Material Design 3 | Built-in `adaptiveTheme`, MD3 dark/light schemes |
| `react-native-theme-switch-animation` | 0.8.x | Screenshot + circular reveal | Plug & play, works with any state manager |
| `react-native-edge-to-edge` | latest | Android 15 transparent bars | Required for SDK 35 targeting |
| `expo-system-ui` | SDK 53+ | `setBackgroundColorAsync` | Native-level background before JS loads |
| `expo-splash-screen` | SDK 53+ | Plugin with `dark` config | Per-appearance splash screens |
| `react-native-mmkv` | v3.x | Synchronous KV store | ~30x faster than AsyncStorage, no flash |
| `zustand-mmkv-storage` | 1.0+ | Zustand persist adapter | Synchronous hydration, `hasHydrated` flag |
| `react-native-material-you-colors` | latest | Material You palettes | Cross-platform dynamic color from seed |
| `expo-material3-theme` | latest | MD3 dynamic theme | Android 12+ dynamic colors with iOS fallback |

### 1.2 Preventing the "White Flash of Death"

The white flash occurs because there's a gap between native splash screen (white bg) and JS-side theme initialization. The fix is a 3-layer defense:

**Layer 1 - Native level (before JS loads):**
```json
// app.json / app.config.js
{
  "expo": {
    "backgroundColor": "#121212",
    "plugins": [
      ["expo-splash-screen", {
        "backgroundColor": "#F9F9F7",
        "image": "./assets/splash-icon.png",
        "dark": {
          "image": "./assets/splash-icon-dark.png",
          "backgroundColor": "#121212"
        },
        "imageWidth": 200
      }]
    ]
  }
}
```

**Layer 2 - Synchronous state hydration (MMKV):**
```typescript
import { MMKV } from 'react-native-mmkv';
import { createMMKVStorage } from 'zustand-mmkv-storage';

const storage = new MMKV();
const mmkvStorage = createMMKVStorage({ storage });

// In your Zustand store:
persist(storeCreator, {
  name: 'settings-store',
  storage: mmkvStorage,
  onRehydrateStorage: () => (state) => {
    state?.setHasHydrated(true);
  },
});

// MMKV is SYNCHRONOUS - no async gap = no flash
// AsyncStorage is async = guaranteed flash window
```

**Layer 3 - Hold splash until hydrated:**
```typescript
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';

SplashScreen.preventAutoHideAsync();

function App() {
  const hasHydrated = useSettingsStore(s => s.hasHydrated);
  const theme = useSettingsStore(s => s.themePreference);
  const C = useCalm(); // your theme hook

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(C.bg);
  }, [C.bg]);

  useEffect(() => {
    if (hasHydrated) {
      SplashScreen.hideAsync();
    }
  }, [hasHydrated]);

  if (!hasHydrated) return null;
  // ...
}
```

**Critical insight**: MMKV's synchronous read means the theme preference is available on the very first render frame. AsyncStorage requires an async read, creating a mandatory gap where the default (light) theme shows. This is the single most impactful change you can make to eliminate theme flash.

### 1.3 react-native-unistyles v3 - Zero Re-render Architecture

The biggest paradigm shift in RN theming. Key points:

- **C++ Shadow Tree integration**: Styles are registered as "hybrid stylesheets" via React Native Nitro modules. When a theme changes, Unistyles recalculates affected styles in C++ and updates Shadow Tree nodes directly - bypassing React's reconciliation entirely.
- **14 tracked events**: Only these trigger recalculation (theme change, orientation, screen size, etc.). If a stylesheet isn't linked to the event, nothing happens.
- **Adaptive themes**: `adaptiveThemes: true` in config auto-switches based on device color scheme.
- **Migration path**: API mirrors `StyleSheet.create()` closely, making migration incremental.

```typescript
// Unistyles v3 theme setup
import { UnistylesRegistry } from 'react-native-unistyles';

UnistylesRegistry
  .addThemes({
    calm: { bg: '#F9F9F7', surface: '#FFFFFF', /* ... */ },
    calmDark: { bg: '#121212', surface: '#1E1E1E', /* ... */ },
  })
  .addConfig({
    adaptiveThemes: true, // auto dark/light
    initialTheme: 'calm',
  });
```

**Trade-off**: Requires Fabric (New Architecture). Not compatible with old architecture.

### 1.4 Uniwind Pro - Tailwind + Zero Re-renders

From the same creator as Unistyles. Combines Tailwind utility classes with the C++ engine:
- `className="bg-white dark:bg-gray-900"` - familiar Tailwind syntax
- Pro tier unlocks Shadow Tree updates for zero re-renders on theme/orientation changes
- Reanimated 4 animation integration
- Native theme transitions (not JS-driven)

### 1.5 NativeWind v5 Dark Mode

NativeWind v5 ships with Tailwind CSS v4 and uses `prefers-color-scheme` media query natively:
```jsx
<View className="bg-white dark:bg-gray-900">
  <Text className="text-black dark:text-white">Adapts</Text>
</View>
```
- Manual toggle: `Appearance.setColorScheme('dark' | 'light' | null)`
- CSS variables for dynamic tokens: define once, auto-adapt
- Always provide BOTH light and dark styles (RN has issues with conditional application)

### 1.6 react-native-theme-switch-animation

Plug-and-play circular reveal animation for theme switching:
```typescript
import { switchTheme } from 'react-native-theme-switch-animation';

switchTheme({
  switchThemeFunction: () => setIsDark(!isDark),
  animationConfig: {
    type: 'circular',
    duration: 500,
    startingPoint: { cx: buttonX, cy: buttonY },
  },
});
```
- Works with ANY state manager (Zustand, Redux, Context, MobX)
- Animation types: `circular`, `inverted-circular`, `fade`
- Can auto-detect starting point from a button ref
- Stability: actively maintained, HarmonyOS port exists (`@react-native-ohos/`)

### 1.7 PlatformColor - Native System Colors

Underused but powerful for native-feeling dark mode:
```typescript
import { PlatformColor } from 'react-native';

const styles = StyleSheet.create({
  container: {
    backgroundColor: PlatformColor('systemBackground'), // iOS
    // or '@android:color/background_dark' for Android
  },
  text: {
    color: PlatformColor('label'), // auto-adapts to dark mode
  },
});
```
- iOS semantic colors (`systemBackground`, `secondarySystemBackground`, `label`, `secondaryLabel`) auto-adapt
- Android: `?attr/colorPrimary`, `@android:color/background_dark`
- `DynamicColorIOS({ light: '#F9F9F7', dark: '#121212' })` for pixel-perfect control
- Zero JS overhead - colors resolve at native layer

---

## 2. Color Science for Dark Mode

### 2.1 OKLCH - Why It's the New Standard

OKLCH (Lightness, Chroma, Hue) is a perceptually uniform color space created by Bjorn Ottosson. It fixes fundamental problems with RGB and HSL:

| Problem | HSL | OKLCH |
|---------|-----|-------|
| Yellow vs blue at same "lightness" | Look wildly different | Look actually equal |
| Adjusting lightness | Hue and saturation drift | Hue and chroma stable |
| Creating palette scales | Uneven perceived steps | Uniform perceived steps |
| Dark mode inversion | Colors look wrong | Colors look correct |

**Dark mode technique with OKLCH:**
```
Light mode:  oklch(95% 0.03 80)   // warm off-white bg
Dark mode:   oklch(15% 0.03 80)   // warm near-black bg (invert L)

Light text:  oklch(20% 0.02 80)   // dark text
Dark text:   oklch(90% 0.02 80)   // light text (invert L)
```

**Rule of thumb**: For dark mode, bump lightness up 15-20% for foreground elements, keep the same chroma value. In dark mode, the shade order inverts (50 becomes darkest, 950 becomes lightest).

**Relative color syntax** (CSS, adaptable to RN constants):
```css
oklch(from var(--base) calc(l + 0.20) c h)  /* lighter */
oklch(from var(--base) calc(l - 0.20) c h)  /* darker */
```

**For React Native**: Since RN doesn't support OKLCH natively, use a build-time tool or helper function to convert OKLCH values to hex/rgba:
```typescript
// Use culori or colorjs.io at build time
import { oklch, formatHex } from 'culori';

function oklchToHex(l: number, c: number, h: number): string {
  return formatHex({ mode: 'oklch', l, c, h });
}

// Generate your palette
const CALM = {
  bg: oklchToHex(0.95, 0.03, 80),        // #F9F9F7-ish
  surface: oklchToHex(1.0, 0, 0),          // #FFFFFF
  textPrimary: oklchToHex(0.20, 0.02, 80), // near-black
};

const CALM_DARK = {
  bg: oklchToHex(0.15, 0.03, 80),          // #121212-ish
  surface: oklchToHex(0.20, 0.03, 80),     // #1E1E1E-ish
  textPrimary: oklchToHex(0.90, 0.02, 80), // near-white
};
```

### 2.2 Lea Verou's Inverted Lightness Variables

A technique where you define colors using lightness variables and invert them for dark mode:
- Define `--L-bg: 95%` in light mode
- Override to `--L-bg: calc(100% - 95%)` = `5%` in dark mode
- Works beautifully with OKLCH because lightness is perceptually uniform
- With HSL, this technique produces bad results because HSL lightness is not perceptually uniform

### 2.3 APCA - The Future of Contrast Checking

WCAG 2.x contrast ratios are broken for dark mode. A 4.5:1 ratio can be functionally unreadable when colors are near black. APCA (Advanced Perceptual Contrast Algorithm) fixes this:

- **Perceptually uniform**: `Lc 60` means the same readability regardless of lightness
- **Polarity-aware**: Light-on-dark has different contrast math than dark-on-light
- **WCAG 3.0 candidate**: Will replace the 4.5:1 / 3:1 ratios
- **Calculator**: https://apcacontrast.com/

| APCA Level | Use Case |
|-----------|----------|
| Lc 90+ | Body text, primary content |
| Lc 75 | Large text, subheadings |
| Lc 60 | Secondary text, captions |
| Lc 45 | Placeholder text, disabled |
| Lc 30 | Decorative, borders |
| Lc 15 | Subtle dividers |

**Critical for Potraces**: Your CALM_DARK palette should be validated with APCA, not WCAG 2.x ratios, especially for your olive accent (#4F5104) on dark backgrounds.

### 2.4 Radix Colors - 12-Step Dual-Palette System

Radix Colors provides 22 color scales, each with 12 steps designed for specific semantic uses:

| Step | Light Mode Use | Dark Mode Use |
|------|---------------|---------------|
| 1 | App background | App background |
| 2 | Subtle background | Subtle background |
| 3 | UI element background | UI element background |
| 4 | Hovered UI element | Hovered UI element |
| 5 | Active/selected UI | Active/selected UI |
| 6 | Subtle borders/separators | Subtle borders/separators |
| 7 | UI element border/focus ring | UI element border/focus ring |
| 8 | Hovered UI element border | Hovered UI element border |
| 9 | Solid backgrounds | Solid backgrounds |
| 10 | Hovered solid backgrounds | Hovered solid backgrounds |
| 11 | Low contrast text | Low contrast text |
| 12 | High contrast text | High contrast text |

The key insight: Light and dark scales share the same CSS variable names. You write your styles once and they auto-adapt. Each scale is designed so that the same step number serves the same semantic purpose in both modes.

### 2.5 P3 Wide Gamut Colors

**Current RN Status**: React Native does NOT support Display P3 colors as of 2025. There are open GitHub issues tracking this (facebook/react-native#41517). This means:
- All colors are clamped to sRGB
- The wider, more vibrant colors possible on modern iPhone/Android OLED screens are unavailable
- No `color(display-p3 ...)` equivalent in RN

**Workaround**: For WebView content within your app, you CAN use P3 colors in CSS.

### 2.6 Chameleon - Academic Dark Mode Algorithm

A 2025 research paper from Singapore Management University presents an algorithm that automatically transforms light mode data visualizations into dark mode. Three optimization factors:
1. **Luminance contrast consistency** - legibility against dark background
2. **Color semantic preservation** - relationships between colors maintained
3. **Visual harmony** - adjacent colors remain pleasant

Applicable insight for Potraces charts: Don't just swap colors. Run your chart palette through contrast validation against the dark background, and ensure the relative ordering of color prominence is maintained.

---

## 3. Design System Case Studies

### 3.1 Linear - Gold Standard Dark-First Design

Linear is widely considered the best dark mode implementation in SaaS:

- **Dark-first**: Every component was designed for dark surface first. Light mode works but dark is the native context.
- **LCH color space** (not HSL): Rebuilt their custom theme system using LCH for perceptual uniformity.
- **3-variable theme generation**: Instead of defining 98 color variables per theme, they define only 3: base color, accent color, and contrast level.
- **Contrast variable**: Automatically generates high-contrast variants for accessibility.
- **Elevation via lightness**: Surfaces at higher elevation are lighter shades of the base color (background < foreground < panels < dialogs < modals).
- **2025 refresh**: Moved from cool blue-ish grays to warmer grays that feel crisp but less saturated.
- **AI-assisted development**: Used Claude Code to build an internal color-picking tool in their dev toolbar for real-time token tweaking.
- **Custom theme support**: Users can generate their own themes from a single seed color.

**Takeaway for Potraces**: Your CALM palette is already warm (hue 80). Consider using LCH/OKLCH math to derive CALM_DARK from CALM automatically: same hue, same chroma, inverted lightness + elevation steps.

### 3.2 Vercel / Geist Design System

- **Theme switcher**: Light / System / Dark tri-toggle (via `next-themes`)
- **Token-based**: Colors, spacing, radius, fonts defined as design tokens
- **Geist font family**: Custom typeface designed for both modes
- Theme flows from `GeistProvider` at root level

### 3.3 Spotify - Dark-Canvas Philosophy

- **Dark is the brand**: Album art is hero content; dark canvas frames it without competition
- **Dynamic color extraction**: Background gradients computed from album artwork, not fixed brand colors
- **Contrast-first buttons**: Switched key buttons to black (10.9:1 contrast with Spotify green), allowing use of their most vibrant brand green
- **OLED advantage**: True blacks on OLED screens save battery and look premium

### 3.4 Apple Human Interface Guidelines (2025-2026)

- **Semantic colors**: `systemBackground`, `secondarySystemBackground`, `label`, `secondaryLabel` auto-adapt to dark mode
- **iOS 18 icon tinting**: Automatic dark/tinted icon variants from system intelligence
- **Liquid Glass (2025)**: Translucency, depth, fluid responsiveness - the biggest visual redesign since iOS 7
- **Don't**: Apple explicitly advises against in-app appearance settings (but most apps provide them anyway for user preference)
- **System color tiers**: Background (3 levels), Grouped Background (3 levels), Fill (4 levels), Label (4 levels), Separator (2 levels)

---

## 4. Advanced Patterns

### 4.1 Elevation in Dark Mode

Material Design 3 evolved from white overlays (MD2) to **tonal elevation** (MD3):

**MD2 approach** (deprecated):
```
Surface + 0% white overlay = elevation 0
Surface + 5% white overlay  = elevation 1
Surface + 7% white overlay  = elevation 2
Surface + 8% white overlay  = elevation 3
Surface + 9% white overlay  = elevation 4
Surface + 16% white overlay = elevation 5
```

**MD3 approach** (current - tonal surface):
```
Each elevation level uses a slightly lighter version of the base color,
tinted toward the primary brand color. This replaces white overlays
with semantically meaningful tonal shifts.
```

**For Potraces CALM_DARK**:
```typescript
const CALM_DARK = {
  bg:       '#121212',  // elevation 0 - deepest
  surface:  '#1E1E1E',  // elevation 1 - cards
  surfaceHigh: '#252525', // elevation 2 - raised cards
  overlay:  '#2C2C2C',  // elevation 3 - modals
  // Optionally tint toward olive accent:
  // surface: oklch(0.18, 0.01, 100) // warm tint
};
```

**Key rule**: In dark mode, higher = lighter. Shadows are nearly invisible, so luminance hierarchy replaces shadow hierarchy.

### 4.2 Image Dimming in Dark Mode

Options for handling images on dark backgrounds:
1. **Semi-transparent overlay**: `View` with `position: 'absolute'` and `backgroundColor: 'rgba(0,0,0,0.15)'`
2. **Reduced opacity**: `Image` with `opacity: 0.85` in dark mode
3. **CSS blend mode** (web only): `mix-blend-mode: luminosity`
4. **Do nothing**: Many apps leave images as-is (Spotify, Instagram)

**Recommendation for Potraces**: Leave user photos/receipt scans at full brightness. Apply subtle overlays only to decorative/background images.

### 4.3 React Native Animated Theme Transition

Using Reanimated's `interpolateColor`:
```typescript
import { interpolateColor, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

const progress = useSharedValue(isDark ? 1 : 0);

useEffect(() => {
  progress.value = withTiming(isDark ? 1 : 0, { duration: 300 });
}, [isDark]);

const animatedStyle = useAnimatedStyle(() => ({
  backgroundColor: interpolateColor(
    progress.value,
    [0, 1],
    ['#F9F9F7', '#121212']
  ),
}));
```
This runs on the UI thread for 60fps. However, applying this to every component is impractical. Better approach: animate a single overlay or use the circular reveal library.

### 4.4 Dark Mode Scheduling

React Native defers to the OS for sunrise/sunset scheduling:
- `Appearance.setColorScheme('light' | 'dark' | null)` - override or follow system
- `null` = follow system (which includes scheduled switching)
- Samsung/Pixel devices offer sunset/sunrise-based auto-switching at OS level
- **Don't build your own scheduler** - let the OS handle it, expose 3 options: Light / Dark / System

### 4.5 WebView Dark Mode

Known issue: Theme changes don't propagate to WebView on Android until device rotation (react-native-webview#3013). Workarounds:
- Inject `<meta name="color-scheme" content="dark light">` into WebView HTML
- Use `injectedJavaScript` to set `document.documentElement.style.colorScheme`
- Force WebView remount on theme change (nuclear option)

### 4.6 Chart Colors in Dark Mode

From the Chameleon research and industry best practices:
- **Never just invert** - create dedicated dark palette
- **Maintain color meaning** - if olive = positive in light mode, use the same hue in dark mode
- **Increase saturation slightly** - colors appear more washed out on dark backgrounds
- **Use light gridlines** - `rgba(255,255,255,0.1)` instead of `rgba(0,0,0,0.1)`
- **Test colorblindness** - dark mode can worsen color discrimination issues

### 4.7 Map Tiles in Dark Mode

- **Google Maps**: `customMapStyle` prop on iOS only; use `googleMapId` with styled maps from Google Cloud Console
- **Mapbox**: `styleURL` prop - switch between `MapboxGL.StyleURL.Light` and `MapboxGL.StyleURL.Dark`
- **Known issue**: Google Maps `customMapStyle` doesn't work on Android; need Google Cloud styled maps with `googleMapId`
- **Recommendation**: Use `googleMapId` for both platforms with two styled maps (light/dark) created in Google Maps Console

---

## 5. iOS 18 / Android 15 Specifics

### 5.1 iOS 18 Dark Mode Icon Tinting

- Users can now display app icons in dark or tinted color schemes
- System auto-generates dark/tinted variants if icon is simple enough
- For custom control: provide a dark icon variant (1024x1024, transparent bg) and tinted variant (grayscale, black bg)
- **Expo**: No native `app.json` support yet. Requires a Config Plugin to modify native iOS project files during `prebuild`
- Dark gradient: top `#313131` to bottom `#141414`

### 5.2 Android 15 Edge-to-Edge Enforcement

**This is mandatory for SDK 35 targeting (deadline: August 31, 2025 on Play Store)**

- Status bar: fully transparent, no background color (deprecated in API 35)
- Navigation bar: transparent (gesture) or semi-opaque (button)
- Content renders under system bars

**Library**: `react-native-edge-to-edge` by zoontek
```typescript
import { SystemBars } from 'react-native-edge-to-edge';

<SystemBars style="auto" /> // auto = light icons on dark, dark icons on light
```

For React Native 0.81+, use built-in `edgeToEdgeEnabled=true` Gradle property + `@zoontek/react-native-navigation-bar`.

**Dark mode interaction**: With transparent system bars, your app background shows through. Your dark mode background color IS your status bar background.

### 5.3 Material You Dynamic Colors

Libraries for extracting device wallpaper colors:
- `react-native-material-you-colors`: Generate palettes from a seed color, cross-platform
- `expo-material3-theme`: Android 12+ dynamic colors, iOS fallback

```typescript
import { useMaterial3Theme } from 'expo-material3-theme';

const { theme } = useMaterial3Theme();
// theme.light.primary, theme.dark.primary, etc.
// On Android 12+: derived from wallpaper
// On iOS/older: derived from fallback seed color
```

---

## 6. Performance & Architecture

### 6.1 Zustand Theme Store Optimization

**Selective subscriptions prevent 40-70% more re-renders vs Context API:**
```typescript
// BAD: re-renders on ANY store change
const state = useSettingsStore();

// GOOD: re-renders ONLY when theme changes
const theme = useSettingsStore(s => s.themePreference);
const C = useMemo(() => theme === 'dark' ? CALM_DARK : CALM, [theme]);
```

**Benchmark claims**: Proper Zustand optimization can improve startup by 30% and reduce memory by 20% compared to naive implementations.

### 6.2 StyleSheet.create vs Object Literals

- `StyleSheet.create()` memoizes style objects - created once, reused across renders
- Inline style literals create new objects every render - "death by a thousand cuts"
- Impact: up to 25% faster initial load, measurable scroll improvement on low-end Android
- **For theme-dependent styles**: Use `makeStyles` pattern (already in Potraces):

```typescript
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { backgroundColor: C.bg },
  text: { color: C.textPrimary },
});

// Inside component:
const styles = useMemo(() => makeStyles(C), [C]);
```

This is the right pattern - StyleSheet.create for memoization + useMemo for theme reactivity.

### 6.3 Context vs Zustand for Theme

| Factor | React Context | Zustand |
|--------|--------------|---------|
| Re-renders | ALL consumers on ANY change | Only subscribed selectors |
| Bundle size | 0 KB (built-in) | ~1.5 KB |
| Persistence | Manual | Built-in middleware |
| Devtools | React DevTools | Dedicated + React DevTools |
| Performance | Good for small trees | Better for large trees |

**Verdict**: Zustand is better for theme state in production apps. Context causes cascade re-renders on every theme property change.

### 6.4 New Architecture (Fabric/TurboModules) Impact

- **Fabric renderer**: Shared C++ core enables Unistyles v3's zero-rerender approach
- **TurboModules**: Lazy initialization, JSI-based - theme modules load only when needed
- **JSI**: Direct JS-to-native calls without the bridge - faster `Appearance.getColorScheme()` response
- **Mandatory migration**: Required for scalable, high-performance apps in 2025+
- **Theme implication**: Libraries like Unistyles v3 REQUIRE Fabric. If you're on old architecture, you can't use the C++ zero-rerender path.

### 6.5 expo-system-ui for Synchronous Background

```typescript
import * as SystemUI from 'expo-system-ui';

// Set BEFORE splash screen hides
await SystemUI.setBackgroundColorAsync('#121212');
```

Also set in `app.json` for the native level:
```json
{
  "expo": {
    "backgroundColor": "#F9F9F7",
    "android": { "backgroundColor": "#F9F9F7" },
    "ios": { "backgroundColor": "#F9F9F7" }
  }
}
```

---

## 7. Testing Dark Mode

### 7.1 E2E Testing Frameworks

| Framework | Dark Mode Support | Approach |
|-----------|------------------|----------|
| **Maestro** | Built-in visual testing | `assertScreenshot`, `cropOn`, YAML-based |
| **Detox** | Screenshot comparison | Gray-box, injects into app process |
| **Appium** | External screenshot tools | Black-box, device-level |

**Maestro** is increasingly preferred in 2025 - no code changes required, YAML test specs, built-in visual regression.

### 7.2 Visual Regression Testing

- **Detox + Jest**: Take screenshots, compare to baselines with pixel-diff
- **Maestro**: Built-in `assertScreenshot` command with threshold configuration
- **Percy/Chromatic**: Cloud-based visual testing (primarily web, some RN support)

### 7.3 Storybook for React Native

- `storybook-dark-mode` addon: Toggle between themes in Storybook UI
- Preview iframe gets `darkClass`/`lightClass` applied
- Force dark mode: Set `Appearance.getColorScheme()` to `"dark"` in wrapper
- Useful for component-level dark mode validation without running full app

### 7.4 Recommended Testing Checklist

- [ ] All text meets APCA Lc 60+ against its background
- [ ] Semantic colors maintain meaning across modes
- [ ] Images/illustrations look appropriate on dark backgrounds
- [ ] Charts/data viz are legible in both modes
- [ ] System bars (status bar, navigation bar) adapt correctly
- [ ] Splash screen matches system theme
- [ ] No white flash on cold start in dark mode
- [ ] Theme persists across app restarts
- [ ] System theme changes are detected in real-time
- [ ] Modals/overlays use correct elevation colors
- [ ] Input field backgrounds are distinguishable from card backgrounds
- [ ] Disabled states are visible but muted in both modes

---

## 8. W3C Design Tokens Specification (2025.10)

The first stable version of the Design Tokens spec was released October 28, 2025:

- **Vendor-neutral format** for sharing design decisions across tools and platforms
- **Standardized theming support** including dark mode
- **Modern color spaces** support (including OKLCH)
- **Cross-tool interoperability**: Figma, code, marketing all use the same token file
- **Style Dictionary** (by Amazon) is the leading tool for consuming DTCG-format tokens

### Figma Variables (2025-2026)

- **Modes**: Each variable collection can have multiple modes (light, dark, high-contrast)
- **Composite variables** (2025): Grouped values for shadow, border, animation states
- **Expression variables** (2026 preview beta): Conditional and computed variables
- **Dev Mode**: Shows code-friendly specs with token names, not raw values
- **Export to code**: Tools like Token Studio export Figma variables to DTCG-format JSON

---

## 9. Recommendations for Potraces

Based on this research, here are specific recommendations ordered by impact:

### High Impact, Low Effort
1. **Switch from AsyncStorage to MMKV** for settings store - eliminates white flash
2. **Add `dark` splash screen config** in app.json via expo-splash-screen plugin
3. **Use `expo-system-ui`** `setBackgroundColorAsync` on theme change
4. **Validate CALM_DARK contrast** with APCA calculator, not WCAG 2.x ratios

### Medium Impact, Medium Effort
5. **Consider OKLCH-based palette generation** - derive CALM_DARK mathematically from CALM using lightness inversion + chroma preservation (like Linear does)
6. **Add `react-native-edge-to-edge`** for Android 15 SDK 35 compliance
7. **iOS 18 dark icon variant** via Expo Config Plugin
8. **Chart palette dual-mode validation** - ensure chart colors work in both modes

### High Impact, Higher Effort
9. **Evaluate Unistyles v3** for zero-rerender theme switching (requires Fabric/New Architecture)
10. **Consider `react-native-theme-switch-animation`** for premium circular-reveal transition
11. **Move to 3-tier token architecture**: reference tokens -> semantic tokens -> component tokens (matches W3C DTCG spec direction)

---

## Sources

### Section 1 - Libraries & Approaches
- [React Native Dark Mode 2025 Guide](https://reactnativeexample.com/react-native-dark-mode-implementation-guide-2025/)
- [White Flash of Death - Theme Flickering](https://medium.com/@ripenapps-technologies/the-white-flash-of-death-solving-theme-flickering-in-react-native-production-apps-d732af3b4cae)
- [zustand-mmkv-storage](https://github.com/1mehdifaraji/zustand-mmkv-storage)
- [react-native-mmkv](https://github.com/mrousavy/react-native-mmkv)
- [react-native-theme-switch-animation](https://github.com/WadhahEssam/react-native-theme-switch-animation)
- [Unistyles v3 Discussion](https://github.com/jpudysz/react-native-unistyles/discussions/191)
- [Unistyles v3 Zero Re-renders Talk](https://async.techconnection.io/talks/react-native-connection/react-native-connection-2025/jacek-pudysz-do-you-even-need-to-re-render-the-secrets-of-shadow-tree-and-unistyles-30/)
- [Uniwind Pro](https://docs.uniwind.dev/pro-version)
- [NativeWind v5 Dark Mode](https://www.nativewind.dev/v5/core-concepts/dark-mode)
- [Expo Color Themes](https://docs.expo.dev/develop/user-interface/color-themes/)
- [Expo Splash Screen](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)
- [expo-system-ui](https://docs.expo.dev/versions/latest/sdk/system-ui/)
- [PlatformColor - Stop Hardcoding Colors](https://www.amillionmonkeys.co.uk/blog/2025-10-21-react-native-platformcolor-dark-mode)
- [react-native-edge-to-edge](https://github.com/zoontek/react-native-edge-to-edge)

### Section 2 - Color Science
- [OKLCH: The Modern CSS Color Space](https://medium.com/@alexdev82/oklch-the-modern-css-color-space-you-should-be-using-in-2025-52dd1a4aa9d0)
- [OKLCH Real-World Lessons](https://oklch.click/blog/oklch-css-real-world)
- [Evil Martians - OKLCH Ecosystem](https://evilmartians.com/chronicles/exploring-the-oklch-ecosystem-and-its-tools)
- [OKLCH Explained for Designers](https://uxdesign.cc/oklch-explained-for-designers-dc6af4433611)
- [Lea Verou - Inverted Lightness Variables](https://lea.verou.me/blog/2021/03/inverted-lightness-variables/)
- [APCA Contrast Calculator](https://apcacontrast.com/)
- [Why APCA Over WCAG 2.x](https://git.apcacontrast.com/documentation/WhyAPCA.html)
- [Radix Colors](https://www.radix-ui.com/colors)
- [Chameleon: Automated Dark Mode Viz](https://arxiv.org/html/2512.00516v1)

### Section 3 - Design Systems
- [Linear UI Redesign Part II](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Linear - Calmer Interface Design Refresh](https://linear.app/now/behind-the-latest-design-refresh)
- [Vercel Geist Design System](https://vercel.com/geist/introduction)
- [Spotify - Better in Black](https://spotify.design/article/better-in-black-rethinking-our-most-important-buttons)
- [Spotify - Reimagining Design Systems](https://spotify.design/article/reimagining-design-systems-at-spotify)
- [Apple HIG - Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
- [Dark Mode Design Systems - Complete Guide (Muzli)](https://muz.li/blog/dark-mode-design-systems-a-complete-guide-to-patterns-tokens-and-hierarchy/)

### Section 4 - Advanced Patterns
- [Material Design Dark Theme](https://m2.material.io/design/color/dark-theme.html)
- [Reanimated interpolateColor](https://docs.swmansion.com/react-native-reanimated/)
- [React Native AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo)
- [Reanimated ReducedMotionConfig](https://docs.swmansion.com/react-native-reanimated/docs/device/ReducedMotionConfig/)
- [Dark Mode Charts 2026 Guide](https://www.cleanchart.app/blog/dark-mode-charts)
- [react-native-maps Dark Mode Issues](https://github.com/react-native-maps/react-native-maps/issues/5812)

### Section 5 - Platform Specifics
- [iOS 18 Dark App Icons](https://kuatsu.de/en/blog/ios18-app-icons)
- [Android 15 Edge-to-Edge in RN](https://github.com/react-native-community/discussions-and-proposals/discussions/827)
- [expo-material3-theme](https://github.com/pchmn/expo-material3-theme)
- [react-native-material-you-colors](https://github.com/alabsi91/react-native-material-you-colors)

### Section 6 - Performance
- [Zustand RN Implementation Guide 2025](https://reactnativeexample.com/zustand-react-native-implementation-guide-2025/)
- [StyleSheet.create Performance](https://thelinuxcode.com/stylesheets-in-react-native-what-stylesheetcreate-really-does-and-why-i-reach-for-it-first/)
- [RN Style Libraries Benchmark](https://github.com/efstathiosntonas/react-native-style-libraries-benchmark)
- [React Native New Architecture 2025](https://reactnative.dev/architecture/landing-page)

### Section 7 - Testing
- [Detox vs Maestro](https://maestro.dev/insights/detox-vs-maestro-reducing-flakiness-react-native)
- [Maestro Visual Testing](https://maestro.dev/blog/visual-testing)
- [Storybook Dark Mode Addon](https://storybook.js.org/addons/storybook-dark-mode)

### Section 8 - Specifications
- [W3C Design Tokens Spec 2025.10](https://www.designtokens.org/tr/drafts/format/)
- [Design Tokens Spec First Stable Version](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)
- [Figma Variables 2025/2026 Playbook](https://www.designsystemscollective.com/design-system-mastery-with-figma-variables-the-2025-2026-best-practice-playbook-da0500ca0e66)
