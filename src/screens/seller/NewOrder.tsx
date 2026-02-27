import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { SellerOrderItem, SellerProduct } from '../../types';
import { parseWhatsAppOrder } from '../../utils/parseWhatsAppOrder';
import { parseWhatsAppOrderAI } from '../../services/aiService';

type InputMode = 'whatsapp' | 'manual';

const NewOrder: React.FC = () => {
  const { products, addOrder } = useSellerStore();
  const activeSeason = useSellerStore((s) => s.getActiveSeason());
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const [mode, setMode] = useState<InputMode>('whatsapp');
  const [whatsAppText, setWhatsAppText] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [items, setItems] = useState<SellerOrderItem[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [note, setNote] = useState('');

  const activeProducts = useMemo(
    () => products.filter((p) => p.isActive),
    [products]
  );

  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  const handleParseWhatsApp = useCallback(async () => {
    if (!whatsAppText.trim()) return;
    setIsParsing(true);

    // Try local parsing first
    const local = parseWhatsAppOrder(whatsAppText, products);
    if (local.items.length > 0) {
      setItems(local.items);
      setUnmatched(local.unmatched);
      setIsParsing(false);
      return;
    }

    // Fallback to AI parsing
    const aiItems = await parseWhatsAppOrderAI(whatsAppText, products);
    if (aiItems && aiItems.length > 0) {
      const mapped: SellerOrderItem[] = aiItems.map((ai) => {
        const product = products.find(
          (p) => p.name.toLowerCase() === ai.productName.toLowerCase() && p.isActive
        );
        return {
          productId: product?.id || '',
          productName: ai.productName,
          quantity: ai.quantity,
          unitPrice: product?.pricePerUnit || 0,
          unit: ai.unit || product?.unit || 'piece',
        };
      });
      setItems(mapped);
      setUnmatched([]);
    } else {
      setUnmatched([whatsAppText.trim()]);
    }

    setIsParsing(false);
  }, [whatsAppText, products]);

  const handleAddManualItem = (product: SellerProduct) => {
    const existing = items.find((i) => i.productId === product.id);
    if (existing) {
      setItems(
        items.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      );
    } else {
      setItems([
        ...items,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: product.pricePerUnit,
          unit: product.unit,
        },
      ]);
    }
  };

  const handleUpdateQuantity = (index: number, qty: number) => {
    if (qty <= 0) {
      setItems(items.filter((_, i) => i !== index));
    } else {
      setItems(items.map((item, i) => (i === index ? { ...item, quantity: qty } : item)));
    }
  };

  const handleSubmit = () => {
    if (items.length === 0) {
      Alert.alert('No items', 'Add at least one item to the order.');
      return;
    }

    addOrder({
      items,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      totalAmount: total,
      status: 'pending',
      isPaid: false,
      note: note.trim() || undefined,
      rawWhatsApp: mode === 'whatsapp' ? whatsAppText.trim() : undefined,
      date: new Date(),
      seasonId: activeSeason?.id,
    });

    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mode selector */}
        <View style={styles.modeSelector}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'whatsapp' && styles.modeButtonActive]}
            onPress={() => setMode('whatsapp')}
          >
            <Feather name="message-circle" size={16} color={mode === 'whatsapp' ? '#fff' : CALM.textSecondary} />
            <Text style={[styles.modeButtonText, mode === 'whatsapp' && styles.modeButtonTextActive]}>
              WhatsApp
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'manual' && styles.modeButtonActive]}
            onPress={() => setMode('manual')}
          >
            <Feather name="edit-3" size={16} color={mode === 'manual' ? '#fff' : CALM.textSecondary} />
            <Text style={[styles.modeButtonText, mode === 'manual' && styles.modeButtonTextActive]}>
              Manual
            </Text>
          </TouchableOpacity>
        </View>

        {/* WhatsApp mode */}
        {mode === 'whatsapp' && (
          <View style={styles.whatsappSection}>
            <Text style={styles.inputLabel}>paste the message</Text>
            <TextInput
              style={styles.whatsappInput}
              value={whatsAppText}
              onChangeText={setWhatsAppText}
              placeholder="e.g. nak order semperit kuning 2 tin dan jem tart 1 tin"
              placeholderTextColor={CALM.textSecondary}
              multiline
              numberOfLines={4}
            />
            <TouchableOpacity
              style={[styles.parseButton, !whatsAppText.trim() && styles.parseButtonDisabled]}
              onPress={handleParseWhatsApp}
              disabled={!whatsAppText.trim() || isParsing}
            >
              {isParsing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.parseButtonText}>read order</Text>
              )}
            </TouchableOpacity>

            {unmatched.length > 0 && (
              <View style={styles.unmatchedBox}>
                <Text style={styles.unmatchedLabel}>couldn't match:</Text>
                {unmatched.map((u, i) => (
                  <Text key={i} style={styles.unmatchedText}>{u}</Text>
                ))}
                <Text style={styles.unmatchedHint}>
                  you can add these manually below, or add the product first.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Manual mode — product picker */}
        {mode === 'manual' && (
          <View style={styles.manualSection}>
            <Text style={styles.inputLabel}>tap to add</Text>
            <View style={styles.productGrid}>
              {activeProducts.map((product) => (
                <TouchableOpacity
                  key={product.id}
                  style={styles.productChip}
                  onPress={() => handleAddManualItem(product)}
                >
                  <Text style={styles.productChipText}>{product.name}</Text>
                  <Text style={styles.productChipPrice}>
                    {currency} {product.pricePerUnit.toFixed(0)}/{product.unit}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {activeProducts.length === 0 && (
              <TouchableOpacity
                style={styles.addProductLink}
                onPress={() => navigation.getParent()?.navigate('SellerProducts')}
              >
                <Text style={styles.addProductLinkText}>add your first product</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Order items */}
        {items.length > 0 && (
          <View style={styles.orderSection}>
            <Text style={styles.inputLabel}>order</Text>
            {items.map((item, index) => (
              <View key={index} style={styles.orderItem}>
                <View style={styles.orderItemInfo}>
                  <Text style={styles.orderItemName}>{item.productName}</Text>
                  <Text style={styles.orderItemPrice}>
                    {currency} {(item.unitPrice * item.quantity).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    onPress={() => handleUpdateQuantity(index, item.quantity - 1)}
                    style={styles.qtyButton}
                  >
                    <Feather name="minus" size={16} color={CALM.textSecondary} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>
                    {item.quantity} {item.unit}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleUpdateQuantity(index, item.quantity + 1)}
                    style={styles.qtyButton}
                  >
                    <Feather name="plus" size={16} color={CALM.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>total</Text>
              <Text style={styles.totalAmount}>{currency} {total.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Customer info */}
        <View style={styles.customerSection}>
          <Text style={styles.inputLabel}>customer (optional)</Text>
          <TextInput
            style={styles.textInput}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="name"
            placeholderTextColor={CALM.textSecondary}
          />
          <TextInput
            style={styles.textInput}
            value={customerPhone}
            onChangeText={setCustomerPhone}
            placeholder="phone"
            placeholderTextColor={CALM.textSecondary}
            keyboardType="phone-pad"
          />
        </View>

        {/* Note */}
        <TextInput
          style={styles.textInput}
          value={note}
          onChangeText={setNote}
          placeholder="note (optional)"
          placeholderTextColor={CALM.textSecondary}
        />
      </ScrollView>

      {/* Submit button */}
      <View style={styles.submitBar}>
        <TouchableOpacity
          style={[styles.submitButton, items.length === 0 && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={items.length === 0}
        >
          <Text style={styles.submitButtonText}>
            save order{total > 0 ? ` \u2014 ${currency} ${total.toFixed(2)}` : ''}
          </Text>
        </TouchableOpacity>
      </View>
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
    padding: SPACING.lg,
    paddingBottom: SPACING['5xl'],
    gap: SPACING.lg,
  },

  // Mode selector
  modeSelector: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    backgroundColor: CALM.surface,
  },
  modeButtonActive: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  modeButtonText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  modeButtonTextActive: {
    color: '#fff',
  },

  // Input labels
  inputLabel: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
  },

  // WhatsApp mode
  whatsappSection: {
    gap: SPACING.md,
  },
  whatsappInput: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  parseButton: {
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  parseButtonDisabled: {
    backgroundColor: CALM.border,
  },
  parseButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  unmatchedBox: {
    backgroundColor: CALM.highlight,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  unmatchedLabel: {
    ...TYPE.label,
    color: CALM.textSecondary,
  },
  unmatchedText: {
    ...TYPE.insight,
    color: CALM.textPrimary,
  },
  unmatchedHint: {
    ...TYPE.muted,
    marginTop: SPACING.xs,
  },

  // Manual mode
  manualSection: {
    gap: SPACING.sm,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  productChip: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  productChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  productChipPrice: {
    ...TYPE.muted,
    marginTop: 2,
  },
  addProductLink: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  addProductLinkText: {
    ...TYPE.insight,
    color: CALM.accent,
  },

  // Order items
  orderSection: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  orderItem: {
    gap: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    paddingBottom: SPACING.md,
  },
  orderItemInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderItemName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  orderItemPrice: {
    ...TYPE.insight,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    minWidth: 60,
    textAlign: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: SPACING.sm,
  },
  totalLabel: {
    ...TYPE.label,
  },
  totalAmount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },

  // Customer
  customerSection: {
    gap: SPACING.sm,
  },
  textInput: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.md,
  },

  // Submit
  submitBar: {
    padding: SPACING.lg,
    backgroundColor: CALM.surface,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  submitButton: {
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: CALM.border,
  },
  submitButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
});

export default NewOrder;
