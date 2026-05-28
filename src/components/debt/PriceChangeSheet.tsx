import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Pressable,
  Modal,
  Platform,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { format, addMonths } from 'date-fns';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useDebtStore } from '../../store/debtStore';
import { useSettingsStore } from '../../store/settingsStore';
import ModalToastHost from '../common/ModalToastHost';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { SharedSubscription } from '../../types';

interface PriceChangeSheetProps {
  visible: boolean;
  onClose: () => void;
  sub: SharedSubscription | null;
  forMonth?: string;
}

const SPRING_CFG = { damping: 22, stiffness: 220, mass: 0.5 };

const PriceChangeSheet: React.FC<PriceChangeSheetProps> = ({ visible, onClose, sub, forMonth }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const currency = useSettingsStore((s) => s.currency);
  const recordSharedSubPriceChange = useDebtStore((s) => s.recordSharedSubPriceChange);
  const updateMonthAmounts = useDebtStore((s) => s.updateMonthAmounts);
  const isAdjust = !!forMonth;
  const { showToast } = useToast();
  const closingRef = useRef(false);
  const { height: SCREEN_H } = useWindowDimensions();
  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const saveScale = useSharedValue(1);

  const nextMonth = useMemo(() => format(addMonths(new Date(), 1), 'yyyy-MM'), []);
  const [newTotal, setNewTotal] = useState('');
  const [effectiveFrom] = useState(nextMonth);
  const [memberShares, setMemberShares] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible && sub) {
      closingRef.current = false;
      const monthRecord = forMonth ? sub.monthRecords.find((r) => r.month === forMonth) : null;
      if (monthRecord) {
        setNewTotal(String(monthRecord.totalAmount));
        const shares: Record<string, string> = {};
        monthRecord.payments.forEach((p) => {
          shares[p.contactId] = String(p.amount);
        });
        setMemberShares(shares);
      } else {
        setNewTotal(String(sub.totalAmount));
        const shares: Record<string, string> = {};
        sub.members.filter((m) => m.isActive).forEach((m) => {
          shares[m.contact.id] = String(m.shareAmount);
        });
        setMemberShares(shares);
      }
      sheetY.value = SCREEN_H;
      sheetY.value = withSpring(0, SPRING_CFG);
    }
  }, [visible, sub?.id]);

  const finishClose = useCallback(() => {
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
  }, [SCREEN_H, finishClose]);

  const panGesture = useMemo(
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
            sheetY.value = withSpring(0, SPRING_CFG);
          }
        }),
    [SCREEN_H, closeSheet]
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));
  const saveAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: saveScale.value }],
  }));

  const newTotalNum = parseFloat(newTotal) || 0;
  const sharesSum = Object.values(memberShares).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const sumMatches = newTotalNum > 0 && Math.abs(sharesSum - newTotalNum) < 0.01;
  const canSave = newTotalNum > 0 && sumMatches;
  const sumCheckY = useRef(0);
  const scrollRef = useRef<any>(null);

  const handleEqualSplit = useCallback(() => {
    if (!sub || newTotalNum <= 0) return;
    const activeMembers = sub.members.filter((m) => m.isActive);
    if (activeMembers.length === 0) return;
    const perPerson = (newTotalNum / activeMembers.length).toFixed(2);
    const shares: Record<string, string> = {};
    activeMembers.forEach((m) => { shares[m.contact.id] = perPerson; });
    setMemberShares(shares);
    lightTap();
  }, [sub, newTotalNum]);

  const handleSave = useCallback(() => {
    if (!sub || newTotalNum <= 0) return;
    if (!sumMatches) {
      scrollRef.current?.scrollTo?.({ y: sumCheckY.current, animated: true });
      showToast('amounts must add up to total', 'error');
      lightTap();
      return;
    }

    const builtShares = sub.members
      .filter((m) => m.isActive)
      .map((m) => ({
        contactId: m.contact.id,
        shareAmount: parseFloat(memberShares[m.contact.id] ?? '0') || 0,
      }));

    if (isAdjust && forMonth) {
      updateMonthAmounts(sub.id, forMonth, newTotalNum, builtShares);
    } else {
      recordSharedSubPriceChange(sub.id, {
        effectiveFrom,
        totalAmount: newTotalNum,
        memberShares: builtShares,
      });
    }

    showToast(t.sharedSubs.subUpdated, 'success');
    setTimeout(closeSheet, 400);
  }, [sub, sumMatches, newTotalNum, effectiveFrom, forMonth, isAdjust, memberShares, recordSharedSubPriceChange, updateMonthAmounts, closeSheet, t]);

  if (!visible || !sub) return null;

  const activeMembers = sub.members.filter((m) => m.isActive);

  return (
    <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeSheet}>
      <Reanimated.View style={[styles.backdrop, backdropAnimStyle]}>
        <Pressable style={{ flex: 1 }} onPress={closeSheet} />
      </Reanimated.View>

      <Reanimated.View style={[styles.sheetContainer, sheetAnimStyle]}>
        <GestureDetector gesture={panGesture}>
          <View collapsable={false}>
            <View style={styles.topRow}>
              <View style={styles.handle} />
            </View>
            <View style={styles.titleZone}>
              <Text style={styles.title}>
                {isAdjust ? 'adjust ' : ''}
                <Text style={styles.titleAccent}>{isAdjust ? 'amounts' : t.sharedSubs.priceChange}</Text>
              </Text>
              <Text style={styles.subtitle}>
                {sub.name} · {isAdjust
                  ? format(new Date(forMonth + '-01'), 'MMMM yyyy')
                  : `${t.sharedSubs.effectiveFrom.toLowerCase()} ${format(new Date(effectiveFrom + '-01'), 'MMMM yyyy')}`}
              </Text>
            </View>
          </View>
        </GestureDetector>

        <KeyboardAwareScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          contentContainerStyle={styles.scrollContent}
          bottomOffset={32}
          keyboardDismissMode="on-drag"
        >
          {/* Hero amount — new total */}
          <View style={styles.heroCard}>
            <Text style={styles.fieldLabel}>
              {t.sharedSubs.newTotal} <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.heroAmountRow}>
              <Text style={styles.heroCurrency}>{currency}</Text>
              <TextInput
                style={styles.heroAmountInput}
                value={(() => {
                  const dotIdx = newTotal.indexOf('.');
                  const intRaw = dotIdx === -1 ? newTotal : newTotal.slice(0, dotIdx);
                  const fracRaw = dotIdx === -1 ? null : newTotal.slice(dotIdx + 1);
                  const intFormatted = intRaw ? Number(intRaw).toLocaleString('en-US') : '';
                  return fracRaw === null ? intFormatted : `${intFormatted}.${fracRaw}`;
                })()}
                onChangeText={(raw) => {
                  const stripped = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
                  const fd = stripped.indexOf('.');
                  let normalized = stripped;
                  if (fd !== -1) {
                    normalized = stripped.slice(0, fd + 1) + stripped.slice(fd + 1).replace(/\./g, '');
                    const [ip, fp = ''] = normalized.split('.');
                    normalized = ip + '.' + fp.slice(0, 2);
                  }
                  setNewTotal(normalized);
                }}
                placeholder="0.00"
                placeholderTextColor={withAlpha(C.textPrimary, 0.12)}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
            </View>
          </View>

          {/* Per-member shares */}
          <View style={styles.fieldCard}>
            <View style={styles.membersHeaderRow}>
              <Text style={styles.fieldLabel}>{t.sharedSubs.shareAmount}</Text>
              <TouchableOpacity onPress={handleEqualSplit} style={styles.splitEvenBtn} activeOpacity={0.7}>
                <Feather name="divide" size={12} color={C.accent} />
                <Text style={styles.splitEvenText}>split even</Text>
              </TouchableOpacity>
            </View>

            {activeMembers.map((m) => {
              const initial = (m.contact.name || '?')[0].toUpperCase();
              return (
                <View key={m.contact.id} style={styles.memberRow}>
                  <View style={[styles.avatar, { borderColor: withAlpha(C.textPrimary, 0.12) }]}>
                    <Text style={[styles.avatarText, { color: C.textSecondary }]}>{initial}</Text>
                  </View>
                  <Text style={styles.memberName} numberOfLines={1}>{m.contact.name}</Text>
                  <View style={styles.shareInputWrap}>
                    <Text style={styles.shareCurrency}>{currency}</Text>
                    <TextInput
                      style={styles.shareInput}
                      value={memberShares[m.contact.id] ?? ''}
                      onChangeText={(v) => setMemberShares((prev) => ({ ...prev, [m.contact.id]: v }))}
                      placeholder="0.00"
                      placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                      keyboardType="decimal-pad"
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={C.accent}
                    />
                  </View>
                </View>
              );
            })}

            {/* Sum check */}
            <View onLayout={(e) => { sumCheckY.current = e.nativeEvent.layout.y; }} style={styles.sumRow}>
              <Feather
                name={sumMatches ? 'check-circle' : 'alert-circle'}
                size={14}
                color={sumMatches ? C.accent : C.bronze}
              />
              <Text style={[styles.sumText, { color: sumMatches ? C.accent : C.bronze }]}>
                {currency}{sharesSum.toFixed(2)} / {currency}{newTotalNum.toFixed(2)}
                {' — '}{sumMatches ? 'balanced' : 'doesn\'t add up'}
              </Text>
            </View>
          </View>
        </KeyboardAwareScrollView>

        {/* Save zone */}
        <View style={[styles.saveZone, { paddingBottom: Math.max(SPACING.lg, 34) }]}>
          <Reanimated.View style={saveAnimStyle}>
            <Pressable
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              onPress={handleSave}
              onPressIn={() => { saveScale.value = withTiming(0.97, { duration: 120 }); }}
              onPressOut={() => { saveScale.value = withSpring(1, { damping: 18, stiffness: 240 }); }}
              accessibilityRole="button"
              accessibilityLabel="apply price change"
            >
              <View style={styles.saveBtnInner}>
                <Feather name="check" size={16} color={canSave ? C.surface : C.textMuted} />
                <Text style={[styles.saveBtnText, !canSave && styles.saveBtnTextDisabled]}>
                  {isAdjust ? 'update amounts' : 'apply price change'}
                </Text>
              </View>
            </Pressable>
          </Reanimated.View>

          <Pressable
            style={styles.closeLink}
            onPress={closeSheet}
            hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel="close"
          >
            {({ pressed }) => (
              <View style={[styles.closeLinkInner, pressed && { opacity: 0.55 }]}>
                <Feather name="x" size={12} color={C.textMuted} />
                <Text style={styles.closeLinkText}>close</Text>
              </View>
            )}
          </Pressable>
        </View>

      </Reanimated.View>
      <ModalToastHost />
    </Modal>
  );
};

const makeStyles = (C: typeof CALM, isDark: boolean) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    maxHeight: '80%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.15),
  },
  titleZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  title: {
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
  subtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: SPACING.xs + 2,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.sm + 2,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: SPACING.xs,
  },
  heroCurrency: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
    fontVariant: ['tabular-nums'],
    marginRight: 4,
    letterSpacing: -0.2,
  },
  heroAmountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.8,
    paddingVertical: 0,
  },
  fieldCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm + 2,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  requiredStar: {
    fontSize: TYPOGRAPHY.size.sm,
    color: '#C1694F',
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  fieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    minHeight: 22,
  },
  membersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  splitEvenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.1),
  },
  splitEvenText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(C.textPrimary, 0.06),
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  memberName: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    minWidth: 0,
  },
  shareInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.textPrimary, isDark ? 0.08 : 0.04),
    borderRadius: RADIUS.sm,
    paddingLeft: SPACING.sm,
    width: 100,
  },
  shareCurrency: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  shareInput: {
    flex: 1,
    paddingHorizontal: SPACING.xs,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  sumText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },
  saveZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.surface,
  },
  saveBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveBtnDisabled: {
    backgroundColor: withAlpha(C.textPrimary, isDark ? 0.12 : 0.08),
  },
  saveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.surface,
    letterSpacing: 0.3,
  },
  saveBtnTextDisabled: {
    color: C.textMuted,
  },
  closeLink: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
  },
  closeLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  closeLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
});

export default React.memo(PriceChangeSheet);
