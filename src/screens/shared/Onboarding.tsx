import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ViewToken,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppStore } from '../../store/appStore';
import { useT } from '../../i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

// ─── Mini Visual Mockups ──────────────────────────────────

const MockupRow: React.FC<{ icon: string; label: string; accent: string; C: typeof CALM }> = ({ icon, label, accent, C }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accent + '18', marginRight: 8, justifyContent: 'center', alignItems: 'center' }}>
      <Feather name={icon as keyof typeof Feather.glyphMap} size={10} color={accent} />
    </View>
    <Text style={{ fontSize: 11, color: C.textSecondary, flex: 1 }}>{label}</Text>
  </View>
);

const SlideMockup: React.FC<{ slideId: string; accent: string; C: typeof CALM }> = ({ slideId, accent, C }) => {
  const card = {
    width: 260,
    height: 210,
    borderRadius: RADIUS.xl,
    backgroundColor: C.surface,
    padding: SPACING.md,
    overflow: 'hidden' as const,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  };

  switch (slideId) {
    case '1': // Track Money — mini transaction list
      return (
        <View style={card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
            <View style={{ width: 50, height: 8, backgroundColor: accent + '30', borderRadius: 4 }} />
            <Text style={{ fontSize: 12, color: accent, fontWeight: '600' }}>RM 4,250</Text>
          </View>
          <MockupRow icon="coffee" label="nasi lemak  RM8.50" accent={accent} C={C} />
          <MockupRow icon="navigation" label="Grab to work  RM15" accent={accent} C={C} />
          <MockupRow icon="zap" label="Unifi bill  RM129" accent={accent} C={C} />
          <MockupRow icon="shopping-bag" label="Shopee  RM89.90" accent={accent} C={C} />
          <View style={{ marginTop: 8, alignSelf: 'center' }}>
            <Text style={{ fontSize: 9, color: C.textMuted }}>auto-categorised</Text>
          </View>
        </View>
      );

    case '2': // Business — mini order cards
      return (
        <View style={card}>
          <View style={{ backgroundColor: accent + '10', borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.xs }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: accent }}>Order #001</Text>
            <Text style={{ fontSize: 10, color: C.textSecondary, marginTop: 2 }}>Tshirt (L) x3, Sticker pack x5</Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: accent, marginTop: 4 }}>RM 85.00</Text>
          </View>
          <View style={{ backgroundColor: accent + '10', borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.xs }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: accent }}>Order #002</Text>
            <Text style={{ fontSize: 10, color: C.textSecondary, marginTop: 2 }}>Nasi lemak x2, Kuih lapis x4</Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: accent, marginTop: 4 }}>RM 52.00</Text>
          </View>
          <View style={{ marginTop: 4, alignSelf: 'center' }}>
            <Text style={{ fontSize: 9, color: C.textMuted }}>paste from WhatsApp</Text>
          </View>
        </View>
      );

    case '3': // Split & Settle — mini split view
      return (
        <View style={card}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.textPrimary, marginBottom: 8 }}>makan malam  RM120</Text>
          {[
            { name: 'Amin', amt: 'RM40', done: true },
            { name: 'Siti', amt: 'RM40', done: false },
            { name: 'You', amt: 'RM40', done: true },
          ].map((p) => (
            <View key={p.name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: p.done ? accent + '20' : C.border, marginRight: 8 }} />
              <Text style={{ fontSize: 11, color: C.textSecondary, flex: 1 }}>{p.name}</Text>
              <Text style={{ fontSize: 11, color: p.done ? accent : C.textMuted, fontWeight: '500' }}>{p.amt}</Text>
              {p.done && <Feather name="check" size={10} color={accent} style={{ marginLeft: 4 }} />}
            </View>
          ))}
          <View style={{ marginTop: 8, alignSelf: 'center' }}>
            <Text style={{ fontSize: 9, color: C.textMuted }}>no more awkward moments</Text>
          </View>
        </View>
      );

    case '4': // Notes & Echo — mini note
      return (
        <View style={card}>
          <Text style={{ fontSize: 10, color: C.textMuted, marginBottom: 6 }}>Notes</Text>
          <Text style={{ fontSize: 12, color: C.textPrimary, lineHeight: 18 }}>
            makan rm12{'\n'}grab rm8{'\n'}parking rm3{'\n'}teh tarik rm2.50
          </Text>
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: accent + '12', borderRadius: RADIUS.md, padding: 6 }}>
            <Feather name="zap" size={12} color={accent} />
            <Text style={{ fontSize: 10, color: accent, marginLeft: 4, fontWeight: '500' }}>4 amounts detected — tap to save</Text>
          </View>
        </View>
      );

    case '5': // Receipts & Pulse
      return (
        <View style={card}>
          {/* Receipt card */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: accent + '10', borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.sm }}>
            <View style={{ width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: accent + '20', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm }}>
              <Feather name="camera" size={16} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: C.textPrimary }}>Mydin Groceries</Text>
              <Text style={{ fontSize: 10, color: C.textSecondary, marginTop: 1 }}>5 items · RM 87.30</Text>
            </View>
            <View style={{ backgroundColor: accent + '20', borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9, color: accent, fontWeight: '600' }}>saved</Text>
            </View>
          </View>
          {/* Pulse card */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.background, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: C.border }}>
            <View style={{ width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: accent + '15', justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm }}>
              <Feather name="activity" size={16} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: C.textPrimary }}>Financial Pulse</Text>
              <Text style={{ fontSize: 10, color: C.textSecondary, marginTop: 1 }}>spending up 12% this week</Text>
            </View>
          </View>
          <View style={{ marginTop: SPACING.sm, alignSelf: 'center' }}>
            <Text style={{ fontSize: 9, color: C.textMuted }}>always know where you stand</Text>
          </View>
        </View>
      );

    default:
      return null;
  }
};

const Onboarding: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [name, setName] = useState('');
  const [selectedLang, setSelectedLang] = useState<'en' | 'ms'>('en');
  const [selectedMode, setSelectedMode] = useState<ModeChoice | null>(null);
  const setHasCompletedOnboarding = useSettingsStore((s) => s.setHasCompletedOnboarding);
  const setUserName = useSettingsStore((s) => s.setUserName);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const setDefaultMode = useSettingsStore((s) => s.setDefaultMode);
  const setMode = useAppStore((s) => s.setMode);

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

  // FIRSTRUN-H6 — persist on every change so swiping past welcome cannot lose the name.
  const handleNameChange = useCallback((next: string) => {
    setName(next);
    const trimmed = next.trim();
    // setUserName accepts string; clear via empty string is fine here.
    setUserName(trimmed);
  }, [setUserName]);

  const handleLangChange = useCallback((lang: 'en' | 'ms') => {
    setSelectedLang(lang);
    setLanguage(lang);
  }, [setLanguage]);

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
    setSelectedMode(choice);
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderPage = useCallback(({ item }: { item: PageItem }) => {
    if (item.type === 'welcome') {
      return (
        <View style={styles.page}>
          <Text style={styles.welcomeTitle} accessibilityRole="header">{t.onboarding.hiThere}</Text>
          <Text style={styles.description}>{t.onboarding.letsSetUp}</Text>

          <View style={styles.welcomeForm}>
            <Text style={styles.welcomeLabel}>{t.onboarding.whatCallYou}</Text>
            <TextInput
              style={styles.welcomeInput}
              value={name}
              onChangeText={handleNameChange}
              placeholder={t.onboarding.nameOptional}
              placeholderTextColor={C.textMuted}
              autoCapitalize="words"
              returnKeyType="done"
              accessibilityLabel={t.onboarding.whatCallYou}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />

            <Text style={[styles.welcomeLabel, { marginTop: SPACING['2xl'] }]}>{t.onboarding.language}</Text>
            <View style={styles.langRow}>
              <TouchableOpacity
                style={[styles.langCard, selectedLang === 'en' && styles.langCardActive]}
                onPress={() => handleLangChange('en')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="English"
                accessibilityState={{ selected: selectedLang === 'en' }}
              >
                <Text style={styles.langFlag}>EN</Text>
                <Text style={[styles.langCardText, selectedLang === 'en' && styles.langCardTextActive]}>English</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langCard, selectedLang === 'ms' && styles.langCardActive]}
                onPress={() => handleLangChange('ms')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Bahasa Melayu"
                accessibilityState={{ selected: selectedLang === 'ms' }}
              >
                <Text style={styles.langFlag}>BM</Text>
                <Text style={[styles.langCardText, selectedLang === 'ms' && styles.langCardTextActive]}>Bahasa Melayu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    if (item.type === 'mode') {
      return (
        <View style={styles.page}>
          <Text style={styles.title} accessibilityRole="header">{t.onboarding.modePickTitle}</Text>
          <Text style={styles.description}>{t.onboarding.modePickSubtitle}</Text>

          <View style={styles.modeList}>
            {MODE_OPTIONS.map((opt) => {
              const active = selectedMode === opt.id;
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
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.modeCard, active && styles.modeCardActive]}
                  onPress={() => handleModePick(opt.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.modeIconWrap, active && styles.modeIconWrapActive]}>
                    <Feather name={opt.icon} size={20} color={active ? C.accent : C.textSecondary} />
                  </View>
                  <View style={styles.modeTextWrap}>
                    <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{label}</Text>
                    <Text style={styles.modeSub}>{sub}</Text>
                  </View>
                  {active && (
                    <Feather name="check" size={18} color={C.accent} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }

    const slide = item.data;
    return (
      <View style={styles.page}>
        <View style={styles.mockupContainer}>
          <SlideMockup slideId={slide.id} accent={slide.accentColor} C={C} />
        </View>
        <Text style={styles.title} accessibilityRole="header">{slide.title}</Text>
        <Text style={styles.description}>{slide.description}</Text>
      </View>
    );
  }, [name, selectedLang, selectedMode, C, t, styles, handleNameChange, handleLangChange, handleModePick]);

  const isLastPage = currentIndex === ALL_PAGES.length - 1;
  // FIRSTRUN-C4 — skip available on every page except the final mode-pick (where the button
  // IS the commit). Welcome inputs are persisted on change, so skipping from there is safe.
  const canSkip = !isLastPage;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Skip button — top right, present on every page except the final mode-pick. */}
      <View style={styles.header}>
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

      {/* Pages */}
      <FlatList
        ref={flatListRef}
        data={ALL_PAGES}
        renderItem={renderPage}
        keyExtractor={(_, index) => `page-${index}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        removeClippedSubviews
        maxToRenderPerBatch={6}
        windowSize={7}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        keyboardShouldPersistTaps="handled"
      />

      {/* Bottom: dots + button */}
      <View style={styles.footer}>
        <View style={styles.dotsContainer}>
          {ALL_PAGES.map((page, index) => {
            // Welcome and mode pages share the personal accent so the dot palette stays calm.
            const slideIndex = page.type === 'slide' ? index - 1 : -1;
            const accentColor = slideIndex >= 0
              ? PAGES[slideIndex]?.accentColor ?? C.accent
              : C.accent;
            return (
              <View
                key={`dot-${index}`}
                style={[
                  styles.dot,
                  index === currentIndex
                    ? [styles.dotActive, { backgroundColor: accentColor }]
                    : styles.dotInactive,
                ]}
              />
            );
          })}
        </View>

        {(() => {
          const currentPage = ALL_PAGES[currentIndex];
          const slideIndex = currentPage?.type === 'slide' ? currentIndex - 1 : -1;
          const buttonAccent = slideIndex >= 0
            ? PAGES[slideIndex]?.accentColor ?? C.accent
            : C.accent;
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
                { backgroundColor: buttonAccent },
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
                <Feather name="arrow-right" size={18} color={C.surface} style={{ marginLeft: SPACING.xs }} />
              )}
            </TouchableOpacity>
          );
        })()}
      </View>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    textAlign: 'right',
  },
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING['3xl'],
  },
  mockupContainer: {
    marginBottom: SPACING['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  welcomeTitle: {
    fontSize: TYPOGRAPHY.size['4xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  description: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: TYPOGRAPHY.size.base * TYPOGRAPHY.lineHeight.relaxed,
    paddingHorizontal: SPACING.md,
  },
  footer: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING['3xl'],
    alignItems: 'center',
    gap: SPACING.xl,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dot: {
    borderRadius: RADIUS.full,
  },
  dotActive: {
    width: 24,
    height: 8,
    borderRadius: RADIUS.full,
  },
  dotInactive: {
    width: 8,
    height: 8,
    backgroundColor: C.border,
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
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.surface,
  },
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
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    gap: SPACING.md,
  },
  modeCardActive: {
    borderColor: C.accent,
    backgroundColor: withAlpha(C.accent, 0.06),
  },
  modeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.textMuted, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconWrapActive: {
    backgroundColor: withAlpha(C.accent, 0.12),
  },
  modeTextWrap: {
    flex: 1,
  },
  modeLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  modeLabelActive: {
    color: C.accent,
  },
  modeSub: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
    marginTop: SPACING.xs / 2,
    lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.normal,
  },
  welcomeForm: {
    width: '100%',
    marginTop: SPACING['2xl'],
  },
  welcomeLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    marginBottom: SPACING.sm,
  },
  welcomeInput: {
    borderBottomWidth: 2,
    borderBottomColor: C.border,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.xl,
    color: C.textPrimary,
  },
  langRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  langCard: {
    flex: 1,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    gap: 4,
  },
  langCardActive: {
    borderColor: C.accent,
    backgroundColor: withAlpha(C.accent, 0.06),
  },
  langFlag: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    letterSpacing: 1,
  },
  langCardText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  langCardTextActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
});

export default Onboarding;
