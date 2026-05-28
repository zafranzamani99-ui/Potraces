import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { format, addMonths, subMonths, parse } from 'date-fns';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { renderIcon } from '../commitments/CommitmentForm';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useDebtStore } from '../../store/debtStore';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import ModalToastHost from '../common/ModalToastHost';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { SharedSubscription } from '../../types';

interface SharedSubDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  sub: SharedSubscription | null;
  onEdit: (sub: SharedSubscription) => void;
  onRecordPayment: (subId: string, month: string, contactId: string) => void;
  onGenerateDebts: (subId: string, month: string) => void;
  onPriceChange: (sub: SharedSubscription) => void;
  onAdjustAmounts: (sub: SharedSubscription, month: string) => void;
  onDelete: (subId: string) => void;
  onLinkCommitment: (sub: SharedSubscription) => void;
  onViewCommitment: (subscriptionId: string) => void;
}

const SPRING_CFG = { damping: 22, stiffness: 220, mass: 0.5 };

const SharedSubDetailSheet: React.FC<SharedSubDetailSheetProps> = ({
  visible, onClose, sub, onEdit, onRecordPayment, onGenerateDebts, onPriceChange, onAdjustAmounts, onDelete, onLinkCommitment, onViewCommitment,
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const currency = useSettingsStore((s) => s.currency);
  const ensureMonthRecord = useDebtStore((s) => s.ensureMonthRecord);
  const markSharedSubPayment = useDebtStore((s) => s.markSharedSubPayment);
  const unmarkSharedSubPayment = useDebtStore((s) => s.unmarkSharedSubPayment);
  const updateSharedSubscription = useDebtStore((s) => s.updateSharedSubscription);
  const updateSubscription = usePersonalStore((s) => s.updateSubscription);
  const { showToast } = useToast();
  const closingRef = useRef(false);
  const { height: SCREEN_H } = useWindowDimensions();
  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);

  const [viewMonth, setViewMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    if (visible && sub) {
      closingRef.current = false;
      setViewMonth(format(new Date(), 'yyyy-MM'));
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

  const navigateMonth = useCallback((direction: -1 | 1) => {
    setViewMonth((prev) => {
      const d = parse(prev, 'yyyy-MM', new Date());
      const next = direction === 1 ? addMonths(d, 1) : subMonths(d, 1);
      return format(next, 'yyyy-MM');
    });
    lightTap();
  }, []);

  const monthLabel = useMemo(() => {
    const d = parse(viewMonth, 'yyyy-MM', new Date());
    return format(d, 'MMMM yyyy');
  }, [viewMonth]);

  useEffect(() => {
    if (visible && sub) ensureMonthRecord(sub.id, viewMonth);
  }, [visible, sub?.id, viewMonth]);

  const liveSub = useDebtStore(
    useCallback((s) => s.sharedSubscriptions.find((ss) => ss.id === sub?.id) ?? null, [sub?.id])
  );

  const monthRecord = useMemo(() => {
    if (!liveSub) return null;
    return liveSub.monthRecords.find((r) => r.month === viewMonth) ?? null;
  }, [liveSub, viewMonth]);

  const paidMembers = useMemo(() =>
    monthRecord ? monthRecord.payments.filter((p) => p.isPaid) : [], [monthRecord]);
  const unpaidMembers = useMemo(() =>
    monthRecord ? monthRecord.payments.filter((p) => !p.isPaid) : [], [monthRecord]);
  const collected = useMemo(() =>
    paidMembers.reduce((sum, p) => sum + p.amount, 0), [paidMembers]);
  const totalAmount = monthRecord?.totalAmount ?? liveSub?.totalAmount ?? 0;

  const handleGenerateDebts = useCallback(() => {
    if (!liveSub) return;
    if (monthRecord?.debtsGenerated) {
      showToast(t.sharedSubs.debtsAlreadyGenerated, 'info');
      return;
    }
    onGenerateDebts(liveSub.id, viewMonth);
    showToast(t.sharedSubs.debtsGenerated, 'success');
    lightTap();
  }, [liveSub, monthRecord, viewMonth, onGenerateDebts, t]);

  const handleDelete = useCallback(() => {
    if (!liveSub) return;
    Alert.alert(
      t.sharedSubs.deleteSubTitle,
      t.sharedSubs.deleteSubMsg,
      [
        { text: t.common?.cancel ?? 'cancel', style: 'cancel' },
        {
          text: t.common?.delete ?? 'delete',
          style: 'destructive',
          onPress: () => { onDelete(liveSub.id); closeSheet(); },
        },
      ],
    );
  }, [liveSub, t, onDelete, closeSheet]);

  if (!visible || !sub) return null;

  const getMemberContact = (contactId: string) =>
    liveSub?.members.find((m) => m.contact.id === contactId);
  const pctCollected = totalAmount > 0 ? Math.min((collected / totalAmount) * 100, 100) : 0;

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
            {/* Header */}
            <View style={styles.headerZone}>
              <View style={styles.headerIconWrap}>
                {(liveSub?.imageUri ?? sub.imageUri) ? (
                  <Image source={{ uri: liveSub?.imageUri ?? sub.imageUri }} style={styles.headerIconImage} />
                ) : (liveSub?.iconName ?? sub.iconName) ? (
                  renderIcon(liveSub?.iconName ?? sub.iconName!, 28, C.accent)
                ) : (
                  <Text style={styles.headerIconFallback}>
                    {(liveSub?.name ?? sub.name).charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <Text style={styles.title}>
                <Text style={styles.titleAccent}>{liveSub?.name ?? sub.name}</Text>
              </Text>
              <Text style={styles.headerCost}>
                {currency}{totalAmount.toFixed(2)}
                {liveSub?.billingCycle === 'monthly' ? t.sharedSubs.perMonth : liveSub?.billingCycle === 'quarterly' ? t.sharedSubs.perQuarter : t.sharedSubs.perYear}
              </Text>
            </View>
          </View>
        </GestureDetector>

        {/* Month navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.monthArrow} activeOpacity={0.6}>
            <Feather name="chevron-left" size={22} color={C.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity onPress={() => navigateMonth(1)} style={styles.monthArrow} activeOpacity={0.6}>
            <Feather name="chevron-right" size={22} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Collection summary card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryCollected}>{currency}{collected.toFixed(2)}</Text>
              <Text style={styles.summaryOf}> of {currency}{totalAmount.toFixed(2)} {t.sharedSubs.collected}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pctCollected}%` as const, backgroundColor: C.accent }]} />
            </View>
            {unpaidMembers.length > 0 && (
              <Text style={styles.summaryOutstanding}>
                {t.sharedSubs.unpaidCount.replace('{n}', String(unpaidMembers.length))}
                {' · '}{currency}{(totalAmount - collected).toFixed(2)} {t.sharedSubs.outstanding}
              </Text>
            )}
          </View>

          {/* Generate debts button */}
          {monthRecord && !monthRecord.debtsGenerated && (
            <Pressable style={styles.generateBtn} onPress={handleGenerateDebts}>
              {({ pressed }) => (
                <View style={[styles.generateBtnInner, pressed && { opacity: 0.8 }]}>
                  <Feather name="zap" size={16} color={C.onAccent} />
                  <Text style={styles.generateBtnText}>{t.sharedSubs.generateDebts}</Text>
                </View>
              )}
            </Pressable>
          )}
          {monthRecord?.debtsGenerated && (
            <View style={styles.generatedBadge}>
              <Feather name="check" size={14} color={C.accent} />
              <Text style={styles.generatedText}>{t.sharedSubs.debtsGenerated}</Text>
            </View>
          )}

          {/* Unpaid members */}
          {unpaidMembers.length > 0 && (
            <View style={styles.memberSection}>
              <Text style={styles.sectionLabel}>
                {t.sharedSubs.unpaidCount.replace('{n}', String(unpaidMembers.length))}
              </Text>
              {unpaidMembers.map((payment) => {
                const member = getMemberContact(payment.contactId);
                if (!member) return null;
                const initial = (member.contact.name || '?')[0].toUpperCase();
                const isOwner = payment.contactId === '__self__';
                const handleOwnerTap = () => {
                  lightTap();
                  if (liveSub?.subscriptionId) {
                    onViewCommitment(liveSub.subscriptionId);
                  } else {
                    markSharedSubPayment(sub.id, viewMonth, '__self__');
                    showToast('marked as paid', 'success');
                  }
                };
                return (
                  <TouchableOpacity
                    key={payment.contactId}
                    style={styles.memberRow}
                    onPress={isOwner ? handleOwnerTap : () => { lightTap(); onRecordPayment(sub.id, viewMonth, payment.contactId); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.statusDot, { borderColor: C.bronze }]} />
                    <View style={[styles.avatar, { borderColor: isOwner ? C.accent : withAlpha(C.textPrimary, 0.12) }]}>
                      <Text style={[styles.avatarText, { color: isOwner ? C.accent : C.textSecondary }]}>{initial}</Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.contact.name}</Text>
                      {isOwner && liveSub?.subscriptionId ? (
                        <Text style={[styles.memberTag, { color: C.accent }]}>via commitment</Text>
                      ) : member.tag ? (
                        <Text style={styles.memberTag}>{member.tag}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.memberAmount}>{currency}{payment.amount.toFixed(2)}</Text>
                    <Feather name={isOwner && liveSub?.subscriptionId ? 'external-link' : 'chevron-right'} size={16} color={C.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Paid members */}
          {paidMembers.length > 0 && (
            <View style={styles.memberSection}>
              <Text style={styles.sectionLabel}>
                {t.sharedSubs.paidOf
                  .replace('{paid}', String(paidMembers.length))
                  .replace('{total}', String(monthRecord?.payments.length ?? 0))}
              </Text>
              {paidMembers.map((payment) => {
                const member = getMemberContact(payment.contactId);
                if (!member) return null;
                const initial = (member.contact.name || '?')[0].toUpperCase();
                const isOwner = payment.contactId === '__self__';
                const handlePaidOwnerTap = () => {
                  lightTap();
                  if (liveSub?.subscriptionId) {
                    onViewCommitment(liveSub.subscriptionId);
                  } else {
                    unmarkSharedSubPayment(sub.id, viewMonth, '__self__');
                    showToast('unmarked', 'info');
                  }
                };
                const Row = isOwner ? TouchableOpacity : View;
                return (
                  <Row key={payment.contactId} style={styles.memberRow} {...(isOwner ? { onPress: handlePaidOwnerTap, activeOpacity: 0.7 } : {})}>
                    <View style={[styles.statusDot, styles.statusDotPaid]}>
                      <Feather name="check" size={8} color={C.onAccent} />
                    </View>
                    <View style={[styles.avatar, { borderColor: C.accent }]}>
                      <Text style={[styles.avatarText, { color: C.accent }]}>{initial}</Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: C.textSecondary }]}>{member.contact.name}</Text>
                      {isOwner && liveSub?.subscriptionId ? (
                        <Text style={[styles.memberTag, { color: C.accent }]}>via commitment</Text>
                      ) : member.tag ? (
                        <Text style={styles.memberTag}>{member.tag}</Text>
                      ) : null}
                      {payment.paidAt && (
                        <Text style={styles.paidDate}>
                          {t.sharedSubs.paidOn.replace('{date}', format(new Date(payment.paidAt), 'MMM d'))}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.memberAmount, { color: C.textMuted }]}>
                      {currency}{payment.amount.toFixed(2)}
                    </Text>
                    {isOwner && <Feather name={liveSub?.subscriptionId ? 'external-link' : 'rotate-ccw'} size={14} color={C.textMuted} />}
                  </Row>
                );
              })}
            </View>
          )}

          {/* Action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => { lightTap(); onEdit(liveSub ?? sub); }}
              activeOpacity={0.7}
            >
              <Feather name="edit-2" size={16} color={C.textSecondary} />
              <Text style={styles.actionBtnText}>{t.sharedSubs.editSub}</Text>
            </TouchableOpacity>
            {monthRecord?.debtsGenerated ? (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => { lightTap(); onAdjustAmounts(liveSub ?? sub, viewMonth); }}
                activeOpacity={0.7}
              >
                <Feather name="sliders" size={16} color={C.textSecondary} />
                <Text style={styles.actionBtnText}>adjust amounts</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => { lightTap(); onPriceChange(liveSub ?? sub); }}
                activeOpacity={0.7}
              >
                <Feather name="trending-up" size={16} color={C.textSecondary} />
                <Text style={styles.actionBtnText}>{t.sharedSubs.priceChange}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Commitment link */}
          {liveSub?.subscriptionId ? (
            <>
              <TouchableOpacity
                style={styles.commitmentCard}
                onPress={() => { lightTap(); onViewCommitment(liveSub.subscriptionId!); }}
                activeOpacity={0.7}
              >
                <View style={styles.commitmentCardLeft}>
                  <View style={styles.commitmentCardIcon}>
                    <Feather name="link" size={13} color={C.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commitmentCardTitle}>linked to commitment</Text>
                    <Text style={styles.commitmentCardSub}>
                      {'your share · '}
                      {currency} {(liveSub.members.find(m => m.contact.id === '__self__')?.shareAmount ?? 0).toFixed(2)}/{liveSub.billingCycle === 'yearly' ? 'yr' : liveSub.billingCycle === 'quarterly' ? 'qtr' : 'mo'}
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={withAlpha(C.textMuted, 0.5)} />
              </TouchableOpacity>
              <Pressable
                style={styles.unlinkLink}
                onPress={() => {
                  lightTap();
                  if (liveSub.subscriptionId) updateSubscription(liveSub.subscriptionId, { sharedSubId: undefined });
                  updateSharedSubscription(liveSub.id, { subscriptionId: undefined });
                  showToast('unlinked', 'info');
                }}
                hitSlop={{ top: 10, bottom: 10, left: 14, right: 14 }}
              >
                {({ pressed }) => (
                  <View style={[styles.unlinkLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="link" size={11} color={C.textMuted} />
                    <Text style={styles.unlinkLinkText}>unlink</Text>
                  </View>
                )}
              </Pressable>
            </>
          ) : (
            <TouchableOpacity
              style={styles.commitmentLinkBtn}
              onPress={() => { lightTap(); onLinkCommitment(liveSub ?? sub); }}
              activeOpacity={0.7}
            >
              <Feather name="link" size={14} color={C.textMuted} />
              <Text style={styles.commitmentLinkBtnText}>link to commitment</Text>
            </TouchableOpacity>
          )}

          {/* Delete link */}
          <Pressable style={styles.deleteLink} onPress={handleDelete}>
            {({ pressed }) => (
              <View style={[styles.deleteLinkInner, pressed && { opacity: 0.55 }]}>
                <Feather name="trash-2" size={12} color={C.textMuted} />
                <Text style={styles.deleteLinkText}>{t.sharedSubs.deleteSubTitle}</Text>
              </View>
            )}
          </Pressable>
        </ScrollView>

        {/* Close zone */}
        <View style={[styles.closeZone, { paddingBottom: Math.max(SPACING.lg, 34) }]}>
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
    maxHeight: '88%',
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
  headerZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  headerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: withAlpha(C.accent, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  headerIconImage: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  headerIconFallback: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
    letterSpacing: -0.5,
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
  headerCost: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: SPACING.xs,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.1,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.lg,
  },
  monthArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    minWidth: 140,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  summaryCard: {
    backgroundColor: withAlpha(C.textPrimary, isDark ? 0.06 : 0.03),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: SPACING.sm,
  },
  summaryCollected: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  summaryOf: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: withAlpha(C.textPrimary, isDark ? 0.10 : 0.06),
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  progressFill: {
    height: 8,
    borderRadius: RADIUS.sm,
  },
  summaryOutstanding: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  generateBtn: {
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.md,
    minHeight: 44,
  },
  generateBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
  },
  generateBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
    letterSpacing: 0.2,
  },
  generatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  generatedText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  memberSection: {
    marginBottom: SPACING.md,
  },
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(C.textPrimary, 0.06),
  },
  statusDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDotPaid: {
    borderColor: C.accent,
    backgroundColor: C.accent,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  memberTag: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  paidDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    marginTop: 1,
  },
  memberAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    backgroundColor: withAlpha(C.textPrimary, isDark ? 0.06 : 0.03),
  },
  actionBtnText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  commitmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: withAlpha(C.accent, C === CALM_DARK ? 0.06 : 0.03),
    borderWidth: 1,
    borderColor: withAlpha(C.accent, C === CALM_DARK ? 0.12 : 0.08),
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  commitmentCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  commitmentCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: withAlpha(C.accent, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  commitmentCardTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    letterSpacing: -0.1,
  },
  commitmentCardSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
  unlinkLink: {
    alignSelf: 'center',
    marginTop: SPACING.sm,
  },
  unlinkLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  unlinkLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  commitmentLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  commitmentLinkBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  deleteLink: {
    marginTop: SPACING.sm,
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
  closeZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.surface,
  },
  closeLink: {
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

export default React.memo(SharedSubDetailSheet);
