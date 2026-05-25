# Dark Mode Polish & Micro-Interaction Research

Compiled from research across 20+ sources, studying apps like Telegram, Spotify, Apple Music, Instagram, Discord, Slack. These are the subtle details that separate amateur dark mode from professional.

---

## 1. Image Handling in Dark Mode

### The Problem
A bright photo on a `#121212` background creates a jarring "flashlight" effect. Users scrolling through content get blasted by full-brightness images.

### What the Best Apps Do

**Instagram/Twitter approach**: Subtle brightness reduction of 10-15% on images in dark mode. Not enough to notice consciously, but enough to prevent the jarring flash.

**React Native implementation** -- overlay a semi-transparent black View on top of images:
```tsx
// Dark mode image dimming
<View style={{ position: 'relative' }}>
  <Image source={src} style={imageStyle} />
  {isDark && (
    <View
      style={{
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.07)', // 7% opacity -- barely visible, huge comfort difference
        pointerEvents: 'none',
      }}
    />
  )}
</View>
```

**Recommended opacity values**:
- User photos/avatars: `rgba(0,0,0,0.05)` -- 5%, barely there
- Content images (full-width): `rgba(0,0,0,0.07-0.10)` -- 7-10%
- Hero/banner images: `rgba(0,0,0,0.12-0.15)` -- 12-15%
- Bright/white screenshots: `rgba(0,0,0,0.20)` -- 20%

**Logos on transparent backgrounds**: Black logos disappear on dark backgrounds. Solutions:
- Provide alternate white/light logo variants
- Use `tintColor` on Image component to recolor monochrome icons
- For brand logos where tinting isn't appropriate, add a subtle light pill background (`rgba(255,255,255,0.08)` with rounded corners)

### Potraces Application
- Receipt scanner previews: 10% overlay
- Wallet card backgrounds (if images): 7% overlay
- Any user-uploaded content: 7% overlay
- App logo in splash/about: provide dark variant

---

## 2. Typography in Dark Mode

### The Optical Illusion
White text on dark backgrounds appears **optically heavier** than the same weight on light backgrounds. This is called "halation" -- bright pixels bleed into surrounding dark pixels, making letterforms look bolder.

### What Apple Says
Apple HIG: avoid light font weights in dark mode. Use Regular, Medium, Semibold, or Bold. Never use Thin or Ultralight.

### Professional Adjustments

**Font weight**: If using a variable font or multiple weights:
- Light mode `fontWeight: '600'` --> dark mode `fontWeight: '500'` (one step lighter)
- Light mode `fontWeight: '400'` --> keep `'400'` (Regular is fine in both)
- Light mode `fontWeight: '300'` --> dark mode `fontWeight: '400'` (NEVER use 300 in dark mode)

**Letter spacing**: Slightly increase letter spacing in dark mode for body text:
- Body text: add `+0.2px` letter spacing in dark mode
- Headings: add `+0.3px` letter spacing in dark mode
- This "opens up" the text and counteracts halation

**Line height**: Increase by ~2-4% in dark mode for long-form content to reduce visual density.

**Text color**: Never use pure `#FFFFFF`. Use `#F0EDE8` (warm) or `#E8E6E3` (neutral). Pure white creates maximum halation and eye strain.

**Antialiasing**: On mobile (iOS/Android), all text uses grayscale antialiasing (not subpixel). No action needed -- but this is why the halation effect is less severe on mobile than desktop.

### Potraces Application
CALM_DARK already uses `#F0EDE8` for textPrimary -- good. Consider:
- Reducing TYPOGRAPHY heading weights by one step in dark mode
- Adding subtle letter-spacing increase for body text
- Never using fontWeight below 400 anywhere in dark mode

---

## 3. Shadows & Elevation in Dark Mode

### The Core Problem
Shadows are invisible on dark backgrounds. A `shadowColor: '#000'` with `shadowOpacity: 0.1` on a `#121212` surface is literally imperceptible.

### Material Design 3 Surface Tint System

Instead of shadows, M3 uses **surface tint** -- elevated surfaces get progressively lighter by mixing in the primary color at increasing opacity:

| Elevation | White Overlay Opacity | Resulting Surface (on #121212) |
|-----------|----------------------|-------------------------------|
| 0dp (base) | 0% | `#121212` |
| 1dp | 5% | `#1D1D1D` |
| 2dp | 7% | `#222222` |
| 3dp | 8% | `#242424` |
| 4dp | 9% | `#272727` |
| 6dp | 11% | `#2C2C2C` |
| 8dp | 12% | `#2E2E2E` |
| 12dp | 14% | `#333333` |
| 16dp | 15% | `#353535` |
| 24dp | 16% | `#383838` |

**Formula**: `opacity = (4.5 * ln(elevation + 1) + 2) / 100`

### What to Use Instead of Shadows

**Option A -- Surface tint (RECOMMENDED for Potraces)**:
Use progressively lighter surface colors for elevated elements. No shadows needed.
```
Base surface:     #1E1E1E  (CALM_DARK.surface)
Card surface:     #252525  (slightly lighter)
Modal surface:    #2A2A2A  (lighter still)
Dropdown surface: #2F2F2F  (lightest)
```

**Option B -- Subtle borders**:
Use `rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.12)` borders.
- Cards: 1px border at `rgba(255,255,255,0.06)` -- barely visible separation
- Modals: 1px border at `rgba(255,255,255,0.10)` -- clear boundary
- Dropdowns: 1px border at `rgba(255,255,255,0.12)` -- prominent

**Option C -- Inner glow / top highlight**:
A 1px top border in `rgba(255,255,255,0.05)` simulates light catching the top edge. Extremely subtle, extremely professional.

**What NOT to do**:
- Don't use heavy borders (`rgba(255,255,255,0.25)+`) -- looks like wireframes
- Don't try to make shadows work by increasing opacity -- creates "floating in void" effect
- Don't use neumorphism in dark mode -- the dual-shadow technique becomes muddy and inaccessible

### Neumorphism Verdict
Neumorphism is viable in dark mode ONLY for very specific use cases (music player knobs, thermostat controls). For a finance app like Potraces, avoid entirely. The soft shadows don't translate well to dark backgrounds and create accessibility issues. Settled into a niche by 2025 -- not mainstream.

### Potraces Application
CALM_DARK.surface is `#1E1E1E`. Create an elevation scale:
- `surface0`: `#1E1E1E` (cards at rest)
- `surface1`: `#252525` (cards hovered/pressed, bottom sheets)
- `surface2`: `#2A2A2A` (modals, overlays)
- `surface3`: `#2F2F2F` (dropdowns, popovers)

Add subtle `borderColor: rgba(255,255,255,0.06)` to cards in dark mode instead of shadows.

---

## 4. Charts & Data Visualization

### Color Adjustments
- **Desaturate by ~20 points** in dark mode. Saturated colors on dark backgrounds cause optical vibration and eye strain
- Chart gridlines: use `rgba(255,255,255,0.06)` -- not `rgba(255,255,255,0.15)+` which creates a cage effect
- Axis labels: use `#999999` to `#AAAAAA` -- secondary text color, not primary
- Tooltips: use `surface2` (`#2A2A2A`) with `rgba(255,255,255,0.10)` border

### Specific Color Recommendations
- Semi-transparent fills at 80-90% opacity
- Use softer text colors (`#E0E0E0` or `#CCCCCC`) on chart labels
- Increase font weight slightly on chart labels to compensate for reversed contrast
- Gridlines: `rgba(255,255,255,0.06)` with dotted/dashed style for better visibility
- Maintain WCAG 3:1 minimum contrast for all data colors against the chart background

### Potraces Palette Adaptation
Current CALM colors and their dark-mode chart variants (desaturated ~20 points):
- Olive `#4F5104` --> `#6B6D2A` (lighter, less saturated for visibility on dark)
- Bronze `#8B7355` --> `#9D8A6E` (lighter)
- Gold `#B2780A` --> `#C4923A` (lighter, warmer)
- Terracotta `#C1694F` --> `#D08570` (lighter, softer)

---

## 5. Maps & Location

### Google Maps Dark Mode in React Native
Three approaches:
1. **`customMapStyle` prop**: Pass a JSON style array for full control over map element colors
2. **`googleMapId` prop**: Create Light and Dark styled maps in Google Cloud Console, switch based on theme
3. **`userInterfaceStyle` prop**: Set to `'dark'` or `'light'` to use built-in system map styles

### Recommended Approach
Use `userInterfaceStyle={isDark ? 'dark' : 'light'}` for automatic system-matching. For brand-consistent maps, create custom styles in Google Cloud Console with colors that complement CALM_DARK.

---

## 6. Form Inputs

### Design Approaches in Dark Mode

**Filled inputs (RECOMMENDED for dark mode)**:
- Background: `rgba(255,255,255,0.06)` -- subtle fill distinguishing input from surface
- Border: none at rest, `rgba(255,255,255,0.12)` on focus
- Text: `#F0EDE8` (primary text color)

**Outlined inputs**:
- Border at rest: `rgba(255,255,255,0.15)`
- Border on focus: accent color (olive/gold)
- Background: transparent

### State Colors
| State | Border Color | Background | Text Color |
|-------|-------------|------------|------------|
| Default | `rgba(255,255,255,0.12)` | `rgba(255,255,255,0.04)` | `#F0EDE8` |
| Focused | accent color (olive `#6B6D2A` in dark) | `rgba(255,255,255,0.06)` | `#F0EDE8` |
| Error | `#C1694F` (terracotta, NOT red) | `rgba(193,105,79,0.08)` | `#F0EDE8` |
| Disabled | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.02)` | `rgba(240,237,232,0.38)` |
| Filled (valid) | `rgba(255,255,255,0.12)` | `rgba(255,255,255,0.04)` | `#F0EDE8` |

### Switch/Toggle in Dark Mode
- Track (off): `rgba(255,255,255,0.12)` -- subtle against dark surface
- Track (on): accent color at 60% opacity
- Thumb (off): `#888888`
- Thumb (on): full accent color

### Date Picker
Use `@react-native-community/datetimepicker` with `themeVariant="dark"` prop. Alternatively, set `display="spinner"` and the picker auto-adapts to system appearance. For custom calendar pickers, ensure background and text colors follow the dark palette.

---

## 7. Notifications & Toasts

### The Inversion Principle
Professional apps use **inverted toasts** -- a light/bright toast on a dark background creates clear visual separation and hierarchy. This is what Material Design, Apple, and most pro apps do.

### Recommended Approach for Potraces
- Toast background in dark mode: `#F0EDE8` (warm white -- the light mode bg color)
- Toast text in dark mode: `#1E1E1E` (dark surface color)
- This creates maximum contrast and clear visual hierarchy
- Success icon: olive tint
- Error icon: terracotta tint
- Info icon: bronze tint

### Contrast Requirements
- WCAG 2.1 AA: minimum 4.5:1 contrast ratio
- Recommended: 7:1 for smaller toast text
- Maximum 4 colors per toast to prevent sensory overload

---

## 8. Loading States & Skeletons

### Dark Mode Skeleton Colors
- Skeleton base: `#252525` (one step lighter than surface `#1E1E1E`)
- Shimmer highlight: `#333333` (two steps lighter)
- Animation: linear gradient sweep from base --> highlight --> base

### Shimmer Specifications
- Animation duration: 1200-1500ms per cycle
- Gradient angle: slight tilt (10-15 degrees) makes it feel more dynamic
- Easing: linear (constant speed feels most like "scanning")
- Users perceive shimmer screens as loading **30% faster** than spinners

### React Native Implementation
```tsx
// Skeleton shimmer colors for dark mode
const SKELETON_DARK = {
  base: '#252525',
  highlight: '#333333',
};

// For light mode
const SKELETON_LIGHT = {
  base: '#E8E6E3',
  highlight: '#F0EDE8',
};
```

### What NOT to Do
- Don't use the same skeleton colors in both modes
- Don't make shimmer too fast (< 800ms) or too slow (> 2000ms)
- Don't use bright shimmer highlights -- subtle is better
- Don't overuse -- only for async loading, not for UI that's already available

---

## 9. Haptic & Sound Feedback

### Does Dark Mode Warrant Different Haptics?
**No.** No major app changes haptic patterns based on theme. Haptics are tied to actions, not appearance. The three principles from Apple/Google:
1. **Causality**: feedback must obviously relate to what caused it
2. **Harmony**: senses should be coherent and consistent
3. **Utility**: must provide clear value

### Sound Considerations
No mainstream app changes audio feedback based on theme. Silence is used intentionally -- not every button press gets a sound, because that makes meaningful sounds less prominent.

### Potraces Application
Keep haptics and sounds theme-independent. The visual theme should not affect tactile/audio feedback.

---

## 10. Splash Screen & App Icon

### Preventing the White Flash

**Expo configuration** with dark splash screen:
```json
{
  "expo": {
    "plugins": [
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#F9F9F7",
          "image": "./assets/splash-icon.png",
          "dark": {
            "image": "./assets/splash-icon-dark.png",
            "backgroundColor": "#121212"
          },
          "imageWidth": 200
        }
      ]
    ]
  }
}
```

**Critical**: Call `SplashScreen.preventAutoHideAsync()` at app start, and only call `SplashScreen.hideAsync()` AFTER:
1. Theme preference is loaded from AsyncStorage
2. Fonts are loaded
3. First screen is rendered with correct theme

This prevents the flash sequence: dark splash --> white app --> dark app.

### App Icons (iOS 18+)

iOS 18 introduced three icon variants:
1. **Light Mode**: standard icon appearance
2. **Dark Mode**: requires transparent background; system applies dark background
3. **Tinted**: requires fully opaque grayscale icon; system applies tint

**Requirements**:
- Dark icon: transparent background, light-colored foreground
- Tinted icon: grayscale, fully opaque
- iOS will attempt auto-adjustment if no variants are provided, but results are unpredictable

### Potraces Application
- Create a dark splash variant with `#121212` background and light-colored logo
- Create dark and tinted icon variants for iOS 18+
- Ensure `preventAutoHideAsync` waits for theme state before revealing app

---

## 11. WebView Content

### Forcing Dark Mode on Web Content

**CSS Injection approach**:
```tsx
const darkModeCSS = `
  document.addEventListener('DOMContentLoaded', function() {
    var style = document.createElement('style');
    style.textContent = 'html { filter: invert(1) hue-rotate(180deg); } img, video { filter: invert(1) hue-rotate(180deg); }';
    document.head.appendChild(style);
  });
`;

<WebView
  injectedJavaScriptBeforeContentLoaded={darkModeCSS}
  // ...
/>
```

**Android `forceDarkOn` prop**: Available in react-native-webview, forces the system to apply dark mode to web content. Not persistent -- must be set every render.

**Best approach**: Use `injectedJavaScriptBeforeContentLoaded` (runs before first paint) rather than `injectedJavaScript` (runs after paint, causing visible flash).

### Potraces Application
The order page is hosted on Vercel. For any in-app WebView showing order pages, inject dark CSS when `isDark` is true. Better yet, add `?theme=dark` query param and handle in the HTML itself.

---

## 12. The Third Mode -- OLED Black

### The Battery Debate

**Testing shows**: Pure black (`#000000`) saves only ~0.3% more battery than dark grey (`#1E1E1E`). The practical difference is negligible.

**Why apps still offer it**:
- Discord, Telegram, Twitter/X offer OLED black mode
- Users on OLED screens perceive it as "premium" and "faster"
- True black pixels are completely off -- no light bleed at all
- The visual effect is dramatic -- content floats in void

### The Smearing Problem
Pure black has a significant downside: **black smearing**. OLED pixels take longer to go from fully off (0) to any brightness level, causing visible ghosting/smearing when scrolling. Dark grey (`#121212` or `#1E1E1E`) keeps pixels slightly active, eliminating smearing.

### Should Potraces Offer Both?

**Recommendation: Not now.** Three-mode (light/dark/OLED) adds complexity. The current `#121212` bg in CALM_DARK is the sweet spot -- dark enough for comfort, light enough to avoid smearing. Could be a premium feature later.

If ever implemented:
```
CALM_OLED = {
  ...CALM_DARK,
  bg: '#000000',
  surface: '#0A0A0A',
  // Cards float on true black -- dramatic effect
  // Need stronger borders: rgba(255,255,255,0.10)
}
```

---

## 13. Status Bar (Bonus)

### Theme-Aware Status Bar
```tsx
<StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
```

Expo's StatusBar component supports `style="auto"` which automatically matches system appearance. Use this as the default, with per-screen overrides where needed (e.g., a screen with a dark header in light mode).

---

## 14. Color Saturation Rules (Bonus)

### The 20-Point Rule
Colors should have **~20 points lower saturation** in dark mode. Saturated colors on dark backgrounds cause optical vibration.

### Why
- Saturated colors on dark backgrounds fail WCAG contrast tests
- They cause eye strain through "vibration" effect
- Desaturated pastels read as more premium on dark backgrounds

### Implementation
For each accent color, create a dark variant:
- Reduce saturation by ~20 points in HSL
- Increase lightness by ~10-15 points
- Test contrast ratio against `#1E1E1E` (aim for 4.5:1+)

Example transformations:
```
Olive  #4F5104 (HSL: 61, 97%, 17%) --> #6B6D2A (HSL: 61, 45%, 30%)
Bronze #8B7355 (HSL: 30, 25%, 44%) --> #9D8A6E (HSL: 30, 18%, 52%)
Gold   #B2780A (HSL: 39, 90%, 37%) --> #C4923A (HSL: 39, 55%, 50%)
```

---

## 15. Theme Transition Animation (Bonus)

### What Professional Apps Do

**Telegram**: Uses a circular reveal animation -- the dark theme "grows" from the toggle switch to cover the entire screen. Most admired transition in mobile.

**Implementation in React Native**:
The `react-native-theme-switch-animation` package provides:
- Circular reveal from toggle position
- Fade transition
- Configurable duration (300-500ms recommended)

**Simpler alternative**: Use React Native Reanimated's `withTiming` to cross-fade between themes over 200-300ms. Less dramatic but smooth and reliable.

### Potraces Application
A simple 200ms cross-fade is sufficient. The circular reveal is impressive but adds library weight and complexity. Could be a polish pass later.

---

## Summary: Priority Implementation Order for Potraces

### Must-Have (High Impact, Low Effort)
1. **Elevation system** -- replace shadows with surface tint scale in dark mode
2. **Status bar** -- ensure `light-content` in dark mode on all screens
3. **Splash screen** -- dark variant to prevent white flash
4. **Toast inversion** -- light toasts on dark background
5. **Input states** -- all 5 states defined for dark mode

### Should-Have (High Impact, Medium Effort)
6. **Color desaturation** -- create dark variants of all accent colors
7. **Image dimming** -- 7% overlay on content images
8. **Skeleton loaders** -- dark-appropriate shimmer colors
9. **Chart colors** -- desaturated palette with subtle gridlines
10. **Subtle card borders** -- `rgba(255,255,255,0.06)` replacing shadows

### Nice-to-Have (Polish)
11. **Typography weight adjustment** -- reduce heading weights by one step
12. **Letter spacing** -- +0.2px on body text in dark mode
13. **Theme transition** -- 200ms cross-fade animation
14. **iOS 18 dark icon** -- variant with transparent background
15. **OLED black mode** -- future premium feature
