import React, { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  format,
  differenceInCalendarDays,
  isValid,
  isWithinInterval,
  startOfMonth,
  endOfMonth,
  subMonths,
} from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useWalletStore } from '../../store/walletStore';
import {
  CALM,
  CALM_DARK,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  SHADOWS,
  withAlpha,
} from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import CalendarPicker from '../../components/common/CalendarPicker';
import EmptyState from '../../components/common/EmptyState';
import FAB from '../../components/common/FAB';
import ScreenGuide from '../../components/common/ScreenGuide';
import CollapsibleSection from '../../components/common/CollapsibleSection';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../../context/ToastContext';
import { lightTap, mediumTap, successNotification, selectionChanged } from '../../services/haptics';
import { Goal, GoalContribution } from '../../types';
import ModalToastHost from '../../components/common/ModalToastHost';
import EchoInlineChat, { EchoChip } from '../../components/common/EchoInlineChat';
import WalletPicker from '../../components/common/WalletPicker';
import CircularProgress from '../../components/common/CircularProgress';

// ── ICON RENDERING (multi-library) ───────────────────────────
function renderGoalIcon(iconId: string, size: number, color: string) {
  const safe = iconId || 'f/target'; // tolerate goals saved without an icon
  const [lib, name] = safe.includes('/') ? safe.split('/') : ['f', safe];
  switch (lib) {
    case 'm': return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
    case 'i': return <Ionicons name={name as any} size={size} color={color} />;
    case 'fa': return <FontAwesome5 name={name as any} size={size} color={color} />;
    default: return <Feather name={name as any} size={size} color={color} />;
  }
}

const GOAL_ICON_KEYWORDS: Record<string, string[]> = {
  // ── Travel ──
  trip: ['m/airplane', 'f/map-pin', 'm/beach'],
  travel: ['m/airplane', 'f/map-pin', 'm/beach'],
  japan: ['m/airplane', 'fa/torii-gate', 'm/noodles'],
  korea: ['m/airplane', 'f/map-pin', 'm/food'],
  holiday: ['m/airplane', 'm/beach', 'f/sun'],
  cuti: ['m/airplane', 'm/beach', 'f/sun'],
  umrah: ['fa/mosque', 'fa/kaaba', 'm/airplane'],
  haji: ['fa/mosque', 'fa/kaaba', 'm/airplane'],
  // ── Home & Property ──
  house: ['f/home', 'fa/house-user', 'm/home-city'],
  rumah: ['f/home', 'fa/house-user', 'm/home-city'],
  apartment: ['m/home-city', 'fa/building', 'f/home'],
  kondo: ['m/home-city', 'fa/building', 'f/home'],
  renovation: ['m/hammer-wrench', 'f/tool', 'f/home'],
  ubahsuai: ['m/hammer-wrench', 'f/tool', 'f/home'],
  furniture: ['m/sofa', 'm/bed', 'f/home'],
  // ── Vehicles ──
  car: ['m/car-hatchback', 'm/car-side', 'm/car-key'],
  kereta: ['m/car-hatchback', 'm/car-side', 'm/car-key'],
  motor: ['m/motorbike', 'm/gas-station', 'f/shield'],
  motosikal: ['m/motorbike', 'm/gas-station', 'f/shield'],
  myvi: ['m/car-hatchback', 'm/car-key', 'm/car-side'],
  // ── Tech & Gadgets ──
  iphone: ['f/smartphone', 'm/cellphone', 'm/apple'],
  phone: ['f/smartphone', 'm/cellphone', 'm/apple'],
  laptop: ['m/laptop', 'f/monitor', 'm/microsoft'],
  macbook: ['m/laptop', 'm/apple', 'f/monitor'],
  ipad: ['m/tablet', 'm/apple', 'f/monitor'],
  tablet: ['m/tablet', 'f/monitor', 'm/laptop'],
  computer: ['m/desktop-tower', 'f/monitor', 'm/laptop'],
  camera: ['f/camera', 'm/camera', 'm/camera-iris'],
  // ── Life Events ──
  wedding: ['m/ring', 'f/heart', 'fa/church'],
  kahwin: ['m/ring', 'f/heart', 'fa/mosque'],
  nikah: ['m/ring', 'f/heart', 'fa/mosque'],
  tunang: ['m/ring', 'f/gift', 'f/heart'],
  baby: ['fa/baby', 'm/baby-carriage', 'f/heart'],
  anak: ['fa/baby', 'm/baby-carriage', 'f/heart'],
  // ── Education ──
  degree: ['fa/graduation-cap', 'm/school', 'f/book'],
  university: ['fa/graduation-cap', 'm/school', 'f/book'],
  study: ['f/book', 'm/school', 'fa/graduation-cap'],
  course: ['f/book', 'f/monitor', 'm/school'],
  belajar: ['f/book', 'm/school', 'fa/graduation-cap'],
  // ── Safety & Finance ──
  emergency: ['f/shield', 'm/shield-check', 'm/lifebuoy'],
  kecemasan: ['f/shield', 'm/shield-check', 'm/lifebuoy'],
  tabung: ['m/piggy-bank', 'm/bank', 'f/dollar-sign'],
  savings: ['m/piggy-bank', 'm/bank', 'f/dollar-sign'],
  simpanan: ['m/piggy-bank', 'm/bank', 'f/dollar-sign'],
  retirement: ['m/beach', 'm/account-clock', 'm/piggy-bank'],
  persaraan: ['m/beach', 'm/account-clock', 'm/piggy-bank'],
  invest: ['m/chart-line', 'm/bank', 'f/trending-up'],
  // ── Shopping & Lifestyle ──
  gift: ['f/gift', 'f/shopping-bag', 'm/package-variant'],
  hadiah: ['f/gift', 'f/shopping-bag', 'm/package-variant'],
  bag: ['f/shopping-bag', 'm/handbag', 'f/gift'],
  watch: ['f/watch', 'm/watch', 'm/watch-variant'],
  jam: ['f/watch', 'm/watch', 'm/watch-variant'],
  sneaker: ['m/shoe-sneaker', 'f/shopping-bag', 'f/gift'],
  kasut: ['m/shoe-sneaker', 'f/shopping-bag', 'f/gift'],
  // ── Health ──
  gym: ['m/dumbbell', 'i/fitness', 'f/activity'],
  fitness: ['m/dumbbell', 'i/fitness', 'f/activity'],
  medical: ['i/medkit', 'm/hospital-box', 'm/stethoscope'],
  // ── Pets ──
  pet: ['m/paw', 'm/dog', 'm/cat'],
  kucing: ['m/cat', 'm/paw', 'f/heart'],
};

const COMMON_GOAL_ICONS = [
  'f/target', 'f/star', 'm/airplane', 'f/home', 'f/smartphone',
  'm/car-hatchback', 'f/heart', 'm/ring', 'f/shield', 'm/piggy-bank',
  'fa/graduation-cap', 'f/gift', 'f/camera', 'f/book', 'm/laptop',
  'f/map-pin', 'm/beach', 'm/dumbbell', 'f/coffee', 'f/shopping-bag',
  'f/music', 'fa/baby', 'f/watch', 'f/sun', 'm/paw',
  'f/monitor', 'f/truck', 'f/flag', 'm/food', 'fa/mosque',
];

function suggestGoalIcons(name: string): string[] {
  if (!name) return [];
  const lower = name.toLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const [keyword, icons] of Object.entries(GOAL_ICON_KEYWORDS)) {
    if (lower.includes(keyword)) {
      for (const icon of icons) {
        if (!seen.has(icon)) { seen.add(icon); result.push(icon); }
      }
    }
  }
  return result.slice(0, 6);
}

// kept for templates
const GOAL_ICONS: (keyof typeof Feather.glyphMap)[] = [
  'target', 'star', 'home', 'smartphone', 'truck', 'send',
  'gift', 'heart', 'book', 'coffee', 'shopping-bag', 'music', 'shield', 'flag',
];

const GOAL_COLORS = [
  '#4F5104', // C.accent (olive)
  '#2E7D5B', // C.positive (green)
  '#E67E22', // warm orange
  '#3498DB', // sky blue
  '#9B59B6', // amethyst purple
  '#C1694F', // warm terracotta (was red — fixed)
  '#1ABC9C', // teal
  '#F39C12', // golden amber
];

// ── QUICK CONTRIBUTE AMOUNTS ──────────────────────────────────
const QUICK_AMOUNTS = [10, 50, 100, 500];

// ── ECHO GOAL INSIGHT (local computation, no AI call) ────────
interface GoalInsightResult {
  mode: string;
  title: string;
  subtitle: string;
  chips: EchoChip[];
}

const fmtAmt = (n: number) => Math.ceil(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function computeGoalInsight(
  goal: Goal,
  opts: {
    pct: number; done: boolean; daysLeft: number | null;
    paceD: number | null; paceM: number | null;
    monthlyRate: number; lastCAgo: number | null;
    lastC: GoalContribution | null;
  },
  currency: string,
): GoalInsightResult {
  const { pct, done, daysLeft, paceD, paceM, monthlyRate, lastCAgo, lastC } = opts;
  const remaining = goal.targetAmount - goal.currentAmount;
  const name = goal.name;
  const c = currency;

  const baseChips: EchoChip[] = [
    { label: 'can I make it?', question: `can I reach my "${name}" goal of ${c} ${fmtAmt(goal.targetAmount)} by the deadline at my current pace? be honest.` },
    { label: 'help me plan this', question: `help me plan how to save ${c} ${fmtAmt(remaining)} for "${name}". break it down into weekly or daily targets I can actually hit.` },
    { label: 'what should I cut?', question: `look at my spending and tell me what I could cut or reduce to save faster for "${name}".` },
  ];
  if (paceD && paceD > 0) {
    baseChips.push({ label: `${c} ${fmtAmt(paceD)}/day realistic?`, question: `is saving ${c} ${fmtAmt(paceD)} per day realistic for me based on my spending? what would I need to change?` });
  }

  if (goal.isPaused) {
    return {
      mode: 'paused',
      title: `${name} is on hold at ${pct.toFixed(0)}%.`,
      subtitle: remaining > 0 ? `${c} ${fmtAmt(remaining)} left to go whenever you're ready.` : '',
      chips: [{ label: 'should I resume?', question: `I paused "${name}" at ${pct.toFixed(0)}%. should I resume it or is there a better approach?` }, ...baseChips],
    };
  }

  if (done) {
    return {
      mode: 'done',
      title: `${name} — done. ${c} ${fmtAmt(goal.targetAmount)} saved.`,
      subtitle: 'that took discipline. what comes next?',
      chips: [{ label: 'what should I save for next?', question: `I just completed "${name}"! based on my finances, what should my next savings goal be?` }],
    };
  }

  const hasDeadline = !!goal.deadline;
  const noContribs = !goal.contributions || goal.contributions.length === 0;

  if (noContribs && hasDeadline && daysLeft !== null && daysLeft > 0) {
    const daily = remaining / daysLeft;
    return {
      mode: 'noContributions',
      title: `${c} ${fmtAmt(remaining)} in ${daysLeft} days — that's ${c} ${fmtAmt(daily)}/day.`,
      subtitle: `first deposit makes ${name} real. even ${c} 50 today.`,
      chips: baseChips,
    };
  }

  if (noContribs) {
    return {
      mode: 'noContributions',
      title: `${c} ${fmtAmt(remaining)} for ${name}.`,
      subtitle: 'no rush — but the first deposit always makes it real.',
      chips: baseChips,
    };
  }

  if (!hasDeadline) {
    const avgContrib = goal.currentAmount / goal.contributions!.length;
    const contribsNeeded = Math.ceil(remaining / avgContrib);
    return {
      mode: 'noDeadline',
      title: `${pct.toFixed(0)}% there. about ${contribsNeeded} more deposits at your average.`,
      subtitle: 'set a deadline and echo can tell you exactly how much per day.',
      chips: [
        { label: 'suggest a deadline', question: `based on my savings pace for "${name}" (averaging ${c} ${fmtAmt(avgContrib)} per deposit), suggest a realistic deadline.` },
        ...baseChips,
      ],
    };
  }

  if (daysLeft !== null && daysLeft < 0) {
    const overDays = Math.abs(daysLeft);
    const monthsAtPace = monthlyRate > 0 ? Math.ceil(remaining / monthlyRate) : null;
    return {
      mode: 'overdue',
      title: `${overDays} days past deadline. ${c} ${fmtAmt(remaining)} still needed.`,
      subtitle: monthsAtPace
        ? `at your current pace, about ${monthsAtPace} more month${monthsAtPace > 1 ? 's' : ''}. or top up ${c} ${fmtAmt(remaining)} now.`
        : `close it with ${c} ${fmtAmt(remaining)}, or push the deadline out.`,
      chips: baseChips,
    };
  }

  if (paceM !== null && monthlyRate > 0 && paceM > monthlyRate * 2) {
    const monthsNeeded = Math.ceil(remaining / monthlyRate);
    const projDate = new Date();
    projDate.setMonth(projDate.getMonth() + monthsNeeded);
    const daily = paceD || (paceM / 30);
    return {
      mode: 'wayBehind',
      title: `at your pace, ${name} lands around ${format(projDate, 'MMM yyyy')}.`,
      subtitle: `need ${c} ${fmtAmt(daily)}/day to hit the deadline. that's ${c} ${fmtAmt(daily * 7)}/week.`,
      chips: baseChips,
    };
  }

  if (paceM !== null && monthlyRate > 0 && paceM > monthlyRate * 1.2) {
    const daily = paceD || (paceM / 30);
    let hook = '';
    if (daily <= 5) hook = 'less than a teh tarik a day.';
    else if (daily <= 18) hook = 'one less grab order does it.';
    else if (daily <= 50) hook = 'skip one online order a week.';
    else hook = `about ${c} ${fmtAmt(daily * 7)} per week.`;
    return {
      mode: 'slightlyBehind',
      title: `${c} ${fmtAmt(daily)}/day closes the gap for ${name}.`,
      subtitle: hook,
      chips: baseChips,
    };
  }

  if (lastCAgo !== null && lastCAgo > 30) {
    const lastAmt = lastC ? Math.abs(lastC.amount) : 0;
    return {
      mode: 'stale',
      title: `${lastCAgo} days since your last deposit${lastAmt > 0 ? ` (${c} ${fmtAmt(lastAmt)})` : ''}.`,
      subtitle: `${name} is ${pct.toFixed(0)}% done. even ${c} 10 keeps it moving.`,
      chips: baseChips,
    };
  }

  const daysEarly = daysLeft !== null && monthlyRate > 0 && remaining > 0
    ? Math.max(0, Math.floor(daysLeft - (remaining / (monthlyRate / 30))))
    : 0;
  return {
    mode: 'onTrack',
    title: daysEarly > 7
      ? `${name} could be done ${daysEarly} days early at this pace.`
      : `${name} is on track. ${c} ${fmtAmt(remaining)} to go.`,
    subtitle: daysEarly > 7 ? 'keep going.' : 'steady pace wins.',
    chips: [{ label: 'give me a breakdown', question: `break down my "${name}" goal progress — pace, timeline, what I need per day/week to finish on time.` }, ...baseChips],
  };
}

function buildGoalSnapshot(goal: Goal, currency: string): string {
  const pct = goal.targetAmount > 0 ? ((goal.currentAmount / goal.targetAmount) * 100).toFixed(1) : '0';
  const remaining = goal.targetAmount - goal.currentAmount;
  const contribs = goal.contributions || [];
  const lines = [
    `GOAL: ${goal.name}`,
    `Target: ${currency} ${fmtAmt(goal.targetAmount)} | Saved: ${currency} ${fmtAmt(goal.currentAmount)} (${pct}%)`,
  ];
  if (goal.deadline) {
    const dl = new Date(goal.deadline);
    const days = differenceInCalendarDays(dl, new Date());
    lines.push(`Deadline: ${format(dl, 'MMM d, yyyy')} (${days > 0 ? `${days} days left` : `${Math.abs(days)} days overdue`})`);
    if (days > 0 && remaining > 0) {
      lines.push(`Pace needed: ${currency} ${(remaining / days).toFixed(2)}/day or ${currency} ${(remaining / (days / 30)).toFixed(0)}/month`);
    }
  }
  if (contribs.length > 0) {
    const recent = contribs.slice(-3).map(c => `  ${format(new Date(c.date), 'MMM d')}: ${c.amount > 0 ? '+' : ''}${currency} ${c.amount.toFixed(2)}${c.note ? ` (${c.note})` : ''}`);
    lines.push(`Recent contributions (${contribs.length} total):\n${recent.join('\n')}`);
  } else {
    lines.push('Contributions: none yet');
  }
  if (goal.isPaused) lines.push('Status: PAUSED');
  return lines.join('\n');
}

// ── FILTER TYPES ──────────────────────────────────────────────
type GoalFilter = 'all' | 'active' | 'completed' | 'paused';
type GoalSort = 'manual' | 'deadline' | 'progress';

// ── ENCOURAGING MESSAGES ──────────────────────────────────────
// Localized version defined inside component via useT()

// ── CIRCULAR PROGRESS RING ───────────────────────────────────
const MAX_GOALS = 10;

// ── MAIN COMPONENT ────────────────────────────────────────────
const Goals: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const navigation = useNavigation<any>();

  // ── Observation helper (i18n) ──
  const getObservation = useCallback((percentage: number): string => {
    if (percentage >= 100) return t.goals.goalReached;
    if (percentage >= 75) return t.goals.almostThere;
    if (percentage >= 50) return t.goals.halfway;
    if (percentage >= 25) return t.goals.quarterSaved;
    if (percentage >= 10) return t.goals.gettingStarted;
    return '';
  }, [t]);

  // ── Goal templates (i18n) ──
  const goalTemplates = useMemo(() => [
    { name: t.goals.emergencyFund, icon: 'shield' as const, color: '#4F5104' },
    { name: t.goals.rayaSavings, icon: 'gift' as const, color: '#F39C12' },
    { name: t.goals.travel, icon: 'send' as const, color: '#E67E22' },
    { name: t.goals.gadgetFund, icon: 'smartphone' as const, color: '#9B59B6' },
    { name: t.goals.downpayment, icon: 'home' as const, color: '#3498DB' },
    { name: t.goals.education, icon: 'book' as const, color: '#8B7355' },
  ], [t]);

  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const goals = usePersonalStore((s) => s.goals);
  const addGoal = usePersonalStore((s) => s.addGoal);
  const updateGoal = usePersonalStore((s) => s.updateGoal);
  const deleteGoal = usePersonalStore((s) => s.deleteGoal);
  const contributeToGoal = usePersonalStore((s) => s.contributeToGoal);
  const removeContribution = usePersonalStore((s) => s.removeContribution);
  const archiveGoal = usePersonalStore((s) => s.archiveGoal);
  const unarchiveGoal = usePersonalStore((s) => s.unarchiveGoal);
  const pauseGoal = usePersonalStore((s) => s.pauseGoal);
  const resumeGoal = usePersonalStore((s) => s.resumeGoal);
  const currency = useSettingsStore((s) => s.currency);
  const wallets = useWalletStore((s) => s.wallets);

  // ── Filter / Sort state ──
  const [filter, setFilter] = useState<GoalFilter>('all');
  const [sort, setSort] = useState<GoalSort>('manual');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [echoSheetVisible, setEchoSheetVisible] = useState(false);
  const [echoGoal, setEchoGoal] = useState<Goal | null>(null);

  // ── Add/Edit Goal Modal state ──
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDeadline, setGoalDeadline] = useState<Date | undefined>(undefined);
  const [showCalendar, setShowCalendar] = useState(false);
  const [goalIcon, setGoalIcon] = useState<string>('f/target');
  const [goalColor, setGoalColor] = useState(GOAL_COLORS[0]);
  const [goalImageUri, setGoalImageUri] = useState<string | undefined>(undefined);
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string | undefined>(undefined);
  const suggestedIcons = useMemo(() => suggestGoalIcons(goalName), [goalName]);

  // ── Contribute Modal state ──
  const [contributeModalVisible, setContributeModalVisible] = useState(false);
  const [contributingGoal, setContributingGoal] = useState<Goal | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [contributeNote, setContributeNote] = useState('');
  const [contributeWalletId, setContributeWalletId] = useState<string | undefined>(undefined);
  const [isWithdrawMode, setIsWithdrawMode] = useState(false);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const contribAmountRef = useRef<TextInput>(null);
  const contribScrollRef = useRef<any>(null);
  const contribNoteY = useRef(0);
  const [contribKbVisible, setContribKbVisible] = useState(false);
  const [contribKbHeight, setContribKbHeight] = useState(0);
  const [contribNoteFocused, setContribNoteFocused] = useState(false);
  const withdrawFromGoal = usePersonalStore((s) => s.withdrawFromGoal);
  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const deleteTransaction = usePersonalStore((s) => s.deleteTransaction);
  const updateTransaction = usePersonalStore((s) => s.updateTransaction);

  // ── History Modal state ──
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyGoal, setHistoryGoal] = useState<Goal | null>(null);

  // ── Form sheet animation shared values ──
  const goalSheetY = useSharedValue(SCREEN_H);
  const goalDragStart = useSharedValue(0);
  const goalClosingRef = useRef(false);
  const contribSheetY = useSharedValue(SCREEN_H);
  const contribDragStart = useSharedValue(0);
  const contribClosingRef = useRef(false);
  const historySheetY = useSharedValue(SCREEN_H);
  const historyDragStart = useSharedValue(0);
  const historyClosingRef = useRef(false);
  const goalTargetRef = useRef<TextInput>(null);

  // ── Derived data ──
  const goalsList: Goal[] = goals || [];
  const activeGoals = useMemo(() => goalsList.filter((g) => !g.isArchived), [goalsList]);

  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const monthEnd = useMemo(() => endOfMonth(now), [now]);
  const lastMonthStart = useMemo(() => startOfMonth(subMonths(now, 1)), [now]);
  const lastMonthEnd = useMemo(() => endOfMonth(subMonths(now, 1)), [now]);

  // ── Monthly contribution totals ──
  const monthlyContrib = useMemo(() => {
    let thisMonth = 0;
    let lastMonth = 0;
    goalsList.forEach((g) => {
      (g.contributions || []).forEach((c) => {
        if (c.amount <= 0) return;
        const d = c.date instanceof Date ? c.date : new Date(c.date);
        if (isWithinInterval(d, { start: monthStart, end: monthEnd })) thisMonth += c.amount;
        if (isWithinInterval(d, { start: lastMonthStart, end: lastMonthEnd })) lastMonth += c.amount;
      });
    });
    return { thisMonth, lastMonth };
  }, [goalsList, monthStart, monthEnd, lastMonthStart, lastMonthEnd]);

  const summary = useMemo(() => {
    const active = activeGoals;
    const totalSaved = active.reduce((sum, g) => sum + g.currentAmount, 0);
    const totalTarget = active.reduce((sum, g) => sum + g.targetAmount, 0);
    const overallPercentage = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
    const completedCount = active.filter((g) => g.currentAmount >= g.targetAmount).length;
    const activeCount = active.length - completedCount;
    return { totalSaved, totalTarget, overallPercentage, completedCount, activeCount };
  }, [activeGoals]);

  // ── Filtered + sorted goals ──
  const filteredGoals = useMemo(() => {
    let list = [...activeGoals];
    switch (filter) {
      case 'active':
        list = list.filter((g) => g.currentAmount < g.targetAmount && !g.isPaused);
        break;
      case 'completed':
        list = list.filter((g) => g.currentAmount >= g.targetAmount);
        break;
      case 'paused':
        list = list.filter((g) => g.isPaused);
        break;
    }
    if (sort === 'deadline') {
      list = [...list].sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
    } else if (sort === 'progress') {
      list = [...list].sort((a, b) => {
        const pctA = a.targetAmount > 0 ? a.currentAmount / a.targetAmount : 0;
        const pctB = b.targetAmount > 0 ? b.currentAmount / b.targetAmount : 0;
        return pctB - pctA;
      });
    }
    return list;
  }, [activeGoals, filter, sort]);

  const enrichedGoals = useMemo(() =>
    filteredGoals.map((goal) => {
      const percentage = goal.targetAmount > 0
        ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
        : 0;
      const isCompleted = goal.currentAmount >= goal.targetAmount;
      const daysUntilDeadline = goal.deadline
        ? differenceInCalendarDays(new Date(goal.deadline), new Date())
        : null;

      // Pace calculation
      let paceDaily: number | null = null;
      let paceMonthly: number | null = null;
      if (goal.deadline && daysUntilDeadline !== null && daysUntilDeadline > 0 && !isCompleted) {
        const remaining = goal.targetAmount - goal.currentAmount;
        paceDaily = remaining / daysUntilDeadline;
        paceMonthly = remaining / (daysUntilDeadline / 30);
      }

      // Sparkline data — last 8 contribution amounts
      const sparkData = (goal.contributions || [])
        .filter((c) => c.amount > 0)
        .slice(-8)
        .map((c) => c.amount);

      // Last contribution info
      const lastContrib = goal.contributions?.length > 0
        ? goal.contributions[goal.contributions.length - 1]
        : null;
      const lastContribDaysAgo = lastContrib
        ? Math.floor((Date.now() - new Date(lastContrib.date).getTime()) / 86400000)
        : null;

      return {
        ...goal,
        percentage,
        isCompleted,
        daysUntilDeadline,
        paceDaily,
        paceMonthly,
        sparkData,
        lastContribDaysAgo,
      };
    }), [filteredGoals]);

  // ── Form reset ──
  const resetGoalForm = useCallback(() => {
    setEditingGoal(null);
    setGoalName('');
    setGoalTarget('');
    setGoalDeadline(undefined);
    setShowCalendar(false);
    setGoalIcon('f/target');
    setGoalColor(GOAL_COLORS[0]);
    setGoalImageUri(undefined);
    setIconPickerVisible(false);
    setPickerSelection(undefined);
  }, []);

  // ── Close modals (animated) ──
  const goalFinishClose = useCallback(() => {
    if (!goalClosingRef.current) return;
    goalClosingRef.current = false;
    setGoalModalVisible(false);
    resetGoalForm();
  }, [resetGoalForm]);

  const closeGoalModal = useCallback(() => {
    if (goalClosingRef.current) return;
    goalClosingRef.current = true;
    Keyboard.dismiss();
    goalSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(goalFinishClose)();
    });
  }, [SCREEN_H, goalSheetY, goalFinishClose]);

  const contribGoalRef = useRef<Goal | null>(null);
  const reopenDetailRef = useRef<((goal: Goal) => void) | null>(null);

  const contribFinishClose = useCallback(() => {
    if (!contribClosingRef.current) return;
    contribClosingRef.current = false;
    const goalId = contribGoalRef.current?.id;
    setContributeModalVisible(false);
    setContributingGoal(null);
    setIsWithdrawMode(false);
    contribGoalRef.current = null;
    if (goalId) {
      const fresh = usePersonalStore.getState().goals.find((g) => g.id === goalId);
      if (fresh) {
        setTimeout(() => reopenDetailRef.current?.(fresh), 80);
      }
    }
  }, []);

  const closeContributeModal = useCallback(() => {
    if (contribClosingRef.current) return;
    contribClosingRef.current = true;
    Keyboard.dismiss();
    contribSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(contribFinishClose)();
    });
    setTimeout(() => { if (contribClosingRef.current) contribFinishClose(); }, 300);
  }, [SCREEN_H, contribSheetY, contribFinishClose]);

  const historyFinishClose = useCallback(() => {
    if (!historyClosingRef.current) return;
    historyClosingRef.current = false;
    setHistoryModalVisible(false);
    setHistoryGoal(null);
  }, []);

  const closeHistoryModal = useCallback(() => {
    if (historyClosingRef.current) return;
    historyClosingRef.current = true;
    historySheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(historyFinishClose)();
    });
  }, [SCREEN_H, historySheetY, historyFinishClose]);

  // ── Open Add Modal ──
  const openAddGoal = useCallback(() => {
    if (goalsList.length >= MAX_GOALS) {
      showToast(t.goals.maxGoals.replace('{n}', String(MAX_GOALS)), 'error');
      return;
    }
    resetGoalForm();
    goalClosingRef.current = false;
    goalSheetY.value = SCREEN_H;
    setGoalModalVisible(true);
  }, [goalsList.length, resetGoalForm, showToast, SCREEN_H, goalSheetY]);

  // ── Open Edit Modal ──
  const openEditGoal = useCallback((goal: Goal) => {
    lightTap();
    setEditingGoal(goal);
    setGoalName(goal.name);
    setGoalTarget(goal.targetAmount.toString());
    setGoalDeadline(goal.deadline ? new Date(goal.deadline) : undefined);
    setShowCalendar(false);
    setGoalIcon(goal.icon ? (goal.icon.includes('/') ? goal.icon : `f/${goal.icon}`) : 'f/target');
    setGoalColor(goal.color);
    setGoalImageUri(goal.imageUri);
    goalClosingRef.current = false;
    goalSheetY.value = SCREEN_H;
    setGoalModalVisible(true);
  }, [SCREEN_H, goalSheetY]);

  // ── Save Goal ──
  const handleSaveGoal = useCallback(() => {
    if (!goalName.trim()) {
      showToast(t.goals.enterGoalName, 'error');
      return;
    }
    const target = parseFloat(goalTarget);
    if (!target || target <= 0) {
      showToast(t.goals.enterValidTarget, 'error');
      return;
    }

    if (editingGoal) {
      updateGoal(editingGoal.id, {
        name: goalName.trim(),
        targetAmount: target,
        deadline: goalDeadline,
        icon: goalIcon,
        imageUri: goalImageUri,
        color: goalColor,
      });
      showToast(t.goals.goalUpdated, 'success');
    } else {
      addGoal({
        name: goalName.trim(),
        targetAmount: target,
        deadline: goalDeadline,
        category: 'general',
        icon: goalIcon,
        imageUri: goalImageUri,
        color: goalColor,
      });
      showToast(t.goals.goalCreated, 'success');
    }

    closeGoalModal();
  }, [
    goalName,
    goalTarget,
    goalDeadline,
    goalIcon,
    goalImageUri,
    goalColor,
    editingGoal,
    addGoal,
    updateGoal,
    closeGoalModal,
    showToast,
  ]);

  // ── Delete Goal ──
  const handleDeleteGoal = useCallback(
    (goal: Goal) => {
      lightTap();
      Alert.alert(
        t.goals.deleteGoal,
        t.goals.removeGoalConfirm.replace('{name}', goal.name),
        [
          { text: t.common.cancel, style: 'cancel' },
          {
            text: t.common.delete,
            style: 'destructive',
            onPress: () => {
              deleteGoal(goal.id);
              showToast(t.goals.goalRemoved, 'success');
            },
          },
        ]
      );
    },
    [deleteGoal, showToast, t]
  );

  // ── Open Contribute Modal ──
  const openContribute = useCallback((goal: Goal, presetAmount?: number, withdraw?: boolean) => {
    lightTap();
    setContributingGoal(goal);
    contribGoalRef.current = goal;
    setContributeAmount(presetAmount ? presetAmount.toString() : '');
    setContributeNote('');
    setContributeWalletId(withdraw ? undefined : (goal.walletId || undefined));
    setIsWithdrawMode(!!withdraw);
    contribClosingRef.current = false;
    contribSheetY.value = SCREEN_H;
    setContributeModalVisible(true);
  }, [SCREEN_H, contribSheetY]);

  // ── Handle Contribution ──
  const handleContribute = useCallback(() => {
    if (!contributingGoal) return;

    const rawAmount = parseFloat(contributeAmount);
    if (!rawAmount || rawAmount <= 0) {
      showToast(t.goals.enterValidAmount, 'error');
      return;
    }

    const remaining = contributingGoal.targetAmount - contributingGoal.currentAmount;
    const amount = remaining > 0 ? Math.min(rawAmount, remaining) : rawAmount;

    const milestonesBefore = contributingGoal.milestones
      ? contributingGoal.milestones.filter((m) => m.reached).length
      : 0;

    let linkedTxId: string | undefined;
    if (contributeWalletId) {
      linkedTxId = addTransaction({
        amount,
        category: 'savings',
        description: contributingGoal.name,
        date: new Date(),
        type: 'expense',
        mode: 'personal',
        walletId: contributeWalletId,
        inputMethod: 'manual',
        linkedGoalId: contributingGoal.id,
      }) || undefined;
      useWalletStore.getState().deductFromWallet(contributeWalletId, amount);
    }

    contributeToGoal(
      contributingGoal.id,
      amount,
      contributeNote.trim() || undefined,
      contributeWalletId || undefined,
      linkedTxId,
    );

    const newAmount = contributingGoal.currentAmount + amount;
    const newPercentage =
      contributingGoal.targetAmount > 0
        ? (newAmount / contributingGoal.targetAmount) * 100
        : 0;

    const milestonesAfter = [25, 50, 75, 100].filter(
      (pct) => newPercentage >= pct
    ).length;

    if (milestonesAfter > milestonesBefore) {
      const crossedPct = [25, 50, 75, 100].find(
        (pct) =>
          newPercentage >= pct &&
          contributingGoal.currentAmount / contributingGoal.targetAmount * 100 < pct
      );
      if (crossedPct === 100) {
        successNotification();
        showToast(t.goals.goalReached, 'success');
      } else if (crossedPct) {
        mediumTap();
        showToast(t.goals.milestoneReached.replace('{n}', String(crossedPct)), 'success');
      } else {
        showToast(t.goals.contributionAdded, 'success');
      }
    } else {
      showToast(t.goals.contributionAdded, 'success');
    }

    closeContributeModal();
  }, [contributingGoal, contributeAmount, contributeNote, contributeWalletId, contributeToGoal, addTransaction, closeContributeModal, showToast, currency, t]);

  // ── Handle Withdraw ──
  const handleWithdraw = useCallback(() => {
    if (!contributingGoal) return;
    const amount = parseFloat(contributeAmount);
    if (!amount || amount <= 0) {
      showToast(t.goals.enterValidAmount, 'error');
      return;
    }
    const capped = Math.min(amount, contributingGoal.currentAmount);
    if (capped <= 0) {
      showToast(t.goals.nothingToWithdraw, 'error');
      return;
    }

    let linkedTxId: string | undefined;
    if (contributeWalletId) {
      linkedTxId = addTransaction({
        amount: capped,
        category: 'savings_return',
        description: contributingGoal.name,
        date: new Date(),
        type: 'income',
        mode: 'personal',
        walletId: contributeWalletId,
        inputMethod: 'manual',
        linkedGoalId: contributingGoal.id,
      }) || undefined;
      useWalletStore.getState().addToWallet(contributeWalletId, capped);
    }

    withdrawFromGoal(
      contributingGoal.id,
      capped,
      contributeNote.trim() || undefined,
      contributeWalletId || undefined,
      linkedTxId,
    );

    lightTap();
    showToast(`${currency} ${capped.toFixed(2)} ${t.goals.withdrawn}`, 'success');
    closeContributeModal();
  }, [contributingGoal, contributeAmount, contributeNote, contributeWalletId, withdrawFromGoal, addTransaction, closeContributeModal, showToast, currency, t]);

  // ── Handle undo contribution ──
  const handleUndoContribution = useCallback((goalId: string, contrib: GoalContribution) => {
    Alert.alert(
      t.goals.removeContribution,
      t.goals.removeContribConfirm.replace('{currency}', currency).replace('{amount}', Math.abs(contrib.amount).toFixed(2)),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => {
            if (contrib.transactionId) {
              deleteTransaction(contrib.transactionId);
            } else if (contrib.walletId) {
              if (contrib.amount < 0) {
                useWalletStore.getState().deductFromWallet(contrib.walletId, Math.abs(contrib.amount));
              } else {
                useWalletStore.getState().addToWallet(contrib.walletId, contrib.amount);
              }
            }
            removeContribution(goalId, contrib.id);
            showToast(t.goals.contributionRemoved, 'success');
            const updated = usePersonalStore.getState().goals.find((g) => g.id === goalId);
            if (updated) setHistoryGoal(updated);
          },
        },
      ]
    );
  }, [removeContribution, deleteTransaction, showToast, currency, t]);

  // ── Pause / Resume ──
  const handleTogglePause = useCallback((goal: Goal) => {
    selectionChanged();
    if (goal.isPaused) {
      resumeGoal(goal.id);
      showToast(t.goals.goalResumed, 'success');
    } else {
      pauseGoal(goal.id);
      showToast(t.goals.goalPaused, 'success');
    }
  }, [pauseGoal, resumeGoal, showToast, t]);

  // ── Archive / Unarchive ──
  const handleArchive = useCallback((goal: Goal) => {
    lightTap();
    archiveGoal(goal.id);
    showToast(t.goals.goalArchived, 'success');
  }, [archiveGoal, showToast, t]);

  const handleUnarchive = useCallback((goalId: string) => {
    lightTap();
    unarchiveGoal(goalId);
    showToast(t.goals.goalRestored, 'success');
  }, [unarchiveGoal, showToast, t]);

  const archivedGoals = useMemo(() => goalsList.filter((g) => g.isArchived), [goalsList]);

  // ── Open History Modal ──
  const openHistory = useCallback((goal: Goal) => {
    lightTap();
    historyClosingRef.current = false;
    historySheetY.value = SCREEN_H;
    setHistoryGoal(goal);
    setHistoryModalVisible(true);
  }, [SCREEN_H, historySheetY]);

  // ── Render Milestone Dots ──
  const renderMilestoneDots = useCallback((goal: Goal) => {
    const milestonePercentages = [25, 50, 75, 100];
    const currentPct =
      goal.targetAmount > 0
        ? (goal.currentAmount / goal.targetAmount) * 100
        : 0;

    return (
      <View style={styles.milestoneDots}>
        {milestonePercentages.map((pct) => {
          const isReached = currentPct >= pct;
          const milestoneData = goal.milestones?.find(
            (m) => m.percentage === pct
          );
          const reached = isReached || milestoneData?.reached;

          return (
            <View key={pct} style={styles.milestoneDotContainer}>
              <View
                style={[
                  styles.milestoneDot,
                  reached
                    ? { backgroundColor: goal.color }
                    : { backgroundColor: C.border },
                ]}
                accessibilityLabel={`${pct}% milestone ${reached ? 'reached' : 'not yet reached'}`}
              />
              <Text
                style={[
                  styles.milestoneDotLabel,
                  reached && { color: goal.color },
                ]}
              >
                {pct}%
              </Text>
            </View>
          );
        })}
      </View>
    );
  }, []);

  // ── History modal grouped contributions ──
  const historyGroups = useMemo(() => {
    if (!historyGoal) return [];
    const contribs = [...(historyGoal.contributions || [])].reverse();
    const groups: { label: string; items: GoalContribution[] }[] = [];
    let currentLabel = '';
    contribs.forEach((c) => {
      const d = c.date instanceof Date ? c.date : new Date(c.date);
      const label = isValid(d) ? format(d, 'MMMM yyyy') : t.goals.unknown;
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, items: [] });
      }
      groups[groups.length - 1].items.push(c);
    });
    return groups;
  }, [historyGoal, t]);

  const historyStats = useMemo(() => {
    if (!historyGoal) return { total: 0, avg: 0, count: 0 };
    const positives = (historyGoal.contributions || []).filter((c) => c.amount > 0);
    const total = positives.reduce((s, c) => s + c.amount, 0);
    const count = positives.length;
    return { total, avg: count > 0 ? total / count : 0, count };
  }, [historyGoal]);

  // ── Goal Detail Sheet state + animation ──
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);
  const detailSheetY = useSharedValue(SCREEN_H);
  const detailDragStart = useSharedValue(0);
  const detailClosingRef = useRef(false);
  const echoGoalRef = useRef<Goal | null>(null);

  const detailFinishClose = useCallback(() => {
    if (!detailClosingRef.current) return;
    detailClosingRef.current = false;
    setDetailGoal(null);
    setEchoGoal(null);
    echoGoalRef.current = null;
  }, []);

  const closeGoalDetail = useCallback(() => {
    if (detailClosingRef.current) return;
    detailClosingRef.current = true;
    detailSheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(detailFinishClose)();
    });
  }, [SCREEN_H, detailSheetY, detailFinishClose]);

  const openGoalDetail = useCallback((goal: Goal) => {
    lightTap();
    detailClosingRef.current = false;
    detailSheetY.value = SCREEN_H;
    setDetailGoal(goal);
  }, [SCREEN_H, detailSheetY]);
  reopenDetailRef.current = openGoalDetail;

  useEffect(() => {
    if (detailGoal) {
      detailSheetY.value = withTiming(0, { duration: 280 });
    }
  }, [detailGoal, detailSheetY]);

  const detailSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          detailDragStart.value = detailSheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = detailDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          detailSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          const passedThreshold = e.translationY > 100 || e.velocityY > 800;
          if (passedThreshold) {
            runOnJS(closeGoalDetail)();
          } else {
            detailSheetY.value = withTiming(0, { duration: 280 });
          }
        }),
    [SCREEN_H, closeGoalDetail, detailSheetY, detailDragStart]
  );

  const detailSheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: detailSheetY.value }],
  }));
  const detailBackdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(detailSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Echo insight for chat (memoized at component level) ──
  const echoInsightForChat = useMemo(() => {
    const g = detailGoal || echoGoal;
    if (!g) return { mode: '', title: '', subtitle: '', chips: [] as EchoChip[] };
    const pct = g.targetAmount > 0 ? Math.min((g.currentAmount / g.targetAmount) * 100, 100) : 0;
    const done = g.currentAmount >= g.targetAmount;
    const dl = g.deadline ? differenceInCalendarDays(new Date(g.deadline), new Date()) : null;
    let pd: number | null = null;
    let pm: number | null = null;
    if (g.deadline && dl !== null && dl > 0 && !done) {
      const rem = g.targetAmount - g.currentAmount;
      pd = rem / dl;
      pm = rem / (dl / 30);
    }
    const ms = Math.max(1, Math.round((Date.now() - new Date(g.createdAt).getTime()) / (30 * 86400000)));
    const mr = g.currentAmount / ms;
    const lc = g.contributions?.length ? g.contributions[g.contributions.length - 1] : null;
    const la = lc ? Math.floor((Date.now() - new Date(lc.date).getTime()) / 86400000) : null;
    return computeGoalInsight(g, { pct, done, daysLeft: dl, paceD: pd, paceM: pm, monthlyRate: mr, lastCAgo: la, lastC: lc }, currency);
  }, [detailGoal, currency]);

  // ── Goal form sheet animation ──
  useEffect(() => {
    if (goalModalVisible) {
      goalSheetY.value = withTiming(0, { duration: 280 });
    }
  }, [goalModalVisible, goalSheetY]);

  const goalSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => { 'worklet'; goalDragStart.value = goalSheetY.value; })
        .onUpdate((e) => {
          'worklet';
          let newY = goalDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          goalSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(closeGoalModal)();
          } else {
            goalSheetY.value = withTiming(0, { duration: 280 });
          }
        }),
    [closeGoalModal, goalSheetY, goalDragStart]
  );

  const goalSheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: goalSheetY.value }],
  }));
  const goalBackdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(goalSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Contribute sheet animation ──
  useEffect(() => {
    if (contributeModalVisible) {
      contribSheetY.value = withTiming(0, { duration: 280 });
      setTimeout(() => contribAmountRef.current?.focus(), 350);
    }
  }, [contributeModalVisible, contribSheetY]);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setContribKbVisible(true);
      setContribKbHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setContribKbVisible(false);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const contribSheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => { 'worklet'; contribDragStart.value = contribSheetY.value; })
        .onUpdate((e) => {
          'worklet';
          let newY = contribDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          contribSheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(closeContributeModal)();
          } else {
            contribSheetY.value = withTiming(0, { duration: 280 });
          }
        }),
    [closeContributeModal, contribSheetY, contribDragStart]
  );

  const contribSheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contribSheetY.value }],
  }));
  const contribBackdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(contribSheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── History sheet animation ──
  useEffect(() => {
    if (historyModalVisible) {
      historySheetY.value = withTiming(0, { duration: 280 });
    }
  }, [historyModalVisible, historySheetY]);

  const historySheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => { 'worklet'; historyDragStart.value = historySheetY.value; })
        .onUpdate((e) => {
          'worklet';
          let newY = historyDragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          historySheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(closeHistoryModal)();
          } else {
            historySheetY.value = withTiming(0, { duration: 280 });
          }
        }),
    [closeHistoryModal, historySheetY, historyDragStart]
  );

  const historySheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: historySheetY.value }],
  }));
  const historyBackdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(historySheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  // ── Swipeable refs ──
  const swipeRefs = useRef<Map<string, React.RefObject<SwipeableMethods | null>>>(new Map());
  const getSwipeRef = useCallback((id: string): React.RefObject<SwipeableMethods | null> => {
    let ref = swipeRefs.current.get(id);
    if (!ref) {
      ref = React.createRef<SwipeableMethods | null>();
      swipeRefs.current.set(id, ref);
    }
    return ref;
  }, []);
  const closeAllSwipeables = useCallback(() => {
    swipeRefs.current.forEach((ref) => ref.current?.close());
  }, []);

  // ── Filter pills ──
  const filterOptions = useMemo<{ key: GoalFilter; label: string }[]>(() => [
    { key: 'all', label: t.goals.all },
    { key: 'active', label: t.goals.active },
    { key: 'completed', label: t.goals.done },
    { key: 'paused', label: t.goals.paused },
  ], [t]);

  const sortOptions = useMemo<{ key: GoalSort; label: string; icon: keyof typeof Feather.glyphMap }[]>(() => [
    { key: 'manual', label: t.goals.defaultSort, icon: 'list' },
    { key: 'deadline', label: t.goals.deadline, icon: 'calendar' },
    { key: 'progress', label: t.goals.progress, icon: 'trending-up' },
  ], [t]);

  // ── Apply template ──
  const applyTemplate = useCallback((template: typeof goalTemplates[0]) => {
    selectionChanged();
    setGoalName(template.name);
    setGoalIcon(template.icon ? (template.icon.includes('/') ? template.icon : `f/${template.icon}`) : 'f/target');
    setGoalColor(template.color);
    setGoalImageUri(undefined);
  }, [goalTemplates]);

  const openIconPicker = useCallback(() => {
    Keyboard.dismiss();
    setPickerSelection(goalIcon);
    setIconPickerVisible(true);
  }, [goalIcon]);

  const selectGoalIcon = useCallback((icon: string) => {
    lightTap();
    setPickerSelection(icon);
  }, []);

  const saveIconSelection = useCallback(() => {
    if (pickerSelection) {
      setGoalIcon(pickerSelection);
      setGoalImageUri(undefined);
    }
    setIconPickerVisible(false);
  }, [pickerSelection]);

  const pickGoalImage = useCallback(() => {
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
        setGoalImageUri(result.assets[0].uri);
      }
    }, 50);
  }, []);

  // ── Swipe action renderers ──
  const GoalSwipeEdit = useCallback(({ drag }: { drag: SharedValue<number> }) => {
    const animStyle = useAnimatedStyle(() => {
      const w = Math.min(Math.abs(drag.value), 80);
      return { width: w, opacity: w > 20 ? 1 : 0 };
    });
    return (
      <Reanimated.View style={[styles.swipeAction, styles.swipeEdit, animStyle]}>
        <Feather name="edit-2" size={18} color={C.onAccent} />
      </Reanimated.View>
    );
  }, [C, styles]);

  const GoalSwipeDelete = useCallback(({ drag }: { drag: SharedValue<number> }) => {
    const animStyle = useAnimatedStyle(() => {
      const w = Math.min(Math.abs(drag.value), 80);
      return { width: w, opacity: w > 20 ? 1 : 0 };
    });
    return (
      <Reanimated.View style={[styles.swipeAction, styles.swipeDelete, animStyle]}>
        <Feather name="trash-2" size={18} color="#fff" />
      </Reanimated.View>
    );
  }, [styles]);

  // ScreenGuide spotlight target — the FAB (absent on first visit when there
  // are no goals yet; the guide falls back to inline points then).
  const guideTargetRef = useRef<any>(null);

  return (
    <View style={styles.container}>
      <ScreenGuide
        id="goals-guide"
        title={t.goals.screenGuideTitle ?? 'track your savings goals'}
        description={t.goals.screenGuideDesc ?? 'set targets, contribute regularly, and watch your progress grow'}
        icon="target"
        points={[
          { icon: 'plus', text: t.guide.goalsPoint1 },
          { icon: 'trending-up', text: t.guide.goalsPoint2 },
        ]}
        spotlight={{ targetRef: guideTargetRef, label: t.guide.goalsPoint1, sublabel: t.guide.goalsPoint2 }}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => { Keyboard.dismiss(); closeAllSwipeables(); }}
      >
        {activeGoals.length > 0 ? (
          <>
            {/* ── Filter & Sort Pills ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterRow}
              contentContainerStyle={styles.filterRowContent}
              keyboardShouldPersistTaps="handled"
            >
              {filterOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}
                  onPress={() => { selectionChanged(); setFilter(opt.key); }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: filter === opt.key }}
                >
                  <Text style={[styles.filterChipText, filter === opt.key && styles.filterChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.sortPill, sort !== 'manual' && styles.sortPillActive]}
                onPress={() => setShowSortMenu(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              >
                <Feather name="sliders" size={13} color={sort !== 'manual' ? C.onAccent : C.textMuted} />
                <Text style={[styles.sortPillText, sort !== 'manual' && styles.sortPillTextActive]}>
                  {sort === 'manual' ? (t.goals.sortBy ?? 'sort by') : sort === 'deadline' ? t.goals.deadline : t.goals.progress}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* ── Goal Cards (grid) ── */}
            {enrichedGoals.length > 0 ? (
              <Reanimated.View entering={FadeInDown.duration(300).delay(100)} style={styles.goalGrid}>
                {enrichedGoals.map((goal) => {
                  const { percentage, isCompleted } = goal;
                  return (
                    <Pressable
                      key={goal.id}
                      style={({ pressed }) => [
                        styles.goalCard,
                        { width: Math.min((SCREEN_W - SPACING.xl * 2 - SPACING.md) / 2, 220) },
                        goal.isPaused && { opacity: 0.5 },
                        pressed && { opacity: goal.isPaused ? 0.3 : 0.7 },
                      ]}
                      onPress={() => openGoalDetail(goal)}
                    >
                      <CircularProgress
                        size={48}
                        strokeWidth={3.5}
                        percentage={goal.isPaused ? 0 : percentage}
                        color={goal.isPaused ? C.neutral : goal.color}
                        trackColor={withAlpha(C.textPrimary, 0.1)}
                      >
                        {goal.imageUri
                          ? <Image source={{ uri: goal.imageUri }} style={{ width: 30, height: 30, borderRadius: 15 }} />
                          : renderGoalIcon(goal.icon || 'f/target', 18, goal.isPaused ? C.neutral : goal.color)}
                      </CircularProgress>
                      <Text style={[styles.goalCardName, goal.isPaused && { color: C.neutral }]}>
                        {goal.name}
                      </Text>
                      <Text style={styles.goalCardAmount}>
                        {currency} {goal.currentAmount % 1 === 0 ? goal.currentAmount.toLocaleString() : goal.currentAmount.toFixed(2)}
                      </Text>
                      <Text style={styles.goalCardTarget}>
                        {currency} {goal.targetAmount % 1 === 0 ? goal.targetAmount.toLocaleString() : goal.targetAmount.toFixed(2)}
                      </Text>
                    </Pressable>
                  );
                })}
              </Reanimated.View>
            ) : (
              <View style={styles.noResults}>
                <Feather name="search" size={36} color={C.textMuted} />
                <Text style={styles.noResultsTitle}>{t.goals.noResultsFound}</Text>
                <Text style={styles.noResultsText}>{t.goals.tryDifferentFilter}</Text>
              </View>
            )}

            {/* ── Archived ── */}
            {archivedGoals.length > 0 && (
              <CollapsibleSection
                title={t.goals.archived}
                subtitle={`${archivedGoals.length} ${archivedGoals.length > 1 ? t.goals.goals : t.goals.goal}`}
              >
                <View style={styles.groupCard}>
                  {archivedGoals.map((goal, index) => {
                    const pct = goal.targetAmount > 0 ? Math.round((goal.currentAmount / goal.targetAmount) * 100) : 0;
                    return (
                      <React.Fragment key={goal.id}>
                        {index > 0 && <View style={styles.cardDivider} />}
                        <View style={styles.archivedItem}>
                          <View style={[styles.goalIconWrap, { backgroundColor: withAlpha(goal.color, 0.08), overflow: 'hidden' }]}>
                            {goal.imageUri
                              ? <Image source={{ uri: goal.imageUri }} style={{ width: 36, height: 36, borderRadius: RADIUS.md }} />
                              : renderGoalIcon(goal.icon || 'f/target', 16, goal.color)}
                          </View>
                          <View style={styles.goalContent}>
                            <Text style={styles.archivedName} numberOfLines={1}>{goal.name}</Text>
                            <Text style={styles.archivedAmount}>
                              {currency} {goal.currentAmount.toLocaleString()} / {currency} {goal.targetAmount.toLocaleString()} · {pct}%
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.restoreBtn}
                            onPress={() => handleUnarchive(goal.id)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            accessibilityRole="button"
                            accessibilityLabel={t.goals.restore}
                          >
                            <Feather name="rotate-ccw" size={14} color={C.accent} />
                          </TouchableOpacity>
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              </CollapsibleSection>
            )}
          </>
        ) : (
          /* ── Empty State ── */
          <EmptyState
            icon="target"
            title={t.goals.whatSavingFor}
            message={t.goals.setGoalWatch}
            actionLabel={t.goals.addGoal}
            onAction={() => { lightTap(); openAddGoal(); }}
          />
        )}
      </ScrollView>

      {/* ── FAB ── */}
      {activeGoals.length > 0 && goalsList.length < MAX_GOALS && (
        <FAB
          ref={guideTargetRef}
          onPress={openAddGoal}
          style={{ bottom: Math.max(SPACING['2xl'], insets.bottom + SPACING.md) }}
        />
      )}

      {/* ═══ ADD / EDIT GOAL SHEET ═══ */}
      {goalModalVisible && <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeGoalModal}>
        <View style={StyleSheet.absoluteFill}>
          <Reanimated.View style={[styles.detailBackdrop, goalBackdropAnimStyle]}>
            <Pressable style={{ flex: 1 }} onPress={closeGoalModal} />
          </Reanimated.View>
          <Reanimated.View style={[styles.detailSheetContainer, styles.gfSheet, goalSheetAnimStyle]}>
            <GestureDetector gesture={goalSheetGesture}>
              <View collapsable={false}>
                <View style={styles.gfHandleRow}>
                  <View style={styles.gfHandle} />
                </View>
                {/* Title */}
                <View style={styles.gfTitleZone}>
                  <Text style={styles.gfTitleText}>
                    {editingGoal ? t.goals.edit.toLowerCase() + ' goal' : 'new goal'}
                  </Text>
                  <Text style={styles.gfSubtitleText}>
                    {editingGoal
                      ? `${editingGoal.name.toLowerCase()}`
                      : t.goals.setGoalWatch}
                  </Text>
                </View>
              </View>
            </GestureDetector>

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
              {/* ── Hero: ring preview + amount input ── */}
              <Pressable style={styles.gfHeroArea} onPress={() => goalTargetRef.current?.focus()}>
                <View style={styles.gfHeroRingRow}>
                  <TouchableOpacity onPress={openIconPicker} activeOpacity={0.7}>
                    <CircularProgress
                      size={56}
                      strokeWidth={5}
                      percentage={0}
                      color={goalColor}
                      trackColor={withAlpha(goalColor, 0.15)}
                    >
                      {goalImageUri
                        ? <Image source={{ uri: goalImageUri }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                        : renderGoalIcon(goalIcon, 18, goalColor)}
                    </CircularProgress>
                  </TouchableOpacity>
                  <View style={styles.gfHeroAmountCol}>
                    <View style={styles.gfHeroAmountRow}>
                      <Text style={styles.gfHeroCurrency}>{currency}</Text>
                      <TextInput
                        ref={goalTargetRef}
                        style={styles.gfHeroInput}
                        value={goalTarget}
                        onChangeText={setGoalTarget}
                        placeholder="0"
                        keyboardType="decimal-pad"
                        placeholderTextColor={withAlpha(C.textMuted, 0.25)}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={goalColor}
                      />
                    </View>
                    <Text style={styles.gfHeroHint}>
                      {goalTarget && parseFloat(goalTarget) > 0 ? 'target amount' : 'how much do you need?'}
                    </Text>
                  </View>
                </View>
              </Pressable>

              {/* ── Color strip (right after hero — defines identity) ── */}
              <View style={styles.gfColorStrip}>
                {GOAL_COLORS.map((color) => {
                  const sel = goalColor === color;
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[styles.gfColorDot, { backgroundColor: color }, sel && styles.gfColorDotSelected]}
                      onPress={() => { lightTap(); setGoalColor(color); }}
                      activeOpacity={0.7}
                    >
                      {sel && <Feather name="check" size={10} color={C.onAccent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ── Template chips (create mode) ── */}
              {!editingGoal && (
                <View style={[styles.hScrollFadeWrap, { marginRight: -SPACING.lg, marginBottom: SPACING.sm }]}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: SPACING['2xl'], gap: SPACING.xs }}>
                    {goalTemplates.map((tmpl) => {
                      const active = goalName === tmpl.name;
                      return (
                        <TouchableOpacity
                          key={tmpl.name}
                          style={[
                            styles.gfTemplateChip,
                            active && { backgroundColor: withAlpha(tmpl.color, 0.12), borderColor: withAlpha(tmpl.color, 0.4) },
                          ]}
                          onPress={() => applyTemplate(tmpl)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                        >
                          <Feather name={tmpl.icon} size={14} color={active ? tmpl.color : C.textMuted} />
                          <Text style={[styles.gfTemplateChipText, active && { color: tmpl.color, fontWeight: TYPOGRAPHY.weight.bold }]}>{tmpl.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <LinearGradient colors={[withAlpha(C.background, 0), C.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.hScrollFade} pointerEvents="none" />
                </View>
              )}

              {/* ── Name + Icon (grouped card) ── */}
              <View style={styles.gfCard}>
                <View style={styles.gfCardRow}>
                  <TouchableOpacity onPress={openIconPicker} activeOpacity={0.7} style={styles.gfNameIconBtn}>
                    <View style={[styles.gfNameIconFallback, { backgroundColor: withAlpha(goalColor, 0.10) }]}>
                      {goalImageUri
                        ? <Image source={{ uri: goalImageUri }} style={{ width: 36, height: 36, borderRadius: RADIUS.md }} />
                        : renderGoalIcon(goalIcon, 20, goalColor)}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.gfFieldFlex}>
                    <Text style={styles.gfFieldLabel}>name</Text>
                    <TextInput
                      style={styles.gfFieldInput}
                      value={goalName}
                      onChangeText={setGoalName}
                      placeholder={t.goals.namePlaceholder}
                      placeholderTextColor={C.textMuted}
                      returnKeyType="next"
                      maxLength={50}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={goalColor}
                    />
                  </View>
                  <TouchableOpacity style={[styles.gfChangeIconPill, { borderColor: withAlpha(goalColor, 0.25) }]} onPress={openIconPicker} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Feather name="image" size={11} color={goalColor} />
                    <Text style={[styles.gfChangeIconText, { color: goalColor }]}>icon</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── Deadline ── */}
              <View style={styles.gfCard}>
                <TouchableOpacity
                  style={styles.gfCardRow}
                  onPress={() => { lightTap(); Keyboard.dismiss(); if (!goalDeadline) setGoalDeadline(new Date()); setShowCalendar(true); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.gfIconBox, { backgroundColor: withAlpha(goalColor, 0.08) }]}>
                    <Feather name="calendar" size={14} color={goalColor} />
                  </View>
                  <View style={styles.gfFieldFlex}>
                    <Text style={styles.gfFieldLabel}>deadline</Text>
                    <Text style={styles.gfFieldValue}>
                      {goalDeadline ? format(goalDeadline, 'MMM d, yyyy') : 'none (optional)'}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={withAlpha(C.textMuted, 0.5)} />
                </TouchableOpacity>
              </View>

              {/* Delete — edit mode only */}
              {editingGoal && (
                <Pressable
                  style={styles.gfDeleteLink}
                  onPress={() => { closeGoalModal(); handleDeleteGoal(editingGoal); }}
                  hitSlop={{ top: 14, bottom: 14, left: 18, right: 18 }}
                >
                  {({ pressed }) => (
                    <View style={[styles.gfDeleteLinkInner, pressed && { opacity: 0.55 }]}>
                      <Feather name="trash-2" size={13} color={C.textMuted} />
                      <Text style={styles.gfDeleteLinkText}>{t.goals.deleteThisGoal}</Text>
                    </View>
                  )}
                </Pressable>
              )}
            </KeyboardAwareScrollView>

            {/* Anchored save zone */}
            <View style={[styles.gfSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
              <Pressable style={[styles.gfSaveBtn, { backgroundColor: goalColor }]} onPress={handleSaveGoal}>
                <View style={styles.gfSaveBtnInner}>
                  <Feather name={editingGoal ? 'check' : 'plus'} size={16} color={C.onAccent} />
                  <Text style={styles.gfSaveBtnText}>
                    {editingGoal ? t.goals.saveChanges.toLowerCase() : t.goals.createGoal.toLowerCase()}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                style={styles.gfSecondaryLink}
                onPress={closeGoalModal}
                hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
              >
                {({ pressed }) => (
                  <View style={[styles.gfSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={styles.gfSecondaryLinkText}>close</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </Reanimated.View>

          {/* Calendar picker overlay */}
          {showCalendar && (
            <>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setShowCalendar(false)}
              >
                <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(C.dimBg, 0.45) }]} />
              </Pressable>
              <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]} pointerEvents="box-none">
                <View style={styles.ipCard} onStartShouldSetResponder={() => true}>
                  <View style={styles.ipHeader}>
                    <Text style={styles.ipTitle}>deadline</Text>
                    <TouchableOpacity onPress={() => setShowCalendar(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Feather name="x" size={16} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <CalendarPicker value={goalDeadline || new Date()} minimumDate={new Date()} onChange={(date) => { setGoalDeadline(date); }} />
                  <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
                    <TouchableOpacity
                      style={[styles.ipSaveBtn, { backgroundColor: goalColor, flex: 1 }]}
                      onPress={() => setShowCalendar(false)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.ipSaveBtnInner}>
                        <Feather name="check" size={14} color={C.onAccent} />
                        <Text style={styles.ipSaveBtnText}>done</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                  <Pressable style={styles.ipRemoveBtn} onPress={() => { setGoalDeadline(undefined); setShowCalendar(false); }}>
                    {({ pressed }) => (
                      <View style={[styles.ipRemoveBtnInner, pressed && { opacity: 0.55 }]}>
                        <Feather name="x" size={12} color={C.textMuted} />
                        <Text style={styles.ipRemoveText}>{t.goals.clearDeadline}</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            </>
          )}

          {/* Icon picker overlay */}
          {iconPickerVisible && (
            <>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setIconPickerVisible(false)}
              >
                <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(C.dimBg, 0.45) }]} />
              </Pressable>
              <KeyboardAvoidingView
                style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                pointerEvents="box-none"
              >
                <View style={styles.ipCard} onStartShouldSetResponder={() => true}>
                  <View style={styles.ipHeader}>
                    <Text style={styles.ipTitle}>choose icon</Text>
                    <TouchableOpacity onPress={() => setIconPickerVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Feather name="x" size={16} color={C.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {suggestedIcons.length > 0 && (
                    <>
                      <Text style={styles.ipSectionLabel}>suggested</Text>
                      <View style={styles.ipGrid}>
                        {suggestedIcons.map(icon => {
                          const sel = pickerSelection === icon;
                          return (
                            <TouchableOpacity
                              key={`s-${icon}`}
                              style={[styles.ipGridItem, sel && { backgroundColor: goalColor }]}
                              onPress={() => selectGoalIcon(icon)}
                              activeOpacity={0.7}
                            >
                              {renderGoalIcon(icon, 20, sel ? C.onAccent : C.textSecondary)}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}

                  <Text style={styles.ipSectionLabel}>common</Text>
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={{ maxHeight: 180 }}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    <View style={styles.ipGrid}>
                      {COMMON_GOAL_ICONS.map(icon => {
                        const sel = pickerSelection === icon;
                        return (
                          <TouchableOpacity
                            key={icon}
                            style={[styles.ipGridItem, sel && { backgroundColor: goalColor }]}
                            onPress={() => selectGoalIcon(icon)}
                            activeOpacity={0.7}
                          >
                            {renderGoalIcon(icon, 20, sel ? C.onAccent : C.textSecondary)}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>

                  <View style={styles.ipDivider} />

                  <TouchableOpacity style={styles.ipGalleryRow} onPress={pickGoalImage} activeOpacity={0.7}>
                    <Feather name="image" size={16} color={goalColor} />
                    <Text style={[styles.ipGalleryText, { color: goalColor }]}>choose from gallery</Text>
                  </TouchableOpacity>

                  <Pressable style={[styles.ipSaveBtn, { backgroundColor: goalColor }]} onPress={saveIconSelection}>
                    <View style={styles.ipSaveBtnInner}>
                      <Feather name="check" size={14} color={C.onAccent} />
                      <Text style={styles.ipSaveBtnText}>save</Text>
                    </View>
                  </Pressable>

                  {(goalImageUri || pickerSelection) && (
                    <Pressable style={styles.ipRemoveBtn} onPress={() => { setGoalImageUri(undefined); setPickerSelection('f/target'); }}>
                      {({ pressed }) => (
                        <View style={[styles.ipRemoveBtnInner, pressed && { opacity: 0.55 }]}>
                          <Feather name="x" size={12} color={C.textMuted} />
                          <Text style={styles.ipRemoveText}>remove</Text>
                        </View>
                      )}
                    </Pressable>
                  )}
                </View>
              </KeyboardAvoidingView>
            </>
          )}
        </View>
        <ModalToastHost />
      </Modal>}

      {/* ═══ CONTRIBUTE SHEET ═══ */}
      {contributeModalVisible && <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeContributeModal}>
        <View style={StyleSheet.absoluteFill}>
          <Reanimated.View style={[styles.detailBackdrop, contribBackdropAnimStyle]}>
            <Pressable style={{ flex: 1 }} onPress={closeContributeModal} />
          </Reanimated.View>
          <Reanimated.View style={[styles.detailSheetContainer, styles.gfSheet, contribSheetAnimStyle]}>
            <GestureDetector gesture={contribSheetGesture}>
              <View collapsable={false}>
                <View style={styles.gfHandleRow}>
                  <View style={styles.gfHandle} />
                </View>
                {contributingGoal && (
                  <View style={styles.gfTitleZone}>
                    <Text style={styles.gfTitleText}>
                      {isWithdrawMode ? t.goals.withdraw.toLowerCase() : t.goals.contribute.toLowerCase()}
                    </Text>
                    <Text style={styles.gfSubtitleText}>
                      {contributingGoal.name.toLowerCase()} · {currency} {contributingGoal.currentAmount.toFixed(2)} / {currency} {contributingGoal.targetAmount.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            </GestureDetector>

            <ScrollView
              ref={contribScrollRef}
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              keyboardDismissMode="on-drag"
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: contribKbVisible ? contribKbHeight + SPACING.xl : (SPACING['3xl'] + insets.bottom) }}
            >
              {/* ── Hero: ring + amount input ── */}
              {contributingGoal && (
                <Pressable style={styles.gfHeroArea} onPress={() => contribAmountRef.current?.focus()}>
                  <View style={styles.gfHeroRingRow}>
                    <CircularProgress
                      size={56}
                      strokeWidth={5}
                      percentage={contributingGoal.targetAmount > 0 ? Math.min((contributingGoal.currentAmount / contributingGoal.targetAmount) * 100, 100) : 0}
                      color={contributingGoal.color}
                      trackColor={withAlpha(contributingGoal.color, 0.15)}
                    >
                      {renderGoalIcon(contributingGoal.icon, 18, contributingGoal.color)}
                    </CircularProgress>
                    <View style={styles.gfHeroAmountCol}>
                      <View style={styles.gfHeroAmountRow}>
                        <Text style={styles.gfHeroCurrency}>{currency}</Text>
                        <TextInput
                          ref={contribAmountRef}
                          style={styles.gfHeroInput}
                          value={contributeAmount}
                          onChangeText={setContributeAmount}
                          placeholder="0"
                          keyboardType="decimal-pad"
                          placeholderTextColor={withAlpha(C.textMuted, 0.25)}
                          returnKeyType="done"
                          onSubmitEditing={Keyboard.dismiss}
                          keyboardAppearance={isDark ? 'dark' : 'light'}
                          selectionColor={contributingGoal.color}
                        />
                      </View>
                      <Text style={styles.gfHeroHint}>
                        {contributeAmount && parseFloat(contributeAmount) > 0
                          ? (() => {
                              const inputAmt = parseFloat(contributeAmount);
                              const newAmount = isWithdrawMode
                                ? Math.max(contributingGoal.currentAmount - Math.min(inputAmt, contributingGoal.currentAmount), 0)
                                : Math.min(contributingGoal.currentAmount + inputAmt, contributingGoal.targetAmount);
                              const newPct = contributingGoal.targetAmount > 0
                                ? Math.min((newAmount / contributingGoal.targetAmount) * 100, 100)
                                : 0;
                              const remaining = Math.max(contributingGoal.targetAmount - newAmount, 0);
                              if (!isWithdrawMode && newPct >= 100) return t.goals.goalWillBeReached;
                              return `→ ${newPct.toFixed(0)}%${remaining > 0 ? ` · ${currency} ${remaining.toFixed(2)} ${t.goals.toGo}` : ''}`;
                            })()
                          : isWithdrawMode ? 'how much to withdraw?' : 'how much to add?'}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              )}

              {/* ── Quick amount chips ── */}
              {contributingGoal && !isWithdrawMode && (
                <View style={styles.gfColorStrip}>
                  {QUICK_AMOUNTS.map((amt) => {
                    const sel = contributeAmount === amt.toString();
                    return (
                      <TouchableOpacity
                        key={amt}
                        style={[
                          styles.cfQuickChip,
                          { borderColor: withAlpha(contributingGoal.color, sel ? 0.5 : 0.15), backgroundColor: sel ? withAlpha(contributingGoal.color, 0.12) : withAlpha(contributingGoal.color, 0.04) },
                        ]}
                        onPress={() => { lightTap(); setContributeAmount(amt.toString()); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.cfQuickChipText, { color: contributingGoal.color }]}>+{amt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* ── Wallet ── */}
              {wallets.length > 0 && (
                <WalletPicker
                  wallets={wallets.filter((w) => w.type !== 'credit')}
                  selectedId={contributeWalletId || null}
                  onSelect={(id) => setContributeWalletId(id)}
                  onClear={() => setContributeWalletId(undefined)}
                  allowNone
                  noneLabel={t.goals.none}
                  label={isWithdrawMode ? t.goals.returnToWallet : t.goals.walletOptional}
                />
              )}

              {/* ── Note ── */}
              <View style={styles.gfCard} onLayout={(e) => { contribNoteY.current = e.nativeEvent.layout.y; }}>
                <View style={styles.gfCardRow}>
                  <View style={[styles.gfIconBox, { backgroundColor: withAlpha(contributingGoal?.color || C.accent, 0.08) }]}>
                    <Feather name="edit-3" size={14} color={contributingGoal?.color || C.accent} />
                  </View>
                  <View style={styles.gfFieldFlex}>
                    <Text style={styles.gfFieldLabel}>{t.goals.noteOptional}</Text>
                    <TextInput
                      style={[styles.gfFieldInput, { minHeight: 60, textAlignVertical: 'top' }]}
                      value={contributeNote}
                      onChangeText={setContributeNote}
                      placeholder={t.goals.notePlaceholder}
                      placeholderTextColor={C.textMuted}
                      multiline
                      numberOfLines={3}
                      onFocus={() => setContribNoteFocused(true)}
                      onBlur={() => setContribNoteFocused(false)}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={contributingGoal?.color || C.accent}
                    />
                  </View>
                </View>
              </View>
            </ScrollView>

            {contribKbVisible && contribNoteFocused && (
              <TouchableOpacity
                style={[styles.doneFab, { bottom: contribKbHeight + 16 }]}
                onPress={() => Keyboard.dismiss()}
                activeOpacity={0.8}
              >
                <Feather name="check" size={20} color={C.onAccent} />
              </TouchableOpacity>
            )}

            {/* Save zone */}
            <View style={[styles.gfSaveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
              <Pressable
                style={[styles.gfSaveBtn, { backgroundColor: isWithdrawMode ? C.bronze : (contributingGoal?.color || C.accent) }]}
                onPress={isWithdrawMode ? handleWithdraw : handleContribute}
              >
                {({ pressed }: { pressed: boolean }) => (
                  <View style={[styles.gfSaveBtnInner, pressed && { opacity: 0.7 }]}>
                    <Feather name={isWithdrawMode ? 'minus' : 'plus'} size={16} color={C.onAccent} />
                    <Text style={styles.gfSaveBtnText}>
                      {isWithdrawMode ? t.goals.withdraw.toLowerCase() : t.goals.contribute.toLowerCase()}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={styles.gfSecondaryLink} onPress={closeContributeModal} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}>
                {({ pressed }: { pressed: boolean }) => (
                  <View style={[styles.gfSecondaryLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={styles.gfSecondaryLinkText}>{t.goals.close}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </Reanimated.View>
        </View>
        <ModalToastHost />
      </Modal>}

      {/* ═══ CONTRIBUTION HISTORY SHEET ═══ */}
      {historyModalVisible && <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeHistoryModal}>
        <View style={StyleSheet.absoluteFill}>
          <Reanimated.View style={[styles.detailBackdrop, historyBackdropAnimStyle]}>
            <Pressable style={{ flex: 1 }} onPress={closeHistoryModal} />
          </Reanimated.View>
          <Reanimated.View style={[styles.detailSheetContainer, { paddingBottom: Math.max(insets.bottom, SPACING.xl) }, historySheetAnimStyle]}>
            <GestureDetector gesture={historySheetGesture}>
              <View collapsable={false}>
                <View style={styles.detailTopRow}>
                  <View style={styles.detailHandle} />
                  <TouchableOpacity style={styles.detailCloseX} onPress={closeHistoryModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Feather name="x" size={18} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.detailTitleZone}>
                  {historyGoal && (
                    <View style={[styles.detailIconWrap, { backgroundColor: withAlpha(historyGoal.color, 0.12) }]}>
                      <Feather name={(historyGoal.icon as keyof typeof Feather.glyphMap) || 'target'} size={24} color={historyGoal.color} />
                    </View>
                  )}
                  <Text style={styles.detailTitle} numberOfLines={1}>{historyGoal?.name || t.goals.history}</Text>
                  <Text style={styles.detailSubtitle}>{t.goals.history.toLowerCase()}</Text>
                </View>
              </View>
            </GestureDetector>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={styles.detailScrollContent}>
              {/* Stats card */}
              <View style={styles.historyStatsRow}>
                <View style={styles.historyStatItem}>
                  <Text style={styles.historyStatLabel}>{t.goals.total}</Text>
                  <Text style={styles.historyStatValue}>{currency} {historyStats.total.toFixed(2)}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.historyStatItem}>
                  <Text style={styles.historyStatLabel}>{t.goals.average}</Text>
                  <Text style={styles.historyStatValue}>{currency} {historyStats.avg.toFixed(2)}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.historyStatItem}>
                  <Text style={styles.historyStatLabel}>{t.goals.count}</Text>
                  <Text style={styles.historyStatValue}>{historyStats.count}</Text>
                </View>
              </View>

              {historyGroups.map((group) => (
                <View key={group.label}>
                  <Text style={styles.historyGroupLabel}>{group.label.toLowerCase()}</Text>
                  {group.items.map((c) => {
                    const d = c.date instanceof Date ? c.date : new Date(c.date);
                    const isWithdrawal = c.amount < 0;
                    return (
                      <View key={c.id} style={styles.historyItem}>
                        <View style={styles.historyItemLeft}>
                          <Text style={styles.historyItemDate}>{isValid(d) ? format(d, 'MMM dd') : '—'}</Text>
                          <Text style={[styles.historyItemAmount, isWithdrawal && { color: C.neutral }]}>
                            {isWithdrawal ? '-' : '+'}{currency} {Math.abs(c.amount).toFixed(2)}
                          </Text>
                          {c.note && <Text style={styles.historyItemNote} numberOfLines={1}>{c.note}</Text>}
                        </View>
                        {historyGoal && (
                          <TouchableOpacity
                            onPress={() => handleUndoContribution(historyGoal.id, c)}
                            activeOpacity={0.7}
                            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                            accessibilityRole="button"
                            accessibilityLabel={t.goals.undo}
                          >
                            <Feather name="corner-down-left" size={16} color={C.neutral} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
              {historyGroups.length === 0 && (
                <Text style={styles.noResultsText}>{t.goals.noContributionsYet}</Text>
              )}
            </ScrollView>

            {/* Close zone */}
            <View style={styles.detailSaveZone}>
              <Pressable style={styles.detailCloseLink} onPress={closeHistoryModal} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}>
                {({ pressed }: { pressed: boolean }) => (
                  <View style={[styles.detailCloseLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={styles.detailCloseLinkText}>{t.goals.close}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </Reanimated.View>
        </View>
        <ModalToastHost />
      </Modal>}

      {/* ═══ SORT MENU ═══ */}
      {showSortMenu && (
        <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={() => setShowSortMenu(false)}>
          <Pressable style={styles.sortMenuBackdrop} onPress={() => setShowSortMenu(false)}>
            <View style={styles.sortMenuCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.sortMenuTitle}>{t.goals.sortBy ?? 'sort by'}</Text>
              {sortOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.sortMenuItem}
                  onPress={() => { selectionChanged(); setSort(opt.key); setShowSortMenu(false); }}
                  activeOpacity={0.7}
                >
                  <Feather name={opt.icon} size={15} color={sort === opt.key ? C.accent : C.textMuted} />
                  <Text style={[styles.sortMenuItemText, sort === opt.key && { color: C.accent, fontWeight: TYPOGRAPHY.weight.semibold as any }]}>
                    {opt.label}
                  </Text>
                  {sort === opt.key && <Feather name="check" size={15} color={C.accent} style={{ marginLeft: 'auto' as any }} />}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>
      )}

      {/* ═══ GOAL DETAIL SHEET ═══ */}
      {detailGoal && (() => {
        const g = detailGoal;
        const pct = g.targetAmount > 0 ? Math.min((g.currentAmount / g.targetAmount) * 100, 100) : 0;
        const done = g.currentAmount >= g.targetAmount;
        const daysLeft = g.deadline ? differenceInCalendarDays(new Date(g.deadline), new Date()) : null;
        let paceD: number | null = null;
        let paceM: number | null = null;
        if (g.deadline && daysLeft !== null && daysLeft > 0 && !done) {
          const rem = g.targetAmount - g.currentAmount;
          paceD = rem / daysLeft;
          paceM = rem / (daysLeft / 30);
        }
        const lastC = g.contributions?.length > 0 ? g.contributions[g.contributions.length - 1] : null;
        const lastCAgo = lastC ? Math.floor((Date.now() - new Date(lastC.date).getTime()) / 86400000) : null;
        const monthsSince = Math.max(1, Math.round((Date.now() - new Date(g.createdAt).getTime()) / (30 * 86400000)));
        const monthlyRate = g.currentAmount / monthsSince;
        const onPace = paceM !== null && paceM > 0 && monthlyRate >= paceM;
        const recentContribs = [...(g.contributions || [])].reverse().slice(0, 3);
        const goalInsight = computeGoalInsight(g, { pct, done, daysLeft, paceD, paceM, monthlyRate, lastCAgo, lastC }, currency);

        return (
          <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeGoalDetail}>
            <View style={StyleSheet.absoluteFill}>
              <Reanimated.View style={[styles.detailBackdrop, detailBackdropAnimStyle]}>
                <Pressable style={{ flex: 1 }} onPress={closeGoalDetail} />
              </Reanimated.View>
              <Reanimated.View style={[styles.detailSheetContainer, styles.gfSheet, { paddingBottom: Math.max(insets.bottom, SPACING.xl) }, detailSheetAnimStyle]}>
                {/* Drag zone: handle */}
                <GestureDetector gesture={detailSheetGesture}>
                  <View collapsable={false}>
                    <View style={styles.detailTopRow}>
                      <View style={styles.detailHandle} />
                    </View>

                    {/* Ring hero */}
                    <View style={styles.detailRingZone}>
                      <View style={{ position: 'relative' }}>
                        <CircularProgress
                          size={150}
                          strokeWidth={12}
                          percentage={done ? 100 : pct}
                          color={g.isPaused ? C.neutral : g.color}
                          trackColor={C.border}
                        >
                          <Text style={styles.detailRingAmt}>{currency} {g.currentAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</Text>
                          <Text style={styles.detailRingPctSmall}>{pct.toFixed(0)}%</Text>
                        </CircularProgress>
                        <View style={styles.detailRingBadgeWrap}>
                          <View style={[styles.detailRingBadge, { backgroundColor: g.isPaused ? C.neutral : g.color, overflow: 'hidden' }]}>
                            {g.imageUri
                              ? <Image source={{ uri: g.imageUri }} style={{ width: 25, height: 25, borderRadius: 12.5 }} />
                              : renderGoalIcon(g.icon || 'f/target', 14, C.onAccent)}
                          </View>
                        </View>
                      </View>
                      <Text style={[styles.detailTitle, { fontWeight: TYPOGRAPHY.weight.medium, marginTop: SPACING.md }]}>{g.name}</Text>
                      {g.isPaused && (
                        <View style={styles.pausedBadge}>
                          <Text style={styles.pausedBadgeText}>{t.goals.paused}</Text>
                        </View>
                      )}
                      <Text style={[styles.detailSubtitle, { fontStyle: 'normal' }]}>
                        {done
                          ? t.goals.goalReached
                          : `of ${currency} ${g.targetAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${getObservation(pct) ? `  ·  ${getObservation(pct)}` : ''}`}
                      </Text>
                    </View>
                  </View>
                </GestureDetector>

                {/* Scrollable content */}
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={styles.detailScrollContent}>
                  {/* Summary stats card */}
                  {!done && !g.isPaused && (
                    <View style={styles.dtSummaryCard}>
                      <View style={styles.dtSummaryRow}>
                        <View style={styles.dtSummaryStat}>
                          <Text style={styles.dtSummaryValue}>
                            {currency} {(g.targetAmount - g.currentAmount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                          </Text>
                          <Text style={styles.dtSummaryLabel}>remaining</Text>
                        </View>
                        {g.deadline && daysLeft !== null && (
                          <View style={[styles.dtSummaryStat, styles.dtSummaryStatBorder]}>
                            <Text style={[styles.dtSummaryValue, daysLeft < 0 && { color: C.bronze }]}>
                              {daysLeft < 0
                                ? t.goals.dOverdue.replace('{n}', String(Math.abs(daysLeft)))
                                : daysLeft === 0 ? t.goals.dueToday
                                : `${daysLeft} days`}
                            </Text>
                            <Text style={styles.dtSummaryLabel}>{daysLeft < 0 ? 'overdue' : t.goals.remaining}</Text>
                          </View>
                        )}
                        {paceM !== null && paceM > 0 && (
                          <View style={[styles.dtSummaryStat, styles.dtSummaryStatBorder]}>
                            <Text style={styles.dtSummaryValue}>
                              ~{currency} {Math.ceil(paceM).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            </Text>
                            <Text style={styles.dtSummaryLabel}>per month</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Echo coaching tip */}
                  <TouchableOpacity
                    style={styles.echoTipCard}
                    onPress={() => {
                      lightTap();
                      setEchoGoal(g);
                      echoGoalRef.current = g;
                      setDetailGoal(null);
                      setTimeout(() => setEchoSheetVisible(true), 50);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.echoTipRow}>
                      <Text style={styles.echoTipTag}>echo</Text>
                      <Text style={styles.echoTipAsk}>talk to echo  ›</Text>
                    </View>
                    <Text style={styles.echoTipTitle}>{goalInsight.title}</Text>
                    {!!goalInsight.subtitle && <Text style={styles.echoTipSubtitle}>{goalInsight.subtitle}</Text>}
                  </TouchableOpacity>

                  {/* CTA */}
                  <View style={styles.detailCtaZone}>
                    {!done && !g.isPaused && (
                      <>
                        <TouchableOpacity
                          style={[styles.detailCtaMain, { backgroundColor: g.color }]}
                          onPress={() => { closeGoalDetail(); setTimeout(() => openContribute(g), 280); }}
                          activeOpacity={0.7}
                        >
                          <Feather name="plus" size={18} color={C.onAccent} />
                          <Text style={styles.detailCtaMainText}>{t.goals.addMoney ?? 'add money'}</Text>
                        </TouchableOpacity>
                        {g.currentAmount > 0 && (
                          <TouchableOpacity
                            style={styles.detailCtaLink}
                            onPress={() => { closeGoalDetail(); setTimeout(() => openContribute(g, undefined, true), 280); }}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                          >
                            <Text style={styles.detailCtaLinkText}>{t.goals.withdraw}</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                    {done && (
                      <TouchableOpacity
                        style={[styles.detailCtaMain, { backgroundColor: C.positive }]}
                        onPress={() => { closeGoalDetail(); setTimeout(() => handleArchive(g), 280); }}
                        activeOpacity={0.7}
                      >
                        <Feather name="archive" size={18} color={C.onAccent} />
                        <Text style={styles.detailCtaMainText}>{t.goals.archive}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Activity card */}
                  {recentContribs.length > 0 && (
                    <>
                      <Text style={styles.dtSectionLabel}>{t.goals.recentActivity ?? 'recent activity'}</Text>
                      <View style={styles.dtActivityCard}>
                        {recentContribs.map((c, idx) => {
                          const d = c.date instanceof Date ? c.date : new Date(c.date);
                          const isW = c.amount < 0;
                          return (
                            <View key={c.id}>
                              {idx > 0 && <View style={styles.dtActivityDivider} />}
                              <View style={styles.dtActivityRow}>
                                <View style={[styles.dtActivityDot, { backgroundColor: isW ? C.neutral : (g.isPaused ? C.neutral : withAlpha(g.color, 0.5)) }]} />
                                <View style={styles.dtActivityContent}>
                                  <Text style={styles.dtActivityNote}>{c.note || (isW ? 'withdrawal' : 'contribution')}</Text>
                                  <Text style={styles.dtActivityDate}>{isValid(d) ? format(d, 'MMM d') : '—'}</Text>
                                </View>
                                <Text style={[styles.dtActivityAmt, !isW && { color: g.isPaused ? C.neutral : g.color }]}>
                                  {isW ? '−' : '+'}{currency} {Math.abs(c.amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                        {(g.contributions?.length || 0) > 3 && (
                          <>
                            <View style={styles.dtActivityDivider} />
                            <TouchableOpacity
                              style={styles.dtSeeAllRow}
                              onPress={() => { closeGoalDetail(); setTimeout(() => openHistory(g), 280); }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.dtSeeAllText}>{t.goals.seeAll ?? 'see all'}</Text>
                              <Feather name="chevron-right" size={14} color={C.accent} />
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </>
                  )}

                  {/* Footer actions */}
                  <View style={styles.detailFooter}>
                    <TouchableOpacity
                      style={styles.detailFooterPill}
                      onPress={() => { closeGoalDetail(); setTimeout(() => openEditGoal(g), 280); }}
                      activeOpacity={0.7}
                    >
                      <Feather name="edit-2" size={13} color={C.textSecondary} />
                      <Text style={styles.detailFooterPillText}>{t.goals.edit}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.detailFooterPill}
                      onPress={() => { handleTogglePause(g); closeGoalDetail(); }}
                      activeOpacity={0.7}
                    >
                      <Feather name={g.isPaused ? 'play' : 'pause'} size={13} color={C.textSecondary} />
                      <Text style={styles.detailFooterPillText}>{g.isPaused ? t.goals.resume : t.goals.pause}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.detailFooterPill}
                      onPress={() => { closeGoalDetail(); setTimeout(() => handleDeleteGoal(g), 280); }}
                      activeOpacity={0.7}
                    >
                      <Feather name="trash-2" size={13} color={C.neutral} />
                      <Text style={[styles.detailFooterPillText, { color: C.neutral }]}>{t.goals.delete}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>

                <View style={styles.detailSaveZone}>
                  <Pressable style={styles.detailCloseLink} onPress={closeGoalDetail} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}>
                    {({ pressed }: { pressed: boolean }) => (
                      <View style={[styles.detailCloseLinkInner, pressed && { opacity: 0.55 }]}>
                        <Feather name="x" size={12} color={C.textMuted} />
                        <Text style={styles.detailCloseLinkText}>{t.goals.close}</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </Reanimated.View>
            </View>
          </Modal>
        );
      })()}

      {/* Echo inline chat for goal coaching — stays mounted to preserve conversation */}
      {echoGoal && (
        <EchoInlineChat
          visible={echoSheetVisible}
          onClose={() => {
            setEchoSheetVisible(false);
            const saved = echoGoal;
            if (saved) {
              const fresh = goals.find(gl => gl.id === saved.id);
              if (fresh) {
                setTimeout(() => {
                  detailClosingRef.current = false;
                  detailSheetY.value = SCREEN_H;
                  setDetailGoal(fresh);
                }, 350);
              }
            }
          }}
          insightTitle={echoInsightForChat.title}
          insightSubtitle={echoInsightForChat.subtitle}
          chips={echoInsightForChat.chips}
          contextSnapshot={buildGoalSnapshot(echoGoal, currency)}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
};

// ── STYLES ────────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.xl },

  // ── Hero ──
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  heroAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  heroSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.md,
  },
  heroProgressTrack: {
    height: 4,
    backgroundColor: withAlpha(C.textMuted, 0.1),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  heroProgressFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
  },
  heroMonthly: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  heroStats: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },

  // ── Filter Chips ──
  filterRow: {
    marginBottom: SPACING.lg,
  },
  filterRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingRight: SPACING.xl,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.08),
  },
  filterChipActive: {
    backgroundColor: C.deepOlive,
  },
  filterChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  filterChipTextActive: {
    color: C.onAccent,
  },
  sortPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.08),
    marginLeft: SPACING.sm,
  },
  sortPillActive: {
    backgroundColor: C.deepOlive,
  },
  sortPillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: C.textMuted,
  },
  sortPillTextActive: {
    color: C.onAccent,
  },
  sortMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  sortMenuCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    width: 240,
    maxWidth: '80%' as any,
    borderWidth: 1,
    borderColor: C.border,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.lg),
  },
  sortMenuTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: C.textSecondary,
    textTransform: 'lowercase' as const,
    letterSpacing: 0.3,
    marginBottom: SPACING.md,
  },
  sortMenuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(C.textPrimary, 0.06),
  },
  sortMenuItemText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium as any,
  },

  // ── Section Label ──
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },

  // ── Group Card ──
  groupCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.xs),
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: 44 + SPACING.md * 2,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  goalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalContent: {
    flex: 1,
    gap: 3,
  },
  goalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  goalName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    flexShrink: 1,
  },
  goalPct: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  goalAmountText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
  },
  goalAmountTarget: {
    color: C.textMuted,
  },
  pausedBadge: {
    backgroundColor: withAlpha(C.bronze, 0.12),
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 1,
  },
  pausedBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  // ── Progress ──
  goalProgressTrack: {
    height: 3,
    backgroundColor: withAlpha(C.textMuted, 0.1),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  goalProgressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },

  // ── Goal Grid ──
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  goalCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.xs),
  },
  goalCardName: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  goalCardAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  goalCardTarget: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
    marginTop: 2,
  },

  // ── Milestones ──
  milestoneDots: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm },
  milestoneDotContainer: { alignItems: 'center', gap: 3 },
  milestoneDot: { width: 8, height: 8, borderRadius: RADIUS.full },
  milestoneDotLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.neutral, fontWeight: TYPOGRAPHY.weight.medium, fontVariant: ['tabular-nums'] },

  // ── Quick Contribute ──
  quickRow: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.sm, flexWrap: 'wrap' },
  quickBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
  },
  quickBtnText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, fontVariant: ['tabular-nums'] },

  // ── No Results ──
  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['5xl'],
    gap: SPACING.sm,
  },
  noResultsTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginTop: SPACING.sm,
  },
  noResultsText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
  },

  // ── Archived ──
  archivedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    opacity: 0.6,
  },
  archivedName: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary },
  archivedAmount: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontVariant: ['tabular-nums'], marginTop: 2 },
  restoreBtn: {
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
  },

  // ── Modal Fields ──
  fieldInput: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  amountPrefix: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  fieldTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.sm + 2,
  },
  fieldTouchableText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  clearDeadlineBtn: { alignItems: 'center', paddingVertical: SPACING.sm, marginTop: SPACING.xs },
  clearDeadlineText: { fontSize: TYPOGRAPHY.size.sm, color: C.neutral, fontWeight: TYPOGRAPHY.weight.medium },

  // ── Templates ──
  templateChip: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.border, marginRight: SPACING.xs },
  templateChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: C.textSecondary },

  // ── Pickers ──
  iconPickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  iconPickerItem: { width: 48, height: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background, borderWidth: 1.5, borderColor: C.border },
  colorPickerRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  colorPickerItem: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  colorPickerItemSelected: { borderWidth: 3, borderColor: C.surface, ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm) },

  // ── Preview ──
  goalPreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.background, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg, gap: SPACING.sm },
  goalPreviewIcon: { width: 36, height: 36, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  goalPreviewName: { flex: 1, fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
  goalPreviewTarget: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.accent, fontVariant: ['tabular-nums'] },

  // ── Goal Form (CommitmentForm pattern) ──
  gfSheet: {
    backgroundColor: C.background,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.06),
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
    borderTopLeftRadius: RADIUS['2xl'] + 2,
    borderTopRightRadius: RADIUS['2xl'] + 2,
  },
  gfHandleRow: {
    alignItems: 'center',
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.xs,
  },
  gfHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.12),
  },
  gfTitleZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
    gap: 4,
  },
  gfIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: SPACING.xs,
  },
  gfTitleText: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  gfSubtitleText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  gfHeroArea: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  gfHeroRingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.md,
    flex: 1,
  },
  gfHeroAmountCol: {
    flex: 1,
  },
  gfHeroAmountRow: { flexDirection: 'row' as const, alignItems: 'baseline' as const },
  gfHeroCurrency: {
    fontSize: 20,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: withAlpha(C.textMuted, 0.5),
    marginRight: 3,
  },
  gfHeroInput: {
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    flex: 1,
    paddingVertical: 0,
  },
  gfHeroHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  gfColorStrip: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: SPACING.sm + 2,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  gfColorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  gfColorDotSelected: {
    borderWidth: 2.5,
    borderColor: C.surface,
    ...(C === CALM_DARK ? {} : SHADOWS.sm),
  },
  gfSectionLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: withAlpha(C.textMuted, 0.7),
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: SPACING.md + 2,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.xs + 2,
  },
  gfCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.07),
    overflow: 'hidden',
    marginBottom: SPACING.sm + 2,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  gfCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    gap: SPACING.sm + 2,
  },
  gfCardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    marginLeft: SPACING.md,
  },
  gfIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gfNameIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    flexShrink: 0,
    overflow: 'hidden',
  },
  gfNameIconFallback: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gfFieldFlex: { flex: 1 },
  gfFieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    marginBottom: 2,
  },
  gfFieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    letterSpacing: -0.1,
  },
  gfFieldValue: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: -0.1,
  },
  gfTemplateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  gfTemplateChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  gfIconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  gfIconGridItem: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.textPrimary, 0.04),
  },
  gfColorRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  gfColorItem: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gfColorItemSelected: {
    borderWidth: 3,
    borderColor: C.surface,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  gfClearBtn: { alignItems: 'center', paddingVertical: SPACING.sm, marginTop: SPACING.xs },
  gfClearBtnText: { fontSize: TYPOGRAPHY.size.sm, color: C.neutral, fontWeight: TYPOGRAPHY.weight.medium },
  gfDeleteLink: { marginTop: SPACING.lg, alignSelf: 'center' },
  gfDeleteLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  gfDeleteLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  gfSaveZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.background,
  },
  gfSaveBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  gfSaveBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gfSaveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.3,
  },
  gfSecondaryLink: { marginTop: SPACING.sm, alignSelf: 'center' },
  gfSecondaryLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  gfSecondaryLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },

  // ── Contribute quick chips ──
  cfQuickChip: {
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  cfQuickChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'] as any,
  },

  // ── Done FAB (multiline note dismiss) ──
  doneFab: {
    position: 'absolute',
    right: SPACING.md,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
  },

  // ── Delete ──
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.lg, paddingVertical: SPACING.sm },
  deleteBtnText: { fontSize: TYPOGRAPHY.size.sm, color: C.neutral },

  // ── Contribute Preview ──
  contributePreview: { backgroundColor: C.background, borderRadius: RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg, alignItems: 'center' },
  contributePreviewLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginBottom: 4 },
  contributePreviewValue: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, fontVariant: ['tabular-nums'] },
  contributePreviewRemaining: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  contributePreviewCelebrate: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.positive, marginTop: SPACING.xs },

  // ── History ──
  historyStatsRow: { flexDirection: 'row', backgroundColor: C.background, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg },
  historyStatItem: { flex: 1, alignItems: 'center', gap: 2 },
  historyStatLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.medium },
  historyStatValue: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, fontVariant: ['tabular-nums'] },
  statDivider: { width: 1, backgroundColor: C.border },
  historyGroupLabel: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary, marginTop: SPACING.md, marginBottom: SPACING.sm },
  historyItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  historyItemLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flexWrap: 'wrap' },
  historyItemDate: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, minWidth: 50 },
  historyItemAmount: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, fontVariant: ['tabular-nums'] },
  historyItemNote: { fontSize: TYPOGRAPHY.size.xs, color: C.neutral, maxWidth: 120 },

  // ── Swipe Actions ──
  swipeAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeEdit: {
    backgroundColor: C.accent,
  },
  swipeDelete: {
    backgroundColor: C.neutral,
  },

  // ── Horizontal Scroll Fade ──
  hScrollFadeWrap: {
    position: 'relative',
    marginRight: -SPACING.xl,
    marginBottom: SPACING.xs,
  },
  hScrollFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 40,
  },

  // ── Goal Detail Sheet (bottom sheet — mirrors DebtTracking) ──
  detailBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  detailSheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    maxHeight: '92%',
  },
  detailTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    position: 'relative',
  },
  detailHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.15),
  },
  detailCloseX: {
    position: 'absolute',
    right: SPACING.md,
    top: 4,
    padding: 6,
  },
  detailTitleZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  detailIconWrap: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  detailTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
    textAlign: 'center',
  },
  detailSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: SPACING.xs + 2,
    letterSpacing: 0.1,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  detailScrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.md,
  },
  detailFieldCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.sm + 2,
  },
  detailFieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  detailFieldValue: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'] as any,
  },
  detailFieldDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  detailFieldHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: SPACING.xs,
  },
  detailAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: SPACING.sm,
  },
  detailAmountCurrent: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  detailAmountTarget: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  detailPct: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
    marginLeft: 'auto',
  },
  detailProgressTrack: {
    height: 6,
    backgroundColor: withAlpha(C.textMuted, 0.1),
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  detailProgressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
  },
  detailInfoLine: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center' as const,
    fontVariant: ['tabular-nums'] as any,
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },

  // ── Detail Summary Card ──
  dtSummaryCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.1 : 0.06),
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.xs),
  },
  dtSummaryRow: {
    flexDirection: 'row' as const,
  },
  dtSummaryStat: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: SPACING.xs,
  },
  dtSummaryStatBorder: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: withAlpha(C.textPrimary, 0.1),
  },
  dtSummaryValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  dtSummaryLabel: {
    fontSize: 10,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 2,
    letterSpacing: 0.3,
  },

  // ── Detail Section Label ──
  dtSectionLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: withAlpha(C.textMuted, 0.7),
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },

  // ── Detail Activity Card ──
  dtActivityCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.1 : 0.06),
    overflow: 'hidden' as const,
    marginBottom: SPACING.md,
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.xs),
  },
  dtActivityRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  dtActivityDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    marginLeft: SPACING.md + 8 + SPACING.sm,
  },
  dtActivityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dtActivityContent: {
    flex: 1,
    gap: 1,
  },
  dtActivityNote: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  dtActivityDate: {
    fontSize: 11,
    color: C.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  dtActivityAmt: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  dtSeeAllRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    paddingVertical: SPACING.sm + 2,
  },
  dtSeeAllText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Echo tip
  echoTipCard: {
    marginHorizontal: SPACING.xs,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.xl,
    backgroundColor: withAlpha(C.accent, 0.06),
  },
  echoTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  echoTipTag: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  echoTipTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    lineHeight: 19,
  },
  echoTipSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  echoTipAsk: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: withAlpha(C.accent, 0.6),
  },
  detailSaveZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.background,
  },
  detailSaveBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  detailSaveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailSaveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.3,
  },
  detailCloseLink: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
  },
  detailCloseLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  detailCloseLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },

  // ── Detail Ring Hero ──
  detailRingZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.md,
  },
  detailRingAmt: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: -0.5,
  },
  detailRingPctSmall: {
    fontSize: 11,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'] as any,
    marginTop: 4,
  },
  detailRingBadgeWrap: {
    position: 'absolute',
    top: -6,
    left: 0,
    right: 0,
    alignItems: 'center',
  } as any,
  detailRingBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2.5,
    borderColor: C.background,
  },

  // ── Detail Segments ──
  detailSegments: {
    flexDirection: 'row' as const,
    gap: 3,
    marginBottom: SPACING.sm,
  },
  detailSegment: {
    flex: 1,
    height: 4,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    borderRadius: 2,
    overflow: 'hidden' as const,
  },
  detailSegmentFill: {
    height: '100%' as any,
    borderRadius: 2,
  },
  detailSegmentLabels: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.xs,
  },
  detailSegmentLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.neutral,
    fontVariant: ['tabular-nums'] as any,
  },

  // ── Detail CTA ──
  detailCtaZone: {
    marginBottom: SPACING.xl,
    alignItems: 'center' as const,
  },
  detailCtaMain: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: SPACING.sm,
    width: '100%' as any,
    paddingVertical: 14,
    borderRadius: RADIUS.full,
    minHeight: 50,
  },
  detailCtaMainText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  detailCtaLink: {
    paddingVertical: SPACING.md,
  },
  detailCtaLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },

  // ── Detail Activity ──
  detailActivity: {
    marginBottom: SPACING.lg,
  },
  detailActivityLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    marginBottom: SPACING.md,
  },
  detailActivityRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
  },
  detailActivityDate: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'] as any,
    minWidth: 48,
  },
  detailActivityAmt: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  detailActivityNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    flex: 1,
  },
  detailSeeAll: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  detailSeeAllText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
  },


  // ── Detail Footer ──
  detailFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: SPACING.sm,
    paddingTop: SPACING.lg,
    marginTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
  },
  detailFooterPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.04),
  },
  detailFooterPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },

  // ── Icon Picker Overlay ──
  ipCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    width: '88%' as any,
    maxWidth: 380,
    maxHeight: '80%' as any,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.06),
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
  },
  ipHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: SPACING.md,
  },
  ipTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  ipSectionLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: withAlpha(C.textMuted, 0.7),
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
  },
  ipGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: SPACING.xs + 2,
    marginBottom: SPACING.sm,
  },
  ipGridItem: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: withAlpha(C.textPrimary, 0.04),
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  ipDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, 0.08),
    marginVertical: SPACING.sm,
  },
  ipGalleryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  ipGalleryText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  ipSaveBtn: {
    width: '100%' as any,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: SPACING.sm,
  },
  ipSaveBtnInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  ipSaveBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  ipRemoveBtn: {
    marginTop: SPACING.md,
    alignSelf: 'center' as const,
  },
  ipRemoveBtnInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  ipRemoveText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  gfIconBubbleImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  gfChangeIconPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  gfChangeIconText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.3,
  },
});

export default Goals;
