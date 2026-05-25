import React, { useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';

interface EditHeroAmountCardProps {
  amount: string;
  setAmount: (v: string) => void;
  type: 'expense' | 'income';
  onTypeChange: (t: 'expense' | 'income') => void;
  currency: string;
  isLocked: boolean;
  C: typeof CALM;
  /**
   * Called when the user presses "done" on the keyboard from the amount field.
   * Allows parent (sheet) to forward-chain — e.g., trigger save if all fields valid,
   * or fall back to keyboard dismiss. Defaults to Keyboard.dismiss() when omitted.
   */
  onSubmitAmount?: () => void;
}

/**
 * Hero amount card with inline expense/income type toggle.
 * Locked when transaction is linked to a debt payment (linkedDebtId set).
 */
const EditHeroAmountCard: React.FC<EditHeroAmountCardProps> = ({
  amount,
  setAmount,
  type,
  onTypeChange,
  currency,
  isLocked,
  C,
  onSubmitAmount,
}) => {
  const t = useT();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);

  // #18 multi-currency defensive fallback. Empty / undefined => RM.
  const safeCurrency = currency && currency.trim().length > 0 ? currency : 'RM';

  /**
   * #8 Comma formatting on display.
   * Raw value in `amount` stays a clean numeric string (no commas, single dot).
   * On change: strip commas, block invalid chars, allow at most one '.', allow
   * leading '.' (we'll display it as-is; parsing happens upstream).
   * Display value: re-inject thousand separators on the integer part only.
   */
  const handleChangeText = useCallback(
    (raw: string) => {
      // Strip everything except digits and dots, and remove user-typed commas.
      const stripped = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
      // Allow only one decimal point — keep first occurrence, drop the rest.
      const firstDot = stripped.indexOf('.');
      let normalized = stripped;
      if (firstDot !== -1) {
        normalized =
          stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, '');
      }
      // Defensive: cap fractional digits at 2 to avoid drift.
      if (firstDot !== -1) {
        const [intPart, fracPart = ''] = normalized.split('.');
        normalized = intPart + '.' + fracPart.slice(0, 2);
      }
      setAmount(normalized);
    },
    [setAmount],
  );

  const displayAmount = useMemo(() => {
    if (!amount) return '';
    // Preserve a trailing dot or '.x' the user is mid-typing.
    const dotIdx = amount.indexOf('.');
    const intRaw = dotIdx === -1 ? amount : amount.slice(0, dotIdx);
    const fracRaw = dotIdx === -1 ? null : amount.slice(dotIdx + 1);
    // Format integer part with thousand separators. Empty intRaw (user typed
    // bare '.') => keep blank so we show '.x' verbatim.
    const intFormatted = intRaw ? Number(intRaw).toLocaleString('en-US') : '';
    if (fracRaw === null) return intFormatted;
    return `${intFormatted}.${fracRaw}`;
  }, [amount]);

  const handleSubmit = useCallback(() => {
    if (onSubmitAmount) {
      onSubmitAmount();
    } else {
      Keyboard.dismiss();
    }
  }, [onSubmitAmount]);

  return (
    <View style={styles.editFieldHeroCard}>
      <View style={styles.editFieldHeroLabelRow}>
        <Text style={styles.editFieldCardLabel}>{t.transaction.amount.toLowerCase()}</Text>
        {/* Inline mini type-toggle — tap to flip direction (#16: repeat icon as affordance) */}
        <TouchableOpacity
          onPress={() => onTypeChange(type === 'expense' ? 'income' : 'expense')}
          disabled={isLocked}
          activeOpacity={isLocked ? 1 : 0.7}
          style={styles.editFieldTypeToggle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityState={{ disabled: isLocked }}
          accessibilityLabel={`${(type === 'expense' ? t.quickAdd.wentOut : t.quickAdd.cameIn).toLowerCase()}, ${t.editHero.tapToFlipHint}`}
          accessibilityHint={t.editHero.tapToFlipHint}
        >
          <Feather
            name={type === 'expense' ? 'arrow-down' : 'arrow-up'}
            size={11}
            color={type === 'income' ? C.deepOlive : C.textMuted}
          />
          <Text
            style={[
              styles.editFieldTypeToggleText,
              type === 'income' && { color: C.deepOlive },
            ]}
          >
            {(type === 'expense' ? t.quickAdd.wentOut : t.quickAdd.cameIn).toLowerCase()}
          </Text>
          {!isLocked && (
            <Feather
              name="repeat"
              size={9}
              color={withAlpha(type === 'income' ? C.deepOlive : C.textMuted, 0.7)}
              style={styles.editFieldTypeToggleAffordance}
            />
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.editFieldHeroAmountRow}>
        <Text
          style={[styles.editFieldHeroCurrency, type === 'income' && { color: C.deepOlive }, isLocked && { opacity: 0.5 }]}
          numberOfLines={1}
        >
          {safeCurrency}
        </Text>
        <TextInput
          style={[styles.editFieldHeroAmountInput, type === 'income' && { color: C.deepOlive }, isLocked && { opacity: 0.5 }]}
          value={displayAmount}
          onChangeText={handleChangeText}
          placeholder={t.editHero.placeholder}
          keyboardType="decimal-pad"
          placeholderTextColor={withAlpha(C.textPrimary, 0.12)}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          selectTextOnFocus={!isLocked}
          editable={!isLocked}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={C.accent}
          accessibilityLabel={t.transaction.amount.toLowerCase()}
        />
      </View>
      {isLocked && (
        <View style={styles.editFieldHeroLockedRow}>
          <Feather name="lock" size={10} color={C.textMuted} />
          <Text style={styles.typeLockedCaptionText}>{t.transactionList.typeLocked}</Text>
        </View>
      )}
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    editFieldCardLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      marginBottom: 4,
      letterSpacing: 0.2,
    },
    editFieldHeroCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.textPrimary, 0.08),
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.lg,
      marginBottom: SPACING.sm + 2,
    },
    editFieldHeroLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.xs,
    },
    editFieldTypeToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs / 2 + 2,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.04),
    },
    editFieldTypeToggleText: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textMuted,
      letterSpacing: 0.2,
    },
    editFieldTypeToggleAffordance: {
      marginLeft: 2,
      opacity: 0.85,
    },
    editFieldHeroAmountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginTop: SPACING.xs,
    },
    editFieldHeroCurrency: {
      fontSize: 22,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
      marginRight: 4,
      letterSpacing: -0.2,
      // Defensive: long currency strings (e.g. "USDT") shouldn't push input to 0px.
      maxWidth: '40%',
    },
    editFieldHeroAmountInput: {
      flex: 1,
      fontSize: 36,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.8,
      paddingVertical: 0,
    },
    editFieldHeroLockedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: SPACING.sm,
    },
    typeLockedCaptionText: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      letterSpacing: 0.1,
    },
  });

export default EditHeroAmountCard;
