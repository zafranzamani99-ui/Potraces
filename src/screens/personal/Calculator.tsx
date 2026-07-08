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
import { formatAmount } from '../../utils/formatters';
import { useCalculatorStore } from '../../store/calculatorStore';
import {
  initialCalc, inputDigit, inputDot, setOp, equals, percent, toggleSign,
  backspace, clearAll, result, didCompute, formatCalc, CalcState, CalcOp,
} from '../../utils/calculatorEngine';
import type { CALM } from '../../constants';

type Key =
  | { t: 'digit'; v: string } | { t: 'dot' } | { t: 'op'; v: CalcOp }
  | { t: 'eq' } | { t: 'ac' } | { t: 'back' } | { t: 'pct' } | { t: 'sign' };

const KEYS: Key[][] = [
  [{ t: 'ac' }, { t: 'sign' }, { t: 'pct' }, { t: 'op', v: '÷' }],
  [{ t: 'digit', v: '7' }, { t: 'digit', v: '8' }, { t: 'digit', v: '9' }, { t: 'op', v: '×' }],
  [{ t: 'digit', v: '4' }, { t: 'digit', v: '5' }, { t: 'digit', v: '6' }, { t: 'op', v: '-' }],
  [{ t: 'digit', v: '1' }, { t: 'digit', v: '2' }, { t: 'digit', v: '3' }, { t: 'op', v: '+' }],
  [{ t: 'digit', v: '0' }, { t: 'dot' }, { t: 'back' }, { t: 'eq' }],
];

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
  const canSplit = !state.error && value > 0;

  const press = (k: Key) => {
    lightTap();
    // Equals is handled outside the functional updater: it has a side effect
    // (addEntry) and must not run inside setState (StrictMode double-invokes
    // updaters, which would log history twice). Reading `state` from the closure
    // is safe here — key presses are discrete committed events.
    if (k.t === 'eq') {
      const next = equals(state);
      if (didCompute(state) && !next.error) addEntry(next.expression, result(next));
      setState(next);
      return;
    }
    setState((s) => {
      switch (k.t) {
        case 'digit': return inputDigit(s, k.v);
        case 'dot': return inputDot(s);
        case 'op': return setOp(s, k.v);
        case 'pct': return percent(s);
        case 'sign': return toggleSign(s);
        case 'back': return backspace(s);
        case 'ac': return clearAll();
        default: return s;
      }
    });
  };

  const label = (k: Key): string => {
    switch (k.t) {
      case 'digit': return k.v;
      case 'dot': return '.';
      case 'op': return k.v;
      case 'eq': return '=';
      case 'ac': return 'AC';
      case 'pct': return '%';
      case 'sign': return '±';
      case 'back': return '⌫';
    }
  };

  const isAccent = (k: Key) => k.t === 'op' || k.t === 'eq';

  return (
    <View style={styles.root}>
      {/* Display */}
      <View style={styles.displayWrap}>
        <Pressable style={styles.historyBtn} onPress={() => { lightTap(); setShowHistory(true); }} accessibilityLabel={t.calc.history}>
          <Ionicons name="time-outline" size={22} color={C.textMuted} />
        </Pressable>
        <Text style={styles.expression} numberOfLines={1}>{state.expression}</Text>
        <Text style={styles.display} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="text">
          {state.display}
        </Text>
      </View>

      {/* Keypad */}
      <View style={styles.pad}>
        {KEYS.map((row, i) => (
          <View key={i} style={styles.padRow}>
            {row.map((k, j) => (
              <Pressable key={j} onPress={() => press(k)} style={styles.keyWrap} accessibilityLabel={label(k)}>
                <NeuSurface style={styles.key}>
                  <Text style={[styles.keyText, isAccent(k) && { color: C.accent }]}>{label(k)}</Text>
                </NeuSurface>
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
                onPress={() => { lightTap(); setState({ ...initialCalc, display: formatCalc(h.result), overwrite: true }); setShowHistory(false); }}
              >
                <Text style={styles.historyExpr} numberOfLines={1}>{h.expression}</Text>
                <Text style={styles.historyResult}>{formatAmount(h.result)}</Text>
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
          <Pressable
            style={styles.chooserBtn}
            onPress={() => { lightTap(); setShowChooser(false); setShowQuick(true); }}
          >
            <Ionicons name="flash-outline" size={20} color={C.accent} />
            <Text style={styles.chooserText}>{t.calc.quickSplit}</Text>
          </Pressable>
          <Pressable
            style={styles.chooserBtn}
            onPress={() => {
              lightTap(); setShowChooser(false);
              navigation.navigate('DebtTracking', { prefillSplitAmount: value });
            }}
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
  root: { flex: 1, backgroundColor: C.background, paddingHorizontal: 16, paddingBottom: 24 },
  displayWrap: { flex: 1, justifyContent: 'flex-end', paddingVertical: 24 },
  historyBtn: { position: 'absolute', top: 12, right: 4, padding: 8 },
  expression: { fontSize: 16, color: C.textMuted, textAlign: 'right', fontVariant: ['tabular-nums'] },
  display: { fontSize: 56, fontWeight: '200', color: C.textPrimary, textAlign: 'right', fontVariant: ['tabular-nums'], letterSpacing: -1.5 },
  pad: { gap: 10 },
  padRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  keyWrap: { flex: 1, aspectRatio: 1.15 },
  key: { flex: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 24, fontWeight: '400', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  splitBtn: {
    marginTop: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.accent, borderRadius: 16, paddingVertical: 15,
  },
  splitBtnDisabled: { opacity: 0.4 },
  splitText: { color: C.onAccent, fontWeight: '700', fontSize: 15 },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: C.textPrimary, paddingHorizontal: 20, paddingTop: 8 },
  historyBody: { padding: 16, gap: 4 },
  empty: { textAlign: 'center', color: C.textMuted, paddingVertical: 30 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  historyExpr: { color: C.textSecondary, fontSize: 14, flex: 1, fontVariant: ['tabular-nums'] },
  historyResult: { color: C.textPrimary, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  clearBtn: { alignItems: 'center', paddingVertical: 16 },
  clearText: { color: C.textMuted, fontSize: 14 },
  chooserBody: { padding: 16, gap: 12 },
  chooserBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: C.pillBg },
  chooserText: { fontSize: 16, fontWeight: '500', color: C.textPrimary },
});

export default Calculator;
