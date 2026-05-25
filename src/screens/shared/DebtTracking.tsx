import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Platform,
  Keyboard,
  FlatList,
  KeyboardAvoidingView,
  ActivityIndicator,
  Linking,
  Image,


  RefreshControl,
  InputAccessoryView,
  NativeModules,
} from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { useWindowDimensions } from 'react-native';
import { lightTap } from '../../services/haptics';
import { KeyboardAwareScrollView, KeyboardToolbar } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { format, differenceInDays, isValid } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
const getDocumentScanner = (): typeof import('react-native-document-scanner-plugin').default | null => {
  try {
    if (!NativeModules.DocumentScanner) return null;
    return require('react-native-document-scanner-plugin').default;
  } catch { return null; }
};
import * as Contacts from 'expo-contacts';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { scanReceipt } from '../../services/receiptScanner';
import { usePremiumStore } from '../../store/premiumStore';
import { useDebtStore } from '../../store/debtStore';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import { useBusinessStore } from '../../store/businessStore';
import { useWalletStore } from '../../store/walletStore';
import { useLearningStore } from '../../store/learningStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CALM,
  CALM_DARK,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  SHADOWS,
  SPLIT_METHODS,
  DEBT_TYPES_SAFE,
  DEBT_STATUSES_SAFE,
  BIZ_SAFE,
  semantic,
  withAlpha,
} from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import Card from '../../components/common/Card';
import WalletLogo from '../../components/common/WalletLogo';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ProgressBar from '../../components/common/ProgressBar';
import ContactPicker from '../../components/common/ContactPicker';
import FAB from '../../components/common/FAB';
import ScreenGuide from '../../components/common/ScreenGuide';
import { useT } from '../../i18n';
import WalletPicker from '../../components/common/WalletPicker';
import CategoryPicker from '../../components/common/CategoryPicker';
import CategoryManager from '../../components/common/CategoryManager';
import CalendarPicker from '../../components/common/CalendarPicker';
import { useToast } from '../../context/ToastContext';
import InModalToast, { InModalToastRef } from '../../components/common/InModalToast';
import { newId } from '../../utils/id';
import {
  Contact,
  Debt,
  Payment,
  SplitExpense,
  DebtType,
  SplitMethod,
  SplitParticipant,
  SplitItem,
  TaxHandling,
  ExtractedReceipt,
} from '../../types';
import { calculateSplit, CalculateSplitResult } from '../../utils/splitCalculator';
import { useCategories } from '../../hooks/useCategories';

type TabType = 'debts' | 'splits';

type DebtTrackingParams = {
  DebtTracking: { receiptData?: { vendor: string; total: number; items: { name: string; amount: number }[] }; highlightId?: string } | undefined;
};


const DebtTracking: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  // ── Resolved semantic color tokens (replaces hardcoded hex throughout) ──
  // Drives DESIGN-H1 fix: every status/type color flows from the WCAG-safe
  // DEBT_TYPES_SAFE / DEBT_STATUSES_SAFE / BIZ_SAFE tables.
  const iOweColor = semantic(DEBT_TYPES_SAFE[0].color, isDark);       // terracotta
  const theyOweColor = semantic(DEBT_TYPES_SAFE[1].color, isDark);    // olive
  const pendingColor = semantic(DEBT_STATUSES_SAFE[0].color, isDark); // gold
  const partialColor = semantic(DEBT_STATUSES_SAFE[1].color, isDark); // bronze
  const settledColor = semantic(DEBT_STATUSES_SAFE[2].color, isDark); // sky
  const overdueColor = semantic(BIZ_SAFE.error, isDark);              // burnt sienna (replaces #A0714A)
  const destructiveColor = semantic(BIZ_SAFE.destructive, isDark);    // terracotta (replaces #5E72E4)
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<DebtTrackingParams, 'DebtTracking'>>();
  const navigation = useNavigation();
  const { showToast: _globalShowToast } = useToast();
  const modalToastRef = useRef<InModalToastRef>(null);
  const showToast = useCallback((msg: string, type?: 'success' | 'error' | 'info') => {
    if (type !== 'success' && modalToastRef.current) {
      modalToastRef.current.show(msg, type);
    } else {
      _globalShowToast(msg, type);
    }
  }, [_globalShowToast]);
  const mode = useAppStore((state) => state.mode);
  const currency = useSettingsStore((state) => state.currency);
  const userName = useSettingsStore((state) => state.userName);
  const debtsShowArchive = useSettingsStore((state) => state.debtsShowArchive);
  const setDebtsShowArchive = useSettingsStore((state) => state.setDebtsShowArchive);
  const debtsShowReminder = useSettingsStore((state) => state.debtsShowReminder);
  const setDebtsShowReminder = useSettingsStore((state) => state.setDebtsShowReminder);
  const personalQrs = useSettingsStore((state) => state.paymentQrs);
  const businessQrs = useSettingsStore((state) => state.businessPaymentQrs);
  const paymentQrs = mode === 'business' ? businessQrs : personalQrs;
  const hasPaymentQr = useMemo(() => paymentQrs.length > 0, [paymentQrs]);

  const getSelfContact = useCallback((): Contact => ({
    id: '__self__',
    name: userName?.trim() || 'me',
    isFromPhone: false,
  }), [userName]);

  const debts = useDebtStore((s) => s.debts);
  const splits = useDebtStore((s) => s.splits);
  const addDebt = useDebtStore((s) => s.addDebt);
  const updateDebt = useDebtStore((s) => s.updateDebt);
  const deleteDebt = useDebtStore((s) => s.deleteDebt);
  const archiveDebt = useDebtStore((s) => s.archiveDebt);
  const unarchiveDebt = useDebtStore((s) => s.unarchiveDebt);
  const addPayment = useDebtStore((s) => s.addPayment);
  const deletePayment = useDebtStore((s) => s.deletePayment);
  const updatePayment = useDebtStore((s) => s.updatePayment);
  const addSplit = useDebtStore((s) => s.addSplit);
  const updateSplit = useDebtStore((s) => s.updateSplit);
  const deleteSplit = useDebtStore((s) => s.deleteSplit);
  const archiveSplit = useDebtStore((s) => s.archiveSplit);
  const unarchiveSplit = useDebtStore((s) => s.unarchiveSplit);
  const markSplitParticipantPaid = useDebtStore((s) => s.markSplitParticipantPaid);
  const unmarkSplitParticipantPaid = useDebtStore((s) => s.unmarkSplitParticipantPaid);

  const addTransaction = usePersonalStore((state) => state.addTransaction);
  const updateTransaction = usePersonalStore((state) => state.updateTransaction);
  const deleteTransaction = usePersonalStore((state) => state.deleteTransaction);
  const addBusinessTransaction = useBusinessStore((state) => state.addBusinessTransaction);
  const updateBusinessTransaction = useBusinessStore((state) => state.updateBusinessTransaction);
  const deleteBusinessTransaction = useBusinessStore((state) => state.deleteBusinessTransaction);

  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const addToWallet = useWalletStore((s) => s.addToWallet);
  const useCredit = useWalletStore((s) => s.useCredit);
  const repayCredit = useWalletStore((s) => s.repayCredit);

  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');

  const [activeTab, setActiveTab] = useState<TabType>('debts');
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // Inline category manager (avoids navigating-from-modal blocking bug)
  const [categoryManagerType, setCategoryManagerType] = useState<'expense' | 'income' | 'investment' | null>(null);
  const categoryManagerCallerRef = useRef<'debt' | 'payment'>('debt');

  // Keyboard visibility tracking — drives the floating gold "done" FAB inside modals.
  // FAB shows only when a multiline text input is focused — numeric keypads have their
  // own native "Done" key, so showing the FAB there would be redundant.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [multilineFocused, setMultilineFocused] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      setMultilineFocused(false);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Auto-archive settled debts older than 30 days (respects groups — waits for all siblings)
  useEffect(() => {
    const now = new Date();
    const stale = debts.filter(
      (d) => d.status === 'settled' && !d.isArchived && differenceInDays(now, new Date(d.updatedAt)) >= 30,
    );
    const safeToArchive = stale.filter((d) => {
      if (!d.groupId) return true;
      const groupSiblings = debts.filter((s) => s.groupId === d.groupId && s.id !== d.id && !s.isArchived);
      return groupSiblings.every((s) =>
        s.status === 'settled' && differenceInDays(now, new Date(s.updatedAt)) >= 30
      );
    });
    if (safeToArchive.length > 0) {
      safeToArchive.forEach((d) => archiveDebt(d.id));
    }
  }, [debts, archiveDebt]);

  // Debt modal state
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [howItWorksVisible, setHowItWorksVisible] = useState(false);
  const [debtModalVisible, setDebtModalVisible] = useState(false);
  // Bottom-sheet animation primitives — match EditTransactionSheet behavior.
  const { height: SCREEN_H } = useWindowDimensions();
  const dDebtSheetY = useSharedValue(SCREEN_H);
  const dDebtDragStart = useSharedValue(0);
  const dDebtSaveScale = useSharedValue(1);
  const dDebtSaveShake = useSharedValue(0);
  const [dDebtIsSaving, setDDebtIsSaving] = useState(false);
  // Split modal — same primitives, separate values.
  const dSplitSheetY = useSharedValue(SCREEN_H);
  const dSplitDragStart = useSharedValue(0);
  const dSplitSaveScale = useSharedValue(1);
  const dSplitSaveShake = useSharedValue(0);
  const [dSplitIsSaving, setDSplitIsSaving] = useState(false);
  // Split Detail sheet — spring animation + swipe-to-dismiss (reuses dSplitSheetY/dSplitDragStart are taken — use separate)
  const dSplitDetailY = useSharedValue(SCREEN_H);
  const dSplitDetailDragStart = useSharedValue(0);
  // Record Payment modal — same primitives, separate values.
  const dPaySheetY = useSharedValue(SCREEN_H);
  const dPayDragStart = useSharedValue(0);
  const dPaySaveScale = useSharedValue(1);
  const dPaySaveShake = useSharedValue(0);
  const [dPayIsSaving, setDPayIsSaving] = useState(false);
  // Debt Detail sheet — spring animation + swipe-to-dismiss.
  const dDetailSheetY = useSharedValue(SCREEN_H);
  const dDetailDragStart = useSharedValue(0);
  // Group Detail sheet — spring animation + swipe-to-dismiss.
  const dGroupDetailSheetY = useSharedValue(SCREEN_H);
  const dGroupDetailDragStart = useSharedValue(0);
  const dReqSheetY = useSharedValue(SCREEN_H);
  const dReqDragStart = useSharedValue(0);
  const dReminderSheetY = useSharedValue(SCREEN_H);
  const dReminderDragStart = useSharedValue(0);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [debtContacts, setDebtContacts] = useState<Contact[]>([]);
  const [debtType, setDebtType] = useState<DebtType>('they_owe');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDescription, setDebtDescription] = useState('');
  const [debtCategory, setDebtCategory] = useState('');
  const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null);
  const [debtDueDate, setDebtDueDate] = useState('');
  const [debtDueDateObj, setDebtDueDateObj] = useState<Date | null>(null);
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);

  // Split modal state
  const debtSavingRef = useRef(false);
  const splitSavingRef = useRef(false);
  const paymentSavingRef = useRef(false);
  const wizardSavingRef = useRef(false);
  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [editingSplitId, setEditingSplitId] = useState<string | null>(null);
  const [splitDescription, setSplitDescription] = useState('');
  const [splitAmount, setSplitAmount] = useState('');
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [splitContacts, setSplitContacts] = useState<Contact[]>([]);
  const [splitPaidBy, setSplitPaidBy] = useState<Contact[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [splitItems, setSplitItems] = useState<SplitItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [splitWalletId, setSplitWalletId] = useState<string | null>(null);
  const [splitDueDateObj, setSplitDueDateObj] = useState<Date | null>(null);
  const [splitDueDate, setSplitDueDate] = useState('');
  const [splitDueDatePickerOpen, setSplitDueDatePickerOpen] = useState(false);

  // Payment modal state
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentDebtId, setPaymentDebtId] = useState<string | null>(null);
  const [paymentViewOnly, setPaymentViewOnly] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentWalletId, setPaymentWalletId] = useState<string | null>(null);
  const [paymentCategory, setPaymentCategory] = useState('');

  // Tip confirmation overlay state
  const [tipConfirmVisible, setTipConfirmVisible] = useState(false);
  const [tipConfirmData, setTipConfirmData] = useState<{ debt: Debt; amount: number; tip: number } | null>(null);

  // Payment detail modal state
  // Payment detail — rendered INSIDE the payment modal (no separate modal, avoids stutter)
  const [inPayDetail, setInPayDetail] = useState(false);
  const [payDetailDebtId, setPayDetailDebtId] = useState<string | null>(null);
  const [payDetailPayment, setPayDetailPayment] = useState<Payment | null>(null);
  const [editPayAmount, setEditPayAmount] = useState('');
  const [editPayNote, setEditPayNote] = useState('');
  const [payDetailSaving, setPayDetailSaving] = useState(false);

  // Split detail modal state
  const [splitDetailVisible, setSplitDetailVisible] = useState(false);
  const [selectedSplit, setSelectedSplit] = useState<SplitExpense | null>(null);
  const [returnToSplitId, setReturnToSplitId] = useState<string | null>(null);
  const [scanningReceipt, setScanningReceipt] = useState(false);

  // Wizard state
  const [wizardVisible, setWizardVisible] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [wizardReceipt, setWizardReceipt] = useState<ExtractedReceipt | null>(null);
  const [wizardDescription, setWizardDescription] = useState('');
  const [wizardTotal, setWizardTotal] = useState('');
  const [wizardEditingAmount, setWizardEditingAmount] = useState(false);
  const [wizardTaxHandling, setWizardTaxHandling] = useState<TaxHandling>('divide');
  const [wizardItems, setWizardItems] = useState<SplitItem[]>([]);
  const [wizardParticipants, setWizardParticipants] = useState<Contact[]>([]);
  const [wizardPaidBy, setWizardPaidBy] = useState<Contact | null>(null);
  const [wizardWalletId, setWizardWalletId] = useState<string | null>(
    wallets.find((w) => w.isDefault)?.id || null
  );
  const [wizardDueDate, setWizardDueDate] = useState<Date | null>(null);
  const [wizardDueDatePickerOpen, setWizardDueDatePickerOpen] = useState(false);

  // Draft tracking
  const wizardDraftId = useRef<string | null>(null);

  // Item editing state (step 4)
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editItemAmount, setEditItemAmount] = useState('');

  // Item assignment state
  const [assigningItemIndex, setAssigningItemIndex] = useState<number | null>(null);
  const [itemManualName, setItemManualName] = useState('');
  const [itemAssignMode, setItemAssignMode] = useState<'assign' | 'contacts'>('assign');
  const [itemPhoneContacts, setItemPhoneContacts] = useState<Contact[]>([]);
  const [itemContactSearch, setItemContactSearch] = useState('');
  const assignScrollRef = useRef<import('react-native').ScrollView>(null);

  // Request payment modal state
  const [splitChoiceVisible, setSplitChoiceVisible] = useState(false);
  const [fabChoiceVisible, setFabChoiceVisible] = useState(false);
  const [requestPaymentVisible, setRequestPaymentVisible] = useState(false);
  const [requestPaymentDebt, setRequestPaymentDebt] = useState<Debt | null>(null);
  const [requestPaymentMessage, setRequestPaymentMessage] = useState('');
  const [messageCopied, setMessageCopied] = useState(false);
  const [messageEditing, setMessageEditing] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [reminderDebt, setReminderDebt] = useState<Debt | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderEditing, setReminderEditing] = useState(false);
  const [reminderCopied, setReminderCopied] = useState(false);
  const messageInputRef = useRef<TextInput>(null);
  const [showQrPicker, setShowQrPicker] = useState(false);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState<'debt' | 'split' | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Split filter
  const [splitTab, setSplitTab] = useState<'waiting' | 'youOwe' | 'settled' | 'drafts' | 'archive'>('waiting');
  const [debtTab, setDebtTab] = useState<'pending' | 'settled' | 'archive'>('pending');

  // Search + debt filter
  const [searchQuery, setSearchQuery] = useState('');
  const [debtFilter, setDebtFilter] = useState<'pending' | 'partial' | 'settled' | null>(null);
  const [debtTypeFilter, setDebtTypeFilter] = useState<'i_owe' | 'they_owe' | null>(null);
  const [debtSort, setDebtSort] = useState<'newest' | 'oldest' | 'amount_high' | 'amount_low'>('newest');
  const [splitSort, setSplitSort] = useState<'newest' | 'oldest' | 'amount_high' | 'amount_low'>('newest');
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [groupPaymentId, setGroupPaymentId] = useState<string | null>(null);
  const [detailDebtId, setDetailDebtId] = useState<string | null>(null);
  const returnToDetailRef = useRef<string | null>(null);
  const returnToGroupRef = useRef<string | null>(null);
  const [detailGroupId, setDetailGroupId] = useState<string | null>(null);
  const mainScrollRef = useRef<any>(null);
  const highlightScrollTarget = useRef<string | null>(null);

  // Filtered data
  const modeDebts = useMemo(() => debts.filter((d) => d.mode === mode), [debts, mode]);
  const modeSplits = useMemo(() => splits.filter((s) => s.mode === mode), [splits, mode]);

  // Search + type + status filtered + sorted debts
  const filteredDebts = useMemo(() => {
    let result = modeDebts;
    // Bucket by tab — archive is a separate world.
    if (debtTab === 'archive') {
      result = result.filter((d) => d.isArchived === true);
    } else {
      // Default views: exclude archived items entirely.
      result = result.filter((d) => !d.isArchived);
      if (debtTab === 'pending') {
        result = result.filter((d) => d.status !== 'settled');
      } else if (debtTab === 'settled') {
        result = result.filter((d) => d.status === 'settled');
      }
    }
    if (debtTypeFilter) {
      result = result.filter((d) => d.type === debtTypeFilter);
    }
    if (debtFilter) {
      result = result.filter((d) => d.status === debtFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (d) => d.contact.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      // Use updatedAt for settled/partial (reflects last payment), createdAt for pending
      const aTime = new Date(a.status === 'pending' ? a.createdAt : a.updatedAt).getTime();
      const bTime = new Date(b.status === 'pending' ? b.createdAt : b.updatedAt).getTime();
      switch (debtSort) {
        case 'newest': return bTime - aTime || b.id.localeCompare(a.id);
        case 'oldest': return aTime - bTime || a.id.localeCompare(b.id);
        case 'amount_high': return (b.totalAmount - b.paidAmount) - (a.totalAmount - a.paidAmount) || bTime - aTime;
        case 'amount_low': return (a.totalAmount - a.paidAmount) - (b.totalAmount - b.paidAmount) || bTime - aTime;
        default: return 0;
      }
    });
    return result;
  }, [modeDebts, debtTab, debtTypeFilter, debtFilter, searchQuery, debtSort]);

  // Bucket counts (always uses non-mode-filtered modeDebts so badges reflect totals)
  const debtTabCounts = useMemo(() => ({
    pending: modeDebts.filter((d) => !d.isArchived && d.status !== 'settled').length,
    settled: modeDebts.filter((d) => !d.isArchived && d.status === 'settled').length,
    archive: modeDebts.filter((d) => d.isArchived === true).length,
  }), [modeDebts]);

  const groupedDebts = useMemo(() => {
    const map = new Map<string, { contactId: string; contactName: string; contact: typeof filteredDebts[0]['contact']; debts: typeof filteredDebts; totalRemaining: number }>();
    filteredDebts.forEach((debt) => {
      const key = debt.groupId || debt.contact.id || debt.contact.name;
      if (!map.has(key)) {
        map.set(key, { contactId: key, contactName: debt.contact.name, contact: debt.contact, debts: [], totalRemaining: 0 });
      }
      const g = map.get(key)!;
      g.debts.push(debt);
      g.totalRemaining += Math.max(0, debt.totalAmount - debt.paidAmount);
    });
    return Array.from(map.values());
  }, [filteredDebts]);

  // Search filtered splits
  const searchedSplits = useMemo(() => {
    if (!searchQuery.trim()) return modeSplits;
    const q = searchQuery.toLowerCase().trim();
    return modeSplits.filter(
      (s) => s.description.toLowerCase().includes(q) ||
        s.participants.some((p) => p.contact.name.toLowerCase().includes(q))
    );
  }, [modeSplits, searchQuery]);

  // Bucket each split into one of: drafts | waiting (others owe me) | youOwe | settled.
  // Drafts are workflow stash, not a status — they always go to drafts regardless of payment state.
  // For finalised splits:
  //   - settled when every non-self participant has isPaid === true
  //   - youOwe when someone else fronted the cash AND my own share is unpaid
  //   - waiting otherwise (I fronted, or paidBy undefined and anyone unpaid)
  const splitBuckets = useMemo(() => {
    const groups: Record<'waiting' | 'youOwe' | 'settled' | 'drafts' | 'archive', SplitExpense[]> = {
      waiting: [], youOwe: [], settled: [], drafts: [], archive: [],
    };
    searchedSplits.forEach((s) => {
      // Archived splits go to the archive bucket — never appear in other buckets.
      if (s.isArchived) {
        groups.archive.push(s);
        return;
      }
      if (s.status === 'draft') {
        groups.drafts.push(s);
        return;
      }
      const nonSelf = s.participants.filter((p) => p.contact.id !== '__self__');
      const allPaid = nonSelf.length > 0 && nonSelf.every((p) => p.isPaid);
      if (allPaid) {
        groups.settled.push(s);
        return;
      }
      if (s.paidBy && s.paidBy.id !== '__self__') {
        const me = s.participants.find((p) => p.contact.id === '__self__');
        if (me && !me.isPaid) {
          groups.youOwe.push(s);
          return;
        }
      }
      groups.waiting.push(s);
    });
    const sorter = (a: SplitExpense, b: SplitExpense) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      switch (splitSort) {
        case 'newest': return bTime - aTime;
        case 'oldest': return aTime - bTime;
        case 'amount_high': return b.totalAmount - a.totalAmount || bTime - aTime;
        case 'amount_low': return a.totalAmount - b.totalAmount || bTime - aTime;
        default: return 0;
      }
    };
    (Object.keys(groups) as Array<keyof typeof groups>).forEach((k) => groups[k].sort(sorter));
    return groups;
  }, [searchedSplits, splitSort]);

  // Hero numbers — what the user actually wants to know at a glance.
  const waitingTotal = useMemo(
    () => splitBuckets.waiting.reduce((sum, s) => {
      const nonSelf = s.participants.filter((p) => p.contact.id !== '__self__');
      return sum + nonSelf.filter((p) => !p.isPaid).reduce((a, p) => a + p.amount, 0);
    }, 0),
    [splitBuckets.waiting]
  );
  const youOweTotal = useMemo(
    () => splitBuckets.youOwe.reduce((sum, s) => {
      const me = s.participants.find((p) => p.contact.id === '__self__');
      return me && !me.isPaid ? sum + me.amount : sum;
    }, 0),
    [splitBuckets.youOwe]
  );
  const settledTotal = useMemo(
    () => splitBuckets.settled.reduce((sum, s) => sum + s.totalAmount, 0),
    [splitBuckets.settled]
  );

  // Currently visible bucket (drives the list under the segmented control).
  const filteredSplits = useMemo(() => splitBuckets[splitTab], [splitBuckets, splitTab]);

  const activeSplitCount = useMemo(
    () => splitBuckets.waiting.length + splitBuckets.youOwe.length,
    [splitBuckets.waiting.length, splitBuckets.youOwe.length]
  );
  const settledSplitCount = splitBuckets.settled.length;
  const draftSplitCount = splitBuckets.drafts.length;
  const archiveSplitCount = splitBuckets.archive.length;

  const searchedModeDebts = useMemo(() => {
    if (!searchQuery.trim()) return modeDebts;
    const q = searchQuery.toLowerCase().trim();
    return modeDebts.filter((d) =>
      d.contact.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
    );
  }, [modeDebts, searchQuery]);

  // Debt filter counts (respects type filter + search)
  const debtFilterCounts = useMemo(() => {
    const active = searchedModeDebts.filter((d) => !d.isArchived);
    const base = debtTypeFilter ? active.filter((d) => d.type === debtTypeFilter) : active;
    return {
      pending: base.filter((d) => d.status === 'pending').length,
      partial: base.filter((d) => d.status === 'partial').length,
      settled: base.filter((d) => d.status === 'settled').length,
    };
  }, [searchedModeDebts, debtTypeFilter]);

  // Debt type filter counts (respects status filter + search)
  const debtTypeCounts = useMemo(() => {
    const active = searchedModeDebts.filter((d) => !d.isArchived);
    const base = debtFilter ? active.filter((d) => d.status === debtFilter) : active;
    return {
      i_owe: base.filter((d) => d.type === 'i_owe').length,
      they_owe: base.filter((d) => d.type === 'they_owe').length,
    };
  }, [searchedModeDebts, debtFilter]);

  const getDebtAge = useCallback((createdAt: string | Date): string => {
    const days = differenceInDays(new Date(), new Date(createdAt));
    if (days === 0) return 'today';
    if (days < 7) return `${days}d`;
    if (days < 30) return `${Math.floor(days / 7)}w`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
  }, []);

  const getReminderTone = useCallback((createdAt: string | Date, contactName: string, amount: number, description: string, cur: string): string => {
    const days = differenceInDays(new Date(), new Date(createdAt));
    const amt = `${cur} ${amount.toFixed(2)}`;
    if (days < 7) {
      return `Hey ${contactName}, you owe me ${amt} for ${description}\n\nNo rush, just checking in!`;
    } else if (days < 30) {
      return `Hi ${contactName}, you owe me ${amt} for ${description}\n\nCan you settle when free? Thank you!`;
    } else {
      return `Hi ${contactName}, you owe me ${amt} for ${description}\n\nIt's been a while — can you settle when you get a chance? Thank you!`;
    }
  }, []);

  // Balance summary
  const balanceSummary = useMemo(() => {
    const activeDebts = modeDebts.filter((d) => !d.isArchived);

    const youOwe = activeDebts
      .filter((d) => d.type === 'i_owe' && d.status !== 'settled')
      .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);

    const owedToYou = activeDebts
      .filter((d) => d.type === 'they_owe' && d.status !== 'settled')
      .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);

    const collected = activeDebts
      .filter((d) => d.type === 'they_owe')
      .reduce((sum, d) => sum + d.payments.filter((p) => p.note !== 'netted').reduce((s, p) => s + p.amount, 0), 0);

    const paid = activeDebts
      .filter((d) => d.type === 'i_owe')
      .reduce((sum, d) => sum + d.payments.filter((p) => p.note !== 'netted').reduce((s, p) => s + p.amount, 0), 0);

    return { youOwe, owedToYou, collected, paid };
  }, [modeDebts]);

  // ── Header gear — opens settings sheet (matches Wallet's zap icon pattern) ──
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setSettingsModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="settings"
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="settings" size={20} color={C.textPrimary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, C.textPrimary]);

  // ── Snap back to a visible tab if archive is turned off while user is in it ──
  useEffect(() => {
    if (!debtsShowArchive) {
      if (splitTab === 'archive') setSplitTab('waiting');
      if (debtTab === 'archive') setDebtTab('pending');
    }
  }, [debtsShowArchive, splitTab, debtTab]);

  // ── Add/Edit Debt sheet — open / close spring animation ────
  useEffect(() => {
    if (debtModalVisible) {
      // Reset guard so a fresh open can be cleanly closed later.
      dDebtClosingRef.current = false;
      dDebtSheetY.value = SCREEN_H;
      dDebtSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [debtModalVisible, SCREEN_H, dDebtSheetY]);

  // Single JS-side cleanup — bumped via runOnJS exactly once per close.
  // Guarded so a double-fire (drag + animation completion both racing) can't crash.
  const dDebtClosingRef = useRef(false);

  const maybeReturnToDetail = useCallback(() => {
    const id = returnToDetailRef.current;
    if (id) {
      returnToDetailRef.current = null;
      setTimeout(() => {
        const fresh = useDebtStore.getState().debts;
        if (fresh.find((d) => d.id === id)) setDetailDebtId(id);
      }, 50);
    }
  }, []);

  const maybeReturnToGroup = useCallback(() => {
    const id = returnToGroupRef.current;
    if (id) {
      returnToGroupRef.current = null;
      setTimeout(() => setDetailGroupId(id), 50);
    }
  }, []);

  const dDebtFinishClose = useCallback(() => {
    if (!dDebtClosingRef.current) return;
    dDebtClosingRef.current = false;
    setDebtModalVisible(false);
    setTimeout(() => resetDebtForm(), 0);
    const willReturnToDetail = !!returnToDetailRef.current;
    maybeReturnToDetail();
    if (!willReturnToDetail) maybeReturnToGroup();
  }, [maybeReturnToDetail, maybeReturnToGroup]);

  // Imperative close — kicks off the slide-down, fires cleanup once it lands.
  const dDebtCloseSheet = useCallback(() => {
    if (dDebtClosingRef.current) return; // already closing — no-op
    dDebtClosingRef.current = true;
    dDebtSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(dDebtFinishClose)();
    });
  }, [SCREEN_H, dDebtSheetY, dDebtFinishClose]);

  // Pan gesture — wraps the whole top zone (handle + title). Downward activation only
  // (upward passes through to the scroll body). Drag past 100px or fast flick → dismiss.
  const dDebtSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        // Only downward gestures (≥10px) capture this gesture. Upward never activates,
        // so users can still scroll up within the form even if their finger landed on the
        // title zone first.
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dDebtDragStart.value = dDebtSheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dDebtDragStart.value + e.translationY;
          // Rubber-band overscroll — diminishing returns when dragging past anchor.
          if (newY < 0) newY = newY / 3;
          dDebtSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            // Hand off to JS — keeps the timing + unmount chain on a single thread.
            runOnJS(dDebtCloseSheet)();
          } else {
            dDebtSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, dDebtCloseSheet]
  );

  // Animated styles for the sheet, backdrop, and save button.
  const dDebtSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dDebtSheetY.value }],
  }));
  const dDebtBackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dDebtSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));
  const dDebtSaveAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dDebtSaveScale.value }, { translateX: dDebtSaveShake.value }],
  }));

  // ── Add/Edit Split sheet — open / close spring animation ────
  useEffect(() => {
    if (splitModalVisible) {
      dSplitClosingRef.current = false;
      dSplitSheetY.value = SCREEN_H;
      dSplitSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [splitModalVisible, SCREEN_H, dSplitSheetY]);

  const dSplitClosingRef = useRef(false);
  const dSplitFinishClose = useCallback(() => {
    if (!dSplitClosingRef.current) return;
    dSplitClosingRef.current = false;
    setSplitModalVisible(false);
    setTimeout(() => resetSplitForm(), 0);
  }, []);

  const dSplitCloseSheet = useCallback(() => {
    if (dSplitClosingRef.current) return;
    dSplitClosingRef.current = true;
    dSplitSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(dSplitFinishClose)();
    });
  }, [SCREEN_H, dSplitSheetY, dSplitFinishClose]);

  const dSplitSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dSplitDragStart.value = dSplitSheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dSplitDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          dSplitSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            runOnJS(dSplitCloseSheet)();
          } else {
            dSplitSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, dSplitCloseSheet]
  );

  const dSplitSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dSplitSheetY.value }],
  }));
  const dSplitBackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dSplitSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));
  const dSplitSaveAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dSplitSaveScale.value }, { translateX: dSplitSaveShake.value }],
  }));

  // ── Record Payment sheet — open / close spring animation ────
  useEffect(() => {
    if (paymentModalVisible) {
      dPayClosingRef.current = false;
      dPaySheetY.value = SCREEN_H;
      dPaySheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [paymentModalVisible, SCREEN_H, dPaySheetY]);

  const dPayClosingRef = useRef(false);
  const dPayFinishClose = useCallback(() => {
    if (!dPayClosingRef.current) return;
    dPayClosingRef.current = false;
    setPaymentModalVisible(false);
    setTimeout(() => {
      setPaymentAmount('');
      setPaymentNote('');
      setPaymentDebtId(null);
      setPaymentWalletId(null);
      setPaymentCategory('');
      setInPayDetail(false);
      setPayDetailPayment(null);
      setGroupPaymentId(null);
      paymentSavingRef.current = false;
    }, 0);
    const willReturnToDetail = !!returnToDetailRef.current;
    maybeReturnToDetail();
    if (!willReturnToDetail) maybeReturnToGroup();
  }, [maybeReturnToDetail, maybeReturnToGroup]);

  const dPayCloseSheet = useCallback(() => {
    if (dPayClosingRef.current) return;
    dPayClosingRef.current = true;
    dPaySheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(dPayFinishClose)();
    });
  }, [SCREEN_H, dPaySheetY, dPayFinishClose]);

  const dPaySheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dPayDragStart.value = dPaySheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dPayDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          dPaySheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            runOnJS(dPayCloseSheet)();
          } else {
            dPaySheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, dPayCloseSheet]
  );

  const dPaySheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dPaySheetY.value }],
  }));
  const dPayBackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dPaySheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));
  const dPaySaveAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dPaySaveScale.value }, { translateX: dPaySaveShake.value }],
  }));

  // ── Debt Detail sheet — spring open / close + swipe-to-dismiss ────
  useEffect(() => {
    if (detailDebtId) {
      dDetailClosingRef.current = false;
      dDetailSheetY.value = SCREEN_H;
      dDetailSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [detailDebtId, SCREEN_H, dDetailSheetY]);

  const dDetailClosingRef = useRef(false);
  const dDetailFinishClose = useCallback(() => {
    if (!dDetailClosingRef.current) return;
    dDetailClosingRef.current = false;
    setDetailDebtId(null);
    returnToDetailRef.current = null;
    maybeReturnToGroup();
  }, [maybeReturnToGroup]);

  const dDetailCloseSheet = useCallback(() => {
    if (dDetailClosingRef.current) return;
    dDetailClosingRef.current = true;
    dDetailSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(dDetailFinishClose)();
    });
  }, [SCREEN_H, dDetailSheetY, dDetailFinishClose]);

  const dDetailSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dDetailDragStart.value = dDetailSheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dDetailDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          dDetailSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            runOnJS(dDetailCloseSheet)();
          } else {
            dDetailSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, dDetailCloseSheet]
  );

  const dDetailSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dDetailSheetY.value }],
  }));
  const dDetailBackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dDetailSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Group Detail sheet — spring open / close + swipe-to-dismiss ────
  useEffect(() => {
    if (detailGroupId) {
      dGroupDetailClosingRef.current = false;
      dGroupDetailSheetY.value = SCREEN_H;
      dGroupDetailSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [detailGroupId, SCREEN_H, dGroupDetailSheetY]);

  const dGroupDetailClosingRef = useRef(false);
  const dGroupDetailFinishClose = useCallback(() => {
    if (!dGroupDetailClosingRef.current) return;
    dGroupDetailClosingRef.current = false;
    setDetailGroupId(null);
    returnToGroupRef.current = null;
  }, []);

  const dGroupDetailCloseSheet = useCallback(() => {
    if (dGroupDetailClosingRef.current) return;
    dGroupDetailClosingRef.current = true;
    dGroupDetailSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(dGroupDetailFinishClose)();
    });
  }, [SCREEN_H, dGroupDetailSheetY, dGroupDetailFinishClose]);

  const dGroupDetailSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dGroupDetailDragStart.value = dGroupDetailSheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dGroupDetailDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          dGroupDetailSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            runOnJS(dGroupDetailCloseSheet)();
          } else {
            dGroupDetailSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, dGroupDetailCloseSheet]
  );

  const dGroupDetailSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dGroupDetailSheetY.value }],
  }));
  const dGroupDetailBackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dGroupDetailSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Request Payment sheet — spring open / close + swipe-to-dismiss ────
  useEffect(() => {
    if (requestPaymentVisible) {
      dReqClosingRef.current = false;
      dReqSheetY.value = SCREEN_H;
      dReqSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [requestPaymentVisible, SCREEN_H, dReqSheetY]);

  const dReqClosingRef = useRef(false);
  const dReqFinishClose = useCallback(() => {
    if (!dReqClosingRef.current) return;
    dReqClosingRef.current = false;
    setRequestPaymentVisible(false);
    setTimeout(() => {
      setRequestPaymentDebt(null);
      setShowQrPicker(false);
    }, 0);
    const willReturnToDetail = !!returnToDetailRef.current;
    maybeReturnToDetail();
    if (!willReturnToDetail) maybeReturnToGroup();
  }, [maybeReturnToDetail, maybeReturnToGroup]);

  const dReqCloseSheet = useCallback(() => {
    if (dReqClosingRef.current) return;
    dReqClosingRef.current = true;
    dReqSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(dReqFinishClose)();
    });
  }, [SCREEN_H, dReqSheetY, dReqFinishClose]);

  const dReqSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dReqDragStart.value = dReqSheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dReqDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          dReqSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            runOnJS(dReqCloseSheet)();
          } else {
            dReqSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, dReqCloseSheet]
  );

  const dReqSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dReqSheetY.value }],
  }));
  const dReqBackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dReqSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Reminder sheet — spring open / close + swipe-to-dismiss ────
  useEffect(() => {
    if (reminderModalVisible) {
      dReminderClosingRef.current = false;
      dReminderSheetY.value = SCREEN_H;
      dReminderSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [reminderModalVisible, SCREEN_H, dReminderSheetY]);

  const dReminderClosingRef = useRef(false);
  const dReminderFinishClose = useCallback(() => {
    if (!dReminderClosingRef.current) return;
    dReminderClosingRef.current = false;
    setReminderModalVisible(false);
    setTimeout(() => {
      setReminderDebt(null);
      setReminderEditing(false);
      setReminderCopied(false);
    }, 0);
    const willReturnToDetail = !!returnToDetailRef.current;
    maybeReturnToDetail();
    if (!willReturnToDetail) maybeReturnToGroup();
  }, [maybeReturnToDetail, maybeReturnToGroup]);

  const dReminderCloseSheet = useCallback(() => {
    if (dReminderClosingRef.current) return;
    dReminderClosingRef.current = true;
    dReminderSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(dReminderFinishClose)();
    });
  }, [SCREEN_H, dReminderSheetY, dReminderFinishClose]);

  const dReminderSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dReminderDragStart.value = dReminderSheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dReminderDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          dReminderSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            runOnJS(dReminderCloseSheet)();
          } else {
            dReminderSheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, dReminderCloseSheet]
  );

  const dReminderSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dReminderSheetY.value }],
  }));
  const dReminderBackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dReminderSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Split Detail sheet — spring open / close + swipe-to-dismiss ────
  useEffect(() => {
    if (splitDetailVisible) {
      dSplitDetailClosingRef.current = false;
      dSplitDetailY.value = SCREEN_H;
      dSplitDetailY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [splitDetailVisible, SCREEN_H, dSplitDetailY]);

  const dSplitDetailClosingRef = useRef(false);
  const dSplitDetailFinishClose = useCallback(() => {
    if (!dSplitDetailClosingRef.current) return;
    dSplitDetailClosingRef.current = false;
    setSplitDetailVisible(false);
  }, []);

  const dSplitDetailCloseSheet = useCallback(() => {
    if (dSplitDetailClosingRef.current) return;
    dSplitDetailClosingRef.current = true;
    dSplitDetailY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(dSplitDetailFinishClose)();
    });
  }, [SCREEN_H, dSplitDetailY, dSplitDetailFinishClose]);

  const dSplitDetailGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dSplitDetailDragStart.value = dSplitDetailY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dSplitDetailDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          dSplitDetailY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            runOnJS(dSplitDetailCloseSheet)();
          } else {
            dSplitDetailY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, dSplitDetailCloseSheet]
  );

  const dSplitDetailAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dSplitDetailY.value }],
  }));
  const dSplitDetailBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dSplitDetailY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Receipt Data from Route Params ────────────────────────
  useEffect(() => {
    const receiptData = route.params?.receiptData;
    if (receiptData) {
      setActiveTab('splits');
      setSplitDescription(receiptData.vendor);
      setSplitAmount(receiptData.total.toFixed(2));
      setSplitMethod('item_based');
      setSplitItems(
        receiptData.items.map((item) => ({
          name: item.name,
          amount: item.amount,
          assignedTo: [],
        }))
      );
      setSplitModalVisible(true);
    }
  }, [route.params?.receiptData]);

  // Auto-expand highlighted debt from navigation params
  useEffect(() => {
    const hid = route.params?.highlightId;
    if (hid) {
      setActiveTab('debts');
      highlightScrollTarget.current = hid;
      setTimeout(() => {
        setDetailDebtId(hid);
      }, 300);
    }
  }, [route.params?.highlightId, debts]);

  // Scroll to highlighted debt card via callback ref
  const highlightDebtRef = useCallback((node: View | null) => {
    if (!node || !highlightScrollTarget.current) return;
    const hid = highlightScrollTarget.current;
    highlightScrollTarget.current = null;
    setTimeout(() => {
      node.measureInWindow((_x: number, wy: number) => {
        if (mainScrollRef.current && wy != null) {
          mainScrollRef.current.scrollTo({ y: Math.max(0, wy - 140), animated: true });
        }
      });
    }, 450);
  }, []);

  // Close modals when navigating away (e.g. to Settings)
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      setDebtModalVisible(false);
      setSplitModalVisible(false);
    });
    return unsubscribe;
  }, [navigation]);

  // ── Debt Handlers ──────────────────────────────────────────
  const resetDebtForm = useCallback(() => {
    setEditingDebtId(null);
    setDebtContacts([]);
    setDebtType('they_owe');
    setDebtAmount('');
    setDebtDescription('');
    setDebtCategory('');
    setAddingToGroupId(null);
    setDebtDueDate('');
    setDebtDueDateObj(null);
    setDueDatePickerOpen(false);
  }, []);

  const handleEditDebt = useCallback((debt: Debt) => {
    if (debt.isArchived) {
      showToast('Unarchive this debt before editing.', 'error');
      return;
    }
    setEditingDebtId(debt.id);
    setDebtContacts([debt.contact]);
    setDebtType(debt.type);
    setDebtAmount(debt.totalAmount.toString());
    setDebtDescription(debt.description);
    setDebtCategory(debt.category || '');
    const rawDue = (debt as any).dueDate;
    if (rawDue) {
      const d = new Date(rawDue);
      if (isValid(d)) {
        setDebtDueDateObj(d);
        setDebtDueDate(format(d, 'd MMM yyyy'));
      } else {
        setDebtDueDateObj(null);
        setDebtDueDate('');
      }
    } else {
      setDebtDueDateObj(null);
      setDebtDueDate('');
    }
    setDebtModalVisible(true);
  }, [showToast]);

  const handleSaveDebt = useCallback(() => {
    if (debtSavingRef.current) return;
    if (debtContacts.length === 0) {
      showToast('Please select a contact', 'error');
      return;
    }
    if (!debtAmount || isNaN(parseFloat(debtAmount)) || parseFloat(debtAmount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    debtSavingRef.current = true;
    // Description is optional — UI treats it that way (no `*` indicator).

    if (editingDebtId) {
      const existingDebt = debts.find((d) => d.id === editingDebtId);
      const newTotal = parseFloat(debtAmount);

      if (existingDebt && debtType !== existingDebt.type && existingDebt.payments.length > 0) {
        showToast('Cannot change debt direction after payments have been recorded.', 'error');
        debtSavingRef.current = false;
        return;
      }

      if (existingDebt && existingDebt.payments.length > 0) {
        const contactChanged = debtContacts[0]?.id !== existingDebt.contact.id ||
          debtContacts[0]?.name !== existingDebt.contact.name;
        if (contactChanged) {
          showToast('Cannot change contact after payments have been recorded.', 'error');
          debtSavingRef.current = false;
          return;
        }
      }

      if (existingDebt && existingDebt.paidAmount >= existingDebt.totalAmount && newTotal !== existingDebt.totalAmount) {
        showToast('Cannot change amount on a settled debt.', 'error');
        debtSavingRef.current = false;
        return;
      }

      if (existingDebt && newTotal < existingDebt.paidAmount) {
        Alert.alert(
          t.debts.amountBelowPaid,
          `New amount (${currency} ${newTotal.toFixed(2)}) is less than already paid (${currency} ${existingDebt.paidAmount.toFixed(2)}). The debt will be marked as settled.`,
          [
            { text: t.common.cancel, style: 'cancel', onPress: () => { debtSavingRef.current = false; } },
            {
              text: t.common.confirm,
              onPress: () => {
                updateDebt(editingDebtId, {
                  contact: debtContacts[0],
                  type: debtType,
                  totalAmount: newTotal,
                  description: debtDescription.trim(),
                  category: debtCategory || undefined,
                  dueDate: debtDueDateObj ? debtDueDateObj.toISOString() : undefined,
                } as any);
                showToast('Debt updated & marked as settled', 'success');
                dDebtCloseSheet();
                resetDebtForm();
                maybeReturnToDetail();
                debtSavingRef.current = false;
              },
            },
          ]
        );
        return;
      }

      // Recalculate groupId if contact changed (only reachable when no payments exist)
      let newGroupId: string | undefined;
      if (existingDebt) {
        const contactChanged = debtContacts[0]?.id !== existingDebt.contact.id ||
          debtContacts[0]?.name !== existingDebt.contact.name;
        if (contactChanged) {
          const newContactKey = debtContacts[0]?.id || debtContacts[0]?.name;
          const existingGroup = debts.find(
            (d) => d.id !== editingDebtId && (d.contact.id || d.contact.name) === newContactKey && d.groupId
          );
          newGroupId = existingGroup?.groupId || undefined;
        }
      }

      updateDebt(editingDebtId, {
        contact: debtContacts[0],
        type: debtType,
        totalAmount: newTotal,
        description: debtDescription.trim(),
        category: debtCategory || undefined,
        dueDate: debtDueDateObj ? debtDueDateObj.toISOString() : undefined,
        ...(newGroupId ? { groupId: newGroupId } : {}),
      } as any);
      showToast('Debt updated!', 'success');
    } else {
      addDebt({
        contact: debtContacts[0],
        type: debtType,
        totalAmount: parseFloat(debtAmount),
        description: debtDescription.trim(),
        category: debtCategory || undefined,
        groupId: addingToGroupId || undefined,
        dueDate: debtDueDateObj ? debtDueDateObj.toISOString() : undefined,
        mode,
      } as any);
      // Learn person alias from description
      const contactName = debtContacts[0]?.name;
      if (contactName && debtDescription.trim()) {
        useLearningStore.getState().learnPersonAlias(debtDescription.trim(), contactName);
      }
      showToast('Debt added!', 'success');
    }

    debtSavingRef.current = false;
    dDebtCloseSheet();
  }, [debtContacts, debtAmount, debtDescription, editingDebtId, debts, debtType, debtCategory, addingToGroupId, debtDueDateObj, mode, updateDebt, addDebt, showToast, dDebtCloseSheet]);

  const cleanupDebtPayments = (debt: Debt) => {
    const currentWallets = useWalletStore.getState().wallets;
    const allDebts = useDebtStore.getState().debts;
    debt.payments.forEach((payment) => {
      const txId = payment.linkedTransactionId;
      const hasSiblings = txId && allDebts.some(d =>
        d.id !== debt.id && d.payments.some(p => p.linkedTransactionId === txId)
      );
      if (txId && !hasSiblings) {
        if (debt.mode === 'personal') {
          deleteTransaction(txId);
        } else {
          deleteBusinessTransaction(txId);
        }
      }
      const txWasDeleted = txId && !hasSiblings;
      if (!(debt.mode === 'personal' && txWasDeleted) && payment.walletId && currentWallets.some(w => w.id === payment.walletId)) {
        if (debt.type === 'they_owe') {
          deductFromWallet(payment.walletId, payment.amount);
        } else {
          addToWallet(payment.walletId, payment.amount);
        }
      }
    });
  };

  const handleDeleteDebt = useCallback((id: string) => {
    const debt = debts.find((d) => d.id === id);
    if (!debt) return;

    const hasConsolidatedSiblings = debt.payments.some((p) =>
      p.linkedTransactionId && debts.some((d2) =>
        d2.id !== id && d2.payments.some((p2) => p2.linkedTransactionId === p.linkedTransactionId)
      )
    );

    if (hasConsolidatedSiblings) {
      Alert.alert(
        'Cannot Delete',
        'This debt has payments from a consolidated group payment. Remove the group payment first from payment history, then delete this debt.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (debt.splitId) {
      Alert.alert(
        'Linked to Split',
        'This debt is part of a split expense. Edit or delete the split to remove this participant.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert('Delete Debt', 'Are you sure? Linked transactions and wallet changes will be reversed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          cleanupDebtPayments(debt);
          deleteDebt(id);
          showToast('Debt deleted', 'success');
        },
      },
    ]);
  }, [debts, deleteDebt, showToast, unmarkSplitParticipantPaid]);

  // ── Payment Handlers ───────────────────────────────────────
  const openPaymentModal = useCallback((debtId: string, historyOnly = false) => {
    const debt = debts.find((d) => d.id === debtId);
    if (!historyOnly && debt?.isArchived) {
      showToast('Unarchive this debt before recording payments.', 'error');
      return;
    }
    setPaymentDebtId(debtId);
    setPaymentViewOnly(historyOnly);
    setPaymentAmount('');
    setPaymentNote('');
    setPaymentWalletId(wallets.find((w) => w.isDefault)?.id || null);
    setPaymentCategory(debt?.type === 'they_owe' ? 'debt_paid' : 'debt_payment');
    setPaymentModalVisible(true);
  }, [debts, wallets, showToast]);

  const processPayment = useCallback((debt: Debt, amount: number) => {
    const currentMode = useAppStore.getState().mode;
    const currentDebt = useDebtStore.getState().debts.find(d => d.id === debt.id);
    if (!currentDebt || currentDebt.status === 'settled') {
      showToast('this debt is already settled.', 'info');
      return;
    }
    if (currentDebt.isArchived) {
      showToast('Unarchive this debt before recording payments.', 'error');
      return;
    }

    if (paymentWalletId) {
      const walletExists = wallets.some((w) => w.id === paymentWalletId);
      if (!walletExists) {
        showToast('Selected wallet no longer exists. Please pick another.', 'error');
        return;
      }
    }

    const remainingAmount = currentDebt.totalAmount - currentDebt.paidAmount;
    const tip = amount > remainingAmount ? Math.round((amount - remainingAmount) * 100) / 100 : 0;

    const paymentId = addPayment(debt.id, {
      amount,
      date: new Date(),
      note: paymentNote.trim() || undefined,
      tipAmount: tip > 0 ? tip : undefined,
      walletId: paymentWalletId || undefined,
    });

    if (!paymentId) {
      showToast('this debt is already settled.', 'info');
      return;
    }

    const txType = debt.type === 'they_owe' ? 'income' : 'expense';
    const contactName = debt.contact.name.charAt(0).toUpperCase() + debt.contact.name.slice(1);
    let txDesc = debt.type === 'they_owe'
      ? `Debt Payment from ${contactName}`
      : `Debt Payment to ${contactName}`;
    if (tip > 0) txDesc += ` (incl. tip ${currency} ${tip.toFixed(2)})`;

    let linkedTransactionId: string | undefined;
    if (currentMode === 'personal') {
      linkedTransactionId = addTransaction({
        amount,
        category: paymentCategory || 'other',
        description: txDesc,
        date: new Date(),
        type: txType,
        mode: currentMode,
        walletId: paymentWalletId || undefined,
        inputMethod: 'manual',
      });
      if (paymentWalletId) {
        if (txType === 'income') addToWallet(paymentWalletId, amount);
        else deductFromWallet(paymentWalletId, amount);
      }
    } else {
      linkedTransactionId = addBusinessTransaction({
        date: new Date(),
        amount,
        type: txType === 'income' ? 'income' : 'cost',
        category: paymentCategory || 'other',
        note: txDesc,
        inputMethod: 'manual',
      });
      if (paymentWalletId) {
        if (txType === 'income') addToWallet(paymentWalletId, amount);
        else deductFromWallet(paymentWalletId, amount);
      }
    }

    if (linkedTransactionId) {
      updatePayment(debt.id, paymentId, { linkedTransactionId });
      if (currentMode === 'personal') {
        updateTransaction(linkedTransactionId, {
          linkedPaymentId: paymentId,
          linkedDebtId: debt.id,
        });
      } else {
        updateBusinessTransaction(linkedTransactionId, {
          linkedPaymentId: paymentId,
          linkedDebtId: debt.id,
        });
      }
    }

    const newPaidAmount = currentDebt.paidAmount + amount;
    if (newPaidAmount >= currentDebt.totalAmount && currentDebt.splitId) {
      markSplitParticipantPaid(currentDebt.splitId, currentDebt.contact.id);
    }

    setPaymentModalVisible(false);
    setPaymentAmount('');
    setPaymentNote('');
    showToast('Payment recorded!', 'success');

    if (returnToSplitId) {
      setTimeout(() => {
        const freshSplits = useDebtStore.getState().splits;
        const updatedSplit = freshSplits.find((s) => s.id === returnToSplitId);
        if (updatedSplit) {
          setSelectedSplit(updatedSplit);
          setSplitDetailVisible(true);
        }
        setReturnToSplitId(null);
      }, 300);
    } else {
      const willReturnToDetail = !!returnToDetailRef.current;
      maybeReturnToDetail();
      if (!willReturnToDetail) maybeReturnToGroup();
    }
  }, [paymentWalletId, wallets, paymentNote, paymentCategory, currency, returnToSplitId,
      addPayment, updatePayment, addTransaction, addBusinessTransaction, addToWallet, deductFromWallet,
      updateTransaction, updateBusinessTransaction, markSplitParticipantPaid,
      showToast, maybeReturnToDetail, maybeReturnToGroup]);

  const handleRecordPayment = useCallback(() => {
    if (paymentSavingRef.current) return;
    if (!paymentDebtId) return;
    if (!paymentAmount || isNaN(parseFloat(paymentAmount)) || parseFloat(paymentAmount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    paymentSavingRef.current = true;

    const amount = parseFloat(paymentAmount);

    // Consolidated group payment — distribute across all unsettled debts for this person
    if (groupPaymentId) {
      const group = groupedDebts.find((g) => g.contactId === groupPaymentId);
      if (group) {
        const unsettled = group.debts
          .filter((d) => d.status !== 'settled' && !d.isArchived)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const firstDebt = unsettled[0];
        if (!firstDebt) { setGroupPaymentId(null); return; }

        // Check if debts are mixed direction
        const iOweRem = unsettled.filter(d => d.type === 'i_owe').reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
        const theyOweRem = unsettled.filter(d => d.type === 'they_owe').reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
        const isMixed = iOweRem > 0 && theyOweRem > 0;

        const netDir = isMixed
          ? (iOweRem >= theyOweRem ? 'i_owe' : 'they_owe')
          : firstDebt.type;

        // Mixed groups: auto-settle the smaller side AND offset the larger side
        const offsetApplied = new Map<string, number>();
        const nettedPaymentRefs: { debtId: string; paymentId: string }[] = [];
        if (isMixed) {
          const smallerType = netDir === 'i_owe' ? 'they_owe' : 'i_owe';
          for (const d of unsettled.filter(dd => dd.type === smallerType)) {
            const rem = Math.max(0, d.totalAmount - d.paidAmount);
            if (rem > 0) {
              const nId = addPayment(d.id, { amount: rem, date: new Date(), note: 'netted' });
              if (nId) nettedPaymentRefs.push({ debtId: d.id, paymentId: nId });
              if (d.splitId) markSplitParticipantPaid(d.splitId, d.contact.id);
            }
          }
          // Apply offset payments to the larger side (no cash — accounting offset)
          const offsetTotal = netDir === 'i_owe' ? theyOweRem : iOweRem;
          let offsetLeft = offsetTotal;
          for (const d of unsettled.filter(dd => dd.type === netDir)) {
            if (offsetLeft <= 0) break;
            const rem = Math.max(0, d.totalAmount - d.paidAmount);
            const pay = Math.min(rem, offsetLeft);
            if (pay > 0) {
              const nId = addPayment(d.id, { amount: pay, date: new Date(), note: 'netted' });
              if (nId) nettedPaymentRefs.push({ debtId: d.id, paymentId: nId });
              if (d.paidAmount + pay >= d.totalAmount && d.splitId) {
                markSplitParticipantPaid(d.splitId, d.contact.id);
              }
              offsetApplied.set(d.id, pay);
              offsetLeft -= pay;
            }
          }
          if (iOweRem === theyOweRem) {
            showToast(`Debts netted — settled`, 'success');
            setGroupPaymentId(null);
            setPaymentModalVisible(false);
            paymentSavingRef.current = false;
            return;
          }
        }

        const distributable = isMixed
          ? unsettled.filter(d => d.type === netDir)
          : unsettled;
        const txType = netDir === 'they_owe' ? 'income' : 'expense';
        const cName = firstDebt.contact.name.charAt(0).toUpperCase() + firstDebt.contact.name.slice(1);
        const txDesc = netDir === 'they_owe'
            ? `Debt Payment from ${cName} (${unsettled.length} debts)`
            : `Debt Payment to ${cName} (${unsettled.length} debts)`;

        let linkedTxId: string | undefined;
        if (mode === 'personal') {
          linkedTxId = addTransaction({
            amount, category: paymentCategory || 'other', description: txDesc,
            date: new Date(), type: txType, mode, walletId: paymentWalletId || undefined, inputMethod: 'manual',
          });
        } else {
          linkedTxId = addBusinessTransaction({
            date: new Date(), amount, type: txType === 'income' ? 'income' : 'cost',
            category: paymentCategory || 'other', note: txDesc, inputMethod: 'manual',
          });
        }
        if (paymentWalletId) {
          if (txType === 'income') addToWallet(paymentWalletId, amount);
          else deductFromWallet(paymentWalletId, amount);
        }

        // Link netted payments to the same transaction so undo removes everything
        if (linkedTxId) {
          for (const np of nettedPaymentRefs) {
            updatePayment(np.debtId, np.paymentId, { linkedTransactionId: linkedTxId });
          }
        }

        let count = 0;
        let firstPaymentId: string | null = null;

        // Distribute payment in FIFO order across net-direction debts
        let leftover = amount;
        let lastPaidInfo: { debtId: string; paymentId: string; amount: number } | null = null;
        for (const d of distributable) {
          if (leftover <= 0) break;
          const offset = offsetApplied.get(d.id) || 0;
          const rem = Math.max(0, d.totalAmount - d.paidAmount - offset);
          const pay = Math.min(rem, leftover);
          if (pay > 0) {
            const pId = addPayment(d.id, { amount: pay, date: new Date(), note: paymentNote.trim() || 'consolidated payment', linkedTransactionId: linkedTxId, walletId: paymentWalletId || undefined });
            if (!pId) continue;
            if (!firstPaymentId) firstPaymentId = pId;
            const newPaid = d.paidAmount + offset + pay;
            if (newPaid >= d.totalAmount && d.splitId) {
              markSplitParticipantPaid(d.splitId, d.contact.id);
            }
            lastPaidInfo = { debtId: d.id, paymentId: pId, amount: pay };
            leftover -= pay;
            count++;
          }
        }
        // Tip: if overpayment remains, attach to last payment so sum matches wallet
        if (leftover > 0 && lastPaidInfo?.paymentId) {
          const tipAmount = Math.round(leftover * 100) / 100;
          updatePayment(lastPaidInfo.debtId, lastPaidInfo.paymentId, {
            amount: lastPaidInfo.amount + tipAmount,
            tipAmount,
          });
          if (linkedTxId) {
            const tipNote = ` (incl. tip ${currency} ${tipAmount.toFixed(2)})`;
            if (mode === 'personal') updateTransaction(linkedTxId, { description: txDesc + tipNote });
            else updateBusinessTransaction(linkedTxId, { note: txDesc + tipNote });
          }
        }

        // Reverse link on transaction points to first debt
        if (linkedTxId && firstPaymentId) {
          if (mode === 'personal') updateTransaction(linkedTxId, { linkedPaymentId: firstPaymentId, linkedDebtId: firstDebt.id });
          else updateBusinessTransaction(linkedTxId, { linkedPaymentId: firstPaymentId, linkedDebtId: firstDebt.id });
        }

        const tipLeftover = Math.max(0, amount - distributable.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount - (offsetApplied.get(d.id) || 0)), 0));
        const tipMsg = tipLeftover > 0 ? ` (incl. ${currency} ${tipLeftover.toFixed(2)} tip)` : '';
        showToast(`${currency} ${amount.toFixed(2)} applied across ${count} debts${tipMsg}`, 'success');
        setGroupPaymentId(null);
        setPaymentModalVisible(false);
        setPaymentAmount('');
        setPaymentNote('');
        paymentSavingRef.current = false;
        const willReturnToDetail = !!returnToDetailRef.current;
        maybeReturnToDetail();
        if (!willReturnToDetail) maybeReturnToGroup();
        return;
      }
    }

    const debt = debts.find((d) => d.id === paymentDebtId);
    if (!debt) return;

    const remainingAmount = debt.totalAmount - debt.paidAmount;
    if (amount > remainingAmount) {
      const tip = Math.round((amount - remainingAmount) * 100) / 100;
      setTipConfirmData({ debt, amount, tip });
      setTipConfirmVisible(true);
      paymentSavingRef.current = false;
      return;
    }
    processPayment(debt, amount);
    paymentSavingRef.current = false;
  }, [paymentDebtId, paymentAmount, debts, showToast, groupPaymentId, groupedDebts, addPayment, currency, paymentNote, paymentWalletId, processPayment, mode]);

  const handleDeletePayment = useCallback((debtId: string, paymentId: string) => {
    const debt = debts.find((d) => d.id === debtId);
    const payment = debt?.payments.find((p) => p.id === paymentId);
    if (!debt || !payment) return;

    // Check if this is part of a consolidated batch (sibling payments in other debts share the same linkedTransactionId)
    const txId = payment.linkedTransactionId;
    const siblings: { debtId: string; paymentId: string; amount: number; debt: Debt }[] = [];
    if (txId) {
      debts.forEach((d) => {
        d.payments.forEach((p) => {
          if (p.linkedTransactionId === txId && !(d.id === debtId && p.id === paymentId)) {
            siblings.push({ debtId: d.id, paymentId: p.id, amount: p.amount, debt: d });
          }
        });
      });
    }

    const isConsolidated = siblings.length > 0;
    const totalAmount = payment.amount + siblings.reduce((s, sib) => s + sib.amount, 0);
    const msg = isConsolidated
      ? `This was a consolidated payment of ${currency} ${totalAmount.toFixed(2)} across ${siblings.length + 1} debts. Remove all?`
      : 'This will undo this payment and its linked transaction. Continue?';

    Alert.alert('Remove Payment', msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          // Delete linked transaction once
          if (txId) {
            if (debt.mode === 'personal') deleteTransaction(txId);
            else deleteBusinessTransaction(txId);
          }

          // Reverse wallet per-payment (each may have a different wallet)
          // Skip for personal mode — deleteTransaction already reversed the wallet
          const allPayments = [{ debtId, paymentId, debt, payment }, ...siblings.map((s) => ({ debtId: s.debtId, paymentId: s.paymentId, debt: s.debt, payment: s.debt.payments.find((px: Payment) => px.id === s.paymentId) }))];
          for (const p of allPayments) {
            const pw = p.payment;
            if (pw?.walletId && p.debt.mode !== 'personal') {
              if (p.debt.type === 'they_owe') deductFromWallet(pw.walletId, pw.amount);
              else addToWallet(pw.walletId, pw.amount);
            }
          }

          // Delete this payment + all siblings
          for (const p of allPayments) {
            if (p.debt.splitId && p.debt.status === 'settled') {
              const remaining = p.debt.payments
                .filter((px) => px.id !== p.paymentId)
                .reduce((sum, px) => sum + px.amount, 0);
              if (remaining < p.debt.totalAmount) {
                unmarkSplitParticipantPaid(p.debt.splitId, p.debt.contact.id);
              }
            }
            deletePayment(p.debtId, p.paymentId);
          }

          showToast(isConsolidated ? `Consolidated payment of ${currency} ${totalAmount.toFixed(2)} removed` : 'Payment removed', 'success');
          dPayCloseSheet();
        },
      },
    ]);
  }, [debts, deleteTransaction, deleteBusinessTransaction, deductFromWallet, addToWallet, unmarkSplitParticipantPaid, deletePayment, showToast, currency, dPayCloseSheet]);

  const handleOpenPayDetail = (debtId: string, payment: Payment) => {
    setPayDetailDebtId(debtId);
    setPayDetailPayment(payment);
    setEditPayAmount(payment.amount.toFixed(2));
    setEditPayNote(payment.note || '');
    setInPayDetail(true);
  };

  const handleClosePayDetail = () => {
    setInPayDetail(false);
    setPayDetailPayment(null);
  };

  const handleSavePayDetail = () => {
    if (payDetailSaving) return;
    if (!payDetailDebtId || !payDetailPayment) return;
    const newAmount = parseFloat(editPayAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }

    const amountChanged = newAmount !== payDetailPayment.amount;

    if (amountChanged && payDetailPayment.linkedTransactionId) {
      const txId = payDetailPayment.linkedTransactionId;
      const allDebts = useDebtStore.getState().debts;
      const hasSiblings = allDebts.some((d) =>
        d.id !== payDetailDebtId && d.payments.some((p) => p.linkedTransactionId === txId)
      );
      if (hasSiblings) {
        showToast('Cannot edit amount on a consolidated payment. Remove and re-record instead.', 'error');
        return;
      }
    }

    // Guard: block amount edits on settled debts — would silently un-settle
    if (amountChanged) {
      const freshDebt = useDebtStore.getState().debts.find((d) => d.id === payDetailDebtId);
      if (freshDebt?.status === 'settled') {
        showToast('Cannot change amount on a settled debt', 'error');
        return;
      }

      if (freshDebt) {
        const otherPaymentsTotal = freshDebt.paidAmount - payDetailPayment.amount;
        const newTotal = otherPaymentsTotal + newAmount;
        if (newTotal > freshDebt.totalAmount) {
          const tip = Math.round((newTotal - freshDebt.totalAmount) * 100) / 100;
          setTipConfirmData({ debt: freshDebt, amount: newAmount, tip });
          setTipConfirmVisible(true);
          return;
        }
      }
    }

    commitPayDetailSave(newAmount, 0);
  };

  const commitPayDetailSave = (newAmount: number, tip: number) => {
    if (!payDetailDebtId || !payDetailPayment) return;
    setPayDetailSaving(true);

    // Read fresh payment from store — payDetailPayment is a snapshot from when detail opened
    const freshDebt = useDebtStore.getState().debts.find((d) => d.id === payDetailDebtId);
    const freshPayment = freshDebt?.payments.find((p) => p.id === payDetailPayment.id);
    if (!freshDebt || !freshPayment) {
      setPayDetailSaving(false);
      showToast('Payment no longer exists', 'error');
      handleClosePayDetail();
      return;
    }

    const amountChanged = newAmount !== freshPayment.amount;
    const noteChanged = editPayNote.trim() !== (freshPayment.note || '');

    if (!amountChanged && !noteChanged) {
      setInPayDetail(false);
      setPayDetailSaving(false);
      return;
    }

    updatePayment(payDetailDebtId, freshPayment.id, {
      amount: newAmount,
      note: editPayNote.trim() || undefined,
      tipAmount: tip > 0 ? tip : undefined,
    });

    // Sync linked transaction amount if amount changed
    const debtMode = freshDebt.mode ?? mode;
    if (amountChanged && freshPayment.linkedTransactionId) {
      if (debtMode === 'personal') {
        updateTransaction(freshPayment.linkedTransactionId, { amount: newAmount });
      } else {
        updateBusinessTransaction(freshPayment.linkedTransactionId, { amount: newAmount });
      }
    }

    // Sync wallet balance if amount changed
    // Skip for personal mode — updateTransaction already adjusted the wallet
    if (amountChanged && freshPayment.walletId && debtMode !== 'personal') {
      const walletStillExists = useWalletStore.getState().wallets.some(w => w.id === freshPayment.walletId);
      if (walletStillExists) {
        const diff = newAmount - freshPayment.amount;
        if (freshDebt.type === 'they_owe') {
          if (diff > 0) addToWallet(freshPayment.walletId, diff);
          else deductFromWallet(freshPayment.walletId, -diff);
        } else {
          if (diff > 0) deductFromWallet(freshPayment.walletId, diff);
          else addToWallet(freshPayment.walletId, -diff);
        }
      }
    }

    // If debt was settled before edit but isn't anymore, unmark split participant
    if (amountChanged && freshDebt.splitId) {
      const updatedDebt = useDebtStore.getState().debts.find(d => d.id === payDetailDebtId);
      if (updatedDebt && updatedDebt.status !== 'settled' && freshDebt.status === 'settled') {
        unmarkSplitParticipantPaid(freshDebt.splitId, freshDebt.contact.id);
      }
    }

    setPayDetailSaving(false);
    handleClosePayDetail();
    showToast('Payment updated', 'success');
  };

  // ── Split Mark Paid / Undo Handlers ──────────────────────────
  const handleSplitMarkPaid = (split: SplitExpense, participant: SplitParticipant) => {
    if ((split as any).status === 'draft') {
      showToast('Finalize this split before recording payments.', 'error');
      return;
    }
    // Find linked debt for this split + participant
    const linkedDebt = debts.find(
      (d) => d.splitId === split.id && d.contact.id === participant.contact.id
    );

    if (linkedDebt && linkedDebt.status !== 'settled') {
      // Route through existing payment infrastructure
      setSplitDetailVisible(false);
      setReturnToSplitId(split.id);

      const remaining = linkedDebt.totalAmount - linkedDebt.paidAmount;
      setPaymentDebtId(linkedDebt.id);
      setPaymentAmount(remaining.toFixed(2));
      setPaymentNote(`Split: ${split.description}`);
      setPaymentWalletId(wallets.find((w) => w.isDefault)?.id || null);
      setPaymentCategory(linkedDebt.type === 'they_owe' ? 'debt_paid' : 'debt_payment');
      setPaymentModalVisible(true);
    } else {
      // No linked debt (manual split) — simple boolean toggle
      markSplitParticipantPaid(split.id, participant.contact.id);
      const freshSplit = useDebtStore.getState().splits.find((s) => s.id === split.id);
      if (freshSplit) setSelectedSplit(freshSplit);
      showToast(`${participant.contact.name} marked as paid`, 'success');
    }
  };

  const handleSplitUndoPaid = (split: SplitExpense, participant: SplitParticipant) => {
    Alert.alert(
      'Undo Payment',
      `Mark ${participant.contact.name} as unpaid? This will reverse all recorded payments for this participant.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: () => {
            // Find linked debt — read fresh from store (closure `debts` may be stale by Alert time)
            const linkedDebt = useDebtStore.getState().debts.find(
              (d) => d.splitId === split.id && d.contact.id === participant.contact.id
            );

            if (linkedDebt && linkedDebt.payments.length > 0) {
              // Reverse ALL payments — read fresh state each iteration
              const paymentsToDelete = [...linkedDebt.payments].reverse();
              for (const payment of paymentsToDelete) {
                const freshDebt = useDebtStore.getState().debts.find(d => d.id === linkedDebt.id);
                if (!freshDebt) break;
                const freshPayment = freshDebt.payments.find(p => p.id === payment.id);
                if (!freshPayment) continue;

                // Check for consolidated siblings before deleting transaction
                const txId = freshPayment.linkedTransactionId;
                const allDebts = useDebtStore.getState().debts;
                const hasSiblings = txId && allDebts.some(d =>
                  d.id !== linkedDebt.id && d.payments.some(p => p.linkedTransactionId === txId)
                );

                if (txId && !hasSiblings) {
                  if (freshDebt.mode === 'personal') {
                    deleteTransaction(txId);
                  } else {
                    deleteBusinessTransaction(txId);
                  }
                }

                // Reverse wallet balance (skip personal if tx was deleted — deleteTransaction already reversed)
                const txWasDeleted = txId && !hasSiblings;
                if (!(freshDebt.mode === 'personal' && txWasDeleted) && freshPayment.walletId) {
                  const currentWallets = useWalletStore.getState().wallets;
                  if (currentWallets.some(w => w.id === freshPayment.walletId)) {
                    if (freshDebt.type === 'they_owe') {
                      deductFromWallet(freshPayment.walletId, freshPayment.amount);
                    } else {
                      addToWallet(freshPayment.walletId, freshPayment.amount);
                    }
                  }
                }

                // Delete the payment from the debt
                deletePayment(linkedDebt.id, payment.id);
              }
            }

            // Unmark split participant
            unmarkSplitParticipantPaid(split.id, participant.contact.id);

            const freshSplit = useDebtStore.getState().splits.find((s) => s.id === split.id);
            if (freshSplit) setSelectedSplit(freshSplit);

            showToast(`${participant.contact.name} marked as unpaid`, 'success');
          },
        },
      ]
    );
  };

  // ── Split Handlers ─────────────────────────────────────────
  const resetSplitForm = useCallback(() => {
    setEditingSplitId(null);
    setSplitDescription('');
    setSplitAmount('');
    setSplitMethod('equal');
    setSplitContacts([]);
    setSplitPaidBy([]);
    setCustomAmounts({});
    setSplitItems([]);
    setNewItemName('');
    setNewItemAmount('');
    setSplitWalletId(null);
    setSplitDueDateObj(null);
    setSplitDueDate('');
    setSplitDueDatePickerOpen(false);
  }, []);

  // When participants change in non-wizard split, clean up orphaned item assignments
  const handleSplitContactsChange = useCallback((contacts: Contact[]) => {
    const removedIds = splitContacts
      .filter((c) => !contacts.some((nc) => nc.id === c.id))
      .map((c) => c.id);
    if (removedIds.length > 0) {
      setSplitItems((prev) =>
        prev.map((item) => ({
          ...item,
          assignedTo: item.assignedTo.filter((c) => !removedIds.includes(c.id)),
        }))
      );
    }
    setSplitContacts(contacts);
  }, [splitContacts]);

  const handleEditSplit = useCallback((split: SplitExpense) => {
    if (split.isArchived) {
      showToast('Unarchive this split before editing.', 'error');
      return;
    }
    setEditingSplitId(split.id);
    setSplitDescription(split.description);
    setSplitAmount(split.totalAmount.toString());
    setSplitMethod(split.splitMethod);
    setSplitContacts(split.participants.map((p) => p.contact));
    setSplitPaidBy(split.paidBy ? [split.paidBy] : []);
    setSplitWalletId(split.walletId || null);
    if (split.splitMethod === 'custom') {
      const amounts: Record<string, string> = {};
      split.participants.forEach((p) => { amounts[p.contact.id] = p.amount.toString(); });
      setCustomAmounts(amounts);
    }
    if (split.splitMethod === 'item_based') {
      setSplitItems(split.items);
    }
    const rawSplitDue = (split as any).dueDate;
    if (rawSplitDue) {
      const d = new Date(rawSplitDue);
      setSplitDueDateObj(d);
      setSplitDueDate(format(d, 'd MMM yyyy'));
    } else {
      setSplitDueDateObj(null);
      setSplitDueDate('');
    }
    setSplitModalVisible(true);
  }, []);

  const handleSaveSplit = useCallback(() => {
    if (splitSavingRef.current) return;
    if (!splitDescription.trim()) {
      showToast('Please add a description', 'error');
      return;
    }
    if (!splitAmount || isNaN(parseFloat(splitAmount)) || parseFloat(splitAmount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    if (splitContacts.length < 2) {
      showToast('Please add at least 2 participants', 'error');
      return;
    }
    if (!editingSplitId && splitPaidBy.length === 0) {
      showToast('Please select who paid', 'error');
      return;
    }
    const hasMe = splitContacts.some(c => c.id === '__self__');
    if (!hasMe) {
      showToast('add yourself to the split first.', 'error');
      return;
    }
    const total = parseFloat(splitAmount);
    let participants: SplitParticipant[] = [];

    if (splitMethod === 'equal') {
      const count = splitContacts.length;
      const perPerson = Math.floor((total / count) * 100) / 100;
      const remainder = Math.round((total - perPerson * count) * 100) / 100;
      const payerId = splitPaidBy.length > 0 ? splitPaidBy[0].id : splitContacts[0]?.id;
      participants = splitContacts.map((c) => ({
        contact: c,
        amount: Math.round((perPerson + (c.id === payerId ? remainder : 0)) * 100) / 100,
        isPaid: false,
      }));
    } else if (splitMethod === 'custom') {
      const customTotal = Object.values(customAmounts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
      if (Math.abs(customTotal - total) > 0.01) {
        showToast(`Custom amounts must sum to ${currency} ${total.toFixed(2)}`, 'error');
        return;
      }
      participants = splitContacts.map((c) => ({
        contact: c,
        amount: parseFloat(customAmounts[c.id]) || 0,
        isPaid: false,
      }));
    } else if (splitMethod === 'item_based') {
      if (splitItems.length === 0) {
        showToast('Please add at least one item', 'error');
        return;
      }
      const unassigned = splitItems.some((item) => item.assignedTo.length === 0);
      if (unassigned) {
        showToast('Assign all items to at least one person', 'error');
        return;
      }
      const perPersonMap: Record<string, number> = {};
      splitContacts.forEach((c) => { perPersonMap[c.id] = 0; });
      splitItems.forEach((item) => {
        const share = item.amount / (item.assignedTo.length || 1);
        item.assignedTo.forEach((c) => {
          perPersonMap[c.id] = (perPersonMap[c.id] || 0) + share;
        });
      });
      participants = splitContacts.map((c) => ({
        contact: c,
        amount: Math.round((perPersonMap[c.id] || 0) * 100) / 100,
        isPaid: false,
      }));
      // Fix rounding drift: adjust payer's share so amounts sum to total
      const itemSum = participants.reduce((s, p) => s + p.amount, 0);
      const itemDrift = Math.round((total - itemSum) * 100) / 100;
      if (itemDrift !== 0) {
        const payerIdx = participants.findIndex(p => p.contact.id === (splitPaidBy[0]?.id ?? splitContacts[0]?.id));
        if (payerIdx >= 0) participants[payerIdx].amount = Math.round((participants[payerIdx].amount + itemDrift) * 100) / 100;
      }
    }

    // Mark the payer as paid (if selected)
    if (splitPaidBy.length > 0) {
      const payerId = splitPaidBy[0].id;
      participants = participants.map((p) =>
        p.contact.id === payerId ? { ...p, isPaid: true } : p
      );
    }

    // Filter out participants with zero share (except the payer)
    const zeroShareCount = participants.filter((p) => p.amount <= 0 && !p.isPaid).length;
    if (zeroShareCount > 0) {
      participants = participants.filter((p) => p.amount > 0 || p.isPaid);
      if (participants.length < 2) {
        showToast('Not enough participants with amounts assigned', 'error');
        return;
      }
    }

    splitSavingRef.current = true;

    if (editingSplitId) {
      const currentSplit = useDebtStore.getState().splits.find(s => s.id === editingSplitId);
      if (!currentSplit) { splitSavingRef.current = false; return; }

      const oldPayerId = currentSplit.paidBy?.id;
      const newPayer = splitPaidBy.length > 0 ? splitPaidBy[0] : undefined;
      const paidByChanged = oldPayerId !== newPayer?.id;
      const oldTotal = currentSplit.totalAmount;
      const selfId = '__self__';
      const desc = splitDescription.trim();

      // Delete linked debts for removed participants (or ALL if paidBy changed — direction flips)
      const newParticipantIds = new Set(participants.map((p) => p.contact.id));
      const linkedDebts = useDebtStore.getState().debts.filter((d) => d.splitId === editingSplitId);
      linkedDebts.forEach((ld) => {
        if (!newParticipantIds.has(ld.contact.id) || paidByChanged) {
          ld.payments.forEach((payment) => {
            if (payment.linkedTransactionId) {
              if (ld.mode === 'personal') deleteTransaction(payment.linkedTransactionId);
              else deleteBusinessTransaction(payment.linkedTransactionId);
            }
            if (ld.mode !== 'personal' && payment.walletId) {
              if (ld.type === 'they_owe') deductFromWallet(payment.walletId, payment.amount);
              else addToWallet(payment.walletId, payment.amount);
            }
          });
          deleteDebt(ld.id);
        }
      });

      // If paidBy changed, cleanup old transaction + wallet
      if (paidByChanged) {
        cleanupSplitTransaction(currentSplit);
      }

      updateSplit(editingSplitId, {
        description: desc,
        totalAmount: total,
        splitMethod,
        participants,
        items: splitMethod === 'item_based' ? splitItems : [],
        paidBy: newPayer || undefined,
        dueDate: splitDueDateObj ? splitDueDateObj.toISOString() : undefined,
        walletId: splitWalletId || undefined,
      } as any);

      if (paidByChanged) {
        // Recreate transaction + wallet + debts for new payer direction
        if (newPayer?.id === selfId) {
          let txId: string | undefined;
          if (mode === 'personal') {
            txId = addTransaction({ amount: total, category: 'split_expense', description: desc, date: new Date(), type: 'expense', mode, walletId: splitWalletId || undefined, inputMethod: 'manual' });
          } else {
            txId = addBusinessTransaction({ date: new Date(), amount: total, type: 'cost', category: 'split_expense', note: desc, inputMethod: 'manual' });
          }
          if (txId || splitWalletId) {
            updateSplit(editingSplitId, { linkedTransactionId: txId, walletId: splitWalletId || undefined });
          }
          if (splitWalletId) {
            const selectedWallet = wallets.find((w) => w.id === splitWalletId);
            if (selectedWallet?.type === 'credit') useCredit(splitWalletId, total);
            else deductFromWallet(splitWalletId, total);
          }
          participants.filter((p) => p.contact.id !== selfId && p.amount > 0).forEach((p) => {
            addDebt({ contact: p.contact, type: 'they_owe', totalAmount: p.amount, description: desc, splitId: editingSplitId, mode, dueDate: splitDueDateObj || undefined });
          });
        } else if (newPayer && newPayer.id !== selfId) {
          const myShare = participants.find((p) => p.contact.id === selfId);
          if (myShare && myShare.amount > 0) {
            addDebt({ contact: newPayer, type: 'i_owe', totalAmount: myShare.amount, description: desc, splitId: editingSplitId, mode, dueDate: splitDueDateObj || undefined });
          }
        }
      } else {
        // paidBy unchanged — update transaction/wallet if total changed, cascade to debts
        if (oldTotal !== total && currentSplit.linkedTransactionId) {
          if (currentSplit.mode === 'personal') {
            updateTransaction(currentSplit.linkedTransactionId, { amount: total });
          } else {
            updateBusinessTransaction(currentSplit.linkedTransactionId, { amount: total });
            if (currentSplit.walletId) {
              const delta = total - oldTotal;
              if (delta > 0) deductFromWallet(currentSplit.walletId, delta);
              else if (delta < 0) addToWallet(currentSplit.walletId, -delta);
            }
          }
        }

        const linkedDebtsForUpdate = useDebtStore.getState().debts.filter((d) => d.splitId === editingSplitId);
        let settledAmountBlocked = false;
        const payer = currentSplit.paidBy;
        const newDueDate = splitDueDateObj || undefined;

        participants.forEach((p) => {
          const linked = linkedDebtsForUpdate.find((d) => d.contact.id === p.contact.id);
          if (!linked) {
            // Create debt for newly added participant
            if (payer?.id === selfId && p.contact.id !== selfId && p.amount > 0) {
              addDebt({ contact: p.contact, type: 'they_owe', totalAmount: p.amount, description: desc, splitId: editingSplitId, mode, dueDate: splitDueDateObj || undefined });
            } else if (payer && payer.id !== selfId && p.contact.id === selfId && p.amount > 0) {
              addDebt({ contact: payer, type: 'i_owe', totalAmount: p.amount, description: desc, splitId: editingSplitId, mode, dueDate: splitDueDateObj || undefined });
            }
            return;
          }
          const updates: any = {};
          if (linked.totalAmount !== p.amount) {
            if (linked.status === 'settled') { settledAmountBlocked = true; return; }
            if (linked.payments.length > 0 && p.amount < linked.paidAmount) { settledAmountBlocked = true; return; }
            updates.totalAmount = p.amount;
          }
          const linkedDue = linked.dueDate ? new Date(linked.dueDate).getTime() : undefined;
          const newDue = newDueDate ? newDueDate.getTime() : undefined;
          if (linkedDue !== newDue) updates.dueDate = newDueDate;
          if (linked.description !== desc) updates.description = desc;
          if (Object.keys(updates).length > 0) updateDebt(linked.id, updates);
        });

        if (settledAmountBlocked) {
          showToast('Some amounts were not updated — linked debts are already settled or have payments exceeding the new amount.', 'info');
        }
      }

      showToast('Split updated!', 'success');
    } else {
      const splitId = addSplit({
        description: splitDescription.trim(),
        totalAmount: total,
        splitMethod,
        participants,
        items: splitMethod === 'item_based' ? splitItems : [],
        paidBy: splitPaidBy.length > 0 ? splitPaidBy[0] : undefined,
        dueDate: splitDueDateObj ? splitDueDateObj.toISOString() : undefined,
        mode,
      } as any);

      const selfId = '__self__';
      const desc = splitDescription.trim();
      const payer = splitPaidBy.length > 0 ? splitPaidBy[0] : null;

      if (payer?.id === selfId) {
        // I paid — create expense transaction + deduct wallet + create debts for others
        let txId: string | undefined;
        if (mode === 'personal') {
          txId = addTransaction({
            amount: total,
            category: 'split_expense',
            description: desc,
            date: new Date(),
            type: 'expense',
            mode,
            walletId: splitWalletId || undefined,
            inputMethod: 'manual',
          });
        } else {
          txId = addBusinessTransaction({
            date: new Date(),
            amount: total,
            type: 'cost',
            category: 'split_expense',
            note: desc,
            inputMethod: 'manual',
          });
        }
        if (txId || splitWalletId) {
          updateSplit(splitId, {
            linkedTransactionId: txId,
            walletId: splitWalletId || undefined,
          });
        }
        if (splitWalletId) {
          const selectedWallet = wallets.find((w) => w.id === splitWalletId);
          if (selectedWallet?.type === 'credit') {
            useCredit(splitWalletId, total);
          } else {
            deductFromWallet(splitWalletId, total);
          }
        }
        // Others owe me
        participants
          .filter((p) => p.contact.id !== selfId && p.amount > 0)
          .forEach((p) => {
            addDebt({
              contact: p.contact,
              type: 'they_owe',
              totalAmount: p.amount,
              description: desc,
              splitId,
              mode,
              dueDate: splitDueDateObj || undefined,
            });
          });
      } else if (payer && payer.id !== selfId) {
        // Someone else paid — I owe them my share
        const myShare = participants.find((p) => p.contact.id === selfId);
        if (myShare && myShare.amount > 0) {
          addDebt({
            contact: payer,
            type: 'i_owe',
            totalAmount: myShare.amount,
            description: desc,
            splitId,
            mode,
            dueDate: splitDueDateObj || undefined,
          });
        }
      }

      showToast('Split created!', 'success');
    }

    setSplitModalVisible(false);
    resetSplitForm();
    splitSavingRef.current = false;
  }, [splitDescription, splitAmount, splitContacts, splitPaidBy, editingSplitId, splitMethod, customAmounts, splitItems, splitDueDateObj, splitWalletId, mode, currency, addSplit, updateSplit, addDebt, updateDebt, deleteDebt, addTransaction, addBusinessTransaction, deductFromWallet, useCredit, deleteTransaction, deleteBusinessTransaction, addToWallet, resetSplitForm, showToast]);

  const cleanupSplitTransaction = (split: SplitExpense) => {
    // Look up actual transaction amount (may differ from split.totalAmount if edited before C8 fix)
    let txAmount = split.totalAmount;
    if (split.linkedTransactionId && split.mode === 'business') {
      const bizTx = useBusinessStore.getState().businessTransactions.find(t => t.id === split.linkedTransactionId);
      if (bizTx) txAmount = bizTx.amount;
    }
    // Delete linked expense transaction
    if (split.linkedTransactionId) {
      if (split.mode === 'personal') {
        deleteTransaction(split.linkedTransactionId);
      } else {
        deleteBusinessTransaction(split.linkedTransactionId);
      }
    }
    // Reverse wallet deduction (skip personal — deleteTransaction already reversed)
    if (split.mode !== 'personal' && split.walletId) {
      const wallet = wallets.find((w) => w.id === split.walletId);
      if (wallet?.type === 'credit') {
        repayCredit(split.walletId, txAmount);
      } else {
        addToWallet(split.walletId, txAmount);
      }
    }
  };

  const handleDeleteSplit = useCallback((id: string) => {
    const split = splits.find((s) => s.id === id);
    const isDraft = split?.status === 'draft';
    Alert.alert(
      isDraft ? 'Delete Draft' : 'Delete Split',
      isDraft
        ? 'Delete this draft? No debts or transactions have been created.'
        : 'Are you sure you want to delete this split? Linked debts, transactions, and wallet changes will also be reversed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const freshSplitRef = useDebtStore.getState().splits.find(s => s.id === id);
            if (freshSplitRef && !isDraft) cleanupSplitTransaction(freshSplitRef);
            if (!isDraft) {
              const linkedDebts = useDebtStore.getState().debts.filter((d) => d.splitId === id);
              linkedDebts.forEach((debt) => {
                cleanupDebtPayments(debt);
                deleteDebt(debt.id);
              });
            }
            deleteSplit(id);
            setSplitDetailVisible(false);
            showToast(isDraft ? 'Draft deleted' : 'Split deleted', 'success');
          },
        },
      ]
    );
  }, [splits, debts, deleteDebt, deleteSplit, showToast]);

  // ── Selection Mode Handlers ──────────────────────────────────
  const enterSelectionMode = useCallback((type: 'debt' | 'split', ids: string | string[]) => {
    setSelectionMode(type);
    setSelectedIds(new Set(Array.isArray(ids) ? ids : [ids]));
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(null);
    setSelectedIds(new Set());
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) {
        setSelectionMode(null);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectionMode === 'debt') {
      setSelectedIds(new Set(filteredDebts.map((i) => i.id)));
    } else {
      const visibleSplits = splitBuckets[splitTab] || [];
      setSelectedIds(new Set(visibleSplits.map((i) => i.id)));
    }
  }, [selectionMode, filteredDebts, splitBuckets, splitTab]);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    const type = selectionMode === 'debt' ? 'debt' : 'split';

    if (selectionMode === 'debt') {
      const splitLinked = Array.from(selectedIds).filter((id) => debts.find((d) => d.id === id)?.splitId);
      if (splitLinked.length > 0) {
        showToast(`${splitLinked.length} debt${splitLinked.length > 1 ? 's are' : ' is'} linked to a split — delete the split instead.`, 'error');
        return;
      }
      const hasExternalConsolidated = Array.from(selectedIds).some((id) => {
        const debt = debts.find((d) => d.id === id);
        return debt?.payments.some((p) =>
          p.linkedTransactionId && debts.some((d2) =>
            d2.id !== id && !selectedIds.has(d2.id) &&
            d2.payments.some((p2) => p2.linkedTransactionId === p.linkedTransactionId)
          )
        );
      });
      if (hasExternalConsolidated) {
        showToast('Some debts share group payments with unselected debts. Select all related debts or remove group payments first.', 'error');
        return;
      }
    }

    Alert.alert(
      `Delete ${count} ${type}${count > 1 ? 's' : ''}`,
      `Are you sure you want to delete ${count} ${type}${count > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const deletedTxIds = new Set<string>();
            const currentWallets = useWalletStore.getState().wallets;

            selectedIds.forEach((id) => {
              if (selectionMode === 'debt') {
                const debt = debts.find((d) => d.id === id);
                if (debt) {
                  debt.payments.forEach((payment) => {
                    const txId = payment.linkedTransactionId;
                    if (txId && !deletedTxIds.has(txId)) {
                      if (debt.mode === 'personal') deleteTransaction(txId);
                      else deleteBusinessTransaction(txId);
                      deletedTxIds.add(txId);
                    }
                    if (payment.walletId && currentWallets.some((w) => w.id === payment.walletId)) {
                      if (debt.type === 'they_owe') deductFromWallet(payment.walletId, payment.amount);
                      else addToWallet(payment.walletId, payment.amount);
                    }
                  });
                }
                deleteDebt(id);
              } else {
                const split = splits.find((s) => s.id === id);
                if (split) cleanupSplitTransaction(split);
                const linkedDebts = debts.filter((d) => d.splitId === id);
                linkedDebts.forEach((ld) => {
                  ld.payments.forEach((payment) => {
                    const txId = payment.linkedTransactionId;
                    if (txId && !deletedTxIds.has(txId)) {
                      if (ld.mode === 'personal') deleteTransaction(txId);
                      else deleteBusinessTransaction(txId);
                      deletedTxIds.add(txId);
                    }
                    if (payment.walletId && currentWallets.some((w) => w.id === payment.walletId)) {
                      if (ld.type === 'they_owe') deductFromWallet(payment.walletId, payment.amount);
                      else addToWallet(payment.walletId, payment.amount);
                    }
                  });
                  deleteDebt(ld.id);
                });
                deleteSplit(id);
              }
            });
            showToast(`${count} ${type}${count > 1 ? 's' : ''} deleted`, 'success');
            exitSelectionMode();
          },
        },
      ]
    );
  }, [selectedIds, selectionMode, debts, splits, deleteDebt, deleteTransaction, deleteBusinessTransaction, deductFromWallet, addToWallet, cleanupSplitTransaction, deleteSplit, showToast, exitSelectionMode]);

  const handleBulkArchive = useCallback(() => {
    if (selectionMode === 'debt') {
      const ids = Array.from(selectedIds);
      const allArchived = ids.every((id) => debts.find((d) => d.id === id)?.isArchived);
      ids.forEach((id) => allArchived ? unarchiveDebt(id) : archiveDebt(id));
      showToast(`${ids.length} debt${ids.length > 1 ? 's' : ''} ${allArchived ? 'unarchived' : 'archived'}`, 'success');
    } else {
      const ids = Array.from(selectedIds);
      const allArchived = ids.every((id) => splits.find((s) => s.id === id)?.isArchived);
      ids.forEach((id) => {
        if (allArchived) {
          unarchiveSplit(id);
          debts.filter((d) => d.splitId === id).forEach((d) => unarchiveDebt(d.id));
        } else {
          archiveSplit(id);
          debts.filter((d) => d.splitId === id).forEach((d) => archiveDebt(d.id));
        }
      });
      showToast(`${ids.length} split${ids.length > 1 ? 's' : ''} ${allArchived ? 'unarchived' : 'archived'}`, 'success');
    }
    exitSelectionMode();
  }, [selectedIds, selectionMode, debts, splits, archiveDebt, unarchiveDebt, archiveSplit, unarchiveSplit, showToast, exitSelectionMode]);

  const handleSelectionEdit = () => {
    if (selectedIds.size !== 1) return;
    const id = Array.from(selectedIds)[0];
    if (selectionMode === 'debt') {
      const debt = modeDebts.find((d) => d.id === id);
      if (debt) {
        exitSelectionMode();
        handleEditDebt(debt);
      }
    } else {
      const split = modeSplits.find((s) => s.id === id);
      if (split) {
        exitSelectionMode();
        handleEditSplit(split);
      }
    }
  };

  const handleAddItem = useCallback(() => {
    if (!newItemName.trim() || !newItemAmount || parseFloat(newItemAmount) <= 0) {
      showToast('Please enter item name and amount', 'error');
      return;
    }
    setSplitItems([...splitItems, {
      name: newItemName.trim(),
      amount: parseFloat(newItemAmount),
      assignedTo: [],
    }]);
    setNewItemName('');
    setNewItemAmount('');
  }, [newItemName, newItemAmount, splitItems, showToast]);

  const handleToggleItemAssignment = useCallback((itemIndex: number, contact: Contact) => {
    setSplitItems(splitItems.map((item, i) => {
      if (i !== itemIndex) return item;
      const assigned = item.assignedTo.some((c) => c.id === contact.id);
      return {
        ...item,
        assignedTo: assigned
          ? item.assignedTo.filter((c) => c.id !== contact.id)
          : [...item.assignedTo, contact],
      };
    }));
  }, [splitItems]);

  // ── Receipt Scan for Item-based Split ─────────────────────
  const handleScanReceipt = async () => {
    const premium = usePremiumStore.getState();
    if (!premium.canScanReceipt()) {
      showToast('Scan limit reached this month', 'error');
      return;
    }

    let imageUri: string | null = null;
    const scanner = getDocumentScanner();
    if (scanner) {
      try {
        const scanResult = await scanner.scanDocument({ maxNumDocuments: 1 });
        if (scanResult.scannedImages?.length) imageUri = scanResult.scannedImages[0];
      } catch { /* fall through to ImagePicker */ }
    }
    if (!imageUri) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showToast('Camera permission is required', 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets?.[0]) imageUri = result.assets[0].uri;
    }

    if (!imageUri) return;

    setScanningReceipt(true);
    try {
      const receipt = await scanReceipt(imageUri);
      premium.incrementScanCount();
      if (receipt.items.length > 0) {
        setSplitItems((prev) => [
          ...prev,
          ...receipt.items.map((item) => ({
            name: item.name,
            amount: item.amount,
            assignedTo: [] as Contact[],
          })),
        ]);
        if (!splitAmount || parseFloat(splitAmount) === 0) {
          setSplitAmount(receipt.total.toFixed(2));
        }
        if (!splitDescription.trim() && receipt.vendor) {
          setSplitDescription(receipt.vendor);
        }
        showToast(`${receipt.items.length} items scanned`, 'success');
      } else {
        showToast('No items found on receipt', 'error');
      }
    } catch (e: any) {
      showToast(e.message || 'Scan failed', 'error');
    } finally {
      setScanningReceipt(false);
    }
  };

  // ── Wizard Handlers ────────────────────────────────────────
  const resetWizardForm = useCallback(() => {
    setWizardStep(1);
    setWizardReceipt(null);
    setWizardDescription('');
    setWizardTotal('');
    setWizardEditingAmount(false);
    setWizardTaxHandling('divide');
    setWizardItems([]);
    setWizardParticipants([]);
    setWizardPaidBy(null);
    setWizardWalletId(wallets.find((w) => w.isDefault)?.id || null);
    setWizardDueDate(null);
    setWizardDueDatePickerOpen(false);
    setAssigningItemIndex(null);
    setEditingItemIndex(null);
    wizardDraftId.current = null;
  }, [wallets]);

  const processReceiptImage = async (uri: string) => {
    const premium = usePremiumStore.getState();
    if (!premium.canScanReceipt()) {
      showToast('Scan limit reached this month', 'error');
      return;
    }

    setScanningReceipt(true);
    try {
      const receipt = await scanReceipt(uri);
      premium.incrementScanCount();
      if (receipt.items.length === 0 && receipt.total === 0) {
        showToast('Could not read receipt', 'error');
        return;
      }
      setWizardReceipt(receipt);
      setWizardDescription(receipt.vendor || '');
      setWizardTotal(receipt.total.toFixed(2));
      setWizardItems(
        receipt.items.map((item) => ({
          name: item.name,
          amount: item.amount,
          assignedTo: [] as Contact[],
        }))
      );
      setWizardStep(1);
      setWizardVisible(true);
    } catch (e: any) {
      showToast(e.message || 'Scan failed', 'error');
    } finally {
      setScanningReceipt(false);
    }
  };

  const handleWizardScan = async () => {
    let imageUri: string | null = null;
    const scanner = getDocumentScanner();
    if (scanner) {
      try {
        const scanResult = await scanner.scanDocument({ maxNumDocuments: 1 });
        if (scanResult.scannedImages?.length) imageUri = scanResult.scannedImages[0];
      } catch { /* fall through to ImagePicker */ }
    }
    if (!imageUri) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showToast('Camera permission is required', 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets?.[0]) imageUri = result.assets[0].uri;
    }
    if (!imageUri) return;
    await processReceiptImage(imageUri);
  };

  const handleWizardGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast('Gallery permission is required', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await processReceiptImage(result.assets[0].uri);
  };

const wizardHasTax = useMemo(() => wizardReceipt?.tax != null && wizardReceipt.tax > 0, [wizardReceipt]);
  const wizardTaxAmount = useMemo(() => wizardReceipt?.tax || 0, [wizardReceipt]);

  const handleWizardNext = () => {
    if (wizardStep === 1) {
      if (!wizardDescription.trim()) {
        showToast('Please enter a description', 'error');
        return;
      }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      if (!wizardTotal || parseFloat(wizardTotal) <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
      }
      setWizardStep(wizardHasTax ? 3 : 4);
    } else if (wizardStep === 3) {
      setWizardStep(4);
    } else if (wizardStep === 4) {
      if (wizardParticipants.length < 2) {
        showToast('Add at least 2 participants', 'error');
        return;
      }
      const unassigned = wizardItems.some((item) => item.assignedTo.length === 0);
      if (unassigned) {
        showToast('Assign all items to at least one person', 'error');
        return;
      }
      // Auto-remove participants with no items assigned
      const participantsWithNoItems = wizardParticipants.filter((p) =>
        !wizardItems.some((item) => item.assignedTo.some((c) => c.id === p.id))
      );
      if (participantsWithNoItems.length > 0) {
        const remaining = wizardParticipants.length - participantsWithNoItems.length;
        if (remaining < 2) {
          showToast('Not enough participants have items assigned', 'error');
          return;
        }
        setWizardParticipants((prev) =>
          prev.filter((p) => wizardItems.some((item) => item.assignedTo.some((c) => c.id === p.id)))
        );
        const names = participantsWithNoItems.map((p) => p.name).join(', ');
        showToast(`Removed ${names} (no items assigned)`, 'info');
      }
      // Validate item totals approximately match the receipt total
      const itemSum = wizardItems.reduce((sum, item) => sum + item.amount, 0);
      const receiptTotal = parseFloat(wizardTotal) || 0;
      const totalToCompare = wizardTaxAmount > 0 ? receiptTotal - wizardTaxAmount : receiptTotal;
      const itemTotalDiff = Math.abs(itemSum - totalToCompare);
      if (itemTotalDiff > 0.05) {
        Alert.alert(
          t.debts.amountMismatch,
          `Item totals (${currency} ${itemSum.toFixed(2)}) don't match the receipt total (${currency} ${totalToCompare.toFixed(2)}). Difference: ${currency} ${itemTotalDiff.toFixed(2)}.\n\nDo you want to continue anyway?`,
          [
            { text: t.debts.goBack, style: 'cancel' },
            { text: t.common.confirm, onPress: () => setWizardStep(5) },
          ]
        );
        return;
      }
      setWizardStep(5);
    } else if (wizardStep === 5) {
      if (!wizardPaidBy) {
        showToast('Please select who paid the bill', 'error');
        return;
      }
      setWizardStep(6);
    }
  };

  const handleWizardBack = () => {
    if (wizardStep === 1) {
      setWizardVisible(false);
      resetWizardForm();
    } else if (wizardStep === 2) {
      setWizardStep(1);
    } else if (wizardStep === 3) {
      setWizardStep(2);
    } else if (wizardStep === 4) {
      setWizardStep(wizardHasTax ? 3 : 2);
    } else if (wizardStep === 5) {
      setWizardStep(4);
    } else if (wizardStep === 6) {
      setWizardStep(5);
    }
  };

  const wizardResult: CalculateSplitResult | null = useMemo(() => {
    if (wizardStep !== 6 || wizardParticipants.length < 2) return null;
    return calculateSplit({
      items: wizardItems,
      participants: wizardParticipants,
      confirmedTotal: parseFloat(wizardTotal) || 0,
      taxAmount: wizardTaxAmount,
      taxHandling: wizardTaxHandling,
      paidBy: wizardPaidBy,
    });
  }, [wizardStep, wizardItems, wizardParticipants, wizardTotal, wizardTaxAmount, wizardTaxHandling, wizardPaidBy]);

  const handleWizardSave = () => {
    if (wizardSavingRef.current) return;
    if (!wizardResult || !wizardPaidBy) return;
    wizardSavingRef.current = true;
    const splitData = {
      description: wizardDescription.trim(),
      totalAmount: wizardResult.effectiveTotal,
      splitMethod: 'item_based' as const,
      participants: wizardResult.participants,
      items: wizardItems,
      paidBy: wizardPaidBy,
      taxAmount: wizardTaxAmount > 0 ? wizardTaxAmount : undefined,
      taxHandling: wizardTaxAmount > 0 ? wizardTaxHandling : undefined,
      status: 'final' as const,
      draftReceipt: undefined,
      dueDate: wizardDueDate ? wizardDueDate.toISOString() : undefined,
      mode,
    };
    let splitId: string;
    if (wizardDraftId.current) {
      splitId = wizardDraftId.current;
      updateSplit(splitId, splitData);
    } else {
      splitId = addSplit(splitData);
    }

    // Auto-create debts + expense
    const selfId = '__self__';
    const desc = wizardDescription.trim();
    if (wizardPaidBy.id === selfId) {
      // I paid → auto-create expense for full bill amount
      let txId: string | undefined;
      if (mode === 'personal') {
        txId = addTransaction({
          amount: wizardResult.effectiveTotal,
          category: 'split_expense',
          description: desc,
          date: new Date(),
          type: 'expense',
          mode,
          walletId: wizardWalletId || undefined,
          inputMethod: 'manual',
        });
      } else {
        txId = addBusinessTransaction({
          date: new Date(),
          amount: wizardResult.effectiveTotal,
          type: 'cost',
          category: 'split_expense',
          note: desc,
          inputMethod: 'manual',
        });
      }

      // Link the transaction + wallet to the split for cleanup on delete
      if (txId || wizardWalletId) {
        updateSplit(splitId, {
          linkedTransactionId: txId,
          walletId: wizardWalletId || undefined,
        });
      }

      // Deduct from selected wallet
      if (wizardWalletId) {
        const selectedWallet = wallets.find((w) => w.id === wizardWalletId);
        if (selectedWallet?.type === 'credit') {
          useCredit(wizardWalletId, wizardResult.effectiveTotal);
        } else {
          deductFromWallet(wizardWalletId, wizardResult.effectiveTotal);
        }
      }

      // Others owe me — link debts to split
      wizardResult.participants
        .filter((p) => p.contact.id !== selfId && p.amount > 0)
        .forEach((p) => {
          addDebt({
            contact: p.contact,
            type: 'they_owe',
            totalAmount: p.amount,
            description: desc,
            splitId,
            dueDate: wizardDueDate || undefined,
            mode,
          });
        });
    } else {
      // Someone else paid → I owe them for my share
      const myShare = wizardResult.participants.find((p) => p.contact.id === selfId);
      if (myShare && myShare.amount > 0) {
        addDebt({
          contact: wizardPaidBy,
          type: 'i_owe',
          totalAmount: myShare.amount,
          description: desc,
          splitId,
          dueDate: wizardDueDate || undefined,
          mode,
        });
      }
    }

    wizardSavingRef.current = false;
    setWizardVisible(false);
    resetWizardForm();
    showToast('Split created!', 'success');
  };

  const handleSaveAsDraft = useCallback(() => {
    if (!wizardDescription.trim()) {
      showToast('add a description first', 'error');
      return;
    }
    const assignedCount = wizardItems.filter((item) => item.assignedTo.length > 0).length;
    const draftData = {
      description: wizardDescription.trim(),
      totalAmount: parseFloat(wizardTotal) || 0,
      splitMethod: 'item_based' as const,
      participants: wizardParticipants.map((c) => ({ contact: c, amount: 0, isPaid: false })),
      items: wizardItems,
      taxAmount: wizardTaxAmount > 0 ? wizardTaxAmount : undefined,
      taxHandling: wizardTaxAmount > 0 ? wizardTaxHandling : undefined,
      draftReceipt: wizardReceipt || undefined,
      status: 'draft' as const,
      mode,
    };
    if (wizardDraftId.current) {
      updateSplit(wizardDraftId.current, draftData);
      showToast('draft updated', 'success');
    } else {
      addSplit(draftData);
      showToast(`draft saved · ${assignedCount}/${wizardItems.length} assigned`, 'success');
    }
    setWizardVisible(false);
    resetWizardForm();
  }, [wizardDescription, wizardTotal, wizardItems, wizardParticipants, wizardTaxAmount,
      wizardTaxHandling, wizardReceipt, mode, addSplit, updateSplit, showToast, resetWizardForm]);

  const openDraftInWizard = useCallback((draft: SplitExpense) => {
    wizardDraftId.current = draft.id;
    setWizardDescription(draft.description);
    setWizardTotal(draft.totalAmount.toFixed(2));
    setWizardItems(draft.items);
    setWizardParticipants(draft.participants.map((p) => p.contact));
    setWizardTaxHandling(draft.taxHandling || 'divide');
    setWizardReceipt(draft.draftReceipt || null);
    setWizardPaidBy(null);
    setWizardWalletId(wallets.find((w) => w.isDefault)?.id || null);
    setWizardStep(4);
    setWizardVisible(true);
  }, [wallets]);

  const handleToggleWizardItemAssignment = useCallback((itemIndex: number, contact: Contact) => {
    setWizardItems(wizardItems.map((item, i) => {
      if (i !== itemIndex) return item;
      const assigned = item.assignedTo.some((c) => c.id === contact.id);
      return {
        ...item,
        assignedTo: assigned
          ? item.assignedTo.filter((c) => c.id !== contact.id)
          : [...item.assignedTo, contact],
      };
    }));
  }, [wizardItems]);

  const handleAssignAllEvenly = useCallback(() => {
    if (wizardParticipants.length === 0) return;
    setWizardItems(wizardItems.map((item) => ({
      ...item,
      assignedTo: [...wizardParticipants],
    })));
  }, [wizardParticipants, wizardItems]);

  const handleStartEditItem = useCallback((index: number) => {
    const item = wizardItems[index];
    if (!item) return;
    setEditingItemIndex(index);
    setEditItemName(item.name);
    setEditItemAmount(item.amount.toFixed(2));
  }, [wizardItems]);

  const handleSaveEditItem = useCallback(() => {
    if (editingItemIndex === null) return;
    const name = editItemName.trim();
    const amount = parseFloat(editItemAmount);
    if (!name || isNaN(amount) || amount <= 0) return;
    setWizardItems((prev) =>
      prev.map((item, i) => i === editingItemIndex ? { ...item, name, amount } : item)
    );
    setEditingItemIndex(null);
  }, [editingItemIndex, editItemName, editItemAmount]);

  const handleDeleteItem = useCallback((index: number) => {
    setWizardItems((prev) => prev.filter((_, i) => i !== index));
    if (editingItemIndex === index) setEditingItemIndex(null);
  }, [editingItemIndex]);

  const handleAddWizardItem = useCallback(() => {
    setWizardItems((prev) => [...prev, { name: 'New item', amount: 0, assignedTo: [] }]);
    setEditingItemIndex(wizardItems.length);
    setEditItemName('New item');
    setEditItemAmount('0.00');
  }, [wizardItems.length]);

  const handleOpenItemAssign = useCallback((index: number) => {
    setAssigningItemIndex(index);
    setItemManualName('');
    setItemAssignMode('assign');
  }, []);

  const handleItemAddContact = useCallback((contact: Contact) => {
    if (assigningItemIndex === null) return;
    setWizardItems((prev) =>
      prev.map((item, i) => {
        if (i !== assigningItemIndex) return item;
        if (item.assignedTo.some((c) => c.id === contact.id)) return item;
        return { ...item, assignedTo: [...item.assignedTo, contact] };
      })
    );
    if (!wizardParticipants.some((p) => p.id === contact.id)) {
      setWizardParticipants((prev) => [...prev, contact]);
    }
  }, [assigningItemIndex, wizardParticipants]);

  const handleItemRemoveContact = useCallback((contactId: string) => {
    if (assigningItemIndex === null) return;
    setWizardItems((prev) => {
      const updated = prev.map((item, i) => {
        if (i !== assigningItemIndex) return item;
        return { ...item, assignedTo: item.assignedTo.filter((c) => c.id !== contactId) };
      });
      // If contact is no longer assigned to any item, remove from wizard participants
      const stillAssigned = updated.some((item) => item.assignedTo.some((c) => c.id === contactId));
      if (!stillAssigned) {
        setWizardParticipants((prevP) => prevP.filter((p) => p.id !== contactId));
      }
      return updated;
    });
  }, [assigningItemIndex]);

  const handleItemAddManual = useCallback(() => {
    if (!itemManualName.trim()) return;
    const contact: Contact = {
      id: newId(),
      name: itemManualName.trim(),
      isFromPhone: false,
    };
    handleItemAddContact(contact);
    setItemManualName('');
  }, [itemManualName, handleItemAddContact]);

  const loadItemPhoneContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant contacts permission in Settings.');
      return;
    }
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
      sort: Contacts.SortTypes.FirstName,
    });
    const mapped: Contact[] = data
      .filter((c) => c.name)
      .map((c) => ({
        id: c.id || newId(),
        name: c.name || 'Unknown',
        phone: c.phoneNumbers?.[0]?.number,
        isFromPhone: true,
      }));
    setItemPhoneContacts(mapped);
    setItemContactSearch('');
    setItemAssignMode('contacts');
  };

  // ── Request Payment Handlers ──────────────────────────────
  const cleanPhoneNumber = (phone: string): string => {
    let cleaned = phone.replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '60' + cleaned.slice(1);
    }
    if (!cleaned.startsWith('+') && !cleaned.startsWith('60')) {
      cleaned = '60' + cleaned;
    }
    cleaned = cleaned.replace(/^\+/, '');
    return cleaned;
  };

  const composePaymentMessage = (debt: Debt): string => {
    const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);
    const senderName = userName?.trim() || 'Me';
    let message = `Hey ${debt.contact.name}, you owe me ${currency} ${remaining.toFixed(2)} for ${debt.description || 'untitled'}`;

    if (debt.splitId) {
      const linkedSplit = splits.find((s) => s.id === debt.splitId);
      if (linkedSplit && linkedSplit.items.length > 0) {
        const contactItems = linkedSplit.items.filter((item) =>
          item.assignedTo.some((c) => c.id === debt.contact.id)
        );
        if (contactItems.length > 0) {
          message += '\n\nBreakdown:';
          contactItems.forEach((item) => {
            const shareCount = item.assignedTo.length;
            const share = Math.round((item.amount / shareCount) * 100) / 100;
            if (shareCount > 1) {
              message += `\n· ${item.name} — ${currency} ${share.toFixed(2)} (${shareCount} people)`;
            } else {
              message += `\n· ${item.name} — ${currency} ${share.toFixed(2)}`;
            }
          });
        }
        if (linkedSplit.taxAmount && linkedSplit.taxAmount > 0 && linkedSplit.taxHandling === 'divide') {
          const participantsWithItems = linkedSplit.participants.filter((p) => p.amount > 0);
          const taxPerPerson = Math.round((linkedSplit.taxAmount / (participantsWithItems.length || 1)) * 100) / 100;
          message += `\n· tax — ${currency} ${taxPerPerson.toFixed(2)} per person`;
        }
      } else if (linkedSplit && linkedSplit.splitMethod === 'equal') {
        message += `\n\nSplit equally among ${linkedSplit.participants.length} people.`;
      }
    }

    if (hasPaymentQr) message += '\n\nQR code attached for payment';
    message += `\n\nThanks!\n-${senderName}`;
    return message;
  };

  const handleRequestPayment = (debt: Debt) => {
    setRequestPaymentDebt(debt);
    setRequestPaymentMessage(composePaymentMessage(debt));
    setMessageCopied(false);
    setMessageEditing(false);
    setRequestPaymentVisible(true);
  };

  const handleOpenReminder = useCallback((debt: Debt) => {
    const remaining = debt.totalAmount - debt.paidAmount;
    const msg = getReminderTone(debt.createdAt, debt.contact.name, remaining, debt.description, currency);
    setReminderDebt(debt);
    setReminderMessage(msg);
    setReminderEditing(false);
    setReminderCopied(false);
    setReminderModalVisible(true);
  }, [getReminderTone, currency]);

  const handleCopyPaymentMessage = useCallback(async () => {
    if (!requestPaymentMessage) return;
    await Clipboard.setStringAsync(requestPaymentMessage);
    setMessageCopied(true);
    setTimeout(() => setMessageCopied(false), 3000);
  }, [requestPaymentMessage]);

  const handleWhatsAppTap = () => {
    if (paymentQrs.length > 1) {
      setShowQrPicker(true);
    } else {
      sendWhatsAppWithQr(paymentQrs.length === 1 ? 0 : null);
    }
  };

  const sendWhatsAppWithQr = async (qrIndex: number | null) => {
    if (!requestPaymentDebt?.contact.phone) return;
    const phone = cleanPhoneNumber(requestPaymentDebt.contact.phone!);

    try {
      if (qrIndex !== null && paymentQrs[qrIndex]) {
        // Copy message to clipboard, then share QR via native share sheet
        await Clipboard.setStringAsync(requestPaymentMessage);
        showToast('Message copied — send QR then paste message', 'info');
        const qrUri = paymentQrs[qrIndex].uri;
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(qrUri, { mimeType: 'image/png', dialogTitle: 'Send QR' });
        }
      } else {
        // No QR — just open WhatsApp with message
        const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(requestPaymentMessage)}`;
        await Linking.openURL(url);
      }
      setRequestPaymentVisible(false);
      setRequestPaymentDebt(null);
      setShowQrPicker(false);
      maybeReturnToDetail();
    } catch {
      showToast('Could not open WhatsApp', 'error');
    }
  };

  // ── FAB Action ─────────────────────────────────────────────
  const showSplitChoice = useCallback(() => {
    setSplitChoiceVisible(true);
  }, []);

  const handleFABPress = useCallback(() => {
    setFabChoiceVisible(true);
  }, []);

  const getStatusConfig = useCallback((status: string) => {
    const safe = DEBT_STATUSES_SAFE.find((s) => s.value === status) || DEBT_STATUSES_SAFE[0];
    return { ...safe, color: semantic(safe.color, isDark) };
  }, [isDark]);

  const getTypeConfig = useCallback((type: string) => {
    const safe = DEBT_TYPES_SAFE.find((t) => t.value === type) || DEBT_TYPES_SAFE[0];
    return { ...safe, color: semantic(safe.color, isDark) };
  }, [isDark]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={mainScrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.bronze}
            colors={[C.bronze]}
          />
        }
      >
        {/* Balance Summary */}
        <View style={styles.heroRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setDebtTypeFilter(debtTypeFilter === 'i_owe' ? null : 'i_owe');
              setDebtFilter(debtFilter === 'pending' ? null : 'pending');
            }}
            style={[
              styles.heroTile,
              { backgroundColor: withAlpha(iOweColor, 0.06) },
              debtTypeFilter === 'i_owe' && { backgroundColor: withAlpha(iOweColor, 0.14) },
            ]}
          >
            <Text style={styles.heroTileLabel}>{t.debts.youOwe}</Text>
            <Text style={[styles.heroTileAmount, { color: iOweColor }]}>
              {currency} {balanceSummary.youOwe.toFixed(2)}
            </Text>
            {balanceSummary.paid > 0 && (
              <Text style={[styles.heroTileSub, { color: settledColor }]}>
                {balanceSummary.paid.toFixed(2)} paid
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setDebtTypeFilter(debtTypeFilter === 'they_owe' ? null : 'they_owe');
              setDebtFilter(debtFilter === 'pending' ? null : 'pending');
            }}
            style={[
              styles.heroTile,
              { backgroundColor: withAlpha(theyOweColor, 0.06) },
              debtTypeFilter === 'they_owe' && { backgroundColor: withAlpha(theyOweColor, 0.14) },
            ]}
          >
            <Text style={styles.heroTileLabel}>{t.debts.owedToYou}</Text>
            <Text style={[styles.heroTileAmount, { color: theyOweColor }]}>
              {currency} {balanceSummary.owedToYou.toFixed(2)}
            </Text>
            {balanceSummary.collected > 0 && (
              <Text style={[styles.heroTileSub, { color: settledColor }]}>
                {balanceSummary.collected.toFixed(2)} collected
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={activeTab === 'debts' ? 'Search debts...' : 'Search splits...'}
            placeholderTextColor={C.textMuted}
            returnKeyType="search"
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={C.accent}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x-circle" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setSortModalVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ paddingLeft: SPACING.xs }}
          >
            <View>
              <Feather name="sliders" size={16} color={(activeTab === 'debts' ? (debtSort !== 'newest' || debtTypeFilter || debtFilter) : splitSort !== 'newest') ? C.accent : C.textMuted} />
              {activeTab === 'debts' && (debtTypeFilter || debtFilter) && (
                <View style={{ position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent }} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'debts' && styles.tabActive]}
            onPress={() => {
              if (selectionMode) exitSelectionMode();
              if (activeTab !== 'debts') setActiveTab('debts');
            }}
            activeOpacity={0.7}
          >
            <Feather name="users" size={16} color={activeTab === 'debts' ? C.accent : C.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'debts' && styles.tabTextActive]}>
              Debts
            </Text>
            <View style={{
              backgroundColor: activeTab === 'debts' ? C.accent : withAlpha(C.textSecondary, 0.15),
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: RADIUS.full,
              minWidth: 22,
              alignItems: 'center',
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: activeTab === 'debts' ? C.onAccent : C.textSecondary }}>
                {modeDebts.length}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'splits' && styles.tabActive]}
            onPress={() => {
              if (selectionMode) exitSelectionMode();
              if (activeTab !== 'splits') setActiveTab('splits');
            }}
            activeOpacity={0.7}
          >
            <Feather name="scissors" size={16} color={activeTab === 'splits' ? C.accent : C.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'splits' && styles.tabTextActive]}>
              Splits
            </Text>
            <View style={{
              backgroundColor: activeTab === 'splits' ? C.accent : withAlpha(C.textSecondary, 0.15),
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: RADIUS.full,
              minWidth: 22,
              alignItems: 'center',
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: activeTab === 'splits' ? C.onAccent : C.textSecondary }}>
                {modeSplits.length}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Debts Tab */}
        {activeTab === 'debts' && (
          <>
            {/* Segmented control — pending / settled / optional archive */}
            <View style={styles.segmentedControl}>
              {([
                { key: 'pending' as const, label: 'pending', count: debtTabCounts.pending, color: C.accent },
                { key: 'settled' as const, label: 'settled', count: debtTabCounts.settled, color: settledColor },
                ...(debtsShowArchive ? [{ key: 'archive' as const, label: 'archive', count: debtTabCounts.archive, color: C.bronze }] : []),
              ] as const).map((tab) => {
                const isActive = debtTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => {
                      // Defensive: only fire state setters that actually change state.
                      // Avoids stray LayoutAnimation / re-render hiccups that can
                      // make rows visibly recompute padding by 1-2px on tap.
                      if (selectionMode) exitSelectionMode();
                      if (debtTab !== tab.key) setDebtTab(tab.key);
                    }}
                    style={[
                      styles.segmentTab,
                      isActive && { backgroundColor: withAlpha(tab.color, 0.12) },
                    ]}
                    activeOpacity={0.7}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`${tab.label}, ${tab.count} ${tab.count === 1 ? 'debt' : 'debts'}`}
                  >
                    <Text style={[
                      styles.segmentTabText,
                      isActive && { color: tab.color, fontWeight: TYPOGRAPHY.weight.semibold },
                    ]}>
                      {tab.label}
                    </Text>
                    <View style={[
                      styles.segmentTabBadge,
                      isActive && { backgroundColor: tab.color },
                    ]}>
                      <Text style={[
                        styles.segmentTabBadgeText,
                        isActive && { color: C.onAccent },
                      ]}>
                        {tab.count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Active filter summary */}
            {(debtTypeFilter || debtFilter) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 6 }}>
                <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary }}>
                  {filteredDebts.length} {filteredDebts.length === 1 ? 'debt' : 'debts'}
                  {` · ${currency} `}
                  {filteredDebts.reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0).toFixed(2)}
                </Text>
                <TouchableOpacity
                  onPress={() => { setDebtTypeFilter(null); setDebtFilter(null); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Feather name="x" size={12} color={C.gold} />
                  <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.gold, fontWeight: '600' }}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}
            {filteredDebts.length > 0 ? (
              groupedDebts.map((group) => {
                const isMulti = group.debts.length > 1;
                const inDebtSelection = selectionMode === 'debt';
                const allTheyOwe = group.debts.every((d) => d.type === 'they_owe' && d.status !== 'settled');
                const hasPhone = !!group.contact.phone;

                if (isMulti) {
                  // ── Compact group card — tap opens group detail sheet ──
                  const iOweDebts = group.debts.filter((d) => d.type === 'i_owe' && d.status !== 'settled');
                  const theyOweDebts = group.debts.filter((d) => d.type === 'they_owe' && d.status !== 'settled');
                  const iOweSum = iOweDebts.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
                  const theyOweSum = theyOweDebts.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
                  const isMixed = iOweSum > 0 && theyOweSum > 0;
                  const netAmount = Math.abs(iOweSum - theyOweSum);
                  const netDirection = iOweSum >= theyOweSum ? 'i_owe' : 'they_owe';
                  const primaryType = isMixed ? netDirection : group.debts[0].type;
                  const typeConfig = getTypeConfig(primaryType);
                  const settledCount = group.debts.filter((d) => d.status === 'settled').length;
                  const allSettled = settledCount === group.debts.length;
                  const allIOweTotal = group.debts.filter((d) => d.type === 'i_owe').reduce((s, d) => s + d.totalAmount, 0);
                  const allTheyOweTotal = group.debts.filter((d) => d.type === 'they_owe').reduce((s, d) => s + d.totalAmount, 0);
                  const wasMixed = allIOweTotal > 0 && allTheyOweTotal > 0;
                  const groupTotal = wasMixed ? Math.abs(allTheyOweTotal - allIOweTotal) : allIOweTotal + allTheyOweTotal;
                  const groupIds = group.debts.map((d) => d.id);
                  const allGroupSelected = inDebtSelection && groupIds.every((id) => selectedIds.has(id));
                  const someGroupSelected = inDebtSelection && groupIds.some((id) => selectedIds.has(id));
                  return (
                    <View key={group.contactId} style={[styles.tickerDebtRow, allGroupSelected && styles.tickerSplitRowSelected]}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          if (inDebtSelection) {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              groupIds.forEach((id) => allGroupSelected ? next.delete(id) : next.add(id));
                              return next;
                            });
                            return;
                          }
                          setDetailGroupId(group.contactId);
                        }}
                        onLongPress={() => !inDebtSelection && enterSelectionMode('debt', group.debts.map((d) => d.id))}
                        delayLongPress={400}
                      >
                        <View style={styles.tickerDebtHeaderRow}>
                          {inDebtSelection && (
                            <View style={[styles.selectionCheckbox, allGroupSelected && styles.selectionCheckboxActive, someGroupSelected && !allGroupSelected && { borderColor: C.accent, backgroundColor: withAlpha(C.accent, 0.3) }, { marginRight: SPACING.xs }]}>
                              {allGroupSelected && <Feather name="check" size={14} color={C.onAccent} />}
                              {someGroupSelected && !allGroupSelected && <Feather name="minus" size={14} color={C.onAccent} />}
                            </View>
                          )}
                          <View style={[styles.tickerDebtAvatar, { backgroundColor: withAlpha(typeConfig.color, 0.12) }]}>
                            <Text style={[styles.tickerDebtAvatarText, { color: typeConfig.color }]}>
                              {group.contactName.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.tickerDebtName} numberOfLines={1}>
                            {group.contactName.toLowerCase()}
                          </Text>
                          <Text style={[styles.tickerDebtTypeChip, { color: typeConfig.color }]}>
                            {group.debts.length} debts
                          </Text>
                          <View style={styles.tickerLeader} />
                          <Text style={[styles.tickerSplitAmount, { color: allSettled ? settledColor : typeConfig.color }]}>
                            {allSettled ? `${currency} ${groupTotal.toFixed(2)}` : isMixed ? `${currency} ${netAmount.toFixed(2)}` : `${currency} ${group.totalRemaining.toFixed(2)}`}
                          </Text>
                          <Feather name="chevron-right" size={14} color={C.textMuted} style={{ marginLeft: 4 }} />
                        </View>
                        <Text style={styles.tickerSplitFooter} numberOfLines={1}>
                          {allSettled
                            ? wasMixed
                              ? `settled up · net ${currency} ${groupTotal.toFixed(2)}`
                              : `${group.debts[0].type === 'i_owe' ? 'i owe' : 'they owe'} · settled · ${currency} ${groupTotal.toFixed(2)} total`
                            : isMixed ? `net ${netDirection === 'i_owe' ? 'i owe' : 'they owe'}` : `${primaryType === 'i_owe' ? 'i owe' : 'they owe'}`}
                          {!allSettled && settledCount > 0 ? ` · ${settledCount} settled` : ''}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }

                // ── Single debt card (unchanged layout) ──
                const debt = group.debts[0];
                const typeConfig = getTypeConfig(debt.type);
                const statusConfig = getStatusConfig(debt.status);
                const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);
                const paidPct = debt.totalAmount > 0 ? (debt.paidAmount / debt.totalAmount) * 100 : 0;
                const isSelected = inDebtSelection && selectedIds.has(debt.id);

                let debtFooterText = '';
                let debtFooterColor: string | null = null;
                if (debt.status === 'settled') {
                  const dir = debt.type === 'i_owe' ? 'i owe' : 'they owe';
                  debtFooterText = `${dir} · settled · ${currency} ${debt.totalAmount.toFixed(2)} total`;
                  debtFooterColor = settledColor;
                } else if (debt.dueDate) {
                  const dueD = new Date(debt.dueDate);
                  if (!isNaN(dueD.getTime())) {
                    const daysUntil = differenceInDays(dueD, new Date());
                    if (daysUntil < 0) {
                      debtFooterText = `${currency} ${remaining.toFixed(2)} left · overdue ${Math.abs(daysUntil)}d`;
                      debtFooterColor = overdueColor;
                    } else if (daysUntil === 0) {
                      debtFooterText = `${currency} ${remaining.toFixed(2)} left · due today`;
                      debtFooterColor = C.gold;
                    } else if (daysUntil <= 3) {
                      debtFooterText = `${currency} ${remaining.toFixed(2)} left · due in ${daysUntil}d`;
                      debtFooterColor = C.gold;
                    } else {
                      debtFooterText = `${currency} ${remaining.toFixed(2)} left · due in ${daysUntil}d`;
                    }
                  } else {
                    debtFooterText = `${currency} ${remaining.toFixed(2)} left · ${getDebtAge(debt.createdAt)}`;
                  }
                } else {
                  const days = differenceInDays(new Date(), new Date(debt.createdAt));
                  debtFooterText = `${currency} ${remaining.toFixed(2)} left · ${getDebtAge(debt.createdAt)}`;
                  if (days >= 30) debtFooterColor = overdueColor;
                  else if (days >= 7) debtFooterColor = C.gold;
                }

                return (
                  <View key={group.contactId} ref={route.params?.highlightId === debt.id ? highlightDebtRef : undefined}>
                  <View style={[
                    styles.tickerDebtRow,
                    isSelected && styles.tickerSplitRowSelected,
                  ]}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inDebtSelection) { toggleSelection(debt.id); return; }
                        setDetailDebtId(debt.id);
                      }}
                      onLongPress={() => !inDebtSelection && enterSelectionMode('debt', debt.id)}
                      delayLongPress={400}
                      accessibilityRole="button"
                      accessibilityLabel={`${debt.contact.name}, ${currency} ${remaining.toFixed(2)} left, ${typeConfig.label}`}
                    >
                      <View style={styles.tickerDebtHeaderRow}>
                        {inDebtSelection && (
                          <View style={[styles.selectionCheckbox, isSelected && styles.selectionCheckboxActive, { marginRight: SPACING.xs }]}>
                            {isSelected && <Feather name="check" size={14} color={C.onAccent} />}
                          </View>
                        )}
                        <View style={[styles.tickerDebtAvatar, { backgroundColor: withAlpha(typeConfig.color, 0.12) }]}>
                          <Text style={[styles.tickerDebtAvatarText, { color: typeConfig.color }]}>
                            {debt.contact.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.tickerDebtName} numberOfLines={1}>
                          {debt.contact.name.toLowerCase()}
                        </Text>
                        <Text style={[styles.tickerDebtTypeChip, { color: typeConfig.color }]}>
                          {debt.type === 'i_owe' ? 'i owe' : 'they owe'}
                        </Text>
                        <View style={styles.tickerLeader} />
                        <Text style={[styles.tickerSplitAmount, { color: debt.status === 'settled' ? settledColor : typeConfig.color }]}>
                          {currency} {debt.status === 'settled' ? debt.totalAmount.toFixed(2) : remaining.toFixed(2)}
                        </Text>
                        {!inDebtSelection && (
                          <Feather
                            name="chevron-right"
                            size={14}
                            color={C.textMuted}
                            style={{ marginLeft: 4 }}
                          />
                        )}
                      </View>

                      {debt.description ? (
                        <Text style={styles.tickerDebtDesc} numberOfLines={1}>
                          {debt.description.toLowerCase()}
                        </Text>
                      ) : null}

                      {debt.status !== 'settled' && debt.paidAmount > 0 && (
                        <View style={[styles.tickerProgressTrack, { marginTop: SPACING.xs }]}>
                          <View style={[styles.tickerProgressFill, { width: `${paidPct}%`, backgroundColor: statusConfig.color }]} />
                        </View>
                      )}
                      {debt.status === 'settled' && (
                        <View style={[styles.tickerProgressTrack, { marginTop: SPACING.xs }]}>
                          <View style={[styles.tickerProgressFill, { width: '100%', backgroundColor: settledColor }]} />
                        </View>
                      )}

                      <Text
                        style={[
                          styles.tickerSplitFooter,
                          debtFooterColor ? { color: debtFooterColor, fontWeight: TYPOGRAPHY.weight.semibold } : null,
                          { marginTop: SPACING.xs },
                        ]}
                        numberOfLines={1}
                      >
                        {debtFooterText}
                      </Text>
                    </TouchableOpacity>

                  </View>
                  </View>
                );
              })
            ) : modeDebts.length > 0 ? (
              <EmptyState
                icon={searchQuery ? 'search' : 'filter'}
                title={t.debts.noMatches}
                message={searchQuery ? `No debts matching "${searchQuery}"` : debtFilter ? `No ${debtFilter} debts` : t.debts.noMatchingDebts}
              />
            ) : (
              <EmptyState
                icon="users"
                title={t.debts.noDebts}
                message={t.debts.noDebtsMessage}
                actionLabel={t.debts.addDebt}
                onAction={() => { resetDebtForm(); setDebtModalVisible(true); }}
              />
            )}
          </>
        )}

        {/* Splits Tab — Direction B: 3 emotional buckets + drafts stash */}
        {activeTab === 'splits' && (
          <>
            {splitTab === 'drafts' ? (
              // Drafts mode — workflow stash, not a status. Plain header, plain list.
              <View style={styles.draftsHeader}>
                <TouchableOpacity
                  onPress={() => setSplitTab('waiting')}
                  style={styles.backChip}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="back to splits"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="chevron-left" size={16} color={C.textSecondary} />
                  <Text style={styles.backChipText}>back</Text>
                </TouchableOpacity>
                <View style={styles.draftsTitleWrap}>
                  <Feather name="bookmark" size={14} color={C.bronze} />
                  <Text style={styles.draftsTitle}>
                    {draftSplitCount} {draftSplitCount === 1 ? 'draft' : 'drafts'}
                  </Text>
                </View>
              </View>
            ) : (
              <>
                {/* Segmented control — 3 emotional buckets + optional archive */}
                <View style={styles.segmentedControl}>
                  {([
                    { key: 'waiting' as const, label: 'waiting on', count: splitBuckets.waiting.length, color: theyOweColor },
                    { key: 'youOwe' as const,  label: 'you owe',    count: splitBuckets.youOwe.length,  color: iOweColor    },
                    { key: 'settled' as const, label: 'settled',    count: splitBuckets.settled.length, color: settledColor },
                    ...(debtsShowArchive ? [{ key: 'archive' as const, label: 'archive', count: archiveSplitCount, color: C.bronze }] : []),
                  ] as const).map((tab) => {
                    const isActive = splitTab === tab.key;
                    return (
                      <TouchableOpacity
                        key={tab.key}
                        onPress={() => {
                          if (selectionMode) exitSelectionMode();
                          if (splitTab !== tab.key) setSplitTab(tab.key);
                        }}
                        style={[
                          styles.segmentTab,
                          isActive && { backgroundColor: withAlpha(tab.color, 0.12) },
                        ]}
                        activeOpacity={0.7}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={`${tab.label}, ${tab.count} ${tab.count === 1 ? 'split' : 'splits'}`}
                      >
                        <Text style={[
                          styles.segmentTabText,
                          isActive && { color: tab.color, fontWeight: TYPOGRAPHY.weight.semibold },
                        ]}>
                          {tab.label}
                        </Text>
                        <View style={[
                          styles.segmentTabBadge,
                          isActive && { backgroundColor: tab.color },
                        ]}>
                          <Text style={[
                            styles.segmentTabBadgeText,
                            isActive && { color: C.onAccent },
                          ]}>
                            {tab.count}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {draftSplitCount > 0 && (
                    <TouchableOpacity
                      style={styles.draftBookmark}
                      onPress={() => { exitSelectionMode(); setSplitTab('drafts'); }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${draftSplitCount} ${draftSplitCount === 1 ? 'draft' : 'drafts'}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="bookmark" size={14} color={C.bronze} />
                      <Text style={styles.draftBookmarkCount}>{draftSplitCount}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Hero card — one confident number per bucket */}
                <Card style={styles.splitHeroCard}>
                  {splitTab === 'waiting' && (
                    <>
                      <Text style={styles.splitHeroLabel}>you're owed back</Text>
                      <Text style={[styles.splitHeroAmount, { color: theyOweColor }]}>
                        {currency} {waitingTotal.toFixed(2)}
                      </Text>
                      <Text style={styles.splitHeroSub}>
                        {splitBuckets.waiting.length === 0
                          ? "nothing pending — you're clean"
                          : `across ${splitBuckets.waiting.length} ${splitBuckets.waiting.length === 1 ? 'split' : 'splits'}`}
                      </Text>
                    </>
                  )}
                  {splitTab === 'youOwe' && (
                    <>
                      <Text style={styles.splitHeroLabel}>you owe</Text>
                      <Text style={[styles.splitHeroAmount, { color: iOweColor }]}>
                        {currency} {youOweTotal.toFixed(2)}
                      </Text>
                      <Text style={styles.splitHeroSub}>
                        {splitBuckets.youOwe.length === 0
                          ? "you don't owe anyone — living free"
                          : `across ${splitBuckets.youOwe.length} ${splitBuckets.youOwe.length === 1 ? 'split' : 'splits'}`}
                      </Text>
                    </>
                  )}
                  {splitTab === 'settled' && (
                    <>
                      <Text style={styles.splitHeroLabel}>all squared up</Text>
                      <Text style={[styles.splitHeroAmount, { color: settledColor }]}>
                        {currency} {settledTotal.toFixed(2)}
                      </Text>
                      <Text style={styles.splitHeroSub}>
                        {splitBuckets.settled.length === 0
                          ? "settled splits land here when everyone's paid up"
                          : `${splitBuckets.settled.length} done · everyone paid up`}
                      </Text>
                    </>
                  )}
                </Card>
              </>
            )}

            {filteredSplits.length > 0 ? (
              filteredSplits.map((split, idx) => {
                const isDraft = split.status === 'draft';
                const methodConfig = SPLIT_METHODS.find((m) => m.value === split.splitMethod);
                const paidCount = split.participants.filter((p) => p.isPaid).length;
                const totalCount = split.participants.length;
                const isSettled = !isDraft && paidCount === totalCount;
                // Bucket-driven left-rail color so the row's identity matches the active tab.
                const railColor = isDraft
                  ? C.bronze
                  : isSettled
                  ? settledColor
                  : splitTab === 'youOwe'
                  ? iOweColor
                  : theyOweColor;
                const draftAssigned = isDraft ? split.items.filter((item) => item.assignedTo.length > 0).length : 0;

                // Compact subtitle — one line, "X of Y · Md" or "due in Nd" with overdue color.
                let subtitle = '';
                let subtitleColor: string | null = null;
                if (isDraft) {
                  subtitle = `draft · ${draftAssigned}/${split.items.length} items assigned`;
                } else {
                  const dueRaw = (split as any).dueDate;
                  const dueD = dueRaw ? new Date(dueRaw) : null;
                  if (dueD && !isNaN(dueD.getTime()) && !isSettled) {
                    const daysUntil = differenceInDays(dueD, new Date());
                    if (daysUntil < 0) {
                      subtitle = `${paidCount} of ${totalCount} paid · overdue ${Math.abs(daysUntil)}d`;
                      subtitleColor = overdueColor;
                    } else if (daysUntil === 0) {
                      subtitle = `${paidCount} of ${totalCount} paid · due today`;
                      subtitleColor = C.gold;
                    } else if (daysUntil <= 3) {
                      subtitle = `${paidCount} of ${totalCount} paid · due in ${daysUntil}d`;
                      subtitleColor = C.gold;
                    } else {
                      subtitle = `${paidCount} of ${totalCount} paid · due in ${daysUntil}d`;
                    }
                  } else {
                    subtitle = `${paidCount} of ${totalCount} paid · ${getDebtAge(split.createdAt)}`;
                  }
                }

                const isSelected = selectionMode === 'split' && selectedIds.has(split.id);
                const inSplitSelection = selectionMode === 'split';

                // ── B "ticker tape" — outline card, title + amount on a single line, mini progress + status below
                const paidAmount = split.participants.reduce((sum, p) => sum + (p.isPaid ? p.amount : 0), 0);
                const paidPct = split.totalAmount > 0 ? (paidAmount / split.totalAmount) * 100 : 0;
                const leftAmount = Math.max(0, split.totalAmount - paidAmount);
                let footerText = '';
                let footerColor: string | null = null;
                if (isDraft) {
                  footerText = `draft · ${draftAssigned} of ${split.items.length} items assigned`;
                } else {
                  const dueRaw = (split as any).dueDate;
                  const dueD = dueRaw ? new Date(dueRaw) : null;
                  if (dueD && !isNaN(dueD.getTime()) && !isSettled) {
                    const daysUntil = differenceInDays(dueD, new Date());
                    if (daysUntil < 0) {
                      footerText = `${currency} ${leftAmount.toFixed(2)} left · overdue ${Math.abs(daysUntil)}d`;
                      footerColor = overdueColor;
                    } else if (daysUntil === 0) {
                      footerText = `${currency} ${leftAmount.toFixed(2)} left · due today`;
                      footerColor = C.gold;
                    } else if (daysUntil <= 3) {
                      footerText = `${currency} ${leftAmount.toFixed(2)} left · due in ${daysUntil}d`;
                      footerColor = C.gold;
                    } else {
                      footerText = `${currency} ${leftAmount.toFixed(2)} left · ${totalCount - paidCount} unpaid`;
                    }
                  } else if (isSettled) {
                    footerText = `settled · everyone paid up`;
                    footerColor = settledColor;
                  } else {
                    footerText = `${currency} ${leftAmount.toFixed(2)} left · ${totalCount - paidCount} unpaid`;
                  }
                }

                return (
                  <TouchableOpacity
                    key={`${split.id}-${idx}`}
                    activeOpacity={0.7}
                    style={[
                      styles.tickerSplitRow,
                      isSelected && styles.tickerSplitRowSelected,
                    ]}
                    onPress={() => {
                      if (inSplitSelection) { toggleSelection(split.id); return; }
                      if (isDraft) { openDraftInWizard(split); return; }
                      setSelectedSplit(split); setSplitDetailVisible(true);
                    }}
                    onLongPress={() => !inSplitSelection && enterSelectionMode('split', split.id)}
                    delayLongPress={400}
                    accessibilityRole="button"
                    accessibilityLabel={`${split.description}, ${currency} ${split.totalAmount.toFixed(2)}, ${footerText}`}
                  >
                    {/* Top header line — title left, dotted leader, amount right */}
                    <View style={styles.tickerSplitHeaderRow}>
                      {inSplitSelection && (
                        <View style={[styles.selectionCheckbox, isSelected && styles.selectionCheckboxActive, { marginRight: SPACING.sm }]}>
                          {isSelected && <Feather name="check" size={14} color={C.onAccent} />}
                        </View>
                      )}
                      <Text style={styles.tickerSplitTitle} numberOfLines={1}>
                        {split.description}
                      </Text>
                      <View style={styles.tickerLeader} />
                      <Text style={styles.tickerSplitAmount}>
                        {currency} {split.totalAmount.toFixed(2)}
                      </Text>
                    </View>

                    {/* Mini progress bar — inline, sky for paid portion */}
                    {!isDraft && (
                      <View style={styles.tickerProgressTrack}>
                        <View
                          style={[
                            styles.tickerProgressFill,
                            { width: `${paidPct}%`, backgroundColor: railColor },
                          ]}
                        />
                      </View>
                    )}

                    {/* Status footer — single line: "RM X left · status" */}
                    <Text
                      style={[
                        styles.tickerSplitFooter,
                        footerColor ? { color: footerColor, fontWeight: TYPOGRAPHY.weight.semibold } : null,
                      ]}
                      numberOfLines={1}
                    >
                      {footerText}
                    </Text>
                  </TouchableOpacity>
                );
              })
            ) : modeSplits.length > 0 ? (
              <EmptyState
                icon={
                  searchQuery ? 'search' :
                  splitTab === 'settled' ? 'check-circle' :
                  splitTab === 'youOwe' ? 'inbox' :
                  splitTab === 'drafts' ? 'bookmark' :
                  'inbox'
                }
                title={
                  searchQuery ? t.debts.noMatches :
                  splitTab === 'settled' ? "nothing settled yet" :
                  splitTab === 'youOwe' ? "you don't owe anyone" :
                  splitTab === 'drafts' ? "no drafts saved" :
                  "no one owes you right now"
                }
                message={
                  searchQuery ? `no splits matching "${searchQuery}"` :
                  splitTab === 'settled' ? "splits move here when everyone's paid up." :
                  splitTab === 'youOwe' ? "nothing on your tab — living free." :
                  splitTab === 'drafts' ? "scan a receipt and save halfway — pick up later from here." :
                  "split a bill and you'll see who owes you back here."
                }
              />
            ) : (
              <EmptyState
                icon="scissors"
                title="no splits yet"
                message="split a bill with friends — receipt, equal, custom, your call."
                actionLabel={t.debts.splitExpense}
                onAction={() => showSplitChoice()}
              />
            )}
          </>
        )}
      </ScrollView>

      {selectionMode ? (
        <View style={styles.selectionBar}>
          <View style={styles.selectionBarTop}>
            <TouchableOpacity onPress={exitSelectionMode} style={styles.selectionBarBtn}>
              <Feather name="x" size={18} color={C.textPrimary} />
              <Text style={styles.selectionBarBtnText}>{t.common.cancel}</Text>
            </TouchableOpacity>
            <Text style={styles.selectionBarCount}>{selectedIds.size} {t.debts.selected}</Text>
            <TouchableOpacity onPress={selectAll} style={styles.selectionBarBtn}>
              <Feather name="check-square" size={18} color={C.accent} />
              <Text style={[styles.selectionBarBtnText, { color: C.accent }]}>{t.common.all}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.selectionBarActions}>
            {selectedIds.size === 1 && (
              <TouchableOpacity style={styles.selectionEditBtn} onPress={handleSelectionEdit} activeOpacity={0.7}>
                <Feather name="edit-2" size={18} color={C.accent} />
                <Text style={styles.selectionEditText}>{t.common.edit}</Text>
              </TouchableOpacity>
            )}
            {(() => {
              const ids = Array.from(selectedIds);
              const items = selectionMode === 'debt' ? debts : splits;
              const allArchived = ids.every((id) => items.find((i) => i.id === id)?.isArchived);
              return (
                <TouchableOpacity style={styles.selectionEditBtn} onPress={handleBulkArchive} activeOpacity={0.7}>
                  <Feather name={allArchived ? 'corner-up-left' : 'archive'} size={18} color={C.bronze} />
                  <Text style={[styles.selectionEditText, { color: C.bronze }]}>{allArchived ? 'unarchive' : 'archive'}</Text>
                </TouchableOpacity>
              );
            })()}
            <TouchableOpacity style={[styles.selectionDeleteBtn, { flex: 1 }]} onPress={handleBulkDelete} activeOpacity={0.7}>
              <Feather name="trash-2" size={18} color={C.onAccent} />
              <Text style={styles.selectionDeleteText}>{t.common.delete} ({selectedIds.size})</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FAB
          onPress={handleFABPress}
          icon="plus"
          color={C.accent}
          style={{ bottom: Math.max(SPACING.xl, insets.bottom + SPACING.md) }}
        />
      )}

      {/* ── Add/Edit Debt Modal — full bottom-sheet (drag-to-dismiss, animated backdrop, anchored save) ─── */}
      {debtModalVisible && (<Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={dDebtCloseSheet}>
        {/* Animated backdrop — opacity tied to sheet position */}
        <Reanimated.View style={[styles.dDebtBackdrop, dDebtBackdropAnimatedStyle]}>
          <Pressable style={{ flex: 1 }} onPress={dDebtCloseSheet} />
        </Reanimated.View>

        {/* Sheet — translateY shared value, springs in on open, slides out on close */}
        <Reanimated.View style={[styles.dDebtSheetContainer, dDebtSheetAnimatedStyle]}>
          {/* Drag zone — handle + title both catch Pan. activeOffsetY([10, 9999]) means
              only downward gestures activate, upward passes through. */}
          <GestureDetector gesture={dDebtSheetGesture}>
            <View collapsable={false}>
              <View style={styles.dDebtSheetTopRow}>
                <View style={styles.dDebtSheetHandle} />
              </View>
              {/* Centered title zone — italic serif accent (also draggable) */}
              <View style={styles.dDebtTitleZone}>
                <Text style={styles.dDebtTitle} numberOfLines={1} ellipsizeMode="tail">
                  {editingDebtId ? 'edit ' : 'add '}
                  <Text style={styles.dDebtTitleAccent}>
                    {editingDebtId
                      ? (debts.find((d) => d.id === editingDebtId)?.description?.toLowerCase() || 'debt')
                      : 'debt'}
                  </Text>
                </Text>
                <Text style={styles.dDebtSubtitle}>
                  {debtType === 'i_owe' ? 'log what you owe someone' : 'log what someone owes you'}
                </Text>
              </View>
            </View>
          </GestureDetector>

          <KeyboardAwareScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={styles.dDebtScrollContent}
            bottomOffset={32}
            keyboardDismissMode="on-drag"
          >
              {/* Hero amount card — surface bg, label + tiny inline tap-to-flip toggle, big input */}
              {(() => {
                const activeTypeColor = debtType === 'i_owe' ? iOweColor : theyOweColor;
                const editDebt = editingDebtId ? debts.find((d) => d.id === editingDebtId) : null;
                const isSettled = editDebt ? editDebt.paidAmount >= editDebt.totalAmount : false;
                // Comma display formatting (mirrors EditHeroAmountCard logic)
                const dotIdx = debtAmount.indexOf('.');
                const intRaw = dotIdx === -1 ? debtAmount : debtAmount.slice(0, dotIdx);
                const fracRaw = dotIdx === -1 ? null : debtAmount.slice(dotIdx + 1);
                const intFormatted = intRaw ? Number(intRaw).toLocaleString('en-US') : '';
                const displayAmount = fracRaw === null ? intFormatted : `${intFormatted}.${fracRaw}`;
                const handleAmountChange = (raw: string) => {
                  const stripped = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
                  const fd = stripped.indexOf('.');
                  let normalized = stripped;
                  if (fd !== -1) {
                    normalized = stripped.slice(0, fd + 1) + stripped.slice(fd + 1).replace(/\./g, '');
                    const [ip, fp = ''] = normalized.split('.');
                    normalized = ip + '.' + fp.slice(0, 2);
                  }
                  setDebtAmount(normalized);
                };
                return (
                  <View style={styles.dDebtFieldHeroCard}>
                    <Text style={styles.dDebtFieldCardLabel}>
                      amount <Text style={styles.dDebtFieldRequiredStar}>*</Text>
                    </Text>
                    <View style={styles.dDebtFieldHeroAmountRow}>
                      <Text style={[styles.dDebtFieldHeroCurrency, { color: activeTypeColor }]} numberOfLines={1}>
                        {currency}
                      </Text>
                      <TextInput
                        style={[styles.dDebtFieldHeroAmountInput, { color: activeTypeColor, opacity: isSettled ? 0.4 : 1 }]}
                        value={displayAmount}
                        onChangeText={handleAmountChange}
                        placeholder="0.00"
                        placeholderTextColor={withAlpha(C.textPrimary, 0.12)}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                        selectTextOnFocus={!isSettled}
                        editable={!isSettled}
                        accessibilityLabel="amount"
                        inputAccessoryViewID={Platform.OS === 'ios' ? 'dDebtModalAcc' : undefined}
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                      />
                    </View>

                    {isSettled && (
                      <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, textAlign: 'center', marginTop: SPACING.xs }}>
                        amount locked — debt is settled
                      </Text>
                    )}

                    {/* Segmented type toggle — both options visible, tap to switch */}
                    <View style={styles.dDebtTypeSegmented}>
                      {DEBT_TYPES_SAFE.map((dt) => {
                        const isActive = debtType === dt.value;
                        const dtColor = semantic(dt.color, isDark);
                        return (
                          <TouchableOpacity
                            key={dt.value}
                            style={[
                              styles.dDebtTypeSegBtn,
                              isActive && { backgroundColor: dtColor },
                              editDebt && editDebt.payments.length > 0 && !isActive && { opacity: 0.3 },
                            ]}
                            onPress={() => {
                              if (editDebt && editDebt.payments.length > 0) {
                                showToast('Cannot change direction after payments recorded.', 'error');
                                return;
                              }
                              setDebtType(dt.value as DebtType);
                            }}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isActive }}
                          >
                            <Feather
                              name={dt.icon as keyof typeof Feather.glyphMap}
                              size={13}
                              color={isActive ? C.onAccent : C.textSecondary}
                            />
                            <Text
                              style={[
                                styles.dDebtTypeSegBtnText,
                                isActive && { color: C.onAccent },
                              ]}
                            >
                              {dt.label.toLowerCase()}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}

              {/* Below-paid warning */}
              {(() => {
                if (!editingDebtId || !debtAmount) return null;
                const existing = debts.find((d) => d.id === editingDebtId);
                const newVal = parseFloat(debtAmount);
                if (!existing || isNaN(newVal) || existing.paidAmount === 0) return null;
                if (newVal < existing.paidAmount) {
                  return (
                    <View style={styles.amountWarnRow}>
                      <Feather name="alert-circle" size={13} color={C.bronze} />
                      <Text style={styles.amountWarnText}>
                        {t.debts.belowPaidWarn} ({currency} {existing.paidAmount.toFixed(2)}) {t.debts.willBeMarkedSettled}
                      </Text>
                    </View>
                  );
                }
                return null;
              })()}

              {/* Quiet hairline divider — groups hero from form fields */}
              <View style={styles.dDebtSheetDivider} />

              {/* What-for field card */}
              <View style={styles.dDebtFieldCard}>
                <Text style={styles.dDebtFieldCardLabel}>what for</Text>
                <TextInput
                  style={[styles.dDebtFieldCardInput, styles.dDebtFieldMultiline]}
                  value={debtDescription}
                  onChangeText={setDebtDescription}
                  placeholder="e.g. nando's makan malam"
                  placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                  multiline
                  textAlignVertical="top"
                  returnKeyType="default"
                  onFocus={() => setMultilineFocused(true)}
                  onBlur={() => setMultilineFocused(false)}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                />
              </View>

              {/* Contact picker — keeps own chrome but with lowercase label.
                  ContactPicker renders label as a single Text, so the required indicator
                  is inline as plain text (can't split styles). */}
              <View style={{ marginBottom: SPACING.sm + 2 }}>
                <ContactPicker
                  selectedContacts={debtContacts}
                  onSelect={setDebtContacts}
                  mode="single"
                  label="who *"
                />
              </View>

              {/* Category picker — standalone */}
              <View style={{ marginBottom: SPACING.sm + 2 }}>
                <CategoryPicker
                  categories={debtType === 'i_owe' ? expenseCategories : incomeCategories}
                  selectedId={debtCategory}
                  onSelect={setDebtCategory}
                  layout="dropdown"
                  onNavigateToSettings={() => {
                    categoryManagerCallerRef.current = 'debt';
                    const type = debtType === 'i_owe' ? 'expense' : 'income';
                    setDebtModalVisible(false);
                    setTimeout(() => setCategoryManagerType(type), 50);
                  }}
                />
              </View>

              {/* Due date field card */}
              <TouchableOpacity
                style={styles.dDebtFieldCard}
                onPress={() => { Keyboard.dismiss(); setDueDatePickerOpen((v) => !v); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="select due date"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.dDebtFieldCardLabel}>
                    due date <Text style={styles.dDebtFieldOptional}>optional</Text>
                  </Text>
                  {debtDueDateObj && (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); setDebtDueDateObj(null); setDebtDueDate(''); setDueDatePickerOpen(false); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="x" size={13} color={C.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.dDebtFieldDateRow}>
                  <Feather name="calendar" size={15} color={debtDueDateObj ? C.accent : C.textMuted} />
                  <Text style={[styles.dDebtFieldDateText, !debtDueDateObj && { color: C.textMuted }]}>
                    {debtDueDateObj ? format(debtDueDateObj, 'd MMM yyyy').toLowerCase() : 'pick a date'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Delete debt — text-link with trash icon, only in edit mode (sits in scroll content like EditTransactionSheet's delete) */}
              {editingDebtId && (
                <Pressable
                  style={styles.dDebtDeleteLink}
                  onPress={() => {
                    const id = editingDebtId;
                    dDebtCloseSheet();
                    setTimeout(() => handleDeleteDebt(id), 240);
                  }}
                  hitSlop={{ top: 14, bottom: 14, left: 18, right: 18 }}
                  accessibilityRole="button"
                  accessibilityLabel="delete debt"
                >
                  {({ pressed }) => (
                    <View style={[styles.dDebtDeleteLinkInner, pressed && { opacity: 0.55 }]}>
                      <Feather name="trash-2" size={13} color={C.textMuted} />
                      <Text style={styles.dDebtDeleteLinkText}>delete debt</Text>
                    </View>
                  )}
                </Pressable>
              )}

          </KeyboardAwareScrollView>

          {/* Anchored save zone — stays pinned at bottom of sheet */}
          {(() => {
            const canSave =
              debtAmount.trim().length > 0 &&
              parseFloat(debtAmount) > 0 &&
              debtContacts.length > 0;

            const onPressSave = () => {
              if (dDebtIsSaving) return;
              if (!canSave) {
                lightTap();
                dDebtSaveShake.value = withSequence(
                  withTiming(-3, { duration: 60, easing: Easing.linear }),
                  withTiming(3, { duration: 60, easing: Easing.linear }),
                  withTiming(-2, { duration: 60, easing: Easing.linear }),
                  withTiming(2, { duration: 50, easing: Easing.linear }),
                  withTiming(0, { duration: 50, easing: Easing.linear }),
                );
                return;
              }
              setDDebtIsSaving(true);
              handleSaveDebt();
              setTimeout(() => setDDebtIsSaving(false), 200);
            };

            return (
              <View style={[styles.dDebtSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
                <Reanimated.View style={dDebtSaveAnimatedStyle}>
                  <Pressable
                    style={[
                      styles.dDebtSaveBtn,
                      (!canSave || dDebtIsSaving) && styles.dDebtSaveBtnDisabled,
                    ]}
                    onPress={onPressSave}
                    onPressIn={() => {
                      dDebtSaveScale.value = withTiming(0.97, { duration: 120 });
                    }}
                    onPressOut={() => {
                      dDebtSaveScale.value = withSpring(1, { damping: 18, stiffness: 240 });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={editingDebtId ? 'save changes' : 'add debt'}
                    accessibilityState={{ disabled: !canSave || dDebtIsSaving, busy: dDebtIsSaving }}
                  >
                    {dDebtIsSaving ? (
                      <ActivityIndicator size="small" color={C.surface} />
                    ) : (
                      <View style={styles.dDebtSaveBtnInner}>
                        <Feather
                          name="check"
                          size={16}
                          color={canSave ? C.surface : C.textMuted}
                        />
                        <Text
                          style={[
                            styles.dDebtSaveBtnText,
                            !canSave && styles.dDebtSaveBtnTextDisabled,
                          ]}
                        >
                          {editingDebtId ? 'save changes' : 'add debt'}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </Reanimated.View>

                {/* Close — text-link with X icon, always visible below save (matches EditTransactionSheet) */}
                <Pressable
                  style={styles.dDebtSecondaryLink}
                  onPress={dDebtCloseSheet}
                  hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                  accessibilityRole="button"
                  accessibilityLabel="close"
                >
                  {({ pressed }) => (
                    <View style={[styles.dDebtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                      <Feather name="x" size={12} color={C.textMuted} />
                      <Text style={styles.dDebtSecondaryLinkText}>close</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })()}
        </Reanimated.View>

        {/* Date picker overlay — sits ABOVE everything */}
        {dueDatePickerOpen && (
          <Pressable style={styles.datePickerOverlay} onPress={() => setDueDatePickerOpen(false)}>
            <Pressable style={styles.datePickerCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>{t.debts.selectDueDate}</Text>
                <TouchableOpacity onPress={() => setDueDatePickerOpen(false)}>
                  <Text style={styles.datePickerDone}>{t.common.done}</Text>
                </TouchableOpacity>
              </View>
              <CalendarPicker
                value={debtDueDateObj ?? new Date()}
                minimumDate={new Date()}
                onChange={(date) => {
                  setDebtDueDateObj(date);
                  setDebtDueDate(format(date, 'd MMM yyyy'));
                  setDueDatePickerOpen(false);
                }}
              />
            </Pressable>
          </Pressable>
        )}
        {keyboardVisible && multilineFocused && (
          <TouchableOpacity
            style={[styles.doneFab, { bottom: keyboardHeight + 16 }]}
            onPress={() => Keyboard.dismiss()}
            activeOpacity={0.8}
          >
            <Feather name="check" size={20} color={C.onAccent} />
          </TouchableOpacity>
        )}
        <InModalToast ref={modalToastRef} />
      </Modal>)}

      {/* ── Add/Edit Split Modal — full bottom-sheet (drag-to-dismiss, animated backdrop, anchored save) ─── */}
      {splitModalVisible && (<Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={dSplitCloseSheet}>
        {/* Animated backdrop */}
        <Reanimated.View style={[styles.dDebtBackdrop, dSplitBackdropAnimatedStyle]}>
          <Pressable style={{ flex: 1 }} onPress={dSplitCloseSheet} />
        </Reanimated.View>

        {/* Sheet */}
        <Reanimated.View style={[styles.dDebtSheetContainer, dSplitSheetAnimatedStyle]}>
          {/* Drag zone — handle + title */}
          <GestureDetector gesture={dSplitSheetGesture}>
            <View collapsable={false}>
              <View style={styles.dDebtSheetTopRow}>
                <View style={styles.dDebtSheetHandle} />
              </View>
              <View style={styles.dDebtTitleZone}>
                <Text style={styles.dDebtTitle} numberOfLines={1} ellipsizeMode="tail">
                  {editingSplitId ? 'edit ' : 'split '}
                  <Text style={styles.dDebtTitleAccent}>
                    {editingSplitId
                      ? (splits.find((s) => s.id === editingSplitId)?.description?.toLowerCase() || 'split')
                      : 'expense'}
                  </Text>
                </Text>
                <Text style={styles.dDebtSubtitle}>
                  split a bill across friends — fair, traceable
                </Text>
              </View>
            </View>
          </GestureDetector>

          <KeyboardAwareScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={styles.dDebtScrollContent}
            bottomOffset={32}
            keyboardDismissMode="on-drag"
          >
            {/* Hero amount card — total + comma formatting */}
            {(() => {
              const dotIdx = splitAmount.indexOf('.');
              const intRaw = dotIdx === -1 ? splitAmount : splitAmount.slice(0, dotIdx);
              const fracRaw = dotIdx === -1 ? null : splitAmount.slice(dotIdx + 1);
              const intFormatted = intRaw ? Number(intRaw).toLocaleString('en-US') : '';
              const displayAmount = fracRaw === null ? intFormatted : `${intFormatted}.${fracRaw}`;
              const handleAmountChange = (raw: string) => {
                const stripped = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
                const fd = stripped.indexOf('.');
                let normalized = stripped;
                if (fd !== -1) {
                  normalized = stripped.slice(0, fd + 1) + stripped.slice(fd + 1).replace(/\./g, '');
                  const [ip, fp = ''] = normalized.split('.');
                  normalized = ip + '.' + fp.slice(0, 2);
                }
                setSplitAmount(normalized);
              };
              return (
                <View style={styles.dDebtFieldHeroCard}>
                  <Text style={styles.dDebtFieldCardLabel}>
                    total amount <Text style={styles.dDebtFieldRequiredStar}>*</Text>
                  </Text>
                  <View style={styles.dDebtFieldHeroAmountRow}>
                    <Text style={[styles.dDebtFieldHeroCurrency, { color: C.accent }]} numberOfLines={1}>
                      {currency}
                    </Text>
                    <TextInput
                      style={[styles.dDebtFieldHeroAmountInput, { color: C.accent }]}
                      value={displayAmount}
                      onChangeText={handleAmountChange}
                      placeholder="0.00"
                      placeholderTextColor={withAlpha(C.textPrimary, 0.12)}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      selectTextOnFocus
                      accessibilityLabel="total amount"
                      inputAccessoryViewID={Platform.OS === 'ios' ? 'dSplitModalAcc' : undefined}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={C.accent}
                    />
                  </View>
                </View>
              );
            })()}

            <View style={styles.dDebtSheetDivider} />

            {/* What-for / description card */}
            <View style={styles.dDebtFieldCard}>
              <Text style={styles.dDebtFieldCardLabel}>what for</Text>
              <TextInput
                style={[styles.dDebtFieldCardInput, styles.dDebtFieldMultiline]}
                value={splitDescription}
                onChangeText={setSplitDescription}
                placeholder="dinner, trip, groceries…"
                placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                multiline
                textAlignVertical="top"
                returnKeyType="default"
                onFocus={() => setMultilineFocused(true)}
                onBlur={() => setMultilineFocused(false)}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
            </View>

            {/* Split method — segmented (only when adding) */}
            {!editingSplitId && (
              <View style={styles.dDebtFieldCard}>
                <Text style={styles.dDebtFieldCardLabel}>split method</Text>
                <View style={[styles.dDebtTypeSegmented, { marginTop: 6 }]}>
                  {SPLIT_METHODS.map((m) => {
                    const isActive = splitMethod === m.value;
                    return (
                      <TouchableOpacity
                        key={m.value}
                        style={[
                          styles.dDebtTypeSegBtn,
                          isActive && { backgroundColor: C.accent },
                        ]}
                        onPress={() => setSplitMethod(m.value as SplitMethod)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                      >
                        <Feather
                          name={m.icon as keyof typeof Feather.glyphMap}
                          size={13}
                          color={isActive ? C.onAccent : C.textSecondary}
                        />
                        <Text style={[
                          styles.dDebtTypeSegBtnText,
                          isActive && { color: C.onAccent },
                        ]}>
                          {m.label.toLowerCase()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Participants — internal heavy label, same as 'who' in Add Debt */}
            <View style={{ marginBottom: SPACING.sm + 2 }}>
              <ContactPicker
                selectedContacts={splitContacts}
                onSelect={handleSplitContactsChange}
                mode="multi"
                label="participants *"
                includeSelf
                selfName={getSelfContact().name}
              />
            </View>

            {/* Paid by — internal heavy label */}
            <View style={{ marginBottom: SPACING.sm + 2 }}>
              <ContactPicker
                selectedContacts={splitPaidBy}
                onSelect={(contacts) => {
                  setSplitPaidBy(contacts);
                  if (contacts.length === 0 || contacts[0].id !== '__self__') {
                    setSplitWalletId(null);
                  }
                }}
                mode="single"
                label="paid by *"
                includeSelf
                selfName={getSelfContact().name}
              />
            </View>

            {/* Paid from wallet — only when 'you' is the fronter */}
            {splitPaidBy.length > 0 && splitPaidBy[0].id === '__self__' && (
              <View style={{ marginBottom: SPACING.sm + 2 }}>
                <WalletPicker
                  wallets={wallets}
                  selectedId={splitWalletId}
                  onSelect={setSplitWalletId}
                  label="paid from wallet"
                />
              </View>
            )}

            {/* Due date field card */}
            <TouchableOpacity
              style={styles.dDebtFieldCard}
              onPress={() => { Keyboard.dismiss(); setSplitDueDatePickerOpen((v) => !v); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="select due date"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.dDebtFieldCardLabel}>
                  due date <Text style={styles.dDebtFieldOptional}>optional</Text>
                </Text>
                {splitDueDateObj && (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); setSplitDueDateObj(null); setSplitDueDate(''); setSplitDueDatePickerOpen(false); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={13} color={C.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.dDebtFieldDateRow}>
                <Feather name="calendar" size={15} color={splitDueDateObj ? C.accent : C.textMuted} />
                <Text style={[styles.dDebtFieldDateText, !splitDueDateObj && { color: C.textMuted }]}>
                  {splitDueDateObj ? format(splitDueDateObj, 'd MMM yyyy').toLowerCase() : 'pick a date'}
                </Text>
              </View>
            </TouchableOpacity>

                {/* Custom amounts per participant */}
                {splitMethod === 'custom' && splitContacts.length > 0 && (
                  <View style={styles.customSection}>
                    <Text style={styles.formLabel}>{t.debts.amountPerPerson}</Text>
                    {splitContacts.map((c) => (
                      <View key={c.id} style={styles.customRow}>
                        <Text style={styles.customName} numberOfLines={1}>{c.name}</Text>
                        <TextInput
                          style={styles.customInput}
                          value={customAmounts[c.id] || ''}
                          onChangeText={(v) => setCustomAmounts({ ...customAmounts, [c.id]: v })}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          placeholderTextColor={C.textSecondary}
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                          keyboardAppearance={isDark ? 'dark' : 'light'}
                          selectionColor={C.accent}
                        />
                      </View>
                    ))}
                  </View>
                )}

                {/* Item-based split */}
                {splitMethod === 'item_based' && (
                  <View style={styles.customSection}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.formLabel}>{t.debts.items}</Text>
                    </View>
                    {!editingSplitId && (
                      <View style={styles.addItemRow}>
                        <TextInput
                          style={[styles.formInput, { flex: 2 }]}
                          value={newItemName}
                          onChangeText={setNewItemName}
                          placeholder={t.debts.itemName}
                          placeholderTextColor={C.textSecondary}
                          returnKeyType="next"
                          keyboardAppearance={isDark ? 'dark' : 'light'}
                          selectionColor={C.accent}
                        />
                        <TextInput
                          style={[styles.formInput, { flex: 1 }]}
                          value={newItemAmount}
                          onChangeText={setNewItemAmount}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          placeholderTextColor={C.textSecondary}
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                          keyboardAppearance={isDark ? 'dark' : 'light'}
                          selectionColor={C.accent}
                        />
                        <TouchableOpacity style={styles.addItemButton} onPress={handleAddItem}>
                          <Feather name="plus" size={20} color={C.onAccent} />
                        </TouchableOpacity>
                      </View>
                    )}

                    {splitItems.map((item, index) => (
                      <View key={index} style={styles.itemCard}>
                        <View style={styles.itemHeader}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemAmount}>{currency} {item.amount.toFixed(2)}</Text>
                          <TouchableOpacity onPress={() => setSplitItems(splitItems.filter((_, i) => i !== index))} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                            <Feather name="x" size={16} color={C.neutral} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.assignLabel}>{t.debts.assignTo}</Text>
                        <View style={styles.assignChips}>
                          {splitContacts.map((c) => {
                            const isAssigned = item.assignedTo.some((a) => a.id === c.id);
                            return (
                              <TouchableOpacity
                                key={c.id}
                                style={[styles.assignChip, isAssigned && styles.assignChipActive]}
                                onPress={() => handleToggleItemAssignment(index, c)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Text style={[styles.assignChipText, isAssigned && styles.assignChipTextActive]} numberOfLines={1}>
                                  {c.name.split(' ')[0]}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Per-person preview */}
                {splitContacts.length >= 2 && splitAmount && parseFloat(splitAmount) > 0 && (() => {
                  const total = parseFloat(splitAmount);
                  let preview: { name: string; amount: number }[] = [];
                  if (splitMethod === 'equal') {
                    const per = total / splitContacts.length;
                    preview = splitContacts.map((c) => ({ name: c.name.split(' ')[0], amount: per }));
                  } else if (splitMethod === 'custom') {
                    preview = splitContacts.map((c) => ({ name: c.name.split(' ')[0], amount: parseFloat(customAmounts[c.id] || '0') || 0 }));
                  } else if (splitMethod === 'item_based' && splitItems.length > 0) {
                    const map: Record<string, number> = {};
                    splitContacts.forEach((c) => { map[c.id] = 0; });
                    splitItems.forEach((item) => {
                      const share = item.amount / (item.assignedTo.length || 1);
                      item.assignedTo.forEach((c) => { map[c.id] = (map[c.id] || 0) + share; });
                    });
                    preview = splitContacts.map((c) => ({ name: c.name.split(' ')[0], amount: map[c.id] || 0 }));
                  }
                  if (preview.length === 0) return null;
                  return (
                    <View style={{ marginTop: SPACING.md, marginBottom: SPACING.sm, backgroundColor: withAlpha(C.accent, 0.04), borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: C.border }}>
                      <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.medium, marginBottom: SPACING.xs, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.debts.splitPreview}</Text>
                      {preview.map((p, i) => (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                          <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary }}>{p.name}</Text>
                          <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: p.amount > 0 ? C.textPrimary : C.textSecondary }}>{currency} {p.amount.toFixed(2)}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}

              {/* Delete split — text-link (edit mode only) */}
              {editingSplitId && (
                <Pressable
                  style={styles.dDebtDeleteLink}
                  onPress={() => {
                    const id = editingSplitId;
                    dSplitCloseSheet();
                    setTimeout(() => handleDeleteSplit(id), 240);
                  }}
                  hitSlop={{ top: 14, bottom: 14, left: 18, right: 18 }}
                  accessibilityRole="button"
                  accessibilityLabel="delete split"
                >
                  {({ pressed }) => (
                    <View style={[styles.dDebtDeleteLinkInner, pressed && { opacity: 0.55 }]}>
                      <Feather name="trash-2" size={13} color={C.textMuted} />
                      <Text style={styles.dDebtDeleteLinkText}>delete split</Text>
                    </View>
                  )}
                </Pressable>
              )}

          </KeyboardAwareScrollView>

          {/* Anchored save zone */}
          {(() => {
            const canSave =
              splitAmount.trim().length > 0 &&
              parseFloat(splitAmount) > 0 &&
              splitContacts.length >= 2 &&
              splitPaidBy.length > 0;

            const onPressSave = () => {
              if (dSplitIsSaving) return;
              if (!canSave) {
                lightTap();
                dSplitSaveShake.value = withSequence(
                  withTiming(-3, { duration: 60, easing: Easing.linear }),
                  withTiming(3, { duration: 60, easing: Easing.linear }),
                  withTiming(-2, { duration: 60, easing: Easing.linear }),
                  withTiming(2, { duration: 50, easing: Easing.linear }),
                  withTiming(0, { duration: 50, easing: Easing.linear }),
                );
                return;
              }
              setDSplitIsSaving(true);
              handleSaveSplit();
              setTimeout(() => setDSplitIsSaving(false), 200);
            };

            return (
              <View style={[styles.dDebtSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
                <Reanimated.View style={dSplitSaveAnimatedStyle}>
                  <Pressable
                    style={[
                      styles.dDebtSaveBtn,
                      (!canSave || dSplitIsSaving) && styles.dDebtSaveBtnDisabled,
                    ]}
                    onPress={onPressSave}
                    onPressIn={() => {
                      dSplitSaveScale.value = withTiming(0.97, { duration: 120 });
                    }}
                    onPressOut={() => {
                      dSplitSaveScale.value = withSpring(1, { damping: 18, stiffness: 240 });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={editingSplitId ? 'save changes' : 'create split'}
                    accessibilityState={{ disabled: !canSave || dSplitIsSaving, busy: dSplitIsSaving }}
                  >
                    {dSplitIsSaving ? (
                      <ActivityIndicator size="small" color={C.surface} />
                    ) : (
                      <View style={styles.dDebtSaveBtnInner}>
                        <Feather
                          name="check"
                          size={16}
                          color={canSave ? C.surface : C.textMuted}
                        />
                        <Text
                          style={[
                            styles.dDebtSaveBtnText,
                            !canSave && styles.dDebtSaveBtnTextDisabled,
                          ]}
                        >
                          {editingSplitId ? 'save changes' : 'create split'}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </Reanimated.View>

                {/* Close — text-link with X icon */}
                <Pressable
                  style={styles.dDebtSecondaryLink}
                  onPress={dSplitCloseSheet}
                  hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                  accessibilityRole="button"
                  accessibilityLabel="close"
                >
                  {({ pressed }) => (
                    <View style={[styles.dDebtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                      <Feather name="x" size={12} color={C.textMuted} />
                      <Text style={styles.dDebtSecondaryLinkText}>close</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })()}
        </Reanimated.View>

        {/* Calendar overlay — sits above sheet */}
        {splitDueDatePickerOpen && (
          <Pressable style={styles.datePickerOverlay} onPress={() => setSplitDueDatePickerOpen(false)}>
            <Pressable style={styles.datePickerCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>{t.debts.selectDueDate}</Text>
                <TouchableOpacity onPress={() => setSplitDueDatePickerOpen(false)}>
                  <Text style={styles.datePickerDone}>{t.common.done}</Text>
                </TouchableOpacity>
              </View>
              <CalendarPicker
                value={splitDueDateObj ?? new Date()}
                minimumDate={new Date()}
                onChange={(date) => {
                  setSplitDueDateObj(date);
                  setSplitDueDate(format(date, 'd MMM yyyy'));
                  setSplitDueDatePickerOpen(false);
                }}
              />
            </Pressable>
          </Pressable>
        )}
        {keyboardVisible && multilineFocused && (
          <TouchableOpacity
            style={[styles.doneFab, { bottom: keyboardHeight + 16 }]}
            onPress={() => Keyboard.dismiss()}
            activeOpacity={0.8}
          >
            <Feather name="check" size={20} color={C.onAccent} />
          </TouchableOpacity>
        )}
        <InModalToast ref={modalToastRef} />
      </Modal>)}

      {/* ── Debt Detail Sheet ─── */}
      {detailDebtId && (<Modal
        visible
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={dDetailCloseSheet}
      >
        <Reanimated.View style={[styles.dDebtBackdrop, dDetailBackdropAnimatedStyle]}>
          <Pressable style={{ flex: 1 }} onPress={dDetailCloseSheet} />
        </Reanimated.View>

        <Reanimated.View style={[styles.dDebtSheetContainer, dDetailSheetAnimatedStyle]}>
          {(() => {
            const debt = debts.find((d) => d.id === detailDebtId);
            if (!debt) return null;
            const typeConfig = getTypeConfig(debt.type);
            const statusConfig = getStatusConfig(debt.status);
            const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);
            const paidPct = debt.totalAmount > 0 ? (debt.paidAmount / debt.totalAmount) * 100 : 0;
            const hasPhone = !!debt.contact.phone;

            let dueDateText = '';
            let dueColor: string | null = null;
            if (debt.dueDate) {
              const dueD = new Date(debt.dueDate);
              if (!isNaN(dueD.getTime())) {
                dueDateText = format(dueD, 'd MMM yyyy');
                const daysUntil = differenceInDays(dueD, new Date());
                if (daysUntil < 0) { dueDateText += ` · overdue ${Math.abs(daysUntil)}d`; dueColor = overdueColor; }
                else if (daysUntil <= 3) { dueDateText += daysUntil === 0 ? ' · due today' : ` · due in ${daysUntil}d`; dueColor = C.gold; }
              }
            }

            const category = debt.category
              ? [...expenseCategories, ...incomeCategories].find((c) => c.id === debt.category)
              : null;

            return (
              <>
                <GestureDetector gesture={dDetailSheetGesture}>
                  <View collapsable={false}>
                    <View style={styles.dDebtSheetTopRow}>
                      <View style={styles.dDebtSheetHandle} />
                    </View>
                    <View style={styles.dDebtTitleZone}>
                      <Text style={styles.dDebtTitle} numberOfLines={1}>
                        <Text style={styles.dDebtTitleAccent}>{debt.contact.name.toLowerCase()}</Text>
                        {debt.description ? ` · ${debt.description.toLowerCase()}` : ''}
                      </Text>
                      <Text style={styles.dDebtSubtitle}>
                        {debt.type === 'i_owe' ? 'i owe' : 'they owe'} · {statusConfig.label.toLowerCase()} · {getDebtAge(debt.createdAt)}
                      </Text>
                    </View>
                  </View>
                </GestureDetector>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: insets.bottom + SPACING['2xl'] }}
                >
                  {/* Hero amount */}
                  <View style={{ alignItems: 'center', paddingVertical: SPACING.lg, borderBottomWidth: 1, borderBottomColor: withAlpha(C.textPrimary, 0.06) }}>
                    <Text style={{ fontSize: 32, fontWeight: TYPOGRAPHY.weight.bold, color: debt.status === 'settled' ? settledColor : typeConfig.color, fontVariant: ['tabular-nums'] as any }}>
                      {currency} {debt.status === 'settled' ? debt.totalAmount.toFixed(2) : remaining.toFixed(2)}
                    </Text>
                    {debt.status === 'settled' ? (
                      <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: settledColor, marginTop: 4 }}>
                        settled · {currency} {debt.totalAmount.toFixed(2)} total
                      </Text>
                    ) : debt.paidAmount > 0 ? (
                      <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, marginTop: 4 }}>
                        of {currency} {debt.totalAmount.toFixed(2)} total
                      </Text>
                    ) : null}
                    {debt.totalAmount > 0 && (
                      <View style={[styles.tickerProgressTrack, { marginTop: SPACING.sm, width: '60%' }]}>
                        <View style={[styles.tickerProgressFill, { width: `${paidPct}%`, backgroundColor: debt.status === 'settled' ? settledColor : statusConfig.color }]} />
                      </View>
                    )}
                    {debt.paidAmount > 0 && debt.status !== 'settled' && (
                      <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 4 }}>
                        {currency} {debt.paidAmount.toFixed(2)} paid · {paidPct.toFixed(0)}%
                      </Text>
                    )}
                  </View>

                  {/* Meta info */}
                  <View style={[styles.detailMetaSection, { marginTop: SPACING.md }]}>
                    {debt.description ? (
                      <View style={styles.detailMetaRow}>
                        <Text style={styles.detailMetaLabel}>description</Text>
                        <Text style={[styles.detailMetaValue, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>{debt.description.toLowerCase()}</Text>
                      </View>
                    ) : null}
                    {category ? (
                      <View style={styles.detailMetaRow}>
                        <Text style={styles.detailMetaLabel}>category</Text>
                        <Text style={styles.detailMetaValue}>{category.name.toLowerCase()}</Text>
                      </View>
                    ) : null}
                    {debt.status === 'settled' ? (
                      <View style={styles.detailMetaRow}>
                        <Text style={styles.detailMetaLabel}>paid on</Text>
                        <Text style={styles.detailMetaValue}>{(() => {
                          const lastPay = debt.payments.length > 0
                            ? debt.payments.reduce((latest, p) => new Date(p.date) > new Date(latest.date) ? p : latest)
                            : null;
                          return lastPay ? format(new Date(lastPay.date), 'd MMM yyyy').toLowerCase() : format(new Date(debt.updatedAt), 'd MMM yyyy').toLowerCase();
                        })()}</Text>
                      </View>
                    ) : dueDateText ? (
                      <View style={styles.detailMetaRow}>
                        <Text style={styles.detailMetaLabel}>due date</Text>
                        <Text style={[styles.detailMetaValue, dueColor ? { color: dueColor, fontWeight: TYPOGRAPHY.weight.semibold } : null]}>{dueDateText.toLowerCase()}</Text>
                      </View>
                    ) : null}
                    <View style={styles.detailMetaRow}>
                      <Text style={styles.detailMetaLabel}>created</Text>
                      <Text style={styles.detailMetaValue}>{format(new Date(debt.createdAt), 'd MMM yyyy').toLowerCase()}</Text>
                    </View>
                  </View>

                  {/* Split item breakdown */}
                  {(() => {
                    if (!debt.splitId) return null;
                    const linkedSplit = splits.find((s) => s.id === debt.splitId);
                    if (!linkedSplit || linkedSplit.items.length === 0) return null;
                    const contactItems = linkedSplit.items.filter((item) =>
                      item.assignedTo.some((c) => c.id === debt.contact.id)
                    );
                    if (contactItems.length === 0) return null;
                    const taxPerPerson = linkedSplit.taxAmount && linkedSplit.taxHandling === 'divide'
                      ? Math.round((linkedSplit.taxAmount / (linkedSplit.participants.filter((p) => p.amount > 0).length || 1)) * 100) / 100
                      : 0;
                    return (
                      <View style={{ marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: withAlpha(C.textPrimary, 0.06) }}>
                        <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary, marginBottom: SPACING.sm }}>
                          breakdown
                        </Text>
                        {contactItems.map((item, i) => {
                          const share = Math.round((item.amount / (item.assignedTo.length || 1)) * 100) / 100;
                          return (
                            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                              <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary }}>{item.name.toLowerCase()}</Text>
                              <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, fontVariant: ['tabular-nums'] as any }}>{currency} {share.toFixed(2)}</Text>
                            </View>
                          );
                        })}
                        {taxPerPerson > 0 && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                            <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary }}>tax</Text>
                            <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, fontVariant: ['tabular-nums'] as any }}>{currency} {taxPerPerson.toFixed(2)}</Text>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                </ScrollView>
                {/* Actions — anchored at bottom */}
                <View style={[styles.dDebtSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm), gap: SPACING.sm }]}>
                  {debt.status !== 'settled' ? (
                    <TouchableOpacity
                      style={[styles.debtPrimaryAction, { backgroundColor: withAlpha(C.positive, 0.08), borderColor: withAlpha(C.positive, 0.25) }]}
                      onPress={() => {
                        const id = debt.id;
                        returnToDetailRef.current = id;
                        setDetailDebtId(null);
                        setTimeout(() => openPaymentModal(id, false), 50);
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name="plus-circle" size={15} color={C.positive} />
                      <Text style={[styles.debtPrimaryActionText, { color: C.positive }]}>record payment</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.debtPrimaryAction, { backgroundColor: withAlpha(C.textPrimary, isDark ? 0.08 : 0.04), borderColor: withAlpha(C.textPrimary, 0.1) }]}
                      onPress={() => {
                        const id = debt.id;
                        returnToDetailRef.current = id;
                        setDetailDebtId(null);
                        setTimeout(() => openPaymentModal(id, true), 50);
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name="clock" size={15} color={C.textSecondary} />
                      <Text style={[styles.debtPrimaryActionText, { color: C.textSecondary }]}>view history</Text>
                    </TouchableOpacity>
                  )}

                  <View style={[styles.debtIconRow, { justifyContent: 'center' }]}>
                      <TouchableOpacity
                        style={styles.debtIconChip}
                        onPress={() => {
                          const d = debt;
                          returnToDetailRef.current = d.id;
                          setDetailDebtId(null);
                          setTimeout(() => handleEditDebt(d), 50);
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="edit-2" size={16} color={C.accent} />
                      </TouchableOpacity>
                      {debt.payments.length > 0 && debt.status !== 'settled' && (
                        <TouchableOpacity
                          style={styles.debtIconChip}
                          onPress={() => {
                            const id = debt.id;
                            returnToDetailRef.current = id;
                            setDetailDebtId(null);
                            setTimeout(() => openPaymentModal(id, true), 50);
                          }}
                          activeOpacity={0.7}
                        >
                          <Feather name="clock" size={16} color={C.textSecondary} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.debtIconChip}
                        onPress={() => {
                          if (debt.isArchived) { unarchiveDebt(debt.id); showToast('debt unarchived', 'success'); }
                          else { archiveDebt(debt.id); showToast('debt archived', 'success'); }
                          setDetailDebtId(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name={debt.isArchived ? 'corner-up-left' : 'archive'} size={16} color={C.bronze} />
                      </TouchableOpacity>
                      {debt.type === 'they_owe' && debt.status !== 'settled' && (
                        <TouchableOpacity
                          style={styles.debtIconChip}
                          onPress={() => {
                            const d = debt;
                            returnToDetailRef.current = d.id;
                            setDetailDebtId(null);
                            setTimeout(() => handleOpenReminder(d), 50);
                          }}
                          activeOpacity={0.7}
                        >
                          <Feather name="bell" size={16} color={C.bronze} />
                        </TouchableOpacity>
                      )}
                      {debt.type === 'they_owe' && debt.status !== 'settled' && (
                        <TouchableOpacity
                          style={styles.debtIconChip}
                          onPress={() => {
                            const d = debt;
                            returnToDetailRef.current = d.id;
                            setDetailDebtId(null);
                            setTimeout(() => handleRequestPayment(d), 50);
                          }}
                          activeOpacity={0.7}
                        >
                          <Feather name="send" size={16} color={C.gold} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.debtIconChip}
                        onPress={() => {
                          const contact = debt.contact;
                          returnToDetailRef.current = debt.id;
                          setDetailDebtId(null);
                          setTimeout(() => {
                            setEditingDebtId(null);
                            setDebtContacts([contact]);
                            setDebtType(debt.type);
                            setDebtAmount('');
                            setDebtDescription('');
                            setDebtCategory('');
                            setDebtDueDateObj(null);
                            setDebtDueDate('');
                            setDebtModalVisible(true);
                          }, 50);
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="plus" size={16} color={C.positive} />
                      </TouchableOpacity>
                  </View>
                  <Pressable
                    style={styles.dDebtSecondaryLink}
                    onPress={dDetailCloseSheet}
                    hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                    accessibilityRole="button"
                    accessibilityLabel="close"
                  >
                    {({ pressed }) => (
                      <View style={[styles.dDebtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                        <Feather name="x" size={12} color={C.textMuted} />
                        <Text style={styles.dDebtSecondaryLinkText}>close</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </>
            );
          })()}
        </Reanimated.View>
        <InModalToast ref={modalToastRef} />
      </Modal>)}

      {/* ── Group Detail Sheet ─── */}
      {detailGroupId && (<Modal
        visible
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={dGroupDetailCloseSheet}
      >
        <Reanimated.View style={[styles.dDebtBackdrop, dGroupDetailBackdropAnimatedStyle]}>
          <Pressable style={{ flex: 1 }} onPress={dGroupDetailCloseSheet} />
        </Reanimated.View>

        <Reanimated.View style={[styles.dDebtSheetContainer, dGroupDetailSheetAnimatedStyle]}>
          {(() => {
            const group = groupedDebts.find((g) => g.contactId === detailGroupId);
            if (!group) {
              setTimeout(() => setDetailGroupId(null), 0);
              return null;
            }

            const iOweDebts = group.debts.filter((d) => d.type === 'i_owe' && d.status !== 'settled');
            const theyOweDebts = group.debts.filter((d) => d.type === 'they_owe' && d.status !== 'settled');
            const iOweSum = iOweDebts.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
            const theyOweSum = theyOweDebts.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
            const isMixed = iOweSum > 0 && theyOweSum > 0;
            const netAmount = Math.abs(iOweSum - theyOweSum);
            const netDirection = iOweSum >= theyOweSum ? 'i_owe' : 'they_owe';
            const primaryType = isMixed ? netDirection : group.debts[0].type;
            const typeConfig = getTypeConfig(primaryType);
            const hasPhone = !!group.contact.phone;
            const hasUnsettled = group.debts.some((d) => d.status !== 'settled');
            const allSettled = group.debts.every((d) => d.status === 'settled');
            const groupWasMixed = group.debts.some(d => d.type === 'i_owe') && group.debts.some(d => d.type === 'they_owe');
            const allIOweTotal = group.debts.filter(d => d.type === 'i_owe').reduce((s, d) => s + d.totalAmount, 0);
            const allTheyOweTotal = group.debts.filter(d => d.type === 'they_owe').reduce((s, d) => s + d.totalAmount, 0);
            const groupDateLabel = (() => {
              if (allSettled) {
                const latestPayment = group.debts
                  .flatMap((d) => d.payments)
                  .reduce((latest, p) => {
                    const pd = new Date(p.createdAt);
                    return pd > latest ? pd : latest;
                  }, new Date(0));
                return isValid(latestPayment) && latestPayment.getTime() > 0
                  ? `settled ${format(latestPayment, 'MMM d')}`
                  : null;
              }
              const oldest = group.debts.reduce((o, d) => {
                const cd = new Date(d.createdAt);
                return cd < o ? cd : o;
              }, new Date());
              return isValid(oldest) ? `since ${format(oldest, 'MMM d')}` : null;
            })();

            return (
              <>
                <GestureDetector gesture={dGroupDetailSheetGesture}>
                  <View collapsable={false}>
                    <View style={styles.dDebtSheetTopRow}>
                      <View style={styles.dDebtSheetHandle} />
                    </View>
                    <View style={styles.dDebtTitleZone}>
                      <Text style={styles.dDebtTitle} numberOfLines={1}>
                        {group.debts.length} debts · <Text style={styles.dDebtTitleAccent}>{group.contactName.toLowerCase()}</Text>
                      </Text>
                      <Text style={styles.dDebtSubtitle}>
                        {isMixed ? `net ${netDirection === 'i_owe' ? 'i owe' : 'they owe'}` : `${primaryType === 'i_owe' ? 'i owe' : 'they owe'}`}
                        {groupDateLabel ? `  ·  ${groupDateLabel}` : ''}
                      </Text>
                    </View>
                  </View>
                </GestureDetector>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: insets.bottom + SPACING['2xl'] }}
                >
                  {/* Hero net amount */}
                  <View style={{ alignItems: 'center', paddingVertical: SPACING.lg, borderBottomWidth: 1, borderBottomColor: withAlpha(C.textPrimary, 0.06) }}>
                    {(() => {
                      const heroAmount = allSettled
                        ? groupWasMixed ? Math.abs(allTheyOweTotal - allIOweTotal) : allIOweTotal + allTheyOweTotal
                        : isMixed ? netAmount : group.totalRemaining;
                      return (
                        <>
                          <Text style={{ fontSize: 32, fontWeight: TYPOGRAPHY.weight.bold, color: allSettled ? settledColor : typeConfig.color, fontVariant: ['tabular-nums'] as any }}>
                            {currency} {heroAmount.toFixed(2)}
                          </Text>
                          {allSettled ? (
                            <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, marginTop: 4 }}>
                              {groupWasMixed ? 'settled up' : `${group.debts[0].type === 'i_owe' ? 'i owe' : 'they owe'} · settled`}
                            </Text>
                          ) : isMixed ? (
                            <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, marginTop: 4 }}>
                              net · {netDirection === 'i_owe' ? 'i owe' : 'they owe'}
                            </Text>
                          ) : null}
                          {group.debts.length > 1 && (
                            <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 6, fontVariant: ['tabular-nums'] as any }}>
                              {isMixed || groupWasMixed
                                ? `they owe ${currency} ${allTheyOweTotal.toFixed(2)} − you owe ${currency} ${allIOweTotal.toFixed(2)}`
                                : group.debts.map(d => (allSettled ? d.totalAmount : Math.max(0, d.totalAmount - d.paidAmount)).toFixed(2)).join(' + ')}
                            </Text>
                          )}
                        </>
                      );
                    })()}
                  </View>

                  {/* Debt list */}
                  <View style={{ marginTop: SPACING.md }}>
                    {group.debts.map((debt, idx) => {
                      const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);
                      const dTypeConfig = getTypeConfig(debt.type);
                      const statusConfig = getStatusConfig(debt.status);
                      const paidPct = debt.totalAmount > 0 ? (debt.paidAmount / debt.totalAmount) * 100 : 0;

                      let footerText = '';
                      let footerColor: string | null = null;
                      if (debt.status === 'settled') {
                        footerText = `settled · ${currency} ${debt.totalAmount.toFixed(2)}`;
                        footerColor = settledColor;
                      } else if (debt.dueDate) {
                        const dueD = new Date(debt.dueDate);
                        if (!isNaN(dueD.getTime())) {
                          const daysUntil = differenceInDays(dueD, new Date());
                          if (daysUntil < 0) { footerText = `overdue ${Math.abs(daysUntil)}d`; footerColor = overdueColor; }
                          else if (daysUntil <= 3) { footerText = daysUntil === 0 ? 'due today' : `due in ${daysUntil}d`; footerColor = C.gold; }
                          else footerText = `due in ${daysUntil}d`;
                        }
                      } else {
                        const days = differenceInDays(new Date(), new Date(debt.createdAt));
                        footerText = getDebtAge(debt.createdAt);
                        if (days >= 30) footerColor = overdueColor;
                        else if (days >= 7) footerColor = C.gold;
                      }

                      return (
                        <View key={debt.id}>
                          {idx > 0 && <View style={{ height: 1, backgroundColor: withAlpha(C.textPrimary, isDark ? 0.10 : 0.05), marginVertical: SPACING.xs }} />}
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => {
                              returnToGroupRef.current = group.contactId;
                              setDetailGroupId(null);
                              setTimeout(() => setDetailDebtId(debt.id), 50);
                            }}
                            style={{ paddingVertical: SPACING.sm }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              {isMixed && (
                                <Text style={{ fontSize: 11, fontWeight: TYPOGRAPHY.weight.bold, color: dTypeConfig.color, marginRight: 4, width: 14, textAlign: 'center' }}>
                                  {debt.type === 'i_owe' ? '+' : '−'}
                                </Text>
                              )}
                              <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, flex: 1 }} numberOfLines={1}>
                                {(debt.description || 'untitled').toLowerCase()}
                              </Text>
                              {footerText ? (
                                <Text style={{ fontSize: 10, color: footerColor || C.textMuted, marginHorizontal: SPACING.xs, fontWeight: footerColor ? TYPOGRAPHY.weight.semibold : TYPOGRAPHY.weight.medium }}>
                                  {footerText}
                                </Text>
                              ) : null}
                              <View style={styles.tickerLeader} />
                              <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: debt.status === 'settled' ? settledColor : dTypeConfig.color, fontVariant: ['tabular-nums'] as any }}>
                                {currency} {debt.status === 'settled' ? debt.totalAmount.toFixed(2) : remaining.toFixed(2)}
                              </Text>
                              <Feather name="chevron-right" size={12} color={C.textMuted} style={{ marginLeft: 4 }} />
                            </View>
                            {debt.paidAmount > 0 && debt.status !== 'settled' && (
                              <View style={[styles.tickerProgressTrack, { marginTop: 4 }]}>
                                <View style={[styles.tickerProgressFill, { width: `${paidPct}%`, backgroundColor: statusConfig.color }]} />
                              </View>
                            )}
                            {debt.status === 'settled' && (
                              <View style={[styles.tickerProgressTrack, { marginTop: 4 }]}>
                                <View style={[styles.tickerProgressFill, { width: '100%', backgroundColor: groupWasMixed ? dTypeConfig.color : settledColor }]} />
                              </View>
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>

                </ScrollView>
                {/* Consolidated actions — anchored at bottom like payment sheet */}
                {hasUnsettled && (
                  <View style={[styles.dDebtSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm), gap: SPACING.sm }]}>
                      {/* Record payment — primary CTA */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          const firstUnsettled = group.debts.find((d) => d.status !== 'settled');
                          if (firstUnsettled) {
                            const gId = group.contactId;
                            const dId = firstUnsettled.id;
                            returnToGroupRef.current = gId;
                            setDetailGroupId(null);
                            setTimeout(() => {
                              setGroupPaymentId(gId);
                              openPaymentModal(dId, false);
                            }, 50);
                          }
                        }}
                        style={[styles.debtPrimaryAction, { backgroundColor: withAlpha(C.positive, 0.08), borderColor: withAlpha(C.positive, 0.25) }]}
                      >
                        <Feather name="plus-circle" size={15} color={C.positive} />
                        <Text style={[styles.debtPrimaryActionText, { color: C.positive }]}>record all payment</Text>
                      </TouchableOpacity>

                      {/* Secondary actions — icon chip row (L→R: archive, reminder, send request, add debt) */}
                      <View style={[styles.debtIconRow, { justifyContent: 'center' }]}>
                        {/* Archive all */}
                        {(() => {
                          const allArchived = group.debts.every((d) => d.isArchived);
                          return (
                            <TouchableOpacity
                              style={styles.debtIconChip}
                              onPress={() => {
                                group.debts.forEach((d) => allArchived ? unarchiveDebt(d.id) : archiveDebt(d.id));
                                showToast(`${group.debts.length} debts ${allArchived ? 'unarchived' : 'archived'}`, 'success');
                                setDetailGroupId(null);
                              }}
                              activeOpacity={0.7}
                            >
                              <Feather name={allArchived ? 'corner-up-left' : 'archive'} size={16} color={C.bronze} />
                            </TouchableOpacity>
                          );
                        })()}
                        {/* View history — only if payments exist */}
                        {group.debts.some((d) => d.payments.length > 0) && (
                          <TouchableOpacity
                            style={styles.debtIconChip}
                            onPress={() => {
                              const gId = group.contactId;
                              const firstWithPayments = group.debts.find((d) => d.payments.length > 0) || group.debts[0];
                              returnToGroupRef.current = gId;
                              setDetailGroupId(null);
                              setTimeout(() => {
                                setGroupPaymentId(gId);
                                openPaymentModal(firstWithPayments.id, true);
                              }, 50);
                            }}
                            activeOpacity={0.7}
                          >
                            <Feather name="clock" size={16} color={C.textSecondary} />
                          </TouchableOpacity>
                        )}
                        {/* Reminder */}
                        {(primaryType === 'they_owe' || isMixed) && (
                          <TouchableOpacity
                            style={styles.debtIconChip}
                            onPress={() => {
                              const firstTheyOwe = group.debts.find((d) => d.type === 'they_owe' && d.status !== 'settled') || group.debts[0];
                              const unsettled = group.debts.filter((d) => d.status !== 'settled');
                              const theyOweItems = unsettled.filter((d) => d.type === 'they_owe');
                              const iOweItems = unsettled.filter((d) => d.type === 'i_owe');
                              const theyOweTotal = theyOweItems.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
                              const iOweTotal = iOweItems.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
                              const netAmt = Math.abs(theyOweTotal - iOweTotal);
                              const netDir = theyOweTotal >= iOweTotal ? 'they_owe' : 'i_owe';
                              const displayAmt = isMixed ? netAmt : theyOweTotal;

                              let msg = `Hey ${group.contactName}, you owe me ${currency} ${displayAmt.toFixed(2)}\n`;

                              if (isMixed) {
                                msg += '\nYou owe me:';
                                theyOweItems.forEach((d) => {
                                  msg += `\n· ${d.description || 'untitled'} — ${currency} ${Math.max(0, d.totalAmount - d.paidAmount).toFixed(2)}`;
                                });
                                if (theyOweItems.length > 1) msg += `\n  subtotal: ${currency} ${theyOweTotal.toFixed(2)}`;
                                msg += '\n\nI owe you:';
                                iOweItems.forEach((d) => {
                                  msg += `\n· ${d.description || 'untitled'} — ${currency} ${Math.max(0, d.totalAmount - d.paidAmount).toFixed(2)}`;
                                });
                                if (iOweItems.length > 1) msg += `\n  subtotal: ${currency} ${iOweTotal.toFixed(2)}`;
                                msg += `\n\n${currency} ${theyOweTotal.toFixed(2)} - ${currency} ${iOweTotal.toFixed(2)} = ${currency} ${netAmt.toFixed(2)}`;
                              } else {
                                unsettled.forEach((d) => {
                                  msg += `\n· ${d.description || 'untitled'} — ${currency} ${Math.max(0, d.totalAmount - d.paidAmount).toFixed(2)}`;
                                });
                              }
                              msg += '\n\nCan you settle when free? Thank you!';
                              const gId = group.contactId;
                              returnToGroupRef.current = gId;
                              setDetailGroupId(null);
                              setTimeout(() => {
                                setReminderDebt(firstTheyOwe);
                                setReminderMessage(msg);
                                setReminderEditing(false);
                                setReminderCopied(false);
                                setReminderModalVisible(true);
                              }, 50);
                            }}
                            activeOpacity={0.7}
                          >
                            <Feather name="bell" size={16} color={C.bronze} />
                          </TouchableOpacity>
                        )}
                        {/* Request / send summary */}
                        {(primaryType === 'they_owe' || isMixed) && (
                          <TouchableOpacity
                            style={styles.debtIconChip}
                            onPress={() => {
                              const firstTheyOwe = group.debts.find((d) => d.type === 'they_owe' && d.status !== 'settled') || group.debts[0];
                              const senderName = userName?.trim() || 'Me';
                              const unsettled = group.debts.filter((d) => d.status !== 'settled');
                              const theyOweItems = unsettled.filter((d) => d.type === 'they_owe');
                              const iOweItems = unsettled.filter((d) => d.type === 'i_owe');
                              const theyOweTotal = theyOweItems.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
                              const iOweTotal = iOweItems.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
                              const netAmt = Math.abs(theyOweTotal - iOweTotal);
                              const netDir = theyOweTotal >= iOweTotal ? 'they_owe' : 'i_owe';
                              const headline = netDir === 'they_owe'
                                ? `you owe me ${currency} ${(isMixed ? netAmt : theyOweTotal).toFixed(2)}`
                                : `i owe you ${currency} ${(isMixed ? netAmt : iOweTotal).toFixed(2)}`;

                              let msg = `Hey ${group.contactName}, ${headline}\n`;

                              if (isMixed) {
                                msg += '\nYou owe me:';
                                theyOweItems.forEach((d) => {
                                  msg += `\n· ${d.description || 'untitled'} — ${currency} ${Math.max(0, d.totalAmount - d.paidAmount).toFixed(2)}`;
                                });
                                if (theyOweItems.length > 1) msg += `\n  subtotal: ${currency} ${theyOweTotal.toFixed(2)}`;
                                msg += '\n\nI owe you:';
                                iOweItems.forEach((d) => {
                                  msg += `\n· ${d.description || 'untitled'} — ${currency} ${Math.max(0, d.totalAmount - d.paidAmount).toFixed(2)}`;
                                });
                                if (iOweItems.length > 1) msg += `\n  subtotal: ${currency} ${iOweTotal.toFixed(2)}`;
                                msg += `\n\n${currency} ${theyOweTotal.toFixed(2)} - ${currency} ${iOweTotal.toFixed(2)} = ${currency} ${netAmt.toFixed(2)}`;
                              } else {
                                unsettled.forEach((d) => {
                                  msg += `\n· ${d.description || 'untitled'} — ${currency} ${Math.max(0, d.totalAmount - d.paidAmount).toFixed(2)}`;
                                });
                                const total = unsettled.reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
                                if (unsettled.length > 1) msg += `\n\nTotal: ${currency} ${total.toFixed(2)}`;
                              }

                              if (hasPaymentQr) msg += '\n\nQR code attached for payment';
                              msg += `\n\nThanks!\n-${senderName}`;
                              const gId = group.contactId;
                              returnToGroupRef.current = gId;
                              setDetailGroupId(null);
                              setTimeout(() => {
                                setRequestPaymentDebt(firstTheyOwe);
                                setRequestPaymentMessage(msg);
                                setMessageCopied(false);
                                setMessageEditing(false);
                                setRequestPaymentVisible(true);
                              }, 50);
                            }}
                            activeOpacity={0.7}
                          >
                            <Feather name={hasPhone ? 'send' : 'copy'} size={16} color={C.gold} />
                          </TouchableOpacity>
                        )}
                        {/* Add new debt for this contact */}
                        <TouchableOpacity
                          style={styles.debtIconChip}
                          onPress={() => {
                            const contact = group.contact;
                            const gId = group.contactId;
                            returnToGroupRef.current = gId;
                            setDetailGroupId(null);
                            setTimeout(() => {
                              setEditingDebtId(null);
                              setDebtContacts([contact]);
                              setDebtType(primaryType === 'i_owe' ? 'i_owe' : 'they_owe');
                              setDebtAmount('');
                              setDebtDescription('');
                              setDebtCategory('');
                              setAddingToGroupId(gId);
                              setDebtDueDateObj(null);
                              setDebtDueDate('');
                              setDebtModalVisible(true);
                            }, 50);
                          }}
                          activeOpacity={0.7}
                        >
                          <Feather name="plus" size={16} color={C.positive} />
                        </TouchableOpacity>
                      </View>
                    <Pressable
                      style={styles.dDebtSecondaryLink}
                      onPress={dGroupDetailCloseSheet}
                      hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                      accessibilityRole="button"
                      accessibilityLabel="close"
                    >
                      {({ pressed }) => (
                        <View style={[styles.dDebtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                          <Feather name="x" size={12} color={C.textMuted} />
                          <Text style={styles.dDebtSecondaryLinkText}>close</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                )}
                {!hasUnsettled && (
                  <View style={[styles.dDebtSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm), gap: SPACING.sm }]}>
                    <View style={[styles.debtIconRow, { justifyContent: 'center' }]}>
                      {group.debts.some((d) => d.payments.length > 0) && (
                        <TouchableOpacity
                          style={styles.debtIconChip}
                          onPress={() => {
                            const gId = group.contactId;
                            const firstWithPayments = group.debts.find((d) => d.payments.length > 0) || group.debts[0];
                            returnToGroupRef.current = gId;
                            setDetailGroupId(null);
                            setTimeout(() => {
                              setGroupPaymentId(gId);
                              openPaymentModal(firstWithPayments.id, true);
                            }, 50);
                          }}
                          activeOpacity={0.7}
                        >
                          <Feather name="clock" size={16} color={C.textSecondary} />
                        </TouchableOpacity>
                      )}
                      {(() => {
                        const allArchived = group.debts.every((d) => d.isArchived);
                        return (
                          <TouchableOpacity
                            style={styles.debtIconChip}
                            onPress={() => {
                              group.debts.forEach((d) => allArchived ? unarchiveDebt(d.id) : archiveDebt(d.id));
                              showToast(`${group.debts.length} debts ${allArchived ? 'unarchived' : 'archived'}`, 'success');
                              setDetailGroupId(null);
                            }}
                            activeOpacity={0.7}
                          >
                            <Feather name={allArchived ? 'corner-up-left' : 'archive'} size={16} color={C.bronze} />
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                    <Pressable
                      style={styles.dDebtSecondaryLink}
                      onPress={dGroupDetailCloseSheet}
                      hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                      accessibilityRole="button"
                      accessibilityLabel="close"
                    >
                      {({ pressed }) => (
                        <View style={[styles.dDebtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                          <Feather name="x" size={12} color={C.textMuted} />
                          <Text style={styles.dDebtSecondaryLinkText}>close</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                )}
              </>
            );
          })()}
        </Reanimated.View>
        <InModalToast ref={modalToastRef} />
      </Modal>)}

      {/* ── Record Payment Modal — bottom-sheet w/ live progress preview + quick-fill chips ─── */}
      {paymentModalVisible && (<Modal
        visible
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={dPayCloseSheet}
      >
        {/* Animated backdrop */}
        <Reanimated.View style={[styles.dDebtBackdrop, dPayBackdropAnimatedStyle]}>
          <Pressable style={{ flex: 1 }} onPress={dPayCloseSheet} />
        </Reanimated.View>

        {/* Sheet */}
        <Reanimated.View style={[styles.dDebtSheetContainer, dPaySheetAnimatedStyle]}>
          {(() => {
            const payDebt = debts.find((d) => d.id === paymentDebtId);
            if (!payDebt) return null;
            const groupForPay = groupPaymentId ? groupedDebts.find((g) => g.contactId === groupPaymentId) : null;
            const remaining = groupForPay
              ? (() => {
                  const uns = groupForPay.debts.filter((d) => d.status !== 'settled');
                  const iOweRem = uns.filter(d => d.type === 'i_owe').reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
                  const theyOweRem = uns.filter(d => d.type === 'they_owe').reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
                  return Math.abs(iOweRem - theyOweRem);
                })()
              : Math.max(0, payDebt.totalAmount - payDebt.paidAmount);
            const typeConfig = getTypeConfig(payDebt.type);

            // ── PAY DETAIL SUB-VIEW (edit existing payment) ──
            if (inPayDetail && payDetailPayment) {
              const stillExists = payDetailDebtId
                ? useDebtStore.getState().debts.find((d) => d.id === payDetailDebtId)?.payments.some((p) => p.id === payDetailPayment.id)
                : false;
              if (!stillExists) {
                setTimeout(() => handleClosePayDetail(), 0);
                return null;
              }
              const wallet = payDetailPayment.walletId ? wallets.find((w) => w.id === payDetailPayment.walletId) : null;
              const parsedDate = new Date(payDetailPayment.date);
              const dateStr = isNaN(parsedDate.getTime()) ? '—' : format(parsedDate, 'dd MMM yyyy, HH:mm');

              return (
                <>
                  {/* Drag zone — handle + back/title */}
                  <GestureDetector gesture={dPaySheetGesture}>
                    <View collapsable={false}>
                      <View style={styles.dDebtSheetTopRow}>
                        <View style={styles.dDebtSheetHandle} />
                      </View>
                      <View style={styles.dDebtTitleZone}>
                        <Text style={styles.dDebtTitle} numberOfLines={1} ellipsizeMode="tail">
                          edit <Text style={styles.dDebtTitleAccent}>payment</Text>
                        </Text>
                        <Text style={styles.dDebtSubtitle}>
                          {currency} {payDetailPayment.amount.toFixed(2)} · {dateStr.toLowerCase()}
                        </Text>
                      </View>
                    </View>
                  </GestureDetector>

                  <KeyboardAwareScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    bottomOffset={32}
                    nestedScrollEnabled
                    contentContainerStyle={styles.dDebtScrollContent}
                    keyboardDismissMode="on-drag"
                  >
                    {/* Meta rows */}
                    <View style={styles.detailMetaSection}>
                      {wallet && (
                        <View style={styles.detailMetaRow}>
                          <Text style={styles.detailMetaLabel}>wallet</Text>
                          <Text style={styles.detailMetaValue}>{wallet.name.toLowerCase()}</Text>
                        </View>
                      )}
                      {payDetailPayment.linkedTransactionId && (
                        <View style={styles.detailMetaRow}>
                          <Text style={styles.detailMetaLabel}>linked</Text>
                          <Text style={styles.detailMetaValue}>transaction · synced on save</Text>
                        </View>
                      )}
                      {payDetailPayment.tipAmount ? (
                        <View style={styles.detailMetaRow}>
                          <Text style={styles.detailMetaLabel}>tip</Text>
                          <Text style={styles.detailMetaValue}>
                            {currency} {payDetailPayment.tipAmount.toFixed(2)}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Amount card — hero style */}
                    {(() => {
                      const epRaw = editPayAmount;
                      const [epIntRaw, epFracRaw = null] = epRaw.includes('.') ? epRaw.split('.') : [epRaw, null];
                      const epIntFmt = epIntRaw ? Number(epIntRaw).toLocaleString('en-US') : '';
                      const epDisplay = epFracRaw === null ? epIntFmt : `${epIntFmt}.${epFracRaw}`;
                      const handleEpChange = (raw: string) => {
                        const stripped = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
                        const fd = stripped.indexOf('.');
                        let normalized = stripped;
                        if (fd !== -1) {
                          normalized = stripped.slice(0, fd + 1) + stripped.slice(fd + 1).replace(/\./g, '');
                          const [ip, fp = ''] = normalized.split('.');
                          normalized = ip + '.' + fp.slice(0, 2);
                        }
                        setEditPayAmount(normalized);
                      };
                      return (
                        <View style={styles.dDebtFieldHeroCard}>
                          <Text style={styles.dDebtFieldCardLabel}>
                            amount <Text style={styles.dDebtFieldRequiredStar}>*</Text>
                          </Text>
                          <View style={styles.dDebtFieldHeroAmountRow}>
                            <Text style={[styles.dDebtFieldHeroCurrency, { color: typeConfig.color }]} numberOfLines={1}>
                              {currency}
                            </Text>
                            <TextInput
                              style={[styles.dDebtFieldHeroAmountInput, { color: typeConfig.color }]}
                              value={epDisplay}
                              onChangeText={handleEpChange}
                              keyboardType="decimal-pad"
                              returnKeyType="done"
                              onSubmitEditing={Keyboard.dismiss}
                              selectTextOnFocus
                              placeholder="0.00"
                              placeholderTextColor={withAlpha(C.textPrimary, 0.12)}
                              keyboardAppearance={isDark ? 'dark' : 'light'}
                              selectionColor={C.accent}
                            />
                          </View>
                        </View>
                      );
                    })()}


                    {/* Note card */}
                    <View style={styles.dDebtFieldCard}>
                      <Text style={styles.dDebtFieldCardLabel}>
                        note <Text style={styles.dDebtFieldOptional}>optional</Text>
                      </Text>
                      <TextInput
                        style={[styles.dDebtFieldCardInput, styles.dDebtFieldMultiline]}
                        value={editPayNote}
                        onChangeText={setEditPayNote}
                        placeholder={t.debts.addANote}
                        placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                        multiline
                        textAlignVertical="top"
                        returnKeyType="default"
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                        onFocus={() => setMultilineFocused(true)}
                        onBlur={() => setMultilineFocused(false)}
                      />
                    </View>

                    {/* Edit history */}
                    {payDetailPayment.editLog && payDetailPayment.editLog.length > 0 && (
                      <View style={styles.editHistorySection}>
                        <View style={styles.editHistoryHeader}>
                          <Feather name="clock" size={13} color={C.bronze} />
                          <Text style={styles.editHistoryTitle}>{t.debts.editHistory}</Text>
                          <Text style={styles.editHistoryCount}>{payDetailPayment.editLog.length} {t.debts.changes}</Text>
                        </View>
                        {[...payDetailPayment.editLog].reverse().map((entry, idx) => {
                          const entryDate = new Date(entry.editedAt);
                          const entryDateStr = isNaN(entryDate.getTime()) ? '—' : format(entryDate, 'dd MMM yyyy, HH:mm');
                          return (
                            <View key={idx} style={styles.editHistoryRow}>
                              <View style={styles.editHistoryDot} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.editHistoryMeta}>{entryDateStr}</Text>
                                <Text style={styles.editHistoryDetail}>
                                  {t.debts.wasAmount} {currency} {entry.previousAmount.toFixed(2)}
                                  {entry.previousNote ? ` · "${entry.previousNote}"` : ''}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Delete payment text-link */}
                    <Pressable
                      style={styles.dDebtDeleteLink}
                      onPress={() => {
                        if (!payDetailDebtId || !payDetailPayment) return;
                        const snapDebtId = payDetailDebtId;
                        const snapPaymentId = payDetailPayment.id;
                        Alert.alert(t.debts.removePayment, t.debts.removePaymentConfirm, [
                          { text: t.common.cancel, style: 'cancel' },
                          {
                            text: t.debts.remove,
                            style: 'destructive',
                            onPress: () => {
                              handleClosePayDetail();
                              const freshDebt = useDebtStore.getState().debts.find((d) => d.id === snapDebtId);
                              const freshPayment = freshDebt?.payments.find((p) => p.id === snapPaymentId);
                              if (!freshPayment || !freshDebt) return;

                              const txId = freshPayment.linkedTransactionId;
                              const allDebts = useDebtStore.getState().debts;
                              const siblings = txId ? allDebts.filter(d =>
                                d.payments.some(p => p.linkedTransactionId === txId) && !(d.id === snapDebtId && d.payments.length === 1 && d.payments[0].id === snapPaymentId)
                              ).flatMap(d => d.payments.filter(p => p.linkedTransactionId === txId && !(d.id === snapDebtId && p.id === snapPaymentId)).map(p => ({ debtId: d.id, paymentId: p.id, debt: d, payment: p }))) : [];

                              if (siblings.length > 0) {
                                handleDeletePayment(snapDebtId, snapPaymentId);
                                return;
                              }

                              if (txId) {
                                if (freshDebt.mode === 'personal') deleteTransaction(txId);
                                else deleteBusinessTransaction(txId);
                              }
                              if (!(freshDebt.mode === 'personal' && txId) && freshPayment.walletId) {
                                if (freshDebt.type === 'they_owe') deductFromWallet(freshPayment.walletId, freshPayment.amount);
                                else addToWallet(freshPayment.walletId, freshPayment.amount);
                              }
                              if (freshDebt.splitId && freshDebt.status === 'settled') {
                                const newPaid = freshDebt.payments.filter((p) => p.id !== snapPaymentId).reduce((s, p) => s + p.amount, 0);
                                if (newPaid < freshDebt.totalAmount) unmarkSplitParticipantPaid(freshDebt.splitId, freshDebt.contact.id);
                              }
                              deletePayment(snapDebtId, snapPaymentId);
                              showToast(t.debts.paymentRemoved, 'success');
                            },
                          },
                        ]);
                      }}
                      hitSlop={{ top: 14, bottom: 14, left: 18, right: 18 }}
                      accessibilityRole="button"
                      accessibilityLabel="delete payment"
                    >
                      {({ pressed }) => (
                        <View style={[styles.dDebtDeleteLinkInner, pressed && { opacity: 0.55 }]}>
                          <Feather name="trash-2" size={13} color={C.textMuted} />
                          <Text style={styles.dDebtDeleteLinkText}>delete payment</Text>
                        </View>
                      )}
                    </Pressable>
                  </KeyboardAwareScrollView>

                  {/* Anchored save zone */}
                  <View style={[styles.dDebtSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
                    <Reanimated.View style={dPaySaveAnimatedStyle}>
                      <Pressable
                        style={styles.dDebtSaveBtn}
                        onPress={handleSavePayDetail}
                        onPressIn={() => { dPaySaveScale.value = withTiming(0.97, { duration: 120 }); }}
                        onPressOut={() => { dPaySaveScale.value = withSpring(1, { damping: 18, stiffness: 240 }); }}
                        accessibilityRole="button"
                        accessibilityLabel="save changes"
                      >
                        {payDetailSaving ? (
                          <ActivityIndicator size="small" color={C.surface} />
                        ) : (
                          <View style={styles.dDebtSaveBtnInner}>
                            <Feather name="check" size={16} color={C.surface} />
                            <Text style={styles.dDebtSaveBtnText}>save changes</Text>
                          </View>
                        )}
                      </Pressable>
                    </Reanimated.View>
                    <Pressable
                      style={styles.dDebtSecondaryLink}
                      onPress={handleClosePayDetail}
                      hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                      accessibilityRole="button"
                      accessibilityLabel="back"
                    >
                      {({ pressed }) => (
                        <View style={[styles.dDebtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                          <Feather name="chevron-left" size={12} color={C.textMuted} />
                          <Text style={styles.dDebtSecondaryLinkText}>back</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                </>
              );
            }

            // ── MAIN VIEW: record new payment + history ──
            // "Different" feature: live progress preview + quick-fill chips
            const enteredAmount = parseFloat(paymentAmount) || 0;
            const grpTotal = groupForPay ? remaining : payDebt.totalAmount;
            const grpPaid = groupForPay ? 0 : payDebt.paidAmount;
            const projectedPaid = Math.min(grpTotal, grpPaid + enteredAmount);
            const currentPct = grpTotal > 0 ? (grpPaid / grpTotal) * 100 : 0;
            const projectedPct = grpTotal > 0 ? (projectedPaid / grpTotal) * 100 : 0;

            return (
              <>
                {/* Drag zone — handle + title */}
                <GestureDetector gesture={dPaySheetGesture}>
                  <View collapsable={false}>
                    <View style={styles.dDebtSheetTopRow}>
                      <View style={styles.dDebtSheetHandle} />
                    </View>
                    <View style={styles.dDebtTitleZone}>
                      <Text style={styles.dDebtTitle} numberOfLines={1} ellipsizeMode="tail">
                        {paymentViewOnly ? 'payment ' : 'record '}
                        <Text style={styles.dDebtTitleAccent}>
                          {paymentViewOnly ? 'history' : 'payment'}
                        </Text>
                      </Text>
                      <Text style={styles.dDebtSubtitle}>
                        {groupPaymentId
                          ? `consolidated · ${payDebt.contact.name.toLowerCase()}`
                          : payDebt.type === 'they_owe'
                            ? `${payDebt.contact.name.toLowerCase()} is paying you back`
                            : `paying ${payDebt.contact.name.toLowerCase()} back`}
                      </Text>
                    </View>
                  </View>
                </GestureDetector>

                <KeyboardAwareScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  contentContainerStyle={styles.dDebtScrollContent}
                  bottomOffset={32}
                  keyboardDismissMode="on-drag"
                >
                  {/* Hero context card — debt status snapshot + LIVE PROGRESS PREVIEW */}
                  <View style={styles.dPayContextCard}>
                    {groupPaymentId ? (() => {
                      const grp = groupedDebts.find((g) => g.contactId === groupPaymentId);
                      if (!grp) return null;
                      const unsettled = grp.debts.filter((d) => d.status !== 'settled');
                      const iOweRem = unsettled.filter(d => d.type === 'i_owe').reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
                      const theyOweRem = unsettled.filter(d => d.type === 'they_owe').reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0);
                      const grpIsMixed = iOweRem > 0 && theyOweRem > 0;
                      const netRem = Math.abs(iOweRem - theyOweRem);
                      const netDir = theyOweRem >= iOweRem ? 'they_owe' : 'i_owe';
                      return (
                        <>
                          <View style={styles.dPayContextRow}>
                            <View style={[styles.dPayContextAvatar, { backgroundColor: withAlpha(typeConfig.color, 0.12) }]}>
                              <Text style={[styles.dPayContextAvatarText, { color: typeConfig.color }]}>
                                {grp.contactName.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.dPayContextName}>{grp.contactName}</Text>
                              <Text style={styles.dPayContextDesc}>{unsettled.length} debts</Text>
                            </View>
                          </View>
                          {grpIsMixed ? (
                            <View style={styles.dPayContextAmounts}>
                              <View style={styles.dPayContextAmountItem}>
                                <Text style={styles.dPayContextAmountLabel}>i owe</Text>
                                <Text style={styles.dPayContextAmountValue}>{currency} {iOweRem.toFixed(2)}</Text>
                              </View>
                              <View style={styles.dPayContextDivider} />
                              <View style={styles.dPayContextAmountItem}>
                                <Text style={styles.dPayContextAmountLabel}>they owe</Text>
                                <Text style={styles.dPayContextAmountValue}>{currency} {theyOweRem.toFixed(2)}</Text>
                              </View>
                              <View style={styles.dPayContextDivider} />
                              <View style={styles.dPayContextAmountItem}>
                                <Text style={styles.dPayContextAmountLabel}>net</Text>
                                <Text style={[styles.dPayContextAmountValue, { color: typeConfig.color, fontWeight: '700' as const }]}>
                                  {currency} {netRem.toFixed(2)}
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <View style={styles.dPayContextAmounts}>
                              <View style={styles.dPayContextAmountItem}>
                                <Text style={styles.dPayContextAmountLabel}>total</Text>
                                <Text style={styles.dPayContextAmountValue}>{currency} {(iOweRem + theyOweRem).toFixed(2)}</Text>
                              </View>
                              <View style={styles.dPayContextDivider} />
                              <View style={styles.dPayContextAmountItem}>
                                <Text style={styles.dPayContextAmountLabel}>paid</Text>
                                <Text style={[styles.dPayContextAmountValue, { color: settledColor }]}>
                                  {currency} {unsettled.reduce((s, d) => s + d.paidAmount, 0).toFixed(2)}
                                </Text>
                              </View>
                              <View style={styles.dPayContextDivider} />
                              <View style={styles.dPayContextAmountItem}>
                                <Text style={styles.dPayContextAmountLabel}>left</Text>
                                <Text style={[styles.dPayContextAmountValue, { color: typeConfig.color, fontWeight: '700' as const }]}>
                                  {currency} {(iOweRem + theyOweRem).toFixed(2)}
                                </Text>
                              </View>
                            </View>
                          )}
                          {unsettled.map((d) => {
                            const rem = Math.max(0, d.totalAmount - d.paidAmount);
                            return (
                              <View key={d.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: SPACING.xs }}>
                                <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, flex: 1 }} numberOfLines={1}>
                                  {grpIsMixed ? (d.type === 'i_owe' ? '+ ' : '− ') : ''}{(d.description || 'untitled').toLowerCase()}
                                </Text>
                                <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textPrimary, fontVariant: ['tabular-nums'] as any }}>
                                  {currency} {rem.toFixed(2)}
                                </Text>
                              </View>
                            );
                          })}
                        </>
                      );
                    })() : (
                      <>
                        <View style={styles.dPayContextRow}>
                          <View style={[styles.dPayContextAvatar, { backgroundColor: withAlpha(typeConfig.color, 0.12) }]}>
                            <Text style={[styles.dPayContextAvatarText, { color: typeConfig.color }]}>
                              {payDebt.contact.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.dPayContextName}>{payDebt.contact.name}</Text>
                            {payDebt.description ? (
                              <Text style={styles.dPayContextDesc} numberOfLines={1}>{payDebt.description}</Text>
                            ) : null}
                          </View>
                        </View>

                        <View style={styles.dPayContextAmounts}>
                          <View style={styles.dPayContextAmountItem}>
                            <Text style={styles.dPayContextAmountLabel}>total</Text>
                            <Text style={styles.dPayContextAmountValue}>{currency} {payDebt.totalAmount.toFixed(2)}</Text>
                          </View>
                          <View style={styles.dPayContextDivider} />
                          <View style={styles.dPayContextAmountItem}>
                            <Text style={styles.dPayContextAmountLabel}>paid</Text>
                            <Text style={[styles.dPayContextAmountValue, { color: settledColor }]}>
                              {currency} {payDebt.paidAmount.toFixed(2)}
                            </Text>
                          </View>
                          <View style={styles.dPayContextDivider} />
                          <View style={styles.dPayContextAmountItem}>
                            <Text style={styles.dPayContextAmountLabel}>left</Text>
                            <Text style={[styles.dPayContextAmountValue, { color: typeConfig.color, fontWeight: '700' as const }]}>
                              {currency} {remaining.toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      </>
                    )}

                    {/* Live progress bar with ghost projected segment */}
                    <View style={styles.dPayProgressTrack}>
                      {/* Solid current paid segment */}
                      <View
                        style={[
                          styles.dPayProgressFill,
                          { width: `${currentPct}%`, backgroundColor: settledColor },
                        ]}
                      />
                      {/* Ghost projected segment — shows where paid will land after this payment */}
                      {enteredAmount > 0 && projectedPct > currentPct && (
                        <View
                          style={[
                            styles.dPayProgressGhost,
                            {
                              left: `${currentPct}%`,
                              width: `${Math.min(100 - currentPct, projectedPct - currentPct)}%`,
                              backgroundColor: withAlpha(settledColor, 0.4),
                            },
                          ]}
                        />
                      )}
                    </View>
                    <View style={styles.dPayProgressLabelRow}>
                      <Text style={styles.dPayProgressLabel}>
                        {Math.round(currentPct)}% paid
                      </Text>
                      {enteredAmount > 0 && projectedPct > currentPct && (
                        <Text style={[styles.dPayProgressLabel, { color: settledColor, fontWeight: TYPOGRAPHY.weight.semibold }]}>
                          → {Math.round(projectedPct)}% after this
                        </Text>
                      )}
                    </View>
                  </View>

                  {remaining <= 0 && (
                    <View style={styles.settledNotice}>
                      <Feather name="check-circle" size={15} color={C.positive} />
                      <Text style={styles.settledNoticeText}>{t.debts.fullySettledNotice}</Text>
                    </View>
                  )}

                  {!paymentViewOnly && remaining > 0 && (() => {
                    const payRaw = paymentAmount;
                    const [payIntRaw, payFracRaw = null] = payRaw.includes('.') ? payRaw.split('.') : [payRaw, null];
                    const payIntFmt = payIntRaw ? Number(payIntRaw).toLocaleString('en-US') : '';
                    const payDisplay = payFracRaw === null ? payIntFmt : `${payIntFmt}.${payFracRaw}`;
                    const handlePayAmountChange = (raw: string) => {
                      const stripped = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
                      const fd = stripped.indexOf('.');
                      let normalized = stripped;
                      if (fd !== -1) {
                        normalized = stripped.slice(0, fd + 1) + stripped.slice(fd + 1).replace(/\./g, '');
                        const [ip, fp = ''] = normalized.split('.');
                        normalized = ip + '.' + fp.slice(0, 2);
                      }
                      setPaymentAmount(normalized);
                    };
                    return (
                    <>
                      {/* Amount card — hero style */}
                      <View style={styles.dDebtFieldHeroCard}>
                        <Text style={styles.dDebtFieldCardLabel}>
                          amount <Text style={styles.dDebtFieldRequiredStar}>*</Text>
                        </Text>
                        <View style={styles.dDebtFieldHeroAmountRow}>
                          <Text style={[styles.dDebtFieldHeroCurrency, { color: typeConfig.color }]} numberOfLines={1}>
                            {currency}
                          </Text>
                          <TextInput
                            style={[styles.dDebtFieldHeroAmountInput, { color: typeConfig.color }]}
                            value={payDisplay}
                            onChangeText={handlePayAmountChange}
                            placeholder="0.00"
                            placeholderTextColor={withAlpha(C.textPrimary, 0.12)}
                            keyboardType="decimal-pad"
                            returnKeyType="done"
                            onSubmitEditing={Keyboard.dismiss}
                            selectTextOnFocus
                            keyboardAppearance={isDark ? 'dark' : 'light'}
                            selectionColor={C.accent}
                          />
                        </View>
                      </View>

                      {/* Quick-fill chips — ¼, half, full of remaining */}
                      <View style={styles.dPayQuickChipRow}>
                        {[
                          { label: '¼', frac: 0.25 },
                          { label: 'half', frac: 0.5 },
                          { label: 'full', frac: 1.0 },
                        ].map((chip) => {
                          const fillAmount = +(remaining * chip.frac).toFixed(2);
                          const isActive = Math.abs(parseFloat(paymentAmount || '0') - fillAmount) < 0.01;
                          return (
                            <TouchableOpacity
                              key={chip.label}
                              style={[
                                styles.dPayQuickChip,
                                isActive && { backgroundColor: withAlpha(settledColor, 0.15), borderColor: settledColor },
                              ]}
                              onPress={() => setPaymentAmount(fillAmount.toFixed(2))}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel={`fill ${chip.label} of remaining`}
                            >
                              <Text style={[styles.dPayQuickChipText, isActive && { color: settledColor }]}>
                                {chip.label}
                              </Text>
                              <Text style={[styles.dPayQuickChipAmount, isActive && { color: settledColor }]}>
                                {currency} {fillAmount.toFixed(2)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>


                      {/* Wallet picker */}
                      {mode === 'personal' && wallets.length > 0 && (
                        <View style={{ marginBottom: SPACING.sm + 2 }}>
                          <WalletPicker
                            wallets={wallets}
                            selectedId={paymentWalletId}
                            onSelect={setPaymentWalletId}
                            label={t.debts.wallet}
                          />
                        </View>
                      )}

                      {/* Category picker */}
                      <View style={{ marginBottom: SPACING.sm + 2 }}>
                        <CategoryPicker
                          categories={payDebt.type === 'they_owe' ? incomeCategories : expenseCategories}
                          selectedId={paymentCategory}
                          onSelect={setPaymentCategory}
                          label={t.debts.category}
                          layout="dropdown"
                          onNavigateToSettings={() => {
                            const payDebt2 = debts.find((d) => d.id === paymentDebtId);
                            categoryManagerCallerRef.current = 'payment';
                            const type2 = payDebt2?.type === 'they_owe' ? 'income' : 'expense';
                            setPaymentModalVisible(false);
                            setTimeout(() => setCategoryManagerType(type2), 50);
                          }}
                        />
                      </View>

                      {/* Note card */}
                      <View style={styles.dDebtFieldCard}>
                        <Text style={styles.dDebtFieldCardLabel}>
                          note <Text style={styles.dDebtFieldOptional}>optional</Text>
                        </Text>
                        <TextInput
                          style={[styles.dDebtFieldCardInput, styles.dDebtFieldMultiline]}
                          value={paymentNote}
                          onChangeText={setPaymentNote}
                          placeholder={t.debts.addANote}
                          placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                          multiline
                          textAlignVertical="top"
                          returnKeyType="default"
                          onFocus={() => setMultilineFocused(true)}
                          onBlur={() => setMultilineFocused(false)}
                          keyboardAppearance={isDark ? 'dark' : 'light'}
                          selectionColor={C.accent}
                        />
                      </View>
                    </>
                    );
                  })()}

                  {/* Payment history */}
                  {(() => {
                    const allPayments = groupForPay
                      ? groupForPay.debts.flatMap((d) => d.payments.map((p) => ({ ...p, _debtId: d.id, _debtDesc: d.description, _debtType: d.type })))
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      : payDebt.payments.slice().reverse().map((p) => ({ ...p, _debtId: payDebt.id, _debtDesc: payDebt.description, _debtType: payDebt.type }));
                    if (allPayments.length === 0) return null;

                    // Group by linkedTransactionId to detect consolidated batches
                    const batches: { txId: string | null; payments: typeof allPayments; total: number }[] = [];
                    const seen = new Set<string>();
                    for (const p of allPayments) {
                      if (seen.has(p.id)) continue;
                      const txId = p.linkedTransactionId || null;
                      if (txId) {
                        const siblings = allPayments.filter((s) => s.linkedTransactionId === txId);
                        if (siblings.length > 1) {
                          siblings.forEach((s) => seen.add(s.id));
                          const hasIO = siblings.some(s => s._debtType === 'i_owe');
                          const hasTO = siblings.some(s => s._debtType === 'they_owe');
                          const batchMixed = hasIO && hasTO;
                          const bTotal = batchMixed
                            ? Math.abs(
                                siblings.filter(s => s._debtType === 'they_owe').reduce((sm, x) => sm + x.amount, 0) -
                                siblings.filter(s => s._debtType === 'i_owe').reduce((sm, x) => sm + x.amount, 0)
                              )
                            : siblings.reduce((sm, x) => sm + x.amount, 0);
                          batches.push({ txId, payments: siblings, total: bTotal });
                          continue;
                        }
                      }
                      seen.add(p.id);
                      batches.push({ txId, payments: [p], total: p.amount });
                    }

                    // Collapse individual netted payments into one summary row
                    const nettedIdx: number[] = [];
                    batches.forEach((b, i) => {
                      if (b.payments.length === 1 && b.payments[0].note === 'netted') nettedIdx.push(i);
                    });
                    if (nettedIdx.length > 1) {
                      const nettedPayments = nettedIdx.flatMap(i => batches[i].payments);
                      const iOwePart = nettedPayments.filter(p => p._debtType === 'i_owe').reduce((s, p) => s + p.amount, 0);
                      const theyOwePart = nettedPayments.filter(p => p._debtType === 'they_owe').reduce((s, p) => s + p.amount, 0);
                      const offsetAmt = Math.min(iOwePart, theyOwePart) || Math.max(iOwePart, theyOwePart);
                      for (let i = nettedIdx.length - 1; i >= 0; i--) batches.splice(nettedIdx[i], 1);
                      batches.push({ txId: '__netting__', payments: nettedPayments, total: offsetAmt });
                    }

                    return (
                      <View style={styles.payHistorySection}>
                        <Text style={styles.payHistoryTitle}>{t.debts.paymentHistory}</Text>
                        {batches.map((batch, bIdx) => {
                          const isConsolidated = batch.payments.length > 1;
                          const bHasIO = isConsolidated && batch.payments.some(p => p._debtType === 'i_owe');
                          const bHasTO = isConsolidated && batch.payments.some(p => p._debtType === 'they_owe');
                          const bIsMixed = bHasIO && bHasTO;

                          if (bIsMixed) {
                            const firstPay = batch.payments[0];
                            return (
                              <View key={batch.txId || bIdx}>
                                <View style={styles.payHistoryItem}>
                                  <View style={styles.payHistoryIcon}>
                                    <Feather name="check-circle" size={16} color={C.positive} />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <View style={styles.payHistoryTopRow}>
                                      <Text style={styles.payHistoryAmount}>{currency} {batch.total.toFixed(2)}</Text>
                                      <Text style={styles.payHistoryDate}>{(() => { const d = new Date(firstPay.date); return isValid(d) ? format(d, 'MMM dd, HH:mm') : '—'; })()}</Text>
                                    </View>
                                    <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted }}>settled up · {batch.payments.length} debts netted</Text>
                                  </View>
                                </View>
                              </View>
                            );
                          }

                          if (batch.txId === '__netting__') {
                            const descs = [...new Set(batch.payments.map(p => p._debtDesc?.toLowerCase()).filter(Boolean))];
                            const firstNP = batch.payments[0];
                            return (
                              <View key="netting-summary" style={styles.payHistoryItem}>
                                <View style={styles.payHistoryIcon}>
                                  <Feather name="repeat" size={16} color={C.bronze} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <View style={styles.payHistoryTopRow}>
                                    <Text style={styles.payHistoryAmount}>{currency} {batch.total.toFixed(2)}</Text>
                                    <Text style={styles.payHistoryDate}>{(() => { const d = new Date(firstNP.date); return isValid(d) ? format(d, 'MMM dd, HH:mm') : '—'; })()}</Text>
                                  </View>
                                  <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.bronze }}>offset · no cash exchanged</Text>
                                  {descs.length > 0 && (
                                    <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 1 }}>{descs.join(' ↔ ')}</Text>
                                  )}
                                </View>
                              </View>
                            );
                          }

                          return (
                            <View key={batch.txId || bIdx}>
                              {batch.payments.map((payment) => (
                                <TouchableOpacity
                                  key={payment.id}
                                  style={[styles.payHistoryItem, isConsolidated && { paddingLeft: SPACING.lg }]}
                                  onPress={() => handleOpenPayDetail(payment._debtId, payment)}
                                  activeOpacity={0.7}
                                >
                                  <View style={styles.payHistoryIcon}>
                                    <Feather name="check-circle" size={16} color={C.positive} />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <View style={styles.payHistoryTopRow}>
                                      <Text style={styles.payHistoryAmount}>{currency} {payment.amount.toFixed(2)}</Text>
                                      <Text style={styles.payHistoryDate}>{(() => { const d = new Date(payment.date); return isValid(d) ? format(d, 'MMM dd, HH:mm') : '—'; })()}</Text>
                                    </View>
                                    {groupForPay && payment._debtDesc ? (
                                      <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted }}>{payment._debtDesc.toLowerCase()}</Text>
                                    ) : null}
                                    {payment.tipAmount ? (
                                      <Text style={styles.payHistoryTip}>{t.debts.inclTip} {currency} {payment.tipAmount.toFixed(2)}</Text>
                                    ) : null}
                                    {payment.note && !isConsolidated ? <Text style={styles.payHistoryNote}>{payment.note}</Text> : null}
                                    {payment.editLog && payment.editLog.length > 0 && (
                                      <View style={styles.payEditedBadge}>
                                        <Feather name="edit-2" size={10} color={C.bronze} />
                                        <Text style={styles.payEditedBadgeText}>
                                          edited {(() => { const d = new Date(payment.editLog[payment.editLog.length - 1].editedAt); return isValid(d) ? format(d, 'MMM d, HH:mm') : '—'; })()}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                  {!isConsolidated && (
                                    <View style={styles.payHistoryEditHint}>
                                      <Feather name="chevron-right" size={14} color={C.textMuted} />
                                    </View>
                                  )}
                                </TouchableOpacity>
                              ))}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}
                </KeyboardAwareScrollView>

                {/* Anchored save zone — only show record button when not view-only and not settled */}
                <View style={[styles.dDebtSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
                  {!paymentViewOnly && remaining > 0 ? (
                    (() => {
                      const canRecord = enteredAmount > 0;
                      const onPressRecord = () => {
                        if (dPayIsSaving) return;
                        if (!canRecord) {
                          lightTap();
                          dPaySaveShake.value = withSequence(
                            withTiming(-3, { duration: 60, easing: Easing.linear }),
                            withTiming(3, { duration: 60, easing: Easing.linear }),
                            withTiming(-2, { duration: 60, easing: Easing.linear }),
                            withTiming(2, { duration: 50, easing: Easing.linear }),
                            withTiming(0, { duration: 50, easing: Easing.linear }),
                          );
                          return;
                        }
                        setDPayIsSaving(true);
                        handleRecordPayment();
                        setTimeout(() => setDPayIsSaving(false), 200);
                      };
                      return (
                        <Reanimated.View style={dPaySaveAnimatedStyle}>
                          <Pressable
                            style={[
                              styles.dDebtSaveBtn,
                              (!canRecord || dPayIsSaving) && styles.dDebtSaveBtnDisabled,
                            ]}
                            onPress={onPressRecord}
                            onPressIn={() => { dPaySaveScale.value = withTiming(0.97, { duration: 120 }); }}
                            onPressOut={() => { dPaySaveScale.value = withSpring(1, { damping: 18, stiffness: 240 }); }}
                            accessibilityRole="button"
                            accessibilityLabel="record payment"
                            accessibilityState={{ disabled: !canRecord || dPayIsSaving, busy: dPayIsSaving }}
                          >
                            {dPayIsSaving ? (
                              <ActivityIndicator size="small" color={C.surface} />
                            ) : (
                              <View style={styles.dDebtSaveBtnInner}>
                                <Feather name="check" size={16} color={canRecord ? C.surface : C.textMuted} />
                                <Text style={[
                                  styles.dDebtSaveBtnText,
                                  !canRecord && styles.dDebtSaveBtnTextDisabled,
                                ]}>
                                  record payment
                                </Text>
                              </View>
                            )}
                          </Pressable>
                        </Reanimated.View>
                      );
                    })()
                  ) : null}

                  {paymentViewOnly && groupForPay && (() => {
                    const allP = groupForPay.debts.flatMap((d) => d.payments.map((p) => ({ ...p, _debtId: d.id, _debtType: d.type })));
                    const txIds = new Set(allP.filter((p) => p.linkedTransactionId).map((p) => p.linkedTransactionId!));
                    const consolidated = [...txIds].filter((txId) => allP.filter((p) => p.linkedTransactionId === txId).length > 1);
                    if (consolidated.length === 0) return null;
                    const lastTxId = consolidated[0];
                    const batchPayments = allP.filter((p) => p.linkedTransactionId === lastTxId);
                    const undoHasIO = batchPayments.some(p => p._debtType === 'i_owe');
                    const undoHasTO = batchPayments.some(p => p._debtType === 'they_owe');
                    const undoMixed = undoHasIO && undoHasTO;
                    const batchTotal = undoMixed
                      ? Math.abs(
                          batchPayments.filter(p => p._debtType === 'they_owe').reduce((s, p) => s + p.amount, 0) -
                          batchPayments.filter(p => p._debtType === 'i_owe').reduce((s, p) => s + p.amount, 0)
                        )
                      : batchPayments.reduce((s, p) => s + p.amount, 0);
                    return (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleDeletePayment(batchPayments[0]._debtId, batchPayments[0].id)}
                        style={[styles.debtPrimaryAction, { backgroundColor: withAlpha(C.textPrimary, isDark ? 0.08 : 0.04), borderColor: withAlpha(C.textPrimary, 0.1) }]}
                      >
                        <Feather name="rotate-ccw" size={15} color={C.textSecondary} />
                        <Text style={[styles.debtPrimaryActionText, { color: C.textSecondary }]}>undo consolidated · {currency} {batchTotal.toFixed(2)}</Text>
                      </TouchableOpacity>
                    );
                  })()}
                  <Pressable
                    style={styles.dDebtSecondaryLink}
                    onPress={dPayCloseSheet}
                    hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                    accessibilityRole="button"
                    accessibilityLabel="close"
                  >
                    {({ pressed }) => (
                      <View style={[styles.dDebtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                        <Feather name="x" size={12} color={C.textMuted} />
                        <Text style={styles.dDebtSecondaryLinkText}>close</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </>
            );
          })()}
        </Reanimated.View>
        {keyboardVisible && multilineFocused && (
          <TouchableOpacity
            style={[styles.doneFab, { bottom: keyboardHeight + 16 }]}
            onPress={() => Keyboard.dismiss()}
            activeOpacity={0.8}
          >
            <Feather name="check" size={20} color={C.onAccent} />
          </TouchableOpacity>
        )}
        {/* ── Tip Confirmation Overlay (inside payment modal) ── */}
        {tipConfirmVisible && tipConfirmData && (
          <>
            <Reanimated.View
              entering={FadeIn.duration(200)}
              style={styles.tipModalOverlay}
            >
              <Pressable
                style={{ flex: 1 }}
                onPress={() => { setTipConfirmVisible(false); setTipConfirmData(null); }}
              />
            </Reanimated.View>
            <Reanimated.View
              entering={FadeIn.duration(280).delay(60)}
              style={styles.tipModalCenter}
              pointerEvents="box-none"
            >
              <View
                style={styles.tipModalCard}
                onStartShouldSetResponder={() => true}
              >
                {/* Icon badge */}
                <View style={styles.tipModalIconWrap}>
                  <Feather name="gift" size={22} color={C.bronze} />
                </View>

                <Text style={styles.tipModalTitle}>includes extra</Text>
                <Text style={styles.tipModalDesc}>
                  {`${currency} ${tipConfirmData.tip.toFixed(2)} more than the remaining balance`}
                </Text>

                {/* Amount breakdown — two stacked rows */}
                <View style={styles.tipModalBreakdown}>
                  <View style={styles.tipModalBreakdownRow}>
                    <Text style={styles.tipModalBreakdownLabel}>remaining balance</Text>
                    <Text style={styles.tipModalBreakdownValue}>{currency} {(tipConfirmData.amount - tipConfirmData.tip).toFixed(2)}</Text>
                  </View>
                  <View style={[styles.tipModalBreakdownRow, styles.tipModalBreakdownRowLast]}>
                    <Text style={styles.tipModalBreakdownLabel}>recording</Text>
                    <Text style={[styles.tipModalBreakdownValue, { fontWeight: '700' as any }]}>{currency} {tipConfirmData.amount.toFixed(2)}</Text>
                  </View>
                  <View style={styles.tipModalExtraRow}>
                    <View style={styles.tipModalExtraPill}>
                      <Feather name="plus" size={11} color={C.bronze} />
                      <Text style={styles.tipModalExtraText}>{currency} {tipConfirmData.tip.toFixed(2)} extra</Text>
                    </View>
                  </View>
                </View>

                {/* Actions */}
                <TouchableOpacity
                  style={styles.tipModalConfirmBtn}
                  onPress={() => {
                    const data = tipConfirmData;
                    setTipConfirmVisible(false);
                    setTipConfirmData(null);
                    if (inPayDetail) {
                      commitPayDetailSave(data.amount, data.tip);
                    } else {
                      processPayment(data.debt, data.amount);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.tipModalConfirmText}>record with tip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.tipModalCancelBtn}
                  onPress={() => { setTipConfirmVisible(false); setTipConfirmData(null); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.tipModalCancelText}>cancel</Text>
                </TouchableOpacity>
              </View>
            </Reanimated.View>
          </>
        )}
        <InModalToast ref={modalToastRef} />
      </Modal>)}

      {/* ── Split Detail Modal (Summary View — TransactionsList vibe) ─── */}
      {splitDetailVisible && (<Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={dSplitDetailCloseSheet}>
        <Reanimated.View style={[styles.dDebtBackdrop, dSplitDetailBackdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={dSplitDetailCloseSheet} />
        </Reanimated.View>
        <Reanimated.View style={[styles.dDebtSheetContainer, dSplitDetailAnimatedStyle]}>
          <GestureDetector gesture={dSplitDetailGesture}>
            <View collapsable={false}>
              <View style={styles.dDebtSheetTopRow}>
                <View style={styles.dDebtSheetHandle} />
              </View>
              <View style={styles.dDebtTitleZone}>
                <Text style={styles.dDebtTitle}>
                  split <Text style={styles.dDebtTitleAccent}>summary</Text>
                </Text>
                {selectedSplit && (
                  <Text style={styles.dDebtSubtitle}>
                    {selectedSplit.description.toLowerCase()} · {selectedSplit.participants.length} {selectedSplit.participants.length === 1 ? 'person' : 'people'}
                  </Text>
                )}
              </View>
            </View>
          </GestureDetector>

            {selectedSplit && (() => {
              // Rebuild item breakdown per person
              const itemBreakdown = new Map<string, { name: string; amount: number; shared: boolean }[]>();
              selectedSplit.participants.forEach((p) => itemBreakdown.set(p.contact.id, []));

              if (selectedSplit.items.length > 0) {
                selectedSplit.items.forEach((item) => {
                  const count = item.assignedTo.length || 1;
                  const share = item.amount / count;
                  item.assignedTo.forEach((c) => {
                    const list = itemBreakdown.get(c.id);
                    if (list) list.push({ name: item.name, amount: share, shared: count > 1 });
                  });
                });
              }

              if (selectedSplit.taxAmount && selectedSplit.taxAmount > 0 && selectedSplit.taxHandling === 'divide') {
                const participantsWithAmount = selectedSplit.participants.filter((p) => p.amount > 0);
                const taxPerPerson = Math.round((selectedSplit.taxAmount / (participantsWithAmount.length || 1)) * 100) / 100;
                participantsWithAmount.forEach((p) => {
                  const list = itemBreakdown.get(p.contact.id);
                  if (list) list.push({ name: 'Tax', amount: taxPerPerson, shared: true });
                });
              }

              const paidCount = selectedSplit.participants.filter((p) => p.isPaid).length;
              const totalCount = selectedSplit.participants.length;
              const allPaid = totalCount > 0 && paidCount === totalCount;
              const heroColor = allPaid ? settledColor : (selectedSplit.paidBy?.id === '__self__' ? theyOweColor : iOweColor);
              const methodLabel = selectedSplit.splitMethod === 'item_based' ? t.debts.itemBased : selectedSplit.splitMethod === 'custom' ? t.debts.custom : t.debts.equal;

              return (
                <ScrollView showsVerticalScrollIndicator={false} bounces nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dDebtScrollContent}>
                  {/* Hero card — confident amount + status line, mirrors TransactionsList edit hero */}
                  <View style={styles.detailHeroCard}>
                    <Text style={styles.detailHeroDescription} numberOfLines={2}>
                      {selectedSplit.description}
                    </Text>
                    <Text style={[styles.detailHeroAmount, { color: heroColor }]}>
                      {currency} {selectedSplit.totalAmount.toFixed(2)}
                    </Text>
                    <Text style={styles.detailHeroSub}>
                      {paidCount} of {totalCount} paid · {methodLabel.toLowerCase()} split
                    </Text>
                  </View>

                  {/* Compact metadata — calm rows, lowercase labels */}
                  <View style={styles.detailMetaSection}>
                    {selectedSplit.paidBy && (
                      <View style={styles.detailMetaRow}>
                        <Text style={styles.detailMetaLabel}>paid by</Text>
                        <Text style={styles.detailMetaValue}>
                          {selectedSplit.paidBy.id === '__self__' ? 'you' : selectedSplit.paidBy.name.toLowerCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.detailMetaRow}>
                      <Text style={styles.detailMetaLabel}>when</Text>
                      <Text style={styles.detailMetaValue}>
                        {isValid(selectedSplit.createdAt) ? format(selectedSplit.createdAt, 'MMM dd, yyyy').toLowerCase() : '—'}
                      </Text>
                    </View>
                    {(selectedSplit as any).dueDate && (() => {
                      const dd = new Date((selectedSplit as any).dueDate);
                      return isValid(dd) ? (
                        <View style={styles.detailMetaRow}>
                          <Text style={styles.detailMetaLabel}>due</Text>
                          <Text style={styles.detailMetaValue}>
                            {format(dd, 'MMM dd, yyyy').toLowerCase()}
                          </Text>
                        </View>
                      ) : null;
                    })()}
                    {selectedSplit.walletId && (() => {
                      const w = wallets.find((wl) => wl.id === selectedSplit.walletId);
                      return w ? (
                        <View style={styles.detailMetaRow}>
                          <Text style={styles.detailMetaLabel}>wallet</Text>
                          <Text style={styles.detailMetaValue}>{w.name.toLowerCase()}</Text>
                        </View>
                      ) : null;
                    })()}
                    {selectedSplit.taxAmount != null && selectedSplit.taxAmount > 0 && (
                      <View style={styles.detailMetaRow}>
                        <Text style={styles.detailMetaLabel}>tax</Text>
                        <Text style={styles.detailMetaValue}>
                          {currency} {selectedSplit.taxAmount.toFixed(2)} · {selectedSplit.taxHandling === 'divide' ? 'split equally' : 'waived'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Per person section */}
                  <Text style={styles.detailSectionLabel}>per person</Text>
                  {selectedSplit.participants.map((p) => {
                    const items = itemBreakdown.get(p.contact.id) || [];
                    const isPaid = p.isPaid;
                    const isSelf = p.contact.id === '__self__';
                    const participantColor = isSelf ? '#A688B8' : isPaid ? settledColor : pendingColor;

                    return (
                      <View key={p.contact.id} style={styles.detailPersonRow}>
                        <View style={[styles.detailPersonRail, { backgroundColor: participantColor }]} />
                        <View style={styles.detailPersonBody}>
                          <View style={styles.detailPersonTop}>
                            <View style={[styles.detailPersonAvatar, { backgroundColor: withAlpha(participantColor, 0.12) }]}>
                              <Text style={[styles.detailPersonInitial, { color: participantColor }]}>
                                {p.contact.name.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.detailPersonName} numberOfLines={1}>
                                {isSelf ? 'you' : p.contact.name.toLowerCase()}
                              </Text>
                              <Text style={styles.detailPersonStatus}>
                                {isSelf ? 'your share' : isPaid ? 'paid' : 'unpaid'}
                              </Text>
                            </View>
                            <Text style={[styles.detailPersonAmount, { color: participantColor }]}>
                              {currency} {p.amount.toFixed(2)}
                            </Text>
                          </View>

                          {!isSelf && (
                            <TouchableOpacity
                              style={[
                                styles.detailPersonAction,
                                isPaid
                                  ? { backgroundColor: withAlpha(settledColor, 0.1), borderColor: withAlpha(settledColor, 0.3) }
                                  : { backgroundColor: withAlpha(pendingColor, 0.08), borderColor: withAlpha(pendingColor, 0.25) },
                              ]}
                              onPress={() => isPaid ? handleSplitUndoPaid(selectedSplit, p) : handleSplitMarkPaid(selectedSplit, p)}
                              activeOpacity={0.7}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Feather name={isPaid ? 'check-circle' : 'circle'} size={13} color={isPaid ? settledColor : pendingColor} />
                              <Text style={[styles.detailPersonActionText, { color: isPaid ? settledColor : pendingColor }]}>
                                {isPaid ? 'paid · undo' : 'mark paid'}
                              </Text>
                            </TouchableOpacity>
                          )}

                          {items.length > 0 && (
                            <View style={styles.detailPersonItems}>
                              {items.map((share, idx) => (
                                <View key={idx} style={styles.detailItemRow}>
                                  <Text style={styles.detailItemName} numberOfLines={1}>
                                    {share.name.toLowerCase()}{share.shared ? ' · shared' : ''}
                                  </Text>
                                  <Text style={styles.detailItemAmount}>
                                    {currency} {share.amount.toFixed(2)}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}

                  <View style={{ height: SPACING.xl }} />
                </ScrollView>
              );
            })()}
            <View style={[styles.dDebtSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm), gap: SPACING.sm }]}>
              {selectedSplit && (
                <View style={[styles.debtIconRow, { justifyContent: 'center' }]}>
                  <TouchableOpacity
                    style={styles.debtIconChip}
                    onPress={() => {
                      const s = selectedSplit;
                      setSplitDetailVisible(false);
                      setTimeout(() => handleEditSplit(s), 50);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="edit-2" size={16} color={C.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.debtIconChip}
                    onPress={() => {
                      const sid = selectedSplit.id;
                      const isAr = !!selectedSplit.isArchived;
                      setSplitDetailVisible(false);
                      setTimeout(() => {
                        const linkedDebts = useDebtStore.getState().debts.filter((d) => d.splitId === sid);
                        if (isAr) {
                          unarchiveSplit(sid);
                          linkedDebts.forEach((d) => unarchiveDebt(d.id));
                          showToast('split unarchived', 'success');
                        } else {
                          archiveSplit(sid);
                          linkedDebts.forEach((d) => archiveDebt(d.id));
                          showToast('split archived', 'success');
                        }
                      }, 100);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name={selectedSplit.isArchived ? 'corner-up-left' : 'archive'} size={16} color={C.bronze} />
                  </TouchableOpacity>
                </View>
              )}
              <Pressable
                style={styles.dDebtSecondaryLink}
                onPress={dSplitDetailCloseSheet}
                hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                accessibilityRole="button"
                accessibilityLabel="close"
              >
                {({ pressed }) => (
                  <View style={[styles.dDebtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={styles.dDebtSecondaryLinkText}>close</Text>
                  </View>
                )}
              </Pressable>
            </View>
        </Reanimated.View>
        <InModalToast ref={modalToastRef} />
      </Modal>)}

      {/* ── Receipt Split Wizard Modal ────────────────────────── */}
      {wizardVisible && (<Modal
        visible
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={handleWizardBack}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => { setWizardVisible(false); resetWizardForm(); }} />
          <View style={styles.wizardContent} onStartShouldSetResponder={() => true}>
            {/* Step Indicator */}
            <View style={styles.wizardStepRow}>
              {[1, 2, ...(wizardHasTax ? [3] : []), 4, 5, 6].map((step, idx) => {
                const isActive = wizardStep === step;
                const isCompleted = wizardStep > step;
                return (
                  <View key={step} style={styles.wizardStepItem}>
                    {idx > 0 && (
                      <View style={[styles.wizardStepLine, isCompleted && { backgroundColor: C.accent }]} />
                    )}
                    <View
                      style={[
                        styles.wizardStepCircle,
                        isActive && { backgroundColor: C.accent, borderColor: C.accent },
                        isCompleted && { backgroundColor: C.accent, borderColor: C.accent },
                      ]}
                    >
                      {isCompleted ? (
                        <Feather name="check" size={14} color={C.onAccent} />
                      ) : (
                        <Text style={[styles.wizardStepNum, (isActive || isCompleted) && { color: C.onAccent }]}>
                          {step}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {/* Step 1: Purpose */}
              {wizardStep === 1 && (
                <View>
                  <Text style={styles.wizardTitle}>{t.debts.whatIsThisFor}</Text>
                  <TextInput
                    style={styles.formInput}
                    value={wizardDescription}
                    onChangeText={setWizardDescription}
                    placeholder={t.debts.egDinnerGroceries}
                    placeholderTextColor={C.textSecondary}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.accent}
                  />
                  {wizardReceipt && (
                    <View style={styles.wizardContext}>
                      {wizardReceipt.date && (
                        <Text style={styles.wizardContextText}>
                          <Feather name="calendar" size={13} color={C.textSecondary} /> {wizardReceipt.date}
                        </Text>
                      )}
                      <Text style={styles.wizardContextText}>
                        <Feather name="list" size={13} color={C.textSecondary} /> {wizardReceipt.items.length} {t.debts.itemsScanned}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Step 2: Amount Verification */}
              {wizardStep === 2 && (
                <View>
                  <Text style={styles.wizardTitle}>{t.debts.isThisTotalCorrect}</Text>
                  {!wizardEditingAmount ? (
                    <View style={styles.wizardAmountDisplay}>
                      <Text style={styles.wizardAmountBig}>
                        {currency} {parseFloat(wizardTotal || '0').toFixed(2)}
                      </Text>
                      {wizardReceipt?.subtotal != null && wizardHasTax && (
                        <View style={styles.wizardAmountBreakdown}>
                          <Text style={styles.wizardBreakdownText}>
                            {t.debts.subtotal}: {currency} {wizardReceipt.subtotal.toFixed(2)}
                          </Text>
                          <Text style={styles.wizardBreakdownText}>
                            {t.debts.tax}: {currency} {wizardTaxAmount.toFixed(2)}
                          </Text>
                        </View>
                      )}
                      <View style={styles.wizardAmountActions}>
                        <TouchableOpacity
                          style={styles.wizardCorrectBtn}
                          onPress={handleWizardNext}
                          activeOpacity={0.7}
                        >
                          <Feather name="check" size={18} color={C.onAccent} />
                          <Text style={styles.wizardCorrectText}>{t.debts.correct}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.wizardEditBtn}
                          onPress={() => setWizardEditingAmount(true)}
                          activeOpacity={0.7}
                        >
                          <Feather name="edit-2" size={18} color={C.accent} />
                          <Text style={styles.wizardEditText}>{t.common.edit}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View>
                      <Text style={styles.formLabel}>{t.debts.totalAmount}</Text>
                      <TextInput
                        style={styles.formInput}
                        value={wizardTotal}
                        onChangeText={setWizardTotal}
                        keyboardType="decimal-pad"
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Step 3: Tax Handling */}
              {wizardStep === 3 && (
                <View>
                  <Text style={styles.wizardTitle}>{t.debts.howToHandleTax}</Text>
                  <Text style={styles.wizardSubtitle}>
                    {t.debts.taxDetected}: {currency} {wizardTaxAmount.toFixed(2)}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.wizardOptionCard,
                      wizardTaxHandling === 'divide' && styles.wizardOptionCardActive,
                    ]}
                    onPress={() => setWizardTaxHandling('divide')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.wizardOptionHeader}>
                      <Feather name="divide" size={20} color={wizardTaxHandling === 'divide' ? C.accent : C.textSecondary} />
                      <Text style={[styles.wizardOptionTitle, wizardTaxHandling === 'divide' && { color: C.accent }]}>
                        {t.debts.divideEvenly}
                      </Text>
                    </View>
                    <Text style={styles.wizardOptionDesc}>
                      {t.debts.divideEvenlyDesc}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.wizardOptionCard,
                      wizardTaxHandling === 'waive' && styles.wizardOptionCardActive,
                    ]}
                    onPress={() => setWizardTaxHandling('waive')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.wizardOptionHeader}>
                      <Feather name="x-circle" size={20} color={wizardTaxHandling === 'waive' ? C.accent : C.textSecondary} />
                      <Text style={[styles.wizardOptionTitle, wizardTaxHandling === 'waive' && { color: C.accent }]}>
                        {t.debts.waiveTax}
                      </Text>
                    </View>
                    <Text style={styles.wizardOptionDesc}>
                      {t.debts.waiveTaxDesc}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Step 4: Item Assignment */}
              {wizardStep === 4 && (
                <View>
                  <Text style={styles.wizardTitle}>{t.debts.assignItems}</Text>
                  <Text style={styles.wizardSubtitle}>{t.debts.tapItemToAssign}</Text>

                  {wizardParticipants.length > 0 && wizardItems.length > 0 && (
                    <TouchableOpacity
                      style={styles.wizardAssignAllBtn}
                      onPress={handleAssignAllEvenly}
                      activeOpacity={0.7}
                    >
                      <Feather name="users" size={14} color={C.accent} />
                      <Text style={styles.wizardAssignAllText}>{t.debts.assignAllEvenly}</Text>
                    </TouchableOpacity>
                  )}

                  {wizardItems.map((item, index) => (
                    editingItemIndex === index ? (
                      <View key={index} style={[styles.itemCard, { borderColor: C.accent, borderWidth: 1 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                          <TextInput
                            style={[styles.itemName, { flex: 1, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 4 }]}
                            value={editItemName}
                            onChangeText={setEditItemName}
                            placeholder={t.debts.itemName}
                            autoFocus
                            keyboardAppearance={isDark ? 'dark' : 'light'}
                            selectionColor={C.accent}
                          />
                          <TextInput
                            style={[styles.itemAmount, { width: 80, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 4, textAlign: 'right' }]}
                            value={editItemAmount}
                            onChangeText={setEditItemAmount}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            keyboardAppearance={isDark ? 'dark' : 'light'}
                            selectionColor={C.accent}
                          />
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.sm }}>
                          <TouchableOpacity onPress={() => handleDeleteItem(index)} style={{ padding: 6 }}>
                            <Feather name="trash-2" size={16} color={C.neutral} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setEditingItemIndex(null)} style={{ padding: 6 }}>
                            <Feather name="x" size={16} color={C.neutral} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={handleSaveEditItem} style={{ padding: 6 }}>
                            <Feather name="check" size={16} color={C.accent} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        key={index}
                        style={styles.itemCard}
                        activeOpacity={0.7}
                        onPress={() => handleOpenItemAssign(index)}
                      >
                        <View style={styles.itemHeader}>
                          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                            <Text style={styles.itemAmount}>{currency} {item.amount.toFixed(2)}</Text>
                            <TouchableOpacity
                              onPress={() => handleStartEditItem(index)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Feather name="edit-2" size={13} color={C.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.itemAssignRow}>
                          {item.assignedTo.length > 0 ? (
                            <View style={styles.assignChips}>
                              {item.assignedTo.map((c) => (
                                <View key={c.id} style={[styles.assignChip, styles.assignChipActive]}>
                                  <Text style={[styles.assignChipText, styles.assignChipTextActive]} numberOfLines={1}>
                                    {c.name.split(' ')[0]}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={styles.itemUnassignedText}>{t.debts.notAssigned}</Text>
                          )}
                          <View style={styles.itemAddBtn}>
                            <Feather name="plus" size={14} color={C.accent} />
                          </View>
                        </View>
                      </TouchableOpacity>
                    )
                  ))}

                  {/* Add item button */}
                  <TouchableOpacity
                    style={[styles.wizardAssignAllBtn, { marginTop: SPACING.sm }]}
                    onPress={handleAddWizardItem}
                    activeOpacity={0.7}
                  >
                    <Feather name="plus" size={14} color={C.accent} />
                    <Text style={styles.wizardAssignAllText}>{t.debts.addItem}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Step 5: Who paid the bill? */}
              {wizardStep === 5 && (
                <View>
                  <Text style={styles.wizardTitle}>{t.debts.whoPaidTheBill}</Text>
                  <Text style={styles.wizardSubtitle}>{t.debts.selectPayer}</Text>

                  {/* Always show Me first */}
                  {(() => {
                    const self = getSelfContact();
                    const isSelected = wizardPaidBy?.id === self.id;
                    return (
                      <TouchableOpacity
                        key={self.id}
                        style={[styles.wizardPayerCard, isSelected && styles.wizardPayerCardActive]}
                        onPress={() => setWizardPaidBy(self)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.participantAvatar, { backgroundColor: withAlpha(isSelected ? C.accent : C.neutral, 0.12) }]}>
                          <Text style={[styles.participantAvatarText, { color: isSelected ? C.accent : C.neutral }]}>
                            {self.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.wizardPayerName, isSelected && { color: C.accent }]}>
                          {self.name}
                        </Text>
                        {isSelected && <Feather name="check-circle" size={20} color={C.accent} />}
                      </TouchableOpacity>
                    );
                  })()}

                  {/* Other participants (excluding self) */}
                  {wizardParticipants
                    .filter((p) => p.id !== '__self__')
                    .map((p) => {
                      const isSelected = wizardPaidBy?.id === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.wizardPayerCard, isSelected && styles.wizardPayerCardActive]}
                          onPress={() => setWizardPaidBy(p)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.participantAvatar, { backgroundColor: withAlpha(isSelected ? C.accent : C.neutral, 0.12) }]}>
                            <Text style={[styles.participantAvatarText, { color: isSelected ? C.accent : C.neutral }]}>
                              {p.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={[styles.wizardPayerName, isSelected && { color: C.accent }]}>
                            {p.name}
                          </Text>
                          {isSelected && <Feather name="check-circle" size={20} color={C.accent} />}
                        </TouchableOpacity>
                      );
                    })}

                  {/* Wallet selection — only when "I paid" */}
                  {wizardPaidBy?.id === '__self__' && wallets.length > 0 && (
                    <View style={{ marginTop: SPACING.lg }}>
                      <WalletPicker
                        wallets={wallets}
                        selectedId={wizardWalletId}
                        onSelect={setWizardWalletId}
                        label={t.debts.paidFromWhichWallet}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Step 6: Summary & Save */}
              {wizardStep === 6 && wizardResult && (
                <View>
                  <Text style={styles.wizardTitle}>{t.debts.summary}</Text>

                  <View style={styles.wizardSummarySection}>
                    <View style={styles.wizardSummaryRow}>
                      <Text style={styles.wizardSummaryLabel}>{t.debts.description}</Text>
                      <Text style={styles.wizardSummaryValue}>{wizardDescription}</Text>
                    </View>
                    <View style={styles.wizardSummaryRow}>
                      <Text style={styles.wizardSummaryLabel}>{t.common.total}</Text>
                      <Text style={styles.wizardSummaryValue}>
                        {currency} {wizardResult.effectiveTotal.toFixed(2)}
                      </Text>
                    </View>
                    {wizardHasTax && (
                      <View style={styles.wizardSummaryRow}>
                        <Text style={styles.wizardSummaryLabel}>{t.debts.tax}</Text>
                        <Text style={styles.wizardSummaryValue}>
                          {wizardTaxHandling === 'divide'
                            ? `${currency} ${wizardTaxAmount.toFixed(2)} (${t.debts.splitEqually})`
                            : `${currency} ${wizardTaxAmount.toFixed(2)} (${t.debts.waived})`}
                        </Text>
                      </View>
                    )}
                    {wizardPaidBy && (
                      <View style={styles.wizardSummaryRow}>
                        <Text style={styles.wizardSummaryLabel}>{t.debts.paidBy}</Text>
                        <Text style={styles.wizardSummaryValue}>{wizardPaidBy.name}</Text>
                      </View>
                    )}
                    {wizardPaidBy?.id === '__self__' && wizardWalletId && (() => {
                      const w = wallets.find((wl) => wl.id === wizardWalletId);
                      if (!w) return null;
                      return (
                        <View style={styles.wizardSummaryRow}>
                          <Text style={styles.wizardSummaryLabel}>{t.debts.fromWallet}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                            <WalletLogo wallet={w} size={18} />
                            <Text style={[styles.wizardSummaryValue, { color: w.color }]}>{w.name}</Text>
                          </View>
                        </View>
                      );
                    })()}
                    <Pressable
                      style={styles.wizardSummaryRow}
                      onPress={() => setWizardDueDatePickerOpen((v) => !v)}
                    >
                      <Text style={styles.wizardSummaryLabel}>{t.debts.dueDate.toLowerCase()}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                        <Text style={[styles.wizardSummaryValue, !wizardDueDate && { color: C.textMuted }]}>
                          {wizardDueDate ? format(wizardDueDate, 'MMM dd, yyyy').toLowerCase() : 'optional'}
                        </Text>
                        <Feather name="calendar" size={14} color={C.textMuted} />
                      </View>
                    </Pressable>
                    {wizardDueDatePickerOpen && (
                      <View style={{ marginTop: SPACING.xs }}>
                        <CalendarPicker
                          value={wizardDueDate || new Date()}
                          onChange={(d) => {
                            setWizardDueDate(d);
                            setWizardDueDatePickerOpen(false);
                          }}
                        />
                        {wizardDueDate && (
                          <TouchableOpacity
                            onPress={() => { setWizardDueDate(null); setWizardDueDatePickerOpen(false); }}
                            style={{ alignSelf: 'center', paddingVertical: SPACING.xs }}
                          >
                            <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted }}>clear due date</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>

                  <Text style={[styles.formLabel, { marginTop: SPACING.lg }]}>{t.debts.perPerson}</Text>
                  {wizardResult.breakdown.map((person) => {
                    const isMe = person.contact.id === '__self__';
                    const cardColor = isMe ? '#A688B8' : C.accent;
                    return (
                    <View key={person.contact.id} style={[styles.wizardPersonCard, { borderLeftWidth: 3, borderLeftColor: cardColor }]}>
                      <View style={styles.wizardPersonHeader}>
                        <View style={[styles.participantAvatar, { backgroundColor: withAlpha(cardColor, 0.12) }]}>
                          <Text style={[styles.participantAvatarText, { color: cardColor }]}>
                            {person.contact.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.wizardPersonName}>{person.contact.name}</Text>
                          {isMe && <Text style={{ fontSize: 10, color: '#A688B8', fontWeight: '600' }}>{t.debts.myShare}</Text>}
                        </View>
                        <Text style={[styles.wizardPersonTotal, { color: cardColor }]}>
                          {currency} {person.total.toFixed(2)}
                        </Text>
                      </View>
                      {person.itemShares.map((share, idx) => (
                        <View key={idx} style={styles.wizardShareRow}>
                          <Text style={styles.wizardShareName} numberOfLines={1}>
                            {share.name}{share.shared ? ' (shared)' : ''}
                          </Text>
                          <Text style={styles.wizardShareAmount}>
                            {currency} {share.amount.toFixed(2)}
                          </Text>
                        </View>
                      ))}
                      {person.taxShare > 0 && (
                        <View style={styles.wizardShareRow}>
                          <Text style={styles.wizardShareName}>{t.debts.taxShare}</Text>
                          <Text style={styles.wizardShareAmount}>
                            {currency} {person.taxShare.toFixed(2)}
                          </Text>
                        </View>
                      )}
                    </View>
                  );})}

                  {/* Debt Preview */}
                  {wizardPaidBy && (() => {
                    const selfId = '__self__';
                    const debtsPreview: { name: string; amount: number; type: 'they_owe' | 'i_owe' }[] = [];

                    if (wizardPaidBy.id === selfId) {
                      wizardResult.participants
                        .filter((p) => p.contact.id !== selfId && p.amount > 0)
                        .forEach((p) => debtsPreview.push({ name: p.contact.name, amount: p.amount, type: 'they_owe' }));
                    } else {
                      const myShare = wizardResult.participants.find((p) => p.contact.id === selfId);
                      if (myShare && myShare.amount > 0) {
                        debtsPreview.push({ name: wizardPaidBy.name, amount: myShare.amount, type: 'i_owe' });
                      }
                    }

                    if (debtsPreview.length === 0) return null;

                    return (
                      <View style={{ marginTop: SPACING.lg }}>
                        <Text style={styles.formLabel}>{t.debts.debtsLabel}</Text>
                        {debtsPreview.map((d, idx) => (
                          <View key={idx} style={styles.wizardDebtRow}>
                            <Feather
                              name={d.type === 'they_owe' ? 'arrow-down-left' : 'arrow-up-right'}
                              size={16}
                              color={d.type === 'they_owe' ? C.positive : C.neutral}
                            />
                            <Text style={styles.wizardDebtText}>
                              {d.type === 'they_owe'
                                ? `${d.name} ${t.debts.owesYou}`
                                : `${t.debts.youOweName} ${d.name}`}
                            </Text>
                            <Text style={[styles.wizardDebtAmount, { color: d.type === 'they_owe' ? C.positive : C.neutral }]}>
                              {currency} {d.amount.toFixed(2)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </View>
              )}

              {/* Navigation Buttons */}
              <View style={[styles.modalActions, { marginTop: SPACING.md, marginBottom: SPACING.md }]}>
                <Button
                  title={wizardStep === 1 ? t.common.cancel : t.debts.backBtn}
                  onPress={handleWizardBack}
                  variant="outline"
                  icon={wizardStep === 1 ? undefined : 'arrow-left'}
                  style={{ flex: 1 }}
                />
                {wizardStep === 4 && (
                  <Button
                    title={t.debts.draft}
                    onPress={handleSaveAsDraft}
                    variant="outline"
                    icon="bookmark"
                    style={{ borderColor: C.bronze, paddingHorizontal: 12 }}
                    textStyle={{ color: C.bronze }}
                  />
                )}
                {wizardStep === 6 ? (
                  <Button
                    title={t.common.save}
                    onPress={handleWizardSave}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                ) : wizardStep === 2 && !wizardEditingAmount ? (
                  <View style={{ flex: 1 }} />
                ) : (
                  <Button
                    title={t.common.next}
                    onPress={handleWizardNext}
                    icon="arrow-right"
                    style={{ flex: 1 }}
                  />
                )}
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Item Assignment Overlay */}
        {assigningItemIndex !== null && (
          <KeyboardAvoidingView
            style={[StyleSheet.absoluteFill]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
          <View style={[{ flex: 1 }, styles.modalOverlay]}>
          <Pressable style={{ flex: 1 }} onPress={() => setAssigningItemIndex(null)} />
            <View style={styles.assignModalSheet} onStartShouldSetResponder={() => true}>
              {itemAssignMode === 'assign' ? (
                <>
                <ScrollView ref={assignScrollRef} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ paddingBottom: SPACING.xl }}>
                  {/* Header */}
                  <View style={styles.assignModalHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.assignModalItemName}>
                        {wizardItems[assigningItemIndex]?.name}
                      </Text>
                      <Text style={styles.assignModalItemAmount}>
                        {currency} {wizardItems[assigningItemIndex]?.amount.toFixed(2)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setAssigningItemIndex(null)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Feather name="x" size={22} color={C.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  {/* Add Me button */}
                  {!wizardItems[assigningItemIndex]?.assignedTo.some((c) => c.id === '__self__') && (
                    <TouchableOpacity
                      style={styles.addMeBtn}
                      onPress={() => handleItemAddContact(getSelfContact())}
                      activeOpacity={0.7}
                    >
                      <Feather name="user" size={16} color={C.accent} />
                      <Text style={styles.addMeBtnText}>+ {getSelfContact().name}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Currently assigned */}
                  {wizardItems[assigningItemIndex]?.assignedTo.length > 0 && (
                    <View style={{ marginBottom: SPACING.lg }}>
                      <Text style={styles.assignModalLabel}>{t.debts.assigned}</Text>
                      <View style={styles.assignChips}>
                        {wizardItems[assigningItemIndex].assignedTo.map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.assignChip, styles.assignChipActive]}
                            onPress={() => handleItemRemoveContact(c.id)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={[styles.assignChipText, styles.assignChipTextActive]} numberOfLines={1}>
                              {c.name.split(' ')[0]}
                            </Text>
                            <Feather name="x" size={10} color={C.accent} style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Quick add from existing participants */}
                  {wizardParticipants.filter(
                    (p) => !wizardItems[assigningItemIndex]?.assignedTo.some((a) => a.id === p.id)
                  ).length > 0 && (
                    <View style={{ marginBottom: SPACING.lg }}>
                      <Text style={styles.assignModalLabel}>{t.debts.quickAdd}</Text>
                      <View style={styles.assignChips}>
                        {wizardParticipants
                          .filter((p) => !wizardItems[assigningItemIndex]?.assignedTo.some((a) => a.id === p.id))
                          .map((c) => (
                            <TouchableOpacity
                              key={c.id}
                              style={styles.assignChip}
                              onPress={() => handleItemAddContact(c)}
                              activeOpacity={0.7}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={styles.assignChipText} numberOfLines={1}>
                                {c.name.split(' ')[0]}
                              </Text>
                            </TouchableOpacity>
                          ))}
                      </View>
                    </View>
                  )}

                  {/* From contacts button */}
                  <TouchableOpacity
                    style={styles.assignFromContactsBtn}
                    onPress={loadItemPhoneContacts}
                    activeOpacity={0.7}
                  >
                    <Feather name="book" size={16} color={C.accent} />
                    <Text style={styles.assignFromContactsText}>{t.debts.fromContacts}</Text>
                  </TouchableOpacity>

                  {/* Manual name input */}
                  <Text style={styles.assignModalLabel}>{t.debts.addNewPerson}</Text>
                  <View style={styles.assignManualRow}>
                    <TextInput
                      style={[styles.formInput, { flex: 1 }]}
                      value={itemManualName}
                      onChangeText={setItemManualName}
                      placeholder={t.debts.typeName}
                      placeholderTextColor={C.textSecondary}
                      returnKeyType="done"
                      onSubmitEditing={handleItemAddManual}
                      onFocus={() => assignScrollRef.current?.scrollToEnd({ animated: false })}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={C.accent}
                    />
                    <TouchableOpacity
                      style={styles.assignManualAddBtn}
                      onPress={handleItemAddManual}
                      activeOpacity={0.7}
                    >
                      <Feather name="plus" size={18} color={C.onAccent} />
                    </TouchableOpacity>
                  </View>

                </ScrollView>
                {/* Done button — fixed outside scroll so it's always visible */}
                <TouchableOpacity
                  style={styles.assignDoneBtn}
                  onPress={() => setAssigningItemIndex(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.assignDoneText}>{t.common.done}</Text>
                </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* Phone Contacts List */}
                  <View style={styles.assignModalHeader}>
                    <TouchableOpacity
                      onPress={() => setItemAssignMode('assign')}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Feather name="arrow-left" size={22} color={C.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.assignModalItemName, { flex: 1, marginLeft: SPACING.md }]}>
                      {t.debts.selectContact}
                    </Text>
                    <TouchableOpacity
                      onPress={() => { setItemAssignMode('assign'); }}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Feather name="x" size={22} color={C.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={[styles.formInput, { marginBottom: SPACING.md }]}
                    value={itemContactSearch}
                    onChangeText={setItemContactSearch}
                    placeholder={t.debts.searchContacts}
                    placeholderTextColor={C.textSecondary}
                    autoFocus
                    returnKeyType="search"
                    onSubmitEditing={Keyboard.dismiss}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.accent}
                  />

                  <FlatList
                    data={itemPhoneContacts.filter((c) =>
                      c.name.toLowerCase().includes(itemContactSearch.toLowerCase())
                    )}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    style={{ maxHeight: 400 }}
                    renderItem={({ item }) => {
                      const isAssigned = wizardItems[assigningItemIndex]?.assignedTo.some(
                        (a) => a.id === item.id
                      );
                      return (
                        <TouchableOpacity
                          style={[styles.phoneContactRow, isAssigned && styles.phoneContactRowSelected]}
                          onPress={() => handleItemAddContact(item)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.phoneContactAvatar}>
                            <Text style={styles.phoneContactAvatarText}>
                              {item.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.phoneContactName}>{item.name}</Text>
                            {item.phone && (
                              <Text style={styles.phoneContactPhone}>{item.phone}</Text>
                            )}
                          </View>
                          {isAssigned && (
                            <Feather name="check-circle" size={20} color={C.positive} />
                          )}
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={
                      <View style={{ alignItems: 'center', paddingVertical: SPACING['2xl'] }}>
                        <Feather name="users" size={28} color={C.neutral} />
                        <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, marginTop: SPACING.sm }}>
                          {t.debts.noContactsFound}
                        </Text>
                      </View>
                    }
                  />

                  {/* Done button */}
                  <TouchableOpacity
                    style={[styles.assignDoneBtn, { marginTop: SPACING.md }]}
                    onPress={() => setItemAssignMode('assign')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.assignDoneText}>{t.common.done}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
          </KeyboardAvoidingView>
        )}
        </KeyboardAvoidingView>
        {keyboardVisible && multilineFocused && (
          <TouchableOpacity
            style={[styles.doneFab, { bottom: keyboardHeight + 16 }]}
            onPress={() => Keyboard.dismiss()}
            activeOpacity={0.8}
          >
            <Feather name="check" size={20} color={C.onAccent} />
          </TouchableOpacity>
        )}
        <InModalToast ref={modalToastRef} />
      </Modal>)}

      {/* ── Scanning Loading Overlay ──────────────────────────── */}
      {scanningReceipt && (
        <Modal visible transparent statusBarTranslucent animationType="fade">
          <View style={styles.scanningOverlay}>
            <View style={styles.scanningCard}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={styles.scanningTitle}>{t.debts.scanningReceipt}</Text>
              <Text style={styles.scanningSubtext}>{t.debts.aiReadingReceipt}</Text>
            </View>
          </View>
        </Modal>
      )}

      {/* ── FAB Choice Modal ─────────────────────────────────────────────── */}
      {fabChoiceVisible && (<Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={() => setFabChoiceVisible(false)}>
        <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setFabChoiceVisible(false)}>
          <Pressable onPress={() => {}} style={styles.choiceCard}>
            <Text style={styles.choiceTitle}>{t.debts.newEntry}</Text>
            <Text style={styles.choiceSubtitle}>{t.debts.whatWouldYouAdd}</Text>
            {([
              { icon: 'users' as const, label: t.debts.addDebt, desc: t.debts.trackMoneyOwed, onPress: () => { setFabChoiceVisible(false); resetDebtForm(); setDebtModalVisible(true); } },
              { icon: 'scissors' as const, label: t.debts.splitExpense, desc: t.debts.divideBill, onPress: () => { setFabChoiceVisible(false); setSplitChoiceVisible(true); } },
            ] as const).map((opt, i, arr) => (
              <TouchableOpacity key={opt.label} onPress={opt.onPress} activeOpacity={0.7} style={[styles.choiceRow, i < arr.length - 1 && styles.choiceRowBorder]}>
                <View style={styles.choiceIcon}><Feather name={opt.icon} size={18} color={C.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.choiceLabel}>{opt.label}</Text>
                  <Text style={styles.choiceDesc}>{opt.desc}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textMuted} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>)}

      {/* ── Split Choice Modal (animationType="none" — instant dismiss, safe for native pickers) ── */}
      {splitChoiceVisible && (<Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={() => setSplitChoiceVisible(false)}>
        <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setSplitChoiceVisible(false)}>
          <Pressable onPress={() => {}} style={styles.choiceCard}>
            <Text style={styles.choiceTitle}>{t.debts.splitExpense}</Text>
            <Text style={styles.choiceSubtitle}>{t.debts.howWouldYouSplit}</Text>
            {([
              { icon: 'edit-3' as const, label: t.debts.manual, desc: t.debts.manualDesc, onPress: () => { setSplitChoiceVisible(false); resetSplitForm(); setSplitModalVisible(true); } },
              { icon: 'camera' as const, label: t.debts.takePhotoLabel, desc: t.debts.takePhotoDesc, onPress: () => { setSplitChoiceVisible(false); setTimeout(handleWizardScan, 50); } },
              { icon: 'image' as const, label: t.debts.chooseFromGalleryLabel, desc: t.debts.chooseFromGalleryDesc, onPress: () => { setSplitChoiceVisible(false); setTimeout(handleWizardGallery, 50); } },
            ] as const).map((opt, i, arr) => (
              <TouchableOpacity key={opt.label} onPress={opt.onPress} activeOpacity={0.7} style={[styles.choiceRow, i < arr.length - 1 && styles.choiceRowBorder]}>
                <View style={styles.choiceIcon}><Feather name={opt.icon} size={18} color={C.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.choiceLabel}>{opt.label}</Text>
                  <Text style={styles.choiceDesc}>{opt.desc}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textMuted} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>)}

      {/* ── Reminder Sheet ──────────────────────────────── */}
      {reminderModalVisible && (<Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={dReminderCloseSheet}>
        <Reanimated.View style={[styles.dDebtBackdrop, dReminderBackdropAnimatedStyle]}>
          <Pressable style={{ flex: 1 }} onPress={dReminderCloseSheet} />
        </Reanimated.View>

        <Reanimated.View style={[styles.dDebtSheetContainer, dReminderSheetAnimatedStyle]}>
          {reminderDebt && (() => {
            const remaining = reminderDebt.totalAmount - reminderDebt.paidAmount;
            return (
              <>
                <GestureDetector gesture={dReminderSheetGesture}>
                  <View collapsable={false}>
                    <View style={styles.dDebtSheetTopRow}>
                      <View style={styles.dDebtSheetHandle} />
                    </View>
                    <View style={styles.dDebtTitleZone}>
                      <Text style={styles.dDebtTitle} numberOfLines={1}>
                        <Text style={styles.dDebtTitleAccent}>{t.debts.sendReminder.toLowerCase()}</Text>
                      </Text>
                      <Text style={styles.dDebtSubtitle}>
                        {reminderDebt.contact.name} · {t.debts.owes} {currency} {remaining.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </GestureDetector>

                <KeyboardAwareScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm, marginTop: SPACING.md }}>
                    <Text style={[styles.requestPaymentLabel, { marginBottom: 0 }]}>{t.debts.message}</Text>
                    {reminderEditing ? (
                      <TouchableOpacity
                        onPress={() => { Keyboard.dismiss(); setReminderEditing(false); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent }}>{t.common.done}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setReminderEditing(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Feather name="edit-3" size={13} color={C.accent} />
                        <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent }}>{t.common.edit}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={[styles.requestPaymentMessageInput, !reminderEditing && { color: C.textSecondary }]}
                    value={reminderMessage}
                    onChangeText={setReminderMessage}
                    multiline
                    textAlignVertical="top"
                    placeholderTextColor={C.textSecondary}
                    editable={reminderEditing}
                    onFocus={() => { setReminderEditing(true); setMultilineFocused(true); }}
                    onBlur={() => { setReminderEditing(false); setMultilineFocused(false); }}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.accent}
                  />
                </KeyboardAwareScrollView>

                <View style={[styles.dDebtSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
                  <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                    <TouchableOpacity
                      style={[styles.requestPaymentCopyBtn, { flex: 1 }, reminderCopied && { backgroundColor: withAlpha(C.positive, 0.1) }]}
                      onPress={async () => {
                        await Clipboard.setStringAsync(reminderMessage);
                        setReminderCopied(true);
                        setTimeout(() => setReminderCopied(false), 2000);
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name={reminderCopied ? 'check' : 'copy'} size={18} color={reminderCopied ? C.positive : C.accent} />
                      <Text style={[styles.requestPaymentCopyText, reminderCopied && { color: C.positive }]}>
                        {reminderCopied ? t.common.copied : t.debts.copy}
                      </Text>
                    </TouchableOpacity>

                    {reminderDebt.contact.phone && (
                      <TouchableOpacity
                        style={[styles.requestPaymentWhatsAppBtn, { flex: 2 }]}
                        onPress={() => {
                          const phone = cleanPhoneNumber(reminderDebt!.contact.phone!);
                          const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(reminderMessage)}`;
                          Linking.openURL(url).catch(() => {});
                          dReminderCloseSheet();
                        }}
                        activeOpacity={0.7}
                      >
                        <Feather name="message-circle" size={18} color={C.onAccent} />
                        <Text style={styles.requestPaymentWhatsAppText}>{t.debts.whatsapp}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Pressable
                    style={styles.dDebtSecondaryLink}
                    onPress={dReminderCloseSheet}
                    hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                    accessibilityRole="button"
                    accessibilityLabel="close"
                  >
                    {({ pressed }) => (
                      <View style={[styles.dDebtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                        <Feather name="x" size={12} color={C.textMuted} />
                        <Text style={styles.dDebtSecondaryLinkText}>close</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </>
            );
          })()}
        </Reanimated.View>
        {keyboardVisible && multilineFocused && (
          <TouchableOpacity
            style={[styles.doneFab, { bottom: keyboardHeight + 16 }]}
            onPress={() => Keyboard.dismiss()}
            activeOpacity={0.8}
          >
            <Feather name="check" size={20} color={C.onAccent} />
          </TouchableOpacity>
        )}
        <InModalToast ref={modalToastRef} />
      </Modal>)}

      {/* ── Request Payment Sheet ──────────────────────────────── */}
      {requestPaymentVisible && (<Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={dReqCloseSheet}>
        <Reanimated.View style={[styles.dDebtBackdrop, dReqBackdropAnimatedStyle]}>
          <Pressable style={{ flex: 1 }} onPress={dReqCloseSheet} />
        </Reanimated.View>

        <Reanimated.View style={[styles.dDebtSheetContainer, dReqSheetAnimatedStyle]}>
          {requestPaymentDebt && (() => {
            const remaining = requestPaymentDebt.totalAmount - requestPaymentDebt.paidAmount;
            return (
              <>
                <GestureDetector gesture={dReqSheetGesture}>
                  <View collapsable={false}>
                    <View style={styles.dDebtSheetTopRow}>
                      <View style={styles.dDebtSheetHandle} />
                    </View>
                    <View style={styles.dDebtTitleZone}>
                      <Text style={styles.dDebtTitle} numberOfLines={1}>
                        <Text style={styles.dDebtTitleAccent}>{t.debts.requestPayment.toLowerCase()}</Text>
                      </Text>
                      <Text style={styles.dDebtSubtitle}>
                        {requestPaymentDebt.contact.name} · {t.debts.owes} {currency} {remaining.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </GestureDetector>

                <KeyboardAwareScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm, marginTop: SPACING.md }}>
                    <Text style={[styles.requestPaymentLabel, { marginBottom: 0 }]}>{t.debts.message}</Text>
                    {messageEditing ? (
                      <TouchableOpacity
                        onPress={() => { Keyboard.dismiss(); setMessageEditing(false); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent }}>{t.common.done}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => { setMessageEditing(true); messageInputRef.current?.focus(); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <Feather name="edit-3" size={13} color={C.accent} />
                        <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent }}>{t.common.edit}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    ref={messageInputRef}
                    style={[styles.requestPaymentMessageInput, !messageEditing && { color: C.textSecondary }]}
                    value={requestPaymentMessage}
                    onChangeText={setRequestPaymentMessage}
                    multiline
                    textAlignVertical="top"
                    placeholderTextColor={C.textSecondary}
                    editable={messageEditing}
                    onFocus={() => { setMessageEditing(true); setMultilineFocused(true); }}
                    onBlur={() => { setMessageEditing(false); setMultilineFocused(false); }}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.accent}
                  />

                  {showQrPicker && paymentQrs.length > 1 && (
                    <View style={{ marginTop: SPACING.md }}>
                      <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, marginBottom: SPACING.sm, fontWeight: '600' }}>
                        {t.debts.whichQrToSend}
                      </Text>
                      {paymentQrs.map((qr, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: SPACING.md,
                            borderRadius: SPACING.sm,
                            backgroundColor: withAlpha(C.accent, 0.06),
                            marginBottom: SPACING.sm,
                            gap: SPACING.md,
                          }}
                          activeOpacity={0.7}
                          onPress={() => sendWhatsAppWithQr(idx)}
                        >
                          <Image source={{ uri: qr.uri }} style={{ width: 44, height: 44, borderRadius: SPACING.xs }} resizeMode="cover" />
                          <Text style={{ flex: 1, fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, fontWeight: '500' }} numberOfLines={1}>{qr.label}</Text>
                          <Feather name="send" size={16} color={C.accent} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {!hasPaymentQr && (
                    <View style={styles.requestPaymentQrHint}>
                      <Feather name="info" size={16} color={C.textSecondary} />
                      <Text style={styles.requestPaymentQrHintText}>
                        {t.debts.addQrHint}
                      </Text>
                    </View>
                  )}
                </KeyboardAwareScrollView>

                <View style={[styles.dDebtSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm), gap: SPACING.sm }]}>
                  <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                    <TouchableOpacity
                      style={[styles.requestPaymentCopyBtn, { flex: 1 }, messageCopied && { backgroundColor: withAlpha(C.positive, 0.1) }]}
                      onPress={handleCopyPaymentMessage}
                      activeOpacity={0.7}
                    >
                      <Feather name={messageCopied ? 'check' : 'copy'} size={18} color={messageCopied ? C.positive : C.accent} />
                      <Text style={[styles.requestPaymentCopyText, messageCopied && { color: C.positive }]}>
                        {messageCopied ? t.common.copied : t.debts.copy}
                      </Text>
                    </TouchableOpacity>

                    {requestPaymentDebt.contact.phone && (
                      <TouchableOpacity
                        style={[styles.requestPaymentWhatsAppBtn, { flex: 2 }]}
                        onPress={handleWhatsAppTap}
                        activeOpacity={0.7}
                      >
                        <Feather name="message-circle" size={18} color={C.onAccent} />
                        <Text style={styles.requestPaymentWhatsAppText}>
                          {hasPaymentQr ? t.debts.whatsappQr : t.debts.whatsapp}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Pressable
                    style={styles.dDebtSecondaryLink}
                    onPress={dReqCloseSheet}
                    hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
                    accessibilityRole="button"
                    accessibilityLabel="close"
                  >
                    {({ pressed }) => (
                      <View style={[styles.dDebtSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                        <Feather name="x" size={12} color={C.textMuted} />
                        <Text style={styles.dDebtSecondaryLinkText}>close</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </>
            );
          })()}
        </Reanimated.View>
        {keyboardVisible && multilineFocused && (
          <TouchableOpacity
            style={[styles.doneFab, { bottom: keyboardHeight + 16 }]}
            onPress={() => Keyboard.dismiss()}
            activeOpacity={0.8}
          >
            <Feather name="check" size={20} color={C.onAccent} />
          </TouchableOpacity>
        )}
        <InModalToast ref={modalToastRef} />
      </Modal>)}

      {/* ── Sort Modal ─────────────────────────────────────────── */}
      {/* ── Settings Modal — show/hide archive tab ─── */}
      {settingsModalVisible && (
        <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={() => setSettingsModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <Pressable style={{ flex: 1 }} onPress={() => setSettingsModalVisible(false)} />
            <View style={[styles.modalContent, { paddingBottom: Math.max(SPACING['2xl'], insets.bottom + SPACING.lg) }]} onStartShouldSetResponder={() => true}>
              <View style={styles.dDebtSheetTopRow}>
                <View style={styles.dDebtSheetHandle} />
              </View>
              <View style={styles.dDebtTitleZone}>
                <Text style={styles.dDebtTitle}>
                  view <Text style={styles.dDebtTitleAccent}>settings</Text>
                </Text>
                <Text style={styles.dDebtSubtitle}>tweak what shows up on this screen</Text>
              </View>

              <View style={{ paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg }}>
                <TouchableOpacity
                  style={styles.dSettingsRow}
                  onPress={() => setDebtsShowArchive(!debtsShowArchive)}
                  activeOpacity={0.7}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: debtsShowArchive }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dSettingsRowTitle}>show archive tab</Text>
                    <Text style={styles.dSettingsRowSub}>
                      keeps an extra tab for debts and splits you've stashed away. tap any item's "archive" action to move it there.
                    </Text>
                  </View>
                  <View style={[
                    styles.dSettingsToggle,
                    debtsShowArchive && { backgroundColor: C.accent },
                  ]}>
                    <View style={[
                      styles.dSettingsToggleThumb,
                      debtsShowArchive && { transform: [{ translateX: 18 }] },
                    ]} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.dSettingsRow, { marginTop: SPACING.md }]}
                  onPress={() => setDebtsShowReminder(!debtsShowReminder)}
                  activeOpacity={0.7}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: debtsShowReminder }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dSettingsRowTitle}>show reminder button</Text>
                    <Text style={styles.dSettingsRowSub}>
                      adds a reminder button on "they owe" debts so you can nudge people with a friendly message.
                    </Text>
                  </View>
                  <View style={[
                    styles.dSettingsToggle,
                    debtsShowReminder && { backgroundColor: C.accent },
                  ]}>
                    <View style={[
                      styles.dSettingsToggleThumb,
                      debtsShowReminder && { transform: [{ translateX: 18 }] },
                    ]} />
                  </View>
                </TouchableOpacity>

                {/* ── How it works button ─────────────────────── */}
                <TouchableOpacity
                  style={styles.dHowButton}
                  onPress={() => {
                    setSettingsModalVisible(false);
                    setTimeout(() => setHowItWorksVisible(true), 50);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="help-circle" size={16} color={C.accent} />
                  <Text style={styles.dHowButtonText}>how it works</Text>
                  <Feather name="chevron-right" size={14} color={C.textMuted} />
                </TouchableOpacity>

                <Button
                  title={t.common.done}
                  onPress={() => setSettingsModalVisible(false)}
                  variant="outline"
                  fullWidth
                  style={{ marginTop: SPACING.lg }}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ── How It Works — floating centered modal ─── */}
      {howItWorksVisible && (
        <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={() => setHowItWorksVisible(false)}>
          <Pressable style={styles.dHowOverlay} onPress={() => setHowItWorksVisible(false)}>
            <View style={styles.dHowCard} onStartShouldSetResponder={() => true}>
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: SPACING.sm }}>
                <View style={styles.dHowCardHeader}>
                  <Text style={styles.dHowCardTitle}>how it works</Text>
                  <Text style={styles.dHowCardSub}>everything you need to know about this screen</Text>
                </View>

                {/* ── Basics ── */}
                <Text style={styles.dHowGroupLabel}>basics</Text>
                <View style={styles.dHowItem}>
                  <View style={styles.dHowIconCircle}><Feather name="users" size={14} color={C.textSecondary} /></View>
                  <Text style={styles.dHowText}><Text style={styles.dHowBold}>grouped by person</Text> — debts with the same person are consolidated into one card. tap to see each debt inside.</Text>
                </View>
                <View style={styles.dHowItem}>
                  <View style={styles.dHowIconCircle}><Feather name="check-circle" size={14} color={C.textSecondary} /></View>
                  <Text style={styles.dHowText}><Text style={styles.dHowBold}>record payments</Text> — partial or full, against any debt. each payment links to your wallet automatically.</Text>
                </View>
                <View style={styles.dHowItem}>
                  <View style={styles.dHowIconCircle}><Feather name="rotate-ccw" size={14} color={C.textSecondary} /></View>
                  <Text style={styles.dHowText}><Text style={styles.dHowBold}>undo payments</Text> — tap the clock icon to view history. you can remove any payment from there.</Text>
                </View>

                {/* ── Automation ── */}
                <Text style={styles.dHowGroupLabel}>automation</Text>
                <View style={styles.dHowItem}>
                  <View style={styles.dHowIconCircle}><Feather name="archive" size={14} color={C.textSecondary} /></View>
                  <Text style={styles.dHowText}><Text style={styles.dHowBold}>auto-archive</Text> — settled debts move to archive after 30 days. enable the archive tab in settings to view them.</Text>
                </View>
                <View style={styles.dHowItem}>
                  <View style={styles.dHowIconCircle}><Feather name="bell" size={14} color={C.textSecondary} /></View>
                  <Text style={styles.dHowText}><Text style={styles.dHowBold}>reminders</Text> — send a friendly nudge via WhatsApp for "they owe" debts. includes all outstanding amounts.</Text>
                </View>
                <View style={styles.dHowItem}>
                  <View style={styles.dHowIconCircle}><Feather name="send" size={14} color={C.textSecondary} /></View>
                  <Text style={styles.dHowText}><Text style={styles.dHowBold}>request payment</Text> — generate a message with optional QR code. share via WhatsApp or copy.</Text>
                </View>

                {/* ── Managing ── */}
                <Text style={styles.dHowGroupLabel}>managing</Text>
                <View style={styles.dHowItem}>
                  <View style={styles.dHowIconCircle}><Feather name="trash-2" size={14} color={C.textSecondary} /></View>
                  <Text style={styles.dHowText}><Text style={styles.dHowBold}>delete only here</Text> — debt-linked transactions can only be removed from this screen, not from the transactions list.</Text>
                </View>
                <View style={styles.dHowItem}>
                  <View style={styles.dHowIconCircle}><Feather name="check-square" size={14} color={C.textSecondary} /></View>
                  <Text style={styles.dHowText}><Text style={styles.dHowBold}>bulk actions</Text> — long-press any debt or split to select. archive or delete multiple items at once.</Text>
                </View>
                <View style={styles.dHowItem}>
                  <View style={styles.dHowIconCircle}><Feather name="edit-2" size={14} color={C.textSecondary} /></View>
                  <Text style={styles.dHowText}><Text style={styles.dHowBold}>edit tracking</Text> — payment edits are logged. look for the "edited" badge on modified payments.</Text>
                </View>
                <View style={styles.dHowItem}>
                  <View style={styles.dHowIconCircle}><Feather name="scissors" size={14} color={C.textSecondary} /></View>
                  <Text style={styles.dHowText}><Text style={styles.dHowBold}>splits</Text> — divide expenses with friends using equal, custom, or item-based methods.</Text>
                </View>
              </ScrollView>

              <TouchableOpacity
                style={styles.dHowDismiss}
                onPress={() => setHowItWorksVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.dHowDismissText}>got it</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}

      {sortModalVisible && (<Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={() => setSortModalVisible(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setSortModalVisible(false)}>
          <View
            style={{
              position: 'absolute',
              top: 120,
              right: 16,
              width: 240,
              backgroundColor: C.surface,
              borderRadius: RADIUS.lg,
              ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
              paddingVertical: 8,
              overflow: 'hidden',
            }}
          >
            <Pressable onPress={() => {}}>
              {/* Filter by Type — debts tab only */}
              {activeTab === 'debts' && (
                <>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: C.textSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.debts.filterByType}</Text>
                  {([
                    { key: 'they_owe' as const, label: t.debts.theyOweFilter },
                    { key: 'i_owe' as const, label: t.debts.iOweFilter },
                  ]).map((f) => {
                    const isActive = debtTypeFilter === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isActive ? withAlpha(C.accent, 0.06) : 'transparent' }}
                        onPress={() => setDebtTypeFilter(isActive ? null : f.key)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 14, color: isActive ? C.accent : C.textPrimary, fontWeight: isActive ? '600' : '400' }}>{f.label}</Text>
                        {isActive && <Feather name="check" size={16} color={C.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                  <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16, marginVertical: 4 }} />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: C.textSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.debts.filterByStatus}</Text>
                  {([
                    { key: 'pending' as const, label: t.debts.pending },
                    { key: 'partial' as const, label: t.debts.partial },
                    { key: 'settled' as const, label: t.debts.settled },
                  ]).map((f) => {
                    const isActive = debtFilter === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isActive ? withAlpha(C.accent, 0.06) : 'transparent' }}
                        onPress={() => setDebtFilter(isActive ? null : f.key)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 14, color: isActive ? C.accent : C.textPrimary, fontWeight: isActive ? '600' : '400' }}>{f.label}</Text>
                        {isActive && <Feather name="check" size={16} color={C.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                  <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16, marginVertical: 4 }} />
                </>
              )}
              {/* Sort By */}
              <Text style={{ fontSize: 11, fontWeight: '600', color: C.textSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.debts.sortBy}</Text>
              {([
                { key: 'newest' as const, label: t.debts.newestFirst, icon: 'arrow-down' as const },
                { key: 'oldest' as const, label: t.debts.oldestFirst, icon: 'arrow-up' as const },
                { key: 'amount_high' as const, label: t.debts.highestAmount, icon: 'trending-up' as const },
                { key: 'amount_low' as const, label: t.debts.lowestAmount, icon: 'trending-down' as const },
              ]).map((option) => {
                const currentSort = activeTab === 'splits' ? splitSort : debtSort;
                const isActive = currentSort === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isActive ? withAlpha(C.accent, 0.06) : 'transparent' }}
                    onPress={() => {
                      if (activeTab === 'splits') setSplitSort(option.key);
                      else setDebtSort(option.key);
                      setSortModalVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name={option.icon} size={16} color={isActive ? C.accent : C.textSecondary} />
                    <Text style={{ flex: 1, fontSize: 14, color: isActive ? C.accent : C.textPrimary, fontWeight: isActive ? '600' : '400' }}>{option.label}</Text>
                    {isActive && <Feather name="check" size={16} color={C.accent} />}
                  </TouchableOpacity>
                );
              })}
              {/* Clear filters button — show when any filter active */}
              {(debtTypeFilter || debtFilter) && activeTab === 'debts' && (
                <>
                  <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 16, marginVertical: 4 }} />
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
                    onPress={() => { setDebtTypeFilter(null); setDebtFilter(null); setSortModalVisible(false); }}
                    activeOpacity={0.7}
                  >
                    <Feather name="x-circle" size={16} color={C.gold} />
                    <Text style={{ fontSize: 14, color: C.gold, fontWeight: '600' }}>{t.debts.clearFilters}</Text>
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>)}

      {/* ── Inline Category Manager (no navigation needed) ── */}
      <CategoryManager
        visible={categoryManagerType !== null}
        onClose={() => {
          setCategoryManagerType(null);
          if (categoryManagerCallerRef.current === 'payment') {
            setPaymentModalVisible(true);
          } else {
            setDebtModalVisible(true);
          }
        }}
        type={categoryManagerType ?? 'expense'}
        mode={mode === 'personal' ? 'personal' : 'business'}
      />
      <ScreenGuide
        id="guide_debts"
        title={t.guide.whoOwesWho}
        icon="git-branch"
        description={t.guide.descDebt}
        accent={iOweColor}
      />
      {/* Floats above the keyboard with a "Done" button — needed because multi-line
          inputs use Enter for new lines instead of submit.
          KeyboardToolbar handles single-line inputs at the screen level (e.g. amount fields).
          InputAccessoryView (iOS-only) handles multi-line inputs INSIDE Modals — KeyboardToolbar
          can't see across native Modal windows. */}
      <KeyboardToolbar />
    </View>
  );
};

const makeStyles = (C: typeof CALM, isDark: boolean) => {
  // Resolve WCAG-safe tokens once for static StyleSheet rules.
  const settledC = semantic(DEBT_STATUSES_SAFE[2].color, isDark); // sky
  const destructiveC = semantic(BIZ_SAFE.destructive, isDark);    // terracotta
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 80,
  },

  // Hero — Two Mini Stat Cards
  heroRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  heroTile: {
    flex: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  heroTileLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  heroTileAmount: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? -0.1 : -0.3,
  },
  heroTileSub: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },

  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: C.border,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    padding: 0,
  },

  // Debt Filter Pills
  mergedFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  debtFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  debtFilterPillActive: {
    backgroundColor: withAlpha(C.accent, 0.12),
    borderColor: C.accent,
  },
  debtFilterText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  debtFilterTextActive: {
    color: C.accent,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },
  sortOptionActive: {
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  sortOptionText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  sortOptionTextActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // (Legacy summary styles kept for any references)
  summaryCard: {
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: C.border,
    marginHorizontal: SPACING.sm,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.3,
  },
  summaryAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  netBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  netLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: 0.2,
  },
  netAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: C.accent,
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  tabTextActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.bold,
  },

  // Debt Cards
  debtCard: {
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
  },
  // TransactionsList-style row wrap for debts (replaces Card + border-left)
  debtRowWrap: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  debtRowWrapSelected: {
    borderColor: C.accent,
    borderWidth: 1.5,
  },
  debtRowRail: {
    width: 3,
  },
  debtRowBody: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  debtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  debtAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
    borderWidth: 1.5,
  },
  debtAvatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  debtInfo: {
    flex: 1,
  },
  debtName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: 2,
  },
  debtDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  debtTimestamp: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.neutral,
    marginTop: 2,
  },
  debtAmountCol: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  debtAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statusText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  typePillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  debtActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  debtActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    // Fluid: each button takes ~half the row, stretches to fill leftover space.
    // With 4 actions you get a clean 2×2 grid; 3 actions → 2+1 stretched; 5 → 2+2+1 stretched.
    flexBasis: '47%',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 100,
  },
  debtActionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // V2 — primary action + icon-row pattern (replaces the chaotic 5-button grid)
  debtActionsV2: {
    marginTop: SPACING.sm,
    gap: SPACING.sm + 2,
  },
  debtPrimaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    width: '100%',
    borderWidth: 1,
  },
  debtPrimaryActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.4,
  },
  debtIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: SPACING.sm,
  },
  debtIconChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.04),
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.06),
  },

  // Split Cards
  splitCard: {
    marginBottom: SPACING.sm,
  },
  // Direction B — TransactionsList-style split row (replaces splitCard usage)
  splitRowWrap: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  splitRowWrapSelected: {
    borderColor: C.accent,
    borderWidth: 1.5,
  },
  splitRowRail: {
    width: 3,
  },
  splitRowBody: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: 6,
  },
  splitRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  splitRowTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  splitRowTitle: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.1,
  },
  splitRowAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  splitRowSubtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  splitRowChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  splitRowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
  },
  splitRowChipText: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    maxWidth: 64,
  },

  // Direction B — "ticker tape" split row
  tickerSplitRow: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  tickerSplitRowSelected: {
    borderColor: C.accent,
    borderWidth: 1.5,
  },
  tickerSplitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
  },
  tickerSplitTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  // Dotted leader between title and amount — gives the receipt/ticker feel
  tickerLeader: {
    flex: 1,
    height: 1,
    borderBottomWidth: 1,
    borderStyle: 'dotted',
    borderColor: withAlpha(C.textPrimary, 0.15),
    marginBottom: 4,
  },
  tickerSplitAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  tickerProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.06),
    overflow: 'hidden',
  },
  tickerProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  tickerSplitFooter: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
  },

  // Ticker tape — debt row variant (avatar preserved)
  tickerDebtRow: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  tickerDebtHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  tickerDebtAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  tickerDebtAvatarText: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  tickerDebtName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.1,
    flexShrink: 0,
    maxWidth: '40%',
  },
  tickerDebtTypeChip: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
    fontStyle: 'italic',
  },
  tickerDebtDesc: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 2,
    marginLeft: 30, // align with name (after avatar)
  },

  // Settings modal — toggle row + custom switch
  dHowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    paddingVertical: SPACING.md,
  },
  dHowButtonText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  dHowOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.4),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  dHowCard: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '75%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C === CALM_DARK ? withAlpha(C.textPrimary, 0.12) : withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  dHowCardHeader: {
    marginBottom: SPACING.md,
  },
  dHowCardTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.1 : -0.3,
  },
  dHowCardSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 4,
    lineHeight: 16,
  },
  dHowGroupLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  dHowItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm + 2,
    backgroundColor: withAlpha(C.textPrimary, 0.025),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 2,
    marginBottom: 6,
  },
  dHowIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.05),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dHowText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    lineHeight: 18,
  },
  dHowBold: {
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  dHowDismiss: {
    alignItems: 'center',
    paddingVertical: SPACING.sm + 4,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
  },
  dHowDismissText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    letterSpacing: 0.2,
  },
  dSettingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  dSettingsRowTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: 4,
  },
  dSettingsRowSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    lineHeight: 16,
  },
  dSettingsToggle: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: withAlpha(C.textPrimary, 0.12),
    padding: 2,
    justifyContent: 'center',
  },
  dSettingsToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.surface,
    ...(C === CALM_DARK ? {} : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 }),
  },

  // Split Detail modal — TransactionsList edit-sheet vibe
  detailHeroCard: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.07 : 0.03),
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  detailHeroDescription: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.1,
  },
  detailHeroAmount: {
    fontSize: 28,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  detailHeroSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    textTransform: 'lowercase',
  },
  detailMetaSection: {
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  detailMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(C.textPrimary, 0.05),
  },
  detailMetaLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    textTransform: 'lowercase',
    letterSpacing: 0.3,
  },
  detailMetaValue: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },
  detailSectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    textTransform: 'lowercase',
    letterSpacing: 0.4,
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
  },
  detailPersonRow: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  detailPersonRail: {
    width: 3,
  },
  detailPersonBody: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  detailPersonTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  detailPersonAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailPersonInitial: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  detailPersonName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.1,
  },
  detailPersonStatus: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 1,
  },
  detailPersonAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  detailPersonAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  detailPersonActionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.2,
  },
  detailPersonItems: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: withAlpha(C.textPrimary, 0.05),
    gap: 4,
  },
  detailItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailItemName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  detailItemAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },

  // Add/Edit Debt modal — full bottom-sheet container (animated wrapper)
  dDebtBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dDebtSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    maxHeight: '92%',
  },
  dDebtScrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  // Anchored save zone (pinned at sheet bottom, above keyboard)
  dDebtSaveZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.surface,
  },
  // Floating gold "done" FAB — appears above the keyboard, dismisses it on tap.
  // Mirrors the NoteEditor pattern; rendered inside each modal so it floats above its content.
  doneFab: {
    position: 'absolute',
    right: SPACING.md,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
  },
  dDebtSaveBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  dDebtSaveBtnDisabled: {
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.08),
  },
  dDebtSaveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dDebtSaveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.surface,
    letterSpacing: 0.3,
  },
  dDebtSaveBtnTextDisabled: {
    color: C.textMuted,
  },
  // Secondary text-link below save (close, with X icon)
  dDebtSecondaryLink: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
  },
  dDebtSecondaryLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  dDebtSecondaryLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  // Delete debt link — sits in scroll content (edit mode only), trash icon
  dDebtDeleteLink: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
  },
  dDebtDeleteLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  dDebtDeleteLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },

  // Add/Edit Debt modal — TransactionsList edit-sheet pattern
  // Top row with drag-handle visual + subtle close
  dDebtSheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    position: 'relative',
  },
  dDebtSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.15),
  },
  dDebtSheetCloseBtn: {
    position: 'absolute',
    right: 0,
    top: 4,
    padding: 6,
  },
  // Centered title zone with italic serif accent
  dDebtTitleZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  dDebtTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
    textAlign: 'center',
  },
  dDebtTitleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  dDebtSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: SPACING.xs + 2,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  // Hero amount card — surface bg, label + inline tap-to-flip toggle, big input
  dDebtFieldHeroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.sm + 2,
  },
  dDebtFieldHeroLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  dDebtFieldCardLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  dDebtFieldOptional: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
    fontStyle: 'italic',
  },
  dDebtFieldRequiredStar: {
    fontSize: TYPOGRAPHY.size.sm,
    color: '#C1694F', // terracotta — palette's closest tone to "red"
    fontWeight: TYPOGRAPHY.weight.bold,
  },

  // Record Payment — context card with live progress preview + quick-fill chips
  dPayContextCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  dPayContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  dPayContextAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dPayContextAvatarText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  dPayContextName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  dPayContextDesc: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  dPayContextAmounts: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: SPACING.sm,
  },
  dPayContextAmountItem: {
    flex: 1,
    alignItems: 'center',
  },
  dPayContextDivider: {
    width: 1,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.08),
    marginHorizontal: SPACING.sm,
  },
  dPayContextAmountLabel: {
    fontSize: 10,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    textTransform: 'lowercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  dPayContextAmountValue: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },
  // Live progress preview — solid current + ghost projected
  dPayProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.06),
    overflow: 'hidden',
    marginTop: SPACING.xs,
    position: 'relative',
  },
  dPayProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  dPayProgressGhost: {
    position: 'absolute',
    top: 0,
    height: '100%',
  },
  dPayProgressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  dPayProgressLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
  },
  // Quick-fill chips — ¼ / half / full of remaining
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.15),
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.sm + 2,
  },
  tipBannerText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
    letterSpacing: 0.1,
  },
  // Tip confirmation overlay
  tipModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: withAlpha(C.dimBg, 0.5),
  },
  tipModalCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  tipModalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: C.surface,
    borderRadius: RADIUS['2xl'],
    borderWidth: 1,
    borderColor: C === CALM_DARK ? withAlpha(C.textPrimary, 0.12) : withAlpha(C.textPrimary, 0.06),
    paddingHorizontal: SPACING.lg + 4,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  tipModalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withAlpha(C.bronze, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  tipModalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: C === CALM_DARK ? 0 : -0.2,
  },
  tipModalDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: SPACING.lg,
  },
  tipModalBreakdown: {
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.07 : 0.03),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.06),
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  tipModalBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(C.textPrimary, 0.05),
  },
  tipModalBreakdownRowLast: {
    borderBottomWidth: 0,
  },
  tipModalBreakdownLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
    letterSpacing: 0.1,
  },
  tipModalBreakdownValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  tipModalExtraRow: {
    alignItems: 'flex-end',
    paddingTop: 4,
  },
  tipModalExtraPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: withAlpha(C.bronze, 0.10),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 3,
  },
  tipModalExtraText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    letterSpacing: 0.1,
  },
  tipModalConfirmBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bronze,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm,
  },
  tipModalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.3,
  },
  tipModalCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  tipModalCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  dPayQuickChipRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  dPayQuickChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    gap: 2,
  },
  dPayQuickChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: 0.3,
  },
  dPayQuickChipAmount: {
    fontSize: 10,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
  },
  // Segmented type toggle (both options visible) — tap to switch
  dDebtTypeSegmented: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.06),
    borderRadius: RADIUS.full,
    padding: 4,
    marginTop: SPACING.md,
  },
  dDebtTypeSegBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    minHeight: 36,
  },
  dDebtTypeSegBtnText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  dDebtFieldHeroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: SPACING.xs,
  },
  dDebtFieldHeroCurrency: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
    marginRight: 4,
    letterSpacing: -0.2,
    maxWidth: '40%',
  },
  dDebtFieldHeroAmountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.8,
    paddingVertical: 0,
  },
  // Quiet hairline divider — separates hero from form fields
  dDebtSheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.06),
    marginVertical: SPACING.sm,
  },
  // Generic field card (description, due date, etc.)
  dDebtFieldCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm + 2,
  },
  dDebtFieldCardInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    minHeight: 22,
  },
  // Multi-line variant — for description / note fields where users may write longer text.
  // Starts at ~3 lines, grows naturally as the user types.
  dDebtFieldMultiline: {
    minHeight: 64,
    paddingTop: 4,
    paddingBottom: 4,
    lineHeight: 20,
  },
  // iOS accessory bar above keyboard — single Done button on the right.
  dDebtAccessoryBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    backgroundColor: C.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.1),
  },
  dDebtAccessoryDone: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    letterSpacing: 0.3,
  },
  dDebtFieldDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  dDebtFieldDateText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  splitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  splitInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  splitTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: 2,
  },
  splitSubtext: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },
  splitAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  splitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  methodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  methodPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  participantCount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  splitParticipants: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  participantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
  },
  participantChipPaid: {
    backgroundColor: withAlpha(settledC, 0.1),
    borderColor: withAlpha(settledC, 0.3),
  },
  participantChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    maxWidth: 80,
  },
  participantChipTextPaid: {
    color: settledC,
  },
  splitActions: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING['2xl'],
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  modalTitleAccent: {
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    paddingLeft: SPACING.sm,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING['2xl'],
  },

  // Form elements
  formLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  formLabelOptional: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
  },
  formInput: {
    backgroundColor: C.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderWidth: 1.5,
    borderColor: withAlpha(C.accent, 0.2),
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dateButtonText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  datePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  datePickerCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  datePickerTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  datePickerDone: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
  },
  typeContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.background,
  },
  typeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  methodContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  methodButtonActive: {
    borderColor: C.accent,
    backgroundColor: withAlpha(C.accent, 0.12),
  },
  methodText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  methodTextActive: {
    color: C.accent,
  },

  // Custom split
  customSection: {
    marginTop: SPACING.sm,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  customName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  customInput: {
    width: 100,
    backgroundColor: C.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: C.border,
  },

  // Item-based split
  addItemRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  addItemButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  itemName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  itemAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  assignLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
  },
  assignChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  assignChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  assignChipActive: {
    backgroundColor: withAlpha(C.accent, 0.12),
    borderColor: C.accent,
  },
  assignChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    maxWidth: 80,
  },
  assignChipTextActive: {
    color: C.accent,
  },

  // Split Detail
  detailTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  detailSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },
  participantList: {
    gap: SPACING.md,
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantAvatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  participantName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  participantAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  paidBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  markPaidButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  markPaidText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  splitPaidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: withAlpha(C.positive, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginRight: SPACING.sm,
  },
  splitPaidChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.positive,
  },
  splitMarkPaidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: withAlpha(C.textSecondary, 0.08),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginRight: SPACING.sm,
  },
  splitMarkPaidChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },

  // Wizard
  wizardContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    paddingTop: SPACING['2xl'],
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: 0,
    maxHeight: '92%',
  },
  wizardStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING['2xl'],
    gap: 0,
  },
  wizardStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wizardStepLine: {
    width: 28,
    height: 2,
    backgroundColor: C.border,
    marginHorizontal: SPACING.xs,
  },
  wizardStepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  wizardStepNum: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textSecondary,
  },
  wizardTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.lg,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  wizardSubtitle: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },
  wizardContext: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  wizardContextText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  wizardAmountDisplay: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  wizardAmountBig: {
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.md,
  },
  wizardAmountBreakdown: {
    gap: SPACING.xs,
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  wizardBreakdownText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  wizardAmountActions: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  wizardCorrectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: C.positive,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  wizardCorrectText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  wizardEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 2,
    borderColor: C.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  wizardEditText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  wizardOptionCard: {
    borderWidth: 2,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  wizardOptionCardActive: {
    borderColor: C.accent,
    backgroundColor: withAlpha(C.accent, 0.04),
  },
  wizardOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  wizardOptionTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  wizardOptionDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: 20,
  },
  wizardAssignAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    alignSelf: 'flex-end',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.08),
    borderRadius: RADIUS.sm,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  wizardAssignAllText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  wizardSummarySection: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  wizardSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
  },
  wizardSummaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    flexShrink: 0,
  },
  wizardSummaryValue: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textAlign: 'right',
    flexShrink: 1,
  },
  wizardPersonCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  wizardPersonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  wizardPersonName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  wizardPersonTotal: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
    fontVariant: ['tabular-nums'],
  },
  wizardShareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 52,
    paddingVertical: 2,
  },
  wizardShareName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },
  wizardShareAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // Who paid cards
  wizardPayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
  },
  wizardPayerCardActive: {
    borderColor: C.accent,
    backgroundColor: withAlpha(C.accent, 0.04),
  },
  wizardPayerName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },

  // Debt preview
  wizardDebtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },
  wizardDebtText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  wizardDebtAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },

  // Item assignment
  itemAssignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  itemUnassignedText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontStyle: 'italic',
  },
  itemAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: withAlpha(C.accent, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Add Me button
  addMeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.08),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.2),
    marginBottom: SPACING.lg,
  },
  addMeBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },

  // Assignment modal overlay
  assignModalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING['2xl'],
    maxHeight: '80%',
  },
  assignModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  assignModalItemName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  assignModalItemAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  assignModalLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: SPACING.sm,
  },
  assignManualRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  assignManualAddBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignFromContactsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: SPACING.md,
  },
  assignFromContactsText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  assignDoneBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    backgroundColor: C.accent,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  assignDoneText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // Phone contact rows
  phoneContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  phoneContactRowSelected: {
    backgroundColor: withAlpha(C.accent, 0.06),
  },
  phoneContactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(C.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  phoneContactAvatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  phoneContactName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  phoneContactPhone: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: 2,
  },

  // Scanning overlay
  scanningOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanningCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS['2xl'],
    padding: SPACING['3xl'],
    alignItems: 'center',
    gap: SPACING.lg,
    width: 220,
  },
  scanningTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  scanningSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
  },

  // Choice card (FAB / Split choice)
  choiceCard: {
    width: '82%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    ...SHADOWS['2xl'],
  },
  choiceTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  choiceSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  choiceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.accent, 0.1),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  choiceLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  choiceDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: 1,
  },

  // Request Payment
  requestPaymentRecipient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  requestPaymentOwes: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.positive,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  requestPaymentLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: SPACING.sm,
  },
  requestPaymentMessageInput: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    lineHeight: 20,
    minHeight: 240,
    maxHeight: 320,
  },
  requestPaymentCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.08),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.2),
  },
  requestPaymentCopyText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  requestPaymentQrSection: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  requestPaymentQrImage: {
    width: 180,
    height: 180,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    backgroundColor: C.background,
  },
  requestPaymentShareQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: C.accent,
    borderRadius: RADIUS.md,
  },
  requestPaymentShareQrText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  requestPaymentQrHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: withAlpha(C.textSecondary, 0.06),
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  requestPaymentQrHintText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: 18,
  },
  requestPaymentWhatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: '#25D366',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#25D366',
  },
  requestPaymentWhatsAppText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // Selection mode
  selectionCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  selectionCheckboxActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopWidth: 2,
    borderTopColor: C.accent,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING['3xl'],
  },
  selectionBarTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  selectionBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  selectionBarBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  selectionBarCount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
  },
  selectionBarActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  selectionEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.1),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.accent,
  },
  selectionEditText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  selectionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: withAlpha(destructiveC, 0.9),
    borderRadius: RADIUS.md,
  },
  selectionDeleteText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // Split filter (legacy — kept for back-compat with any stale references)
  splitFilterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  splitFilterPill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
  },
  splitFilterPillActive: {
    backgroundColor: withAlpha(C.accent, 0.12),
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  splitFilterText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  splitFilterTextActive: {
    color: C.accent,
  },

  // Direction B — segmented control + hero card + drafts header
  segmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.04),
    borderRadius: RADIUS.full,
    padding: 4,
    marginBottom: SPACING.md,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    minHeight: 36,
  },
  segmentTabText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    letterSpacing: 0.1,
  },
  segmentTabBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  draftBookmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: withAlpha(C.bronze, 0.1),
    borderRadius: RADIUS.full,
    minHeight: 36,
  },
  draftBookmarkCount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },
  splitHeroCard: {
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  splitHeroLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'lowercase',
    marginBottom: 4,
  },
  splitHeroAmount: {
    fontSize: 32,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  splitHeroSub: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  draftsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  backChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.05),
    borderRadius: RADIUS.full,
  },
  backChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  draftsTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  draftsTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },

  // Payment modal redesign
  payContextCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  payContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  payContextAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payContextAvatarText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  payContextName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  payContextDesc: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginTop: 1,
  },
  payContextAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  payContextAmountItem: {
    flex: 1,
    alignItems: 'center',
  },
  payContextAmountLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  payContextAmountValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  payContextDivider: {
    width: 1,
    height: 20,
    backgroundColor: C.border,
  },
  payAmountRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  payQuickFill: {
    backgroundColor: withAlpha(C.accent, 0.1),
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.2),
  },
  payQuickFillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  payHistorySection: {
    marginTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: SPACING.md,
  },
  payHistoryTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
  },
  payHistoryItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  payHistoryIcon: {
    marginTop: 2,
  },
  payHistoryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payHistoryAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  payHistoryDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },
  payHistoryTip: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 2,
  },
  payHistoryNote: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: 2,
  },
  payHistoryDelete: {
    padding: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  payHistoryEditHint: {
    padding: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  amountWarnRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  amountWarnText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    flex: 1,
    lineHeight: 16,
  },
  settledNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: withAlpha(C.positive, 0.08),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  settledNoticeText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.positive,
    flex: 1,
  },
  // Payment detail modal
  payDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  payDetailMeta: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  payDetailMetaHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  payDetailDivider: {
    height: 1,
    backgroundColor: withAlpha(C.accent, 0.08),
    marginVertical: SPACING.md,
  },
  payDetailActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  // Edited badge on payment history rows
  payEditedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  payEditedBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
  },
  // Edit history section in payment detail
  editHistorySection: {
    marginTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: withAlpha(C.accent, 0.08),
    paddingTop: SPACING.md,
  },
  editHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  editHistoryTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    flex: 1,
  },
  editHistoryCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  editHistoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  editHistoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(C.bronze, 0.5),
    marginTop: 5,
  },
  editHistoryMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginBottom: 1,
  },
  editHistoryDetail: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
});
};

export default DebtTracking;
