# Handoff — Home-screen redesign (paste into Claude Code on the Mac)

Copy the block below into Claude Code at the Potraces repo root. Have these files from
this folder ready to drop in:
`LiquidGlassNavBar.tsx`, `neu.tsx`, `NeuIconButton.tsx`, `QuickActions.tsx`, `GlassModeToggle.tsx`.

```
We're shipping a home-screen visual redesign for Potraces (Expo SDK 54, RN 0.81.5, TypeScript,
CALM design system). I have 5 finished components. Two design languages:
  • LIQUID GLASS (native iOS 26 via expo-glass-effect, expo-blur fallback): nav bar + mode toggle.
  • NEUMORPHIC (soft-UI dual shadow via the New-Arch boxShadow style): quick actions + FAB + QR button.

Do this, verifying each step and fixing anything that doesn't compile or render:

1) Install the one new dependency:
     npx expo install expo-glass-effect
   (expo-blur, expo-linear-gradient, react-native-reanimated, react-native-gesture-handler,
    react-native-svg are all already installed. Confirm the New Architecture is ON — it is by
    default on SDK 54; the neumorphic boxShadow needs it.)

2) Place the files:
     src/components/navigation/LiquidGlassNavBar.tsx
     src/components/common/neu.tsx
     src/components/common/NeuIconButton.tsx
     src/components/common/QuickActions.tsx
     src/components/common/GlassModeToggle.tsx

3) NAV BAR — in src/navigation/PersonalNavigator.tsx, swap the tabBar line only:
     import LiquidGlassNavBar from '../components/navigation/LiquidGlassNavBar';
     tabBar={(props) => <LiquidGlassNavBar {...props} accentColor={COLORS.personal} />}
   The bar floats (absolute), so add bottom padding to the personal-mode screens' scroll
   content: contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}. Personal mode only —
   don't touch BusinessNavigator.

4) MODE TOGGLE — in src/screens/personal/Dashboard.tsx replace `<ModeToggle />` with
   `<GlassModeToggle />` (import from '../../components/common/GlassModeToggle'). It keeps the
   same appStore/businessModeEnabled logic; the pill is draggable + tappable.

5) QUICK ACTIONS — in Dashboard.tsx delete the whole `{/* Quick Actions … */} <View style={styles.quickActionsSection}>…</View>` block AND the now-unused `getQuickActions`, `renderActionIcon`,
   and `quickActions` useMemo (they live inside QuickActions.tsx now). Render instead:
     <QuickActions onAction={handleQuickAction} billsBadge={billsBadge} />
   `handleQuickAction` is the existing `(screen) => { … navigation.navigate(screen); }`. Keep
   `billsBadge` as-is. Remove any imports that became unused.

6) QR BUTTON — in Dashboard.tsx replace the greeting-row `qrButton` TouchableOpacity with:
     <NeuIconButton size={44} radius={14} onPress={<the existing QR onPress body>}
       accessibilityLabel={t.dashboard.showPaymentQr}>
       <Feather name="maximize" size={22} color={paymentQrs.length > 0 ? C.accent : C.textMuted} />
     </NeuIconButton>
   Keep the exact onPress logic (open qrModal / Alert). Drop the old styles.qrButton.

7) QUICK-ADD FAB — in src/components/common/QuickAddExpense.tsx the FAB is draggable via
   PanResponder, so DON'T wrap it in NeuIconButton (would fight the pan). Instead change just the
   FAB *face*: replace `<View style={styles.fab}><Ionicons name="add" …/></View>` with
     <NeuSurface style={styles.fab}><Ionicons name="add" size={30} color={C.accent} /></NeuSurface>
   (import { NeuSurface } from './neu'). Note the neu FAB icon is olive (C.accent), not white on
   a colored fill — adjust styles.fab to drop its solid backgroundColor (NeuSurface provides it).

8) VERIFY:
   - `npx tsc --noEmit` passes. The boxShadow arrays in neu.tsx are cast `as any` — if your RN
     types expose BoxShadowValue, drop the cast.
   - iOS 26 simulator (Xcode 26 build): native glass renders on nav bar + toggle
     (isLiquidGlassAvailable() true); toggle pill DRAGS and snaps; nav bar pill scrubs.
   - Android + iOS < 26: everything falls back cleanly (expo-blur bar/toggle, no crash).
   - Neumorphic (quick actions / FAB / QR): crisp raised→inset in LIGHT; confirm it's at least
     acceptable in DARK (it's inherently subtle on #121212 — that's expected, tune if needed).
   - Quick actions rows scroll horizontally by swipe; tiles press-inset; Bills badge shows.

9) THINGS I COULDN'T TEST ON WINDOWS — check & tune on device:
   - boxShadow (neu.tsx): if the dual shadow doesn't render, confirm New Arch is enabled; if the
     shadow won't apply to the LinearGradient, move `boxShadow` to a wrapping <View> around it.
   - GlassView under GestureDetector (nav bar + toggle): if RN warns about a ref/native view,
     wrap the glass child in a plain <Animated.View>.
   - Tune to taste: neu shadow colors (LIGHT/DARK in neu.tsx), glass tintColor alphas, and the
     SPRING configs. In dark mode you may prefer slightly lighter neu highlight (#2A2A2A).

Design intent to preserve: nav bar = flat glass capsule, morphing/scrubbing olive pill, filled
Ionicons; toggle = draggable glass pill (olive=personal, bronze=business); quick actions =
neumorphic tiles with the ORIGINAL icons; FAB/QR = neumorphic, olive icons. Report anything that
doesn't compile or feels off, with before/after screenshots.
```
