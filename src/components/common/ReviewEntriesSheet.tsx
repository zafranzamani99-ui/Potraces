/**
 * ReviewEntriesSheet — the "save all" confirmation surface for Echo.
 *
 * When 2+ entries are waiting as chips, this bottom sheet lets the owner see
 * everything at once (description, category·wallet, amount), the running total,
 * remove any they don't want, and commit them all in one tap. Editing a single
 * entry hands off to the existing ActionEditModal (the parent closes this sheet
 * first to avoid stacked modals on iOS). Nothing here saves on its own — the
 * owner taps "save all" to commit.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Modal } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { isDestructiveAction } from '../../services/chatActions';
import type { ChatAction, ChatActionType } from '../../services/chatActions';

const ICONS: Partial<Record<ChatActionType, React.ComponentProps<typeof Feather>['name']>> = {
  add_expense: 'arrow-up-right',
  add_income: 'arrow-down-left',
  add_debt: 'repeat',
  add_subscription: 'credit-card',
  split_bill: 'users',
  add_bnpl: 'credit-card',
  transfer: 'refresh-cw',
  add_goal_contribution: 'target',
};

interface ReviewEntriesSheetProps {
  visible: boolean;
  actions: ChatAction[];
  /** Segmented totals — never one summed RM (B6). */
  cameIn: number;
  wentOut: number;
  /** Whether any pending entry is destructive (excluded from save-all, B3). */
  hasDestructive: boolean;
  onClose: () => void;
  onConfirmAll: () => void;
  onEditEntry: (clientId: string) => void;
  onRemoveEntry: (clientId: string) => void;
  flagNoteFor: (action: ChatAction) => string | null;
}

const ReviewEntriesSheet: React.FC<ReviewEntriesSheetProps> = ({
  visible,
  actions,
  cameIn,
  wentOut,
  hasDestructive,
  onClose,
  onConfirmAll,
  onEditEntry,
  onRemoveEntry,
  flagNoteFor,
}) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const segment = t.moneyChat.segmentedTotal
    .replace('{in}', cameIn.toFixed(2))
    .replace('{out}', wentOut.toFixed(2));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t.moneyChat.saveAllTitle.replace('{n}', String(actions.length))}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel={t.moneyChat.cancel}
            >
              <Feather name="x" size={18} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            bounces={false}
          >
            {actions.map((action, i) => {
              const note = flagNoteFor(action);
              const destructive = isDestructiveAction(action);
              // Destructive entries stay out of save-all — show why (B3).
              const meta = destructive
                ? t.moneyChat.destructiveExcluded
                : [action.category, action.wallet].filter(Boolean).join(' · ');
              return (
                <TouchableOpacity
                  key={action.clientId ?? `${action.type}-${action.amount}-${i}`}
                  style={styles.row}
                  activeOpacity={0.7}
                  onPress={() => action.clientId && onEditEntry(action.clientId)}
                  accessibilityRole="button"
                >
                  <View style={styles.rowIcon}>
                    <Feather name={ICONS[action.type] || 'plus'} size={15} color={C.bronze} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowDesc} numberOfLines={1}>{action.description}</Text>
                    {note ? (
                      <Text style={styles.rowFlag} numberOfLines={2}>{note}</Text>
                    ) : meta ? (
                      <Text style={destructive ? styles.rowFlag : styles.rowMeta} numberOfLines={2}>{meta}</Text>
                    ) : null}
                  </View>
                  {action.amount != null && (
                    <Text style={styles.rowAmount}>RM {action.amount.toFixed(2)}</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => action.clientId && onRemoveEntry(action.clientId)}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    style={styles.rowRemove}
                    accessibilityRole="button"
                    accessibilityLabel={t.moneyChat.removeA11y}
                  >
                    <Feather name="x" size={16} color={C.textMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Segmented total — never one summed RM (B6) */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t.moneyChat.totalLabel}</Text>
            <Text style={styles.totalAmount}>{segment}</Text>
          </View>

          {hasDestructive && (
            <Text style={styles.destructiveNote}>{t.moneyChat.destructiveExcluded}</Text>
          )}

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={onConfirmAll}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Feather name="check" size={16} color={C.onAccent} />
            <Text style={styles.saveBtnText}>{t.moneyChat.reviewAll}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>{t.moneyChat.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default React.memo(ReviewEntriesSheet);

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    maxHeight: '80%',
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.sm,
    ...SHADOWS.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  title: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.textMuted, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    maxHeight: 340,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowDesc: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  rowMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  rowFlag: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    marginTop: 1,
  },
  rowAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  rowRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.sm,
  },
  totalLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  totalAmount: {
    flex: 1,
    textAlign: 'right',
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  destructiveNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    lineHeight: TYPOGRAPHY.size.xs * 1.4,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.deepOlive,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    marginTop: SPACING.xs,
  },
  saveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  cancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
});
