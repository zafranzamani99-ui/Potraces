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
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';
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

type PageItem = { type: 'welcome' } | { type: 'slide'; data: OnboardingPage };

const SLIDE_META: OnboardingSlideMeta[] = [
  { id: '1', icon: 'dollar-sign', accentColor: '#4F5104' },
  { id: '2', icon: 'shopping-bag', accentColor: '#B2780A' },
  { id: '3', icon: 'users', accentColor: '#2E7D5B' },
];

const Onboarding: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [name, setName] = useState('');
  const [selectedLang, setSelectedLang] = useState<'en' | 'ms'>('en');
  const setHasCompletedOnboarding = useSettingsStore((s) => s.setHasCompletedOnboarding);
  const setUserName = useSettingsStore((s) => s.setUserName);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const PAGES: OnboardingPage[] = useMemo(() => [
    { ...SLIDE_META[0], title: t.onboarding.trackMoney, description: t.onboarding.trackMoneyDesc },
    { ...SLIDE_META[1], title: t.onboarding.runBusiness, description: t.onboarding.runBusinessDesc },
    { ...SLIDE_META[2], title: t.onboarding.splitSettle, description: t.onboarding.splitSettleDesc },
  ], [t]);

  const ALL_PAGES: PageItem[] = useMemo(() => [
    { type: 'welcome' },
    ...PAGES.map(p => ({ type: 'slide' as const, data: p })),
  ], [PAGES]);

  const handleComplete = useCallback(() => {
    setHasCompletedOnboarding(true);
  }, [setHasCompletedOnboarding]);

  const handleWelcomeDone = useCallback(() => {
    if (name.trim()) setUserName(name.trim());
    setLanguage(selectedLang);
    flatListRef.current?.scrollToIndex({ index: 1, animated: true });
  }, [name, selectedLang, setUserName, setLanguage]);

  const handleNext = useCallback(() => {
    if (currentIndex < ALL_PAGES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      handleComplete();
    }
  }, [currentIndex, handleComplete, ALL_PAGES.length]);

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
        <View style={[styles.page, { paddingTop: insets.top + 60 }]}>
          <Text style={styles.welcomeTitle}>{t.onboarding.hiThere}</Text>
          <Text style={styles.welcomeSubtitle}>{t.onboarding.letsSetUp}</Text>

          <View style={styles.welcomeForm}>
            <Text style={styles.welcomeLabel}>{t.onboarding.whatCallYou}</Text>
            <TextInput
              style={styles.welcomeInput}
              value={name}
              onChangeText={setName}
              placeholder={t.onboarding.nameOptional}
              placeholderTextColor={C.textMuted}
              autoCapitalize="words"
              returnKeyType="done"
            />

            <Text style={[styles.welcomeLabel, { marginTop: SPACING.xl }]}>{t.onboarding.language}</Text>
            <View style={styles.langRow}>
              <TouchableOpacity
                style={[styles.langPill, selectedLang === 'en' && styles.langPillActive]}
                onPress={() => setSelectedLang('en')}
              >
                <Text style={[styles.langText, selectedLang === 'en' && styles.langTextActive]}>English</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langPill, selectedLang === 'ms' && styles.langPillActive]}
                onPress={() => setSelectedLang('ms')}
              >
                <Text style={[styles.langText, selectedLang === 'ms' && styles.langTextActive]}>Bahasa Melayu</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.welcomeBtn} onPress={handleWelcomeDone} activeOpacity={0.8}>
            <Text style={styles.welcomeBtnText}>{t.onboarding.letsGo}</Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      );
    }

    const slide = item.data;
    return (
      <View style={styles.page}>
        <View style={styles.iconContainer}>
          <View style={[styles.iconCircle, { backgroundColor: slide.accentColor + '14' }]}>
            <Feather name={slide.icon} size={48} color={slide.accentColor} />
          </View>
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.description}>{slide.description}</Text>
      </View>
    );
  }, [name, selectedLang, C, t, insets.top, handleWelcomeDone]);

  const isLastPage = currentIndex === ALL_PAGES.length - 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Skip button — top right, hidden on welcome and last page */}
      <View style={styles.header}>
        {currentIndex > 0 && !isLastPage ? (
          <TouchableOpacity
            onPress={handleComplete}
            style={styles.skipButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
        maxToRenderPerBatch={5}
        windowSize={5}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        keyboardShouldPersistTaps="handled"
      />

      {/* Bottom: dots + button (hidden on welcome page) */}
      {currentIndex > 0 && (
        <View style={styles.footer}>
          {/* Dot indicators */}
          <View style={styles.dotsContainer}>
            {ALL_PAGES.map((_, index) => {
              const slideIndex = index - 1;
              const accentColor = index === 0
                ? C.accent
                : PAGES[slideIndex]?.accentColor ?? C.accent;
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

          {/* Action button */}
          <TouchableOpacity
            style={[styles.button, {
              backgroundColor: currentIndex === 0
                ? C.accent
                : PAGES[currentIndex - 1]?.accentColor ?? C.accent,
            }]}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {isLastPage ? t.onboarding.getStarted : t.common.next}
            </Text>
            {!isLastPage && (
              <Feather name="arrow-right" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            )}
          </TouchableOpacity>
        </View>
      )}
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
  iconContainer: {
    marginBottom: SPACING['3xl'],
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: TYPOGRAPHY.size['2xl'],
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
  buttonText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },
  welcomeTitle: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.sm,
  },
  welcomeSubtitle: {
    fontSize: TYPOGRAPHY.size.lg,
    color: C.textSecondary,
    marginBottom: SPACING['3xl'],
  },
  welcomeForm: {
    width: '100%',
    paddingHorizontal: SPACING.xl,
  },
  welcomeLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    marginBottom: SPACING.sm,
  },
  welcomeInput: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderWidth: 1,
    borderColor: C.border,
  },
  langRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  langPill: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  langPillActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  langText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  langTextActive: {
    color: '#fff',
  },
  welcomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.accent,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING['3xl'],
    borderRadius: RADIUS.full,
    marginTop: 'auto',
    marginBottom: SPACING['2xl'],
  },
  welcomeBtnText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
});

export default Onboarding;
