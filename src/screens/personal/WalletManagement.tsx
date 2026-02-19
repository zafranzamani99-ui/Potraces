import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import GRADIENTS from '../../constants/gradients';
import { WALLET_ICONS, WALLET_COLORS } from '../../constants/premium';
import { useWalletStore } from '../../store/walletStore';
import { usePremiumStore } from '../../store/premiumStore';
import Card from '../../components/common/Card';
import GradientButton from '../../components/common/GradientButton';
import EmptyState from '../../components/common/EmptyState';
import PaywallModal from '../../components/common/PaywallModal';
import { lightTap } from '../../services/haptics';

const WalletManagement: React.FC = () => {
  const wallets = useWalletStore((s) => s.wallets);
  const addWallet = useWalletStore((s) => s.addWallet);
  const updateWallet = useWalletStore((s) => s.updateWallet);
  const deleteWallet = useWalletStore((s) => s.deleteWallet);
  const setDefaultWallet = useWalletStore((s) => s.setDefaultWallet);
  const canCreateWallet = usePremiumStore((s) => s.canCreateWallet);
  const tier = usePremiumStore((s) => s.tier);

  const [modalVisible, setModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [editingWallet, setEditingWallet] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<string>(WALLET_ICONS[0]);
  const [selectedColor, setSelectedColor] = useState<string>(WALLET_COLORS[0]);

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);

  const resetForm = () => {
    setName('');
    setBalance('');
    setSelectedIcon(WALLET_ICONS[0]);
    setSelectedColor(WALLET_COLORS[0]);
    setEditingWallet(null);
  };

  const handleAdd = () => {
    if (!canCreateWallet(wallets.length)) {
      setPaywallVisible(true);
      return;
    }
    resetForm();
    setModalVisible(true);
  };

  const handleEdit = (walletId: string) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    setEditingWallet(walletId);
    setName(wallet.name);
    setBalance(wallet.balance.toString());
    setSelectedIcon(wallet.icon);
    setSelectedColor(wallet.color);
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a wallet name');
      return;
    }
    const balanceNum = parseFloat(balance) || 0;

    if (editingWallet) {
      updateWallet(editingWallet, {
        name: name.trim(),
        balance: balanceNum,
        icon: selectedIcon,
        color: selectedColor,
      });
    } else {
      addWallet({
        name: name.trim(),
        balance: balanceNum,
        icon: selectedIcon,
        color: selectedColor,
        isDefault: wallets.length === 0,
      });
    }
    setModalVisible(false);
    resetForm();
  };

  const handleDelete = (walletId: string) => {
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
  };

  const handleSetDefault = (walletId: string) => {
    lightTap();
    setDefaultWallet(walletId);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Total Balance Summary */}
        <Card gradient={GRADIENTS.primary} style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <Feather name="credit-card" size={24} color="#fff" />
            <View style={styles.summaryText}>
              <Text style={styles.summaryLabel}>Total Balance</Text>
              <Text style={styles.summaryAmount}>
                RM {totalBalance.toFixed(2)}
              </Text>
            </View>
            <View style={styles.walletCount}>
              <Text style={styles.walletCountText}>
                {wallets.length}{tier === 'free' ? '/2' : ''} wallets
              </Text>
            </View>
          </View>
        </Card>

        {/* Wallet List */}
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
            {wallets.map((wallet) => (
              <Card key={wallet.id} style={styles.walletCard}>
                <View style={styles.walletRow}>
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
                    <Text style={styles.walletBalance}>
                      RM {wallet.balance.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.walletActions}>
                    {!wallet.isDefault && (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleSetDefault(wallet.id)}
                      >
                        <Feather name="star" size={16} color={COLORS.textTertiary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleEdit(wallet.id)}
                    >
                      <Feather name="edit-2" size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleDelete(wallet.id)}
                    >
                      <Feather name="trash-2" size={16} color={COLORS.expense} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add Button */}
      {wallets.length > 0 && (
        <View style={styles.addBtnContainer}>
          <GradientButton
            title="Add Wallet"
            onPress={handleAdd}
            gradient={GRADIENTS.primary}
            size="large"
            icon="plus"
          />
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingWallet ? 'Edit Wallet' : 'New Wallet'}
              </Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Feather name="x" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Name */}
              <Text style={styles.formLabel}>Wallet Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Main Account"
                placeholderTextColor={COLORS.textTertiary}
              />

              {/* Balance */}
              <Text style={styles.formLabel}>
                {editingWallet ? 'Current Balance' : 'Initial Balance'}
              </Text>
              <TextInput
                style={styles.input}
                value={balance}
                onChangeText={setBalance}
                placeholder="0.00"
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="decimal-pad"
              />

              {/* Icon Picker */}
              <Text style={styles.formLabel}>Icon</Text>
              <View style={styles.pickerGrid}>
                {WALLET_ICONS.map((icon) => (
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
                      size={22}
                      color={selectedIcon === icon ? selectedColor : COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Color Picker */}
              <Text style={styles.formLabel}>Color</Text>
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
                      <Feather name="check" size={18} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Preview */}
              <Text style={styles.formLabel}>Preview</Text>
              <View style={[styles.previewCard, { borderColor: withAlpha(selectedColor, 0.3) }]}>
                <View style={[styles.previewIcon, { backgroundColor: withAlpha(selectedColor, 0.15) }]}>
                  <Feather
                    name={selectedIcon as keyof typeof Feather.glyphMap}
                    size={24}
                    color={selectedColor}
                  />
                </View>
                <Text style={styles.previewName}>{name || 'Wallet Name'}</Text>
                <Text style={styles.previewBalance}>
                  RM {parseFloat(balance || '0').toFixed(2)}
                </Text>
              </View>
            </ScrollView>

            <GradientButton
              title={editingWallet ? 'Save Changes' : 'Create Wallet'}
              onPress={handleSave}
              gradient={GRADIENTS.primary}
              size="large"
              icon={editingWallet ? 'check' : 'plus'}
              style={styles.saveBtn}
            />
          </View>
        </View>
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
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.xl,
    paddingBottom: 100,
  },
  summaryCard: {
    marginBottom: SPACING.xl,
  },
  summaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  summaryText: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: 'rgba(255,255,255,0.8)',
  },
  summaryAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  walletCount: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  walletCountText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  walletList: {
    gap: SPACING.md,
  },
  walletCard: {
    padding: SPACING.lg,
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
    color: COLORS.text,
  },
  walletBalance: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
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
  walletActions: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnContainer: {
    position: 'absolute',
    bottom: SPACING.xl,
    left: SPACING.xl,
    right: SPACING.xl,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING.xl,
    maxHeight: '85%',
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
    color: COLORS.text,
  },
  formLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  pickerItem: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorItem: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: COLORS.text,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
  },
  previewBalance: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  saveBtn: {
    marginTop: SPACING.xl,
  },
});

export default WalletManagement;
