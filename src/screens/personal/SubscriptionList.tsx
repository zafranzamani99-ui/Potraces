import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  TouchableOpacity,
  Pressable,
  Switch,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, differenceInDays, addWeeks, addMonths, addQuarters, addYears, isValid } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, BILLING_CYCLES, withAlpha } from '../../constants';
import { useCategories } from '../../hooks/useCategories';
import CategoryPicker from '../../components/common/CategoryPicker';
import CalendarPicker from '../../components/common/CalendarPicker';
import { useToast } from '../../context/ToastContext';
import { lightTap, mediumTap } from '../../services/haptics';

type FilterStatus = 'all' | 'active' | 'paused' | 'installments';

const SubscriptionList: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const {
    subscriptions,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    incrementInstallment,
    toggleSubscriptionPause,
  } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const expenseCategories = useCategories('expense');

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [cyclePickerVisible, setCyclePickerVisible] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(expenseCategories[0]?.id || 'food');
  const [billingCycle, setBillingCycle] = useState<'weekly' | 'monthly' | 'yearly' | 'quarterly'>('monthly');
  const [reminderDays, setReminderDays] = useState('3');
  const [startDate, setStartDate] = useState(new Date());
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState('');
  const [isPaused, setIsPaused] = useState(false);

  // List state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showAnnual, setShowAnnual] = useState(false);

  // FAB animation
  const fabScale = useRef(new Animated.Value(1)).current;

  // ─── Computed ──────────────────────────────────────────────
  const totalMonthly = useMemo(() =>
    subscriptions
      .filter(sub => sub.isActive && !sub.isPaused)
      .reduce((sum, sub) => {
        switch (sub.billingCycle) {
          case 'weekly': return sum + sub.amount * 4;
          case 'quarterly': return sum + sub.amount / 3;
          case 'yearly': return sum + sub.amount / 12;
          default: return sum + sub.amount;
        }
      }, 0),
    [subscriptions],
  );

  const totalAnnual = totalMonthly * 12;

  const activeSubs = useMemo(
    () => subscriptions.filter(s => s.isActive && !s.isPaused),
    [subscriptions],
  );

  const dueSoonSubs = useMemo(() =>
    activeSubs.filter(s => {
      const days = differenceInDays(s.nextBillingDate, new Date());
      return days >= 0 && days <= 7;
    }).sort((a, b) =>
      differenceInDays(a.nextBillingDate, new Date()) - differenceInDays(b.nextBillingDate, new Date()),
    ),
    [activeSubs],
  );

  const filteredSubs = useMemo(() => {
    let result = [...subscriptions];

    // Filter
    switch (filterStatus) {
      case 'active':
        result = result.filter(s => s.isActive && !s.isPaused);
        break;
      case 'paused':
        result = result.filter(s => s.isPaused);
        break;
      case 'installments':
        result = result.filter(s => s.isInstallment);
        break;
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
      );
    }

    // Sort by next billing date
    result.sort((a, b) => a.nextBillingDate.getTime() - b.nextBillingDate.getTime());

    return result;
  }, [subscriptions, filterStatus, searchQuery]);

  // ─── Helpers ───────────────────────────────────────────────
  const getDaysUntil = useCallback((date: Date) => {
    return differenceInDays(date, new Date());
  }, []);

  const getNextBillingDate = useCallback((start: Date, cycle: string): Date => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (start >= today) return start;

    let next = start;
    while (next < now) {
      switch (cycle) {
        case 'weekly': next = addWeeks(next, 1); break;
        case 'quarterly': next = addQuarters(next, 1); break;
        case 'yearly': next = addYears(next, 1); break;
        default: next = addMonths(next, 1); break;
      }
    }
    return next;
  }, []);

  // ─── Form Actions ─────────────────────────────────────────
  const resetForm = useCallback(() => {
    setEditingId(null);
    setName('');
    setAmount('');
    setCategory(expenseCategories[0]?.id || 'food');
    setBillingCycle('monthly');
    setReminderDays('3');
    setStartDate(new Date());
    setIsInstallment(false);
    setTotalInstallments('');
    setIsPaused(false);
  }, [expenseCategories]);

  const handleEdit = useCallback((id: string) => {
    const sub = subscriptions.find(s => s.id === id);
    if (!sub) return;
    lightTap();
    setEditingId(id);
    setName(sub.name);
    setAmount(sub.amount.toString());
    setCategory(sub.category);
    setBillingCycle(sub.billingCycle);
    setReminderDays(sub.reminderDays.toString());
    setStartDate(isValid(sub.startDate) ? sub.startDate : new Date());
    setIsInstallment(sub.isInstallment || false);
    setTotalInstallments(sub.totalInstallments?.toString() || '');
    setIsPaused(sub.isPaused || false);
    setModalVisible(true);
  }, [subscriptions]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      showToast('please enter a name', 'error');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      showToast('please enter a valid amount', 'error');
      return;
    }

    const validStartDate = isValid(startDate) ? startDate : new Date();
    const nextBilling = getNextBillingDate(validStartDate, billingCycle);

    if (editingId) {
      const existing = subscriptions.find(s => s.id === editingId);
      const startChanged = existing && validStartDate.getTime() !== existing.startDate.getTime();
      const cycleChanged = existing && billingCycle !== existing.billingCycle;
      const nextBillingDate = (startChanged || cycleChanged) ? nextBilling : (existing?.nextBillingDate || nextBilling);

      updateSubscription(editingId, {
        name: name.trim(),
        amount: parseFloat(amount),
        category,
        billingCycle,
        reminderDays: parseInt(reminderDays) || 3,
        startDate: validStartDate,
        isInstallment,
        isPaused,
        ...(isInstallment && {
          totalInstallments: parseInt(totalInstallments) || 1,
        }),
        nextBillingDate,
      });
      showToast('commitment updated.', 'success');
    } else {
      addSubscription({
        name: name.trim(),
        amount: parseFloat(amount),
        category,
        billingCycle,
        startDate: validStartDate,
        nextBillingDate: nextBilling,
        isActive: true,
        isPaused: false,
        reminderDays: parseInt(reminderDays) || 3,
        isInstallment,
        ...(isInstallment && {
          totalInstallments: parseInt(totalInstallments) || 1,
          completedInstallments: 0,
        }),
      });
      showToast('commitment added.', 'success');
    }

    mediumTap();
    setModalVisible(false);
    resetForm();
  }, [name, amount, category, billingCycle, reminderDays, startDate, isInstallment, totalInstallments, isPaused, editingId, subscriptions, addSubscription, updateSubscription, showToast, resetForm, getNextBillingDate]);

  const handleDelete = useCallback((id: string, subName: string) => {
    Alert.alert(
      'delete commitment',
      `remove "${subName}"?`,
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'delete',
          style: 'destructive',
          onPress: () => {
            deleteSubscription(id);
            showToast('commitment removed.', 'success');
          },
        },
      ],
    );
  }, [deleteSubscription, showToast]);

  const handleMarkPayment = useCallback((id: string) => {
    lightTap();
    incrementInstallment(id);
    showToast('payment marked.', 'success');
  }, [incrementInstallment, showToast]);

  const getCycleLabel = (cycle: string) => {
    const found = BILLING_CYCLES.find(c => c.value === cycle);
    return found ? found.label.toLowerCase() : cycle;
  };

  // ─── Render Helpers ────────────────────────────────────────
  const renderSummaryHero = () => {
    if (subscriptions.length === 0) return null;

    const displayAmount = showAnnual ? totalAnnual : totalMonthly;
    const periodLabel = showAnnual ? 'year' : 'month';

    return (
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>commitments</Text>
        <View style={styles.heroRow}>
          <Text style={styles.heroAmount}>
            {currency} {displayAmount.toFixed(2)}
            <Text style={styles.heroPeriod}> / {periodLabel}</Text>
          </Text>
          <TouchableOpacity
            style={styles.periodToggle}
            onPress={() => { lightTap(); setShowAnnual(!showAnnual); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodToggleText, !showAnnual && styles.periodToggleActive]}>mo</Text>
            <Text style={styles.periodToggleDivider}>/</Text>
            <Text style={[styles.periodToggleText, showAnnual && styles.periodToggleActive]}>yr</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.heroSubtext}>
          {activeSubs.length} active{dueSoonSubs.length > 0 ? ` \u00B7 ${dueSoonSubs.length} due soon` : ''}
        </Text>
      </View>
    );
  };

  const renderDueSoon = () => {
    if (dueSoonSubs.length === 0) return null;

    return (
      <View style={styles.dueSoonSection}>
        <Text style={styles.sectionLabel}>due soon</Text>
        <View style={styles.dueSoonCard}>
          {dueSoonSubs.map((sub, index) => {
            const cat = expenseCategories.find(c => c.id === sub.category);
            const days = getDaysUntil(sub.nextBillingDate);
            return (
              <Pressable
                key={sub.id}
                style={({ pressed }) => [
                  styles.dueSoonRow,
                  index < dueSoonSubs.length - 1 && styles.dueSoonRowBorder,
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => handleEdit(sub.id)}
              >
                <View style={[styles.dueSoonIcon, { backgroundColor: withAlpha(cat?.color || CALM.accent, 0.08) }]}>
                  <Feather
                    name={(cat?.icon as keyof typeof Feather.glyphMap) || 'repeat'}
                    size={16}
                    color={cat?.color || CALM.accent}
                  />
                </View>
                <Text style={styles.dueSoonName} numberOfLines={1}>{sub.name}</Text>
                <Text style={styles.dueSoonAmount}>{currency} {sub.amount.toFixed(2)}</Text>
                <Text style={styles.dueSoonDays}>{days}d</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  const renderSearchBar = () => {
    if (subscriptions.length === 0) return null;

    return (
      <View style={styles.searchContainer}>
        <Feather name="search" size={16} color={CALM.textMuted} style={{ marginRight: SPACING.sm }} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="search commitments..."
          placeholderTextColor={CALM.textMuted}
          returnKeyType="search"
          onSubmitEditing={Keyboard.dismiss}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={16} color={CALM.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderFilterChips = () => {
    if (subscriptions.length === 0) return null;

    const filters: { key: FilterStatus; label: string }[] = [
      { key: 'all', label: 'all' },
      { key: 'active', label: 'active' },
      { key: 'paused', label: 'paused' },
      { key: 'installments', label: 'installments' },
    ];

    return (
      <View style={styles.filterRow}>
        {filters.map(f => {
          const isActive = filterStatus === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => { lightTap(); setFilterStatus(f.key); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderSubscriptionCard = (sub: typeof subscriptions[0]) => {
    const cat = expenseCategories.find(c => c.id === sub.category);
    const days = getDaysUntil(sub.nextBillingDate);
    const isPausedSub = sub.isPaused;
    const isInstallmentSub = sub.isInstallment && sub.totalInstallments;
    const completed = sub.completedInstallments || 0;
    const total = sub.totalInstallments || 1;
    const progress = isInstallmentSub && total > 0 ? completed / total : 0;
    const renewText = days < 0 ? 'pending renewal' : `renews ${days}d`;
    const renewColor = days >= 0 && days <= 7 ? CALM.bronze : CALM.textMuted;

    return (
      <Pressable
        key={sub.id}
        style={({ pressed }) => [styles.subCard, isPausedSub && { opacity: 0.5 }, pressed && { opacity: isPausedSub ? 0.3 : 0.6 }]}
        onPress={() => handleEdit(sub.id)}
      >
        <View style={styles.subCardRow}>
          {/* Icon */}
          <View style={[styles.subIconWrap, { backgroundColor: withAlpha(cat?.color || CALM.accent, 0.08) }]}>
            <Feather
              name={(cat?.icon as keyof typeof Feather.glyphMap) || 'repeat'}
              size={18}
              color={cat?.color || CALM.accent}
            />
          </View>

          {/* Center content */}
          <View style={styles.subInfo}>
            <View style={styles.subNameRow}>
              <Text style={styles.subName} numberOfLines={1}>{sub.name}</Text>
              {isPausedSub && (
                <View style={styles.pausedBadge}>
                  <Text style={styles.pausedBadgeText}>paused</Text>
                </View>
              )}
            </View>
            <View style={styles.subMeta}>
              <Text style={styles.subCategory} numberOfLines={1}>
                {cat?.name?.toLowerCase() || sub.category}
              </Text>
              {!isPausedSub && (
                <>
                  <Text style={styles.subMetaDot}> {'\u00B7'} </Text>
                  <Text style={[styles.subRenew, { color: renewColor }]}>{renewText}</Text>
                </>
              )}
            </View>
            {isInstallmentSub && (
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
              </View>
            )}
          </View>

          {/* Right side - amount */}
          <View style={styles.subAmountWrap}>
            {isInstallmentSub && (
              <Text style={styles.installmentCount}>{completed}/{total}</Text>
            )}
            <Text style={styles.subAmount}>{currency} {sub.amount.toFixed(2)}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Feather name="calendar" size={48} color={CALM.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>no commitments yet</Text>
      <Text style={styles.emptyText}>
        track recurring expenses like subscriptions, bills, and installments
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => { lightTap(); setModalVisible(true); }}
        activeOpacity={0.7}
      >
        <Text style={styles.emptyButtonText}>add commitment</Text>
      </TouchableOpacity>
    </View>
  );

  const renderNoResults = () => (
    <View style={styles.noResults}>
      <Feather name="search" size={36} color={CALM.textMuted} />
      <Text style={styles.noResultsTitle}>no results found</Text>
      <Text style={styles.noResultsText}>try a different search or filter</Text>
    </View>
  );

  // ─── Cycle Picker Modal ───────────────────────────────────
  const renderCyclePickerModal = () => (
    <Modal
      visible={cyclePickerVisible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => setCyclePickerVisible(false)}
    >
      <TouchableOpacity style={styles.overlayCenter} activeOpacity={1} onPress={() => setCyclePickerVisible(false)}>
        <TouchableOpacity activeOpacity={1} style={styles.pickerCard}>
          <Text style={styles.pickerTitle}>billing cycle</Text>
          {BILLING_CYCLES.map(cycle => {
            const isSelected = billingCycle === cycle.value;
            return (
              <TouchableOpacity
                key={cycle.value}
                style={[styles.pickerOption, isSelected && styles.pickerOptionActive]}
                onPress={() => {
                  lightTap();
                  setBillingCycle(cycle.value as typeof billingCycle);
                  setCyclePickerVisible(false);
                }}
                activeOpacity={0.6}
              >
                <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextActive]}>
                  {cycle.label.toLowerCase()}
                </Text>
                {isSelected && <Feather name="check" size={18} color={CALM.accent} />}
              </TouchableOpacity>
            );
          })}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  // ─── Calendar Modal ────────────────────────────────────────
  const renderCalendarModal = () => (
    <Modal
      visible={calendarVisible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => setCalendarVisible(false)}
    >
      <TouchableOpacity style={styles.overlayCenter} activeOpacity={1} onPress={() => setCalendarVisible(false)}>
        <TouchableOpacity activeOpacity={1} style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <Text style={styles.pickerTitle}>start date</Text>
            <TouchableOpacity onPress={() => setCalendarVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Feather name="x" size={20} color={CALM.textPrimary} />
            </TouchableOpacity>
          </View>
          <CalendarPicker
            value={startDate}
            onChange={(date) => {
              setStartDate(date);
              setCalendarVisible(false);
            }}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  // ─── Add/Edit Modal ────────────────────────────────────────
  const renderModal = () => {
    const editingSub = editingId ? subscriptions.find(s => s.id === editingId) : null;
    const showMarkPayment = editingSub?.isInstallment && editingSub?.totalInstallments;

    return (
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <TouchableOpacity style={styles.overlayCenter} activeOpacity={1} onPress={() => { setModalVisible(false); resetForm(); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.kavWrapper}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingId ? 'edit commitment' : 'add commitment'}</Text>
                <TouchableOpacity
                  onPress={() => { setModalVisible(false); resetForm(); }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={22} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: SPACING.lg }}
              >
                {/* Name */}
                <Text style={styles.fieldLabel}>name</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Netflix, Spotify, etc."
                  placeholderTextColor={CALM.textMuted}
                  returnKeyType="next"
                />

                {/* Amount */}
                <Text style={styles.fieldLabel}>amount</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.amountPrefix}>{currency}</Text>
                  <TextInput
                    style={[styles.fieldInput, { flex: 1 }]}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={CALM.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>

                {/* Category */}
                <CategoryPicker
                  categories={expenseCategories}
                  selectedId={category}
                  onSelect={setCategory}
                  label="category"
                  layout="dropdown"
                />

                {/* Billing Cycle */}
                <Text style={styles.fieldLabel}>billing cycle</Text>
                <TouchableOpacity
                  style={styles.fieldTouchable}
                  onPress={() => setCyclePickerVisible(true)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.fieldTouchableText}>{getCycleLabel(billingCycle)}</Text>
                  <Feather name="chevron-down" size={16} color={CALM.textMuted} />
                </TouchableOpacity>

                {/* Start Date */}
                <Text style={styles.fieldLabel}>start date</Text>
                <TouchableOpacity
                  style={styles.fieldTouchable}
                  onPress={() => setCalendarVisible(true)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.fieldTouchableText}>
                    {isValid(startDate) ? format(startDate, 'MMM dd, yyyy') : 'select date'}
                  </Text>
                  <Feather name="calendar" size={16} color={CALM.textMuted} />
                </TouchableOpacity>

                {/* Reminder */}
                <Text style={styles.fieldLabel}>reminder</Text>
                <View style={styles.reminderRow}>
                  <TextInput
                    style={[styles.fieldInput, { width: 60, textAlign: 'center' }]}
                    value={reminderDays}
                    onChangeText={setReminderDays}
                    placeholder="3"
                    keyboardType="number-pad"
                    placeholderTextColor={CALM.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={styles.reminderSuffix}>days before</Text>
                </View>

                {/* Installment toggle */}
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>installment</Text>
                    <Text style={styles.toggleHint}>for fixed-payment plans</Text>
                  </View>
                  <Switch
                    value={isInstallment}
                    onValueChange={val => { lightTap(); setIsInstallment(val); }}
                    trackColor={{ false: CALM.border, true: withAlpha(CALM.accent, 0.4) }}
                    thumbColor={isInstallment ? CALM.accent : '#FFFFFF'}
                  />
                </View>

                {isInstallment && (
                  <>
                    <Text style={styles.fieldLabel}>total installments</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={totalInstallments}
                      onChangeText={setTotalInstallments}
                      placeholder="e.g. 24"
                      keyboardType="number-pad"
                      placeholderTextColor={CALM.textMuted}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </>
                )}

                {/* Paused toggle */}
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>pause this commitment</Text>
                    <Text style={styles.toggleHint}>temporarily stop tracking</Text>
                  </View>
                  <Switch
                    value={isPaused}
                    onValueChange={val => { lightTap(); setIsPaused(val); }}
                    trackColor={{ false: CALM.border, true: withAlpha(CALM.bronze, 0.4) }}
                    thumbColor={isPaused ? CALM.bronze : '#FFFFFF'}
                  />
                </View>

                {/* Mark Payment (editing installment only) */}
                {showMarkPayment && (
                  <TouchableOpacity
                    style={styles.markPaymentBtn}
                    onPress={() => {
                      handleMarkPayment(editingId!);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="check-circle" size={18} color={CALM.accent} />
                    <Text style={styles.markPaymentText}>
                      mark payment ({editingSub!.completedInstallments || 0}/{editingSub!.totalInstallments})
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Delete (editing only) */}
                {editingId && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => {
                      setModalVisible(false);
                      resetForm();
                      handleDelete(editingId, name);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="trash-2" size={16} color={CALM.neutral} />
                    <Text style={styles.deleteBtnText}>delete commitment</Text>
                  </TouchableOpacity>
                )}

                {/* Confirm */}
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={handleSave}
                  activeOpacity={0.7}
                >
                  <Text style={styles.confirmBtnText}>{editingId ? 'save changes' : 'add commitment'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    );
  };

  // ─── Main Render ───────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {subscriptions.length > 0 ? (
          <>
            {renderSummaryHero()}
            {renderDueSoon()}
            {renderSearchBar()}
            {renderFilterChips()}

            {filteredSubs.length > 0 ? (
              <View style={styles.groupCard}>
                {filteredSubs.map((sub, index) => (
                  <React.Fragment key={sub.id}>
                    {renderSubscriptionCard(sub)}
                    {index < filteredSubs.length - 1 && <View style={styles.cardDivider} />}
                  </React.Fragment>
                ))}
              </View>
            ) : (
              renderNoResults()
            )}
          </>
        ) : (
          renderEmptyState()
        )}
      </ScrollView>

      {/* FAB */}
      {subscriptions.length > 0 && (
        <Animated.View style={[styles.fab, { bottom: Math.max(SPACING.xl, insets.bottom + SPACING.md), transform: [{ scale: fabScale }] }]}>
          <TouchableOpacity
            style={styles.fabInner}
            onPress={() => {
              mediumTap();
              resetForm();
              setModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {renderModal()}
      {renderCyclePickerModal()}
      {renderCalendarModal()}
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.xl,
  },

  // ── Hero ─────────────────────────────────────────────
  heroCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  heroAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  heroPeriod: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: CALM.textMuted,
  },
  periodToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  periodToggleText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
  },
  periodToggleDivider: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    marginHorizontal: 4,
  },
  periodToggleActive: {
    color: CALM.deepOlive,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  heroSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },

  // ── Due Soon ─────────────────────────────────────────
  dueSoonSection: {
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  dueSoonCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  dueSoonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  dueSoonRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CALM.border,
  },
  dueSoonIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  dueSoonName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  dueSoonAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginRight: SPACING.sm,
    fontVariant: ['tabular-nums'],
  },
  dueSoonDays: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
    minWidth: 24,
    textAlign: 'right',
  },

  // ── Search ───────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },

  // ── Filter Chips ─────────────────────────────────────
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
  },
  filterChipActive: {
    backgroundColor: CALM.deepOlive,
  },
  filterChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // ── Subscription Cards ───────────────────────────────
  groupCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.xs,
  },
  subCard: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CALM.border,
    marginLeft: 36 + SPACING.md + SPACING.md,
  },
  subCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  subInfo: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  subNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  subName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    flexShrink: 1,
  },
  pausedBadge: {
    backgroundColor: withAlpha(CALM.bronze, 0.12),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 1,
  },
  pausedBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
  subMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  subCategory: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    flexShrink: 1,
  },
  subMetaDot: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },
  subRenew: {
    fontSize: TYPOGRAPHY.size.sm,
  },
  subAmountWrap: {
    alignItems: 'flex-end',
  },
  installmentCount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
    marginBottom: 2,
  },
  subAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: withAlpha(CALM.textMuted, 0.1),
    borderRadius: RADIUS.full,
    marginTop: SPACING.xs,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.full,
  },

  // ── Empty State ──────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['5xl'],
    paddingHorizontal: SPACING.xl,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    textAlign: 'center',
    lineHeight: TYPOGRAPHY.size.sm * 1.6,
    marginBottom: SPACING.xl,
  },
  emptyButton: {
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  emptyButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },

  // ── No Results ───────────────────────────────────────
  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['5xl'],
    gap: SPACING.sm,
  },
  noResultsTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginTop: SPACING.sm,
  },
  noResultsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },

  // ── FAB ──────────────────────────────────────────────
  fab: {
    position: 'absolute',
    right: SPACING.xl,
  },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CALM.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },

  // ── Modal Overlay (centered) ─────────────────────────
  overlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kavWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '90%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    ...SHADOWS.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },

  // ── Modal Fields ─────────────────────────────────────
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.lg,
  },
  fieldInput: {
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  amountPrefix: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  fieldTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    paddingVertical: SPACING.sm + 2,
  },
  fieldTouchableText: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  reminderSuffix: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },

  // ── Toggles ──────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xl,
    paddingVertical: SPACING.xs,
  },
  toggleLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  toggleHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 2,
  },

  // ── Mark Payment ─────────────────────────────────────
  markPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(CALM.accent, 0.08),
    borderRadius: RADIUS.md,
  },
  markPaymentText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.accent,
  },

  // ── Delete Button ────────────────────────────────────
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  deleteBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.neutral,
  },

  // ── Confirm Button ───────────────────────────────────
  confirmBtn: {
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  confirmBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },

  // ── Cycle Picker ─────────────────────────────────────
  pickerCard: {
    width: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    ...SHADOWS.lg,
  },
  pickerTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    marginBottom: SPACING.md,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },
  pickerOptionActive: {
    backgroundColor: withAlpha(CALM.accent, 0.08),
  },
  pickerOptionText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  pickerOptionTextActive: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },

  // ── Calendar Modal ───────────────────────────────────
  calendarCard: {
    width: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    ...SHADOWS.lg,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
});

export default SubscriptionList;
