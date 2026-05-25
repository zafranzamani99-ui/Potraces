import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusinessStore } from '../../store/businessStore';
import { useAppStore } from '../../store/appStore';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { IncomeType } from '../../types';
import { lightTap } from '../../services/haptics';

const TILE_ICONS: Record<IncomeType, keyof typeof Feather.glyphMap> = {
  seller: 'shopping-bag',
  stall: 'map-pin',
  freelance: 'pen-tool',
  parttime: 'clock',
  rider: 'navigation',
  mixed: 'layers',
};

const Setup: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [selected, setSelected] = useState<IncomeType | null>(null);
  const insets = useSafeAreaInsets();

  const TILES: { type: IncomeType; label: string; sublabel: string }[] = [
    { type: 'seller', label: t.business.setupSellerLabel, sublabel: t.business.setupSellerSub },
    { type: 'stall', label: t.business.setupStallLabel, sublabel: t.business.setupStallSub },
    { type: 'freelance', label: t.business.setupFreelanceLabel, sublabel: t.business.setupFreelanceSub },
    { type: 'parttime', label: t.business.setupParttimeLabel, sublabel: t.business.setupParttimeSub },
    { type: 'rider', label: t.business.setupRiderLabel, sublabel: t.business.setupRiderSub },
    { type: 'mixed', label: t.business.setupMixedLabel, sublabel: t.business.setupMixedSub },
  ];

  const handleConfirm = () => {
    if (!selected) return;
    useBusinessStore.setState({ incomeType: selected, businessSetupComplete: true });
  };

  const handleBackToPersonal = () => {
    useAppStore.getState().setMode('personal');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Pressable onPress={handleBackToPersonal} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Feather name="arrow-left" size={22} color={C.textPrimary} />
      </Pressable>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(SPACING.xl, insets.bottom + SPACING.md) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Feather name="compass" size={26} color={C.accent} />
          </View>
          <Text style={styles.title}>
            how does money{'\n'}
            <Text style={styles.titleAccent}>come to you</Text>?
          </Text>
          <Text style={styles.subtitle}>pick what fits best — you can change later</Text>
        </View>

        <View style={styles.tileList}>
          {TILES.map((tile) => {
            const isSelected = selected === tile.type;
            const icon = TILE_ICONS[tile.type];
            return (
              <Pressable
                key={tile.type}
                style={[styles.tile, isSelected && styles.tileSelected]}
                onPress={() => { lightTap(); setSelected(tile.type); }}
              >
                {({ pressed }) => (
                  <View style={[styles.tileInner, pressed && { opacity: 0.75 }]}>
                    <View style={[styles.tileIconCircle, isSelected && styles.tileIconCircleSelected]}>
                      <Feather name={icon} size={18} color={isSelected ? C.accent : C.textSecondary} />
                    </View>
                    <View style={styles.tileTextCol}>
                      <Text style={[styles.tileLabel, isSelected && { color: C.accent }]}>{tile.label}</Text>
                      <Text style={styles.tileSublabel}>{tile.sublabel}</Text>
                    </View>
                    {isSelected && (
                      <View style={styles.tileCheck}>
                        <Feather name="check" size={16} color={C.accent} />
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[styles.confirmBtn, !selected && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={!selected}
        >
          {({ pressed }) => (
            <View style={[styles.confirmBtnInner, pressed && selected && { opacity: 0.85 }]}>
              <Feather name="arrow-right" size={16} color={selected ? C.onAccent : C.textMuted} />
              <Text style={[styles.confirmText, !selected && { color: C.textMuted }]}>
                {t.business.setupConfirm}
              </Text>
            </View>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  backBtn: {
    marginTop: SPACING.sm,
    marginLeft: SPACING.lg,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },
  header: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
    lineHeight: 30,
  },
  titleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
    marginTop: SPACING.xs,
    letterSpacing: 0.1,
  },
  tileList: {
    gap: SPACING.sm,
  },
  tile: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
  },
  tileSelected: {
    borderColor: withAlpha(C.accent, 0.4),
    backgroundColor: withAlpha(C.accent, C === CALM_DARK ? 0.06 : 0.03),
  },
  tileInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  tileIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.04),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconCircleSelected: {
    backgroundColor: withAlpha(C.accent, 0.12),
  },
  tileTextCol: {
    flex: 1,
  },
  tileLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: 2,
  },
  tileSublabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
    lineHeight: 16,
  },
  tileCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(C.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: SPACING.xl,
  },
  confirmBtnDisabled: {
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.05),
  },
  confirmBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.3,
  },
});

export default Setup;
