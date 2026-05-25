import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity,
  Keyboard, Dimensions, Pressable, Platform,
} from 'react-native';
import { ScrollView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  interpolate, Extrapolation, runOnJS,
} from 'react-native-reanimated';
import { Feather, MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { format, isValid, addMonths } from 'date-fns';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useCategories } from '../../hooks/useCategories';
import { useSettingsStore } from '../../store/settingsStore';
import { useWalletStore } from '../../store/walletStore';
import { useT } from '../../i18n';
import { lightTap, mediumTap } from '../../services/haptics';
import { Subscription } from '../../types';
import CategoryPicker from '../common/CategoryPicker';
import CalendarPicker from '../common/CalendarPicker';
import WalletLogo from '../common/WalletLogo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SubView = 'form' | 'calendar' | 'walletPicker';
type SavePayload = Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>;

// Icon format: "library/name" — f/ = Feather, m/ = MaterialCommunityIcons, i/ = Ionicons, fa/ = FontAwesome5
function renderIcon(iconId: string, size: number, color: string) {
  const [lib, name] = iconId.includes('/') ? iconId.split('/') : ['f', iconId];
  switch (lib) {
    case 'm': return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
    case 'i': return <Ionicons name={name as any} size={size} color={color} />;
    case 'fa': return <FontAwesome5 name={name as any} size={size} color={color} />;
    default: return <Feather name={name as any} size={size} color={color} />;
  }
}

const COMMON_ICONS = [
  // ── Entertainment ──
  'm/spotify', 'm/netflix', 'm/youtube-tv', 'm/apple', 'f/music',
  'f/tv', 'f/film', 'f/headphones', 'i/musical-notes', 'm/gamepad-variant',
  // ── Telco & Internet ──
  'm/cellphone', 'f/smartphone', 'f/wifi', 'f/phone', 'm/router-wireless',
  // ── Utilities ──
  'm/lightning-bolt', 'f/zap', 'm/water', 'f/home', 'm/radiator',
  // ── Transport ──
  'm/car-hatchback', 'm/gas-station', 'fa/parking', 'f/truck', 'm/motorbike',
  // ── Finance & Bills ──
  'f/credit-card', 'm/bank', 'f/dollar-sign', 'm/cash-multiple', 'm/wallet',
  // ── Health & Fitness ──
  'm/hospital-box', 'i/medkit', 'f/heart', 'm/dumbbell', 'i/fitness',
  // ── Education ──
  'm/school', 'f/book', 'm/notebook', 'f/briefcase',
  // ── Food & Shopping ──
  'f/coffee', 'm/food', 'm/cart', 'f/shopping-bag', 'm/silverware-fork-knife',
  // ── Cloud & Tech ──
  'f/cloud', 'f/globe', 'f/monitor', 'm/laptop', 'm/microsoft',
  // ── Family & Life ──
  'fa/baby', 'm/baby-carriage', 'fa/mosque', 'f/shield', 'm/umbrella',
  'f/activity', 'f/gift', 'm/dog', 'm/cat', 'm/paw',
] as const;

const ICON_KEYWORDS: Record<string, string[]> = {
  // ── Streaming & Entertainment ──
  spotify: ['m/spotify', 'f/headphones', 'i/musical-notes'],
  music: ['f/music', 'i/musical-notes', 'f/headphones'],
  youtube: ['m/youtube-tv', 'f/film', 'f/tv'],
  apple: ['m/apple', 'f/smartphone', 'm/laptop'],
  netflix: ['m/netflix', 'f/tv', 'f/film'],
  disney: ['m/castle', 'f/tv', 'f/film'],
  hbo: ['f/tv', 'f/film', 'm/filmstrip'],
  astro: ['m/satellite-variant', 'f/tv', 'm/remote-tv'],
  prime: ['m/truck-fast', 'f/film', 'm/cart'],
  viu: ['f/tv', 'f/film', 'i/play-circle'],
  game: ['m/gamepad-variant', 'm/controller-classic', 'f/monitor'],
  gaming: ['m/gamepad-variant', 'm/controller-classic', 'f/monitor'],
  playstation: ['m/sony-playstation', 'm/gamepad-variant', 'f/monitor'],
  xbox: ['m/microsoft-xbox', 'm/gamepad-variant', 'f/monitor'],
  // ── Telco & Internet (MY) ──
  digi: ['m/cellphone', 'm/signal-cellular-3', 'f/wifi'],
  maxis: ['m/cellphone', 'm/signal-cellular-3', 'f/wifi'],
  celcom: ['m/cellphone', 'm/signal-cellular-3', 'f/wifi'],
  celcomdigi: ['m/cellphone', 'm/signal-cellular-3', 'f/wifi'],
  umobile: ['m/cellphone', 'm/signal-cellular-3', 'f/wifi'],
  yes: ['m/cellphone', 'm/signal-cellular-3', 'f/wifi'],
  phone: ['m/cellphone', 'f/smartphone', 'f/phone'],
  telco: ['m/cellphone', 'm/signal-cellular-3', 'f/phone'],
  data: ['m/signal-cellular-3', 'f/wifi', 'f/smartphone'],
  wifi: ['f/wifi', 'm/router-wireless', 'f/globe'],
  internet: ['f/wifi', 'm/router-wireless', 'f/globe'],
  unifi: ['m/router-wireless', 'f/wifi', 'f/home'],
  tm: ['m/router-wireless', 'f/wifi', 'f/home'],
  time: ['m/router-wireless', 'f/wifi', 'f/globe'],
  broadband: ['m/router-wireless', 'f/wifi', 'f/globe'],
  // ── Utilities ──
  electric: ['m/lightning-bolt', 'f/zap', 'm/flash'],
  tenaga: ['m/lightning-bolt', 'f/zap', 'm/flash'],
  tnb: ['m/lightning-bolt', 'f/zap', 'm/flash'],
  letrik: ['m/lightning-bolt', 'f/zap', 'm/flash'],
  water: ['m/water', 'm/water-pump', 'i/water'],
  air: ['m/water', 'm/water-pump', 'i/water'],
  indah: ['m/water', 'm/water-pump', 'i/water'],
  sampah: ['m/delete-variant', 'm/recycle', 'f/trash-2'],
  // ── Transport & Vehicles ──
  car: ['m/car-hatchback', 'm/car-side', 'm/gas-station'],
  kereta: ['m/car-hatchback', 'm/car-side', 'm/gas-station'],
  myvi: ['m/car-hatchback', 'm/car-key', 'm/gas-station'],
  perodua: ['m/car-hatchback', 'm/car-key', 'm/gas-station'],
  proton: ['m/car-hatchback', 'm/car-key', 'm/gas-station'],
  honda: ['m/car-hatchback', 'm/car-side', 'm/car-key'],
  toyota: ['m/car-hatchback', 'm/car-side', 'm/car-key'],
  motor: ['m/motorbike', 'm/gas-station', 'f/shield'],
  motosikal: ['m/motorbike', 'm/gas-station', 'f/shield'],
  parking: ['fa/parking', 'm/car-hatchback', 'm/ticket-outline'],
  petrol: ['m/gas-station', 'm/fuel', 'm/car-hatchback'],
  gas: ['m/gas-station', 'm/fuel', 'm/car-hatchback'],
  toll: ['m/boom-gate', 'm/car-hatchback', 'm/road-variant'],
  tng: ['m/contactless-payment', 'm/car-hatchback', 'm/wallet'],
  // ── Finance & Loans ──
  loan: ['m/bank', 'm/cash-multiple', 'm/hand-coin'],
  pinjaman: ['m/bank', 'm/cash-multiple', 'm/hand-coin'],
  mara: ['m/school', 'm/bank', 'f/book'],
  ptptn: ['m/school', 'm/bank', 'f/book'],
  epf: ['m/piggy-bank', 'm/bank', 'f/shield'],
  kwsp: ['m/piggy-bank', 'm/bank', 'f/shield'],
  socso: ['m/shield-account', 'f/shield', 'm/bank'],
  perkeso: ['m/shield-account', 'f/shield', 'm/bank'],
  tabung: ['m/piggy-bank', 'm/bank', 'f/dollar-sign'],
  savings: ['m/piggy-bank', 'm/bank', 'f/dollar-sign'],
  credit: ['f/credit-card', 'm/credit-card-chip', 'm/bank'],
  kad: ['f/credit-card', 'm/credit-card-chip', 'm/wallet'],
  bill: ['m/receipt', 'f/credit-card', 'f/home'],
  bayar: ['m/receipt', 'f/credit-card', 'm/cash-multiple'],
  subscription: ['m/autorenew', 'f/credit-card', 'f/tv'],
  // ── Insurance ──
  insurance: ['f/shield', 'm/shield-check', 'm/umbrella'],
  insurans: ['f/shield', 'm/shield-check', 'm/umbrella'],
  takaful: ['fa/mosque', 'f/shield', 'm/shield-check'],
  prudential: ['f/shield', 'm/shield-check', 'f/heart'],
  aia: ['f/shield', 'm/shield-check', 'f/heart'],
  // ── Health & Fitness ──
  gym: ['m/dumbbell', 'i/fitness', 'f/activity'],
  fitness: ['m/dumbbell', 'i/fitness', 'f/activity'],
  anytime: ['m/dumbbell', 'i/fitness', 'f/activity'],
  doctor: ['i/medkit', 'm/hospital-box', 'm/stethoscope'],
  medical: ['i/medkit', 'm/hospital-box', 'm/stethoscope'],
  klinik: ['i/medkit', 'm/hospital-box', 'm/stethoscope'],
  hospital: ['m/hospital-box', 'i/medkit', 'm/ambulance'],
  // ── Education ──
  tuition: ['m/school', 'f/book', 'm/notebook'],
  school: ['m/school', 'f/book', 'm/notebook'],
  sekolah: ['m/school', 'f/book', 'm/notebook'],
  nursery: ['fa/baby', 'm/school', 'f/heart'],
  tadika: ['fa/baby', 'm/school', 'f/heart'],
  university: ['m/school', 'f/book', 'fa/graduation-cap'],
  course: ['m/school', 'f/book', 'f/monitor'],
  kelas: ['m/school', 'f/book', 'f/monitor'],
  // ── Cloud & Tech ──
  icloud: ['f/cloud', 'm/apple', 'm/cloud-upload'],
  storage: ['f/cloud', 'm/database', 'm/cloud-upload'],
  google: ['m/google', 'f/cloud', 'f/globe'],
  adobe: ['m/adobe', 'm/palette', 'f/cloud'],
  canva: ['m/palette', 'f/globe', 'f/cloud'],
  figma: ['m/vector-bezier', 'f/globe', 'f/cloud'],
  office: ['m/microsoft', 'm/laptop', 'f/cloud'],
  microsoft: ['m/microsoft', 'm/laptop', 'f/cloud'],
  notion: ['f/book', 'f/globe', 'f/cloud'],
  chatgpt: ['m/robot', 'f/globe', 'f/cloud'],
  ai: ['m/robot', 'f/globe', 'f/cloud'],
  vpn: ['f/shield', 'f/globe', 'm/vpn'],
  // ── Housing ──
  rent: ['f/home', 'fa/house-user', 'm/home-city'],
  sewa: ['f/home', 'fa/house-user', 'm/home-city'],
  rumah: ['f/home', 'fa/house-user', 'm/home-city'],
  apartment: ['m/home-city', 'f/home', 'fa/building'],
  kondo: ['m/home-city', 'f/home', 'fa/building'],
  // ── Food & Shopping ──
  coffee: ['f/coffee', 'm/coffee-maker', 'm/cup'],
  starbucks: ['f/coffee', 'm/coffee-maker', 'm/cup'],
  grab: ['m/motorbike', 'm/food', 'f/smartphone'],
  food: ['m/food', 'm/silverware-fork-knife', 'f/coffee'],
  shopee: ['m/cart', 'f/shopping-bag', 'm/package-variant'],
  lazada: ['m/cart', 'f/shopping-bag', 'm/package-variant'],
  // ── Family & Life ──
  child: ['fa/baby', 'm/baby-carriage', 'fa/child'],
  anak: ['fa/baby', 'm/baby-carriage', 'fa/child'],
  pet: ['m/paw', 'm/dog', 'm/cat'],
  kucing: ['m/cat', 'm/paw', 'f/heart'],
  anjing: ['m/dog', 'm/paw', 'f/heart'],
  // ── Religious ──
  mosque: ['fa/mosque', 'm/star-crescent', 'f/heart'],
  masjid: ['fa/mosque', 'm/star-crescent', 'f/heart'],
  zakat: ['fa/mosque', 'm/hand-coin', 'm/star-crescent'],
  sedekah: ['m/hand-coin', 'fa/mosque', 'f/heart'],
  church: ['fa/church', 'fa/cross', 'f/heart'],
  temple: ['fa/pray', 'f/heart', 'fa/place-of-worship'],
};

function suggestIcons(name: string): string[] {
  if (!name) return [];
  const lower = name.toLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const [keyword, icons] of Object.entries(ICON_KEYWORDS)) {
    if (lower.includes(keyword)) {
      for (const icon of icons) {
        if (!seen.has(icon)) { seen.add(icon); result.push(icon); }
      }
    }
  }
  return result.slice(0, 6);
}

interface Props {
  visible: boolean;
  subscription: Subscription | null;
  onClose: () => void;
  onSave: (payload: SavePayload) => void;
  onDelete?: (sub: Subscription) => void;
  onError?: (message: string) => void;
}

const CYCLE_OPTIONS: { value: Subscription['billingCycle']; label: string }[] = [
  { value: 'weekly',    label: 'weekly' },
  { value: 'monthly',   label: 'monthly' },
  { value: 'quarterly', label: 'quarterly' },
  { value: 'yearly',    label: 'yearly' },
];

const { height: SCREEN_H } = Dimensions.get('window');

const CommitmentForm: React.FC<Props> = ({ visible, subscription, onClose, onSave, onDelete, onError }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const expenseCategories = useCategories('expense');
  const wallets = useWalletStore(s => s.wallets);
  const currency = useSettingsStore(s => s.currency);
  const amountRef = useRef<TextInput>(null);
  const isEditMode = subscription !== null;
  const isComplete = !!(subscription?.isInstallment && subscription?.totalInstallments && (subscription.completedInstallments || 0) >= subscription.totalInstallments);

  // ── Form state ───────────────────────────────────────────
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<string>(expenseCategories[0]?.id || 'food');
  const [billingCycle, setBillingCycle] = useState<Subscription['billingCycle']>('monthly');
  const [reminderDays, setReminderDays] = useState('3');
  const [startDate, setStartDate] = useState(new Date());
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [walletId, setWalletId] = useState<string | undefined>(undefined);
  const [outstandingBalance, setOutstandingBalance] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [iconName, setIconName] = useState<string | undefined>(undefined);
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  const [installModalVisible, setInstallModalVisible] = useState(false);
  const [durationUnit, setDurationUnit] = useState<'months' | 'years'>('months');
  const [durationValue, setDurationValue] = useState('');
  const [completedStr, setCompletedStr] = useState('');
  const [pickerSelection, setPickerSelection] = useState<string | undefined>(undefined);
  const [subView, setSubView] = useState<SubView>('form');
  const [multilineFocused, setMultilineFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => { setKeyboardVisible(true); setKeyboardHeight(e.endCoordinates.height); });
    const hideSub = Keyboard.addListener(hideEvent, () => { setKeyboardVisible(false); setKeyboardHeight(0); });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // ── Reanimated sheet (matches DebtTracking) ──────────────
  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const closingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      sheetY.value = SCREEN_H;
      sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [visible, SCREEN_H, sheetY]);

  const finishClose = useCallback(() => {
    if (!closingRef.current) return;
    closingRef.current = false;
    onClose();
  }, [onClose]);

  const closeSheet = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    sheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [SCREEN_H, sheetY, finishClose]);

  const sheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => { 'worklet'; dragStart.value = sheetY.value; })
        .onUpdate((e) => {
          'worklet';
          let newY = dragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          sheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(closeSheet)();
          } else {
            sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, closeSheet],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Reset / hydrate ────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    if (subscription) {
      setName(subscription.name);
      setAmount(subscription.amount.toString());
      setNote(subscription.note || '');
      setCategory(subscription.category);
      setBillingCycle(subscription.billingCycle);
      setReminderDays(subscription.reminderDays.toString());
      setStartDate(isValid(subscription.startDate) ? subscription.startDate : new Date());
      setIsInstallment(subscription.isInstallment || false);
      const ti = subscription.totalInstallments || 0;
      if (ti >= 12 && ti % 12 === 0) {
        setDurationUnit('years'); setDurationValue((ti / 12).toString());
      } else {
        setDurationUnit('months'); setDurationValue(ti > 0 ? ti.toString() : '');
      }
      setTotalInstallments(ti > 0 ? ti.toString() : '');
      setCompletedStr(subscription.completedInstallments?.toString() || '');
      setIsPaused(subscription.isPaused || false);
      setWalletId(subscription.walletId);
      setOutstandingBalance(subscription.outstandingBalance?.toString() || '');
      setImageUri(subscription.imageUri);
      setIconName(subscription.iconName);
    } else {
      setName(''); setAmount(''); setNote('');
      setCategory(expenseCategories[0]?.id || 'food');
      setBillingCycle('monthly'); setReminderDays('3');
      setStartDate(new Date()); setIsInstallment(false);
      setTotalInstallments(''); setDurationUnit('months');
      setDurationValue(''); setCompletedStr(''); setIsPaused(false);
      setWalletId(undefined); setOutstandingBalance('');
      setImageUri(undefined); setIconName(undefined);
    }
    setSubView('form');
  }, [visible, subscription, expenseCategories]);

  const selectedWallet = useMemo(() => wallets.find(w => w.id === walletId), [wallets, walletId]);

  const pickImage = useCallback(() => {
    setIconPickerVisible(false);
    setTimeout(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        lightTap();
        setImageUri(result.assets[0].uri);
        setIconName(undefined);
      }
    }, 50);
  }, []);

  const openIconPicker = useCallback(() => {
    setPickerSelection(iconName);
    setIconPickerVisible(true);
  }, [iconName]);

  const selectIcon = useCallback((icon: string) => {
    lightTap();
    setPickerSelection(icon);
  }, []);

  const saveIconSelection = useCallback(() => {
    mediumTap();
    setIconName(pickerSelection);
    if (pickerSelection) setImageUri(undefined);
    setIconPickerVisible(false);
  }, [pickerSelection]);

  const removeAvatar = useCallback(() => {
    lightTap();
    setPickerSelection(undefined);
    setImageUri(undefined);
    setIconName(undefined);
    setIconPickerVisible(false);
  }, []);

  const suggested = useMemo(() => suggestIcons(name), [name]);

  const handleSave = useCallback(() => {
    if (!name.trim()) { onError?.(t.subscriptions.enterName); return; }
    const amt = parseFloat(amount);
    if (!amt || isNaN(amt) || amt <= 0) { onError?.(t.subscriptions.enterValidAmount); return; }
    const validStart = isValid(startDate) ? startDate : new Date();
    const payload: SavePayload = {
      name: name.trim(),
      amount: amt,
      category,
      billingCycle,
      startDate: validStart,
      nextBillingDate: subscription?.nextBillingDate || validStart,
      isActive: true,
      isPaused,
      reminderDays: parseInt(reminderDays) || 3,
      isInstallment,
      note: note.trim() || undefined,
      walletId,
      imageUri,
      iconName,
      ...(isInstallment && { totalInstallments: parseInt(totalInstallments) || 1, completedInstallments: parseInt(completedStr) || subscription?.completedInstallments || 0 }),
      ...(isInstallment && outstandingBalance && parseFloat(outstandingBalance) > 0 && {
        outstandingBalance: parseFloat(outstandingBalance),
      }),
    };
    mediumTap();
    onSave(payload);
  }, [name, amount, note, category, billingCycle, startDate, reminderDays, isInstallment, totalInstallments, completedStr, isPaused, walletId, outstandingBalance, imageUri, iconName, subscription, onSave, onError, t]);

  // ── Yearly preview ──────────────────────────────────────
  const yearlyPreview = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return '';
    switch (billingCycle) {
      case 'weekly': return `${currency} ${(amt * 52).toLocaleString()} /yr`;
      case 'quarterly': return `${currency} ${(amt * 4).toLocaleString()} /yr`;
      case 'yearly': return `${currency} ${amt.toLocaleString()} /yr`;
      default: return `${currency} ${(amt * 12).toLocaleString()} /yr`;
    }
  }, [amount, billingCycle, currency]);

  // ── Form body ──────────────────────────────────────────
  const renderFormBody = () => (
    <KeyboardAwareScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      keyboardDismissMode="on-drag"
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING['3xl'] + insets.bottom }}
      bottomOffset={20}
    >
      {/* ── Hero amount ── */}
      <Pressable style={[styles.heroArea, isComplete && { opacity: 0.45 }]} onPress={() => { if (!isComplete) amountRef.current?.focus(); }}>
        <View style={styles.heroAmountRow}>
          <Text style={styles.heroCurrency}>{currency}</Text>
          <TextInput
            ref={amountRef}
            style={styles.heroInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            placeholderTextColor={withAlpha(C.textMuted, 0.25)}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            editable={!isComplete}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={C.accent}
          />
        </View>
        {yearlyPreview ? (
          <Text style={styles.heroYearly}>{yearlyPreview}</Text>
        ) : (
          <Text style={[styles.heroYearly, { opacity: 0.4 }]}>enter amount</Text>
        )}
      </Pressable>

      {/* ── Cycle pills ── */}
      <View style={styles.cyclePillRow}>
        {CYCLE_OPTIONS.map(opt => {
          const active = billingCycle === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.cyclePill, active && styles.cyclePillActive]}
              onPress={() => { lightTap(); setBillingCycle(opt.value); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.cyclePillText, active && styles.cyclePillTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Name + Category (grouped) ── */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <TouchableOpacity onPress={openIconPicker} activeOpacity={0.7} style={styles.nameIconBtn}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.nameIconImage} />
            ) : iconName ? (
              <View style={[styles.nameIconFallback, { backgroundColor: withAlpha(C.accent, 0.10) }]}>
                {renderIcon(iconName, 20, C.accent)}
              </View>
            ) : (
              <View style={[styles.nameIconFallback, { backgroundColor: withAlpha(C.accent, 0.10) }]}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: C.accent }}>
                  {name ? name.charAt(0).toUpperCase() : '?'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.fieldFlex}>
            <Text style={styles.fieldLabel}>name</Text>
            <TextInput
              style={styles.fieldInput}
              value={name}
              onChangeText={setName}
              placeholder={t.subscriptions.namePlaceholder}
              placeholderTextColor={C.textMuted}
              returnKeyType="next"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
          </View>
        </View>
        <View style={styles.cardDivider} />
        <View style={styles.categoryRow}>
          <View style={styles.categoryIcon}>
            <Feather name="grid" size={12} color={C.accent} />
          </View>
          <View style={styles.fieldFlex}>
            <CategoryPicker
              categories={expenseCategories}
              selectedId={category}
              onSelect={setCategory}
              label="category"
              layout="dropdown"
            />
          </View>
        </View>
      </View>

      {/* ── Schedule (date + reminder) ── */}
      <Text style={styles.sectionLabel}>schedule</Text>
      <View style={styles.card}>
        {/* Date + Reminder side-by-side */}
        <View style={styles.sideBySide}>
          <TouchableOpacity
            style={styles.sideCell}
            onPress={() => { lightTap(); Keyboard.dismiss(); setSubView('calendar'); }}
            activeOpacity={0.7}
          >
            <View style={styles.iconBox}>
              <Feather name="calendar" size={14} color={C.accent} />
            </View>
            <View style={styles.fieldFlex}>
              <Text style={styles.fieldLabel}>starts</Text>
              <Text style={styles.fieldValue}>
                {isValid(startDate) ? format(startDate, 'MMM d, yyyy') : t.subscriptions.selectDate}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.sideVDivider} />
          <View style={styles.sideCell}>
            <View style={styles.iconBox}>
              <Feather name="bell" size={14} color={C.accent} />
            </View>
            <View style={styles.fieldFlex}>
              <Text style={styles.fieldLabel}>remind</Text>
              <View style={styles.reminderInline}>
                <TextInput
                  style={styles.reminderInput}
                  value={reminderDays}
                  onChangeText={setReminderDays}
                  placeholder="3"
                  keyboardType="number-pad"
                  placeholderTextColor={C.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                />
                <Text style={styles.reminderSuffix}>days before</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* ── Wallet ── */}
      <TouchableOpacity
        style={styles.card}
        onPress={() => { lightTap(); Keyboard.dismiss(); setSubView('walletPicker'); }}
        activeOpacity={0.7}
      >
        <View style={styles.walletCardRow}>
          <View style={styles.iconBox}>
            <Feather name="credit-card" size={14} color={C.accent} />
          </View>
          <View style={styles.walletCardContent}>
            <View>
              <Text style={styles.fieldLabel}>wallet</Text>
              {selectedWallet ? (
                <View style={styles.walletRow}>
                  <WalletLogo wallet={selectedWallet} size={26} />
                  <Text style={styles.walletName}>{selectedWallet.name}</Text>
                </View>
              ) : (
                <Text style={[styles.fieldValue, { color: C.textMuted }]}>none linked</Text>
              )}
            </View>
            <Feather name="chevron-right" size={16} color={withAlpha(C.textMuted, 0.5)} />
          </View>
        </View>
      </TouchableOpacity>

      {/* ── Options (grouped) ── */}
      <Text style={styles.sectionLabel}>options</Text>
      <View style={styles.card}>
        {/* Installment toggle */}
        <TouchableOpacity
          style={[styles.settingsRow, isComplete && { opacity: 0.45 }]}
          onPress={() => {
            if (isComplete) return;
            lightTap();
            if (!isInstallment) {
              setIsInstallment(true);
              setInstallModalVisible(true);
            } else {
              setIsInstallment(false);
              setDurationValue(''); setCompletedStr('');
              setTotalInstallments(''); setOutstandingBalance('');
            }
          }}
          activeOpacity={isComplete ? 1 : 0.7}
          disabled={isComplete}
          accessibilityRole="switch"
          accessibilityState={{ checked: isInstallment }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.settingsRowTitle}>{t.subscriptions.installmentLabel}</Text>
            <Text style={styles.settingsRowSub}>{isComplete ? 'all payments completed' : t.subscriptions.installmentHint}</Text>
          </View>
          <View style={[styles.customToggle, isInstallment && { backgroundColor: C.accent }]}>
            <View style={[styles.customToggleThumb, isInstallment && { transform: [{ translateX: 18 }] }]} />
          </View>
        </TouchableOpacity>

        {isInstallment && (
          <>
            <View style={styles.cardDivider} />
            <TouchableOpacity
              style={[styles.installSummaryRow, isComplete && { opacity: 0.45 }]}
              onPress={() => { if (!isComplete) { lightTap(); setInstallModalVisible(true); } }}
              activeOpacity={isComplete ? 1 : 0.7}
            >
              <View style={{ flex: 1 }}>
                {parseInt(totalInstallments) > 0 ? (
                  <>
                    <Text style={styles.installSummaryTitle}>
                      {totalInstallments} months · {parseInt(completedStr) || 0} paid
                    </Text>
                    {outstandingBalance && parseFloat(outstandingBalance) > 0 ? (
                      <Text style={styles.installSummarySubtitle}>
                        total {currency} {parseFloat(outstandingBalance).toLocaleString()}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={[styles.installSummaryTitle, { color: C.textMuted }]}>tap to set up installment</Text>
                )}
              </View>
              <Feather name="edit-2" size={14} color={C.textMuted} />
            </TouchableOpacity>
          </>
        )}

        <View style={styles.cardDivider} />

        {/* Pause toggle */}
        <TouchableOpacity
          style={styles.settingsRow}
          onPress={() => { lightTap(); setIsPaused(!isPaused); }}
          activeOpacity={0.7}
          accessibilityRole="switch"
          accessibilityState={{ checked: isPaused }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.settingsRowTitle}>{t.subscriptions.pauseThis}</Text>
            <Text style={styles.settingsRowSub}>{t.subscriptions.pauseHint}</Text>
          </View>
          <View style={[styles.customToggle, isPaused && { backgroundColor: C.bronze }]}>
            <View style={[styles.customToggleThumb, isPaused && { transform: [{ translateX: 18 }] }]} />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Note ── */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.iconBox}>
            <Feather name="file-text" size={14} color={C.accent} />
          </View>
          <View style={styles.fieldFlex}>
            <Text style={styles.fieldLabel}>note</Text>
            <TextInput
              style={[styles.fieldInput, { minHeight: 44, textAlignVertical: 'top' }]}
              value={note}
              onChangeText={setNote}
              placeholder="account login, cancellation date…"
              placeholderTextColor={C.textMuted}
              multiline
              returnKeyType="default"
              onFocus={() => setMultilineFocused(true)}
              onBlur={() => setMultilineFocused(false)}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
          </View>
        </View>
      </View>

      {/* Delete — in scroll content, edit mode only (matches DebtTracking pattern) */}
      {isEditMode && onDelete && subscription && (
        <Pressable
          style={styles.deleteLink}
          onPress={() => onDelete(subscription)}
          hitSlop={{ top: 14, bottom: 14, left: 18, right: 18 }}
          accessibilityRole="button"
          accessibilityLabel="delete commitment"
        >
          {({ pressed }) => (
            <View style={[styles.deleteLinkInner, pressed && { opacity: 0.55 }]}>
              <Feather name="trash-2" size={13} color={C.textMuted} />
              <Text style={styles.deleteLinkText}>delete commitment</Text>
            </View>
          )}
        </Pressable>
      )}

    </KeyboardAwareScrollView>
  );

  const renderCalendarView = () => (
    <View style={{ paddingHorizontal: SPACING.lg, flex: 1 }}>
      <CalendarPicker
        value={startDate}
        onChange={(date) => { setStartDate(date); setSubView('form'); }}
      />
    </View>
  );

  const renderWalletPickerView = () => (
    <View style={{ paddingHorizontal: SPACING.lg, flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        <TouchableOpacity
          style={[styles.walletOption, !walletId && styles.walletOptionActive]}
          onPress={() => { lightTap(); setWalletId(undefined); setSubView('form'); }}
          activeOpacity={0.6}
        >
          <View style={styles.walletOptionLeft}>
            <View style={[styles.walletOptionIcon, { backgroundColor: withAlpha(C.textMuted, 0.08) }]}>
              <Feather name="minus" size={16} color={C.textMuted} />
            </View>
            <Text style={[styles.walletOptionText, !walletId && styles.walletOptionTextActive]}>none</Text>
          </View>
          {!walletId && <Feather name="check" size={18} color={C.accent} />}
        </TouchableOpacity>
        {wallets.map(wallet => {
          const sel = walletId === wallet.id;
          return (
            <TouchableOpacity
              key={wallet.id}
              style={[styles.walletOption, sel && styles.walletOptionActive]}
              onPress={() => { lightTap(); setWalletId(wallet.id); setSubView('form'); }}
              activeOpacity={0.6}
            >
              <View style={styles.walletOptionLeft}>
                <WalletLogo wallet={wallet} size={28} />
                <Text style={[styles.walletOptionText, sel && styles.walletOptionTextActive]}>{wallet.name}</Text>
              </View>
              {sel && <Feather name="check" size={18} color={C.accent} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        if (subView !== 'form') { setSubView('form'); return; }
        closeSheet();
      }}
    >
      <Reanimated.View style={[styles.backdrop, backdropAnimatedStyle]}>
        <Pressable style={{ flex: 1 }} onPress={() => {
          if (subView !== 'form') { setSubView('form'); return; }
          closeSheet();
        }} />
      </Reanimated.View>

      <Reanimated.View style={[styles.sheet, sheetAnimatedStyle]}>
        {/* Drag zone — handle + title */}
        <GestureDetector gesture={sheetGesture}>
          <View collapsable={false}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
            <View style={styles.titleZone}>
              <Text style={styles.titleText} numberOfLines={1}>
                {subView === 'calendar' ? 'start ' :
                 subView === 'walletPicker' ? 'choose ' :
                 isEditMode ? 'edit ' : 'new '}
                <Text style={styles.titleAccent}>
                  {subView === 'calendar' ? 'date' :
                   subView === 'walletPicker' ? 'wallet' :
                   'commitment'}
                </Text>
              </Text>
              {subView === 'form' && (
                <Text style={styles.subtitleText}>
                  {isEditMode
                    ? `${subscription!.name.toLowerCase()} · ${currency} ${subscription!.amount.toFixed(2)}`
                    : 'recurring bill, subscription, or loan'}
                </Text>
              )}
            </View>
          </View>
        </GestureDetector>

        {subView === 'form' && renderFormBody()}
        {subView === 'calendar' && renderCalendarView()}
        {subView === 'walletPicker' && renderWalletPickerView()}

        {/* Anchored save zone — outside scroll, pinned at bottom */}
        <View style={[styles.saveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
          {subView === 'form' ? (
            <>
              <Pressable style={styles.saveBtn} onPress={handleSave}>
                <View style={styles.saveBtnInner}>
                  <Feather name={isEditMode ? 'check' : 'plus'} size={16} color={C.onAccent} />
                  <Text style={styles.saveBtnText}>
                    {isEditMode ? t.common.save.toLowerCase() : 'add commitment'}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                style={styles.secondaryLink}
                onPress={closeSheet}
                hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
              >
                {({ pressed }) => (
                  <View style={[styles.secondaryLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={styles.secondaryLinkText}>close</Text>
                  </View>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable
              style={styles.secondaryLink}
              onPress={() => setSubView('form')}
              hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
            >
              {({ pressed }) => (
                <View style={[styles.secondaryLinkInner, pressed && { opacity: 0.55 }]}>
                  <Feather name="chevron-left" size={12} color={C.textMuted} />
                  <Text style={styles.secondaryLinkText}>back</Text>
                </View>
              )}
            </Pressable>
          )}
        </View>
      </Reanimated.View>
      {/* Icon / image picker overlay */}
      {iconPickerVisible && (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIconPickerVisible(false)}
          >
            <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(C.dimBg, 0.45) }]} />
          </Pressable>
          <View style={styles.iconPickerWrap} pointerEvents="box-none">
            <View style={styles.iconPickerCard} onStartShouldSetResponder={() => true}>
              {/* Header: title + close */}
              <View style={styles.iconPickerHeader}>
                <Text style={styles.iconPickerTitle}>
                  {'choose '}
                  <Text style={styles.iconPickerTitleAccent}>icon</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => setIconPickerVisible(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.iconPickerClose}
                >
                  <Feather name="x" size={16} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              {suggested.length > 0 && (
                <>
                  <Text style={styles.iconPickerSectionLabel}>suggested</Text>
                  <View style={styles.iconGrid}>
                    {suggested.map(icon => {
                      const sel = pickerSelection === icon;
                      return (
                        <TouchableOpacity
                          key={`s-${icon}`}
                          style={[styles.iconGridItem, sel && styles.iconGridItemActive]}
                          onPress={() => selectIcon(icon)}
                          activeOpacity={0.7}
                        >
                          {renderIcon(icon, 20, sel ? C.onAccent : C.textSecondary)}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={styles.iconPickerSectionLabel}>common</Text>
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 180 }}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                <View style={styles.iconGrid}>
                  {COMMON_ICONS.map(icon => {
                    const sel = pickerSelection === icon;
                    return (
                      <TouchableOpacity
                        key={icon}
                        style={[styles.iconGridItem, sel && styles.iconGridItemActive]}
                        onPress={() => selectIcon(icon)}
                        activeOpacity={0.7}
                      >
                        {renderIcon(icon, 20, sel ? C.onAccent : C.textSecondary)}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.iconPickerDivider} />

              <TouchableOpacity style={styles.iconPickerRow} onPress={pickImage} activeOpacity={0.7}>
                <Feather name="image" size={16} color={C.accent} />
                <Text style={styles.iconPickerRowText}>choose from gallery</Text>
              </TouchableOpacity>

              {/* Save button */}
              <Pressable style={styles.iconPickerSaveBtn} onPress={saveIconSelection}>
                <View style={styles.iconPickerSaveBtnInner}>
                  <Feather name="check" size={14} color={C.onAccent} />
                  <Text style={styles.iconPickerSaveBtnText}>save</Text>
                </View>
              </Pressable>

              {/* Remove — bottom center */}
              {(imageUri || pickerSelection) && (
                <Pressable style={styles.iconPickerRemove} onPress={removeAvatar}>
                  {({ pressed }) => (
                    <View style={[styles.iconPickerRemoveInner, pressed && { opacity: 0.55 }]}>
                      <Feather name="x" size={12} color={C.textMuted} />
                      <Text style={styles.iconPickerRemoveText}>remove</Text>
                    </View>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        </>
      )}

      {/* ── Installment setup modal ── */}
      {installModalVisible && (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setInstallModalVisible(false)}
          >
            <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(C.dimBg, 0.45) }]} />
          </Pressable>
          <View style={styles.instModalWrap} pointerEvents="box-none">
            <View style={styles.instModalCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.instModalTitle}>
                {'installment '}
                <Text style={{ color: C.accent }}>setup</Text>
              </Text>

              <Text style={styles.instModalLabel}>total price</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.installCcy}>{currency}</Text>
                <TextInput
                  style={[styles.instModalInput, { flex: 1 }]}
                  value={outstandingBalance}
                  onChangeText={setOutstandingBalance}
                  placeholder="e.g. 90,000"
                  keyboardType="decimal-pad"
                  placeholderTextColor={withAlpha(C.textMuted, 0.5)}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                />
              </View>

              <Text style={[styles.instModalLabel, { marginTop: SPACING.lg }]}>how long?</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
                <TextInput
                  style={[styles.instModalInput, { flex: 1 }]}
                  value={durationValue}
                  onChangeText={setDurationValue}
                  placeholder={durationUnit === 'years' ? 'e.g. 7' : 'e.g. 84'}
                  keyboardType="number-pad"
                  placeholderTextColor={withAlpha(C.textMuted, 0.5)}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                />
                <View style={styles.instModalPillRow}>
                  {(['months', 'years'] as const).map(u => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.instModalPill, durationUnit === u && styles.instModalPillActive]}
                      onPress={() => { lightTap(); setDurationUnit(u); setDurationValue(''); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.instModalPillText, durationUnit === u && styles.instModalPillTextActive]}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Text style={[styles.instModalLabel, { marginTop: SPACING.lg }]}>already paid</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
                <TextInput
                  style={[styles.instModalInput, { flex: 1 }]}
                  value={completedStr}
                  onChangeText={setCompletedStr}
                  placeholder="0"
                  keyboardType="number-pad"
                  placeholderTextColor={withAlpha(C.textMuted, 0.5)}
                  returnKeyType="done"
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                  onSubmitEditing={Keyboard.dismiss}
                />
                <Text style={[styles.installCcy, { marginBottom: -2 }]}>months</Text>
              </View>

              {(() => {
                const total = durationUnit === 'years'
                  ? (parseInt(durationValue) || 0) * 12
                  : parseInt(durationValue) || 0;
                const completed = parseInt(completedStr) || 0;
                const remaining = Math.max(total - completed, 0);
                const amt = parseFloat(amount) || 0;
                const totalPrice = parseFloat(outstandingBalance) || 0;
                const paidAmount = completed * amt;
                const balanceLeft = totalPrice > 0 ? Math.max(totalPrice - paidAmount, 0) : 0;
                if (total > 0) {
                  return (
                    <View style={styles.instModalSummary}>
                      <View style={styles.instModalBar}>
                        {completed > 0 && <View style={[styles.instModalBarFill, { flex: completed }]} />}
                        {remaining > 0 && <View style={{ flex: remaining }} />}
                      </View>
                      <Text style={styles.instModalSummaryText}>
                        {completed}/{total} paid · {remaining} months left
                      </Text>
                      {totalPrice > 0 && (
                        <Text style={[styles.instModalSummaryText, { marginTop: 2 }]}>
                          {currency} {balanceLeft.toLocaleString()} balance remaining
                        </Text>
                      )}
                      {remaining > 0 && (
                        <Text style={[styles.instModalSummaryText, { marginTop: 2 }]}>
                          est. done {format(addMonths(new Date(), remaining), 'MMM yyyy').toLowerCase()}
                        </Text>
                      )}
                    </View>
                  );
                }
                return null;
              })()}

              <Pressable
                style={styles.instModalDone}
                onPress={() => {
                  lightTap();
                  const total = durationUnit === 'years'
                    ? (parseInt(durationValue) || 0) * 12
                    : parseInt(durationValue) || 0;
                  setTotalInstallments(total > 0 ? total.toString() : '');
                  setInstallModalVisible(false);
                }}
              >
                <Text style={styles.instModalDoneText}>done</Text>
              </Pressable>
            </View>
          </View>
        </>
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
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(C.dimBg, 0.5),
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.background,
    borderTopLeftRadius: RADIUS['2xl'] + 2,
    borderTopRightRadius: RADIUS['2xl'] + 2,
    maxHeight: '92%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.06),
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.12),
  },

  // ── Title zone (centered, DebtTracking style) ────────
  titleZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
    position: 'relative',
  },
  titleText: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
    textAlign: 'center',
  },
  titleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  subtitleText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: SPACING.xs + 2,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  // ── Anchored save zone (DebtTracking pattern) ────────
  saveZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.background,
  },

  // ── Hero amount ──────────────────────────────────────
  heroArea: {
    alignItems: 'center',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md + 2,
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.sm,
    backgroundColor: withAlpha(C.accent, C === CALM_DARK ? 0.06 : 0.03),
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, C === CALM_DARK ? 0.12 : 0.06),
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  heroCurrency: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: withAlpha(C.textMuted, 0.6),
    marginRight: 2,
  },
  heroInput: {
    fontSize: 44,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? -1.3 : -1.5,
    minWidth: 80,
    textAlign: 'center',
    paddingVertical: 0,
  },
  heroYearly: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    letterSpacing: 0.3,
    marginTop: SPACING.xs,
  },

  // ── Section label ────────────────────────────────────
  sectionLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: withAlpha(C.textMuted, 0.7),
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: SPACING.md + 2,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.xs + 2,
  },

  // ── Card ─────────────────────────────────────────────
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.07),
    overflow: 'hidden',
    marginBottom: SPACING.sm + 2,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    gap: SPACING.sm + 2,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    marginLeft: SPACING.md + 30 + SPACING.sm + 2,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nameIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    flexShrink: 0,
    overflow: 'hidden',
  },
  nameIconImage: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  nameIconFallback: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxActive: { backgroundColor: withAlpha(C.accent, 0.14) },
  iconBoxPaused: { backgroundColor: withAlpha(C.bronze, 0.12) },
  fieldFlex: { flex: 1 },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    marginBottom: 2,
  },
  fieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    letterSpacing: -0.1,
  },
  fieldValue: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: -0.1,
  },

  // ── Cycle pills (standalone at top) ──────────────────
  cyclePillRow: { flexDirection: 'row', gap: 6, marginBottom: SPACING.sm },
  cyclePill: {
    flex: 1,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.10),
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.06 : 0.02),
  },
  cyclePillActive: { borderColor: C.accent, backgroundColor: C.accent, ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm) },
  cyclePillText: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  cyclePillTextActive: { color: C.onAccent },

  // ── Avatar (tap to pick image) ───────────────────────
  avatarWrap: {
    alignSelf: 'center',
    marginBottom: SPACING.sm,
    position: 'relative',
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: -0.5,
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Side-by-side ─────────────────────────────────────
  sideBySide: { flexDirection: 'row' },
  sideCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    gap: SPACING.sm + 2,
  },
  sideVDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    marginVertical: SPACING.sm,
  },

  // ── Reminder ─────────────────────────────────────────
  reminderInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reminderInput: {
    width: 40,
    paddingVertical: 4,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.10),
    backgroundColor: withAlpha(C.textPrimary, 0.03),
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    textAlign: 'center',
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  reminderSuffix: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, letterSpacing: 0.1 },

  // ── Wallet ───────────────────────────────────────────
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.sm,
  },
  categoryIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  walletCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md + 2,
    gap: SPACING.sm + 2,
  },
  walletCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 2 },
  walletName: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: -0.1,
  },
  walletOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(C.textPrimary, 0.05),
    borderRadius: RADIUS.md,
    marginBottom: 2,
  },
  walletOptionActive: { backgroundColor: withAlpha(C.accent, 0.05), borderColor: withAlpha(C.accent, 0.12) },
  walletOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm + 4 },
  walletOptionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  walletOptionText: { fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.medium, letterSpacing: -0.1 },
  walletOptionTextActive: { color: C.accent, fontWeight: TYPOGRAPHY.weight.semibold },

  // ── Settings-style toggles (DebtTracking pattern) ────
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  settingsRowTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: 4,
  },
  settingsRowSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    lineHeight: 16,
  },
  customToggle: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: withAlpha(C.textPrimary, 0.12),
    padding: 2,
    justifyContent: 'center',
  },
  customToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.surface,
    ...(C === CALM_DARK ? {} : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } }),
  },

  // ── Installment inline summary ──────────────────────
  installSummaryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    paddingLeft: SPACING.md + 30 + SPACING.sm + 2,
    gap: SPACING.sm,
  },
  installSummaryTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  installSummarySubtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 2,
  },
  installCcy: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
  },

  // ── Installment setup modal ────────────────────────
  instModalWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  instModalCard: {
    width: '88%' as any,
    maxHeight: '80%' as any,
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.14 : 0.06),
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  instModalTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.1 : 0,
    marginBottom: SPACING.xl,
  },
  instModalLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  instModalInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(C.textPrimary, 0.10),
    fontVariant: ['tabular-nums' as const],
  },
  instModalPillRow: {
    flexDirection: 'row' as const,
    gap: SPACING.xs,
  },
  instModalPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
  },
  instModalPillActive: {
    backgroundColor: C.accent,
  },
  instModalPillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  instModalPillTextActive: {
    color: C.onAccent,
  },
  instModalSummary: {
    marginTop: SPACING.xl,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
  },
  instModalBar: {
    flexDirection: 'row' as const,
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(C.textPrimary, 0.08),
    overflow: 'hidden' as const,
    marginBottom: SPACING.sm,
  },
  instModalBarFill: {
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  instModalSummaryText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  instModalDone: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center' as const,
  },
  instModalDoneText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
  },

  // ── Save / Close / Back (anchored, DebtTracking pattern) ─
  saveBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.3,
  },
  secondaryLink: {
    marginTop: SPACING.sm,
    alignSelf: 'center',
  },
  deleteLink: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
  },
  deleteLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  deleteLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  secondaryLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  secondaryLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  // ── Icon picker overlay ──────────────────────────────
  iconPickerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'box-none',
    paddingHorizontal: SPACING.xl,
  },
  iconPickerCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    ...SHADOWS.lg,
  },
  iconPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    position: 'relative',
  },
  iconPickerClose: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(C.textPrimary, 0.05),
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPickerTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  iconPickerTitleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  iconPickerSectionLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: withAlpha(C.textMuted, 0.7),
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  iconGridItem: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.textPrimary, 0.04),
  },
  iconGridItemActive: {
    backgroundColor: C.accent,
  },
  iconPickerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, 0.08),
    marginVertical: SPACING.sm,
  },
  iconPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.xs,
  },
  iconPickerRowText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
    letterSpacing: -0.1,
  },
  iconPickerSaveBtn: {
    width: '100%',
    paddingVertical: SPACING.sm + 4,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
    minHeight: 44,
  },
  iconPickerSaveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconPickerSaveBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.2,
  },
  iconPickerRemove: {
    alignSelf: 'center',
    marginTop: SPACING.xs,
  },
  iconPickerRemoveInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  iconPickerRemoveText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },

  doneFab: {
    position: 'absolute',
    right: SPACING.md,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.md),
  },
});

export default CommitmentForm;
