import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, BIZ_SAFE, semantic, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useNeu } from '../common/neu';
import NeuButton from '../common/NeuButton';
import { useT } from '../../i18n';

interface SelectionActionBarProps {
  count: number;
  allArchived: boolean;
  onCancel: () => void;
  onSelectAll: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

const SelectionActionBar: React.FC<SelectionActionBarProps> = ({ count, allArchived, onCancel, onSelectAll, onEdit, onArchive, onDelete }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const neu = useNeu(undefined, { faintDark: true });              // base = C.background — bar + tiles all sit on the C.background bar
  const t = useT();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const destructiveC = semantic(BIZ_SAFE.destructive, isDark);   // terracotta

  return (
    <View style={[styles.selectionBar, neu.raisedSoft, { backgroundColor: C.background }]}>
      <View style={styles.selectionBarTop}>
        <TouchableOpacity onPress={onCancel} style={styles.selectionBarBtn}>
          <Feather name="x" size={18} color={C.textPrimary} />
          <Text style={styles.selectionBarBtnText}>{t.common.cancel}</Text>
        </TouchableOpacity>
        <Text style={styles.selectionBarCount}>{count} {t.debts.selected}</Text>
        <TouchableOpacity onPress={onSelectAll} style={styles.selectionBarBtn}>
          <Feather name="check-square" size={18} color={C.accent} />
          <Text style={[styles.selectionBarBtnText, { color: C.accent }]}>{t.common.all}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.selectionBarActions}>
        {count === 1 && (
          <TouchableOpacity style={[styles.selectionEditBtn, neu.raised, { backgroundColor: withAlpha(C.accent, 0.1) }]} onPress={onEdit} activeOpacity={0.7}>
            <Feather name="edit-2" size={18} color={C.accent} />
            <Text style={styles.selectionEditText}>{t.common.edit}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.selectionEditBtn, neu.raised, { backgroundColor: withAlpha(C.accent, 0.1) }]} onPress={onArchive} activeOpacity={0.7}>
          <Feather name={allArchived ? 'corner-up-left' : 'archive'} size={18} color={C.bronze} />
          <Text style={[styles.selectionEditText, { color: C.bronze }]}>{allArchived ? t.debts.unarchive : t.debts.archive}</Text>
        </TouchableOpacity>
        <View style={styles.selectionDeleteBtn}>
          <NeuButton
            onPress={onDelete}
            color={destructiveC}
            icon="trash-2"
            label={`${t.common.delete} (${count})`}
          />
        </View>
      </View>
    </View>
  );
};

const makeStyles = (C: typeof CALM, isDark: boolean) => {
  return StyleSheet.create({
    selectionBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: C.background,
      borderTopWidth: 2,
      borderTopColor: C.accent,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING['3xl'],
    },
    selectionBarTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    selectionBarBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    selectionBarBtnText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    selectionBarCount: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.accent,
    },
    selectionBarActions: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    selectionEditBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
      backgroundColor: withAlpha(C.accent, 0.1),
      borderRadius: RADIUS.md,
    },
    selectionEditText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.accent,
    },
    selectionDeleteBtn: {
      flex: 1,
    },
  });
};

export default React.memo(SelectionActionBar);
