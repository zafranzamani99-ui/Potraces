import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { KeyboardToolbar } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLearningStore, TRUST_COUNT, normalizeKeyword, MEMORY_KINDS, inferMemoryKind, type EchoMemory, type MemoryKind } from '../../store/learningStore';
import { usePremiumStore } from '../../store/premiumStore';
import { TIER_LIMITS } from '../../constants/tiers';
import { useCategoryStore } from '../../store/categoryStore';
import { useWalletStore } from '../../store/walletStore';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import FAB from '../../components/common/FAB';
import FloatingModal from '../../components/common/FloatingModal';
import PullRefresh from '../../components/common/PullRefresh';
import CategoryIcon from '../../components/common/CategoryIcon';
import WalletLogo from '../../components/common/WalletLogo';
import { SPACING, TYPOGRAPHY, RADIUS, withAlpha, CALM_DARK } from '../../constants';
import { RootStackParamList } from '../../types';
import { lightTap } from '../../services/haptics';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';

/**
 * Echo's Notebook — the flagship "makin lama, makin kenal you" screen
 * (MAKIN_KENAL.md §4). A visible, editable render of the learning notebook:
 * every rule Echo learned from your corrections, with the count behind it.
 * Tap a rule to fix or forget it; teach your own with the add button.
 *
 * Rules split into "knows you" (count ≥ TRUST_COUNT — Echo acts on them) and
 * "still learning" (count 1 — one more correction graduates them). The counter
 * sums the FULL tables, never the capped prompt slice.
 */

type RuleKind = 'category' | 'wallet' | 'person' | 'type' | 'skip';

interface NotebookRule {
  kind: RuleKind;
  keyword: string;
  /** category id / wallet name / preferred person name */
  value: string;
  count: number;
}

interface RuleModalState {
  visible: boolean;
  mode: 'add' | 'edit';
  kind: RuleKind;
  keyword: string;
  value: string;
}

const CLOSED_MODAL: RuleModalState = { visible: false, mode: 'add', kind: 'category', keyword: '', value: '' };

interface MemModalState {
  visible: boolean;
  mode: 'add' | 'edit';
  id: string;
  kind: MemoryKind;
  text: string;
}
const CLOSED_MEM_MODAL: MemModalState = { visible: false, mode: 'add', id: '', kind: 'goal', text: '' };

// The lists grow without bound (memories to 120, still-learning rules to the
// hundreds), so each collapses to a preview slice + a "show all N" expander to
// keep the page short. Both lists sort most-relevant-first (memories: pinned
// then recent; rules: count desc), so the slice is always the top items.
const MEM_PREVIEW = 8;
const LEARNING_PREVIEW = 10;

const EchoNotebook: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  // FloatingModal's card caps at 85% screen height with overflow:'hidden' —
  // keep the value list short enough that everything below it (save, cancel)
  // plus the card padding always fits inside, or the card clips them off.
  const { height: winH } = useWindowDimensions();
  const valueListMaxH = Math.max(180, Math.min(340, winH * 0.85 - 400));
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C), [C]);

  const categoryPatterns = useLearningStore((s) => s.categoryPatterns);
  const walletPreferences = useLearningStore((s) => s.walletPreferences);
  const personAliases = useLearningStore((s) => s.personAliases);
  const typeCorrections = useLearningStore((s) => s.typeCorrections);
  const skippedKeywords = useLearningStore((s) => s.skippedKeywords);
  const memories = useLearningStore((s) => s.memories);
  const tier = usePremiumStore((s) => s.tier);
  const memoryCap = TIER_LIMITS[tier].echoMemories;
  const expenseCategories = useCategoryStore((s) => s.getExpenseCategories);
  const wallets = useWalletStore((s) => s.wallets);

  const [modal, setModal] = useState<RuleModalState>(CLOSED_MODAL);
  const [memModal, setMemModal] = useState<MemModalState>(CLOSED_MEM_MODAL);
  const [howVisible, setHowVisible] = useState(false);
  const [filter, setFilter] = useState<'all' | RuleKind>('all');
  const [showAllMemories, setShowAllMemories] = useState(false);
  const [showAllLearning, setShowAllLearning] = useState(false);
  // Two-room split: only ONE list is on screen at a time (halves the page).
  const [room, setRoom] = useState<'remembers' | 'shortcuts'>('remembers');
  // Memory kind is auto-filed from the text until the user taps a pill to override.
  const [memKindAuto, setMemKindAuto] = useState(true);

  // Pull-to-refresh: the notebook reads live from Zustand stores (learning /
  // premium / category / wallet), so a re-read is enough — the timeout just
  // holds the branded spinner long enough to read as a real refresh.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // Memory of you — pinned first, then most-recent (matches Echo's prompt order).
  const sortedMemories = useMemo(
    () => [...memories].sort((a, b) => (!!a.pinned !== !!b.pinned ? (a.pinned ? -1 : 1) : b.updatedAt - a.updatedAt)),
    [memories],
  );
  const memAtCap = memories.length >= memoryCap;

  const memKindIcon = (kind: MemoryKind): keyof typeof Feather.glyphMap =>
    kind === 'goal' ? 'target'
      : kind === 'bill' ? 'repeat'
      : kind === 'worry' ? 'alert-circle'
      : kind === 'win' ? 'award'
      : kind === 'style' ? 'sliders'
      : 'bookmark';
  const memKindLabel = (kind: MemoryKind): string =>
    kind === 'goal' ? t.echoNotebook.memKindGoal
      : kind === 'bill' ? t.echoNotebook.memKindBill
      : kind === 'worry' ? t.echoNotebook.memKindWorry
      : kind === 'win' ? t.echoNotebook.memKindWin
      : kind === 'style' ? t.echoNotebook.memKindStyle
      : t.echoNotebook.memKindFact;

  const openAddMemory = () => { setMemKindAuto(true); setMemModal({ visible: true, mode: 'add', id: '', kind: 'fact', text: '' }); };
  const openEditMemory = (m: EchoMemory) => { lightTap(); setMemModal({ visible: true, mode: 'edit', id: m.id, kind: m.kind, text: m.text }); };
  const closeMemModal = () => setMemModal(CLOSED_MEM_MODAL);

  const handleMemSave = () => {
    const text = memModal.text.trim();
    if (!text) return;
    lightTap();
    const s = useLearningStore.getState();
    if (memModal.mode === 'edit') s.editMemory(memModal.id, text);
    else s.addMemory({ kind: memModal.kind, text, source: 'you' }, memoryCap);
    Keyboard.dismiss();
    closeMemModal();
  };

  const handleMemForget = () => {
    lightTap();
    Alert.alert(t.echoNotebook.memForgetTitle, t.echoNotebook.memForgetMsg, [
      { text: t.echoNotebook.cancel, style: 'cancel' },
      { text: t.echoNotebook.forget, style: 'destructive', onPress: () => { useLearningStore.getState().forgetMemory(memModal.id); closeMemModal(); } },
    ]);
  };

  useEffect(() => {
    navigation.setOptions({ title: t.echoNotebook.title });
  }, [navigation, t]);

  const categoryName = (id: string) =>
    expenseCategories().find((c) => c.id === id)?.name || id;

  const allRules = useMemo<NotebookRule[]>(() => {
    const rules: NotebookRule[] = [];
    for (const p of categoryPatterns) rules.push({ kind: 'category', keyword: p.keyword, value: p.category, count: p.count });
    for (const w of walletPreferences) rules.push({ kind: 'wallet', keyword: w.keyword, value: w.wallet, count: w.count });
    for (const a of personAliases) rules.push({ kind: 'person', keyword: a.raw, value: a.preferred, count: a.count });
    for (const tc of typeCorrections) rules.push({ kind: 'type', keyword: tc.keyword, value: tc.toType, count: tc.count });
    for (const [kw, n] of Object.entries(skippedKeywords)) rules.push({ kind: 'skip', keyword: kw, value: '', count: n });
    return rules.sort((a, b) => b.count - a.count);
  }, [categoryPatterns, walletPreferences, personAliases, typeCorrections, skippedKeywords]);

  const visibleRules = filter === 'all' ? allRules : allRules.filter((r) => r.kind === filter);
  const trusted = visibleRules.filter((r) => r.count >= TRUST_COUNT);
  const learning = visibleRules.filter((r) => r.count < TRUST_COUNT);
  const total = allRules.length;

  // Collapse the two growing lists to their top slice unless expanded.
  const memsShown = showAllMemories ? sortedMemories : sortedMemories.slice(0, MEM_PREVIEW);
  const learningShown = showAllLearning ? learning : learning.slice(0, LEARNING_PREVIEW);
  // Hero now counts EVERYTHING Echo knows (durable facts + learned shortcuts);
  // the old hero counted rules only and ignored memories entirely.
  const heroCount = total + sortedMemories.length;

  const kindIcon = (kind: RuleKind): keyof typeof Feather.glyphMap =>
    kind === 'category' ? 'tag'
      : kind === 'wallet' ? 'credit-card'
      : kind === 'person' ? 'user'
      : kind === 'type' ? 'repeat'
      : 'eye-off';

  const kindLabel = (kind: RuleKind) =>
    kind === 'category' ? t.echoNotebook.typeCategory
      : kind === 'wallet' ? t.echoNotebook.typeWallet
      : kind === 'person' ? t.echoNotebook.typePerson
      : kind === 'type' ? t.echoNotebook.typeType
      : t.echoNotebook.typeSkip;

  // typeCorrections.toType is heterogeneous — 'expense'/'income' (notes) or
  // 'add_expense' (chat). Normalize by stripping add_ then map to the shared
  // notes labels; fall back to the raw token.
  const intentLabel = (toType: string) => {
    const key = toType.replace(/^add_/, '');
    const map: Record<string, string> = {
      expense: t.notes.typeExpense,
      income: t.notes.typeIncome,
      bill: t.notes.typeBill,
      subscription: t.notes.typeBill,
      debt: t.notes.typeDebt,
      payment: t.notes.typePayment,
      savings: t.notes.typeSavings,
      playbook: t.notes.typePlaybook,
    };
    return map[key] || toType;
  };

  const ruleValueLabel = (r: NotebookRule) =>
    r.kind === 'category' ? categoryName(r.value)
      : r.kind === 'type' ? intentLabel(r.value)
      : r.kind === 'skip' ? t.echoNotebook.skippedValue
      : r.value;

  const openAdd = () => { setModal({ visible: true, mode: 'add', kind: 'category', keyword: '', value: '' }); };
  const openEdit = (r: NotebookRule) => { lightTap(); setModal({ visible: true, mode: 'edit', kind: r.kind, keyword: r.keyword, value: r.value }); };
  const closeModal = () => setModal(CLOSED_MODAL);

  // One contextual FAB drives both rooms (the FAB fires its own lightTap).
  const handleFabPress = () => {
    if (room === 'remembers') {
      if (memAtCap) { Alert.alert(t.echoNotebook.memCapReached); return; }
      openAddMemory();
    } else {
      openAdd();
    }
  };

  // "How echo learns" — explains the AUTOMATIC side (corrections → rules), so
  // the screen never reads as a bare list. Shown inline when empty (it IS the
  // onboarding), behind a link + modal once rules exist. Rows follow the Bills
  // "how it works" recipe (neu.well icon + bold lead + rest).
  const howRow = (icon: keyof typeof Feather.glyphMap, bold: string, rest: string) => (
    <View style={[styles.hiwItem, neu.raised]} key={icon}>
      <View style={[styles.hiwIconCircle, neu.well]}>
        <Feather name={icon} size={14} color={C.textSecondary} />
      </View>
      <Text style={styles.hiwText}>
        <Text style={styles.hiwBold}>{bold}</Text>
        {' '}{rest}
      </Text>
    </View>
  );
  const howBody = (
    <>
      {howRow('camera', t.echoNotebook.howReceiptBold, t.echoNotebook.howReceiptRest)}
      {howRow('message-circle', t.echoNotebook.howChatBold, t.echoNotebook.howChatRest)}
      {howRow('repeat', t.echoNotebook.howTwiceBold, t.echoNotebook.howTwiceRest)}
      {howRow('zap', t.echoNotebook.howUsedBold, t.echoNotebook.howUsedRest)}
    </>
  );

  // The modal keyword is what the user typed (add) — learning normalizes it.
  // Forget needs the same normalized key the store holds.
  const forgetRule = (kind: RuleKind, keyword: string, value: string) => {
    const s = useLearningStore.getState();
    if (kind === 'category') s.forgetCategory(keyword, value);
    else if (kind === 'wallet') s.forgetWallet(keyword);
    else if (kind === 'person') s.forgetPersonAlias(keyword);
    else if (kind === 'type') s.forgetTypeCorrection(keyword, value);
    else s.forgetSkipped(keyword);
  };

  const learnRule = (kind: RuleKind, keyword: string, value: string) => {
    const s = useLearningStore.getState();
    if (kind === 'category') s.learnCategory(keyword, value, TRUST_COUNT);
    else if (kind === 'wallet') s.learnWallet(keyword, value, TRUST_COUNT);
    else s.learnPersonAlias(keyword, value);
  };

  const modalKeywordNorm = normalizeKeyword(modal.keyword, true);
  const modalValid =
    modalKeywordNorm.length >= 3 &&
    (modal.kind === 'person' ? modal.value.trim().length > 0 : modal.value.length > 0);
  // type + skip rows are view + forget only (their value/count are Echo's, not
  // user-editable) — hide the value picker and the Save CTA.
  const isViewOnly = modal.kind === 'type' || modal.kind === 'skip';

  const handleSave = () => {
    if (!modalValid) return;
    lightTap();
    const value = modal.kind === 'person' ? modal.value.trim() : modal.value;
    if (modal.mode === 'edit') forgetRule(modal.kind, modal.keyword, modal.value);
    learnRule(modal.kind, modal.kind === 'person' ? modalKeywordNorm : modal.keyword, value);
    Keyboard.dismiss();
    closeModal();
  };

  const handleForget = () => {
    lightTap();
    Alert.alert(t.echoNotebook.forgetTitle, t.echoNotebook.forgetMsg, [
      { text: t.echoNotebook.cancel, style: 'cancel' },
      {
        text: t.echoNotebook.forget,
        style: 'destructive',
        onPress: () => { forgetRule(modal.kind, modal.keyword, modal.value); closeModal(); },
      },
    ]);
  };

  const handleResetAll = () => {
    lightTap();
    Alert.alert(
      t.echoNotebook.resetTitle,
      t.echoNotebook.resetMsg.replace('{n}', String(heroCount)),
      [
        { text: t.echoNotebook.cancel, style: 'cancel' },
        { text: t.echoNotebook.resetAll, style: 'destructive', onPress: () => { const s = useLearningStore.getState(); s.resetNotebook(); s.resetMemories(); } },
      ]
    );
  };

  const renderRule = (r: NotebookRule) => {
    const catOpt = r.kind === 'category' ? expenseCategories().find((c) => c.id === r.value) : undefined;
    const iconColor = catOpt?.color || C.accent;
    return (
      <TouchableOpacity
        // Two rules can share a keyword mid-habit-change (old fading, new
        // rising) — value must be part of the key or React sees duplicates.
        key={`${r.kind}-${r.keyword}-${r.value}`}
        style={[styles.ruleRow, neu.raised]}
        onPress={() => openEdit(r)}
        accessibilityRole="button"
      >
        <View style={[styles.ruleIcon, { backgroundColor: withAlpha(iconColor, 0.12) }]}>
          {catOpt
            ? <CategoryIcon icon={catOpt.icon} color={catOpt.color} size={15} />
            : <Feather name={kindIcon(r.kind)} size={15} color={C.accent} />}
        </View>
        <View style={styles.ruleTextWrap}>
          <Text style={[styles.ruleText, { color: C.textPrimary }]} numberOfLines={1}>
            <Text style={{ fontWeight: '600' }}>{r.keyword}</Text>
            <Text style={{ color: C.textMuted }}>{'  →  '}</Text>
            {ruleValueLabel(r)}
          </Text>
          <Text style={[styles.ruleKind, { color: C.textMuted }]}>{kindLabel(r.kind)}</Text>
        </View>
        <Text style={[styles.ruleCount, { color: r.count >= TRUST_COUNT ? C.accent : C.textMuted }]}>
          {t.echoNotebook.timesShort.replace('{n}', String(r.count))}
        </Text>
      </TouchableOpacity>
    );
  };

  // "show all N" / "show less" toggle for a collapsed list. `fullCount` labels
  // the total so the row reads "show all 184".
  const renderShowMore = (expanded: boolean, toggle: () => void, fullCount: number) => (
    <TouchableOpacity
      style={[styles.showMoreBtn, neu.raised]}
      onPress={() => { lightTap(); toggle(); }}
      accessibilityRole="button"
    >
      <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={C.textSecondary} />
      <Text style={[styles.showMoreText, { color: C.textSecondary }]}>
        {expanded ? t.echoNotebook.showLess : t.echoNotebook.showAll.replace('{n}', String(fullCount))}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Fixed header — hero + room segment stay put while the room scrolls,
          so switching rooms never needs a scroll back to the top. */}
      <View style={styles.fixedHeader}>
        <View style={[styles.hero, neu.raisedSoft]}>
          <Text style={[styles.heroNumber, { color: C.accent }]}>{heroCount}</Text>
          <Text style={[styles.heroText, { color: C.textPrimary }]}>
            {heroCount > 0
              ? t.echoNotebook.counter.replace('{n}', String(heroCount))
              : t.echoNotebook.counterEmpty}
          </Text>
        </View>
        {/* Room segment — two Neu Pills (only one list is live at a time) */}
        <View style={styles.segmentRow}>
          {(['remembers', 'shortcuts'] as const).map((r) => {
            const active = room === r;
            const count = r === 'remembers' ? sortedMemories.length : total;
            return (
              <TouchableOpacity
                key={r}
                style={[styles.pill, neu.raised, active && styles.pillActive]}
                onPress={() => { lightTap(); setRoom(r); }}
                accessibilityRole="button"
              >
                <Text style={[styles.pillText, { color: active ? C.onAccent : C.textSecondary }]}>
                  {(r === 'remembers' ? t.echoNotebook.roomRemembers : t.echoNotebook.roomShortcuts)} {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <PullRefresh refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {room === 'remembers' ? (
          /* ── Room 1: durable facts Echo remembers about you ── */
          <>
            <Text style={styles.memHint}>{t.echoNotebook.memHint}</Text>
            {sortedMemories.length === 0 ? (
              <Text style={styles.memEmpty}>{t.echoNotebook.memEmpty}</Text>
            ) : (
              memsShown.map((m) => (
                <TouchableOpacity key={m.id} style={[styles.memRow, neu.raised]} onPress={() => openEditMemory(m)} accessibilityRole="button">
                  <View style={[styles.memIcon, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
                    <Feather name={memKindIcon(m.kind)} size={15} color={C.accent} />
                  </View>
                  <View style={styles.memTextWrap}>
                    <Text style={[styles.memText, { color: C.textPrimary }]} numberOfLines={2}>{m.text}</Text>
                    <Text style={[styles.memMeta, { color: C.textMuted }]}>
                      {memKindLabel(m.kind)} · {m.source === 'echo' ? t.echoNotebook.memSourceEcho : t.echoNotebook.memSourceYou}
                    </Text>
                  </View>
                  {m.pinned && <Feather name="bookmark" size={14} color={C.accent} />}
                </TouchableOpacity>
              ))
            )}
            {sortedMemories.length > MEM_PREVIEW &&
              renderShowMore(showAllMemories, () => setShowAllMemories((v) => !v), sortedMemories.length)}
            {memAtCap && <Text style={styles.memCapNote}>{t.echoNotebook.memCapReached}</Text>}
          </>
        ) : (
          /* ── Room 2: learned shortcuts (rules Echo picked up from corrections) ── */
          <>
            {total === 0 && (
              <View style={[styles.howCard, neu.raisedSoft]}>
                <Text style={[styles.howTitle, { color: C.textPrimary }]}>{t.echoNotebook.howTitle}</Text>
                <Text style={[styles.howIntro, { color: C.textMuted }]}>{t.echoNotebook.empty}</Text>
                {howBody}
              </View>
            )}

            {total > 0 && (
              <TouchableOpacity
                onPress={() => { lightTap(); setHowVisible(true); }}
                style={styles.howLink}
                accessibilityRole="button"
              >
                <Feather name="info" size={13} color={C.textMuted} />
                <Text style={[styles.howLinkText, { color: C.textMuted }]}>{t.echoNotebook.howTitle}</Text>
              </TouchableOpacity>
            )}

            {/* Type filter — Neu Pills (faintDark raised idle, olive when active) */}
            {total > 0 && (
              <View style={styles.filterRow}>
                {(['all', 'person', 'category', 'wallet', 'type', 'skip'] as const).map((f) => {
                  const active = filter === f;
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[styles.filterPill, neu.raised, active && styles.pillActive]}
                      onPress={() => { lightTap(); setFilter(f); }}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.pillText, { color: active ? C.onAccent : C.textSecondary }]}>
                        {f === 'all' ? t.echoNotebook.filterAll : kindLabel(f)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {trusted.length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>
                  {t.echoNotebook.trustedSection} · {trusted.length}
                </Text>
                {trusted.map(renderRule)}
              </>
            )}

            {learning.length > 0 && (
              <>
                <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>
                  {t.echoNotebook.learningSection} · {learning.length}
                </Text>
                <Text style={[styles.sectionHint, { color: C.textMuted }]}>{t.echoNotebook.learningHint}</Text>
                {learningShown.map(renderRule)}
                {learning.length > LEARNING_PREVIEW &&
                  renderShowMore(showAllLearning, () => setShowAllLearning((v) => !v), learning.length)}
              </>
            )}
          </>
        )}

        <Text style={[styles.privacyNote, { color: C.textMuted }]}>{t.echoNotebook.privacyNote}</Text>

        {(total > 0 || sortedMemories.length > 0) && (
          <TouchableOpacity onPress={handleResetAll} style={styles.resetBtn} accessibilityRole="button">
            <Text style={[styles.resetText, { color: '#B5705A' }]}>{t.echoNotebook.resetAll}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </PullRefresh>

      {/* Contextual FAB — adds a memory in Remembers, teaches a rule in Shortcuts
          (locks when the memory tier cap is hit). Matches the app-wide FAB. */}
      <FAB
        onPress={handleFabPress}
        icon={room === 'remembers' && memAtCap ? 'lock' : 'plus'}
        accessibilityLabel={room === 'remembers' ? t.echoNotebook.memAdd : t.echoNotebook.addOwn}
        style={{ bottom: Math.max(SPACING.xl, insets.bottom + SPACING.md) }}
      />

      {/* Add / edit rule */}
      <FloatingModal visible={modal.visible} onClose={closeModal} entrance="fade" borderless>
        <View style={styles.modalCard}>
          <Text style={[styles.modalTitle, { color: C.textPrimary }]}>
            {modal.mode === 'add' ? t.echoNotebook.addTitle : t.echoNotebook.editTitle}
          </Text>

          {/* Type pills (add only — a rule's type is fixed once taught) */}
          {modal.mode === 'add' && (
            <View style={styles.pillRow}>
              {(['category', 'wallet', 'person'] as RuleKind[]).map((kind) => {
                const active = modal.kind === kind;
                return (
                  <TouchableOpacity
                    key={kind}
                    style={[styles.pill, neu.raised, active && styles.pillActive]}
                    onPress={() => { lightTap(); setModal((m) => ({ ...m, kind, value: '' })); }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.pillText, { color: active ? C.onAccent : C.textSecondary }]}>
                      {kindLabel(kind)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Keyword (identity of the rule — fixed in edit mode) */}
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t.echoNotebook.keywordLabel}</Text>
          {modal.mode === 'add' ? (
            <TextInput
              value={modal.keyword}
              onChangeText={(v) => setModal((m) => ({ ...m, keyword: v }))}
              placeholder={t.echoNotebook.keywordPlaceholder}
              placeholderTextColor={C.neutral}
              style={[styles.input, { color: C.textPrimary, borderColor: C.inputBorder }]}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          ) : (
            <Text style={[styles.keywordFixed, { color: C.textPrimary }]}>{modal.keyword}</Text>
          )}

          {/* Value — read-only for type/skip (view + forget only) */}
          {isViewOnly ? (
            <>
              <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                {modal.kind === 'type' ? t.echoNotebook.typeType : t.echoNotebook.typeSkip}
              </Text>
              <Text style={[styles.keywordFixed, { color: C.textPrimary }]}>
                {modal.kind === 'type' ? intentLabel(modal.value) : t.echoNotebook.skippedValue}
              </Text>
            </>
          ) : (
          <>
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
            {modal.kind === 'category' ? t.echoNotebook.valueCategoryLabel
              : modal.kind === 'wallet' ? t.echoNotebook.valueWalletLabel
              : t.echoNotebook.valuePersonLabel}
          </Text>

          {modal.kind === 'person' ? (
            <TextInput
              value={modal.value}
              onChangeText={(v) => setModal((m) => ({ ...m, value: v }))}
              placeholder={t.echoNotebook.personPlaceholder}
              placeholderTextColor={C.neutral}
              style={[styles.input, { color: C.textPrimary, borderColor: C.inputBorder }]}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          ) : (
            <ScrollView
              style={[styles.valueList, { maxHeight: valueListMaxH }]}
              contentContainerStyle={styles.valueListContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {(modal.kind === 'category'
                ? expenseCategories().map((c) => ({
                    id: c.id,
                    label: c.name,
                    iconEl: <CategoryIcon icon={c.icon} color={c.color} size={15} />,
                  }))
                : wallets.map((w) => ({
                    id: w.name,
                    label: w.name,
                    // The wallet's own face — bank/preset logo, else its icon.
                    iconEl: <WalletLogo wallet={w} size={18} />,
                  }))
              ).map((opt) => {
                const active = modal.value === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.valueRow, neu.raised, active && styles.valueRowActive]}
                    onPress={() => { lightTap(); setModal((m) => ({ ...m, value: opt.id })); }}
                    accessibilityRole="button"
                  >
                    {opt.iconEl}
                    <Text style={[styles.valueRowText, { color: active ? C.accent : C.textPrimary }]}>{opt.label}</Text>
                    {active && <Feather name="check" size={16} color={C.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.modalCta}>
            <NeuButton icon="check" label={t.echoNotebook.saveRule} onPress={handleSave} disabled={!modalValid} />
          </View>
          </>
          )}

          <View style={styles.modalFooterRow}>
            <TouchableOpacity onPress={closeModal} accessibilityRole="button">
              <Text style={[styles.modalFooterText, { color: C.textSecondary }]}>{t.echoNotebook.cancel}</Text>
            </TouchableOpacity>
            {modal.mode === 'edit' && (
              <TouchableOpacity onPress={handleForget} accessibilityRole="button">
                <Text style={[styles.modalFooterText, { color: '#B5705A' }]}>{t.echoNotebook.forget}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </FloatingModal>

      {/* Add / edit a memory (free-text fact — separate from the keyword-rule modal) */}
      <FloatingModal visible={memModal.visible} onClose={closeMemModal} entrance="fade" borderless>
        <View style={styles.modalCard}>
          <Text style={[styles.modalTitle, { color: C.textPrimary }]}>
            {memModal.mode === 'add' ? t.echoNotebook.memAddTitle : t.echoNotebook.memEditTitle}
          </Text>

          {/* The fact is the hero — type it first; Echo auto-files the type. */}
          <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t.echoNotebook.memTextLabel}</Text>
          <TextInput
            value={memModal.text}
            onChangeText={(v) => setMemModal((m) => ({ ...m, text: v, kind: memKindAuto ? inferMemoryKind(v) : m.kind }))}
            placeholder={t.echoNotebook.memPlaceholder}
            placeholderTextColor={C.neutral}
            style={[styles.input, styles.memInput, { color: C.textPrimary, borderColor: C.inputBorder }]}
            multiline
            maxLength={140}
            textAlignVertical="top"
          />

          {/* Optional type — pre-filed by Echo from the text, one tap to change.
              Below the field + clearly optional, so it never blocks saving. */}
          {memModal.mode === 'add' && (
            <>
              <Text style={[styles.memKindHint, { color: C.textMuted }]}>{t.echoNotebook.memKindOptional}</Text>
              <View style={styles.memKindGrid}>
                {MEMORY_KINDS.map((k) => {
                  const active = memModal.kind === k;
                  return (
                    <TouchableOpacity
                      key={k}
                      style={[styles.filterPill, neu.raised, active && styles.pillActive]}
                      onPress={() => { lightTap(); setMemKindAuto(false); setMemModal((m) => ({ ...m, kind: k })); }}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.pillText, { color: active ? C.onAccent : C.textSecondary }]}>{memKindLabel(k)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <View style={styles.modalCta}>
            <NeuButton icon="check" label={t.echoNotebook.memSave} onPress={handleMemSave} disabled={!memModal.text.trim()} />
          </View>

          <View style={styles.modalFooterRow}>
            <TouchableOpacity onPress={closeMemModal} accessibilityRole="button">
              <Text style={[styles.modalFooterText, { color: C.textSecondary }]}>{t.echoNotebook.cancel}</Text>
            </TouchableOpacity>
            {memModal.mode === 'edit' && (
              <>
                <TouchableOpacity
                  onPress={() => { lightTap(); const cur = memories.find((x) => x.id === memModal.id); useLearningStore.getState().setMemoryPinned(memModal.id, !cur?.pinned); }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.modalFooterText, { color: C.accent }]}>
                    {memories.find((x) => x.id === memModal.id)?.pinned ? t.echoNotebook.memUnpin : t.echoNotebook.memPin}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleMemForget} accessibilityRole="button">
                  <Text style={[styles.modalFooterText, { color: '#B5705A' }]}>{t.echoNotebook.forget}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </FloatingModal>

      {/* How echo learns — same recipe as the Bills "how it works" modal
          (raisedModal card on the 0.4 scrim, bleed-scroll, got-it dismiss). */}
      <Modal visible={howVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setHowVisible(false)}>
        <Pressable style={styles.hiwOverlay} onPress={() => setHowVisible(false)}>
          <View style={[styles.hiwCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
            {/* Neu seam rule: bleed the clip edge out, pad content back in. */}
            <ScrollView
              style={styles.hiwScrollBleed}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              contentContainerStyle={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}
            >
              <View style={styles.hiwCardHeader}>
                <Text style={styles.hiwTitle}>{t.echoNotebook.howTitle}</Text>
                <Text style={styles.hiwSubtitle}>{t.echoNotebook.howSubtitle}</Text>
              </View>
              {howBody}
            </ScrollView>
            <View style={styles.hiwDismiss}>
              <NeuButton label={t.echoNotebook.gotIt} onPress={() => setHowVisible(false)} />
            </View>
          </View>
        </Pressable>
      </Modal>

      <KeyboardToolbar />
    </View>
  );
};

const makeStyles = (C: ReturnType<typeof useCalm>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    // Hero + segment live here, pinned above the scrolling room.
    fixedHeader: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
    segmentRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.xs },
    hero: {
      borderRadius: RADIUS.lg,
      backgroundColor: C.background,
      padding: SPACING.lg,
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    heroNumber: { fontSize: 44, fontWeight: '700', lineHeight: 48 },
    heroText: { fontSize: TYPOGRAPHY.size.sm, textAlign: 'center', marginTop: SPACING.xs },
    howCard: {
      borderRadius: RADIUS.lg,
      backgroundColor: C.background,
      padding: SPACING.lg,
      marginTop: SPACING.lg,
    },
    howTitle: { fontSize: TYPOGRAPHY.size.base, fontWeight: '700', marginBottom: 4 },
    howIntro: { fontSize: TYPOGRAPHY.size.xs, lineHeight: 17, marginBottom: SPACING.md },
    howLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      marginTop: SPACING.md,
      padding: SPACING.xs,
    },
    howLinkText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600' },
    // ── "How echo learns" modal — same recipe as Bills' hiw modal ──
    hiwOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
    },
    hiwCard: {
      width: '100%',
      maxWidth: 380,
      maxHeight: '75%',
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      paddingHorizontal: SPACING.xl,
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    // Counterpart to the contentContainer padding: pulls the ScrollView's clip
    // edge OUT by the same amount (neu seam rule — docs/neu-vertical-error.md).
    hiwScrollBleed: { marginHorizontal: -SPACING.md, marginVertical: -SPACING.sm },
    hiwCardHeader: { marginBottom: SPACING.md },
    hiwTitle: {
      fontSize: TYPOGRAPHY.size.xl,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      letterSpacing: C === CALM_DARK ? -0.1 : -0.3,
    },
    hiwSubtitle: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      marginTop: 4,
      lineHeight: 16,
    },
    hiwItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm + 2,
      backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.07 : 0.025),
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.sm + 2,
      marginBottom: 6,
    },
    hiwIconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.05),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    hiwText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
      fontWeight: TYPOGRAPHY.weight.medium,
      lineHeight: 18,
    },
    hiwBold: { fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary },
    hiwDismiss: { marginTop: SPACING.md },
    sectionHeader: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: SPACING.lg,
      marginBottom: SPACING.sm,
      marginLeft: SPACING.xs,
    },
    sectionHint: { fontSize: TYPOGRAPHY.size.xs, marginLeft: SPACING.xs, marginBottom: SPACING.xs },
    showMoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: RADIUS.md,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      paddingVertical: 10,
      marginTop: 2,
      marginBottom: SPACING.sm,
    },
    showMoreText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '600' },
    ruleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: RADIUS.md,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      padding: SPACING.sm,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    ruleIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ruleTextWrap: { flex: 1 },
    ruleText: { fontSize: TYPOGRAPHY.size.sm },
    ruleKind: { fontSize: 10, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.4 },
    ruleCount: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '700' },

    // ── Memory of you section ──
    memTitle: { fontSize: TYPOGRAPHY.size.base, fontWeight: '700', color: C.textPrimary, marginTop: SPACING.lg, marginLeft: SPACING.xs },
    memHint: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 2, marginBottom: SPACING.sm, marginLeft: SPACING.xs },
    memEmpty: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontStyle: 'italic', marginLeft: SPACING.xs, marginBottom: SPACING.sm },
    memRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: RADIUS.md,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      padding: SPACING.sm,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    memIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    memTextWrap: { flex: 1 },
    memText: { fontSize: TYPOGRAPHY.size.sm, lineHeight: 18 },
    memMeta: { fontSize: 10, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
    memAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: RADIUS.md,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      paddingVertical: 11,
      marginTop: 2,
    },
    memAddText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '600' },
    memCapNote: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, textAlign: 'center', marginTop: SPACING.xs },
    memKindHint: { fontSize: TYPOGRAPHY.size.xs, marginTop: SPACING.md, marginBottom: SPACING.sm, marginLeft: 2 },
    memKindGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
    memInput: { minHeight: 72 },
    rulesDivider: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: C.textMuted,
      marginTop: SPACING.xl,
      marginBottom: SPACING.sm,
      marginLeft: SPACING.xs,
    },

    privacyNote: {
      fontSize: TYPOGRAPHY.size.xs,
      lineHeight: 18,
      textAlign: 'center',
      paddingHorizontal: SPACING.xl,
      marginTop: SPACING.lg,
    },
    resetBtn: { alignSelf: 'center', marginTop: SPACING.md, padding: SPACING.sm },
    resetText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '600' },
    // Modal
    modalCard: { padding: SPACING.lg, paddingBottom: SPACING.xl },
    modalTitle: { fontSize: TYPOGRAPHY.size.lg, fontWeight: '700', marginBottom: SPACING.md, textAlign: 'center' },
    pillRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
    // Filter row wraps (6 pills) — content-sized so they don't squeeze; the modal
    // keeps the flex:1 `pill` for its 3 kind pills. gap covers row + column.
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm, marginBottom: SPACING.xs },
    filterPill: {
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      paddingVertical: 9,
      paddingHorizontal: SPACING.md,
      alignItems: 'center',
    },
    pill: {
      flex: 1,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      paddingVertical: 11,
      alignItems: 'center',
    },
    pillActive: { backgroundColor: C.accent },
    pillText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '600' },
    fieldLabel: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600', marginBottom: 6, marginTop: SPACING.md },
    input: {
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: 12,
      fontSize: TYPOGRAPHY.size.sm,
    },
    keywordFixed: { fontSize: TYPOGRAPHY.size.base, fontWeight: '600', paddingVertical: 6 },
    valueList: { flexGrow: 0 },
    // Seam rule (docs/neu-vertical-error.md): pad INSIDE the clip container so
    // the rows' neu shadows render into slack instead of being sliced at the
    // ScrollView edge — never style the line away.
    valueListContent: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
    valueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: RADIUS.md,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      paddingVertical: 13,
      paddingHorizontal: SPACING.md,
      marginBottom: SPACING.sm,
      gap: SPACING.sm,
    },
    valueRowActive: { backgroundColor: withAlpha(C.accent, 0.10) },
    valueRowText: { flex: 1, fontSize: TYPOGRAPHY.size.sm },
    modalCta: { marginTop: SPACING.md },
    modalFooterRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SPACING.xl,
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.xs,
    },
    modalFooterText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '600', padding: 6 },
  });

export default EchoNotebook;
