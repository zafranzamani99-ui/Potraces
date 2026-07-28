import React, { useState, useRef, useCallback, useContext, useEffect, useLayoutEffect, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  Modal,
  Animated,
  Image,
  Linking,
  Platform,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAvoidingView, KeyboardStickyView, KeyboardEvents } from 'react-native-keyboard-controller';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { format } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import { useAppStore } from '../../store/appStore';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import { useWalletStore } from '../../store/walletStore';
import { useLearningStore } from '../../store/learningStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUILayoutStore } from '../../store/uiLayoutStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useSubmitGuard } from '../../hooks/useSubmitGuard';
import { useT } from '../../i18n';
import ModalToastHost from '../../components/common/ModalToastHost';
import { useToast } from '../../context/ToastContext';
import { AIMessage, AIMessageAction, Transaction, Budget } from '../../types';
import ScreenGuide, { whenStore } from '../../components/common/ScreenGuide';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';
import NeuPressable from '../../components/common/NeuPressable';
import QuickAddExpense, { type QuickAddExpenseHandle } from '../../components/common/QuickAddExpense';
import PaywallModal from '../../components/common/PaywallModal';
import { usePremiumStore } from '../../store/premiumStore';
import { TIER_LIMITS } from '../../constants/tiers';
import { useCategories } from '../../hooks/useCategories';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import { sendChatMessageStream } from '../../services/moneyChat';
import { isCrisisMessage } from '../../services/smallTalk';
import { reviewReply, cleanReply } from '../../services/critic';
import { detectSavingsVehicle } from '../../services/manglishParser';
import { useNetInfo } from '@react-native-community/netinfo';
import {
  parseActions,
  parseMemories,
  executeAction,
  isLikelyDuplicate,
  isUnusualAmount,
  isDuplicateOfPending,
  recurringCandidate,
  isKnownRecurringMerchant,
  isDestructiveAction,
  sanitizeUserText,
  resolveTargetTransaction,
  looksLikeTransfer,
  looksLikeDebt,
  ChatAction,
  ChatActionType,
  ActionReceipt,
  ResolvedTarget,
} from '../../services/chatActions';
import { useDebtStore } from '../../store/debtStore';
import { usePersonalStore } from '../../store/personalStore';
import { useCategoryStore } from '../../store/categoryStore';
import ReviewEntriesSheet from '../../components/common/ReviewEntriesSheet';
import { lightTap, successNotification } from '../../services/haptics';
import { useVoiceInput, VoiceErrorKind } from '../../hooks/useVoiceInput';
import { isLiveAudioAvailable } from '../../services/liveAudioSource';
import { isSttTokenConfigured } from '../../services/sttToken';
import { normalizeSpokenAmount } from '../../utils/spokenAmount';
import { getMalayVoiceState, type MalayVoiceState } from '../../services/voiceModel';
import { transcribeAudio } from '../../services/aiService';
import { generateCheckinMessage } from '../../services/checkinMessage';

// Static MY money/merchant lexicon — merged with the user's real merchants/wallets/categories to
// bias the speech recognizer toward what Malaysians actually say. Best-effort (≤100 total, capped below).
const MY_MONEY_LEXICON = [
  'ringgit', 'sen', 'mamak', 'kedai', 'makan', 'nasi lemak', 'teh tarik', 'roti canai', 'kopi',
  'grab', 'GrabFood', 'foodpanda', 'Shopee', 'Lazada', 'TnG', 'Touch n Go', 'DuitNow', 'Setel',
  'Boost', 'petrol', 'tol', 'parking', 'Maybank', 'CIMB', 'Public Bank', 'RHB', 'Bank Islam',
  'Watsons', 'Guardian', 'Speedmart', 'Jaya Grocer', 'Lotus', 'AEON', 'Mydin', 'Shell', 'Petronas',
];

function formatSecs(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const ACTION_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  add_expense: 'arrow-up-right',
  add_income: 'arrow-down-left',
  add_debt: 'repeat',
  add_subscription: 'calendar',
  split_bill: 'users',
  debt_update: 'check-circle',
  transfer: 'arrow-right',
  add_goal_contribution: 'target',
  cancel_subscription: 'x-circle',
  forgive_debt: 'heart',
  update_subscription: 'edit-2',
  add_bnpl: 'credit-card',
  repay_credit: 'dollar-sign',
  update_savings: 'trending-up',
  add_savings_account: 'plus-circle',
  create_goal: 'flag',
  withdraw_goal: 'minus-circle',
  delete_transaction: 'trash-2',
  edit_transaction: 'edit-3',
  add_budget: 'target',
  edit_budget: 'edit-3',
  delete_budget: 'trash-2',
  delete_debt: 'trash-2',
  edit_debt: 'edit-3',
  pause_goal: 'pause-circle',
  archive_goal: 'archive',
  delete_goal: 'trash-2',
  pause_subscription: 'pause-circle',
  add_wallet: 'credit-card',
};

// Resolve translatable action labels per chat-action type. Uses i18n so
// labels match the canonical t.quickAdd / t.moneyChat vocab in both locales.
const getActionLabel = (
  type: string,
  t: ReturnType<typeof useT>,
): string => {
  const map: Record<string, string> = {
    add_expense: t.moneyChat.actionTypeExpense,
    add_income: t.moneyChat.actionTypeIncome,
    add_debt: t.moneyChat.actionTypeDebt,
    add_subscription: t.moneyChat.actionTypeSubscription,
    split_bill: t.moneyChat.actionTypeSplit,
    debt_update: t.moneyChat.actionTypePayment,
    transfer: t.moneyChat.actionTypeTransfer,
    add_goal_contribution: t.moneyChat.actionTypeGoal,
    cancel_subscription: t.moneyChat.actionTypeCancel,
    forgive_debt: t.moneyChat.actionTypeForgive,
    update_subscription: t.moneyChat.actionTypeUpdate,
    add_bnpl: t.moneyChat.actionTypeBnpl,
    repay_credit: t.moneyChat.actionTypeRepay,
    update_savings: t.moneyChat.actionTypeUpdateSavings,
    add_savings_account: t.moneyChat.actionTypeNewAccount,
    create_goal: t.moneyChat.actionTypeNewGoal,
    withdraw_goal: t.moneyChat.actionTypeWithdraw,
    delete_transaction: t.moneyChat.actionTypeDelete,
    edit_transaction: t.moneyChat.actionTypeEdit,
    add_budget: t.moneyChat.actionTypeSetBudget,
    edit_budget: t.moneyChat.actionTypeEditBudget,
    delete_budget: t.moneyChat.actionTypeRemoveBudget,
    delete_debt: t.moneyChat.actionTypeDeleteDebt,
    edit_debt: t.moneyChat.actionTypeEditDebt,
    pause_goal: t.moneyChat.actionTypePauseGoal,
    archive_goal: t.moneyChat.actionTypeArchiveGoal,
    delete_goal: t.moneyChat.actionTypeDeleteGoal,
    pause_subscription: t.moneyChat.actionTypePauseSub,
    add_wallet: t.moneyChat.actionTypeAddWallet,
  };
  return map[type] || type;
};

// Typing indicator — 3 olive dots with staggered animation
const TypingDots = memo(() => {
  const C = useCalm();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C, neu), [C, neu]);
  const dots = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={[styles.messageBubble, styles.assistantBubble, styles.typingBubble]}>
      <View style={styles.typingRow}>
        {dots.map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  );
});

// Animated entrance wrapper — fade-in + slide-up
const AnimatedBubble = memo(({ children }: { children: React.ReactNode }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
});

// Highlight RM amounts in assistant text
const HighlightedText = memo(({ text, style }: { text: string; style: any }) => {
  const C = useCalm();
  const parts = text.split(/(RM\s?[\d,]+\.?\d*)/gi);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        /^RM\s?[\d,]+\.?\d*$/i.test(part) ? (
          <Text key={i} style={{ fontWeight: '700', color: C.deepOlive }}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
});

// Live assistant bubble shown while the reply streams in token-by-token.
// A blinking caret (inline, so it wraps with the text) gives the "typing" feel.
const StreamingBubble = memo(({ text }: { text: string }) => {
  const C = useCalm();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C, neu), [C, neu]);
  const caret = useRef(new Animated.Value(1)).current;
  const parts = useMemo(() => text.split(/(RM\s?[\d,]+\.?\d*)/gi), [text]);

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, { toValue: 0.15, duration: 500, useNativeDriver: true }),
        Animated.timing(caret, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [caret]);

  return (
    <View style={[styles.messageBubble, styles.assistantBubble]}>
      <Text style={styles.messageText}>
        {parts.map((part, i) =>
          /^RM\s?[\d,]+\.?\d*$/i.test(part) ? (
            <Text key={i} style={{ fontWeight: '700', color: C.deepOlive }}>{part}</Text>
          ) : (
            <Text key={i}>{part}</Text>
          )
        )}
        <Animated.Text style={[styles.streamingCaretText, { opacity: caret }]}>▌</Animated.Text>
      </Text>
    </View>
  );
});

// Confirmed/failed action card (shown in chat history)
const ActionCard = memo(({ action }: { action: AIMessageAction }) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C, neu), [C, neu]);
  if (!action.message && !action.description) return null;

  const label = action.message
    || (action.description && action.amount
      ? `${action.description} — RM ${action.amount.toFixed(2)}`
      : action.description || t.moneyChat.done);

  return (
    <View
      style={[styles.actionCard, action.success ? styles.actionCardSuccess : styles.actionCardFail]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <View style={styles.actionCardRow}>
        <Feather
          name={action.success ? (ACTION_ICONS[action.type] || 'check') : 'x'}
          size={14}
          color={action.success ? C.deepOlive : C.textMuted}
        />
        <Text style={[styles.actionCardText, !action.success && styles.actionCardTextFail]}>
          {label}
        </Text>
      </View>
    </View>
  );
});

// Compact pending action chip — tap to open edit modal
const PendingChip = memo(({
  action,
  onPress,
  flagged,
}: {
  action: ChatAction;
  onPress: () => void;
  flagged?: boolean;
}) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C, neu), [C, neu]);
  const icon = ACTION_ICONS[action.type] || 'plus';
  const typeLabel = getActionLabel(action.type, t);
  const personLabel = action.person ? ` · ${action.person}` : '';
  const amountLabel = action.amount != null ? ` RM ${action.amount.toFixed(2)}` : '';
  // B9: show the entry's date on the chip when it isn't today (chip saved for a
  // past/future day should book on the intended day, so make the date visible).
  const dateLabel = useMemo(() => {
    const raw = action.date ?? (action.preparedAt ? new Date(action.preparedAt).toISOString() : null);
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return null;
    return format(d, 'MMM d');
  }, [action.date, action.preparedAt]);

  return (
    <TouchableOpacity
      style={styles.pendingChip}
      activeOpacity={0.7}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={`${typeLabel}: ${action.description}${personLabel}${amountLabel}${dateLabel ? ` · ${dateLabel}` : ''}`}
    >
      <View style={styles.pendingChipIconWrap}>
        <Feather name={icon} size={12} color={C.bronze} />
        {flagged && (
          <View style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: 4, backgroundColor: C.bronze, borderWidth: 1, borderColor: C.background }} />
        )}
      </View>
      <Text style={styles.pendingChipText} numberOfLines={1}>
        {action.description}{personLabel}
      </Text>
      {dateLabel && <Text style={styles.pendingChipDate}>{dateLabel}</Text>}
      {action.amount != null && <Text style={styles.pendingChipAmount}>RM {action.amount.toFixed(2)}</Text>}
    </TouchableOpacity>
  );
});

// Common action types the user can switch between (label resolved at render via i18n)
// The default 4 shown for a normal, unambiguous chip.
const SWITCHABLE_TYPE_KEYS: { key: ChatActionType; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'add_expense', icon: 'arrow-up-right' },
  { key: 'add_income', icon: 'arrow-down-left' },
  { key: 'add_debt', icon: 'repeat' },
  { key: 'add_subscription', icon: 'credit-card' },
];

// Extra options appended to the picker ONLY when a chip is ambiguous — the same
// word can mean different things, so Echo offers the close alternatives and the
// owner pins the accurate one (Echo then learns it). Extensible: add a rule here
// as new confusions surface. Extras already in the base 4 are ignored.
type TypeOpt = { key: ChatActionType; icon: keyof typeof Feather.glyphMap };
const SAVINGS_FAMILY: ChatActionType[] = ['create_goal', 'add_goal_contribution', 'add_savings_account'];
const AMBIG_SAVE_RE = /\b(sav(?:e|ing)|simpan|nabung|tabung|invest)\b/i;
// pay-later can look like a plain expense — offer the BNPL type as a correction.
const AMBIG_BNPL_RE = /\b(spay\s?later|spaylater|atome|pay\s?later|ansuran|installment|instalment|payflex)\b|(?:grab|shopee|tiktok)\s?(?:pay)?later/i;
const AMBIGUITY_RULES: { test: (a: ChatAction) => boolean; extras: TypeOpt[] }[] = [
  {
    // "saving" → a GOAL (save for a purpose) vs a SAVINGS/INVESTMENT account (ASB, Versa, crypto…).
    test: (a) => SAVINGS_FAMILY.includes(a.type) || AMBIG_SAVE_RE.test(a.description || ''),
    extras: [{ key: 'create_goal', icon: 'target' }, { key: 'add_savings_account', icon: 'trending-up' }],
  },
  {
    // pay-later purchase vs a plain expense.
    test: (a) => a.type !== 'add_bnpl' && AMBIG_BNPL_RE.test(a.description || ''),
    extras: [{ key: 'add_bnpl', icon: 'credit-card' }],
  },
];

// Floating modal for editing + confirming a pending action
const ActionEditModal = ({
  visible,
  action,
  flagNote,
  onConfirm,
  onClose,
  onDiscard,
}: {
  visible: boolean;
  action: ChatAction | null;
  flagNote?: string | null;
  onConfirm: (edited: ChatAction) => void;
  onClose: () => void;
  onDiscard: () => void;
}) => {
  const C = useCalm();
  const t = useT();
  const isDark = useIsDark();
  const neu = useNeu(undefined, { faintDark: true }); // icon well / type pill
  const neuStd = useNeu(); // field cards — standard neu, the visible onyx raise
  const styles = useMemo(() => makeStyles(C, neu, neuStd, isDark), [C, neu, neuStd, isDark]);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [actionType, setActionType] = useState<ChatActionType>('add_expense');
  const [categoryId, setCategoryId] = useState('');
  const [walletId, setWalletId] = useState('');
  const [person, setPerson] = useState('');
  const [debtType, setDebtType] = useState<'i_owe' | 'they_owe'>('they_owe');
  const [modalAnim, setModalAnim] = useState<'fade' | 'none'>('fade');
  const [showTypePicker, setShowTypePicker] = useState(false);

  const navigation = useNavigation<any>();
  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');
  const wallets = useWalletStore((s) => s.wallets);
  const debts = useDebtStore((s) => s.debts);

  // Close modal instantly then navigate to Settings
  const handleNavigateToSettings = useCallback(() => {
    setModalAnim('none');
    onClose();
    setTimeout(() => {
      navigation.navigate('SettingsDetail', { section: 'money', scrollTo: 'categories' });
      setModalAnim('fade');
    }, 50);
  }, [onClose, navigation]);

  const isIncome = actionType === 'add_income';
  const categories = isIncome ? incomeCategories : expenseCategories;
  const showCategory = ['add_expense', 'add_income', 'add_subscription', 'update_subscription'].includes(actionType);
  const showWallet = ['add_expense', 'add_income', 'add_bnpl', 'repay_credit'].includes(actionType);
  const showPerson = ['add_debt', 'split_bill', 'debt_update', 'forgive_debt'].includes(actionType);

  // Type options: the base 4, plus any extras from ambiguity rules that match THIS
  // chip (based on what Echo detected, not the current selection). De-duped; base
  // types are never re-added. A normal chip just gets the 4.
  const typeOptions = useMemo(() => {
    if (!action) return SWITCHABLE_TYPE_KEYS;
    const baseKeys = new Set(SWITCHABLE_TYPE_KEYS.map((s) => s.key));
    const extras: TypeOpt[] = [];
    const seen = new Set<ChatActionType>();
    for (const rule of AMBIGUITY_RULES) {
      if (!rule.test(action)) continue;
      for (const e of rule.extras) {
        if (baseKeys.has(e.key) || seen.has(e.key)) continue;
        seen.add(e.key);
        extras.push(e);
      }
    }
    return extras.length ? [...SWITCHABLE_TYPE_KEYS, ...extras] : SWITCHABLE_TYPE_KEYS;
  }, [action]);

  // B11: for a debt payment, resolve the matching debt + remaining balance so the
  // owner sees what they're paying down (and what's left after) before confirm.
  const debtPreview = useMemo(() => {
    if (!action || !['debt_update', 'forgive_debt'].includes(actionType)) return null;
    const name = (person || action.person || '').toLowerCase().trim();
    if (!name) return null;
    const match = debts.find((d) => d.contact?.name?.toLowerCase().trim() === name)
      || debts.find((d) => d.contact?.name?.toLowerCase().includes(name));
    if (!match) return { remaining: null as number | null, after: null as number | null, missing: name };
    const remaining = Math.max(0, (match.totalAmount || 0) - (match.paidAmount || 0));
    const pay = Math.min(parseFloat(amount) || 0, remaining);
    return { remaining, after: Math.max(0, remaining - pay), missing: null };
  }, [action, actionType, person, amount, debts]);

  // B12: nudge to reshape an expense/income chip into a transfer or debt when the
  // text looks like one. Only offered when we're not already that type.
  const reshape = useMemo(() => {
    if (!action) return null;
    const probe: ChatAction = { ...action, type: actionType, description: desc || action.description, person: person || action.person };
    if (actionType !== 'transfer' && looksLikeTransfer(probe)) return 'transfer' as const;
    if (!['add_debt', 'debt_update', 'split_bill'].includes(actionType) && looksLikeDebt(probe)) return 'debt' as const;
    return null;
  }, [action, actionType, desc, person]);

  useEffect(() => {
    if (action) {
      setDesc(action.description || '');
      setAmount(action.amount != null ? action.amount.toString() : '');
      setActionType(action.type);
      setPerson(action.person || '');
      setDebtType(action.debtType || 'they_owe');

      // Match category by ID or name
      const catStr = (action.category || '').toLowerCase().replace(/[\s&]+/g, '_');
      const catMatch = categories.find((c) => c.id === catStr)
        || categories.find((c) => c.name.toLowerCase().replace(/[\s&]+/g, '_') === catStr)
        || categories[0];
      setCategoryId(catMatch?.id || 'other');

      // Match wallet by name
      const walletStr = (action.wallet || '').toLowerCase();
      const walletMatch = wallets.find((w) => w.name.toLowerCase() === walletStr)
        || wallets.find((w) => w.isDefault)
        || wallets[0];
      setWalletId(walletMatch?.id || '');
    }
  }, [action]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirm = () => {
    if (!action) return;
    const selectedCat = categories.find((c) => c.id === categoryId);
    const selectedWallet = wallets.find((w) => w.id === walletId);
    const finalDesc = desc.trim() || action.description || '';
    const finalCategory = selectedCat?.id || action.category;
    const finalWallet = selectedWallet?.name || action.wallet;
    const finalPerson = person.trim() || action.person;

    // Learn from any corrections the user made. Category/wallet shortcuts only make
    // sense for real transactions (a description = a merchant/spend keyword) — NOT for
    // goals / savings accounts / subscriptions, whose "description" is a proper name
    // (e.g. "Depo Rumah") that must never become a Food→Maybank shortcut.
    const learn = useLearningStore.getState();
    const isTxn = actionType === 'add_expense' || actionType === 'add_income';
    if (isTxn && finalDesc && finalCategory) learn.learnCategory(finalDesc, finalCategory);
    if (isTxn && finalDesc && finalWallet) learn.learnWallet(finalDesc, finalWallet);
    if (actionType !== action.type && finalDesc) learn.learnTypeCorrection(finalDesc, actionType);
    if (finalPerson && action.person && finalPerson !== action.person) {
      learn.learnPersonAlias(action.person, finalPerson);
    }

    const finalAmount = parseFloat(amount) || action.amount;
    // When switched to a goal/savings type, carry the fields those executors read
    // (target for a goal; inferred vehicle type for a savings account) so the
    // switch produces a real goal/account, not a bare fallback.
    const extras: Partial<ChatAction> =
      actionType === 'create_goal'
        ? { goalTarget: action.goalTarget || finalAmount, goalName: finalDesc }
        : actionType === 'add_savings_account'
        ? { accountType: action.accountType || detectSavingsVehicle(finalDesc) || 'other', accountName: finalDesc, initialInvestment: finalAmount }
        : {};
    onConfirm({
      ...action,
      type: actionType,
      description: finalDesc,
      amount: finalAmount,
      category: finalCategory,
      wallet: finalWallet,
      person: finalPerson,
      debtType: showPerson ? debtType : action.debtType,
      ...extras,
    });
  };
  const guardedConfirm = useSubmitGuard(handleConfirm);

  if (!action) return null;

  return (
    <Modal visible={visible} transparent animationType={modalAnim} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlayKav}
        behavior="padding"
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              bounces={false}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
            >
              {/* Header — type pill (opens picker) + close */}
              <View style={styles.editHeader}>
                <TouchableOpacity
                  style={styles.editTypePill}
                  onPress={() => { lightTap(); setShowTypePicker(true); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.moneyChat.typeLabel}: ${getActionLabel(actionType, t)}`}
                >
                  <Feather
                    name={typeOptions.find((s) => s.key === actionType)?.icon || 'circle'}
                    size={14}
                    color={C.bronze}
                  />
                  <Text style={styles.editTypePillText}>{getActionLabel(actionType, t)}</Text>
                  <Feather name="chevron-down" size={12} color={C.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.moneyChat.cancel}
                >
                  <Feather name="x" size={18} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              {flagNote ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: withAlpha(C.bronze, 0.08), borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, marginBottom: SPACING.sm }}>
                  <Feather name="alert-circle" size={14} color={C.bronze} />
                  <Text style={{ flex: 1, fontSize: TYPOGRAPHY.size.xs, color: C.bronze }}>{flagNote}</Text>
                </View>
              ) : null}

              {/* B12: reshape affordance — "looks like a transfer / debt — switch?" */}
              {reshape ? (
                <View style={styles.reshapeBar}>
                  <Feather name={reshape === 'transfer' ? 'arrow-right' : 'repeat'} size={14} color={C.bronze} />
                  <Text style={styles.reshapeText}>
                    {reshape === 'transfer' ? t.moneyChat.looksTransferAsk : t.moneyChat.looksDebtAsk}
                  </Text>
                  <TouchableOpacity
                    style={styles.reshapeBtn}
                    onPress={() => { lightTap(); setActionType(reshape === 'transfer' ? 'transfer' : 'add_debt'); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={reshape === 'transfer' ? t.moneyChat.switchToTransfer : t.moneyChat.switchToDebt}
                  >
                    <Text style={styles.reshapeBtnText}>
                      {reshape === 'transfer' ? t.moneyChat.switchToTransfer : t.moneyChat.switchToDebt}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* B11: debt payment preview — remaining + after-this balance */}
              {debtPreview ? (
                <View style={styles.debtPreviewBar}>
                  <Feather name="repeat" size={14} color={C.bronze} />
                  <Text style={styles.debtPreviewText}>
                    {debtPreview.missing
                      ? t.moneyChat.debtNotFound.replace('{name}', person || action.person || '')
                      : debtPreview.after != null
                      ? `${t.moneyChat.debtRemaining.replace('{amount}', (debtPreview.remaining ?? 0).toFixed(2))} · ${t.moneyChat.debtNewBalance.replace('{amount}', debtPreview.after.toFixed(2))}`
                      : t.moneyChat.debtRemaining.replace('{amount}', (debtPreview.remaining ?? 0).toFixed(2))}
                  </Text>
                </View>
              ) : null}
              {/* Amount — hero, filled card */}
              <View style={styles.amountSection}>
                <Text style={styles.amountPrefix}>RM</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={C.border}
                  accessibilityLabel="amount"
                />
              </View>

              {/* Description field card */}
              <View style={styles.editFieldCard}>
                <Text style={styles.editFieldLabel}>{t.moneyChat.descPlaceholder}</Text>
                <TextInput
                  style={styles.editFieldInput}
                  value={desc}
                  onChangeText={setDesc}
                  placeholder={t.moneyChat.descPlaceholder}
                  placeholderTextColor={C.textMuted}
                  accessibilityLabel={t.moneyChat.descPlaceholder}
                />
              </View>

              {/* Category dropdown */}
              {showCategory && (
                <View style={styles.editPickerCard}>
                  <CategoryPicker
                    categories={categories}
                    selectedId={categoryId}
                    onSelect={setCategoryId}
                    label={t.quickAdd.categoryLabel}
                    layout="dropdown"
                    onNavigateToSettings={handleNavigateToSettings}
                  />
                </View>
              )}

              {/* Wallet dropdown */}
              {showWallet && wallets.length > 0 && (
                <View style={styles.editPickerCard}>
                  <WalletPicker
                    wallets={wallets}
                    selectedId={walletId}
                    onSelect={setWalletId}
                    label={t.quickAdd.walletLabel}
                  />
                </View>
              )}

              {/* Person + debt direction */}
              {showPerson && (
                <>
                  <View style={styles.editFieldCard}>
                    <Text style={styles.editFieldLabel}>{t.moneyChat.personLabel}</Text>
                    <TextInput
                      style={styles.editFieldInput}
                      value={person}
                      onChangeText={setPerson}
                      placeholder={t.moneyChat.namePlaceholder}
                      placeholderTextColor={C.textMuted}
                      accessibilityLabel={t.moneyChat.personLabel}
                    />
                  </View>
                  <View style={styles.debtToggleRow}>
                    <TouchableOpacity
                      style={[styles.debtToggle, debtType === 'they_owe' && styles.debtToggleTheyOwe]}
                      onPress={() => setDebtType('they_owe')}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: debtType === 'they_owe' }}
                      accessibilityLabel={t.moneyChat.theyOweMe}
                    >
                      <Text style={[styles.debtToggleText, debtType === 'they_owe' && styles.debtToggleTextTheyOwe]}>
                        {t.moneyChat.theyOweMe}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.debtToggle, debtType === 'i_owe' && styles.debtToggleIOwe]}
                      onPress={() => setDebtType('i_owe')}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: debtType === 'i_owe' }}
                      accessibilityLabel={t.moneyChat.iOweThem}
                    >
                      <Text style={[styles.debtToggleText, debtType === 'i_owe' && styles.debtToggleTextIOwe]}>
                        {t.moneyChat.iOweThem}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Save — canonical primary action verb (UX-C1 swap-in); shared olive NeuButton per the neu standard */}
              <NeuButton
                icon="check"
                label={t.moneyChat.save}
                onPress={guardedConfirm}
                accessibilityLabel={t.moneyChat.save}
                style={{ marginTop: SPACING.xs }}
              />

              <TouchableOpacity
                style={styles.discardBtn}
                onPress={onDiscard}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.moneyChat.discardItem}
              >
                <Text style={styles.discardBtnText}>{t.moneyChat.discardItem}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Type picker — floating centered card */}
      <Modal
        visible={showTypePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTypePicker(false)}
      >
        <TouchableOpacity
          style={styles.typePickerOverlay}
          activeOpacity={1}
          onPress={() => setShowTypePicker(false)}
        >
          <View style={styles.typePickerCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.typePickerTitle}>{t.chat.selectType}</Text>
            {typeOptions.map((s) => {
              const active = actionType === s.key;
              const label = getActionLabel(s.key, t);
              return (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.typePickerOption, active && styles.typePickerOptionActive]}
                  onPress={() => {
                    setActionType(s.key);
                    setShowTypePicker(false);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                >
                  <View style={[styles.typePickerIcon, active && styles.typePickerIconActive]}>
                    <Feather name={s.icon} size={18} color={active ? C.bronze : C.textMuted} />
                  </View>
                  <Text style={[styles.typePickerText, active && styles.typePickerTextActive]}>
                    {label}
                  </Text>
                  {active && <Feather name="check" size={18} color={C.bronze} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
        <ModalToastHost />
      </Modal>
      <ModalToastHost />
    </Modal>
  );
};

// Confirmation surface for a delete/edit of a SAVED record (B5). Shows the
// matched row (desc · amount · date) before confirm; on 'many' a small pick list;
// on 'none' a calm "couldn't find it". Deletes carry undo (handled by caller).
const ResolveTargetModal = ({
  state,
  onConfirm,
  onClose,
}: {
  state: { action: ChatAction; resolved: ResolvedTarget } | null;
  onConfirm: (action: ChatAction, target: { description: string; amount: number; type: string }) => void;
  onClose: () => void;
}) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C, neu), [C, neu]);
  if (!state) return null;

  const { action, resolved } = state;
  const isDelete = action.type === 'delete_transaction';
  const fmtRow = (r: { description: string; amount: number; date: Date }) => {
    const d = r.date instanceof Date ? r.date : new Date(r.date);
    const dateStr = isNaN(d.getTime()) ? '' : ` · ${format(d, 'MMM d')}`;
    return `${r.description} · RM ${r.amount.toFixed(2)}${dateStr}`;
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.resolveRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.resolveCard} onStartShouldSetResponder={() => true}>
          <Text style={styles.resolveTitle}>
            {resolved.status === 'none'
              ? t.moneyChat.noMatchFound
              : resolved.status === 'many'
              ? t.moneyChat.pickWhich
              : isDelete
              ? t.moneyChat.confirmDeleteTitle
              : t.moneyChat.confirmEditTitle}
          </Text>

          {resolved.status === 'one' && resolved.match && (
            <>
              <View style={styles.resolveRow}>
                <Feather name={isDelete ? 'trash-2' : 'edit-3'} size={15} color={C.bronze} />
                <Text style={styles.resolveRowText}>{fmtRow(resolved.match)}</Text>
              </View>
              <NeuButton
                icon="check"
                label={isDelete ? t.moneyChat.removeEntry : t.moneyChat.save}
                onPress={() => onConfirm(action, { description: resolved.match!.description, amount: resolved.match!.amount, type: resolved.match!.type })}
                accessibilityLabel={isDelete ? t.moneyChat.removeEntry : t.moneyChat.save}
                style={{ marginTop: SPACING.xs }}
              />
            </>
          )}

          {resolved.status === 'many' && (
            <ScrollView
              style={{ maxHeight: 280 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {(resolved.candidates ?? []).map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.resolveRow}
                  activeOpacity={0.7}
                  onPress={() => onConfirm(action, { description: c.description, amount: c.amount, type: c.type })}
                  accessibilityRole="button"
                  accessibilityLabel={fmtRow(c)}
                >
                  <Feather name={isDelete ? 'trash-2' : 'edit-3'} size={15} color={C.bronze} />
                  <Text style={styles.resolveRowText}>{fmtRow(c)}</Text>
                  <Feather name="chevron-right" size={15} color={C.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.discardBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.discardBtnText}>{t.moneyChat.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ModalToastHost />
    </Modal>
  );
};

const ChatBubble = memo(({ item, onSelectText, onViewImage }: { item: AIMessage; onSelectText: (text: string) => void; onViewImage: (uri: string) => void }) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C, neu), [C, neu]);
  const isUser = item.role === 'user';
  const hasText = item.content.trim().length > 0;
  const hasImage = isUser && !!item.imageUri;
  const showBubble = hasText || hasImage;

  const handleLongPress = useCallback(() => {
    if (!hasText) return;
    lightTap();
    onSelectText(item.content);
  }, [item.content, hasText, onSelectText]);

  // Crisis help card — on-device, tappable hotlines. Never a real AI reply.
  if (item.kind === 'crisis') {
    return (
      <AnimatedBubble>
        <View style={[styles.messageBubble, styles.assistantBubble, styles.crisisCard]}>
          <Text style={styles.crisisLead}>{t.moneyChat.crisisLead}</Text>
          <Text style={styles.crisisBody}>{t.moneyChat.crisisBody}</Text>
          <TouchableOpacity style={styles.crisisRow} activeOpacity={0.7} onPress={() => Linking.openURL('tel:0376272929')} accessibilityRole="button" accessibilityLabel="call Befrienders KL 03-7627 2929">
            <Text style={styles.crisisOrg}>Befrienders KL</Text>
            <Text style={styles.crisisNum}>03-7627 2929</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.crisisRow} activeOpacity={0.7} onPress={() => Linking.openURL('tel:15555')} accessibilityRole="button" accessibilityLabel="call Talian HEAL 15555">
            <Text style={styles.crisisOrg}>Talian HEAL</Text>
            <Text style={styles.crisisNum}>15555</Text>
          </TouchableOpacity>
          <Text style={styles.crisisHint}>{t.moneyChat.crisisCallHint}</Text>
        </View>
      </AnimatedBubble>
    );
  }

  return (
    <AnimatedBubble>
      <View>
        {showBubble && (
          <TouchableOpacity
            activeOpacity={0.8}
            onLongPress={handleLongPress}
            delayLongPress={400}
            style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}
          >
            {hasImage && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => item.imageUri && onViewImage(item.imageUri)}
                accessibilityRole="imagebutton"
                accessibilityLabel="view image"
              >
                <Image
                  source={{ uri: item.imageUri }}
                  style={styles.chatImage}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}
            {isUser ? (
              hasText ? (
                <Text style={[styles.messageText, styles.userMessageText]}>
                  {item.content}
                </Text>
              ) : null
            ) : (
              <HighlightedText text={item.content} style={styles.messageText} />
            )}
          </TouchableOpacity>
        )}
        {item.actions?.map((action, i) => (
          <ActionCard key={i} action={action} />
        ))}
      </View>
    </AnimatedBubble>
  );
});

const MoneyChat: React.FC = () => {
  // ScreenGuide spotlight target — the message input bar.
  const guideTargetRef = useRef<any>(null);
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C, neu), [C, neu]);
  const route = useRoute<any>();
  const navigation = useNavigation();
  // Per-mount keyboard handling (each is the config proven correct for its mount):
  //  - bottom-tab (navbar): KeyboardAvoidingView shrinks content, keyboardVerticalOffset = headerHeight.
  //  - root native-stack (quick action): KeyboardStickyView pins the input to the keyboard top (the
  //    only thing that lands it right there); empty state is a ScrollView so content stays reachable.
  const isRootStack = useContext(BottomTabBarHeightContext) === undefined;
  const headerHeight = useHeaderHeight();
  const ChatContainer: any = isRootStack ? View : KeyboardAvoidingView;
  const chatContainerProps: any = isRootStack
    ? { style: styles.chatContainer }
    : { style: styles.chatContainer, behavior: 'padding', keyboardVerticalOffset: headerHeight };
  const BottomWrapper: any = isRootStack ? KeyboardStickyView : React.Fragment;
  const bottomWrapperProps: any = isRootStack ? { offset: { opened: 0 } } : {};
  // Native-stack mount doesn't shrink (KeyboardStickyView only moves the input), so pad the scroll
  // content by the keyboard height while it's open — that's what makes the suggestions/messages
  // scrollable up above the keyboard. The tab mount uses KeyboardAvoidingView (shrinks) so it pads 0.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    // Track the keyboard on the WILL events so navBarInset (the composer's tab-bar lift)
    // drops on open / returns on close *in sync* with the KeyboardAvoidingView animation.
    // Using only the DID events left the lift on during the open animation, so the composer
    // settled ~one nav-bar-height too high, then snapped down once the keyboard finished —
    // the visible "spring". The DID handlers stay as idempotent safety (platforms without
    // will-events) and to scroll to the latest message once the padding has applied.
    const willShow = KeyboardEvents.addListener('keyboardWillShow', (e) => setKbHeight(e.height));
    const willHide = KeyboardEvents.addListener('keyboardWillHide', () => setKbHeight(0));
    const didShow = KeyboardEvents.addListener('keyboardDidShow', (e) => {
      setKbHeight(e.height);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    });
    const didHide = KeyboardEvents.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { willShow.remove(); willHide.remove(); didShow.remove(); didHide.remove(); };
  }, []);
  const contentPad = isRootStack ? kbHeight : 0;
  const insets = useSafeAreaInsets();
  // The floating glass tab bar overlaps the tab mount's bottom, so lift the composer above it.
  // Only in the bottom-tab mount (the root-stack quick-action mount has no tab bar) and only
  // when the keyboard is closed (KeyboardAvoidingView already pins the composer to the keyboard).
  // Use the tab bar's *measured* height (it reports it via uiLayoutStore) so the composer sits
  // exactly one small gap above it — no dead band. The measured height includes the bar's own
  // bottom safe-area padding, and this scene is ALREADY bottom-inset by that same safe area, so
  // subtract insets.bottom to avoid counting it twice (that double-count was the leftover gap).
  const measuredNavBar = useUILayoutStore((s) => s.navBarHeight);
  const barVisibleHeight = (measuredNavBar > 0 ? measuredNavBar : insets.bottom + 74) - insets.bottom;
  // Where the composer floats when the keyboard is closed:
  //  · tab mount → above the floating tab bar (its measured visible height + a gap; SPACING.md,
  //    not sm, so the pill's soft shadow doesn't bleed onto the bar and read as a collision).
  //  · quick-action (root-stack) mount → no tab bar there, so float above the home indicator
  //    instead (else the pill sits flush against the bottom edge — "too low").
  // Keyboard open → 0; the KeyboardAvoidingView / KeyboardStickyView pins it to the keyboard.
  const navBarInset = kbHeight > 0
    ? 0
    : isRootStack
      ? insets.bottom + SPACING.sm
      : barVisibleHeight + SPACING.md;
  const initialContext = route.params?.noteContext as string | undefined;
  const extractionContext = route.params?.extractionContext as string | undefined;
  const budgetContext = route.params?.budgetContext as string | undefined;
  const budgetQuestion = route.params?.budgetQuestion as string | undefined;
  const walletContext = route.params?.walletContext as string | undefined;
  const walletQuestion = route.params?.walletQuestion as string | undefined;
  const mode = useAppStore((s) => s.mode);

  const chatMessages = useAIInsightsStore((s) => s.chatMessages);
  const addChatMessage = useAIInsightsStore((s) => s.addChatMessage);
  const clearChat = useAIInsightsStore((s) => s.clearChat);
  const archiveChat = useAIInsightsStore((s) => s.archiveChat);
  const hasConversations = useAIInsightsStore((s) => s.conversations.length > 0);
  const conversations = useAIInsightsStore((s) => s.conversations);
  const loadConversation = useAIInsightsStore((s) => s.loadConversation);
  const deleteConversation = useAIInsightsStore((s) => s.deleteConversation);
  const pendingActions = useAIInsightsStore((s) => s.pendingActions);
  const addPendingActions = useAIInsightsStore((s) => s.addPendingActions);
  const removePendingActionById = useAIInsightsStore((s) => s.removePendingActionById);
  const replacePendingActionById = useAIInsightsStore((s) => s.replacePendingActionById);
  const lastSave = useAIInsightsStore((s) => s.lastSave);
  const setLastSave = useAIInsightsStore((s) => s.setLastSave);
  const clearLastSave = useAIInsightsStore((s) => s.clearLastSave);
  const echoDailyCheckin = useSettingsStore((s) => s.echoDailyCheckin);
  const quickLogConfigured = useSettingsStore((s) => s.quickLogConfigured);
  // Daily check-in nudge: chips shown while the check-in is the newest bubble.
  const [checkinStamp, setCheckinStamp] = useState<string | null>(null);
  const quickAddRef = useRef<QuickAddExpenseHandle>(null);
  // Saved-history tier cap (chatSavedBubbles): beyond it, the OLDEST archived
  // conversations LOCK (never delete) — upgrading unlocks them instantly.
  const premiumTier = usePremiumStore((s) => s.tier);
  const [historyPaywallVisible, setHistoryPaywallVisible] = useState(false);
  const lockedConversationIds = useMemo(() => {
    const cap = TIER_LIMITS[premiumTier].chatSavedBubbles;
    const locked = new Set<string>();
    // Current (unarchived) chat spends the budget first, then archives newest→oldest.
    let used = chatMessages.length;
    for (const convo of conversations) {
      used += convo.messages.length;
      if (used > cap) locked.add(convo.id);
    }
    return locked;
  }, [premiumTier, chatMessages.length, conversations]);
  const { showToast } = useToast();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Messages sent while Echo is still answering. Drained one-by-one when the
  // in-flight request settles (see the effect below handleSend).
  const [sendQueue, setSendQueue] = useState<Array<{ text: string; imageUri: string | null }>>([]);
  // Live assistant text while streaming. null = not streaming; '' = started but
  // no token yet (show typing dots); non-empty = render the streaming bubble.
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Delete/edit-of-saved confirmation: resolved target + the action that wants it.
  const [resolving, setResolving] = useState<{ action: ChatAction; resolved: ResolvedTarget } | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectTextContent, setSelectTextContent] = useState<string | null>(null);
  const [lastFailedSend, setLastFailedSend] = useState<{ text: string; base64?: string } | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [attachVisible, setAttachVisible] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [showReviewSheet, setShowReviewSheet] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const didAutoSendRef = useRef(false);
  const lastAutoSentKeyRef = useRef<string | null>(null);
  const prevCountRef = useRef(chatMessages.length);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // Voice input
  const inputRef = useRef<TextInput>(null);
  // Biasing vocabulary for the recognizer: recent merchants + wallet names + category names + MY lexicon.
  // Snapshot at mount via getState() — best-effort, decoupled from the reactive selectors that live in
  // a different component in this file.
  const voiceContextStrings = useMemo(() => {
    const txns = usePersonalStore.getState().transactions || [];
    const safeTime = (d: any) => { const t = new Date(d).getTime(); return Number.isFinite(t) ? t : 0; };
    const recent = [...txns].sort((a, b) => safeTime(b.date) - safeTime(a.date)).slice(0, 40);
    const merchants: string[] = [];
    const mseen = new Set<string>();
    for (const tx of recent) {
      const d = (tx.description || '').trim();
      if (d && d.length <= 30 && !mseen.has(d.toLowerCase())) {
        mseen.add(d.toLowerCase());
        merchants.push(d);
        if (merchants.length >= 30) break;
      }
    }
    const walletNames = (useWalletStore.getState().wallets || []).map((w) => w.name).filter(Boolean);
    const catStore = useCategoryStore.getState();
    const catNames = [...catStore.getExpenseCategories('personal'), ...catStore.getIncomeCategories('personal')]
      .map((c) => c.name)
      .filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const s of [...merchants, ...walletNames, ...catNames, ...MY_MONEY_LEXICON]) {
      const trimmed = s.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
      if (out.length >= 100) break; // Apple's contextualStrings hard cap
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bias the recognizer toward the user's app language: Malay → ms-MY, English → en-MY. The hook only
  // USES a locale that's actually installed (and prefers ms-MY when present), so this never hard-fails.
  const language = useSettingsStore((s) => s.language);
  const voiceModelEpoch = useSettingsStore((s) => s.voiceModelEpoch); // bumps when ms-MY installs → hook re-probes
  const malayCloudVoice = useSettingsStore((s) => s.malayCloudVoice); // explicit "use the cloud for Malay" toggle
  const malayLiveStreaming = useSettingsStore((s) => s.malayLiveStreaming); // Stage 2: true words-as-you-speak
  // Server transcription engages when the user turned on cloud Malay (works on any phone, no download),
  // OR when the app language is Malay and the on-device ms-MY model isn't installed.
  const [malayModelState, setMalayModelState] = useState<MalayVoiceState>('absent');
  useEffect(() => {
    let alive = true;
    getMalayVoiceState().then((s) => { if (alive) setMalayModelState(s); });
    return () => { alive = false; };
  }, [voiceModelEpoch]);
  // Streaming (live words) takes priority, but only when the native capture module is present AND the
  // token endpoint is configured — otherwise it's dormant and we fall through to the cloud-clip path.
  const preferStreaming = malayLiveStreaming && isLiveAudioAvailable() && isSttTokenConfigured();
  const preferServer = !preferStreaming && (malayCloudVoice || (language === 'ms' && malayModelState !== 'ready'));
  const { isRecording, isTranscribing, serverMode, streaming, metering, liveTranscript, error: voiceError, startRecording, stopAndTranscribe, cancelRecording } = useVoiceInput({
    onResult: (text) => {
      // Spoken "dua puluh ringgit" → "20 ringgit" (gated on money cue; never corrupts names).
      setInput(normalizeSpokenAmount(text));
      inputRef.current?.focus();
    },
    // Server streaming: the accurate Malay "types in" to the composer word-by-word (raw; the final
    // onResult applies number normalization). Never auto-sends — confirmation-first.
    onPartial: (text) => setInput(text),
    contextualStrings: voiceContextStrings,
    lang: language === 'ms' ? 'ms-MY' : 'en-MY',
    localesEpoch: voiceModelEpoch,
    // Inject the transcriber for Malay server mode AND streaming (so a dropped socket can degrade to the
    // accurate clip→Gemini path). English / capable devices pass undefined → no clip written, nothing
    // leaves the phone.
    transcribeAudio: (preferServer || preferStreaming) ? transcribeAudio : undefined,
    preferServer,
    preferStreaming,
    announce: { listening: t.moneyChat.voiceListening, writing: t.moneyChat.voiceTranscribing, ready: t.moneyChat.voiceReady },
  });
  const recordingAnim = useRef(new Animated.Value(1)).current;
  const listenAnim = useRef(new Animated.Value(0)).current; // 0 = composer idle, 1 = listening surface present
  const ampAnim = useRef(new Animated.Value(0)).current; // eased amplitude → the breathing blob
  const [voiceErrorKind, setVoiceErrorKind] = useState<VoiceErrorKind | null>(null);
  const [recordSecs, setRecordSecs] = useState(0);

  // Malay voice nudge (Android only): when voice fails for a Malay speaker, offer a one-time tap to turn
  // on cloud Malay voice (no download — works on any phone). Never blocks typing.
  const malayVoicePromptSeen = useSettingsStore((s) => s.malayVoicePromptSeen);
  const setMalayVoicePromptSeen = useSettingsStore((s) => s.setMalayVoicePromptSeen);
  const voiceCloudNoticeSeen = useSettingsStore((s) => s.voiceCloudNoticeSeen);
  const setVoiceCloudNoticeSeen = useSettingsStore((s) => s.setVoiceCloudNoticeSeen);
  const setMalayCloudVoice = useSettingsStore((s) => s.setMalayCloudVoice);
  const [showMalayPrompt, setShowMalayPrompt] = useState(false);
  const [showCloudConsent, setShowCloudConsent] = useState(false); // one-time pre-upload consent

  // One tap → turn on cloud Malay voice (enabling IS the cloud-use consent). No download.
  const handleGetMalay = useCallback(() => {
    setMalayVoicePromptSeen(true);
    setShowMalayPrompt(false);
    setMalayCloudVoice(true);
    setVoiceCloudNoticeSeen(true);
    successNotification();
  }, [setMalayVoicePromptSeen, setMalayCloudVoice, setVoiceCloudNoticeSeen]);

  const isBusinessMode = mode === 'business';
  const suggestions = useMemo(
    () => (
      isBusinessMode
        ? [
            t.moneyChat.suggestionMonthCompare,
            t.moneyChat.suggestionAffordPhone,
            t.moneyChat.suggestionIncomeStable,
          ]
        : [
            t.moneyChat.suggestionWhereGoes,
            t.moneyChat.suggestionFoodSpend,
            t.moneyChat.suggestionAddLunch,
          ]
    ),
    [isBusinessMode, t],
  );

  // Contextual placeholder — reflects the user's money pulse this month, with evergreen fallbacks.
  const currency = useSettingsStore((s) => s.currency);
  const dynamicPlaceholder = useMemo(() => {
    if (isBusinessMode) return t.chat.askPlaceholder;
    const txns = usePersonalStore.getState().transactions || [];
    const now = new Date();
    let spend = 0, income = 0;
    for (const tx of txns) {
      const d = new Date(tx.date);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        if (tx.type === 'expense') spend += tx.amount || 0;
        else if (tx.type === 'income') income += tx.amount || 0;
      }
    }
    const net = income - spend;
    const money = (n: number) => currency + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const prompts: string[] = [];
    if (spend > 0) prompts.push(t.moneyChat.phSpent.replace('{amount}', money(spend)));
    if (net > 0) prompts.push(t.moneyChat.phKept.replace('{amount}', money(net)));
    else if (net < 0) prompts.push(t.moneyChat.phDown.replace('{amount}', money(-net)));
    prompts.push(t.moneyChat.suggestionWhereGoes, t.moneyChat.suggestionFoodSpend);
    return prompts[now.getDate() % prompts.length] || t.chat.askPlaceholder;
  }, [isBusinessMode, currency, t]);

  // The live chat resumes across screen opens / app backgrounding. It only
  // resets on a true cold start (app swiped away in the task switcher), which
  // is handled once during store rehydration in aiInsightsStore.

  // When Echo opens with entries already waiting (e.g. left unsaved before a
  // reload), nudge the user toward the chips with a one-time toast — instead of
  // a home-screen banner. Fires once on open; new in-session chips don't
  // re-trigger it.
  useEffect(() => {
    if (pendingActions.length === 0) return;
    const total = pendingActions.reduce((sum, a) => sum + (a.amount || 0), 0);
    const title = total > 0
      ? t.moneyChat.unsavedAmountTitle.replace('{amount}', `RM ${total.toFixed(2)}`)
      : t.moneyChat.unsavedCountTitle.replace('{n}', String(pendingActions.length));
    const id = setTimeout(() => showToast(`${title} — ${t.moneyChat.unsavedHint}`, 'info'), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the queue grows past a few items, auto-open the review sheet so the
  // owner sees everything at once instead of scrolling a long chip row (B8).
  const autoOpenedReviewRef = useRef(false);
  useEffect(() => {
    // Not while an edit is handing off (editingId set): closing the review sheet to open
    // ActionEditModal would otherwise re-fire this effect and re-present the sheet on top of
    // the edit modal — two Modals at once = the iOS stacked-modal glitch (R1).
    if (pendingActions.length >= 4 && !autoOpenedReviewRef.current && !showReviewSheet && !editingId) {
      autoOpenedReviewRef.current = true;
      setShowReviewSheet(true);
    }
    if (pendingActions.length < 4) autoOpenedReviewRef.current = false;
  }, [pendingActions.length, showReviewSheet, editingId]);

  // A capture that failed to send (offline / AI down) is kept across reloads —
  // bring it back into the composer on open so it's never lost.
  useEffect(() => {
    const txt = useAIInsightsStore.getState().failedCaptureText;
    if (txt && !initialContext && !walletContext && !budgetContext) {
      setInput((cur) => cur || txt);
      useAIInsightsStore.getState().setFailedCaptureText(null);
      showToast(t.moneyChat.pickedUpNote, 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Daily check-in (opt-in, default off): once a day Echo greets with today's
  // tally + a calm rhythm note. Gated by the setting and a once-a-day flag — no nag.
  useEffect(() => {
    if (!echoDailyCheckin) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const ai = useAIInsightsStore.getState();
    if (ai.dailyCheckinShownOn === today) return;
    ai.markDailyCheckinShown(today);

    const txns = usePersonalStore.getState().transactions;
    const dayKey = (d: any) => {
      const dt = d instanceof Date ? d : new Date(d);
      return isNaN(dt.getTime()) ? '' : format(dt, 'yyyy-MM-dd');
    };
    const todays = txns.filter((tx) => tx.type === 'expense' && dayKey(tx.date) === today);
    const count = todays.length;
    const total = todays.reduce((s, tx) => s + tx.amount, 0);
    let msg = count > 0
      ? t.moneyChat.dailyCheckinSome.replace('{amount}', `RM ${total.toFixed(2)}`).replace('{n}', String(count))
      : t.moneyChat.dailyCheckinNone;

    // Calm rhythm: consecutive days (ending today or yesterday) with an expense.
    const days = new Set(txns.filter((tx) => tx.type === 'expense').map((tx) => dayKey(tx.date)));
    let streak = 0;
    const cursor = new Date();
    if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (days.has(dayKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
    if (streak >= 3) msg += ' ' + t.moneyChat.rhythmNote.replace('{n}', String(streak));

    // Let Echo WRITE the check-in in its own words (background AI, doesn't spend
    // the chat quota); the template `msg` above stays the offline/over-quota/slow
    // fallback. Kick the AI call off now, race it against 4s at post time so the
    // greeting never lags the open.
    const aiPromise = generateCheckinMessage({
      count, total, streak, currency,
      language: useSettingsStore.getState().language,
      autoLogSetup: useSettingsStore.getState().quickLogConfigured,
    }).catch(() => null);
    let cancelled = false;
    const id = setTimeout(async () => {
      const aiMsg = await Promise.race([
        aiPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      if (!cancelled) {
        const stamp = new Date().toISOString();
        addChatMessage({ role: 'assistant', content: aiMsg || msg, timestamp: stamp });
        // Action chips (Log manual / Set up auto log) render under this message
        // while it stays the latest bubble.
        setCheckinStamp(stamp);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // Show transient error — auto-clears after 4s
  const showError = useCallback((msg: string) => {
    setErrorNotice(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorNotice(null), 4000);
  }, []);

  // Recording pulse animation + elapsed timer
  useEffect(() => {
    if (isRecording) {
      setRecordSecs(0);
      const ticker = setInterval(() => setRecordSecs((s) => s + 1), 1000);
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(recordingAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(recordingAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => { pulse.stop(); clearInterval(ticker); };
    } else {
      recordingAnim.setValue(1);
      setRecordSecs(0);
    }
  }, [isRecording, recordingAnim]);

  // Morph the listening surface in/out (cross-fade + subtle rise). Stays up through the brief
  // server-transcribing beat so the card doesn't flash out and back in.
  useEffect(() => {
    Animated.timing(listenAnim, { toValue: (isRecording || isTranscribing) ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [isRecording, isTranscribing, listenAnim]);

  // Ease the 300ms-stepped metering so the blob breathes instead of jumping (on-device path).
  useEffect(() => {
    if ((serverMode || streaming) && isRecording) return; // server/streaming breathe on their own (below)
    Animated.timing(ampAnim, { toValue: metering, duration: 260, useNativeDriver: true }).start();
  }, [metering, ampAnim, serverMode, streaming, isRecording]);

  // Server / streaming mode: no usable volumechange (server flatlines on some OEMs; Soniox gives none), so
  // the real meter is dead. Drive a calm self-breathing pulse while listening.
  useEffect(() => {
    if (!((serverMode || streaming) && isRecording)) return;
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(ampAnim, { toValue: 0.55, duration: 900, useNativeDriver: true }),
        Animated.timing(ampAnim, { toValue: 0.15, duration: 900, useNativeDriver: true }),
      ])
    );
    breathe.start();
    return () => breathe.stop();
  }, [serverMode, streaming, isRecording, ampAnim]);
  const blobScale = ampAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const surfaceTranslate = listenAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });

  // Surface voice errors as a calm, persistent row (kind-mapped copy + affordance)
  useEffect(() => {
    if (voiceError) setVoiceErrorKind(voiceError.kind);
  }, [voiceError]);

  // Offer the cloud-Malay nudge once, when voice fails for a Malay speaker and cloud isn't already on.
  // 'setup' (mic heard audio but couldn't transcribe) → offer to anyone; a plain 'no-speech' (often a
  // silent tap) → only nudge Malay-language users, so English users aren't mis-targeted.
  useEffect(() => {
    if (Platform.OS !== 'android' || malayVoicePromptSeen || malayCloudVoice) return;
    const eligible = voiceErrorKind === 'setup' || (language === 'ms' && voiceErrorKind === 'no-speech');
    if (eligible) setShowMalayPrompt(true);
  }, [voiceErrorKind, malayVoicePromptSeen, malayCloudVoice, language]);

  // Photo — direct launch with permission request
  const handlePickImage = useCallback(async (source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { showError('camera permission needed'); return; }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { showError('photo library permission needed'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
      }
    } catch (err) {
      if (__DEV__) console.warn('[MoneyChat] Image picker error:', err);
      showError('could not open image picker');
    }
  }, [showError]);

  const handlePickCamera = useCallback(() => handlePickImage('camera'), [handlePickImage]);
  const handlePickGallery = useCallback(() => handlePickImage('gallery'), [handlePickImage]);

  // Mic — start recording. While recording, the listening surface owns stop/cancel, so this only
  // ever starts (transcript lands in the composer for review; never auto-sends).
  const handleMicPress = useCallback(async () => {
    lightTap();
    setVoiceErrorKind(null);
    // First cloud voice use (server clip OR live streaming) → one-time consent BEFORE any audio leaves the device.
    if ((preferServer || preferStreaming) && !voiceCloudNoticeSeen) {
      setShowCloudConsent(true);
      return;
    }
    await startRecording();
  }, [preferServer, preferStreaming, voiceCloudNoticeSeen, startRecording]);

  // User acknowledged the one-time cloud note → remember it, then start the server recording.
  const handleCloudConsent = useCallback(async () => {
    setVoiceCloudNoticeSeen(true);
    setShowCloudConsent(false);
    setVoiceErrorKind(null);
    await startRecording();
  }, [setVoiceCloudNoticeSeen, startRecording]);

  const handleCancelVoice = useCallback(() => {
    lightTap();
    cancelRecording();
  }, [cancelRecording]);

  const voiceNetInfo = useNetInfo();
  const voiceErrorCopy = useCallback((kind: VoiceErrorKind): string => {
    switch (kind) {
      case 'permission': return t.moneyChat.voicePermDenied;
      case 'no-speech': return t.moneyChat.voiceNoSpeech;
      // Truly offline → the dedicated "voice needs internet" copy; else a generic reach-failure.
      case 'network': return voiceNetInfo.isConnected === false ? t.moneyChat.voiceOffline : t.moneyChat.voiceNetwork;
      case 'setup': return t.moneyChat.voiceSetup;
      case 'unavailable': return t.moneyChat.voiceSetup;
      case 'quota': return t.moneyChat.voiceLimit;
      default: return t.moneyChat.voiceNoSpeech;
    }
  }, [t, voiceNetInfo.isConnected]);

  // Header buttons — history + new chat
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        // Two plain icon buttons — same pattern as the Commitments header; the
        // native iOS header supplies the circular chrome. History always shown;
        // new-chat once there are messages.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity
            onPress={() => { lightTap(); setShowHistory(true); }}
            accessibilityRole="button"
            accessibilityLabel={t.chat.pastChats}
            style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="clock" size={19} color={C.textPrimary} />
          </TouchableOpacity>
          {chatMessages.length > 0 && (
            <TouchableOpacity
              onPress={() => { lightTap(); requestIdRef.current++; archiveChat(); }}
              accessibilityRole="button"
              accessibilityLabel={t.chat.newChat}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="plus" size={20} color={C.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [chatMessages.length, hasConversations, archiveChat, navigation, C]);

  // Scroll to bottom when new messages arrive. This used to be a single-shot
  // flag consumed by the FIRST onContentSizeChange — but a finished reply
  // settles in several layout passes (streaming footer swaps to the committed
  // bubble, then action cards/timestamps grow it), so the one scroll landed
  // short and the last line stayed hidden behind the composer. Instead, keep a
  // short follow WINDOW: every content-size change inside it re-scrolls.
  const followUntilRef = useRef(0);
  // Set on any manual drag, cleared when the user is back near the bottom —
  // so auto-follow never fights someone who scrolled up to read.
  const userDraggedRef = useRef(false);
  // A fresh mount (the quick-action root-stack entry) renders the list from the TOP (first
  // message) and never auto-scrolls, unlike the persistent tab mount which keeps its bottom
  // position. This lands every fresh mount on the LATEST message, so both entry points match.
  const didInitialScrollRef = useRef(false);
  // Ref mirror of showScrollDown so streaming callbacks (stable deps) can read
  // whether the user has scrolled away without going stale.
  const showScrollDownRef = useRef(false);
  useEffect(() => {
    showScrollDownRef.current = showScrollDown;
    if (chatMessages.length > prevCountRef.current && !showScrollDown) {
      followUntilRef.current = Date.now() + 2000;
      userDraggedRef.current = false;
    }
    prevCountRef.current = chatMessages.length;
  }, [chatMessages.length, showScrollDown]);

  // While streaming, follow the bottom as text grows — but only if the user is
  // already near the bottom (don't yank them back if they scrolled up to read).
  const followStream = useCallback(() => {
    if (!showScrollDownRef.current) {
      followUntilRef.current = Date.now() + 1000;
    }
  }, []);

  const handleContentSizeChange = useCallback(() => {
    // First layout of a fresh mount → jump straight to the latest message (no animation).
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      flatListRef.current?.scrollToEnd({ animated: false });
      return;
    }
    if (Date.now() < followUntilRef.current && !userDraggedRef.current) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, []);

  // Land a fresh mount on the LATEST message. The persistent tab mount keeps its bottom
  // position; a fresh root-stack (quick-action) mount otherwise opens at the first message.
  // A single scrollToEnd on first layout can land short (the list height/content settles
  // async, esp. in the root-stack mount), so retry across a few frames.
  useEffect(() => {
    if (chatMessages.length === 0) return;
    didInitialScrollRef.current = true; // suppress the onContentSizeChange initial-scroll (we own it here)
    const timers = [0, 120, 300, 550].map((ms) =>
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), ms),
    );
    return () => timers.forEach(clearTimeout);
    // Mount-only: chatMessages is already hydrated by the time either entry point opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contentHeightRef = useRef(0);
  const handleScroll = useCallback((e: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    contentHeightRef.current = contentSize.height;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollDown(distanceFromBottom > 150);
    // Back near the bottom → re-arm auto-follow (a manual drag had paused it).
    if (distanceFromBottom <= 150) userDraggedRef.current = false;
  }, []);

  // Any manual drag pauses auto-follow until the user returns to the bottom —
  // this is what stops the list yanking them down mid-read.
  const handleScrollBeginDrag = useCallback(() => {
    userDraggedRef.current = true;
  }, []);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Opening an archived conversation from history: when the active chat was
  // empty the list is UNMOUNTED (the empty-state ScrollView takes its place),
  // so it remounts fresh — and a single scrollToEnd on first layout lands
  // short/no-ops (same quirk the fresh-mount effect retries around). Retry
  // across a few frames; non-animated, an opened chat should JUMP to the end.
  const scrollToLatestRetries = useCallback(() => {
    [60, 160, 320, 600].forEach((ms) =>
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), ms),
    );
  }, []);

  // Process AI response — parse actions but DON'T execute
  const processResponse = useCallback((rawResponse: string) => {
    const { cleanText: afterActions, actions } = parseActions(rawResponse);
    // Pull out any durable facts Echo recorded with [MEMORY] (stripped from the
    // shown text) and save them to Echo's memory of you, capped by the tier.
    const { cleanText, memories: echoMemories } = parseMemories(afterActions);
    if (echoMemories.length) {
      const cap = TIER_LIMITS[premiumTier].echoMemories;
      const learn = useLearningStore.getState();
      echoMemories.forEach((m) => learn.addMemory({ kind: m.kind, text: m.text, source: 'echo' }, cap));
    }

    // Critic: log any leak (telemetry on the kinds that are too idiom-risky to
    // auto-fix — advice-soft/loss/orphan), THEN deterministically clean the SAFE
    // ones (grammar-safe advice softening + banned-word swaps) before it's shown.
    if (__DEV__) {
      const issues = reviewReply(cleanText, actions.length > 0);
      if (issues.length) console.warn('[Echo critic] reply issues:', issues.map((i) => i.detail), { hasAction: actions.length > 0 });
    }
    const displayText = cleanReply(cleanText);

    // Add the text as a chat message
    addChatMessage({ role: 'assistant', content: displayText, timestamp: new Date().toISOString() });

    // Fill category/wallet the AI left blank from what the user taught us
    // before (learningStore), then route each action: an "amend" re-emit updates
    // the matching pending chip; everything else queues (accumulates).
    if (actions.length > 0) {
      const learn = useLearningStore.getState();
      const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      actions.forEach((a) => {
        let action = a;
        if (a.type === 'add_expense' || a.type === 'add_income') {
          action = { ...a };
          if (!action.category) { const c = learn.getSuggestedCategory(a.description); if (c) action.category = c; }
          if (!action.wallet) { const w = learn.getSuggestedWallet(a.description); if (w) action.wallet = w; }
        }
        if (action.amend) {
          const current = useAIInsightsStore.getState().pendingActions;
          // Prefer an explicit clientId carried back on the amend; else match by description.
          const match = (action.clientId && current.find((p) => p.clientId === action.clientId))
            || current.find((p) => norm(p.description) === norm(action.description));
          if (match?.clientId) { replacePendingActionById(match.clientId, { ...action, clientId: match.clientId }); return; }
        }
        addPendingActions([action]);
      });
    }
  }, [addChatMessage, addPendingActions, replacePendingActionById, premiumTier]);

  // True only when a receipt carries something we can actually reverse. The undo
  // affordance must EITHER reverse correctly OR not be offered (honest undo) \u2014 an
  // empty `{}` receipt (transfer, add_subscription) is NOT undoable.
  const hasReversiblePayload = useCallback((r?: ActionReceipt): boolean => {
    if (!r) return false;
    return !!(
      r.transactionIds?.length ||
      r.edited ||
      r.deletedTransactions?.length ||
      r.debtPaymentId ||
      r.debtIds?.length ||
      r.subscriptionId ||
      r.deletedBudget
    );
  }, []);

  // Reverse exactly what a save mutated, using the receipts (B4). Exact undo \u2014
  // no fragile tx-id diffing. Each branch keeps the wallet balanced exactly once
  // under the single-owner contract.
  const undoReceipts = useCallback((receipts: ActionReceipt[]) => {
    const personal = usePersonalStore.getState();
    const debt = useDebtStore.getState();
    const wallets = useWalletStore.getState();
    receipts.forEach((r) => {
      // edit_transaction: RESTORE the pre-edit values (updateTransaction
      // self-reconciles the wallet). Never delete the record.
      if (r.edited) personal.updateTransaction(r.edited.id, r.edited.prev);

      // delete_transaction: re-add each snapshot, then re-apply the wallet
      // adjustment the same way the add path does (addTransaction does NOT touch
      // the wallet \u2014 the caller owns it). Single touch, balance ends correct.
      r.deletedTransactions?.forEach((tx) => {
        const { id, createdAt, updatedAt, ...rest } = tx;
        const newId = personal.addTransaction(rest as Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>);
        if (newId && tx.walletId) {
          if (tx.type === 'expense') wallets.deductFromWallet(tx.walletId, tx.amount);
          else if (tx.type === 'income') wallets.addToWallet(tx.walletId, tx.amount);
        }
      });

      // Plain created txns (add_expense/income, bnpl, split expense, debt-payment
      // linked txn): deleteTransaction self-reconciles the wallet (refund once).
      r.transactionIds?.forEach((id) => personal.deleteTransaction(id));

      // Debt PAYMENT undo: drop the payment. The linked transaction (above) already
      // refunded the wallet exactly once; deletePayment never touches the wallet.
      if (r.debtId && r.debtPaymentId) debt.deletePayment?.(r.debtId, r.debtPaymentId);
      // Created debts (add_debt / split_bill) WITHOUT a payment: remove the debt(s).
      else if (r.debtIds?.length) r.debtIds.forEach((id) => debt.deleteDebt?.(id));

      if (r.subscriptionId) personal.deleteSubscription?.(r.subscriptionId);

      // delete_budget: re-create the removed budget (addBudget upserts by category,
      // so a same-category budget is restored to the deleted allocation).
      if (r.deletedBudget) {
        const { id, createdAt, updatedAt, spentAmount, ...rest } = r.deletedBudget;
        personal.addBudget(rest as Omit<Budget, 'id' | 'createdAt' | 'updatedAt' | 'spentAmount'>);
      }
    });
  }, []);

  // Offer a "make recurring" nudge after a save; returns true if it fired.
  const maybeNudgeRecurring = useCallback((edited: ChatAction): boolean => {
    const key = (edited.description || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const ai = useAIInsightsStore.getState();
    if (edited.type !== 'add_expense' || !key || ai.recurringNudged.includes(key)) return false;
    const cand = recurringCandidate(edited.description);
    if (!cand && !isKnownRecurringMerchant(edited.description)) return false;
    const subs = usePersonalStore.getState().subscriptions || [];
    const isSub = subs.some((s) => {
      const n = s.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      return n === key || n.includes(key) || key.includes(n);
    });
    if (isSub) return false;
    ai.markRecurringNudged(key);
    showToast(
      t.moneyChat.recurringNudge.replace('{name}', edited.description),
      'info',
      { label: t.moneyChat.makeRecurring, onPress: () => {
        addPendingActions([{
          type: 'add_subscription',
          amount: cand?.amount ?? edited.amount,
          description: edited.description,
          billingCycle: 'monthly',
          category: edited.category || 'subscription',
        } as ChatAction]);
        showToast(t.moneyChat.recurringQueued, 'info');
      } },
    );
    return true;
  }, [addPendingActions, t, showToast]);

  // Run a single action through executeAction, dequeue its chip on success,
  // and surface the calm outcome. Returns the receipt if it saved.
  const runSingleSave = useCallback((edited: ChatAction): ActionReceipt | null => {
    const result = executeAction(edited);
    if (result.success) successNotification();
    else lightTap();

    // Calm tone, no emojis (per language rules)
    const prefix = result.success ? 'Recorded \u2705' : 'Failed \u274C';
    addChatMessage({
      role: 'assistant',
      content: `${prefix} ${result.message}`,
      timestamp: new Date().toISOString(),
    });

    // Dequeue only on success \u2014 a failed save leaves the chip queued (B2).
    if (result.success && edited.clientId) removePendingActionById(edited.clientId);
    // Return the receipt as-is (may be undefined for transfer/add_subscription).
    // Callers gate the undo affordance via hasReversiblePayload so an empty/absent
    // receipt never lies as undoable \u2014 but the save still confirms.
    return result.success ? (result.receipt ?? {}) : null;
  }, [addChatMessage, removePendingActionById]);

  // Confirm a single pending action (receives edited version from modal). B4 undo
  // via the receipt; record lastSave so undo survives leaving + reopening (B10).
  const handleConfirmAction = useCallback((id: string, edited: ChatAction) => {
    setEditingId(null);
    const receipt = runSingleSave(edited);
    if (!receipt) return;

    // Honest undo: only offer it when the receipt actually carries something
    // reversible. A transfer / add_subscription save shows NO undo button.
    const reversible = hasReversiblePayload(receipt);
    if (reversible) setLastSave([receipt], 1);
    const nudged = maybeNudgeRecurring(edited);
    if (!nudged) {
      showToast(
        t.moneyChat.savedToast.replace('{amount}', `RM ${(edited.amount || 0).toFixed(2)}`),
        'success',
        reversible
          ? { label: t.moneyChat.undo, onPress: () => {
              undoReceipts([receipt]);
              clearLastSave();
              showToast(t.moneyChat.undoneToast, 'info');
            } }
          : undefined,
      );
    }
  }, [runSingleSave, hasReversiblePayload, setLastSave, maybeNudgeRecurring, undoReceipts, clearLastSave, t, showToast]);

  // Soft heads-up shown on a chip / review row (never blocks saving). Also
  // surfaces the dedupe-against-pending flag (B8) so two queued chips warn.
  const flagNoteFor = useCallback((action: ChatAction): string | null => {
    const pending = useAIInsightsStore.getState().pendingActions;
    const others = pending.filter((p) => p.clientId !== action.clientId);
    if (isDuplicateOfPending(action, others) || isLikelyDuplicate(action)) return t.moneyChat.flagDuplicate;
    if (isUnusualAmount(action)) return t.moneyChat.flagLarge;
    return null;
  }, [t]);

  // Save every NON-destructive pending entry in one go (B2/B3/B4/B6). Dequeue
  // each chip AS it succeeds; failed/destructive chips stay queued. Undo reverses
  // only what actually saved, via receipts.
  const handleSaveAll = useCallback(() => {
    const actions = useAIInsightsStore.getState().pendingActions;
    if (actions.length === 0) return;

    const savable = actions.filter((a) => !isDestructiveAction(a));
    const hasDestructive = actions.length > savable.length;

    const receipts: ActionReceipt[] = [];
    const savedActions: ChatAction[] = [];
    let cameIn = 0;
    let wentOut = 0;
    let failed = 0;
    for (const a of savable) {
      const result = executeAction(a);
      if (result.success) {
        if (a.clientId) removePendingActionById(a.clientId); // dequeue as it succeeds
        receipts.push(result.receipt ?? {});
        savedActions.push(a);
        if (a.type === 'add_income') cameIn += a.amount || 0;
        else wentOut += a.amount || 0;
      } else {
        failed += 1; // leave the chip queued
      }
    }

    const saved = receipts.length;
    if (saved > 0) successNotification(); else lightTap();
    setShowReviewSheet(false);

    if (saved === 0) {
      showToast(t.moneyChat.nothingSavedToast, 'info');
      return;
    }

    // Honest undo: only offer it (and stash lastSave) when at least one saved
    // receipt is actually reversible \u2014 a batch of only transfers shows no button.
    const reversibleReceipts = receipts.filter((r) => hasReversiblePayload(r));
    const anyReversible = reversibleReceipts.length > 0;
    if (anyReversible) setLastSave(reversibleReceipts, saved);
    const segment = t.moneyChat.segmentedTotal
      .replace('{in}', cameIn.toFixed(2))
      .replace('{out}', wentOut.toFixed(2));
    const title = failed > 0
      ? t.moneyChat.savedSomeToast.replace('{n}', String(saved)).replace('{failed}', String(failed))
      : `${t.moneyChat.savedAllToast.replace('{n}', String(saved)).replace('{amount}', '')}`.trim();
    showToast(
      `${title} \u00B7 ${segment}`.replace(' \u00B7 ', failed > 0 ? ' \u2014 ' : ' \u00B7 '),
      'success',
      anyReversible
        ? { label: t.moneyChat.undo, onPress: () => {
            undoReceipts(reversibleReceipts);
            clearLastSave();
            showToast(t.moneyChat.undoneToast, 'info');
          } }
        : undefined,
    );
    if (hasDestructive) {
      setTimeout(() => showToast(t.moneyChat.destructiveExcluded, 'info'), 600);
    }
    // B14: recurring nudge also fires after save-all (first eligible saved expense).
    const firstRecurring = savedActions.find((a) => a.type === 'add_expense');
    if (firstRecurring) setTimeout(() => maybeNudgeRecurring(firstRecurring), 900);
  }, [removePendingActionById, hasReversiblePayload, setLastSave, undoReceipts, clearLastSave, maybeNudgeRecurring, t, showToast]);

  // Discard a pending action without saving it (keyed by clientId)
  const handleDismissAction = useCallback((id: string) => {
    lightTap();
    setEditingId(null);
    removePendingActionById(id);
  }, [removePendingActionById]);

  // A chip was tapped. Destructive (delete/edit of a SAVED record) resolves the
  // target first and shows the matched row before confirm (B5). Everything else
  // opens the normal edit modal.
  const handleChipPress = useCallback((action: ChatAction) => {
    lightTap();
    if (isDestructiveAction(action) && (action.type === 'delete_transaction' || action.type === 'edit_transaction')) {
      const resolved = resolveTargetTransaction(action);
      setResolving({ action, resolved });
      return;
    }
    if (action.clientId) setEditingId(action.clientId);
  }, []);

  // Confirm a resolved delete/edit against a specific saved row (B5). Carries undo.
  // We pin the action to the chosen candidate (description·amount·type, no
  // deleteAll) so A's resolver lands on exactly that one row.
  const confirmResolved = useCallback((
    action: ChatAction,
    target: { description: string; amount: number; type: string },
  ) => {
    setResolving(null);
    const targetAmount = target.amount;
    const pinned: ChatAction = {
      ...action,
      description: target.description,
      amount: target.amount,
      matchType: target.type === 'income' ? 'income' : 'expense',
      deleteAll: false,
    };
    const result = executeAction(pinned);
    if (result.success) successNotification(); else lightTap();
    addChatMessage({
      role: 'assistant',
      content: `${result.success ? 'Recorded \u2705' : 'Failed \u274C'} ${result.message}`,
      timestamp: new Date().toISOString(),
    });
    if (result.success && action.clientId) removePendingActionById(action.clientId);
    if (result.success && result.receipt) {
      const reversible = hasReversiblePayload(result.receipt);
      if (reversible) setLastSave([result.receipt], 1);
      showToast(
        t.moneyChat.deletedToast.replace('{amount}', `RM ${targetAmount.toFixed(2)}`),
        'info',
        reversible
          ? { label: t.moneyChat.undo, onPress: () => {
              undoReceipts([result.receipt!]);
              clearLastSave();
              showToast(t.moneyChat.undoneToast, 'info');
            } }
          : undefined,
      );
    }
  }, [addChatMessage, removePendingActionById, hasReversiblePayload, setLastSave, undoReceipts, clearLastSave, t, showToast]);

  // Auto-send context if passed from another screen
  useEffect(() => {
    // Signature of the current trigger — changes when chip/context changes
    const thisKey = walletContext
      ? `wallet::${walletQuestion ?? ''}::${walletContext}`
      : budgetContext
      ? `budget::${budgetQuestion ?? ''}::${budgetContext}`
      : initialContext
      ? `note::${initialContext}::${extractionContext ?? ''}`
      : null;
    const shouldAutoSend = !!thisKey && lastAutoSentKeyRef.current !== thisKey;
    if (shouldAutoSend) {
      lastAutoSentKeyRef.current = thisKey;
      didAutoSendRef.current = true;

      let question: string;
      const tonePreamble = `Talk to me like a warm Malaysian friend who knows money. Use ringgit, local references where fitting (mamak, pasar malam, Grab, Shopee, etc.). Be numbers-specific. Skip generic advice. Reference my actual data.`;
      if (walletContext) {
        if (walletQuestion) {
          question = `Here's a live snapshot of my wallets (day ${new Date().getDate()} of the month):\n\n${walletContext}\n\n${walletQuestion}\n\n${tonePreamble}`;
        } else {
          question = `Here's a live snapshot of my wallets (day ${new Date().getDate()} of the month):\n\n${walletContext}\n\nCoach me on my liquidity and money-parking habits. Point out idle money, credit traps, and one specific move I could make this month. ${tonePreamble}`;
        }
      } else if (budgetContext) {
        if (budgetQuestion) {
          // User tapped a specific quick-prompt — use their exact question with the live snapshot
          question = `Here's my live budget snapshot (day ${new Date().getDate()} of the month):\n\n${budgetContext}\n\n${budgetQuestion}\n\n${tonePreamble}`;
        } else {
          // Fallback: generic coaching flow
          const isOver = budgetContext.includes('OVER_BUDGET');
          const isTight = budgetContext.includes('TIGHT');
          const mood = isOver
            ? `I'm already over in some categories. Don't shame me — help me recover calmly. Which specific overspends matter most to reduce this week? Give me one quiet win today to feel in control.`
            : isTight
            ? `I'm on a tight runway. Which categories are pulling me down? Where's the easiest RM 50-100 I can save this week without killing the joy?`
            : `Things look okay. Don't just cheerlead — scan for hidden leaks, one category I could tighten, and one habit that compounds over months.`;
          question = `Here's a live snapshot of my budgets right now (day ${new Date().getDate()} of the month):\n\n${budgetContext}\n\n${mood}\n\n${tonePreamble}`;
        }
      } else if (extractionContext) {
        question = `Here's my note:\n\n${initialContext}\n\nThe app extracted these items:\n${extractionContext}\n\nCheck if anything is missing or wrong — amounts, categories, items that should be there but aren't.`;
      } else {
        question = `Here's my note — help me understand the finances:\n\n${initialContext}`;
      }

      setInput('');
      addChatMessage({ role: 'user', content: question, timestamp: new Date().toISOString() });
      setIsLoading(true);
      setStreamingText('');
      const thisRequestId = ++requestIdRef.current;
      (async () => {
        const result = await sendChatMessageStream(
          question,
          chatMessages,
          (textSoFar) => {
            if (requestIdRef.current !== thisRequestId) return;
            setStreamingText(textSoFar);
            followStream();
          },
        );
        if (requestIdRef.current !== thisRequestId) return;
        setStreamingText(null);
        if (result.ok) {
          processResponse(result.text);
        } else {
          showError(result.error);
        }
        setIsLoading(false);
      })();
    }
  }, [initialContext, extractionContext, budgetContext, budgetQuestion, walletContext, walletQuestion]);

  // Core send: appends the user bubble, streams the reply, processes actions.
  // Runs strictly one at a time — sends that arrive while Echo is answering
  // are parked in sendQueue and drained by the effect below.
  const executeSend = useCallback(async (sendText: string, sendImageUri: string | null) => {
    addChatMessage({
      role: 'user',
      content: sendText,
      timestamp: new Date().toISOString(),
      imageUri: sendImageUri || undefined,
    });

    // On-device crisis check — never reaches Gemini (its safety filter would
    // just return empty → the "AI returned empty" dead end). Show a calm help
    // card instead. Nothing leaves the phone.
    if (isCrisisMessage(sendText)) {
      addChatMessage({ role: 'assistant', kind: 'crisis', content: t.moneyChat.crisisBody, timestamp: new Date().toISOString() });
      return;
    }

    setIsLoading(true);
    setStreamingText(''); // started — typing dots until first token

    const thisRequestId = ++requestIdRef.current;

    // Resize + compress before sending. A full-res photo's base64 is several
    // MB, which made the vision call crawl — it was nearly hitting the 45s
    // timeout. Mirrors the receipt-scan path: width 1024, JPEG q0.7.
    let base64: string | undefined;
    if (sendImageUri) {
      try {
        const resized = await manipulateAsync(
          sendImageUri,
          [{ resize: { width: 1024 } }],
          { compress: 0.7, format: SaveFormat.JPEG, base64: true },
        );
        base64 = resized.base64 || (await readAsStringAsync(resized.uri, { encoding: EncodingType.Base64 }));
      } catch {
        showError('could not read image');
        setIsLoading(false);
        setStreamingText(null);
        return;
      }
    }

    // Stream the reply in; spinner drops as soon as the first token arrives.
    const result = await sendChatMessageStream(
      sendText,
      chatMessages,
      (textSoFar) => {
        if (requestIdRef.current !== thisRequestId) return; // ignore stale stream
        setStreamingText(textSoFar);
        followStream();
      },
      base64,
    );

    // Discard stale response if a newer request was fired
    if (requestIdRef.current !== thisRequestId) return;

    setStreamingText(null); // clear live bubble before committing the final message

    if (result.ok) {
      setLastFailedSend(null);
      useAIInsightsStore.getState().setFailedCaptureText(null);
      processResponse(result.text);
    } else {
      setLastFailedSend({ text: sendText, base64 });
      if (sendText) useAIInsightsStore.getState().setFailedCaptureText(sendText);
      showError(result.error);
    }

    setIsLoading(false);
  }, [chatMessages, addChatMessage, showError, processResponse, followStream, t]);

  const handleSend = useCallback(() => {
    const question = input.trim();
    const hasImage = !!imageUri;
    if (!question && !hasImage) return;

    lightTap();
    // Strip any model-control tokens a user might paste so they can't inject an
    // [ACTION] block by echoing it back into the chat (B16 / contract #4).
    const sendText = sanitizeUserText(question);
    const sendImageUri = imageUri;
    setInput('');
    setImageUri(null);
    setErrorNotice(null);

    if (isLoading) {
      // Echo is still answering — park it; the effect below fires it next.
      setSendQueue((q) => [...q, { text: sendText, imageUri: sendImageUri }]);
      return;
    }

    executeSend(sendText, sendImageUri);
  }, [input, imageUri, isLoading, executeSend]);

  // Drain the queue: whenever Echo finishes (isLoading flips false) and a
  // parked message is waiting, send it. Chains until the queue is empty.
  useEffect(() => {
    if (isLoading || sendQueue.length === 0) return;
    const [next, ...rest] = sendQueue;
    setSendQueue(rest);
    executeSend(next.text, next.imageUri);
  }, [isLoading, sendQueue, executeSend]);

  const handleRetry = useCallback(async () => {
    if (!lastFailedSend || isLoading) return;
    setErrorNotice(null);
    setIsLoading(true);
    setStreamingText('');
    const thisRequestId = ++requestIdRef.current;
    const result = await sendChatMessageStream(
      lastFailedSend.text,
      chatMessages,
      (textSoFar) => {
        if (requestIdRef.current !== thisRequestId) return;
        setStreamingText(textSoFar);
        followStream();
      },
      lastFailedSend.base64,
    );
    if (requestIdRef.current !== thisRequestId) return;
    setStreamingText(null);
    if (result.ok) {
      setLastFailedSend(null);
      processResponse(result.text);
    } else {
      showError(result.error);
    }
    setIsLoading(false);
  }, [lastFailedSend, isLoading, chatMessages, processResponse, showError, followStream]);

  const handleSelectText = useCallback((text: string) => {
    setSelectTextContent(text);
  }, []);

  const copyToClipboard = useCallback(async () => {
    if (selectTextContent) {
      await Clipboard.setStringAsync(selectTextContent);
      setSelectTextContent(null);
    }
  }, [selectTextContent]);

  const handleViewImage = useCallback((uri: string) => {
    setViewerUri(uri);
  }, []);

  const renderMessage = useCallback(({ item }: { item: AIMessage }) => (
    <ChatBubble item={item} onSelectText={handleSelectText} onViewImage={handleViewImage} />
  ), [handleSelectText, handleViewImage]);

  const keyExtractor = useCallback((_: AIMessage, index: number) => index.toString(), []);

  // The action currently open in the edit modal, resolved by clientId (B1).
  const editingAction = useMemo(
    () => (editingId ? pendingActions.find((a) => a.clientId === editingId) ?? null : null),
    [editingId, pendingActions],
  );

  // Segmented totals for the review sheet — never one summed RM (B6).
  const cameInTotal = useMemo(
    () => pendingActions.filter((a) => a.type === 'add_income').reduce((s, a) => s + (a.amount || 0), 0),
    [pendingActions],
  );
  const wentOutTotal = useMemo(
    () => pendingActions.filter((a) => a.type !== 'add_income').reduce((s, a) => s + (a.amount || 0), 0),
    [pendingActions],
  );

  // Cross-nav "undo last save" affordance (B10): valid only within a short TTL,
  // and only when the stashed receipts actually carry something reversible
  // (honest undo — never a no-op bar for a transfer-only save).
  const UNDO_TTL_MS = 5 * 60 * 1000;
  const lastSaveFresh = !!lastSave
    && Date.now() - lastSave.at < UNDO_TTL_MS
    && lastSave.receipts.some((r) => hasReversiblePayload(r));
  const handleUndoLastSave = useCallback(() => {
    const ls = useAIInsightsStore.getState().lastSave;
    if (!ls) return;
    undoReceipts(ls.receipts);
    clearLastSave();
    showToast(t.moneyChat.undoneToast, 'info');
  }, [undoReceipts, clearLastSave, t, showToast]);

  return (
    <View style={styles.container}>
      <ChatContainer {...chatContainerProps}>
        {chatMessages.length === 0 && !isLoading ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.emptyState, { paddingBottom: SPACING['2xl'] + contentPad }]}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <Feather name="zap" size={48} color={C.accent} />
            <Text style={styles.emptyTitle}>{t.chat.echo}</Text>
            <Text style={styles.emptySubtitle}>
              {isBusinessMode
                ? t.chat.askBusiness
                : t.chat.askAnything}
            </Text>
            <View style={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  style={styles.suggestionChip}
                  onPress={() => { lightTap(); setInput(suggestion); }}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            style={{ flex: 1 }}
            data={chatMessages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            contentContainerStyle={[styles.messageList, { paddingBottom: SPACING.lg + contentPad }]}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            maxToRenderPerBatch={8}
            windowSize={7}
            initialNumToRender={10}
            onContentSizeChange={handleContentSizeChange}
            onScroll={handleScroll}
            onScrollBeginDrag={handleScrollBeginDrag}
            scrollEventThrottle={100}
            ListFooterComponent={
              streamingText
                ? <StreamingBubble text={streamingText} />
                : isLoading
                ? <TypingDots />
                : checkinStamp && chatMessages.length > 0 && chatMessages[chatMessages.length - 1]?.timestamp === checkinStamp
                ? (
                  // Daily check-in nudge — action chips under Echo's greeting.
                  // "Log manual" opens the free quick-add form (no AI credit);
                  // "Set up auto log" only when Back Tap isn't configured yet.
                  <View style={styles.checkinChipRow}>
                    <TouchableOpacity
                      style={styles.suggestionChip}
                      onPress={() => { lightTap(); quickAddRef.current?.open(); }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.suggestionText}>✍️ {t.settings.checkinLogManual}</Text>
                    </TouchableOpacity>
                    {Platform.OS === 'ios' && !Platform.isPad && !quickLogConfigured && (
                      <TouchableOpacity
                        style={styles.suggestionChip}
                        onPress={() => { lightTap(); (navigation as any).navigate('QuickLogSetup'); }}
                        accessibilityRole="button"
                      >
                        <Text style={styles.suggestionText}>⚡ {t.settings.checkinSetupAutolog}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )
                : null
            }
          />
        )}

        {/* Scroll to bottom button */}
        {showScrollDown && chatMessages.length > 0 && (
          <TouchableOpacity style={styles.scrollDownButton} onPress={scrollToBottom} activeOpacity={0.8}>
            <Feather name="chevron-down" size={18} color={C.textMuted} />
          </TouchableOpacity>
        )}

        {attachVisible && (
          <Pressable style={styles.attachBackdrop} onPress={() => setAttachVisible(false)} />
        )}
        <BottomWrapper {...bottomWrapperProps}>
        {/* Cross-nav undo of the last save — survives leaving + reopening Echo,
            within a short TTL (B10). Hidden while chips are queued to avoid clutter. */}
        {lastSaveFresh && pendingActions.length === 0 && (
          <TouchableOpacity
            style={styles.undoLastBar}
            onPress={handleUndoLastSave}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t.moneyChat.undoLastSave}
          >
            <Feather name="rotate-ccw" size={14} color={C.bronze} />
            <Text style={styles.undoLastText}>{t.moneyChat.undoLastSave}</Text>
          </TouchableOpacity>
        )}

        {/* Pending actions — scrollable chips, tap to open edit modal */}
        {pendingActions.length > 0 && (
          <View style={styles.pendingSection}>
            <Text style={styles.pendingSectionLabel}>
              {(pendingActions.length === 1 ? t.moneyChat.pendingHintOne : t.moneyChat.pendingHintMany)
                .replace('{n}', String(pendingActions.length))}
            </Text>
            {/* Right-edge fade — mandatory on every horizontal scroller (B13) */}
            <View style={styles.pendingScrollWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled
                scrollEventThrottle={16}
                contentContainerStyle={styles.pendingChipRow}
              >
                {pendingActions.map((action, i) => (
                  <PendingChip
                    key={action.clientId ?? `${action.type}-${action.amount}-${i}`}
                    action={action}
                    flagged={!!flagNoteFor(action)}
                    onPress={() => handleChipPress(action)}
                  />
                ))}
              </ScrollView>
              <LinearGradient
                colors={[withAlpha(C.background, 0), C.background]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                pointerEvents="none"
                style={styles.pendingFade}
              />
            </View>
            {pendingActions.length >= 2 && (
              // Neu Select (olive CTA), wrapped so its 100% width insets to the composer's
              // marginHorizontal — same width as the input bar below it.
              <View style={{ marginHorizontal: SPACING.md, marginTop: SPACING.sm }}>
                <NeuButton
                  icon="check-circle"
                  label={`${t.moneyChat.reviewAll} (${pendingActions.length})`}
                  onPress={() => { autoOpenedReviewRef.current = true; setShowReviewSheet(true); }}
                  accessibilityLabel={`${t.moneyChat.reviewAll} (${pendingActions.length})`}
                />
              </View>
            )}
          </View>
        )}

        {/* Edit modal for pending action — keyed by clientId (B1) */}
        {editingAction && (
          <ActionEditModal
            visible
            action={editingAction}
            flagNote={flagNoteFor(editingAction)}
            onConfirm={(edited) => handleConfirmAction(editingAction.clientId!, edited)}
            onClose={() => setEditingId(null)}
            onDiscard={() => handleDismissAction(editingAction.clientId!)}
          />
        )}

        {/* Delete/edit-of-saved: show the matched row(s) before confirm (B5) */}
        <ResolveTargetModal
          state={resolving}
          onConfirm={confirmResolved}
          onClose={() => setResolving(null)}
        />

        {/* Review & save all — shown when 2+ entries are pending */}
        <ReviewEntriesSheet
          visible={showReviewSheet}
          actions={pendingActions}
          cameIn={cameInTotal}
          wentOut={wentOutTotal}
          hasDestructive={pendingActions.some(isDestructiveAction)}
          onClose={() => setShowReviewSheet(false)}
          onConfirmAll={handleSaveAll}
          onEditEntry={(id) => { setShowReviewSheet(false); setTimeout(() => setEditingId(id), 60); }}
          onRemoveEntry={(id) => { removePendingActionById(id); if (pendingActions.length <= 1) setShowReviewSheet(false); }}
          flagNoteFor={flagNoteFor}
        />

        {/* Fullscreen image viewer — tap a sent photo to open it */}
        <Modal
          visible={!!viewerUri}
          transparent
          animationType="fade"
          onRequestClose={() => setViewerUri(null)}
          statusBarTranslucent
        >
          <Pressable style={styles.imageViewerBackdrop} onPress={() => setViewerUri(null)}>
            {viewerUri && (
              <Image source={{ uri: viewerUri }} style={styles.imageViewerImage} resizeMode="contain" />
            )}
            <TouchableOpacity
              style={styles.imageViewerClose}
              onPress={() => setViewerUri(null)}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
              accessibilityRole="button"
              accessibilityLabel={t.common.close}
            >
              <Feather name="x" size={15} color="rgba(255,255,255,0.9)" />
              <Text style={styles.imageViewerCloseText}>{t.common.close}</Text>
            </TouchableOpacity>
          </Pressable>
        </Modal>

        {/* Transient error notice — not saved to chat */}
        {errorNotice && !isLoading && (
          <View style={styles.errorNotice}>
            <Feather name="alert-circle" size={14} color={C.bronze} />
            <Text style={styles.errorNoticeText}>{errorNotice}</Text>
            {lastFailedSend && (
              <TouchableOpacity
                onPress={handleRetry}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.retryButton}
              >
                <Feather name="refresh-cw" size={12} color={C.bronze} />
                <Text style={styles.retryText}>retry</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => { setErrorNotice(null); setLastFailedSend(null); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={14} color={C.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Image preview strip */}
        {imageUri && (
          <View style={styles.imagePreviewBar}>
            <Image source={{ uri: imageUri }} style={styles.previewThumb} />
            <TouchableOpacity
              style={styles.removePreview}
              onPress={() => setImageUri(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.removePreviewBg}>
                <Feather name="x" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Listening surface — one calm card; morphs in over the composer footprint ── */}
        {(isRecording || isTranscribing) && (
          <Animated.View
            style={[styles.listeningSurface, { opacity: listenAnim, transform: [{ translateY: surfaceTranslate }] }]}
            onStartShouldSetResponder={() => true}
          >
            {/* HERO — "tengah dengar…", the live caption, or the calm prompt. In server mode the live
                caption is an EPHEMERAL grey preview (shown muted so it reads as a draft); the accurate
                Malay replaces it in the composer on stop. */}
            <View style={styles.listeningTranscriptWrap}>
              <Text
                style={[styles.listeningTranscript, (isTranscribing || serverMode || !liveTranscript) && styles.listeningPrompt]}
                numberOfLines={3}
              >
                {isTranscribing
                  ? t.moneyChat.voiceTranscribing
                  : serverMode
                    ? t.moneyChat.voicePrompt
                    : (liveTranscript || t.moneyChat.voicePrompt)}
              </Text>
            </View>

            {/* HINT — Manglish reassurance, only while listening with no words yet */}
            {isRecording && !isTranscribing && !liveTranscript && (
              <Text style={styles.listeningHint} numberOfLines={1}>{t.moneyChat.voiceHint}</Text>
            )}

            {isRecording ? (
              /* CONTROL ROW — discard · breathing meter+dot+timer · finish(commit) */
              <View style={styles.listeningControls}>
                <TouchableOpacity
                  style={styles.voiceCancelCircle}
                  onPress={handleCancelVoice}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.moneyChat.voiceCancel}
                >
                  <Feather name="x" size={20} color={C.bronze} />
                </TouchableOpacity>

                <View style={styles.listeningMeter}>
                  <View style={styles.listeningMeterCore}>
                    <Animated.View style={[styles.meterBlob, { transform: [{ scale: blobScale }] }]} />
                    <Animated.View style={[styles.meterDot, { opacity: recordingAnim }]} />
                  </View>
                  <Text style={styles.listeningTimer}>{formatSecs(recordSecs)}</Text>
                </View>

                <TouchableOpacity
                  style={styles.voiceStopCircle}
                  onPress={() => { lightTap(); stopAndTranscribe(); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.moneyChat.voiceStop}
                >
                  <Feather name="check" size={24} color={C.onAccent} />
                </TouchableOpacity>
              </View>
            ) : (
              /* TRANSCRIBING — server is writing it down; just a calm breathing dot, no buttons. */
              <View style={styles.listeningMeter}>
                <View style={styles.listeningMeterCore}>
                  <Animated.View style={[styles.meterDot, { opacity: recordingAnim }]} />
                </View>
              </View>
            )}

            {/* FOOTER — the confirmation-first promise, in copy */}
            <Text style={styles.listeningFooter} numberOfLines={1}>{t.moneyChat.voiceReviewHint}</Text>
          </Animated.View>
        )}

        {/* One-time CLOUD CONSENT — shown BEFORE the first Malay server recording (pre-capture, pre-upload).
            "got it" remembers the choice + starts recording; ✕ backs out without recording. */}
        {showCloudConsent && !isRecording && !isTranscribing && (
          <View style={styles.errorNotice}>
            <Feather name="cloud" size={14} color={C.bronze} />
            <Text style={styles.errorNoticeText}>{t.moneyChat.voiceCloudNote}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleCloudConsent}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.voiceActionText}>{t.moneyChat.voiceCloudOk}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowCloudConsent(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t.moneyChat.voiceCancel}
            >
              <Feather name="x" size={14} color={C.bronze} />
            </TouchableOpacity>
          </View>
        )}

        {/* Voice error — calm, persistent, never red */}
        {voiceErrorKind && !isRecording && !isTranscribing && (
          <View style={styles.errorNotice}>
            <Feather name="alert-circle" size={14} color={C.bronze} />
            <Text style={styles.errorNoticeText}>{voiceErrorCopy(voiceErrorKind)}</Text>
            {voiceErrorKind === 'permission' && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => { setVoiceErrorKind(null); Linking.openSettings(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.voiceActionText}>{t.moneyChat.voiceOpenSettings}</Text>
              </TouchableOpacity>
            )}
            {(voiceErrorKind === 'network' || voiceErrorKind === 'generic') && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => { setVoiceErrorKind(null); inputRef.current?.focus(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.voiceActionText}>{t.moneyChat.voiceTypeInstead}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setVoiceErrorKind(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t.moneyChat.voiceCancel}
            >
              <Feather name="x" size={14} color={C.bronze} />
            </TouchableOpacity>
          </View>
        )}

        {/* Cloud-Malay nudge — one tap turns it on (no download); calm, bronze, never blocks typing */}
        {showMalayPrompt && !isRecording && !isTranscribing && (
          <View style={styles.errorNotice}>
            <Feather name="cloud" size={14} color={C.bronze} />
            <Text style={styles.errorNoticeText}>{t.moneyChat.voiceMalayPrep}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleGetMalay}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.voiceActionText}>{t.moneyChat.voiceGetMalay}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setMalayVoicePromptSeen(true); setShowMalayPrompt(false); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t.moneyChat.voiceCancel}
            >
              <Feather name="x" size={14} color={C.bronze} />
            </TouchableOpacity>
          </View>
        )}

        {/* Queued message hint — typing stays open while Echo answers */}
        {sendQueue.length > 0 && (
          <View style={styles.errorNotice}>
            <Feather name="clock" size={14} color={C.bronze} />
            <Text style={styles.errorNoticeText}>{t.moneyChat.queued}</Text>
          </View>
        )}

        <View ref={guideTargetRef} style={[styles.inputBar, navBarInset ? { marginBottom: navBarInset } : null]} collapsable={false}>
          {attachVisible && (
            <View style={styles.attachPopover} onStartShouldSetResponder={() => true}>
              <TouchableOpacity style={styles.attachRow} onPress={() => { setAttachVisible(false); setTimeout(handlePickCamera, 50); }}>
                <Feather name="camera" size={16} color={C.textSecondary} />
                <Text style={styles.attachLabel}>{t.moneyChat.takePhoto}</Text>
              </TouchableOpacity>
              <View style={styles.attachDivider} />
              <TouchableOpacity style={styles.attachRow} onPress={() => { setAttachVisible(false); setTimeout(handlePickGallery, 50); }}>
                <Feather name="image" size={16} color={C.textSecondary} />
                <Text style={styles.attachLabel}>{t.moneyChat.chooseFromGallery}</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* Attach — single button opens a camera / gallery choice */}
          <TouchableOpacity
            style={styles.inputIconButton}
            onPress={() => { lightTap(); setAttachVisible((v) => !v); }}
            disabled={isRecording}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t.moneyChat.attach}
          >
            <Feather
              name="plus"
              size={22}
              color={isRecording ? C.border : C.textSecondary}
            />
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder={isRecording ? '' : dynamicPlaceholder}
            placeholderTextColor={C.border}
            multiline
            editable={!isRecording && !isTranscribing}
          />

          {/* Mic / Send toggle */}
          {input.trim() || imageUri ? (
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: C.accent }]}
              onPress={handleSend}
            >
              <Feather name="send" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendButton,
                isRecording && styles.micButtonActive,
                isLoading && styles.sendButtonDisabled,
              ]}
              onPress={handleMicPress}
              disabled={isLoading || isRecording}
              accessibilityRole="button"
              accessibilityLabel={t.moneyChat.voiceStart}
              accessibilityState={{ selected: isRecording }}
            >
              {/* Stays a mic; the listening surface above shows the live state + owns stop/cancel. */}
              <Feather
                name="mic"
                size={20}
                color={isRecording ? C.onAccent : (isLoading ? C.textSecondary : C.accent)}
              />
            </TouchableOpacity>
          )}
        </View>
        </BottomWrapper>

      </ChatContainer>

      {/* Conversation history modal */}
      <Modal
        visible={showHistory}
        animationType="none"
        transparent
        onRequestClose={() => setShowHistory(false)}
      >
        <TouchableOpacity
          style={styles.historyOverlay}
          activeOpacity={1}
          onPress={() => setShowHistory(false)}
        >
          <View style={styles.historyCard} onStartShouldSetResponder={() => true}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>{t.chat.pastChats}</Text>
              <TouchableOpacity
                onPress={() => setShowHistory(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={18} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            {conversations.length === 0 ? (
              <Text style={styles.historyEmpty}>{t.chat.noPastConversations}</Text>
            ) : (
              <FlatList
                style={[styles.historyList, styles.historyListBleed]}
                contentContainerStyle={styles.historyListContent}
                showsVerticalScrollIndicator={false}
                data={conversations}
                keyExtractor={(item) => item.id}
                removeClippedSubviews
                maxToRenderPerBatch={10}
                windowSize={5}
                initialNumToRender={10}
                renderItem={({ item: convo }) => {
                  // Tier saved-history cap: locked convos open the paywall, not
                  // the chat. Nothing is deleted — upgrading unlocks in place.
                  const locked = lockedConversationIds.has(convo.id);
                  return (
                  <TouchableOpacity
                    style={[styles.historyItem, locked && { opacity: 0.55 }]}
                    onPress={() => {
                      if (locked) { lightTap(); setHistoryPaywallVisible(true); return; }
                      requestIdRef.current++; // discard any in-flight reply into the swapped thread
                      loadConversation(convo.id);
                      setShowHistory(false);
                      scrollToLatestRetries();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.historyItemContent}>
                      <Text style={styles.historyItemTitle} numberOfLines={1}>{convo.title}</Text>
                      <Text style={styles.historyItemMeta}>
                        {locked ? t.settings.chatLockedTitle : `${convo.messages.length} messages`} · {(() => {
                          try {
                            const d = new Date(convo.lastMessageAt);
                            return isNaN(d.getTime()) ? '' : format(d, 'MMM d, HH:mm');
                          } catch { return ''; }
                        })()}
                      </Text>
                    </View>
                    {/* Lock gates READING only — deleting your own data always works
                        (privacy: sensitive amounts/debts must be removable unpaid). */}
                    {locked && <Feather name="lock" size={14} color={C.textMuted} style={{ padding: 4 }} />}
                    <TouchableOpacity
                      onPress={() => deleteConversation(convo.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 4 }}
                    >
                      <Feather name="trash-2" size={14} color={C.textMuted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </TouchableOpacity>
        {/* asOverlay: this history view is an RN <Modal> — iOS can't present a
            second Modal over it, so the paywall renders inside this window.
            absoluteFill host: the paywall's asOverlay root is flex:1 and would
            otherwise SPLIT the window 50/50 with the history card (the
            documented CategoryManager case). */}
        {historyPaywallVisible && (
          <View style={StyleSheet.absoluteFill}>
            <PaywallModal
              visible
              asOverlay
              feature="ai"
              reason={t.settings.chatLockedHint}
              onClose={() => setHistoryPaywallVisible(false)}
            />
          </View>
        )}
        <ModalToastHost />
      </Modal>

      {/* Select text modal — long-press opens this so user can select specific words */}
      <Modal
        visible={!!selectTextContent}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectTextContent(null)}
      >
        <TouchableOpacity
          style={styles.selectTextOverlay}
          activeOpacity={1}
          onPress={() => setSelectTextContent(null)}
        >
          <View style={styles.selectTextCard} onStartShouldSetResponder={() => true}>
            <View style={styles.selectTextHeader}>
              <Text style={styles.selectTextTitle}>{t.chat.selectText}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <TouchableOpacity
                  onPress={copyToClipboard}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="copy" size={16} color={C.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSelectTextContent(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={18} color={C.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <TextInput
              style={styles.selectTextBody}
              value={selectTextContent || ''}
              editable={false}
              multiline
              scrollEnabled
              selectTextOnFocus={false}
            />
          </View>
        </TouchableOpacity>
        <ModalToastHost />
      </Modal>

      <ScreenGuide
        id="guide_chat"
        accent="#6BA3BE"
        // Do-it-with-me: the hole over the composer is tappable; the guide waits
        // for the user's first message and advances to the payoff on send.
        steps={[
          { kind: 'intro', title: t.guide.meetEcho, icon: 'zap', body: t.guide.descChat },
          {
            kind: 'doWithMe',
            targetRef: guideTargetRef,
            label: t.guide.chatWalk,
            keyboardAware: true,
            // Count only USER messages: advance when the user actually sends, so
            // an assistant auto-message (daily check-in, context reply) can never
            // fast-forward the step.
            watch: whenStore(useAIInsightsStore, (s) => s.chatMessages.filter((m) => m.role === 'user').length, (n, base) => n > base),
          },
          { kind: 'payoff', title: t.guide.chatPayoffTitle, body: t.guide.chatPayoffBody, icon: 'check-circle' },
        ]}
      />

      {/* Locally-hosted quick-add sheet for the check-in "Log manual" chip —
          free logging path (no AI credit), same recipe as Calculator's host. */}
      <QuickAddExpense ref={quickAddRef} showFab={false} registerGlobalOpener={false} />
    </View>
  );
};

const makeStyles = (
  C: typeof CALM,
  neu: ReturnType<typeof useNeu>,
  neuStd: ReturnType<typeof useNeu> = neu, // standard neu for onyx field cards (ActionEditModal); others default to `neu`
  isDark = false,
) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  chatContainer: {
    flex: 1,
  },

  // Empty state
  emptyState: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING['2xl'],
    gap: SPACING.md,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  emptySubtitle: {
    ...TYPE.muted,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  suggestions: {
    gap: SPACING.sm,
    width: '100%',
  },
  suggestionChip: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    ...neu.raised,
  },
  suggestionText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  // Daily check-in nudge chips (under the greeting bubble)
  checkinChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },

  // Messages
  messageList: {
    padding: SPACING.lg,
    gap: SPACING.md,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },
  messageBubble: {
    maxWidth: '80%',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: C.accent,
    // Neu's gray shadows are invisible on an olive bubble over near-black — they
    // need tonal contrast this combo lacks. An accent-tinted glow is the depth
    // that actually reads on a colored surface (same boxShadow mechanism as neu).
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 10, color: withAlpha(C.accent, 0.28) }] as any,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    ...neu.raisedSoft,
  },
  messageText: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: TYPE.insight.lineHeight,
    color: C.textPrimary,
  },
  userMessageText: {
    color: '#fff',
  },

  // Crisis help card — calm, tappable hotlines (on-device, nothing sent)
  crisisCard: {
    maxWidth: '86%',
    gap: SPACING.sm,
  },
  crisisLead: {
    fontSize: TYPE.insight.fontSize,
    fontWeight: '700',
    color: C.textPrimary,
  },
  crisisBody: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: TYPE.insight.lineHeight,
    color: C.textSecondary,
  },
  crisisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
  },
  crisisOrg: {
    fontSize: TYPE.insight.fontSize,
    color: C.textPrimary,
  },
  crisisNum: {
    fontSize: TYPE.insight.fontSize,
    fontWeight: '700',
    color: C.deepOlive,
  },
  crisisHint: {
    fontSize: TYPE.muted.fontSize,
    color: C.textMuted,
    textAlign: 'center',
  },

  // Streaming bubble — inline blinking caret that wraps with the text
  streamingCaretText: {
    color: C.deepOlive,
    fontWeight: '700',
  },

  // Confirmed action cards (in chat)
  actionCard: {
    alignSelf: 'flex-start',
    maxWidth: '80%',
    marginTop: 4,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  actionCardSuccess: {
    backgroundColor: withAlpha(C.deepOlive, 0.06),
    borderColor: withAlpha(C.deepOlive, 0.15),
  },
  actionCardFail: {
    backgroundColor: withAlpha(C.textMuted, 0.06),
    borderColor: withAlpha(C.textMuted, 0.15),
  },
  actionCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCardText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.deepOlive,
  },
  actionCardTextFail: {
    color: C.textMuted,
  },

  // Scroll to bottom
  scrollDownButton: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: 120,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...neu.raised,
  },

  // Pending actions — scrollable chips
  pendingSection: {
    paddingVertical: SPACING.sm,
    gap: 6,
  },
  pendingSectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingHorizontal: SPACING.lg,
  },
  pendingScrollWrap: {
    position: 'relative',
  },
  pendingChipRow: {
    paddingLeft: SPACING.lg,
    paddingRight: SPACING['2xl'],
    paddingVertical: 6, // room for the chips' neu shadow inside the scroller's clip
    gap: SPACING.sm,
  },
  pendingFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    ...neu.raised,
  },
  pendingChipIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    ...neu.well,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textPrimary,
    maxWidth: 120,
  },
  pendingChipDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  pendingChipAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'] as any,
  },

  // Cross-nav "undo last save" pill (B10)
  undoLastBar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    ...neu.raised,
  },
  undoLastText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },

  // Reshape ask + debt preview bars (B11/B12)
  reshapeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  reshapeText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
  },
  reshapeBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.15),
  },
  reshapeBtnText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  debtPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  debtPreviewText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },

  // Resolve-target modal (B5)
  resolveRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  resolveCard: {
    width: '90%',
    maxWidth: 460,
    maxHeight: '80%',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.sm,
    ...neu.raisedSoft,
  },
  resolveTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
  },
  resolveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    marginBottom: 6,
    ...neu.raisedSoft,
  },
  resolveRowText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
  },

  // Floating edit modal
  modalOverlayKav: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '88%',
    maxHeight: '80%',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...neu.raisedModal,
  },
  modalClose: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    zIndex: 1,
  },
  // neu-onyx-vertical-error fix: the ScrollView clips at its bounds, cutting the neu shadows of
  // the picker rows / type pill inside — hard lines down the modal. Bleed the viewport out to the
  // card edge and pad the content back in so shadows have room (see memory neu-boxshadow-device-seam).
  modalScroll: {
    marginHorizontal: -SPACING.lg,
  },
  modalScrollContent: {
    gap: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  editTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RADIUS.full,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm + 4,
    ...neu.raised,
    backgroundColor: withAlpha(C.bronze, 0.08),
  },
  editTypePillText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.1,
  },
  // Field/picker cards — flat faint fill (a neu drop-shadow leaves vertical seams on the
  // near-black modal; the fill lifts each field cleanly). Matches NoteEditor's edit modal.
  // Onyx field cards: standard neu.raisedSoft raise + near-black face (0.015) so they read as
  // BLACK raised cards, not grey slabs. Safe now the modal ScrollView bleeds (modalScroll) so
  // the shadows don't clip. See memory neu-boxshadow-device-seam.
  editFieldCard: {
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    ...neuStd.raisedSoft,
    backgroundColor: isDark ? withAlpha(C.textPrimary, 0.015) : neuStd.base,
  },
  editFieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  editFieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    letterSpacing: -0.1,
  },
  editPickerCard: {
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    ...neuStd.raisedSoft,
    backgroundColor: isDark ? withAlpha(C.textPrimary, 0.015) : neuStd.base,
  },
  editField: {
    gap: 4,
  },
  editLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  typeSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    ...neu.raised,
  },
  typeSelectText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  typePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typePickerCard: {
    width: '75%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: 2,
    ...SHADOWS.lg,
  },
  typePickerTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
  },
  typePickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    ...neu.raisedSoft,
    marginBottom: 4,
  },
  typePickerOptionActive: {
    backgroundColor: withAlpha(C.bronze, 0.08),
  },
  typePickerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    ...neu.well,
    backgroundColor: withAlpha(C.textMuted, 0.08),
    justifyContent: 'center',
    alignItems: 'center',
  },
  typePickerIconActive: {
    backgroundColor: withAlpha(C.bronze, 0.12),
  },
  typePickerText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
  },
  typePickerTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  amountSection: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    ...neuStd.raisedSoft,
    backgroundColor: isDark ? withAlpha(C.textPrimary, 0.015) : neuStd.base,
  },
  amountPrefix: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    padding: 0,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  descInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...neu.insetSoft,
  },
  modalDivider: {
    height: 1,
    backgroundColor: C.border,
  },
  debtToggleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  debtToggle: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
  },
  debtToggleTheyOwe: {
    backgroundColor: withAlpha(C.deepOlive, 0.12),
  },
  debtToggleIOwe: {
    backgroundColor: withAlpha('#C1694F', 0.12),
  },
  debtToggleText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  debtToggleTextTheyOwe: {
    color: C.deepOlive,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  debtToggleTextIOwe: {
    color: '#C1694F',
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  discardBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  discardBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },

  // Fullscreen image viewer (lightbox) — dark backdrop regardless of theme
  imageViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerImage: {
    width: '92%',
    height: '82%',
  },
  // Bottom-centered "✕ close" pill (moved down from the top-right corner).
  imageViewerClose: {
    position: 'absolute',
    bottom: 64,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  imageViewerCloseText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.3,
  },

  // Error notice — transient, above input bar
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.lg,
  },
  errorNoticeText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.bronze, 0.12),
  },
  retryText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },

  // Typing dots
  typingBubble: {
    marginTop: SPACING.sm,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
  },

  // Input bar — a floating rounded pill that matches the Liquid Glass tab bar's
  // language (same 16px side inset, rounded corners, soft lift). A full-width
  // square band above an inset pill made the four corners read as broken.
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,                // tight +-to-input / input-to-mic gap
    marginHorizontal: SPACING.md,   // 16 — same side inset as the floating nav bar
    paddingLeft: SPACING.xs,        // + hugs the left edge → maximum input width
    paddingRight: SPACING.sm,       // mic keeps a touch more air on the right
    paddingVertical: SPACING.md,
    borderRadius: RADIUS['2xl'],    // 28 — echoes the capsule's 30
    ...neu.raisedSoft,              // onyx lift — zero outline per the neu standard
  },
  attachBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent', // explicit: tap-catcher only, never a dimming veil
  },
  attachPopover: {
    position: 'absolute',
    bottom: '100%',
    left: SPACING.sm,
    marginBottom: SPACING.sm,
    minWidth: 210,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.xs,
    zIndex: 50,
    // Plain solid card — no neu: raisedSoft painted it the SCREEN bg (read as
    // "transparent"), and its boxShadow rendered the card wrong on this
    // absolutely-positioned view. SHADOWS.md + surface + hairline is the same
    // solid-card recipe the select bar uses.
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(C.textPrimary, 0.08),
    ...SHADOWS.md,
  },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.lg,
  },
  attachLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  attachDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginHorizontal: SPACING.lg,
  },
  inputIconButton: {
    width: 32,          // slim: just the glyph + breathing room, so the input gets the width
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    ...neu.insetSoft,
    borderRadius: 18,               // gentle rounding; full capsule was over-round
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...neu.raised,
  },
  sendButtonDisabled: {
    backgroundColor: C.border,
  },
  micButtonActive: {
    backgroundColor: C.accent,
  },

  // Image preview
  imagePreviewBar: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: C.background,
  },
  previewThumb: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.md,
  },
  removePreview: {
    position: 'absolute',
    top: SPACING.sm - 6,
    left: SPACING.lg + 48,
  },
  removePreviewBg: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Chat image in bubble
  chatImage: {
    width: 160,
    height: 120,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },

  // ── Listening surface (voice) ──────────────────────────────────────────
  listeningSurface: {
    // No `width: '100%'` — that + marginHorizontal made it 100% wide PLUS 16px margins, so it
    // overflowed ~16px past each edge (wider than the inputBar). Let it stretch-fill minus the
    // margins, exactly like the inputBar below it. maxWidth still caps it on tablets.
    maxWidth: 640,
    borderRadius: RADIUS.xl,
    ...neu.raisedSoft,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    marginHorizontal: SPACING.md, // aligns with the inputBar inset
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  listeningTranscriptWrap: {
    minHeight: 26, // reserve one line so the card doesn't jump on the first word
    justifyContent: 'flex-start',
  },
  listeningTranscript: {
    fontSize: TYPOGRAPHY.size.lg, // HERO — the trust signal
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    lineHeight: TYPOGRAPHY.size.lg * 1.4,
  },
  listeningPrompt: {
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
  },
  listeningHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: -SPACING.xs,
  },
  listeningControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  listeningMeter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    height: 36,
  },
  listeningMeterCore: {
    width: 44, // fixed box so the scaling blob doesn't reflow the timer
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meterBlob: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: withAlpha(C.accent, 0.16),
  },
  meterDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: C.accent,
  },
  listeningTimer: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
    minWidth: 34,
    textAlign: 'left',
  },
  voiceCancelCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...neu.raised,
    backgroundColor: withAlpha(C.bronze, 0.1),
  },
  voiceStopCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...neu.raised,
    backgroundColor: C.accent,
  },
  listeningFooter: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  voiceActionText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Conversation history modal
  historyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyCard: {
    width: '88%',
    maxHeight: '70%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    // Established modal-card treatment (same as the QR label/action modals) —
    // neu separation instead of a shadow blob.
    ...neu.raisedModal,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  historyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  historyList: {
    maxHeight: 400,
  },
  // Neu-seam fix (docs/neu-vertical-error.md): the FlatList clips the rows'
  // raisedSoft shadows into a hard vertical line at its bounds. Bleed the
  // viewport and pad the CONTENT so shadows fade into slack before the clip.
  historyListBleed: {
    marginHorizontal: -SPACING.lg,
    marginVertical: -12,
  },
  historyListContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
  },
  historyEmpty: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    ...neu.raisedSoft,
  },
  historyItemContent: {
    flex: 1,
    gap: 2,
  },
  historyItemTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  historyItemMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },

  // Select text modal
  selectTextOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectTextCard: {
    width: '88%',
    maxHeight: '70%',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...neu.raisedModal,   // scrim rule: drops the white #FFFFFF highlight that halos on the dim backdrop
  },
  selectTextHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  selectTextTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  selectTextBody: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: (TYPE.insight.lineHeight || 22) + 4,
    color: C.textPrimary,
    maxHeight: 400,
    padding: 0,
  },

});

export default MoneyChat;
