import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
  LayoutAnimation,
  UIManager,
  RefreshControl,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { format, differenceInDays, isValid } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { scanReceipt } from '../../services/receiptScanner';
import { useDebtStore } from '../../store/debtStore';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import { useBusinessStore } from '../../store/businessStore';
import { useWalletStore } from '../../store/walletStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CALM,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  SPLIT_METHODS,
  DEBT_TYPES,
  DEBT_STATUSES,
  withAlpha,
} from '../../constants';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ProgressBar from '../../components/common/ProgressBar';
import ContactPicker from '../../components/common/ContactPicker';
import FAB from '../../components/common/FAB';
import WalletPicker from '../../components/common/WalletPicker';
import CategoryPicker from '../../components/common/CategoryPicker';
import CategoryManager from '../../components/common/CategoryManager';
import CalendarPicker from '../../components/common/CalendarPicker';
import { useToast } from '../../context/ToastContext';
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
  DebtTracking: { receiptData?: { vendor: string; total: number; items: { name: string; amount: number }[] } } | undefined;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DebtTracking: React.FC = () => {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<DebtTrackingParams, 'DebtTracking'>>();
  const navigation = useNavigation();
  const { showToast } = useToast();
  const mode = useAppStore((state) => state.mode);
  const currency = useSettingsStore((state) => state.currency);
  const userName = useSettingsStore((state) => state.userName);
  const personalQrs = useSettingsStore((state) => state.paymentQrs);
  const businessQrs = useSettingsStore((state) => state.businessPaymentQrs);
  const paymentQrs = mode === 'business' ? businessQrs : personalQrs;
  const hasPaymentQr = useMemo(() => paymentQrs.length > 0, [paymentQrs]);

  const getSelfContact = useCallback((): Contact => ({
    id: '__self__',
    name: userName?.trim() || 'Me',
    isFromPhone: false,
  }), [userName]);

  const debts = useDebtStore((s) => s.debts);
  const splits = useDebtStore((s) => s.splits);
  const addDebt = useDebtStore((s) => s.addDebt);
  const updateDebt = useDebtStore((s) => s.updateDebt);
  const deleteDebt = useDebtStore((s) => s.deleteDebt);
  const addPayment = useDebtStore((s) => s.addPayment);
  const deletePayment = useDebtStore((s) => s.deletePayment);
  const updatePayment = useDebtStore((s) => s.updatePayment);
  const addSplit = useDebtStore((s) => s.addSplit);
  const updateSplit = useDebtStore((s) => s.updateSplit);
  const deleteSplit = useDebtStore((s) => s.deleteSplit);
  const markSplitParticipantPaid = useDebtStore((s) => s.markSplitParticipantPaid);
  const unmarkSplitParticipantPaid = useDebtStore((s) => s.unmarkSplitParticipantPaid);

  const addTransaction = usePersonalStore((state) => state.addTransaction);
  const updateTransaction = usePersonalStore((state) => state.updateTransaction);
  const deleteTransaction = usePersonalStore((state) => state.deleteTransaction);
  const addBusinessTransaction = useBusinessStore((state) => state.addBusinessTransaction);
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

  // Debt modal state
  const [debtModalVisible, setDebtModalVisible] = useState(false);
  const [debtModalAnimation, setDebtModalAnimation] = useState<'fade' | 'none'>('fade');
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [debtContacts, setDebtContacts] = useState<Contact[]>([]);
  const [debtType, setDebtType] = useState<DebtType>('they_owe');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDescription, setDebtDescription] = useState('');
  const [debtCategory, setDebtCategory] = useState('');
  const [debtDueDate, setDebtDueDate] = useState('');
  const [debtDueDateObj, setDebtDueDateObj] = useState<Date | null>(null);
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);

  // Split modal state
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
  const [paymentModalAnimation, setPaymentModalAnimation] = useState<'fade' | 'none'>('fade');
  const [paymentDebtId, setPaymentDebtId] = useState<string | null>(null);
  const [paymentViewOnly, setPaymentViewOnly] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentWalletId, setPaymentWalletId] = useState<string | null>(null);
  const [paymentCategory, setPaymentCategory] = useState('');

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

  // Item assignment state
  const [assigningItemIndex, setAssigningItemIndex] = useState<number | null>(null);
  const [itemManualName, setItemManualName] = useState('');
  const [itemAssignMode, setItemAssignMode] = useState<'assign' | 'contacts'>('assign');
  const [itemPhoneContacts, setItemPhoneContacts] = useState<Contact[]>([]);
  const [itemContactSearch, setItemContactSearch] = useState('');

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
  const [splitFilter, setSplitFilter] = useState<'active' | 'settled'>('active');

  // Search + debt filter
  const [searchQuery, setSearchQuery] = useState('');
  const [debtFilter, setDebtFilter] = useState<'pending' | 'partial' | 'settled' | null>(null);
  const [debtTypeFilter, setDebtTypeFilter] = useState<'i_owe' | 'they_owe' | null>(null);
  const [debtSort, setDebtSort] = useState<'newest' | 'oldest' | 'amount_high' | 'amount_low'>('newest');
  const [splitSort, setSplitSort] = useState<'newest' | 'oldest' | 'amount_high' | 'amount_low'>('newest');
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const [expandedPersonIds, setExpandedPersonIds] = useState<Set<string>>(new Set());

  // Filtered data
  const modeDebts = useMemo(() => debts.filter((d) => d.mode === mode), [debts, mode]);
  const modeSplits = useMemo(() => splits.filter((s) => s.mode === mode), [splits, mode]);

  // Search + type + status filtered + sorted debts
  const filteredDebts = useMemo(() => {
    let result = modeDebts;
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
  }, [modeDebts, debtTypeFilter, debtFilter, searchQuery, debtSort]);

  const groupedDebts = useMemo(() => {
    const map = new Map<string, { contactId: string; contactName: string; contact: typeof filteredDebts[0]['contact']; debts: typeof filteredDebts; totalRemaining: number }>();
    filteredDebts.forEach((debt) => {
      const key = debt.contact.id || debt.contact.name;
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

  const filteredSplits = useMemo(() => {
    const filtered = searchedSplits.filter((split) => {
      const nonSelfParticipants = split.participants.filter((p) => p.contact.id !== '__self__');
      const allPaid = nonSelfParticipants.length > 0 && nonSelfParticipants.every((p) => p.isPaid);
      return splitFilter === 'settled' ? allPaid : !allPaid;
    });
    return [...filtered].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      switch (splitSort) {
        case 'newest': return bTime - aTime;
        case 'oldest': return aTime - bTime;
        case 'amount_high': return b.totalAmount - a.totalAmount || bTime - aTime;
        case 'amount_low': return a.totalAmount - b.totalAmount || bTime - aTime;
        default: return 0;
      }
    });
  }, [searchedSplits, splitFilter, splitSort]);

  const activeSplitCount = useMemo(() => {
    return searchedSplits.filter((s) => {
      const nonSelf = s.participants.filter((p) => p.contact.id !== '__self__');
      return nonSelf.length === 0 || !nonSelf.every((p) => p.isPaid);
    }).length;
  }, [searchedSplits]);

  const settledSplitCount = useMemo(() => searchedSplits.length - activeSplitCount, [searchedSplits.length, activeSplitCount]);

  // Debt filter counts (respects type filter + search)
  const debtFilterCounts = useMemo(() => {
    let base = modeDebts;
    if (debtTypeFilter) {
      base = base.filter((d) => d.type === debtTypeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      base = base.filter((d) =>
        d.contact.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
      );
    }
    return {
      pending: base.filter((d) => d.status === 'pending').length,
      partial: base.filter((d) => d.status === 'partial').length,
      settled: base.filter((d) => d.status === 'settled').length,
    };
  }, [modeDebts, debtTypeFilter, searchQuery]);

  // Debt type filter counts (respects status filter + search)
  const debtTypeCounts = useMemo(() => {
    let base = modeDebts;
    if (debtFilter) {
      base = base.filter((d) => d.status === debtFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      base = base.filter((d) =>
        d.contact.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
      );
    }
    return {
      i_owe: base.filter((d) => d.type === 'i_owe').length,
      they_owe: base.filter((d) => d.type === 'they_owe').length,
    };
  }, [modeDebts, debtFilter, searchQuery]);

  const getDebtAge = useCallback((createdAt: string | Date): string => {
    const days = differenceInDays(new Date(), new Date(createdAt));
    if (days < 7) return `${days}d`;
    if (days < 30) return `${Math.floor(days / 7)}w`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
  }, []);

  const getReminderTone = useCallback((createdAt: string | Date, contactName: string, amount: number, description: string, currency: string): string => {
    const days = differenceInDays(new Date(), new Date(createdAt));
    const amountStr = `${currency} ${amount.toFixed(2)}`;
    if (days < 7) {
      return `Hey ${contactName}, just a quick reminder about ${amountStr} for ${description} 😊\n\nNo rush, just checking in!`;
    } else if (days < 30) {
      return `Hi ${contactName}, friendly reminder that ${amountStr} for ${description} is still outstanding.\n\nLet me know if you need any details. Thank you!`;
    } else {
      return `Hi ${contactName}, could you please settle ${amountStr} for ${description} when you get a chance?\n\nIt's been a while and I'd appreciate it. Thank you!`;
    }
  }, []);

  // Balance summary
  const balanceSummary = useMemo(() => {
    const youOwe = modeDebts
      .filter((d) => d.type === 'i_owe' && d.status !== 'settled')
      .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);

    const owedToYou = modeDebts
      .filter((d) => d.type === 'they_owe' && d.status !== 'settled')
      .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);

    const collected = modeDebts
      .filter((d) => d.type === 'they_owe')
      .reduce((sum, d) => sum + d.paidAmount, 0);

    return { youOwe, owedToYou, collected };
  }, [modeDebts]);

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
    setDebtDueDate('');
    setDebtDueDateObj(null);
    setDueDatePickerOpen(false);
  }, []);

  const handleEditDebt = useCallback((debt: Debt) => {
    setEditingDebtId(debt.id);
    setDebtContacts([debt.contact]);
    setDebtType(debt.type);
    setDebtAmount(debt.totalAmount.toString());
    setDebtDescription(debt.description);
    setDebtCategory(debt.category || '');
    const rawDue = (debt as any).dueDate;
    if (rawDue) {
      const d = new Date(rawDue);
      setDebtDueDateObj(d);
      setDebtDueDate(format(d, 'd MMM yyyy'));
    } else {
      setDebtDueDateObj(null);
      setDebtDueDate('');
    }
    setDebtModalVisible(true);
  }, []);

  const handleSaveDebt = useCallback(() => {
    if (debtContacts.length === 0) {
      showToast('Please select a contact', 'error');
      return;
    }
    if (!debtAmount || parseFloat(debtAmount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    if (!debtDescription.trim()) {
      showToast('Please add a description', 'error');
      return;
    }

    if (editingDebtId) {
      const existingDebt = debts.find((d) => d.id === editingDebtId);
      const newTotal = parseFloat(debtAmount);

      if (existingDebt && debtType !== existingDebt.type && existingDebt.payments.length > 0) {
        showToast('Cannot change debt direction after payments have been recorded.', 'error');
        return;
      }

      if (existingDebt && newTotal < existingDebt.paidAmount) {
        Alert.alert(
          'Amount Below Paid',
          `New amount (RM ${newTotal.toFixed(2)}) is less than already paid (RM ${existingDebt.paidAmount.toFixed(2)}). The debt will be marked as settled.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Continue',
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
                setDebtModalVisible(false);
                resetDebtForm();
              },
            },
          ]
        );
        return;
      }

      updateDebt(editingDebtId, {
        contact: debtContacts[0],
        type: debtType,
        totalAmount: newTotal,
        description: debtDescription.trim(),
        category: debtCategory || undefined,
        dueDate: debtDueDateObj ? debtDueDateObj.toISOString() : undefined,
      } as any);
      showToast('Debt updated!', 'success');
    } else {
      addDebt({
        contact: debtContacts[0],
        type: debtType,
        totalAmount: parseFloat(debtAmount),
        description: debtDescription.trim(),
        category: debtCategory || undefined,
        dueDate: debtDueDateObj ? debtDueDateObj.toISOString() : undefined,
        mode,
      } as any);
      showToast('Debt added!', 'success');
    }

    setDebtModalVisible(false);
    resetDebtForm();
  }, [debtContacts, debtAmount, debtDescription, editingDebtId, debts, debtType, debtCategory, debtDueDateObj, mode, updateDebt, addDebt, showToast, resetDebtForm]);

  const cleanupDebtPayments = (debt: Debt) => {
    const currentWallets = useWalletStore.getState().wallets;
    debt.payments.forEach((payment) => {
      if (payment.linkedTransactionId) {
        if (debt.mode === 'personal') {
          deleteTransaction(payment.linkedTransactionId);
        } else {
          deleteBusinessTransaction(payment.linkedTransactionId);
        }
      }
      if (payment.walletId && currentWallets.some(w => w.id === payment.walletId)) {
        if (debt.type === 'they_owe') {
          deductFromWallet(payment.walletId, payment.amount);
        } else {
          addToWallet(payment.walletId, payment.amount);
        }
      }
    });
  };

  const handleDeleteDebt = useCallback((id: string) => {
    Alert.alert('Delete Debt', 'Are you sure you want to delete this debt? Linked transactions and wallet changes will also be reversed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const debt = debts.find((d) => d.id === id);
          if (debt) {
            cleanupDebtPayments(debt);
            if (debt.splitId) {
              unmarkSplitParticipantPaid(debt.splitId, debt.contact.id);
            }
          }
          deleteDebt(id);
          showToast('Debt deleted', 'success');
        },
      },
    ]);
  }, [debts, deleteDebt, showToast, unmarkSplitParticipantPaid]);

  // ── Payment Handlers ───────────────────────────────────────
  const openPaymentModal = useCallback((debtId: string, historyOnly = false) => {
    const debt = debts.find((d) => d.id === debtId);
    setPaymentDebtId(debtId);
    setPaymentViewOnly(historyOnly);
    setPaymentAmount('');
    setPaymentNote('');
    setPaymentWalletId(wallets.find((w) => w.isDefault)?.id || null);
    setPaymentCategory(debt?.type === 'they_owe' ? 'debt_paid' : 'debt_payment');
    setPaymentModalVisible(true);
  }, [debts, wallets]);

  const handleRecordPayment = useCallback(() => {
    if (!paymentDebtId) return;
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    const debt = debts.find((d) => d.id === paymentDebtId);
    if (!debt) return;

    const amount = parseFloat(paymentAmount);
    const remainingAmount = debt.totalAmount - debt.paidAmount;
    if (amount > remainingAmount) {
      const tip = Math.round((amount - remainingAmount) * 100) / 100;
      Alert.alert(
        'Extra Payment',
        `${debt.contact.name} is paying ${currency} ${amount.toFixed(2)} but only owes ${currency} ${remainingAmount.toFixed(2)}. The extra ${currency} ${tip.toFixed(2)} will be recorded as a tip.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Record with Tip', onPress: () => processPayment(debt, amount) },
        ]
      );
      return;
    }
    processPayment(debt, amount);
  }, [paymentDebtId, paymentAmount, debts, currency, showToast]);

  const processPayment = (debt: Debt, amount: number) => {
    // Guard: don't process payment on already-settled debt
    const currentDebt = useDebtStore.getState().debts.find(d => d.id === debt.id);
    if (currentDebt?.status === 'settled') {
      showToast('this debt is already settled.', 'info');
      return;
    }

    // Validate wallet still exists (could be deleted since modal opened)
    if (paymentWalletId) {
      const walletExists = wallets.some((w) => w.id === paymentWalletId);
      if (!walletExists) {
        showToast('Selected wallet no longer exists. Please pick another.', 'error');
        return;
      }
    }

    let linkedTransactionId: string | undefined;
    const remainingAmount = debt.totalAmount - debt.paidAmount;
    const tip = amount > remainingAmount ? Math.round((amount - remainingAmount) * 100) / 100 : 0;

    // Auto-create transaction: income (they_owe) or expense (i_owe)
    const txType = debt.type === 'they_owe' ? 'income' : 'expense';
    let txDesc = debt.type === 'they_owe'
      ? `Payment from ${debt.contact.name}${debt.description ? ' - ' + debt.description : ''}`
      : `Payment to ${debt.contact.name}${debt.description ? ' - ' + debt.description : ''}`;
    if (tip > 0) txDesc += ` (incl. tip ${currency} ${tip.toFixed(2)})`;

    if (mode === 'personal') {
      linkedTransactionId = addTransaction({
        amount,
        category: paymentCategory || 'other',
        description: txDesc,
        date: new Date(),
        type: txType,
        mode,
        walletId: paymentWalletId || undefined,
        inputMethod: 'manual',
      });
      // Update wallet balance
      if (paymentWalletId) {
        if (txType === 'income') {
          addToWallet(paymentWalletId, amount);
        } else {
          deductFromWallet(paymentWalletId, amount);
        }
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
      // Update wallet balance in business mode
      if (paymentWalletId) {
        if (txType === 'income') {
          addToWallet(paymentWalletId, amount);
        } else {
          deductFromWallet(paymentWalletId, amount);
        }
      }
    }

    const paymentId = addPayment(debt.id, {
      amount,
      date: new Date(),
      note: paymentNote.trim() || undefined,
      tipAmount: tip > 0 ? tip : undefined,
      linkedTransactionId,
      walletId: paymentWalletId || undefined,
    });

    // Store reverse link on transaction so edits can sync back
    if (linkedTransactionId && paymentId && mode === 'personal') {
      updateTransaction(linkedTransactionId, {
        linkedPaymentId: paymentId,
        linkedDebtId: debt.id,
      });
    }

    // Check if debt is now settled → mark split participant as paid
    const newPaidAmount = debt.paidAmount + amount;
    if (newPaidAmount >= debt.totalAmount && debt.splitId) {
      markSplitParticipantPaid(debt.splitId, debt.contact.id);
    }

    // Auto-close modal after recording
    setPaymentModalVisible(false);
    setPaymentAmount('');
    setPaymentNote('');
    showToast('Payment recorded!', 'success');

    // Re-open split detail if we came from "Mark Paid" in split view
    if (returnToSplitId) {
      setTimeout(() => {
        // Read fresh from store — closure `splits` is stale after markSplitParticipantPaid
        const freshSplits = useDebtStore.getState().splits;
        const updatedSplit = freshSplits.find((s) => s.id === returnToSplitId);
        if (updatedSplit) {
          setSelectedSplit(updatedSplit);
          setSplitDetailVisible(true);
        }
        setReturnToSplitId(null);
      }, 300);
    }
  };

  const handleDeletePayment = useCallback((debtId: string, paymentId: string) => {
    const debt = debts.find((d) => d.id === debtId);
    const payment = debt?.payments.find((p) => p.id === paymentId);

    Alert.alert('Remove Payment', 'This will undo this payment and its linked transaction. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (payment?.linkedTransactionId) {
            if (debt?.mode === 'personal') {
              deleteTransaction(payment.linkedTransactionId);
            } else {
              deleteBusinessTransaction(payment.linkedTransactionId);
            }
          }
          if (payment?.walletId && debt) {
            if (debt.type === 'they_owe') {
              deductFromWallet(payment.walletId, payment.amount);
            } else {
              addToWallet(payment.walletId, payment.amount);
            }
          }
          if (debt && debt.splitId && debt.status === 'settled') {
            const newPaidAmount = debt.payments
              .filter((p) => p.id !== paymentId)
              .reduce((sum, p) => sum + p.amount, 0);
            if (newPaidAmount < debt.totalAmount) {
              unmarkSplitParticipantPaid(debt.splitId, debt.contact.id);
            }
          }
          deletePayment(debtId, paymentId);
          showToast('Payment removed', 'success');
        },
      },
    ]);
  }, [debts, deleteTransaction, deleteBusinessTransaction, deductFromWallet, addToWallet, unmarkSplitParticipantPaid, deletePayment, showToast]);

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
    if (!payDetailDebtId || !payDetailPayment) return;
    const newAmount = parseFloat(editPayAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    setPayDetailSaving(true);

    const amountChanged = newAmount !== payDetailPayment.amount;

    // Guard: block amount edits on settled debts — would silently un-settle
    if (amountChanged) {
      const freshDebt = useDebtStore.getState().debts.find((d) => d.id === payDetailDebtId);
      if (freshDebt?.status === 'settled') {
        setPayDetailSaving(false);
        showToast('Cannot change amount on a settled debt', 'error');
        return;
      }
    }
    const noteChanged = editPayNote.trim() !== (payDetailPayment.note || '');

    if (!amountChanged && !noteChanged) {
      setInPayDetail(false);
      setPayDetailSaving(false);
      return;
    }

    // Update the payment in debtStore
    updatePayment(payDetailDebtId, payDetailPayment.id, {
      amount: newAmount,
      note: editPayNote.trim() || undefined,
    });

    // Sync linked transaction amount if amount changed (personal mode only — no updateBusinessTransaction exists)
    if (amountChanged && payDetailPayment.linkedTransactionId && mode === 'personal') {
      updateTransaction(payDetailPayment.linkedTransactionId, { amount: newAmount });
    }

    // Sync wallet balance if amount changed — read debt type from store directly (avoid stale closure)
    if (amountChanged && payDetailPayment.walletId) {
      const diff = newAmount - payDetailPayment.amount;
      const freshDebt = useDebtStore.getState().debts.find((d) => d.id === payDetailDebtId);
      if (freshDebt) {
        // they_owe: payments are income, so positive diff → add, negative → deduct
        // i_owe: payments are expense, so positive diff → deduct, negative → add
        if (freshDebt.type === 'they_owe') {
          if (diff > 0) addToWallet(payDetailPayment.walletId, diff);
          else deductFromWallet(payDetailPayment.walletId, -diff);
        } else {
          if (diff > 0) deductFromWallet(payDetailPayment.walletId, diff);
          else addToWallet(payDetailPayment.walletId, -diff);
        }
      }
    }

    setPayDetailSaving(false);
    handleClosePayDetail();
    showToast('Payment updated', 'success');
  };

  // ── Split Mark Paid / Undo Handlers ──────────────────────────
  const handleSplitMarkPaid = (split: SplitExpense, participant: SplitParticipant) => {
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
      setSelectedSplit({
        ...split,
        participants: split.participants.map((part) =>
          part.contact.id === participant.contact.id ? { ...part, isPaid: true } : part
        ),
      });
      showToast(`${participant.contact.name} marked as paid`, 'success');
    }
  };

  const handleSplitUndoPaid = (split: SplitExpense, participant: SplitParticipant) => {
    Alert.alert(
      'Undo Payment',
      `Mark ${participant.contact.name} as unpaid? This will reverse the most recent payment if one exists.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: () => {
            // Find linked debt
            const linkedDebt = debts.find(
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

                // Delete linked transaction
                if (freshPayment.linkedTransactionId) {
                  if (freshDebt.mode === 'personal') {
                    deleteTransaction(freshPayment.linkedTransactionId);
                  } else {
                    deleteBusinessTransaction(freshPayment.linkedTransactionId);
                  }
                }

                // Reverse wallet balance
                if (freshPayment.walletId) {
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

            // Update local state
            setSelectedSplit({
              ...split,
              participants: split.participants.map((part) =>
                part.contact.id === participant.contact.id ? { ...part, isPaid: false } : part
              ),
            });

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
  const handleSplitContactsChange = (contacts: Contact[]) => {
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
  };

  const handleEditSplit = useCallback((split: SplitExpense) => {
    setEditingSplitId(split.id);
    setSplitDescription(split.description);
    setSplitAmount(split.totalAmount.toString());
    setSplitMethod(split.splitMethod);
    setSplitContacts(split.participants.map((p) => p.contact));
    setSplitPaidBy(split.paidBy ? [split.paidBy] : []);
    setSplitWalletId(null);
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
    if (!splitDescription.trim()) {
      showToast('Please add a description', 'error');
      return;
    }
    if (!splitAmount || parseFloat(splitAmount) <= 0) {
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
      participants = splitContacts.map((c, i) => ({
        contact: c,
        amount: Math.round((perPerson + (i === 0 ? remainder : 0)) * 100) / 100,
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
        amount: perPersonMap[c.id] || 0,
        isPaid: false,
      }));
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

    if (editingSplitId) {
      // Delete linked debts for participants removed from the split
      const newParticipantIds = new Set(participants.map((p) => p.contact.id));
      const linkedDebts = useDebtStore.getState().debts.filter((d) => d.splitId === editingSplitId);
      linkedDebts.forEach((ld) => {
        if (!newParticipantIds.has(ld.contact.id)) {
          // Reverse wallet + transaction before deleting
          ld.payments.forEach((payment) => {
            if (payment.linkedTransactionId) {
              if (ld.mode === 'personal') deleteTransaction(payment.linkedTransactionId);
              else deleteBusinessTransaction(payment.linkedTransactionId);
            }
            if (payment.walletId) {
              if (ld.type === 'they_owe') deductFromWallet(payment.walletId, payment.amount);
              else addToWallet(payment.walletId, payment.amount);
            }
          });
          deleteDebt(ld.id);
        }
      });

      updateSplit(editingSplitId, {
        description: splitDescription.trim(),
        totalAmount: total,
        splitMethod,
        participants,
        items: splitMethod === 'item_based' ? splitItems : [],
        paidBy: splitPaidBy.length > 0 ? splitPaidBy[0] : undefined,
        dueDate: splitDueDateObj ? splitDueDateObj.toISOString() : undefined,
      } as any);

      // Cascade updated per-participant amounts to linked Debt.totalAmount
      const linkedDebtsForUpdate = useDebtStore.getState().debts.filter((d) => d.splitId === editingSplitId);
      let totalChanged = false;
      participants.forEach((p) => {
        const linked = linkedDebtsForUpdate.find((d) => d.contact.id === p.contact.id);
        if (linked && linked.totalAmount !== p.amount) {
          totalChanged = true;
          updateDebt(linked.id, { totalAmount: p.amount } as any);
        }
      });

      // Warn if linked debts have payments and amounts changed
      const hasPayments = linkedDebtsForUpdate.some(d => d.payments && d.payments.length > 0);
      if (hasPayments && totalChanged) {
        showToast('linked debts have payments — review amounts manually.', 'info');
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
            category: 'food',
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
            category: 'food',
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
          });
        }
      }

      showToast('Split created!', 'success');
    }

    setSplitModalVisible(false);
    resetSplitForm();
  }, [splitDescription, splitAmount, splitContacts, splitPaidBy, editingSplitId, splitMethod, customAmounts, splitItems, splitDueDateObj, splitWalletId, mode, currency, addSplit, updateSplit, addDebt, updateDebt, deleteDebt, addTransaction, addBusinessTransaction, deductFromWallet, useCredit, deleteTransaction, deleteBusinessTransaction, addToWallet, resetSplitForm, showToast]);

  const cleanupSplitTransaction = (split: SplitExpense) => {
    // Delete linked expense transaction
    if (split.linkedTransactionId) {
      if (split.mode === 'personal') {
        deleteTransaction(split.linkedTransactionId);
      } else {
        deleteBusinessTransaction(split.linkedTransactionId);
      }
    }
    // Reverse wallet deduction
    if (split.walletId) {
      const wallet = wallets.find((w) => w.id === split.walletId);
      if (wallet?.type === 'credit') {
        repayCredit(split.walletId, split.totalAmount);
      } else {
        addToWallet(split.walletId, split.totalAmount);
      }
    }
  };

  const handleDeleteSplit = useCallback((id: string) => {
    Alert.alert('Delete Split', 'Are you sure you want to delete this split? Linked debts, transactions, and wallet changes will also be reversed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const split = splits.find((s) => s.id === id);
          if (split) cleanupSplitTransaction(split);
          const linkedDebts = debts.filter((d) => d.splitId === id);
          linkedDebts.forEach((debt) => {
            cleanupDebtPayments(debt);
            deleteDebt(debt.id);
          });
          deleteSplit(id);
          setSplitDetailVisible(false);
          showToast('Split deleted', 'success');
        },
      },
    ]);
  }, [splits, debts, deleteDebt, deleteSplit, showToast]);

  // ── Selection Mode Handlers ──────────────────────────────────
  const enterSelectionMode = useCallback((type: 'debt' | 'split', firstId: string) => {
    setSelectionMode(type);
    setSelectedIds(new Set([firstId]));
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
    const items = selectionMode === 'debt' ? modeDebts : modeSplits;
    setSelectedIds(new Set(items.map((i) => i.id)));
  }, [selectionMode, modeDebts, modeSplits]);

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    const type = selectionMode === 'debt' ? 'debt' : 'split';
    Alert.alert(
      `Delete ${count} ${type}${count > 1 ? 's' : ''}`,
      `Are you sure you want to delete ${count} ${type}${count > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            selectedIds.forEach((id) => {
              if (selectionMode === 'debt') {
                const debt = debts.find((d) => d.id === id);
                if (debt) cleanupDebtPayments(debt);
                deleteDebt(id);
              } else {
                const split = splits.find((s) => s.id === id);
                if (split) cleanupSplitTransaction(split);
                const linkedDebts = debts.filter((d) => d.splitId === id);
                linkedDebts.forEach((debt) => {
                  cleanupDebtPayments(debt);
                  deleteDebt(debt.id);
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
  };

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
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showToast('Camera permission is required', 'error');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setScanningReceipt(true);
    try {
      const receipt = await scanReceipt(result.assets[0].uri);
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
    setAssigningItemIndex(null);
  }, [wallets]);

  const processReceiptImage = async (uri: string) => {
    setScanningReceipt(true);
    try {
      const receipt = await scanReceipt(uri);
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
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showToast('Camera permission is required', 'error');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await processReceiptImage(result.assets[0].uri);
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
          'Amount Mismatch',
          `Item totals (RM ${itemSum.toFixed(2)}) don't match the receipt total (RM ${totalToCompare.toFixed(2)}). Difference: RM ${itemTotalDiff.toFixed(2)}.\n\nDo you want to continue anyway?`,
          [
            { text: 'Go Back', style: 'cancel' },
            { text: 'Continue', onPress: () => setWizardStep(5) },
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
    if (!wizardResult || !wizardPaidBy) return;
    const splitId = addSplit({
      description: wizardDescription.trim(),
      totalAmount: wizardResult.effectiveTotal,
      splitMethod: 'item_based',
      participants: wizardResult.participants,
      items: wizardItems,
      paidBy: wizardPaidBy,
      taxAmount: wizardTaxAmount > 0 ? wizardTaxAmount : undefined,
      taxHandling: wizardTaxAmount > 0 ? wizardTaxHandling : undefined,
      mode,
    });

    // Auto-create debts + expense
    const selfId = '__self__';
    const desc = wizardDescription.trim();
    if (wizardPaidBy.id === selfId) {
      // I paid → auto-create expense for full bill amount
      let txId: string | undefined;
      if (mode === 'personal') {
        txId = addTransaction({
          amount: wizardResult.effectiveTotal,
          category: 'food',
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
          category: 'food',
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
          mode,
        });
      }
    }

    setWizardVisible(false);
    resetWizardForm();
    showToast('Split created!', 'success');
  };

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
      id: Date.now().toString(),
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
        id: c.id || Date.now().toString() + Math.random().toString(36),
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
    let message = `Hey ${debt.contact.name}, your share for *${debt.description}* is *${currency} ${remaining.toFixed(2)}*.`;

    // Include item breakdown if linked to a split with items
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
              message += `\n- ${item.name}: ${currency} ${share.toFixed(2)} (divide by ${shareCount} person)`;
            } else {
              message += `\n- ${item.name}: ${currency} ${share.toFixed(2)}`;
            }
          });
        }
        // Add tax info
        if (linkedSplit.taxAmount && linkedSplit.taxAmount > 0 && linkedSplit.taxHandling === 'divide') {
          const participantsWithItems = linkedSplit.participants.filter((p) => p.amount > 0);
          const taxPerPerson = Math.round((linkedSplit.taxAmount / (participantsWithItems.length || 1)) * 100) / 100;
          message += `\n- Tax: ${currency} ${taxPerPerson.toFixed(2)} per person`;
        }
      } else if (linkedSplit && linkedSplit.splitMethod === 'equal') {
        message += `\n\nSplit equally among ${linkedSplit.participants.length} people.`;
      }
    }

    if (hasPaymentQr) {
      message += `\n\nI've attached the QR code for payment \u{1F64F}`;
    }
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
    return DEBT_STATUSES.find((s) => s.value === status) || DEBT_STATUSES[0];
  }, []);

  const getTypeConfig = useCallback((type: string) => {
    return DEBT_TYPES.find((t) => t.value === type) || DEBT_TYPES[0];
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={CALM.bronze}
            colors={[CALM.bronze]}
          />
        }
      >
        {/* Balance Summary — Two Mini Cards */}
        <View style={styles.heroGrid}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              setDebtTypeFilter(debtTypeFilter === 'i_owe' ? null : 'i_owe');
              setDebtFilter(debtFilter === 'pending' ? null : 'pending');
            }}
            style={[styles.heroMiniCard, { borderLeftColor: '#C1694F' }, debtTypeFilter === 'i_owe' && { borderWidth: 1.5, borderColor: '#C1694F' }]}
          >
            <View style={styles.heroMiniLabel}>
              <Feather name="arrow-up-circle" size={14} color="#C1694F" />
              <Text style={styles.heroMiniLabelText}>You Owe</Text>
            </View>
            <Text style={[styles.heroMiniAmount, { color: '#C1694F' }]}>
              {currency} {balanceSummary.youOwe.toFixed(2)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              setDebtTypeFilter(debtTypeFilter === 'they_owe' ? null : 'they_owe');
              setDebtFilter(debtFilter === 'pending' ? null : 'pending');
            }}
            style={[styles.heroMiniCard, { borderLeftColor: CALM.accent }, debtTypeFilter === 'they_owe' && { borderWidth: 1.5, borderColor: CALM.accent }]}
          >
            <View style={styles.heroMiniLabel}>
              <Feather name="arrow-down-circle" size={14} color={CALM.accent} />
              <Text style={styles.heroMiniLabelText}>Owed to You</Text>
            </View>
            <Text style={[styles.heroMiniAmount, { color: CALM.accent }]}>
              {currency} {balanceSummary.owedToYou.toFixed(2)}
            </Text>
            {balanceSummary.collected > 0 && (
              <Text style={[styles.heroMiniSub, { color: '#6BA3BE' }]}>
                {balanceSummary.collected.toFixed(2)} collected
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={CALM.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={activeTab === 'debts' ? 'Search debts...' : 'Search splits...'}
            placeholderTextColor={CALM.textMuted}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x-circle" size={16} color={CALM.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setSortModalVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ paddingLeft: SPACING.xs }}
          >
            <View>
              <Feather name="sliders" size={16} color={(activeTab === 'debts' ? (debtSort !== 'newest' || debtTypeFilter || debtFilter) : splitSort !== 'newest') ? CALM.accent : CALM.textMuted} />
              {activeTab === 'debts' && (debtTypeFilter || debtFilter) && (
                <View style={{ position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: 4, backgroundColor: CALM.accent }} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'debts' && styles.tabActive]}
            onPress={() => { exitSelectionMode(); setActiveTab('debts'); }}
            activeOpacity={0.7}
          >
            <Feather name="users" size={16} color={activeTab === 'debts' ? CALM.accent : CALM.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'debts' && styles.tabTextActive]}>
              Debts
            </Text>
            <View style={{
              backgroundColor: activeTab === 'debts' ? CALM.accent : withAlpha(CALM.textSecondary, 0.15),
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: RADIUS.full,
              minWidth: 22,
              alignItems: 'center',
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: activeTab === 'debts' ? '#fff' : CALM.textSecondary }}>
                {modeDebts.length}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'splits' && styles.tabActive]}
            onPress={() => { exitSelectionMode(); setActiveTab('splits'); }}
            activeOpacity={0.7}
          >
            <Feather name="scissors" size={16} color={activeTab === 'splits' ? CALM.accent : CALM.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'splits' && styles.tabTextActive]}>
              Splits
            </Text>
            <View style={{
              backgroundColor: activeTab === 'splits' ? CALM.accent : withAlpha(CALM.textSecondary, 0.15),
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: RADIUS.full,
              minWidth: 22,
              alignItems: 'center',
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: activeTab === 'splits' ? '#fff' : CALM.textSecondary }}>
                {modeSplits.length}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Debts Tab */}
        {activeTab === 'debts' && (
          <>
            {/* Active filter summary */}
            {(debtTypeFilter || debtFilter) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 6 }}>
                <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: CALM.textSecondary }}>
                  {filteredDebts.length} {filteredDebts.length === 1 ? 'debt' : 'debts'}
                  {' · RM '}
                  {filteredDebts.reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0).toFixed(2)}
                </Text>
                <TouchableOpacity
                  onPress={() => { setDebtTypeFilter(null); setDebtFilter(null); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Feather name="x" size={12} color={CALM.gold} />
                  <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: CALM.gold, fontWeight: '600' }}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}
            {filteredDebts.length > 0 ? (
              groupedDebts.map((group) => {
                const isGroupExpanded = expandedPersonIds.has(group.contactId);
                const showGroupHeader = group.debts.length > 1;
                const debtsToRender = showGroupHeader && !isGroupExpanded ? [] : group.debts;

                return (
                  <View key={group.contactId}>
                    {/* Group header — only when 2+ debts for same person */}
                    {showGroupHeader && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setExpandedPersonIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(group.contactId)) next.delete(group.contactId);
                            else next.add(group.contactId);
                            return next;
                          });
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: SPACING.md,
                          paddingVertical: SPACING.sm,
                          marginBottom: isGroupExpanded ? 4 : SPACING.sm,
                          backgroundColor: withAlpha(CALM.accent, 0.04),
                          borderRadius: RADIUS.md,
                          borderWidth: 1,
                          borderColor: CALM.border,
                        }}
                      >
                        <View style={[styles.debtAvatar, { backgroundColor: withAlpha(CALM.accent, 0.12), borderColor: withAlpha(CALM.accent, 0.25) }]}>
                          <Text style={[styles.debtAvatarText, { color: CALM.accent }]}>
                            {group.contactName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                          <Text style={[styles.debtName, { fontSize: TYPOGRAPHY.size.base }]}>{group.contactName}</Text>
                          <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: CALM.textSecondary }}>{group.debts.length} debts</Text>
                        </View>
                        <Text style={[styles.debtAmount, { color: CALM.accent, marginRight: SPACING.sm }]}>
                          {currency} {group.totalRemaining.toFixed(2)}
                        </Text>
                        <Feather name={isGroupExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={CALM.textMuted} />
                      </TouchableOpacity>
                    )}
                    {/* Debt cards (always shown for single debts, conditionally for groups) */}
                    {debtsToRender.map((debt, idx) => {
                      const typeConfig = getTypeConfig(debt.type);
                      const statusConfig = getStatusConfig(debt.status);
                      const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);

                      const isSelected = selectionMode === 'debt' && selectedIds.has(debt.id);
                      const inDebtSelection = selectionMode === 'debt';

                      return (
                        <Card key={`${debt.id}-${idx}`} style={{ ...styles.debtCard, borderLeftColor: statusConfig.color, ...(showGroupHeader ? { marginLeft: SPACING.md } : {}), ...(isSelected ? { borderColor: CALM.accent, borderWidth: 1.5 } : {}) }}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        if (inDebtSelection) {
                          toggleSelection(debt.id);
                        } else {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setExpandedDebtId(expandedDebtId === debt.id ? null : debt.id);
                        }
                      }}
                      onLongPress={() => !inDebtSelection && enterSelectionMode('debt', debt.id)}
                      delayLongPress={400}
                    >
                      <View style={styles.debtHeader}>
                        {inDebtSelection && (
                          <View style={[styles.selectionCheckbox, isSelected && styles.selectionCheckboxActive]}>
                            {isSelected && <Feather name="check" size={14} color="#fff" />}
                          </View>
                        )}
                        <View style={[styles.debtAvatar, { backgroundColor: withAlpha(typeConfig.color, 0.15), borderColor: withAlpha(typeConfig.color, 0.3) }]}>
                          <Text style={[styles.debtAvatarText, { color: typeConfig.color }]}>
                            {debt.contact.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.debtInfo}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.debtName}>{debt.contact.name}</Text>
                            <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: typeConfig.color, fontWeight: TYPOGRAPHY.weight.semibold }}>{typeConfig.label}</Text>
                          </View>
                          <Text style={styles.debtDesc} numberOfLines={1}>{debt.description}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.debtTimestamp}>
                              {isValid(debt.createdAt) ? format(debt.createdAt, 'MMM dd, yyyy') : '—'}{(() => { if (!debt.dueDate) return ''; const d = new Date(debt.dueDate); return isNaN(d.getTime()) ? ` · Due ${debt.dueDate}` : ` · Due ${format(d, 'MMM dd')}`; })()}
                            </Text>
                            {debt.status !== 'settled' && (() => {
                              // Due date badge takes priority
                              if (debt.dueDate) {
                                const dueD = new Date(debt.dueDate);
                                if (!isNaN(dueD.getTime())) {
                                  const daysUntil = differenceInDays(dueD, new Date());
                                  const overdue = daysUntil < 0;
                                  const label = overdue
                                    ? `overdue ${Math.abs(daysUntil)}d`
                                    : daysUntil === 0
                                    ? 'due today'
                                    : `due in ${daysUntil}d`;
                                  const bg = overdue
                                    ? withAlpha('#A0714A', 0.15)
                                    : daysUntil <= 3
                                    ? withAlpha(CALM.gold, 0.18)
                                    : withAlpha(CALM.accent, 0.1);
                                  const fg = overdue
                                    ? '#A0714A'
                                    : daysUntil <= 3
                                    ? CALM.gold
                                    : CALM.accent;
                                  return (
                                    <View style={{ backgroundColor: bg, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                                      <Text style={{ fontSize: 10, fontWeight: '600', color: fg }}>{label}</Text>
                                    </View>
                                  );
                                }
                              }
                              // Fallback: aging since creation
                              const days = differenceInDays(new Date(), new Date(debt.createdAt));
                              const bg = days >= 30 ? withAlpha('#A0714A', 0.15) : days >= 7 ? withAlpha(CALM.gold, 0.15) : withAlpha(CALM.accent, 0.1);
                              const fg = days >= 30 ? '#A0714A' : days >= 7 ? CALM.gold : CALM.accent;
                              return (
                                <View style={{ backgroundColor: bg, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
                                  <Text style={{ fontSize: 10, fontWeight: '600', color: fg }}>{getDebtAge(debt.createdAt)}</Text>
                                </View>
                              );
                            })()}
                          </View>
                        </View>
                        <View style={styles.debtAmountCol}>
                          <Text style={[styles.debtAmount, { color: typeConfig.color }]}>
                            {currency} {remaining.toFixed(2)}
                          </Text>
                          <View style={[styles.statusBadge, { backgroundColor: withAlpha(statusConfig.color, 0.12), borderColor: withAlpha(statusConfig.color, 0.3) }]}>
                            <Text style={[styles.statusText, { color: statusConfig.color }]}>
                              {statusConfig.label}
                            </Text>
                          </View>
                          {!inDebtSelection && (
                            <Feather
                              name={expandedDebtId === debt.id ? 'chevron-up' : 'chevron-down'}
                              size={14}
                              color={expandedDebtId === debt.id ? CALM.accent : CALM.textMuted}
                            />
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>

                    {debt.status !== 'settled' && debt.paidAmount > 0 && (
                      <ProgressBar
                        current={debt.paidAmount}
                        total={debt.totalAmount}
                        color={typeConfig.color}
                      />
                    )}

                    {!inDebtSelection && expandedDebtId === debt.id && (
                      <View style={[styles.debtActions, { borderTopWidth: 1, borderTopColor: CALM.border, paddingTop: SPACING.sm }]}>
                        <View style={{ flex: 1 }} />
                        {debt.status === 'settled' ? (
                          <TouchableOpacity
                            style={[styles.debtActionButton, { backgroundColor: withAlpha(CALM.neutral, 0.15) }]}
                            onPress={() => openPaymentModal(debt.id, true)}
                            activeOpacity={0.7}
                          >
                            <Feather name="clock" size={16} color={CALM.textSecondary} />
                            <Text style={[styles.debtActionText, { color: CALM.textSecondary }]}>History</Text>
                          </TouchableOpacity>
                        ) : (
                          <>
                            {debt.status === 'partial' && (
                              <TouchableOpacity
                                style={[styles.debtActionButton, { backgroundColor: withAlpha(CALM.neutral, 0.1) }]}
                                onPress={() => openPaymentModal(debt.id, true)}
                                activeOpacity={0.7}
                              >
                                <Feather name="clock" size={16} color={CALM.textSecondary} />
                                <Text style={[styles.debtActionText, { color: CALM.textSecondary }]}>History</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              style={[styles.debtActionButton, { backgroundColor: withAlpha(CALM.positive, 0.1) }]}
                              onPress={() => openPaymentModal(debt.id, false)}
                              activeOpacity={0.7}
                            >
                              <Feather name="plus-circle" size={16} color={CALM.positive} />
                              <Text style={[styles.debtActionText, { color: CALM.positive }]}>Record Payment</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        {debt.type === 'they_owe' && debt.status !== 'settled' && (
                          <>
                            {debt.contact.phone ? (
                              <TouchableOpacity
                                style={[styles.debtActionButton, { backgroundColor: '#E8F5E2' }]}
                                onPress={() => {
                                  const remaining = debt.totalAmount - debt.paidAmount;
                                  const msg = `Hi ${debt.contact.name}, just a reminder you have ${currency} ${remaining.toFixed(2)} outstanding for ${debt.description}. Thank you! 🙏`;
                                  let digits = debt.contact.phone!.replace(/[^0-9]/g, '');
                                  if (digits.startsWith('0')) digits = '60' + digits.slice(1);
                                  Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`).catch(() => {});
                                }}
                                activeOpacity={0.7}
                              >
                                <Feather name="message-circle" size={16} color="#25D366" />
                                <Text style={[styles.debtActionText, { color: '#25D366' }]}>WhatsApp</Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={[styles.debtActionButton, { backgroundColor: withAlpha(CALM.accent, 0.1) }]}
                                onPress={() => handleOpenReminder(debt)}
                                activeOpacity={0.7}
                              >
                                <Feather name="bell" size={16} color={CALM.accent} />
                                <Text style={[styles.debtActionText, { color: CALM.accent }]}>Remind</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              style={[styles.debtActionButton, { backgroundColor: withAlpha(CALM.gold, 0.1) }]}
                              onPress={() => handleRequestPayment(debt)}
                              activeOpacity={0.7}
                            >
                              <Feather name="send" size={16} color={CALM.gold} />
                              <Text style={[styles.debtActionText, { color: CALM.gold }]}>Request</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    )}
                      </Card>
                    );
                  })}
                  </View>
                );
              })
            ) : modeDebts.length > 0 ? (
              <EmptyState
                icon={searchQuery ? 'search' : 'filter'}
                title="No Matches"
                message={searchQuery ? `No debts matching "${searchQuery}"` : debtFilter ? `No ${debtFilter} debts` : 'No matching debts'}
              />
            ) : (
              <EmptyState
                icon="users"
                title="No Debts"
                message="Track who owes you and who you owe"
                actionLabel="Add Debt"
                onAction={() => { resetDebtForm(); setDebtModalVisible(true); }}
              />
            )}
          </>
        )}

        {/* Splits Tab */}
        {activeTab === 'splits' && (
          <>
            {searchedSplits.length > 0 && (
              <View style={styles.splitFilterRow}>
                {([
                  { key: 'active' as const, label: 'Active', count: activeSplitCount, color: CALM.accent },
                  { key: 'settled' as const, label: 'Settled', count: settledSplitCount, color: '#6BA3BE' },
                ] as const).map((f) => {
                  const isActive = splitFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[
                        styles.splitFilterPill,
                        isActive && { backgroundColor: withAlpha(f.color, 0.12), borderColor: f.color },
                      ]}
                      onPress={() => setSplitFilter(f.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.splitFilterText, isActive && { color: f.color }]}>
                        {f.label} ({f.count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {filteredSplits.length > 0 ? (
              filteredSplits.map((split, idx) => {
                const methodConfig = SPLIT_METHODS.find((m) => m.value === split.splitMethod);
                const paidCount = split.participants.filter((p) => p.isPaid).length;
                const isSettled = paidCount === split.participants.length;
                const borderColor = isSettled ? '#6BA3BE' : (methodConfig?.color || CALM.accent);

                const isSelected = selectionMode === 'split' && selectedIds.has(split.id);
                const inSplitSelection = selectionMode === 'split';

                return (
                  <Card key={`${split.id}-${idx}`} style={{ ...styles.splitCard, overflow: 'hidden' as const, borderLeftWidth: 3, borderLeftColor: borderColor, ...(isSelected ? { borderColor: CALM.accent, borderWidth: 1.5, borderLeftWidth: 3, borderLeftColor: borderColor } : {}) }}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => inSplitSelection ? toggleSelection(split.id) : (() => { setSelectedSplit(split); setSplitDetailVisible(true); })()}
                      onLongPress={() => !inSplitSelection && enterSelectionMode('split', split.id)}
                      delayLongPress={400}
                    >
                      <View style={styles.splitHeader}>
                        {inSplitSelection && (
                          <View style={[styles.selectionCheckbox, isSelected && styles.selectionCheckboxActive]}>
                            {isSelected && <Feather name="check" size={14} color="#fff" />}
                          </View>
                        )}
                        <View style={styles.splitInfo}>
                          <Text style={styles.splitTitle}>{split.description}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.splitSubtext}>
                              {split.paidBy ? `Paid by ${split.paidBy.name} · ` : ''}{isValid(split.createdAt) ? format(split.createdAt, 'MMMM dd, yyyy') : '—'}{(() => { if (!(split as any).dueDate) return ''; const d = new Date((split as any).dueDate); return isNaN(d.getTime()) ? ` · Due ${(split as any).dueDate}` : ` · Due ${format(d, 'MMM dd')}`; })()}
                            </Text>
                            {!isSettled && (() => {
                              if ((split as any).dueDate) {
                                const dueD = new Date((split as any).dueDate);
                                if (!isNaN(dueD.getTime())) {
                                  const daysUntil = differenceInDays(dueD, new Date());
                                  const overdue = daysUntil < 0;
                                  const label = overdue ? `overdue ${Math.abs(daysUntil)}d` : daysUntil === 0 ? 'due today' : `due in ${daysUntil}d`;
                                  const bg = overdue ? withAlpha('#A0714A', 0.15) : daysUntil <= 3 ? withAlpha(CALM.gold, 0.18) : withAlpha(CALM.accent, 0.1);
                                  const fg = overdue ? '#A0714A' : daysUntil <= 3 ? CALM.gold : CALM.accent;
                                  return <View style={{ backgroundColor: bg, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 10, fontWeight: '600', color: fg }}>{label}</Text></View>;
                                }
                              }
                              const d = differenceInDays(new Date(), new Date(split.createdAt));
                              const bg = d >= 30 ? withAlpha('#A0714A', 0.12) : d >= 7 ? withAlpha('#DEAB22', 0.12) : withAlpha(CALM.accent, 0.12);
                              const fg = d >= 30 ? '#A0714A' : d >= 7 ? '#DEAB22' : CALM.accent;
                              return <View style={{ backgroundColor: bg, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 10, fontWeight: '600', color: fg }}>{getDebtAge(split.createdAt)}</Text></View>;
                            })()}
                          </View>
                        </View>
                        <Text style={styles.splitAmount}>{currency} {split.totalAmount.toFixed(2)}</Text>
                      </View>

                      <View style={styles.splitMeta}>
                        <View style={[styles.methodPill, { backgroundColor: withAlpha(methodConfig?.color || CALM.accent, 0.1), borderWidth: 1, borderColor: withAlpha(methodConfig?.color || CALM.accent, 0.2) }]}>
                          <Feather name={methodConfig?.icon as any || 'users'} size={14} color={methodConfig?.color || CALM.accent} />
                          <Text style={[styles.methodPillText, { color: methodConfig?.color || CALM.accent }]}>{methodConfig?.label}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: withAlpha('#6BA3BE', 0.1), paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full }}>
                          <Feather name="check-circle" size={13} color="#6BA3BE" />
                          <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: '#6BA3BE' }}>
                            {paidCount}/{split.participants.length}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.splitParticipants}>
                        {split.participants.slice(0, 4).map((p) => (
                          <View key={p.contact.id} style={[styles.participantChip, p.contact.id === '__self__' ? { borderLeftWidth: 2, borderLeftColor: withAlpha('#A688B8', 0.6) } : p.isPaid ? styles.participantChipPaid : { borderLeftWidth: 2, borderLeftColor: withAlpha('#DEAB22', 0.5) }]}>
                            <Text style={[styles.participantChipText, p.isPaid && styles.participantChipTextPaid]} numberOfLines={1}>
                              {p.contact.name.split(' ')[0]}
                            </Text>
                            {p.isPaid && <Feather name="check" size={12} color="#6BA3BE" />}
                          </View>
                        ))}
                        {split.participants.length > 4 && (
                          <View style={styles.participantChip}>
                            <Text style={styles.participantChipText}>+{split.participants.length - 4}</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  </Card>
                );
              })
            ) : modeSplits.length > 0 ? (
              <EmptyState
                icon={searchQuery ? 'search' : splitFilter === 'settled' ? 'check-circle' : 'scissors'}
                title={searchQuery ? 'No Matches' : splitFilter === 'settled' ? 'No Settled Splits' : 'No Active Splits'}
                message={searchQuery ? `No splits matching "${searchQuery}"` : splitFilter === 'settled' ? 'Settled splits will appear here' : 'All splits are settled!'}
              />
            ) : (
              <EmptyState
                icon="scissors"
                title="No Splits"
                message="Split expenses with friends, family, or colleagues"
                actionLabel="Split Expense"
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
              <Feather name="x" size={18} color={CALM.textPrimary} />
              <Text style={styles.selectionBarBtnText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.selectionBarCount}>{selectedIds.size} selected</Text>
            <TouchableOpacity onPress={selectAll} style={styles.selectionBarBtn}>
              <Feather name="check-square" size={18} color={CALM.accent} />
              <Text style={[styles.selectionBarBtnText, { color: CALM.accent }]}>All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.selectionBarActions}>
            {selectedIds.size === 1 && (
              <TouchableOpacity style={styles.selectionEditBtn} onPress={handleSelectionEdit} activeOpacity={0.7}>
                <Feather name="edit-2" size={18} color={CALM.accent} />
                <Text style={styles.selectionEditText}>Edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.selectionDeleteBtn, selectedIds.size === 1 ? { flex: 2 } : { flex: 1 }]} onPress={handleBulkDelete} activeOpacity={0.7}>
              <Feather name="trash-2" size={18} color="#fff" />
              <Text style={styles.selectionDeleteText}>Delete ({selectedIds.size})</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FAB
          onPress={handleFABPress}
          icon="plus"
          color={CALM.accent}
        />
      )}

      {/* ── Add/Edit Debt Modal ──────────────────────────────── */}
      <Modal visible={debtModalVisible} animationType={debtModalAnimation} transparent statusBarTranslucent onRequestClose={() => { setDebtModalVisible(false); resetDebtForm(); }}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => { setDebtModalVisible(false); resetDebtForm(); }} />
            <View style={[styles.modalContent, { paddingBottom: Math.max(SPACING['2xl'], insets.bottom + SPACING.lg) }]}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleAccent}>
                  <Text style={styles.modalTitle}>{editingDebtId ? 'Edit Debt' : 'Add Debt'}</Text>
                </View>
                <TouchableOpacity onPress={() => { setDebtModalVisible(false); resetDebtForm(); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="x" size={24} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <ContactPicker
                  selectedContacts={debtContacts}
                  onSelect={setDebtContacts}
                  mode="single"
                  label="Who?"
                />

                <Text style={[styles.formLabel, { marginTop: SPACING.sm }]}>Type</Text>
                <View style={styles.typeContainer}>
                  {DEBT_TYPES.map((dt) => (
                    <TouchableOpacity
                      key={dt.value}
                      style={[
                        styles.typeButton,
                        debtType === dt.value
                          ? { backgroundColor: withAlpha(dt.color, 0.1), borderColor: dt.color }
                          : { borderColor: CALM.border },
                      ]}
                      onPress={() => setDebtType(dt.value as DebtType)}
                    >
                      <Feather name={dt.icon as any} size={18} color={dt.color} />
                      <Text style={[styles.typeText, debtType === dt.value && { color: dt.color }]}>
                        {dt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.formLabel}>Amount</Text>
                <TextInput
                  style={styles.formInput}
                  value={debtAmount}
                  onChangeText={setDebtAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
                {(() => {
                  if (!editingDebtId || !debtAmount) return null;
                  const existing = debts.find((d) => d.id === editingDebtId);
                  const newVal = parseFloat(debtAmount);
                  if (!existing || isNaN(newVal) || existing.paidAmount === 0) return null;
                  if (newVal < existing.paidAmount) {
                    return (
                      <View style={styles.amountWarnRow}>
                        <Feather name="alert-circle" size={13} color={CALM.bronze} />
                        <Text style={styles.amountWarnText}>
                          Below amount already paid ({currency} {existing.paidAmount.toFixed(2)}) — debt will be marked settled
                        </Text>
                      </View>
                    );
                  }
                  return null;
                })()}

                <Text style={styles.formLabel}>Description</Text>
                <TextInput
                  style={styles.formInput}
                  value={debtDescription}
                  onChangeText={setDebtDescription}
                  placeholder="What for?"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <View style={{ marginBottom: -SPACING.lg }}>
                  <Text style={styles.formLabel}>
                    Category
                    <Text style={styles.formLabelOptional}> (optional)</Text>
                  </Text>
                  <CategoryPicker
                    categories={debtType === 'i_owe' ? expenseCategories : incomeCategories}
                    selectedId={debtCategory}
                    onSelect={setDebtCategory}
                    layout="dropdown"
                    onNavigateToSettings={() => {
                      categoryManagerCallerRef.current = 'debt';
                      const type = debtType === 'i_owe' ? 'expense' : 'income';
                      setDebtModalAnimation('none');
                      setDebtModalVisible(false);
                      setTimeout(() => setCategoryManagerType(type), 50);
                    }}
                  />
                </View>

                <Text style={styles.formLabel}>
                  Due Date
                  <Text style={styles.formLabelOptional}> (optional)</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.formInput, styles.dateButton]}
                  onPress={() => { Keyboard.dismiss(); setDueDatePickerOpen((v) => !v); }}
                  activeOpacity={0.7}
                >
                  <Feather name="calendar" size={16} color={debtDueDateObj ? CALM.accent : CALM.textSecondary} />
                  <Text style={[styles.dateButtonText, !debtDueDateObj && { color: CALM.textSecondary }]}>
                    {debtDueDateObj ? format(debtDueDateObj, 'd MMM yyyy') : 'Select date'}
                  </Text>
                  {debtDueDateObj && (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); setDebtDueDateObj(null); setDebtDueDate(''); setDueDatePickerOpen(false); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="x" size={15} color={CALM.textSecondary} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => { setDebtModalVisible(false); resetDebtForm(); }}
                    variant="outline"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={editingDebtId ? 'Update' : 'Add'}
                    onPress={handleSaveDebt}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                </View>
              </KeyboardAwareScrollView>
            </View>

            {/* Date picker overlay — custom calendar, no native rendering issues */}
            {dueDatePickerOpen && (
              <Pressable style={styles.datePickerOverlay} onPress={() => setDueDatePickerOpen(false)}>
                <Pressable style={styles.datePickerCard} onPress={(e) => e.stopPropagation()}>
                  <View style={styles.datePickerHeader}>
                    <Text style={styles.datePickerTitle}>Select Due Date</Text>
                    <TouchableOpacity onPress={() => setDueDatePickerOpen(false)}>
                      <Text style={styles.datePickerDone}>Done</Text>
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
        </View>
      </Modal>

      {/* ── Add/Edit Split Modal ─────────────────────────────── */}
      <Modal visible={splitModalVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => { setSplitModalVisible(false); resetSplitForm(); }}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => { setSplitModalVisible(false); resetSplitForm(); }} />
            <View style={[styles.modalContent, { paddingBottom: Math.max(SPACING['2xl'], insets.bottom + SPACING.lg) }]}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleAccent}>
                  <Text style={styles.modalTitle}>{editingSplitId ? 'Edit Split' : 'Split Expense'}</Text>
                </View>
                <TouchableOpacity onPress={() => { setSplitModalVisible(false); resetSplitForm(); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="x" size={24} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.formLabel}>Description</Text>
                <TextInput
                  style={styles.formInput}
                  value={splitDescription}
                  onChangeText={setSplitDescription}
                  placeholder="Dinner, trip, etc."
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={styles.formLabel}>Total Amount</Text>
                <TextInput
                  style={styles.formInput}
                  value={splitAmount}
                  onChangeText={setSplitAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                {!editingSplitId && (
                  <>
                    <Text style={styles.formLabel}>Split Method</Text>
                    <View style={styles.methodContainer}>
                      {SPLIT_METHODS.map((m) => (
                        <TouchableOpacity
                          key={m.value}
                          style={[styles.methodButton, splitMethod === m.value && styles.methodButtonActive]}
                          onPress={() => setSplitMethod(m.value as SplitMethod)}
                        >
                          <Feather
                            name={m.icon as any}
                            size={16}
                            color={splitMethod === m.value ? CALM.accent : CALM.textPrimary}
                          />
                          <Text style={[styles.methodText, splitMethod === m.value && styles.methodTextActive]}>
                            {m.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <ContactPicker
                  selectedContacts={splitContacts}
                  onSelect={handleSplitContactsChange}
                  mode="multi"
                  label="Participants"
                  includeSelf
                  selfName={getSelfContact().name}
                />

                <ContactPicker
                  selectedContacts={splitPaidBy}
                  onSelect={(contacts) => {
                    setSplitPaidBy(contacts);
                    if (contacts.length === 0 || contacts[0].id !== '__self__') {
                      setSplitWalletId(null);
                    }
                  }}
                  mode="single"
                  label="Paid By (required)"
                  includeSelf
                  selfName={getSelfContact().name}
                />
                {splitPaidBy.length > 0 && splitPaidBy[0].id === '__self__' && (
                  <WalletPicker
                    wallets={wallets}
                    selectedId={splitWalletId}
                    onSelect={setSplitWalletId}
                    label="Paid from wallet"
                  />
                )}

                {/* Due date */}
                <Text style={styles.formLabel}>Due Date <Text style={{ color: CALM.textMuted, fontWeight: '400' }}>(optional)</Text></Text>
                <View>
                  <TouchableOpacity
                    style={[styles.formInput, styles.dateButton]}
                    onPress={() => { Keyboard.dismiss(); setSplitDueDatePickerOpen((v) => !v); }}
                  >
                    <Feather name="calendar" size={16} color={splitDueDateObj ? CALM.accent : CALM.textSecondary} />
                    <Text style={[styles.dateButtonText, !splitDueDateObj && { color: CALM.textSecondary }]}>
                      {splitDueDateObj ? format(splitDueDateObj, 'd MMM yyyy') : 'Select date'}
                    </Text>
                    {splitDueDateObj && (
                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); setSplitDueDateObj(null); setSplitDueDate(''); setSplitDueDatePickerOpen(false); }}>
                        <Feather name="x" size={15} color={CALM.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Custom amounts per participant */}
                {splitMethod === 'custom' && splitContacts.length > 0 && (
                  <View style={styles.customSection}>
                    <Text style={styles.formLabel}>Amount per Person</Text>
                    {splitContacts.map((c) => (
                      <View key={c.id} style={styles.customRow}>
                        <Text style={styles.customName} numberOfLines={1}>{c.name}</Text>
                        <TextInput
                          style={styles.customInput}
                          value={customAmounts[c.id] || ''}
                          onChangeText={(v) => setCustomAmounts({ ...customAmounts, [c.id]: v })}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          placeholderTextColor={CALM.textSecondary}
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                        />
                      </View>
                    ))}
                  </View>
                )}

                {/* Item-based split */}
                {splitMethod === 'item_based' && (
                  <View style={styles.customSection}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.formLabel}>Items</Text>
                    </View>
                    {!editingSplitId && (
                      <View style={styles.addItemRow}>
                        <TextInput
                          style={[styles.formInput, { flex: 2 }]}
                          value={newItemName}
                          onChangeText={setNewItemName}
                          placeholder="Item name"
                          placeholderTextColor={CALM.textSecondary}
                          returnKeyType="next"
                        />
                        <TextInput
                          style={[styles.formInput, { flex: 1 }]}
                          value={newItemAmount}
                          onChangeText={setNewItemAmount}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          placeholderTextColor={CALM.textSecondary}
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                        />
                        <TouchableOpacity style={styles.addItemButton} onPress={handleAddItem}>
                          <Feather name="plus" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    )}

                    {splitItems.map((item, index) => (
                      <View key={index} style={styles.itemCard}>
                        <View style={styles.itemHeader}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemAmount}>{currency} {item.amount.toFixed(2)}</Text>
                          <TouchableOpacity onPress={() => setSplitItems(splitItems.filter((_, i) => i !== index))} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                            <Feather name="x" size={16} color={CALM.neutral} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.assignLabel}>Assign to:</Text>
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
                    <View style={{ marginTop: SPACING.md, marginBottom: SPACING.sm, backgroundColor: withAlpha(CALM.accent, 0.04), borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: CALM.border }}>
                      <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: CALM.textSecondary, fontWeight: TYPOGRAPHY.weight.medium, marginBottom: SPACING.xs, textTransform: 'uppercase', letterSpacing: 0.5 }}>Split Preview</Text>
                      {preview.map((p, i) => (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                          <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: CALM.textPrimary }}>{p.name}</Text>
                          <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: p.amount > 0 ? CALM.textPrimary : CALM.textSecondary }}>RM {p.amount.toFixed(2)}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => { setSplitModalVisible(false); resetSplitForm(); }}
                    variant="outline"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={editingSplitId ? 'Update' : 'Create'}
                    onPress={handleSaveSplit}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                </View>
              </KeyboardAwareScrollView>

              {/* Calendar overlay — outside ScrollView so it floats above */}
              {splitDueDatePickerOpen && (
                <Pressable style={styles.datePickerOverlay} onPress={() => setSplitDueDatePickerOpen(false)}>
                  <Pressable style={styles.datePickerCard} onPress={(e) => e.stopPropagation()}>
                    <View style={styles.datePickerHeader}>
                      <Text style={styles.datePickerTitle}>Select Due Date</Text>
                      <TouchableOpacity onPress={() => setSplitDueDatePickerOpen(false)}>
                        <Text style={styles.datePickerDone}>Done</Text>
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
            </View>
        </View>
      </Modal>

      {/* ── Record Payment Modal ─────────────────────────────── */}
      <Modal
        visible={paymentModalVisible}
        animationType={paymentModalAnimation}
        transparent
        statusBarTranslucent
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setPaymentModalVisible(false)} />
              <View style={[styles.modalContent, { paddingBottom: Math.max(SPACING['2xl'], insets.bottom + SPACING.lg) }]}>
                {(() => {
                  const payDebt = debts.find((d) => d.id === paymentDebtId);
                  if (!payDebt) return null;
                  const remaining = Math.max(0, payDebt.totalAmount - payDebt.paidAmount);
                  const typeConfig = getTypeConfig(payDebt.type);

                  // ── Payment Detail Panel (inline, no separate modal) ──
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
                        <View style={styles.modalHeader}>
                          <TouchableOpacity onPress={handleClosePayDetail} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                            <Feather name="chevron-left" size={22} color={CALM.accent} />
                            <Text style={[styles.modalTitle, { fontSize: 18 }]}>Payment Detail</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => { handleClosePayDetail(); setPaymentModalVisible(false); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                            <Feather name="x" size={24} color={CALM.textPrimary} />
                          </TouchableOpacity>
                        </View>

                        <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bottomOffset={20}>
                          {wallet && (
                            <View style={styles.payDetailRow}>
                              <Feather name="credit-card" size={15} color={CALM.textMuted} />
                              <Text style={styles.payDetailMeta}>{wallet.name}</Text>
                            </View>
                          )}
                          <View style={styles.payDetailRow}>
                            <Feather name="clock" size={15} color={CALM.textMuted} />
                            <Text style={styles.payDetailMeta}>{dateStr}</Text>
                          </View>
                          {payDetailPayment.linkedTransactionId && (
                            <View style={styles.payDetailRow}>
                              <Feather name="link" size={15} color={CALM.textMuted} />
                              <Text style={styles.payDetailMeta}>Linked to transaction</Text>
                              {mode === 'personal' && <Text style={styles.payDetailMetaHint}> · amount synced on save</Text>}
                            </View>
                          )}
                          {payDetailPayment.tipAmount ? (
                            <View style={styles.payDetailRow}>
                              <Feather name="gift" size={15} color={CALM.textMuted} />
                              <Text style={styles.payDetailMeta}>Tip: {currency} {payDetailPayment.tipAmount.toFixed(2)}</Text>
                            </View>
                          ) : null}

                          <View style={styles.payDetailDivider} />

                          <Text style={styles.formLabel}>Amount</Text>
                          <TextInput
                            style={styles.formInput}
                            value={editPayAmount}
                            onChangeText={setEditPayAmount}
                            keyboardType="decimal-pad"
                            returnKeyType="done"
                            onSubmitEditing={Keyboard.dismiss}
                            selectTextOnFocus
                          />

                          <Text style={styles.formLabel}>Note (optional)</Text>
                          <TextInput
                            style={styles.formInput}
                            value={editPayNote}
                            onChangeText={setEditPayNote}
                            placeholder="Add a note..."
                            placeholderTextColor={CALM.textSecondary}
                            returnKeyType="done"
                            onSubmitEditing={Keyboard.dismiss}
                          />

                          {payDetailPayment.editLog && payDetailPayment.editLog.length > 0 && (
                            <View style={styles.editHistorySection}>
                              <View style={styles.editHistoryHeader}>
                                <Feather name="clock" size={13} color={CALM.bronze} />
                                <Text style={styles.editHistoryTitle}>Edit History</Text>
                                <Text style={styles.editHistoryCount}>{payDetailPayment.editLog.length} change{payDetailPayment.editLog.length > 1 ? 's' : ''}</Text>
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
                                        was {currency} {entry.previousAmount.toFixed(2)}
                                        {entry.previousNote ? ` · "${entry.previousNote}"` : ''}
                                      </Text>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}

                          <View style={styles.payDetailActions}>
                            <Button
                              title="Delete"
                              onPress={() => {
                                if (!payDetailDebtId || !payDetailPayment) return;
                                const snapDebtId = payDetailDebtId;
                                const snapPaymentId = payDetailPayment.id;
                                Alert.alert('Remove Payment', 'This will undo this payment and its linked transaction. Continue?', [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Remove',
                                    style: 'destructive',
                                    onPress: () => {
                                      handleClosePayDetail();
                                      const freshDebt = useDebtStore.getState().debts.find((d) => d.id === snapDebtId);
                                      const freshPayment = freshDebt?.payments.find((p) => p.id === snapPaymentId);
                                      if (!freshPayment || !freshDebt) return;
                                      if (freshPayment.linkedTransactionId) {
                                        if (freshDebt.mode === 'personal') deleteTransaction(freshPayment.linkedTransactionId);
                                        else deleteBusinessTransaction(freshPayment.linkedTransactionId);
                                      }
                                      if (freshPayment.walletId) {
                                        if (freshDebt.type === 'they_owe') deductFromWallet(freshPayment.walletId, freshPayment.amount);
                                        else addToWallet(freshPayment.walletId, freshPayment.amount);
                                      }
                                      if (freshDebt.splitId && freshDebt.status === 'settled') {
                                        const newPaid = freshDebt.payments.filter((p) => p.id !== snapPaymentId).reduce((s, p) => s + p.amount, 0);
                                        if (newPaid < freshDebt.totalAmount) unmarkSplitParticipantPaid(freshDebt.splitId, freshDebt.contact.id);
                                      }
                                      deletePayment(snapDebtId, snapPaymentId);
                                      showToast('Payment removed', 'success');
                                    },
                                  },
                                ]);
                              }}
                              variant="outline"
                              style={{ flex: 1 }}
                            />
                            <Button
                              title={payDetailSaving ? 'Saving…' : 'Save'}
                              onPress={handleSavePayDetail}
                              icon="check"
                              style={{ flex: 1 }}
                            />
                          </View>
                        </KeyboardAwareScrollView>
                      </>
                    );
                  }

                  return (
                    <>
                      {/* Header */}
                      <View style={styles.modalHeader}>
                        <View style={styles.modalTitleAccent}>
                          <Text style={styles.modalTitle}>{paymentViewOnly ? 'Payment History' : 'Record Payment'}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setPaymentModalVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                          <Feather name="x" size={24} color={CALM.textPrimary} />
                        </TouchableOpacity>
                      </View>

                      <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        {/* Debt context card */}
                        <View style={styles.payContextCard}>
                          <View style={styles.payContextRow}>
                            <View style={[styles.payContextAvatar, { backgroundColor: withAlpha(typeConfig.color, 0.12) }]}>
                              <Text style={[styles.payContextAvatarText, { color: typeConfig.color }]}>
                                {payDebt.contact.name.charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.payContextName}>{payDebt.contact.name}</Text>
                              {payDebt.description ? <Text style={styles.payContextDesc} numberOfLines={1}>{payDebt.description}</Text> : null}
                            </View>
                          </View>
                          <View style={styles.payContextAmounts}>
                            <View style={styles.payContextAmountItem}>
                              <Text style={styles.payContextAmountLabel}>Total</Text>
                              <Text style={styles.payContextAmountValue}>{currency} {payDebt.totalAmount.toFixed(2)}</Text>
                            </View>
                            <View style={[styles.payContextDivider]} />
                            <View style={styles.payContextAmountItem}>
                              <Text style={styles.payContextAmountLabel}>Paid</Text>
                              <Text style={[styles.payContextAmountValue, { color: CALM.positive }]}>{currency} {payDebt.paidAmount.toFixed(2)}</Text>
                            </View>
                            <View style={[styles.payContextDivider]} />
                            <View style={styles.payContextAmountItem}>
                              <Text style={styles.payContextAmountLabel}>Remaining</Text>
                              <Text style={[styles.payContextAmountValue, { color: typeConfig.color, fontWeight: '700' as const }]}>{currency} {remaining.toFixed(2)}</Text>
                            </View>
                          </View>
                          <ProgressBar current={payDebt.paidAmount} total={payDebt.totalAmount} color={typeConfig.color} />
                        </View>

                        {payDebt.status === 'settled' && (
                          <View style={styles.settledNotice}>
                            <Feather name="check-circle" size={15} color={CALM.positive} />
                            <Text style={styles.settledNoticeText}>This debt is fully settled. View history below.</Text>
                          </View>
                        )}

                        {!paymentViewOnly && payDebt.status !== 'settled' && (
                          <>
                            {/* Wallet picker (personal mode only) */}
                            {mode === 'personal' && wallets.length > 0 && (
                              <WalletPicker
                                wallets={wallets}
                                selectedId={paymentWalletId}
                                onSelect={setPaymentWalletId}
                                label="Wallet"
                              />
                            )}

                            {/* Category picker */}
                            <CategoryPicker
                              categories={payDebt.type === 'they_owe' ? incomeCategories : expenseCategories}
                              selectedId={paymentCategory}
                              onSelect={setPaymentCategory}
                              label="Category"
                              layout="dropdown"
                              onNavigateToSettings={() => {
                                const payDebt2 = debts.find((d) => d.id === paymentDebtId);
                                categoryManagerCallerRef.current = 'payment';
                                const type2 = payDebt2?.type === 'they_owe' ? 'income' : 'expense';
                                setPaymentModalAnimation('none');
                                setPaymentModalVisible(false);
                                setTimeout(() => setCategoryManagerType(type2), 50);
                              }}
                            />

                            {/* Amount input */}
                            <Text style={styles.formLabel}>Amount</Text>
                            <View style={styles.payAmountRow}>
                              <TextInput
                                style={[styles.formInput, { flex: 1 }]}
                                value={paymentAmount}
                                onChangeText={setPaymentAmount}
                                placeholder="0.00"
                                placeholderTextColor={CALM.textSecondary}
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                onSubmitEditing={Keyboard.dismiss}
                              />
                              <TouchableOpacity
                                style={styles.payQuickFill}
                                onPress={() => setPaymentAmount(remaining.toFixed(2))}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.payQuickFillText}>Pay Full</Text>
                              </TouchableOpacity>
                            </View>

                            {/* Note input */}
                            <Text style={styles.formLabel}>Note</Text>
                            <TextInput
                              style={styles.formInput}
                              value={paymentNote}
                              onChangeText={setPaymentNote}
                              placeholder="Optional note"
                              placeholderTextColor={CALM.textSecondary}
                              returnKeyType="done"
                              onSubmitEditing={Keyboard.dismiss}
                            />

                            {/* Record button */}
                            <Button
                              title="Record Payment"
                              onPress={handleRecordPayment}
                              icon="check"
                              style={{ marginTop: SPACING.md }}
                            />
                          </>
                        )}

                        {/* Payment history */}
                        {payDebt.payments.length > 0 && (
                          <View style={styles.payHistorySection}>
                            <Text style={styles.payHistoryTitle}>Payment History</Text>
                            {payDebt.payments.slice().reverse().map((payment) => (
                              <TouchableOpacity
                                key={payment.id}
                                style={styles.payHistoryItem}
                                onPress={() => handleOpenPayDetail(payDebt.id, payment)}
                                activeOpacity={0.7}
                              >
                                <View style={styles.payHistoryIcon}>
                                  <Feather name="check-circle" size={16} color={CALM.positive} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <View style={styles.payHistoryTopRow}>
                                    <Text style={styles.payHistoryAmount}>{currency} {payment.amount.toFixed(2)}</Text>
                                    <Text style={styles.payHistoryDate}>{isValid(payment.date) ? format(payment.date, 'MMM dd, HH:mm') : '—'}</Text>
                                  </View>
                                  {payment.tipAmount ? (
                                    <Text style={styles.payHistoryTip}>incl. tip {currency} {payment.tipAmount.toFixed(2)}</Text>
                                  ) : null}
                                  {payment.note ? <Text style={styles.payHistoryNote}>{payment.note}</Text> : null}
                                  {payment.editLog && payment.editLog.length > 0 && (
                                    <View style={styles.payEditedBadge}>
                                      <Feather name="edit-2" size={10} color={CALM.bronze} />
                                      <Text style={styles.payEditedBadgeText}>
                                        edited {(() => { const d = new Date(payment.editLog[payment.editLog.length - 1].editedAt); return isValid(d) ? format(d, 'MMM d, HH:mm') : '—'; })()}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                <View style={styles.payHistoryEditHint}>
                                  <Feather name="chevron-right" size={14} color={CALM.textMuted} />
                                </View>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </KeyboardAwareScrollView>
                    </>
                  );
                })()}
              </View>
        </View>
      </Modal>

      {/* ── Split Detail Modal (Summary View) ─────────────────── */}
      <Modal visible={splitDetailVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setSplitDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setSplitDetailVisible(false)} />
          <View style={[styles.modalContent, { paddingBottom: Math.max(SPACING['2xl'], insets.bottom + SPACING.lg) }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleAccent}>
                <Text style={styles.modalTitle}>Split Summary</Text>
              </View>
              <TouchableOpacity onPress={() => setSplitDetailVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

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

              // Add tax row per person if tax is divided equally
              if (selectedSplit.taxAmount && selectedSplit.taxAmount > 0 && selectedSplit.taxHandling === 'divide') {
                const participantsWithAmount = selectedSplit.participants.filter((p) => p.amount > 0);
                const taxPerPerson = Math.round((selectedSplit.taxAmount / (participantsWithAmount.length || 1)) * 100) / 100;
                participantsWithAmount.forEach((p) => {
                  const list = itemBreakdown.get(p.contact.id);
                  if (list) list.push({ name: 'Tax', amount: taxPerPerson, shared: true });
                });
              }

              return (
                <ScrollView showsVerticalScrollIndicator={false} bounces>
                  {/* Summary header */}
                  <View style={styles.wizardSummarySection}>
                    <View style={styles.wizardSummaryRow}>
                      <Text style={styles.wizardSummaryLabel}>Description</Text>
                      <Text style={styles.wizardSummaryValue}>{selectedSplit.description}</Text>
                    </View>
                    <View style={styles.wizardSummaryRow}>
                      <Text style={styles.wizardSummaryLabel}>Total</Text>
                      <Text style={styles.wizardSummaryValue}>{currency} {selectedSplit.totalAmount.toFixed(2)}</Text>
                    </View>
                    {selectedSplit.taxAmount != null && selectedSplit.taxAmount > 0 && (
                      <View style={styles.wizardSummaryRow}>
                        <Text style={styles.wizardSummaryLabel}>Tax</Text>
                        <Text style={styles.wizardSummaryValue}>
                          {currency} {selectedSplit.taxAmount.toFixed(2)} ({selectedSplit.taxHandling === 'divide' ? 'split equally' : 'waived'})
                        </Text>
                      </View>
                    )}
                    {selectedSplit.paidBy && (
                      <View style={styles.wizardSummaryRow}>
                        <Text style={styles.wizardSummaryLabel}>Paid by</Text>
                        <Text style={styles.wizardSummaryValue}>{selectedSplit.paidBy.name}</Text>
                      </View>
                    )}
                    <View style={styles.wizardSummaryRow}>
                      <Text style={styles.wizardSummaryLabel}>Method</Text>
                      <Text style={styles.wizardSummaryValue}>
                        {selectedSplit.splitMethod === 'item_based' ? 'Item-based' : selectedSplit.splitMethod === 'custom' ? 'Custom' : 'Equal'}
                      </Text>
                    </View>
                    <View style={styles.wizardSummaryRow}>
                      <Text style={styles.wizardSummaryLabel}>Date</Text>
                      <Text style={styles.wizardSummaryValue}>{isValid(selectedSplit.createdAt) ? format(selectedSplit.createdAt, 'MMM dd, yyyy') : '—'}</Text>
                    </View>
                  </View>

                  {/* Per person breakdown */}
                  <Text style={[styles.formLabel, { marginTop: SPACING.lg }]}>Per Person</Text>
                  {selectedSplit.participants.map((p) => {
                    const items = itemBreakdown.get(p.contact.id) || [];
                    const isPaid = p.isPaid;
                    const isSelf = p.contact.id === '__self__';

                    const participantColor = isSelf ? '#A688B8' : isPaid ? CALM.positive : '#DEAB22';

                    return (
                      <View key={p.contact.id} style={[
                        styles.wizardPersonCard,
                        { borderLeftWidth: 3, borderLeftColor: participantColor },
                      ]}>
                        <View style={styles.wizardPersonHeader}>
                          <View style={[styles.participantAvatar, { backgroundColor: withAlpha(participantColor, 0.12) }]}>
                            <Text style={[styles.participantAvatarText, { color: participantColor }]}>
                              {p.contact.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.wizardPersonName}>{p.contact.name}</Text>
                            {isSelf && <Text style={{ fontSize: 10, color: '#A688B8', fontWeight: '600' }}>my share</Text>}
                          </View>
                          {isPaid && !isSelf ? (
                            <TouchableOpacity
                              style={styles.splitPaidChip}
                              onPress={() => handleSplitUndoPaid(selectedSplit, p)}
                              activeOpacity={0.7}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Feather name="check" size={12} color={CALM.positive} />
                              <Text style={styles.splitPaidChipText}>Paid</Text>
                            </TouchableOpacity>
                          ) : !isSelf ? (
                            <TouchableOpacity
                              style={styles.splitMarkPaidChip}
                              onPress={() => handleSplitMarkPaid(selectedSplit, p)}
                              activeOpacity={0.7}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Feather name="circle" size={12} color={CALM.textSecondary} />
                              <Text style={styles.splitMarkPaidChipText}>Mark Paid</Text>
                            </TouchableOpacity>
                          ) : null}
                          <Text style={[styles.wizardPersonTotal, { color: participantColor }]}>
                            {currency} {p.amount.toFixed(2)}
                          </Text>
                        </View>
                        {items.map((share, idx) => (
                          <View key={idx} style={styles.wizardShareRow}>
                            <Text style={styles.wizardShareName} numberOfLines={1}>
                              {share.name}{share.shared ? ' (shared)' : ''}
                            </Text>
                            <Text style={styles.wizardShareAmount}>
                              {currency} {share.amount.toFixed(2)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                  <View style={{ height: SPACING.xl }} />
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Receipt Split Wizard Modal ────────────────────────── */}
      <Modal
        visible={wizardVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={handleWizardBack}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => { setWizardVisible(false); resetWizardForm(); }} />
          <View style={[styles.wizardContent, { paddingBottom: Math.max(SPACING['2xl'], insets.bottom + SPACING.lg) }]}>
            {/* Step Indicator */}
            <View style={styles.wizardStepRow}>
              {[1, 2, ...(wizardHasTax ? [3] : []), 4, 5, 6].map((step, idx) => {
                const isActive = wizardStep === step;
                const isCompleted = wizardStep > step;
                return (
                  <View key={step} style={styles.wizardStepItem}>
                    {idx > 0 && (
                      <View style={[styles.wizardStepLine, isCompleted && { backgroundColor: CALM.accent }]} />
                    )}
                    <View
                      style={[
                        styles.wizardStepCircle,
                        isActive && { backgroundColor: CALM.accent, borderColor: CALM.accent },
                        isCompleted && { backgroundColor: CALM.accent, borderColor: CALM.accent },
                      ]}
                    >
                      {isCompleted ? (
                        <Feather name="check" size={14} color="#fff" />
                      ) : (
                        <Text style={[styles.wizardStepNum, (isActive || isCompleted) && { color: '#fff' }]}>
                          {step}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Step 1: Purpose */}
              {wizardStep === 1 && (
                <View>
                  <Text style={styles.wizardTitle}>What is this for?</Text>
                  <TextInput
                    style={styles.formInput}
                    value={wizardDescription}
                    onChangeText={setWizardDescription}
                    placeholder="e.g. Dinner, Groceries..."
                    placeholderTextColor={CALM.textSecondary}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  {wizardReceipt && (
                    <View style={styles.wizardContext}>
                      {wizardReceipt.date && (
                        <Text style={styles.wizardContextText}>
                          <Feather name="calendar" size={13} color={CALM.textSecondary} /> {wizardReceipt.date}
                        </Text>
                      )}
                      <Text style={styles.wizardContextText}>
                        <Feather name="list" size={13} color={CALM.textSecondary} /> {wizardReceipt.items.length} items scanned
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Step 2: Amount Verification */}
              {wizardStep === 2 && (
                <View>
                  <Text style={styles.wizardTitle}>Is this total correct?</Text>
                  {!wizardEditingAmount ? (
                    <View style={styles.wizardAmountDisplay}>
                      <Text style={styles.wizardAmountBig}>
                        {currency} {parseFloat(wizardTotal || '0').toFixed(2)}
                      </Text>
                      {wizardReceipt?.subtotal != null && wizardHasTax && (
                        <View style={styles.wizardAmountBreakdown}>
                          <Text style={styles.wizardBreakdownText}>
                            Subtotal: {currency} {wizardReceipt.subtotal.toFixed(2)}
                          </Text>
                          <Text style={styles.wizardBreakdownText}>
                            Tax: {currency} {wizardTaxAmount.toFixed(2)}
                          </Text>
                        </View>
                      )}
                      <View style={styles.wizardAmountActions}>
                        <TouchableOpacity
                          style={styles.wizardCorrectBtn}
                          onPress={handleWizardNext}
                          activeOpacity={0.7}
                        >
                          <Feather name="check" size={18} color="#fff" />
                          <Text style={styles.wizardCorrectText}>Correct</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.wizardEditBtn}
                          onPress={() => setWizardEditingAmount(true)}
                          activeOpacity={0.7}
                        >
                          <Feather name="edit-2" size={18} color={CALM.accent} />
                          <Text style={styles.wizardEditText}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View>
                      <Text style={styles.formLabel}>Total Amount</Text>
                      <TextInput
                        style={styles.formInput}
                        value={wizardTotal}
                        onChangeText={setWizardTotal}
                        keyboardType="decimal-pad"
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Step 3: Tax Handling */}
              {wizardStep === 3 && (
                <View>
                  <Text style={styles.wizardTitle}>How to handle tax?</Text>
                  <Text style={styles.wizardSubtitle}>
                    Tax detected: {currency} {wizardTaxAmount.toFixed(2)}
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
                      <Feather name="divide" size={20} color={wizardTaxHandling === 'divide' ? CALM.accent : CALM.textSecondary} />
                      <Text style={[styles.wizardOptionTitle, wizardTaxHandling === 'divide' && { color: CALM.accent }]}>
                        Divide Evenly
                      </Text>
                    </View>
                    <Text style={styles.wizardOptionDesc}>
                      Tax is split equally among everyone
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
                      <Feather name="x-circle" size={20} color={wizardTaxHandling === 'waive' ? CALM.accent : CALM.textSecondary} />
                      <Text style={[styles.wizardOptionTitle, wizardTaxHandling === 'waive' && { color: CALM.accent }]}>
                        Waive Tax
                      </Text>
                    </View>
                    <Text style={styles.wizardOptionDesc}>
                      Exclude tax from total — only split the item costs
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Step 4: Item Assignment */}
              {wizardStep === 4 && (
                <View>
                  <Text style={styles.wizardTitle}>Assign Items</Text>
                  <Text style={styles.wizardSubtitle}>Tap an item to assign people</Text>

                  {wizardParticipants.length > 0 && wizardItems.length > 0 && (
                    <TouchableOpacity
                      style={styles.wizardAssignAllBtn}
                      onPress={handleAssignAllEvenly}
                      activeOpacity={0.7}
                    >
                      <Feather name="users" size={14} color={CALM.accent} />
                      <Text style={styles.wizardAssignAllText}>Assign all evenly</Text>
                    </TouchableOpacity>
                  )}

                  {wizardItems.map((item, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.itemCard}
                      activeOpacity={0.7}
                      onPress={() => handleOpenItemAssign(index)}
                    >
                      <View style={styles.itemHeader}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemAmount}>{currency} {item.amount.toFixed(2)}</Text>
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
                          <Text style={styles.itemUnassignedText}>not assigned</Text>
                        )}
                        <View style={styles.itemAddBtn}>
                          <Feather name="plus" size={14} color={CALM.accent} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Step 5: Who paid the bill? */}
              {wizardStep === 5 && (
                <View>
                  <Text style={styles.wizardTitle}>Who paid the bill?</Text>
                  <Text style={styles.wizardSubtitle}>Select the person who paid</Text>

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
                        <View style={[styles.participantAvatar, { backgroundColor: withAlpha(isSelected ? CALM.accent : CALM.neutral, 0.12) }]}>
                          <Text style={[styles.participantAvatarText, { color: isSelected ? CALM.accent : CALM.neutral }]}>
                            {self.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.wizardPayerName, isSelected && { color: CALM.accent }]}>
                          {self.name}
                        </Text>
                        {isSelected && <Feather name="check-circle" size={20} color={CALM.accent} />}
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
                          <View style={[styles.participantAvatar, { backgroundColor: withAlpha(isSelected ? CALM.accent : CALM.neutral, 0.12) }]}>
                            <Text style={[styles.participantAvatarText, { color: isSelected ? CALM.accent : CALM.neutral }]}>
                              {p.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={[styles.wizardPayerName, isSelected && { color: CALM.accent }]}>
                            {p.name}
                          </Text>
                          {isSelected && <Feather name="check-circle" size={20} color={CALM.accent} />}
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
                        label="Paid from which wallet?"
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Step 6: Summary & Save */}
              {wizardStep === 6 && wizardResult && (
                <View>
                  <Text style={styles.wizardTitle}>Summary</Text>

                  <View style={styles.wizardSummarySection}>
                    <View style={styles.wizardSummaryRow}>
                      <Text style={styles.wizardSummaryLabel}>Description</Text>
                      <Text style={styles.wizardSummaryValue}>{wizardDescription}</Text>
                    </View>
                    <View style={styles.wizardSummaryRow}>
                      <Text style={styles.wizardSummaryLabel}>Total</Text>
                      <Text style={styles.wizardSummaryValue}>
                        {currency} {wizardResult.effectiveTotal.toFixed(2)}
                      </Text>
                    </View>
                    {wizardHasTax && (
                      <View style={styles.wizardSummaryRow}>
                        <Text style={styles.wizardSummaryLabel}>Tax</Text>
                        <Text style={styles.wizardSummaryValue}>
                          {wizardTaxHandling === 'divide'
                            ? `${currency} ${wizardTaxAmount.toFixed(2)} (split equally)`
                            : `${currency} ${wizardTaxAmount.toFixed(2)} (waived)`}
                        </Text>
                      </View>
                    )}
                    {wizardPaidBy && (
                      <View style={styles.wizardSummaryRow}>
                        <Text style={styles.wizardSummaryLabel}>Paid by</Text>
                        <Text style={styles.wizardSummaryValue}>{wizardPaidBy.name}</Text>
                      </View>
                    )}
                    {wizardPaidBy?.id === '__self__' && wizardWalletId && (() => {
                      const w = wallets.find((wl) => wl.id === wizardWalletId);
                      if (!w) return null;
                      return (
                        <View style={styles.wizardSummaryRow}>
                          <Text style={styles.wizardSummaryLabel}>From wallet</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                            <Feather name={w.icon as keyof typeof Feather.glyphMap} size={14} color={w.color} />
                            <Text style={[styles.wizardSummaryValue, { color: w.color }]}>{w.name}</Text>
                          </View>
                        </View>
                      );
                    })()}
                  </View>

                  <Text style={[styles.formLabel, { marginTop: SPACING.lg }]}>Per Person</Text>
                  {wizardResult.breakdown.map((person) => {
                    const isMe = person.contact.id === '__self__';
                    const cardColor = isMe ? '#A688B8' : CALM.accent;
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
                          {isMe && <Text style={{ fontSize: 10, color: '#A688B8', fontWeight: '600' }}>my share</Text>}
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
                          <Text style={styles.wizardShareName}>Tax share</Text>
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
                        <Text style={styles.formLabel}>Debts</Text>
                        {debtsPreview.map((d, idx) => (
                          <View key={idx} style={styles.wizardDebtRow}>
                            <Feather
                              name={d.type === 'they_owe' ? 'arrow-down-left' : 'arrow-up-right'}
                              size={16}
                              color={d.type === 'they_owe' ? CALM.positive : CALM.neutral}
                            />
                            <Text style={styles.wizardDebtText}>
                              {d.type === 'they_owe'
                                ? `${d.name} owes you`
                                : `You owe ${d.name}`}
                            </Text>
                            <Text style={[styles.wizardDebtAmount, { color: d.type === 'they_owe' ? CALM.positive : CALM.neutral }]}>
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
              <View style={styles.modalActions}>
                <Button
                  title={wizardStep === 1 ? 'Cancel' : 'Back'}
                  onPress={handleWizardBack}
                  variant="outline"
                  icon={wizardStep === 1 ? undefined : 'arrow-left'}
                  style={{ flex: 1 }}
                />
                {wizardStep === 6 ? (
                  <Button
                    title="Save"
                    onPress={handleWizardSave}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                ) : wizardStep === 2 && !wizardEditingAmount ? (
                  <View style={{ flex: 1 }} />
                ) : (
                  <Button
                    title="Next"
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
            <View style={styles.assignModalSheet}>
              {itemAssignMode === 'assign' ? (
                <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                      <Feather name="x" size={22} color={CALM.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  {/* Add Me button */}
                  {!wizardItems[assigningItemIndex]?.assignedTo.some((c) => c.id === '__self__') && (
                    <TouchableOpacity
                      style={styles.addMeBtn}
                      onPress={() => handleItemAddContact(getSelfContact())}
                      activeOpacity={0.7}
                    >
                      <Feather name="user" size={16} color={CALM.accent} />
                      <Text style={styles.addMeBtnText}>+ {getSelfContact().name}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Currently assigned */}
                  {wizardItems[assigningItemIndex]?.assignedTo.length > 0 && (
                    <View style={{ marginBottom: SPACING.lg }}>
                      <Text style={styles.assignModalLabel}>Assigned</Text>
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
                            <Feather name="x" size={10} color={CALM.accent} style={{ marginLeft: 4 }} />
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
                      <Text style={styles.assignModalLabel}>Quick add</Text>
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
                    <Feather name="book" size={16} color={CALM.accent} />
                    <Text style={styles.assignFromContactsText}>From Contacts</Text>
                  </TouchableOpacity>

                  {/* Manual name input */}
                  <Text style={styles.assignModalLabel}>Add new person</Text>
                  <View style={styles.assignManualRow}>
                    <TextInput
                      style={[styles.formInput, { flex: 1 }]}
                      value={itemManualName}
                      onChangeText={setItemManualName}
                      placeholder="Type a name"
                      placeholderTextColor={CALM.textSecondary}
                      returnKeyType="done"
                      onSubmitEditing={handleItemAddManual}
                    />
                    <TouchableOpacity
                      style={styles.assignManualAddBtn}
                      onPress={handleItemAddManual}
                      activeOpacity={0.7}
                    >
                      <Feather name="plus" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  {/* Done button */}
                  <TouchableOpacity
                    style={styles.assignDoneBtn}
                    onPress={() => setAssigningItemIndex(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.assignDoneText}>Done</Text>
                  </TouchableOpacity>
                </KeyboardAwareScrollView>
              ) : (
                <>
                  {/* Phone Contacts List */}
                  <View style={styles.assignModalHeader}>
                    <TouchableOpacity
                      onPress={() => setItemAssignMode('assign')}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Feather name="arrow-left" size={22} color={CALM.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.assignModalItemName, { flex: 1, marginLeft: SPACING.md }]}>
                      Select Contact
                    </Text>
                    <TouchableOpacity
                      onPress={() => { setItemAssignMode('assign'); }}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Feather name="x" size={22} color={CALM.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={[styles.formInput, { marginBottom: SPACING.md }]}
                    value={itemContactSearch}
                    onChangeText={setItemContactSearch}
                    placeholder="Search contacts..."
                    placeholderTextColor={CALM.textSecondary}
                    autoFocus
                    returnKeyType="search"
                    onSubmitEditing={Keyboard.dismiss}
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
                            <Feather name="check-circle" size={20} color={CALM.positive} />
                          )}
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={
                      <View style={{ alignItems: 'center', paddingVertical: SPACING['2xl'] }}>
                        <Feather name="users" size={28} color={CALM.neutral} />
                        <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: CALM.textSecondary, marginTop: SPACING.sm }}>
                          No contacts found
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
                    <Text style={styles.assignDoneText}>Done</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
          </KeyboardAvoidingView>
        )}
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Scanning Loading Overlay ──────────────────────────── */}
      {scanningReceipt && (
        <Modal visible transparent statusBarTranslucent animationType="fade">
          <View style={styles.scanningOverlay}>
            <View style={styles.scanningCard}>
              <ActivityIndicator size="large" color={CALM.accent} />
              <Text style={styles.scanningTitle}>Scanning receipt...</Text>
              <Text style={styles.scanningSubtext}>AI is reading your receipt</Text>
            </View>
          </View>
        </Modal>
      )}

      {/* ── FAB Choice Modal ─────────────────────────────────────────────── */}
      <Modal visible={fabChoiceVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setFabChoiceVisible(false)}>
        <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setFabChoiceVisible(false)}>
          <Pressable onPress={() => {}} style={styles.choiceCard}>
            <Text style={styles.choiceTitle}>New Entry</Text>
            <Text style={styles.choiceSubtitle}>What would you like to add?</Text>
            {([
              { icon: 'users' as const, label: 'Add Debt', desc: 'Track money you owe or are owed', onPress: () => { setFabChoiceVisible(false); resetDebtForm(); setDebtModalVisible(true); } },
              { icon: 'scissors' as const, label: 'Split Expense', desc: 'Divide a bill among a group', onPress: () => { setFabChoiceVisible(false); setSplitChoiceVisible(true); } },
            ] as const).map((opt, i, arr) => (
              <TouchableOpacity key={opt.label} onPress={opt.onPress} activeOpacity={0.7} style={[styles.choiceRow, i < arr.length - 1 && styles.choiceRowBorder]}>
                <View style={styles.choiceIcon}><Feather name={opt.icon} size={18} color={CALM.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.choiceLabel}>{opt.label}</Text>
                  <Text style={styles.choiceDesc}>{opt.desc}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={CALM.textMuted} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Split Choice Modal (animationType="none" — instant dismiss, safe for native pickers) ── */}
      <Modal visible={splitChoiceVisible} animationType="none" transparent statusBarTranslucent onRequestClose={() => setSplitChoiceVisible(false)}>
        <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setSplitChoiceVisible(false)}>
          <Pressable onPress={() => {}} style={styles.choiceCard}>
            <Text style={styles.choiceTitle}>Split Expense</Text>
            <Text style={styles.choiceSubtitle}>How would you like to split?</Text>
            {([
              { icon: 'edit-3' as const, label: 'Manual', desc: 'Enter items and amounts yourself', onPress: () => { setSplitChoiceVisible(false); resetSplitForm(); setSplitModalVisible(true); } },
              { icon: 'camera' as const, label: 'Take Photo', desc: 'Scan a receipt with your camera', onPress: () => { setSplitChoiceVisible(false); setTimeout(handleWizardScan, 50); } },
              { icon: 'image' as const, label: 'Choose from Gallery', desc: 'Pick a receipt photo from your gallery', onPress: () => { setSplitChoiceVisible(false); setTimeout(handleWizardGallery, 50); } },
            ] as const).map((opt, i, arr) => (
              <TouchableOpacity key={opt.label} onPress={opt.onPress} activeOpacity={0.7} style={[styles.choiceRow, i < arr.length - 1 && styles.choiceRowBorder]}>
                <View style={styles.choiceIcon}><Feather name={opt.icon} size={18} color={CALM.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.choiceLabel}>{opt.label}</Text>
                  <Text style={styles.choiceDesc}>{opt.desc}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={CALM.textMuted} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Reminder Modal ──────────────────────────────── */}
      <Modal visible={reminderModalVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setReminderModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setReminderModalVisible(false)} />
          <View style={[styles.modalContent, { paddingBottom: Math.max(SPACING['2xl'], insets.bottom + SPACING.lg) }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleAccent}>
                <Text style={styles.modalTitle}>Send Reminder</Text>
              </View>
              <TouchableOpacity onPress={() => setReminderModalVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            {reminderDebt && (
              <>
                {/* Recipient */}
                <View style={styles.requestPaymentRecipient}>
                  <View style={[styles.debtAvatar, { backgroundColor: withAlpha(CALM.accent, 0.12), borderColor: withAlpha(CALM.accent, 0.25) }]}>
                    <Text style={[styles.debtAvatarText, { color: CALM.accent }]}>
                      {reminderDebt.contact.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.debtName}>{reminderDebt.contact.name}</Text>
                    <Text style={styles.requestPaymentOwes}>
                      Owes {currency} {(reminderDebt.totalAmount - reminderDebt.paidAmount).toFixed(2)}
                      {' · '}
                      <Text style={{ color: (() => { const d = differenceInDays(Date.now(), new Date(reminderDebt.createdAt)); return d >= 30 ? '#A0714A' : d >= 7 ? CALM.gold : CALM.accent; })() }}>
                        {getDebtAge(reminderDebt.createdAt)} ago
                      </Text>
                    </Text>
                  </View>
                </View>

                {/* Message label + edit toggle */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
                  <Text style={[styles.requestPaymentLabel, { marginBottom: 0 }]}>Message</Text>
                  {reminderEditing ? (
                    <TouchableOpacity
                      onPress={() => { Keyboard.dismiss(); setReminderEditing(false); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: CALM.accent }}>Done</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setReminderEditing(true)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Feather name="edit-3" size={13} color={CALM.accent} />
                      <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: CALM.accent }}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Message input */}
                <TextInput
                  style={[styles.requestPaymentMessageInput, !reminderEditing && { color: CALM.textSecondary }]}
                  value={reminderMessage}
                  onChangeText={setReminderMessage}
                  multiline
                  textAlignVertical="top"
                  placeholderTextColor={CALM.textSecondary}
                  editable={reminderEditing}
                  onFocus={() => setReminderEditing(true)}
                  onBlur={() => setReminderEditing(false)}
                />

                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
                  <TouchableOpacity
                    style={[styles.requestPaymentCopyBtn, { flex: 1 }, reminderCopied && { backgroundColor: withAlpha(CALM.positive, 0.1) }]}
                    onPress={async () => {
                      await Clipboard.setStringAsync(reminderMessage);
                      setReminderCopied(true);
                      setTimeout(() => setReminderCopied(false), 2000);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name={reminderCopied ? 'check' : 'copy'} size={18} color={reminderCopied ? CALM.positive : CALM.accent} />
                    <Text style={[styles.requestPaymentCopyText, reminderCopied && { color: CALM.positive }]}>
                      {reminderCopied ? 'Copied!' : 'Copy'}
                    </Text>
                  </TouchableOpacity>

                  {reminderDebt.contact.phone && (
                    <TouchableOpacity
                      style={[styles.requestPaymentWhatsAppBtn, { flex: 2 }]}
                      onPress={() => {
                        const phone = reminderDebt!.contact.phone!.replace(/[^0-9]/g, '');
                        const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(reminderMessage)}`;
                        Linking.openURL(url).catch(() => {});
                        setReminderModalVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name="message-circle" size={18} color="#fff" />
                      <Text style={styles.requestPaymentWhatsAppText}>WhatsApp</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Request Payment Modal ──────────────────────────────── */}
      <Modal
        visible={requestPaymentVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => { setRequestPaymentVisible(false); setRequestPaymentDebt(null); setShowQrPicker(false); }}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => { setRequestPaymentVisible(false); setRequestPaymentDebt(null); setShowQrPicker(false); }} />
          <View style={[styles.modalContent, { paddingBottom: Math.max(SPACING['2xl'], insets.bottom + SPACING.lg) }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleAccent}>
                <Text style={styles.modalTitle}>Request Payment</Text>
              </View>
              <TouchableOpacity onPress={() => { setRequestPaymentVisible(false); setRequestPaymentDebt(null); setShowQrPicker(false); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            {requestPaymentDebt && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.requestPaymentRecipient}>
                  <View style={[styles.debtAvatar, { backgroundColor: withAlpha(CALM.accent, 0.12) }]}>
                    <Text style={[styles.debtAvatarText, { color: CALM.accent }]}>
                      {requestPaymentDebt.contact.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.debtName}>{requestPaymentDebt.contact.name}</Text>
                    <Text style={styles.requestPaymentOwes}>
                      Owes {currency} {(requestPaymentDebt.totalAmount - requestPaymentDebt.paidAmount).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
                  <Text style={[styles.requestPaymentLabel, { marginBottom: 0 }]}>Message</Text>
                  {messageEditing ? (
                    <TouchableOpacity
                      onPress={() => { Keyboard.dismiss(); setMessageEditing(false); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: CALM.accent }}>Done</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => { setMessageEditing(true); messageInputRef.current?.focus(); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Feather name="edit-3" size={13} color={CALM.accent} />
                      <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: CALM.accent }}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  ref={messageInputRef}
                  style={[styles.requestPaymentMessageInput, !messageEditing && { color: CALM.textSecondary }]}
                  value={requestPaymentMessage}
                  onChangeText={setRequestPaymentMessage}
                  multiline
                  textAlignVertical="top"
                  placeholderTextColor={CALM.textSecondary}
                  editable={messageEditing}
                  onFocus={() => setMessageEditing(true)}
                  onBlur={() => setMessageEditing(false)}
                />

                <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
                  <TouchableOpacity
                    style={[styles.requestPaymentCopyBtn, { flex: 1 }, messageCopied && { backgroundColor: withAlpha(CALM.positive, 0.1) }]}
                    onPress={handleCopyPaymentMessage}
                    activeOpacity={0.7}
                  >
                    <Feather name={messageCopied ? 'check' : 'copy'} size={18} color={messageCopied ? CALM.positive : CALM.accent} />
                    <Text style={[styles.requestPaymentCopyText, messageCopied && { color: CALM.positive }]}>
                      {messageCopied ? 'Copied!' : 'Copy'}
                    </Text>
                  </TouchableOpacity>

                  {requestPaymentDebt.contact.phone && (
                    <TouchableOpacity
                      style={[styles.requestPaymentWhatsAppBtn, { flex: 2 }]}
                      onPress={handleWhatsAppTap}
                      activeOpacity={0.7}
                    >
                      <Feather name="message-circle" size={18} color="#fff" />
                      <Text style={styles.requestPaymentWhatsAppText}>
                        {hasPaymentQr ? 'WhatsApp + QR' : 'WhatsApp'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {showQrPicker && paymentQrs.length > 1 && (
                  <View style={{ marginTop: SPACING.md }}>
                    <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: CALM.textSecondary, marginBottom: SPACING.sm, fontWeight: '600' }}>
                      Which QR to send?
                    </Text>
                    {paymentQrs.map((qr, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: SPACING.md,
                          borderRadius: SPACING.sm,
                          backgroundColor: withAlpha(CALM.accent, 0.06),
                          marginBottom: SPACING.sm,
                          gap: SPACING.md,
                        }}
                        activeOpacity={0.7}
                        onPress={() => sendWhatsAppWithQr(idx)}
                      >
                        <Image source={{ uri: qr.uri }} style={{ width: 44, height: 44, borderRadius: SPACING.xs }} resizeMode="cover" />
                        <Text style={{ flex: 1, fontSize: TYPOGRAPHY.size.base, color: CALM.textPrimary, fontWeight: '500' }} numberOfLines={1}>{qr.label}</Text>
                        <Feather name="send" size={16} color={CALM.accent} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {!hasPaymentQr && (
                  <View style={styles.requestPaymentQrHint}>
                    <Feather name="info" size={16} color={CALM.textSecondary} />
                    <Text style={styles.requestPaymentQrHintText}>
                      Add your payment QR in Settings for easier payments
                    </Text>
                  </View>
                )}

                <Button
                  title="Close"
                  onPress={() => { setRequestPaymentVisible(false); setRequestPaymentDebt(null); setShowQrPicker(false); }}
                  variant="outline"
                  style={{ marginTop: SPACING.lg }}
                />
              </ScrollView>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Sort Modal ─────────────────────────────────────────── */}
      <Modal visible={sortModalVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setSortModalVisible(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setSortModalVisible(false)}>
          <View
            style={{
              position: 'absolute',
              top: 120,
              right: 16,
              width: 240,
              backgroundColor: '#fff',
              borderRadius: 14,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
              paddingVertical: 8,
              overflow: 'hidden',
            }}
          >
            <Pressable onPress={() => {}}>
              {/* Filter by Type — debts tab only */}
              {activeTab === 'debts' && (
                <>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: CALM.textSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>Filter by Type</Text>
                  {([
                    { key: 'they_owe' as const, label: 'They Owe' },
                    { key: 'i_owe' as const, label: 'I Owe' },
                  ]).map((f) => {
                    const isActive = debtTypeFilter === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isActive ? withAlpha(CALM.accent, 0.06) : 'transparent' }}
                        onPress={() => setDebtTypeFilter(isActive ? null : f.key)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 14, color: isActive ? CALM.accent : CALM.textPrimary, fontWeight: isActive ? '600' : '400' }}>{f.label}</Text>
                        {isActive && <Feather name="check" size={16} color={CALM.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                  <View style={{ height: 1, backgroundColor: CALM.border, marginHorizontal: 16, marginVertical: 4 }} />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: CALM.textSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>Filter by Status</Text>
                  {([
                    { key: 'pending' as const, label: 'Pending' },
                    { key: 'partial' as const, label: 'Partial' },
                    { key: 'settled' as const, label: 'Settled' },
                  ]).map((f) => {
                    const isActive = debtFilter === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isActive ? withAlpha(CALM.accent, 0.06) : 'transparent' }}
                        onPress={() => setDebtFilter(isActive ? null : f.key)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 14, color: isActive ? CALM.accent : CALM.textPrimary, fontWeight: isActive ? '600' : '400' }}>{f.label}</Text>
                        {isActive && <Feather name="check" size={16} color={CALM.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                  <View style={{ height: 1, backgroundColor: CALM.border, marginHorizontal: 16, marginVertical: 4 }} />
                </>
              )}
              {/* Sort By */}
              <Text style={{ fontSize: 11, fontWeight: '600', color: CALM.textSecondary, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>Sort By</Text>
              {([
                { key: 'newest' as const, label: 'Newest First', icon: 'arrow-down' as const },
                { key: 'oldest' as const, label: 'Oldest First', icon: 'arrow-up' as const },
                { key: 'amount_high' as const, label: 'Highest Amount', icon: 'trending-up' as const },
                { key: 'amount_low' as const, label: 'Lowest Amount', icon: 'trending-down' as const },
              ]).map((option) => {
                const currentSort = activeTab === 'splits' ? splitSort : debtSort;
                const isActive = currentSort === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isActive ? withAlpha(CALM.accent, 0.06) : 'transparent' }}
                    onPress={() => {
                      if (activeTab === 'splits') setSplitSort(option.key);
                      else setDebtSort(option.key);
                      setSortModalVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name={option.icon} size={16} color={isActive ? CALM.accent : CALM.textSecondary} />
                    <Text style={{ flex: 1, fontSize: 14, color: isActive ? CALM.accent : CALM.textPrimary, fontWeight: isActive ? '600' : '400' }}>{option.label}</Text>
                    {isActive && <Feather name="check" size={16} color={CALM.accent} />}
                  </TouchableOpacity>
                );
              })}
              {/* Clear filters button — show when any filter active */}
              {(debtTypeFilter || debtFilter) && activeTab === 'debts' && (
                <>
                  <View style={{ height: 1, backgroundColor: CALM.border, marginHorizontal: 16, marginVertical: 4 }} />
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
                    onPress={() => { setDebtTypeFilter(null); setDebtFilter(null); setSortModalVisible(false); }}
                    activeOpacity={0.7}
                  >
                    <Feather name="x-circle" size={16} color={CALM.gold} />
                    <Text style={{ fontSize: 14, color: CALM.gold, fontWeight: '600' }}>Clear Filters</Text>
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Inline Category Manager (no navigation needed) ── */}
      <CategoryManager
        visible={categoryManagerType !== null}
        onClose={() => {
          setCategoryManagerType(null);
          if (categoryManagerCallerRef.current === 'payment') {
            setPaymentModalAnimation('fade');
            setPaymentModalVisible(true);
          } else {
            setDebtModalAnimation('fade');
            setDebtModalVisible(true);
          }
        }}
        type={categoryManagerType ?? 'expense'}
        mode={mode === 'personal' ? 'personal' : 'business'}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 80,
  },

  // Hero — Two Mini Stat Cards
  heroGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  heroMiniCard: {
    flex: 1,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
    borderLeftWidth: 3,
  },
  heroMiniLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.xs,
  },
  heroMiniLabelText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  heroMiniAmount: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  heroMiniSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 2,
  },

  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
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
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  debtFilterPillActive: {
    backgroundColor: withAlpha(CALM.accent, 0.12),
    borderColor: CALM.accent,
  },
  debtFilterText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  debtFilterTextActive: {
    color: CALM.accent,
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
    backgroundColor: withAlpha(CALM.accent, 0.08),
  },
  sortOptionText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },
  sortOptionTextActive: {
    color: CALM.accent,
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
    backgroundColor: CALM.border,
    marginHorizontal: SPACING.sm,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
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
    borderTopColor: CALM.border,
  },
  netLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    letterSpacing: 0.2,
  },
  netAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
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
    borderBottomColor: CALM.accent,
  },
  tabText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  tabTextActive: {
    color: CALM.accent,
    fontWeight: TYPOGRAPHY.weight.bold,
  },

  // Debt Cards
  debtCard: {
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
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
  },
  debtInfo: {
    flex: 1,
  },
  debtName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  debtDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  debtTimestamp: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
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
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  debtActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  debtActionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Split Cards
  splitCard: {
    marginBottom: SPACING.sm,
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
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  splitSubtext: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },
  splitAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
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
    color: CALM.textSecondary,
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
    backgroundColor: CALM.background,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  participantChipPaid: {
    backgroundColor: withAlpha('#6BA3BE', 0.1),
    borderColor: withAlpha('#6BA3BE', 0.3),
  },
  participantChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    maxWidth: 80,
  },
  participantChipTextPaid: {
    color: '#6BA3BE',
  },
  splitActions: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CALM.surface,
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
    borderBottomColor: CALM.border,
    paddingBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  modalTitleAccent: {
    borderLeftWidth: 3,
    borderLeftColor: CALM.accent,
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
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  formLabelOptional: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: CALM.textSecondary,
  },
  formInput: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderWidth: 1.5,
    borderColor: withAlpha(CALM.accent, 0.2),
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dateButtonText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },
  datePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  datePickerCard: {
    backgroundColor: CALM.surface,
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
    borderBottomColor: CALM.border,
  },
  datePickerTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  datePickerDone: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
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
    borderColor: CALM.border,
    backgroundColor: CALM.background,
  },
  typeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
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
    borderColor: CALM.border,
    backgroundColor: CALM.surface,
  },
  methodButtonActive: {
    borderColor: CALM.accent,
    backgroundColor: withAlpha(CALM.accent, 0.12),
  },
  methodText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  methodTextActive: {
    color: CALM.accent,
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
    color: CALM.textPrimary,
  },
  customInput: {
    width: 100,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: CALM.border,
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
    backgroundColor: CALM.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCard: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: CALM.border,
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
    color: CALM.textPrimary,
  },
  itemAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  assignLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
  },
  assignChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  assignChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  assignChipActive: {
    backgroundColor: withAlpha(CALM.accent, 0.12),
    borderColor: CALM.accent,
  },
  assignChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    maxWidth: 80,
  },
  assignChipTextActive: {
    color: CALM.accent,
  },

  // Split Detail
  detailTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  detailSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
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
  },
  participantName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  participantAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
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
    backgroundColor: withAlpha(CALM.positive, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginRight: SPACING.sm,
  },
  splitPaidChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.positive,
  },
  splitMarkPaidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: withAlpha(CALM.textSecondary, 0.08),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginRight: SPACING.sm,
  },
  splitMarkPaidChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },

  // Wizard
  wizardContent: {
    backgroundColor: CALM.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING['2xl'],
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
    backgroundColor: CALM.border,
    marginHorizontal: SPACING.xs,
  },
  wizardStepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CALM.surface,
  },
  wizardStepNum: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textSecondary,
  },
  wizardTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    marginBottom: SPACING.lg,
  },
  wizardSubtitle: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
    marginBottom: SPACING.lg,
  },
  wizardContext: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  wizardContextText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  wizardAmountDisplay: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  wizardAmountBig: {
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
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
    color: CALM.textSecondary,
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
    backgroundColor: CALM.positive,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  wizardCorrectText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  wizardEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 2,
    borderColor: CALM.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  wizardEditText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  wizardOptionCard: {
    borderWidth: 2,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  wizardOptionCardActive: {
    borderColor: CALM.accent,
    backgroundColor: withAlpha(CALM.accent, 0.04),
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
    color: CALM.textPrimary,
  },
  wizardOptionDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    lineHeight: 20,
  },
  wizardAssignAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    alignSelf: 'flex-end',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(CALM.accent, 0.08),
    borderRadius: RADIUS.sm,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  wizardAssignAllText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  wizardSummarySection: {
    backgroundColor: CALM.background,
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
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    flexShrink: 0,
  },
  wizardSummaryValue: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textAlign: 'right',
    flexShrink: 1,
  },
  wizardPersonCard: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: CALM.border,
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
    color: CALM.textPrimary,
  },
  wizardPersonTotal: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
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
    color: CALM.textSecondary,
  },
  wizardShareAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // Who paid cards
  wizardPayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
  },
  wizardPayerCardActive: {
    borderColor: CALM.accent,
    backgroundColor: withAlpha(CALM.accent, 0.04),
  },
  wizardPayerName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },

  // Debt preview
  wizardDebtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },
  wizardDebtText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
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
    color: CALM.textSecondary,
    fontStyle: 'italic',
  },
  itemAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: withAlpha(CALM.accent, 0.3),
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
    backgroundColor: withAlpha(CALM.accent, 0.08),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: withAlpha(CALM.accent, 0.2),
    marginBottom: SPACING.lg,
  },
  addMeBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },

  // Assignment modal overlay
  assignModalSheet: {
    backgroundColor: CALM.surface,
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
    color: CALM.textPrimary,
  },
  assignModalItemAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  assignModalLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
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
    backgroundColor: CALM.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignFromContactsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
    marginBottom: SPACING.md,
  },
  assignFromContactsText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  assignDoneBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.md,
    marginTop: SPACING.sm,
  },
  assignDoneText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
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
    backgroundColor: withAlpha(CALM.accent, 0.06),
  },
  phoneContactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(CALM.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  phoneContactAvatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
  },
  phoneContactName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  phoneContactPhone: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
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
    backgroundColor: CALM.surface,
    borderRadius: RADIUS['2xl'],
    padding: SPACING['3xl'],
    alignItems: 'center',
    gap: SPACING.lg,
    width: 220,
  },
  scanningTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  scanningSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    textAlign: 'center',
  },

  // Choice card (FAB / Split choice)
  choiceCard: {
    width: '82%',
    backgroundColor: CALM.surface,
    borderRadius: 18,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  choiceTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  choiceSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
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
    borderBottomColor: CALM.border,
  },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(CALM.accent, 0.1),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  choiceLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  choiceDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
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
    color: CALM.positive,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  requestPaymentLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: SPACING.sm,
  },
  requestPaymentMessageInput: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
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
    backgroundColor: withAlpha(CALM.accent, 0.08),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: withAlpha(CALM.accent, 0.2),
  },
  requestPaymentCopyText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
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
    backgroundColor: CALM.background,
  },
  requestPaymentShareQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.md,
  },
  requestPaymentShareQrText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  requestPaymentQrHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: withAlpha(CALM.textSecondary, 0.06),
    borderRadius: RADIUS.md,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  requestPaymentQrHintText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
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
    color: '#fff',
  },

  // Selection mode
  selectionCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  selectionCheckboxActive: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: CALM.surface,
    borderTopWidth: 2,
    borderTopColor: CALM.accent,
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
    color: CALM.textPrimary,
  },
  selectionBarCount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
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
    backgroundColor: withAlpha(CALM.accent, 0.1),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.accent,
  },
  selectionEditText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  selectionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: withAlpha('#5E72E4', 0.9),
    borderRadius: RADIUS.md,
  },
  selectionDeleteText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // Split filter
  splitFilterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  splitFilterPill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.background,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  splitFilterPillActive: {
    backgroundColor: withAlpha(CALM.accent, 0.12),
    borderWidth: 1.5,
    borderColor: CALM.accent,
  },
  splitFilterText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  splitFilterTextActive: {
    color: CALM.accent,
  },

  // Payment modal redesign
  payContextCard: {
    backgroundColor: CALM.background,
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
    color: CALM.textPrimary,
  },
  payContextDesc: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
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
    color: CALM.textSecondary,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  payContextAmountValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  payContextDivider: {
    width: 1,
    height: 20,
    backgroundColor: CALM.border,
  },
  payAmountRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  payQuickFill: {
    backgroundColor: withAlpha(CALM.accent, 0.1),
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: withAlpha(CALM.accent, 0.2),
  },
  payQuickFillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  payHistorySection: {
    marginTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    paddingTop: SPACING.md,
  },
  payHistoryTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
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
    color: CALM.textPrimary,
  },
  payHistoryDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },
  payHistoryTip: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 2,
  },
  payHistoryNote: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
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
    color: CALM.bronze,
    flex: 1,
    lineHeight: 16,
  },
  settledNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: withAlpha(CALM.positive, 0.08),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  settledNoticeText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.positive,
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
    color: CALM.textSecondary,
  },
  payDetailMetaHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  payDetailDivider: {
    height: 1,
    backgroundColor: withAlpha(CALM.accent, 0.08),
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
    color: CALM.bronze,
  },
  // Edit history section in payment detail
  editHistorySection: {
    marginTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: withAlpha(CALM.accent, 0.08),
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
    color: CALM.bronze,
    flex: 1,
  },
  editHistoryCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
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
    backgroundColor: withAlpha(CALM.bronze, 0.5),
    marginTop: 5,
  },
  editHistoryMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginBottom: 1,
  },
  editHistoryDetail: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
});

export default DebtTracking;
