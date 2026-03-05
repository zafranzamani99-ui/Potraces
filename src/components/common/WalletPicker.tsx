import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { WALLET_TYPE_CONFIG } from '../../constants/premium';
import { Wallet, WalletType } from '../../types';
import { lightTap } from '../../services/haptics';
import { useSettingsStore } from '../../store/settingsStore';

interface WalletPickerProps {
  wallets: Wallet[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label?: string;
  typeFilter?: WalletType;
}

const TYPE_ORDER: WalletType[] = ['bank', 'ewallet', 'credit'];

const WalletPicker: React.FC<WalletPickerProps> = ({
  wallets,
  selectedId,
  onSelect,
  label,
  typeFilter,
}) => {
  const currency = useSettingsStore((s) => s.currency);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filteredWallets = useMemo(() => {
    const filtered = typeFilter ? wallets.filter((w) => w.type === typeFilter) : wallets;
    return [...filtered].sort((a, b) => {
      // Sort by: default first, then by type order, then by name
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      const typeA = TYPE_ORDER.indexOf(a.type);
      const typeB = TYPE_ORDER.indexOf(b.type);
      if (typeA !== typeB) return typeA - typeB;
      return a.name.localeCompare(b.name);
    });
  }, [wallets, typeFilter]);

  const selectedWallet = wallets.find((w) => w.id === selectedId);

  // Group wallets by type for section display
  const groupedWallets = useMemo(() => {
    if (typeFilter) return [{ type: typeFilter, wallets: filteredWallets }];
    const groups: { type: WalletType; wallets: Wallet[] }[] = [];
    TYPE_ORDER.forEach((type) => {
      const typeWallets = filteredWallets.filter((w) => w.type === type);
      if (typeWallets.length > 0) {
        groups.push({ type, wallets: typeWallets });
      }
    });
    return groups;
  }, [filteredWallets, typeFilter]);

  if (wallets.length === 0) return null;

  const getDisplayBalance = (wallet: Wallet) => {
    if (wallet.type === 'credit') {
      return `Avail. ${currency} ${wallet.balance.toFixed(2)}`;
    }
    return `${currency} ${wallet.balance.toFixed(2)}`;
  };

  const getTypeBadgeColor = (type: WalletType): string => {
    switch (type) {
      case 'bank': return '#0052A5';
      case 'ewallet': return '#00B14F';
      case 'credit': return CALM.bronze;
    }
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}

      <TouchableOpacity
        style={styles.trigger}
        onPress={() => {
          lightTap();
          setDropdownOpen(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.selectedRow}>
          {selectedWallet ? (
            <>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: withAlpha(selectedWallet.color, 0.15) },
                ]}
              >
                <Feather
                  name={selectedWallet.icon as keyof typeof Feather.glyphMap}
                  size={18}
                  color={selectedWallet.color}
                />
              </View>
              <View style={styles.textGroup}>
                <View style={styles.nameRow}>
                  <Text style={styles.walletName}>{selectedWallet.name}</Text>
                  <View style={[styles.typeBadge, { backgroundColor: withAlpha(getTypeBadgeColor(selectedWallet.type), 0.1) }]}>
                    <Text style={[styles.typeBadgeText, { color: getTypeBadgeColor(selectedWallet.type) }]}>
                      {WALLET_TYPE_CONFIG[selectedWallet.type].label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.walletBalance}>
                  {getDisplayBalance(selectedWallet)}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.placeholder}>Select wallet</Text>
          )}
        </View>
        <Feather name="chevron-down" size={20} color={CALM.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setDropdownOpen(false)}
        >
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            <View style={styles.header}>
              <Text style={styles.title}>{label || 'Select Wallet'}</Text>
              <TouchableOpacity onPress={() => setDropdownOpen(false)}>
                <Feather name="x" size={22} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={groupedWallets}
              keyExtractor={(group) => group.type}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: group }) => (
                <View>
                  {/* Section header (only if not filtered to single type) */}
                  {!typeFilter && (
                    <View style={styles.sectionHeader}>
                      <Feather
                        name={WALLET_TYPE_CONFIG[group.type].icon as keyof typeof Feather.glyphMap}
                        size={14}
                        color={CALM.textMuted}
                      />
                      <Text style={styles.sectionTitle}>
                        {WALLET_TYPE_CONFIG[group.type].label}
                      </Text>
                    </View>
                  )}
                  {group.wallets.map((item) => {
                    const isSelected = item.id === selectedId;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.item,
                          isSelected && {
                            backgroundColor: withAlpha(item.color, 0.1),
                          },
                        ]}
                        onPress={() => {
                          lightTap();
                          onSelect(item.id);
                          setDropdownOpen(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.itemIcon,
                            {
                              backgroundColor: isSelected
                                ? item.color
                                : withAlpha(item.color, 0.15),
                            },
                          ]}
                        >
                          <Feather
                            name={item.icon as keyof typeof Feather.glyphMap}
                            size={18}
                            color={isSelected ? '#fff' : item.color}
                          />
                        </View>
                        <View style={styles.itemTextGroup}>
                          <Text
                            style={[
                              styles.itemName,
                              isSelected && {
                                color: item.color,
                                fontWeight: TYPOGRAPHY.weight.bold,
                              },
                            ]}
                          >
                            {item.name}
                          </Text>
                          <Text style={styles.itemBalance}>
                            {getDisplayBalance(item)}
                          </Text>
                        </View>
                        {item.isDefault && (
                          <View style={styles.defaultBadge}>
                            <Text style={styles.defaultText}>Default</Text>
                          </View>
                        )}
                        {isSelected && (
                          <Feather name="check" size={18} color={item.color} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.md,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textGroup: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  walletName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  typeBadge: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
    borderRadius: RADIUS.xs,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  walletBalance: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
    marginTop: 1,
  },
  placeholder: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.neutral,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  modal: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    maxHeight: '60%',
    borderWidth: 1,
    borderColor: CALM.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  title: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTextGroup: {
    flex: 1,
  },
  itemName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  itemBalance: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginTop: 1,
  },
  defaultBadge: {
    backgroundColor: withAlpha(CALM.accent, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  defaultText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
});

export default WalletPicker;
