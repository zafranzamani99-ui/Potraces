import React, { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Pressable,
  Animated,
  Easing,
  InteractionManager,
} from 'react-native';
import { ScrollView, Gesture } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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
import WalletLogo from '../../components/common/WalletLogo';
import FAB from '../../components/common/FAB';
import EmptyState from '../../components/common/EmptyState';
import PaywallModal from '../../components/common/PaywallModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { lightTap } from '../../services/haptics';
import ScreenGuide from '../../components/common/ScreenGuide';
import EchoInlineChat from '../../components/common/EchoInlineChat';
import { useT } from '../../i18n';
import { reconcileWalletBalances } from '../../utils/walletReconcile';
import { HITSLOP_10 } from '../../utils/hitSlop';
import AddEditWalletModal from '../../components/wallet/AddEditWalletModal';
import TransferModal from '../../components/wallet/TransferModal';
import RepayModal from '../../components/wallet/RepayModal';
import WalletActionSheet from '../../components/wallet/WalletActionSheet';
import BillsPreviewModal from '../../components/wallet/BillsPreviewModal';
import EchoFab from '../../components/wallet/EchoFab';
import { useEchoFabPan } from '../../hooks/useEchoFabPan';
import RepayPickerModal from '../../components/wallet/RepayPickerModal';
import DeleteConfirmModal from '../../components/wallet/DeleteConfirmModal';

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
  // ScreenGuide spotlight target — the scrim cuts a hole around the real FAB.
  const guideTargetRef = useRef<any>(null);
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

  // ── Draggable Echo FAB — free X+Y drag, snaps to edge, drag-to-hide ──
  const { echoFabPan, echoFabPanResponder, hideZoneAnim, hideZoneHoverAnim, fabScale, hideZoneRef } = useEchoFabPan({
    fabSide,
    setFabSide,
    setGreetingHiddenDuringDrag,
    onHide: () => setEchoHidden(true),
    insets,
  });

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

  const typeRailX = useSharedValue(0);
  const typeIdxRef = useRef(0);
  const panelWidthRef = useRef(0);
  const [panelWidth, setPanelWidth] = useState(0);

  const goToType = useCallback((type: WalletType) => {
    lightTap();
    const TYPES: WalletType[] = ['bank', 'ewallet', 'credit'];
    const newIdx = TYPES.indexOf(type);
    typeIdxRef.current = newIdx;
    setSelectedType(type);
    typeRailX.value = withSpring(-newIdx * panelWidthRef.current, {
      damping: 22,
      stiffness: 240,
      mass: 0.8,
    });
  }, [typeRailX]);

  // Looser failOffsetY for Android — its inner ScrollView locks in faster than iOS.
  // 25px vertical buffer gives the horizontal swipe room to commit on Android.
  const typeSwipeGesture = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-8, 8])
    .failOffsetY([-25, 25])
    .onUpdate((e) => {
      const base = -typeIdxRef.current * panelWidthRef.current;
      typeRailX.value = base + e.translationX;
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
      typeRailX.value = withSpring(-newIdx * panelWidthRef.current, {
        damping: 22,
        stiffness: 240,
        mass: 0.8,
      });
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
      // Calculate actual avg monthly expenses from last 3 months
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      const recentExpenses = transactions.filter(
        (t) => t.type === 'expense' && t.date >= threeMonthsAgo
      );
      const totalExpenses = recentExpenses.reduce((s, t) => s + (t.amount || 0), 0);
      const avgMonthly = totalExpenses / 3;

      if (avgMonthly <= 0) {
        return {
          title: `you're holding ${currency} ${totalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          subtitle: `not enough expense history to estimate runway yet. keep tracking and it'll appear.`,
        };
      }
      const months = totalBalance / avgMonthly;
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
  }, [wallets, bankWallets, ewalletWallets, creditWallets, totalBalance, currency, transactions]);

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

  // Memoized so the Echo sheet prop doesn't rebuild the snapshot on every render
  // (only when buildWalletSnapshot's inputs actually change).
  const walletSnapshot = useMemo(() => buildWalletSnapshot(), [buildWalletSnapshot]);

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
    setBalance(parseFloat(wallet.balance.toFixed(2)).toString());
    setCreditLimit(wallet.creditLimit ? parseFloat(wallet.creditLimit.toFixed(2)).toString() : '');
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
        if (limitNum < used) {
          // A limit below what's already used would force a negative available
          // balance and an impossible usedCredit > limit state.
          Alert.alert(t.a11y.error, `Credit limit can't be below the ${currency} ${used.toFixed(2)} you've already used.`);
          return;
        }
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

  // A wallet is blocked from deletion while it still has linked money records —
  // transactions or transfers — so deleting it can't orphan or corrupt history.
  const deleteLinkedCount = useMemo(() => {
    if (!deleteConfirmId) return 0;
    const txCount = transactions.filter((t) => t.walletId === deleteConfirmId).length;
    const transferCount = transfers.filter(
      (tr) => tr.fromWalletId === deleteConfirmId || tr.toWalletId === deleteConfirmId
    ).length;
    return txCount + transferCount;
  }, [deleteConfirmId, transactions, transfers]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirmId) return;
    const walletId = deleteConfirmId;
    // Guard: never delete a wallet that still has linked transactions/transfers.
    const hasTx = usePersonalStore.getState().transactions.some((t) => t.walletId === walletId);
    const hasTransfer = useWalletStore.getState().transfers.some(
      (tr) => tr.fromWalletId === walletId || tr.toWalletId === walletId
    );
    if (hasTx || hasTransfer) return;
    setDeleteConfirmId(null);
    const ps = usePersonalStore.getState();
    usePersonalStore.setState({
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
    const destWallet = wallets.find((w) => w.id === transferTo);
    if (!sourceWallet || !destWallet) {
      // Stale selection (wallet deleted on another device). Bail rather than
      // silently transferring out of / into a wallet that no longer exists.
      Alert.alert(t.a11y.error, t.wallets.fillTransferDetails);
      return;
    }
    if (amount > sourceWallet.balance) {
      Alert.alert(t.a11y.error, t.wallets.insufficientBalance);
      return;
    }
    // Record the transfer ONCE — transferBetweenWallets moves both balances and
    // writes a transfer record (shown in wallet activity, counted by
    // reconcileWalletBalances). Do NOT also create paired income/expense
    // transactions: that double-counted the move on Recalculate and inflated both
    // income and expense totals across every report.
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
      Alert.alert(t.a11y.error, t.wallets.fillRepaymentDetails);
      return;
    }
    const sourceWallet = wallets.find((w) => w.id === repaySourceId);
    const creditWallet = wallets.find((w) => w.id === repayWalletId);
    if (!sourceWallet || !creditWallet) {
      Alert.alert(t.a11y.error, t.wallets.fillRepaymentDetails);
      return;
    }
    if (amount > sourceWallet.balance) {
      Alert.alert(t.a11y.error, t.wallets.insufficientSourceBalance);
      return;
    }
    if (amount > (creditWallet.usedCredit || 0)) {
      Alert.alert(t.a11y.error, t.wallets.repaymentExceedsCredit);
      return;
    }
    repayCredit(repayWalletId, amount);
    deductFromWallet(repaySourceId, amount);
    // Recorded ONCE as a 'repayment' activity (shown in wallet activity, counted by
    // reconcileWalletBalances). Do NOT also create a 'bills' expense transaction —
    // a debt repayment is not spending, and it double-counted the source deduction
    // on Recalculate.
    logActivity(repaySourceId, repayWalletId, amount, 'repayment');
    setRepayVisible(false);
    setRepayWalletId(null);
    setRepaySourceId(null);
    setRepayAmount('');
  }, [repayAmount, repayWalletId, repaySourceId, wallets, repayCredit, deductFromWallet, logActivity]);

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
    const allResults = reconcileWalletBalances();
    const result = allResults.find((r) => r.walletId === walletId);
    const stored = result?.stored ?? wallet.balance;
    const computed = result?.computed ?? wallet.balance;
    const drift = result?.drift ?? 0;
    const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;
    const diffText = drift >= 0 ? `+${fmt(drift)}` : `−${fmt(Math.abs(drift))}`;

    Alert.alert(
      `Recalculate "${wallet.name}"?`,
      `Stored balance: ${fmt(stored)}\n` +
      `From transactions: ${fmt(computed)}\n` +
      `Difference: ${diffText}\n\n` +
      `This re-sums every transaction, transfer, debt payment, and goal contribution. ` +
      `If your wallet had an unlogged initial deposit, the recomputed balance will be off — skip this.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Recalculate',
          style: 'destructive',
          onPress: () => {
            setWalletBalance(walletId, computed);
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
        <View style={styles.walletCard}>
          <View>
          <View style={styles.walletRow}>
            <View style={[styles.walletIcon, !wallet.presetId && { backgroundColor: withAlpha(wallet.color, 0.10), borderRadius: RADIUS.md }]}>
              {wallet.presetId ? (
                <WalletLogo wallet={wallet} size={40} />
              ) : (
                <Feather
                  name={wallet.icon as keyof typeof Feather.glyphMap}
                  size={20}
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
        </View>
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
                  tier === 'free' && wallets.length >= FREE_TIER.maxWallets - 1 && { color: C.bronze, fontWeight: TYPOGRAPHY.weight.semibold },
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
              <TouchableOpacity
                onPress={() => navigation.navigate('TransactionsList' as any)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.wallets.seeAll}
              >
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
                accessibilityRole="button"
                accessibilityLabel={isRepayment ? t.wallets.repayCredit : t.wallets.transfer}
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

      {/* FAB — matches DebtTracking / BudgetPlanning pattern */}
      <FAB
        ref={guideTargetRef}
        onPress={handleAdd}
        icon="plus"
        color={C.accent}
        style={{ bottom: Math.max(SPACING.xl, insets.bottom + SPACING.md) }}
      />

      {/* ─── Add/Edit Modal ─────────────────────────────────── */}
      <AddEditWalletModal
        visible={modalVisible}
        onClose={() => { setModalVisible(false); resetForm(); }}
        editingWallet={editingWallet}
        addStep={addStep}
        setAddStep={setAddStep}
        creditCardStep={creditCardStep}
        setCreditCardStep={setCreditCardStep}
        name={name}
        setName={setName}
        balance={balance}
        setBalance={setBalance}
        creditLimit={creditLimit}
        setCreditLimit={setCreditLimit}
        selectedIcon={selectedIcon}
        setSelectedIcon={setSelectedIcon}
        selectedColor={selectedColor}
        setSelectedColor={setSelectedColor}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        selectedPresetId={selectedPresetId}
        setSelectedPresetId={setSelectedPresetId}
        selectedCreditBank={selectedCreditBank}
        setSelectedCreditBank={setSelectedCreditBank}
        selectedNetwork={selectedNetwork as any}
        setSelectedNetwork={setSelectedNetwork as any}
        resetForm={resetForm}
        onSave={handleSave}
        canAddType={canAddType}
        showTypePaywall={showTypePaywall}
        handleChooseTypeAndPreset={handleChooseTypeAndPreset}
        goToType={goToType}
        panelWidth={panelWidth}
        setPanelWidth={setPanelWidth}
        panelWidthRef={panelWidthRef}
        typeRailX={typeRailX}
        typeSwipeGesture={typeSwipeGesture}
        creditCardBackGesture={creditCardBackGesture}
        currency={currency}
        insets={insets}
        WALLET_TYPE_CONFIG={WALLET_TYPE_CONFIG}
        WALLET_PRESETS={WALLET_PRESETS}
        WALLET_ICONS_BY_TYPE={WALLET_ICONS_BY_TYPE}
        WALLET_COLORS={[...WALLET_COLORS]}
        BANK_LOGOS={BANK_LOGOS}
        CARD_NETWORK_LOGOS={CARD_NETWORK_LOGOS}
        LOGO_SIZE={LOGO_SIZE}
      />
      {/* ─── Transfer Modal ─────────────────────────────────── */}
      <TransferModal
        visible={transferVisible}
        onClose={() => setTransferVisible(false)}
        transferFrom={transferFrom}
        setTransferFrom={setTransferFrom}
        transferTo={transferTo}
        setTransferTo={setTransferTo}
        transferAmount={transferAmount}
        setTransferAmount={setTransferAmount}
        transferNote={transferNote}
        setTransferNote={setTransferNote}
        nonCreditWallets={nonCreditWallets}
        transferToWallets={transferToWallets}
        wallets={wallets}
        currency={currency}
        onTransfer={handleTransfer}
      />

      {/* ─── Repay Credit Modal ─────────────────────────────── */}
      <RepayModal
        visible={repayVisible}
        onClose={() => setRepayVisible(false)}
        repayWalletId={repayWalletId}
        repaySourceId={repaySourceId}
        setRepaySourceId={setRepaySourceId}
        repayAmount={repayAmount}
        setRepayAmount={setRepayAmount}
        wallets={wallets}
        nonCreditWallets={nonCreditWallets}
        currency={currency}
        onRepay={handleRepay}
      />

      {/* ─── Wallet Action Sheet ────────────────────────────── */}
      <WalletActionSheet
        visible={!!actionSheetWalletId}
        walletId={actionSheetWalletId}
        onClose={closeActionSheet}
        wallets={wallets}
        currency={currency}
        onSetDefault={sheetSetDefault}
        onRepay={sheetRepay}
        onTransferFrom={sheetTransferFrom}
        onEdit={sheetEdit}
        onRecalculate={sheetRecalc}
        onDelete={sheetDelete}
      />

      {/* ── Bills this week — float preview modal ── */}
      <BillsPreviewModal
        visible={billsModalVisible}
        onClose={() => setBillsModalVisible(false)}
        upcomingBills={upcomingBillsWallet.bills}
        totalBills={upcomingBillsWallet.total}
        currency={currency}
        onOpenManageBills={() => { setBillsModalVisible(false); setTimeout(() => navigation.navigate('SubscriptionList' as never), 50); }}
      />

      {/* Paywall */}
      <PaywallModal
        visible={paywallVisible}
        onClose={() => { setPaywallVisible(false); setPaywallReason(undefined); }}
        feature="wallet"
        currentUsage={wallets.length}
        reason={paywallReason}
      />
      {/* ── Echo FAB + Greeting bubble (draggable, default top-right) ── */}
      <EchoFab
        visible={wallets.length > 0 && !echoHidden && !modalVisible && !echoSheetVisible && !billsModalVisible && !!smartWalletInsight.title}
        fabSide={fabSide}
        onSetFabSide={setFabSide}
        echoFabPan={echoFabPan}
        echoFabPanResponder={echoFabPanResponder}
        greetingText={greetingText}
        greetingDismissed={greetingDismissed}
        onSetGreetingDismissed={setGreetingDismissed}
        greetingHiddenDuringDrag={greetingHiddenDuringDrag}
        onSetGreetingHiddenDuringDrag={setGreetingHiddenDuringDrag}
        greetingChips={greetingChips}
        onOpenSheet={(autoPrompt) => {
          setEchoAutoPrompt(autoPrompt);
          setEchoSheetVisible(true);
          setGreetingDismissed(true);
        }}
        tier={tier}
        onShowPaywall={() => setPaywallVisible(true)}
        insets={insets}
        fabScale={fabScale}
        hideZoneAnim={hideZoneAnim}
        hideZoneHoverAnim={hideZoneHoverAnim}
        hideZoneRef={hideZoneRef}
      />

      {/* ── Echo inline chat sheet ── */}
      <EchoInlineChat
        visible={echoSheetVisible}
        onClose={() => setEchoSheetVisible(false)}
        insightTitle={smartWalletInsight.title}
        insightSubtitle={smartWalletInsight.subtitle}
        chips={greetingChips}
        contextSnapshot={walletSnapshot}
        topInset={insets.top}
        bottomInset={insets.bottom}
        autoPrompt={echoAutoPrompt}
      />

      {/* ─── Repay Credit Picker ─────────────────────────────── */}
      <RepayPickerModal
        visible={repayPickerVisible}
        onClose={() => setRepayPickerVisible(false)}
        creditsWithBalance={creditsWithBalance}
        currency={currency}
        onSelectCredit={openRepay}
      />

      {/* ─── Delete Confirmation ──────────────────────────────── */}
      <DeleteConfirmModal
        visible={!!deleteConfirmId}
        walletId={deleteConfirmId}
        linkedCount={deleteLinkedCount}
        onCancel={() => {
          const id = deleteConfirmId;
          setDeleteConfirmId(null);
          if (id) swipeRefs[id]?.current?.close();
        }}
        onConfirm={handleConfirmDelete}
        walletName={wallets.find((w) => w.id === deleteConfirmId)?.name ?? ''}
      />

      <ScreenGuide
        id="guide_wallets"
        title={t.guide.yourWallets}
        icon="credit-card"
        description={t.guide.descWallet}
        points={[
          { icon: 'plus', text: t.guide.walletPoint1 },
          { icon: 'repeat', text: t.guide.walletPoint2 },
        ]}
        spotlight={{ targetRef: guideTargetRef, label: t.guide.walletPoint1, sublabel: t.guide.walletPoint2 }}
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(C.textPrimary, 0.12),
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
    backgroundColor: withAlpha(C.textPrimary, 0.04),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
  },
  actionBtnOutlinePressed: {
    backgroundColor: withAlpha(C.textPrimary, 0.08),
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(C.textPrimary, 0.12),
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  walletIcon: {
    width: 40,
    height: 40,
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
  creditUsageText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
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
    color: C.bronze,
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
});

export default WalletManagement;
