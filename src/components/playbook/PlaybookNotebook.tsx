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
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlaybookStore } from '../../store/playbookStore';
import { usePersonalStore } from '../../store/personalStore';
import { Playbook, PlaybookLineItem } from '../../types';
import { computePlaybookStats, computeNotebookStats, computeLiveStats, computeSpendingReality, SpendingCategoryItem } from '../../utils/playbookStats';
import { getPlaybookObligations, PlaybookObligation } from '../../utils/playbookObligations';
import { lightTap, selectionChanged, mediumTap } from '../../services/haptics';
import { askEchoPlan, chatWithEcho, getPlaybookInsight, buildEchoMemoryEntry, EchoPlanResponse, EchoPlanItem } from '../../services/playbookAI';
import { isGeminiAvailable } from '../../services/geminiClient';
import { useCategories } from '../../hooks/useCategories';

// ─── Types ───────────────────────────────────────────────────

interface Props {
  playbook: Playbook;
  readOnly?: boolean;
  onClose: () => void;
  onNavigate?: (screen: string, params?: Record<string, any>) => void;
  initialOblExpanded?: boolean;
}

type SectionItem =
  | { type: 'hero'; key: string }
  | { type: 'sectionHeader'; key: string; title: string; count?: number; amount?: number; showAI?: boolean }
  | { type: 'obligation'; key: string; data: PlaybookObligation }
  | { type: 'lineItem'; key: string; data: PlaybookLineItem }
  | { type: 'addItem'; key: string }
  | { type: 'spendingRow'; key: string; data: SpendingCategoryItem }
  | { type: 'aiInsight'; key: string; text: string }
  | { type: 'quickNote'; key: string }
  | { type: 'emptyPlan'; key: string }
  | { type: 'spacer'; key: string };

// ─── Memoized Sub-Components ─────────────────────────────────

const ObligationRow = React.memo(({
  item, currency, C, readOnly, onToggle, onTap,
}: {
  item: PlaybookObligation; currency: string; C: typeof CALM; readOnly: boolean; onToggle: () => void; onTap?: () => void;
}) => {
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <TouchableOpacity
      activeOpacity={onTap ? 0.7 : 1}
      onPress={onTap}
      style={[styles.oblRow, item.isCovered && { backgroundColor: withAlpha(C.accent, 0.03) }]}
    >
      <TouchableOpacity
        onPress={readOnly ? undefined : onToggle}
        disabled={readOnly}
        style={styles.checkbox}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={[
          styles.checkCircle,
          { borderColor: item.isCovered ? C.accent : withAlpha(C.textMuted, 0.3) },
          item.isCovered && { backgroundColor: C.accent },
        ]}>
          {item.isCovered && <Feather name="check" size={13} color={C.surface} />}
        </View>
      </TouchableOpacity>
      <View style={styles.oblContent}>
        <Text style={[styles.oblLabel, item.isCovered && styles.oblLabelCovered, { color: item.isCovered ? C.textMuted : C.textPrimary }]} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={[styles.oblMeta, { color: C.textMuted }]} numberOfLines={1}>{item.meta}</Text>
      </View>
      <View style={styles.oblRight}>
        <Text style={[styles.oblAmount, { color: item.isCovered ? C.textMuted : C.textPrimary }]}>
          {currency} {item.amount.toLocaleString('en-MY')}
        </Text>
        <View style={[styles.oblTypeBadge, { backgroundColor: withAlpha(item.type === 'subscription' ? C.accent : C.bronze, 0.08) }]}>
          <Text style={[styles.oblTypeText, { color: item.type === 'subscription' ? C.accent : C.bronze }]}>
            {item.type === 'subscription' ? 'sub' : 'debt'}
          </Text>
        </View>
      </View>
      {onTap && <Feather name="chevron-right" size={14} color={withAlpha(C.textMuted, 0.3)} style={{ marginLeft: 4 }} />}
    </TouchableOpacity>
  );
});

const LineItemRow = React.memo(({
  item, currency, C, readOnly, categoryColor, committedAmount,
  selectionMode, isSelected, onTogglePaid, onPress, onLongPress,
}: {
  item: PlaybookLineItem; currency: string; C: typeof CALM; readOnly: boolean;
  categoryColor?: string; committedAmount?: number;
  selectionMode: boolean; isSelected: boolean;
  onTogglePaid: () => void; onPress: () => void; onLongPress: () => void;
}) => {
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable
      style={[styles.lineRow, item.isPaid && !selectionMode && { backgroundColor: withAlpha(C.accent, 0.03) }, isSelected && { backgroundColor: withAlpha(C.accent, 0.08) }]}
      onPress={readOnly ? undefined : onPress}
      onLongPress={readOnly ? undefined : onLongPress}
      delayLongPress={400}
      disabled={readOnly}
    >
      <TouchableOpacity
        onPress={readOnly ? undefined : (selectionMode ? onPress : onTogglePaid)}
        disabled={readOnly}
        style={styles.checkbox}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={[
          styles.checkCircle,
          selectionMode
            ? { borderColor: isSelected ? C.accent : withAlpha(C.textMuted, 0.3), backgroundColor: isSelected ? C.accent : 'transparent' }
            : { borderColor: item.isPaid ? C.accent : withAlpha(C.textMuted, 0.3), backgroundColor: item.isPaid ? C.accent : 'transparent' },
        ]}>
          {(selectionMode ? isSelected : item.isPaid) && <Feather name="check" size={13} color={C.surface} />}
        </View>
      </TouchableOpacity>
      <View style={styles.lineContent}>
        <View style={styles.lineDisplay}>
          {categoryColor && !selectionMode && (
            <View style={[styles.lineCatDot, { backgroundColor: categoryColor }]} />
          )}
          <Text
            style={[styles.lineLabel, item.isPaid && !selectionMode && styles.lineLabelPaid, { color: item.isPaid && !selectionMode ? C.textMuted : C.textPrimary }]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
          <Text style={[styles.lineAmount, { color: item.isPaid && !selectionMode ? C.textMuted : (committedAmount && committedAmount > item.plannedAmount ? C.bronze : C.textPrimary) }]}>
            {committedAmount && committedAmount > 0
              ? <>{currency} {Math.round(committedAmount).toLocaleString('en-MY')}<Text style={{ color: C.textMuted }}> / {Math.round(item.plannedAmount).toLocaleString('en-MY')}</Text></>
              : <>{currency} {(item.actualAmount ?? item.plannedAmount).toLocaleString('en-MY')}</>
            }
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const SpendingRow = React.memo(({
  item, currency, C, catColor,
}: {
  item: SpendingCategoryItem; currency: string; C: typeof CALM; catColor?: string;
}) => {
  const styles = useMemo(() => makeStyles(C), [C]);
  const isOver = item.allocatedAmount != null && item.spent > item.allocatedAmount;
  return (
    <View style={styles.spendRow}>
      <View style={[styles.spendDot, { backgroundColor: catColor || C.accent }]} />
      <Text style={[styles.spendLabel, { color: C.textPrimary }]} numberOfLines={1}>{item.category}</Text>
      {!item.isPlanned && (
        <View style={[styles.unplannedBadge, { backgroundColor: withAlpha(C.bronze, 0.08) }]}>
          <Text style={[styles.unplannedText, { color: C.bronze }]}>unplanned</Text>
        </View>
      )}
      <View style={styles.spendRight}>
        {item.allocatedAmount != null ? (
          <Text style={[styles.spendAmount, { color: isOver ? C.bronze : C.textPrimary }]}>
            {currency} {Math.round(item.spent).toLocaleString('en-MY')}
            <Text style={{ color: C.textMuted }}> / {Math.round(item.allocatedAmount).toLocaleString('en-MY')}</Text>
          </Text>
        ) : (
          <Text style={[styles.spendAmount, { color: C.textPrimary }]}>{currency} {Math.round(item.spent).toLocaleString('en-MY')}</Text>
        )}
        <Text style={[styles.spendPercent, { color: C.textMuted }]}>{Math.round(item.percentOfTotal)}%</Text>
      </View>
    </View>
  );
});

// ─── Main Component ──────────────────────────────────────────

const PlaybookNotebook: React.FC<Props> = ({ playbook, readOnly = false, onClose, onNavigate, initialOblExpanded = false }) => {
  const C = useCalm();
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

  // Obligations
  const obligations = useMemo(
    () => getPlaybookObligations(livePb, livePb.coveredObligationIds || []),
    [livePb],
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

  // Obligations float modal
  const [oblModalVisible, setOblModalVisible] = useState(initialOblExpanded);

  // Quick note state
  const [noteExpanded, setNoteExpanded] = useState(false);
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

  const handleAskEcho = useCallback(async () => {
    lightTap();
    // If plan already exists, just reopen the modal
    if (echoPlan && !aiLoading) {
      setEchoModalVisible(true);
      return;
    }
    setAiLoading(true);
    setAiError('');
    setEchoModalVisible(true);
    const result = await askEchoPlan(livePb);
    setAiLoading(false);
    if (result.ok) {
      setEchoPlan(result.plan);
      setEchoSelected(result.plan.items.map(() => true));
      setEchoMessages([]);
      setEchoChatInput('');
    } else {
      setAiError(result.error);
      setEchoModalVisible(false);
      Alert.alert('echo', result.error);
    }
  }, [livePb, echoPlan, aiLoading]);

  // Re-generate a fresh plan (called from inside the modal)
  const handleReaskEcho = useCallback(async () => {
    lightTap();
    setAiLoading(true);
    setAiError('');
    const result = await askEchoPlan(livePb);
    setAiLoading(false);
    if (result.ok) {
      setEchoPlan(result.plan);
      setEchoSelected(result.plan.items.map(() => true));
      setEchoMessages([]);
      setEchoChatInput('');
    } else {
      Alert.alert('echo', result.error);
    }
  }, [livePb]);

  const toggleEchoItem = useCallback((index: number) => {
    lightTap();
    setEchoSelected((prev) => prev.map((v, i) => i === index ? !v : v));
  }, []);

  const handleUseEchoPlan = useCallback(() => {
    if (!echoPlan) return;
    selectionChanged();
    const s = store.getState();
    const existing = livePb.lineItems || [];
    echoPlan.items.forEach((item, i) => {
      if (!echoSelected[i]) return;
      const cat = item.category || matchCategory(item.label);
      // Check if item with same label already exists — update instead of duplicate
      const match = existing.find((li) => li.label.toLowerCase() === item.label.toLowerCase());
      if (match) {
        s.updateLineItem(livePb.id, match.id, {
          plannedAmount: item.amount,
          category: cat,
        });
      } else {
        s.addLineItem(livePb.id, {
          label: item.label, plannedAmount: item.amount, isPaid: false,
          category: cat, linkedObligationIds: resolveLinkedObls(cat),
        });
      }
    });
    // Close modal + clear plan (items are now in notebook)
    setEchoModalVisible(false);
    setEchoPlan(null);
    setEchoMessages([]);
    setEchoChatInput('');
  }, [livePb, echoPlan, echoSelected, matchCategory, resolveLinkedObls]);

  const handleDismissEcho = useCallback(() => {
    // Save echo memory if there's a plan (persist across sessions)
    if (echoPlan && livePb) {
      const memEntry = buildEchoMemoryEntry(livePb, echoPlan, echoMessages);
      usePlaybookStore.getState().saveEchoSession(memEntry);
    }
    setEchoModalVisible(false);
  }, [echoPlan, livePb, echoMessages]);

  const handleSendEchoChat = useCallback(async () => {
    const text = echoChatInput.trim();
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

  // ─── Date formatting ────────────────────────────────────
  const dateRange = useMemo(() => {
    const start = livePb.startDate instanceof Date ? livePb.startDate : new Date(livePb.startDate);
    const end = livePb.endDate
      ? (livePb.endDate instanceof Date ? livePb.endDate : new Date(livePb.endDate))
      : (livePb.suggestedEndDate instanceof Date ? livePb.suggestedEndDate : new Date(livePb.suggestedEndDate));
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
  }, [livePb.startDate, livePb.endDate, livePb.suggestedEndDate]);

  // ─── Pace indicators ────────────────────────────────────
  const paceLabel = useMemo(() => {
    if (pbStats.totalSpent === 0) return 'just started';
    if (liveStats.paceRatio <= 0.85) return 'ahead of pace';
    if (liveStats.paceRatio <= 1.1) return 'on track';
    if (liveStats.paceRatio <= 1.3) return 'slightly fast';
    return 'spending fast';
  }, [liveStats.paceRatio, pbStats.totalSpent]);

  const paceColor = useMemo(() => {
    if (liveStats.paceRatio <= 1.1) return C.accent;
    if (liveStats.paceRatio <= 1.3) return C.bronze;
    return C.gold;
  }, [liveStats.paceRatio, C]);

  // ─── Build data array ────────────────────────────────────
  const sectionData = useMemo(() => {
    const data: SectionItem[] = [];

    data.push({ type: 'hero', key: 'hero' });

    // Obligations — header only; items shown in floating modal
    if (obligations.items.length > 0) {
      data.push({ type: 'sectionHeader', key: 'sh-obl', title: 'obligations', count: obligations.items.length, amount: obligations.totalAmount });
    }

    // Plan items
    data.push({
      type: 'sectionHeader', key: 'sh-plan', title: 'your plan',
      count: lineItems.length > 0 ? lineItems.length : undefined,
      amount: lineItems.length > 0 ? nbStats.totalPlanned : undefined,
      showAI: !readOnly && hasAI && !aiLoading,
    });

    if (lineItems.length === 0 && !echoPlan) {
      data.push({ type: 'emptyPlan', key: 'empty-plan' });
    }

    for (const li of lineItems) {
      data.push({ type: 'lineItem', key: `li-${li.id}`, data: li });
    }

    if (!readOnly) {
      data.push({ type: 'addItem', key: 'add-item' });
    }

    // Spending reality
    if (spendingReality.length > 0) {
      const totalSpent = spendingReality.reduce((s, c) => s + c.spent, 0);
      data.push({ type: 'sectionHeader', key: 'sh-spend', title: "where it's actually going", amount: totalSpent });
      for (const cat of spendingReality.slice(0, 8)) {
        data.push({ type: 'spendingRow', key: `sc-${cat.category}`, data: cat });
      }
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
  }, [obligations, lineItems, nbStats, spendingReality, aiInsight, echoPlan, aiLoading, readOnly, hasAI, livePb.notebookNote, oblModalVisible]);

  // ─── Render dispatcher ───────────────────────────────────
  const renderItem = useCallback(({ item }: { item: SectionItem }) => {
    switch (item.type) {
      case 'hero': {
        const freeAfterObl = livePb.sourceAmount - obligations.totalAmount;
        return (
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>where your salary goes</Text>
            <Text style={styles.heroAmount}>{currency} {livePb.sourceAmount.toLocaleString('en-MY')}</Text>
            <Text style={styles.heroSub}>{livePb.name} · {dateRange}</Text>

            {obligations.items.length > 0 && (
              <Text style={[styles.heroAfterObl, { color: C.textSecondary }]}>
                {currency} {Math.max(0, Math.round(freeAfterObl)).toLocaleString('en-MY')} free after obligations
              </Text>
            )}

            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatValue, { color: C.textPrimary }]}>
                  {currency} {Math.max(0, Math.round(liveStats.remaining)).toLocaleString('en-MY')}
                </Text>
                <Text style={[styles.heroStatLabel, { color: C.textMuted }]}>remaining</Text>
              </View>
              <View style={[styles.heroDivider, { backgroundColor: withAlpha(C.textMuted, 0.15) }]} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatValue, { color: C.textPrimary }]}>
                  {liveStats.burnRate > 0 ? `${currency} ${Math.round(liveStats.burnRate).toLocaleString('en-MY')}/d` : 'no spending yet'}
                </Text>
                <Text style={[styles.heroStatLabel, { color: C.textMuted }]}>burn rate</Text>
              </View>
              <View style={[styles.heroDivider, { backgroundColor: withAlpha(C.textMuted, 0.15) }]} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatValue, { color: C.textPrimary }]}>{liveStats.daysLeft}</Text>
                <Text style={[styles.heroStatLabel, { color: C.textMuted }]}>days left</Text>
              </View>
            </View>

            <View style={styles.heroBarWrap}>
              <View style={[styles.heroBarTrack, { backgroundColor: withAlpha(C.textMuted, 0.08) }]}>
                <View style={[styles.heroBarFill, { width: `${Math.min(pbStats.percentSpent, 100)}%`, backgroundColor: C.accent }]} />
              </View>
              <Text style={[styles.heroPace, { color: paceColor }]}>{Math.round(pbStats.percentSpent)}% spent · {paceLabel}</Text>
            </View>
          </View>
        );
      }

      case 'sectionHeader': {
        const isObl = item.key === 'sh-obl';
        const headerContent = (
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>{item.title}</Text>
              {isObl && <Feather name="chevron-right" size={14} color={C.textMuted} style={{ marginLeft: 4 }} />}
            </View>
            <View style={styles.sectionRight}>
              {item.count != null && (
                <Text style={styles.sectionMeta}>
                  {item.count} items{item.amount != null ? ` · ${currency} ${item.amount.toLocaleString('en-MY')}` : ''}
                </Text>
              )}
              {!item.count && item.amount != null && (
                <Text style={styles.sectionMeta}>{currency} {item.amount.toLocaleString('en-MY')}</Text>
              )}
              {item.showAI && (
                <TouchableOpacity
                  onPress={handleAskEcho}
                  style={[styles.aiBtn, { backgroundColor: withAlpha(C.accent, echoPlan ? 0.15 : 0.08) }]}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="zap" size={13} color={C.accent} />
                  <Text style={[styles.aiBtnText, { color: C.accent }]}>{echoPlan ? 'view echo' : 'ask echo'}</Text>
                </TouchableOpacity>
              )}
              {aiLoading && item.key === 'sh-plan' && (
                <View style={styles.aiLoadingRow}>
                  <ActivityIndicator size="small" color={C.accent} />
                  <Text style={[styles.aiLoadingText, { color: C.textMuted }]}>echo is thinking...</Text>
                </View>
              )}
            </View>
          </View>
        );
        if (isObl) {
          return (
            <TouchableOpacity activeOpacity={0.7} onPress={() => { lightTap(); setOblModalVisible(true); }}>
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
            selectionMode={selectionMode}
            isSelected={selectedIds.has(item.data.id)}
            onTogglePaid={() => handleTogglePaid(item.data.id)}
            onPress={() => selectionMode ? toggleSelect(item.data.id) : undefined}
            onLongPress={() => handleLongPress(item.data)}
          />
        );
      }

      case 'addItem':
        return (
          <View style={styles.addSection}>
            <View style={styles.addRow}>
              <TextInput
                ref={addLabelRef}
                style={[styles.addLabelInput, { color: C.textPrimary }]}
                value={addLabel}
                onChangeText={setAddLabel}
                placeholder="rent, car loan, groceries..."
                placeholderTextColor={withAlpha(C.textMuted, 0.5)}
                returnKeyType="next"
                onSubmitEditing={() => addAmountRef.current?.focus()}
              />
            </View>
            <View style={styles.addAmountRow}>
              <Text style={[styles.addCurrency, { color: C.textMuted }]}>{currency}</Text>
              <TextInput
                ref={addAmountRef}
                style={[styles.addAmountInput, { color: C.textPrimary }]}
                value={addAmount}
                onChangeText={setAddAmount}
                placeholder="amount"
                placeholderTextColor={withAlpha(C.textMuted, 0.4)}
                keyboardType="decimal-pad"
                returnKeyType="done"
                inputAccessoryViewID="notebookAmount"
                onSubmitEditing={handleAddItem}
              />
              <TouchableOpacity
                onPress={handleAddItem}
                disabled={!addLabel.trim()}
                style={[styles.addBtn, { backgroundColor: addLabel.trim() ? C.accent : withAlpha(C.textMuted, 0.1) }]}
                activeOpacity={0.7}
              >
                <Feather name="plus" size={18} color={addLabel.trim() ? C.surface : C.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'spendingRow': {
        const spendCatInfo = getCatInfo(item.data.category);
        return <SpendingRow item={item.data} currency={currency} C={C} catColor={spendCatInfo?.color} />;
      }

      case 'aiInsight':
        return (
          <View style={[styles.insightCard, { backgroundColor: withAlpha(C.accent, 0.04) }]}>
            <Feather name="zap" size={14} color={withAlpha(C.accent, 0.6)} />
            <Text style={[styles.insightText, { color: C.textSecondary }]}>{item.text}</Text>
          </View>
        );

      case 'emptyPlan':
        return (
          <View style={styles.emptyPlan}>
            <Feather name="edit-3" size={20} color={withAlpha(C.accent, 0.3)} />
            <Text style={[styles.emptyPlanText, { color: C.textMuted }]}>
              add what you need to cover — rent, food, transport...
            </Text>
            {!readOnly && hasAI && !aiLoading && !echoPlan && (
              <TouchableOpacity
                onPress={handleAskEcho}
                style={[styles.emptyAiBtn, { backgroundColor: C.accent }]}
                activeOpacity={0.7}
              >
                <Feather name="zap" size={14} color={C.surface} />
                <Text style={[styles.emptyAiBtnText, { color: C.surface }]}>ask echo to plan</Text>
              </TouchableOpacity>
            )}
          </View>
        );

      case 'quickNote':
        return (
          <View>
            <TouchableOpacity
              style={styles.quickNoteHeader}
              onPress={() => { lightTap(); setNoteExpanded((p) => !p); }}
              activeOpacity={0.7}
            >
              <Feather name={noteExpanded ? 'chevron-down' : 'chevron-right'} size={14} color={C.textMuted} />
              <Text style={[styles.quickNoteLabel, { color: C.textMuted }]}>quick notes</Text>
            </TouchableOpacity>
            {noteExpanded && (
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
              />
            )}
          </View>
        );

      case 'spacer':
        return <View style={{ height: SPACING.xl }} />;

      default:
        return null;
    }
  }, [
    C, styles, currency, livePb, dateRange, liveStats, pbStats, paceColor, paceLabel,
    readOnly, addLabel, addAmount, selectionMode, selectedIds,
    aiLoading, echoPlan, echoSelected, hasAI, noteExpanded, noteText,
    handleToggleCovered, handleTogglePaid, handleLongPress, toggleSelect,
    handleAddItem, handleAskEcho, handleUseEchoPlan, handleDismissEcho, toggleEchoItem,
    handleNoteSave, oblModalVisible, handleObligationTap, onNavigate, obligations,
    getCatInfo, committedByLineItem,
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
          >
            <Feather name="chevron-down" size={24} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle} numberOfLines={1}>{livePb.name}</Text>
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

      {/* ── Obligations Float Modal ── */}
      <Modal
        visible={oblModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOblModalVisible(false)}
      >
        <View style={styles.oblOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOblModalVisible(false)} />
          <View style={[styles.oblCard, { backgroundColor: C.background }]} onStartShouldSetResponder={() => true}>
            <View style={styles.oblCardHeader}>
              <Text style={[styles.sectionTitle, { color: C.textPrimary }]}>obligations</Text>
              <Text style={[styles.sectionMeta, { color: C.textSecondary }]}>
                {obligations.items.length} items · {currency} {obligations.totalAmount.toLocaleString('en-MY')}
              </Text>
            </View>
            <FlatList
              data={obligations.items}
              keyExtractor={(o) => o.id}
              renderItem={({ item: obl }) => (
                <ObligationRow
                  item={obl}
                  currency={currency}
                  C={C}
                  readOnly={readOnly}
                  onToggle={() => handleToggleCovered(obl.sourceId)}
                  onTap={onNavigate ? () => { setOblModalVisible(false); handleObligationTap(obl); } : undefined}
                />
              )}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, SPACING.lg) }}
            />
          </View>
        </View>
      </Modal>

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

      {/* ── Float Edit Modal ── */}
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
                />
              </View>
              <TouchableOpacity style={[styles.floatEditSave, { backgroundColor: C.accent }]} onPress={handleEditModalSave} activeOpacity={0.85}>
                <Text style={[styles.floatEditSaveText, { color: C.surface }]}>save</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Echo Response Modal ── */}
      {echoPlan && (
        <Modal visible={echoModalVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleDismissEcho}>
          <View style={styles.echoOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleDismissEcho} />
            <KeyboardAvoidingView style={styles.echoKAV} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
              <View style={[styles.echoModal, { backgroundColor: C.background }]} onStartShouldSetResponder={() => true}>
              {/* Header row */}
              <View style={styles.echoHeaderRow}>
                <TouchableOpacity onPress={handleReaskEcho} disabled={aiLoading} style={[styles.echoReaskBtn, { backgroundColor: withAlpha(C.accent, 0.08) }]} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="refresh-cw" size={13} color={aiLoading ? C.textMuted : C.accent} />
                  <Text style={[styles.echoReaskText, { color: aiLoading ? C.textMuted : C.accent }]}>re-ask</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDismissEcho} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={20} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView ref={echoScrollRef} showsVerticalScrollIndicator={false} bounces keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={styles.echoScrollContent} onContentSizeChange={() => { if (echoMessages.length > 0) echoScrollRef.current?.scrollToEnd({ animated: true }); }}>
                {/* Title + Greeting */}
                <View>
                  <View style={styles.echoTitleRow}>
                    <Feather name="zap" size={16} color={C.accent} />
                    <Text style={[styles.echoTitle, { color: C.textPrimary }]}>echo</Text>
                  </View>
                  {echoPlan.greeting ? (
                    <Text style={[styles.echoGreetText, { color: C.textSecondary }]}>{echoPlan.greeting}</Text>
                  ) : null}
                </View>

                {/* Pain Points (warnings) — shown BEFORE items */}
                {echoPlan.warnings.length > 0 && (
                  <View style={styles.echoPainWrap}>
                    {echoPlan.warnings.map((w, i) => (
                      <View key={`warn-${i}`} style={[styles.echoPainCard, { backgroundColor: withAlpha(C.bronze, 0.08) }]}>
                        <Feather name="alert-triangle" size={14} color={C.bronze} style={{ marginTop: 1 }} />
                        <Text style={[styles.echoPainText, { color: C.bronze }]}>{w}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Section label */}
                <Text style={[styles.echoPlanLabel, { color: C.textMuted }]}>the plan</Text>

                {/* Items */}
                {echoPlan.items.map((ei, idx) => (
                  <TouchableOpacity
                    key={`${ei.label}-${idx}`}
                    style={[styles.echoItemRow, !echoSelected[idx] && { opacity: 0.4 }]}
                    onPress={() => toggleEchoItem(idx)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.echoCheck,
                      { borderColor: echoSelected[idx] ? C.accent : withAlpha(C.textMuted, 0.3) },
                      echoSelected[idx] && { backgroundColor: C.accent },
                    ]}>
                      {echoSelected[idx] && <Feather name="check" size={11} color={C.surface} />}
                    </View>
                    <View style={styles.echoItemLeft}>
                      <View style={styles.echoItemTop}>
                        <Text style={[styles.echoItemLabel, { color: C.textPrimary }]} numberOfLines={1}>{ei.label}</Text>
                        <Text style={[styles.echoItemAmount, { color: C.textPrimary }]}>{currency} {ei.amount.toLocaleString('en-MY')}</Text>
                      </View>
                      {ei.rationale ? (
                        <Text style={[styles.echoRationale, { color: C.textMuted }]} numberOfLines={2}>{ei.rationale}</Text>
                      ) : null}
                      {ei.alert ? (
                        <View style={styles.echoAlertRow}>
                          <Feather name="alert-circle" size={11} color={C.bronze} style={{ marginTop: 1 }} />
                          <Text style={[styles.echoAlertText, { color: C.bronze }]} numberOfLines={2}>{ei.alert}</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}

                {/* Summary */}
                {echoPlan.summary ? (
                  <View style={[styles.echoSummaryCard, { backgroundColor: withAlpha(C.accent, 0.04) }]}>
                    <Text style={[styles.echoSummaryText, { color: C.textSecondary }]}>{echoPlan.summary}</Text>
                  </View>
                ) : null}

                {/* Chat messages */}
                {echoMessages.length > 0 && (
                  <View style={styles.echoChatWrap}>
                    {echoMessages.map((msg, i) => (
                      <View key={i} style={msg.role === 'user' ? styles.echoChatUserRow : styles.echoChatEchoRow}>
                        <View style={[
                          styles.echoChatBubble,
                          msg.role === 'user'
                            ? { backgroundColor: withAlpha(C.accent, 0.08) }
                            : { backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
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

              {/* Footer — sticky bottom */}
              <View style={[styles.echoFooter, { borderTopColor: C.border }]}>
                <TouchableOpacity onPress={handleUseEchoPlan} style={[styles.echoUseBtn, { backgroundColor: C.accent }]} activeOpacity={0.7}>
                  <Feather name="check" size={15} color={C.surface} />
                  <Text style={[styles.echoUseBtnText, { color: C.surface }]}>use this plan</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDismissEcho} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                  <Text style={[styles.echoDismissText, { color: C.textMuted }]}>dismiss</Text>
                </TouchableOpacity>
                <View style={styles.echoChatInputRow}>
                  <TextInput
                    style={[styles.echoChatInputField, { color: C.textPrimary, backgroundColor: C.surface, borderColor: C.border }]}
                    placeholder="ask echo anything\u2026"
                    placeholderTextColor={C.textMuted}
                    value={echoChatInput}
                    onChangeText={setEchoChatInput}
                    onSubmitEditing={handleSendEchoChat}
                    returnKeyType="send"
                    editable={!echoChatLoading}
                    multiline={false}
                  />
                  <TouchableOpacity
                    onPress={handleSendEchoChat}
                    disabled={!echoChatInput.trim() || echoChatLoading}
                    style={[styles.echoChatSendBtn, { backgroundColor: echoChatInput.trim() ? C.accent : withAlpha(C.accent, 0.3) }]}
                    activeOpacity={0.7}
                  >
                    <Feather name="arrow-up" size={16} color={C.surface} />
                  </TouchableOpacity>
                </View>
              </View>
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
      justifyContent: 'center',
      alignItems: 'center',
    },
    oblCard: {
      width: '92%',
      maxHeight: '75%',
      borderRadius: RADIUS.xl,
      overflow: 'hidden',
      paddingTop: SPACING.lg,
    },
    oblCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.sm,
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
      backgroundColor: withAlpha(C.textMuted, 0.06),
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

    // Hero
    hero: { alignItems: 'center', paddingTop: SPACING.xl, paddingBottom: SPACING.lg },
    heroLabel: {
      fontSize: TYPOGRAPHY.size.xs, color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.5, textTransform: 'lowercase', marginBottom: SPACING.xs,
    },
    heroAmount: {
      fontSize: TYPOGRAPHY.size['3xl'], fontWeight: TYPOGRAPHY.weight.extraLight,
      color: C.textPrimary, fontVariant: ['tabular-nums'], letterSpacing: -0.5,
    },
    heroSub: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, marginTop: SPACING.xs },
    heroAfterObl: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, marginTop: SPACING.sm },
    heroStats: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.lg, gap: SPACING.md },
    heroStat: { alignItems: 'center', flex: 1 },
    heroStatValue: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, fontVariant: ['tabular-nums'] },
    heroStatLabel: { fontSize: TYPOGRAPHY.size.xs, marginTop: 2 },
    heroDivider: { width: 1, height: 24 },
    heroBarWrap: { width: '100%', marginTop: SPACING.md, gap: SPACING.xs },
    heroBarTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
    heroBarFill: { height: '100%', borderRadius: 3 },
    heroPace: { fontSize: TYPOGRAPHY.size.xs, textAlign: 'right', fontWeight: TYPOGRAPHY.weight.medium },

    // Section headers
    sectionHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: SPACING.lg, marginBottom: SPACING.sm, paddingHorizontal: SPACING.xs,
    },
    sectionTitle: {
      fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary, textTransform: 'lowercase', letterSpacing: 0.3,
    },
    sectionRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    sectionMeta: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted },

    // AI button
    aiBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.full,
    },
    aiBtnText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.medium },
    aiLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    aiLoadingText: { fontSize: TYPOGRAPHY.size.xs },

    // Obligation rows
    oblRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
      borderRadius: RADIUS.md, marginBottom: SPACING.xs,
    },
    oblContent: { flex: 1, gap: 2 },
    oblLabel: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.regular },
    oblLabelCovered: { textDecorationLine: 'line-through' },
    oblMeta: { fontSize: TYPOGRAPHY.size.xs },
    oblRight: { alignItems: 'flex-end', gap: 4 },
    oblAmount: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.medium, fontVariant: ['tabular-nums'] },
    oblTypeBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: RADIUS.full },
    oblTypeText: { fontSize: 10, fontWeight: TYPOGRAPHY.weight.medium },

    // Shared checkbox
    checkbox: { marginRight: SPACING.md },
    checkCircle: {
      width: 24, height: 24, borderRadius: 12, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },

    // Line item rows
    lineRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
      borderRadius: RADIUS.md, marginBottom: SPACING.xs,
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
      marginTop: SPACING.md, backgroundColor: C.surface, borderRadius: RADIUS.lg,
      padding: SPACING.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      gap: SPACING.sm,
    },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    addIcon: { width: 32, height: 32, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
    addLabelInput: { flex: 1, fontSize: TYPOGRAPHY.size.base, padding: 0 },
    addAmountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingLeft: 32 + SPACING.sm },
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
    unplannedText: { fontSize: 10, fontWeight: TYPOGRAPHY.weight.medium },

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
    },
    echoModal: {
      width: '92%',
      maxHeight: '85%',
      borderRadius: RADIUS.xl,
      overflow: 'hidden',
    },
    echoHeaderRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xs,
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
    echoGreetText: {
      fontSize: TYPOGRAPHY.size.base,
      lineHeight: TYPOGRAPHY.size.base * TYPOGRAPHY.lineHeight.relaxed,
      marginTop: SPACING.xs,
    },
    echoPainWrap: {
      gap: SPACING.sm,
    },
    echoPainCard: {
      flexDirection: 'row',
      gap: SPACING.sm,
      alignItems: 'flex-start',
      padding: SPACING.md,
      borderRadius: RADIUS.md,
    },
    echoPainText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.sm,
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
    },
    echoPlanLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
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
    echoItemLeft: { flex: 1, gap: 2 },
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
    echoAlertRow: {
      flexDirection: 'row',
      gap: SPACING.xs,
      alignItems: 'flex-start',
      marginTop: 2,
    },
    echoAlertText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.sm,
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
    },
    echoSummaryCard: {
      borderRadius: RADIUS.md,
      padding: SPACING.md,
    },
    echoSummaryText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontStyle: 'italic',
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
    echoDismissText: {
      fontSize: TYPOGRAPHY.size.sm,
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
      alignItems: 'center' as const,
      width: '100%' as any,
      marginTop: SPACING.xs,
    },
    echoChatInputField: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    echoChatSendBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    // AI insight
    insightCard: {
      flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start',
      padding: SPACING.md, borderRadius: RADIUS.lg, marginTop: SPACING.lg,
    },
    insightText: {
      flex: 1, fontSize: TYPOGRAPHY.size.sm,
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
      fontStyle: 'italic',
    },

    // Empty plan
    emptyPlan: { alignItems: 'center', paddingVertical: SPACING['3xl'], gap: SPACING.sm },
    emptyPlanText: {
      fontSize: TYPOGRAPHY.size.sm, textAlign: 'center',
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
    },
    emptyAiBtn: {
      flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
      paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 2,
      borderRadius: RADIUS.full, marginTop: SPACING.sm,
    },
    emptyAiBtnText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium },

    // Quick notes
    quickNoteHeader: {
      flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
      paddingVertical: SPACING.sm, marginTop: SPACING.lg,
    },
    quickNoteLabel: {
      fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.medium,
      textTransform: 'lowercase',
    },
    quickNoteInput: {
      fontSize: TYPOGRAPHY.size.sm,
      lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.relaxed,
      padding: SPACING.md, borderRadius: RADIUS.md, minHeight: 44,
      textAlignVertical: 'top',
    },
  });

export default PlaybookNotebook;
