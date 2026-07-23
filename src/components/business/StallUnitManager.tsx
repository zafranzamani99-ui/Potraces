import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import FloatingModal from '../common/FloatingModal';
import { newstOutline } from './NewstInput';
import { useNeu } from '../common/neu';
import { useStallStore } from '../../store/stallStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';

/**
 * Stall-owned product-unit manager. A lightweight FloatingModal listing the stall's
 * own `units` (separate from seller's UnitManager) with a delete on each, plus a
 * text field + add button. Opened from Business Settings → "Manage units" when the
 * business is a stall. Onyx: borderless C.background card, neu rows, bronze CTA.
 */
interface StallUnitManagerProps {
  visible: boolean;
  onClose: () => void;
}

const StallUnitManager: React.FC<StallUnitManagerProps> = ({ visible, onClose }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const units = useStallStore((s) => s.units);
  const addUnit = useStallStore((s) => s.addUnit);
  const removeUnit = useStallStore((s) => s.removeUnit);

  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const handleAdd = () => {
    const clean = draft.trim();
    if (!clean) return;
    addUnit(clean);
    setDraft('');
    Keyboard.dismiss();
  };

  return (
    <FloatingModal
      visible={visible}
      onClose={onClose}
      entrance="fade"
      showDragHandle={false}
      maxWidth={360}
    >
      <View style={styles.body}>
        <View style={styles.header}>
          <Text style={styles.title}>{t.stall.manageUnitsTitle}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t.common.close}
          >
            <Feather name="x" size={20} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.list}>
          {units.map((u) => (
            <View key={u} style={[styles.row, neu.raised]}>
              <View style={styles.rowIcon}>
                <Feather name="box" size={16} color={C.bronze} />
              </View>
              <Text style={styles.rowText}>{u}</Text>
              <TouchableOpacity
                onPress={() => removeUnit(u)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`${t.common.close} ${u}`}
              >
                <Feather name="x" size={16} color={C.neutral} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, newstOutline(C, focused)]}
            value={draft}
            onChangeText={setDraft}
            placeholder={t.stall.addUnitPlaceholder}
            placeholderTextColor={C.neutral}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={handleAdd}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={withAlpha(C.textPrimary, 0.2)}
          />
          <TouchableOpacity
            style={styles.addBtn}
            onPress={handleAdd}
            accessibilityRole="button"
            accessibilityLabel={t.stall.addUnitBtn}
          >
            <Feather name="plus" size={20} color={C.onAccent} />
          </TouchableOpacity>
        </View>
      </View>
    </FloatingModal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    body: {
      padding: SPACING.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    title: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    list: {
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      minHeight: 48,
    },
    rowIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: withAlpha(C.bronze, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textPrimary,
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    input: {
      flex: 1,
      minHeight: 52,
      paddingHorizontal: SPACING.lg,
      fontSize: 16,
      color: C.textPrimary,
    },
    addBtn: {
      width: 52,
      height: 52,
      borderRadius: RADIUS.lg,
      backgroundColor: C.bronze,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default StallUnitManager;
