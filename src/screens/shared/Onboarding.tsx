import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Pressable,
  Animated,
  Easing,
  LayoutChangeEvent,
  useWindowDimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import RAnimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedReaction,
  interpolate,
  interpolateColor,
  Extrapolation,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
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
import { loadSampleData, SAMPLE_PROFILES, DEFAULT_SAMPLE_BRACKET, type SampleBracket } from '../../utils/sampleData';
import { SkyBackdrop, FlyingWau } from '../../components/common/WauScene';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import Avatar from '../../components/common/Avatar';
import AvatarPicker from '../../components/common/AvatarPicker';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Liquid-glass gating (same rules as GlassModeToggle / the nav bar): iOS 26 →
// Apple's genuine system segmented control (real Liquid Glass, text-only);
// Android / iOS < 26 → an expo-blur glass capsule with a non-glass selection pill.
const GLASS = isLiquidGlassAvailable();
const NATIVE_SEGMENTED = Platform.OS === 'ios' && GLASS;

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

// FIRSTRUN-C4 — cut 5 feature slides to 3. Removed: '3' split & '5' receipts/pulse.
// Their value resurfaces as in-context FeatureHints when the user reaches those screens.
const SLIDE_META: OnboardingSlideMeta[] = [
  { id: '1', icon: 'dollar-sign', accentColor: '#4F5104' },
  { id: '2', icon: 'shopping-bag', accentColor: '#B2780A' },
  { id: '4', icon: 'edit-3', accentColor: '#8B7355' },
];

// Final page: how the user wants to begin. 'fresh' = empty stores;
// 'demo' seeds the same sample dataset as Settings → Load Sample Data.
type StartChoice = 'fresh' | 'demo';
const START_OPTIONS: { id: StartChoice; icon: keyof typeof Feather.glyphMap }[] = [
  { id: 'fresh', icon: 'sunrise' },
  { id: 'demo', icon: 'play-circle' },
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
  choiceBorder: string; // choice-card resting border
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
const NO_SHADOW = {
  shadowColor: 'transparent',
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0,
} as const;

// Neu Select (footer CTA) shadow override. The kit's default raisedSoft reads too
// heavy on the sky — the drop separated from the pill and made it look thin. This
// is a tighter, grounded drop that hugs the pill: soft near-black on the night
// sky, warm umber on the cream day sky. Applied via NeuButton's `style` prop,
// which overrides raisedSoft's boxShadow (onboarding only — the global button is
// unchanged). Cast to any: boxShadow isn't in this RN version's ViewStyle types.
const CTA_SHADOW: Record<'dark' | 'light', any> = {
  dark: { boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(0,0,0,0.45)' }] },
  light: { boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 8, color: 'rgba(122,98,56,0.16)' }] },
};

// Neu Pills (start-choice cards / profile rows) LIGHT-mode shadow. The neu kit's
// light raisedSoft uses a near-white #FFFFFF highlight that glows on the warm cream
// sky and flares during the sunrise/sunset transition (a white halo, not native to
// this screen's warm-shadow design). On the DAY sky the cards use this warm umber
// drop instead — no white highlight; DARK keeps neu.raisedSoft (soft black drop).
// #7A6238 = the sky's WARM_SHADOW umber. Cast to any (boxShadow not in ViewStyle types).
const CARD_SHADOW_LIGHT: any = {
  boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 10, color: 'rgba(122,98,56,0.16)' }],
};

// Night-bright versions of the slide accents — the day olive/bronze/brown
// disappear on the navy sky (olive #4F5104 on #232B40 ≈ 1.3:1).
const NIGHT_ACCENT: Record<string, string> = {
  '#4F5104': '#A8AD52',
  '#B2780A': '#DEAB22',
  '#8B7355': '#C2A37E',
};
const accentFor = (hex: string, dark: boolean) => (dark ? NIGHT_ACCENT[hex] ?? '#DEAB22' : hex);

type Styles = ReturnType<typeof makeStyles>;
type Translations = ReturnType<typeof useT>;

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

/** Animated number that counts up the first time its slide settles on screen.
 *  Plays once and keeps its final value — resetting on inactive re-ran the
 *  JS-thread listener loop on every revisit and flickered mid-swipe. */
const CountUp: React.FC<{ active: boolean; to: number; style?: object; prefix?: string }> = ({
  active,
  to,
  style,
  prefix = 'RM ',
}) => {
  const [val, setVal] = useState(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    const v = new Animated.Value(0);
    const id = v.addListener(({ value }) => setVal(Math.round(value)));
    Animated.timing(v, { toValue: to, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
      v.removeListener(id);
      setVal(to);
    });
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

/** Notes mockup that TYPES its note live, then pops the Echo chip.
 *  Types once on first settle and stays typed — see CountUp for why. */
const NotesMockup: React.FC<{ accent: string; sky: SkyPalette; active: boolean; card: object }> = ({ accent, sky, active, card }) => {
  const [n, setN] = useState(0);
  const startedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = n >= NOTE_TEXT.length;
  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);
  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    intervalRef.current = setInterval(() => {
      setN((p) => {
        if (p >= NOTE_TEXT.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return p;
        }
        return p + 1;
      });
    }, 28);
  }, [active]);

  return (
    <View style={card}>
      <Text style={{ fontSize: 10, color: sky.faint, marginBottom: 6 }}>Notes</Text>
      <Text style={{ fontSize: 12, color: sky.ink, lineHeight: 18, height: 72 }}>
        {NOTE_TEXT.slice(0, n)}
        {!done && n > 0 ? '▍' : ''}
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
// Driven directly by the pager's scroll position on the UI thread — the JS
// thread does zero work while the dots stretch/tint mid-swipe.
const PagerDot: React.FC<{
  index: number;
  scrollX: SharedValue<number>;
  pageW: number;
  color: string;
  inactive: string;
}> = ({ index, scrollX, pageW, color, inactive }) => {
  const style = useAnimatedStyle(() => {
    const pos = scrollX.value / Math.max(1, pageW);
    return {
      width: interpolate(pos, [index - 1, index, index + 1], [8, 26, 8], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(pos, [index - 1, index, index + 1], [inactive, color, inactive]),
    };
  }, [pageW, color, inactive, index]);
  return <RAnimated.View style={[{ height: 8, borderRadius: RADIUS.full }, style]} />;
};

const Dots: React.FC<{
  colors: string[];
  inactive: string;
  scrollX: SharedValue<number>;
  pageW: number;
}> = ({ colors, inactive, scrollX, pageW }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
    {colors.map((c, i) => (
      <PagerDot key={`dot-${i}`} index={i} scrollX={scrollX} pageW={pageW} color={c} inactive={inactive} />
    ))}
  </View>
);

// ─── Pages ────────────────────────────────────────────────
// Each page is memoized so pager swipes, keystrokes on the welcome page, and
// index flips never re-render the other pages — that full-list re-render was
// what dropped the old FlatList pager to ~30fps mid-swipe.

const WelcomePage = React.memo<{
  listW: number;
  sky: SkyPalette;
  skyDark: boolean;
  styles: Styles;
  t: Translations;
  pagerGesture: ReturnType<typeof Gesture.Native>;
}>(({ listW, sky, skyDark, styles, t, pagerGesture }) => {
  const setUserName = useSettingsStore((s) => s.setUserName);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  // Name/language live here (not in the pager parent) so typing re-renders
  // only this page. Both persist on change (FIRSTRUN-H6), so swiping or
  // skipping past welcome cannot lose them.
  const [name, setName] = useState(() => useSettingsStore.getState().userName);
  const [nameFocused, setNameFocused] = useState(false);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [selectedLang, setSelectedLang] = useState<'en' | 'ms'>(() =>
    useSettingsStore.getState().language === 'ms' ? 'ms' : 'en',
  );

  // Language segmented control — sliding thumb.
  const [segW, setSegW] = useState(0);
  const segAnim = useRef(new Animated.Value(selectedLang === 'ms' ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(segAnim, { toValue: selectedLang === 'ms' ? 1 : 0, friction: 8, tension: 90, useNativeDriver: true }).start();
  }, [selectedLang, segAnim]);
  const onSegLayout = useCallback((e: LayoutChangeEvent) => setSegW(e.nativeEvent.layout.width), []);

  const handleNameChange = useCallback((next: string) => {
    setName(next);
    // setUserName accepts string; clear via empty string is fine here.
    setUserName(next.trim());
  }, [setUserName]);

  const handleLangChange = useCallback((lang: 'en' | 'ms') => {
    lightTap();
    setSelectedLang(lang);
    setLanguage(lang);
  }, [setLanguage]);

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
              pagerGesture={pagerGesture}
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

            {/* Avatar — optional; presets now, Google photo if they sign in */}
            <View style={[styles.sectionLabelRow, { marginTop: SPACING.xl }]}>
              <Feather name="smile" size={13} color={sky.sub} />
              <Text style={styles.welcomeLabel}>{t.onboarding.avatarLabel}</Text>
            </View>
            <Pressable
              style={styles.avatarRow}
              onPress={() => { lightTap(); setAvatarPickerVisible(true); }}
              accessibilityRole="button"
              accessibilityLabel={t.onboarding.avatarLabel}
            >
              <Avatar size={44} />
              <Text style={styles.avatarHint}>{t.onboarding.avatarHint}</Text>
              <Feather name="chevron-right" size={16} color={sky.sub} />
            </Pressable>

            {/* Language — liquid-glass segmented control. iOS 26 → the genuine
                system control (real Liquid Glass, text-only); Android / iOS<26 →
                a glass capsule with a non-glass sliding selection pill. */}
            <View style={[styles.sectionLabelRow, { marginTop: SPACING.xl }]}>
              <Feather name="globe" size={13} color={sky.sub} />
              <Text style={styles.welcomeLabel}>{t.onboarding.language}</Text>
            </View>
            {NATIVE_SEGMENTED ? (
              <SegmentedControl
                style={styles.langNative}
                values={['English', 'Bahasa Melayu']}
                selectedIndex={selectedLang === 'ms' ? 1 : 0}
                onChange={(e) => handleLangChange(e.nativeEvent.selectedSegmentIndex === 1 ? 'ms' : 'en')}
                appearance={skyDark ? 'dark' : 'light'}
                fontStyle={{ color: sky.sub, fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold as any }}
                activeFontStyle={{ color: sky.accent, fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold as any }}
              />
            ) : (
              <View style={[styles.langCapsule, !GLASS && styles.langCapsuleClip]}>
                {/* ── The single glass surface ── */}
                {GLASS ? (
                  <GlassView
                    style={[StyleSheet.absoluteFill, styles.langCapsuleShape]}
                    glassEffectStyle="regular"
                  />
                ) : (
                  <>
                    <BlurView
                      style={[StyleSheet.absoluteFill, styles.langCapsuleShape]}
                      intensity={skyDark ? 30 : 40}
                      tint={skyDark ? 'dark' : 'light'}
                      experimentalBlurMethod="dimezisBlurView"
                    />
                    <View style={[StyleSheet.absoluteFill, styles.langCapsuleShape, styles.langFallbackTint]} />
                  </>
                )}
                <View style={styles.langTrack} onLayout={onSegLayout}>
                  {/* Non-glass sliding selection pill (glass-on-glass is Apple's anti-pattern) */}
                  {segW > 0 && (
                    <Animated.View
                      style={[
                        styles.langPill,
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
            )}

          </View>
        </View>
      </KeyboardAwareScrollView>
      <AvatarPicker visible={avatarPickerVisible} onClose={() => setAvatarPickerVisible(false)} />
    </View>
  );
});
WelcomePage.displayName = 'WelcomePage';

const SlidePage = React.memo<{
  slide: OnboardingPage;
  active: boolean;
  listW: number;
  sky: SkyPalette;
  skyDark: boolean;
  styles: Styles;
}>(({ slide, active, listW, sky, skyDark, styles }) => (
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
));
SlidePage.displayName = 'SlidePage';

const StartChoicePage = React.memo<{
  active: boolean;
  selected: StartChoice | null;
  onPick: (choice: StartChoice) => void;
  bracket: SampleBracket;
  onPickBracket: (b: SampleBracket) => void;
  listW: number;
  sky: SkyPalette;
  skyDark: boolean;
  styles: Styles;
  t: Translations;
}>(({ active, selected, onPick, bracket, onPickBracket, listW, sky, skyDark, styles, t }) => {
  // Neu Pills: the choice cards / profile rows are tappable selectors — faintDark
  // neu raised (blends into the sky glass), olive fill when selected. Base is the
  // sky's translucent field fill so the card reads as glass on the sky, not an
  // app-toned slab. In dark this also adds depth the old NO_SHADOW cards lacked.
  // DARK → neu.raisedSoft (soft black drop). DAY → a warm umber drop (CARD_SHADOW_LIGHT)
  // instead of neu's white highlight, which glows on the cream sky (see that const).
  const neu = useNeu(sky.fieldBg, { faintDark: true });
  const cardShadow = skyDark ? neu.raisedSoft : CARD_SHADOW_LIGHT;
  return (
  <View style={[styles.page, { width: listW }]}>
    {/* Scrollable — picking "demo" reveals four profiles, which can overflow a
        short screen; a vertical scroll (opposite axis to the pager) is safe. */}
    <ScrollView
      style={styles.startScroll}
      contentContainerStyle={styles.startScrollInner}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.pageInner}>
        <Reveal active={active} delay={60} from={12} style={{ alignSelf: 'stretch' }}>
          <Text style={styles.title} accessibilityRole="header">{t.onboarding.startPickTitle}</Text>
        </Reveal>

        <View style={styles.choiceList}>
          {START_OPTIONS.map((opt, i) => {
            const isActive = selected === opt.id;
            const label = opt.id === 'fresh' ? t.onboarding.startFresh : t.onboarding.startDemo;
            return (
              <Reveal key={opt.id} active={active} delay={180 + i * 120} from={18}>
                <TouchableOpacity
                  style={[styles.choiceCard, cardShadow, isActive && styles.choiceCardActive]}
                  onPress={() => onPick(opt.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isActive }}
                >
                  <View style={[styles.choiceIconWrap, isActive && styles.choiceIconWrapActive]}>
                    <Feather name={opt.icon} size={20} color={isActive ? sky.accent : sky.sub} />
                  </View>
                  <Text style={[styles.choiceLabel, isActive && styles.choiceLabelActive]}>{label}</Text>
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

        {/* Which persona to explore as — only when "demo" is chosen. */}
        {selected === 'demo' && (
          <Reveal active={active} delay={120} from={14} style={{ alignSelf: 'stretch' }}>
            <View style={styles.profileWrap}>
              <Text style={styles.profileHeading}>{t.sampleData.pickTitle}</Text>
              {SAMPLE_PROFILES.map((p) => {
                const on = bracket === p.id;
                const info = t.sampleData.profiles[p.id];
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.profileRow, cardShadow, on && styles.choiceCardActive]}
                    onPress={() => onPickBracket(p.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${info.name} · ${p.age}`}
                    accessibilityState={{ selected: on }}
                  >
                    <View style={[styles.profileIconWrap, on && styles.choiceIconWrapActive]}>
                      <Feather name={p.icon as keyof typeof Feather.glyphMap} size={16} color={on ? sky.accent : sky.sub} />
                    </View>
                    <View style={styles.profileText}>
                      <Text style={[styles.profileName, on && styles.choiceLabelActive]}>{info.name} · {p.age}</Text>
                      <Text style={styles.profileBlurb}>{info.blurb}</Text>
                    </View>
                    <View style={[styles.radioOuter, on && styles.radioOuterActive]}>
                      {on && (
                        <View style={styles.radioInner}>
                          <Feather name="check" size={10} color={sky.ctaInk} />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Reveal>
        )}
      </View>
    </ScrollView>
  </View>
  );
});
StartChoicePage.displayName = 'StartChoicePage';

const Onboarding: React.FC = () => {
  const isDark = useIsDark();
  const t = useT();
  const insets = useSafeAreaInsets();
  // Android (SDK 54 edge-to-edge) can report a stale/too-wide module-load
  // Dimensions snapshot, which made the pager's pages wider than the real
  // screen and clipped page content on the right. Measure the pager's actual
  // width instead and drive page width + snap offsets from it.
  const { width: winW } = useWindowDimensions();
  const [listW, setListW] = useState(winW);
  const scrollRef = useAnimatedRef<RAnimated.ScrollView>();
  // The pager's native scroll, exposed as an RNGH gesture so the wau kite drag
  // can be declared simultaneous with it — instead of a JS kill-switch that
  // froze paging a frame late on Android.
  const nativePager = useMemo(() => Gesture.Native(), []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const indexRef = useRef(0);
  const [startChoice, setStartChoice] = useState<StartChoice | null>(null);
  const [sampleBracket, setSampleBracket] = useState<SampleBracket>(DEFAULT_SAMPLE_BRACKET);
  const setHasCompletedOnboarding = useSettingsStore((s) => s.setHasCompletedOnboarding);
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

  const PAGES: OnboardingPage[] = useMemo(() => [
    { ...SLIDE_META[0], title: t.onboarding.trackMoney, description: t.onboarding.trackMoneyDesc },
    { ...SLIDE_META[1], title: t.onboarding.runBusiness, description: t.onboarding.runBusinessDesc },
    { ...SLIDE_META[2], title: t.onboarding.notesEcho, description: t.onboarding.notesEchoDesc },
  ], [t]);

  // welcome + 3 slides + start-choice
  const PAGE_COUNT = PAGES.length + 2;

  const DOT_COLORS = useMemo(
    () => [sky.accent, ...PAGES.map((p) => accentFor(p.accentColor, skyDark)), sky.accent],
    [sky, skyDark, PAGES],
  );

  // The pager's scroll position lives on the UI thread; dots read it directly.
  // JS only hears about whole-page crossings (below), not every scroll frame.
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const settleIndex = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(PAGE_COUNT - 1, i));
    indexRef.current = clamped;
    setCurrentIndex(clamped);
  }, [PAGE_COUNT]);

  // Flip `currentIndex` when the swipe crosses a page midpoint. Entrance
  // animations play once and never reset (Reveal/CountUp/NotesMockup), so —
  // unlike the old 80%-viewability FlatList — an early flip can't blank or
  // restart the outgoing page mid-swipe.
  useAnimatedReaction(
    () => Math.round(scrollX.value / Math.max(1, listW)),
    (index, previous) => {
      if (previous === null || index !== previous) {
        runOnJS(settleIndex)(index);
      }
    },
    [listW, settleIndex],
  );

  // Apply immediately — useCalm() is reactive, so the whole screen re-themes live.
  const handleThemeChange = useCallback((pref: ThemePreference) => {
    lightTap();
    setThemePreference(pref);
  }, [setThemePreference]);

  const completedRef = useRef(false);
  // Takes the choice explicitly rather than reading startChoice state — Skip
  // must mean "start fresh" even if the user picked demo on the last page and
  // then swiped back (the lingering pick must not seed on Skip).
  const handleComplete = useCallback((choice: StartChoice | null, bracket: SampleBracket) => {
    // One-shot: a double-tap on the CTA (or CTA + skip racing) must not seed
    // the demo dataset twice.
    if (completedRef.current) return;
    completedRef.current = true;
    // The mode-pick page is gone — everyone lands in personal mode; business
    // stays one Settings toggle away. Name/language persisted on change.
    setDefaultMode('personal');
    setMode('personal');
    // Same engine as Settings → Load Sample Data; seeds the chosen persona.
    if (choice === 'demo') loadSampleData(bracket);
    setHasCompletedOnboarding(true);
  }, [setDefaultMode, setMode, setHasCompletedOnboarding]);

  const handleNext = useCallback(() => {
    if (indexRef.current < PAGE_COUNT - 1) {
      const next = indexRef.current + 1;
      // Programmatic scrolls don't reliably emit momentum events on Android —
      // settle the index now; the scroll reaction is idempotent when it lands.
      settleIndex(next);
      scrollRef.current?.scrollTo({ x: next * listW, animated: true });
    } else {
      handleComplete(startChoice, sampleBracket);
    }
  }, [PAGE_COUNT, listW, settleIndex, handleComplete, scrollRef, startChoice, sampleBracket]);

  // Skip = skip the TOUR, not onboarding. It jumps to the final start-choice page
  // (reusing handleNext's advance pattern) rather than committing "start fresh"
  // immediately — so every user makes the explicit fresh-vs-demo decision (demo
  // data is the main first-run engagement lever). The StartChoicePage CTA is then
  // the only commit; canSkip=false there hides Skip, so there's no dead-end.
  const handleSkip = useCallback(() => {
    lightTap();
    const last = PAGE_COUNT - 1;
    settleIndex(last);
    scrollRef.current?.scrollTo({ x: last * listW, animated: true });
  }, [PAGE_COUNT, settleIndex, scrollRef, listW]);

  const handleStartPick = useCallback((choice: StartChoice) => {
    lightTap();
    setStartChoice(choice);
  }, []);

  const isLastPage = currentIndex === PAGE_COUNT - 1;
  // FIRSTRUN-C4 — skip available on every page except the final start-choice
  // (where the CTA IS the commit). Skip now lands on that page (handleSkip) so the
  // fresh-vs-demo choice is never bypassed; welcome inputs persist on change, so
  // jumping past them loses nothing.
  const canSkip = !isLastPage;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* The entire onboarding lives under one sky — clouds by day, stars by
          night, following the theme choice live. */}
      <SkyBackdrop dark={effectiveTheme === 'dark'} />

      {/* Header — day/night switch top-left (always reachable, no scrolling;
          flipping it plays sunrise/sunset across the whole screen), skip
          top-right on every page except the final start-choice. */}
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
            onPress={handleSkip}
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

      {/* Pages — a Reanimated ScrollView pager: native paging + momentum, the
          scroll position tracked on the UI thread, every page memoized. Wrapped
          so the wau kite drag can run simultaneously with the pager's native
          scroll (Gesture.Native) instead of blocking it. */}
      <GestureDetector gesture={nativePager}>
        <RAnimated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          overScrollMode="never"
          decelerationRate="fast"
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && w !== listW) {
              setListW(w);
              // Keep the settled page aligned to the new page width.
              requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: indexRef.current * w, animated: false }));
            }
          }}
        >
          <WelcomePage listW={listW} sky={sky} skyDark={skyDark} styles={styles} t={t} pagerGesture={nativePager} />
          {PAGES.map((page, i) => (
            <SlidePage
              key={page.id}
              slide={page}
              active={currentIndex === i + 1}
              listW={listW}
              sky={sky}
              skyDark={skyDark}
              styles={styles}
            />
          ))}
          <StartChoicePage
            active={isLastPage}
            selected={startChoice}
            onPick={handleStartPick}
            bracket={sampleBracket}
            onPickBracket={setSampleBracket}
            listW={listW}
            sky={sky}
            skyDark={skyDark}
            styles={styles}
            t={t}
          />
        </RAnimated.ScrollView>
      </GestureDetector>

      {/* Bottom: dots + button */}
      <View style={styles.footer}>
        <Dots colors={DOT_COLORS} inactive={sky.dotInactive} scrollX={scrollX} pageW={listW} />

        {(() => {
          const slideIndex = currentIndex >= 1 && currentIndex <= PAGES.length ? currentIndex - 1 : -1;
          // Night CTAs use the bright accent variants (gold family) with near-black
          // ink — the day olives fail contrast on the navy sky.
          const buttonAccent = slideIndex >= 0
            ? accentFor(PAGES[slideIndex]?.accentColor ?? SKY_DAY.accent, skyDark)
            : sky.accent;
          // Final page = start-choice. Disable until the user picks one.
          const disabled = isLastPage && startChoice == null;
          const label =
            currentIndex === 0
              ? t.onboarding.letsGo
              : isLastPage
                ? t.onboarding.getStarted
                : t.common.next;
          // Neu Select: the app's one primary CTA. Per-slide accent via `color`;
          // sky ink via `textColor` (night's gold fill needs near-black ink, not
          // the app's white onAccent). Check icon only on the committing page.
          return (
            <View style={styles.ctaWrap}>
              <NeuButton
                label={label}
                icon={isLastPage ? 'check' : undefined}
                color={buttonAccent}
                textColor={sky.ctaInk}
                onPress={handleNext}
                disabled={disabled}
                accessibilityLabel={label}
                style={CTA_SHADOW[skyDark ? 'dark' : 'light']}
              />
            </View>
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
  // Constrains the full-width Neu Select CTA and centers it (footer alignItems).
  ctaWrap: {
    width: '100%',
    maxWidth: 320,
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
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: sky.fieldBg,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: sky.fieldBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...(skyDark ? NO_SHADOW : { ...WARM_SHADOW, elevation: 0 }),
  },
  avatarHint: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: sky.sub,
  },
  inputCardField: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.lg,
    color: sky.ink,
  },
  // Liquid-glass language toggle. iOS 26 → the genuine system segmented control.
  langNative: {
    width: '100%',
    height: 40,
    marginTop: 2,
  },
  // Fallback capsule (Android / iOS<26): a single glass surface (GlassView or
  // BlurView) with a non-glass sliding selection pill on top.
  langCapsule: {
    height: 52,
    borderRadius: 14,
    position: 'relative',
    justifyContent: 'center',
  },
  // Fallback-only: BlurView needs clipping; native GlassView must NOT be masked.
  langCapsuleClip: { overflow: 'hidden' },
  langCapsuleShape: { borderRadius: 14 },
  langFallbackTint: {
    backgroundColor: withAlpha(sky.cardBg, 0.4),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha('#FFFFFF', skyDark ? 0.14 : 0.5),
  },
  langTrack: {
    flexDirection: 'row',
    height: '100%',
    alignItems: 'center',
  },
  // Non-glass selection pill — a neutral bubble on the glass (like the system
  // tab bar's selection); the accent lives in the bold active label.
  langPill: {
    position: 'absolute',
    top: 3,
    left: 0,
    height: 46,
    borderRadius: 11,
    backgroundColor: withAlpha('#FFFFFF', skyDark ? 0.14 : 0.7),
    borderWidth: 1,
    borderColor: withAlpha('#FFFFFF', skyDark ? 0.2 : 0.85),
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

  // ── Start-choice page ──
  choiceList: {
    width: '100%',
    marginTop: SPACING['2xl'],
    gap: SPACING.md,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 16,
    backgroundColor: sky.fieldBg,
    borderWidth: 1.5,
    borderColor: sky.choiceBorder,
    gap: SPACING.md,
    minHeight: 72,
    // Depth comes from Neu Pills (neu.raisedSoft spread at the call site), not a shadow here.
    // Inset from the ScrollView edges so the soft neu drop-shadow renders into slack
    // instead of being clipped at the scroll bounds → avoids the "neu vertical error"
    // seam (docs/neu-vertical-error.md). md (16) ≥ light-mode shadow reach (~15px).
    marginHorizontal: SPACING.md,
  },
  choiceCardActive: {
    borderColor: sky.accent,
    backgroundColor: withAlpha(sky.accent, 0.14),
  },
  choiceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(sky.sub, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceIconWrapActive: {
    backgroundColor: withAlpha(sky.accent, 0.18),
  },
  choiceLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: sky.ink,
  },
  choiceLabelActive: {
    color: sky.accent,
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

  // ── Demo profile sub-picker (revealed when "demo" is chosen) ──
  startScroll: {
    width: '100%',
  },
  startScrollInner: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  profileWrap: {
    width: '100%',
    marginTop: SPACING.xl,
    gap: SPACING.sm,
  },
  profileHeading: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: sky.sub,
    marginBottom: SPACING.xs,
    alignSelf: 'flex-start',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 14,
    backgroundColor: sky.fieldBg,
    borderWidth: 1.5,
    borderColor: sky.choiceBorder,
    gap: SPACING.sm,
    minHeight: 56,
    // Depth comes from Neu Pills (neu.raisedSoft spread at the call site), not a shadow here.
    // Inset so the neu drop-shadow isn't clipped at the ScrollView edge (the "neu
    // vertical error" seam — docs/neu-vertical-error.md).
    marginHorizontal: SPACING.md,
  },
  profileIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: withAlpha(sky.sub, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: sky.ink,
  },
  profileBlurb: {
    fontSize: TYPOGRAPHY.size.xs,
    color: sky.sub,
    marginTop: 1,
  },
});

export default Onboarding;
