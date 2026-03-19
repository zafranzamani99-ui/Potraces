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
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { format, getYear } from 'date-fns';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReceiptStore } from '../../store/receiptStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { MYTAX_CATEGORIES } from '../../constants/taxCategories';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import type { RootStackParamList, SavedReceipt } from '../../types';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const ReceiptHistory: React.FC = () => {
  const C = useCalm();
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
      >
        {/* ── Year Tabs (pbTab pattern) ── */}
        <View style={styles.tabRow}>
          {availableYears.map((year) => (
            <TouchableOpacity
              key={year}
              style={[styles.tab, selectedYear === year && styles.tabActive]}
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
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>LHDN tax relief {selectedYear}</Text>
            <Text style={styles.heroAmount}>
              {currency} {totalClaimable.toFixed(0)}{' '}
              <Text style={styles.heroAmountSub}>claimable</Text>
            </Text>
            {taxSummary.map((s) => {
              const cat = MYTAX_CATEGORIES.find((c) => c.id === s.categoryId);
              const percentage = s.limit ? Math.min((s.totalSpent / s.limit) * 100, 100) : 0;
              const nearLimit = s.limit ? s.totalSpent / s.limit > 0.8 : false;
              return (
                <View key={s.categoryId} style={styles.taxRow}>
                  <View style={styles.taxRowTop}>
                    <View style={styles.taxRowLeft}>
                      <View style={[styles.iconCircle, { backgroundColor: withAlpha(C.accent, 0.08) }]}>
                        <Feather
                          name={(cat?.icon || 'file') as keyof typeof Feather.glyphMap}
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
                remember to request e-invoices for claimable purchases — you'll need your IC number at checkout
              </Text>
            </View>
          </View>
        )}

        {/* ── Category Filter Pills (pbTab pattern) ── */}
        {activeCategories.length > 0 && (
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, !filterCategory && styles.tabActive]}
              onPress={() => { lightTap(); setFilterCategory(null); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, !filterCategory && styles.tabTextActive]}>
                all ({yearReceipts.length})
              </Text>
            </TouchableOpacity>
            {activeCategories.map((cat) => {
              const isActive = filterCategory === cat.id;
              const count = yearReceipts.filter((r) => r.myTaxCategory === cat.id).length;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.tab, isActive && styles.tabActive]}
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

        {/* ── Receipt List (wallet-style groupCard) ── */}
        {hasReceipts ? (
          <View style={styles.groupCard}>
            {filteredReceipts.map((item, index) => {
              const taxCat = MYTAX_CATEGORIES.find((c) => c.id === item.myTaxCategory);
              const isLast = index === filteredReceipts.length - 1;
              return (
                <View key={item.id}>
                  <Swipeable
                    renderRightActions={() => (
                      <TouchableOpacity
                        style={styles.swipeAction}
                        onPress={() => handleDelete(item.id, item.title)}
                      >
                        <Feather name="trash-2" size={18} color={C.bronze} />
                      </TouchableOpacity>
                    )}
                    overshootRight={false}
                  >
                    <Pressable
                      onPress={() => navigation.navigate('ReceiptDetail' as any, { receiptId: item.id })}
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
                      </View>
                    </Pressable>
                  </Swipeable>
                  {!isLast && <View style={styles.divider} />}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Feather name="archive" size={48} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>no receipts yet</Text>
            <Text style={styles.emptyMessage}>
              scan a receipt to save it here for tax filing
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate('ReceiptScanner' as any)}
              activeOpacity={0.8}
            >
              <Feather name="camera" size={18} color="#fff" />
              <Text style={styles.emptyButtonText}>scan receipt</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── FAB: scan receipt ── */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 24 + insets.bottom }]}
        onPress={() => { lightTap(); navigation.navigate('ReceiptScanner' as any); }}
        activeOpacity={0.85}
      >
        <Feather name="camera" size={22} color="#fff" />
      </TouchableOpacity>
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
  tab: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    backgroundColor: C.pillBg,
  },
  tabActive: {
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  tabTextActive: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },

  // ── Hero (tax summary) ──
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
    textTransform: 'lowercase',
  },
  heroAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
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
    flex: 1,
  },
  taxRowAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
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
    flex: 1,
    lineHeight: 18,
  },

  // ── Grouped card (wallet-style) ──
  groupCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.xs,
  },

  // ── Receipt row (inside groupCard) ──
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    paddingVertical: SPACING.md,
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
    marginBottom: 2,
  },
  receiptTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    flex: 1,
    marginRight: SPACING.sm,
  },
  receiptAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  receiptMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
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

  // ── Swipe action ──
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 56,
    paddingHorizontal: SPACING.sm,
  },

  // ── Empty state (budget pattern) ──
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING['5xl'],
    paddingHorizontal: SPACING.xl,
  },
  emptyIconCircle: {
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
  },
  emptyMessage: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: C.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
  },
  emptyButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // ── FAB ──
  fab: {
    position: 'absolute',
    right: SPACING.xl,
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
});

export default ReceiptHistory;
