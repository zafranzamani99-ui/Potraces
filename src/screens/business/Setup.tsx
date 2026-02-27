import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBusinessStore } from '../../store/businessStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { IncomeType } from '../../types';

const TILES: { type: IncomeType; label: string; sublabel: string }[] = [
  { type: 'seller', label: 'Selling products', sublabel: 'stall, online shop,\nfood, market' },
  { type: 'freelance', label: 'Freelance / gigs', sublabel: 'design, tutor,\ncontent, dev' },
  { type: 'parttime', label: 'Part-time job', sublabel: 'side income\nalongside main job' },
  { type: 'rider', label: 'Delivery rider', sublabel: 'Grab, Foodpanda,\nLalamove, others' },
];

const Setup: React.FC = () => {
  const [selected, setSelected] = useState<IncomeType | null>(null);
  const { setIncomeType, completeSetup } = useBusinessStore();
  const navigation = useNavigation<any>();

  const handleConfirm = () => {
    if (!selected) return;
    setIncomeType(selected);
    completeSetup();
    navigation.reset({
      index: 0,
      routes: [{ name: 'BusinessMain' }],
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>how does money come to you?</Text>

      <View style={styles.grid}>
        {TILES.map((tile) => (
          <TouchableOpacity
            key={tile.type}
            style={[styles.tile, selected === tile.type && styles.tileSelected]}
            onPress={() => setSelected(tile.type)}
            activeOpacity={0.7}
          >
            <Text style={styles.tileLabel}>{tile.label}</Text>
            <Text style={styles.tileSublabel}>{tile.sublabel}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.tile, styles.fullWidthTile, selected === 'mixed' && styles.tileSelected]}
        onPress={() => setSelected('mixed')}
        activeOpacity={0.7}
      >
        <Text style={styles.tileLabel}>Mixed / all of the above</Text>
        <Text style={styles.tileSublabel}>I do more than one</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.confirmButton, !selected && styles.confirmButtonDisabled]}
        onPress={handleConfirm}
        disabled={!selected}
        activeOpacity={0.7}
      >
        <Text style={[styles.confirmText, !selected && styles.confirmTextDisabled]}>
          that's me
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
    padding: SPACING['2xl'],
    justifyContent: 'center',
  },
  heading: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING['2xl'],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  tile: {
    width: '48%',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
  },
  tileSelected: {
    borderColor: CALM.accent,
    borderWidth: 2,
  },
  fullWidthTile: {
    width: '100%',
    marginBottom: SPACING.md,
  },
  tileLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  tileSublabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    lineHeight: 16,
  },
  confirmButton: {
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  confirmButtonDisabled: {
    backgroundColor: CALM.border,
  },
  confirmText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  confirmTextDisabled: {
    color: CALM.textSecondary,
  },
});

export default Setup;
