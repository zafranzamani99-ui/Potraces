import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
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
        <Feather name="chevron-down" size={20} color={COLORS.textSecondary} />
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
                <Feather name="x" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={wallets}
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
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.text,
  },
  walletBalance: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  placeholder: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: COLORS.textTertiary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  modal: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.xl,
    maxHeight: '60%',
    ...SHADOWS.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  title: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.text,
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
    color: COLORS.text,
  },
  itemBalance: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  defaultBadge: {
    backgroundColor: withAlpha(COLORS.personal, 0.1),
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  defaultText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.personal,
  },
});

export default WalletPicker;
