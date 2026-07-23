import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { lightTap } from '../../services/haptics';
import NewstInput, { newstOutline } from '../../components/business/NewstInput';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';

interface ProductSetupItem {
  productId: string;
  name: string;
  price: number;
  included: boolean;
  startQty: string;
}

const SessionSetup: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const { products, startSession, getRecentSpots, setStartingFloat, getPreOrderStock, preOrders } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [whereInput, setWhereInput] = useState('');
  const [floatInput, setFloatInput] = useState('');

  // Build editable product list from active products
  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive),
    [products]
  );

  const [productSetup, setProductSetup] = useState<ProductSetupItem[]>(() =>
    activeProducts.map((p) => ({
      productId: p.id,
      name: p.name,
      price: p.price,
      included: true,
      // Prefill with the product's default starting stock if set
      startQty: p.defaultStartQty ? String(p.defaultStartQty) : '',
    }))
  );

  // Pre-order demand → stock planner
  const preOrderStock = useMemo(() => getPreOrderStock(), [getPreOrderStock, preOrders]);
  const preOrderDemand = useMemo(
    () => activeProducts.filter((p) => (preOrderStock[p.id] || 0) > 0).map((p) => ({ id: p.id, name: p.name, qty: preOrderStock[p.id] })),
    [activeProducts, preOrderStock],
  );
  const preOrderSummary = preOrderDemand.map((d) => `${d.qty} ${d.name}`).join(', ');
  const coverPreOrders = () => {
    lightTap();
    setProductSetup((prev) =>
      prev.map((item) => {
        const demand = preOrderStock[item.productId] || 0;
        if (demand <= 0) return item;
        const current = parseInt(item.startQty, 10) || 0;
        return { ...item, included: true, startQty: String(Math.max(current, demand)) };
      }),
    );
  };

  // One-tap "recent spots" — refill name + where + products from a past session.
  const recentSpots = useMemo(() => getRecentSpots(3), [getRecentSpots, products]);
  const applySpot = (spot: { name?: string; where?: string; setup: { productId: string; startQty: number }[] }) => {
    setSessionName(spot.name || '');
    setWhereInput(spot.where || '');
    const qtyMap = new Map(spot.setup.map((s) => [s.productId, s.startQty]));
    setProductSetup((prev) =>
      prev.map((item) => {
        const q = qtyMap.get(item.productId);
        return q != null
          ? { ...item, included: true, startQty: String(q) }
          : { ...item, included: false };
      })
    );
    lightTap();
  };

  const toggleProduct = (productId: string) => {
    setProductSetup((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, included: !item.included }
          : item
      )
    );
  };

  const setQuantity = (productId: string, qty: string) => {
    // Only allow digits
    const cleaned = qty.replace(/[^0-9]/g, '');
    setProductSetup((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, startQty: cleaned } : item
      )
    );
  };

  const applyFloat = () => {
    const f = parseFloat(floatInput);
    if (!isNaN(f) && f > 0) setStartingFloat(f);
  };

  const handleStartSelling = () => {
    const included = productSetup.filter((p) => p.included);
    const setup = included.map((p) => ({
      productId: p.productId,
      startQty: p.startQty ? parseInt(p.startQty, 10) : 0,
    }));

    const name = sessionName.trim() || undefined;
    const where = whereInput.trim() || undefined;
    startSession(name, setup.length > 0 ? setup : undefined, where);
    applyFloat();
    navigation.goBack();
  };

  const handleSkipSetup = () => {
    const name = sessionName.trim() || undefined;
    const where = whereInput.trim() || undefined;
    startSession(name, undefined, where);
    applyFloat();
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Nav header already shows the "New Session" title + back button. */}

        {/* Recent spots — one tap refills name + where + products from a past session */}
        {recentSpots.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.recentHeading}>{t.stall.recentSpotsHeading}</Text>
            {recentSpots.map((spot, i) => {
              const title = spot.name?.trim() || spot.where?.trim() || t.stall.recentSpotFallback;
              const subParts: string[] = [];
              if (spot.where?.trim() && spot.where.trim() !== title) subParts.push(spot.where.trim());
              if (spot.setup.length > 0) subParts.push(t.stall.spotProductsCount.replace('{n}', String(spot.setup.length)));
              const subtitle = subParts.join(' · ');
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.spotRow, neu.raisedSoft]}
                  onPress={() => applySpot(spot)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
                >
                  <Feather name="rotate-ccw" size={18} color={C.bronze} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.spotTitle}>{title}</Text>
                    {subtitle ? <Text style={styles.spotSub}>{subtitle}</Text> : null}
                  </View>
                  <Feather name="chevron-right" size={18} color={C.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Session name input */}
        <View style={styles.inputSection}>
          <NewstInput
            label={t.stall.sessionNameLabel}
            value={sessionName}
            onChangeText={setSessionName}
            accessibilityLabel="Session name, optional"
            accessibilityHint="Enter a name for this selling session"
          />
        </View>

        {/* Where (the spot) input */}
        <View style={styles.inputSection}>
          <NewstInput
            label={t.stall.whereLabel}
            value={whereInput}
            onChangeText={setWhereInput}
            accessibilityLabel="Where you're selling, optional"
          />
        </View>

        {/* Starting cash float (optional) */}
        <View style={styles.inputSection}>
          <NewstInput
            label={t.stall.floatLabel}
            value={floatInput}
            onChangeText={(v) => setFloatInput(v.replace(/[^0-9.]/g, ''))}
            prefix={currency}
            hint={t.stall.floatHint}
            keyboardType="decimal-pad"
            accessibilityLabel="Starting cash float, optional"
          />
        </View>

        {/* Pre-order stock planner */}
        {preOrderDemand.length > 0 && (
          <View style={styles.preOrderBanner}>
            <Feather name="clipboard" size={16} color={C.bronze} />
            <Text style={styles.preOrderBannerText}>
              {t.stall.preOrderNeedStock.replace('{summary}', preOrderSummary)}
            </Text>
            <TouchableOpacity style={styles.coverBtn} onPress={coverPreOrders} accessibilityRole="button" accessibilityLabel={t.stall.preOrderCoverStock}>
              <Text style={styles.coverBtnText}>{t.stall.preOrderCoverStock}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Product list */}
        {activeProducts.length > 0 && (
          <View style={styles.productsSection}>
            <View style={styles.productsLabelRow}>
              <Text style={[styles.inputLabel, { marginBottom: 0 }]}>{t.stall.products}</Text>
              <Text style={styles.productCountBadge}>
                {t.stall.selectedCount
                  .replace('{selected}', String(productSetup.filter((p) => p.included).length))
                  .replace('{total}', String(productSetup.length))}
              </Text>
            </View>
            {productSetup.map((item) => (
              <View key={item.productId} style={[styles.productRow, neu.raisedSoft, item.included && styles.productRowIncluded]}>
                <TouchableOpacity
                  style={styles.productToggleArea}
                  onPress={() => toggleProduct(item.productId)}
                  accessibilityRole="switch"
                  accessibilityLabel={`${item.name}, ${currency} ${item.price.toFixed(2)}`}
                  accessibilityState={{ checked: item.included }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkbox,
                      item.included && styles.checkboxActive,
                    ]}
                  >
                    {item.included && (
                      <Feather name="check" size={14} color={C.onAccent} />
                    )}
                  </View>
                  <View style={styles.productInfo}>
                    <Text
                      style={[
                        styles.productName,
                        !item.included && styles.productNameDisabled,
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text style={styles.productPrice}>
                      {currency} {item.price.toFixed(2)}
                    </Text>
                  </View>
                </TouchableOpacity>

                {item.included && (
                  <TextInput
                    style={[styles.qtyInput, newstOutline(C, focusedField === 'qty-' + item.productId)]}
                    onFocus={() => setFocusedField('qty-' + item.productId)}
                    onBlur={() => setFocusedField((f) => (f === 'qty-' + item.productId ? null : f))}
                    value={item.startQty}
                    onChangeText={(val) => setQuantity(item.productId, val)}
                    placeholder={t.stall.qtyPlaceholder}
                    placeholderTextColor={C.neutral}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    accessibilityLabel={`Starting quantity for ${item.name}`}
                    accessibilityHint="Optional. Enter how many you brought to sell"
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={withAlpha(C.accent, 0.25)}
                  />
                )}
              </View>
            ))}
          </View>
        )}

        {activeProducts.length === 0 && (
          <TouchableOpacity
            style={[styles.noProducts, neu.raised]}
            onPress={() => navigation.navigate('StallProducts')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t.stall.setupProductsCta}
          >
            <Feather name="package" size={24} color={C.bronze} />
            <Text style={styles.noProductsText}>
              {t.stall.noProductsMsg}
            </Text>
            <View style={styles.setupProductsRow}>
              <Feather name="plus" size={16} color={C.bronze} />
              <Text style={styles.setupProductsText}>{t.stall.setupProductsCta}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Start selling button */}
        <NeuButton
          icon="arrow-right"
          label={t.stall.startSelling}
          color={C.bronze}
          onPress={handleStartSelling}
          accessibilityLabel="Start selling session"
          style={{ marginBottom: SPACING.lg }}
        />

        {/* Skip setup link */}
        <TouchableOpacity
          style={styles.skipLink}
          onPress={handleSkipSetup}
          accessibilityRole="button"
          accessibilityLabel="Skip setup and start with defaults"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipLinkText}>{t.stall.skipSetup}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: SPACING['4xl'],
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },
  // ─── Repeat last session ─────────────────────────────────────
  recentSection: {
    marginBottom: SPACING['2xl'],
  },
  recentHeading: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
  },
  spotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    minHeight: 56,
  },
  spotTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  spotSub: {
    ...TYPE.muted,
    marginTop: 2,
  },

  // ─── Session name input ──────────────────────────────────────
  inputSection: {
    marginBottom: SPACING['3xl'],
  },
  inputLabel: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
  },

  // ─── Pre-order stock planner ─────────────────────────────────
  preOrderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: withAlpha(C.bronze, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.3),
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING['2xl'],
  },
  preOrderBannerText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
  },
  coverBtn: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  coverBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },

  // ─── Product list ────────────────────────────────────────────
  productsSection: {
    marginBottom: SPACING['3xl'],
  },
  productsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  productCountBadge: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
    backgroundColor: withAlpha(C.bronze, 0.10),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    minHeight: 56,
  },
  productRowIncluded: {
    backgroundColor: withAlpha(C.bronze, 0.03),
  },
  productToggleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minHeight: 44,
    gap: SPACING.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.xs,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  productNameDisabled: {
    color: C.neutral,
  },
  productPrice: {
    ...TYPE.muted,
    marginTop: 2,
  },
  qtyInput: {
    width: 60,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    textAlign: 'center',
    minHeight: 36,
  },
  noProducts: {
    alignItems: 'center',
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING['2xl'],
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  noProductsText: {
    ...TYPE.insight,
    color: C.textSecondary,
    textAlign: 'center',
  },
  setupProductsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  setupProductsText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },

  // ─── Actions ─────────────────────────────────────────────────
  skipLink: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipLinkText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
});

export default SessionSetup;
