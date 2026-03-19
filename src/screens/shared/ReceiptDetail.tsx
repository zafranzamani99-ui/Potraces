import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReceiptStore } from '../../store/receiptStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { MYTAX_CATEGORIES } from '../../constants/taxCategories';
import { useCalm } from '../../hooks/useCalm';
import { useToast } from '../../context/ToastContext';
import type { RootStackParamList } from '../../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type DetailRoute = RouteProp<RootStackParamList, 'ReceiptDetail'>;

const ReceiptDetail: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<DetailRoute>();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);
  const getPaymentMethods = useSettingsStore((s) => s.getPaymentMethods);
  const receipts = useReceiptStore((s) => s.receipts);
  const deleteReceipt = useReceiptStore((s) => s.deleteReceipt);
  const updateReceipt = useReceiptStore((s) => s.updateReceipt);
  const paymentMethods = useMemo(() => getPaymentMethods(), [getPaymentMethods]);

  const receipt = useMemo(
    () => receipts.find((r) => r.id === route.params.receiptId),
    [receipts, route.params.receiptId]
  );

  const [imageViewVisible, setImageViewVisible] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [taxPickerVisible, setTaxPickerVisible] = useState(false);
  const [paymentPickerVisible, setPaymentPickerVisible] = useState(false);

  if (!receipt) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Feather name="alert-circle" size={48} color={C.textMuted} />
        <Text style={styles.emptyTitle}>receipt not found</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: SPACING.lg, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl, backgroundColor: C.pillBg, borderRadius: RADIUS.full }}
        >
          <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary }}>go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const taxCat = MYTAX_CATEGORIES.find((c) => c.id === receipt.myTaxCategory);
  const paymentMethod = paymentMethods.find((p) => p.id === receipt.paymentMethod);

  const handleDelete = () => {
    Alert.alert(
      'remove receipt?',
      'the linked expense will remain.',
      [
        { text: 'cancel', style: 'cancel' },
        {
          text: 'remove',
          style: 'destructive',
          onPress: () => {
            deleteReceipt(receipt.id);
            showToast('receipt removed', 'success');
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero image ── */}
        {receipt.imageUri && !imageError && (
          <TouchableOpacity
            onPress={() => setImageViewVisible(true)}
            activeOpacity={0.8}
            style={styles.heroImageWrap}
          >
            <Image
              source={{ uri: receipt.imageUri }}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
            <View style={styles.heroImageOverlay}>
              <Feather name="maximize-2" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Details card (hero card pattern) ── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{format(receipt.date, 'dd MMM yyyy')}</Text>
          <Text style={styles.receiptTitle}>{receipt.title}</Text>
          {receipt.vendor && receipt.vendor !== receipt.title && (
            <Text style={styles.vendorName}>{receipt.vendor}</Text>
          )}

          {/* Amount */}
          <Text style={styles.heroAmount}>
            {currency} {receipt.total.toFixed(2)}
          </Text>

          {/* Detail rows — tax relief & payment are tappable to edit */}
          <View style={styles.detailGrid}>
            <DetailRow icon="tag" label="category" value={receipt.category} C={C} />
            <TouchableOpacity onPress={() => setTaxPickerVisible(true)} activeOpacity={0.6}>
              <DetailRow
                icon={(taxCat?.icon || 'file') as any}
                label="tax relief"
                value={taxCat && taxCat.id !== 'none'
                  ? `${taxCat.name}${taxCat.limit ? ` · limit RM ${taxCat.limit.toLocaleString()}` : ''}`
                  : 'none'}
                C={C}
                accent={taxCat?.id !== 'none'}
                editable
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPaymentPickerVisible(true)} activeOpacity={0.6}>
              <DetailRow
                icon={(paymentMethod?.icon || 'credit-card') as any}
                label="payment"
                value={paymentMethod?.name || 'not set'}
                C={C}
                editable
              />
            </TouchableOpacity>
            {receipt.location && (
              <DetailRow icon="map-pin" label="location" value={receipt.location} C={C} />
            )}
          </View>
        </View>

        {/* ── Items card (groupCard pattern) ── */}
        {receipt.items.length > 0 && (
          <View style={styles.groupCard}>
            <View style={styles.itemsHeader}>
              <Text style={styles.itemsHeaderText}>items</Text>
              <Text style={styles.itemsCount}>{receipt.items.length}</Text>
            </View>
            {receipt.items.map((item, i) => (
              <View key={i}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemAmount}>{currency} {item.amount.toFixed(2)}</Text>
                </View>
                {i < receipt.items.length - 1 && <View style={styles.divider} />}
              </View>
            ))}

            {/* Subtotal / Tax / Total */}
            {(receipt.subtotal !== undefined || receipt.tax !== undefined) && (
              <>
                <View style={styles.summaryDivider} />
                {receipt.subtotal !== undefined && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>subtotal</Text>
                    <Text style={styles.summaryValue}>{currency} {receipt.subtotal.toFixed(2)}</Text>
                  </View>
                )}
                {receipt.tax !== undefined && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>tax</Text>
                    <Text style={styles.summaryValue}>{currency} {receipt.tax.toFixed(2)}</Text>
                  </View>
                )}
              </>
            )}
            <View style={styles.summaryDivider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>total</Text>
              <Text style={styles.totalValue}>{currency} {receipt.total.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* ── Delete button ── */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.7}>
          <Feather name="trash-2" size={16} color={C.bronze} />
          <Text style={styles.deleteText}>remove this receipt</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Full-screen image overlay (position: absolute, not Modal) */}
      {imageViewVisible && receipt.imageUri && !imageError && (
        <View style={styles.imageOverlay}>
          <TouchableOpacity
            style={styles.imageOverlayClose}
            onPress={() => setImageViewVisible(false)}
          >
            <Feather name="x" size={28} color="#fff" />
          </TouchableOpacity>
          <Image
            source={{ uri: receipt.imageUri }}
            style={styles.imageOverlayImage}
            resizeMode="contain"
          />
        </View>
      )}

      {/* ── Tax Relief Picker Modal ── */}
      <Modal visible={taxPickerVisible} transparent statusBarTranslucent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setTaxPickerVisible(false)}
        >
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>tax relief category</Text>
            <FlatList
              data={MYTAX_CATEGORIES}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 400 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
              renderItem={({ item: cat }) => {
                const isSelected = cat.id === receipt.myTaxCategory;
                return (
                  <TouchableOpacity
                    style={[styles.modalRow, isSelected && { backgroundColor: withAlpha(C.accent, 0.06) }]}
                    onPress={() => {
                      updateReceipt(receipt.id, { myTaxCategory: cat.id });
                      setTaxPickerVisible(false);
                      showToast('tax relief updated', 'success');
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.modalRowIcon, { backgroundColor: withAlpha(isSelected ? C.accent : C.textSecondary, 0.08) }]}>
                      <Feather name={cat.icon as any} size={14} color={isSelected ? C.accent : C.textSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalRowName, isSelected && { color: C.accent }]}>{cat.name}</Text>
                      {cat.limit !== null && (
                        <Text style={styles.modalRowLimit}>limit RM {cat.limit.toLocaleString()}</Text>
                      )}
                    </View>
                    {isSelected && <Feather name="check" size={16} color={C.accent} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Payment Method Picker Modal ── */}
      <Modal visible={paymentPickerVisible} transparent statusBarTranslucent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setPaymentPickerVisible(false)}
        >
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>payment method</Text>
            <FlatList
              data={paymentMethods}
              keyExtractor={(item) => item.id}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
              renderItem={({ item: pm }) => {
                const isSelected = pm.id === receipt.paymentMethod;
                return (
                  <TouchableOpacity
                    style={[styles.modalRow, isSelected && { backgroundColor: withAlpha(C.accent, 0.06) }]}
                    onPress={() => {
                      updateReceipt(receipt.id, { paymentMethod: pm.id });
                      setPaymentPickerVisible(false);
                      showToast('payment method updated', 'success');
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING.sm }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: withAlpha(pm.color, 0.12), alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name={pm.icon as any} size={14} color={pm.color} />
                      </View>
                      <Text style={[styles.modalRowName, isSelected && { color: C.accent }]}>{pm.name}</Text>
                    </View>
                    {isSelected && <Feather name="check" size={16} color={C.accent} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// Detail row (follows budget expanded-row style)
const DetailRow = ({
  icon,
  label,
  value,
  C,
  accent,
  editable,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  C: typeof CALM;
  accent?: boolean;
  editable?: boolean;
}) => (
  <View style={{
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  }}>
    <View style={{
      width: 28,
      height: 28,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(accent ? C.accent : C.textSecondary, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.md,
    }}>
      <Feather name={icon} size={14} color={accent ? C.accent : C.textSecondary} />
    </View>
    <Text style={{
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      width: 68,
    }}>{label}</Text>
    <Text
      style={{
        fontSize: TYPOGRAPHY.size.sm,
        fontWeight: TYPOGRAPHY.weight.medium,
        color: accent ? C.accent : C.textPrimary,
        flex: 1,
      }}
      numberOfLines={2}
    >
      {value}
    </Text>
    {editable && <Feather name="chevron-right" size={14} color={C.textMuted} />}
  </View>
);

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollContent: {
    padding: SPACING.xl,
  },

  // ── Hero image ──
  heroImageWrap: {
    marginBottom: SPACING.md,
  },
  heroImage: {
    width: '100%',
    height: 200,
    borderRadius: RADIUS.xl,
    backgroundColor: C.surface,
  },
  heroImageOverlay: {
    position: 'absolute',
    bottom: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: RADIUS.sm,
    padding: SPACING.xs,
  },

  // ── Hero card (details) ──
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
    textTransform: 'lowercase',
  },
  receiptTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginBottom: 2,
  },
  vendorName: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.sm,
  },
  heroAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    marginVertical: SPACING.md,
  },
  detailGrid: {
    marginTop: SPACING.xs,
  },

  // ── Group card (items) ──
  groupCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    ...SHADOWS.xs,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  itemsHeaderText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    textTransform: 'lowercase',
  },
  itemsCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  itemName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    flex: 1,
    marginRight: SPACING.md,
  },
  itemAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginLeft: SPACING.md,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  summaryValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  totalLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  totalValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },

  // ── Delete ──
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
  },
  deleteText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Empty ──
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginTop: SPACING.md,
  },

  // ── Full-screen image overlay ──
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  imageOverlayClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 101,
    padding: SPACING.sm,
  },
  imageOverlayImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },

  // ── Picker Modals ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 360,
    ...SHADOWS.lg,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  modalRowIcon: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  modalRowName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  modalRowLimit: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
});

export default ReceiptDetail;
