import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';

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
  const { products, startSession } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const [sessionName, setSessionName] = useState('');

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
      startQty: '',
    }))
  );

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

  const handleStartSelling = () => {
    const included = productSetup.filter((p) => p.included);
    const setup = included.map((p) => ({
      productId: p.productId,
      startQty: p.startQty ? parseInt(p.startQty, 10) : 0,
    }));

    const name = sessionName.trim() || undefined;
    startSession(name, setup.length > 0 ? setup : undefined);
    navigation.goBack();
  };

  const handleSkipSetup = () => {
    const name = sessionName.trim() || undefined;
    startSession(name);
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={24} color={C.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.heading}>{t.stall.newSession}</Text>

        {/* Session name input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>{t.stall.sessionNameLabel}</Text>
          <TextInput
            style={styles.textInput}
            value={sessionName}
            onChangeText={setSessionName}
            placeholder={t.stall.sessionNamePlaceholder}
            placeholderTextColor={C.neutral}
            returnKeyType="done"
            accessibilityLabel="Session name, optional"
            accessibilityHint="Enter a name for this selling session"
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={C.accent}
          />
        </View>

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
              <View key={item.productId} style={[styles.productRow, item.included && styles.productRowIncluded]}>
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
                    style={styles.qtyInput}
                    value={item.startQty}
                    onChangeText={(val) => setQuantity(item.productId, val)}
                    placeholder={t.stall.qtyPlaceholder}
                    placeholderTextColor={C.neutral}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    accessibilityLabel={`Starting quantity for ${item.name}`}
                    accessibilityHint="Optional. Enter how many you brought to sell"
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.accent}
                  />
                )}
              </View>
            ))}
          </View>
        )}

        {activeProducts.length === 0 && (
          <View style={styles.noProducts}>
            <Feather name="package" size={24} color={C.neutral} />
            <Text style={styles.noProductsText}>
              {t.stall.noProductsMsg}
            </Text>
          </View>
        )}

        {/* Start selling button */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStartSelling}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Start selling session"
        >
          <Text style={styles.startButtonText}>{t.stall.startSelling}</Text>
        </TouchableOpacity>

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
    marginBottom: SPACING['3xl'],
  },

  // ─── Session name input ──────────────────────────────────────
  inputSection: {
    marginBottom: SPACING['3xl'],
  },
  inputLabel: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
  },
  textInput: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    minHeight: 48,
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
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    minHeight: 56,
  },
  productRowIncluded: {
    borderColor: withAlpha(C.bronze, 0.2),
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
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    textAlign: 'center',
    minHeight: 36,
  },
  noProducts: {
    alignItems: 'center',
    paddingVertical: SPACING['4xl'],
    gap: SPACING.md,
  },
  noProductsText: {
    ...TYPE.insight,
    color: C.textSecondary,
    textAlign: 'center',
  },

  // ─── Actions ─────────────────────────────────────────────────
  startButton: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: SPACING.lg,
  },
  startButtonText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
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
