import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, Alert } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { useSellerStore } from '../../store/sellerStore';
import { useToast } from '../../context/ToastContext';
import { SellerCostCategory } from '../../types';
import { lightTap, successNotification } from '../../services/haptics';

const ICON_CHOICES = [
  'box', 'package', 'tool', 'zap', 'home', 'truck', 'speaker', 'credit-card',
  'users', 'shopping-bag', 'shopping-cart', 'coffee', 'droplet', 'wifi',
  'phone', 'printer', 'scissors', 'gift', 'briefcase', 'dollar-sign',
  'file-text', 'tag', 'clipboard', 'more-horizontal',
];

const COLOR_CHOICES = [
  '#8B7355', '#DEAB22', '#5E72E4', '#6BA3BE', '#A06CD5', '#2E7A9A',
  '#C4956A', '#7C5CFC', '#4F5104', '#6B7596', '#9B6A3A', '#B2780A',
];

interface Props {
  selected?: string;
  onSelect: (id: string) => void;
}

const CostCategoryPicker: React.FC<Props> = ({ selected, onSelect }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const sl = t.seller;
  const lang = useSettingsStore((s) => s.language);
  const categories = useSellerStore((s) => s.costCategories);
  const addCostCategory = useSellerStore((s) => s.addCostCategory);
  const updateCostCategory = useSellerStore((s) => s.updateCostCategory);
  const deleteCostCategory = useSellerStore((s) => s.deleteCostCategory);
  const { showToast } = useToast();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [editing, setEditing] = useState<SellerCostCategory | null>(null);
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState(ICON_CHOICES[0]);
  const [formColor, setFormColor] = useState(COLOR_CHOICES[0]);
  const [formOpen, setFormOpen] = useState(false);

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  const label = (c: SellerCostCategory) => (lang === 'ms' ? c.nameBm : c.name);

  const openAdd = () => {
    setEditing(null);
    setFormName('');
    setFormIcon(ICON_CHOICES[0]);
    setFormColor(COLOR_CHOICES[0]);
    setFormOpen(true);
  };

  const openEdit = (c: SellerCostCategory) => {
    setEditing(c);
    setFormName(c.name);
    setFormIcon(c.icon);
    setFormColor(c.color);
    setFormOpen(true);
  };

  const saveForm = () => {
    const name = formName.trim();
    if (!name) return;
    if (editing) {
      updateCostCategory(editing.id, { name, nameBm: name, icon: formIcon, color: formColor });
      showToast(sl.categoryUpdated, 'success');
    } else {
      addCostCategory({ name, nameBm: name, icon: formIcon, color: formColor });
      showToast(sl.categoryAdded, 'success');
    }
    successNotification();
    setFormOpen(false);
  };

  const confirmDelete = (c: SellerCostCategory) => {
    if (c.isProtected) {
      showToast(sl.cannotDeleteCategory, 'error');
      return;
    }
    Alert.alert(
      sl.deleteCategoryTitle,
      sl.deleteCategoryMsg.replace('{name}', label(c)),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => {
            deleteCostCategory(c.id);
            if (selected === c.id) onSelect('costcat_other');
            showToast(sl.categoryDeleted, 'success');
          },
        },
      ],
    );
  };

  const current = sorted.find((c) => c.id === selected) ?? sorted[0];

  return (
    <View>
      <Text style={styles.label}>{sl.categoryLabel}</Text>

      {/* Dropdown trigger — shows current pick, opens the full list */}
      <Pressable
        onPress={() => { lightTap(); setPickerOpen(true); }}
        style={styles.trigger}
        accessibilityRole="button"
        accessibilityLabel={`${sl.categoryLabel}: ${current ? label(current) : ''}`}
      >
        <View style={styles.triggerSelected}>
          {current && (
            <View style={[styles.triggerIcon, { backgroundColor: withAlpha(current.color, 0.15) }]}>
              <Feather name={current.icon as any} size={18} color={current.color} />
            </View>
          )}
          <Text style={styles.triggerText} numberOfLines={1}>{current ? label(current) : ''}</Text>
        </View>
        <Feather name="chevron-down" size={20} color={C.textSecondary} />
      </Pressable>

      {/* Selection list */}
      <Modal visible={pickerOpen} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.dropdownOverlay} onPress={() => setPickerOpen(false)}>
          <View style={styles.dropdownModal} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>{sl.categoryLabel}</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}>
                <Feather name="x" size={22} color={C.textPrimary} />
              </Pressable>
            </View>
            <ScrollView style={styles.dropdownList} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {sorted.map((c) => {
                const active = selected === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => { lightTap(); onSelect(c.id); setPickerOpen(false); }}
                    style={[styles.dropdownItem, active && { backgroundColor: withAlpha(c.color, 0.1) }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <View style={[styles.dropdownItemIcon, { backgroundColor: active ? c.color : withAlpha(c.color, 0.15) }]}>
                      <Feather name={c.icon as any} size={18} color={active ? C.onAccent : c.color} />
                    </View>
                    <Text style={[styles.dropdownItemText, active && { color: c.color, fontWeight: TYPOGRAPHY.weight.bold }]} numberOfLines={1}>
                      {label(c)}
                    </Text>
                    {active && <Feather name="check" size={18} color={c.color} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => { lightTap(); setPickerOpen(false); setManagerOpen(true); }}
              style={styles.dropdownFooter}
              accessibilityRole="button"
              accessibilityLabel={sl.manageCategories}
            >
              <Feather name="settings" size={14} color={C.bronze} />
              <Text style={styles.dropdownFooterText}>{sl.manageCategories}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Manager modal */}
      <Modal visible={managerOpen} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setManagerOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setManagerOpen(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{sl.categoryLabel}</Text>
              <Pressable onPress={() => setManagerOpen(false)} hitSlop={10}>
                <Feather name="x" size={18} color={C.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.managerList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {sorted.map((c) => (
                <View key={c.id} style={styles.managerRow}>
                  <View style={[styles.managerIcon, { backgroundColor: withAlpha(c.color, 0.12) }]}>
                    <Feather name={c.icon as any} size={15} color={c.color} />
                  </View>
                  <Text style={styles.managerName} numberOfLines={1}>{label(c)}</Text>
                  <Pressable onPress={() => openEdit(c)} hitSlop={8} style={styles.managerAction} accessibilityLabel={sl.editCostCategory}>
                    <Feather name="edit-2" size={15} color={C.textSecondary} />
                  </Pressable>
                  {!c.isProtected && (
                    <Pressable onPress={() => confirmDelete(c)} hitSlop={8} style={styles.managerAction} accessibilityLabel={t.common.delete}>
                      <Feather name="trash-2" size={15} color={C.textMuted} />
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={openAdd} style={styles.addRow} accessibilityRole="button" accessibilityLabel={sl.addCostCategory}>
              <Feather name="plus" size={16} color={C.bronze} />
              <Text style={styles.addRowText}>{sl.addCostCategory}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Add/edit form modal */}
      <Modal visible={formOpen} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setFormOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setFormOpen(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editing ? sl.editCostCategory : sl.addCostCategory}</Text>
              <Pressable onPress={() => setFormOpen(false)} hitSlop={10}>
                <Feather name="x" size={18} color={C.textMuted} />
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              value={formName}
              onChangeText={setFormName}
              placeholder={sl.categoryNamePlaceholder}
              placeholderTextColor={C.textMuted}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.bronze}
              autoFocus
            />
            <ScrollView style={styles.iconGrid} contentContainerStyle={styles.gridContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <View style={styles.gridRow}>
                {ICON_CHOICES.map((ic) => (
                  <Pressable
                    key={ic}
                    onPress={() => { lightTap(); setFormIcon(ic); }}
                    style={[styles.gridIcon, formIcon === ic && { borderColor: formColor, backgroundColor: withAlpha(formColor, 0.1) }]}
                  >
                    <Feather name={ic as any} size={16} color={formIcon === ic ? formColor : C.textSecondary} />
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <View style={styles.colorRow}>
              {COLOR_CHOICES.map((col) => (
                <Pressable
                  key={col}
                  onPress={() => { lightTap(); setFormColor(col); }}
                  style={[styles.colorDot, { backgroundColor: col }, formColor === col && styles.colorDotActive]}
                />
              ))}
            </View>
            <Pressable onPress={saveForm} style={styles.saveBtn} accessibilityRole="button" accessibilityLabel={t.common.save}>
              <Text style={styles.saveBtnText}>{t.common.save}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  label: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  triggerSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  triggerIcon: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  triggerText: { flex: 1, fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.medium, color: C.textPrimary },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  dropdownModal: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    maxHeight: '60%',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  dropdownTitle: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary },
  dropdownList: {},
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  dropdownItemIcon: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  dropdownItemText: { flex: 1, fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.medium, color: C.textPrimary },
  dropdownFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  dropdownFooterText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: C.bronze },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  sheet: {
    width: '90%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING['2xl'],
    gap: SPACING.lg,
    ...SHADOWS.lg,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
  managerList: { maxHeight: 280 },
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  managerIcon: { width: 34, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  managerName: { flex: 1, fontSize: TYPOGRAPHY.size.base, color: C.textPrimary },
  managerAction: { padding: SPACING.xs },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.4),
    borderStyle: 'dashed',
  },
  addRowText: { fontSize: TYPOGRAPHY.size.base, color: C.bronze, fontWeight: TYPOGRAPHY.weight.medium },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    backgroundColor: C.background,
  },
  iconGrid: { maxHeight: 120 },
  gridContent: {},
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  gridIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  colorDot: { width: 32, height: 32, borderRadius: RADIUS.full },
  colorDotActive: { borderWidth: 3, borderColor: C.surface, ...SHADOWS.sm },
  saveBtn: {
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: C.accent,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.onAccent },
});

export default CostCategoryPicker;
