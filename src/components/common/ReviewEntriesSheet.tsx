/**
 * ReviewEntriesSheet — the "save all" confirmation surface for Echo.
 *
 * When 2+ entries are waiting as chips, this bottom sheet lets the owner see
 * everything at once (description, category·wallet, amount), the running total,
 * remove any they don't want, and commit them all in one tap. Editing a single
 * entry hands off to the existing ActionEditModal (the parent closes this sheet
 * first to avoid stacked modals on iOS). Nothing here saves on its own — the
 * owner taps "save all" to commit.
 *
 * Renders THROUGH the shared BottomSheet so it gets every sheet feature for free
 * (drag handle, slide-up, drag-to-dismiss, animated backdrop, safe-area pad, and
 * the pinned "✕ close" footer). The row list + segmented total + save-all CTA are
 * the sheet's children; the list scrolls while the total + CTA stay pinned below.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useNeu } from './neu';
import NeuButton from './NeuButton';
import BottomSheet from './BottomSheet';
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
  const isDark = useIsDark();
  const neu = useNeu(undefined, { faintDark: true }); // icon well
  const neuRow = useNeu(); // rows — standard neu, the visible onyx raise
  const styles = useMemo(() => makeStyles(C, neu, neuRow, isDark), [C, neu, neuRow, isDark]);
  const segment = t.moneyChat.segmentedTotal
    .replace('{in}', cameIn.toFixed(2))
    .replace('{out}', wentOut.toFixed(2));

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      closeLabel={t.moneyChat.cancel}
      maxHeightPct={0.85}
      header={
        <View style={styles.headerPad}>
          <Text style={styles.title}>
            {t.moneyChat.saveAllTitle.replace('{n}', String(actions.length))}
          </Text>
        </View>
      }
    >
      <View style={styles.body}>
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
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

        <NeuButton
          icon="check"
          label={t.moneyChat.reviewAll}
          onPress={onConfirmAll}
          accessibilityLabel={t.moneyChat.reviewAll}
        />
      </View>
    </BottomSheet>
  );
};

export default React.memo(ReviewEntriesSheet);

const makeStyles = (C: typeof CALM, neu: ReturnType<typeof useNeu>, neuRow: ReturnType<typeof useNeu>, isDark: boolean) => StyleSheet.create({
  // BottomSheet is full-bleed (no horizontal padding), so the header + body add their own.
  headerPad: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
  },
  title: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  body: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    flexShrink: 1,
    gap: SPACING.sm,
  },
  // THE "neu vertical error" root cause: a ScrollView clips at its bounds, and with rows flush
  // to those bounds the neu shadow's horizontal blur got CUT at each row's left/right edge — a
  // hard dark line running down both sides of the list. (Same neu is clean on Goals/Debt because
  // their cards aren't flush against a clipping edge.) Fix: bleed the viewport out to the sheet
  // edge (negative margin) and pad the CONTENT back in, so the shadow has room and never clips.
  list: {
    maxHeight: 340,
    marginHorizontal: -SPACING.lg,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    // True onyx row: standard neu.raisedSoft for the visible soft raise + a near-black face
    // (0.015 over #121212) so it reads as a BLACK card, not grey. Safe now that the list
    // viewport no longer clips the shadow (see `list` above) — the shadow, not the fill,
    // carries the depth.
    ...neuRow.raisedSoft,
    backgroundColor: isDark ? withAlpha(C.textPrimary, 0.015) : neuRow.base,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    ...neu.well,
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
});
