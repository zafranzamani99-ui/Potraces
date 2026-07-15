import React, { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  PanResponder,
  TouchableWithoutFeedback,
  Alert,
  Pressable,
  Image,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { findRecentDuplicate } from '../../utils/findDuplicateTransaction';
import { SUPPORTED_CURRENCIES, getRates, toMyr } from '../../services/fxRates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlaybookStore } from '../../store/playbookStore';
import { CALM, CALM_DARK, SHADOWS, withAlpha, RADIUS, SPACING, TYPOGRAPHY, DEBT_TYPES_SAFE, semantic } from '../../constants';
import WalletLogo from './WalletLogo';
import CategoryIcon from './CategoryIcon';
import ModalToastHost from './ModalToastHost';
import { NeuSurface, useNeu } from './neu';
import NeuButton from './NeuButton';
import NeuIconButton from './NeuIconButton';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useSubmitGuard } from '../../hooks/useSubmitGuard';
import { lightTap, successNotification } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';
import { useLearningStore } from '../../store/learningStore';
import { nowMYT } from '../../utils/datetime';
import { useT } from '../../i18n';
import { HITSLOP_10 } from '../../utils/hitSlop';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FAB_SIZE = 56;
const FAB_STORAGE_KEY = '@potraces/fab-position';
const FAB_HINT_KEY = '@potraces/fab-hint-shown';
const SNAP_MARGIN = 16;
// Height of the floating LiquidGlassNavBar ABOVE the safe-area inset (capsule
// ~73 + breathing room). Reserved in the FAB's bottom clamp so it can never
// be dragged/snapped behind the bottom navigation.
const TAB_BAR_HEIGHT = 88;
const CARD_WIDTH = SCREEN_WIDTH - 48;
const CARD_PADDING = 20;
const CONTENT_WIDTH = CARD_WIDTH - CARD_PADDING * 2;

type Step = 'amount' | 'category' | 'wallet';
type Direction = 'expense' | 'income';

interface QuickAddExpenseProps {
  /**
   * Initial direction the sheet opens in.
   * Defaults to 'expense' for backward compat. Pass 'income' from
   * income-earner entry points (e.g. GettingStarted "log money in")
   * so the toggle isn't biased toward spending. Per FIRSTRUN-H7.
   */
  defaultDirection?: Direction;
  /**
   * Render the draggable Quick-Add FAB. Default true (Dashboard host).
   * Screens that only need the modal (e.g. Calculator's "Log as expense")
   * pass false so no second FAB appears.
   */
  showFab?: boolean;
  /**
   * Register this instance as the global `openQuickAdd()` target via the
   * module-level ref. Default true. A second, locally-controlled instance
   * (opened through the imperative ref) MUST pass false — otherwise its
   * unmount cleanup nulls the ref while the Dashboard host is still mounted,
   * silently breaking deep-link / Back Tap / GettingStarted openers.
   */
  registerGlobalOpener?: boolean;
  /**
   * Fired when the sheet closes. `saved` is true if a transaction was logged,
   * false if it was dismissed/cancelled. Lets a host (e.g. Calculator) distinguish
   * "done" from "backed out". Only meaningful for locally-controlled instances.
   */
  onDismiss?: (saved: boolean) => void;
}

export interface QuickAddExpenseHandle {
  /** Imperatively open the sheet (used by locally-hosted instances). */
  open: (direction?: Direction, initialAmount?: string) => void;
}

// Module-level ref for deep link trigger.
// Accepts an optional direction override so external callers (GettingStarted,
// future deep links) can request the sheet pre-flipped to income.
let _quickAddOpenRef: ((dir?: Direction, amount?: string) => void) | null = null;
// When the sheet isn't mounted yet (deep link / Back Tap from cold start, from
// business mode, or from a non-Dashboard tab), remember the request and honour
// it the moment the sheet mounts. Prevents the deep link from silently no-op-ing.
let _pendingQuickAdd: { dir: Direction; amount?: string } | null = null;
export function openQuickAdd(direction?: Direction, initialAmount?: string) {
  if (_quickAddOpenRef) {
    _quickAddOpenRef(direction, initialAmount);
  } else {
    _pendingQuickAdd = { dir: direction ?? 'expense', amount: initialAmount };
  }
}

// ─── Numpad Key ──────────────────────────────────────────────
const NumpadKey = React.memo(
  ({ label, onPress, mutedColor, keyStyle, keyTextStyle }: {
    label: string;
    onPress: (k: string) => void;
    mutedColor: string;
    keyStyle: any;
    keyTextStyle: any;
  }) => (
    <NeuIconButton
      size={50}
      radius={25}
      style={keyStyle}
      onPress={() => onPress(label)}
      accessibilityLabel={label === '⌫' ? 'backspace' : label}
    >
      {label === '⌫' ? (
        <Ionicons name="backspace-outline" size={20} color={mutedColor} />
      ) : (
        <Text style={keyTextStyle}>{label}</Text>
      )}
    </NeuIconButton>
  ),
);

// ─── Main Component ──────────────────────────────────────────
const QuickAddExpense = forwardRef<QuickAddExpenseHandle, QuickAddExpenseProps>(function QuickAddExpense({
  defaultDirection = 'expense',
  showFab = true,
  registerGlobalOpener = true,
  onDismiss,
}, ref) {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neuF = useNeu(undefined, { faintDark: true });
  // Direction colors mirror the debt screens: "went out" = i-owe terracotta,
  // "came in" = they-owe olive (WCAG-safe per-theme via semantic()).
  const iOweColor = semantic(DEBT_TYPES_SAFE[0].color, isDark);
  const theyOweColor = semantic(DEBT_TYPES_SAFE[1].color, isDark);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);

  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const updateTransaction = usePersonalStore((s) => s.updateTransaction);
  const deleteTransaction = usePersonalStore((s) => s.deleteTransaction);
  const quickAddConfirm = useSettingsStore((s) => s.quickAddConfirm);
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const addToWallet = useWalletStore((s) => s.addToWallet);
  const addWallet = useWalletStore((s) => s.addWallet);
  const getExpenseCategories = useCategoryStore((s) => s.getExpenseCategories);
  const getIncomeCategories = useCategoryStore((s) => s.getIncomeCategories);

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');
  // Currency picker — defaults to user's settings currency (usually MYR).
  const [selectedCurrency, setSelectedCurrency] = useState<string>(currency || 'MYR');
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [fxRates, setFxRates] = useState<Record<string, number> | null>(null);
  const [fxFetchedAt, setFxFetchedAt] = useState<number | null>(null);
  const [pbPrompt, setPbPrompt] = useState<{ txId: string; amount: number; name: string } | null>(null);
  const [pendingWalletId, setPendingWalletId] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const pbPromptScale = useRef(new Animated.Value(0.92)).current;
  const pbPromptOpacity = useRef(new Animated.Value(0)).current;
  const confirmCardScale = useRef(new Animated.Value(0.85)).current;
  const confirmCardOpacity = useRef(new Animated.Value(0)).current;
  const bgCardScale = useRef(new Animated.Value(1)).current;
  const bgCardOpacity = useRef(new Animated.Value(1)).current;
  // Track save-vs-dismiss so onDismiss can tell the host which happened.
  const didSaveRef = useRef(false);
  const prevVisibleRef = useRef(false);

  // ── FX: fetch rates when a non-MYR currency is chosen ─────
  useEffect(() => {
    if (selectedCurrency === 'MYR' || fxRates) return;
    let cancelled = false;
    getRates().then((r) => { if (!cancelled) { setFxRates(r.rates); setFxFetchedAt(r.fetchedAt); } }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedCurrency, fxRates]);

  const myrEquivalent = useMemo(() => {
    const parsed = parseFloat(amount);
    if (!parsed || selectedCurrency === 'MYR' || !fxRates) return null;
    return toMyr(parsed, selectedCurrency, fxRates);
  }, [amount, selectedCurrency, fxRates]);

  const fxIsStale = useMemo(() => {
    if (!fxFetchedAt) return true;
    return Date.now() - fxFetchedAt > 24 * 60 * 60 * 1000;
  }, [fxFetchedAt]);

  // ── Draggable FAB ──────────────────────────────────────────
  const fabPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const [showHint, setShowHint] = useState(false);

  // Snap to nearest horizontal edge
  const snapToEdge = useCallback((x: number, y: number) => {
    const minY = insets.top + SNAP_MARGIN;
    const maxY = SCREEN_HEIGHT - FAB_SIZE - insets.bottom - TAB_BAR_HEIGHT - SNAP_MARGIN;
    const clampedY = Math.max(minY, Math.min(y, maxY));
    const snapX = x < SCREEN_WIDTH / 2 ? SNAP_MARGIN : SCREEN_WIDTH - FAB_SIZE - SNAP_MARGIN;
    const finalPos = { x: snapX, y: clampedY };

    Animated.spring(fabPos, {
      toValue: finalPos,
      useNativeDriver: false,
      speed: 16,
      bounciness: 4,
    }).start();

    lastPos.current = finalPos;
    AsyncStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(finalPos)).catch(() => {});
  }, [fabPos, insets]);

  // Load saved position on mount
  useEffect(() => {
    if (!showFab) return; // no FAB → skip its position bookkeeping
    // Position above tab bar — account for header (~56), tab bar (~90), safe area
    const defaultPos = { x: SCREEN_WIDTH - FAB_SIZE - SNAP_MARGIN, y: SCREEN_HEIGHT - FAB_SIZE - 200 - insets.bottom };

    AsyncStorage.getItem(FAB_STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const pos = JSON.parse(stored);
          const minY = insets.top + SNAP_MARGIN;
          const maxY = SCREEN_HEIGHT - FAB_SIZE - insets.bottom - TAB_BAR_HEIGHT - SNAP_MARGIN;
          const clampedY = Math.max(minY, Math.min(pos.y, maxY));
          const snapX = pos.x < SCREEN_WIDTH / 2 ? SNAP_MARGIN : SCREEN_WIDTH - FAB_SIZE - SNAP_MARGIN;
          const validPos = { x: snapX, y: clampedY };
          fabPos.setValue(validPos);
          lastPos.current = validPos;
        } else {
          fabPos.setValue(defaultPos);
          lastPos.current = defaultPos;
        }
      })
      .catch(() => {
        fabPos.setValue(defaultPos);
        lastPos.current = defaultPos;
      });
  }, [insets, showFab]);

  // Show drag hint for the first 3 visits
  useEffect(() => {
    if (!showFab) return; // no FAB → no drag hint
    AsyncStorage.getItem(FAB_HINT_KEY).then((val) => {
      const count = val ? parseInt(val, 10) : 0;
      if (count >= 3) return;

      setShowHint(true);
      const timer = setTimeout(() => {
        Animated.timing(hintOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start(() => {
          setTimeout(() => {
            Animated.timing(hintOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
              setShowHint(false);
            });
          }, 2800);
        });
        AsyncStorage.setItem(FAB_HINT_KEY, String(count + 1)).catch(() => {});
      }, 1200);
      return () => clearTimeout(timer);
    }).catch(() => {});
  }, [showFab]);

  // ── Open ──────────────────────────────────────────────────
  // Accepts an optional direction override (used by external openers like
  // GettingStarted "log money in") so the sheet doesn't always default to
  // expense. Falls back to the prop, then 'expense'.
  const handleOpen = useCallback((dirOverride?: Direction, amountOverride?: string) => {
    lightTap();
    setAmount(amountOverride || '');
    setCategoryId('');
    setTxType(dirOverride || defaultDirection);
    setStep('amount');
    setConfirmVisible(false);
    bgCardScale.setValue(1);
    bgCardOpacity.setValue(1);
    slideAnim.setValue(0);
    cardScale.setValue(0.92);
    cardOpacity.setValue(0);
    setVisible(true);
    Animated.parallel([
      Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 3 }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, cardScale, cardOpacity, bgCardScale, defaultDirection]);

  useEffect(() => {
    // Locally-controlled instances (Calculator) opt out so they never touch the
    // module-level ref that the Dashboard host owns.
    if (!registerGlobalOpener) return;
    _quickAddOpenRef = handleOpen;
    let pendingTimer: ReturnType<typeof setTimeout> | undefined;
    if (_pendingQuickAdd) {
      const { dir, amount } = _pendingQuickAdd;
      _pendingQuickAdd = null;
      // Defer so the screen finishes mounting before the sheet animates in.
      pendingTimer = setTimeout(() => handleOpen(dir, amount), 250);
    }
    return () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      if (_quickAddOpenRef === handleOpen) _quickAddOpenRef = null;
    };
  }, [handleOpen, registerGlobalOpener]);

  // Imperative opener for locally-hosted instances (e.g. Calculator), so the
  // modal is owned by the CURRENT screen's view controller and iOS can present it.
  useImperativeHandle(ref, () => ({ open: handleOpen }), [handleOpen]);

  // Notify the host when the sheet closes, distinguishing a save from a dismissal.
  useEffect(() => {
    if (prevVisibleRef.current && !visible) {
      const saved = didSaveRef.current;
      didSaveRef.current = false;
      onDismiss?.(saved);
    }
    prevVisibleRef.current = visible;
  }, [visible, onDismiss]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Only the FAB itself (touch starting on it) should drag; do NOT claim a scroll that merely
        // moves over the FAB — that's what made the page intermittently hard to scroll near the button.
        onMoveShouldSetPanResponder: () => false,
        onPanResponderGrant: () => {
          isDragging.current = false;
          fabPos.setOffset(lastPos.current);
          fabPos.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5) {
            isDragging.current = true;
          }
          fabPos.setValue({ x: g.dx, y: g.dy });
        },
        onPanResponderRelease: (_, g) => {
          fabPos.flattenOffset();
          if (!isDragging.current) {
            // Tap — restore position & open
            fabPos.setValue(lastPos.current);
            handleOpen();
          } else {
            const currentX = lastPos.current.x + g.dx;
            const currentY = lastPos.current.y + g.dy;
            snapToEdge(currentX, currentY);
          }
          isDragging.current = false;
        },
      }),
    [fabPos, snapToEdge, handleOpen],
  );

  const categories = useMemo(
    () => txType === 'expense' ? getExpenseCategories('personal') : getIncomeCategories('personal'),
    [txType, getExpenseCategories, getIncomeCategories],
  );
  const hasMultipleWallets = wallets.length > 1;
  const totalSteps = hasMultipleWallets ? 3 : 2;

  const stepIndex = useCallback(
    (s: Step) => (s === 'amount' ? 0 : s === 'category' ? 1 : 2),
    [],
  );

  // ── Navigation ─────────────────────────────────────────────
  const animateTo = useCallback(
    (target: Step) => {
      const idx = stepIndex(target);
      Animated.timing(slideAnim, {
        toValue: -idx * CARD_WIDTH,
        duration: 260,
        useNativeDriver: false,
      }).start(() => setStep(target));
    },
    [slideAnim, stepIndex],
  );

  const goBack = useCallback(() => {
    lightTap();
    if (step === 'category') animateTo('amount');
    else if (step === 'wallet') animateTo('category');
  }, [step, animateTo]);

  // ── Numpad ──────────────────────────────────────────────────
  const handleNumpad = useCallback((key: string) => {
    setAmount((prev) => {
      if (key === '⌫') return prev.slice(0, -1);
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev.length === 0 ? '0.' : prev + '.';
      }
      if (prev === '0' && key !== '.') return key;
      const dotIdx = prev.indexOf('.');
      if (dotIdx >= 0 && prev.length - dotIdx > 2) return prev;
      if (dotIdx < 0 && prev.replace('.', '').length >= 7) return prev;
      return prev + key;
    });
  }, []);

  const handleAmountNext = useCallback(() => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;
    animateTo('category');
  }, [amount, animateTo]);

  // ── Save ────────────────────────────────────────────────────
  // Canonical save contract for the personal-mode quick-add surface.
  // Per UX-C1: this is the single source of truth for "log money in or out".
  // Downstream surfaces (TransactionsList, ReceiptScanner, NoteEditor,
  // MoneyChat) should mimic this contract — same duplicate guard, same
  // wallet defaulting, same wallet auto-create fallback.
  const saveTransaction = useCallback(
    (catId: string, catName: string, walletId: string | null) => {
      const parsed = parseFloat(amount);
      if (!parsed || parsed <= 0) return;

      // Duplicate guard: same amount + wallet + type within last 10 min.
      const dup = findRecentDuplicate(
        usePersonalStore.getState().transactions,
        {
          amount: parsed,
          walletId: walletId || undefined,
          type: txType,
        },
      );
      if (dup) {
        const mins = Math.max(1, Math.round((Date.now() - new Date(dup.createdAt).getTime()) / 60000));
        Alert.alert(
          t.quickAdd.dupTitle,
          t.quickAdd.dupBody
            .replace('{name}', dup.description || dup.category)
            .replace('{amount}', parsed.toFixed(2))
            .replace('{mins}', String(mins)),
          [
            { text: t.quickAdd.dupSkip, style: 'cancel' },
            { text: t.quickAdd.dupKeepBoth, onPress: () => saveTransactionUnchecked(catId, catName, walletId) },
          ],
        );
        return;
      }
      saveTransactionUnchecked(catId, catName, walletId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [amount, txType, selectedCurrency, fxRates, t],
  );

  const saveTransactionUnchecked = useCallback(
    (catId: string, catName: string, walletId: string | null) => {
      const parsed = parseFloat(amount);
      if (!parsed || parsed <= 0) return;

      // If a non-MYR currency is selected, store the MYR-equivalent as the
      // canonical `amount`, and keep the original amount/currency/rate for
      // display. Wallet math stays in MYR so balances don't drift.
      let storedAmount = parsed;
      let originalFields: { originalAmount?: number; originalCurrency?: string; fxRate?: number } = {};
      if (selectedCurrency !== 'MYR' && fxRates) {
        const myr = toMyr(parsed, selectedCurrency, fxRates);
        if (myr != null && myr > 0) {
          storedAmount = Number(myr.toFixed(2));
          originalFields = {
            originalAmount: parsed,
            originalCurrency: selectedCurrency,
            fxRate: fxRates[selectedCurrency.toUpperCase()],
          };
        }
      }

      const txId = addTransaction({
        amount: storedAmount,
        category: catId,
        description: catName,
        date: nowMYT(),
        type: txType,
        mode: 'personal',
        walletId: walletId || undefined,
        inputMethod: 'manual',
        ...originalFields,
      });

      if (walletId) {
        if (txType === 'expense') {
          deductFromWallet(walletId, storedAmount);
        } else {
          addToWallet(walletId, storedAmount);
        }
      }

      // Learn category association
      if (catName) useLearningStore.getState().learnCategory(catName, catId);

      successNotification();
      didSaveRef.current = true;
      setVisible(false);
      const label = txType === 'expense' ? t.quickAdd.wentOut : t.quickAdd.cameIn;
      const capturedTxId = txId;
      const capturedHasMultiple = hasMultipleWallets;
      showToast(`${currency} ${parsed.toFixed(2)} ${label}`, 'success', {
        label: t.quickAdd.undo,
        onPress: () => {
          // Wallet rollback is owned by personalStore.deleteTransaction — the add
          // flow deducted on create, delete reverses it. Don't double-reverse here.
          deleteTransaction(capturedTxId);
          // Reopen at wallet step (or category if single wallet) with state intact
          const targetStep: Step = capturedHasMultiple ? 'wallet' : 'category';
          const targetIdx = capturedHasMultiple ? 2 : 1;
          slideAnim.setValue(-targetIdx * CARD_WIDTH);
          setStep(targetStep);
          cardScale.setValue(0.92);
          cardOpacity.setValue(0);
          setVisible(true);
          Animated.parallel([
            Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 3 }),
            Animated.timing(cardOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          ]).start();
        },
      });

      // Offer playbook creation for income
      if (txType === 'income' && usePlaybookStore.getState().canCreatePlaybook()) {
        setTimeout(() => {
          setPbPrompt({ txId, amount: parsed, name: catName });
          pbPromptScale.setValue(0.92);
          pbPromptOpacity.setValue(0);
          Animated.parallel([
            Animated.spring(pbPromptScale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 3 }),
            Animated.timing(pbPromptOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          ]).start();
        }, 300);
      }
    },
    [amount, txType, addTransaction, updateTransaction, deleteTransaction, deductFromWallet, addToWallet, currency, showToast, pbPromptScale, pbPromptOpacity, hasMultipleWallets, slideAnim, cardScale, cardOpacity, fxRates, selectedCurrency, t],
  );

  // ── Confirm overlay helpers ────────────────────────────────
  const showConfirmOverlay = useCallback(() => {
    confirmCardScale.setValue(0.88);
    confirmCardOpacity.setValue(0);
    setConfirmVisible(true);
    Animated.parallel([
      Animated.spring(confirmCardScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 5 }),
      Animated.timing(confirmCardOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(bgCardOpacity, { toValue: 0, duration: 160, useNativeDriver: false }),
    ]).start();
  }, [confirmCardScale, confirmCardOpacity, bgCardOpacity]);

  const hideConfirmOverlay = useCallback(() => {
    lightTap();
    Animated.parallel([
      Animated.timing(confirmCardOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(bgCardOpacity, { toValue: 1, duration: 180, useNativeDriver: false }),
    ]).start(() => setConfirmVisible(false));
  }, [confirmCardOpacity, bgCardOpacity]);

  // ── Category select ─────────────────────────────────────────
  // Per FIRSTRUN-H7: when the user has zero wallets, auto-create a default
  // "Cash" wallet rather than silently saving a wallet-less transaction.
  // This makes the surface honest about where money lives — the canonical
  // contract for downstream entry surfaces (UX-C1) is: every saved
  // transaction has a walletId.
  const ensureDefaultWalletId = useCallback((): string | null => {
    const existing = wallets.find((w) => w.isDefault) || wallets[0];
    if (existing) return existing.id;
    if (wallets.length === 0) {
      // Auto-create a Cash wallet on first transaction — now a real 'cash'
      // wallet type (no longer masquerading as e-wallet).
      addWallet({
        name: t.quickAdd.cashWalletName,
        type: 'cash',
        balance: 0,
        icon: 'dollar-sign',
        color: C.accent,
        isDefault: true,
      });
      // addWallet is void; pull the new id from the freshest store snapshot.
      const fresh = useWalletStore.getState().wallets;
      const created = fresh.find((w) => w.isDefault) || fresh[0];
      return created?.id || null;
    }
    return null;
  }, [wallets, addWallet, t, C.accent]);

  const handleCategorySelect = useCallback(
    (catId: string) => {
      setCategoryId(catId);
      if (!hasMultipleWallets) {
        const cat = categories.find((c) => c.id === catId);
        const walletId = ensureDefaultWalletId();
        if (quickAddConfirm) {
          setPendingWalletId(walletId);
          showConfirmOverlay();
        } else {
          saveTransaction(catId, cat?.name || catId, walletId);
        }
      } else {
        animateTo('wallet');
      }
    },
    [hasMultipleWallets, categories, animateTo, saveTransaction, quickAddConfirm, showConfirmOverlay, ensureDefaultWalletId],
  );
  const guardedCategorySelect = useSubmitGuard(handleCategorySelect);

  // ── Wallet select ───────────────────────────────────────────
  const handleWalletSelect = useCallback(
    (wId: string) => {
      lightTap();
      if (quickAddConfirm) {
        setPendingWalletId(wId);
        showConfirmOverlay();
      } else {
        const cat = categories.find((c) => c.id === categoryId);
        saveTransaction(categoryId, cat?.name || categoryId, wId);
      }
    },
    [categoryId, categories, saveTransaction, quickAddConfirm, showConfirmOverlay],
  );
  const guardedWalletSelect = useSubmitGuard(handleWalletSelect);

  const handleConfirmSave = useCallback(() => {
    lightTap();
    setConfirmVisible(false);
    bgCardScale.setValue(1);
    bgCardOpacity.setValue(1);
    const cat = categories.find((c) => c.id === categoryId);
    saveTransaction(categoryId, cat?.name || categoryId, pendingWalletId);
  }, [categoryId, categories, saveTransaction, pendingWalletId, bgCardScale, bgCardOpacity]);
  const guardedConfirmSave = useSubmitGuard(handleConfirmSave);

  const handleClose = useCallback(() => setVisible(false), []);

  const handlePbCreate = useCallback(() => {
    if (!pbPrompt) return;
    const pbId = usePlaybookStore.getState().createPlaybook({
      name: pbPrompt.name,
      sourceAmount: pbPrompt.amount,
      sourceTransactionId: pbPrompt.txId,
    });
    setPbPrompt(null);
    if (pbId) showToast('playbook created', 'success');
  }, [pbPrompt, showToast]);
  const guardedPbCreate = useSubmitGuard(handlePbCreate);

  const handlePbDismiss = useCallback(() => setPbPrompt(null), []);

  const parsedAmount = parseFloat(amount) || 0;
  const displayAmount = amount || '0';
  const currentStepIdx = stepIndex(step);

  return (
    <>
      {/* ── Draggable FAB ──────────────────────────────── */}
      {showFab && (
        <Animated.View
          style={[
            styles.fabWrap,
            { left: fabPos.x, top: fabPos.y },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Neumorphic face only — the PanResponder stays on the wrapper above,
              so the drag behaviour is untouched. Icon goes olive (neu face is
              background-toned, not solid accent). */}
          <NeuSurface
            style={styles.fab}
            accessibilityLabel={t.quickAdd.fabLabel}
            accessibilityHint={t.quickAdd.fabHint}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={30} color={C.accent} />
          </NeuSurface>
          {showHint && (
            <Animated.View style={[styles.hint, { opacity: hintOpacity }]} pointerEvents="none">
              <Text style={styles.hintText}>{t.quickAdd.fabDragHint}</Text>
            </Animated.View>
          )}
        </Animated.View>
      )}

      {/* ── Modal ───────────────────────────────────────── */}
      <Modal
        visible={visible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={handleClose}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <Animated.View style={{ opacity: bgCardOpacity }}>
          <Animated.View
            style={[styles.card, { transform: [{ scale: cardScale }, { scale: bgCardScale }], opacity: cardOpacity }]}
            onStartShouldSetResponder={() => true}
          >
            {/* ── Header row ──────────────────────────── */}
            <View style={styles.hdr}>
              {currentStepIdx > 0 ? (
                <TouchableOpacity onPress={goBack} style={styles.hdrBtn} hitSlop={HITSLOP_10} accessibilityRole="button" accessibilityLabel={t.a11y.back}>
                  <Ionicons name="chevron-back" size={22} color={C.textSecondary} />
                </TouchableOpacity>
              ) : (
                <View style={styles.hdrBtn} />
              )}
              <TouchableOpacity onPress={handleClose} style={styles.hdrBtn} hitSlop={HITSLOP_10} accessibilityRole="button" accessibilityLabel={t.a11y.close}>
                <Ionicons name="close" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* ── Step dots (minimal) ─────────────────── */}
            <View style={styles.dots}>
              {Array.from({ length: totalSteps }, (_, i) => (
                <View key={i} style={[styles.dot, i <= currentStepIdx && styles.dotFilled]} />
              ))}
            </View>

            {/* ── Sliding steps ───────────────────────── */}
            <View style={styles.clip}>
              <Animated.View style={[styles.rail, { marginLeft: slideAnim }]}>
                {/* ── STEP 1: Amount ──────────────────── */}
                <View style={[styles.step, { width: CARD_WIDTH }]}>
                  {/* Amount display */}
                  <View style={styles.amountWrap}>
                    <TouchableOpacity
                      onPress={() => { lightTap(); setCurrencyPickerOpen(true); }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t.quickAdd.changeCurrency}
                      accessibilityHint={t.quickAdd.amountHint}
                      hitSlop={HITSLOP_10}
                    >
                      <Text style={[styles.amountDisplay, !amount && { color: C.neutral }]}>
                        <Text style={styles.amountCurrency}>{selectedCurrency} </Text>
                        {displayAmount}
                      </Text>
                    </TouchableOpacity>
                    {myrEquivalent != null && (
                      <Text style={{ color: fxIsStale ? C.bronze : C.textMuted, fontSize: 12, marginTop: 2 }}>
                        {fxIsStale
                          ? t.common.fxApproximate.replace('{amount}', myrEquivalent.toFixed(2))
                          : `≈ RM ${myrEquivalent.toFixed(2)}`}
                      </Text>
                    )}
                  </View>

                  {/* Type toggle */}
                  <View style={styles.typeToggle} accessibilityRole="radiogroup">
                    <Pressable
                      style={({ pressed }) => [
                        styles.typePill,
                        txType === 'expense'
                          ? { backgroundColor: withAlpha(iOweColor, 0.16) }
                          : (pressed ? neuF.insetSoft : neuF.raised),
                      ]}
                      onPress={() => { lightTap(); setTxType('expense'); }}
                      hitSlop={HITSLOP_10}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: txType === 'expense' }}
                      accessibilityLabel={t.quickAdd.wentOut}
                    >
                      <Ionicons name="arrow-up" size={14} color={txType === 'expense' ? iOweColor : C.textMuted} />
                      <Text style={[styles.typePillText, txType === 'expense' && { color: iOweColor, fontWeight: '600' }]}>{t.quickAdd.wentOut}</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.typePill,
                        txType === 'income'
                          ? { backgroundColor: withAlpha(theyOweColor, 0.16) }
                          : (pressed ? neuF.insetSoft : neuF.raised),
                      ]}
                      onPress={() => { lightTap(); setTxType('income'); }}
                      hitSlop={HITSLOP_10}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: txType === 'income' }}
                      accessibilityLabel={t.quickAdd.cameIn}
                    >
                      <Ionicons name="arrow-down" size={14} color={txType === 'income' ? theyOweColor : C.textMuted} />
                      <Text style={[styles.typePillText, txType === 'income' && { color: theyOweColor, fontWeight: '600' }]}>{t.quickAdd.cameIn}</Text>
                    </Pressable>
                  </View>

                  {/* Numpad */}
                  <View style={styles.pad}>
                    {[['1','2','3'],['4','5','6'],['7','8','9'],['.','0','⌫']].map((row, ri) => (
                      <View key={ri} style={styles.padRow}>
                        {row.map((k) => <NumpadKey key={k} label={k} onPress={handleNumpad} mutedColor={C.textMuted} keyStyle={styles.numKey} keyTextStyle={styles.numKeyText} />)}
                      </View>
                    ))}
                  </View>

                  {/* Next */}
                  <NeuButton
                    label={t.quickAdd.next}
                    onPress={handleAmountNext}
                    disabled={parsedAmount <= 0}
                    accessibilityLabel={t.a11y.forward}
                    style={styles.nextBtn}
                  />
                </View>

                {/* ── STEP 2: Category ────────────────── */}
                <View style={[styles.step, { width: CARD_WIDTH }]}>
                  {/* Amount badge */}
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{currency} {parsedAmount.toFixed(2)}</Text>
                  </View>

                  <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={styles.catGrid} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {categories.map((cat) => (
                      <View key={cat.id} style={styles.catCell}>
                        <NeuIconButton
                          size={50}
                          radius={18}
                          onPress={() => guardedCategorySelect(cat.id)}
                          accessibilityLabel={cat.name}
                        >
                          <CategoryIcon icon={cat.icon || 'tag'} size={22} color={cat.color} />
                        </NeuIconButton>
                        <Text style={styles.catLabel} numberOfLines={2}>{cat.name}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>

                {/* ── STEP 3: Wallet ──────────────────── */}
                {hasMultipleWallets && (
                  <View style={[styles.step, { width: CARD_WIDTH }]}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {currency} {parsedAmount.toFixed(2)}
                        {'  ·  '}
                        <Text style={{ fontWeight: '400', color: C.textMuted }}>
                          {categories.find((c) => c.id === categoryId)?.name || ''}
                        </Text>
                      </Text>
                    </View>

                    <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {[...wallets].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)).map((w) => (
                        <Pressable
                          key={w.id}
                          style={({ pressed }) => [styles.walletRow, pressed ? neuF.insetSoft : neuF.raisedSoft]}
                          onPress={() => guardedWalletSelect(w.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`${w.name} · ${currency} ${w.balance.toFixed(2)}`}
                        >
                          <View style={[styles.walletIco, { backgroundColor: w.presetId ? C.background : withAlpha(w.color || C.accent, 0.08) }]}>
                            <WalletLogo wallet={w} size={44} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.walletName}>{w.name}</Text>
                            <Text style={styles.walletBal}>{currency} {w.balance.toFixed(2)}</Text>
                          </View>
                          {w.isDefault && (
                            <Ionicons name="star" size={15} color={w.color || C.accent} />
                          )}
                          <Ionicons name="chevron-forward" size={16} color={C.border} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

              </Animated.View>
            </View>
          </Animated.View>
          </Animated.View>

          {/* ── Receipt confirm overlay ──────────────────── */}
          {confirmVisible && (() => {
            const cat = categories.find((c) => c.id === categoryId);
            const pendingWallet = wallets.find((w) => w.id === pendingWalletId);
            return (
              <Animated.View
                style={[styles.receiptCard, { transform: [{ scale: confirmCardScale }], opacity: confirmCardOpacity }, neuF.raisedSoft]}
                onStartShouldSetResponder={() => true}
              >
                <Text style={styles.receiptAmount}>{currency} {parsedAmount.toFixed(2)}</Text>
                <Text style={styles.receiptType}>{txType === 'expense' ? t.quickAdd.wentOut : t.quickAdd.cameIn}</Text>

                <View style={styles.receiptDivider}>
                  {Array.from({ length: 22 }).map((_, i) => (
                    <View key={i} style={styles.receiptDash} />
                  ))}
                </View>

                {cat && (
                  <View style={styles.receiptRow}>
                    <View style={[styles.receiptIcon, { backgroundColor: withAlpha(cat.color, 0.1) }]}>
                      <CategoryIcon icon={cat.icon || 'tag'} size={20} color={cat.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.receiptRowLabel}>{t.quickAdd.categoryLabel}</Text>
                      <Text style={styles.receiptRowValue}>{cat.name}</Text>
                    </View>
                  </View>
                )}

                {pendingWallet && (
                  <View style={styles.receiptRow}>
                    <View style={[styles.walletIco, { backgroundColor: pendingWallet.presetId ? C.background : withAlpha(pendingWallet.color || C.accent, 0.08) }]}>
                      <WalletLogo wallet={pendingWallet} size={40} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.receiptRowLabel}>{t.quickAdd.walletLabel}</Text>
                      <Text style={styles.receiptRowValue}>{pendingWallet.name}</Text>
                      <Text style={styles.walletBal}>{currency} {pendingWallet.balance.toFixed(2)}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.receiptActions}>
                  <TouchableOpacity
                    style={styles.receiptSave}
                    onPress={guardedConfirmSave}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t.common.save}
                  >
                    <Ionicons name="checkmark" size={16} color={C.onAccent} />
                    <Text style={styles.receiptSaveText}>{t.common.save}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.receiptChange}
                    onPress={hideConfirmOverlay}
                    activeOpacity={0.6}
                    hitSlop={HITSLOP_10}
                    accessibilityRole="button"
                    accessibilityLabel={t.quickAdd.change}
                  >
                    <Ionicons name="chevron-back" size={14} color={C.textMuted} />
                    <Text style={styles.receiptChangeText}>{t.quickAdd.change}</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            );
          })()}
        </View>
        <ModalToastHost />
      </Modal>

      {/* ── Currency picker ─────────────────────── */}
      {currencyPickerOpen && (
        <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={() => setCurrencyPickerOpen(false)}>
          <Pressable style={styles.overlay} onPress={() => setCurrencyPickerOpen(false)}>
            <Pressable
              style={{
                width: '85%',
                maxHeight: '70%',
                backgroundColor: C.background,
                borderRadius: RADIUS.xl,
                padding: SPACING.lg,
                ...neuF.raisedSoft,
              }}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={{ fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary, marginBottom: SPACING.md }}>
                {t.quickAdd.chooseCurrency}
              </Text>
              <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {SUPPORTED_CURRENCIES.map((cur) => (
                  <TouchableOpacity
                    key={cur}
                    onPress={() => { lightTap(); setSelectedCurrency(cur); setCurrencyPickerOpen(false); }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      minHeight: 44,
                      paddingVertical: SPACING.sm,
                      paddingHorizontal: SPACING.sm,
                      borderRadius: RADIUS.md,
                      backgroundColor: cur === selectedCurrency ? withAlpha(C.accent, 0.1) : 'transparent',
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={cur}
                    accessibilityState={{ selected: cur === selectedCurrency }}
                  >
                    <Text style={{ flex: 1, fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, fontWeight: cur === selectedCurrency ? TYPOGRAPHY.weight.semibold : TYPOGRAPHY.weight.regular }}>
                      {cur}
                    </Text>
                    {cur === selectedCurrency && <Ionicons name="checkmark" size={16} color={C.positive} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: SPACING.sm, textAlign: 'center' }}>
                {t.quickAdd.fxNote}
              </Text>
            </Pressable>
          </Pressable>
          <ModalToastHost />
        </Modal>
      )}

      {/* ── Playbook prompt ─────────────────────── */}
      {pbPrompt && (
        <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={handlePbDismiss}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback onPress={handlePbDismiss}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <Animated.View style={[styles.pbPromptCard, { transform: [{ scale: pbPromptScale }], opacity: pbPromptOpacity }, neuF.raisedSoft]} onStartShouldSetResponder={() => true}>
              <View style={styles.pbPromptIcon}>
                <Ionicons name="rocket-outline" size={28} color={C.accent} />
              </View>
              <Text style={styles.pbPromptTitle}>{t.quickAdd.pbTitle}</Text>
              <Text style={styles.pbPromptSub}>
                {t.quickAdd.pbSub.replace('{currency}', currency).replace('{amount}', pbPrompt.amount.toFixed(2))}
              </Text>
              <View style={styles.pbPromptActions}>
                <TouchableOpacity
                  style={[styles.pbPromptSkip, neuF.raised]}
                  onPress={handlePbDismiss}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t.quickAdd.notNow}
                >
                  <Text style={styles.pbPromptSkipText}>{t.quickAdd.notNow}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pbPromptCreate}
                  onPress={guardedPbCreate}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t.quickAdd.create}
                >
                  <Ionicons name="add" size={18} color={C.onAccent} />
                  <Text style={styles.pbPromptCreateText}>{t.quickAdd.create}</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
          <ModalToastHost />
        </Modal>
      )}
    </>
  );
});

QuickAddExpense.displayName = 'QuickAddExpense';

export default React.memo(QuickAddExpense);

// ─── Styles ──────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  /* ── FAB ─────────────────────────────────── */
  fabWrap: { position: 'absolute', zIndex: 999, ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg) },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    // backgroundColor comes from NeuSurface (screen-toned neu face)
    alignItems: 'center', justifyContent: 'center',
  },
  hint: {
    position: 'absolute',
    top: FAB_SIZE + 8,
    alignSelf: 'center',
    left: -26,
    backgroundColor: C.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(C.textPrimary, 0.08),
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm),
  },
  hintText: {
    fontSize: 11,
    fontWeight: '500',
    color: C.textSecondary,
    textAlign: 'center',
  },

  /* ── Overlay ─────────────────────────────── */
  overlay: {
    flex: 1,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },

  /* ── Card ─────────────────────────────────── */
  card: {
    width: CARD_WIDTH,
    maxHeight: SCREEN_HEIGHT * 0.88,
    backgroundColor: C.background,
    borderRadius: 28,
    overflow: 'hidden',
    // neu.raisedSoft (bg + soft drop) spread at the call site
  },

  /* ── Header ──────────────────────────────── */
  hdr: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 4,
  },
  hdrBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  /* ── Dots ─────────────────────────────────── */
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: C.border,
  },
  dotFilled: {
    backgroundColor: C.accent,
  },

  /* ── Steps container ─────────────────────── */
  clip: { overflow: 'hidden', width: CARD_WIDTH },
  rail: { flexDirection: 'row' },
  step: { paddingHorizontal: CARD_PADDING, paddingBottom: 24 },

  /* ── Amount ──────────────────────────────── */
  amountWrap: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 8,
  },
  amountDisplay: {
    fontSize: 42,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    color: C.textPrimary,
    letterSpacing: -1.5,
  },
  amountCurrency: {
    fontSize: 18,
    fontWeight: '400',
    color: C.textMuted,
  },

  /* ── Type toggle ────────────────────────── */
  typeToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 8,
    marginBottom: 16,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    // neu.raised (bg + shadow) spread at the call site
  },
  typePillText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.textMuted,
  },

  /* ── Numpad ──────────────────────────────── */
  pad: { alignSelf: 'center', width: 234, marginBottom: 18 },
  padRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  numKey: {
    width: 70, height: 50, borderRadius: 25,
    backgroundColor: C.background,
    alignItems: 'center', justifyContent: 'center',
  },
  numKeyText: {
    fontSize: 22, fontWeight: '400',
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // next button — pinned to the numpad width (234) so it lines up, not full-bleed
  nextBtn: { width: 234, alignSelf: 'center' },

  /* ── Summary badge ───────────────────────── */
  badge: {
    alignSelf: 'center',
    backgroundColor: withAlpha(C.accent, 0.07),
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 14, marginTop: 4,
  },
  badgeText: {
    fontSize: 14, fontWeight: '600',
    color: C.accent,
    fontVariant: ['tabular-nums'],
  },

  /* ── Category grid ───────────────────────── */
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 8 },
  catCell: {
    width: CONTENT_WIDTH / 3,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  catLabel: {
    fontSize: 11, fontWeight: '500',
    color: C.textSecondary,
    textAlign: 'center', lineHeight: 14,
    paddingHorizontal: 2,
  },

  /* ── Wallet list ─────────────────────────── */
  walletRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 14,
    borderRadius: 16, gap: 12, marginBottom: 4,
    // marginHorizontal gives the neu drop shadow room so the ScrollView doesn't
    // clip it into a hard vertical line at the row edges (matches WalletPicker).
    marginHorizontal: 10,
    backgroundColor: C.background,
  },
  walletIco: {
    minWidth: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  walletName: { fontSize: 15, fontWeight: '500', color: C.textPrimary },
  walletBal: { fontSize: 12, color: C.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  receiptCard: {
    position: 'absolute',
    width: CARD_WIDTH - 12,
    backgroundColor: C.background,
    borderRadius: 26,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    // neu.raisedSoft (bg + soft drop) spread at the call site
  },
  receiptAmount: {
    fontSize: 40,
    fontWeight: '200',
    color: C.textPrimary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.5,
  },
  receiptType: {
    fontSize: 11,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  receiptDivider: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    marginVertical: 20,
  },
  receiptDash: {
    flex: 1,
    height: 1.5,
    backgroundColor: withAlpha(C.textPrimary, 0.1),
    borderRadius: 1,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 9,
  },
  receiptIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptRowLabel: {
    fontSize: 10,
    color: C.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  receiptRowValue: {
    fontSize: 15,
    fontWeight: '500',
    color: C.textPrimary,
  },
  receiptActions: {
    marginTop: 24,
    gap: 2,
  },
  receiptSave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 17,
    borderRadius: 999,
    backgroundColor: C.accent,
    borderWidth: 1,
    borderColor: withAlpha(C.onAccent, 0.14),
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
  },
  receiptSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.onAccent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  receiptChange: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 11,
  },
  receiptChangeText: {
    fontSize: 12,
    fontWeight: '500',
    color: C.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  defBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: withAlpha(C.accent, 0.07),
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
  },
  defBadgeText: { fontSize: 10, fontWeight: '600', color: C.accent, letterSpacing: 0.3 },

  /* ── Playbook prompt ───────────────────── */
  pbPromptCard: {
    width: CARD_WIDTH - 32,
    backgroundColor: C.background,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    // neu.raisedSoft (bg + soft drop) spread at the call site
  },
  pbPromptIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pbPromptTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: 6,
  },
  pbPromptSub: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  pbPromptActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  pbPromptSkip: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: C.background,
  },
  pbPromptSkipText: {
    fontSize: 14,
    fontWeight: '500',
    color: C.textMuted,
  },
  pbPromptCreate: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
  },
  pbPromptCreateText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.onAccent,
  },
});
