import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  Keyboard,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
// Lazy-loaded: native module crashes Expo Go if imported at top level
const getDocumentScanner = () => require('react-native-document-scanner-plugin').default as typeof import('react-native-document-scanner-plugin').default;
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { format, getYear, parse, isValid } from 'date-fns';
import { scanReceipt } from '../../services/receiptScanner';
import { usePersonalStore } from '../../store/personalStore';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useReceiptStore } from '../../store/receiptStore';
import { useCategoryStore } from '../../store/categoryStore';
import { usePlaybookStore } from '../../store/playbookStore';
import { useToast } from '../../context/ToastContext';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { MYTAX_CATEGORIES } from '../../constants/taxCategories';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import ScreenGuide from '../../components/common/ScreenGuide';
import PaywallModal from '../../components/common/PaywallModal';
import WalletPicker from '../../components/common/WalletPicker';
import CalendarPicker from '../../components/common/CalendarPicker';
// CollapsibleSection removed — always show content expanded
import SkeletonLoader from '../../components/common/SkeletonLoader';
import CategoryManager from '../../components/common/CategoryManager';
import PaymentMethodManager from '../../components/common/PaymentMethodManager';
import { usePremiumStore } from '../../store/premiumStore';
import { useWalletStore } from '../../store/walletStore';
import type { RootStackParamList, ExtractedReceipt, ReceiptItem, MyTaxCategory } from '../../types';

type NavigationProp = StackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Malay month names → English (for date-fns parsing)
const MALAY_MONTHS: Record<string, string> = {
  jan: 'Jan', feb: 'Feb', mac: 'Mar', apr: 'Apr', mei: 'May', jun: 'Jun',
  jul: 'Jul', ogo: 'Aug', ogos: 'Aug', sep: 'Sep', okt: 'Oct', nov: 'Nov', dis: 'Dec',
  januari: 'January', februari: 'February', mac_full: 'March', april: 'April',
  mei_full: 'May', jun_full: 'June', julai: 'July', ogos_full: 'August',
  september: 'September', oktober: 'October', november: 'November', disember: 'December',
};

function normalizeMalayDate(dateStr: string): string {
  return dateStr.replace(/\b([A-Za-z]+)\b/g, (match) => {
    const lower = match.toLowerCase().replace('_full', '');
    return MALAY_MONTHS[lower] || match;
  });
}

// Parse various date formats from receipt AI
function parseReceiptDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  // Normalize Malay month names first
  const normalized = normalizeMalayDate(dateStr);
  // Try common Malaysian receipt date formats
  const formats = [
    'dd/MM/yyyy', 'dd-MM-yyyy', 'dd.MM.yyyy',
    'yyyy-MM-dd', 'MM/dd/yyyy',
    'dd/MM/yyyy HH:mm', 'dd-MM-yyyy HH:mm',
    'yyyy-MM-dd HH:mm:ss',
    'dd MMM yyyy', 'dd MMMM yyyy',
  ];
  for (const fmt of formats) {
    try {
      const d = parse(normalized, fmt, new Date());
      if (isValid(d)) return d;
    } catch { /* try next */ }
  }
  // Fallback: let JS try
  const fallback = new Date(normalized);
  return isValid(fallback) ? fallback : new Date();
}

const ReceiptScanner: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<NavigationProp>();
  const { showToast } = useToast();
  const mode = useAppStore((s) => s.mode);
  const currency = useSettingsStore((s) => s.currency);
  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const updateTransaction = usePersonalStore((s) => s.updateTransaction);
  const addReceipt = useReceiptStore((s) => s.addReceipt);
  const saveDraft = useReceiptStore((s) => s.saveDraft);
  const clearDraft = useReceiptStore((s) => s.clearDraft);
  const draft = useReceiptStore((s) => s.draft);
  const getExpenseCategories = useCategoryStore((s) => s.getExpenseCategories);
  const canScanReceipt = usePremiumStore((s) => s.canScanReceipt);
  const incrementScanCount = usePremiumStore((s) => s.incrementScanCount);
  const getRemainingScans = usePremiumStore((s) => s.getRemainingScans);
  const tier = usePremiumStore((s) => s.tier);
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const getPaymentMethods = useSettingsStore((s) => s.getPaymentMethods);

  const expenseCategories = useMemo(() => getExpenseCategories('personal'), [getExpenseCategories]);
  const paymentMethods = useMemo(() => getPaymentMethods(), [getPaymentMethods]);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(
    wallets.find((w) => w.isDefault)?.id || null
  );
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<ExtractedReceipt | null>(null);

  // Editable state
  const [editTitle, setEditTitle] = useState('');
  const [editVendor, setEditVendor] = useState('');
  const [editItems, setEditItems] = useState<ReceiptItem[]>([]);
  const [editTotal, setEditTotal] = useState('');
  const [editDate, setEditDate] = useState(new Date());
  const [editCategory, setEditCategory] = useState('other');
  const [editMyTaxCategory, setEditMyTaxCategory] = useState('none');
  const [editPaymentMethod, setEditPaymentMethod] = useState<string | null>(null);
  const [editLocation, setEditLocation] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  // UI state
  const [taxPickerVisible, setTaxPickerVisible] = useState(false);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [paymentPickerVisible, setPaymentPickerVisible] = useState(false);
  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);
  const [categoryManagerVisible, setCategoryManagerVisible] = useState(false);
  const [paymentManagerVisible, setPaymentManagerVisible] = useState(false);
  const [imageViewVisible, setImageViewVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordOnly, setRecordOnly] = useState(false);

  const selectedTaxCat = useMemo(
    () => MYTAX_CATEGORIES.find((c) => c.id === editMyTaxCategory) || MYTAX_CATEGORIES[0],
    [editMyTaxCategory]
  );
  const selectedCat = useMemo(
    () => expenseCategories.find((c) => c.id === editCategory),
    [expenseCategories, editCategory]
  );
  const selectedPayment = useMemo(
    () => paymentMethods.find((m) => m.id === editPaymentMethod),
    [paymentMethods, editPaymentMethod]
  );

  const handleLoadDraft = useCallback(() => {
    const d = useReceiptStore.getState().draft;
    if (!d) return;
    setEditTitle(d.title);
    setEditVendor(d.vendor);
    setEditItems(d.items);
    setEditTotal(d.total);
    setEditDate(d.date instanceof Date ? d.date : new Date(d.date));
    setEditCategory(d.category);
    setEditMyTaxCategory(d.myTaxCategory);
    setEditPaymentMethod(d.paymentMethod);
    setEditLocation(d.location);
    if (d.imageUri) setImageUri(d.imageUri);
    setReceipt({ items: d.items, total: parseFloat(d.total) } as ExtractedReceipt);
  }, []);

  const requestPermission = async (type: 'camera' | 'gallery') => {
    if (type === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      return status === 'granted';
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  };

  const handleTakePhoto = useCallback(async () => {
    try {
      const result = await getDocumentScanner().scanDocument({
        maxNumDocuments: 1,
      });
      if (result.scannedImages && result.scannedImages.length > 0) {
        setImageUri(result.scannedImages[0]);
        setReceipt(null);
      }
    } catch {
      // User cancelled or scanner unavailable — fall back to camera
      const granted = await requestPermission('camera');
      if (!granted) {
        Alert.alert('Permission Required', 'Please grant camera permission to scan receipts.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
        setReceipt(null);
      }
    }
  }, []);

  const handlePickImage = useCallback(async () => {
    const granted = await requestPermission('gallery');
    if (!granted) {
      Alert.alert('Permission Required', 'Please grant photo library permission to scan receipts.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setReceipt(null);
    }
  }, []);

  const handleExtract = useCallback(async () => {
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
      setEditTitle(extracted.vendor || '');
      setEditItems([...extracted.items]);
      setEditTotal(extracted.total.toFixed(2));
      setEditDate(parseReceiptDate(extracted.date));
      setEditCategory(extracted.suggestedExpenseCategory || 'other');
      setEditMyTaxCategory(extracted.suggestedTaxCategory || 'none');
      setEditPaymentMethod(extracted.paymentMethod || null);
      setEditLocation(extracted.location || '');
      showToast('receipt extracted!', 'success');
    } catch (error: any) {
      Alert.alert('Extraction Failed', error.message || 'Could not extract receipt data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [imageUri, canScanReceipt, incrementScanCount, showToast]);

  const handleReset = useCallback(() => {
    setImageUri(null);
    setReceipt(null);
    setEditTitle('');
    setEditVendor('');
    setEditItems([]);
    setEditTotal('');
    setEditDate(new Date());
    setEditCategory('other');
    setEditMyTaxCategory('none');
    setEditPaymentMethod(null);
    setEditLocation('');
    setNewItemName('');
    setNewItemAmount('');
    setRecordOnly(false);
  }, []);

  const handleRemoveItem = useCallback((index: number) => {
    const updated = editItems.filter((_, i) => i !== index);
    setEditItems(updated);
    const newTotal = updated.reduce((sum, item) => sum + item.amount, 0);
    setEditTotal(newTotal.toFixed(2));
  }, [editItems]);

  const handleUpdateItemAmount = useCallback((index: number, value: string) => {
    const updated = editItems.map((item, i) =>
      i === index ? { ...item, amount: parseFloat(value) || 0 } : item
    );
    setEditItems(updated);
  }, [editItems]);

  const handleUpdateItemName = useCallback((index: number, value: string) => {
    setEditItems(editItems.map((item, i) => (i === index ? { ...item, name: value } : item)));
  }, [editItems]);

  const handleAddItem = useCallback(() => {
    if (!newItemName.trim() || !newItemAmount || parseFloat(newItemAmount) <= 0) {
      showToast('enter item name and amount', 'error');
      return;
    }
    const amount = parseFloat(newItemAmount);
    setEditItems([...editItems, { name: newItemName.trim(), amount }]);
    setEditTotal((parseFloat(editTotal) + amount).toFixed(2));
    setNewItemName('');
    setNewItemAmount('');
  }, [newItemName, newItemAmount, editItems, editTotal, showToast]);

  const handleSaveReceipt = useCallback(async () => {
    const total = parseFloat(editTotal);
    if (!total || total <= 0) {
      showToast('please enter a valid total', 'error');
      return;
    }

    setSaving(true);
    try {
      const title = editTitle.trim() || editVendor.trim() || 'Receipt';
      const description = title;

      // 0. Persist image to permanent directory
      let persistedUri = imageUri || undefined;
      if (imageUri) {
        try {
          const dir = `${FileSystem.documentDirectory}receipts/`;
          const dirInfo = await FileSystem.getInfoAsync(dir);
          if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
          const ext = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
          const filename = `receipt_${Date.now()}.${ext}`;
          await FileSystem.copyAsync({ from: imageUri, to: dir + filename });
          persistedUri = dir + filename;
        } catch {
          // Keep original URI as fallback
        }
      }

      let txId: string | undefined;

      if (!recordOnly) {
        // 1. Create transaction
        txId = addTransaction({
          amount: total,
          category: editCategory,
          description,
          date: editDate,
          type: 'expense',
          mode,
          walletId: selectedWalletId || undefined,
          receiptUrl: persistedUri,
          inputMethod: 'photo',
        });

        // 2. Wallet deduction
        if (selectedWalletId) {
          deductFromWallet(selectedWalletId, total);
        }
      }

      // 3. Save receipt
      addReceipt({
        title,
        vendor: editVendor || undefined,
        items: editItems,
        subtotal: receipt?.subtotal,
        tax: receipt?.tax,
        total,
        date: editDate,
        category: editCategory,
        myTaxCategory: editMyTaxCategory,
        paymentMethod: editPaymentMethod || undefined,
        location: editLocation || undefined,
        walletId: recordOnly ? undefined : (selectedWalletId || undefined),
        imageUri: persistedUri,
        verified: true,
        transactionId: txId,
        year: getYear(editDate),
      });

      // 4. Playbook auto-link
      if (txId) {
        const activePbs = usePlaybookStore.getState().getActivePlaybooks();
        const linkToPb = (pbId: string) => {
          usePlaybookStore.getState().linkExpense(pbId, txId!);
          updateTransaction(txId!, {
            playbookLinks: [{ playbookId: pbId, amount: total }],
          });
        };
        if (activePbs.length === 1) {
          linkToPb(activePbs[0].id);
        } else if (activePbs.length > 1) {
          Alert.alert('link to playbook', 'which playbook?', [
            ...activePbs.map((pb) => ({
              text: pb.name,
              onPress: () => linkToPb(pb.id),
            })),
            { text: 'skip', style: 'cancel' as const },
          ]);
        }
      }

      clearDraft();
      showToast('receipt saved!', 'success');
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }, [
    editTotal, editTitle, editVendor, editCategory, editDate, editMyTaxCategory,
    editPaymentMethod, editLocation, editItems, receipt, selectedWalletId,
    imageUri, mode, recordOnly, addTransaction, updateTransaction, deductFromWallet,
    addReceipt, showToast, navigation,
  ]);

  const handleSaveDraft = useCallback(() => {
    saveDraft({
      title: editTitle,
      vendor: editVendor,
      items: editItems,
      total: editTotal,
      date: editDate,
      category: editCategory,
      myTaxCategory: editMyTaxCategory,
      paymentMethod: editPaymentMethod,
      location: editLocation,
      imageUri,
    });
    showToast('draft saved', 'success');
  }, [editTitle, editVendor, editItems, editTotal, editDate, editCategory, editMyTaxCategory, editPaymentMethod, editLocation, imageUri, saveDraft, showToast]);

  const handleSplitBill = () => {
    const total = parseFloat(editTotal);
    if (!total || total <= 0) {
      showToast('please enter a valid total', 'error');
      return;
    }
    setTimeout(() => {
      navigation.navigate('DebtTracking', {
        receiptData: {
          vendor: editTitle || editVendor || 'Receipt Scan',
          total,
          items: editItems,
        },
      });
    }, 50);
  };

  const renderTaxCategoryItem = useCallback(({ item }: { item: MyTaxCategory }) => {
    const isSelected = item.id === editMyTaxCategory;
    const isNone = item.id === 'none';
    const itemColor = isNone ? C.neutral : C.accent;
    return (
      <TouchableOpacity
        style={[
          styles.taxItem,
          isSelected && { backgroundColor: withAlpha(itemColor, 0.1) },
        ]}
        onPress={() => {
          setEditMyTaxCategory(item.id);
          setTaxPickerVisible(false);
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.taxItemIcon, { backgroundColor: isSelected ? itemColor : withAlpha(itemColor, 0.15) }]}>
          <Feather
            name={item.icon as keyof typeof Feather.glyphMap}
            size={18}
            color={isSelected ? '#fff' : itemColor}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.taxItemName, isSelected && { color: itemColor, fontWeight: TYPOGRAPHY.weight.bold }, isNone && !isSelected && { color: C.neutral }]}>{item.name}</Text>
          <Text style={styles.taxItemDesc} numberOfLines={1}>{item.description}</Text>
        </View>
        {item.limit !== null && (
          <View style={styles.taxLimitBadge}>
            <Text style={styles.taxLimitText}>RM {item.limit.toLocaleString()}</Text>
          </View>
        )}
        {isSelected && <Feather name="check" size={18} color={itemColor} />}
      </TouchableOpacity>
    );
  }, [editMyTaxCategory, C, styles]);

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
              <Feather name="camera" size={48} color={C.accent} />
            </View>
            <Text style={styles.heroTitle}>Save Receipt</Text>
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
                <View style={[styles.captureIcon, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
                  <Feather name="camera" size={24} color={C.accent} />
                </View>
                <Text style={styles.captureLabel}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.captureButton} onPress={handlePickImage} activeOpacity={0.7}>
                <View style={[styles.captureIcon, { backgroundColor: withAlpha(C.positive, 0.12) }]}>
                  <Feather name="image" size={24} color={C.positive} />
                </View>
                <Text style={styles.captureLabel}>From Gallery</Text>
              </TouchableOpacity>
            </View>

            {/* View receipts link */}
            <TouchableOpacity
              style={styles.viewReceiptsLink}
              onPress={() => navigation.navigate('ReceiptHistory')}
              activeOpacity={0.6}
            >
              <Feather name="archive" size={14} color={C.accent} />
              <Text style={styles.viewReceiptsText}>view my receipts</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Draft card */}
        {!imageUri && !receipt && draft && (
          <TouchableOpacity
            style={styles.draftCard}
            onPress={handleLoadDraft}
            activeOpacity={0.7}
          >
            <View style={[styles.taxTriggerIcon, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
              <Feather name="bookmark" size={18} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.thumbnailLabel}>continue draft</Text>
              <Text style={styles.thumbnailHint}>
                {draft.title || 'untitled'} · {currency} {draft.total}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={C.textSecondary} />
          </TouchableOpacity>
        )}

        {/* Image Preview (compact when extracted) */}
        {imageUri && !receipt && !loading && (
          <Card style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.sectionTitle}>Receipt Image</Text>
              <TouchableOpacity onPress={handleReset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x-circle" size={22} color={C.neutral} />
              </TouchableOpacity>
            </View>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
            <Button
              title="Extract with AI"
              onPress={handleExtract}
              icon="cpu"
              style={{ marginTop: SPACING.lg }}
            />
          </Card>
        )}

        {/* Loading State — skeleton */}
        {loading && (
          <Card style={styles.loadingCard}>
            <SkeletonLoader shape="line" style={{ width: '60%', height: 20 }} />
            <SkeletonLoader shape="line" style={{ width: '40%', height: 16, marginTop: SPACING.md }} />
            <SkeletonLoader shape="box" style={{ width: '100%', height: 120, marginTop: SPACING.lg }} />
            <SkeletonLoader shape="line" style={{ width: '80%', height: 16, marginTop: SPACING.md }} />
            <SkeletonLoader shape="line" style={{ width: '50%', height: 16, marginTop: SPACING.sm }} />
            <Text style={[styles.loadingSubtext, { marginTop: SPACING.lg }]}>AI is extracting receipt data...</Text>
          </Card>
        )}

        {/* Extracted Data Form */}
        {receipt && !loading && (
          <>
            {/* Receipt thumbnail */}
            {imageUri && (
              <TouchableOpacity
                onPress={() => setImageViewVisible(true)}
                activeOpacity={0.8}
                style={styles.thumbnailRow}
              >
                <Image source={{ uri: imageUri }} style={styles.thumbnail} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.thumbnailLabel}>receipt image</Text>
                  <Text style={styles.thumbnailHint}>tap to view full size</Text>
                </View>
                <TouchableOpacity onPress={handleReset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x-circle" size={20} color={C.neutral} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}

            <Card style={styles.dataCard}>
              {/* Title */}
              <Text style={styles.formLabel}>Title</Text>
              <TextInput
                style={styles.formInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="e.g. lunch at mamak"
                placeholderTextColor={C.textSecondary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              {/* Total */}
              <View style={[styles.summaryRow, styles.totalRow, { marginTop: SPACING.lg }]}>
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

              {/* Date */}
              <Text style={styles.formLabel}>Date</Text>
              <TouchableOpacity
                style={styles.taxTrigger}
                onPress={() => setCalendarPickerVisible(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.taxTriggerIcon, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
                  <Feather name="calendar" size={18} color={C.accent} />
                </View>
                <Text style={[styles.taxTriggerName, { flex: 1 }]}>{format(editDate, 'dd MMM yyyy')}</Text>
                <Feather name="chevron-right" size={18} color={C.textSecondary} />
              </TouchableOpacity>

              {/* Items */}
              <Text style={[styles.formLabel, { marginTop: SPACING.lg }]}>Items ({editItems.length})</Text>
              {editItems.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <TextInput
                    style={[styles.formInput, { flex: 2 }]}
                    value={item.name}
                    onChangeText={(v) => handleUpdateItemName(index, v)}
                    multiline
                    blurOnSubmit
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
                    <Feather name="trash-2" size={18} color={C.neutral} />
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
                  placeholderTextColor={C.textSecondary}
                  multiline
                  blurOnSubmit
                />
                <TextInput
                  style={[styles.formInput, { flex: 1, textAlign: 'right' }]}
                  value={newItemAmount}
                  onChangeText={setNewItemAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.textSecondary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
                <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem}>
                  <Feather name="plus" size={18} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Subtotal / Tax summary */}
              {(receipt.subtotal !== undefined || receipt.tax !== undefined) && (
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
                </View>
              )}

              {/* Expense Category */}
              <Text style={[styles.formLabel, { marginTop: SPACING.lg }]}>Expense Category</Text>
              <TouchableOpacity
                style={styles.taxTrigger}
                onPress={() => setCategoryPickerVisible(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.taxTriggerIcon, { backgroundColor: withAlpha(selectedCat?.color || C.accent, 0.12) }]}>
                  <Feather
                    name={(selectedCat?.icon || 'tag') as keyof typeof Feather.glyphMap}
                    size={18}
                    color={selectedCat?.color || C.accent}
                  />
                </View>
                <Text style={[styles.taxTriggerName, { flex: 1 }]}>{selectedCat?.name || 'Select category'}</Text>
                <Feather name="chevron-right" size={18} color={C.textSecondary} />
              </TouchableOpacity>

              {/* Tax Relief */}
              <Text style={[styles.formLabel, { marginTop: SPACING.lg }]}>Tax Relief</Text>
              <TouchableOpacity
                style={styles.taxTrigger}
                onPress={() => setTaxPickerVisible(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.taxTriggerIcon, { backgroundColor: withAlpha(selectedTaxCat.id === 'none' ? C.neutral : C.accent, 0.12) }]}>
                  <Feather
                    name={selectedTaxCat.icon as keyof typeof Feather.glyphMap}
                    size={18}
                    color={selectedTaxCat.id === 'none' ? C.neutral : C.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taxTriggerName}>{selectedTaxCat.name}</Text>
                  {selectedTaxCat.limit !== null && (
                    <Text style={styles.taxTriggerLimit}>limit: RM {selectedTaxCat.limit.toLocaleString()}</Text>
                  )}
                </View>
                <Feather name="chevron-right" size={18} color={C.textSecondary} />
              </TouchableOpacity>

              {/* Payment Method */}
              <Text style={[styles.formLabel, { marginTop: SPACING.lg }]}>Payment Method</Text>
              <TouchableOpacity
                style={styles.taxTrigger}
                onPress={() => setPaymentPickerVisible(true)}
                activeOpacity={0.7}
              >
                <View style={[styles.taxTriggerIcon, { backgroundColor: withAlpha(selectedPayment?.color || C.neutral, 0.12) }]}>
                  <Feather
                    name={(selectedPayment?.icon || 'credit-card') as keyof typeof Feather.glyphMap}
                    size={18}
                    color={selectedPayment?.color || C.neutral}
                  />
                </View>
                <Text style={[styles.taxTriggerName, { flex: 1 }]}>{selectedPayment?.name || 'Select payment method'}</Text>
                <Feather name="chevron-right" size={18} color={C.textSecondary} />
              </TouchableOpacity>

              {/* Location */}
              <Text style={[styles.formLabel, { marginTop: SPACING.lg }]}>Location</Text>
              <TextInput
                style={[styles.formInput, { minHeight: 40, textAlignVertical: 'top' }]}
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder="Store address (optional)"
                placeholderTextColor={C.textSecondary}
                multiline
                blurOnSubmit
              />
            </Card>

            {/* Record Only Toggle */}
            <TouchableOpacity
              style={[styles.recordOnlyToggle, recordOnly && { backgroundColor: withAlpha(C.accent, 0.08), borderColor: C.accent }]}
              onPress={() => setRecordOnly((v) => !v)}
              activeOpacity={0.7}
            >
              <Feather name={recordOnly ? 'check-square' : 'square'} size={18} color={recordOnly ? C.accent : C.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.recordOnlyLabel, recordOnly && { color: C.accent }]}>Record only</Text>
                <Text style={styles.recordOnlyHint}>Save for records / tax relief — no wallet deduction</Text>
              </View>
            </TouchableOpacity>

            {/* Wallet Selection */}
            {!recordOnly && (
              <WalletPicker
                wallets={wallets}
                selectedId={selectedWalletId}
                onSelect={setSelectedWalletId}
                label="Deduct from Wallet"
              />
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <Button
                title={saving ? 'Saving...' : 'Save Receipt'}
                onPress={handleSaveReceipt}
                icon="check-circle"
                style={{ flex: 1 }}
                disabled={saving}
              />
              <Button
                title="Save Draft"
                onPress={handleSaveDraft}
                icon="bookmark"
                variant="secondary"
                style={{ flex: 1 }}
              />
            </View>
            <Button
              title="Split This Bill"
              onPress={handleSplitBill}
              icon="scissors"
              variant="secondary"
              style={{ marginTop: SPACING.sm }}
            />
          </>
        )}
      </KeyboardAwareScrollView>

      {/* Tax Relief Picker Modal */}
      <Modal visible={taxPickerVisible} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setTaxPickerVisible(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setTaxPickerVisible(false)}>
          <View style={styles.dropdownModal} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Tax Relief Category</Text>
              <TouchableOpacity onPress={() => setTaxPickerVisible(false)}>
                <Feather name="x" size={22} color={C.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.taxHeaderSubtitle}>LHDN YA {getYear(editDate)} tax relief</Text>
            <FlatList
              data={MYTAX_CATEGORIES}
              keyExtractor={(item) => item.id}
              renderItem={renderTaxCategoryItem}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Category Picker Modal ── */}
      <Modal visible={categoryPickerVisible} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setCategoryPickerVisible(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setCategoryPickerVisible(false)}>
          <View style={styles.dropdownModal} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Expense Category</Text>
              <TouchableOpacity onPress={() => setCategoryPickerVisible(false)}>
                <Feather name="x" size={22} color={C.textPrimary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={expenseCategories}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
              renderItem={({ item: cat }) => {
                const isSelected = cat.id === editCategory;
                return (
                  <TouchableOpacity
                    style={[styles.taxItem, isSelected && { backgroundColor: withAlpha(cat.color, 0.1) }]}
                    onPress={() => { setEditCategory(cat.id); setCategoryPickerVisible(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.taxItemIcon, { backgroundColor: isSelected ? cat.color : withAlpha(cat.color, 0.15) }]}>
                      <Feather name={cat.icon as keyof typeof Feather.glyphMap} size={18} color={isSelected ? '#fff' : cat.color} />
                    </View>
                    <Text style={[styles.taxItemName, isSelected && { color: cat.color, fontWeight: TYPOGRAPHY.weight.bold }]}>{cat.name}</Text>
                    {isSelected && <Feather name="check" size={18} color={cat.color} />}
                  </TouchableOpacity>
                );
              }}
              ListFooterComponent={
                <TouchableOpacity
                  style={styles.manageLink}
                  onPress={() => { setCategoryPickerVisible(false); setTimeout(() => setCategoryManagerVisible(true), 50); }}
                  activeOpacity={0.6}
                >
                  <Feather name="settings" size={14} color={C.accent} />
                  <Text style={styles.manageLinkText}>manage categories</Text>
                </TouchableOpacity>
              }
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Payment Method Picker Modal ── */}
      <Modal visible={paymentPickerVisible} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setPaymentPickerVisible(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setPaymentPickerVisible(false)}>
          <View style={styles.dropdownModal} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Payment Method</Text>
              <TouchableOpacity onPress={() => setPaymentPickerVisible(false)}>
                <Feather name="x" size={22} color={C.textPrimary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={paymentMethods}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
              renderItem={({ item: pm }) => {
                const isSelected = pm.id === editPaymentMethod;
                return (
                  <TouchableOpacity
                    style={[styles.taxItem, isSelected && { backgroundColor: withAlpha(pm.color, 0.1) }]}
                    onPress={() => { setEditPaymentMethod(pm.id); setPaymentPickerVisible(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.taxItemIcon, { backgroundColor: isSelected ? pm.color : withAlpha(pm.color, 0.15) }]}>
                      <Feather name={pm.icon as keyof typeof Feather.glyphMap} size={18} color={isSelected ? '#fff' : pm.color} />
                    </View>
                    <Text style={[styles.taxItemName, isSelected && { color: pm.color, fontWeight: TYPOGRAPHY.weight.bold }]}>{pm.name}</Text>
                    {isSelected && <Feather name="check" size={18} color={pm.color} />}
                  </TouchableOpacity>
                );
              }}
              ListFooterComponent={
                <TouchableOpacity
                  style={styles.manageLink}
                  onPress={() => { setPaymentPickerVisible(false); setTimeout(() => setPaymentManagerVisible(true), 50); }}
                  activeOpacity={0.6}
                >
                  <Feather name="settings" size={14} color={C.accent} />
                  <Text style={styles.manageLinkText}>manage payment methods</Text>
                </TouchableOpacity>
              }
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Calendar Picker Modal ── */}
      <Modal visible={calendarPickerVisible} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setCalendarPickerVisible(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setCalendarPickerVisible(false)}>
          <View style={styles.dropdownModal} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Date</Text>
              <TouchableOpacity onPress={() => setCalendarPickerVisible(false)}>
                <Feather name="x" size={22} color={C.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: SPACING.lg }}>
              <CalendarPicker
                value={editDate}
                onChange={(d) => { setEditDate(d); setCalendarPickerVisible(false); }}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Full-screen image overlay (inline, not Modal) */}
      {imageViewVisible && imageUri && (
        <View style={styles.imageOverlay}>
          <TouchableOpacity
            style={styles.imageOverlayClose}
            onPress={() => setImageViewVisible(false)}
          >
            <Feather name="x" size={28} color="#fff" />
          </TouchableOpacity>
          <Image
            source={{ uri: imageUri }}
            style={styles.imageOverlayImage}
            resizeMode="contain"
          />
        </View>
      )}

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="scan"
        currentUsage={15 - getRemainingScans()}
      />

      <CategoryManager
        visible={categoryManagerVisible}
        onClose={() => setCategoryManagerVisible(false)}
        type="expense"
      />

      <PaymentMethodManager
        visible={paymentManagerVisible}
        onClose={() => setPaymentManagerVisible(false)}
      />
      <ScreenGuide
        id="guide_receipts"
        title={t.guide.scanReceipts}
        icon="camera"
        tips={[
          t.guide.tipReceipt1,
          t.guide.tipReceipt2,
          t.guide.tipReceipt3,
        ]}
      />
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollContent: {
    padding: SPACING.xl,
    paddingBottom: SPACING['5xl'],
  },

  // ── Hero ──
  heroCard: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
  },
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  heroTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginBottom: SPACING.sm,
  },
  heroSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  scanLimitText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginBottom: SPACING.md,
  },
  captureButtons: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  captureButton: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  captureIcon: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  viewReceiptsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    backgroundColor: C.pillBg,
  },
  viewReceiptsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Draft ──
  draftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.15),
    ...SHADOWS.xs,
  },

  // ── Preview ──
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
    height: 280,
    borderRadius: RADIUS.xl,
    backgroundColor: C.background,
  },

  // ── Thumbnail ──
  thumbnailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.md,
    ...SHADOWS.xs,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: C.background,
    marginRight: SPACING.md,
  },
  thumbnailLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  thumbnailHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
  },

  // ── Loading ──
  loadingCard: {
    paddingVertical: SPACING['3xl'],
    paddingHorizontal: SPACING.xl,
  },
  loadingSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
  },

  // ── Data card ──
  dataCard: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
  },
  formLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.lg,
  },
  formInput: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderWidth: 1,
    borderColor: C.inputBorder,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  addItemBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Summary ──
  summarySection: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  summaryValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  totalRow: {
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    marginTop: SPACING.sm,
  },
  totalLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  totalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  totalCurrency: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  totalInput: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    minWidth: 80,
    textAlign: 'right',
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: C.inputBorder,
  },

  // ── Tax Relief Trigger ──
  taxTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.inputBorder,
  },
  taxTriggerIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  taxTriggerName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  taxTriggerLimit: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginTop: 2,
  },

  // ── Picker Modal (CategoryPicker dropdown style) ──
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  dropdownModal: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    maxHeight: '60%',
    borderWidth: 1,
    borderColor: C.border,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  dropdownTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  taxHeaderSubtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  taxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  taxItemIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taxItemName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  taxItemDesc: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginTop: 1,
  },
  taxLimitBadge: {
    backgroundColor: withAlpha(C.accent, 0.08),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    marginRight: SPACING.sm,
  },
  taxLimitText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    fontVariant: ['tabular-nums'] as any,
  },

  // ── Manage link (inside picker modals) ──
  manageLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  manageLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Record Only Toggle ──
  recordOnlyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: SPACING.md,
  },
  recordOnlyLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  recordOnlyHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },

  // ── Actions ──
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },

  // ── Full-screen image overlay ──
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  imageOverlayClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 101,
    padding: SPACING.sm,
  },
  imageOverlayImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
});

export default ReceiptScanner;
