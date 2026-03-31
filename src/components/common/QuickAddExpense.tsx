import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlaybookStore } from '../../store/playbookStore';
import { CALM, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { lightTap, successNotification } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';
import { useLearningStore } from '../../store/learningStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const FAB_SIZE = 56;
const FAB_STORAGE_KEY = '@potraces/fab-position';
const FAB_HINT_KEY = '@potraces/fab-hint-shown';
const SNAP_MARGIN = 16;
const CARD_WIDTH = SCREEN_WIDTH - 48;
const CARD_PADDING = 20;
const CONTENT_WIDTH = CARD_WIDTH - CARD_PADDING * 2;

type Step = 'amount' | 'category' | 'wallet';

// Module-level ref for deep link trigger
let _quickAddOpenRef: (() => void) | null = null;
export function openQuickAdd() {
  _quickAddOpenRef?.();
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
    <TouchableOpacity
      style={keyStyle}
      onPress={() => { lightTap(); onPress(label); }}
      activeOpacity={0.5}
      accessibilityLabel={label === '⌫' ? 'backspace' : label}
    >
      {label === '⌫' ? (
        <Feather name="delete" size={20} color={mutedColor} />
      ) : (
        <Text style={keyTextStyle}>{label}</Text>
      )}
    </TouchableOpacity>
  ),
);

// ─── Main Component ──────────────────────────────────────────
const QuickAddExpense: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);

  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const updateTransaction = usePersonalStore((s) => s.updateTransaction);
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const addToWallet = useWalletStore((s) => s.addToWallet);
  const getExpenseCategories = useCategoryStore((s) => s.getExpenseCategories);
  const getIncomeCategories = useCategoryStore((s) => s.getIncomeCategories);

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');
  const [pbPrompt, setPbPrompt] = useState<{ txId: string; amount: number; name: string } | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const pbPromptScale = useRef(new Animated.Value(0.92)).current;
  const pbPromptOpacity = useRef(new Animated.Value(0)).current;

  // ── Draggable FAB ──────────────────────────────────────────
  const fabPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const [showHint, setShowHint] = useState(false);

  // Snap to nearest horizontal edge
  const snapToEdge = useCallback((x: number, y: number) => {
    const minY = insets.top + SNAP_MARGIN;
    const maxY = SCREEN_HEIGHT - FAB_SIZE - insets.bottom - SNAP_MARGIN;
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
    // Position above tab bar — account for header (~56), tab bar (~90), safe area
    const defaultPos = { x: SCREEN_WIDTH - FAB_SIZE - SNAP_MARGIN, y: SCREEN_HEIGHT - FAB_SIZE - 200 - insets.bottom };

    AsyncStorage.getItem(FAB_STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const pos = JSON.parse(stored);
          const minY = insets.top + SNAP_MARGIN;
          const maxY = SCREEN_HEIGHT - FAB_SIZE - insets.bottom - SNAP_MARGIN;
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
  }, [insets]);

  // Show drag hint for the first 3 visits
  useEffect(() => {
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
  }, []);

  // ── Open ──────────────────────────────────────────────────
  const handleOpen = useCallback(() => {
    lightTap();
    setAmount('');
    setCategoryId('');
    setTxType('expense');
    setStep('amount');
    slideAnim.setValue(0);
    cardScale.setValue(0.92);
    cardOpacity.setValue(0);
    setVisible(true);
    Animated.parallel([
      Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 3 }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, cardScale, cardOpacity]);

  _quickAddOpenRef = handleOpen;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
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
    lightTap();
    animateTo('category');
  }, [amount, animateTo]);

  // ── Category select ─────────────────────────────────────────
  const handleCategorySelect = useCallback(
    (catId: string) => {
      lightTap();
      setCategoryId(catId);
      if (!hasMultipleWallets) {
        const cat = categories.find((c) => c.id === catId);
        const defaultWallet = wallets.find((w) => w.isDefault) || wallets[0];
        saveTransaction(catId, cat?.name || catId, defaultWallet?.id || null);
      } else {
        animateTo('wallet');
      }
    },
    [hasMultipleWallets, wallets, categories, animateTo],
  );

  // ── Wallet select ───────────────────────────────────────────
  const handleWalletSelect = useCallback(
    (wId: string) => {
      lightTap();
      const cat = categories.find((c) => c.id === categoryId);
      saveTransaction(categoryId, cat?.name || categoryId, wId);
    },
    [categoryId, categories],
  );

  // ── Save ────────────────────────────────────────────────────
  const saveTransaction = useCallback(
    (catId: string, catName: string, walletId: string | null) => {
      const parsed = parseFloat(amount);
      if (!parsed || parsed <= 0) return;

      const txId = addTransaction({
        amount: parsed,
        category: catId,
        description: catName,
        date: new Date(),
        type: txType,
        mode: 'personal',
        walletId: walletId || undefined,
        inputMethod: 'manual',
      });

      if (walletId) {
        if (txType === 'expense') {
          deductFromWallet(walletId, parsed);
        } else {
          addToWallet(walletId, parsed);
        }
      }

      // Playbook auto-link for expenses
      if (txType === 'expense') {
        const activePbs = usePlaybookStore.getState().getActivePlaybooks();
        const linkToPb = (pbId: string) => {
          usePlaybookStore.getState().linkExpense(pbId, txId);
          updateTransaction(txId, {
            playbookLinks: [{ playbookId: pbId, amount: parsed }],
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

      // Learn category association
      if (catName) useLearningStore.getState().learnCategory(catName, catId);

      successNotification();
      setVisible(false);
      const label = txType === 'expense' ? 'went out' : 'came in';
      showToast(`${currency} ${parsed.toFixed(2)} ${label}`, 'success');

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
    [amount, txType, addTransaction, updateTransaction, deductFromWallet, addToWallet, currency, showToast],
  );

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

  const handlePbDismiss = useCallback(() => setPbPrompt(null), []);

  const parsedAmount = parseFloat(amount) || 0;
  const displayAmount = amount || '0';
  const currentStepIdx = stepIndex(step);

  return (
    <>
      {/* ── Draggable FAB ──────────────────────────────── */}
      <Animated.View
        style={[
          styles.fabWrap,
          { left: fabPos.x, top: fabPos.y },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.fab} accessibilityLabel="Quick add" accessibilityRole="button">
          <Feather name="plus" size={26} color="#fff" />
        </View>
        {showHint && (
          <Animated.View style={[styles.hint, { opacity: hintOpacity }]} pointerEvents="none">
            <Text style={styles.hintText}>hold & drag to move</Text>
          </Animated.View>
        )}
      </Animated.View>

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
          <Animated.View
            style={[styles.card, { transform: [{ scale: cardScale }], opacity: cardOpacity, elevation: 24 }]}
            onStartShouldSetResponder={() => true}
          >
            {/* ── Header row ──────────────────────────── */}
            <View style={styles.hdr}>
              {currentStepIdx > 0 ? (
                <TouchableOpacity onPress={goBack} style={styles.hdrBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="chevron-left" size={20} color={C.textSecondary} />
                </TouchableOpacity>
              ) : (
                <View style={styles.hdrBtn} />
              )}
              <TouchableOpacity onPress={handleClose} style={styles.hdrBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={18} color={C.textMuted} />
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
                    <Text style={[styles.amountDisplay, !amount && { color: C.neutral }]}>
                      <Text style={styles.amountCurrency}>{currency} </Text>
                      {displayAmount}
                    </Text>
                  </View>

                  {/* Type toggle */}
                  <View style={styles.typeToggle}>
                    <TouchableOpacity
                      style={[styles.typePill, txType === 'expense' && styles.typePillActive]}
                      onPress={() => { lightTap(); setTxType('expense'); }}
                      activeOpacity={0.7}
                    >
                      <Feather name="arrow-up-right" size={14} color={txType === 'expense' ? '#fff' : C.textMuted} />
                      <Text style={[styles.typePillText, txType === 'expense' && styles.typePillTextActive]}>went out</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.typePill, txType === 'income' && styles.typePillActiveIncome]}
                      onPress={() => { lightTap(); setTxType('income'); }}
                      activeOpacity={0.7}
                    >
                      <Feather name="arrow-down-left" size={14} color={txType === 'income' ? '#fff' : C.textMuted} />
                      <Text style={[styles.typePillText, txType === 'income' && styles.typePillTextActive]}>came in</Text>
                    </TouchableOpacity>
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
                  <TouchableOpacity
                    style={[styles.cta, parsedAmount <= 0 && { opacity: 0.25 }]}
                    onPress={handleAmountNext}
                    disabled={parsedAmount <= 0}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.ctaText}>next</Text>
                    <Feather name="arrow-right" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>

                {/* ── STEP 2: Category ────────────────── */}
                <View style={[styles.step, { width: CARD_WIDTH }]}>
                  {/* Amount badge */}
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{currency} {parsedAmount.toFixed(2)}</Text>
                  </View>

                  <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={styles.catGrid} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={styles.catCell}
                        onPress={() => handleCategorySelect(cat.id)}
                        activeOpacity={0.55}
                      >
                        <View style={[styles.catIcon, { backgroundColor: withAlpha(cat.color, 0.1) }]}>
                          <Feather name={(cat.icon as keyof typeof Feather.glyphMap) || 'tag'} size={22} color={cat.color} />
                        </View>
                        <Text style={styles.catLabel} numberOfLines={2}>{cat.name}</Text>
                      </TouchableOpacity>
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

                    <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {[...wallets].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)).map((w) => (
                        <TouchableOpacity
                          key={w.id}
                          style={styles.walletRow}
                          onPress={() => handleWalletSelect(w.id)}
                          activeOpacity={0.55}
                        >
                          <View style={[styles.walletIco, { backgroundColor: withAlpha(w.color || C.accent, 0.08) }]}>
                            <Feather name={(w.icon as keyof typeof Feather.glyphMap) || 'credit-card'} size={20} color={w.color || C.accent} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.walletName}>{w.name}</Text>
                            <Text style={styles.walletBal}>{currency} {w.balance.toFixed(2)}</Text>
                          </View>
                          {w.isDefault && (
                            <Feather name="star" size={16} color={w.color || C.accent} />
                          )}
                          <Feather name="chevron-right" size={16} color="#D4D4D4" />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </Animated.View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* ── Playbook prompt ─────────────────────── */}
      {pbPrompt && (
        <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={handlePbDismiss}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback onPress={handlePbDismiss}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <Animated.View style={[styles.pbPromptCard, { transform: [{ scale: pbPromptScale }], opacity: pbPromptOpacity }]} onStartShouldSetResponder={() => true}>
              <View style={styles.pbPromptIcon}>
                <Feather name="book-open" size={28} color={C.accent} />
              </View>
              <Text style={styles.pbPromptTitle}>create a playbook?</Text>
              <Text style={styles.pbPromptSub}>
                track how you spend this {currency} {pbPrompt.amount.toFixed(2)}
              </Text>
              <View style={styles.pbPromptActions}>
                <TouchableOpacity style={styles.pbPromptSkip} onPress={handlePbDismiss} activeOpacity={0.7}>
                  <Text style={styles.pbPromptSkipText}>not now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pbPromptCreate} onPress={handlePbCreate} activeOpacity={0.8}>
                  <Feather name="plus" size={16} color="#fff" />
                  <Text style={styles.pbPromptCreateText}>create</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  );
};

export default React.memo(QuickAddExpense);

// ─── Styles ──────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  /* ── FAB ─────────────────────────────────── */
  fabWrap: { position: 'absolute', zIndex: 999, elevation: 10 },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOWS.md,
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
    ...SHADOWS.sm,
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
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  /* ── Card ─────────────────────────────────── */
  card: {
    width: CARD_WIDTH,
    backgroundColor: C.surface,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(C.textPrimary, 0.06),
    ...SHADOWS.lg,
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
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'transparent',
  },
  typePillActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  typePillActiveIncome: {
    backgroundColor: C.positive,
    borderColor: C.positive,
  },
  typePillText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.textMuted,
  },
  typePillTextActive: {
    color: '#fff',
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

  /* ── CTA button ──────────────────────────── */
  cta: {
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accent,
    paddingVertical: 14,
    borderRadius: 14,
  },
  ctaText: { fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: -0.2 },

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
  },
  catIcon: {
    width: 50, height: 50, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
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
    backgroundColor: C.background,
  },
  walletIco: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  walletName: { fontSize: 15, fontWeight: '500', color: C.textPrimary },
  walletBal: { fontSize: 12, color: C.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  defBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: withAlpha(C.accent, 0.07),
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
  },
  defBadgeText: { fontSize: 10, fontWeight: '600', color: C.accent, letterSpacing: 0.3 },

  /* ── Playbook prompt ───────────────────── */
  pbPromptCard: {
    width: CARD_WIDTH - 32,
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(C.textPrimary, 0.06),
    ...SHADOWS.lg,
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
    color: '#fff',
  },
});
