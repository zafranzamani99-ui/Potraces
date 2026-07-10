# Handoff prompt — Liquid Glass nav bar (paste into Claude Code on the Mac)

Copy everything in the code block below into Claude Code, in the Potraces repo root.
Have `LiquidGlassNavBar.tsx` ready to drop in (it's in this folder).

```
We're adding an iOS 26 "Liquid Glass" bottom tab bar to Potraces (Expo SDK 54, RN 0.81.5,
TypeScript). I have a finished component, LiquidGlassNavBar.tsx, that should REPLACE the
personal-mode CustomTabBar. It uses the native Apple material via expo-glass-effect, with an
expo-blur fallback for Android / iOS < 26. Do the following, verifying each step:

1. Install the one new dependency:
     npx expo install expo-glass-effect
   (expo-blur, react-native-reanimated, react-native-gesture-handler are already installed.)

2. Place the file at:
     src/components/navigation/LiquidGlassNavBar.tsx
   (keeps its ../../ imports valid — same folder as CustomTabBar.)

3. Wire it into src/navigation/PersonalNavigator.tsx — swap the tabBar line only:
     import LiquidGlassNavBar from '../components/navigation/LiquidGlassNavBar';
     ...
     tabBar={(props) => <LiquidGlassNavBar {...props} accentColor={COLORS.personal} />}
   Leave everything else in PersonalNavigator (screenOptions, tabBarIcon, titles) unchanged.
   Do NOT touch BusinessNavigator / stall navigators — this is personal mode only.

4. The bar floats (absolute) so the glass lenses the content behind it. Add bottom padding to
   the scroll content of the personal-mode screens (Dashboard, BudgetPlanning, NotesHome,
   MoneyChat, Settings) so nothing hides under it, e.g.:
     contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
   Use each screen's existing safe-area inset. Only add padding; don't restructure the screens.

5. Verify:
   - `npx tsc --noEmit` passes (fix any type mismatches against our real types).
   - Run on an iOS 26 simulator built with Xcode 26 (or an EAS dev build). Confirm:
       • isLiquidGlassAvailable() is true and the native glass renders (real lensing/specular),
       • tapping a tab glides the pill; dragging across the bar scrubs + stretches it and snaps,
       • the bronze Echo (MoneyChat) badge still shows,
       • dark mode looks right (useCalm drives the tint).
   - Run on Android + an iOS < 26 sim: confirm it falls back to the expo-blur frosted bar
     with no crash and the same layout.

6. Things to check/tune on device (I could not build this on Windows):
   - GestureDetector wraps GlassContainer — if RN warns about a missing ref/native view,
     wrap the glass in a plain <Animated.View> or <View> child and re-test.
   - Tune the drag feel if needed: SPRING (damping/stiffness), MAX_STRETCH, and the
     activeOffsetX threshold so quick taps still register as taps.
   - Tune the glass tint alphas (tintColor on the GlassViews) so text stays legible over
     bright dashboard content; use glassEffectStyle="clear" only if you add a dimming layer.

Keep these deliberate design decisions unless they look wrong on device:
   - Flat capsule (no raised center pop-out).
   - Active tab uses a morphing olive pill (C.accent), icon goes outline→solid.
Report anything that doesn't compile or feels off, and show me before/after screenshots.
```
