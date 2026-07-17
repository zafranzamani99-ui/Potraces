import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Pressable,
} from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { format, getYear } from 'date-fns';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReceiptStore } from '../../store/receiptStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { MYTAX_CATEGORIES } from '../../constants/taxCategories';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import FAB from '../../components/common/FAB';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import CategoryIcon from '../../components/common/CategoryIcon';
import type { RootStackParamList, SavedReceipt } from '../../types';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const ReceiptHistory: React.FC = () => {
  const C = useCalm();
  const neu = useNeu(undefined, { faintDark: true }); // Onyx: faint dark neu
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const currency = useSettingsStore((s) => s.currency);
  const receipts = useReceiptStore((s) => s.receipts);
  const deleteReceipt = useReceiptStore((s) => s.deleteReceipt);
  const getTaxSummary = useReceiptStore((s) => s.getTaxSummary);

  // Derive available years
  const availableYears = useMemo(() => {
    const years = [...new Set(receipts.map((r) => r.year))].sort((a, b) => b - a);
    if (years.length === 0) years.push(getYear(new Date()));
    return years;
  }, [receipts]);

  const [selectedYear, setSelectedYear] = useState(getYear(new Date()));
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const yearReceipts = useMemo(
    () => receipts.filter((r) => r.year === selectedYear),
    [receipts, selectedYear]
  );

  const filteredReceipts = useMemo(() => {
    if (!filterCategory) return yearReceipts;
    return yearReceipts.filter((r) => r.myTaxCategory === filterCategory);
  }, [yearReceipts, filterCategory]);

  const taxSummary = useMemo(() => getTaxSummary(selectedYear), [getTaxSummary, selectedYear]);

  const totalClaimable = useMemo(
    () => taxSummary.reduce((sum, s) => sum + Math.min(s.totalSpent, s.limit ?? s.totalSpent), 0),
    [taxSummary]
  );

  // Categories with receipts for filter pills
  const activeCategories = useMemo(() => {
    const cats = [...new Set(yearReceipts.map((r) => r.myTaxCategory))];
    return MYTAX_CATEGORIES.filter((c) => cats.includes(c.id) && c.id !== 'none');
  }, [yearReceipts]);

  const handleDelete = useCallback((id: string, title: string) => {
    Alert.alert(
      t.receipts.removeReceipt,
      `"${title}" ${t.receipts.removeConfirm}`,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.receipts.remove,
          style: 'destructive',
          onPress: () => deleteReceipt(id),
        },
      ]
    );
  }, [deleteReceipt]);

  const hasReceipts = filteredReceipts.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Year Tabs (pbTab pattern) ── */}
        <View style={styles.tabRow}>
          {availableYears.map((year) => (
            <TouchableOpacity
              key={year}
              style={[
                styles.tab,
                neu.raised,
                selectedYear === year && styles.tabActive,
              ]}
              onPress={() => { lightTap(); setSelectedYear(year); setFilterCategory(null); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, selectedYear === year && styles.tabTextActive]}>
                {year}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tax Relief Summary (hero card) ── */}
        {taxSummary.length > 0 && (
          <View style={[styles.heroCard, neu.raisedSoft]}>
            <Text style={styles.heroLabel}>{t.receipts.lhdnTaxRelief} {selectedYear}</Text>
            <Text style={styles.heroAmount}>
              {currency} {totalClaimable.toFixed(0)}{' '}
              <Text style={styles.heroAmountSub}>{t.receipts.claimable}</Text>
            </Text>
            {taxSummary.map((s) => {
              const cat = MYTAX_CATEGORIES.find((c) => c.id === s.categoryId);
              const percentage = s.limit ? Math.min((s.totalSpent / s.limit) * 100, 100) : 0;
              const nearLimit = s.limit ? s.totalSpent / s.limit > 0.8 : false;
              return (
                <View key={s.categoryId} style={styles.taxRow}>
                  <View style={styles.taxRowTop}>
                    <View style={styles.taxRowLeft}>
                      <View style={[styles.iconCircle, neu.well, { backgroundColor: withAlpha(C.accent, 0.08) }]}>
                        <CategoryIcon
                          icon={cat?.icon || 'file'}
                          size={14}
                          color={C.accent}
                        />
                      </View>
                      <Text style={styles.taxRowName} numberOfLines={1}>{s.categoryName}</Text>
                    </View>
                    <Text style={styles.taxRowAmount}>
                      <Text style={{ fontWeight: TYPOGRAPHY.weight.semibold }}>
                        {currency} {s.totalSpent.toFixed(0)}
                      </Text>
                      {s.limit !== null ? ` / ${s.limit.toLocaleString()}` : ''}
                    </Text>
                  </View>
                  {s.limit !== null && (
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${percentage}%`, backgroundColor: nearLimit ? C.bronze : C.accent },
                        ]}
                      />
                    </View>
                  )}
                </View>
              );
            })}
            <View style={styles.reminderCard}>
              <Feather name="info" size={14} color={C.accent} />
              <Text style={styles.reminderText}>
                {t.receipts.einvoiceReminder}
              </Text>
            </View>
          </View>
        )}

        {/* ── Category Filter Pills (pbTab pattern) ── */}
        {activeCategories.length > 0 && (
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[
                styles.tab,
                neu.raised,
                !filterCategory && styles.tabActive,
              ]}
              onPress={() => { lightTap(); setFilterCategory(null); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, !filterCategory && styles.tabTextActive]}>
                {t.common.all.toLowerCase()} ({yearReceipts.length})
              </Text>
            </TouchableOpacity>
            {activeCategories.map((cat) => {
              const isActive = filterCategory === cat.id;
              const count = yearReceipts.filter((r) => r.myTaxCategory === cat.id).length;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.tab,
                    neu.raised,
                    isActive && styles.tabActive,
                  ]}
                  onPress={() => { lightTap(); setFilterCategory(cat.id); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                    {cat.name.toLowerCase()} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Receipt List — one card per receipt (transaction-list style) ── */}
        {hasReceipts ? (
          <>
            {filteredReceipts.map((item) => {
              const taxCat = MYTAX_CATEGORIES.find((c) => c.id === item.myTaxCategory);
              return (
                <View key={item.id} style={[styles.groupCardShadow, neu.raisedSoft]}>
                  <ReanimatedSwipeable
                    renderRightActions={() => (
                      <GestureDetector gesture={Gesture.Tap().runOnJS(true).onEnd(() => handleDelete(item.id, item.title))}>
                        <View style={styles.swipeAction}>
                          <Feather name="trash-2" size={20} color={C.surface} />
                        </View>
                      </GestureDetector>
                    )}
                    overshootRight={false}
                    friction={1}
                    rightThreshold={40}
                  >
                    <Pressable
                      onPress={() => navigation.navigate('ReceiptDetail', { receiptId: item.id })}
                      style={({ pressed }) => [styles.receiptRow, pressed && { opacity: 0.7 }]}
                    >
                      {item.imageUri ? (
                        <Image
                          source={{ uri: item.imageUri }}
                          style={styles.receiptThumb}
                          resizeMode="cover"
                          onError={() => {}}
                        />
                      ) : (
                        <View style={[styles.receiptThumb, styles.receiptThumbFallback]}>
                          <Feather name="file-text" size={18} color={C.neutral} />
                        </View>
                      )}
                      <View style={styles.receiptContent}>
                        <View style={styles.receiptNameRow}>
                          <Text style={styles.receiptTitle} numberOfLines={1}>{item.title}</Text>
                          <Text style={styles.receiptAmount}>{currency} {item.total.toFixed(2)}</Text>
                        </View>
                        <View style={styles.receiptMeta}>
                          <Text style={styles.receiptDate}>{format(item.date, 'dd MMM yyyy')}</Text>
                          {taxCat && taxCat.id !== 'none' && (
                            <>
                              <Text style={styles.receiptDot}>·</Text>
                              <Text style={[styles.receiptDate, { color: C.accent }]}>{taxCat.name.toLowerCase()}</Text>
                            </>
                          )}
                        </View>
                        <Text style={styles.receiptSavedDate}>saved {format(item.createdAt, 'dd MMM yyyy, h:mm a')}</Text>
                      </View>
                    </Pressable>
                  </ReanimatedSwipeable>
                </View>
              );
            })}
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, neu.raised, { backgroundColor: withAlpha(C.accent, 0.06) }]}>
              <Feather name="camera" size={24} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{t.receipts.noReceipts}</Text>
            <Text style={styles.emptyMessage}>
              {t.receipts.scanReceiptHint}
            </Text>
            {/* Width wrapper: NeuButton's inner width:100% only fills when its
                parent stretches — a center-aligned column collapses it to content
                width. The wrapper gives it a real width (capped + centered). */}
            <View style={styles.emptyCtaWrap}>
              <NeuButton
                onPress={() => navigation.navigate('ReceiptScanner')}
                label={t.receipts.scanReceipt}
                icon="camera"
                accessibilityLabel={t.receipts.scanReceipt}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── FAB: scan receipt ── */}
      <FAB
        onPress={() => navigation.navigate('ReceiptScanner')}
        icon="camera"
        style={{ bottom: 24 + insets.bottom }}
      />
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.xl,
  },

  // ── Tabs (pbTab pattern) ──
  tabRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    flexWrap: 'wrap',
  },
  // Match the bill screen's status pills (all / upcoming / overdue): stays
  // neu.raised, and the ACTIVE pill gets a solid accent fill with bold onAccent
  // text — a filled raised pill, not an inset one.
  tab: {
    paddingVertical: SPACING.xs + 3,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  tabActive: {
    backgroundColor: C.accent,
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    letterSpacing: 0.1,
  },
  tabTextActive: {
    color: C.onAccent,
    fontWeight: TYPOGRAPHY.weight.bold,
  },

  // ── Hero (tax summary) ──
  heroCard: {
    // surface (bg + neu shadow) comes from neu.raisedSoft spread at the call site
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  heroAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    letterSpacing: -0.5,
    marginBottom: SPACING.lg,
    fontVariant: ['tabular-nums'] as any,
  },
  heroAmountSub: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
  },

  // ── Tax rows inside hero ──
  taxRow: {
    marginBottom: SPACING.sm,
  },
  taxRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  taxRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    marginRight: SPACING.sm,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taxRowName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    letterSpacing: 0.2,
    flex: 1,
  },
  taxRowAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'] as any,
  },

  // ── Thin progress bar (3px, same as budget) ──
  barTrack: {
    height: 3,
    backgroundColor: withAlpha(C.accent, 0.1),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  barFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },

  // ── e-Invoice reminder ──
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.04),
    borderRadius: RADIUS.md,
  },
  reminderText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    letterSpacing: 0.2,
    flex: 1,
    lineHeight: TYPOGRAPHY.size.xs * TYPOGRAPHY.lineHeight.normal,
  },

  // ── Grouped card (wallet-style) ──
  groupCardShadow: {
    // One card per receipt (transaction-list style). neu.raisedSoft (bg + soft
    // shadow) is spread here at the call site. This wrapper is UNCLIPPED so the
    // shadow isn't cut into a hard seam by the inner card's overflow:'hidden'
    // (the documented rowShadow gotcha).
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.sm + 6, // gap so the soft shadow can breathe (matches the transaction list)
  },
  groupCard: {
    // transparent inner card — clips the Swipeable delete-reveal to the rounded
    // corners. Its surface (bg) comes from the groupCardShadow wrapper behind it.
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },

  // ── Receipt row (inside groupCard) ──
  // The card surface + fill (ReanimatedSwipeable clips its own children, so no
  // overflow wrapper is needed — mirrors the transaction list's `card`).
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
  },
  receiptThumb: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: C.background,
    marginRight: SPACING.md,
  },
  receiptThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptContent: {
    flex: 1,
  },
  receiptNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs / 2,
  },
  receiptTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    letterSpacing: 0.2,
    flex: 1,
    marginRight: SPACING.sm,
  },
  receiptAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'] as any,
  },
  receiptMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  receiptSavedDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    letterSpacing: 0.2,
    marginTop: SPACING.xs / 2,
  },
  receiptDot: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginHorizontal: SPACING.xs,
  },

  // ── Divider (budget pattern) ──
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 36 + SPACING.md + SPACING.md,
  },

  // ── Swipe action (matches the transaction list's swipeDeleteBtn) ──
  swipeAction: {
    backgroundColor: C.neutral,
    justifyContent: 'center',
    alignItems: 'center',
    width: 56,
    marginLeft: SPACING.sm,
    borderRadius: RADIUS.xl,
  },

  // ── Empty state (budget pattern) ──
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING['5xl'],
    paddingHorizontal: SPACING.xl,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: 0.2,
    marginBottom: SPACING.xs,
  },
  emptyMessage: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: SPACING.xl,
    lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.normal,
  },
  emptyCtaWrap: { width: '100%', maxWidth: 256 },
});

export default ReceiptHistory;
