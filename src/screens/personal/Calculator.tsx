import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { NeuSurface } from '../../components/common/neu';
import BottomSheet from '../../components/common/BottomSheet';
import QuickSplitSheet from '../../components/split/QuickSplitSheet';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { useCalculatorStore } from '../../store/calculatorStore';
import {
  initialCalc, inputDigit, inputDoubleZero, inputDot, inputOp, inputBracket,
  inputPercent, backspace, clearAll, equals, evaluate, liveResult, result,
  isError, hasOperation, formatNumber, formatExpressionString,
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

  const [state, setState] = useState<CalcState>(initialCalc);
  const [showHistory, setShowHistory] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [showQuick, setShowQuick] = useState(false);

  const value = result(state);
  const canSplit = !isError(state) && value > 0;

  const err = isError(state);
  const segments = displaySegments(state.expr);
  const live = liveResult(state);
  const showPreview = !err && hasOperation(state.expr) && live != null && isFinite(live);

  const press = (k: Key) => {
    lightTap();
    // Equals runs outside the functional updater: it has a side effect (addEntry)
    // and must not run inside setState (StrictMode double-invokes updaters).
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

  const segColor = (kind: string) =>
    kind === 'op' ? C.accent : kind === 'paren' ? C.accent : kind === 'pct' ? C.textSecondary : C.textPrimary;
  const keyIsAccent = (k: Key) => k.t === 'op' || k.t === 'bracket' || k.t === 'pct' || k.t === 'clear';

  return (
    <View style={styles.root}>
      {/* Display card */}
      <View style={styles.card}>
        <Pressable style={styles.historyBtn} onPress={() => { lightTap(); setShowHistory(true); }} accessibilityLabel={t.calc.history}>
          <Ionicons name="time-outline" size={22} color={C.textMuted} />
        </Pressable>

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

        {/* Backspace utility row */}
        <View style={styles.utilRow}>
          <Pressable
            style={styles.backBtn}
            onPress={() => { lightTap(); setState((s) => backspace(s)); }}
            accessibilityLabel="backspace"
            hitSlop={8}
          >
            <Ionicons name="backspace-outline" size={24} color={C.accent} />
          </Pressable>
        </View>
      </View>

      {/* Keypad */}
      <View style={styles.pad}>
        {KEYS.map((row, i) => (
          <View key={i} style={styles.padRow}>
            {row.map((k, j) => (
              <Pressable key={j} onPress={() => press(k)} style={styles.keyWrap} accessibilityLabel={keyLabel(k)}>
                {k.t === 'eq' ? (
                  <View style={styles.eqKey}>
                    <Text style={styles.eqText}>=</Text>
                  </View>
                ) : (
                  <NeuSurface style={styles.key}>
                    <Text style={[styles.keyText, keyIsAccent(k) && { color: C.accent }]}>{keyLabel(k)}</Text>
                  </NeuSurface>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {/* Use in a split */}
      <Pressable
        style={[styles.splitBtn, !canSplit && styles.splitBtnDisabled]}
        disabled={!canSplit}
        onPress={() => { lightTap(); setShowChooser(true); }}
        accessibilityLabel={t.calc.useInSplit}
      >
        <Ionicons name="people-outline" size={18} color={C.onAccent} />
        <Text style={styles.splitText}>{t.calc.useInSplit}</Text>
      </Pressable>

      {/* History sheet */}
      <BottomSheet visible={showHistory} onClose={() => setShowHistory(false)} header={<Text style={styles.sheetTitle}>{t.calc.history}</Text>}>
        <ScrollView contentContainerStyle={styles.historyBody}>
          {history.length === 0 ? (
            <Text style={styles.empty}>{t.calc.noHistory}</Text>
          ) : (
            history.map((h) => (
              <Pressable
                key={h.id}
                style={styles.historyRow}
                onPress={() => { lightTap(); setState({ expr: String(h.result), justEvaluated: true }); setShowHistory(false); }}
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

      {/* Split chooser */}
      <BottomSheet visible={showChooser} onClose={() => setShowChooser(false)} header={<Text style={styles.sheetTitle}>{t.calc.useInSplit}</Text>}>
        <View style={styles.chooserBody}>
          <Pressable style={styles.chooserBtn} onPress={() => { lightTap(); setShowChooser(false); setShowQuick(true); }}>
            <Ionicons name="flash-outline" size={20} color={C.accent} />
            <Text style={styles.chooserText}>{t.calc.quickSplit}</Text>
          </Pressable>
          <Pressable
            style={styles.chooserBtn}
            onPress={() => { lightTap(); setShowChooser(false); navigation.navigate('DebtTracking', { prefillSplitAmount: value }); }}
          >
            <Ionicons name="list-outline" size={20} color={C.textSecondary} />
            <Text style={styles.chooserText}>{t.calc.detailedSplit}</Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* Quick split */}
      <QuickSplitSheet visible={showQuick} total={value} onClose={() => setShowQuick(false)} />
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background, paddingHorizontal: 14, paddingBottom: 20 },
  card: {
    flex: 1, backgroundColor: C.surface, borderRadius: 24, marginTop: 8, marginBottom: 14,
    paddingHorizontal: 20, paddingTop: 44, paddingBottom: 12, justifyContent: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  historyBtn: { position: 'absolute', top: 12, right: 12, padding: 6 },
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
  keyText: { fontSize: 24, fontWeight: '400', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  eqKey: { flex: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent },
  eqText: { fontSize: 26, fontWeight: '600', color: C.onAccent },
  splitBtn: {
    marginTop: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.accent, borderRadius: 16, paddingVertical: 14,
  },
  splitBtnDisabled: { opacity: 0.4 },
  splitText: { color: C.onAccent, fontWeight: '700', fontSize: 15 },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: C.textPrimary, paddingHorizontal: 20, paddingTop: 8 },
  historyBody: { padding: 16, gap: 4 },
  empty: { textAlign: 'center', color: C.textMuted, paddingVertical: 30 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, gap: 12 },
  historyExpr: { color: C.textSecondary, fontSize: 14, flex: 1, fontVariant: ['tabular-nums'] },
  historyResult: { color: C.textPrimary, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  clearBtn: { alignItems: 'center', paddingVertical: 16 },
  clearText: { color: C.textMuted, fontSize: 14 },
  chooserBody: { padding: 16, gap: 12 },
  chooserBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: C.pillBg },
  chooserText: { fontSize: 16, fontWeight: '500', color: C.textPrimary },
});

export default Calculator;
