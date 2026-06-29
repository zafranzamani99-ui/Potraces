import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, BIZ_SAFE, semantic, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
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
  const t = useT();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);

  return (
    <View style={styles.selectionBar}>
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
          <TouchableOpacity style={styles.selectionEditBtn} onPress={onEdit} activeOpacity={0.7}>
            <Feather name="edit-2" size={18} color={C.accent} />
            <Text style={styles.selectionEditText}>{t.common.edit}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.selectionEditBtn} onPress={onArchive} activeOpacity={0.7}>
          <Feather name={allArchived ? 'corner-up-left' : 'archive'} size={18} color={C.bronze} />
          <Text style={[styles.selectionEditText, { color: C.bronze }]}>{allArchived ? 'unarchive' : 'archive'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.selectionDeleteBtn, { flex: 1 }]} onPress={onDelete} activeOpacity={0.7}>
          <Feather name="trash-2" size={18} color={C.onAccent} />
          <Text style={styles.selectionDeleteText}>{t.common.delete} ({count})</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (C: typeof CALM, isDark: boolean) => {
  const destructiveC = semantic(BIZ_SAFE.destructive, isDark);    // terracotta
  return StyleSheet.create({
    selectionBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: C.surface,
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
      borderWidth: 1,
      borderColor: C.accent,
    },
    selectionEditText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.accent,
    },
    selectionDeleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
      backgroundColor: withAlpha(destructiveC, 0.9),
      borderRadius: RADIUS.md,
    },
    selectionDeleteText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.onAccent,
    },
  });
};

export default React.memo(SelectionActionBar);
