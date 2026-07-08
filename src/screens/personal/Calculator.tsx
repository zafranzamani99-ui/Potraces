import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { NeuSurface } from '../../components/common/neu';
import BottomSheet from '../../components/common/BottomSheet';
import QuickSplitSheet from '../../components/split/QuickSplitSheet';
import { openQuickAdd } from '../../components/common/QuickAddExpense';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { usePersonalStore } from '../../store/personalStore';
import { useCalculatorStore } from '../../store/calculatorStore';
import {
  initialCalc, inputDigit, inputDoubleZero, inputDot, inputOp, inputBracket,
  inputPercent, backspace, clearAll, equals, evaluate, liveResult, result,
  insertValue, isError, hasOperation, formatNumber, formatExpressionString,
  displaySegments, CalcState, CalcOp,
} from '../../utils/calculatorEngine';
import type { CALM } from '../../constants';

type Key =
  | { t: 'digit'; v: string } | { t: 'dd' } | { t: 'dot' } | { t: 'op'; v: CalcOp }
  | { t: 'eq' } | { t: 'clear' } | { t: 'bracket' } | { t: 'pct' };

const KEYS: Key[][] = [
  [{ t: 'clear' }, { t: 'bracket' }, { t: 'pct' }, { t: 'op', v: '÷' }],
  [{ t: 'digit', v: '7' }, { t: 'digit', v: '8' }, { t: 'digit', v: '9' }, { t: 'op', v: '×' }],
  [{ t: 'digit', v: '4' }, { t: 'digit', v: '5' }, { t: 'digit', v: '6' }, { t: 'op', v: '-' }],
  [{ t: 'digit', v: '1' }, { t: 'digit', v: '2' }, { t: 'digit', v: '3' }, { t: 'op', v: '+' }],
  [{ t: 'digit', v: '0' }, { t: 'dd' }, { t: 'dot' }, { t: 'eq' }],
];

const keyLabel = (k: Key): string => {
  switch (k.t) {
    case 'digit': return k.v;
    case 'dd': return '00';
    case 'dot': return '.';
    case 'op': return k.v === '-' ? '−' : k.v;
    case 'eq': return '=';
    case 'clear': return 'C';
    case 'bracket': return '( )';
    case 'pct': return '%';
  }
};

const Calculator: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const history = useCalculatorStore((s) => s.history);
  const addEntry = useCalculatorStore((s) => s.addEntry);
  const clearHistory = useCalculatorStore((s) => s.clearHistory);
  const goals = usePersonalStore((s) => s.goals);
  const activeGoals = useMemo(() => goals.filter((g) => !g.isArchived), [goals]);

  const [state, setState] = useState<CalcState>(initialCalc);
  const [showHistory, setShowHistory] = useState(false);
  const [showHub, setShowHub] = useState(false);
  const [showSplitChoice, setShowSplitChoice] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  const value = result(state);
  const canUse = !isError(state) && value > 0;

  const err = isError(state);
  const segments = displaySegments(state.expr);
  const live = liveResult(state);
  const showPreview = !err && hasOperation(state.expr) && live != null && isFinite(live);

  const press = (k: Key) => {
    lightTap();
    if (k.t === 'eq') {
      const before = state;
      const r = evaluate(before.expr);
      if (hasOperation(before.expr) && r != null && isFinite(r)) {
        addEntry(formatExpressionString(before.expr), r);
      }
      setState(equals(before));
      return;
    }
    setState((s) => {
      switch (k.t) {
        case 'digit': return inputDigit(s, k.v);
        case 'dd': return inputDoubleZero(s);
        case 'dot': return inputDot(s);
        case 'op': return inputOp(s, k.v);
        case 'bracket': return inputBracket(s);
        case 'pct': return inputPercent(s);
        case 'clear': return clearAll();
        default: return s;
      }
    });
  };

  const copyResult = async () => {
    if (!canUse) return;
    lightTap();
    await Clipboard.setStringAsync(String(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const segColor = (kind: string) =>
    kind === 'op' || kind === 'paren' ? C.accent : kind === 'pct' ? C.textSecondary : C.textPrimary;
  const keyIsAccent = (k: Key) => k.t === 'op' || k.t === 'bracket' || k.t === 'pct' || k.t === 'clear';

  return (
    <View style={styles.root}>
      {/* Display card (long-press to copy) */}
      <Pressable style={styles.card} onLongPress={copyResult} delayLongPress={350} accessibilityHint="Long-press to copy">
        <Pressable style={styles.historyBtn} onPress={() => { lightTap(); setShowHistory(true); }} accessibilityLabel={t.calc.history}>
          <Ionicons name="time-outline" size={22} color={C.textMuted} />
        </Pressable>
        {copied && (
          <View style={styles.copiedPill}><Text style={styles.copiedText}>{t.calc.copied}</Text></View>
        )}

        <View style={styles.displayArea}>
          <Text style={[styles.expr, showPreview ? null : styles.exprBig]} numberOfLines={2} adjustsFontSizeToFit accessibilityRole="text">
            {err ? (
              <Text style={{ color: C.textPrimary }}>Error</Text>
            ) : segments.length === 0 ? (
              <Text style={{ color: C.textMuted }}>0</Text>
            ) : (
              segments.map((seg, i) => (
                <Text key={i} style={{ color: segColor(seg.kind) }}>
                  {seg.kind === 'op' ? ` ${seg.text} ` : seg.text}
                </Text>
              ))
            )}
          </Text>
          {showPreview && (
            <Text style={styles.preview} numberOfLines={1} adjustsFontSizeToFit>{formatNumber(live!)}</Text>
          )}
        </View>

        <View style={styles.utilRow}>
          <Pressable style={styles.backBtn} onPress={() => { lightTap(); setState((s) => backspace(s)); }} accessibilityLabel="backspace" hitSlop={8}>
            <Ionicons name="backspace-outline" size={24} color={C.accent} />
          </Pressable>
        </View>
      </Pressable>

      {/* Keypad */}
      <View style={styles.pad}>
        {KEYS.map((row, i) => (
          <View key={i} style={styles.padRow}>
            {row.map((k, j) => (
              <Pressable key={j} onPress={() => press(k)} style={styles.keyWrap} accessibilityLabel={keyLabel(k)}>
                {({ pressed }) => (
                  k.t === 'eq' ? (
                    <View style={[styles.eqKey, pressed && styles.keyPressed]}>
                      <Text style={styles.eqText}>=</Text>
                    </View>
                  ) : (
                    <NeuSurface pressed={pressed} style={[styles.key, pressed && styles.keyPressed]}>
                      <Text style={[styles.keyText, keyIsAccent(k) && { color: C.accent }]}>{keyLabel(k)}</Text>
                    </NeuSurface>
                  )
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {/* Use this amount */}
      <Pressable
        style={[styles.useBtn, !canUse && styles.useBtnDisabled]}
        disabled={!canUse}
        onPress={() => { lightTap(); setShowHub(true); }}
        accessibilityLabel={t.calc.useAmount}
      >
        <Ionicons name="arrow-forward-circle-outline" size={18} color={C.onAccent} />
        <Text style={styles.useText}>{t.calc.useAmount}</Text>
      </Pressable>

      {/* History sheet */}
      <BottomSheet visible={showHistory} onClose={() => setShowHistory(false)} header={<Text style={styles.sheetTitle}>{t.calc.history}</Text>}>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          {history.length === 0 ? (
            <Text style={styles.empty}>{t.calc.noHistory}</Text>
          ) : (
            history.map((h) => (
              <Pressable
                key={h.id}
                style={styles.historyRow}
                onPress={() => { lightTap(); setState((s) => insertValue(s, String(h.result))); setShowHistory(false); }}
              >
                <Text style={styles.historyExpr} numberOfLines={1}>{h.expression}</Text>
                <Text style={styles.historyResult}>{formatNumber(h.result)}</Text>
              </Pressable>
            ))
          )}
          {history.length > 0 && (
            <Pressable style={styles.clearBtn} onPress={() => { lightTap(); clearHistory(); }}>
              <Text style={styles.clearText}>{t.calc.clearHistory}</Text>
            </Pressable>
          )}
        </ScrollView>
      </BottomSheet>

      {/* Hub: what to do with the amount */}
      <BottomSheet visible={showHub} onClose={() => setShowHub(false)} header={<Text style={styles.sheetTitle}>{t.calc.useAmount} · {formatNumber(value)}</Text>}>
        <View style={styles.sheetBody}>
          <HubRow C={C} icon="arrow-down-circle-outline" label={t.calc.logExpense} onPress={() => { lightTap(); setShowHub(false); openQuickAdd('expense', String(value)); }} />
          <HubRow C={C} icon="arrow-up-circle-outline" label={t.calc.logIncome} onPress={() => { lightTap(); setShowHub(false); openQuickAdd('income', String(value)); }} />
          <HubRow C={C} icon="people-outline" label={t.calc.split} onPress={() => { lightTap(); setShowHub(false); setShowSplitChoice(true); }} />
          {activeGoals.length > 0 && (
            <HubRow C={C} icon="flag-outline" label={t.calc.goal} onPress={() => { lightTap(); setShowHub(false); setShowGoalPicker(true); }} />
          )}
        </View>
      </BottomSheet>

      {/* Split sub-chooser */}
      <BottomSheet visible={showSplitChoice} onClose={() => setShowSplitChoice(false)} header={<Text style={styles.sheetTitle}>{t.calc.split}</Text>}>
        <View style={styles.sheetBody}>
          <HubRow C={C} icon="flash-outline" label={t.calc.quickSplit} onPress={() => { lightTap(); setShowSplitChoice(false); setShowQuick(true); }} />
          <HubRow C={C} icon="list-outline" label={t.calc.detailedSplit} onPress={() => { lightTap(); setShowSplitChoice(false); navigation.navigate('DebtTracking', { prefillSplitAmount: value }); }} />
        </View>
      </BottomSheet>

      {/* Goal picker */}
      <BottomSheet visible={showGoalPicker} onClose={() => setShowGoalPicker(false)} header={<Text style={styles.sheetTitle}>{t.calc.pickGoal}</Text>}>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          {activeGoals.map((g) => (
            <Pressable
              key={g.id}
              style={styles.goalRow}
              onPress={() => { lightTap(); setShowGoalPicker(false); navigation.navigate('Goals', { contributeGoalId: g.id, contributeAmount: value }); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.goalName} numberOfLines={1}>{g.name}</Text>
                <Text style={styles.goalSub}>RM {formatNumber(g.currentAmount)} / RM {formatNumber(g.targetAmount)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>

      {/* Quick split */}
      <QuickSplitSheet visible={showQuick} total={value} onClose={() => setShowQuick(false)} />
    </View>
  );
};

const HubRow: React.FC<{ C: typeof CALM; icon: any; label: string; onPress: () => void }> = ({ C, icon, label, onPress }) => (
  <Pressable
    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: C.pillBg }}
    onPress={onPress}
    accessibilityLabel={label}
  >
    <Ionicons name={icon} size={20} color={C.accent} />
    <Text style={{ fontSize: 16, fontWeight: '500', color: C.textPrimary }}>{label}</Text>
  </Pressable>
);

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background, paddingHorizontal: 14, paddingBottom: 20 },
  card: {
    flex: 1, backgroundColor: C.surface, borderRadius: 24, marginTop: 8, marginBottom: 14,
    paddingHorizontal: 20, paddingTop: 44, paddingBottom: 12, justifyContent: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  historyBtn: { position: 'absolute', top: 12, right: 12, padding: 6 },
  copiedPill: { position: 'absolute', top: 14, left: 16, backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  copiedText: { color: C.onAccent, fontSize: 12, fontWeight: '600' },
  displayArea: { flex: 1, justifyContent: 'flex-end' },
  expr: { fontSize: 34, fontWeight: '400', color: C.textPrimary, textAlign: 'right', fontVariant: ['tabular-nums'] },
  exprBig: { fontSize: 52, fontWeight: '300', letterSpacing: -1 },
  preview: { fontSize: 26, fontWeight: '300', color: C.textMuted, textAlign: 'right', marginTop: 8, fontVariant: ['tabular-nums'] },
  utilRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  backBtn: { padding: 8 },
  pad: { gap: 9 },
  padRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 9 },
  keyWrap: { flex: 1, aspectRatio: 1.25 },
  key: { flex: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  keyPressed: { transform: [{ scale: 0.95 }], opacity: 0.9 },
  keyText: { fontSize: 24, fontWeight: '400', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  eqKey: { flex: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent },
  eqText: { fontSize: 26, fontWeight: '600', color: C.onAccent },
  useBtn: {
    marginTop: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.accent, borderRadius: 16, paddingVertical: 14,
  },
  useBtnDisabled: { opacity: 0.4 },
  useText: { color: C.onAccent, fontWeight: '700', fontSize: 15 },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: C.textPrimary, paddingHorizontal: 20, paddingTop: 8 },
  sheetBody: { padding: 16, gap: 10 },
  empty: { textAlign: 'center', color: C.textMuted, paddingVertical: 30 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, gap: 12 },
  historyExpr: { color: C.textSecondary, fontSize: 14, flex: 1, fontVariant: ['tabular-nums'] },
  historyResult: { color: C.textPrimary, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  clearBtn: { alignItems: 'center', paddingVertical: 16 },
  clearText: { color: C.textMuted, fontSize: 14 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  goalName: { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  goalSub: { fontSize: 12, color: C.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
});

export default Calculator;
