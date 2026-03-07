import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ViewToken,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useSettingsStore } from '../../store/settingsStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingPage {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  accentColor: string;
}

const PAGES: OnboardingPage[] = [
  {
    id: '1',
    icon: 'dollar-sign',
    title: 'Track Your Money',
    description:
      'Keep tabs on what comes in and goes out.\nWallets, budgets, and everyday expenses — all in one place.',
    accentColor: '#4F5104',
  },
  {
    id: '2',
    icon: 'shopping-bag',
    title: 'Run Your Business',
    description:
      'Built for food sellers and small businesses.\nManage orders, products, seasons, and costs with ease.',
    accentColor: '#B2780A',
  },
  {
    id: '3',
    icon: 'users',
    title: 'Split & Settle',
    description:
      'Track debts and split bills with friends and family.\nNo more awkward "you belanja me, right?" moments.',
    accentColor: '#2E7D5B',
  },
];

const Onboarding: React.FC = () => {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const setHasCompletedOnboarding = useSettingsStore((s) => s.setHasCompletedOnboarding);

  const handleComplete = useCallback(() => {
    setHasCompletedOnboarding(true);
  }, [setHasCompletedOnboarding]);

  const handleNext = useCallback(() => {
    if (currentIndex < PAGES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      handleComplete();
    }
  }, [currentIndex, handleComplete]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderPage = useCallback(({ item }: { item: OnboardingPage }) => {
    return (
      <View style={styles.page}>
        <View style={styles.iconContainer}>
          <View style={[styles.iconCircle, { backgroundColor: item.accentColor + '14' }]}>
            <Feather name={item.icon} size={48} color={item.accentColor} />
          </View>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>
    );
  }, []);

  const isLastPage = currentIndex === PAGES.length - 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Skip button — top right, hidden on last page */}
      <View style={styles.header}>
        {!isLastPage ? (
          <TouchableOpacity
            onPress={handleComplete}
            style={styles.skipButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.skipText}>skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipButton} />
        )}
      </View>

      {/* Pages */}
      <FlatList
        ref={flatListRef}
        data={PAGES}
        renderItem={renderPage}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {/* Bottom: dots + button */}
      <View style={styles.footer}>
        {/* Dot indicators */}
        <View style={styles.dotsContainer}>
          {PAGES.map((page, index) => (
            <View
              key={page.id}
              style={[
                styles.dot,
                index === currentIndex
                  ? [styles.dotActive, { backgroundColor: PAGES[currentIndex].accentColor }]
                  : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* Action button */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: PAGES[currentIndex].accentColor }]}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {isLastPage ? 'Get Started' : 'Next'}
          </Text>
          {!isLastPage && (
            <Feather name="arrow-right" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
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
    color: CALM.textSecondary,
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
    color: CALM.textPrimary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  description: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: CALM.textSecondary,
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
    backgroundColor: CALM.border,
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
});

export default Onboarding;
