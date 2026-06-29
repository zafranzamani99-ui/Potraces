import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Pressable,
  ViewToken,
  Animated,
  Easing,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useIsDark } from '../../hooks/useCalm';
import { useSettingsStore, ThemePreference } from '../../store/settingsStore';
import { useAppStore } from '../../store/appStore';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { SkyBackdrop, FlyingWau } from '../../components/common/WauScene';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// The wau's flight area on the welcome page. The sky itself is the whole
// screen (SkyBackdrop); this just bounds where the kite can roam.
const HERO_SKY_W = Math.min(SCREEN_WIDTH - 48, 360);
const HERO_SKY_H = 232;

interface OnboardingSlideMeta {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  accentColor: string;
}

interface OnboardingPage extends OnboardingSlideMeta {
  title: string;
  description: string;
}

type PageItem =
  | { type: 'welcome' }
  | { type: 'slide'; data: OnboardingPage }
  | { type: 'mode' };

// FIRSTRUN-C4 — cut 5 feature slides to 3. Removed: '3' split & '5' receipts/pulse.
// Their value resurfaces as in-context FeatureHints when the user reaches those screens.
const SLIDE_META: OnboardingSlideMeta[] = [
  { id: '1', icon: 'dollar-sign', accentColor: '#4F5104' },
  { id: '2', icon: 'shopping-bag', accentColor: '#B2780A' },
  { id: '4', icon: 'edit-3', accentColor: '#8B7355' },
];

type ModeChoice = 'personal' | 'business' | 'both';
const MODE_OPTIONS: { id: ModeChoice; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'personal', icon: 'user' },
  { id: 'business', icon: 'briefcase' },
  { id: 'both', icon: 'layers' },
];

// ─── Sky palettes ─────────────────────────────────────────
// The onboarding sits on its own sky (cream day / navy night), so it gets its
// own WCAG-validated palette instead of the app's neutral C tokens. Every text
// pair here is contrast-checked — ratios + rules in docs/DARK_MODE_READABILITY.md.
// Surfaces follow the research rules: day = translucent warm white + warm
// umber shadow (never black on cream); night = navy lightened by a white-alpha
// overlay + lighter stroke, NO shadow (Material dark-elevation rule).
type SkyPalette = {
  ink: string;          // body text — ≥ 4.5:1 on sky AND surface
  sub: string;          // secondary text — ≥ 4.5:1 on sky AND surface
  faint: string;        // placeholders/hints ONLY (3:1 band)
  fieldBg: string;
  fieldBgFocus: string;
  fieldBorder: string;
  focusBorder: string;
  choiceBorder: string; // mode-card resting border
  segTrack: string;
  segThumb: string;
  segThumbBorder: string;
  cardBg: string;       // solid surface for text-heavy mockup cards
  cardBorder: string;
  accent: string;       // interactive accent (olive by day, gold by night)
  ctaInk: string;       // text on the accent
  dotInactive: string;
};

const SKY_DAY: SkyPalette = {
  ink: '#2E2E1F',                          // 11.5:1 on sky
  sub: '#6E6B54',                          // 4.51:1 on sky — do not lighten
  faint: '#8A8770',                        // 3:1 band — placeholders only
  fieldBg: 'rgba(255,255,255,0.55)',
  fieldBgFocus: 'rgba(255,255,255,0.78)',
  fieldBorder: 'rgba(255,255,255,0.65)',   // the glass edge
  focusBorder: '#4F5104',
  choiceBorder: 'rgba(122,98,56,0.20)',
  segTrack: 'rgba(94,76,48,0.10)',         // groove pressed into the sky
  segThumb: 'rgba(255,255,255,0.92)',
  segThumbBorder: 'rgba(255,255,255,0.80)',
  cardBg: '#FFFDF9',
  cardBorder: 'rgba(122,98,56,0.20)',
  accent: '#4F5104',
  ctaInk: '#FFFFFF',                       // 8.36:1 on olive
  dotInactive: 'rgba(79,81,4,0.20)',
};

const SKY_NIGHT: SkyPalette = {
  ink: '#F0EDE8',                          // 12.1:1 on sky
  sub: '#AEB6CC',                          // 6.95:1 on sky
  faint: '#8C93A8',                        // 4.6:1 on sky — placeholders only
  fieldBg: 'rgba(255,255,255,0.07)',       // lighter-than-sky = elevated
  fieldBgFocus: 'rgba(255,255,255,0.11)',
  fieldBorder: 'rgba(255,255,255,0.14)',
  focusBorder: 'rgba(222,171,34,0.85)',
  choiceBorder: 'rgba(255,255,255,0.12)',
  segTrack: 'rgba(0,0,0,0.22)',
  segThumb: 'rgba(255,255,255,0.14)',
  segThumbBorder: 'rgba(255,255,255,0.18)',
  cardBg: '#2B3248',
  cardBorder: 'rgba(255,255,255,0.14)',
  accent: '#DEAB22',                       // 6.68:1 on navy as a UI color
  ctaInk: '#23250F',                       // 7.41:1 on gold
  dotInactive: 'rgba(240,237,232,0.28)',
};

// Warm umber shadows for day (black shadows look like grime on cream).
const WARM_SHADOW = {
  shadowColor: '#7A6238',
  shadowOpacity: 0.14,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
} as const;
const WARM_SHADOW_SM = {
  shadowColor: '#7A6238',
  shadowOpacity: 0.18,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
const NO_SHADOW = {
  shadowColor: 'transparent',
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0,
} as const;

// Night-bright versions of the slide accents — the day olive/bronze/brown
// disappear on the navy sky (olive #4F5104 on #232B40 ≈ 1.3:1).
const NIGHT_ACCENT: Record<string, string> = {
  '#4F5104': '#A8AD52',
  '#B2780A': '#DEAB22',
  '#8B7355': '#C2A37E',
};
const accentFor = (hex: string, dark: boolean) => (dark ? NIGHT_ACCENT[hex] ?? '#DEAB22' : hex);

// ─── Tiny animation primitives ────────────────────────────
// Shared building blocks so every page can stage its entrance. All native-driver.

/** Fades + slides children in when `active` flips true. Plays once and stays —
 *  no reset on inactive, which would blink the outgoing page to invisible while
 *  it's still partly on screen during a swipe (the Android flicker). */
const Reveal: React.FC<{
  active: boolean;
  delay?: number;
  from?: number;
  style?: object;
  children: React.ReactNode;
}> = ({ active, delay = 0, from = 16, style, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (active) {
      Animated.sequence([
        Animated.delay(delay),
        Animated.spring(v, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [active, delay, v]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

/** Springs children from 0 → full scale on mount (radio fills, chips). */
const Pop: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [v]);
  return <Animated.View style={{ opacity: v, transform: [{ scale: v }] }}>{children}</Animated.View>;
};

/** Animated number that counts up while its slide is on screen. */
const CountUp: React.FC<{ active: boolean; to: number; style?: object; prefix?: string }> = ({
  active,
  to,
  style,
  prefix = 'RM ',
}) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) {
      setVal(0);
      return;
    }
    const v = new Animated.Value(0);
    const id = v.addListener(({ value }) => setVal(Math.round(value)));
    Animated.timing(v, { toValue: to, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => v.removeListener(id);
  }, [active, to]);
  return (
    <Text style={style}>
      {prefix}
      {val.toLocaleString()}
    </Text>
  );
};

// ─── Day/Night switch ─────────────────────────────────────
// An iOS/Pixel-class animated switch: spring thumb that morphs sun → moon,
// track that deepens to night with stars surfacing inside it. Lives in the
// onboarding HEADER (always reachable, no scrolling) and drives the whole-sky
// sunrise/sunset behind the content.
const ThemeSwitch: React.FC<{
  dark: boolean;
  onToggle: () => void;
  label: string;
  trackW?: number;
  trackH?: number;
  thumb?: number;
}> = ({ dark, onToggle, label, trackW = 84, trackH = 44, thumb = 34 }) => {
  const a = useRef(new Animated.Value(dark ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: dark ? 1 : 0, friction: 7.5, tension: 70, useNativeDriver: false }).start();
  }, [dark, a]);

  const pad = (trackH - thumb) / 2;
  const x = a.interpolate({ inputRange: [0, 1], outputRange: [pad, trackW - thumb - pad] });
  const trackBg = a.interpolate({ inputRange: [0, 1], outputRange: ['#EAE3D1', '#27304A'] });
  const thumbBg = a.interpolate({ inputRange: [0, 1], outputRange: ['#DEAB22', '#E9E4D4'] });
  const sunO = a.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const moonO = a.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: dark }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Animated.View
        style={{
          width: trackW,
          height: trackH,
          borderRadius: trackH / 2,
          backgroundColor: trackBg,
          borderWidth: 1,
          borderColor: withAlpha('#000000', 0.07),
        }}
      >
        {/* stars surface in the track at night (left, where the thumb isn't) */}
        <Animated.View style={{ position: 'absolute', left: trackW * 0.15, top: trackH * 0.32, opacity: moonO }}>
          <View style={{ width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: '#E9E4D4' }} />
          <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: '#E9E4D4', marginTop: 5, marginLeft: 7 }} />
          <View style={{ width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: '#E9E4D4', marginTop: -8, marginLeft: 13 }} />
        </Animated.View>
        {/* a wisp of cloud by day (right) */}
        <Animated.View style={{ position: 'absolute', right: trackW * 0.14, top: trackH * 0.44, opacity: sunO }}>
          <View style={{ width: trackH * 0.4, height: trackH * 0.14, borderRadius: trackH * 0.07, backgroundColor: withAlpha('#FFFFFF', 0.85) }} />
        </Animated.View>
        {/* the thumb morphs sun → moon */}
        <Animated.View
          style={{
            position: 'absolute',
            top: pad,
            left: 0,
            width: thumb,
            height: thumb,
            borderRadius: thumb / 2,
            backgroundColor: thumbBg,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ translateX: x }],
            shadowColor: '#000000',
            shadowOpacity: 0.18,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          <Animated.View style={{ position: 'absolute', opacity: sunO }}>
            <Feather name="sun" size={Math.round(thumb * 0.54)} color="#8A6A10" />
          </Animated.View>
          <Animated.View style={{ position: 'absolute', opacity: moonO }}>
            <Feather name="moon" size={Math.round(thumb * 0.5)} color="#7A7565" />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
};

// ─── Mini Visual Mockups ──────────────────────────────────

const MockupRow: React.FC<{ icon: string; label: string; accent: string; sky: SkyPalette }> = ({ icon, label, accent, sky }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accent + '18', marginRight: 8, justifyContent: 'center', alignItems: 'center' }}>
      <Feather name={icon as keyof typeof Feather.glyphMap} size={10} color={accent} />
    </View>
    <Text style={{ fontSize: 11, color: sky.sub, flex: 1 }}>{label}</Text>
  </View>
);

const NOTE_TEXT = 'makan rm12\ngrab rm8\nparking rm3\nteh tarik rm2.50';

/** Notes mockup that TYPES its note live, then pops the Echo chip. */
const NotesMockup: React.FC<{ accent: string; sky: SkyPalette; active: boolean; card: object }> = ({ accent, sky, active, card }) => {
  const [n, setN] = useState(0);
  const done = n >= NOTE_TEXT.length;
  useEffect(() => {
    if (!active) {
      setN(0);
      return;
    }
    const id = setInterval(() => {
      setN((p) => {
        if (p >= NOTE_TEXT.length) {
          clearInterval(id);
          return p;
        }
        return p + 1;
      });
    }, 28);
    return () => clearInterval(id);
  }, [active]);

  return (
    <View style={card}>
      <Text style={{ fontSize: 10, color: sky.faint, marginBottom: 6 }}>Notes</Text>
      <Text style={{ fontSize: 12, color: sky.ink, lineHeight: 18, height: 72 }}>
        {NOTE_TEXT.slice(0, n)}
        {!done && active ? '▍' : ''}
      </Text>
      <View style={{ marginTop: 10, height: 26, justifyContent: 'center' }}>
        {done && (
          <Pop>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: accent + '12', borderRadius: RADIUS.md, padding: 6 }}>
              <Feather name="zap" size={12} color={accent} />
              <Text style={{ fontSize: 10, color: accent, marginLeft: 4, fontWeight: '500' }}>4 amounts detected — tap to save</Text>
            </View>
          </Pop>
        )}
      </View>
    </View>
  );
};

const SlideMockup: React.FC<{ slideId: string; accent: string; sky: SkyPalette; isDark: boolean; active: boolean }> = ({ slideId, accent, sky, isDark, active }) => {
  const card = {
    width: 264,
    height: 212,
    borderRadius: RADIUS.xl,
    backgroundColor: sky.cardBg,
    borderWidth: 1.5,
    borderColor: sky.cardBorder,
    padding: SPACING.md,
    overflow: 'hidden' as const,
    // borderRadius + overflow:'hidden' + elevation on Android renders a ghost
    // ring/inset ("padding") around the card, worst mid-reveal. iOS clips this
    // shadow via overflow anyway, so drop the Android elevation; border defines it.
    ...(isDark ? NO_SHADOW : { ...WARM_SHADOW, elevation: 0 }),
  };

  switch (slideId) {
    case '1': // Track Money — rows cascade in, the month total counts up
      return (
        <View style={card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
            <Text style={{ fontSize: 10, color: sky.faint }}>this month</Text>
            <CountUp active={active} to={4250} style={{ fontSize: 13, color: accent, fontWeight: '700' }} />
          </View>
          {[
            { icon: 'coffee', label: 'nasi lemak  RM8.50' },
            { icon: 'navigation', label: 'Grab to work  RM15' },
            { icon: 'zap', label: 'Unifi bill  RM129' },
            { icon: 'shopping-bag', label: 'Shopee  RM89.90' },
          ].map((r, i) => (
            <Reveal key={r.label} active={active} delay={250 + i * 140} from={10}>
              <MockupRow icon={r.icon} label={r.label} accent={accent} sky={sky} />
            </Reveal>
          ))}
          <Reveal active={active} delay={900} from={6} style={{ marginTop: 8, alignSelf: 'center' }}>
            <Text style={{ fontSize: 9, color: sky.faint }}>auto-categorised</Text>
          </Reveal>
        </View>
      );

    case '2': // Business — order cards slide in like incoming orders
      return (
        <View style={card}>
          <Reveal active={active} delay={200} from={14}>
            <View style={{ backgroundColor: accent + '14', borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.xs }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: accent }}>Order #001</Text>
              <Text style={{ fontSize: 10, color: sky.sub, marginTop: 2 }}>Tshirt (L) x3, Sticker pack x5</Text>
              <Text style={{ fontSize: 10, fontWeight: '600', color: accent, marginTop: 4 }}>RM 85.00</Text>
            </View>
          </Reveal>
          <Reveal active={active} delay={420} from={14}>
            <View style={{ backgroundColor: accent + '14', borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.xs }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: accent }}>Order #002</Text>
              <Text style={{ fontSize: 10, color: sky.sub, marginTop: 2 }}>Nasi lemak x2, Kuih lapis x4</Text>
              <Text style={{ fontSize: 10, fontWeight: '600', color: accent, marginTop: 4 }}>RM 52.00</Text>
            </View>
          </Reveal>
          <Reveal active={active} delay={650} from={6} style={{ marginTop: 4, alignSelf: 'center' }}>
            <Text style={{ fontSize: 9, color: sky.faint }}>paste from WhatsApp</Text>
          </Reveal>
        </View>
      );

    case '4': // Notes & Echo — live typewriter + chip pop
      return <NotesMockup accent={accent} sky={sky} active={active} card={card} />;

    default:
      return null;
  }
};

// ─── Pager dots that stretch into pills ───────────────────
const Dots: React.FC<{ count: number; index: number; colors: string[]; inactive: string }> = ({ count, index, colors, inactive }) => {
  const vals = useRef(Array.from({ length: count }, (_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  useEffect(() => {
    vals.forEach((v, i) =>
      Animated.spring(v, { toValue: i === index ? 1 : 0, friction: 8, tension: 90, useNativeDriver: false }).start(),
    );
  }, [index, vals]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
      {vals.map((v, i) => (
        <Animated.View
          key={`dot-${i}`}
          style={{
            height: 8,
            borderRadius: RADIUS.full,
            width: v.interpolate({ inputRange: [0, 1], outputRange: [8, 26] }),
            backgroundColor: v.interpolate({ inputRange: [0, 1], outputRange: [inactive, colors[i]] }),
          }}
        />
      ))}
    </View>
  );
};

const Onboarding: React.FC = () => {
  const isDark = useIsDark();
  const t = useT();
  const insets = useSafeAreaInsets();
  // Android (SDK 54 edge-to-edge) can report a stale/too-wide module-load
  // Dimensions snapshot, which made the pager's pages wider than the real
  // screen and clipped page content on the right. Measure the list's actual
  // width instead and drive page width + getItemLayout from it.
  const { width: winW } = useWindowDimensions();
  const [listW, setListW] = useState(winW);
  const flatListRef = useRef<FlatList>(null);
  // The pager's native scroll, exposed as an RNGH gesture so the wau kite drag
  // can be declared simultaneous with it — instead of a JS kill-switch that
  // froze paging a frame late on Android.
  const nativePager = useMemo(() => Gesture.Native(), []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [name, setName] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [selectedLang, setSelectedLang] = useState<'en' | 'ms'>('en');
  const [selectedMode, setSelectedMode] = useState<ModeChoice | null>(null);
  const setHasCompletedOnboarding = useSettingsStore((s) => s.setHasCompletedOnboarding);
  const setUserName = useSettingsStore((s) => s.setUserName);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const setDefaultMode = useSettingsStore((s) => s.setDefaultMode);
  const setMode = useAppStore((s) => s.setMode);
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);

  // Highlight/animate against what's on screen now. If the saved preference is
  // 'system', resolve to the actual light/dark so every control has a state.
  const effectiveTheme: 'light' | 'dark' =
    themePreference === 'dark' || (themePreference === 'system' && isDark) ? 'dark' : 'light';
  const skyDark = effectiveTheme === 'dark';
  // The onboarding's own WCAG-validated palette (see docs/DARK_MODE_READABILITY.md).
  const sky = skyDark ? SKY_NIGHT : SKY_DAY;
  const styles = useMemo(() => makeStyles(skyDark, sky), [skyDark, sky]);

  // Language segmented control — sliding thumb.
  const [segW, setSegW] = useState(0);
  const segAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(segAnim, { toValue: selectedLang === 'ms' ? 1 : 0, friction: 8, tension: 90, useNativeDriver: false }).start();
  }, [selectedLang, segAnim]);
  const onSegLayout = useCallback((e: LayoutChangeEvent) => setSegW(e.nativeEvent.layout.width), []);

  // CTA arrow nudge — a gentle "go on" gesture.
  const nudge = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(nudge, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(nudge, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(700),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [nudge]);

  const PAGES: OnboardingPage[] = useMemo(() => [
    { ...SLIDE_META[0], title: t.onboarding.trackMoney, description: t.onboarding.trackMoneyDesc },
    { ...SLIDE_META[1], title: t.onboarding.runBusiness, description: t.onboarding.runBusinessDesc },
    { ...SLIDE_META[2], title: t.onboarding.notesEcho, description: t.onboarding.notesEchoDesc },
  ], [t]);

  const ALL_PAGES: PageItem[] = useMemo(() => [
    { type: 'welcome' },
    ...PAGES.map(p => ({ type: 'slide' as const, data: p })),
    { type: 'mode' as const },
  ], [PAGES]);

  const DOT_COLORS = useMemo(
    () => [sky.accent, ...PAGES.map((p) => accentFor(p.accentColor, skyDark)), sky.accent],
    [sky, skyDark, PAGES],
  );

  // FIRSTRUN-H6 — persist on every change so swiping past welcome cannot lose the name.
  const handleNameChange = useCallback((next: string) => {
    setName(next);
    const trimmed = next.trim();
    // setUserName accepts string; clear via empty string is fine here.
    setUserName(trimmed);
  }, [setUserName]);

  const handleLangChange = useCallback((lang: 'en' | 'ms') => {
    lightTap();
    setSelectedLang(lang);
    setLanguage(lang);
  }, [setLanguage]);

  // Apply immediately — useCalm() is reactive, so the whole screen re-themes live.
  const handleThemeChange = useCallback((pref: ThemePreference) => {
    lightTap();
    setThemePreference(pref);
  }, [setThemePreference]);

  // FIRSTRUN-C2 — apply mode choice. Default 'personal' if user skips before picking.
  const applyModeChoice = useCallback((choice: ModeChoice | null) => {
    const resolved: ModeChoice = choice ?? 'personal';
    if (resolved === 'business') {
      setDefaultMode('business');
      setMode('business');
    } else {
      // 'personal' and 'both' both land in personal first; 'both' just keeps business
      // discoverable (user can flip in Settings).
      setDefaultMode('personal');
      setMode('personal');
    }
  }, [setDefaultMode, setMode]);

  const handleComplete = useCallback(() => {
    // Inputs are already persisted on change; this is a final safety net.
    if (name.trim()) setUserName(name.trim());
    setLanguage(selectedLang);
    applyModeChoice(selectedMode);
    setHasCompletedOnboarding(true);
  }, [name, selectedLang, selectedMode, setUserName, setLanguage, applyModeChoice, setHasCompletedOnboarding]);

  const handleNext = useCallback(() => {
    if (currentIndex < ALL_PAGES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      handleComplete();
    }
  }, [currentIndex, handleComplete, ALL_PAGES.length]);

  const handleModePick = useCallback((choice: ModeChoice) => {
    lightTap();
    setSelectedMode(choice);
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  // Flip `currentIndex` only once a page is mostly settled (not at 50% mid-swipe),
  // so an outgoing page's content isn't reset/re-animated while still on screen.
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 80 }).current;

  const renderPage = useCallback(({ item, index }: { item: PageItem; index: number }) => {
    const active = currentIndex === index;

    if (item.type === 'welcome') {
      // Warm, personal greeting — updates live as they type their name.
      const firstName = name.trim().split(/\s+/)[0];
      const greeting = firstName
        ? t.onboarding.hiThere.replace(/!?$/, `, ${firstName}!`)
        : t.onboarding.hiThere;
      return (
        <View style={[styles.welcomePage, { width: listW }]}>
          <KeyboardAwareScrollView
            style={styles.welcomeScroll}
            contentContainerStyle={styles.welcomeScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            bounces={false}
            bottomOffset={24}
          >
            <View style={styles.welcomeInner}>
              {/* The wau in the open sky — drag it and it fights the wind,
                  release and it glides slowly home. The whole screen behind
                  is the sky (SkyBackdrop), so no frame here. */}
              <View style={styles.heroArea}>
                <FlyingWau
                  size={150}
                  panelW={HERO_SKY_W}
                  panelH={HERO_SKY_H}
                  dark={skyDark}
                  pagerGesture={nativePager}
                />
              </View>

              <Text style={styles.welcomeTitle} accessibilityRole="header">{greeting}</Text>
              <Text style={styles.description}>{t.onboarding.letsSetUp}</Text>

              <View style={styles.welcomeForm}>
                {/* Name — filled card input with focus ring */}
                <View style={styles.sectionLabelRow}>
                  <Feather name="user" size={13} color={sky.sub} />
                  <Text style={styles.welcomeLabel}>{t.onboarding.whatCallYou}</Text>
                </View>
                <View style={[styles.inputCard, nameFocused && styles.inputCardFocused]}>
                  <TextInput
                    style={styles.inputCardField}
                    value={name}
                    onChangeText={handleNameChange}
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => setNameFocused(false)}
                    placeholder={t.onboarding.nameOptional}
                    placeholderTextColor={sky.faint}
                    autoCapitalize="words"
                    returnKeyType="done"
                    accessibilityLabel={t.onboarding.whatCallYou}
                    keyboardAppearance={skyDark ? 'dark' : 'light'}
                    selectionColor={sky.accent}
                  />
                </View>

                {/* Language — sliding segmented control */}
                <View style={[styles.sectionLabelRow, { marginTop: SPACING.xl }]}>
                  <Feather name="globe" size={13} color={sky.sub} />
                  <Text style={styles.welcomeLabel}>{t.onboarding.language}</Text>
                </View>
                <View style={styles.segTrack} onLayout={onSegLayout}>
                  {segW > 0 && (
                    <Animated.View
                      style={[
                        styles.segThumb,
                        {
                          width: (segW - 6) / 2,
                          transform: [
                            { translateX: segAnim.interpolate({ inputRange: [0, 1], outputRange: [3, 3 + (segW - 6) / 2] }) },
                          ],
                        },
                      ]}
                    />
                  )}
                  <Pressable
                    style={styles.segItem}
                    onPress={() => handleLangChange('en')}
                    accessibilityRole="button"
                    accessibilityLabel="English"
                    accessibilityState={{ selected: selectedLang === 'en' }}
                  >
                    <Text style={[styles.segText, selectedLang === 'en' && styles.segTextActive]}>English</Text>
                  </Pressable>
                  <Pressable
                    style={styles.segItem}
                    onPress={() => handleLangChange('ms')}
                    accessibilityRole="button"
                    accessibilityLabel="Bahasa Melayu"
                    accessibilityState={{ selected: selectedLang === 'ms' }}
                  >
                    <Text style={[styles.segText, selectedLang === 'ms' && styles.segTextActive]}>Bahasa Melayu</Text>
                  </Pressable>
                </View>

              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      );
    }

    if (item.type === 'mode') {
      return (
        <View style={[styles.page, { width: listW }]}>
          <View style={styles.pageInner}>
            <Reveal active={active} delay={60} from={12} style={{ alignSelf: 'stretch' }}>
              <Text style={styles.title} accessibilityRole="header">{t.onboarding.modePickTitle}</Text>
              <Text style={styles.description}>{t.onboarding.modePickSubtitle}</Text>
            </Reveal>

            <View style={styles.modeList}>
              {MODE_OPTIONS.map((opt, i) => {
                const isActive = selectedMode === opt.id;
                const label = t.onboarding[
                  opt.id === 'personal' ? 'modeTrackMine'
                  : opt.id === 'business' ? 'modeRunSomething'
                  : 'modeBoth'
                ];
                const sub = t.onboarding[
                  opt.id === 'personal' ? 'modeTrackMineSub'
                  : opt.id === 'business' ? 'modeRunSomethingSub'
                  : 'modeBothSub'
                ];
                return (
                  <Reveal key={opt.id} active={active} delay={180 + i * 120} from={18}>
                    <TouchableOpacity
                      style={[styles.modeCard, isActive && styles.modeCardActive]}
                      onPress={() => handleModePick(opt.id)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: isActive }}
                    >
                      <View style={[styles.modeIconWrap, isActive && styles.modeIconWrapActive]}>
                        <Feather name={opt.icon} size={20} color={isActive ? sky.accent : sky.sub} />
                      </View>
                      <View style={styles.modeTextWrap}>
                        <Text style={[styles.modeLabel, isActive && styles.modeLabelActive]}>{label}</Text>
                        <Text style={styles.modeSub}>{sub}</Text>
                      </View>
                      <View style={[styles.radioOuter, isActive && styles.radioOuterActive]}>
                        {isActive && (
                          <Pop>
                            <View style={styles.radioInner}>
                              <Feather name="check" size={12} color={sky.ctaInk} />
                            </View>
                          </Pop>
                        )}
                      </View>
                    </TouchableOpacity>
                  </Reveal>
                );
              })}
            </View>
          </View>
        </View>
      );
    }

    const slide = item.data;
    return (
      <View style={[styles.page, { width: listW }]}>
        <View style={styles.pageInner}>
          <View style={styles.mockupContainer}>
            <Reveal active={active} delay={40} from={20}>
              <SlideMockup slideId={slide.id} accent={accentFor(slide.accentColor, skyDark)} sky={sky} isDark={skyDark} active={active} />
            </Reveal>
          </View>
          <Reveal active={active} delay={140} from={14} style={{ alignSelf: 'stretch' }}>
            <Text style={styles.title} accessibilityRole="header">{slide.title}</Text>
            <Text style={styles.description}>{slide.description}</Text>
          </Reveal>
        </View>
      </View>
    );
  }, [name, nameFocused, selectedLang, selectedMode, currentIndex, effectiveTheme, skyDark, sky, segW, segAnim, t, styles, listW, handleNameChange, handleLangChange, handleThemeChange, handleModePick, onSegLayout]);

  const isLastPage = currentIndex === ALL_PAGES.length - 1;
  // FIRSTRUN-C4 — skip available on every page except the final mode-pick (where the button
  // IS the commit). Welcome inputs are persisted on change, so skipping from there is safe.
  const canSkip = !isLastPage;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* The entire onboarding lives under one sky — clouds by day, stars by
          night, following the theme choice live. */}
      <SkyBackdrop dark={effectiveTheme === 'dark'} />

      {/* Header — day/night switch top-left (always reachable, no scrolling;
          flipping it plays sunrise/sunset across the whole screen), skip
          top-right on every page except the final mode-pick. */}
      <View style={styles.header}>
        <ThemeSwitch
          dark={effectiveTheme === 'dark'}
          onToggle={() => handleThemeChange(effectiveTheme === 'dark' ? 'light' : 'dark')}
          label={t.onboarding.appearance}
          trackW={64}
          trackH={34}
          thumb={26}
        />
        {canSkip ? (
          <TouchableOpacity
            onPress={handleComplete}
            style={styles.skipButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t.onboarding.skip}
          >
            <Text style={styles.skipText}>{t.onboarding.skip}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipButton} />
        )}
      </View>

      {/* Pages — wrapped so the wau kite drag can run simultaneously with the
          pager's native scroll (Gesture.Native) instead of blocking it. */}
      <GestureDetector gesture={nativePager}>
        <FlatList
          ref={flatListRef}
          data={ALL_PAGES}
          renderItem={renderPage}
          keyExtractor={(_, index) => `page-${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          // removeClippedSubviews unmounts/remounts pages on this 5-item list,
          // restarting entrance animations and flickering on Android. They all
          // fit in memory — keep them mounted.
          removeClippedSubviews={false}
          maxToRenderPerBatch={6}
          windowSize={7}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && w !== listW) setListW(w);
          }}
          getItemLayout={(_, index) => ({
            length: listW,
            offset: listW * index,
            index,
          })}
          keyboardShouldPersistTaps="handled"
        />
      </GestureDetector>

      {/* Bottom: dots + button */}
      <View style={styles.footer}>
        <Dots count={ALL_PAGES.length} index={currentIndex} colors={DOT_COLORS} inactive={sky.dotInactive} />

        {(() => {
          const currentPage = ALL_PAGES[currentIndex];
          const slideIndex = currentPage?.type === 'slide' ? currentIndex - 1 : -1;
          // Night CTAs use the bright accent variants (gold family) with near-black
          // ink — the day olives fail contrast on the navy sky.
          const buttonAccent = slideIndex >= 0
            ? accentFor(PAGES[slideIndex]?.accentColor ?? SKY_DAY.accent, skyDark)
            : sky.accent;
          // Final page = mode-pick. Disable until the user picks one.
          const isModePage = currentPage?.type === 'mode';
          const disabled = isModePage && selectedMode == null;
          const label =
            currentIndex === 0
              ? t.onboarding.letsGo
              : isLastPage
                ? t.onboarding.getStarted
                : t.common.next;
          return (
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: buttonAccent, shadowColor: buttonAccent },
                disabled && styles.buttonDisabled,
              ]}
              onPress={handleNext}
              activeOpacity={0.8}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ disabled }}
            >
              <Text style={styles.buttonText}>{label}</Text>
              {!isLastPage && (
                <Animated.View
                  style={{
                    marginLeft: SPACING.xs,
                    transform: [{ translateX: nudge.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }],
                  }}
                >
                  <Feather name="arrow-right" size={18} color={sky.ctaInk} />
                </Animated.View>
              )}
            </TouchableOpacity>
          );
        })()}
      </View>
    </View>
  );
};

const makeStyles = (skyDark: boolean, sky: SkyPalette) => StyleSheet.create({
  container: {
    flex: 1,
    // Matches the SkyBackdrop base so there's no flash before it paints.
    backgroundColor: skyDark ? '#232B40' : '#F3EAD6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  skipButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    minWidth: 40,
  },
  skipText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: sky.sub,
    textAlign: 'right',
  },
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING['3xl'],
  },
  pageInner: {
    width: '100%',
    maxWidth: 460,
    alignItems: 'center',
  },
  mockupContainer: {
    marginBottom: SPACING['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: sky.ink,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  welcomeTitle: {
    fontSize: TYPOGRAPHY.size['4xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: sky.ink,
    textAlign: 'center',
    // Stretch to full width so the centered text measures against the real
    // width — bare auto-width children mis-measure narrow inside the nested
    // scroll + horizontal pager on Android, wrapping short strings.
    alignSelf: 'stretch',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },
  description: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: sky.sub,
    textAlign: 'center',
    // Full width so short centered strings (e.g. BM "jom mula") don't wrap from
    // a too-narrow auto-width measurement inside the nested scroll on Android.
    alignSelf: 'stretch',
    lineHeight: TYPOGRAPHY.size.base * TYPOGRAPHY.lineHeight.relaxed,
    paddingHorizontal: SPACING.md,
  },
  footer: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING['3xl'],
    alignItems: 'center',
    gap: SPACING.xl,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING['3xl'],
    borderRadius: RADIUS.lg,
    width: '100%',
    maxWidth: 320,
    ...(skyDark
      ? NO_SHADOW
      : { shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }),
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: sky.ctaInk,
  },

  // ── Welcome page ──
  welcomePage: {
    flex: 1,
  },
  welcomeScroll: {
    flex: 1,
  },
  welcomeScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING['3xl'],
    paddingVertical: SPACING['2xl'],
  },
  welcomeInner: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
  },
  heroArea: {
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  welcomeForm: {
    width: '100%',
    marginTop: SPACING['2xl'],
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  welcomeLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: sky.sub,
  },
  // Glass field: translucent warm white by day (warm umber shadow, never
  // black-on-cream); lighter-than-sky fill + stroke by night (no shadow).
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: sky.fieldBg,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: sky.fieldBorder,
    paddingHorizontal: SPACING.md,
    minHeight: 56,
    // Android renders elevation shadows BEHIND a translucent surface, so the
    // shadow shows through the glass field as a doubled/ghosted box. Keep the
    // soft iOS shadow; drop the Android elevation (the 1.5px border defines it).
    ...(skyDark ? NO_SHADOW : { ...WARM_SHADOW, elevation: 0 }),
  },
  inputCardFocused: {
    borderColor: sky.focusBorder,
    backgroundColor: sky.fieldBgFocus,
  },
  inputCardField: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.lg,
    color: sky.ink,
  },
  // iOS-style segmented control: groove pressed into the sky, elevated thumb.
  segTrack: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 14,
    backgroundColor: sky.segTrack,
    alignItems: 'center',
  },
  segThumb: {
    position: 'absolute',
    top: 3,
    left: 0,
    height: 46,
    borderRadius: 11,
    backgroundColor: sky.segThumb,
    borderWidth: 1,
    borderColor: sky.segThumbBorder,
    ...(skyDark ? NO_SHADOW : { ...WARM_SHADOW_SM, elevation: 0 }),
  },
  segItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: sky.sub,
  },
  segTextActive: {
    color: sky.ink,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // ── Mode page ──
  modeList: {
    width: '100%',
    marginTop: SPACING['2xl'],
    gap: SPACING.md,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 16,
    backgroundColor: sky.fieldBg,
    borderWidth: 1.5,
    borderColor: sky.choiceBorder,
    gap: SPACING.md,
    ...(skyDark ? NO_SHADOW : { ...WARM_SHADOW_SM, elevation: 0 }),
  },
  modeCardActive: {
    borderColor: sky.accent,
    backgroundColor: withAlpha(sky.accent, 0.14),
  },
  modeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(sky.sub, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconWrapActive: {
    backgroundColor: withAlpha(sky.accent, 0.18),
  },
  modeTextWrap: {
    flex: 1,
  },
  modeLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: sky.ink,
  },
  modeLabelActive: {
    color: skyDark ? sky.accent : sky.accent,
  },
  modeSub: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: sky.sub,
    marginTop: SPACING.xs / 2,
    lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.normal,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: sky.choiceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: sky.accent,
  },
  radioInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: sky.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Onboarding;
