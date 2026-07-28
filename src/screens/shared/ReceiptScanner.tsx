import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  NativeModules,
  Animated,
  Easing,
  Linking,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
const getDocumentScanner = (): typeof import('react-native-document-scanner-plugin').default | null => {
  try {
    if (!NativeModules.DocumentScanner) return null;
    return require('react-native-document-scanner-plugin').default;
  } catch { return null; }
};
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import ModalToastHost from '../../components/common/ModalToastHost';
import { format, getYear, parse, isValid } from 'date-fns';
import { scanReceipt, isLocalScanResult, isLocalOcrAvailable } from '../../services/receiptScanner';
import { extractReceiptFromRowsFull } from '../../services/localReceiptOcr';
import { enqueueReceipt } from '../../services/receiptQueue';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { toRelativeReceiptPath, resolveReceiptImageUri } from '../../utils/receiptImage';
import NetInfo from '@react-native-community/netinfo';
import { usePersonalStore } from '../../store/personalStore';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useReceiptStore } from '../../store/receiptStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useLearningStore } from '../../store/learningStore';
import { useToast } from '../../context/ToastContext';
import { LinearGradient } from 'expo-linear-gradient';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { MYTAX_CATEGORIES } from '../../constants/taxCategories';
import { TIER_LIMITS } from '../../constants/premium';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import Card from '../../components/common/Card';
import NeuButton from '../../components/common/NeuButton';
import { useNeu } from '../../components/common/neu';
import ScreenGuide from '../../components/common/ScreenGuide';
import PaywallModal from '../../components/common/PaywallModal';
import WalletPicker from '../../components/common/WalletPicker';
import CalendarPicker from '../../components/common/CalendarPicker';
// CollapsibleSection removed — always show content expanded
import SkeletonLoader from '../../components/common/SkeletonLoader';
import CategoryManager from '../../components/common/CategoryManager';
import CategoryIcon from '../../components/common/CategoryIcon';
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
    'dd/MM/yyyy h:mm:ss a', 'dd/MM/yyyy HH:mm:ss',
    'dd/MM/yyyy h:mm a', 'dd/MM/yyyy HH:mm',
    'dd-MM-yyyy h:mm:ss a', 'dd-MM-yyyy HH:mm:ss',
    'dd-MM-yyyy h:mm a', 'dd-MM-yyyy HH:mm',
    'dd/MM/yyyy', 'dd-MM-yyyy', 'dd.MM.yyyy',
    'yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd',
    'dd MMM yyyy', 'dd MMMM yyyy',
    'MM/dd/yyyy',
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
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  // Onyx: faint dark neu across the screen; the picker modals now sit on
  // C.background too, so one default-base accessor covers everything.
  const neu = useNeu(undefined, { faintDark: true });
  const t = useT();
  // ScreenGuide spotlight target — the shutter button (hero state only; the
  // guide falls back to inline points if it can't be measured).
  const guideTargetRef = useRef<any>(null);
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<NavigationProp>();
  // Share-to-Log hands off a shared RECEIPT image here (via navigationRef) so the user
  // reviews items/total/category and saves — nothing is auto-logged for receipts.
  const route = useRoute();
  const sharedParams = route.params as { imageUri?: string; autoScan?: boolean; textRows?: string[] } | undefined;
  const sharedImageUri = sharedParams?.imageUri;
  const sharedAutoScan = sharedParams?.autoScan === true;
  // Share-to-Log TEXT/PDF receipt hand-off: rows already extracted (no image, no OCR).
  const sharedTextRows = sharedParams?.textRows;
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

  const expenseCategories = useMemo(() => getExpenseCategories('personal'), [getExpenseCategories]);

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
  // The learned rule that pre-filled the category, if any — lets the category
  // pill state its reason ("your rule · 4×"). Cleared on manual re-pick/reset.
  const [learnedRule, setLearnedRule] = useState<{ keyword: string; count: number } | null>(null);
  const [editMyTaxCategory, setEditMyTaxCategory] = useState('none');
  const [editLocation, setEditLocation] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  // UI state
  const [taxPickerVisible, setTaxPickerVisible] = useState(false);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [calendarPickerVisible, setCalendarPickerVisible] = useState(false);
  const [categoryManagerVisible, setCategoryManagerVisible] = useState(false);
  const [imageViewVisible, setImageViewVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordOnly, setRecordOnly] = useState(false);

  // Cold-start hydration: wallets often populate from storage AFTER this mounts,
  // so the initial selectedWalletId lands as null and the expense saves with no
  // walletId. Once wallets arrive and nothing is selected, adopt the default.
  useEffect(() => {
    if (selectedWalletId || wallets.length === 0) return;
    const def = wallets.find((w) => w.isDefault) || wallets[0];
    if (def) setSelectedWalletId(def.id);
  }, [wallets, selectedWalletId]);

  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const scanPulseAnim = useRef(new Animated.Value(0.4)).current;

  // Set true right before any *intentional* leave (save / save-draft) so the
  // back-guard below doesn't also stash a duplicate draft.
  const leavingCleanlyRef = useRef(false);

  useEffect(() => {
    if (!loading) {
      scanLineAnim.setValue(0);
      scanPulseAnim.setValue(0.4);
      return;
    }
    const line = Animated.loop(
      Animated.timing(scanLineAnim, {
        toValue: 1,
        duration: 2400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scanPulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scanPulseAnim, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    line.start();
    pulse.start();
    return () => { line.stop(); pulse.stop(); };
  }, [loading]);

  // Always-fresh snapshot of the in-progress receipt for the back-guard, so the
  // listener doesn't re-subscribe on every keystroke.
  const backupRef = useRef({ editTitle, editVendor, editItems, editTotal, editDate, editCategory, editMyTaxCategory, editLocation, imageUri, receipt });
  backupRef.current = { editTitle, editVendor, editItems, editTotal, editDate, editCategory, editMyTaxCategory, editLocation, imageUri, receipt };

  // Auto-save a draft if the user leaves (back button / swipe-back) mid-scan
  // without saving — accidental back never loses scanned work. Resume via the
  // "continue draft" card on the home view. Mirrors DebtTracking's draft stash.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      if (leavingCleanlyRef.current) return;
      const s = backupRef.current;
      // A picked-but-not-yet-scanned photo is NOT work — only extracted/entered
      // data counts, so we never stash a junk image-only draft on accidental back.
      const hasWork = !!s.receipt || s.editItems.length > 0 || !!s.editTotal.trim() || !!s.editTitle.trim();
      if (!hasWork) return;
      saveDraft({
        title: s.editTitle,
        vendor: s.editVendor,
        items: s.editItems,
        total: s.editTotal,
        date: s.editDate,
        category: s.editCategory,
        myTaxCategory: s.editMyTaxCategory,
        location: s.editLocation,
        imageUri: s.imageUri,
      });
      showToast(t.receipts.draftSaved, 'success');
    });
    return unsub;
  }, [navigation, saveDraft, showToast, t]);

  const selectedTaxCat = useMemo(
    () => MYTAX_CATEGORIES.find((c) => c.id === editMyTaxCategory) || MYTAX_CATEGORIES[0],
    [editMyTaxCategory]
  );
  const selectedCat = useMemo(
    () => expenseCategories.find((c) => c.id === editCategory),
    [expenseCategories, editCategory]
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
    setEditLocation(d.location);
    if (d.imageUri) setImageUri(d.imageUri);
    setReceipt({ items: d.items, total: parseFloat(d.total) } as ExtractedReceipt);
  }, []);

  // Returns granted state; when permanently denied (system won't prompt again),
  // surfaces a 2-button alert that deep-links into the OS Settings app so the
  // user isn't stuck on a silently-failing button.
  const requestPermission = async (type: 'camera' | 'gallery', deniedMsg: string) => {
    const res = type === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (res.status === 'granted') return true;
    if (res.canAskAgain === false) {
      Alert.alert(
        t.receipts.permissionRequired,
        deniedMsg,
        [
          { text: t.common.cancel, style: 'cancel' },
          { text: t.receipts.openSettings, onPress: () => { Linking.openSettings(); } },
        ],
      );
    } else {
      Alert.alert(t.receipts.permissionRequired, deniedMsg);
    }
    return false;
  };

  const handleTakePhoto = useCallback(async () => {
    let scannedUri: string | null = null;
    const scanner = getDocumentScanner();
    if (scanner) {
      try {
        const result = await scanner.scanDocument({ maxNumDocuments: 1 });
        if (result.scannedImages && result.scannedImages.length > 0) {
          scannedUri = result.scannedImages[0];
        } else {
          // Scanner opened and the user cancelled / captured nothing. Respect that —
          // do NOT fall through to a SECOND (ImagePicker) camera, which made the
          // camera appear to open twice.
          return;
        }
      } catch {
        /* scanner genuinely unavailable/errored → fall back to the ImagePicker camera */
      }
    }
    if (scannedUri) {
      setImageUri(scannedUri);
      setReceipt(null);
    } else {
      const granted = await requestPermission('camera', t.receipts.cameraPermissionMsg);
      if (!granted) return;
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
    const granted = await requestPermission('gallery', t.receipts.galleryPermissionMsg);
    if (!granted) return;
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
    // Out of monthly AI scans: fall back to the free on-device reader instead of
    // paywalling — but only when this build actually ships it. Otherwise paywall.
    const outOfScans = !canScanReceipt();
    if (outOfScans && !isLocalOcrAvailable()) {
      setPaywallVisible(true);
      return;
    }
    setLoading(true);
    try {
      const extracted = await scanReceipt(imageUri, { localOnly: outOfScans });
      if (!extracted || !(extracted.total > 0) || !Array.isArray(extracted.items)) {
        throw new Error(t.receipts.noUsableData);
      }
      // On-device OCR (offline OR out of scans) — free: never burns the monthly
      // AI scan quota, and the user is told to double-check what it read.
      const wasLocalScan = isLocalScanResult(extracted);
      if (!wasLocalScan) incrementScanCount();
      setReceipt(extracted);
      setEditVendor(extracted.vendor || '');
      setEditTitle(extracted.vendor || '');
      setEditItems([...extracted.items]);
      setEditTotal(extracted.total.toFixed(2));
      setEditDate(parseReceiptDate(extracted.date));
      // Notebook first: a merchant the user corrected before (count ≥ 2) beats
      // the AI's generic guess — and the pill will cite the rule ("your rule · n×").
      const learnedCat = useLearningStore.getState().getCategorySuggestion(extracted.vendor || '');
      setLearnedRule(learnedCat);
      setEditCategory(learnedCat?.category || extracted.suggestedExpenseCategory || 'other');
      setEditMyTaxCategory(extracted.suggestedTaxCategory || 'none');
      setEditLocation(extracted.location || '');
      // Local scan fired either because we're out of scans (limit) or offline —
      // tell the user which, so "double-check the numbers" makes sense.
      const localMsg = outOfScans ? t.settings.scanLimitBackupUsed : t.settings.scanOfflineUsed;
      showToast(wasLocalScan ? localMsg : t.receipts.receiptExtracted, wasLocalScan ? 'info' : 'success');
    } catch (error: any) {
      // If offline, queue the image for retry instead of just failing.
      try {
        const net = await NetInfo.fetch();
        const offline = !net.isConnected || net.isInternetReachable === false;
        if (offline && imageUri) {
          // Still queue for a proper AI scan when back online (existing safety
          // net) — but if this build HAS on-device OCR, it already had its shot
          // inside the service and couldn't read this receipt, so tell the
          // user manual entry is the way to get it recorded now.
          await enqueueReceipt(imageUri);
          if (isLocalOcrAvailable()) {
            showToast(t.settings.scanOfflineFailed, 'error');
          } else {
            Alert.alert(
              t.receipts.savedForLater,
              t.receipts.offlineQueuedMsg,
            );
          }
          return;
        }
      } catch {
        // fall through to generic alert
      }
      Alert.alert(t.receipts.extractionFailed, error.message || t.receipts.extractionFailedMsg);
    } finally {
      setLoading(false);
    }
  }, [imageUri, canScanReceipt, incrementScanCount, showToast]);

  // Share-to-Log receipt hand-off: load the shared image into state, then auto-run the scan
  // ONCE so the screen opens straight into the review flow (identical local/AI path a gallery
  // pick takes). Two effects because setImageUri is async — the extract must wait until the
  // shared image is actually in `imageUri`. Refs make each step fire exactly once.
  const autoImageLoadedRef = useRef(false);
  const autoExtractRef = useRef(false);
  useEffect(() => {
    if (!sharedImageUri || autoImageLoadedRef.current) return;
    autoImageLoadedRef.current = true;
    setImageUri(sharedImageUri);
    setReceipt(null);
  }, [sharedImageUri]);
  useEffect(() => {
    if (!sharedAutoScan || autoExtractRef.current) return;
    if (imageUri && imageUri === sharedImageUri && !receipt) {
      autoExtractRef.current = true;
      void handleExtract();
    }
  }, [sharedAutoScan, imageUri, sharedImageUri, receipt, handleExtract]);

  // Share-to-Log TEXT/PDF receipt: the rows are already extracted (no image, no OCR, no
  // scan-quota cost). Prefill the SAME review state the scan path fills. Runs once.
  const autoRowsRef = useRef(false);
  useEffect(() => {
    if (!sharedTextRows || sharedTextRows.length === 0 || autoRowsRef.current) return;
    autoRowsRef.current = true;
    const extracted = extractReceiptFromRowsFull(sharedTextRows);
    if (!(extracted.total > 0)) return; // nothing usable — leave the manual screen
    setReceipt(extracted);
    setEditVendor(extracted.vendor || '');
    setEditTitle(extracted.vendor || '');
    setEditItems([...extracted.items]);
    setEditTotal(extracted.total.toFixed(2));
    setEditDate(parseReceiptDate(extracted.date));
    // Notebook first — same rule as the scan path above.
    const learnedCat = useLearningStore.getState().getCategorySuggestion(extracted.vendor || '');
    setLearnedRule(learnedCat);
    setEditCategory(learnedCat?.category || extracted.suggestedExpenseCategory || 'other');
    setEditMyTaxCategory(extracted.suggestedTaxCategory || 'none');
    setEditLocation(extracted.location || '');
    // Local read (offline + quota-free) — same "double-check the numbers" notice.
    showToast(t.settings.scanOfflineUsed, 'info');
  }, [sharedTextRows]);

  const handleReset = useCallback(() => {
    setImageUri(null);
    setReceipt(null);
    setEditTitle('');
    setEditVendor('');
    setEditItems([]);
    setEditTotal('');
    setEditDate(new Date());
    setEditCategory('other');
    setLearnedRule(null);
    setEditMyTaxCategory('none');
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
      showToast(t.receipts.enterItemNameAmount, 'error');
      return;
    }
    const amount = parseFloat(newItemAmount);
    setEditItems([...editItems, { name: newItemName.trim(), amount }]);
    setEditTotal((parseFloat(editTotal) + amount).toFixed(2));
    setNewItemName('');
    setNewItemAmount('');
  }, [newItemName, newItemAmount, editItems, editTotal, showToast]);

  const saveLockRef = useRef(false);
  const handleSaveReceipt = useCallback(async () => {
    if (saveLockRef.current) return;
    const total = parseFloat(editTotal);
    if (!total || total <= 0) {
      showToast(t.receipts.enterValidTotal, 'error');
      return;
    }

    saveLockRef.current = true;
    setSaving(true);
    let persistedUri: string | undefined;
    let txId: string | undefined;
    try {
      const title = editTitle.trim() || editVendor.trim() || t.receipts.receiptFallbackName;
      const description = title;

      // 1. Create transaction (using original imageUri; we'll update with persisted URI below)
      if (!recordOnly) {
        txId = addTransaction({
          amount: total,
          category: editCategory,
          description,
          date: editDate,
          type: 'expense',
          mode,
          walletId: selectedWalletId || undefined,
          receiptUrl: imageUri || undefined,
          inputMethod: 'photo',
        });

        // 2. Wallet deduction
        if (selectedWalletId) {
          deductFromWallet(selectedWalletId, total);
        }
      }

      // 3. Persist image only after critical writes succeed.
      // SCALE-H8: compress at storage time (~600 KB → ~150 KB per receipt).
      // Keeps documentDirectory growth bounded for users who scan weekly.
      if (imageUri) {
        try {
          const dir = `${FileSystem.documentDirectory}receipts/`;
          const dirInfo = await FileSystem.getInfoAsync(dir);
          if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
          const filename = `receipt_${Date.now()}.jpg`;
          const target = dir + filename;
          try {
            const compressed = await manipulateAsync(
              imageUri,
              [{ resize: { width: 1280 } }],
              { compress: 0.8, format: SaveFormat.JPEG }
            );
            await FileSystem.copyAsync({ from: compressed.uri, to: target });
          } catch {
            // Compression failed — fall back to raw copy so the receipt is never lost
            await FileSystem.copyAsync({ from: imageUri, to: target });
          }
          // Persist RELATIVE to documentDirectory — iOS rewrites the sandbox
          // container path on every install/update, so an absolute file:// URI
          // goes stale. Render sites resolve back via resolveReceiptImageUri.
          persistedUri = toRelativeReceiptPath(target);
          if (txId) {
            updateTransaction(txId, { receiptUrl: persistedUri });
          }
        } catch {
          // Keep original URI as fallback
          persistedUri = toRelativeReceiptPath(imageUri);
        }
      }

      // 4. Save receipt
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
        location: editLocation || undefined,
        walletId: recordOnly ? undefined : (selectedWalletId || undefined),
        imageUri: persistedUri,
        verified: true,
        transactionId: txId,
        year: getYear(editDate),
      });

      // Teach the notebook: the reviewed category is the user's confirmation/
      // correction — the richest learning signal in the app. Vendor is the
      // recurring keyword (title as fallback); trusted after the 2nd save.
      const learnKeyword = (editVendor || title).trim();
      if (learnKeyword && editCategory) {
        useLearningStore.getState().learnCategory(learnKeyword, editCategory);
      }

      clearDraft();
      leavingCleanlyRef.current = true;
      showToast(t.receipts.receiptSaved, 'success');
      navigation.goBack();
    } catch (err: any) {
      // Roll back partial writes. deleteTransaction owns the wallet refund (it
      // reverses the deduction from step 2) — do NOT also addToWallet here.
      if (txId) {
        try { usePersonalStore.getState().deleteTransaction(txId); } catch {}
      }
      if (persistedUri && persistedUri !== imageUri) {
        const abs = resolveReceiptImageUri(persistedUri);
        if (abs) { try { await FileSystem.deleteAsync(abs, { idempotent: true }); } catch {} }
      }
      Alert.alert(t.receipts.saveFailed, err?.message || t.receipts.saveFailedMsg);
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  }, [
    editTotal, editTitle, editVendor, editCategory, editDate, editMyTaxCategory,
    editLocation, editItems, receipt, selectedWalletId,
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
      location: editLocation,
      imageUri,
    });
    showToast(t.receipts.draftSaved, 'success');
    leavingCleanlyRef.current = true;
    handleReset();
    navigation.goBack();
  }, [editTitle, editVendor, editItems, editTotal, editDate, editCategory, editMyTaxCategory, editLocation, imageUri, saveDraft, showToast, handleReset, navigation]);

  const handleSplitBill = () => {
    const total = parseFloat(editTotal);
    if (!total || total <= 0) {
      showToast(t.receipts.enterValidTotal, 'error');
      return;
    }
    setTimeout(() => {
      navigation.navigate('DebtTracking', {
        receiptData: {
          vendor: editTitle || editVendor || t.receipts.receiptScanFallbackName,
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
        <View style={[styles.taxItemIcon, neu.well, { backgroundColor: isSelected ? itemColor : withAlpha(itemColor, 0.15) }]}>
          <CategoryIcon
            icon={item.icon}
            size={18}
            color={isSelected ? C.onAccent : itemColor}
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
  }, [editMyTaxCategory, C, styles, neu]); // neu: rebuilt on theme change, same as styles/C

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ══════════════════════════════════════════════════════
            STATE 1: Capture (no image)
            ══════════════════════════════════════════════════════ */}
        {!imageUri && (
          <Card style={[styles.heroCard, neu.raisedSoft, { borderWidth: 0 }]}>
            <Text style={styles.heroTitle}>{t.receipts.saveReceiptTitle}</Text>
            <Text style={styles.heroSubtitle}>
              {t.receipts.saveReceiptSubtitle}
            </Text>

            {/* Shutter button */}
            <View style={styles.shutterRing}>
              <TouchableOpacity
                ref={guideTargetRef}
                style={[styles.shutterButton, neu.raised, { backgroundColor: C.accent }]}
                onPress={handleTakePhoto}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.receipts.takePhotoLabel}
              >
                <Feather name="camera" size={28} color={C.onAccent} />
              </TouchableOpacity>
            </View>

            {/* Gallery link */}
            <TouchableOpacity
              style={styles.galleryLink}
              onPress={handlePickImage}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={t.receipts.fromGallery}
            >
              <Feather name="image" size={16} color={C.accent} />
              <Text style={styles.galleryLinkText}>{t.receipts.fromGallery}</Text>
            </TouchableOpacity>

            {Number.isFinite(TIER_LIMITS[tier].maxScansPerMonth) && (
              <Text style={styles.scanLimitText}>
                {getRemainingScans() > 0
                  ? `${getRemainingScans()} ${t.receipts.scansRemaining}`
                  : isLocalOcrAvailable()
                    ? t.receipts.scansOutBackup
                    : `0 ${t.receipts.scansRemaining}`}
              </Text>
            )}

          </Card>
        )}

        {/* View receipts link — outside card, between card and draft */}
        {!imageUri && !receipt && (
          <TouchableOpacity
            style={styles.viewReceiptsLink}
            onPress={() => navigation.navigate('ReceiptHistory')}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t.receipts.viewMyReceipts}
          >
            <Feather name="archive" size={14} color={C.textSecondary} />
            <Text style={styles.viewReceiptsText}>{t.receipts.viewMyReceipts}</Text>
          </TouchableOpacity>
        )}

        {/* Draft card */}
        {!imageUri && !receipt && draft && (
          <TouchableOpacity
            style={[styles.draftCard, neu.raisedSoft]}
            onPress={handleLoadDraft}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.receipts.continueDraft}
          >
            <View style={[styles.draftIcon, neu.well, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
              <Feather name="bookmark" size={18} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.draftTitle}>{t.receipts.continueDraft}</Text>
              <Text style={styles.draftHint}>
                {draft.title || t.receipts.untitled} · {currency} {draft.total}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={C.textSecondary} />
          </TouchableOpacity>
        )}

        {/* ══════════════════════════════════════════════════════
            STATE 2: Preview (image taken, no extraction)
            ══════════════════════════════════════════════════════ */}
        {imageUri && !receipt && !loading && (
          <View>
            <View style={styles.previewImageWrap}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
              <TouchableOpacity
                style={styles.previewCloseBtn}
                onPress={handleReset}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t.receipts.removeImageA11y}
              >
                <Feather name="x" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
            <NeuButton
              label={t.receipts.extractWithAi}
              onPress={handleExtract}
              icon="cpu"
              style={styles.extractButton}
              accessibilityLabel={t.receipts.extractWithAi}
            />
          </View>
        )}

        {/* ══════════════════════════════════════════════════════
            STATE 3: Loading
            ══════════════════════════════════════════════════════ */}
        {loading && (
          <View>
            {imageUri && (
              <View style={styles.loadingImageWrap}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
                <View style={styles.loadingImageDim} />
                <Animated.View
                  style={[
                    styles.scanLine,
                    {
                      transform: [{
                        translateY: scanLineAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 280],
                        }),
                      }],
                    },
                  ]}
                />
              </View>
            )}
            <Animated.View style={[styles.loadingTextWrap, { opacity: scanPulseAnim }]}>
              <Feather name="cpu" size={16} color={C.accent} />
              <Text style={styles.loadingSubtext}>{t.receipts.aiExtracting}</Text>
            </Animated.View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════
            STATE 4: Extracted Form — fintech-grade review
            ══════════════════════════════════════════════════════ */}
        {receipt && !loading && (
          <>
            {/* 1. Receipt Image Banner */}
            {imageUri && (
              <View style={styles.bannerWrap}>
                <TouchableOpacity
                  onPress={() => setImageViewVisible(true)}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel={t.receipts.viewFullImageA11y}
                  style={styles.bannerTouchable}
                >
                  <Image source={{ uri: imageUri }} style={styles.bannerImage} resizeMode="cover" />
                  <LinearGradient
                    colors={['transparent', withAlpha(C.dimBg, 0.55)]}
                    style={styles.bannerGradient}
                  >
                    <View style={styles.bannerBadge}>
                      <Feather name="maximize-2" size={12} color="#fff" />
                      <Text style={styles.bannerBadgeText}>{t.receipts.tapToViewFullSize}</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bannerCloseBtn}
                  onPress={handleReset}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.receipts.removeImageA11y}
                >
                  <Feather name="x" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* 2. Hero Total Section */}
            <View style={styles.heroTotal}>
              <View style={styles.heroAmountRow}>
                <Text style={styles.heroCurrencyPrefix}>{currency}</Text>
                <TextInput
                  style={styles.heroAmountInput}
                  value={editTotal}
                  onChangeText={setEditTotal}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  accessibilityLabel={t.receipts.totalLabel}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
                />
              </View>
              <View style={styles.heroMetaRow}>
                <View style={styles.heroVendorWrap}>
                  <Feather name="shopping-bag" size={14} color={C.textSecondary} />
                  <TextInput
                    style={styles.heroVendorInput}
                    value={editTitle}
                    onChangeText={(v) => { setEditTitle(v); setEditVendor(v); }}
                    placeholder={t.receipts.titlePlaceholder}
                    placeholderTextColor={C.textMuted}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    accessibilityLabel={t.receipts.title}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={withAlpha(C.accent, 0.25)}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.heroDatePill, neu.raised]}
                  onPress={() => setCalendarPickerVisible(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t.receipts.dateLabel}
                >
                  <Feather name="calendar" size={13} color={C.accent} />
                  <Text style={styles.heroDateText}>{format(editDate, 'dd MMM')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 3. Classification Pills Row */}
            <View style={styles.pillsRow}>
              {/* Category pill */}
              <TouchableOpacity
                style={[
                  styles.classificationPill,
                  neu.raised,
                  selectedCat?.color ? { borderColor: withAlpha(selectedCat.color, 0.3) } : undefined,
                ]}
                onPress={() => setCategoryPickerVisible(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.receipts.expenseCategory}
              >
                <CategoryIcon
                  icon={selectedCat?.icon || 'tag'}
                  size={14}
                  color={selectedCat?.color || C.textSecondary}
                />
                <Text style={styles.pillText}>{selectedCat?.name || t.receipts.selectCategory}</Text>
              </TouchableOpacity>

              {/* Tax pill */}
              <TouchableOpacity
                style={[
                  styles.classificationPill,
                  neu.raised,
                  selectedTaxCat.id !== 'none' ? { borderColor: withAlpha(C.accent, 0.3) } : undefined,
                ]}
                onPress={() => setTaxPickerVisible(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.receipts.taxRelief}
              >
                <CategoryIcon
                  icon={selectedTaxCat.icon}
                  size={14}
                  color={selectedTaxCat.id === 'none' ? C.textSecondary : C.accent}
                />
                <Text style={styles.pillText}>{selectedTaxCat.name}</Text>
              </TouchableOpacity>

            </View>

            {/* "Sebab you ajar" — the category pill came from the user's own
                notebook rule; say so (MAKIN_KENAL §8.4). */}
            {learnedRule && (
              <Text style={styles.learnedReason}>
                {t.common.learnedRuleReason.replace('{n}', String(learnedRule.count))}
              </Text>
            )}

            {/* 4. Items Card */}
            <Card style={[styles.itemsCard, neu.raisedSoft, { borderWidth: 0 }]}>
              <View style={styles.itemsHeader}>
                <Text style={styles.itemsSectionLabel}>{t.receipts.itemsLabel}</Text>
                <View style={[styles.itemsCountBadge, neu.raised]}>
                  <Text style={styles.itemsCountText}>{editItems.length}</Text>
                </View>
              </View>

              {editItems.map((item, index) => (
                <View key={index}>
                  {index > 0 && <View style={styles.itemDivider} />}
                  <View style={styles.itemRow}>
                    <TextInput
                      style={styles.itemNameInput}
                      value={item.name}
                      onChangeText={(v) => handleUpdateItemName(index, v)}
                      multiline
                      blurOnSubmit
                      accessibilityLabel={`${t.receipts.itemsLabel} ${index + 1}`}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={withAlpha(C.accent, 0.25)}
                    />
                    <TextInput
                      style={styles.itemAmountInput}
                      value={item.amount.toFixed(2)}
                      onChangeText={(v) => handleUpdateItemAmount(index, v)}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      accessibilityLabel={`${t.receipts.itemsLabel} ${index + 1} amount`}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={withAlpha(C.accent, 0.25)}
                    />
                    <TouchableOpacity
                      onPress={() => handleRemoveItem(index)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={t.receipts.removeItemA11y}
                      style={styles.itemRemoveBtn}
                    >
                      <Feather name="x" size={15} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Add new item row */}
              <View style={styles.itemDivider} />
              <View style={styles.itemRow}>
                <TextInput
                  style={[styles.itemNameInput, styles.itemPlaceholderInput]}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  placeholder={t.receipts.newItemPlaceholder}
                  placeholderTextColor={C.textMuted}
                  multiline
                  blurOnSubmit
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
                />
                <TextInput
                  style={[styles.itemAmountInput, styles.itemPlaceholderInput]}
                  value={newItemAmount}
                  onChangeText={setNewItemAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
                />
                <TouchableOpacity
                  style={[styles.addItemBtn, neu.raised, { backgroundColor: C.accent }]}
                  onPress={handleAddItem}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.receipts.addItemA11y}
                >
                  <Feather name="plus" size={14} color={C.onAccent} />
                </TouchableOpacity>
              </View>

              {/* Subtotal / Tax summary */}
              {(receipt.subtotal !== undefined || receipt.tax !== undefined) && (
                <View style={styles.summarySection}>
                  {receipt.subtotal !== undefined && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t.receipts.subtotal}</Text>
                      <Text style={styles.summaryValue}>{currency} {receipt.subtotal.toFixed(2)}</Text>
                    </View>
                  )}
                  {receipt.tax !== undefined && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t.receipts.tax}</Text>
                      <Text style={styles.summaryValue}>{currency} {receipt.tax.toFixed(2)}</Text>
                    </View>
                  )}
                </View>
              )}
            </Card>

            {/* 5. Details Card */}
            <Card style={[styles.detailsCard, neu.raisedSoft, { borderWidth: 0 }]}>
              {/* Location row */}
              <View style={styles.detailRow}>
                <Feather name="map-pin" size={16} color={C.textSecondary} />
                <TextInput
                  style={styles.detailInput}
                  value={editLocation}
                  onChangeText={setEditLocation}
                  placeholder={t.receipts.locationPlaceholder}
                  placeholderTextColor={C.textMuted}
                  multiline
                  blurOnSubmit
                  accessibilityLabel={t.receipts.location}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
                />
              </View>

              <View style={styles.detailDivider} />

              {/* Record-only toggle */}
              <TouchableOpacity
                style={styles.detailRow}
                onPress={() => setRecordOnly((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: recordOnly }}
                accessibilityLabel={t.receipts.recordOnly}
              >
                <Feather
                  name={recordOnly ? 'check-square' : 'square'}
                  size={16}
                  color={recordOnly ? C.accent : C.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, recordOnly && { color: C.accent }]}>{t.receipts.recordOnly}</Text>
                  <Text style={styles.detailHint}>{t.receipts.recordOnlyHint}</Text>
                </View>
              </TouchableOpacity>
            </Card>

            {/* 6. Wallet Picker */}
            {!recordOnly && (
              <WalletPicker
                wallets={wallets}
                selectedId={selectedWalletId}
                onSelect={setSelectedWalletId}
                label={t.receipts.paidFromWallet}
              />
            )}

            {/* 7. Save Actions */}
            <NeuButton
              label={saving ? t.receipts.savingEllipsis : t.receipts.saveReceiptBtn}
              onPress={handleSaveReceipt}
              icon="check"
              style={styles.saveButton}
              disabled={saving}
              accessibilityLabel={t.receipts.saveReceiptA11y}
            />
            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={styles.secondaryLink}
                onPress={handleSaveDraft}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={t.receipts.saveDraftA11y}
              >
                <Feather name="bookmark" size={16} color={C.textSecondary} />
                <Text style={styles.secondaryLinkText}>{t.receipts.saveDraft}</Text>
              </TouchableOpacity>
              <View style={styles.secondaryDot} />
              <TouchableOpacity
                style={styles.secondaryLink}
                onPress={handleSplitBill}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={t.receipts.splitBillA11y}
              >
                <Feather name="scissors" size={16} color={C.textSecondary} />
                <Text style={styles.secondaryLinkText}>{t.receipts.splitThisBill}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAwareScrollView>

      {/* Tax Relief Picker Modal */}
      <Modal visible={taxPickerVisible} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setTaxPickerVisible(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setTaxPickerVisible(false)}>
          <View style={[styles.dropdownModal, SHADOWS.lg]} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>{t.receipts.taxReliefCategory}</Text>
              <TouchableOpacity
                onPress={() => setTaxPickerVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t.receipts.closePickerA11y}
              >
                <Feather name="x" size={22} color={C.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.taxHeaderSubtitle}>{t.receipts.lhdnYaPrefix} {getYear(editDate)} {t.receipts.lhdnYaSuffix}</Text>
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
        <ModalToastHost />
      </Modal>

      {/* ── Category Picker Modal ── */}
      <Modal visible={categoryPickerVisible} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setCategoryPickerVisible(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setCategoryPickerVisible(false)}>
          <View style={[styles.dropdownModal, SHADOWS.lg]} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>{t.receipts.expenseCategory}</Text>
              <TouchableOpacity
                onPress={() => setCategoryPickerVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t.receipts.closePickerA11y}
              >
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
                    onPress={() => { setEditCategory(cat.id); setLearnedRule(null); setCategoryPickerVisible(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.taxItemIcon, neu.well, { backgroundColor: isSelected ? cat.color : withAlpha(cat.color, 0.15) }]}>
                      <CategoryIcon icon={cat.icon} size={18} color={isSelected ? C.onAccent : cat.color} />
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
                  <Text style={styles.manageLinkText}>{t.receipts.manageCategories}</Text>
                </TouchableOpacity>
              }
            />
          </View>
        </TouchableOpacity>
        <ModalToastHost />
      </Modal>

      {/* ── Calendar Picker Modal ── */}
      <Modal visible={calendarPickerVisible} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setCalendarPickerVisible(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setCalendarPickerVisible(false)}>
          <View style={[styles.dropdownModal, SHADOWS.lg]} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>{t.receipts.dateLabel}</Text>
              <TouchableOpacity
                onPress={() => setCalendarPickerVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t.receipts.closePickerA11y}
              >
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
        <ModalToastHost />
      </Modal>

      {/* Full-screen image overlay — a real Modal so the dim covers the header and status
          bar too (position:absolute stopped below the "Save Receipt" title). */}
      {imageViewVisible && imageUri && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setImageViewVisible(false)}>
          <View style={[styles.imageOverlay, { paddingTop: insets.top + 48 }]}>
            <TouchableOpacity
              style={[styles.imageOverlayClose, { top: insets.top + 12 }]}
              onPress={() => setImageViewVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t.receipts.closePickerA11y}
            >
              <Feather name="x" size={28} color="#fff" />
            </TouchableOpacity>
            <Image
              source={{ uri: imageUri }}
              style={styles.imageOverlayImage}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="scan"
        currentUsage={TIER_LIMITS[tier].maxScansPerMonth - getRemainingScans()}
      />

      <CategoryManager
        visible={categoryManagerVisible}
        onClose={() => setCategoryManagerVisible(false)}
        type="expense"
      />

      <ScreenGuide
        id="guide_receipts"
        accent="#6BA3BE"
        steps={[
          {
            kind: 'intro',
            icon: 'camera',
            title: t.guide.scanReceipts,
            body: t.guide.descReceipt,
            points: [
              { icon: 'camera', text: t.guide.receiptPoint1 },
              { icon: 'check', text: t.guide.receiptPoint2 },
            ],
          },
          { kind: 'spotlight', targetRef: guideTargetRef, label: t.guide.receiptPoint1, sublabel: t.guide.receiptPoint2 },
          { kind: 'payoff', icon: 'check-circle', title: t.guide.receiptPayoffTitle, body: t.guide.receiptPayoffBody },
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

  // ══════════════════════════════════════════════════════════
  // STATE 1: Capture
  // ══════════════════════════════════════════════════════════
  heroCard: {
    alignItems: 'center',
    paddingVertical: SPACING['4xl'],
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
    lineHeight: TYPOGRAPHY.size.sm * TYPOGRAPHY.lineHeight.normal,
    marginBottom: SPACING['3xl'],
    paddingHorizontal: SPACING.xl,
  },
  shutterRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: withAlpha(C.accent, 0.2),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  galleryLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  scanLimitText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    letterSpacing: 0.2,
    marginBottom: SPACING.md,
  },
  viewReceiptsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  viewReceiptsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },

  // ── Draft ──
  draftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.md,
    // bg + shadow come from neu.raisedSoft spread at the call site
  },
  draftIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  draftTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    letterSpacing: 0.2,
  },
  draftHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    letterSpacing: 0.2,
    marginTop: SPACING.xs / 2,
  },

  // ══════════════════════════════════════════════════════════
  // STATE 2: Preview
  // ══════════════════════════════════════════════════════════
  previewImageWrap: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: RADIUS.xl,
    backgroundColor: C.background,
  },
  previewCloseBtn: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extractButton: {
    marginTop: SPACING.sm,
  },

  // ══════════════════════════════════════════════════════════
  // STATE 3: Loading
  // ══════════════════════════════════════════════════════════
  loadingImageWrap: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  loadingImageDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(C.background, 0.3),
    borderRadius: RADIUS.xl,
  },
  scanLine: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.md,
    right: SPACING.md,
    height: 2,
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
    opacity: 0.6,
  },
  loadingTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
  },
  loadingSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    letterSpacing: 0.2,
  },

  // ══════════════════════════════════════════════════════════
  // STATE 4: Extracted Form
  // ══════════════════════════════════════════════════════════

  // ── 1. Receipt Image Banner ──
  bannerWrap: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: C.surface,
    marginBottom: SPACING.xl,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  bannerTouchable: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: 180,
  },
  bannerGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  bannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  bannerBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: '#fff',
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  bannerCloseBtn: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 2. Hero Total ──
  heroTotal: {
    marginBottom: SPACING.lg,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  heroCurrencyPrefix: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textSecondary,
    marginRight: SPACING.xs,
  },
  heroAmountInput: {
    fontSize: 40,
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: -1,
    textAlign: 'center',
    minWidth: 120,
    paddingVertical: SPACING.xs,
  },
  heroMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  heroVendorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.xs,
    marginRight: SPACING.md,
  },
  heroVendorInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    flex: 1,
    paddingVertical: SPACING.xs,
  },
  heroDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    // bg + shadow come from neu.raised spread at the call site
  },
  heroDateText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
    letterSpacing: 0.2,
  },

  // ── 3. Classification Pills ──
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  classificationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  pillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    letterSpacing: 0.2,
  },
  learnedReason: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.lg,
    marginLeft: SPACING.xs,
  },

  // ── 4. Items Card ──
  itemsCard: {
    marginBottom: SPACING.md,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  itemsSectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  itemsCountBadge: {
    backgroundColor: C.pillBg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2, // 2px — tight badge around count
    borderRadius: RADIUS.full,
  },
  itemsCountText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  itemDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
  },
  itemNameInput: {
    flex: 2,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
  },
  itemAmountInput: {
    flex: 0,
    minWidth: 72,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    textAlign: 'right',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  itemPlaceholderInput: {
    color: C.textMuted,
  },
  itemRemoveBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.xs,
  },
  addItemBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.xs,
  },

  // ── Summary ──
  summarySection: {
    marginTop: SPACING.md,
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
    letterSpacing: 0.2,
  },
  summaryValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },

  // ── 5. Details Card ──
  detailsCard: {
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  detailInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
  },
  detailLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    letterSpacing: 0.2,
  },
  detailHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    letterSpacing: 0.2,
    marginTop: 1,
  },

  // ── 7. Save Actions ──
  saveButton: {
    marginTop: SPACING.xl,
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xl,
    marginTop: SPACING.md,
    marginBottom: SPACING['3xl'],
  },
  secondaryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  secondaryLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  secondaryDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.border,
  },

  // ══════════════════════════════════════════════════════════
  // Picker Modals (preserved — shared across all states)
  // ══════════════════════════════════════════════════════════
  dropdownOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.4),
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  dropdownModal: {
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    maxHeight: '60%',
    // Onyx: C.background dialog on the 0.4 scrim; flat SHADOWS.lg shell at the call site.
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
    letterSpacing: -0.3,
  },
  taxHeaderSubtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    letterSpacing: 0.2,
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
    letterSpacing: 0.2,
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
    letterSpacing: 0.2,
  },

  // ── Full-screen image overlay ──
  imageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
  },
  imageOverlayClose: {
    position: 'absolute',
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
