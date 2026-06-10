import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap, successNotification } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';
import { StallPreOrder, StallProduct } from '../../types';

interface FormItem {
  key: string;
  productId?: string;
  name: string;
  qty: string;
  price: string;
}

const StallPreOrders: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const {
    preOrders, products, addPreOrder, updatePreOrder, deletePreOrder, collectPreOrder, getActiveSession,
  } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const { showToast } = useToast();

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);
  const pending = useMemo(() => preOrders.filter((p) => p.status === 'pending'), [preOrders]);
  const collected = useMemo(() => preOrders.filter((p) => p.status === 'collected'), [preOrders]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [collectAt, setCollectAt] = useState('');
  const [note, setNote] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [payMethod, setPayMethod] = useState<'cash' | 'qr'>('cash');
  const [items, setItems] = useState<FormItem[]>([]);
  const keyRef = useRef(0);
  const nextKey = () => `it${keyRef.current++}`;

  const resetForm = useCallback(() => {
    setName(''); setPhone(''); setCollectAt(''); setNote('');
    setIsPaid(false); setPayMethod('cash'); setItems([]);
    setEditingId(null); setShowForm(false);
  }, []);

  const openAdd = useCallback(() => {
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  const addProductItem = useCallback((product: StallProduct) => {
    lightTap();
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: String((parseInt(i.qty, 10) || 0) + 1) } : i
        );
      }
      return [...prev, { key: nextKey(), productId: product.id, name: product.name, qty: '1', price: String(product.price) }];
    });
  }, []);

  const addCustomItem = useCallback(() => {
    setItems((prev) => [...prev, { key: nextKey(), name: '', qty: '1', price: '' }]);
  }, []);

  const updateItem = useCallback((key: string, patch: Partial<FormItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const formTotal = useMemo(
    () => items.reduce((sum, i) => sum + (parseFloat(i.price) || 0) * (parseInt(i.qty, 10) || 0), 0),
    [items],
  );

  const canSave = name.trim().length > 0 && items.some((i) => i.name.trim() && (parseInt(i.qty, 10) || 0) > 0);

  const handleSave = useCallback(() => {
    const cleanItems = items
      .filter((i) => i.name.trim() && (parseInt(i.qty, 10) || 0) > 0)
      .map((i) => ({
        productId: i.productId,
        name: i.name.trim(),
        quantity: parseInt(i.qty, 10) || 1,
        unitPrice: parseFloat(i.price) || 0,
      }));
    if (!name.trim() || cleanItems.length === 0) return;

    const payload = {
      customerName: name.trim(),
      customerPhone: phone.trim() || undefined,
      items: cleanItems,
      note: note.trim() || undefined,
      collectAt: collectAt.trim() || undefined,
      isPaid,
      paymentMethod: payMethod,
    };
    if (editingId) updatePreOrder(editingId, payload);
    else addPreOrder(payload);
    lightTap();
    resetForm();
  }, [items, name, phone, note, collectAt, isPaid, payMethod, editingId, addPreOrder, updatePreOrder, resetForm]);

  const handleEdit = useCallback((po: StallPreOrder) => {
    setEditingId(po.id);
    setName(po.customerName);
    setPhone(po.customerPhone || '');
    setCollectAt(po.collectAt || '');
    setNote(po.note || '');
    setIsPaid(po.isPaid);
    // Pre-orders are cash/qr only — card is never a pre-order method.
    setPayMethod(po.paymentMethod === 'qr' ? 'qr' : 'cash');
    setItems(po.items.map((i) => ({ key: nextKey(), productId: i.productId, name: i.name, qty: String(i.quantity), price: String(i.unitPrice) })));
    setExpandedId(null);
    setShowForm(true);
  }, []);

  const handleCollect = useCallback((id: string) => {
    if (!getActiveSession()) {
      showToast(t.stall.preOrderNoSession, 'info');
      return;
    }
    const ok = collectPreOrder(id);
    if (ok) {
      successNotification();
      showToast(t.stall.preOrderCollectedToast, 'success');
      setExpandedId(null);
    }
  }, [getActiveSession, collectPreOrder, showToast, t]);

  const handleCancel = useCallback((po: StallPreOrder) => {
    Alert.alert(
      t.stall.preOrderCancelOrder,
      po.customerName,
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.stall.preOrderCancelOrder, style: 'destructive', onPress: () => { deletePreOrder(po.id); setExpandedId(null); } },
      ],
    );
  }, [deletePreOrder, t]);

  const orderTotal = (po: StallPreOrder) =>
    po.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const itemsSummary = (po: StallPreOrder) =>
    po.items.map((i) => `${i.quantity}× ${i.name}`).join(', ');

  // ─── Render a pending/collected card ───────────────────
  const renderCard = (po: StallPreOrder, isCollected: boolean) => {
    const expanded = expandedId === po.id;
    return (
      <View key={po.id} style={[styles.card, isCollected && styles.cardCollected]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => !isCollected && setExpandedId(expanded ? null : po.id)}
          accessibilityRole="button"
          accessibilityLabel={`${po.customerName}, ${currency} ${orderTotal(po).toFixed(2)}, ${po.isPaid ? t.stall.preOrderPaidBadge : t.stall.preOrderUnpaidBadge}`}
        >
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName} numberOfLines={1}>{po.customerName}</Text>
              {!!po.collectAt && (
                <View style={styles.cardTimeRow}>
                  <Feather name="clock" size={12} color={C.textSecondary} />
                  <Text style={styles.cardTime}>{po.collectAt}</Text>
                </View>
              )}
            </View>
            <View style={[styles.payBadge, po.isPaid ? styles.payBadgePaid : styles.payBadgeUnpaid]}>
              <Text style={[styles.payBadgeText, { color: po.isPaid ? C.positive : C.bronze }]}>
                {po.isPaid ? t.stall.preOrderPaidBadge : t.stall.preOrderUnpaidBadge}
              </Text>
            </View>
          </View>
          <Text style={styles.cardItems} numberOfLines={2}>{itemsSummary(po)}</Text>
          <View style={styles.cardBottom}>
            <Text style={styles.cardTotal}>{currency} {orderTotal(po).toFixed(2)}</Text>
            {!isCollected && (
              <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
            )}
          </View>
        </TouchableOpacity>

        {expanded && !isCollected && (
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.collectBtn} onPress={() => handleCollect(po.id)} accessibilityLabel={t.stall.preOrderCollect}>
              <Feather name="check-circle" size={16} color={C.onAccent} />
              <Text style={styles.collectBtnText}>{t.stall.preOrderCollect}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleEdit(po)} accessibilityLabel={t.stall.preOrderEdit}>
              <Feather name="edit-2" size={15} color={C.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleCancel(po)} accessibilityLabel={t.stall.preOrderCancelOrder}>
              <Feather name="trash-2" size={15} color={C.bronze} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>{t.stall.preOrdersHeading}</Text>
              <Text style={styles.subheading}>
                {t.stall.preOrdersSub}{pending.length > 0 ? ` · ${t.stall.nToCollect.replace('{n}', String(pending.length))}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.addToggle}
              onPress={() => (showForm ? resetForm() : openAdd())}
              accessibilityRole="button"
              accessibilityLabel={showForm ? t.common.cancel : t.stall.preOrderAdd}
            >
              <Feather name={showForm ? 'x' : 'plus'} size={20} color={C.bronze} />
            </TouchableOpacity>
          </View>

          {/* Add / edit form */}
          {showForm && (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={t.stall.preOrderName}
                placeholderTextColor={C.neutral}
                autoFocus
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder={t.stall.preOrderPhone}
                placeholderTextColor={C.neutral}
                keyboardType="phone-pad"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
              <TextInput
                style={styles.input}
                value={collectAt}
                onChangeText={setCollectAt}
                placeholder={t.stall.preOrderCollectAt}
                placeholderTextColor={C.neutral}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />

              {/* Quick-add product chips */}
              {activeProducts.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>{t.stall.preOrderAddProducts}</Text>
                  <View style={styles.chipsWrap}>
                    {activeProducts.map((p) => (
                      <TouchableOpacity key={p.id} style={styles.productChip} onPress={() => addProductItem(p)} accessibilityLabel={`Add ${p.name}`}>
                        <Feather name="plus" size={12} color={C.bronze} />
                        <Text style={styles.productChipText} numberOfLines={1}>{p.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Item rows */}
              {items.length > 0 && (
                <View style={styles.itemsBlock}>
                  <Text style={styles.fieldLabel}>{t.stall.preOrderItemsLabel}</Text>
                  {items.map((it) => (
                    <View key={it.key} style={styles.itemRow}>
                      <TextInput
                        style={styles.itemName}
                        value={it.name}
                        onChangeText={(v) => updateItem(it.key, { name: v })}
                        placeholder={t.stall.preOrderItemName}
                        placeholderTextColor={C.neutral}
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                      />
                      <View style={styles.qtyStepper}>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => updateItem(it.key, { qty: String(Math.max(1, (parseInt(it.qty, 10) || 1) - 1)) })}>
                          <Feather name="minus" size={13} color={C.textPrimary} />
                        </TouchableOpacity>
                        <Text style={styles.qtyText}>{it.qty || '1'}</Text>
                        <TouchableOpacity style={styles.qtyBtn} onPress={() => updateItem(it.key, { qty: String((parseInt(it.qty, 10) || 0) + 1) })}>
                          <Feather name="plus" size={13} color={C.textPrimary} />
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={styles.itemPrice}
                        value={it.price}
                        onChangeText={(v) => updateItem(it.key, { price: v.replace(/[^0-9.]/g, '') })}
                        placeholder="0.00"
                        placeholderTextColor={C.neutral}
                        keyboardType="decimal-pad"
                        keyboardAppearance={isDark ? 'dark' : 'light'}
                        selectionColor={C.accent}
                      />
                      <TouchableOpacity onPress={() => removeItem(it.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Remove item">
                        <Feather name="x" size={16} color={C.neutral} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity style={styles.addItemLink} onPress={addCustomItem} accessibilityLabel={t.stall.preOrderAddCustomItem}>
                <Text style={styles.addItemLinkText}>{t.stall.preOrderAddCustomItem}</Text>
              </TouchableOpacity>

              {/* Paid toggle + method */}
              <View style={styles.paidRow}>
                <TouchableOpacity style={styles.paidToggle} onPress={() => setIsPaid((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: isPaid }}>
                  <Feather name={isPaid ? 'check-square' : 'square'} size={18} color={isPaid ? C.bronze : C.textSecondary} />
                  <Text style={styles.paidText}>{t.stall.preOrderPaid}</Text>
                </TouchableOpacity>
                <View style={styles.methodToggle}>
                  <TouchableOpacity style={[styles.methodBtn, payMethod === 'cash' && styles.methodActive]} onPress={() => setPayMethod('cash')}>
                    <Text style={[styles.methodText, payMethod === 'cash' && styles.methodTextActive]}>{t.stall.cashPrefix}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.methodBtn, payMethod === 'qr' && styles.methodActive]} onPress={() => setPayMethod('qr')}>
                    <Text style={[styles.methodText, payMethod === 'qr' && styles.methodTextActive]}>{t.stall.qrPrefix}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder={t.stall.preOrderNotePlaceholder}
                placeholderTextColor={C.neutral}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />

              <View style={styles.formFooter}>
                <Text style={styles.formTotalText}>{t.stall.preOrderTotalLabel}: {currency} {formTotal.toFixed(2)}</Text>
                <TouchableOpacity
                  style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={!canSave}
                  accessibilityLabel={t.stall.preOrderSave}
                >
                  <Text style={styles.saveBtnText}>{t.stall.preOrderSave}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Pending */}
          {pending.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t.stall.preOrderToCollect}</Text>
              {pending.map((po) => renderCard(po, false))}
            </View>
          )}

          {/* Collected */}
          {collected.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t.stall.preOrderCollectedHeading}</Text>
              {collected.slice(0, 20).map((po) => renderCard(po, true))}
            </View>
          )}

          {/* Empty */}
          {pending.length === 0 && collected.length === 0 && !showForm && (
            <View style={styles.empty}>
              <Feather name="clipboard" size={40} color={C.border} />
              <Text style={styles.emptyTitle}>{t.stall.preOrderEmpty}</Text>
              <Text style={styles.emptyHint}>{t.stall.preOrderEmptyHint}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scroll: { flex: 1 },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING['4xl'],
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  heading: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  subheading: { ...TYPE.muted, color: C.textSecondary, marginTop: SPACING.xs },
  addToggle: {
    width: 44, height: 44, borderRadius: RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: withAlpha(C.bronze, 0.10),
  },

  // Form
  form: {
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.xl, gap: SPACING.md,
  },
  input: {
    backgroundColor: C.background, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
    fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, minHeight: 48,
  },
  fieldLabel: { ...TYPE.muted, color: C.textSecondary },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  productChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderColor: withAlpha(C.bronze, 0.3), backgroundColor: withAlpha(C.bronze, 0.06),
    borderRadius: RADIUS.full, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md,
    maxWidth: 160,
  },
  productChipText: { fontSize: TYPOGRAPHY.size.sm, color: C.bronze, fontWeight: TYPOGRAPHY.weight.medium, flexShrink: 1 },
  itemsBlock: { gap: SPACING.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  itemName: {
    flex: 1, backgroundColor: C.background, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.md, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, minHeight: 40,
  },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  qtyBtn: {
    width: 28, height: 28, borderRadius: RADIUS.full, backgroundColor: C.background,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border,
  },
  qtyText: {
    minWidth: 22, textAlign: 'center', fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary, fontVariant: ['tabular-nums'],
  },
  itemPrice: {
    width: 64, backgroundColor: C.background, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.md, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm,
    fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, textAlign: 'right', fontVariant: ['tabular-nums'], minHeight: 40,
  },
  addItemLink: { paddingVertical: SPACING.xs },
  addItemLinkText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.bronze },
  paidRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paidToggle: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  paidText: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
  methodToggle: {
    flexDirection: 'row', borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.md, overflow: 'hidden',
  },
  methodBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, minHeight: 32, justifyContent: 'center' },
  methodActive: { backgroundColor: C.bronze },
  methodText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary },
  methodTextActive: { color: C.onAccent },
  formFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.xs },
  formTotalText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary, fontVariant: ['tabular-nums'] },
  saveBtn: { backgroundColor: C.bronze, borderRadius: RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, minHeight: 44, justifyContent: 'center' },
  saveBtnDisabled: { backgroundColor: C.border },
  saveBtnText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.onAccent },

  // Sections + cards
  section: { marginTop: SPACING.lg, gap: SPACING.sm },
  sectionLabel: { ...TYPE.label, marginBottom: SPACING.xs },
  card: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: RADIUS.lg, padding: SPACING.lg,
  },
  cardCollected: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  cardName: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
  cardTimeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 2 },
  cardTime: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
  payBadge: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 2 },
  payBadgePaid: { backgroundColor: withAlpha(C.positive, 0.12) },
  payBadgeUnpaid: { backgroundColor: withAlpha(C.bronze, 0.12) },
  payBadgeText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold },
  cardItems: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, marginTop: SPACING.sm },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md },
  cardTotal: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, fontVariant: ['tabular-nums'] },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.lg, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: C.border },
  collectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: C.bronze, borderRadius: RADIUS.md, paddingVertical: SPACING.md, minHeight: 44,
  },
  collectBtnText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.onAccent },
  secondaryBtn: {
    width: 44, height: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Empty
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING['4xl'], gap: SPACING.md },
  emptyTitle: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.medium, color: C.textSecondary },
  emptyHint: { ...TYPE.muted, textAlign: 'center' },
});

export default StallPreOrders;
