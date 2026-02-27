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
import { Wallet } from '../../types';
import { lightTap } from '../../services/haptics';

interface WalletPickerProps {
  wallets: Wallet[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label?: string;
}

const WalletPicker: React.FC<WalletPickerProps> = ({
  wallets,
  selectedId,
  onSelect,
  label,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const selectedWallet = wallets.find((w) => w.id === selectedId);
  const sortedWallets = useMemo(
    () => [...wallets].sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1)),
    [wallets]
  );

  if (wallets.length === 0) return null;

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
                <Text style={styles.walletName}>{selectedWallet.name}</Text>
                <Text style={styles.walletBalance}>
                  RM {selectedWallet.balance.toFixed(2)}
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
          <View style={styles.modal}>
            <View style={styles.header}>
              <Text style={styles.title}>{label || 'Select Wallet'}</Text>
              <TouchableOpacity onPress={() => setDropdownOpen(false)}>
                <Feather name="x" size={22} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={sortedWallets}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = item.id === selectedId;
                return (
                  <TouchableOpacity
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
                        RM {item.balance.toFixed(2)}
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
              }}
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
  walletName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
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
