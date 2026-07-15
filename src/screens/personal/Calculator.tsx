import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { NeuSurface, useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import BottomSheet from '../../components/common/BottomSheet';
import QuickSplitSheet from '../../components/split/QuickSplitSheet';
import QuickAddExpense, { type QuickAddExpenseHandle } from '../../components/common/QuickAddExpense';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { withAlpha } from '../../constants';
import { usePersonalStore } from '../../store/personalStore';
import { useCalculatorStore } from '../../store/calculatorStore';
import { calcHub } from '../../utils/calcHub';
import {
  initialCalc, inputDigit, inputDoubleZero, inputDot, inputOp, inputBracket,
  inputPercent, backspace, clearAll, equals, evaluate, liveResult, result,
  insertValue, isError, hasOperation, formatNumber, numberToPlainString, formatExpressionString,
  displaySegments, currencyAmount, currencyAmountString, CalcState, CalcOp,
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

const relativeTime = (iso: string, t: ReturnType<typeof useT>): string => {
  const d = new Date(iso);
  const then = d.getTime();
  if (!isFinite(then)) return '';
  const mins = Math.floor(Math.max(0, Date.now() - then) / 60000);
  if (mins < 1) return t.calc.justNow;
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return t.calc.yesterday;
  if (days < 7) return `${days}d`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

type HubView = 'main' | 'split' | 'goal';

const Calculator: React.FC = () => {
  const C = useCalm();
  const neu = useNeu();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const history = useCalculatorStore((s) => s.history);
  const addEntry = useCalculatorStore((s) => s.addEntry);
  const clearHistory = useCalculatorStore((s) => s.clearHistory);
  const removeEntry = useCalculatorStore((s) => s.removeEntry);
  const goals = usePersonalStore((s) => s.goals);
  // Exclude completed goals — they have no room left, so contributing would be a no-op.
  const activeGoals = useMemo(() => goals.filter((g) => !g.isArchived && g.currentAmount < g.targetAmount), [goals]);

  const [state, setState] = useState<CalcState>(initialCalc);
  const [showHistory, setShowHistory] = useState(false);
  const [showHub, setShowHub] = useState(false);
  const [hubView, setHubView] = useState<HubView>('main');
  const [showQuick, setShowQuick] = useState(false);
  const [copied, setCopied] = useState(false);
  // Locally-hosted quick-add sheet. It MUST live on this screen (not rely on the
  // Dashboard-hosted global one) — an iOS RN Modal only presents from its owning
  // screen's view controller, and Dashboard is buried under the pushed Calculator.
  const quickAddRef = useRef<QuickAddExpenseHandle>(null);
  // Neu surface for the hub rows — based on the shared BottomSheet's C.background bg
  // (all modals use the edit-commitment tone), soft-dark tier.
  const hubNeu = useNeu(undefined, { faintDark: true });
  // Reopen the "What next?" hub after a sub-action is CANCELLED (not saved), so the
  // user lands back on the menu instead of the bare calculator.
  //  • Local sheets (Log, Quick split): close the hub, present the sheet; on cancel
  //    reopen via reopenHubRef; a save clears the ref so it stays closed.
  //  • Nav sub-actions (Detailed split, goal): the other screen sets calcHub on
  //    cancel and goBack()s; we reopen here on focus.
  const reopenHubRef = useRef(false);
  const reopenHubSoon = useCallback(() => {
    setTimeout(() => { setHubView('main'); setShowHub(true); }, 260);
  }, []);
  const maybeReopenHubLocal = useCallback(() => {
    if (!reopenHubRef.current) return;
    reopenHubRef.current = false;
    reopenHubSoon();
  }, [reopenHubSoon]);
  useFocusEffect(useCallback(() => {
    if (calcHub.reopenOnReturn) {
      calcHub.reopenOnReturn = false;
      reopenHubSoon();
    }
  }, [reopenHubSoon]));

  const value = result(state);
  const amount = currencyAmount(value); // currency-safe (2dp, no float noise / e-notation) for money hand-off
  const canUse = !isError(state) && amount > 0;

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

  const openHub = () => { setHubView('main'); setShowHub(true); }; // NeuButton fires the haptic
  // Log the amount as expense/income via the locally-hosted quick-add sheet.
  // Close the hub first, then present after it has dismissed — presenting a modal
  // while another is dismissing drops the second one on iOS.
  const openLog = (dir: 'expense' | 'income') => {
    lightTap();
    const amt = currencyAmountString(value);
    reopenHubRef.current = true; // cancelling the log sheet returns to the hub
    setShowHub(false);
    // Present after the hub finishes dismissing (avoids the iOS present-while-dismiss drop).
    setTimeout(() => quickAddRef.current?.open(dir, amt), 260);
  };
  const insertFromHistory = (r: number) => { lightTap(); setState((s) => insertValue(s, String(r))); setShowHistory(false); };
  const confirmClear = () => {
    lightTap();
    Alert.alert(t.calc.clearHistory, t.calc.clearConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.calc.clear, style: 'destructive', onPress: () => clearHistory() },
    ]);
  };

  const copyResult = async () => {
    if (!canUse) return;
    lightTap();
    await Clipboard.setStringAsync(numberToPlainString(value));
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
        <Pressable style={styles.historyBtn} onPress={() => { lightTap(); setShowHistory(true); }} accessibilityLabel={t.calc.history} hitSlop={8}>
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
          <Pressable style={styles.backBtn} onPress={() => { lightTap(); setState((s) => backspace(s)); }} accessibilityLabel={t.calc.backspace} hitSlop={8}>
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
                    // neu.raisedSoft carries its own (neu-base) backgroundColor, so the
                    // olive fill MUST be re-applied AFTER it — same as NeuButton does.
                    <View style={[styles.eqKey, neu.raisedSoft, { backgroundColor: C.accent }, pressed && styles.keyPressed]}>
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

      {/* Use this amount — olive CTA once there's a value; muted/idle otherwise */}
      <View style={styles.useWrap}>
        {canUse ? (
          <NeuButton
            icon="arrow-right"
            label={`${t.calc.useAmount}  ·  RM ${formatNumber(amount)}`}
            onPress={openHub}
            accessibilityLabel={t.calc.useAmount}
          />
        ) : (
          <View
            style={styles.idleBtn}
            accessibilityRole="button"
            accessibilityLabel={t.calc.useAmount}
            accessibilityState={{ disabled: true }}
          >
            <Text style={styles.idleText}>{t.calc.useAmount}</Text>
          </View>
        )}
      </View>

      {/* ── History sheet (header actions live in-body, not in the drag zone) ── */}
      <BottomSheet visible={showHistory} onClose={() => setShowHistory(false)}>
        <View style={styles.pinnedHeader}>
          <Text style={styles.sheetTitle}>{t.calc.history}</Text>
          {history.length > 0 && (
            <Pressable onPress={confirmClear} hitSlop={10} accessibilityLabel={t.calc.clearHistory}>
              <Text style={styles.headerAction}>{t.calc.clear}</Text>
            </Pressable>
          )}
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          {history.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="time-outline" size={36} color={C.textMuted} />
              <Text style={styles.emptyTitle}>{t.calc.noHistory}</Text>
              <Text style={styles.emptyHint}>{t.calc.noHistoryHint}</Text>
            </View>
          ) : (
            history.map((h) => (
              <Pressable
                key={h.id}
                style={({ pressed }) => [styles.histRow, pressed && styles.rowPressed]}
                onPress={() => insertFromHistory(h.result)}
                accessibilityLabel={`${h.expression} = ${formatNumber(h.result)}`}
              >
                <View style={styles.histTextWrap}>
                  <Text style={styles.histResult} numberOfLines={1}>{formatNumber(h.result)}</Text>
                  <Text style={styles.histExpr} numberOfLines={1}>{h.expression}</Text>
                </View>
                <Text style={styles.histTime}>{relativeTime(h.at, t)}</Text>
                <Pressable onPress={() => { lightTap(); removeEntry(h.id); }} hitSlop={12} style={styles.histDel} accessibilityLabel={t.calc.deleteEntry}>
                  <Ionicons name="close" size={16} color={C.textMuted} />
                </Pressable>
              </Pressable>
            ))
          )}
        </ScrollView>
      </BottomSheet>

      {/* ── Use-this-amount hub (single sheet, in-place steps) ── */}
      <BottomSheet visible={showHub} onClose={() => setShowHub(false)}>
        <View style={styles.pinnedHeader}>
          {hubView !== 'main' ? (
            <Pressable onPress={() => { lightTap(); setHubView('main'); }} hitSlop={10} style={styles.hubBack} accessibilityLabel={t.a11y.back}>
              <Ionicons name="chevron-back" size={22} color={C.accent} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.hubAmount}>RM {formatNumber(amount)}</Text>
            <Text style={styles.hubPrompt}>
              {hubView === 'split' ? t.calc.split : hubView === 'goal' ? t.calc.pickGoal : t.calc.hubPrompt}
            </Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          {hubView === 'main' && (
            <>
              <ActionRow C={C} surface={hubNeu.raisedSoft} icon="arrow-down-circle" tint={C.accent} title={t.calc.logExpense} subtitle={t.calc.logExpenseSub}
                onPress={() => openLog('expense')} />
              <ActionRow C={C} surface={hubNeu.raisedSoft} icon="arrow-up-circle" tint={C.positive} title={t.calc.logIncome} subtitle={t.calc.logIncomeSub}
                onPress={() => openLog('income')} />
              <ActionRow C={C} surface={hubNeu.raisedSoft} icon="people" tint={C.bronze} title={t.calc.split} subtitle={t.calc.splitSub}
                onPress={() => { lightTap(); setHubView('split'); }} />
              {activeGoals.length > 0 && (
                <ActionRow C={C} surface={hubNeu.raisedSoft} icon="flag" tint={C.gold} title={t.calc.goal} subtitle={t.calc.goalSub}
                  onPress={() => { lightTap(); setHubView('goal'); }} />
              )}
            </>
          )}

          {hubView === 'split' && (
            <>
              <ActionRow C={C} surface={hubNeu.raisedSoft} icon="flash" tint={C.accent} title={t.calc.quickSplit} subtitle={t.calc.quickSplitSub}
                onPress={() => { lightTap(); reopenHubRef.current = true; setShowHub(false); setTimeout(() => setShowQuick(true), 260); }} />
              <ActionRow C={C} surface={hubNeu.raisedSoft} icon="list" tint={C.bronze} title={t.calc.detailedSplit} subtitle={t.calc.detailedSplitSub}
                onPress={() => { lightTap(); setShowHub(false); navigation.navigate('DebtTracking', { prefillSplitAmount: amount }); }} />
            </>
          )}

          {hubView === 'goal' && (
            activeGoals.length === 0 ? (
              <Text style={styles.emptyHint}>{t.calc.noGoals}</Text>
            ) : activeGoals.map((g) => {
              const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
              return (
                <ActionRow
                  key={g.id}
                  C={C}
                  surface={hubNeu.raisedSoft}
                  icon="flag"
                  tint={C.gold}
                  title={g.name}
                  subtitle={`RM ${formatNumber(g.currentAmount)} / RM ${formatNumber(g.targetAmount)} · ${pct}%`}
                  onPress={() => { lightTap(); setShowHub(false); navigation.navigate('Goals', { contributeGoalId: g.id, contributeAmount: amount }); }}
                />
              );
            })
          )}
        </ScrollView>
      </BottomSheet>

      {/* Quick split — saving completes (→ calculator); closing returns to the hub */}
      <QuickSplitSheet
        visible={showQuick}
        total={amount}
        onCreated={() => { reopenHubRef.current = false; }}
        onClose={() => { setShowQuick(false); maybeReopenHubLocal(); }}
      />

      {/* Locally-hosted quick-add sheet (no FAB, opts out of the global opener) so
          "Log as expense/income" presents over the Calculator, not the buried Dashboard.
          Saving completes; dismissing returns to the hub. */}
      <QuickAddExpense
        ref={quickAddRef}
        showFab={false}
        registerGlobalOpener={false}
        onDismiss={(saved) => { if (saved) reopenHubRef.current = false; maybeReopenHubLocal(); }}
      />
    </View>
  );
};

const ActionRow: React.FC<{
  C: typeof CALM; icon: any; title: string; subtitle?: string; tint?: string; onPress: () => void; surface?: any;
}> = ({ C, icon, title, subtitle, tint, onPress, surface }) => {
  const s = useMemo(() => rowStyles(C), [C]);
  const accent = tint || C.accent;
  return (
    <Pressable
      style={({ pressed }) => [s.row, surface, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
    >
      <View style={[s.iconWrap, { backgroundColor: withAlpha(accent, 0.12) }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.sub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
    </Pressable>
  );
};

const rowStyles = (C: typeof CALM) => StyleSheet.create({
  // backgroundColor comes from the `surface` neu fragment (raisedSoft) passed in.
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 16 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  sub: { fontSize: 12.5, color: C.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
});

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background, paddingHorizontal: 14, paddingBottom: 20 },
  card: {
    flex: 1, backgroundColor: C.surface, borderRadius: 24, marginTop: 8, marginBottom: 14,
    paddingHorizontal: 20, paddingTop: 44, paddingBottom: 12, justifyContent: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  historyBtn: { position: 'absolute', top: 10, right: 10, padding: 10 },
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
  useWrap: { marginTop: 14 },
  idleBtn: {
    width: '100%', minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, backgroundColor: C.pillBg,
  },
  idleText: { color: C.textMuted, fontWeight: '600', fontSize: 15, letterSpacing: 0.3 },
  // Sheets
  pinnedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: C.textPrimary },
  headerAction: { fontSize: 14, fontWeight: '600', color: C.accent },
  sheetBody: { padding: 16, gap: 10 },
  hubBack: { padding: 6 },
  hubAmount: { fontSize: 24, fontWeight: '700', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  hubPrompt: { fontSize: 13, color: C.textMuted, marginTop: 1 },
  // History rows
  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { color: C.textSecondary, fontSize: 15, fontWeight: '600' },
  emptyHint: { color: C.textMuted, fontSize: 13, textAlign: 'center' },
  rowPressed: { opacity: 0.6 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.pillBg },
  histTextWrap: { flex: 1 },
  histResult: { fontSize: 18, fontWeight: '700', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  histExpr: { fontSize: 13, color: C.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  histTime: { fontSize: 12, color: C.textMuted, fontVariant: ['tabular-nums'] },
  histDel: { padding: 8 },
});

export default Calculator;
