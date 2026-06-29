import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';

interface ScanningOverlayProps {
  visible: boolean;
}

const ScanningOverlay: React.FC<ScanningOverlayProps> = ({ visible }) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  if (!visible) return null;

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade">
      <View style={styles.scanningOverlay}>
        <View style={styles.scanningCard}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.scanningTitle}>{t.debts.scanningReceipt}</Text>
          <Text style={styles.scanningSubtext}>{t.debts.aiReadingReceipt}</Text>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  scanningOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanningCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS['2xl'],
    padding: SPACING['3xl'],
    alignItems: 'center',
    gap: SPACING.lg,
    width: 220,
  },
  scanningTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  scanningSubtext: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
  },
});

export default React.memo(ScanningOverlay);
