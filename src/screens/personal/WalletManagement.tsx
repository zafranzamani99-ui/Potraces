import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Pressable,
  FlatList,
  Animated,
  Easing,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { WALLET_ICONS_BY_TYPE, WALLET_COLORS, WALLET_PRESETS, WALLET_TYPE_CONFIG, FREE_TIER } from '../../constants/premium';
import { useWalletStore } from '../../store/walletStore';
import { usePremiumStore } from '../../store/premiumStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Wallet, WalletType } from '../../types';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PaywallModal from '../../components/common/PaywallModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightTap } from '../../services/haptics';

const WalletManagement: React.FC = () => {
  const insets = useSafeAreaInsets();
  const currency = useSettingsStore((s) => s.currency);
  const wallets = useWalletStore((s) => s.wallets);
  const transfers = useWalletStore((s) => s.transfers);
  const addWallet = useWalletStore((s) => s.addWallet);
  const updateWallet = useWalletStore((s) => s.updateWallet);
  const deleteWallet = useWalletStore((s) => s.deleteWallet);
  const setDefaultWallet = useWalletStore((s) => s.setDefaultWallet);
  const transferBetweenWallets = useWalletStore((s) => s.transferBetweenWallets);
  const repayCredit = useWalletStore((s) => s.repayCredit);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const canCreateWallet = usePremiumStore((s) => s.canCreateWallet);
  const tier = usePremiumStore((s) => s.tier);

  // Add/Edit modal
  const [modalVisible, setModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [editingWallet, setEditingWallet] = useState<string | null>(null);
  const [addStep, setAddStep] = useState<'type' | 'preset' | 'details'>('type');

  // Transfer modal
  const [transferVisible, setTransferVisible] = useState(false);
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState<string | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');

  // Repay modal
  const [repayVisible, setRepayVisible] = useState(false);
  const [repayWalletId, setRepayWalletId] = useState<string | null>(null);
  const [repaySourceId, setRepaySourceId] = useState<string | null>(null);
  const [repayAmount, setRepayAmount] = useState('');

  // Selection mode (long press)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Star animation
  const starAnims = useRef<Record<string, Animated.Value>>({}).current;
  const getStarAnim = useCallback((id: string) => {
    if (!starAnims[id]) starAnims[id] = new Animated.Value(0);
    return starAnims[id];
  }, [starAnims]);

  // Form state
  const [selectedType, setSelectedType] = useState<WalletType>('bank');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<string>(WALLET_ICONS_BY_TYPE.bank[0]);
  const [selectedColor, setSelectedColor] = useState<string>(WALLET_COLORS[0]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Grouped wallets
  const bankWallets = useMemo(() => wallets.filter((w) => w.type === 'bank'), [wallets]);
  const ewalletWallets = useMemo(() => wallets.filter((w) => w.type === 'ewallet'), [wallets]);
  const creditWallets = useMemo(() => wallets.filter((w) => w.type === 'credit'), [wallets]);

  const totalBalance = useMemo(() => {
    const bankTotal = bankWallets.reduce((sum, w) => sum + w.balance, 0);
    const ewalletTotal = ewalletWallets.reduce((sum, w) => sum + w.balance, 0);
    return bankTotal + ewalletTotal;
  }, [bankWallets, ewalletWallets]);

  const totalCreditAvailable = useMemo(
    () => creditWallets.reduce((sum, w) => sum + w.balance, 0),
    [creditWallets]
  );

  const recentTransfers = useMemo(
    () => transfers.slice(0, 5),
    [transfers]
  );

  const resetForm = useCallback(() => {
    setName('');
    setBalance('');
    setCreditLimit('');
    setSelectedIcon(WALLET_ICONS_BY_TYPE.bank[0]);
    setSelectedColor(WALLET_COLORS[0]);
    setEditingWallet(null);
    setSelectedPresetId(null);
    setAddStep('type');
    setSelectedType('bank');
  }, []);

  const canAddType = useCallback((type: WalletType): boolean => {
    if (tier === 'premium') return true;
    const count = wallets.filter((w) => w.type === type).length;
    return count < FREE_TIER.maxWalletsPerType;
  }, [tier, wallets]);

  const handleAdd = useCallback(() => {
    if (!canCreateWallet(wallets.length)) {
      setPaywallVisible(true);
      return;
    }
    resetForm();
    setAddStep('type');
    setModalVisible(true);
  }, [canCreateWallet, wallets.length, resetForm]);

  const handleSelectType = useCallback((type: WalletType) => {
    if (!canAddType(type)) {
      if (tier === 'free') {
        setPaywallVisible(true);
        setModalVisible(false);
        return;
      }
    }
    lightTap();
    setSelectedType(type);
    const config = WALLET_TYPE_CONFIG[type];
    setSelectedIcon(config.icon);
    setAddStep('preset');
  }, [canAddType, tier]);

  const handleSelectPreset = useCallback((presetId: string | null) => {
    lightTap();
    if (presetId) {
      const preset = WALLET_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        setSelectedPresetId(presetId);
        setName(preset.name);
        setSelectedIcon(preset.icon);
        setSelectedColor(preset.color);
      }
    } else {
      setSelectedPresetId(null);
      setName('');
    }
    setAddStep('details');
  }, []);

  const handleEdit = useCallback((walletId: string) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    setEditingWallet(walletId);
    setSelectedType(wallet.type);
    setName(wallet.name);
    setBalance(wallet.balance.toString());
    setCreditLimit(wallet.creditLimit?.toString() || '');
    setSelectedIcon(wallet.icon);
    setSelectedColor(wallet.color);
    setSelectedPresetId(wallet.presetId || null);
    setAddStep('details');
    setModalVisible(true);
  }, [wallets]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a wallet name');
      return;
    }

    if (editingWallet) {
      const updates: Partial<Wallet> = {
        name: name.trim(),
        icon: selectedIcon,
        color: selectedColor,
      };
      if (selectedType === 'credit') {
        const limitNum = parseFloat(creditLimit) || 0;
        const wallet = wallets.find((w) => w.id === editingWallet);
        const used = wallet?.usedCredit || 0;
        updates.creditLimit = limitNum;
        updates.balance = limitNum - used;
      } else {
        updates.balance = parseFloat(balance) || 0;
      }
      updateWallet(editingWallet, updates);
    } else {
      const isCredit = selectedType === 'credit';
      const limitNum = parseFloat(creditLimit) || 0;
      const balanceNum = isCredit ? limitNum : (parseFloat(balance) || 0);

      addWallet({
        name: name.trim(),
        type: selectedType,
        balance: balanceNum,
        icon: selectedIcon,
        color: selectedColor,
        isDefault: wallets.length === 0,
        presetId: selectedPresetId || undefined,
        creditLimit: isCredit ? limitNum : undefined,
        usedCredit: isCredit ? 0 : undefined,
      });
    }
    setModalVisible(false);
    resetForm();
  }, [name, editingWallet, selectedIcon, selectedColor, selectedType, creditLimit, balance, wallets, selectedPresetId, updateWallet, addWallet, resetForm]);

  const handleDelete = useCallback((walletId: string) => {
    const wallet = wallets.find((w) => w.id === walletId);
    Alert.alert(
      'Delete Wallet',
      `Are you sure you want to delete "${wallet?.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteWallet(walletId),
        },
      ]
    );
  }, [wallets, deleteWallet]);

  const handleSetDefault = useCallback((walletId: string) => {
    lightTap();
    const anim = getStarAnim(walletId);
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
    setDefaultWallet(walletId);
  }, [getStarAnim, setDefaultWallet]);

  // Transfer
  const handleTransfer = useCallback(() => {
    const amount = parseFloat(transferAmount);
    if (!transferFrom || !transferTo || !amount || amount <= 0) {
      Alert.alert('Error', 'Please fill in all transfer details');
      return;
    }
    if (transferFrom === transferTo) {
      Alert.alert('Error', 'Cannot transfer to the same wallet');
      return;
    }
    const sourceWallet = wallets.find((w) => w.id === transferFrom);
    if (sourceWallet && amount > sourceWallet.balance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }
    transferBetweenWallets(transferFrom, transferTo, amount, transferNote || undefined);
    setTransferVisible(false);
    setTransferFrom(null);
    setTransferTo(null);
    setTransferAmount('');
    setTransferNote('');
  }, [transferAmount, transferFrom, transferTo, transferNote, wallets, transferBetweenWallets]);

  // Repay credit
  const handleRepay = useCallback(() => {
    const amount = parseFloat(repayAmount);
    if (!repayWalletId || !repaySourceId || !amount || amount <= 0) {
      Alert.alert('Error', 'Please fill in all repayment details');
      return;
    }
    const sourceWallet = wallets.find((w) => w.id === repaySourceId);
    if (sourceWallet && amount > sourceWallet.balance) {
      Alert.alert('Error', 'Insufficient balance in source wallet');
      return;
    }
    const creditWallet = wallets.find((w) => w.id === repayWalletId);
    if (creditWallet && amount > (creditWallet.usedCredit || 0)) {
      Alert.alert('Error', 'Repayment exceeds used credit');
      return;
    }
    repayCredit(repayWalletId, amount);
    deductFromWallet(repaySourceId, amount);
    setRepayVisible(false);
    setRepayWalletId(null);
    setRepaySourceId(null);
    setRepayAmount('');
  }, [repayAmount, repayWalletId, repaySourceId, wallets, repayCredit, deductFromWallet]);

  const openRepay = useCallback((walletId: string) => {
    setRepayWalletId(walletId);
    setRepaySourceId(null);
    setRepayAmount('');
    setRepayVisible(true);
  }, []);

  // Selection mode
  const handleLongPress = useCallback((walletId: string) => {
    lightTap();
    setSelectionMode(true);
    setSelectedIds(new Set([walletId]));
  }, []);

  const toggleSelect = useCallback((walletId: string) => {
    lightTap();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(walletId)) {
        next.delete(walletId);
        if (next.size === 0) setSelectionMode(false);
      } else {
        next.add(walletId);
      }
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    Alert.alert(
      'Delete Wallets',
      `Are you sure you want to delete ${count} wallet${count > 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            selectedIds.forEach((id) => deleteWallet(id));
            exitSelectionMode();
          },
        },
      ]
    );
  }, [selectedIds, deleteWallet, exitSelectionMode]);

  const handleBulkEdit = useCallback(() => {
    // Single selection -> open edit modal
    if (selectedIds.size === 1) {
      const id = Array.from(selectedIds)[0];
      exitSelectionMode();
      handleEdit(id);
    }
  }, [selectedIds, exitSelectionMode, handleEdit]);

  const getWalletName = useCallback((id: string) => wallets.find((w) => w.id === id)?.name || 'Unknown', [wallets]);

  const typePresets = useMemo(
    () => WALLET_PRESETS.filter((p) => p.type === selectedType),
    [selectedType]
  );

  const nonCreditWallets = useMemo(
    () => wallets.filter((w) => w.type !== 'credit'),
    [wallets]
  );

  const transferToWallets = useMemo(
    () => wallets.filter((w) => w.id !== transferFrom),
    [wallets, transferFrom]
  );

  const walletCountsByType = useMemo(
    () => ({
      bank: bankWallets.length,
      ewallet: ewalletWallets.length,
      credit: creditWallets.length,
    }),
    [bankWallets.length, ewalletWallets.length, creditWallets.length]
  );

  // ─── Render Helpers ────────────────────────────────────────

  const renderWalletCard = useCallback((wallet: Wallet) => {
    const isCredit = wallet.type === 'credit';
    const usedCredit = wallet.usedCredit || 0;
    const creditLimitVal = wallet.creditLimit || 0;
    const usedPercent = creditLimitVal > 0 ? (usedCredit / creditLimitVal) * 100 : 0;
    const isSelected = selectedIds.has(wallet.id);

    return (
      <Pressable
        key={wallet.id}
        onLongPress={() => handleLongPress(wallet.id)}
        onPress={selectionMode ? () => toggleSelect(wallet.id) : undefined}
        delayLongPress={400}
      >
        <Card style={isSelected ? { ...styles.walletCard, ...styles.walletCardSelected } : styles.walletCard}>
          <View style={styles.walletRow}>
            {selectionMode && (
              <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                {isSelected && <Feather name="check" size={14} color="#fff" />}
              </View>
            )}
            <View
              style={[
                styles.walletIcon,
                { backgroundColor: withAlpha(wallet.color, 0.15) },
              ]}
            >
              <Feather
                name={wallet.icon as keyof typeof Feather.glyphMap}
                size={22}
                color={wallet.color}
              />
            </View>
            <View style={styles.walletInfo}>
              <View style={styles.walletNameRow}>
                <Text style={styles.walletName}>{wallet.name}</Text>
                {wallet.isDefault && (
                  <View style={[styles.defaultBadge, { backgroundColor: withAlpha(wallet.color, 0.1) }]}>
                    <Text style={[styles.defaultBadgeText, { color: wallet.color }]}>Default</Text>
                  </View>
                )}
              </View>
              {isCredit ? (
                <View style={styles.creditInfo}>
                  <View style={styles.creditRow}>
                    <Text style={styles.creditLabel}>
                      Used {currency} {usedCredit.toFixed(2)}
                    </Text>
                    <Text style={styles.creditAvailable}>
                      Available {currency} {wallet.balance.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.creditBar}>
                    <View
                      style={[
                        styles.creditBarFill,
                        {
                          width: `${Math.min(usedPercent, 100)}%`,
                          backgroundColor: usedPercent > 80 ? CALM.bronze : wallet.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.creditLimit}>
                    Limit {currency} {creditLimitVal.toFixed(2)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.walletBalance}>
                  {currency} {wallet.balance.toFixed(2)}
                </Text>
              )}
            </View>
            {!selectionMode && (
              <View style={styles.walletActions}>
                {isCredit && usedCredit > 0 && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: withAlpha(wallet.color, 0.1) }]}
                    onPress={() => openRepay(wallet.id)}
                  >
                    <Feather name="corner-down-left" size={16} color={wallet.color} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.starBtn}
                  onPress={wallet.isDefault ? undefined : () => handleSetDefault(wallet.id)}
                  activeOpacity={wallet.isDefault ? 1 : 0.7}
                >
                  <Animated.View
                    style={{
                      transform: [
                        {
                          rotate: getStarAnim(wallet.id).interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          }),
                        },
                        {
                          scale: getStarAnim(wallet.id).interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [1, 1.3, 1],
                          }),
                        },
                      ],
                    }}
                  >
                    <Feather
                      name="star"
                      size={20}
                      color={wallet.isDefault ? wallet.color : CALM.border}
                    />
                  </Animated.View>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Card>
      </Pressable>
    );
  }, [selectionMode, selectedIds, currency, getStarAnim, handleLongPress, toggleSelect, openRepay, handleSetDefault]);

  const renderTypeSection = useCallback((type: WalletType, walletList: Wallet[]) => {
    if (walletList.length === 0) return null;
    const config = WALLET_TYPE_CONFIG[type];
    return (
      <View key={type} style={styles.typeSection}>
        <View style={styles.typeSectionHeader}>
          <Feather name={config.icon as keyof typeof Feather.glyphMap} size={16} color={CALM.textSecondary} />
          <Text style={styles.typeSectionTitle}>{config.label}</Text>
          <Text style={styles.typeSectionCount}>{walletList.length}</Text>
        </View>
        {walletList.map(renderWalletCard)}
      </View>
    );
  }, [renderWalletCard]);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Cash Balance</Text>
              <Text style={styles.summaryAmount}>
                {currency} {totalBalance.toFixed(2)}
              </Text>
            </View>
            {creditWallets.length > 0 && (
              <View style={[styles.summaryItem, styles.summaryDivider]}>
                <Text style={styles.summaryLabel}>Credit Available</Text>
                <Text style={[styles.summaryAmount, { color: CALM.bronze }]}>
                  {currency} {totalCreditAvailable.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.summaryFooter}>
            <Text style={styles.walletCountText}>
              {wallets.length}{tier === 'free' ? '/3' : ''} wallets
            </Text>
            {wallets.length >= 2 && (
              <TouchableOpacity
                style={styles.transferBtn}
                onPress={() => {
                  lightTap();
                  setTransferVisible(true);
                }}
              >
                <Feather name="repeat" size={14} color={CALM.accent} />
                <Text style={styles.transferBtnText}>Transfer</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Wallet List — Grouped by Type */}
        {wallets.length === 0 ? (
          <EmptyState
            icon="credit-card"
            title="No Wallets Yet"
            message="Create your first wallet to start tracking where your money goes"
            actionLabel="Create Wallet"
            onAction={handleAdd}
          />
        ) : (
          <View style={styles.walletList}>
            {renderTypeSection('bank', bankWallets)}
            {renderTypeSection('ewallet', ewalletWallets)}
            {renderTypeSection('credit', creditWallets)}
          </View>
        )}

        {/* Recent Transfers */}
        {recentTransfers.length > 0 && (
          <View style={styles.transfersSection}>
            <Text style={styles.transfersSectionTitle}>Recent Transfers</Text>
            {recentTransfers.map((t) => (
              <View key={t.id} style={styles.transferRow}>
                <Feather name="repeat" size={14} color={CALM.textMuted} />
                <View style={styles.transferInfo}>
                  <Text style={styles.transferDesc}>
                    {getWalletName(t.fromWalletId)} → {getWalletName(t.toWalletId)}
                  </Text>
                  {t.note && <Text style={styles.transferNote}>{t.note}</Text>}
                </View>
                <Text style={styles.transferAmt}>
                  {currency} {t.amount.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom Bar: Selection or Add */}
      {selectionMode ? (
        <View style={styles.selectionBar}>
          <TouchableOpacity onPress={exitSelectionMode} style={styles.selectionClose}>
            <Feather name="x" size={20} color={CALM.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
          <View style={styles.selectionActions}>
            {selectedIds.size === 1 && (
              <TouchableOpacity style={styles.selectionBtn} onPress={handleBulkEdit}>
                <Feather name="edit-2" size={16} color={CALM.accent} />
                <Text style={styles.selectionBtnText}>Edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.selectionBtnDanger} onPress={handleBulkDelete}>
              <Feather name="trash-2" size={16} color={CALM.neutral} />
              <Text style={styles.selectionBtnDangerText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : wallets.length > 0 ? (
        <View style={styles.addBtnContainer}>
          <Button
            title="Add Wallet"
            onPress={handleAdd}
            icon="plus"
            size="large"
          />
        </View>
      ) : null}

      {/* ─── Add/Edit Modal ─────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <Pressable
          style={addStep === 'details' || editingWallet ? styles.modalOverlay : styles.floatingOverlay}
          onPress={() => { setModalVisible(false); resetForm(); }}
        >
          <View
            style={addStep === 'details' || editingWallet ? styles.modalContent : styles.floatingContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingWallet ? 'Edit Wallet' : addStep === 'type' ? 'Choose Type' : addStep === 'preset' ? 'Choose Provider' : 'Wallet Details'}
              </Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Feather name="x" size={22} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}>
              {/* Step 1: Choose Type */}
              {addStep === 'type' && !editingWallet && (
                <View style={styles.typeGrid}>
                  {(['bank', 'ewallet', 'credit'] as WalletType[]).map((type) => {
                    const config = WALLET_TYPE_CONFIG[type];
                    const canAdd = canAddType(type);
                    const typeCount = walletCountsByType[type];
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[styles.typeCard, !canAdd && styles.typeCardDisabled]}
                        onPress={() => handleSelectType(type)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.typeIconBg, { backgroundColor: withAlpha(CALM.accent, 0.1) }]}>
                          <Feather name={config.icon as keyof typeof Feather.glyphMap} size={22} color={CALM.accent} />
                        </View>
                        <View style={styles.typeCardText}>
                          <Text style={styles.typeCardTitle}>{config.label}</Text>
                          <Text style={styles.typeCardDesc}>{config.description}</Text>
                        </View>
                        {tier === 'free' && (
                          <View style={[styles.typeSlotBadge, !canAdd && { backgroundColor: withAlpha(CALM.neutral, 0.1) }]}>
                            <Text style={[styles.typeSlotText, !canAdd && { color: CALM.neutral }]}>
                              {typeCount}/{FREE_TIER.maxWalletsPerType}
                            </Text>
                          </View>
                        )}
                        <Feather name="chevron-right" size={18} color={canAdd ? CALM.textMuted : CALM.neutral} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Step 2: Choose Preset */}
              {addStep === 'preset' && !editingWallet && (
                <View>
                  {/* Back button */}
                  <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => setAddStep('type')}
                  >
                    <Feather name="arrow-left" size={18} color={CALM.textSecondary} />
                    <Text style={styles.backBtnText}>Back</Text>
                  </TouchableOpacity>

                  <View style={styles.presetGrid}>
                    {typePresets.map((preset) => (
                      <TouchableOpacity
                        key={preset.id}
                        style={[styles.presetCard, selectedPresetId === preset.id && { borderColor: preset.color }]}
                        onPress={() => handleSelectPreset(preset.id)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.presetIcon, { backgroundColor: withAlpha(preset.color, 0.15) }]}>
                          <Feather name={preset.icon as keyof typeof Feather.glyphMap} size={20} color={preset.color} />
                        </View>
                        <Text style={styles.presetName} numberOfLines={1}>{preset.name}</Text>
                      </TouchableOpacity>
                    ))}
                    {/* Custom option */}
                    <TouchableOpacity
                      style={styles.presetCard}
                      onPress={() => handleSelectPreset(null)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.presetIcon, { backgroundColor: withAlpha(CALM.accent, 0.1) }]}>
                        <Feather name="plus" size={20} color={CALM.accent} />
                      </View>
                      <Text style={styles.presetName}>Custom</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Step 3: Details */}
              {addStep === 'details' && (
                <View>
                  {/* Back button (only for new wallets) */}
                  {!editingWallet && (
                    <TouchableOpacity
                      style={styles.backBtn}
                      onPress={() => setAddStep('preset')}
                    >
                      <Feather name="arrow-left" size={18} color={CALM.textSecondary} />
                      <Text style={styles.backBtnText}>Back</Text>
                    </TouchableOpacity>
                  )}

                  {/* Name + Balance/Limit in a row */}
                  <Text style={styles.formLabelCompact}>Wallet Name</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder={`e.g. ${WALLET_TYPE_CONFIG[selectedType].label}`}
                    placeholderTextColor={CALM.neutral}
                  />

                  <Text style={styles.formLabelCompact}>
                    {selectedType === 'credit' ? 'Credit Limit' : editingWallet ? 'Current Balance' : 'Initial Balance'}
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={selectedType === 'credit' ? creditLimit : balance}
                    onChangeText={selectedType === 'credit' ? setCreditLimit : setBalance}
                    placeholder="0.00"
                    placeholderTextColor={CALM.neutral}
                    keyboardType="decimal-pad"
                  />

                  {/* Icon + Color on same row */}
                  <View style={styles.pickerRow}>
                    <View style={styles.pickerCol}>
                      <Text style={styles.formLabelCompact}>Icon</Text>
                      <View style={styles.pickerGrid}>
                        {WALLET_ICONS_BY_TYPE[selectedType].map((icon) => (
                          <TouchableOpacity
                            key={icon}
                            style={[
                              styles.pickerItem,
                              selectedIcon === icon && {
                                backgroundColor: withAlpha(selectedColor, 0.15),
                                borderColor: selectedColor,
                              },
                            ]}
                            onPress={() => { lightTap(); setSelectedIcon(icon); }}
                          >
                            <Feather
                              name={icon as keyof typeof Feather.glyphMap}
                              size={20}
                              color={selectedIcon === icon ? selectedColor : CALM.textSecondary}
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={styles.pickerCol}>
                      <Text style={styles.formLabelCompact}>Color</Text>
                      <View style={styles.pickerGrid}>
                        {WALLET_COLORS.map((color) => (
                          <TouchableOpacity
                            key={color}
                            style={[
                              styles.colorItem,
                              { backgroundColor: color },
                              selectedColor === color && styles.colorSelected,
                            ]}
                            onPress={() => { lightTap(); setSelectedColor(color); }}
                          >
                            {selectedColor === color && (
                              <Feather name="check" size={14} color="#fff" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            {addStep === 'details' && (
              <Button
                title={editingWallet ? 'Save Changes' : 'Create Wallet'}
                onPress={handleSave}
                size="large"
                icon={editingWallet ? 'check' : 'plus'}
                style={styles.saveBtn}
              />
            )}
          </View>
        </Pressable>
      </Modal>

      {/* ─── Transfer Modal ─────────────────────────────────── */}
      <Modal
        visible={transferVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setTransferVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setTransferVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transfer</Text>
              <TouchableOpacity onPress={() => setTransferVisible(false)}>
                <Feather name="x" size={22} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}>
              <Text style={styles.formLabel}>From</Text>
              <View style={styles.walletSelectGrid}>
                {wallets.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.walletSelectItem, transferFrom === w.id && { borderColor: w.color, backgroundColor: withAlpha(w.color, 0.08) }]}
                    onPress={() => { lightTap(); setTransferFrom(w.id); }}
                  >
                    <Feather name={w.icon as keyof typeof Feather.glyphMap} size={16} color={transferFrom === w.id ? w.color : CALM.textSecondary} />
                    <Text style={[styles.walletSelectName, transferFrom === w.id && { color: w.color }]} numberOfLines={1}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>To</Text>
              <View style={styles.walletSelectGrid}>
                {transferToWallets.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.walletSelectItem, transferTo === w.id && { borderColor: w.color, backgroundColor: withAlpha(w.color, 0.08) }]}
                    onPress={() => { lightTap(); setTransferTo(w.id); }}
                  >
                    <Feather name={w.icon as keyof typeof Feather.glyphMap} size={16} color={transferTo === w.id ? w.color : CALM.textSecondary} />
                    <Text style={[styles.walletSelectName, transferTo === w.id && { color: w.color }]} numberOfLines={1}>{w.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Amount</Text>
              <TextInput
                style={styles.input}
                value={transferAmount}
                onChangeText={setTransferAmount}
                placeholder="0.00"
                placeholderTextColor={CALM.neutral}
                keyboardType="decimal-pad"
              />

              <Text style={styles.formLabel}>Note (optional)</Text>
              <TextInput
                style={styles.input}
                value={transferNote}
                onChangeText={setTransferNote}
                placeholder="e.g. Top up e-wallet"
                placeholderTextColor={CALM.neutral}
              />
            </ScrollView>

            <Button
              title="Transfer"
              onPress={handleTransfer}
              size="large"
              icon="repeat"
              style={styles.saveBtn}
            />
          </View>
        </Pressable>
      </Modal>

      {/* ─── Repay Credit Modal ─────────────────────────────── */}
      <Modal
        visible={repayVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRepayVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRepayVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Repay Credit</Text>
              <TouchableOpacity onPress={() => setRepayVisible(false)}>
                <Feather name="x" size={22} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}>
              {repayWalletId && (() => {
                const cw = wallets.find((w) => w.id === repayWalletId);
                if (!cw) return null;
                return (
                  <View style={styles.repayHeader}>
                    <View style={[styles.repayIconBg, { backgroundColor: withAlpha(cw.color, 0.15) }]}>
                      <Feather name={cw.icon as keyof typeof Feather.glyphMap} size={20} color={cw.color} />
                    </View>
                    <View>
                      <Text style={styles.repayName}>{cw.name}</Text>
                      <Text style={styles.repayUsed}>
                        Used: {currency} {(cw.usedCredit || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              <Text style={styles.formLabel}>Repayment Amount</Text>
              <TextInput
                style={styles.input}
                value={repayAmount}
                onChangeText={setRepayAmount}
                placeholder="0.00"
                placeholderTextColor={CALM.neutral}
                keyboardType="decimal-pad"
              />

              <Text style={styles.formLabel}>Pay From</Text>
              <View style={styles.walletSelectGrid}>
                {nonCreditWallets.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.walletSelectItem, repaySourceId === w.id && { borderColor: w.color, backgroundColor: withAlpha(w.color, 0.08) }]}
                    onPress={() => { lightTap(); setRepaySourceId(w.id); }}
                  >
                    <Feather name={w.icon as keyof typeof Feather.glyphMap} size={16} color={repaySourceId === w.id ? w.color : CALM.textSecondary} />
                    <Text style={[styles.walletSelectName, repaySourceId === w.id && { color: w.color }]} numberOfLines={1}>{w.name}</Text>
                    <Text style={styles.walletSelectBal}>{currency} {w.balance.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Button
              title="Repay"
              onPress={handleRepay}
              size="large"
              icon="corner-down-left"
              style={styles.saveBtn}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Paywall */}
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="wallet"
        currentUsage={wallets.length}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: 100,
  },
  // Summary
  summaryCard: {
    marginBottom: SPACING.xl,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  summaryItem: {
    flex: 1,
  },
  summaryDivider: {
    borderLeftWidth: 1,
    borderLeftColor: CALM.border,
    paddingLeft: SPACING.md,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  summaryAmount: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  summaryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  walletCountText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textMuted,
  },
  transferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: withAlpha(CALM.accent, 0.1),
    borderRadius: RADIUS.md,
  },
  transferBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  // Wallet List
  walletList: {
    gap: SPACING.xs,
  },
  typeSection: {
    marginBottom: SPACING.xs,
  },
  typeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  typeSectionTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    flex: 1,
  },
  typeSectionCount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
  },
  walletCard: {
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  walletIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletInfo: {
    flex: 1,
  },
  walletNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  walletName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  walletBalance: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  defaultBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  // Credit info
  creditInfo: {
    marginTop: 4,
  },
  creditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  creditLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
  creditAvailable: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  creditBar: {
    height: 4,
    backgroundColor: CALM.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  creditBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  creditLimit: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 2,
  },
  walletActions: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CALM.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starBtn: {
    padding: SPACING.xs,
  },
  // Transfers section
  transfersSection: {
    marginTop: SPACING.xl,
  },
  transfersSectionTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: SPACING.md,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  transferInfo: {
    flex: 1,
  },
  transferDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  transferNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 1,
  },
  transferAmt: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  // Add button
  addBtnContainer: {
    position: 'absolute',
    bottom: SPACING.xl,
    left: SPACING.xl,
    right: SPACING.xl,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING.xl,
    maxHeight: '85%',
  },
  floatingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  floatingContent: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: CALM.border,
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
  // Type selection
  typeGrid: {
    gap: SPACING.sm,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
    gap: SPACING.md,
  },
  typeCardDisabled: {
    opacity: 0.5,
  },
  typeIconBg: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeCardText: {
    flex: 1,
  },
  typeCardTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  typeCardDesc: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginTop: 1,
  },
  typeSlotBadge: {
    backgroundColor: withAlpha(CALM.accent, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  typeSlotText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
  },
  // Preset selection
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  backBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  presetCard: {
    width: '30%',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: CALM.border,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  presetIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetName: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    textAlign: 'center',
  },
  // Form
  formLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  formLabelCompact: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  input: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  pickerCol: {
    flex: 1,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  pickerItem: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: CALM.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorItem: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: CALM.textPrimary,
  },
  saveBtn: {
    marginTop: SPACING.md,
  },
  // Transfer modal wallet selection
  walletSelectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  walletSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: CALM.border,
  },
  walletSelectName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  walletSelectBal: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  // Repay modal
  repayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
  },
  repayIconBg: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repayName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  repayUsed: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  // Selection mode
  walletCardSelected: {
    borderColor: CALM.accent,
    borderWidth: 1,
    backgroundColor: withAlpha(CALM.accent, 0.04),
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: CALM.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  checkboxActive: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  selectionBar: {
    position: 'absolute' as const,
    bottom: SPACING.xl,
    left: SPACING.xl,
    right: SPACING.xl,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: CALM.accent,
    gap: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  selectionClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CALM.background,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  selectionCount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    flex: 1,
  },
  selectionActions: {
    flexDirection: 'row' as const,
    gap: SPACING.sm,
  },
  selectionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: withAlpha(CALM.accent, 0.1),
    borderRadius: RADIUS.md,
  },
  selectionBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  selectionBtnDanger: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: withAlpha(CALM.neutral, 0.1),
    borderRadius: RADIUS.md,
  },
  selectionBtnDangerText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.neutral,
  },
});

export default WalletManagement;
