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
  ScrollView,
  PanResponder,
  TouchableWithoutFeedback,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SHADOWS, withAlpha } from '../../constants';
import { lightTap, successNotification } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';

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
  ({ label, onPress }: { label: string; onPress: (k: string) => void }) => (
    <TouchableOpacity
      style={styles.numKey}
      onPress={() => { lightTap(); onPress(label); }}
      activeOpacity={0.5}
      accessibilityLabel={label === '⌫' ? 'backspace' : label}
    >
      {label === '⌫' ? (
        <Feather name="delete" size={20} color={CALM.textMuted} />
      ) : (
        <Text style={styles.numKeyText}>{label}</Text>
      )}
    </TouchableOpacity>
  ),
);

// ─── Main Component ──────────────────────────────────────────
const QuickAddExpense: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);

  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const getExpenseCategories = useCategoryStore((s) => s.getExpenseCategories);

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const slideAnim = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
        onPanResponderGrant: () => {
          isDragging.current = true;
          fabPos.setOffset(lastPos.current);
          fabPos.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (_, g) => {
          fabPos.setValue({ x: g.dx, y: g.dy });
        },
        onPanResponderRelease: (_, g) => {
          fabPos.flattenOffset();
          const currentX = lastPos.current.x + g.dx;
          const currentY = lastPos.current.y + g.dy;
          snapToEdge(currentX, currentY);
          isDragging.current = false;
        },
      }),
    [fabPos, snapToEdge],
  );

  const categories = useMemo(() => getExpenseCategories('personal'), [getExpenseCategories]);
  const hasMultipleWallets = wallets.length > 1;
  const totalSteps = hasMultipleWallets ? 3 : 2;

  const stepIndex = useCallback(
    (s: Step) => (s === 'amount' ? 0 : s === 'category' ? 1 : 2),
    [],
  );

  // ── Open ──────────────────────────────────────────────────
  const handleOpen = useCallback(() => {
    lightTap();
    setAmount('');
    setCategoryId('');
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

      addTransaction({
        amount: parsed,
        category: catId,
        description: catName,
        date: new Date(),
        type: 'expense',
        mode: 'personal',
        walletId: walletId || undefined,
        inputMethod: 'manual',
      });

      if (walletId) deductFromWallet(walletId, parsed);

      successNotification();
      setVisible(false);
      showToast(`${currency} ${parsed.toFixed(2)} added`, 'success');
    },
    [amount, addTransaction, deductFromWallet, currency, showToast],
  );

  const handleClose = useCallback(() => setVisible(false), []);

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
        <TouchableOpacity
          style={styles.fab}
          onPress={handleOpen}
          activeOpacity={0.8}
          accessibilityLabel="Quick add expense"
          accessibilityRole="button"
        >
          <Feather name="plus" size={26} color="#fff" />
        </TouchableOpacity>
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
            onResponderTerminationRequest={() => true}
          >
            {/* ── Header row ──────────────────────────── */}
            <View style={styles.hdr}>
              {currentStepIdx > 0 ? (
                <TouchableOpacity onPress={goBack} style={styles.hdrBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="chevron-left" size={20} color={CALM.textSecondary} />
                </TouchableOpacity>
              ) : (
                <View style={styles.hdrBtn} />
              )}
              <TouchableOpacity onPress={handleClose} style={styles.hdrBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={18} color={CALM.textMuted} />
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
                    <Text style={[styles.amountDisplay, !amount && { color: '#D4D4D4' }]}>
                      <Text style={styles.amountCurrency}>{currency} </Text>
                      {displayAmount}
                    </Text>
                  </View>

                  {/* Numpad */}
                  <View style={styles.pad}>
                    {[['1','2','3'],['4','5','6'],['7','8','9'],['.','0','⌫']].map((row, ri) => (
                      <View key={ri} style={styles.padRow}>
                        {row.map((k) => <NumpadKey key={k} label={k} onPress={handleNumpad} />)}
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

                  <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={styles.catGrid} showsVerticalScrollIndicator={false}>
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={styles.catCell}
                        onPress={() => handleCategorySelect(cat.id)}
                        activeOpacity={0.55}
                      >
                        <View style={[styles.catIcon, { backgroundColor: withAlpha(cat.color, 0.1) }]}>
                          <Feather name={(cat.icon as any) || 'tag'} size={22} color={cat.color} />
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
                        <Text style={{ fontWeight: '400', color: CALM.textMuted }}>
                          {categories.find((c) => c.id === categoryId)?.name || ''}
                        </Text>
                      </Text>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                      {[...wallets].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)).map((w) => (
                        <TouchableOpacity
                          key={w.id}
                          style={styles.walletRow}
                          onPress={() => handleWalletSelect(w.id)}
                          activeOpacity={0.55}
                        >
                          <View style={[styles.walletIco, { backgroundColor: withAlpha(w.color || CALM.accent, 0.08) }]}>
                            <Feather name={(w.icon as any) || 'credit-card'} size={20} color={w.color || CALM.accent} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.walletName}>{w.name}</Text>
                            <Text style={styles.walletBal}>{currency} {w.balance.toFixed(2)}</Text>
                          </View>
                          {w.isDefault && (
                            <Feather name="star" size={16} color={w.color || CALM.accent} />
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
    </>
  );
};

export default React.memo(QuickAddExpense);

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  /* ── FAB ─────────────────────────────────── */
  fabWrap: { position: 'absolute', zIndex: 999, elevation: 10 },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: CALM.accent,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOWS.md,
  },
  hint: {
    position: 'absolute',
    top: FAB_SIZE + 8,
    alignSelf: 'center',
    left: -26,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    ...SHADOWS.sm,
  },
  hintText: {
    fontSize: 11,
    fontWeight: '500',
    color: CALM.textSecondary,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
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
    backgroundColor: '#EBEBEB',
  },
  dotFilled: {
    backgroundColor: CALM.accent,
  },

  /* ── Steps container ─────────────────────── */
  clip: { overflow: 'hidden', width: CARD_WIDTH },
  rail: { flexDirection: 'row' },
  step: { paddingHorizontal: CARD_PADDING, paddingBottom: 24 },

  /* ── Amount ──────────────────────────────── */
  amountWrap: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 20,
  },
  amountDisplay: {
    fontSize: 42,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    color: CALM.textPrimary,
    letterSpacing: -1.5,
  },
  amountCurrency: {
    fontSize: 18,
    fontWeight: '400',
    color: CALM.textMuted,
  },

  /* ── Numpad ──────────────────────────────── */
  pad: { alignSelf: 'center', width: 234, marginBottom: 18 },
  padRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  numKey: {
    width: 70, height: 50, borderRadius: 25,
    backgroundColor: '#F5F5F3',
    alignItems: 'center', justifyContent: 'center',
  },
  numKeyText: {
    fontSize: 22, fontWeight: '400',
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  /* ── CTA button ──────────────────────────── */
  cta: {
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 8,
    backgroundColor: CALM.accent,
    paddingVertical: 14,
    borderRadius: 14,
  },
  ctaText: { fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: -0.2 },

  /* ── Summary badge ───────────────────────── */
  badge: {
    alignSelf: 'center',
    backgroundColor: withAlpha(CALM.accent, 0.07),
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 14, marginTop: 4,
  },
  badgeText: {
    fontSize: 14, fontWeight: '600',
    color: CALM.accent,
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
    color: CALM.textSecondary,
    textAlign: 'center', lineHeight: 14,
    paddingHorizontal: 2,
  },

  /* ── Wallet list ─────────────────────────── */
  walletRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 14,
    borderRadius: 16, gap: 12, marginBottom: 4,
    backgroundColor: '#FAFAF8',
  },
  walletIco: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  walletName: { fontSize: 15, fontWeight: '500', color: CALM.textPrimary },
  walletBal: { fontSize: 12, color: CALM.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  defBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: withAlpha(CALM.accent, 0.07),
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
  },
  defBadgeText: { fontSize: 10, fontWeight: '600', color: CALM.accent, letterSpacing: 0.3 },
});
