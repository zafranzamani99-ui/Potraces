import React, { useEffect, useMemo, useState, RefObject } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Keyboard,
  Modal,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { format, isToday, isYesterday, isValid } from 'date-fns';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import CategoryPicker from '../common/CategoryPicker';
import WalletPicker from '../common/WalletPicker';
import CalendarPicker from '../common/CalendarPicker';
import type { CategoryOption, Wallet } from '../../types';

interface EditFormFieldsProps {
  editDescription: string;
  setEditDescription: (v: string) => void;
  editType: 'income' | 'expense' | 'investment';
  editCategory: string;
  setEditCategory: (v: string) => void;
  editCategories: CategoryOption[];
  editWalletId: string | null;
  setEditWalletId: (v: string | null) => void;
  wallets: Wallet[];
  editTags: string;
  setEditTags: (v: string) => void;
  editDate: Date;
  setEditDate: (d: Date) => void;
  isLinkedDebt: boolean;
  descriptionInputRef: RefObject<TextInput | null>;
  onDescriptionNext?: () => void;
  onMultilineFocus?: () => void;
  onMultilineBlur?: () => void;
  C: typeof CALM;
}

/**
 * Description card + Date card + CategoryPicker + WalletPicker + Tags card
 * + linked-debt notice (when isLinkedDebt is true).
 */
const EditFormFields: React.FC<EditFormFieldsProps> = ({
  editDescription,
  setEditDescription,
  editType,
  editCategory,
  setEditCategory,
  editCategories,
  editWalletId,
  setEditWalletId,
  wallets,
  editTags,
  setEditTags,
  editDate,
  setEditDate,
  isLinkedDebt,
  descriptionInputRef,
  onDescriptionNext,
  onMultilineFocus,
  onMultilineBlur,
  C,
}) => {
  const t = useT();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [dateModalVisible, setDateModalVisible] = useState(false);

  // #3 — If editType changes and the current category isn't valid for the new
  // filtered list, snap to the first valid category for the new type.
  useEffect(() => {
    if (editCategory && !editCategories.find((c) => c.id === editCategory)) {
      setEditCategory(editCategories[0]?.id ?? '');
    }
  }, [editType, editCategories, editCategory, setEditCategory]);

  // #1 — casual time format: "today, 3:42 pm" / "yesterday, 9:08 am" /
  // "wed, 28 apr · 8:15 am"
  const casualDateTime = useMemo(() => {
    if (!isValid(editDate)) return t.editForm.invalidDate;
    const time = format(editDate, 'h:mm a').toLowerCase();
    if (isToday(editDate)) {
      return `${t.transactionList.today.toLowerCase()}, ${time}`;
    }
    if (isYesterday(editDate)) {
      return `${t.transactionList.yesterday.toLowerCase()}, ${time}`;
    }
    return `${format(editDate, 'EEE, d MMM').toLowerCase()} · ${time}`;
  }, [editDate, t]);

  const handleDescriptionSubmit = onDescriptionNext ?? Keyboard.dismiss;

  return (
    <>
      {/* Description card — vertical stack, label above input */}
      <View style={styles.editFieldCardBordered}>
        <Text style={styles.editFieldCardLabel}>{t.transaction.description.toLowerCase()}</Text>
        <TextInput
          ref={descriptionInputRef}
          style={[styles.editFieldCardInput, styles.editFieldMultiline]}
          value={editDescription}
          onChangeText={setEditDescription}
          placeholder={t.transaction.descriptionPlaceholder.toLowerCase()}
          placeholderTextColor={C.textMuted}
          multiline
          textAlignVertical="top"
          returnKeyType="default"
          onFocus={onMultilineFocus}
          onBlur={onMultilineBlur}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={C.accent}
          accessibilityLabel={t.transaction.description.toLowerCase()}
        />
      </View>

      {/* #1 — Date card (between description and category) */}
      <Pressable
        onPress={() => {
          if (isLinkedDebt) return;
          Keyboard.dismiss();
          setDateModalVisible(true);
        }}
        disabled={isLinkedDebt}
        style={({ pressed }) => [
          styles.editFieldCardBordered,
          styles.dateRow,
          pressed && !isLinkedDebt && styles.dateRowPressed,
          isLinkedDebt && styles.lockedField,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t.editForm.whenLabel}
      >
        <View style={styles.dateTextWrap}>
          <Text style={styles.editFieldCardLabel}>{t.editForm.whenLabel}</Text>
          <Text style={[styles.dateValueText, isLinkedDebt && styles.lockedFieldText]}>{casualDateTime}</Text>
        </View>
        <Feather name="calendar" size={16} color={isLinkedDebt ? withAlpha(C.textMuted, 0.4) : C.textMuted} />
      </Pressable>

      {/* #17 — Wrap pickers in field-card chrome for visual consistency */}
      <View style={[styles.pickerFieldCard, isLinkedDebt && styles.lockedField]} pointerEvents={isLinkedDebt ? 'none' : 'auto'}>
        <CategoryPicker
          categories={editCategories}
          selectedId={editCategory}
          onSelect={setEditCategory}
          label={t.quickAdd.categoryLabel}
          layout="dropdown"
        />
      </View>
      <View style={[styles.pickerFieldCard, isLinkedDebt && styles.lockedField]} pointerEvents={isLinkedDebt ? 'none' : 'auto'}>
        <WalletPicker
          wallets={wallets}
          selectedId={editWalletId}
          onSelect={setEditWalletId}
          label={t.quickAdd.walletLabel}
        />
      </View>

      {/* Tags card */}
      <View style={styles.editFieldCardBordered}>
        <Text style={styles.editFieldCardLabel}>{t.transaction.tagsOptional.toLowerCase()}</Text>
        <TextInput
          style={[styles.editFieldCardInput, styles.editFieldMultiline]}
          value={editTags}
          onChangeText={setEditTags}
          placeholder={t.transaction.tagsPlaceholder.toLowerCase()}
          placeholderTextColor={C.textMuted}
          multiline
          textAlignVertical="top"
          returnKeyType="default"
          onFocus={onMultilineFocus}
          onBlur={onMultilineBlur}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={C.accent}
          accessibilityLabel={t.transaction.tagsOptional.toLowerCase()}
        />
      </View>

      {/* #14 — Linked-debt notice with promoted prominence */}
      {isLinkedDebt && (
        <Reanimated.View
          entering={FadeIn.duration(420).delay(260)}
          style={styles.linkedNotice}
        >
          <Feather name="link" size={14} color={C.bronze} />
          <Text style={styles.linkedNoticeText}>{t.transactionList.amountSyncsNotice}</Text>
        </Reanimated.View>
      )}

      {/* #1 — Date picker modal */}
      <Modal
        visible={dateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateModalVisible(false)}
      >
        <Pressable
          style={styles.dateModalOverlay}
          onPress={() => setDateModalVisible(false)}
        >
          <Pressable
            style={styles.dateModalCard}
            onPress={(e) => e.stopPropagation()}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.dateModalHeader}>
              <Text style={styles.dateModalTitle}>{t.editForm.pickDate}</Text>
              <TouchableOpacity
                onPress={() => setDateModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t.editForm.pickDateDone}
              >
                <Text style={styles.dateModalDone}>{t.editForm.pickDateDone}</Text>
              </TouchableOpacity>
            </View>
            <CalendarPicker
              value={isValid(editDate) ? editDate : new Date()}
              onChange={(d) => {
                // Preserve the original time-of-day, only update the calendar day.
                const base = isValid(editDate) ? editDate : new Date();
                const merged = new Date(
                  d.getFullYear(),
                  d.getMonth(),
                  d.getDate(),
                  base.getHours(),
                  base.getMinutes(),
                  base.getSeconds(),
                  base.getMilliseconds(),
                );
                setEditDate(merged);
                setDateModalVisible(false);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    editFieldCardBordered: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.textPrimary, 0.08),
      paddingHorizontal: SPACING.md + 2,
      paddingVertical: SPACING.sm + 4,
      marginBottom: SPACING.sm + 2,
    },
    editFieldCardLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      marginBottom: 4,
      letterSpacing: 0.2,
    },
    editFieldCardInput: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.medium,
      paddingVertical: 2,
      letterSpacing: -0.1,
    },
    editFieldMultiline: {
      minHeight: 44,
      paddingTop: 4,
      paddingBottom: 4,
      lineHeight: 20,
    },
    // #1 — date row
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dateRowPressed: {
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    dateTextWrap: {
      flex: 1,
    },
    dateValueText: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: -0.1,
    },
    // #17 — picker field-card chrome
    pickerFieldCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.textPrimary, 0.08),
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.sm,
      marginBottom: SPACING.sm + 2,
    },
    lockedField: {
      opacity: 0.45,
    },
    lockedFieldText: {
      color: C.textMuted,
    },
    // #14 — linked-debt notice (more present)
    linkedNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      backgroundColor: withAlpha(C.bronze, 0.10),
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.bronze, 0.28),
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 4,
      marginTop: SPACING.sm,
    },
    linkedNoticeText: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.bronze,
      flex: 1,
      letterSpacing: 0.1,
    },
    // #1 — date modal
    dateModalOverlay: {
      flex: 1,
      backgroundColor: withAlpha(C.dimBg, 0.4),
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
    },
    dateModalCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: withAlpha(C.textPrimary, 0.08),
      paddingVertical: SPACING.md,
      ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
    },
    dateModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.sm,
    },
    dateModalTitle: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      letterSpacing: 0.1,
    },
    dateModalDone: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.accent,
      letterSpacing: 0.2,
    },
  });

export default EditFormFields;
