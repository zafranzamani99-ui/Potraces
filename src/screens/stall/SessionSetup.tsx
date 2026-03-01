import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
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
            <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.heading}>new session</Text>

        {/* Session name input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>SESSION NAME</Text>
          <TextInput
            style={styles.textInput}
            value={sessionName}
            onChangeText={setSessionName}
            placeholder="e.g. pasar malam seri kembangan"
            placeholderTextColor={CALM.neutral}
            returnKeyType="done"
            accessibilityLabel="Session name, optional"
            accessibilityHint="Enter a name for this selling session"
          />
        </View>

        {/* Product list */}
        {activeProducts.length > 0 && (
          <View style={styles.productsSection}>
            <Text style={styles.inputLabel}>PRODUCTS</Text>
            {productSetup.map((item) => (
              <View key={item.productId} style={styles.productRow}>
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
                      <Feather name="check" size={14} color="#FFFFFF" />
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
                    placeholder="qty"
                    placeholderTextColor={CALM.neutral}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    accessibilityLabel={`Starting quantity for ${item.name}`}
                    accessibilityHint="Optional. Enter how many you brought to sell"
                  />
                )}
              </View>
            ))}
          </View>
        )}

        {activeProducts.length === 0 && (
          <View style={styles.noProducts}>
            <Feather name="package" size={24} color={CALM.neutral} />
            <Text style={styles.noProductsText}>
              no products set up yet.{'\n'}you can still start selling.
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
          <Text style={styles.startButtonText}>start selling</Text>
        </TouchableOpacity>

        {/* Skip setup link */}
        <TouchableOpacity
          style={styles.skipLink}
          onPress={handleSkipSetup}
          accessibilityRole="button"
          accessibilityLabel="Skip setup and start with defaults"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipLinkText}>skip setup</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: SPACING['4xl'],
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
    color: CALM.textPrimary,
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
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    minHeight: 48,
  },

  // ─── Product list ────────────────────────────────────────────
  productsSection: {
    marginBottom: SPACING['3xl'],
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    minHeight: 56,
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
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  productNameDisabled: {
    color: CALM.neutral,
  },
  productPrice: {
    ...TYPE.muted,
    marginTop: 2,
  },
  qtyInput: {
    width: 60,
    backgroundColor: CALM.background,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
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
    color: CALM.textSecondary,
    textAlign: 'center',
  },

  // ─── Actions ─────────────────────────────────────────────────
  startButton: {
    backgroundColor: CALM.bronze,
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
    color: '#FFFFFF',
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
    color: CALM.textSecondary,
  },
});

export default SessionSetup;
