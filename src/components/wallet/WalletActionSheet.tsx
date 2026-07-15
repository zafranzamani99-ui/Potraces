import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  CALM,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  withAlpha,
} from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import WalletLogo from '../common/WalletLogo';
import { useNeu } from '../common/neu';
import BottomSheet from '../common/BottomSheet';
import type { Wallet } from '../../types';

type Props = {
  visible: boolean;
  walletId: string | null;
  onClose: () => void;
  wallets: Wallet[];
  currency: string;
  onSetDefault: (walletId: string) => void;
  onRepay: (walletId: string) => void;
  onTransferFrom: (walletId: string) => void;
  onEdit: (walletId: string) => void;
  onRecalculate: (walletId: string) => void;
  onDelete: (walletId: string) => void;
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    // Header sits inside BottomSheet's drag zone (drag-to-dismiss from here too),
    // so it needs its own horizontal padding — BottomSheet doesn't pad content.
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(C.textPrimary, 0.08),
    },
    sheetWalletIcon: {
      width: 52,
      height: 52,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetWalletName: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
    },
    sheetWalletSub: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
      marginTop: 2,
    },
    rows: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.lg,
      marginBottom: SPACING.sm,
      backgroundColor: C.background,
    },
    sheetRowLabel: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.semibold,
    },
    sheetRowHint: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
      maxWidth: 160,
      textAlign: 'right',
    },
  });

export default function WalletActionSheet({
  visible,
  walletId,
  onClose,
  wallets,
  currency,
  onSetDefault,
  onRepay,
  onTransferFrom,
  onEdit,
  onRecalculate,
  onDelete,
}: Props) {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neuF = useNeu(undefined, { faintDark: true });

  if (!visible || !walletId) return null;

  const aw = wallets.find((w) => w.id === walletId);
  if (!aw) return null;

  const isCredit = aw.type === 'credit';
  const usedCredit = aw.usedCredit || 0;
  const currentDefault = wallets.find((w) => w.isDefault);
  const canTransferFrom = wallets.length >= 2;

  const header = (
    <View style={styles.sheetHeader}>
      <View
        style={[
          styles.sheetWalletIcon,
          !aw.presetId && neuF.well,
          { backgroundColor: aw.presetId ? 'transparent' : withAlpha(aw.color, 0.15) },
        ]}
      >
        <WalletLogo wallet={aw} size={44} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sheetWalletName} numberOfLines={1}>
          {aw.name}
        </Text>
        <Text style={styles.sheetWalletSub} numberOfLines={1}>
          {isCredit
            ? `${currency} ${usedCredit.toFixed(2)} / ${currency} ${(aw.creditLimit || 0).toFixed(2)} ${t.wallets.usedLabel}`
            : `${currency} ${aw.balance.toFixed(2)}`}
        </Text>
      </View>
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} header={header}>
      <View style={styles.rows}>
        {!aw.isDefault && (
          <TouchableOpacity
            style={[styles.sheetRow, neuF.raisedSoft]}
            onPress={() => onSetDefault(aw.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.wallets.setAsDefault}
          >
            <Feather name="star" size={20} color={C.textSecondary} />
            <Text style={styles.sheetRowLabel}>{t.wallets.setAsDefault}</Text>
            {currentDefault && (
              <Text style={styles.sheetRowHint} numberOfLines={1}>
                {t.wallets.currentlyDefault} {currentDefault.name}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {isCredit && usedCredit > 0 && (
          <TouchableOpacity
            style={[styles.sheetRow, neuF.raisedSoft]}
            onPress={() => onRepay(aw.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.wallets.repayCredit}
          >
            <Feather name="corner-down-left" size={20} color={C.textSecondary} />
            <Text style={styles.sheetRowLabel}>{t.wallets.repayCredit}</Text>
            <Text style={styles.sheetRowHint}>
              {currency} {usedCredit.toFixed(2)} {t.wallets.owedSuffix}
            </Text>
          </TouchableOpacity>
        )}

        {!isCredit && canTransferFrom && (
          <TouchableOpacity
            style={[styles.sheetRow, neuF.raisedSoft]}
            onPress={() => onTransferFrom(aw.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.wallets.transferFromHere}
          >
            <Feather name="repeat" size={20} color={C.textSecondary} />
            <Text style={styles.sheetRowLabel}>{t.wallets.transferFromHere}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.sheetRow, neuF.raisedSoft]}
          onPress={() => onEdit(aw.id)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t.wallets.editDetails}
        >
          <Feather name="edit-2" size={20} color={C.textSecondary} />
          <Text style={styles.sheetRowLabel}>{t.wallets.editDetails}</Text>
        </TouchableOpacity>

        {!isCredit && (
          <TouchableOpacity
            style={[styles.sheetRow, neuF.raisedSoft]}
            onPress={() => onRecalculate(aw.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.wallets.fixBalance}
          >
            <Feather name="refresh-cw" size={20} color={C.textSecondary} />
            <Text style={styles.sheetRowLabel}>{t.wallets.fixBalance}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.sheetRow, neuF.raisedSoft, { marginTop: SPACING.xs }]}
          onPress={() => onDelete(aw.id)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t.wallets.deleteWalletAction}
        >
          <Feather name="trash-2" size={20} color={C.neutral} />
          <Text style={[styles.sheetRowLabel, { color: C.neutral, fontWeight: TYPOGRAPHY.weight.medium }]}>
            {t.wallets.deleteWalletAction}
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
