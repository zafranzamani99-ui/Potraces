/**
 * BudgetPlannerSheet — "Echo plan" for the monthly budget.
 *
 * Opens populated by the deterministic engine (budgetPlan.ts → recommendModel + tailorPlan +
 * critic). Production intent: Echo KNOWS you (auto-pulls subscriptions + debts you owe, remembers
 * your must-pays + income via budgetProfileStore), CHECKS the plan against real Malaysian
 * cost-of-living (Belanjawanku realityCheck), is HONEST (surfaces the critic's grounded notes),
 * and shows WHERE every ringgit goes (set-aside → cushion/grow + your goals, per-category budgets).
 * Every ringgit is the engine's — switching models only re-frames the same money.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import BottomSheet from './BottomSheet';
import CategoryIcon from './CategoryIcon';
import { CALM, CALM_DARK, SPACING, RADIUS, TYPOGRAPHY, withAlpha, SHADOWS } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useCategories } from '../../hooks/useCategories';
import { usePersonalStore } from '../../store/personalStore';
import { useDebtStore } from '../../store/debtStore';
import { useWalletStore } from '../../store/walletStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useBudgetProfileStore } from '../../store/budgetProfileStore';
import { lightTap, mediumTap } from '../../services/haptics';
import { computeBudgetPlan, derivedMonthlyIncome, BudgetPlan } from '../../services/budgetPlan';
import { BUDGET_MODELS, BudgetModelId } from '../../services/budgetModels';
import { CategoryOption } from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onApplied?: (n: number) => void;
}

const cycleFactor = (cycle?: string): number => {
  switch (cycle) {
    case 'yearly': return 1 / 12;
    case 'quarterly': return 1 / 3;
    case 'weekly': return 52 / 12;
    case 'daily': return 30;
    default: return 1; // monthly
  }
};

const BudgetPlannerSheet: React.FC<Props> = ({ visible, onClose, onApplied }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const t = useT();
  const tp = t.budget.planner;
  const currency = useSettingsStore((s) => s.currency);
  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString('en-MY')}`;

  const transactions = usePersonalStore((s) => s.transactions);
  const subscriptions = usePersonalStore((s) => s.subscriptions);
  const goals = usePersonalStore((s) => s.goals);
  const budgets = usePersonalStore((s) => s.budgets);
  const addBudget = usePersonalStore((s) => s.addBudget);
  const debts = useDebtStore((s) => s.debts);
  const wallets = useWalletStore((s) => s.wallets);
  const expenseCategories = useCategories('expense');

  // persisted profile — Echo remembers your income, must-pays, and chosen model
  const profileTakeHome = useBudgetProfileStore((s) => s.takeHome);
  const manualCommitments = useBudgetProfileStore((s) => s.commitments);
  const profileModelId = useBudgetProfileStore((s) => s.modelId);
  const setTakeHome = useBudgetProfileStore((s) => s.setTakeHome);
  const upsertCommitment = useBudgetProfileStore((s) => s.upsertCommitment);
  const removeCommitment = useBudgetProfileStore((s) => s.removeCommitment);
  const setStoreModel = useBudgetProfileStore((s) => s.setModelId);

  // local (per-session) state
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeBuf, setIncomeBuf] = useState('');
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [catBuf, setCatBuf] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [commitBuf, setCommitBuf] = useState('');

  const asOf = useMemo(() => new Date(), [visible]);

  const subscriptionCommitments = useMemo(
    () =>
      subscriptions
        .filter((s) => s.isActive && !s.isPaused)
        .map((s) => ({ id: `sub-${s.id}`, label: s.name, monthly: Math.round((s.amount || 0) * cycleFactor(s.billingCycle)) }))
        .filter((c) => c.monthly > 0),
    [subscriptions],
  );
  const subsTotal = subscriptionCommitments.reduce((s, c) => s + c.monthly, 0);

  const commitments = useMemo(
    () => [
      ...manualCommitments.map((c) => ({ label: c.label, monthly: c.monthly })),
      ...subscriptionCommitments.map((c) => ({ label: c.label, monthly: c.monthly })),
    ],
    [manualCommitments, subscriptionCommitments],
  );

  const activeGoals = useMemo(() => goals.filter((g) => !g.isArchived && !g.isPaused).slice(0, 3), [goals]);
  const oweDebts = useMemo(() => debts.filter((d) => d.type === 'i_owe' && d.status !== 'settled'), [debts]);

  const defaultIncome = useMemo(() => derivedMonthlyIncome(transactions as any, asOf), [transactions, asOf]);
  const income = profileTakeHome ?? defaultIncome;
  const needBand = !(income > 0);

  const plan = useMemo<BudgetPlan | null>(() => {
    if (!visible || !(income > 0)) return null;
    try {
      return computeBudgetPlan({
        takeHomeIncome: income,
        commitments,
        txns: transactions as any,
        debts: debts as any,
        wallets: wallets as any,
        asOf,
        modelId: (profileModelId as BudgetModelId) ?? undefined,
      });
    } catch {
      return null;
    }
  }, [visible, income, commitments, transactions, debts, wallets, asOf, profileModelId]);

  const catMap = useMemo(() => {
    const m: Record<string, CategoryOption> = {};
    for (const c of expenseCategories) m[c.id] = c;
    return m;
  }, [expenseCategories]);

  const displayRows = useMemo(
    () => (plan ? plan.rows.map((r) => ({ ...r, amount: edits[r.category] ?? r.amount })) : []),
    [plan, edits],
  );
  const allocated = displayRows.reduce((s, r) => s + r.amount, 0);
  const toAssign = plan ? plan.leftToSpend - allocated : 0;
  const existingCats = useMemo(() => new Set(budgets.map((b) => b.category)), [budgets]);
  const buildable = displayRows.filter((r) => r.amount > 0 && !existingCats.has(r.category));
  const roughStart = !!plan && (plan.rows.every((r) => r.fromStarter) || profileTakeHome != null);
  const activeModel = (profileModelId as BudgetModelId) ?? plan?.recommendedId;

  // chips the user can still add (presets + their owed debts), minus ones already added
  const addedIds = useMemo(() => new Set(manualCommitments.map((c) => c.id)), [manualCommitments]);
  const presetChips = [
    { id: 'rent', label: tp.presetRent },
    { id: 'car', label: tp.presetCar },
    { id: 'petrol', label: tp.presetPetrol },
    { id: 'loan', label: tp.presetLoan },
    { id: 'family', label: tp.presetFamily },
    { id: 'insurance', label: tp.presetInsurance },
  ].filter((p) => !addedIds.has(p.id));
  const debtChips = oweDebts
    .map((d) => ({ id: `debt-${d.id}`, label: (d.description || d.contact?.name || 'debt').toString() }))
    .filter((d) => !addedIds.has(d.id));

  // ── handlers ──
  const pickBand = useCallback((v: number) => { lightTap(); setEdits({}); setTakeHome(v); }, [setTakeHome]);
  const startEditIncome = useCallback(() => { lightTap(); setIncomeBuf(income > 0 ? String(income) : ''); setEditingIncome(true); }, [income]);
  const commitIncome = useCallback(() => {
    const v = Math.max(0, Math.round(parseFloat(incomeBuf) || 0));
    setTakeHome(v > 0 ? v : null);
    setEdits({});
    setEditingIncome(false);
  }, [incomeBuf, setTakeHome]);

  const startAdd = useCallback((id: string, cur?: number) => { lightTap(); setCommitBuf(cur && cur > 0 ? String(cur) : ''); setAddingId(id); }, []);
  const confirmCommit = useCallback((id: string, label: string) => {
    setCommitBuf((buf) => {
      const v = Math.max(0, Math.round(parseFloat(buf) || 0));
      if (v > 0) { upsertCommitment({ id, label, monthly: v }); setEdits({}); }
      return '';
    });
    setAddingId(null);
  }, [upsertCommitment]);
  const removeCommit = useCallback((id: string) => { lightTap(); removeCommitment(id); setEdits({}); }, [removeCommitment]);

  const switchModel = useCallback((id: BudgetModelId) => {
    lightTap();
    setEdits({});
    setStoreModel(plan && id === plan.recommendedId ? null : id);
  }, [plan, setStoreModel]);

  const startEditCat = useCallback((cat: string, cur: number) => { lightTap(); setCatBuf(cur > 0 ? String(cur) : ''); setEditingCat(cat); }, []);
  const commitCat = useCallback(() => {
    setEditingCat((cat) => {
      if (cat) { const v = Math.max(0, Math.round(parseFloat(catBuf) || 0)); setEdits((e) => ({ ...e, [cat]: v })); }
      return null;
    });
    setCatBuf('');
  }, [catBuf]);

  const apply = useCallback(() => {
    if (!plan || buildable.length === 0) return;
    mediumTap();
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    let n = 0;
    for (const r of buildable) {
      if (r.amount <= 0) continue;
      addBudget({ category: r.category, allocatedAmount: r.amount, period: 'monthly', startDate: now, endDate });
      n++;
    }
    onClose();
    onApplied?.(n);
  }, [plan, buildable, addBudget, onClose, onApplied]);

  const handleClose = useCallback(() => { setEditingCat(null); setEditingIncome(false); setAddingId(null); onClose(); }, [onClose]);

  const bands = [
    { v: 1500, label: `< ${currency} 2,000` },
    { v: 2500, label: `${currency} 2–3k` },
    { v: 4000, label: `${currency} 3–5k` },
    { v: 6500, label: `> ${currency} 5,000` },
  ];

  const headline: { label: string; amount: number; color: string }[] = plan
    ? [
        { label: tp.setAside, amount: plan.setAside, color: C.accent },
        ...(plan.commitmentsTotal > 0 ? [{ label: tp.commitments, amount: plan.commitmentsTotal, color: C.bronze }] : []),
        { label: tp.leftToSpend, amount: plan.leftToSpend, color: C.gold },
      ]
    : [];
  const barBase = Math.max(income, 1);
  const realityColor = plan && plan.realityCheck.level === 'below' ? C.bronze : C.accent;

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Feather name="zap" size={16} color={C.accent} />
        <Text style={styles.title}>{tp.title}</Text>
      </View>
      {!needBand && <Text style={styles.sub}>{tp.sub}</Text>}
    </View>
  );

  const renderAddInput = (id: string, label: string) => (
    <View style={styles.mpAddInput}>
      <Text style={styles.mpCur}>{currency}</Text>
      <TextInput
        style={styles.mpInput}
        value={commitBuf}
        onChangeText={setCommitBuf}
        keyboardType="number-pad"
        autoFocus
        onSubmitEditing={() => confirmCommit(id, label)}
        onBlur={() => confirmCommit(id, label)}
        placeholder={label}
        placeholderTextColor={C.textMuted}
        selectionColor={withAlpha(C.accent, 0.25)}
        keyboardAppearance={isDark ? 'dark' : 'light'}
      />
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={handleClose} header={header} maxHeightPct={0.92}>
      <View style={styles.bounds}>
        <ScrollView
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {needBand ? (
            <View>
              <Text style={styles.askPrompt}>{tp.askPrompt}</Text>
              <View style={styles.bandWrap}>
                {bands.map((b) => (
                  <TouchableOpacity key={b.v} style={styles.bandChip} onPress={() => pickBand(b.v)} activeOpacity={0.85}>
                    <Text style={styles.bandText}>{b.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : plan ? (
            <View>
              {/* money in (editable, remembered) */}
              <TouchableOpacity style={styles.incomeRow} onPress={startEditIncome} activeOpacity={0.7} accessibilityRole="button">
                <Text style={styles.incomeLabel}>{tp.moneyIn}</Text>
                {editingIncome ? (
                  <TextInput
                    style={styles.incomeInput}
                    value={incomeBuf}
                    onChangeText={setIncomeBuf}
                    keyboardType="number-pad"
                    autoFocus
                    onBlur={commitIncome}
                    onSubmitEditing={commitIncome}
                    selectionColor={withAlpha(C.accent, 0.25)}
                    placeholder={String(income)}
                    placeholderTextColor={C.textMuted}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                  />
                ) : (
                  <View style={styles.incomeValRow}>
                    <Text style={styles.incomeVal}>{money(income)}</Text>
                    <Feather name="edit-2" size={12} color={C.textMuted} />
                  </View>
                )}
              </TouchableOpacity>

              {/* must-pays — the real-life questions (car, rent, study loan), remembered */}
              <View style={styles.mpCard}>
                <Text style={styles.mpTitle}>{tp.mustPays}</Text>
                <Text style={styles.mpHint}>{tp.mustPaysHint}</Text>

                {manualCommitments.map((c) => (
                  <View key={c.id} style={styles.mpRow}>
                    <Text style={styles.mpRowLabel}>{c.label}</Text>
                    {addingId === c.id ? (
                      renderAddInput(c.id, c.label)
                    ) : (
                      <TouchableOpacity onPress={() => startAdd(c.id, c.monthly)} activeOpacity={0.7}>
                        <Text style={styles.mpRowAmt}>{money(c.monthly)}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => removeCommit(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={`remove ${c.label}`} accessibilityRole="button">
                      <Feather name="x" size={14} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}

                {subscriptionCommitments.length > 0 && (
                  <View style={styles.mpRow}>
                    <Feather name="repeat" size={13} color={C.textMuted} />
                    <Text style={[styles.mpRowLabel, { marginLeft: SPACING.xs }]}>{tp.subsAuto.replace('{{n}}', String(subscriptionCommitments.length))}</Text>
                    <Text style={styles.mpRowAmt}>{money(subsTotal)}</Text>
                  </View>
                )}

                <View style={styles.mpChips}>
                  {presetChips.map((p) =>
                    addingId === p.id ? (
                      <View key={p.id}>{renderAddInput(p.id, p.label)}</View>
                    ) : (
                      <TouchableOpacity key={p.id} style={styles.mpChip} onPress={() => startAdd(p.id)} activeOpacity={0.8} accessibilityRole="button">
                        <Feather name="plus" size={12} color={C.accent} />
                        <Text style={styles.mpChipText}>{p.label}</Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>

                {debtChips.length > 0 && (
                  <>
                    <Text style={styles.mpDebtTitle}>{tp.debtsTitle}</Text>
                    <View style={styles.mpChips}>
                      {debtChips.map((d) =>
                        addingId === d.id ? (
                          <View key={d.id}>{renderAddInput(d.id, d.label)}</View>
                        ) : (
                          <TouchableOpacity key={d.id} style={styles.mpDebtChip} onPress={() => startAdd(d.id)} activeOpacity={0.8} accessibilityRole="button">
                            <Feather name="plus" size={12} color={C.bronze} />
                            <Text style={styles.mpDebtChipText} numberOfLines={1}>{d.label}</Text>
                          </TouchableOpacity>
                        ),
                      )}
                    </View>
                  </>
                )}
              </View>

              {/* reality check — Belanjawanku cost-of-living, calm + honest */}
              <View style={[styles.realityCard, { backgroundColor: withAlpha(realityColor, 0.07), borderColor: withAlpha(realityColor, 0.16) }]}>
                <Feather name="compass" size={14} color={realityColor} />
                <Text style={styles.realityText}>{plan.realityCheck.message}</Text>
              </View>

              {/* Echo's reason */}
              <View style={styles.reasonCard}>
                <Text style={styles.eyebrow}>{tp.echoPicks}</Text>
                <Text style={styles.reason}>{plan.reason}</Text>
              </View>

              {/* 3-row headline with thin bars */}
              <View style={styles.headlineCard}>
                {headline.map((h) => (
                  <View key={h.label} style={styles.hRow}>
                    <Text style={styles.hLabel}>{h.label}</Text>
                    <View style={styles.hBarTrack}>
                      <View style={[styles.hBarFill, { width: `${Math.min(100, (h.amount / barBase) * 100)}%`, backgroundColor: h.color }]} />
                    </View>
                    <Text style={styles.hAmount}>{money(h.amount)}</Text>
                  </View>
                ))}
              </View>

              {/* where the set-aside goes — cushion / grow / your goals */}
              {plan.setAside > 0 && (
                <Text style={styles.breakdown}>
                  {`${tp.setAsideGoes}: ${tp.cushion} ${money(plan.setAsideBreakdown.cushion)}`}
                  {plan.setAsideBreakdown.grow > 0 ? ` · ${tp.grow} ${money(plan.setAsideBreakdown.grow)}` : ''}
                  {activeGoals.length > 0 ? ` · ${tp.goalsToward} ${activeGoals.map((g) => g.name).join(', ')}` : ''}
                </Text>
              )}

              {/* model chips — suggest-then-decide */}
              <View style={styles.chipOuter}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chipRow}>
                  {BUDGET_MODELS.map((m) => {
                    const active = m.id === activeModel;
                    const isRec = plan.recommendedId === m.id;
                    const isRunner = plan.runnerUpId === m.id;
                    return (
                      <TouchableOpacity key={m.id} style={[styles.chip, active && styles.chipActive]} onPress={() => switchModel(m.id)} activeOpacity={0.85}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label}</Text>
                        {isRec ? <Text style={[styles.chipTag, active && styles.chipTagActive]}>{tp.echoPicks}</Text> : isRunner ? <View style={styles.runnerDot} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <LinearGradient colors={[withAlpha(C.surface, 0), C.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chipFade} pointerEvents="none" />
              </View>
              <Text style={styles.switchHint}>{tp.switchHint}</Text>

              {/* critic's honest notes — the differentiator */}
              {plan.notes.length > 0 && (
                <View style={styles.notesWrap}>
                  <Text style={styles.notesTitle}>{tp.notesTitle}</Text>
                  {plan.notes.map((n, i) => (
                    <View key={i} style={styles.noteRow}>
                      <Feather name="info" size={13} color={n.serious ? C.bronze : C.textMuted} style={{ marginTop: 2 }} />
                      <Text style={styles.noteText}>{n.nudge}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* per-category spending budgets — inline editable */}
              <View style={styles.listCard}>
                {displayRows.map((r) => {
                  const cat = catMap[r.category];
                  const isEditing = editingCat === r.category;
                  return (
                    <View key={r.category} style={styles.catRow}>
                      <View style={styles.catIconWrap}>
                        {cat ? <CategoryIcon icon={cat.icon} size={18} color={cat.color} /> : <Feather name="circle" size={16} color={C.textMuted} />}
                      </View>
                      <View style={styles.catMid}>
                        <Text style={styles.catName}>{cat?.name ?? r.category}</Text>
                        {r.trailingAvg > 0 && <Text style={styles.catAnchor}>{`${tp.spentPrefix}${money(r.trailingAvg)}${tp.perMo}`}</Text>}
                      </View>
                      {isEditing ? (
                        <TextInput
                          style={styles.catInput}
                          value={catBuf}
                          onChangeText={setCatBuf}
                          keyboardType="number-pad"
                          autoFocus
                          onBlur={commitCat}
                          onSubmitEditing={commitCat}
                          selectionColor={withAlpha(C.accent, 0.25)}
                          keyboardAppearance={isDark ? 'dark' : 'light'}
                        />
                      ) : (
                        <TouchableOpacity onPress={() => startEditCat(r.category, r.amount)} activeOpacity={0.7} style={styles.catAmountWrap}>
                          <Text style={styles.catAmount}>{money(r.amount)}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* running total — calm, never red */}
              <View style={styles.totalRow}>
                <Text style={styles.totalText}>{`${tp.leftToSpend} ${money(plan.leftToSpend)} · ${tp.allocated} ${money(allocated)}`}</Text>
                <Text style={[styles.toAssign, { color: toAssign === 0 ? C.accent : C.bronze }]}>
                  {`${money(Math.abs(toAssign))} ${toAssign < 0 ? tp.over : tp.toAssign}`}
                </Text>
              </View>

              {roughStart && <Text style={styles.roughNote}>{tp.roughNote}</Text>}
            </View>
          ) : (
            <Text style={styles.roughNote}>{tp.roughNote}</Text>
          )}
        </ScrollView>

        {plan && !needBand && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.createBtn, buildable.length === 0 && styles.createBtnOff]}
              onPress={apply}
              disabled={buildable.length === 0}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Feather name="check" size={16} color={buildable.length === 0 ? C.textMuted : C.onAccent} />
              <Text style={[styles.createText, buildable.length === 0 && { color: C.textMuted }]}>
                {buildable.length === 0 ? tp.allSet : `${tp.createCta} · ${buildable.length}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </BottomSheet>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    bounds: { flexShrink: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
    header: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    title: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, letterSpacing: -0.2 },
    sub: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, marginTop: 2 },

    scroll: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xs, paddingBottom: SPACING.lg },

    askPrompt: { fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.medium, marginBottom: SPACING.md },
    bandWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    bandChip: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: withAlpha(C.accent, 0.08), borderWidth: 1, borderColor: withAlpha(C.accent, 0.16) },
    bandText: { fontSize: TYPOGRAPHY.size.sm, color: C.accent, fontWeight: TYPOGRAPHY.weight.semibold },

    incomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm },
    incomeLabel: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.medium },
    incomeValRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    incomeVal: { fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.bold, fontVariant: ['tabular-nums'] },
    incomeInput: { fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.bold, minWidth: 90, textAlign: 'right', padding: 0, borderBottomWidth: 1, borderColor: withAlpha(C.accent, 0.3) },

    // must-pays
    mpCard: { marginTop: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: withAlpha(C.bronze, 0.05), borderWidth: 1, borderColor: withAlpha(C.bronze, 0.14) },
    mpTitle: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary },
    mpHint: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginTop: 2, marginBottom: SPACING.sm },
    mpRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
    mpRowLabel: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary },
    mpRowAmt: { fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.bold, fontVariant: ['tabular-nums'] },
    mpChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
    mpChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 6, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.full, backgroundColor: withAlpha(C.accent, 0.08), borderWidth: 1, borderColor: withAlpha(C.accent, 0.18) },
    mpChipText: { fontSize: TYPOGRAPHY.size.xs, color: C.accent, fontWeight: TYPOGRAPHY.weight.semibold },
    mpDebtTitle: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginTop: SPACING.md, fontWeight: TYPOGRAPHY.weight.medium },
    mpDebtChip: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 180, paddingVertical: 6, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.full, backgroundColor: withAlpha(C.bronze, 0.08), borderWidth: 1, borderColor: withAlpha(C.bronze, 0.2) },
    mpDebtChipText: { fontSize: TYPOGRAPHY.size.xs, color: C.bronze, fontWeight: TYPOGRAPHY.weight.semibold, flexShrink: 1 },
    mpAddInput: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.full, borderWidth: 1, borderColor: withAlpha(C.accent, 0.4), backgroundColor: withAlpha(C.accent, 0.06) },
    mpCur: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary },
    mpInput: { fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.semibold, minWidth: 56, padding: 0 },

    // reality check
    realityCard: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginTop: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1 },
    realityText: { flex: 1, fontSize: TYPOGRAPHY.size.xs, color: C.textPrimary, lineHeight: 18 },

    // reason
    reasonCard: { backgroundColor: withAlpha(C.accent, 0.06), borderRadius: RADIUS.lg, padding: SPACING.md, marginTop: SPACING.md },
    eyebrow: { fontSize: TYPOGRAPHY.size.xs, color: C.accent, fontWeight: TYPOGRAPHY.weight.bold, letterSpacing: 0.4, textTransform: 'lowercase', marginBottom: 3 },
    reason: { fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, lineHeight: 20 },

    // headline
    headlineCard: { marginTop: SPACING.lg, gap: SPACING.md },
    hRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
    hLabel: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, width: 92 },
    hBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: withAlpha(C.textPrimary, 0.06), overflow: 'hidden' },
    hBarFill: { height: 6, borderRadius: 3 },
    hAmount: { fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.bold, fontVariant: ['tabular-nums'], width: 92, textAlign: 'right' },
    breakdown: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: SPACING.sm },

    // chips
    chipOuter: { position: 'relative', marginTop: SPACING.xl, marginRight: -SPACING.xl },
    chipRow: { gap: SPACING.sm, paddingRight: SPACING.xl + 40 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.full, backgroundColor: withAlpha(C.textPrimary, 0.05), borderWidth: 1, borderColor: 'transparent' },
    chipActive: { backgroundColor: withAlpha(C.accent, 0.12), borderColor: withAlpha(C.accent, 0.4) },
    chipText: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.medium },
    chipTextActive: { color: C.accent, fontWeight: TYPOGRAPHY.weight.semibold },
    chipTag: { fontSize: 9, color: C.textMuted, fontWeight: TYPOGRAPHY.weight.bold, letterSpacing: 0.3, backgroundColor: withAlpha(C.textPrimary, 0.06), paddingHorizontal: 5, paddingVertical: 1, borderRadius: RADIUS.sm, overflow: 'hidden' },
    chipTagActive: { color: C.accent, backgroundColor: withAlpha(C.accent, 0.14) },
    runnerDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: withAlpha(C.bronze, 0.7) },
    chipFade: { position: 'absolute', right: SPACING.xl, top: 0, bottom: 0, width: 40 },
    switchHint: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: SPACING.sm },

    // critic notes
    notesWrap: { marginTop: SPACING.lg, gap: SPACING.sm },
    notesTitle: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.bold, letterSpacing: 0.3, textTransform: 'lowercase' },
    noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
    noteText: { flex: 1, fontSize: TYPOGRAPHY.size.xs, color: C.textPrimary, lineHeight: 18 },

    // category list
    listCard: { marginTop: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: withAlpha(C.textPrimary, 0.06), overflow: 'hidden' },
    catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: withAlpha(C.textPrimary, 0.06) },
    catIconWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(C.textPrimary, 0.04) },
    catMid: { flex: 1, marginLeft: SPACING.md },
    catName: { fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.medium },
    catAnchor: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 1 },
    catAmountWrap: { paddingVertical: 4, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.sm, backgroundColor: withAlpha(C.accent, 0.06) },
    catAmount: { fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.bold, fontVariant: ['tabular-nums'] },
    catInput: { fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.bold, minWidth: 80, textAlign: 'right', padding: 4, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: withAlpha(C.accent, 0.3) },

    totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md, flexWrap: 'wrap', gap: SPACING.xs },
    totalText: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary },
    toAssign: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold },

    roughNote: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: SPACING.md, fontStyle: 'italic' },

    footer: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.md },
    createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: C.accent, ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.sm) },
    createBtnOff: { backgroundColor: withAlpha(C.textPrimary, 0.06) },
    createText: { fontSize: TYPOGRAPHY.size.base, color: C.onAccent, fontWeight: TYPOGRAPHY.weight.semibold },
  });

export default BudgetPlannerSheet;
