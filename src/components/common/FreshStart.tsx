/**
 * Fresh Start — a gentle 1st-of-month ritual.
 * Shows on the first few days of the month to let users set breathing room.
 * Dismissable, won't show again that month.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import { useCategories } from '../../hooks/useCategories';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { lightTap, mediumTap } from '../../services/haptics';

interface FreshStartProps {
  onDismiss?: () => void;
}

const FreshStart: React.FC<FreshStartProps> = ({ onDismiss }) => {
  const now = new Date();
  const monthKey = format(now, 'yyyy-MM');
  const monthLabel = format(now, 'MMMM');

  const dismissedMonth = useAIInsightsStore((s) => s.freshStartDismissedMonth);
  const breathingRooms = useAIInsightsStore((s) => s.breathingRooms);
  const setBreathingRoom = useAIInsightsStore((s) => s.setBreathingRoom);
  const dismissFreshStart = useAIInsightsStore((s) => s.dismissFreshStart);
  const expenseCategories = useCategories('expense', 'personal');

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
            <Feather name="sunrise" size={18} color={CALM.bronze} />
          </View>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>fresh start — {monthLabel}</Text>
            <Text style={styles.bannerSubtitle}>set your breathing room for the month</Text>
          </View>
          <TouchableOpacity
            onPress={handleDismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={16} color={CALM.textMuted} />
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
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Feather name="sunrise" size={20} color={CALM.bronze} />
              </View>
              <Text style={styles.modalTitle}>breathing room for {monthLabel}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={18} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              how much room do you want for each category this month? leave blank to skip.
            </Text>

            <ScrollView
              style={styles.categoryList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {topCategories.map((cat) => (
                <View key={cat.id} style={styles.categoryRow}>
                  <Text style={styles.categoryLabel}>{cat.name}</Text>
                  <View style={styles.inputWrap}>
                    <Text style={styles.rmPrefix}>RM</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={drafts[cat.id] || ''}
                      onChangeText={(val) => handleDraftChange(cat.id, val)}
                      keyboardType="numeric"
                      placeholder="—"
                      placeholderTextColor={CALM.textMuted}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={handleDismiss}
              >
                <Text style={styles.skipText}>skip</Text>
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

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.12),
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
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  bannerSubtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
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
    backgroundColor: '#fff',
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
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
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
    borderBottomColor: CALM.border,
  },
  categoryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    flex: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    minWidth: 100,
  },
  rmPrefix: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  amountInput: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
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
    color: CALM.textMuted,
  },
  saveBtn: {
    backgroundColor: CALM.bronze,
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
