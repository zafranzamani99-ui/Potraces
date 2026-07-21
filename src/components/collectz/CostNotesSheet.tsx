/**
 * CostNotesSheet — the organizer's per-session cost scratchpad.
 *
 * A saved multiline note (collectz_sessions.calc_notes — organizer-only) with a
 * built-in calculator pad (src/utils/calculatorEngine — full expressions with
 * precedence + brackets), so working out "court RM25 + 5 shuttles × RM10 ÷ 6
 * people" never needs the calculator app. The pad's result can be inserted
 * into the note as a line, or applied straight to the session amount
 * (flat → per-person share, equal → total).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Keyboard, StyleSheet, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import BottomSheet from '../common/BottomSheet';
import NeuButton from '../common/NeuButton';
import KeyboardDoneFab from '../common/KeyboardDoneFab';
import { useNeu } from '../common/neu';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { lightTap } from '../../services/haptics';
import {
  initialCalc,
  inputDigit,
  inputDot,
  inputOp,
  inputBracket,
  inputPercent,
  backspace,
  clearAll,
  equals,
  liveResult,
  isError,
  formatNumber,
  formatExpressionString,
  currencyAmount,
  type CalcState,
  type CalcOp,
} from '../../utils/calculatorEngine';
import { fill } from '../../screens/personal/collectz/collectzFormat';

interface CostNotesSheetProps {
  visible: boolean;
  /** Called on ANY dismiss path — carries the final note and whether it changed. */
  onClose: (text: string | null, changed: boolean) => void;
  currency: string;
  scheme: 'flat' | 'equal' | 'custom';
  /** Headcount for the "÷ N people" quick key (0 hides it). */
  activeCount: number;
  initialNotes: string | null;
  /** Apply the calculator result to the session amount (parent decides which field). */
  onApplyAmount: (amount: number) => void;
}

const CostNotesSheet: React.FC<CostNotesSheetProps> = ({
  visible,
  onClose,
  currency,
  scheme,
  activeCount,
  initialNotes,
  onApplyAmount,
}) => {
  const C = useCalm();
  const t = useT();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Space the BottomSheet reserves BELOW our scroll area (the pinned "× Close" link
  // + the sheet's safe-area padding). Sizing the behind-keyboard block by
  // (keyboardHeight − this) lands the calculator toggle right at the keyboard's top
  // edge, so the note fills the gap above it and Save/Close tuck behind the keyboard.
  const bottomChrome = Math.max(insets.bottom, SPACING.xl) + 64;

  const [notes, setNotes] = useState('');
  const [showCalc, setShowCalc] = useState(false);
  const [calc, setCalc] = useState<CalcState>(initialCalc);
  const openedNotes = useRef('');
  // Note Fields standard: gold done-FAB while the note is focused.
  const [noteFocused, setNoteFocused] = useState(false);
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible(() => setNoteFocused(false));

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (visible) {
      openedNotes.current = (initialNotes ?? '').trim();
      setNotes(initialNotes ?? '');
      setShowCalc(false);
      setCalc(initialCalc);
      setNoteFocused(false);
    }
  }, [visible, initialNotes]);

  const close = () => {
    const trimmed = notes.trim();
    onClose(trimmed ? trimmed : null, trimmed !== openedNotes.current);
  };

  const live = liveResult(calc);
  const resultReady = live != null && !isError(calc);

  const divideByPeople = () => {
    if (activeCount <= 0) return;
    lightTap();
    setCalc((s) => {
      let next = inputOp(s, '÷');
      for (const d of String(activeCount)) next = inputDigit(next, d);
      return next;
    });
  };

  const insertIntoNote = () => {
    if (!resultReady) return;
    lightTap();
    const line = `${formatExpressionString(calc.expr)} = ${formatNumber(live)}`;
    setNotes((prev) => (prev.trim() ? `${prev.trimEnd()}\n${line}` : line));
  };

  const applyAmount = () => {
    if (!resultReady) return;
    lightTap();
    onApplyAmount(currencyAmount(live));
  };

  const key = (label: string, onPress: () => void, opts?: { accent?: boolean; fill?: boolean }) => (
    <Pressable
      key={label}
      style={({ pressed }) => [
        styles.key,
        !opts?.fill && neu.raised,
        opts?.fill && styles.keyFill,
        pressed && { opacity: 0.85 },
      ]}
      onPress={() => { lightTap(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.keyText, opts?.accent && { color: C.accent }, opts?.fill && styles.keyFillText]}>{label}</Text>
    </Pressable>
  );

  const op = (symbol: CalcOp) => () => setCalc((s) => inputOp(s, symbol));

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      maxHeightPct={0.92}
      closeLabel={t.common.close}
      overlay={<KeyboardDoneFab visible={keyboardVisible && noteFocused} keyboardHeight={keyboardHeight} />}
    >
      {/* The sheet does NOT keyboard-avoid (no lift) — the keyboard slides up and
          covers Save/Close. While typing, the scroll area grows to the sheet's max
          height and the "fill zone" (note + calculator) stretches to fill everything
          above the keyboard, so the note enlarges instead of leaving an empty gap;
          Save sits in a keyboard-height block below, tucked behind the keyboard.
          Keyboard down → no growth, compact layout. */}
      <ScrollView
        style={[{ flexGrow: 0, flexShrink: 1 }, keyboardVisible && { height: winH }]}
        contentContainerStyle={[styles.wrap, keyboardVisible && { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.fillZone, keyboardVisible && { flex: 1 }]}>
        <Text style={styles.title}>{t.collectz.costNotesTitle}</Text>

        <TextInput
          style={[styles.noteInput, keyboardVisible && { flex: 1 }]}
          value={notes}
          onChangeText={setNotes}
          placeholder={t.collectz.costNotesPlaceholder}
          placeholderTextColor={C.textMuted}
          multiline
          textAlignVertical="top"
          onFocus={() => setNoteFocused(true)}
          onBlur={() => setNoteFocused(false)}
        />

        {/* Calculator toggle */}
        <Pressable
          style={({ pressed }) => [styles.calcToggle, neu.raised, pressed && { opacity: 0.85 }]}
          onPress={() => {
            lightTap();
            setShowCalc((v) => {
              const next = !v;
              // Opening the pad: drop the OS keyboard so its keys aren't covered by it.
              if (next) { Keyboard.dismiss(); setNoteFocused(false); }
              return next;
            });
          }}
          accessibilityRole="button"
        >
          <Feather name="percent" size={15} color={C.accent} />
          <Text style={styles.calcToggleText}>{t.collectz.costNotesCalc}</Text>
          <Feather name={showCalc ? 'chevron-up' : 'chevron-down'} size={15} color={C.textMuted} />
        </Pressable>

        {showCalc && (
          <View style={styles.calcBox}>
            {/* Display: expression + live result */}
            <View style={styles.calcDisplay}>
              <Text style={styles.calcExpr} numberOfLines={1} adjustsFontSizeToFit>
                {calc.expr ? formatExpressionString(calc.expr) : '0'}
              </Text>
              <Text style={[styles.calcLive, isError(calc) && { color: C.overdue }]} numberOfLines={1}>
                {isError(calc) ? 'Error' : live != null ? `= ${formatNumber(live)}` : ' '}
              </Text>
            </View>

            {activeCount > 0 && (
              <Pressable
                style={({ pressed }) => [styles.peopleChip, neu.raised, pressed && { opacity: 0.85 }]}
                onPress={divideByPeople}
                accessibilityRole="button"
              >
                <Feather name="users" size={13} color={C.bronze} />
                <Text style={[styles.peopleChipText, { color: C.bronze }]}>
                  {fill(t.collectz.costNotesDividePeople, { n: activeCount })}
                </Text>
              </Pressable>
            )}

            {/* Keys */}
            <View style={styles.keyGrid}>
              <View style={styles.keyRow}>
                {key('C', () => setCalc(clearAll()), { accent: true })}
                {key('( )', () => setCalc((s) => inputBracket(s)), { accent: true })}
                {key('%', () => setCalc((s) => inputPercent(s)), { accent: true })}
                {key('⌫', () => setCalc((s) => backspace(s)), { accent: true })}
              </View>
              <View style={styles.keyRow}>
                {key('7', () => setCalc((s) => inputDigit(s, '7')))}
                {key('8', () => setCalc((s) => inputDigit(s, '8')))}
                {key('9', () => setCalc((s) => inputDigit(s, '9')))}
                {key('÷', op('÷'), { accent: true })}
              </View>
              <View style={styles.keyRow}>
                {key('4', () => setCalc((s) => inputDigit(s, '4')))}
                {key('5', () => setCalc((s) => inputDigit(s, '5')))}
                {key('6', () => setCalc((s) => inputDigit(s, '6')))}
                {key('×', op('×'), { accent: true })}
              </View>
              <View style={styles.keyRow}>
                {key('1', () => setCalc((s) => inputDigit(s, '1')))}
                {key('2', () => setCalc((s) => inputDigit(s, '2')))}
                {key('3', () => setCalc((s) => inputDigit(s, '3')))}
                {key('−', op('-'), { accent: true })}
              </View>
              <View style={styles.keyRow}>
                {key('0', () => setCalc((s) => inputDigit(s, '0')))}
                {key('.', () => setCalc((s) => inputDot(s)))}
                {key('=', () => setCalc((s) => equals(s)), { fill: true })}
                {key('+', op('+'), { accent: true })}
              </View>
            </View>

            {/* Result actions */}
            <View style={styles.resultRow}>
              <Pressable
                style={({ pressed }) => [styles.resultBtn, neu.raised, (!resultReady || pressed) && { opacity: resultReady ? 0.85 : 0.4 }]}
                onPress={insertIntoNote}
                disabled={!resultReady}
                accessibilityRole="button"
              >
                <Feather name="corner-down-left" size={14} color={C.accent} />
                <Text style={styles.resultBtnText}>{t.collectz.costNotesInsert}</Text>
              </Pressable>
              {scheme !== 'custom' && (
                <Pressable
                  style={({ pressed }) => [styles.resultBtn, neu.raised, (!resultReady || pressed) && { opacity: resultReady ? 0.85 : 0.4 }]}
                  onPress={applyAmount}
                  disabled={!resultReady}
                  accessibilityRole="button"
                >
                  <Feather name="check-circle" size={14} color={C.accent} />
                  <Text style={styles.resultBtnText}>
                    {scheme === 'equal' ? t.collectz.costNotesApplyTotal : t.collectz.costNotesApplyShare}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
        </View>

        {/* Save tucked into a keyboard-height block → sits behind the keyboard while
            typing (revealed when the keyboard is dismissed). Keyboard down → natural
            height, Save shows normally right under the calculator. */}
        <View style={keyboardVisible ? { height: Math.max(0, keyboardHeight - bottomChrome), overflow: 'hidden' } : undefined}>
          <NeuButton icon="check" label={t.common.save} onPress={close} />
        </View>
      </ScrollView>
    </BottomSheet>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    wrap: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.md },
    fillZone: { gap: SPACING.md },
    title: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, textAlign: 'center' },
    noteInput: {
      minHeight: 110,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.background,
      padding: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      textAlignVertical: 'top',
      lineHeight: 22,
    },
    calcToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    calcToggleText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
    calcBox: { gap: SPACING.sm },
    calcDisplay: {
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      alignItems: 'flex-end',
      gap: 2,
    },
    calcExpr: { fontSize: TYPOGRAPHY.size.lg, color: C.textPrimary, fontVariant: ['tabular-nums'], alignSelf: 'stretch', textAlign: 'right' },
    calcLive: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary, fontVariant: ['tabular-nums'] },
    peopleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      alignSelf: 'center',
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
    },
    peopleChipText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold },
    keyGrid: { gap: SPACING.sm },
    keyRow: { flexDirection: 'row', gap: SPACING.sm },
    key: {
      flex: 1,
      height: 46,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    keyText: { fontSize: TYPOGRAPHY.size.lg, color: C.textPrimary, fontVariant: ['tabular-nums'] },
    keyFill: { backgroundColor: C.accent },
    keyFillText: { color: C.onAccent, fontWeight: TYPOGRAPHY.weight.bold },
    resultRow: { flexDirection: 'row', gap: SPACING.sm },
    resultBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      paddingHorizontal: SPACING.sm,
    },
    resultBtnText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent, flexShrink: 1 },
  });

export default CostNotesSheet;
