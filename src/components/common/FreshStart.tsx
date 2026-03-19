/**
 * Fresh Start — a gentle 1st-of-month ritual.
 * Shows on the first few days of the month to let users set breathing room.
 * Dismissable, won't show again that month.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import { useCategories } from '../../hooks/useCategories';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { lightTap, mediumTap } from '../../services/haptics';

interface FreshStartProps {
  onDismiss?: () => void;
}

const FreshStart: React.FC<FreshStartProps> = ({ onDismiss }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);
  const now = new Date();
  const monthKey = format(now, 'yyyy-MM');
  const monthLabel = format(now, 'MMMM');

  const dismissedMonth = useAIInsightsStore((s) => s.freshStartDismissedMonth);
  const breathingRooms = useAIInsightsStore((s) => s.breathingRooms);
  const setBreathingRoom = useAIInsightsStore((s) => s.setBreathingRoom);
  const dismissFreshStart = useAIInsightsStore((s) => s.dismissFreshStart);
  const expenseCategories = useCategories('expense', 'personal');
  const transactions = usePersonalStore((s) => s.transactions);

  // Last month's spending per category for reference
  const lastMonthSpent = useMemo(() => {
    const lastMonth = subMonths(now, 1);
    const start = startOfMonth(lastMonth);
    const end = endOfMonth(lastMonth);
    const map: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type === 'expense') {
        const d = t.date instanceof Date ? t.date : new Date(t.date);
        if (d >= start && d <= end && t.category) {
          map[t.category] = (map[t.category] || 0) + t.amount;
        }
      }
    }
    return map;
  }, [transactions]);

  const [modalVisible, setModalVisible] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const br of breathingRooms) {
      init[br.category] = br.limit.toString();
    }
    return init;
  });

  // Don't show if already dismissed this month, or past day 5
  if (dismissedMonth === monthKey || now.getDate() > 5) return null;

  const handleDismiss = useCallback(() => {
    lightTap();
    dismissFreshStart(monthKey);
    onDismiss?.();
  }, [monthKey, dismissFreshStart, onDismiss]);

  const handleSave = useCallback(() => {
    mediumTap();
    for (const [catId, val] of Object.entries(drafts)) {
      const num = parseFloat(val);
      if (num > 0) {
        setBreathingRoom(catId, num);
      }
    }
    dismissFreshStart(monthKey);
    setModalVisible(false);
    onDismiss?.();
  }, [drafts, monthKey, setBreathingRoom, dismissFreshStart, onDismiss]);

  const handleDraftChange = (catId: string, val: string) => {
    setDrafts((prev) => ({ ...prev, [catId]: val }));
  };

  // Top categories to suggest
  const topCategories = expenseCategories.slice(0, 6);

  return (
    <>
      <TouchableOpacity
        style={styles.banner}
        activeOpacity={0.8}
        onPress={() => {
          lightTap();
          setModalVisible(true);
        }}
      >
        <View style={styles.bannerContent}>
          <View style={styles.iconWrap}>
            <Feather name="sunrise" size={18} color={C.bronze} />
          </View>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>fresh start — {monthLabel}</Text>
            <Text style={styles.bannerSubtitle}>what feels right this month?</Text>
          </View>
          <TouchableOpacity
            onPress={handleDismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={16} color={C.textMuted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Feather name="sunrise" size={20} color={C.bronze} />
              </View>
              <Text style={styles.modalTitle}>breathing room for {monthLabel}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={18} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              how much room do you want for each category this month? leave blank to skip.
            </Text>

            <ScrollView
              style={styles.categoryList}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {topCategories.map((cat) => {
                const lastSpent = lastMonthSpent[cat.id];
                return (
                  <View key={cat.id} style={styles.categoryRow}>
                    <View style={styles.categoryInfo}>
                      <Text style={styles.categoryLabel}>{cat.name}</Text>
                      {lastSpent ? (
                        <Text style={styles.categoryHint}>{currency} {lastSpent.toFixed(0)} last month</Text>
                      ) : null}
                    </View>
                    <View style={styles.inputWrap}>
                      <Text style={styles.rmPrefix}>{currency}</Text>
                      <TextInput
                        style={styles.amountInput}
                        value={drafts[cat.id] || ''}
                        onChangeText={(val) => handleDraftChange(cat.id, val)}
                        keyboardType="numeric"
                        placeholder={lastSpent ? lastSpent.toFixed(0) : '—'}
                        placeholderTextColor={C.textMuted}
                      />
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={handleDismiss}
              >
                <Text style={styles.skipText}>not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                activeOpacity={0.7}
              >
                <Text style={styles.saveText}>set breathing room</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

export default React.memo(FreshStart);

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  banner: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.12),
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  bannerSubtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  modalIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.textMuted, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: 20,
  },
  categoryList: {
    maxHeight: 300,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  categoryInfo: {
    flex: 1,
    gap: 2,
  },
  categoryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
  },
  categoryHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: withAlpha(C.textMuted, 0.06),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    minWidth: 100,
  },
  rmPrefix: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  amountInput: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    minWidth: 60,
    padding: 0,
    textAlign: 'right',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  skipBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  skipText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
  saveBtn: {
    backgroundColor: C.bronze,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
  },
  saveText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
});
