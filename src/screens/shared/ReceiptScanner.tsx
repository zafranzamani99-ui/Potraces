import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { scanReceipt } from '../../services/receiptScanner';
import { usePersonalStore } from '../../store/personalStore';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import PaywallModal from '../../components/common/PaywallModal';
import WalletPicker from '../../components/common/WalletPicker';
import { usePremiumStore } from '../../store/premiumStore';
import { useWalletStore } from '../../store/walletStore';
import type { RootStackParamList, ExtractedReceipt, ReceiptItem } from '../../types';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const ReceiptScanner: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { showToast } = useToast();
  const mode = useAppStore((s) => s.mode);
  const currency = useSettingsStore((s) => s.currency);
  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const canScanReceipt = usePremiumStore((s) => s.canScanReceipt);
  const incrementScanCount = usePremiumStore((s) => s.incrementScanCount);
  const getRemainingScans = usePremiumStore((s) => s.getRemainingScans);
  const tier = usePremiumStore((s) => s.tier);
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(
    wallets.find((w) => w.isDefault)?.id || null
  );
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<ExtractedReceipt | null>(null);

  // Editable state
  const [editVendor, setEditVendor] = useState('');
  const [editItems, setEditItems] = useState<ReceiptItem[]>([]);
  const [editTotal, setEditTotal] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  const requestPermission = async (type: 'camera' | 'gallery') => {
    if (type === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      return status === 'granted';
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  };

  const handleTakePhoto = async () => {
    const granted = await requestPermission('camera');
    if (!granted) {
      Alert.alert('Permission Required', 'Please grant camera permission to scan receipts.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setReceipt(null);
    }
  };

  const handlePickImage = async () => {
    const granted = await requestPermission('gallery');
    if (!granted) {
      Alert.alert('Permission Required', 'Please grant photo library permission to scan receipts.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setReceipt(null);
    }
  };

  const handleExtract = async () => {
    if (!imageUri) return;

    if (!canScanReceipt()) {
      setPaywallVisible(true);
      return;
    }

    setLoading(true);
    try {
      const extracted = await scanReceipt(imageUri);
      incrementScanCount();
      setReceipt(extracted);
      setEditVendor(extracted.vendor || '');
      setEditItems([...extracted.items]);
      setEditTotal(extracted.total.toFixed(2));
      showToast('Receipt extracted successfully!', 'success');
    } catch (error: any) {
      Alert.alert('Extraction Failed', error.message || 'Could not extract receipt data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setImageUri(null);
    setReceipt(null);
    setEditVendor('');
    setEditItems([]);
    setEditTotal('');
    setNewItemName('');
    setNewItemAmount('');
  };

  const handleRemoveItem = (index: number) => {
    const updated = editItems.filter((_, i) => i !== index);
    setEditItems(updated);
    const newTotal = updated.reduce((sum, item) => sum + item.amount, 0);
    setEditTotal(newTotal.toFixed(2));
  };

  const handleUpdateItemAmount = (index: number, value: string) => {
    const updated = editItems.map((item, i) =>
      i === index ? { ...item, amount: parseFloat(value) || 0 } : item
    );
    setEditItems(updated);
  };

  const handleUpdateItemName = (index: number, value: string) => {
    setEditItems(editItems.map((item, i) => (i === index ? { ...item, name: value } : item)));
  };

  const handleAddItem = () => {
    if (!newItemName.trim() || !newItemAmount || parseFloat(newItemAmount) <= 0) {
      showToast('Enter item name and amount', 'error');
      return;
    }
    const amount = parseFloat(newItemAmount);
    setEditItems([...editItems, { name: newItemName.trim(), amount }]);
    setEditTotal((parseFloat(editTotal) + amount).toFixed(2));
    setNewItemName('');
    setNewItemAmount('');
  };

  const handleAddAsExpense = () => {
    const total = parseFloat(editTotal);
    if (!total || total <= 0) {
      showToast('Please enter a valid total', 'error');
      return;
    }

    addTransaction({
      amount: total,
      category: 'other',
      description: editVendor || 'Receipt Scan',
      date: new Date(),
      type: 'expense',
      mode,
      walletId: selectedWalletId || undefined,
      receiptUrl: imageUri || undefined,
      inputMethod: 'photo',
    });

    if (selectedWalletId) {
      deductFromWallet(selectedWalletId, total);
    }

    showToast('Expense added from receipt!', 'success');
    navigation.goBack();
  };

  const handleSplitBill = () => {
    const total = parseFloat(editTotal);
    if (!total || total <= 0) {
      showToast('Please enter a valid total', 'error');
      return;
    }

    // DebtTracking is now a root stack screen, navigate via parent
    navigation.navigate('DebtTracking' as any, {
      receiptData: {
        vendor: editVendor || 'Receipt Scan',
        total,
        items: editItems,
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero / Capture Section */}
        {!imageUri && (
          <Card style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Feather name="camera" size={48} color={CALM.accent} />
            </View>
            <Text style={styles.heroTitle}>Scan a Receipt</Text>
            <Text style={styles.heroSubtitle}>
              Take a photo or pick from gallery to extract items, amounts, and totals automatically.
            </Text>
            {tier === 'free' && (
              <Text style={styles.scanLimitText}>
                {getRemainingScans()} scans remaining this month
              </Text>
            )}

            <View style={styles.captureButtons}>
              <TouchableOpacity style={styles.captureButton} onPress={handleTakePhoto} activeOpacity={0.7}>
                <View style={[styles.captureIcon, { backgroundColor: withAlpha(CALM.accent, 0.12) }]}>
                  <Feather name="camera" size={24} color={CALM.accent} />
                </View>
                <Text style={styles.captureLabel}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.captureButton} onPress={handlePickImage} activeOpacity={0.7}>
                <View style={[styles.captureIcon, { backgroundColor: withAlpha(CALM.positive, 0.12) }]}>
                  <Feather name="image" size={24} color={CALM.positive} />
                </View>
                <Text style={styles.captureLabel}>From Gallery</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* Image Preview */}
        {imageUri && (
          <Card style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.sectionTitle}>Receipt Image</Text>
              <TouchableOpacity onPress={handleReset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x-circle" size={22} color={CALM.neutral} />
              </TouchableOpacity>
            </View>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />

            {!receipt && !loading && (
              <Button
                title="Extract with AI"
                onPress={handleExtract}
                icon="cpu"
                style={{ marginTop: SPACING.lg }}
              />
            )}
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card style={styles.loadingCard}>
            <ActivityIndicator size="large" color={CALM.accent} />
            <Text style={styles.loadingText}>AI is extracting receipt data...</Text>
            <Text style={styles.loadingSubtext}>This may take a few seconds</Text>
          </Card>
        )}

        {/* Extracted Data (Editable) */}
        {receipt && !loading && (
          <>
            <Card style={styles.dataCard}>
              <Text style={styles.sectionTitle}>Extracted Data</Text>

              <Text style={styles.formLabel}>Vendor</Text>
              <TextInput
                style={styles.formInput}
                value={editVendor}
                onChangeText={setEditVendor}
                placeholder="Store name"
                placeholderTextColor={CALM.textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              {receipt.date && (
                <View style={styles.metaRow}>
                  <Feather name="calendar" size={14} color={CALM.textSecondary} />
                  <Text style={styles.metaText}>{receipt.date}</Text>
                </View>
              )}

              <Text style={[styles.formLabel, { marginTop: SPACING.lg }]}>Items</Text>
              {editItems.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <TextInput
                    style={[styles.formInput, { flex: 2 }]}
                    value={item.name}
                    onChangeText={(v) => handleUpdateItemName(index, v)}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={[styles.formInput, { flex: 1, textAlign: 'right' }]}
                    value={item.amount.toFixed(2)}
                    onChangeText={(v) => handleUpdateItemAmount(index, v)}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <TouchableOpacity onPress={() => handleRemoveItem(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="trash-2" size={18} color={CALM.neutral} />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add new item */}
              <View style={styles.itemRow}>
                <TextInput
                  style={[styles.formInput, { flex: 2 }]}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  placeholder="New item"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="next"
                />
                <TextInput
                  style={[styles.formInput, { flex: 1, textAlign: 'right' }]}
                  value={newItemAmount}
                  onChangeText={setNewItemAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
                <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem}>
                  <Feather name="plus" size={18} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Summary */}
              <View style={styles.summarySection}>
                {receipt.subtotal !== undefined && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Subtotal</Text>
                    <Text style={styles.summaryValue}>{currency} {receipt.subtotal.toFixed(2)}</Text>
                  </View>
                )}
                {receipt.tax !== undefined && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Tax</Text>
                    <Text style={styles.summaryValue}>{currency} {receipt.tax.toFixed(2)}</Text>
                  </View>
                )}
                <View style={[styles.summaryRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <View style={styles.totalInputContainer}>
                    <Text style={styles.totalCurrency}>{currency}</Text>
                    <TextInput
                      style={styles.totalInput}
                      value={editTotal}
                      onChangeText={setEditTotal}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </View>
                </View>
              </View>
            </Card>

            {/* Wallet Selection */}
            <WalletPicker
              wallets={wallets}
              selectedId={selectedWalletId}
              onSelect={setSelectedWalletId}
              label="Deduct from Wallet"
            />

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <Button
                title="Add as Expense"
                onPress={handleAddAsExpense}
                icon="plus-circle"
                style={{ flex: 1 }}
              />
              <Button
                title="Split This Bill"
                onPress={handleSplitBill}
                icon="scissors"
                variant="secondary"
                style={{ flex: 1 }}
              />
            </View>
          </>
        )}
      </KeyboardAwareScrollView>

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="scan"
        currentUsage={15 - getRemainingScans()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING['5xl'],
  },

  // Hero
  heroCard: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
  },
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: withAlpha(CALM.accent, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  heroTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    marginBottom: SPACING.sm,
  },
  heroSubtitle: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  scanLimitText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.neutral,
    marginBottom: SPACING.md,
  },
  captureButtons: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  captureButton: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  captureIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },

  // Preview
  previewCard: {
    marginBottom: SPACING.md,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: RADIUS.md,
    backgroundColor: CALM.background,
  },

  // Loading
  loadingCard: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  loadingSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },

  // Data
  dataCard: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    marginBottom: SPACING.md,
  },
  formLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  formInput: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  metaText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  addItemBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CALM.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Summary
  summarySection: {
    marginTop: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  summaryValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  totalRow: {
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    marginTop: SPACING.sm,
  },
  totalLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  totalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  totalCurrency: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  totalInput: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
    minWidth: 80,
    textAlign: 'right',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: CALM.border,
  },

  // Actions
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
});

export default ReceiptScanner;
