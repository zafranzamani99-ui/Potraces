import React, { useState, useMemo, useRef } from 'react';
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
import ViewShot from 'react-native-view-shot';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path as SvgPath, Rect as SvgRect } from 'react-native-svg';
import { useReceiptStore } from '../../store/receiptStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useWalletStore } from '../../store/walletStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { MYTAX_CATEGORIES } from '../../constants/taxCategories';
import { exportSingleReceiptPdf } from '../../services/pdfExport';
import { shareCapturedReceipt } from '../../services/receiptImageExport';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useToast } from '../../context/ToastContext';
import ModalToastHost from '../../components/common/ModalToastHost';
import type { RootStackParamList } from '../../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const RECEIPT_W = 360;
const TEAR_H = 16;
const TEAR_PATH = 'M0,6 Q6,0 12,9 Q18,14 24,4 Q30,1 36,10 Q42,15 48,5 Q54,0 60,8 Q66,13 72,3 Q78,0 84,10 Q90,16 96,4 Q102,1 108,9 Q114,14 120,3 Q126,0 132,8 Q138,12 144,5 Q150,0 156,10 Q162,15 168,4 Q174,1 180,9 Q186,14 192,3 Q198,0 204,8 Q210,13 216,5 Q222,0 228,10 Q234,16 240,4 Q246,1 252,8 Q258,13 264,5 Q270,0 276,9 Q282,16 288,4 Q294,0 300,7 Q306,14 312,5 Q318,1 324,9 Q330,14 336,4 Q342,0 348,8 Q354,13 360,6 L360,16 L0,16 Z';

type DetailRoute = RouteProp<RootStackParamList, 'ReceiptDetail'>;

const ReceiptDetail: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<DetailRoute>();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);
  const receipts = useReceiptStore((s) => s.receipts);
  const deleteReceipt = useReceiptStore((s) => s.deleteReceipt);
  const updateReceipt = useReceiptStore((s) => s.updateReceipt);
  const wallets = useWalletStore((s) => s.wallets);

  const receipt = useMemo(
    () => receipts.find((r) => r.id === route.params.receiptId),
    [receipts, route.params.receiptId]
  );

  const [imageViewVisible, setImageViewVisible] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [taxPickerVisible, setTaxPickerVisible] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const [hideWalletInShare, setHideWalletInShare] = useState(false);
  const captureRef = useRef<ViewShot>(null);

  if (!receipt) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Feather name="alert-circle" size={48} color={C.textMuted} />
        <Text style={styles.emptyTitle}>{t.receiptDetail.notFound}</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: SPACING.lg, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl, backgroundColor: C.pillBg, borderRadius: RADIUS.full }}
        >
          <Text style={{ fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary }}>{t.receiptDetail.goBack}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const taxCat = MYTAX_CATEGORIES.find((c) => c.id === receipt.myTaxCategory);
  const wallet = wallets.find((w) => w.id === receipt.walletId);

  const handleShare = async () => {
    try {
      const categoryNames = Object.fromEntries(MYTAX_CATEGORIES.map((c) => [c.id, c.name]));
      await exportSingleReceiptPdf({ receipt, currency, categoryNames, walletName: wallet?.name, hideWallet: hideWalletInShare });
    } catch (err: any) {
      Alert.alert(t.receiptDetail.shareFailed, err?.message || t.receiptDetail.shareFailedMsg);
    }
  };

  const handleShareAsImage = async () => {
    if (sharingImage) return;
    setSharingImage(true);
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      await shareCapturedReceipt(captureRef, receipt.title || 'receipt');
    } catch (err: any) {
      Alert.alert(t.receiptDetail.shareFailed, err?.message || t.receiptDetail.shareFailedMsg);
    } finally {
      setSharingImage(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t.receiptDetail.removeReceiptTitle,
      t.receiptDetail.removeReceiptMsg,
      [
        { text: t.receiptDetail.cancel, style: 'cancel' },
        {
          text: t.receiptDetail.remove,
          style: 'destructive',
          onPress: () => {
            deleteReceipt(receipt.id);
            showToast(t.receiptDetail.receiptRemoved, 'success');
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
            <DetailRow icon="tag" label={t.receiptDetail.category} value={receipt.category} C={C} />
            <TouchableOpacity onPress={() => setTaxPickerVisible(true)} activeOpacity={0.6}>
              <DetailRow
                icon={(taxCat?.icon || 'file') as keyof typeof Feather.glyphMap}
                label={t.receiptDetail.taxRelief}
                value={taxCat && taxCat.id !== 'none'
                  ? `${taxCat.name}${taxCat.limit ? ` · ${t.receiptDetail.limitPrefix} ${taxCat.limit.toLocaleString()}` : ''}`
                  : t.receiptDetail.none}
                C={C}
                accent={taxCat?.id !== 'none'}
                editable
              />
            </TouchableOpacity>
            {wallet && (
              <DetailRow icon="credit-card" label={t.receiptDetail.payment} value={wallet.name} C={C} />
            )}
            {receipt.location && (
              <DetailRow icon="map-pin" label={t.receiptDetail.location} value={receipt.location} C={C} />
            )}
          </View>
        </View>

        {/* ── Items card (groupCard pattern) ── */}
        {receipt.items.length > 0 && (
          <View style={styles.groupCard}>
            <View style={styles.itemsHeader}>
              <Text style={styles.itemsHeaderText}>{t.receiptDetail.items}</Text>
              <Text style={styles.itemsCount}>{receipt.items.length}</Text>
            </View>
            {receipt.items.map((item, i) => (
              <View key={i}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>{item.name}</Text>
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
                    <Text style={styles.summaryLabel}>{t.receiptDetail.subtotal}</Text>
                    <Text style={styles.summaryValue}>{currency} {receipt.subtotal.toFixed(2)}</Text>
                  </View>
                )}
                {receipt.tax !== undefined && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{t.receiptDetail.tax}</Text>
                    <Text style={styles.summaryValue}>{currency} {receipt.tax.toFixed(2)}</Text>
                  </View>
                )}
              </>
            )}
            <View style={styles.summaryDivider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t.receiptDetail.total}</Text>
              <Text style={styles.totalValue}>{currency} {receipt.total.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* ── Action buttons ── */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShareAsImage} activeOpacity={0.7} disabled={sharingImage}>
            <View style={[styles.actionIconCircle, { backgroundColor: withAlpha(C.accent, 0.08) }]}>
              <Feather name="image" size={16} color={C.accent} />
            </View>
            <Text style={[styles.actionBtnText, { color: C.accent }]}>{sharingImage ? t.receiptDetail.sharing : t.receiptDetail.shareAsImage}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.7}>
            <View style={[styles.actionIconCircle, { backgroundColor: withAlpha(C.accent, 0.08) }]}>
              <Feather name="file-text" size={16} color={C.accent} />
            </View>
            <Text style={[styles.actionBtnText, { color: C.accent }]}>{t.receiptDetail.shareAsPdf}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Hide wallet toggle ── */}
        {wallet && (
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setHideWalletInShare(!hideWalletInShare)}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityState={{ checked: hideWalletInShare }}
          >
            <Text style={styles.toggleLabel}>hide wallet when sharing</Text>
            <View style={[
              styles.toggleTrack,
              hideWalletInShare && { backgroundColor: C.accent },
            ]}>
              <View style={[
                styles.toggleThumb,
                hideWalletInShare && { transform: [{ translateX: 18 }] },
              ]} />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Delete ── */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.7}>
          <Feather name="trash-2" size={14} color={C.bronze} />
          <Text style={styles.deleteText}>{t.receiptDetail.removeThisReceipt}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ══ Off-screen share capture ══ */}
      <View pointerEvents="none" style={styles.capOuter} collapsable={false}>
      <ViewShot
        ref={captureRef}
        options={{ format: 'png', quality: 1, useRenderInContext: true }}
        style={styles.capCard}
      >
        {/* Thermal paper lines */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={RECEIPT_W} height={800}>
            {Array.from({ length: 160 }, (_, i) => (
              <SvgRect
                key={i}
                x={0}
                y={i * 4.5 + 4}
                width={RECEIPT_W}
                height={0.5}
                fill={i % 3 === 0 ? 'rgba(0,0,0,0.045)' : 'rgba(0,0,0,0.025)'}
              />
            ))}
          </Svg>
        </View>
        {/* Hero */}
        <View style={styles.capHero}>
          <Text style={styles.capVendor}>{receipt.vendor ?? receipt.title}</Text>
          <Text style={styles.capAmount}>
            <Text style={styles.capCurrency}>{currency}</Text>
            {' '}{receipt.total.toFixed(2)}
          </Text>
          <Text style={styles.capDate}>{format(receipt.date, 'd MMM yyyy')}</Text>
        </View>

        <View style={styles.capDivider} />

        {/* Details */}
        <View style={styles.capDetails}>
          {receipt.category && (
            <View style={styles.capDetailRow}>
              <Text style={styles.capDetailLabel}>Category</Text>
              <Text style={styles.capDetailValue}>{receipt.category}</Text>
            </View>
          )}
          {taxCat && taxCat.id !== 'none' && (
            <View style={styles.capDetailRow}>
              <Text style={styles.capDetailLabel}>Tax relief</Text>
              <Text style={[styles.capDetailValue, { color: '#4F5104', fontWeight: '600' }]}>{taxCat.name}</Text>
            </View>
          )}
          {wallet && !hideWalletInShare && (
            <View style={styles.capDetailRow}>
              <Text style={styles.capDetailLabel}>Paid from</Text>
              <Text style={styles.capDetailValue}>{wallet.name}</Text>
            </View>
          )}
          {receipt.location && (
            <View style={styles.capDetailRow}>
              <Text style={styles.capDetailLabel}>Location</Text>
              <Text style={styles.capDetailValue}>{receipt.location}</Text>
            </View>
          )}
        </View>

        {receipt.items.length > 0 && (
          <>
            <View style={styles.capDivider} />

            <View style={styles.capItems}>
              <Text style={styles.capSectionLabel}>Items · {receipt.items.length}</Text>
              {receipt.items.map((item, i) => (
                <View key={i}>
                  <View style={styles.capItemRow}>
                    <Text style={styles.capItemNum}>{i + 1}</Text>
                    <Text style={styles.capItemName}>{item.name}</Text>
                    <Text style={styles.capItemAmt}>{currency} {item.amount.toFixed(2)}</Text>
                  </View>
                  {i < receipt.items.length - 1 && <View style={styles.capItemLine} />}
                </View>
              ))}
            </View>

            <View style={styles.capTotalWrap}>
              <View style={styles.capTotalRow}>
                <Text style={styles.capTotalLabel}>Total</Text>
                <Text style={styles.capTotalValue}>{currency} {receipt.total.toFixed(2)}</Text>
              </View>
            </View>
          </>
        )}

        <View style={styles.capFooter}>
          <Text style={styles.capFooterText}>tracked with potraces · saved {format(receipt.createdAt, 'd MMM yyyy, h:mm a')}</Text>
          <Text style={styles.capFooterSub}>keep original receipt for official claims</Text>
        </View>

        {/* Torn edge */}
        <View style={styles.capTearWrap}>
          <Svg width={RECEIPT_W} height={TEAR_H} viewBox={`0 0 ${RECEIPT_W} ${TEAR_H}`}>
            <SvgPath d={TEAR_PATH} fill="#F9F6F0" />
          </Svg>
        </View>
      </ViewShot>
      </View>

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
            <Text style={styles.modalTitle}>{t.receiptDetail.taxReliefCategoryTitle}</Text>
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
                      showToast(t.receiptDetail.taxReliefUpdated, 'success');
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.modalRowIcon, { backgroundColor: withAlpha(isSelected ? C.accent : C.textSecondary, 0.08) }]}>
                      <Feather name={cat.icon as keyof typeof Feather.glyphMap} size={14} color={isSelected ? C.accent : C.textSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalRowName, isSelected && { color: C.accent }]}>{cat.name}</Text>
                      {cat.limit !== null && (
                        <Text style={styles.modalRowLimit}>{t.receiptDetail.limitPrefix} {cat.limit.toLocaleString()}</Text>
                      )}
                    </View>
                    {isSelected && <Feather name="check" size={16} color={C.accent} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
        <ModalToastHost />
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
      letterSpacing: 0.2,
      width: 68,
    }}>{label}</Text>
    <Text
      style={{
        fontSize: TYPOGRAPHY.size.sm,
        fontWeight: TYPOGRAPHY.weight.medium,
        color: accent ? C.accent : C.textPrimary,
        letterSpacing: 0.2,
        flex: 1,
      }}
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
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  receiptTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    letterSpacing: -0.5,
    marginBottom: SPACING.xs / 2,
  },
  vendorName: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    letterSpacing: 0.2,
    marginBottom: SPACING.sm,
  },
  heroAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
    letterSpacing: -0.5,
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
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  itemsCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    letterSpacing: 0.2,
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
    letterSpacing: 0.2,
    flex: 1,
    marginRight: SPACING.md,
  },
  itemAmount: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: 0.2,
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
    letterSpacing: 0.2,
  },
  summaryValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: 0.2,
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
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: 0.2,
  },
  totalValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'] as any,
  },

  // ── Off-screen share capture (matches PDF layout) ──
  capOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
    overflow: 'hidden' as const,
  },
  capCard: {
    width: 360,
    backgroundColor: '#F9F6F0',
  },
  capHero: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
  },
  capVendor: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#222',
    letterSpacing: -0.3,
    marginBottom: 16,
  },
  capAmount: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: '#222',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'] as any,
    lineHeight: 40,
  },
  capCurrency: {
    fontSize: 18,
    fontWeight: '500' as const,
    color: '#6A6A6A',
  },
  capDate: {
    fontSize: 13,
    color: '#6A6A6A',
    marginTop: 6,
  },
  capDivider: {
    height: 1,
    backgroundColor: '#E6E2DA',
    marginHorizontal: 24,
  },
  capDetails: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  capDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 3,
  },
  capDetailLabel: {
    fontSize: 12,
    color: '#555',
    width: 66,
  },
  capDetailValue: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: '#222',
    flex: 1,
  },
  capItems: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 10,
  },
  capSectionLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#444',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  capItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 5,
  },
  capItemNum: {
    fontSize: 11,
    color: '#666',
    width: 22,
  },
  capItemName: {
    fontSize: 13,
    color: '#222',
    flex: 1,
    marginRight: 8,
  },
  capItemAmt: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#222',
    fontVariant: ['tabular-nums'] as any,
  },
  capItemLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F2F0EC',
  },
  capTotalWrap: {
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  capTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1.5,
    borderTopColor: '#222',
    marginTop: 6,
    paddingTop: 8,
  },
  capTotalLabel: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#222',
  },
  capTotalValue: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#222',
    fontVariant: ['tabular-nums'] as any,
  },
  capFooter: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E6E2DA',
  },
  capFooterText: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center' as const,
    letterSpacing: 0.3,
  },
  capFooterSub: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
    textAlign: 'center' as const,
    letterSpacing: 0.3,
  },
  capTearWrap: {
    backgroundColor: '#D8D5CE',
    paddingBottom: 12,
  },

  // ── Action buttons ──
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },

  // ── Toggle (custom switch) ──
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm,
  },
  toggleLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  toggleTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: withAlpha(C.textPrimary, 0.12),
    padding: 2,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },

  // ── Delete ──
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  deleteText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
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
    letterSpacing: -0.3,
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
    letterSpacing: 0.2,
  },
  modalRowLimit: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    letterSpacing: 0.2,
    marginTop: 1,
  },
});

export default ReceiptDetail;
