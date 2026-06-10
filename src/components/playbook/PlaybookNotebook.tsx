import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Modal,
  TouchableOpacity,
  Pressable,
  Alert,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  InputAccessoryView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlaybookStore } from '../../store/playbookStore';
import { usePersonalStore } from '../../store/personalStore';
import { Playbook, PlaybookLineItem } from '../../types';
import { computePlaybookStats, computeNotebookStats, computeLiveStats, computeSpendingReality, computePlanVsActual, SpendingCategoryItem, PlanVsActualRow } from '../../utils/playbookStats';
import { roundMoney } from '../../utils/money';
import { getPlaybookObligations, PlaybookObligation } from '../../utils/playbookObligations';
import { lightTap, selectionChanged, mediumTap } from '../../services/haptics';
import { askEchoPlan, chatWithEcho, getPlaybookInsight, buildEchoMemoryEntry, getPlanInputSummary, EchoPlanResponse } from '../../services/playbookAI';
import { isGeminiAvailable } from '../../services/geminiClient';
import { useCategories } from '../../hooks/useCategories';
import CircularProgress from '../common/CircularProgress';
import BottomSheet from '../common/BottomSheet';

// ─── Types ───────────────────────────────────────────────────

interface Props {
  playbook: Playbook;
  readOnly?: boolean;
  onClose: () => void;
  onNavigate?: (screen: string, params?: Record<string, any>) => void;
  initialOblExpanded?: boolean;
}

type GroupPos = 'first' | 'middle' | 'last' | 'only';

type SectionItem =
  | { type: 'hero'; key: string }
  | { type: 'closeoutSummary'; key: string }
  | { type: 'sectionHeader'; key: string; title: string; count?: number; amount?: number }
  | { type: 'obligation'; key: string; data: PlaybookObligation; groupPos: GroupPos }
  | { type: 'lineItem'; key: string; data: PlaybookLineItem; groupPos: GroupPos }
  | { type: 'addItem'; key: string; grouped?: boolean }
  | { type: 'spendingRow'; key: string; data: SpendingCategoryItem; groupPos: GroupPos }
  | { type: 'aiInsight'; key: string; text: string }
  | { type: 'planAnchor'; key: string; amount: number }
  | { type: 'quickNote'; key: string }
  | { type: 'emptyPlan'; key: string }
  | { type: 'spacer'; key: string };

// Turn 0 intent chips — what the user wants from this money, in their own words.
// `intent` is sent to Echo; `bubble` is shown back as the user's own message.
const ECHO_INTENTS: { key: string; chip: string; intent: string; bubble: string }[] = [
  { key: 'last', chip: 'just make it last', intent: 'just make it last till month-end', bubble: 'just make it last' },
  { key: 'bills', chip: 'rent/bills scare me', intent: 'rent and bills scare me — make sure those are safe first', bubble: 'rent/bills scare me' },
  { key: 'save', chip: 'save a bit', intent: 'i want to save a little if i can', bubble: 'save a bit' },
  { key: 'lead', chip: 'you decide', intent: 'you decide — i want you to lead', bubble: 'you decide' },
];

// Seeded follow-up chips for Turn 3 (co-own). Tapping sends the text to Echo chat.
const ECHO_FOLLOWUPS: string[] = ['can i save a bit more?', 'why this much?', "what if it's a tight month?"];

// ─── Memoized Sub-Components ─────────────────────────────────

const ObligationRow = React.memo(({
  item, currency, C, readOnly, onToggle, onTap, groupPos = 'only',
}: {
  item: PlaybookObligation; currency: string; C: typeof CALM; readOnly: boolean; onToggle: () => void; onTap?: () => void; groupPos?: GroupPos;
}) => {
  const styles = useMemo(() => makeStyles(C), [C]);
  const showDivider = groupPos === 'middle' || groupPos === 'last';
  // Lead tile doubles as the "set aside" checkbox (matches the plan line-item tick):
  // an empty circle to tick, a filled check once set aside. Color still signals the
  // type — subscriptions read olive, debts bronze.
  const tileColor = item.type === 'subscription' ? C.accent : C.bronze;
  return (
    <View style={groupCardStyle(C, groupPos)}>
      {showDivider && <View style={dividerStyle(C, SPACING.md + 40 + SPACING.md)} />}
      <TouchableOpacity
        activeOpacity={onTap ? 0.7 : 1}
        onPress={onTap}
        accessibilityRole="button"
        accessibilityLabel={`${item.label}, ${currency} ${item.amount.toLocaleString('en-MY')}${item.isCovered ? ', covered' : ''}`}
        style={[styles.tileRow, item.isCovered && { backgroundColor: withAlpha(C.accent, 0.03) }]}
      >
      <TouchableOpacity
        onPress={readOnly ? undefined : onToggle}
        disabled={readOnly}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={item.isCovered ? `${item.label}, covered` : `mark ${item.label} as covered`}
      >
        <View style={[
          styles.leadTile,
          { backgroundColor: withAlpha(tileColor, item.isCovered ? 0.16 : 0.1) },
        ]}>
          {item.isCovered
            ? <Feather name="check" size={18} color={tileColor} />
            : <Feather name="circle" size={16} color={withAlpha(tileColor, 0.55)} />}
        </View>
      </TouchableOpacity>
      <View style={styles.tileContent}>
        <Text style={[styles.tileTitle, item.isCovered && styles.oblLabelCovered, { color: item.isCovered ? C.textMuted : C.textPrimary }]} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={[styles.tileSubtitle, { color: C.textMuted }]} numberOfLines={1}>
          {item.type === 'subscription' ? 'subscription' : 'debt'} · {item.meta}
        </Text>
      </View>
      <Text style={[styles.tileValue, { color: item.isCovered ? C.textMuted : C.textPrimary }]}>
        {currency} {item.amount.toLocaleString('en-MY')}
      </Text>
      {onTap && <Feather name="chevron-right" size={16} color={withAlpha(C.textMuted, 0.35)} style={{ marginLeft: SPACING.xs }} />}
      </TouchableOpacity>
    </View>
  );
});

const LineItemRow = React.memo(({
  item, currency, C, readOnly, categoryColor, committedAmount, actualSpent,
  selectionMode, isSelected, onTogglePaid, onPress, onLongPress, groupPos = 'only',
}: {
  item: PlaybookLineItem; currency: string; C: typeof CALM; readOnly: boolean;
  categoryColor?: string; committedAmount?: number; actualSpent?: number;
  selectionMode: boolean; isSelected: boolean;
  onTogglePaid: () => void; onPress: () => void; onLongPress: () => void; groupPos?: GroupPos;
}) => {
  const styles = useMemo(() => makeStyles(C), [C]);
  const showDivider = groupPos === 'middle' || groupPos === 'last';
  // Actual-vs-planned: DERIVED from explicitly-linked expenses (by category) first;
  // fall back to covered-obligation total, then to plan amount alone.
  const progressAmount = (actualSpent && actualSpent > 0)
    ? actualSpent
    : (committedAmount && committedAmount > 0 ? committedAmount : 0);
  const isOver = progressAmount > item.plannedAmount;
  // done = real spend met/exceeded the plan, OR the user manually confirmed it.
  const done = (item.plannedAmount > 0 && progressAmount >= item.plannedAmount) || item.isPaid;
  const showDone = selectionMode ? isSelected : done;
  // Lead tile color: the item's category color if present, else accent; bronze when
  // actual ran over the plan (never red). A funded/done bucket reads as a filled
  // tinted tile with a check — calm, not a hollow to-do ring.
  const tileColor = isOver ? C.bronze : (categoryColor || C.accent);
  const filled = showDone;
  return (
    <View style={groupCardStyle(C, groupPos)}>
      {showDivider && <View style={dividerStyle(C, SPACING.md + 40 + SPACING.md)} />}
      <Pressable
      style={[styles.tileRow, done && !selectionMode && { backgroundColor: withAlpha(C.accent, 0.03) }, isSelected && { backgroundColor: withAlpha(C.accent, 0.08) }]}
      onPress={readOnly ? undefined : onPress}
      onLongPress={readOnly ? undefined : onLongPress}
      delayLongPress={400}
      disabled={readOnly}
      accessibilityRole="button"
      accessibilityLabel={progressAmount > 0
        ? `${item.label}, spent ${currency} ${Math.round(progressAmount).toLocaleString('en-MY')} of ${currency} ${Math.round(item.plannedAmount).toLocaleString('en-MY')} planned${isOver ? ', over plan' : ''}${done ? ', done' : ''}`
        : `${item.label}, ${currency} ${Math.round(item.plannedAmount).toLocaleString('en-MY')} planned${done ? ', done' : ''}`}
    >
      <TouchableOpacity
        onPress={readOnly ? undefined : (selectionMode ? onPress : onTogglePaid)}
        disabled={readOnly}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole={selectionMode ? 'checkbox' : 'button'}
        accessibilityState={selectionMode ? { checked: isSelected } : undefined}
        accessibilityLabel={selectionMode
          ? `select ${item.label}`
          : (done ? `${item.label}, set aside / done` : `mark ${item.label} as set aside / done`)}
      >
        <View style={[
          styles.leadTile,
          { backgroundColor: withAlpha(tileColor, (selectionMode ? isSelected : filled) ? 0.18 : 0.1) },
        ]}>
          {selectionMode ? (
            isSelected
              ? <Feather name="check" size={18} color={tileColor} />
              : <View style={[styles.tileDot, { backgroundColor: withAlpha(tileColor, 0.5) }]} />
          ) : filled ? (
            <Feather name="check" size={18} color={tileColor} />
          ) : (
            <Feather name="circle" size={16} color={withAlpha(tileColor, 0.55)} />
          )}
        </View>
      </TouchableOpacity>
      <View style={styles.tileContent}>
        <Text
          style={[styles.tileTitle, done && !selectionMode && styles.lineLabelPaid, { color: done && !selectionMode ? C.textMuted : C.textPrimary }]}
          numberOfLines={1}
        >
          {item.label}
        </Text>
        {progressAmount > 0 && (
          <Text style={[styles.tileSubtitle, { color: C.textMuted }]} numberOfLines={1}>
            of {currency} {Math.round(item.plannedAmount).toLocaleString('en-MY')} planned
          </Text>
        )}
      </View>
      <Text style={[styles.tileValue, { color: done && !selectionMode ? C.textMuted : (isOver ? C.bronze : C.textPrimary) }]}>
        {currency} {Math.round(progressAmount > 0 ? progressAmount : item.plannedAmount).toLocaleString('en-MY')}
      </Text>
      </Pressable>
    </View>
  );
});

const SpendingRow = React.memo(({
  item, currency, C, catColor, groupPos = 'only',
}: {
  item: SpendingCategoryItem; currency: string; C: typeof CALM; catColor?: string; groupPos?: GroupPos;
}) => {
  const styles = useMemo(() => makeStyles(C), [C]);
  const isOver = item.allocatedAmount != null && item.spent > item.allocatedAmount;
  const showDivider = groupPos === 'middle' || groupPos === 'last';
  const tileColor = catColor || C.accent;
  return (
    <View style={groupCardStyle(C, groupPos)}>
      {showDivider && <View style={dividerStyle(C, SPACING.md + 40 + SPACING.md)} />}
      <View style={styles.tileRow}>
      <View style={[styles.leadTile, { backgroundColor: withAlpha(tileColor, 0.1) }]}>
        <Feather name="shopping-bag" size={17} color={tileColor} />
      </View>
      <View style={styles.tileContent}>
        <Text style={[styles.tileTitle, { color: C.textPrimary }]} numberOfLines={1}>{item.category}</Text>
        {!item.isPlanned && (
          <Text style={[styles.tileSubtitle, { color: C.bronze }]} numberOfLines={1}>unplanned</Text>
        )}
      </View>
      <View style={styles.spendRight}>
        {item.allocatedAmount != null ? (
          <Text style={[styles.tileValue, { color: isOver ? C.bronze : C.textPrimary }]}>
            {currency} {Math.round(item.spent).toLocaleString('en-MY')}
            <Text style={{ color: C.textMuted }}> / {Math.round(item.allocatedAmount).toLocaleString('en-MY')}</Text>
          </Text>
        ) : (
          <Text style={[styles.tileValue, { color: C.textPrimary }]}>{currency} {Math.round(item.spent).toLocaleString('en-MY')}</Text>
        )}
      </View>
      </View>
    </View>
  );
});

// Close-out "where the money went" row — planned vs actual per category.
// Reuses the SpendingRow visual system (grouped surface, dot, tabular amounts).
// over = C.bronze (never red); under = muted. Calm, no scolding.
const CloseoutRow = React.memo(({
  row, currency, C, catColor, groupPos = 'only',
}: {
  row: PlanVsActualRow; currency: string; C: typeof CALM; catColor?: string; groupPos?: GroupPos;
}) => {
  const styles = useMemo(() => makeStyles(C), [C]);
  const isOver = row.actual > row.planned;
  const delta = roundMoney(Math.abs(row.actual - row.planned));
  const showDivider = groupPos === 'middle' || groupPos === 'last';
  const tileColor = isOver && row.planned > 0 ? C.bronze : (catColor || C.accent);
  return (
    <View style={groupCardStyle(C, groupPos)}>
      {showDivider && <View style={dividerStyle(C, SPACING.md + 40 + SPACING.md)} />}
      <View
        style={styles.tileRow}
        accessibilityRole="text"
        accessibilityLabel={`${row.category}, spent ${currency} ${Math.round(row.actual).toLocaleString('en-MY')} of ${currency} ${Math.round(row.planned).toLocaleString('en-MY')} planned${row.planned > 0 ? (isOver ? `, ${currency} ${Math.round(delta).toLocaleString('en-MY')} over` : `, ${currency} ${Math.round(delta).toLocaleString('en-MY')} under`) : ''}`}
      >
        <View style={[styles.leadTile, { backgroundColor: withAlpha(tileColor, 0.1) }]}>
          <Feather name="shopping-bag" size={17} color={tileColor} />
        </View>
        <View style={styles.tileContent}>
          <Text style={[styles.tileTitle, { color: C.textPrimary }]} numberOfLines={1}>{row.category}</Text>
          {row.planned > 0 ? (
            <Text style={[styles.tileSubtitle, { color: isOver ? C.bronze : C.textMuted }]} numberOfLines={1}>
              {isOver ? 'over' : 'under'} {currency} {Math.round(delta).toLocaleString('en-MY')}
            </Text>
          ) : (
            <Text style={[styles.tileSubtitle, { color: C.bronze }]} numberOfLines={1}>unplanned</Text>
          )}
        </View>
        <View style={styles.spendRight}>
          <Text style={[styles.tileValue, { color: isOver && row.planned > 0 ? C.bronze : C.textPrimary }]}>
            {currency} {Math.round(row.actual).toLocaleString('en-MY')}
            {row.planned > 0 && (
              <Text style={{ color: C.textMuted }}> / {Math.round(row.planned).toLocaleString('en-MY')}</Text>
            )}
          </Text>
        </View>
      </View>
    </View>
  );
});

// ─── Group card helpers (build a single grouped surface from consecutive rows) ──

const groupCardStyle = (C: typeof CALM, pos: GroupPos) => {
  const isDark = C === CALM_DARK;
  const base: any = {
    backgroundColor: C.surface,
    borderColor: withAlpha(C.textPrimary, isDark ? 0.1 : 0.06),
    borderLeftWidth: 1,
    borderRightWidth: 1,
  };
  if (pos === 'first' || pos === 'last' || pos === 'only') {
    base.overflow = 'hidden';
  }
  if (pos === 'first' || pos === 'only') {
    base.borderTopWidth = 1;
    base.borderTopLeftRadius = RADIUS.xl;
    base.borderTopRightRadius = RADIUS.xl;
    Object.assign(base, isDark ? SHADOWS.none : SHADOWS.xs);
  }
  if (pos === 'last' || pos === 'only') {
    base.borderBottomWidth = 1;
    base.borderBottomLeftRadius = RADIUS.xl;
    base.borderBottomRightRadius = RADIUS.xl;
    base.marginBottom = SPACING.md;
  }
  return base;
};

const dividerStyle = (C: typeof CALM, leftInset: number) => ({
  height: StyleSheet.hairlineWidth,
  backgroundColor: withAlpha(C.textPrimary, 0.06),
  marginLeft: leftInset,
});

// ─── Main Component ──────────────────────────────────────────

const PlaybookNotebook: React.FC<Props> = ({ playbook, readOnly = false, onClose, onNavigate, initialOblExpanded = false }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);
  const insets = useSafeAreaInsets();
  const store = usePlaybookStore;
  const expenseCategories = useCategories('expense');

  // Reactive playbook data
  const livePb = usePlaybookStore((s) => s.playbooks.find((p) => p.id === playbook.id)) ?? playbook;
  const transactions = usePersonalStore((s) => s.transactions);

  // Line items
  const lineItems = useMemo(
    () => [...(livePb.lineItems || [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [livePb.lineItems],
  );

  // Stats
  const pbStats = useMemo(() => computePlaybookStats(livePb, transactions), [livePb, transactions]);
  const liveStats = useMemo(() => computeLiveStats(livePb, pbStats), [livePb, pbStats]);
  const nbStats = useMemo(() => computeNotebookStats(lineItems), [lineItems]);
  const spendingReality = useMemo(() => computeSpendingReality(livePb, transactions), [livePb, transactions]);

  // Plain-language summary of what Echo's plan is based on (transparency for the user)
  const echoInputs = useMemo(() => getPlanInputSummary(livePb), [livePb, transactions]);

  // Obligations
  const obligations = useMemo(
    () => getPlaybookObligations(livePb, livePb.coveredObligationIds || []),
    [livePb],
  );

  // Model A: obligations are COMMITTED money (checklist only). The plan allocates
  // only what's LEFT after them — this is the discretionary envelope the plan fills.
  const freeAfterObligations = useMemo(
    () => Math.max(0, livePb.sourceAmount - obligations.totalAmount),
    [livePb.sourceAmount, obligations.totalAmount],
  );

  // Category helper
  const getCatInfo = useCallback((catId?: string) => {
    if (!catId) return undefined;
    return expenseCategories.find((c) => c.id === catId);
  }, [expenseCategories]);

  // Auto-match label to category
  const matchCategory = useCallback((label: string): string | undefined => {
    const l = label.trim().toLowerCase();
    if (!l) return undefined;
    // Exact ID match first
    const exact = expenseCategories.find((c) => c.id === l);
    if (exact) return exact.id;
    // Name starts with label
    const matches = expenseCategories.filter((c) => c.name.toLowerCase().startsWith(l));
    if (matches.length === 1) return matches[0].id;
    return undefined;
  }, [expenseCategories]);

  // Committed amounts from covered obligations per line item
  const committedByLineItem = useMemo(() => {
    const map: Record<string, number> = {};
    const coveredObls = obligations.items.filter((o) => o.isCovered);
    const claimedOblIds = new Set<string>();

    // 1. Explicit linkedObligationIds (from AI suggestions)
    for (const li of lineItems) {
      if (!li.linkedObligationIds?.length) continue;
      const idSet = new Set(li.linkedObligationIds);
      let total = 0;
      for (const obl of coveredObls) {
        if (idSet.has(obl.id)) {
          total += obl.amount;
          claimedOblIds.add(obl.id);
        }
      }
      if (total > 0) map[li.id] = total;
    }

    // 2. Category fallback for items without explicit links
    for (const li of lineItems) {
      if (li.linkedObligationIds?.length) continue;
      const cat = li.category || matchCategory(li.label);
      if (!cat) continue;
      let total = 0;
      for (const obl of coveredObls) {
        if (!claimedOblIds.has(obl.id) && obl.category === cat) {
          total += obl.amount;
        }
      }
      if (total > 0) map[li.id] = total;
    }

    return map;
  }, [obligations, lineItems, matchCategory]);

  // Plan-vs-actual per category, DERIVED from explicitly-linked expenses.
  // Powers both the active line-item "actual / planned" and the close-out summary.
  const planVsActual = useMemo(
    () => computePlanVsActual(livePb, transactions),
    [livePb, transactions],
  );

  // category (lowercased) → actual spent, for quick line-item lookup
  const actualByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of planVsActual) {
      map[row.category.toLowerCase()] = row.actual;
    }
    return map;
  }, [planVsActual]);

  // Resolve each line item's DERIVED actual: sum of linked-expense amounts for
  // that item's category (split evenly when several items share one category).
  const actualByLineItem = useMemo(() => {
    const map: Record<string, number> = {};
    // count how many line items map to each category so a shared category's
    // actual isn't double-counted across rows
    const itemsPerCat: Record<string, number> = {};
    for (const li of lineItems) {
      const cat = (li.category || matchCategory(li.label))?.toLowerCase();
      if (!cat) continue;
      itemsPerCat[cat] = (itemsPerCat[cat] || 0) + 1;
    }
    for (const li of lineItems) {
      const cat = (li.category || matchCategory(li.label))?.toLowerCase();
      if (!cat) continue;
      const catActual = actualByCategory[cat];
      if (!catActual) continue;
      map[li.id] = roundMoney(catActual / (itemsPerCat[cat] || 1));
    }
    return map;
  }, [lineItems, actualByCategory, matchCategory]);

  // Selection mode (bulk delete)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Float edit modal
  const [editModalItem, setEditModalItem] = useState<PlaybookLineItem | null>(null);
  const [editModalLabel, setEditModalLabel] = useState('');
  const [editModalAmount, setEditModalAmount] = useState('');

  // Add-row state
  const [addLabel, setAddLabel] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const addLabelRef = useRef<TextInput>(null);
  const addAmountRef = useRef<TextInput>(null);

  // Obligations bottom sheet
  const [oblModalVisible, setOblModalVisible] = useState(initialOblExpanded);

  // Manual "your plan" editor float modal (manual counterpart to the Echo conversation)
  const [planEditorVisible, setPlanEditorVisible] = useState(false);

  // Quick note state
  const [noteText, setNoteText] = useState(livePb.notebookNote || '');

  // AI state
  const [aiLoading, setAiLoading] = useState(false);
  const [echoPlan, setEchoPlan] = useState<EchoPlanResponse | null>(null);
  const [echoModalVisible, setEchoModalVisible] = useState(false);
  const [echoSelected, setEchoSelected] = useState<boolean[]>([]);
  const [aiInsight, setAiInsight] = useState('');
  const [aiError, setAiError] = useState('');
  const [echoMessages, setEchoMessages] = useState<{ role: 'user' | 'echo'; text: string }[]>([]);
  const [echoChatInput, setEchoChatInput] = useState('');
  const [echoChatLoading, setEchoChatLoading] = useState(false);
  const echoScrollRef = useRef<ScrollView>(null);

  // ── Echo conversation state (turn-based, chip-driven) ──
  // turn 0 = pick intent · 1 = reflect + "what i looked at" · 2 = plan streams in · 3 = co-own
  const [echoTurn, setEchoTurn] = useState<0 | 1 | 2 | 3>(0);
  const [echoIntent, setEchoIntent] = useState<string>('');            // user's chosen words / intent
  const [echoIntentLabel, setEchoIntentLabel] = useState<string>('');  // what to show as their bubble
  const [echoSteady, setEchoSteady] = useState<boolean | undefined>(undefined);
  const [echoFreeText, setEchoFreeText] = useState('');                // "or tell me…" escape hatch
  const [echoInputsShown, setEchoInputsShown] = useState(0);           // how many "what i looked at" lines have landed
  const [echoItemsShown, setEchoItemsShown] = useState(0);             // how many plan items have streamed in
  const [echoAmounts, setEchoAmounts] = useState<number[]>([]);        // local, steerable amounts (per item)
  const [echoEditingIdx, setEchoEditingIdx] = useState<number | null>(null); // item whose amount is being typed
  const [echoEditBuffer, setEchoEditBuffer] = useState('');            // inline number entry buffer
  const echoTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasAI = isGeminiAvailable();
  const insightFetched = useRef(false);

  // Auto-fetch AI insight when conditions met
  useEffect(() => {
    if (insightFetched.current || !hasAI || readOnly) return;
    if (liveStats.daysElapsed >= 3 && pbStats.linkedTransactionCount >= 3) {
      insightFetched.current = true;
      getPlaybookInsight(livePb).then((r) => {
        if (r.ok) setAiInsight(r.insight);
      });
    }
  }, [hasAI, readOnly, liveStats.daysElapsed, pbStats.linkedTransactionCount, livePb]);

  // Clear any pending Echo streaming timers on unmount.
  useEffect(() => () => { echoTimers.current.forEach(clearTimeout); echoTimers.current = []; }, []);

  // ─── Handlers ────────────────────────────────────────────

  const handleToggleCovered = useCallback((oblId: string) => {
    selectionChanged();
    store.getState().toggleObligationCovered(livePb.id, oblId);
  }, [livePb.id]);

  const handleObligationTap = useCallback((obl: PlaybookObligation) => {
    if (!onNavigate) return;
    lightTap();
    const screen = obl.type === 'subscription' ? 'SubscriptionList' : 'DebtTracking';
    // Strip 'sub-' or 'debt-' prefix to get the actual store ID
    const itemId = obl.sourceId.replace(/^(sub|debt)-/, '');
    onNavigate(screen, { highlightId: itemId });
  }, [onNavigate]);

  const handleTogglePaid = useCallback((itemId: string) => {
    selectionChanged();
    store.getState().toggleLineItemPaid(livePb.id, itemId);
  }, [livePb.id]);

  // Selection mode handlers
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleLongPress = useCallback((item: PlaybookLineItem) => {
    mediumTap();
    setSelectionMode(true);
    setSelectedIds(new Set([item.id]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    lightTap();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    Alert.alert(
      `remove ${count} item${count > 1 ? 's' : ''}?`,
      'this cannot be undone.',
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'remove', style: 'destructive', onPress: () => {
            selectedIds.forEach((id) => store.getState().removeLineItem(livePb.id, id));
            exitSelectionMode();
          },
        },
      ]
    );
  }, [selectedIds, livePb.id, exitSelectionMode]);

  const handleSelectionEdit = useCallback(() => {
    if (selectedIds.size !== 1) return;
    const id = Array.from(selectedIds)[0];
    const item = lineItems.find((li) => li.id === id);
    if (!item) return;
    exitSelectionMode();
    setEditModalItem(item);
    setEditModalLabel(item.label);
    setEditModalAmount((item.actualAmount ?? item.plannedAmount).toString());
  }, [selectedIds, lineItems, exitSelectionMode]);

  const handleEditModalSave = useCallback(() => {
    if (!editModalItem) return;
    const amt = parseFloat(editModalAmount) || 0;
    const trimmed = editModalLabel.trim() || 'untitled';
    const cat = matchCategory(trimmed);
    store.getState().updateLineItem(livePb.id, editModalItem.id, {
      label: trimmed,
      plannedAmount: amt,
      actualAmount: undefined,
      category: cat,
    });
    setEditModalItem(null);
  }, [editModalItem, editModalLabel, editModalAmount, livePb.id, matchCategory]);

  // Auto-link obligations by category when adding/accepting items
  const resolveLinkedObls = useCallback((cat?: string): string[] | undefined => {
    if (!cat) return undefined;
    const ids = obligations.items.filter((o) => o.category === cat).map((o) => o.id);
    return ids.length > 0 ? ids : undefined;
  }, [obligations]);

  const handleAddItem = useCallback(() => {
    const label = addLabel.trim();
    const amt = parseFloat(addAmount) || 0;
    if (!label) return;
    const cat = matchCategory(label);
    store.getState().addLineItem(livePb.id, { label, plannedAmount: amt, isPaid: false, category: cat, linkedObligationIds: resolveLinkedObls(cat) });
    setAddLabel('');
    setAddAmount('');
    lightTap();
    setTimeout(() => addLabelRef.current?.focus(), 50);
  }, [addLabel, addAmount, livePb.id, matchCategory, resolveLinkedObls]);

  const handleNoteSave = useCallback(() => {
    store.getState().updateNotebookNote(livePb.id, noteText);
  }, [livePb.id, noteText]);

  // Clear any pending streaming timers (call before re-streaming or on close).
  const clearEchoTimers = useCallback(() => {
    echoTimers.current.forEach(clearTimeout);
    echoTimers.current = [];
  }, []);

  // Reset the whole conversation back to Turn 0 (fresh opener + chips).
  const resetEchoConversation = useCallback(() => {
    clearEchoTimers();
    setEchoTurn(0);
    setEchoIntent('');
    setEchoIntentLabel('');
    setEchoSteady(undefined);
    setEchoFreeText('');
    setEchoInputsShown(0);
    setEchoItemsShown(0);
    setEchoAmounts([]);
    setEchoEditingIdx(null);
    setEchoEditBuffer('');
    setEchoMessages([]);
    setEchoChatInput('');
  }, [clearEchoTimers]);

  // Open the float. NO auto-fire — Turn 0 shows the opener + intent chips.
  // If a plan is already in hand, jump straight to the co-own turn.
  const handleAskEcho = useCallback(() => {
    lightTap();
    if (echoPlan && !aiLoading) {
      setEchoTurn(3);
      setEchoModalVisible(true);
      return;
    }
    resetEchoConversation();
    setAiError('');
    setEchoModalVisible(true);
  }, [echoPlan, aiLoading, resetEchoConversation]);

  // User picked an intent (or sent free text) → fire the plan request and start the
  // reflect beat. The "what i looked at" lines stream from LOCAL data immediately,
  // filling the API wait; the plan lands when the request resolves.
  const askEchoWithIntent = useCallback(async (intent: string, bubble: string) => {
    lightTap();
    clearEchoTimers();
    setEchoIntent(intent);
    setEchoIntentLabel(bubble);
    setEchoFreeText('');
    setEchoInputsShown(0);
    setEchoItemsShown(0);
    setEchoMessages([]);
    setEchoTurn(1);

    // Stream the "what i looked at" lines one at a time (~300ms), from local data.
    echoInputs.forEach((_, i) => {
      const t = setTimeout(() => {
        setEchoInputsShown((n) => Math.max(n, i + 1));
        lightTap();
      }, 300 * (i + 1));
      echoTimers.current.push(t);
    });

    setAiLoading(true);
    setAiError('');
    const result = await askEchoPlan(livePb, { intent, incomeSteady: echoSteady });
    setAiLoading(false);
    if (result.ok) {
      setEchoPlan(result.plan);
      setEchoSelected(result.plan.items.map(() => true));
      setEchoAmounts(result.plan.items.map((it) => it.amount));
      // Ensure every input line has landed before the plan reveals.
      setEchoInputsShown(echoInputs.length);
      setEchoItemsShown(0);
      setEchoTurn(2);
      selectionChanged();
      // Stream plan items one at a time (~300ms apart).
      result.plan.items.forEach((_, i) => {
        const t = setTimeout(() => {
          setEchoItemsShown((n) => Math.max(n, i + 1));
          lightTap();
        }, 300 * (i + 1));
        echoTimers.current.push(t);
      });
      // Once every item has landed, open Turn 3 (steer amounts + accept).
      const toTurn3 = setTimeout(() => setEchoTurn(3), 300 * (result.plan.items.length + 1));
      echoTimers.current.push(toTurn3);
    } else {
      setAiError(result.error);
      // Drop back to the chip turn so they can retry, no hard alert.
      setEchoTurn(0);
    }
  }, [livePb, echoSteady, echoInputs, clearEchoTimers]);

  const handlePickIntent = useCallback((intent: string, bubble: string) => {
    askEchoWithIntent(intent, bubble);
  }, [askEchoWithIntent]);

  const handleSendFreeIntent = useCallback(() => {
    const text = echoFreeText.trim();
    if (!text) return;
    askEchoWithIntent(text, text);
  }, [echoFreeText, askEchoWithIntent]);

  // Re-start the whole conversation (called from the float header).
  const handleReaskEcho = useCallback(() => {
    lightTap();
    setEchoPlan(null);
    resetEchoConversation();
  }, [resetEchoConversation]);

  const toggleEchoItem = useCallback((index: number) => {
    lightTap();
    setEchoSelected((prev) => prev.map((v, i) => i === index ? !v : v));
  }, []);

  // ── Local arithmetic for co-own nudges (NO API per tap) ──
  const nudgeEchoAmount = useCallback((index: number, delta: number) => {
    lightTap();
    setEchoAmounts((prev) => prev.map((v, i) => i === index ? Math.max(0, Math.round(v + delta)) : v));
  }, []);

  const startEditEchoAmount = useCallback((index: number, current: number) => {
    lightTap();
    setEchoEditingIdx(index);
    setEchoEditBuffer(current > 0 ? String(current) : '');
  }, []);

  const commitEditEchoAmount = useCallback(() => {
    setEchoEditingIdx((idx) => {
      if (idx === null) return null;
      const amt = Math.max(0, Math.round(parseFloat(echoEditBuffer) || 0));
      setEchoAmounts((prev) => prev.map((v, i) => i === idx ? amt : v));
      return null;
    });
    setEchoEditBuffer('');
  }, [echoEditBuffer]);

  // "set amount" on a needsInput item → open inline entry (starts blank).
  const startFillEchoInput = useCallback((index: number) => {
    lightTap();
    setEchoEditingIdx(index);
    setEchoEditBuffer('');
  }, []);

  const handleUseEchoPlan = useCallback(() => {
    if (!echoPlan) return;
    selectionChanged();
    // Save Echo memory on ACCEPT — this is the moment the advice mattered.
    if (livePb) {
      const acceptedPlan: EchoPlanResponse = {
        ...echoPlan,
        items: echoPlan.items
          .map((it, i) => ({ ...it, amount: echoAmounts[i] ?? it.amount, needsInput: false }))
          .filter((it, i) => echoSelected[i] && it.amount > 0),
      };
      const memEntry = buildEchoMemoryEntry(livePb, acceptedPlan, echoMessages);
      usePlaybookStore.getState().saveEchoSession(memEntry);
    }
    const s = store.getState();
    const existing = livePb.lineItems || [];
    echoPlan.items.forEach((item, i) => {
      if (!echoSelected[i]) return;
      const amount = echoAmounts[i] ?? item.amount;
      if (amount <= 0) return; // skip unfunded "ask" items + any zero bucket
      const cat = item.category || matchCategory(item.label);
      // Check if item with same label already exists — update instead of duplicate
      const match = existing.find((li) => li.label.toLowerCase() === item.label.toLowerCase());
      if (match) {
        s.updateLineItem(livePb.id, match.id, {
          plannedAmount: amount,
          category: cat,
        });
      } else {
        s.addLineItem(livePb.id, {
          label: item.label, plannedAmount: amount, isPaid: false,
          category: cat, linkedObligationIds: resolveLinkedObls(cat),
        });
      }
    });
    // Close modal + clear plan (items are now in notebook)
    clearEchoTimers();
    setEchoModalVisible(false);
    setEchoPlan(null);
    setEchoMessages([]);
    setEchoChatInput('');
  }, [livePb, echoPlan, echoSelected, echoAmounts, echoMessages, matchCategory, resolveLinkedObls, clearEchoTimers]);

  const handleDismissEcho = useCallback(() => {
    // No memory save on dismiss — memory is saved on ACCEPT (handleUseEchoPlan).
    clearEchoTimers();
    setEchoModalVisible(false);
  }, [clearEchoTimers]);

  // Accepts an optional seeded message (from Turn 3 follow-up chips); otherwise
  // uses the typed input. API is reserved for typed/seeded chat only.
  const handleSendEchoChat = useCallback(async (seed?: string) => {
    const text = (typeof seed === 'string' ? seed : echoChatInput).trim();
    if (!text || !echoPlan || echoChatLoading) return;
    lightTap();
    const newMessages = [...echoMessages, { role: 'user' as const, text }];
    setEchoMessages(newMessages);
    setEchoChatInput('');
    setEchoChatLoading(true);
    const result = await chatWithEcho(livePb, echoPlan, newMessages);
    if (result.ok) {
      setEchoMessages(prev => [...prev, { role: 'echo' as const, text: result.reply }]);
    } else {
      setEchoMessages(prev => [...prev, { role: 'echo' as const, text: `hmm, ${result.error}` }]);
    }
    setEchoChatLoading(false);
  }, [echoChatInput, echoPlan, echoMessages, echoChatLoading, livePb]);

  // ─── Build data array ────────────────────────────────────
  const sectionData = useMemo(() => {
    const data: SectionItem[] = [];

    data.push({ type: 'hero', key: 'hero' });

    // Close-out summary — only for a closed/read-only playbook, right after the hero.
    if (readOnly) {
      data.push({ type: 'closeoutSummary', key: 'closeout-summary' });
    }

    // Obligations — header card only; items shown in the bottom sheet (tap to open)
    if (obligations.items.length > 0) {
      data.push({ type: 'sectionHeader', key: 'sh-obl', title: 'obligations', count: obligations.items.length, amount: obligations.totalAmount });
    }

    // (The "free to plan after obligations" anchor was removed — the plan header's
    // "X of Y free" meta and the "left to live on" footer already say what's left.
    // One "what's left" line only.)

    // Plan items — meta reframed as discretionary allocation vs free-after-obligations
    // "living money" items (label contains "living") are the leftover bucket — not
    // checkable goals. Separate them out and render as a calm derived footer line instead.
    const livingItems = lineItems.filter((li) => li.label.toLowerCase().includes('living'));
    const checkableItems = lineItems.filter((li) => !li.label.toLowerCase().includes('living'));

    // (The actual-spend "vitals" line was folded into the hero's spending pill —
    // spend/day now appears there ONCE, so no separate line above the plan.)

    data.push({
      type: 'sectionHeader', key: 'sh-plan', title: 'your plan',
      count: checkableItems.length > 0 ? checkableItems.length : undefined,
      amount: checkableItems.length > 0 ? checkableItems.reduce((s, li) => s + li.plannedAmount, 0) : undefined,
    });

    if (lineItems.length === 0 && !echoPlan) {
      data.push({ type: 'emptyPlan', key: 'empty-plan' });
    }

    // Plan line items form one grouped card (read/track view with progress rings).
    // Adding/editing/removing now lives in the manual plan editor float modal,
    // opened from the tappable "your plan" header — no inline add row here.
    checkableItems.forEach((li, i) => {
      const isFirst = i === 0;
      const isLast = i === checkableItems.length - 1;
      const pos: GroupPos = isFirst && isLast ? 'only' : isFirst ? 'first' : isLast ? 'last' : 'middle';
      data.push({ type: 'lineItem', key: `li-${li.id}`, data: li, groupPos: pos });
    });

    // Derived "left to live on" footer — shown when there is at least one living-money
    // item OR when there are checkable buckets (so the user always sees what's left).
    // Amount: sum of living items' planned amounts if present; otherwise sourceAmount
    // minus all checkable planned totals (same derivation Echo would use).
    const livingAmount = livingItems.length > 0
      ? livingItems.reduce((s, li) => s + li.plannedAmount, 0)
      : checkableItems.length > 0
        ? Math.max(0, livePb.sourceAmount - checkableItems.reduce((s, li) => s + li.plannedAmount, 0))
        : 0;
    if (livingAmount > 0 || livingItems.length > 0) {
      data.push({ type: 'planAnchor', key: 'living-footer', amount: livingAmount });
    }

    // Spending reality
    if (spendingReality.length > 0) {
      const totalSpent = spendingReality.reduce((s, c) => s + c.spent, 0);
      data.push({ type: 'sectionHeader', key: 'sh-spend', title: "where it's actually going", amount: totalSpent });
      // Sort by spend DESC so the order itself shows magnitude (we dropped the
      // most/some/a-bit word bucketing — position now carries that signal).
      const spendItems = [...spendingReality].sort((a, b) => b.spent - a.spent).slice(0, 8);
      spendItems.forEach((cat, i) => {
        const isFirst = i === 0;
        const isLast = i === spendItems.length - 1;
        const pos: GroupPos = isFirst && isLast ? 'only' : isFirst ? 'first' : isLast ? 'last' : 'middle';
        data.push({ type: 'spendingRow', key: `sc-${cat.category}`, data: cat, groupPos: pos });
      });
    }

    // AI insight
    if (aiInsight) {
      data.push({ type: 'aiInsight', key: 'ai-insight', text: aiInsight });
    }

    // Quick notes
    if (livePb.notebookNote || !readOnly) {
      data.push({ type: 'quickNote', key: 'quick-note' });
    }

    data.push({ type: 'spacer', key: 'bottom-spacer' });
    return data;
  }, [obligations, freeAfterObligations, lineItems, nbStats, spendingReality, aiInsight, echoPlan, aiLoading, readOnly, hasAI, livePb.notebookNote, oblModalVisible]);

  // ─── Render dispatcher ───────────────────────────────────
  const renderItem = useCallback(({ item }: { item: SectionItem }) => {
    switch (item.type) {
      case 'hero': {
        const remaining = Math.max(0, Math.round(liveStats.remaining));
        const daysLeft = liveStats.daysLeft;
        const sourceAmount = Math.round(livePb.sourceAmount);

        // dailySafe = what's left spread evenly over the days remaining (the
        // "allowance"). dailySpend = actual spend per day (burn). Both plain — no
        // "burn"/"pace"/"%" words shown.
        const dailySafe = daysLeft > 0
          ? Math.round(liveStats.remaining / daysLeft)
          : Math.round(liveStats.remaining);
        const dailySpend = Math.round(liveStats.burnRate);

        // Allocation bar fill = how much of the source is spent (0–1).
        const percentSpent = Math.min(100, Math.max(0, Math.round(pbStats.percentSpent)));
        const barFill = Math.min(1, Math.max(0, pbStats.percentSpent / 100));

        // Reassurance status from paceRatio — calm, never scolding. Bronze (never red)
        // for the tight case. Bands: okay / a little quick / tight.
        const tightStatus = liveStats.paceRatio > 1.3 || liveStats.remaining <= 0;
        const quickStatus = !tightStatus && liveStats.paceRatio > 1.1;
        const statusColor = tightStatus || quickStatus ? C.bronze : C.accent;
        const statusWord = tightStatus
          ? "it's tight"
          : quickStatus
            ? 'a bit quick'
            : "you're okay";
        // spending-pill sub status word (steady / a bit quick / tight)
        const spendWord = tightStatus ? 'tight' : quickStatus ? 'a bit quick' : 'steady';
        const spendWordColor = (tightStatus || quickStatus) ? C.bronze : C.textMuted;

        const fmt = (n: number) => n.toLocaleString('en-MY');
        const monthLabel = format(
          livePb.startDate instanceof Date ? livePb.startDate : new Date(livePb.startDate),
          'MMMM',
        ).toLowerCase();

        return (
          <View style={styles.heroZone}>
            {/* 1 · HEADER — mascot tile + word-mark (close chevron lives in the top bar) */}
            <View style={styles.heroHeaderRow}>
              <View style={[styles.mascotTile, { backgroundColor: withAlpha(C.accent, 0.1) }]}>
                <Feather name="book-open" size={15} color={C.accent} />
              </View>
              <Text style={[styles.heroWordMark, { color: C.textMuted }]} numberOfLines={1}>
                playbook · {livePb.name}
              </Text>
            </View>

            {/* 2 · EDITORIAL HEADLINE — warm, no number. */}
            <Text
              style={[styles.heroHeadline, { color: C.textPrimary }]}
              accessibilityRole="header"
            >
              here's where your {monthLabel} money goes.
            </Text>

            {/* 3 · STATUS CARD — the centerpiece: status word, daily allowance once,
                slim allocation bar + caption. */}
            <View
              style={styles.statusCard}
              accessibilityRole="text"
              accessibilityLabel={`${statusWord}. ${currency} ${fmt(Math.max(0, dailySafe))} a day to spend and still finish fine. ${percentSpent}% spent, ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left.`}
            >
              <View style={styles.statusTopRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusWord, { color: statusColor }]}>{statusWord}</Text>
              </View>
              <Text style={[styles.statusAllowance, { color: C.textPrimary }]}>
                {currency} {fmt(Math.max(0, dailySafe))}/day to spend and still finish fine
              </Text>
              <View style={styles.statusBarTrack}>
                <View style={[styles.statusBarFill, { width: `${barFill * 100}%`, backgroundColor: C.accent }]} />
              </View>
              <Text style={[styles.statusCaption, { color: C.textMuted }]}>
                {percentSpent}% spent · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
              </Text>
            </View>

            {/* 4 · TWO-UP STAT PILLS — each money number appears ONCE. */}
            <View style={styles.pillRow}>
              {/* LEFT = what's left */}
              <View
                style={styles.statPill}
                accessibilityRole="text"
                accessibilityLabel={`left, ${currency} ${fmt(remaining)} of ${currency} ${fmt(sourceAmount)}`}
              >
                <View style={styles.statPillTop}>
                  <Text style={[styles.statPillLabel, { color: C.textMuted }]}>left</Text>
                  <View style={[styles.statPillIcon, { backgroundColor: withAlpha(C.accent, 0.1) }]}>
                    <Feather name="credit-card" size={13} color={C.accent} />
                  </View>
                </View>
                <Text style={[styles.statPillValue, { color: C.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                  {currency} {fmt(remaining)}
                </Text>
                <Text style={[styles.statPillSub, { color: C.textMuted }]} numberOfLines={1}>
                  of {currency} {fmt(sourceAmount)}
                </Text>
              </View>

              {/* RIGHT = spending per day */}
              <View
                style={styles.statPill}
                accessibilityRole="text"
                accessibilityLabel={`spending, ${currency} ${fmt(Math.max(0, dailySpend))} a day, ${spendWord}`}
              >
                <View style={styles.statPillTop}>
                  <Text style={[styles.statPillLabel, { color: C.textMuted }]}>spending</Text>
                  <View style={[styles.statPillIcon, { backgroundColor: withAlpha(spendWordColor === C.bronze ? C.bronze : C.accent, 0.1) }]}>
                    <Feather name="trending-up" size={13} color={spendWordColor === C.bronze ? C.bronze : C.accent} />
                  </View>
                </View>
                <View style={styles.statPillValueRow}>
                  <Text style={[styles.statPillValue, { color: C.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                    {currency} {fmt(Math.max(0, dailySpend))}
                  </Text>
                  <Text style={[styles.statPillUnit, { color: C.textMuted }]}>/day</Text>
                </View>
                <Text style={[styles.statPillSub, { color: spendWordColor }]} numberOfLines={1}>
                  {spendWord}
                </Text>
              </View>
            </View>

            {/* 5 · Echo coaching tip — the single Echo entry. */}
            {!readOnly && hasAI && (() => {
              const tipColor = tightStatus ? C.bronze : C.textPrimary;
              return (
                <TouchableOpacity
                  style={styles.echoTipCard}
                  onPress={handleAskEcho}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={lineItems.length === 0 ? 'plan with echo' : (echoPlan ? 'view echo plan' : 'talk to echo about your money')}
                >
                  <View style={styles.echoTipHeader}>
                    <Text style={styles.echoTipTag}>echo</Text>
                    <Text style={styles.echoTipLink}>{lineItems.length === 0 ? 'plan with echo ›' : 'talk to echo ›'}</Text>
                  </View>
                  <Text style={[styles.echoTipText, { color: tipColor }]}>
                    {tightStatus
                      ? 'want help finding a bit of room?'
                      : 'want help deciding where it goes?'}
                  </Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        );
      }

      case 'closeoutSummary': {
        // total kept = source - what was actually spent (linked expenses).
        // bronze when over (never red); calm tone, no scolding.
        const kept = roundMoney(livePb.sourceAmount - pbStats.totalSpent);
        const isOver = kept < 0;
        const headlineAmount = Math.abs(kept).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        // "where the money went": planned vs actual per category, actual desc.
        // keep only categories that actually saw spend — a closed plan's story
        // is what was spent, not unspent plan lines.
        const rows = planVsActual.filter((r) => r.actual > 0);

        return (
          <View style={styles.closeoutZone}>
            {/* headline card — kept under plan / went over */}
            <View style={[styles.closeoutHeadlineCard, { backgroundColor: withAlpha(isOver ? C.bronze : C.accent, 0.06), borderColor: withAlpha(isOver ? C.bronze : C.accent, 0.14) }]}>
              <Text style={[styles.closeoutEyebrow, { color: C.textMuted }]}>
                {isOver ? 'you went over plan' : 'you kept under plan'}
              </Text>
              <Text style={[styles.closeoutHeadlineAmount, { color: isOver ? C.bronze : C.textPrimary }]} numberOfLines={1}>
                {isOver ? '-' : ''}{currency} {headlineAmount}
              </Text>
              <Text style={[styles.closeoutSub, { color: C.textMuted }]} numberOfLines={1}>
                {currency} {Math.round(pbStats.totalSpent).toLocaleString('en-MY')} spent of {currency} {Math.round(livePb.sourceAmount).toLocaleString('en-MY')}
              </Text>
            </View>

            {/* where the money went — planned vs actual per category */}
            {rows.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>where the money went</Text>
                  <Text style={styles.sectionMeta}>{currency} {Math.round(pbStats.totalSpent).toLocaleString('en-MY')}</Text>
                </View>
                {rows.map((row, i) => {
                  const isFirst = i === 0;
                  const isLast = i === rows.length - 1;
                  const pos: GroupPos = isFirst && isLast ? 'only' : isFirst ? 'first' : isLast ? 'last' : 'middle';
                  return (
                    <CloseoutRow
                      key={`co-${row.category}`}
                      row={row}
                      currency={currency}
                      C={C}
                      catColor={getCatInfo(row.category)?.color}
                      groupPos={pos}
                    />
                  );
                })}
              </>
            )}
          </View>
        );
      }

      case 'sectionHeader': {
        const isObl = item.key === 'sh-obl';
        const isPlan = item.key === 'sh-plan';
        const metaText = item.count != null
          ? `${item.count}${item.amount != null ? ` · ${currency} ${item.amount.toLocaleString('en-MY')}` : ''}`
          : item.amount != null
            ? `${currency} ${item.amount.toLocaleString('en-MY')}`
            : '';
        // Plan meta reads as discretionary allocation against the free-after-obligations
        // envelope. Over-allocation shows the planned amount in bronze (never red).
        const plannedTotal = nbStats.totalPlanned;
        const planOver = plannedTotal > freeAfterObligations;
        const planMeta = (
          <Text style={styles.sectionMeta}>
            <Text style={planOver ? { color: C.bronze } : undefined}>
              {currency} {plannedTotal.toLocaleString('en-MY')}
            </Text>
            <Text> of {currency} {freeAfterObligations.toLocaleString('en-MY')} free</Text>
          </Text>
        );
        // the plan header is tappable (opens the manual editor) when editable.
        const planEditable = isPlan && !readOnly;
        // Right-aligned "details ›" link only on the (editable) plan header — opens
        // the manual plan editor. Obligations now render inline, so no link.
        const showDetails = planEditable;
        const headerContent = (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, isPlan && styles.sectionTitlePlan]}>{item.title}</Text>
              {planEditable && <Feather name="edit-2" size={13} color={C.accent} style={{ marginLeft: SPACING.xs }} />}
              {/* meta sits under/next to the title for plan + obligations */}
              {isPlan ? planMeta : (!!metaText && (
                <Text style={[styles.sectionMeta, styles.sectionMetaInline]}>{metaText}</Text>
              ))}
            </View>
            <View style={styles.sectionRight}>
              {aiLoading && item.key === 'sh-plan' ? (
                <View style={styles.aiLoadingRow}>
                  <ActivityIndicator size="small" color={C.accent} />
                  <Text style={[styles.aiLoadingText, { color: C.textMuted }]}>echo is thinking...</Text>
                </View>
              ) : showDetails ? (
                <View style={styles.sectionDetailsLink}>
                  <Text style={[styles.sectionDetailsText, { color: C.accent }]}>details</Text>
                  <Feather name="chevron-right" size={14} color={C.accent} />
                </View>
              ) : null}
            </View>
          </View>
        );
        if (isObl) {
          // Tappable card → opens the obligations bottom sheet (tick items there).
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { lightTap(); setOblModalVisible(true); }}
              accessibilityRole="button"
              accessibilityLabel="view obligations — bills and debts due this period"
              style={styles.oblCard}
            >
              <View style={styles.oblCardRow}>
                <View style={styles.oblCardIcon}>
                  <Feather name="calendar" size={18} color={C.accent} />
                </View>
                <View style={styles.oblCardContent}>
                  <Text style={styles.tileTitle}>obligations</Text>
                  <Text style={[styles.tileSubtitle, { color: C.textMuted }]}>bills & debts due this period</Text>
                  <Text style={styles.oblCardMeta}>
                    {obligations.items.length} {obligations.items.length === 1 ? 'item' : 'items'} · {currency} {obligations.totalAmount.toLocaleString('en-MY')}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={C.textMuted} />
              </View>
            </TouchableOpacity>
          );
        }
        if (planEditable) {
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { lightTap(); setPlanEditorVisible(true); }}
              accessibilityRole="button"
              accessibilityLabel="edit your plan"
            >
              {headerContent}
            </TouchableOpacity>
          );
        }
        return headerContent;
      }

      case 'obligation':
        return (
          <ObligationRow
            item={item.data}
            currency={currency}
            C={C}
            readOnly={readOnly}
            groupPos={item.groupPos}
            onToggle={() => handleToggleCovered(item.data.sourceId)}
            onTap={onNavigate ? () => handleObligationTap(item.data) : undefined}
          />
        );

      case 'lineItem': {
        const catInfo = getCatInfo(item.data.category || matchCategory(item.data.label));
        return (
          <LineItemRow
            item={item.data}
            currency={currency}
            C={C}
            readOnly={readOnly}
            categoryColor={catInfo?.color}
            committedAmount={committedByLineItem[item.data.id]}
            actualSpent={actualByLineItem[item.data.id]}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(item.data.id)}
            groupPos={item.groupPos}
            onTogglePaid={() => handleTogglePaid(item.data.id)}
            onPress={() => selectionMode ? toggleSelect(item.data.id) : undefined}
            onLongPress={() => handleLongPress(item.data)}
          />
        );
      }

      case 'spendingRow': {
        const spendCatInfo = getCatInfo(item.data.category);
        return <SpendingRow item={item.data} currency={currency} C={C} catColor={spendCatInfo?.color} groupPos={item.groupPos} />;
      }

      case 'aiInsight':
        return (
          <View
            style={styles.echoInsightRow}
            accessibilityRole="text"
            accessibilityLabel={`echo insight: ${item.text}`}
          >
            <Feather name="zap" size={13} color={C.accent} style={{ marginTop: 3 }} />
            <Text style={[styles.echoInsightText, { color: C.textSecondary }]}>{item.text}</Text>
          </View>
        );

      case 'emptyPlan':
        return (
          <View style={styles.emptyPlan}>
            {/* big pen tile IS the button — tap to plan it yourself */}
            <TouchableOpacity
              onPress={readOnly ? undefined : () => { lightTap(); setPlanEditorVisible(true); }}
              disabled={readOnly}
              activeOpacity={0.7}
              style={styles.emptyPenTile}
              accessibilityRole="button"
              accessibilityLabel="plan it yourself"
            >
              <Feather name="edit-3" size={30} color={C.accent} />
            </TouchableOpacity>
            <Text style={[styles.emptyPlanText, { color: C.textMuted }]}>
              tap the pen to plan it yourself — rent, food, transport...
            </Text>
          </View>
        );

      case 'planAnchor': {
        // 'living-footer' key = derived "left to live on" line shown below the plan
        // buckets. Shows daily rate so there's one clear number to hold onto.
        if (item.key === 'living-footer') {
          const dailyLiving = liveStats.daysLeft > 0
            ? Math.round(item.amount / liveStats.daysLeft)
            : 0;
          const fmt = (n: number) => n.toLocaleString('en-MY');
          return (
            <Text
              style={[styles.planAnchor, styles.planAnchorLiving, { color: C.textSecondary }]}
              accessibilityRole="text"
            >
              {currency} {fmt(item.amount)} left to live on
              {dailyLiving > 0 ? ` — about ${currency} ${fmt(dailyLiving)}/day` : ''}
            </Text>
          );
        }
        return (
          <Text
            style={[styles.planAnchor, { color: C.textMuted }]}
            accessibilityRole="text"
          >
            {currency} {item.amount.toLocaleString('en-MY')} free to plan after obligations
          </Text>
        );
      }

      case 'quickNote':
        return (
          <View style={styles.quickNoteWrap}>
            <Text style={[styles.quickNoteLabel, { color: C.textMuted }]}>quick notes</Text>
            <TextInput
              style={[styles.quickNoteInput, { color: C.textPrimary, backgroundColor: withAlpha(C.accent, 0.03) }]}
              value={noteText}
              onChangeText={setNoteText}
              onBlur={handleNoteSave}
              placeholder="reminders, due dates..."
              placeholderTextColor={withAlpha(C.textMuted, 0.5)}
              multiline
              editable={!readOnly}
              scrollEnabled={false}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
          </View>
        );

      case 'spacer':
        return <View style={{ height: SPACING.xl }} />;

      default:
        return null;
    }
  }, [
    C, styles, currency, livePb, liveStats, pbStats,
    readOnly, selectionMode, selectedIds,
    aiLoading, echoPlan, echoSelected, hasAI, noteText,
    handleToggleCovered, handleTogglePaid, handleLongPress, toggleSelect,
    handleAskEcho, handleUseEchoPlan, handleDismissEcho, toggleEchoItem,
    handleNoteSave, oblModalVisible, handleObligationTap, onNavigate, obligations,
    getCatInfo, committedByLineItem, actualByLineItem, planVsActual,
    nbStats, freeAfterObligations,
  ]);

  const keyExtractor = useCallback((item: SectionItem) => item.key, []);

  return (
    <Modal
      visible
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: C.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, SPACING.md) }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="close playbook"
            accessibilityRole="button"
          >
            <Feather name="chevron-down" size={24} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle} numberOfLines={1}>playbook</Text>
          {readOnly && (
            <View style={[styles.readOnlyBadge, { backgroundColor: withAlpha(C.textMuted, 0.1) }]}>
              <Text style={[styles.readOnlyText, { color: C.textMuted }]}>read only</Text>
            </View>
          )}
          {!readOnly && <View style={{ width: 60 }} />}
        </View>

        <FlatList
          data={sectionData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, SPACING.lg) + SPACING.md }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          nestedScrollEnabled
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={20}
          showsVerticalScrollIndicator={false}
        />
      </KeyboardAvoidingView>
      {Platform.OS === 'ios' && <InputAccessoryView nativeID="notebookAmount" />}

      {/* ── Obligations Bottom Sheet (canonical, shared with Goals) ── */}
      <BottomSheet
        visible={oblModalVisible}
        onClose={() => setOblModalVisible(false)}
        header={
          <View style={styles.oblCardHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: C.textPrimary }]}>obligations</Text>
              <Text style={[styles.sectionMeta, { color: C.textSecondary }]}>
                {obligations.items.length} items · {currency} {obligations.totalAmount.toLocaleString('en-MY')}
              </Text>
            </View>
            <Text style={styles.oblHeaderSub}>bills & debts due this period — tick what you've set aside</Text>
          </View>
        }
      >
        <FlatList
          data={obligations.items}
          keyExtractor={(o) => o.id}
          style={{ flexShrink: 1 }}
          renderItem={({ item: obl, index }) => {
            const last = obligations.items.length - 1;
            const pos: GroupPos = obligations.items.length === 1 ? 'only' : index === 0 ? 'first' : index === last ? 'last' : 'middle';
            return (
              <ObligationRow
                item={obl}
                currency={currency}
                C={C}
                readOnly={readOnly}
                groupPos={pos}
                onToggle={() => handleToggleCovered(obl.sourceId)}
                onTap={onNavigate ? () => { setOblModalVisible(false); handleObligationTap(obl); } : undefined}
              />
            );
          }}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.xs, paddingBottom: SPACING.md }}
        />
      </BottomSheet>

      {/* ── Selection Bar ── */}
      {selectionMode && (
        <View style={[styles.selectionBar, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
          <TouchableOpacity onPress={exitSelectionMode} style={styles.selectionClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={20} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.selectionCount, { color: C.textPrimary }]}>{selectedIds.size} selected</Text>
          <View style={styles.selectionActions}>
            {selectedIds.size === 1 && (
              <TouchableOpacity style={[styles.selectionBtn, { borderColor: C.border }]} onPress={handleSelectionEdit} activeOpacity={0.7}>
                <Feather name="edit-2" size={15} color={C.accent} />
                <Text style={[styles.selectionBtnText, { color: C.accent }]}>edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.selectionBtn, { borderColor: C.border }, selectedIds.size === 0 && { opacity: 0.4 }]}
              onPress={handleBulkDelete}
              disabled={selectedIds.size === 0}
              activeOpacity={0.7}
            >
              <Feather name="trash-2" size={15} color={C.bronze} />
              <Text style={[styles.selectionBtnText, { color: C.bronze }]}>delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Manual "your plan" editor (manual counterpart to Echo) ── */}
      {planEditorVisible && (
        <Modal visible={planEditorVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPlanEditorVisible(false)}>
          <View style={styles.echoOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPlanEditorVisible(false)} accessibilityLabel="close plan editor" accessibilityRole="button" />
            <KeyboardAvoidingView style={styles.echoKAV} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
              <View style={[styles.echoModal, { backgroundColor: C.surface, borderColor: C.border }]} onStartShouldSetResponder={() => true}>
                {/* header — title + close */}
                <View style={styles.echoHeaderRow}>
                  <View style={styles.echoTitleRow}>
                    <Feather name="edit-2" size={14} color={C.accent} />
                    <Text style={[styles.echoTitle, { color: C.textPrimary }]}>your plan</Text>
                  </View>
                  <TouchableOpacity onPress={() => setPlanEditorVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="close" accessibilityRole="button">
                    <Feather name="x" size={20} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.planEditorMeta, { color: C.textMuted }]}>
                  {currency} {freeAfterObligations.toLocaleString('en-MY')} free to plan
                </Text>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  scrollEventThrottle={16}
                  contentContainerStyle={styles.planEditorScroll}
                  onStartShouldSetResponder={() => true}
                >
                  {lineItems.length === 0 ? (
                    <Text style={[styles.planEditorEmpty, { color: C.textMuted }]}>
                      nothing planned yet — add your first item below.
                    </Text>
                  ) : (
                    lineItems.map((li) => (
                      <View key={li.id} style={[styles.planEditorRow, { borderColor: C.border }]}>
                        <TouchableOpacity
                          style={styles.planEditorRowMain}
                          onPress={() => {
                            lightTap();
                            setEditModalItem(li);
                            setEditModalLabel(li.label);
                            setEditModalAmount((li.actualAmount ?? li.plannedAmount).toString());
                          }}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={`edit ${li.label}, ${currency} ${Math.round(li.plannedAmount).toLocaleString('en-MY')}`}
                        >
                          <Text style={[styles.planEditorRowLabel, { color: C.textPrimary }]}>{li.label}</Text>
                          <Text style={[styles.planEditorRowAmount, { color: C.textSecondary }]}>
                            {currency} {Math.round(li.plannedAmount).toLocaleString('en-MY')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            Alert.alert('remove this item?', `"${li.label}" will be removed from your plan.`, [
                              { text: 'cancel', style: 'cancel' },
                              { text: 'remove', style: 'destructive', onPress: () => { mediumTap(); store.getState().removeLineItem(livePb.id, li.id); } },
                            ]);
                          }}
                          style={styles.planEditorRemove}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel={`remove ${li.label}`}
                        >
                          <Feather name="trash-2" size={16} color={C.bronze} />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}

                  {/* add row — moved here from the inline notebook section */}
                  <View style={[styles.planEditorAddCard, { borderColor: C.border, backgroundColor: withAlpha(C.accent, 0.03) }]}>
                    <TextInput
                      ref={addLabelRef}
                      style={[styles.planEditorAddLabel, { color: C.textPrimary }]}
                      value={addLabel}
                      onChangeText={setAddLabel}
                      placeholder="rent, car loan, groceries..."
                      placeholderTextColor={withAlpha(C.textMuted, 0.5)}
                      multiline
                      textAlignVertical="top"
                      blurOnSubmit={false}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={C.accent}
                      accessibilityLabel="plan item name"
                    />
                    <View style={styles.planEditorAddAmountRow}>
                      <Text style={[styles.addCurrency, { color: C.textMuted }]}>{currency}</Text>
                      <TextInput
                        ref={addAmountRef}
                        style={[styles.planEditorAddAmount, { color: C.textPrimary }]}
                        value={addAmount}
                        onChangeText={setAddAmount}
                        placeholder="amount"
                        placeholderTextColor={withAlpha(C.textMuted, 0.4)}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        onSubmitEditing={handleAddItem}
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                        accessibilityLabel="plan item amount"
                      />
                      <TouchableOpacity
                        onPress={handleAddItem}
                        disabled={!addLabel.trim()}
                        style={[styles.addBtn, { backgroundColor: addLabel.trim() ? C.accent : withAlpha(C.textMuted, 0.1) }]}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="add plan item"
                      >
                        <Feather name="plus" size={18} color={addLabel.trim() ? C.surface : C.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </ScrollView>

                <TouchableOpacity
                  style={[styles.planEditorDone, { backgroundColor: C.accent }]}
                  onPress={() => { lightTap(); setPlanEditorVisible(false); }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="done editing plan"
                >
                  <Text style={[styles.planEditorDoneText, { color: C.surface }]}>done</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      )}

      {/* ── Float Edit Modal (single line item — stacks above the plan editor) ── */}
      <Modal visible={!!editModalItem} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setEditModalItem(null)}>
        <View style={styles.oblOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditModalItem(null)} />
          <KeyboardAvoidingView style={styles.floatEditKAV} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
            <View style={[styles.floatEditCard, { backgroundColor: C.surface }]} onStartShouldSetResponder={() => true}>
              <View style={styles.floatEditHeader}>
                <Text style={[styles.modalTitle, { color: C.textPrimary }]}>edit item</Text>
                <TouchableOpacity onPress={() => setEditModalItem(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="x" size={20} color={C.textMuted} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.floatEditInput, { color: C.textPrimary, borderColor: withAlpha(C.accent, 0.2), backgroundColor: withAlpha(C.textMuted, 0.05) }]}
                value={editModalLabel}
                onChangeText={setEditModalLabel}
                placeholder="item name"
                placeholderTextColor={C.textMuted}
                autoFocus
                returnKeyType="next"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
              <View style={[styles.floatEditAmountRow, { borderColor: withAlpha(C.accent, 0.2), backgroundColor: withAlpha(C.textMuted, 0.05) }]}>
                <Text style={[styles.floatEditCurrency, { color: C.textMuted }]}>{currency}</Text>
                <TextInput
                  style={[styles.floatEditAmountInput, { color: C.textPrimary }]}
                  value={editModalAmount}
                  onChangeText={setEditModalAmount}
                  placeholder="0"
                  placeholderTextColor={C.textMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleEditModalSave}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                />
              </View>
              <TouchableOpacity style={[styles.floatEditSave, { backgroundColor: C.accent }]} onPress={handleEditModalSave} activeOpacity={0.85}>
                <Text style={[styles.floatEditSaveText, { color: C.surface }]}>save</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Echo Conversation (turn-based, chip-driven) ── */}
      {echoModalVisible && (
        <Modal visible={echoModalVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleDismissEcho}>
          <View style={styles.echoOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleDismissEcho} accessibilityLabel="close echo" accessibilityRole="button" />
            <KeyboardAvoidingView style={styles.echoKAV} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
              <View style={[styles.echoModal, { backgroundColor: C.surface, borderColor: C.border }]} onStartShouldSetResponder={() => true}>
              {/* Header — title + close. "start over" only once we're mid-conversation. */}
              <View style={styles.echoHeaderRow}>
                <View style={styles.echoTitleRow}>
                  <Feather name="zap" size={15} color={C.accent} />
                  <Text style={[styles.echoTitle, { color: C.textPrimary }]}>echo</Text>
                </View>
                <View style={styles.echoHeaderActions}>
                  {echoTurn > 0 && (
                    <TouchableOpacity onPress={handleReaskEcho} disabled={aiLoading} style={[styles.echoReaskBtn, { backgroundColor: withAlpha(C.accent, 0.08) }]} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="start over" accessibilityRole="button">
                      <Feather name="refresh-cw" size={12} color={aiLoading ? C.textMuted : C.accent} />
                      <Text style={[styles.echoReaskText, { color: aiLoading ? C.textMuted : C.accent }]}>start over</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={handleDismissEcho} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="close" accessibilityRole="button">
                    <Feather name="x" size={20} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView ref={echoScrollRef} showsVerticalScrollIndicator={false} bounces keyboardShouldPersistTaps="handled" nestedScrollEnabled scrollEventThrottle={16} contentContainerStyle={styles.echoScrollContent} onContentSizeChange={() => echoScrollRef.current?.scrollToEnd({ animated: true })}>

                {/* ── TURN 0 · opener + intent chips (no auto-fire) ── */}
                {echoTurn === 0 && (
                  <View style={styles.echoTurnWrap}>
                    <Text style={[styles.echoSay, { color: C.textPrimary }]}>okay — let's set up where this goes.</Text>
                    <Text style={[styles.echoSay, { color: C.textSecondary }]}>what do you want from it this time?</Text>

                    <View style={styles.echoChipWrap}>
                      {ECHO_INTENTS.map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[styles.echoChip, { borderColor: C.border, backgroundColor: withAlpha(C.accent, 0.04) }]}
                          onPress={() => handlePickIntent(opt.intent, opt.bubble)}
                          activeOpacity={0.7}
                          accessibilityLabel={opt.chip}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.echoChipText, { color: C.textPrimary }]}>{opt.chip}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* one-tap income question (steadiness optional, default unknown) */}
                    <Text style={[styles.echoMiniLabel, { color: C.textMuted }]}>money coming in is…</Text>
                    <View style={styles.echoChipRow}>
                      {([['steady', true], ['it changes', false]] as const).map(([label, val]) => {
                        const on = echoSteady === val;
                        return (
                          <TouchableOpacity
                            key={label}
                            style={[styles.echoPill, { borderColor: on ? C.accent : C.border, backgroundColor: on ? withAlpha(C.accent, 0.1) : 'transparent' }]}
                            onPress={() => { lightTap(); setEchoSteady(on ? undefined : val); }}
                            activeOpacity={0.7}
                            accessibilityLabel={`income ${label}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                          >
                            <Text style={[styles.echoPillText, { color: on ? C.accent : C.textSecondary }]}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* demoted free-text escape hatch */}
                    <View style={styles.echoFreeRow}>
                      <TextInput
                        style={[styles.echoFreeInput, { color: C.textPrimary, borderColor: C.border }]}
                        placeholder="or tell me…"
                        placeholderTextColor={C.textMuted}
                        value={echoFreeText}
                        onChangeText={setEchoFreeText}
                        multiline
                        textAlignVertical="top"
                        blurOnSubmit={false}
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                        accessibilityLabel="tell echo in your own words"
                      />
                      {echoFreeText.trim().length > 0 && (
                        <TouchableOpacity onPress={handleSendFreeIntent} style={[styles.echoFreeSend, { backgroundColor: C.accent }]} activeOpacity={0.7} accessibilityLabel="send" accessibilityRole="button">
                          <Feather name="arrow-up" size={15} color={C.surface} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}

                {/* ── TURN 1+ · the chosen intent as the user's own bubble ── */}
                {echoTurn >= 1 && echoIntentLabel ? (
                  <View style={styles.echoUserRow}>
                    <View style={[styles.echoUserBubble, { backgroundColor: withAlpha(C.accent, 0.1) }]}>
                      <Text style={[styles.echoUserText, { color: C.textPrimary }]}>{echoIntentLabel}</Text>
                    </View>
                  </View>
                ) : null}

                {/* ── TURN 1 · reflect (no numbers) + "what i looked at" one at a time ── */}
                {echoTurn >= 1 && (
                  <View style={styles.echoTurnWrap}>
                    {echoTurn >= 2 && echoPlan?.reflection ? (
                      <Text style={[styles.echoSay, { color: C.textSecondary }]}>{echoPlan.reflection}</Text>
                    ) : echoTurn === 1 ? (
                      <Text style={[styles.echoSay, { color: C.textSecondary }]}>okay — let me take a look at your money first.</Text>
                    ) : null}

                    {echoInputs.length > 0 && (
                      <View
                        style={styles.echoInputsWrap}
                        accessible
                        accessibilityRole="summary"
                        accessibilityLabel={`what echo looked at: ${echoInputs.join(', ')}`}
                      >
                        <Text style={[styles.echoInputsLabel, { color: C.textMuted }]}>what i looked at</Text>
                        {echoInputs.slice(0, echoInputsShown).map((line, i) => (
                          <View key={`echo-input-${i}`} style={styles.echoInputRow}>
                            <Feather name="check" size={12} color={C.accent} style={{ marginTop: 2 }} />
                            <Text style={[styles.echoInputText, { color: C.textMuted }]}>{line}</Text>
                          </View>
                        ))}
                        {echoTurn === 1 && echoInputsShown >= echoInputs.length && aiLoading && (
                          <View style={styles.echoThinkingRow}>
                            <ActivityIndicator size="small" color={C.accent} />
                            <Text style={[styles.echoInputText, { color: C.textMuted }]}>working it out…</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {/* ── TURN 2+ · the plan, streamed in one item at a time ── */}
                {echoTurn >= 2 && echoPlan && (
                  <View style={styles.echoTurnWrap}>
                    <Text style={[styles.echoPlanLabel, { color: C.textMuted }]}>here's a start</Text>

                    {echoPlan.items.slice(0, echoItemsShown).map((ei, idx) => {
                      const amt = echoAmounts[idx] ?? ei.amount;
                      const editing = echoEditingIdx === idx;
                      const selected = echoSelected[idx];
                      return (
                        <View key={`${ei.label}-${idx}`} style={[styles.echoItemRow, !selected && !ei.needsInput && { opacity: 0.45 }]}>
                          {/* toggle inclusion = agency */}
                          <TouchableOpacity
                            onPress={() => toggleEchoItem(idx)}
                            style={[
                              styles.echoCheck,
                              { borderColor: selected ? C.accent : withAlpha(C.textMuted, 0.3) },
                              selected && { backgroundColor: C.accent },
                            ]}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel={`${selected ? 'remove' : 'add'} ${ei.label}`}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                          >
                            {selected && <Feather name="check" size={11} color={C.surface} />}
                          </TouchableOpacity>

                          <View style={styles.echoItemLeft}>
                            <View style={styles.echoItemTop}>
                              <Text style={[styles.echoItemLabel, { color: C.textPrimary }]} numberOfLines={1}>{ei.label}</Text>

                              {/* needs-input item: no amount yet — show leave blank / set amount */}
                              {ei.needsInput && amt <= 0 && !editing ? null : editing ? (
                                <View style={styles.echoEditRow}>
                                  <Text style={[styles.echoItemAmount, { color: C.textMuted }]}>{currency}</Text>
                                  <TextInput
                                    style={[styles.echoAmountInput, { color: C.textPrimary, borderColor: C.accent }]}
                                    value={echoEditBuffer}
                                    onChangeText={setEchoEditBuffer}
                                    onSubmitEditing={commitEditEchoAmount}
                                    onBlur={commitEditEchoAmount}
                                    keyboardType="numeric"
                                    autoFocus
                                    returnKeyType="done"
                                    keyboardAppearance={isDark ? 'dark' : 'light'}
                                    selectionColor={C.accent}
                                    accessibilityLabel={`amount for ${ei.label}`}
                                  />
                                </View>
                              ) : (
                                <TouchableOpacity
                                  onPress={() => startEditEchoAmount(idx, amt)}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                  accessibilityLabel={`edit amount for ${ei.label}, now ${currency} ${amt}`}
                                  accessibilityRole="button"
                                >
                                  <Text style={[styles.echoItemAmount, { color: C.textPrimary }]}>{currency} {amt.toLocaleString('en-MY')}</Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            {/* rationale OR the gentle needs-input question */}
                            {ei.needsInput && amt <= 0 && !editing ? (
                              <>
                                {ei.question ? (
                                  <Text style={[styles.echoRationale, { color: C.textMuted }]}>{ei.question}</Text>
                                ) : null}
                                <View style={styles.echoAskChoiceRow}>
                                  <TouchableOpacity
                                    onPress={() => { lightTap(); setEchoSelected((p) => p.map((v, i) => i === idx ? false : v)); }}
                                    style={[styles.echoTinyChip, { borderColor: C.border }]}
                                    activeOpacity={0.7}
                                    accessibilityLabel={`leave ${ei.label} blank`}
                                    accessibilityRole="button"
                                  >
                                    <Text style={[styles.echoTinyChipText, { color: C.textSecondary }]}>leave blank</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => startFillEchoInput(idx)}
                                    style={[styles.echoTinyChip, { borderColor: C.accent, backgroundColor: withAlpha(C.accent, 0.08) }]}
                                    activeOpacity={0.7}
                                    accessibilityLabel={`set an amount for ${ei.label}`}
                                    accessibilityRole="button"
                                  >
                                    <Text style={[styles.echoTinyChipText, { color: C.accent }]}>set amount</Text>
                                  </TouchableOpacity>
                                </View>
                              </>
                            ) : ei.rationale ? (
                              <Text style={[styles.echoRationale, { color: C.textMuted }]}>{ei.rationale}</Text>
                            ) : null}

                            {/* TURN 3 · steer the amount in place (local math only) */}
                            {echoTurn >= 3 && selected && (!ei.needsInput || (echoAmounts[idx] ?? 0) > 0) && !editing && (
                              <View style={styles.echoStepRow}>
                                <TouchableOpacity onPress={() => nudgeEchoAmount(idx, -10)} style={[styles.echoStepBtn, { borderColor: C.border }]} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityLabel={`lower ${ei.label} by 10`} accessibilityRole="button">
                                  <Feather name="minus" size={14} color={C.textSecondary} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => nudgeEchoAmount(idx, 10)} style={[styles.echoStepBtn, { borderColor: C.border }]} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityLabel={`raise ${ei.label} by 10`} accessibilityRole="button">
                                  <Feather name="plus" size={14} color={C.textSecondary} />
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}

                    {/* leftover, recomputed LOCALLY as amounts/inclusion change */}
                    {echoTurn >= 3 && echoItemsShown >= echoPlan.items.length && (() => {
                      const used = echoPlan.items.reduce((s, it, i) => echoSelected[i] && (!it.needsInput || (echoAmounts[i] ?? 0) > 0) ? s + (echoAmounts[i] ?? it.amount) : s, 0);
                      const left = Math.max(0, Math.round(livePb.sourceAmount - used));
                      return (
                        <View style={[styles.echoLeftoverRow, { borderTopColor: C.border }]}>
                          <Text style={[styles.echoLeftoverLabel, { color: C.textMuted }]}>left to live on</Text>
                          <Text style={[styles.echoLeftoverAmount, { color: C.textPrimary }]}>{currency} {left.toLocaleString('en-MY')}</Text>
                        </View>
                      );
                    })()}

                    {/* HERO closing sentence (accent-wash) — only once items have landed */}
                    {echoItemsShown >= echoPlan.items.length && echoPlan.summary ? (
                      <View style={[styles.echoSummaryCard, { backgroundColor: withAlpha(C.accent, 0.06), borderColor: withAlpha(C.accent, 0.18) }]}>
                        <Text style={[styles.echoSummaryText, { color: C.textPrimary }]}>{echoPlan.summary}</Text>
                      </View>
                    ) : null}

                    {/* AFTER the plan: at most ONE gentle warning, no alert-triangle */}
                    {echoTurn >= 3 && echoItemsShown >= echoPlan.items.length && echoPlan.warnings.length > 0 ? (
                      <Text style={[styles.echoGentleWarn, { color: C.bronze }]}>{echoPlan.warnings[0]}</Text>
                    ) : null}

                    {/* TURN 3 · seeded follow-up chips → real chat */}
                    {echoTurn >= 3 && echoItemsShown >= echoPlan.items.length && (
                      <View style={styles.echoChipRow}>
                        {ECHO_FOLLOWUPS.map((q) => (
                          <TouchableOpacity
                            key={q}
                            style={[styles.echoTinyChip, { borderColor: C.border }]}
                            onPress={() => handleSendEchoChat(q)}
                            disabled={echoChatLoading}
                            activeOpacity={0.7}
                            accessibilityLabel={q}
                            accessibilityRole="button"
                          >
                            <Text style={[styles.echoTinyChipText, { color: C.textSecondary }]}>{q}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* chat thread (typed / seeded follow-ups) */}
                {echoMessages.length > 0 && (
                  <View style={styles.echoChatWrap}>
                    {echoMessages.map((msg, i) => (
                      <View key={i} style={msg.role === 'user' ? styles.echoChatUserRow : styles.echoChatEchoRow}>
                        <View style={[
                          styles.echoChatBubble,
                          msg.role === 'user'
                            ? { backgroundColor: withAlpha(C.accent, 0.1) }
                            : { backgroundColor: C.background, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
                        ]}>
                          <Text style={[styles.echoChatText, { color: C.textPrimary }]}>{msg.text}</Text>
                        </View>
                      </View>
                    ))}
                    {echoChatLoading && (
                      <View style={styles.echoChatEchoRow}>
                        <ActivityIndicator size="small" color={C.accent} />
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>

              {/* Footer — only once we have a plan to co-own */}
              {echoTurn >= 3 && echoPlan && (
                <View style={[styles.echoFooter, { borderTopColor: C.border }]}>
                  <TouchableOpacity onPress={handleUseEchoPlan} style={[styles.echoUseBtn, { backgroundColor: C.accent }]} activeOpacity={0.7} accessibilityLabel="this works for me" accessibilityRole="button">
                    <Feather name="check" size={15} color={C.surface} />
                    <Text style={[styles.echoUseBtnText, { color: C.surface }]}>this works for me</Text>
                  </TouchableOpacity>
                  <View style={styles.echoChatInputRow}>
                    <TextInput
                      style={[styles.echoChatInputField, { color: C.textPrimary, backgroundColor: C.background, borderColor: C.border }]}
                      placeholder={'ask echo anything'}
                      placeholderTextColor={C.textMuted}
                      value={echoChatInput}
                      onChangeText={setEchoChatInput}
                      editable={!echoChatLoading}
                      multiline
                      textAlignVertical="top"
                      blurOnSubmit={false}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={C.accent}
                      accessibilityLabel="ask echo anything"
                    />
                    <TouchableOpacity
                      onPress={() => handleSendEchoChat()}
                      disabled={!echoChatInput.trim() || echoChatLoading}
                      style={[styles.echoChatSendBtn, { backgroundColor: echoChatInput.trim() ? C.accent : withAlpha(C.accent, 0.3) }]}
                      activeOpacity={0.7}
                      accessibilityLabel="send message"
                      accessibilityRole="button"
                    >
                      <Feather name="arrow-up" size={16} color={C.surface} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      )}
    </Modal>
  );
};

// ─── Styles ──────────────────────────────────────────────────

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    container: { flex: 1 },

    oblOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    // Obligations summary card (tap → bottom sheet)
    oblCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: withAlpha(C.textPrimary, 0.06),
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.xs),
    },
    oblCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
    },
    oblCardIcon: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.xl,
      backgroundColor: withAlpha(C.accent, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    oblCardContent: {
      flex: 1,
      gap: 3,
    },
    oblCardMeta: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontVariant: ['tabular-nums'],
      marginTop: 2,
    },
    // Obligations bottom-sheet header
    oblCardHeader: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.sm,
    },
    oblHeaderSub: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      marginTop: 2,
    },

    modalTitle: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
    },

    // Selection bar
    selectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      backgroundColor: C.surface,
      gap: SPACING.sm,
    },
    selectionClose: {
      padding: SPACING.xs,
    },
    selectionCount: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    selectionActions: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    selectionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.lg,
      borderWidth: StyleSheet.hairlineWidth,
    },
    selectionBtnText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
    },

    // Float edit modal
    floatEditKAV: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    floatEditCard: {
      width: '88%',
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: C.border,
      padding: SPACING.xl,
    },
    floatEditHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.lg,
    },
    floatEditInput: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      marginBottom: SPACING.sm,
    },
    floatEditAmountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    floatEditCurrency: {
      fontSize: TYPOGRAPHY.size.base,
      marginRight: SPACING.sm,
    },
    floatEditAmountInput: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      padding: 0,
    },
    floatEditSave: {
      borderRadius: RADIUS.lg,
      paddingVertical: SPACING.md,
      alignItems: 'center',
    },
    floatEditSaveText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.medium,
    },

    // Top bar
    topBar: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm,
    },
    closeBtn: {
      width: 36, height: 36, borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.12 : 0.06),
      alignItems: 'center', justifyContent: 'center',
    },
    topBarTitle: {
      flex: 1, textAlign: 'center',
      fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textSecondary, textTransform: 'lowercase',
    },
    readOnlyBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full },
    readOnlyText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.medium },

    listContent: { paddingHorizontal: SPACING.lg },

    // ── Close-out summary (read-only / closed playbook) ─────
    closeoutZone: {
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.sm,
    },
    closeoutHeadlineCard: {
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      paddingVertical: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      gap: 4,
      marginBottom: SPACING.xs,
    },
    closeoutEyebrow: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.4,
      textTransform: 'lowercase',
    },
    closeoutHeadlineAmount: {
      fontSize: TYPOGRAPHY.size['3xl'],
      fontWeight: TYPOGRAPHY.weight.light,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
      marginTop: 2,
    },
    closeoutSub: {
      fontSize: TYPOGRAPHY.size.xs,
      fontVariant: ['tabular-nums'],
    },

    // ── Premium card-forward hero (re-skin) ────────────────
    // header row: mascot tile + word-mark
    heroHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    mascotTile: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.xl,
      backgroundColor: withAlpha(C.accent, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroWordMark: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textPrimary,
    },
    heroHeadline: {
      fontSize: TYPOGRAPHY.size['2xl'],
      fontWeight: TYPOGRAPHY.weight.light,
      color: C.textPrimary,
      lineHeight: TYPOGRAPHY.size['2xl'] * TYPOGRAPHY.lineHeight.tight,
      marginBottom: SPACING.lg,
    },

    // status card — the centerpiece
    statusCard: {
      backgroundColor: C === CALM_DARK ? C.surface : withAlpha(C.accent, 0.05),
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: C.border,
      padding: SPACING.lg,
      marginBottom: SPACING.md,
      ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.xs),
    },
    statusTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: RADIUS.full,
    },
    statusWord: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    statusAllowance: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
      marginBottom: SPACING.sm,
    },
    statusBarTrack: {
      height: 4,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textMuted, 0.12),
      overflow: 'hidden',
    },
    statusBarFill: {
      height: 4,
      borderRadius: RADIUS.full,
      backgroundColor: C.accent,
    },
    statusCaption: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      marginTop: SPACING.xs,
      fontVariant: ['tabular-nums'],
    },

    // two-up stat pills
    pillRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    statPill: {
      flex: 1,
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: withAlpha(C.textPrimary, 0.06),
      padding: SPACING.md,
      ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.xs),
    },
    statPillTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.xs,
    },
    statPillLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
    },
    statPillIcon: {
      width: 28,
      height: 28,
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(C.accent, 0.1),
    },
    statPillValue: {
      fontSize: TYPOGRAPHY.size['2xl'],
      fontWeight: TYPOGRAPHY.weight.light,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    statPillValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 2,
    },
    statPillUnit: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textMuted,
    },
    statPillSub: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      marginTop: 2,
    },

    // section title row + inline meta + details link
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionMetaInline: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontVariant: ['tabular-nums'],
    },
    sectionDetailsLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    sectionDetailsText: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.accent,
      fontWeight: TYPOGRAPHY.weight.medium,
    },

    // shared tile row (obligations / line items / spending / closeout)
    tileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      gap: SPACING.md,
    },
    leadTile: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileContent: {
      flex: 1,
      gap: 3,
    },
    tileTitle: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textPrimary,
    },
    tileSubtitle: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
    },
    tileValue: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    tileDot: {
      width: 8,
      height: 8,
      borderRadius: RADIUS.full,
    },

    // ── Echo Copilot hero ──────────────────────────────────
    // paddingBottom (sm) + the first section header's marginTop ('3xl') sum to
    // SPACING['4xl'] — a deliberately bigger gap from the hero to the first section
    // than the SPACING['3xl'] used between sections.
    heroZone: {
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.sm,
    },

    // 1 · eyebrow
    heroEyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.xs,
      paddingHorizontal: SPACING.xs,
    },
    heroEyebrowTile: {
      width: 22,
      height: 22,
      borderRadius: RADIUS.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroEyebrowText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.5,
      textTransform: 'lowercase',
    },

    // 2 · focal — calm + plain, leads the first screenful. It's the protagonist:
    // the echoTipCard sits a full SPACING['3xl'] below it (set on echoTipCard), so
    // this block carries no bottom margin of its own.
    focalWrap: {
      marginTop: SPACING.lg,
      marginBottom: 0,
      paddingHorizontal: SPACING.xs,
    },
    focalLead: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.regular,
      textTransform: 'lowercase',
      letterSpacing: 0.2,
    },
    focalAmount: {
      fontSize: TYPOGRAPHY.size['4xl'],
      fontWeight: TYPOGRAPHY.weight.light,
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
      marginTop: 2,
    },
    focalDaily: {
      fontSize: TYPOGRAPHY.size.sm,
      fontVariant: ['tabular-nums'],
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
      marginTop: SPACING.sm,
    },
    focalStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginTop: SPACING.sm,
    },
    focalStatusDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    focalStatusText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
      textTransform: 'lowercase',
    },

    // 3 · echo command bar
    // 3 · Echo coaching tip — mirrors Goals echoTipCard (no border/shadow,
    // faint accent wash). The whole card is the tap target → real Echo chat.
    echoTipCard: {
      backgroundColor: withAlpha(C.accent, 0.06),
      borderRadius: RADIUS.xl,
      padding: SPACING.md,
      // air between the focal block (protagonist) and the sole Echo affordance
      marginTop: SPACING['3xl'],
    },
    echoTipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.xs,
    },
    echoTipTag: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.accent,
    },
    echoTipLink: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: withAlpha(C.accent, 0.6),
    },
    echoTipText: {
      fontSize: TYPOGRAPHY.size.sm,
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.tight,
    },

    // Single calm spending line — replaces the two-up vitals cards.
    // Sits just below "the plan" divider, one line of prose, no boxes.
    vitalsLine: {
      fontSize: TYPOGRAPHY.size.sm,
      fontVariant: ['tabular-nums'],
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
      paddingHorizontal: SPACING.xs,
      marginBottom: SPACING.md,
    },
    vitalsLineAmount: {
      fontWeight: TYPOGRAPHY.weight.semibold,
      fontVariant: ['tabular-nums'],
    },

    // Section headers — SPACING['3xl'] of air above each major header.
    sectionHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: SPACING['3xl'], marginBottom: SPACING.sm, paddingHorizontal: SPACING.xs,
    },
    sectionTitle: {
      fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary, textTransform: 'lowercase', letterSpacing: 0.2,
    },
    // "your plan" is the protagonist section — a notch larger than other headers.
    sectionTitlePlan: {
      fontSize: TYPOGRAPHY.size.lg,
    },
    sectionRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    sectionMeta: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontVariant: ['tabular-nums'], textAlign: 'right' },
    // Committed-vs-flexible anchor line — muted, sits between obligations + plan
    planAnchor: {
      fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontVariant: ['tabular-nums'],
      paddingHorizontal: SPACING.xs, marginTop: -SPACING.xs, marginBottom: SPACING.xs,
    },
    // "left to live on" derived footer — sits below the plan buckets, slightly
    // more prominent than the obligation anchor (sm vs xs, textSecondary vs textMuted).
    planAnchorLiving: {
      fontSize: TYPOGRAPHY.size.sm,
      fontVariant: ['tabular-nums'],
      paddingHorizontal: SPACING.xs,
      marginTop: SPACING.sm,
      marginBottom: SPACING.xs,
    },

    // AI loading (shown in plan header while echo is generating a plan)
    aiLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    aiLoadingText: { fontSize: TYPOGRAPHY.size.xs },

    // Obligation rows (inside grouped card)
    oblRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
      borderRadius: RADIUS.md,
    },
    oblContent: { flex: 1, gap: 2 },
    oblLabel: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.regular },
    oblLabelCovered: { textDecorationLine: 'line-through' },
    oblMeta: { fontSize: TYPOGRAPHY.size.xs },
    oblRight: { alignItems: 'flex-end', gap: 4 },
    oblAmount: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.medium, fontVariant: ['tabular-nums'] },
    oblTypeBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: RADIUS.full },
    oblTypeText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.medium },

    // Shared checkbox
    checkbox: { marginRight: SPACING.md },
    // Derived-spend progress ring (plan line items): centers the fill badge.
    lineRing: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
    lineRingFill: {
      width: 18, height: 18, borderRadius: 9,
      alignItems: 'center', justifyContent: 'center',
    },
    // "nothing set aside yet" placeholder — a quiet dot in the ring slot.
    // No border ring (keeps it visually distinct from the obligation checkCircle).
    lineEmptyDot: { width: 7, height: 7, borderRadius: 3.5 },
    checkCircle: {
      width: 24, height: 24, borderRadius: 12, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },

    // Line item rows (inside grouped card)
    lineRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
      borderRadius: RADIUS.md,
    },
    lineContent: { flex: 1 },
    lineDisplay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    lineLabel: {
      fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.regular,
      flex: 1, marginRight: SPACING.sm,
    },
    lineLabelPaid: { textDecorationLine: 'line-through' },
    lineAmount: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.medium, fontVariant: ['tabular-nums'] },
    editRow: { gap: SPACING.sm },
    editLabelInput: { fontSize: TYPOGRAPHY.size.base, padding: SPACING.sm, borderRadius: RADIUS.sm, borderWidth: 1 },
    editAmountBox: {
      flexDirection: 'row', alignItems: 'center',
      borderRadius: RADIUS.sm, borderWidth: 1, paddingHorizontal: SPACING.sm,
    },
    editCurrencyLabel: { fontSize: TYPOGRAPHY.size.sm, marginRight: SPACING.xs },
    editAmountInput: { flex: 1, fontSize: TYPOGRAPHY.size.base, paddingVertical: SPACING.sm, fontVariant: ['tabular-nums'] },

    // Add section
    addSection: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      borderTopLeftRadius: RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
      borderBottomLeftRadius: RADIUS.xl,
      borderBottomRightRadius: RADIUS.xl,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderWidth: 1,
      borderColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.1 : 0.06),
      gap: SPACING.sm,
      marginBottom: SPACING.md,
      ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.xs),
    },
    // when add row sits directly under grouped line items, merge visually:
    // square the top, drop the top border + shadow so it reads as one card.
    addSectionGrouped: {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderTopWidth: 0,
      marginTop: 0,
      ...SHADOWS.none,
    },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.sm },
    addIcon: { width: 32, height: 32, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
    addLabelInput: { flex: 1, fontSize: TYPOGRAPHY.size.base, padding: 0 },
    addAmountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.sm },
    addCurrency: { fontSize: TYPOGRAPHY.size.sm },
    addAmountInput: { flex: 1, fontSize: TYPOGRAPHY.size.base, padding: 0, fontVariant: ['tabular-nums'] },
    addBtn: { width: 36, height: 36, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
    lineCatDot: { width: 8, height: 8, borderRadius: 4, marginRight: SPACING.xs },

    // Spending rows
    spendRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.sm, gap: SPACING.sm,
    },
    spendDot: { width: 8, height: 8, borderRadius: 4 },
    spendLabel: { flex: 1, fontSize: TYPOGRAPHY.size.sm },
    spendRight: { alignItems: 'flex-end', gap: 2 },
    spendAmount: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, fontVariant: ['tabular-nums'] },
    spendPercent: { fontSize: TYPOGRAPHY.size.xs },
    unplannedBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: RADIUS.full },
    unplannedText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.medium },

    // Echo floating modal
    echoOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    echoKAV: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingHorizontal: SPACING.xl, // gutters — card can't reach screen edges (RN-Web safe)
      paddingVertical: SPACING.xl,
    },
    echoModal: {
      width: '100%', // fills the guttered parent (which has paddingHorizontal)
      maxWidth: 380, // hard cap — a contained card, never edge-to-edge
      alignSelf: 'center',
      maxHeight: '85%',
      borderRadius: RADIUS.xl,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.lg),
    },
    echoHeaderRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xs,
    },
    echoHeaderActions: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: SPACING.md,
    },
    echoReaskBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
    },
    echoReaskText: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    // Turn wrappers + conversational copy
    echoTurnWrap: { gap: SPACING.md },
    echoSay: {
      fontSize: TYPOGRAPHY.size.base,
      lineHeight: TYPOGRAPHY.size.base * TYPOGRAPHY.lineHeight.relaxed,
    },
    echoMiniLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      marginTop: SPACING.sm,
    },
    // Intent chips (turn 0)
    echoChipWrap: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
    echoChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: RADIUS.full,
      borderWidth: 1,
    },
    echoChipText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    echoChipRow: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: SPACING.sm,
    },
    echoPill: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 2,
      borderRadius: RADIUS.full,
      borderWidth: 1,
    },
    echoPillText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    // demoted free-text escape hatch
    echoFreeRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-end' as const, // send arrow stays at bottom as the input grows
      gap: SPACING.sm,
      marginTop: SPACING.sm,
    },
    echoFreeInput: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.xl,
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: 40,
      maxHeight: 110, // grows then scrolls — never hides text
    },
    echoFreeSend: {
      width: 34, height: 34, borderRadius: 17,
      alignItems: 'center' as const, justifyContent: 'center' as const,
    },
    // user's own bubble
    echoUserRow: { alignItems: 'flex-end' as const },
    echoUserBubble: {
      maxWidth: '85%' as any,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.lg,
    },
    echoUserText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    echoThinkingRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
    echoScrollContent: {
      padding: SPACING.xl,
      gap: SPACING.lg,
      paddingBottom: SPACING.sm,
    },
    echoTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    echoTitle: {
      fontSize: TYPOGRAPHY.size.xl,
      fontWeight: TYPOGRAPHY.weight.semibold,
    },
    echoInputsWrap: {
      gap: SPACING.xs,
    },
    echoInputsLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    echoInputRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
    },
    echoInputText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.sm,
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.normal,
    },
    echoPlanLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    echoItemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    echoCheck: {
      width: 20, height: 20, borderRadius: 10, borderWidth: 1.5,
      alignItems: 'center', justifyContent: 'center', marginTop: 2,
    },
    echoItemLeft: { flex: 1, gap: 4 },
    echoItemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    echoItemLabel: { fontSize: TYPOGRAPHY.size.base, flex: 1, marginRight: SPACING.sm },
    echoItemAmount: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      fontVariant: ['tabular-nums'] as any,
    },
    echoRationale: {
      fontSize: TYPOGRAPHY.size.sm,
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
    },
    // inline amount entry (set amount / tap-to-edit)
    echoEditRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.xs },
    echoAmountInput: {
      minWidth: 64,
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      fontVariant: ['tabular-nums'] as any,
      borderBottomWidth: 1.5,
      paddingVertical: 0,
      textAlign: 'right' as const,
    },
    // needs-input choice chips
    echoAskChoiceRow: { flexDirection: 'row' as const, gap: SPACING.sm, marginTop: 2 },
    echoTinyChip: {
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
      borderWidth: 1,
    },
    echoTinyChipText: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    // turn 3 in-place steppers
    echoStepRow: { flexDirection: 'row' as const, gap: SPACING.sm, marginTop: 2 },
    echoStepBtn: {
      width: 30, height: 30, borderRadius: 15, borderWidth: 1,
      alignItems: 'center' as const, justifyContent: 'center' as const,
    },
    // local leftover line
    echoLeftoverRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingTop: SPACING.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    echoLeftoverLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    echoLeftoverAmount: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      fontVariant: ['tabular-nums'] as any,
    },
    echoSummaryCard: {
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      borderWidth: StyleSheet.hairlineWidth,
    },
    echoSummaryText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.medium,
      lineHeight: TYPOGRAPHY.size.base * TYPOGRAPHY.lineHeight.relaxed,
    },
    echoGentleWarn: {
      fontSize: TYPOGRAPHY.size.sm,
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
    },
    echoFooter: {
      padding: SPACING.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      gap: SPACING.sm,
    },
    echoUseBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS.full,
    },
    echoUseBtnText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.medium,
    },

    // Echo chat
    echoChatWrap: {
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },
    echoChatUserRow: {
      alignItems: 'flex-end' as const,
    },
    echoChatEchoRow: {
      alignItems: 'flex-start' as const,
    },
    echoChatBubble: {
      maxWidth: '85%' as any,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
    },
    echoChatText: {
      fontSize: TYPOGRAPHY.size.sm,
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
    },
    echoChatInputRow: {
      flexDirection: 'row' as const,
      gap: SPACING.sm,
      alignItems: 'flex-end' as const, // send button stays at bottom as the input grows
      width: '100%' as any,
      marginTop: SPACING.xs,
    },
    echoChatInputField: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.xl,
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: 38,
      maxHeight: 110, // grows then scrolls — never hides text
    },
    echoChatSendBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    // Empty plan
    emptyPlan: { alignItems: 'center', paddingTop: SPACING.md, paddingBottom: SPACING.lg, gap: SPACING.sm },
    emptyPenTile: {
      width: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyPlanText: {
      fontSize: TYPOGRAPHY.size.sm, textAlign: 'center',
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
    },
    emptyPlanActions: {
      flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
      gap: SPACING.sm, marginTop: SPACING.sm,
    },
    emptyAiBtn: {
      flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
      paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 2,
      borderRadius: RADIUS.full,
    },
    emptyManualBtn: {
      flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
      paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 2,
      borderRadius: RADIUS.full, borderWidth: 1,
    },
    emptyAiBtnText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium },

    // Manual "your plan" editor (reuses echo float shell: echoOverlay / echoKAV / echoModal)
    planEditorMeta: {
      fontSize: TYPOGRAPHY.size.sm,
      fontVariant: ['tabular-nums'],
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.xs,
    },
    planEditorScroll: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.lg,
      gap: SPACING.sm,
    },
    planEditorEmpty: {
      fontSize: TYPOGRAPHY.size.sm,
      textAlign: 'center',
      paddingVertical: SPACING.lg,
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
    },
    planEditorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.sm,
      borderRadius: RADIUS.lg,
      borderWidth: StyleSheet.hairlineWidth,
    },
    planEditorRowMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    planEditorRowLabel: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
    },
    planEditorRowAmount: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
      fontVariant: ['tabular-nums'],
    },
    planEditorRemove: {
      width: 32, height: 32, borderRadius: RADIUS.full,
      alignItems: 'center', justifyContent: 'center',
    },
    planEditorAddCard: {
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      padding: SPACING.md,
      gap: SPACING.sm,
      marginTop: SPACING.xs,
    },
    planEditorAddLabel: {
      fontSize: TYPOGRAPHY.size.base,
      minHeight: 40,
      maxHeight: 110,
      padding: 0,
    },
    planEditorAddAmountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    planEditorAddAmount: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      padding: 0,
      fontVariant: ['tabular-nums'],
    },
    planEditorDone: {
      margin: SPACING.lg,
      marginTop: SPACING.sm,
      borderRadius: RADIUS.lg,
      paddingVertical: SPACING.md,
      alignItems: 'center',
    },
    planEditorDoneText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.medium,
    },

    // Quick notes (always visible)
    quickNoteWrap: { marginTop: SPACING.lg, gap: SPACING.sm },
    quickNoteLabel: {
      fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.medium,
      color: withAlpha(C.textMuted, 0.7),
      textTransform: 'lowercase', paddingHorizontal: SPACING.xs,
    },
    quickNoteInput: {
      fontSize: TYPOGRAPHY.size.base,
      lineHeight: TYPOGRAPHY.size.base * TYPOGRAPHY.lineHeight.relaxed,
      padding: SPACING.md, borderRadius: RADIUS.lg, minHeight: 64,
      textAlignVertical: 'top',
    },

    // Echo ambient insight (calm one-line, lower in list)
    echoInsightRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      marginTop: SPACING.lg,
      marginHorizontal: SPACING.xs,
      marginBottom: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.accent, 0.05),
    },
    echoInsightText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.sm,
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
    },
  });

export default PlaybookNotebook;
