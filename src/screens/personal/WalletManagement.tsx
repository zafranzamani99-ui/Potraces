import React, { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Pressable,
  Animated,
  Easing,
  PanResponder,
  useWindowDimensions,
  Image,
  InteractionManager,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { WALLET_ICONS_BY_TYPE, WALLET_COLORS, WALLET_PRESETS, WALLET_TYPE_CONFIG, FREE_TIER, BANK_LOGOS, CARD_NETWORK_LOGOS } from '../../constants/premium';
import { useWalletStore } from '../../store/walletStore';
import { usePersonalStore } from '../../store/personalStore';
import { usePremiumStore } from '../../store/premiumStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Wallet, WalletType } from '../../types';
import Card from '../../components/common/Card';
import WalletLogo from '../../components/common/WalletLogo';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PaywallModal from '../../components/common/PaywallModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { lightTap } from '../../services/haptics';
import ScreenGuide from '../../components/common/ScreenGuide';
import EchoInlineChat from '../../components/common/EchoInlineChat';
import TypewriterText from '../../components/common/TypewriterText';
import { useT } from '../../i18n';
import { reconcileWallet } from '../../utils/walletReconcile';
import { HITSLOP_10 } from '../../utils/hitSlop';

const HARD_SWIPE = 120;

// [width, height] overrides for logos with excessive transparent padding
const LOGO_SIZE: Record<string, [number, number]> = {
  bank_islam: [130, 56],
  alliance:   [140, 52],
  ocbc_my:    [130, 58],
  affin:      [128, 54],
};

type WalletSwipeActionProps = {
  variant: 'more' | 'delete';
  direction: 'right' | 'left';
  drag: SharedValue<number>;
  label: string;
  styles: ReturnType<typeof makeStyles>;
  onTap: () => void;
  onHardSwipe: () => void;
};

const ACTION_MIN_WIDTH = 72;
const ACTION_MAX_WIDTH = 140;

function WalletSwipeAction({
  variant,
  direction,
  drag,
  label,
  styles,
  onTap,
  onHardSwipe,
}: WalletSwipeActionProps) {
  const triggered = useSharedValue(false);

  useAnimatedReaction(
    () => drag.value,
    (v) => {
      'worklet';
      const crossed = direction === 'right' ? v < -HARD_SWIPE : v > HARD_SWIPE;
      if (crossed && !triggered.value) {
        triggered.value = true;
        runOnJS(onHardSwipe)();
      }
      if (Math.abs(v) < 10) {
        triggered.value = false;
      }
    },
  );

  const animatedStyle = useAnimatedStyle(() => {
    const absDrag = Math.abs(drag.value);
    const w = Math.min(ACTION_MAX_WIDTH, Math.max(ACTION_MIN_WIDTH, absDrag));
    return { width: w };
  });

  return (
    <Reanimated.View
      style={[
        styles.swipeFill,
        variant === 'more' ? styles.__moreColor : styles.__deleteColor,
        direction === 'right' ? styles.swipeFillAlignRight : styles.swipeFillAlignLeft,
        animatedStyle,
      ]}
    >
      <TouchableOpacity
        style={styles.swipeInner}
        onPress={onTap}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Feather
          name={variant === 'more' ? 'more-horizontal' : 'trash-2'}
          size={24}
          color="#fff"
        />
      </TouchableOpacity>
    </Reanimated.View>
  );
}

const WalletManagement: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const currency = useSettingsStore((s) => s.currency);
  const echoHidden = useSettingsStore((s) => s.walletEchoHidden);
  const setEchoHidden = useSettingsStore((s) => s.setWalletEchoHidden);
  const wallets = useWalletStore((s) => s.wallets);
  const transfers = useWalletStore((s) => s.transfers);
  const addWallet = useWalletStore((s) => s.addWallet);
  const updateWallet = useWalletStore((s) => s.updateWallet);
  const deleteWallet = useWalletStore((s) => s.deleteWallet);
  const setDefaultWallet = useWalletStore((s) => s.setDefaultWallet);
  const setWalletBalance = useWalletStore((s) => s.setWalletBalance);
  const transferBetweenWallets = useWalletStore((s) => s.transferBetweenWallets);
  const deleteTransfer = useWalletStore((s) => s.deleteTransfer);
  const repayCredit = useWalletStore((s) => s.repayCredit);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const logActivity = useWalletStore((s) => s.logActivity);
  const canCreateWallet = usePremiumStore((s) => s.canCreateWallet);
  const tier = usePremiumStore((s) => s.tier);

  useEffect(() => {
    const defaults = wallets.filter((w) => w.isDefault);
    if (defaults.length > 1) {
      setDefaultWallet(defaults[0].id);
    }
  }, [wallets, setDefaultWallet]);

  // Add/Edit modal
  const [modalVisible, setModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | undefined>(undefined);
  const [editingWallet, setEditingWallet] = useState<string | null>(null);
  const [addStep, setAddStep] = useState<'type' | 'credit_card' | 'details'>('type');
  const [creditCardStep, setCreditCardStep] = useState<'bank' | 'network'>('bank');
  const creditCardStepRef = useRef<'bank' | 'network'>('bank');
  useEffect(() => { creditCardStepRef.current = creditCardStep; }, [creditCardStep]);
  const [selectedCreditBank, setSelectedCreditBank] = useState<string | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);

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

  // Bills preview modal
  const [billsModalVisible, setBillsModalVisible] = useState(false);

  // Star animation
  const starAnims = useRef<Record<string, Animated.Value>>({}).current;
  const getStarAnim = useCallback((id: string) => {
    if (!starAnims[id]) starAnims[id] = new Animated.Value(0);
    return starAnims[id];
  }, [starAnims]);

  // Action sheet (opened via swipe "More" or hard-swipe right-to-left)
  const [actionSheetWalletId, setActionSheetWalletId] = useState<string | null>(null);
  // Delete confirmation (replaces native Alert to avoid Reanimated freeze on iOS)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // Repay credit picker (replaces native Alert.alert action sheet)
  const [repayPickerVisible, setRepayPickerVisible] = useState(false);
  const [echoSheetVisible, setEchoSheetVisible] = useState(false);
  const [greetingDismissed, setGreetingDismissed] = useState(false);
  const [greetingHiddenDuringDrag, setGreetingHiddenDuringDrag] = useState(false);
  const [greetingText, setGreetingText] = useState('');
  const [greetingChips, setGreetingChips] = useState<{ label: string; question: string }[]>([]);
  const [echoAutoPrompt, setEchoAutoPrompt] = useState<string | undefined>(undefined);
  const [fabSide, setFabSide] = useState<'left' | 'right'>('right');
  const [walletChipRotation, setWalletChipRotation] = useState(0);

  // ── Draggable Echo FAB — free X+Y drag, snaps to edge on release ──
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const echoFabPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  // When anchor (fabSide) switches, reset X to 0 atomically before the frame paints
  const prevFabSideRef = useRef<'left' | 'right'>('right');
  useLayoutEffect(() => {
    if (prevFabSideRef.current !== fabSide) {
      prevFabSideRef.current = fabSide;
      echoFabPan.setValue({ x: 0, y: (echoFabPan.y as any)._value });
    }
  }, [fabSide, echoFabPan]);
  const echoFabPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          echoFabPan.setOffset({
            x: (echoFabPan.x as any)._value,
            y: (echoFabPan.y as any)._value,
          });
          echoFabPan.setValue({ x: 0, y: 0 });
          setGreetingHiddenDuringDrag(true);
        },
        onPanResponderMove: Animated.event(
          [null, { dx: echoFabPan.x, dy: echoFabPan.y }],
          { useNativeDriver: false }
        ),
        onPanResponderRelease: () => {
          echoFabPan.flattenOffset();
          const curX = (echoFabPan.x as any)._value;
          const curY = (echoFabPan.y as any)._value;
          const safeTop = Math.max(insets.top, 20);
          const defaultTop = safeTop + 80;
          // Determine target side from projected FAB center
          const fabCenterX = fabSide === 'right'
            ? SCREEN_W - SPACING.xl - 28 + curX
            : SPACING.xl + 28 + curX;
          const newSide = fabCenterX < SCREEN_W / 2 ? 'left' : 'right';
          // Snap X in CURRENT anchor coords — don't switch anchor until spring is done
          const edgeSpan = SCREEN_W - 2 * SPACING.xl - 56;
          const snapX = fabSide === newSide ? 0
            : fabSide === 'right' ? -edgeSpan : edgeSpan;
          // Y clamp
          const minY = -(defaultTop - 8);
          const maxY = SCREEN_H - insets.top - 44 - insets.bottom - 80 - 56 - defaultTop;
          const clampedY = Math.max(minY, Math.min(maxY, curY));
          Animated.spring(echoFabPan, {
            toValue: { x: snapX, y: clampedY },
            useNativeDriver: false,
            friction: 14,
            tension: 100,
          }).start(() => {
            // useLayoutEffect resets X to 0 atomically when fabSide changes — no flicker
            setFabSide(newSide);
            setGreetingHiddenDuringDrag(false);
          });
        },
      }),
    // fabSide in deps — release uses it to compute FAB center X
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [echoFabPan, fabSide, SCREEN_W, SCREEN_H, insets.top, insets.bottom]
  );

  // Swipeable refs per wallet (for closing after action)
  const swipeRefs = useRef<Record<string, React.RefObject<SwipeableMethods | null>>>({}).current;
  // Tracks which wallet was opened for edit — ref so resetForm never has a stale closure
  const editingWalletRef = useRef<string | null>(null);
  const getSwipeRef = useCallback((id: string) => {
    if (!swipeRefs[id]) swipeRefs[id] = React.createRef<SwipeableMethods | null>();
    return swipeRefs[id];
  }, [swipeRefs]);

  // Defer wallet list render until after navigation transition
  const [listReady, setListReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setListReady(true));
    return () => task.cancel();
  }, []);

  // Form state
  const [selectedType, setSelectedType] = useState<WalletType>('bank');
  const selectedTypeRef = useRef<WalletType>('bank');
  useEffect(() => { selectedTypeRef.current = selectedType; }, [selectedType]);

  const typeRailX = useRef(new Animated.Value(0)).current;
  const typeIdxRef = useRef(0);
  const panelWidthRef = useRef(0);
  const [panelWidth, setPanelWidth] = useState(0);

  const goToType = useCallback((type: WalletType) => {
    lightTap();
    const TYPES: WalletType[] = ['bank', 'ewallet', 'credit'];
    const newIdx = TYPES.indexOf(type);
    typeIdxRef.current = newIdx;
    setSelectedType(type);
    Animated.spring(typeRailX, {
      toValue: -newIdx * panelWidthRef.current,
      useNativeDriver: true,
      speed: 22,
      bounciness: 0,
    }).start();
  }, [typeRailX]);

  const typeSwipeGesture = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const base = -typeIdxRef.current * panelWidthRef.current;
      typeRailX.setValue(base + e.translationX);
    })
    .onEnd((e) => {
      const TYPES: WalletType[] = ['bank', 'ewallet', 'credit'];
      const idx = typeIdxRef.current;
      const shouldNext = e.translationX < -50 || e.velocityX < -500;
      const shouldPrev = e.translationX > 50 || e.velocityX > 500;
      let newIdx = idx;
      if (shouldNext && idx < 2) newIdx = idx + 1;
      else if (shouldPrev && idx > 0) newIdx = idx - 1;
      typeIdxRef.current = newIdx;
      Animated.spring(typeRailX, {
        toValue: -newIdx * panelWidthRef.current,
        useNativeDriver: true,
        speed: 22,
        bounciness: 0,
      }).start();
      if (newIdx !== idx) setSelectedType(TYPES[newIdx]);
    }), [typeRailX]);

  const creditCardBackGesture = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-24, 24])
    .failOffsetY([-12, 12])
    .onEnd((e) => {
      if (e.translationX > 50) {
        lightTap();
        if (creditCardStepRef.current === 'bank') {
          setCreditCardStep('network');
        } else {
          setAddStep('type');
          setSelectedType('credit');
        }
      }
    }), []);
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
    () => creditWallets.reduce((sum, w) => {
      const available = Math.max(0, (w.creditLimit || 0) - (w.usedCredit || 0));
      return sum + available;
    }, 0),
    [creditWallets]
  );

  const recentTransfers = useMemo(
    () => transfers.slice(0, 5),
    [transfers]
  );

  const navigation = useNavigation<any>();
  const subscriptions = usePersonalStore((s) => s.subscriptions);
  const transactions = usePersonalStore((s) => s.transactions);
  const goals = usePersonalStore((s) => s.goals);
  const addTransaction = usePersonalStore((s) => s.addTransaction);

  // ─── Net worth — cash minus credit debt ───
  const totalCreditUsed = useMemo(
    () => creditWallets.reduce((s, w) => s + (w.usedCredit || 0), 0),
    [creditWallets]
  );
  const netWorth = useMemo(() => totalBalance - totalCreditUsed, [totalBalance, totalCreditUsed]);

  // ─── Upcoming bills (next 7 days) ───
  const upcomingBillsWallet = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysOut = new Date(today);
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    const bills = subscriptions
      .filter((s) => s.isActive && !s.isPaused)
      .map((s) => ({
        ...s,
        nextDate: s.nextBillingDate instanceof Date ? s.nextBillingDate : new Date(s.nextBillingDate),
      }))
      .filter((s) => s.nextDate >= today && s.nextDate <= sevenDaysOut)
      .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
    const total = bills.reduce((sum, b) => sum + b.amount, 0);
    return { bills, total, count: bills.length };
  }, [subscriptions]);

  // ─── Smart wallet insight — observes liquidity patterns ───
  const smartWalletInsight = useMemo(() => {
    if (wallets.length === 0) {
      return { title: '', subtitle: '' };
    }

    const totalCredit = creditWallets.reduce((s, w) => s + (w.creditLimit || 0), 0);
    const totalCreditUsed = creditWallets.reduce((s, w) => s + (w.usedCredit || 0), 0);
    const creditUtilization = totalCredit > 0 ? totalCreditUsed / totalCredit : 0;

    // 1. High credit utilization — urgent
    if (creditUtilization >= 0.5 && totalCreditUsed > 0) {
      const worstCredit = [...creditWallets].sort((a, b) => {
        const aUtil = (a.creditLimit ?? 0) > 0 ? (a.usedCredit || 0) / (a.creditLimit ?? 1) : 0;
        const bUtil = (b.creditLimit ?? 0) > 0 ? (b.usedCredit || 0) / (b.creditLimit ?? 1) : 0;
        return bUtil - aUtil;
      })[0];
      const covered = totalBalance >= totalCreditUsed;
      return {
        title: `${worstCredit.name} is carrying ${currency} ${(worstCredit.usedCredit || 0).toFixed(0)}`,
        subtitle: covered
          ? `cash on hand covers it — clearing now avoids the interest clock.`
          : `cash on hand covers ${currency} ${Math.min(totalBalance, totalCreditUsed).toFixed(0)} of it. the rest gathers interest.`,
      };
    }

    // 2. Wallet concentration risk
    const sortedByBalance = [...bankWallets, ...ewalletWallets].sort((a, b) => b.balance - a.balance);
    const biggestShare = totalBalance > 0 && sortedByBalance.length > 0
      ? sortedByBalance[0].balance / totalBalance
      : 0;
    if (biggestShare >= 0.9 && sortedByBalance.length > 1 && totalBalance > 1000) {
      return {
        title: `most of your cash sits in ${sortedByBalance[0].name}`,
        subtitle: `${(biggestShare * 100).toFixed(0)}% of your liquid money in one place. a separate buffer makes surprises less painful.`,
      };
    }

    // 3. Idle/near-empty wallets
    const nearEmpty = [...bankWallets, ...ewalletWallets].filter((w) => w.balance < 50 && w.balance >= 0);
    if (nearEmpty.length >= 2) {
      return {
        title: `${nearEmpty.length} wallets are running near empty`,
        subtitle: `${nearEmpty.map((w) => w.name).slice(0, 2).join(' & ')}${nearEmpty.length > 2 ? ', …' : ''} — worth consolidating or topping up before they're forgotten.`,
      };
    }

    // 4. Healthy — highlight the buffer
    if (totalBalance > 500) {
      const months = totalBalance / Math.max(1500, 1); // rough baseline monthly expense
      return {
        title: `you're holding ${currency} ${totalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        subtitle: months >= 3
          ? `roughly ${months.toFixed(1)} months of runway if income stopped tomorrow. a quiet kind of power.`
          : `a starting buffer. one more month's worth makes bad weeks feel smaller.`,
      };
    }

    // 5. Default — low balance
    return {
      title: `cash reserve is thin`,
      subtitle: `a buffer worth one week of expenses turns panic into patience. start small.`,
    };
  }, [wallets, bankWallets, ewalletWallets, creditWallets, totalBalance, currency]);

  // ─── Build wallet snapshot for Echo ───
  const buildWalletSnapshot = useCallback(() => {
    const lines: string[] = [];
    const totalCreditUsed = creditWallets.reduce((s, w) => s + (w.usedCredit || 0), 0);
    const totalCredit = creditWallets.reduce((s, w) => s + (w.creditLimit || 0), 0);
    const utilization = totalCredit > 0 ? (totalCreditUsed / totalCredit) * 100 : 0;

    lines.push(`[Wallet snapshot]`);
    lines.push(`Total liquid cash: ${currency} ${totalBalance.toFixed(0)} across ${bankWallets.length + ewalletWallets.length} wallets`);
    lines.push(`Credit available: ${currency} ${totalCreditAvailable.toFixed(0)} (of ${currency} ${totalCredit.toFixed(0)} total limit)`);
    if (totalCreditUsed > 0) {
      lines.push(`Credit currently owed: ${currency} ${totalCreditUsed.toFixed(0)} (${utilization.toFixed(0)}% utilization)`);
    }
    lines.push('');

    if (bankWallets.length > 0) {
      lines.push(`Bank accounts:`);
      bankWallets.forEach((w) => {
        lines.push(`• ${w.name}${w.isDefault ? ' [default]' : ''}: ${currency} ${w.balance.toFixed(0)}`);
      });
      lines.push('');
    }
    if (ewalletWallets.length > 0) {
      lines.push(`E-wallets:`);
      ewalletWallets.forEach((w) => {
        lines.push(`• ${w.name}: ${currency} ${w.balance.toFixed(0)}`);
      });
      lines.push('');
    }
    if (creditWallets.length > 0) {
      lines.push(`Credit / BNPL:`);
      creditWallets.forEach((w) => {
        const limit = w.creditLimit || 0;
        const used = w.usedCredit || 0;
        lines.push(`• ${w.name}: ${currency} ${used.toFixed(0)} used of ${currency} ${limit.toFixed(0)} limit (${limit > 0 ? ((used / limit) * 100).toFixed(0) : 0}%)`);
      });
      lines.push('');
    }

    // Upcoming obligations
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const upcomingBills = subscriptions
      .filter((s) => s.isActive && !s.isPaused)
      .filter((s) => {
        const next = s.nextBillingDate instanceof Date ? s.nextBillingDate : new Date(s.nextBillingDate);
        return next >= now && next <= monthEnd;
      });
    if (upcomingBills.length > 0) {
      const total = upcomingBills.reduce((s, b) => s + b.amount, 0);
      lines.push(`${upcomingBills.length} bills due before month end totaling ${currency} ${total.toFixed(0)}`);
    }

    return lines.join('\n');
  }, [wallets, bankWallets, ewalletWallets, creditWallets, totalBalance, totalCreditAvailable, currency, subscriptions]);

  const handleAskEchoWallet = useCallback((specificQuestion?: string) => {
    lightTap();
    setEchoSheetVisible(false);
    const snapshot = buildWalletSnapshot();
    navigation.navigate('MoneyChat', {
      walletContext: snapshot,
      walletQuestion: specificQuestion,
    });
    setWalletChipRotation((prev) => prev + 1);
  }, [navigation, buildWalletSnapshot]);

  // ─── Greeting bubble — pool of variants, one picked fresh on each screen focus ───
  const walletGreetingPool = useMemo((): string[] => {
    if (wallets.length === 0) return [];
    const used = creditWallets.reduce((s, w) => s + (w.usedCredit || 0), 0);
    if (used > 0) {
      const amt = `${currency} ${used.toFixed(0)}`;
      return [
        `${amt} on credit — tackle it?`,
        `credit at ${amt} — want a payoff plan?`,
        `${amt} owing — shall we chip at it?`,
        `still ${amt} on credit — let's clear it`,
      ];
    }
    const bankLike = [...bankWallets, ...ewalletWallets].sort((a, b) => b.balance - a.balance);
    const biggestShare = totalBalance > 0 && bankLike.length > 0 ? bankLike[0].balance / totalBalance : 0;
    if (biggestShare >= 0.9 && bankLike.length > 1 && totalBalance > 1000) {
      return [
        `all in one pocket — split a buffer?`,
        `most of it's in one place — spread it out?`,
        `heavy in one wallet — diversify a bit?`,
        `concentrated savings — want a split plan?`,
      ];
    }
    return [
      `buffer's thin — want to build one?`,
      `cushion's low — shall we grow it?`,
      `running lean — time to pad the buffer?`,
      `not much headroom — build a buffer?`,
    ];
  }, [wallets, creditWallets, bankWallets, ewalletWallets, totalBalance, currency]);

  useFocusEffect(useCallback(() => {
    if (walletGreetingPool.length === 0) return;
    const idx = Math.floor(Math.random() * walletGreetingPool.length);
    setGreetingText(walletGreetingPool[idx]);
    setGreetingDismissed(false);

    const used = creditWallets.reduce((s, w) => s + (w.usedCredit || 0), 0);
    const bankLike = [...bankWallets, ...ewalletWallets].sort((a, b) => b.balance - a.balance);
    const biggestShare = totalBalance > 0 && bankLike.length > 0 ? bankLike[0].balance / totalBalance : 0;

    if (used > 0) {
      const amt = `${currency} ${used.toFixed(0)}`;
      setGreetingChips([
        { label: 'fastest payoff plan?', question: `I have ${amt} on credit. What's the fastest realistic payoff plan given my current cash flow?` },
        { label: "what's interest costing me?", question: `Estimate what my credit card interest might be costing me per month if I'm not paying in full. Use my balance.` },
        { label: 'pay in full or installments?', question: `Is it better to pay my credit card in full now, or spread it out? Give me the honest tradeoffs.` },
      ]);
    } else if (biggestShare >= 0.9 && bankLike.length > 1 && totalBalance > 1000) {
      setGreetingChips([
        { label: 'how should I split it?', question: `Help me figure out a better split across my wallets. What's a healthy allocation for my situation?` },
        { label: 'do I need a separate buffer?', question: `Should I keep a dedicated emergency buffer wallet, separate from my main accounts? Is my current setup fine?` },
        { label: "what's the risk here?", question: `What are the real risks of keeping most of my money concentrated in one wallet? Be specific.` },
      ]);
    } else {
      setGreetingChips([
        { label: 'how big should my buffer be?', question: `Based on my wallets and spending, what's the right emergency buffer size for me? Give me a ringgit target.` },
        { label: 'where do I start?', question: `I have a thin buffer. What's the most realistic first step to start building it, even if it's small?` },
        { label: 'how long will it take?', question: `If I set aside a small amount each month, how long would it take to build a proper emergency buffer?` },
      ]);
    }
  }, [walletGreetingPool, creditWallets, bankWallets, ewalletWallets, totalBalance, currency]));

  // ─── Header Echo button (always visible) ───
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => echoHidden ? (
        <TouchableOpacity
          onPress={() => {
            lightTap();
            if (tier !== 'premium') { setPaywallVisible(true); return; }
            setEchoHidden(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Echo assistant"
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="zap" size={20} color={tier !== 'premium' ? C.textMuted : C.textPrimary} />
        </TouchableOpacity>
      ) : null,
    });
  }, [echoHidden, tier, wallets.length, navigation, C]);

  // ─── Psychology-driven wallet chips ───
  // STING: mental accounting / reflective / loss aversion
  // SPARK: future self / identity / security
  // PLAN: implementation intentions / habit stacking
  const suggestedWalletPrompts = useMemo(() => {
    if (wallets.length === 0) return [];

    const totalCreditUsed = creditWallets.reduce((s, w) => s + (w.usedCredit || 0), 0);
    const hasCreditDebt = totalCreditUsed > 0;
    const isThin = totalBalance < 500;

    const state: 'debt' | 'thin' | 'flush' = hasCreditDebt
      ? 'debt'
      : isThin
      ? 'thin'
      : 'flush';

    type Bucket = 'sting' | 'spark' | 'plan';
    type ChipDef = { bucket: Bucket; states: ('debt' | 'thin' | 'flush')[]; build: () => { label: string; question: string } };

    const POOL: ChipDef[] = [
      // STING
      { bucket: 'sting', states: ['flush', 'thin'], build: () => ({
        label: `is any wallet just sitting idle?`,
        question: `Scan my wallets. Is any account holding money that's not really doing anything — not emergency fund, not working money? What would moving it achieve?`,
      })},
      { bucket: 'sting', states: ['debt'], build: () => ({
        label: `is credit helping or trapping me?`,
        question: `Look at my credit card usage honestly. Is credit helping me smooth my cash flow, or quietly charging me for the privilege of overspending? Be honest — use my numbers.`,
      })},
      { bucket: 'sting', states: ['debt', 'thin', 'flush'], build: () => ({
        label: `which wallet do i avoid checking?`,
        question: `Which of my accounts do I probably avoid looking at most? Help me face it — what might be lurking there (fees, neglected balance, idle credit)?`,
      })},
      { bucket: 'sting', states: ['flush'], build: () => ({
        label: `is cash quietly losing value?`,
        question: `I have ${currency} ${totalBalance.toFixed(0)} sitting across my wallets. With inflation, what's that really worth in 12 months if it just sits? Give me the honest math.`,
      })},

      // SPARK
      { bucket: 'spark', states: ['debt', 'thin', 'flush'], build: () => ({
        label: `what does a real buffer feel like?`,
        question: `If I had a real emergency buffer — say 3-6 months of expenses — what would that feel like in day-to-day life? Make it concrete, not abstract.`,
      })},
      { bucket: 'spark', states: ['flush', 'debt'], build: () => ({
        label: `am i building or just holding?`,
        question: `Looking at how my money sits right now — am I building wealth (money working), or just holding money (money parked)? Which am I leaning toward, and what's the honest next step?`,
      })},
      { bucket: 'spark', states: ['debt'], build: () => ({
        label: `who am i with credit?`,
        question: `Credit is a tool with an identity attached. Right now, am I using credit like a disciplined user or like someone catching up? Help me see which story my usage tells.`,
      })},
      { bucket: 'spark', states: ['thin'], build: () => ({
        label: `what's my 6-month number?`,
        question: `Based on my wallets and typical expenses, what would a 6-month emergency fund look like as a concrete ringgit number? Give me the target and one realistic way to start — even if it's tiny.`,
      })},
      { bucket: 'spark', states: ['debt', 'thin', 'flush'], build: () => ({
        label: `who do i want to be with money?`,
        question: `In 5 years, who do I want to be financially — a buffer builder, an investor, a conscious spender? Based on my current wallet habits, which am I actually becoming?`,
      })},

      // PLAN
      { bucket: 'plan', states: ['debt', 'thin', 'flush'], build: () => ({
        label: `next payday, who gets what?`,
        question: `Build me a clear if-then plan for the next payday: "When salary hits, RM X goes to Y first, then Z, then the rest stays in W." Use my real wallets and numbers. One clear sequence.`,
      })},
      { bucket: 'plan', states: ['debt'], build: () => ({
        label: `when to clear the credit card?`,
        question: `Given my cash position and upcoming bills, when's the right moment to clear my credit card balance — and how much? Give me a specific date and amount, with reasoning.`,
      })},
      { bucket: 'plan', states: ['debt'], build: () => ({
        label: `kill the interest — how fast?`,
        question: `Design the fastest realistic path to kill my current credit card debt without starving my daily life. Give me the trade-offs and a monthly plan.`,
      })},
      { bucket: 'plan', states: ['flush', 'debt'], build: () => ({
        label: `extra RM 500 — where should it go?`,
        question: `If I suddenly had an extra RM 500 this month, where should it go given my current wallet picture — emergency fund, credit clearing, savings goal, or something else? Rank the options with reasoning.`,
      })},
      { bucket: 'plan', states: ['thin', 'flush'], build: () => ({
        label: `cash vs card split this month?`,
        question: `Design a concrete cash vs card split for the rest of this month that reduces impulse spending but stays practical. What goes on which wallet, and why?`,
      })},
      { bucket: 'plan', states: ['flush'], build: () => ({
        label: `if i only kept 2 wallets?`,
        question: `If I could only keep 2 of my current wallets and consolidate the rest, which 2 would you keep and why? Lean into simplicity.`,
      })},
      { bucket: 'plan', states: ['thin'], build: () => ({
        label: `first RM 100 buffer — how?`,
        question: `I need to build my very first RM 100 emergency buffer. Based on my actual spending patterns, what's the fastest painless way to get there this month?`,
      })},
    ];

    const dayKey = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const stateOffset = state === 'debt' ? 7 : state === 'thin' ? 13 : 19;
    const seed = dayKey + stateOffset + walletChipRotation * 3;

    const pickFrom = (bucket: Bucket, extraOffset: number) => {
      const candidates = POOL.filter((c) => c.bucket === bucket && c.states.includes(state));
      if (candidates.length === 0) return null;
      const idx = (seed + extraOffset) % candidates.length;
      return candidates[idx].build();
    };

    return [
      pickFrom('sting', 0),
      pickFrom('spark', 1),
      pickFrom('plan', 2),
    ].filter((c): c is { label: string; question: string } => c !== null);
  }, [wallets, creditWallets, totalBalance, currency, walletChipRotation]);

  const resetForm = useCallback(() => {
    const wId = editingWalletRef.current;
    if (wId) {
      swipeRefs[wId]?.current?.reset();
      editingWalletRef.current = null;
    }
    setName('');
    setBalance('');
    setCreditLimit('');
    setSelectedIcon(WALLET_ICONS_BY_TYPE.bank[0]);
    setSelectedColor(WALLET_COLORS[0]);
    setEditingWallet(null);
    setSelectedPresetId(null);
    setAddStep('type');
    setSelectedType('bank');
    setCreditCardStep('bank');
    setSelectedCreditBank(null);
    setSelectedNetwork(null);
  }, []);

  const canAddType = useCallback((type: WalletType): boolean => {
    if (tier === 'premium') return true;
    const count = wallets.filter((w) => w.type === type).length;
    return count < FREE_TIER.maxWalletsPerType;
  }, [tier, wallets]);

  const showTypePaywall = useCallback((type: WalletType) => {
    const typeLabel = WALLET_TYPE_CONFIG[type].label;
    const remaining = (['bank', 'ewallet', 'credit'] as WalletType[])
      .filter((t) => t !== type && wallets.filter((w) => w.type === t).length < FREE_TIER.maxWalletsPerType)
      .map((t) => WALLET_TYPE_CONFIG[t].label);
    const suffix = remaining.length > 0 ? ` You can still add ${remaining.join(' and ')}.` : '';
    setPaywallReason(`You've reached your ${FREE_TIER.maxWalletsPerType} free ${typeLabel} slots.${suffix}`);
    setModalVisible(false);
    setPaywallVisible(true);
  }, [wallets]);

  const handleAdd = useCallback(() => {
    if (!canCreateWallet(wallets.length)) {
      setPaywallVisible(true);
      return;
    }
    resetForm();
    setAddStep('type');
    setModalVisible(true);
  }, [canCreateWallet, wallets.length, resetForm]);

  const handleChooseTypeAndPreset = useCallback((type: WalletType, presetId: string | null) => {
    if (!canAddType(type)) {
      if (tier === 'free') {
        showTypePaywall(type);
      }
      return;
    }
    lightTap();
    setSelectedType(type);
    const config = WALLET_TYPE_CONFIG[type];
    if (presetId) {
      const preset = WALLET_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        setSelectedPresetId(presetId);
        setName(preset.name);
        setSelectedIcon(preset.icon);
        setSelectedColor(preset.color);
      } else {
        setSelectedPresetId(null);
        setName('');
        setSelectedIcon(config.icon);
      }
    } else {
      setSelectedPresetId(null);
      setName('');
      setSelectedIcon(config.icon);
    }
    setAddStep('details');
  }, [canAddType, tier]);

  const handleEdit = useCallback((walletId: string) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    editingWalletRef.current = walletId;
    setEditingWallet(walletId);
    setSelectedType(wallet.type);
    setName(wallet.name);
    setBalance(wallet.balance.toString());
    setCreditLimit(wallet.creditLimit?.toString() || '');
    setSelectedIcon(wallet.icon);
    setSelectedColor(wallet.color);
    setSelectedPresetId(wallet.presetId || null);
    setSelectedCreditBank(wallet.creditBank || null);
    setSelectedNetwork(wallet.creditNetwork || null);
    setAddStep('details');
    setModalVisible(true);
  }, [wallets]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      Alert.alert(t.a11y.error, t.wallets.walletNameRequired);
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
        creditBank: selectedPresetId === 'credit_card' ? selectedCreditBank || undefined : undefined,
        creditNetwork: selectedPresetId === 'credit_card' ? selectedNetwork || undefined : undefined,
        creditLimit: isCredit ? limitNum : undefined,
        usedCredit: isCredit ? 0 : undefined,
      });
    }
    setModalVisible(false);
    resetForm();
  }, [name, editingWallet, selectedIcon, selectedColor, selectedType, creditLimit, balance, wallets, selectedPresetId, selectedCreditBank, selectedNetwork, updateWallet, addWallet, resetForm]);

  const handleDelete = useCallback((walletId: string) => {
    setDeleteConfirmId(walletId);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirmId) return;
    const walletId = deleteConfirmId;
    setDeleteConfirmId(null);
    const ps = usePersonalStore.getState();
    usePersonalStore.setState({
      transactions: ps.transactions.map((t) => t.walletId === walletId ? { ...t, walletId: undefined } : t),
      goals: ps.goals.map((g) => ({
        ...g,
        contributions: g.contributions.map((c) => c.walletId === walletId ? { ...c, walletId: undefined } : c),
      })),
    });
    deleteWallet(walletId);
  }, [deleteConfirmId, deleteWallet]);

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

  const handleSwipeMore = useCallback((walletId: string) => {
    lightTap();
    swipeRefs[walletId]?.current?.close();
    setActionSheetWalletId(walletId);
  }, [swipeRefs]);

  const handleSwipeDelete = useCallback((walletId: string) => {
    lightTap();
    handleDelete(walletId);
  }, [handleDelete]);

  // Transfer
  const handleTransfer = useCallback(() => {
    const amount = parseFloat(transferAmount);
    if (!transferFrom || !transferTo || !amount || amount <= 0) {
      Alert.alert(t.a11y.error, t.wallets.fillTransferDetails);
      return;
    }
    if (transferFrom === transferTo) {
      Alert.alert(t.a11y.error, t.wallets.sameWalletError);
      return;
    }
    const sourceWallet = wallets.find((w) => w.id === transferFrom);
    if (sourceWallet && amount > sourceWallet.balance) {
      Alert.alert(t.a11y.error, t.wallets.insufficientBalance);
      return;
    }
    const toWallet = wallets.find((w) => w.id === transferTo);
    transferBetweenWallets(transferFrom, transferTo, amount, transferNote || undefined);
    const now = new Date();
    const noteStr = transferNote ? ` · ${transferNote}` : '';
    addTransaction({
      amount,
      category: 'other',
      description: `Transfer to ${toWallet?.name ?? 'wallet'}${noteStr}`,
      date: now,
      type: 'expense',
      mode: 'personal',
      walletId: transferFrom,
      inputMethod: 'manual',
    });
    addTransaction({
      amount,
      category: 'other',
      description: `Transfer from ${sourceWallet?.name ?? 'wallet'}${noteStr}`,
      date: now,
      type: 'income',
      mode: 'personal',
      walletId: transferTo,
      inputMethod: 'manual',
    });
    setTransferVisible(false);
    setTransferFrom(null);
    setTransferTo(null);
    setTransferAmount('');
    setTransferNote('');
  }, [transferAmount, transferFrom, transferTo, transferNote, wallets, transferBetweenWallets, addTransaction]);

  // Repay credit
  const handleRepay = useCallback(() => {
    const amount = parseFloat(repayAmount);
    if (!repayWalletId || !repaySourceId || !amount || amount <= 0) {
      Alert.alert(t.a11y.error, t.wallets.fillRepaymentDetails);
      return;
    }
    const sourceWallet = wallets.find((w) => w.id === repaySourceId);
    if (sourceWallet && amount > sourceWallet.balance) {
      Alert.alert(t.a11y.error, t.wallets.insufficientSourceBalance);
      return;
    }
    const creditWallet = wallets.find((w) => w.id === repayWalletId);
    if (creditWallet && amount > (creditWallet.usedCredit || 0)) {
      Alert.alert(t.a11y.error, t.wallets.repaymentExceedsCredit);
      return;
    }
    repayCredit(repayWalletId, amount);
    deductFromWallet(repaySourceId, amount);
    logActivity(repaySourceId, repayWalletId, amount, 'repayment');
    addTransaction({
      amount,
      category: 'bills',
      description: t.wallets.creditRepaymentDesc.replace('{name}', creditWallet?.name ?? 'credit card'),
      date: new Date(),
      type: 'expense',
      mode: 'personal',
      walletId: repaySourceId,
      inputMethod: 'manual',
    });
    setRepayVisible(false);
    setRepayWalletId(null);
    setRepaySourceId(null);
    setRepayAmount('');
  }, [repayAmount, repayWalletId, repaySourceId, wallets, repayCredit, deductFromWallet, addTransaction, logActivity]);

  // TODO: move to action sheet in next PR
  const openRepay = useCallback((walletId: string) => {
    setRepayWalletId(walletId);
    setRepaySourceId(null);
    setRepayAmount('');
    setRepayVisible(true);
  }, []);

  const creditsWithBalance = useMemo(
    () => creditWallets.filter((w) => (w.usedCredit || 0) > 0),
    [creditWallets]
  );

  const openRepayFromActions = useCallback(() => {
    if (creditsWithBalance.length === 0) return;
    if (creditsWithBalance.length === 1) {
      lightTap();
      openRepay(creditsWithBalance[0].id);
      return;
    }
    lightTap();
    setRepayPickerVisible(true);
  }, [creditsWithBalance, openRepay]);

  const reconcileOne = useCallback((walletId: string) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    const txs = usePersonalStore.getState().transactions;
    const result = reconcileWallet(wallet, txs, 0);
    const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;
    const diffText = result.diff >= 0 ? `+${fmt(result.diff)}` : `−${fmt(Math.abs(result.diff))}`;

    Alert.alert(
      `Recalculate "${wallet.name}"?`,
      `Stored balance: ${fmt(result.storedBalance)}\n` +
      `From transactions: ${fmt(result.computedBalance)}\n` +
      `Difference: ${diffText}\n\n` +
      `This treats the wallet's starting point as 0 and re-sums every transaction. ` +
      `If your wallet had an unlogged initial deposit, the recomputed balance will be off — skip this.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Recalculate',
          style: 'destructive',
          onPress: () => {
            setWalletBalance(walletId, result.computedBalance);
          },
        },
      ],
    );
  }, [wallets, currency, setWalletBalance]);

  const closeActionSheet = useCallback(() => {
    const walletId = actionSheetWalletId;
    setActionSheetWalletId(null);
    if (walletId) {
      setTimeout(() => { swipeRefs[walletId]?.current?.close(); }, 250);
    }
  }, [actionSheetWalletId, swipeRefs]);

  const openTransferFromWallet = useCallback((walletId: string) => {
    setTransferFrom(walletId);
    setTransferTo(null);
    setTransferAmount('');
    setTransferNote('');
    setTransferVisible(true);
  }, []);

  const sheetSetDefault = useCallback((walletId: string) => {
    closeActionSheet();
    handleSetDefault(walletId);
  }, [closeActionSheet, handleSetDefault]);

  const sheetRepay = useCallback((walletId: string) => {
    closeActionSheet();
    openRepay(walletId);
  }, [closeActionSheet, openRepay]);

  const sheetTransferFrom = useCallback((walletId: string) => {
    closeActionSheet();
    openTransferFromWallet(walletId);
  }, [closeActionSheet, openTransferFromWallet]);

  const sheetEdit = useCallback((walletId: string) => {
    closeActionSheet();
    handleEdit(walletId);
  }, [closeActionSheet, handleEdit]);

  const sheetRecalc = useCallback((walletId: string) => {
    closeActionSheet();
    reconcileOne(walletId);
  }, [closeActionSheet, reconcileOne]);

  const sheetDelete = useCallback((walletId: string) => {
    closeActionSheet();
    handleDelete(walletId);
  }, [closeActionSheet, handleDelete]);

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
    () => wallets.filter((w) => w.id !== transferFrom && w.type !== 'credit'),
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

    const renderRightActions = (
      _prog: SharedValue<number>,
      drag: SharedValue<number>,
      swipeable: SwipeableMethods,
    ) => (
      <WalletSwipeAction
        variant="more"
        direction="right"
        drag={drag}
        label={t.a11y.menu}
        styles={styles}
        onTap={() => {
          swipeable.close();
          handleSwipeMore(wallet.id);
        }}
        onHardSwipe={() => {
          swipeable.close();
          handleSwipeMore(wallet.id);
        }}
      />
    );

    const renderLeftActions = (
      _prog: SharedValue<number>,
      drag: SharedValue<number>,
      swipeable: SwipeableMethods,
    ) => (
      <WalletSwipeAction
        variant="delete"
        direction="left"
        drag={drag}
        label={t.common.delete}
        styles={styles}
        onTap={() => {
          handleSwipeDelete(wallet.id);
        }}
        onHardSwipe={() => {
          handleSwipeDelete(wallet.id);
        }}
      />
    );

    return (
      <ReanimatedSwipeable
        key={wallet.id}
        ref={getSwipeRef(wallet.id)}
        renderRightActions={renderRightActions}
        renderLeftActions={renderLeftActions}

        friction={1.2}
        rightThreshold={48}
        leftThreshold={48}
        overshootRight
        overshootLeft
        overshootFriction={2}
        dragOffsetFromLeftEdge={15}
        dragOffsetFromRightEdge={15}
        animationOptions={{ mass: 0.5, damping: 24, stiffness: 420, overshootClamping: true }}
      >
        <Card style={styles.walletCard}>
          <View>
          <View style={styles.walletRow}>
            <View style={styles.walletIcon}>
              {wallet.presetId ? (
                <WalletLogo wallet={wallet} size={40} />
              ) : (
                <Feather
                  name={wallet.icon as keyof typeof Feather.glyphMap}
                  size={24}
                  color={wallet.color}
                />
              )}
            </View>
            <View style={styles.walletInfo}>
              <View style={styles.walletNameRow}>
                <Text style={styles.walletName}>{wallet.name}</Text>
                {wallet.isDefault && (
                  <View style={[styles.defaultBadge, { backgroundColor: withAlpha(wallet.color, 0.1) }]}>
                    <Text style={[styles.defaultBadgeText, { color: wallet.color }]}>{t.wallets.defaultWallet}</Text>
                  </View>
                )}
              </View>
              {isCredit ? (
                <View style={styles.creditInfo}>
                  <Text style={styles.creditUsageText} numberOfLines={1}>
                    {currency} {usedCredit.toFixed(2)} / {currency} {creditLimitVal.toFixed(2)}
                  </Text>
                  <View style={styles.creditBar}>
                    <View
                      style={[
                        styles.creditBarFill,
                        {
                          width: `${Math.min(usedPercent, 100)}%`,
                          backgroundColor: usedPercent > 80 ? C.bronze : wallet.color,
                        },
                      ]}
                    />
                  </View>
                </View>
              ) : (
                <Text style={styles.walletBalance}>
                  {currency} {wallet.balance.toFixed(2)}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.starBtn}
              onPress={wallet.isDefault ? undefined : () => handleSetDefault(wallet.id)}
              activeOpacity={wallet.isDefault ? 1 : 0.7}
              hitSlop={HITSLOP_10}
              accessibilityRole="button"
              accessibilityLabel={wallet.isDefault ? t.a11y.starUnset : t.a11y.starSet}
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
                  color={wallet.isDefault ? wallet.color : C.border}
                />
              </Animated.View>
            </TouchableOpacity>
          </View>
          </View>
        </Card>
      </ReanimatedSwipeable>
    );
  }, [currency, getStarAnim, handleSetDefault, handleSwipeMore, handleSwipeDelete, getSwipeRef, t, styles, C]);

  const renderTypeSection = useCallback((type: WalletType, walletList: Wallet[]) => {
    if (walletList.length === 0) return null;
    const config = WALLET_TYPE_CONFIG[type];
    return (
      <View key={type} style={styles.typeSection}>
        <View style={styles.typeSectionHeader}>
          <Feather name={config.icon as keyof typeof Feather.glyphMap} size={16} color={C.textSecondary} />
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
        {(() => {
          return (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t.wallets.cashBalance}</Text>
              <Text style={styles.summaryAmountLine}>
                <Text style={styles.summaryAmountPrefix}>{currency} </Text>
                <Text style={styles.summaryAmountInt}>{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </Text>
              {creditWallets.length > 0 && (
                <Text style={styles.summaryCreditLine}>
                  <Text style={styles.summaryCreditLabel}>{t.wallets.creditAvailable} </Text>
                  <Text style={styles.summaryCreditValue}>
                    {currency} {totalCreditAvailable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </Text>
              )}
              {totalCreditUsed > 0 && (
                <Text style={styles.netWorthLine}>
                  <Text style={styles.netWorthLabel}>{t.wallets.cashAfterCreditUsed} </Text>
                  <Text style={styles.netWorthValue}>
                    {currency} {netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </Text>
              )}
              <View style={styles.summaryFooter}>
                <Text style={[
                  styles.walletCountText,
                  tier === 'free' && wallets.length >= FREE_TIER.maxWallets - 1 && { color: '#B2780A', fontWeight: TYPOGRAPHY.weight.semibold },
                ]}>
                  {wallets.length}{tier === 'free' ? `/${FREE_TIER.maxWallets}` : ''} {t.wallets.walletsSuffix}
                </Text>
                {upcomingBillsWallet.count > 0 && (
                  <TouchableOpacity
                    onPress={() => { lightTap(); setBillsModalVisible(true); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${upcomingBillsWallet.count} bills due this week`}
                    style={styles.summaryBillsBlock}
                  >
                    <Text style={styles.summaryBillsAmount}>
                      {currency} {upcomingBillsWallet.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={styles.summaryBillsLabel}>
                      {(upcomingBillsWallet.count > 1 ? t.wallets.billsThisWeekPlural : t.wallets.billsThisWeek).replace('{n}', String(upcomingBillsWallet.count))}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })()}

        {/* Quick actions */}
        {wallets.length > 0 && (() => {
          const transferEnabled = wallets.length >= 2;
          const repayEnabled = creditsWithBalance.length > 0;
          return (
            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtnOutline,
                  !transferEnabled && styles.actionBtnOutlineDisabled,
                  pressed && transferEnabled && styles.actionBtnOutlinePressed,
                ]}
                onPress={() => { lightTap(); setTransferVisible(true); }}
                disabled={!transferEnabled}
                accessibilityRole="button"
                accessibilityLabel={t.wallets.transfer}
                accessibilityState={{ disabled: !transferEnabled }}
              >
                <Feather name="repeat" size={16} color={C.accent} />
                <Text style={styles.actionBtnOutlineLabel}>{t.wallets.transfer}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtnOutline,
                  !repayEnabled && styles.actionBtnOutlineDisabled,
                  pressed && repayEnabled && styles.actionBtnOutlinePressed,
                ]}
                onPress={openRepayFromActions}
                disabled={!repayEnabled}
                accessibilityRole="button"
                accessibilityLabel={t.wallets.repayCredit}
                accessibilityState={{ disabled: !repayEnabled }}
              >
                <Feather name="corner-down-left" size={16} color={C.accent} />
                <Text style={styles.actionBtnOutlineLabel}>{t.wallets.repayCredit}</Text>
              </Pressable>
            </View>
          );
        })()}

        {/* Wallet List — Grouped by Type */}
        {wallets.length === 0 ? (
          <EmptyState
            icon="credit-card"
            title={t.wallets.noWalletsYet}
            message={t.wallets.createFirstWallet}
            actionLabel={t.wallets.createWallet}
            onAction={handleAdd}
          />
        ) : (
          <View style={styles.walletList}>
            {listReady && renderTypeSection('bank', bankWallets)}
            {listReady && renderTypeSection('ewallet', ewalletWallets)}
            {listReady && renderTypeSection('credit', creditWallets)}
          </View>
        )}

        {/* Recent Activity */}
        {recentTransfers.length > 0 && (
          <View style={styles.transfersSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
              <Text style={styles.transfersSectionTitle}>{t.wallets.recentActivity}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('TransactionsList' as any)} activeOpacity={0.7}>
                <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.accent, fontWeight: TYPOGRAPHY.weight.medium }}>{t.wallets.seeAll}</Text>
              </TouchableOpacity>
            </View>
            {recentTransfers.map((item) => {
              const isRepayment = item.kind === 'repayment';
              return (
              <TouchableOpacity
                key={item.id}
                style={styles.transferRow}
                onLongPress={() => {
                  lightTap();
                  Alert.alert(
                    isRepayment ? t.wallets.deleteRepayment : t.wallets.deleteTransfer,
                    `${getWalletName(item.fromWalletId)} → ${getWalletName(item.toWalletId)} · ${currency} ${item.amount.toFixed(2)}${isRepayment ? '' : '\n\n' + t.wallets.bothBalancesReversed}`,
                    [
                      { text: t.common.cancel, style: 'cancel' },
                      {
                        text: t.common.delete,
                        style: 'destructive',
                        onPress: () => deleteTransfer(item.id),
                      },
                    ],
                  );
                }}
                delayLongPress={400}
              >
                <Feather
                  name={isRepayment ? 'corner-down-left' : 'repeat'}
                  size={14}
                  color={isRepayment ? C.accent : C.textMuted}
                />
                <View style={styles.transferInfo}>
                  <Text style={styles.transferDesc}>
                    {isRepayment
                      ? `${t.wallets.repaidPrefix} ${getWalletName(item.toWalletId)}`
                      : `${getWalletName(item.fromWalletId)} → ${getWalletName(item.toWalletId)}`}
                  </Text>
                  <Text style={styles.transferTimestamp}>
                    {(() => {
                      const d = item.date instanceof Date ? item.date : new Date(item.date);
                      const today = new Date();
                      void today;
                      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
                    })()}
                  </Text>
                  {item.note && <Text style={styles.transferNote}>{item.note}</Text>}
                </View>
                <Text style={styles.transferAmt}>
                  {currency} {item.amount.toFixed(2)}
                </Text>
              </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Bottom Bar: Add */}
      {wallets.length > 0 ? (
        <View style={styles.addBtnContainer}>
          <Button
            title={t.wallets.addWallet}
            onPress={handleAdd}
            icon="plus"
            size="large"
          />
        </View>
      ) : null}

      {/* ─── Add/Edit Modal ─────────────────────────────────── */}
      {modalVisible && (
      <Modal
        visible
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <Pressable
          style={addStep === 'details' || editingWallet ? styles.modalOverlay : [styles.floatingOverlay, styles.typePickerOverlay]}
          onPress={() => { setModalVisible(false); resetForm(); }}
        >
          <View
            style={addStep === 'details' || editingWallet ? styles.modalContent : [styles.floatingContent, addStep === 'credit_card' && creditCardStep === 'bank' ? styles.typePickerContent : styles.typePickerContent]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingWallet ? t.wallets.editWallet : addStep === 'type' ? t.wallets.addWallet : addStep === 'credit_card' ? (creditCardStep === 'network' ? t.wallets.visaOrMastercard : t.wallets.whichBank) : t.wallets.walletDetails}
              </Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Feather name="x" size={22} color={C.textPrimary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}>
              {/* Step 1: Choose Type + Provider */}
              {addStep === 'type' && !editingWallet && (
                <GestureDetector gesture={typeSwipeGesture}>
                <View>
                  {/* Type tabs */}
                  <View style={styles.typeTabs}>
                    {(['bank', 'ewallet', 'credit'] as WalletType[]).map((type) => {
                      const canAdd = canAddType(type);
                      const isActive = selectedType === type;
                      return (
                        <TouchableOpacity
                          key={type}
                          style={[styles.typeTab, isActive && styles.typeTabActive]}
                          onPress={() => goToType(type)}
                          activeOpacity={0.75}
                          accessibilityRole="tab"
                        >
                          <Text style={[styles.typeTabText, isActive && styles.typeTabTextActive]}>
                            {WALLET_TYPE_CONFIG[type].label.split(' ')[0]}
                          </Text>
                          {!canAdd && <Feather name="lock" size={9} color={isActive ? C.textSecondary : C.textMuted} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Sliding rail — bank / ewallet / credit panels */}
                  <View
                    style={{ overflow: 'hidden' }}
                    onLayout={(e) => {
                      const w = e.nativeEvent.layout.width;
                      panelWidthRef.current = w;
                      if (panelWidth === 0) setPanelWidth(w);
                    }}
                  >
                    {panelWidth > 0 && (
                      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: typeRailX }] }}>
                        {(['bank', 'ewallet', 'credit'] as WalletType[]).map((panelType) => (
                          <View key={panelType} style={{ width: panelWidth }}>
                            <ScrollView style={{ maxHeight: 332 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                              <View style={styles.providerGrid}>
                                {WALLET_PRESETS.filter((p) => p.type === panelType && p.id !== 'credit_card').map((preset) => {
                                  const logo = BANK_LOGOS[preset.id];
                                  return (
                                    <TouchableOpacity
                                      key={preset.id}
                                      style={[
                                        styles.providerTile,
                                        logo
                                          ? { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1 }
                                          : { backgroundColor: withAlpha(preset.color, 0.07), borderTopColor: preset.color, borderTopWidth: 2 },
                                      ]}
                                      onPress={() => {
                                        if (!canAddType(panelType)) { showTypePaywall(panelType); return; }
                                        handleChooseTypeAndPreset(panelType, preset.id);
                                      }}
                                      activeOpacity={0.7}
                                      accessibilityRole="button"
                                    >
                                      {logo ? (
                                        <ExpoImage
                                          source={logo}
                                          style={LOGO_SIZE[preset.id]
                                            ? { width: LOGO_SIZE[preset.id][0], height: LOGO_SIZE[preset.id][1] }
                                            : styles.providerLogo}
                                          contentFit="contain"
                                          cachePolicy="memory-disk"
                                          transition={0}
                                        />
                                      ) : (
                                        <Text style={styles.providerName} numberOfLines={2}>{preset.name}</Text>
                                      )}
                                    </TouchableOpacity>
                                  );
                                })}
                                {panelType === 'credit' && (
                                  <TouchableOpacity
                                    style={[styles.providerTile, { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1 }]}
                                    onPress={() => {
                                      if (!canAddType('credit')) { showTypePaywall('credit'); return; }
                                      lightTap();
                                      setCreditCardStep('network');
                                      setSelectedCreditBank(null);
                                      setSelectedNetwork(null);
                                      setAddStep('credit_card');
                                    }}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                  >
                                    <ExpoImage source={BANK_LOGOS['credit_card']} style={styles.providerLogo} contentFit="contain" cachePolicy="memory-disk" transition={0} />
                                    <Text style={[styles.providerName, { marginTop: 4, fontSize: 11 }]}>{t.wallets.creditCardLabel}</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </ScrollView>
                            <TouchableOpacity
                              style={styles.otherOption}
                              onPress={() => {
                                if (!canAddType(panelType)) { showTypePaywall(panelType); return; }
                                handleChooseTypeAndPreset(panelType, null);
                              }}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                            >
                              <Text style={styles.otherOptionText}>{t.wallets.enterManually}</Text>
                              <Feather name="arrow-right" size={13} color={C.textMuted} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </Animated.View>
                    )}
                  </View>
                </View>
                </GestureDetector>
              )}

              {/* Step 2: Credit Card bank + network picker */}
              {addStep === 'credit_card' && (
                <GestureDetector gesture={creditCardBackGesture}>
                <View>
                  <TouchableOpacity style={styles.backBtn} onPress={() => {
                    if (creditCardStep === 'bank') { setCreditCardStep('network'); } else { setAddStep('type'); setSelectedType('credit'); }
                  }}>
                    <Feather name="arrow-left" size={18} color={C.textSecondary} />
                    <Text style={styles.backBtnText}>{creditCardStep === 'bank' ? 'Change network' : 'Back'}</Text>
                  </TouchableOpacity>

                  {creditCardStep === 'network' && (
                    <View style={[styles.providerGrid, { justifyContent: 'center' }]}>
                      {(['visa', 'mastercard', 'amex'] as const).map((network) => (
                        <TouchableOpacity
                          key={network}
                          style={[styles.providerTile, { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, width: '30%' }]}
                          onPress={() => {
                            lightTap();
                            setSelectedNetwork(network);
                            setCreditCardStep('bank');
                          }}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                        >
                          <ExpoImage source={CARD_NETWORK_LOGOS[network]} style={styles.providerLogo} contentFit="contain" cachePolicy="memory-disk" transition={0} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {creditCardStep === 'bank' && (
                    <ScrollView style={{ maxHeight: 332 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    <View style={styles.providerGrid}>
                      {WALLET_PRESETS.filter((p) => p.type === 'bank').map((preset) => {
                        const logo = BANK_LOGOS[preset.id];
                        return (
                          <TouchableOpacity
                            key={preset.id}
                            style={[styles.providerTile, { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1 }]}
                            onPress={() => {
                              lightTap();
                              const networkLabel = selectedNetwork === 'visa' ? 'Visa' : selectedNetwork === 'mastercard' ? 'Mastercard' : 'Amex';
                              setSelectedCreditBank(preset.id);
                              setSelectedType('credit');
                              setSelectedPresetId('credit_card');
                              setName(`${preset.name} ${networkLabel}`);
                              setSelectedColor(preset.color);
                              setSelectedIcon('credit-card');
                              setAddStep('details');
                            }}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                          >
                            {logo ? (
                              <ExpoImage
                                source={logo}
                                style={LOGO_SIZE[preset.id] ? { width: LOGO_SIZE[preset.id][0], height: LOGO_SIZE[preset.id][1] } : styles.providerLogo}
                                contentFit="contain"
                                cachePolicy="memory-disk"
                                transition={0}
                              />
                            ) : (
                              <Text style={styles.providerName} numberOfLines={2}>{preset.name}</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    </ScrollView>
                  )}
                </View>
                </GestureDetector>
              )}

              {/* Step 3: Details */}
              {addStep === 'details' && (
                <View>
                  {/* Back button (only for new wallets) */}
                  {!editingWallet && (
                    <TouchableOpacity
                      style={styles.backBtn}
                      onPress={() => selectedNetwork ? setAddStep('credit_card') : setAddStep('type')}
                    >
                      <Feather name="arrow-left" size={18} color={C.textSecondary} />
                      <Text style={styles.backBtnText}>{t.common.back}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Wallet Name */}
                  <Text style={styles.formLabelCompact}>{t.wallets.walletName}</Text>
                  <View style={styles.nameInputRow}>
                    <TextInput
                      style={styles.nameInput}
                      value={name}
                      onChangeText={setName}
                      placeholder={`e.g. ${WALLET_TYPE_CONFIG[selectedType].label}`}
                      placeholderTextColor={C.neutral}
                    />
                  </View>

                  {/* Amount */}
                  <Text style={styles.formLabelCompact}>
                    {selectedType === 'credit' ? t.wallets.creditLimit : editingWallet ? t.wallets.currentBalance : t.wallets.initialBalance2}
                  </Text>
                  <View style={styles.amountInputRow}>
                    <Text style={styles.amountCurrencyLabel}>{currency}</Text>
                    <TextInput
                      style={styles.amountInputLarge}
                      value={selectedType === 'credit' ? creditLimit : balance}
                      onChangeText={selectedType === 'credit' ? setCreditLimit : setBalance}
                      placeholder="0.00"
                      placeholderTextColor={C.neutral}
                      keyboardType="decimal-pad"
                    />
                  </View>

                  {/* Icon + Color */}
                  {selectedPresetId === 'credit_card' && selectedCreditBank && selectedNetwork ? (
                    <View>
                      <Text style={styles.formLabelCompact}>{t.wallets.cardLabel}</Text>
                      <View style={[styles.logoPreviewBox, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                        <Image source={BANK_LOGOS[selectedCreditBank]} style={{ width: 70, height: 36 }} resizeMode="contain" />
                        <Text style={{ color: C.border, fontSize: 18 }}>|</Text>
                        <Image source={CARD_NETWORK_LOGOS[selectedNetwork]} style={{ width: 48, height: 30 }} resizeMode="contain" />
                      </View>
                    </View>
                  ) : selectedPresetId && BANK_LOGOS[selectedPresetId] ? (
                    <View>
                      <Text style={styles.formLabelCompact}>{t.wallets.iconLabel}</Text>
                      <View style={styles.logoPreviewBox}>
                        <Image source={BANK_LOGOS[selectedPresetId]} style={styles.logoPreview} resizeMode="contain" />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.pickerRow}>
                      <View style={styles.pickerCol}>
                        <Text style={styles.formLabelCompact}>{t.wallets.iconLabel}</Text>
                        <View style={styles.pickerGrid}>
                          {WALLET_ICONS_BY_TYPE[selectedType].map((icon) => (
                            <TouchableOpacity
                              key={icon}
                              style={[styles.pickerItem, selectedIcon === icon && { backgroundColor: withAlpha(selectedColor, 0.15), borderColor: selectedColor }]}
                              onPress={() => { lightTap(); setSelectedIcon(icon); }}
                            >
                              <Feather name={icon as keyof typeof Feather.glyphMap} size={20} color={selectedIcon === icon ? selectedColor : C.textSecondary} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                      <View style={styles.pickerCol}>
                        <Text style={styles.formLabelCompact}>{t.wallets.colorLabel}</Text>
                        <View style={styles.pickerGrid}>
                          {WALLET_COLORS.map((color) => (
                            <TouchableOpacity
                              key={color}
                              style={[styles.colorItem, { backgroundColor: color }, selectedColor === color && styles.colorSelected]}
                              onPress={() => { lightTap(); setSelectedColor(color); }}
                            >
                              {selectedColor === color && <Feather name="check" size={14} color="#fff" />}
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </KeyboardAwareScrollView>

            {addStep === 'details' && (
              <Button
                title={editingWallet ? t.wallets.saveChanges : t.wallets.createWallet}
                onPress={handleSave}
                size="large"
                icon={editingWallet ? 'check' : 'plus'}
                style={styles.saveBtn}
              />
            )}
          </View>
        </Pressable>
      </Modal>
      )}

      {/* ─── Transfer Modal ─────────────────────────────────── */}
      {transferVisible && (
      <Modal
        visible
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setTransferVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setTransferVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.wallets.transfer}</Text>
              <TouchableOpacity onPress={() => setTransferVisible(false)}>
                <Feather name="x" size={22} color={C.textPrimary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}>
              <Text style={styles.formLabel}>{t.wallets.from}</Text>
              <View style={styles.walletSelectGrid}>
                {nonCreditWallets.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.walletSelectItem, transferFrom === w.id && { borderColor: w.color, backgroundColor: withAlpha(w.color, 0.08) }]}
                    onPress={() => { lightTap(); setTransferFrom(w.id); }}
                  >
                    <WalletLogo wallet={w} size={24} />
                    <View style={{ flexShrink: 1 }}>
                      <Text style={[styles.walletSelectName, transferFrom === w.id && { color: w.color }]} numberOfLines={1}>{w.name}</Text>
                      <Text style={styles.walletSelectBal}>{currency} {w.balance.toFixed(2)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>{t.wallets.to}</Text>
              <View style={styles.walletSelectGrid}>
                {transferToWallets.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.walletSelectItem, transferTo === w.id && { borderColor: w.color, backgroundColor: withAlpha(w.color, 0.08) }]}
                    onPress={() => { lightTap(); setTransferTo(w.id); }}
                  >
                    <WalletLogo wallet={w} size={24} />
                    <View style={{ flexShrink: 1 }}>
                      <Text style={[styles.walletSelectName, transferTo === w.id && { color: w.color }]} numberOfLines={1}>{w.name}</Text>
                      <Text style={styles.walletSelectBal}>{currency} {w.balance.toFixed(2)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>{t.wallets.amount}</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.amountCurrencyLabel}>{currency}</Text>
                <TextInput
                  style={styles.amountInputLarge}
                  value={transferAmount}
                  onChangeText={setTransferAmount}
                  placeholder="0.00"
                  placeholderTextColor={C.neutral}
                  keyboardType="decimal-pad"
                />
              </View>

              {(() => {
                const amt = parseFloat(transferAmount);
                const fromW = wallets.find((w) => w.id === transferFrom);
                const toW = wallets.find((w) => w.id === transferTo);
                if (!fromW || !toW || !amt || amt <= 0) return null;
                const fromAfter = fromW.balance - amt;
                const toAfter = toW.balance + amt;
                return (
                  <View style={styles.transferPreview}>
                    <View style={styles.transferPreviewRow}>
                      <WalletLogo wallet={fromW} size={16} />
                      <Text style={styles.transferPreviewName} numberOfLines={1}>{fromW.name}</Text>
                      <Text style={styles.transferPreviewBefore}>{currency} {fromW.balance.toFixed(2)}</Text>
                      <Text style={styles.transferPreviewArrow}>→</Text>
                      <Text style={[styles.transferPreviewAfter, fromAfter < 0 && { color: '#C1694F' }]}>{currency} {fromAfter.toFixed(2)}</Text>
                    </View>
                    <View style={styles.transferPreviewRow}>
                      <WalletLogo wallet={toW} size={16} />
                      <Text style={styles.transferPreviewName} numberOfLines={1}>{toW.name}</Text>
                      <Text style={styles.transferPreviewBefore}>{currency} {toW.balance.toFixed(2)}</Text>
                      <Text style={styles.transferPreviewArrow}>→</Text>
                      <Text style={[styles.transferPreviewAfter, { color: C.positive }]}>{currency} {toAfter.toFixed(2)}</Text>
                    </View>
                  </View>
                );
              })()}

              <Text style={styles.formLabel}>{t.wallets.noteOptional}</Text>
              <View style={styles.nameInputRow}>
                <TextInput
                  style={styles.nameInput}
                  value={transferNote}
                  onChangeText={setTransferNote}
                  placeholder={t.wallets.topUpPlaceholder}
                  placeholderTextColor={C.neutral}
                />
              </View>
            </KeyboardAwareScrollView>

            <Button
              title={t.wallets.transfer}
              onPress={handleTransfer}
              size="large"
              icon="repeat"
              style={styles.saveBtn}
            />
          </View>
        </Pressable>
      </Modal>
      )}

      {/* ─── Repay Credit Modal ─────────────────────────────── */}
      {repayVisible && (
      <Modal
        visible
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRepayVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRepayVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.wallets.repayCredit}</Text>
              <TouchableOpacity onPress={() => setRepayVisible(false)}>
                <Feather name="x" size={22} color={C.textPrimary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}>
              {repayWalletId && (() => {
                const cw = wallets.find((w) => w.id === repayWalletId);
                if (!cw) return null;
                return (
                  <View style={styles.repayHeader}>
                    <View style={[styles.repayIconBg, { backgroundColor: cw.presetId ? C.background : withAlpha(cw.color, 0.15) }]}>
                      <WalletLogo wallet={cw} size={40} />
                    </View>
                    <View>
                      <Text style={styles.repayName}>{cw.name}</Text>
                      <Text style={styles.repayUsed}>
                        {t.wallets.usedPrefix} {currency} {(cw.usedCredit || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              <Text style={styles.formLabel}>{t.wallets.repaymentAmount}</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.amountCurrencyLabel}>{currency}</Text>
                <TextInput
                  style={styles.amountInputLarge}
                  value={repayAmount}
                  onChangeText={setRepayAmount}
                  placeholder="0.00"
                  placeholderTextColor={C.neutral}
                  keyboardType="decimal-pad"
                />
              </View>

              <Text style={styles.formLabel}>{t.wallets.payFrom}</Text>
              <View style={styles.walletSelectGrid}>
                {nonCreditWallets.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.walletSelectItem, repaySourceId === w.id && { borderColor: w.color, backgroundColor: withAlpha(w.color, 0.08) }]}
                    onPress={() => { lightTap(); setRepaySourceId(w.id); }}
                  >
                    <WalletLogo wallet={w} size={24} />
                    <Text style={[styles.walletSelectName, repaySourceId === w.id && { color: w.color }]} numberOfLines={1}>{w.name}</Text>
                    <Text style={styles.walletSelectBal}>{currency} {w.balance.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </KeyboardAwareScrollView>

            <Button
              title={t.wallets.repay}
              onPress={handleRepay}
              size="large"
              icon="corner-down-left"
              style={styles.saveBtn}
            />
          </View>
        </Pressable>
      </Modal>
      )}

      {/* ─── Wallet Action Sheet ────────────────────────────── */}
      {actionSheetWalletId && (() => {
        const aw = wallets.find((w) => w.id === actionSheetWalletId);
        if (!aw) return null;
        const isCredit = aw.type === 'credit';
        const usedCredit = aw.usedCredit || 0;
        const currentDefault = wallets.find((w) => w.isDefault);
        const canTransferFrom = wallets.length >= 2;
        return (
          <Modal
            visible
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={closeActionSheet}
          >
            <Pressable style={styles.modalOverlay} onPress={closeActionSheet}>
              <View style={styles.sheetContent} onStartShouldSetResponder={() => true}>
                <View style={styles.sheetHeader}>
                  <View style={[styles.sheetWalletIcon, { backgroundColor: aw.presetId ? C.background : withAlpha(aw.color, 0.15) }]}>
                    <WalletLogo wallet={aw} size={44} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetWalletName} numberOfLines={1}>{aw.name}</Text>
                    <Text style={styles.sheetWalletSub} numberOfLines={1}>
                      {isCredit
                        ? `${currency} ${usedCredit.toFixed(2)} / ${currency} ${(aw.creditLimit || 0).toFixed(2)} used`
                        : `${currency} ${aw.balance.toFixed(2)}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={closeActionSheet}
                    hitSlop={HITSLOP_10}
                    accessibilityRole="button"
                    accessibilityLabel={t.a11y.close}
                  >
                    <Feather name="x" size={22} color={C.textPrimary} />
                  </TouchableOpacity>
                </View>

                {!aw.isDefault && (
                  <TouchableOpacity
                    style={styles.sheetRow}
                    onPress={() => sheetSetDefault(aw.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t.wallets.setAsDefault}
                  >
                    <Feather name="star" size={20} color={C.textSecondary} />
                    <Text style={styles.sheetRowLabel}>{t.wallets.setAsDefault}</Text>
                    {currentDefault && (
                      <Text style={styles.sheetRowHint} numberOfLines={1}>
                        {t.wallets.currentlyDefault} {currentDefault.name}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

                {isCredit && usedCredit > 0 && (
                  <TouchableOpacity
                    style={styles.sheetRow}
                    onPress={() => sheetRepay(aw.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t.wallets.repayCredit}
                  >
                    <Feather name="corner-down-left" size={20} color={C.textSecondary} />
                    <Text style={styles.sheetRowLabel}>{t.wallets.repayCredit}</Text>
                    <Text style={styles.sheetRowHint}>
                      {currency} {usedCredit.toFixed(2)} {t.wallets.owedSuffix}
                    </Text>
                  </TouchableOpacity>
                )}

                {!isCredit && canTransferFrom && (
                  <TouchableOpacity
                    style={styles.sheetRow}
                    onPress={() => sheetTransferFrom(aw.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t.wallets.transferFromHere}
                  >
                    <Feather name="repeat" size={20} color={C.textSecondary} />
                    <Text style={styles.sheetRowLabel}>{t.wallets.transferFromHere}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={() => sheetEdit(aw.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t.wallets.editDetails}
                >
                  <Feather name="edit-2" size={20} color={C.textSecondary} />
                  <Text style={styles.sheetRowLabel}>{t.wallets.editDetails}</Text>
                </TouchableOpacity>

                {!isCredit && (
                  <TouchableOpacity
                    style={styles.sheetRow}
                    onPress={() => sheetRecalc(aw.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t.wallets.recalculateBalance}
                  >
                    <Feather name="refresh-cw" size={20} color={C.textSecondary} />
                    <Text style={styles.sheetRowLabel}>{t.wallets.recalculateBalance}</Text>
                    <Text style={styles.sheetRowHint}>{t.wallets.fromTransactions}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={() => sheetDelete(aw.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t.wallets.deleteWalletAction}
                >
                  <Feather name="trash-2" size={20} color={C.neutral} />
                  <Text style={[styles.sheetRowLabel, { color: C.neutral }]}>{t.wallets.deleteWalletAction}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>
        );
      })()}

      {/* ── Bills this week — float preview modal ── */}
      {billsModalVisible && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setBillsModalVisible(false)}
        >
          <Pressable style={styles.floatingOverlay} onPress={() => setBillsModalVisible(false)}>
            <View style={styles.floatingContent} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t.wallets.billsThisWeekTitle}</Text>
                <TouchableOpacity onPress={() => setBillsModalVisible(false)} hitSlop={HITSLOP_10}>
                  <Feather name="x" size={20} color={C.textPrimary} />
                </TouchableOpacity>
              </View>
              {upcomingBillsWallet.bills.map((b, i) => {
                const day = b.nextDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                return (
                  <View key={b.id ?? i} style={styles.billRow}>
                    <View style={styles.billRowLeft}>
                      <Text style={styles.billRowName}>{b.name}</Text>
                      <Text style={styles.billRowDate}>{day}</Text>
                    </View>
                    <Text style={styles.billRowAmount}>{currency} {b.amount.toFixed(2)}</Text>
                  </View>
                );
              })}
              <View style={styles.billsTotalRow}>
                <Text style={styles.billsTotalLabel}>total</Text>
                <Text style={styles.billsTotalAmount}>{currency} {upcomingBillsWallet.total.toFixed(2)}</Text>
              </View>
              <Button
                title={t.wallets.manageBills}
                variant="outline"
                icon="list"
                onPress={() => { setBillsModalVisible(false); setTimeout(() => navigation.navigate('SubscriptionList'), 50); }}
                style={{ marginTop: SPACING.md }}
              />
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Paywall */}
      <PaywallModal
        visible={paywallVisible}
        onClose={() => { setPaywallVisible(false); setPaywallReason(undefined); }}
        feature="wallet"
        currentUsage={wallets.length}
        reason={paywallReason}
      />
      {/* ── Echo FAB + Greeting bubble (draggable, default top-right) ── */}
      {wallets.length > 0 && !echoHidden && !modalVisible && !echoSheetVisible && !billsModalVisible && smartWalletInsight.title ? (
        <Animated.View
          style={[
            styles.walletEchoFabContainer,
            fabSide === 'right'
              ? { right: SPACING.xl, flexDirection: 'row-reverse' }
              : { left: SPACING.xl, flexDirection: 'row' },
            { top: Math.max(insets.top, 20) + 80 },
            { transform: echoFabPan.getTranslateTransform() },
          ]}
          {...echoFabPanResponder.panHandlers}
        >
          {/* FAB always first in JSX — flexDirection positions it left or right */}
          <TouchableOpacity
            style={styles.walletEchoFab}
            onPress={() => { lightTap(); if (tier !== 'premium') { setPaywallVisible(true); return; } setEchoAutoPrompt(undefined); setEchoSheetVisible(true); setGreetingDismissed(true); }}
            onLongPress={() => {
              lightTap();
              Alert.alert(t.wallets.hideEchoTitle, t.wallets.hideEchoMsg, [
                { text: t.common.cancel, style: 'cancel' },
                { text: t.wallets.hideEchoAction, onPress: () => setEchoHidden(true) },
              ]);
            }}
            delayLongPress={500}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open Echo assistant (hold to hide)"
          >
            <Feather name="zap" size={22} color="#fff" />
            {tier !== 'premium' && (
              <View style={styles.echoFabLock}>
                <Feather name="lock" size={9} color="#fff" />
              </View>
            )}
            <View style={styles.walletEchoFabPulse} />
          </TouchableOpacity>
          {greetingText && !greetingDismissed && !greetingHiddenDuringDrag && (
            <TouchableOpacity
              style={styles.walletEchoGreetingBubble}
              onPress={() => { lightTap(); if (tier !== 'premium') { setPaywallVisible(true); return; } setEchoAutoPrompt(greetingChips[0]?.question || greetingText); setEchoSheetVisible(true); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Echo: ${greetingText}`}
            >
              <View style={styles.walletEchoGreetingDot} />
              <TypewriterText
                text={greetingText}
                style={styles.walletEchoGreetingText}
                speed={28}
                startDelay={140}
              />
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); setGreetingDismissed(true); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.walletEchoGreetingDismiss}
                accessibilityRole="button"
                accessibilityLabel="Dismiss greeting"
              >
                <Feather name="x" size={12} color={C.textMuted} />
              </TouchableOpacity>
              {/* Tail points toward FAB */}
              <View style={[
                styles.walletEchoGreetingTail,
                fabSide === 'left'
                  ? { left: -6, borderBottomWidth: 1, borderLeftWidth: 1 }
                  : { right: -6, borderTopWidth: 1, borderRightWidth: 1 },
              ]} />
            </TouchableOpacity>
          )}
        </Animated.View>
      ) : null}

      {/* ── Echo inline chat sheet ── */}
      <EchoInlineChat
        visible={echoSheetVisible}
        onClose={() => setEchoSheetVisible(false)}
        insightTitle={smartWalletInsight.title}
        insightSubtitle={smartWalletInsight.subtitle}
        chips={greetingChips}
        contextSnapshot={buildWalletSnapshot()}
        topInset={insets.top}
        bottomInset={insets.bottom}
        autoPrompt={echoAutoPrompt}
      />

      {/* ─── Repay Credit Picker ─────────────────────────────── */}
      <Modal
        visible={repayPickerVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRepayPickerVisible(false)}
      >
        <Pressable style={styles.deleteConfirmOverlay} onPress={() => setRepayPickerVisible(false)}>
          <View style={styles.repayPickerCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.repayPickerTitle}>{t.wallets.repayCredit}</Text>
            <Text style={styles.repayPickerSub}>Choose which card to repay</Text>
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={styles.repayPickerList}
              showsVerticalScrollIndicator={false}
            >
              {creditsWithBalance.map((w, idx) => (
                <TouchableOpacity
                  key={w.id}
                  style={[styles.repayPickerRow, idx < creditsWithBalance.length - 1 && styles.repayPickerRowBorder]}
                  onPress={() => {
                    setRepayPickerVisible(false);
                    setTimeout(() => openRepay(w.id), 250);
                  }}
                  activeOpacity={0.7}
                >
                  <WalletLogo wallet={w} size={36} />
                  <View style={styles.repayPickerRowInfo}>
                    <Text style={styles.repayPickerRowName} numberOfLines={1}>{w.name}</Text>
                    <Text style={styles.repayPickerRowBalance}>{currency} {(w.usedCredit || 0).toFixed(2)} used</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={C.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.repayPickerCancel} onPress={() => setRepayPickerVisible(false)}>
              <Text style={styles.repayPickerCancelText}>{t.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ─── Delete Confirmation ──────────────────────────────── */}
      <Modal
        visible={!!deleteConfirmId}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setDeleteConfirmId(null)}
      >
        <Pressable style={styles.deleteConfirmOverlay} onPress={() => {
          const id = deleteConfirmId;
          setDeleteConfirmId(null);
          if (id) swipeRefs[id]?.current?.close();
        }}>
          <View style={styles.deleteConfirmCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.deleteConfirmTitle}>Delete wallet?</Text>
            <Text style={styles.deleteConfirmName} numberOfLines={1}>
              {wallets.find((w) => w.id === deleteConfirmId)?.name}
            </Text>
            <Text style={styles.deleteConfirmSub}>This cannot be undone.</Text>
            <View style={styles.deleteConfirmBtns}>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, styles.deleteConfirmCancelBtn]}
                onPress={() => {
                  const id = deleteConfirmId;
                  setDeleteConfirmId(null);
                  if (id) swipeRefs[id]?.current?.close();
                }}
              >
                <Text style={styles.deleteConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteConfirmBtn, styles.deleteConfirmDeleteBtn]}
                onPress={handleConfirmDelete}
              >
                <Text style={styles.deleteConfirmDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      <ScreenGuide
        id="guide_wallets"
        title={t.guide.yourWallets}
        icon="credit-card"
        description={t.guide.descWallet}
      />
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: 100,
  },
  // Summary
  summaryCard: {
    marginBottom: SPACING.xl,
    padding: SPACING.xl,
    paddingTop: SPACING.lg,
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOWS.sm,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  summaryAmountLine: {
    marginTop: SPACING.xs,
    fontVariant: ['tabular-nums'],
  },
  summaryAmountPrefix: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  summaryAmountInt: {
    fontSize: 44,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.positive,
  },
  summaryAmountDec: {
    fontSize: 44,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
  },
  summaryCreditLine: {
    marginTop: SPACING.sm,
    fontSize: TYPOGRAPHY.size.sm,
    fontVariant: ['tabular-nums'],
  },
  summaryCreditLabel: {
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  summaryCreditValue: {
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  summaryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  walletCountText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
  },
  transferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: withAlpha(C.accent, 0.1),
    borderRadius: RADIUS.md,
  },
  transferBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  actionsRow: {
    flexDirection: 'row' as const,
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  actionBtnOutline: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: SPACING.sm,
    minHeight: 44,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
  },
  actionBtnOutlinePressed: {
    backgroundColor: withAlpha(C.accent, 0.08),
    borderColor: C.accent,
  },
  actionBtnOutlineDisabled: {
    opacity: 0.4,
  },
  actionBtnOutlineLabel: {
    fontSize: 13,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
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
    color: C.textSecondary,
    flex: 1,
  },
  typeSectionCount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
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
    minWidth: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletLogo: {
    width: 40,
    height: 40,
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
    color: C.textPrimary,
  },
  walletBalance: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
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
  creditUsageText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
  },
  creditLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
    flexShrink: 1,
  },
  creditAvailable: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
    marginBottom: 6,
  },
  creditBar: {
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  creditBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  creditLimit: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    flexShrink: 0,
    textAlign: 'right',
  },
  walletActions: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starBtn: {
    padding: SPACING.xs,
  },
  swipeFill: {
    width: 72,
    alignSelf: 'stretch' as const,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    overflow: 'hidden' as const,
    backgroundColor: 'transparent',
  },
  swipeInner: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  __moreColor: {
    backgroundColor: C.accent,
  },
  __deleteColor: {
    backgroundColor: C.neutral,
  },
  swipeFillAlignRight: {},
  swipeFillAlignLeft: {},
  // Transfers section
  transfersSection: {
    marginTop: SPACING.xl,
  },
  transfersSectionTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: SPACING.md,
  },
  transferPreview: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    gap: SPACING.sm,
  },
  transferPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  transferPreviewName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  transferPreviewBefore: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  transferPreviewArrow: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  transferPreviewAfter: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  transferInfo: {
    flex: 1,
  },
  transferDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  transferTimestamp: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  transferNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  transferAmt: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  // Add button
  addBtnContainer: {
    position: 'absolute',
    bottom: SPACING.xl,
    left: SPACING.xl,
    right: SPACING.xl,
  },

  // ── Echo FAB + greeting + bottom sheet ──
  walletEchoFabContainer: {
    position: 'absolute',
    alignItems: 'center',
    gap: SPACING.sm,
    zIndex: 999,
  },
  walletEchoFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  walletEchoFabPulse: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DEAB22',
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  walletEchoGreetingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    maxWidth: 260,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.2),
    ...SHADOWS.md,
  },
  walletEchoGreetingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.accent,
  },
  walletEchoGreetingText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    lineHeight: 18,
  },
  walletEchoGreetingDismiss: {
    padding: 2,
    marginLeft: SPACING.xs,
  },
  walletEchoGreetingTail: {
    position: 'absolute',
    top: 13,
    width: 12,
    height: 12,
    backgroundColor: C.surface,
    borderColor: withAlpha(C.accent, 0.2),
    transform: [{ rotate: '45deg' }],
  },
  walletEchoSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  walletEchoSheetCard: {
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    ...SHADOWS.lg,
  },
  walletEchoSheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: SPACING.md,
  },
  walletEchoSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  walletEchoSheetHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm + 2,
  },
  walletEchoSheetIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  walletEchoSheetEyebrow: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  walletEchoSheetTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    lineHeight: 22,
  },
  walletEchoSheetSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  walletEchoSheetChips: {
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  walletEchoSheetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.accent, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.15),
  },
  walletEchoSheetChipText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    lineHeight: 19,
  },
  walletEchoSheetOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: C.accent,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  walletEchoSheetOpenBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.surface,
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.textPrimary,
  },
  // Type tabs
  typeTabs: {
    flexDirection: 'row' as const,
    backgroundColor: withAlpha(C.accent, 0.06),
    borderRadius: RADIUS.full,
    padding: 3,
    marginBottom: SPACING.md,
    gap: 2,
  },
  typeTab: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: SPACING.sm - 1,
    borderRadius: RADIUS.full,
    gap: 3,
  },
  typeTabActive: {
    backgroundColor: C.surface,
    ...SHADOWS.xs,
  },
  typeTabText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  typeTabTextActive: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  // Provider grid
  providerGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  typePickerOverlay: {
    paddingHorizontal: SPACING.sm,
  },
  typePickerContent: {
    maxHeight: '90%',
  },
  providerTile: {
    width: '47%',
    borderRadius: RADIUS.md,
    overflow: 'hidden' as const,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 68,
  },
  providerLogo: {
    width: '100%',
    height: 44,
  },
  providerName: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textAlign: 'center' as const,
  },
  otherOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  otherOptionText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
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
    color: C.textSecondary,
  },
  presetList: {
    gap: SPACING.xs,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  presetRowCustom: {
    borderStyle: 'dashed',
    borderColor: withAlpha(C.accent, 0.5),
    backgroundColor: withAlpha(C.accent, 0.03),
    marginTop: SPACING.sm,
  },
  presetRowIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetRowName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  // Form
  formLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  formLabelCompact: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  input: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderWidth: 1,
    borderColor: C.border,
  },
  nameInputRow: {
    borderBottomWidth: 1.5,
    borderBottomColor: C.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  nameInput: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
  },
  amountInputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderBottomWidth: 1.5,
    borderBottomColor: C.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.xs,
    gap: SPACING.xs,
  },
  amountCurrencyLabel: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.bold as any,
    color: C.textSecondary,
    paddingBottom: 2,
  },
  amountInputLarge: {
    flex: 1,
    fontSize: 32,
    fontWeight: TYPOGRAPHY.weight.bold as any,
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  pickerCol: {
    flex: 1,
  },
  logoPreviewBox: {
    height: 72,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: SPACING.sm,
  },
  logoPreview: {
    width: '100%',
    height: 48,
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
    backgroundColor: C.background,
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
    borderColor: C.textPrimary,
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
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  walletSelectName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  walletSelectBal: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  // Repay modal
  repayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    backgroundColor: C.background,
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
    color: C.textPrimary,
  },
  repayUsed: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  // Step indicator + question (Add flow)
  stepBadge: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  stepQuestion: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
  },
  stepSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },
  // Action sheet
  sheetContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING.xl,
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheetHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.md,
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  sheetWalletIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
  sheetWalletLogo: {
    width: 44,
    height: 44,
  },
  sheetWalletName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  sheetWalletSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginTop: 2,
  },
  sheetRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.md,
    minHeight: 48,
    paddingVertical: SPACING.sm,
  },
  sheetRowLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  sheetRowHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },

  // ─── Net worth line (subtle, under cash balance) ───
  netWorthLine: {
    marginTop: 4,
    fontVariant: ['tabular-nums'] as any,
  },
  netWorthLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  netWorthValue: {
    fontSize: TYPOGRAPHY.size.sm,
    color: '#B2780A',
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // ─── Bills block in summary footer ───
  summaryBillsBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  summaryBillsAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    fontVariant: ['tabular-nums'] as any,
  },
  summaryBillsLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ─── Bills preview modal rows ───
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  billRowLeft: {
    flex: 1,
    gap: 2,
  },
  billRowName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  billRowDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  billRowAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  billsTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.sm + 2,
  },
  billsTotalLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  billsTotalAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },

  // ─── Echo CTA (wallet, collapsed state) ───
  walletEchoCTA: {
    marginBottom: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.22),
  },
  walletEchoCTALeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    flex: 1,
    minWidth: 0,
  },
  walletEchoCTAIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletEchoCTATextCol: {
    flex: 1,
    minWidth: 0,
  },
  walletEchoCTATitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    textTransform: 'lowercase',
    letterSpacing: -0.2,
  },
  walletEchoCTASubtitle: {
    marginTop: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  walletEchoCTAArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  walletEchoCTAPulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.accent,
  },

  // ─── Echo collapsed pill (wallet, legacy) ───
  walletEchoCollapsedPill: {
    marginBottom: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.08),
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.22),
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  walletEchoCollapsedText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textTransform: 'lowercase',
  },
  walletEchoExpandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  // ─── Echo insight + chips (wallet) ───
  walletEchoBlock: {
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(C.accent, 0.06),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.18),
  },
  walletEchoEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  walletEchoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  walletEchoEyebrowText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  walletEchoTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    lineHeight: 24,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: -0.3,
    textTransform: 'lowercase',
  },
  walletEchoSubtitle: {
    marginTop: 4,
    fontSize: TYPOGRAPHY.size.sm,
    lineHeight: 20,
    color: C.textSecondary,
  },
  walletChipsRow: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    backgroundColor: C.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.25),
    maxWidth: '100%',
  },
  walletChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
    flexShrink: 1,
  },
  repayPickerCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    width: '88%',
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    paddingTop: SPACING.xl,
  },
  repayPickerTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xs,
  },
  repayPickerSub: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
  },
  repayPickerList: {
    maxHeight: 320,
  },
  repayPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  repayPickerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  repayPickerRowInfo: {
    flex: 1,
  },
  repayPickerRowName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  repayPickerRowBalance: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: 2,
  },
  repayPickerCancel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  repayPickerCancelText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  echoFabLock: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  deleteConfirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteConfirmCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '82%',
    borderWidth: 1,
    borderColor: C.border,
  },
  deleteConfirmTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
  },
  deleteConfirmName: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
  },
  deleteConfirmSub: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginBottom: SPACING.xl,
  },
  deleteConfirmBtns: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  deleteConfirmCancelBtn: {
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
  },
  deleteConfirmDeleteBtn: {
    backgroundColor: C.accent,
  },
  deleteConfirmCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  deleteConfirmDeleteText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
});

export default WalletManagement;
