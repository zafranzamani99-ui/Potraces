// ─── REDEEM CODE ─────────────────────────────────────────────────────────
// Gift codes minted by the team (admin page) → redeem_code RPC. Success shows
// the granted tier + days + until; every failure reason has friendly EN/BM copy
// (see t.redeem.reason_*). Contract: docs/plans/premium-grants-and-rewards.md.

import React from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import NeuButton from '../../components/common/NeuButton';
import { useNeu } from '../../components/common/neu';
import { redeemCode } from '../../services/entitlements';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';

const RedeemCode: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const t = useT();

  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const handleRedeem = async () => {
    const input = code.trim();
    if (!input || busy) return;
    setBusy(true);
    try {
      const res = await redeemCode(input);
      if (res.ok) {
        const tier = res.tier.charAt(0).toUpperCase() + res.tier.slice(1);
        const date = res.premiumUntil ? format(res.premiumUntil, 'd MMM yyyy') : '—';
        setCode('');
        Alert.alert(
          t.redeem.successTitle,
          t.redeem.successBody
            .replace('{tier}', tier)
            .replace('{days}', String(res.days))
            .replace('{date}', date),
        );
      } else {
        const REASON_COPY: Record<string, string> = {
          invalid_code: t.redeem.reason_invalid_code,
          code_disabled: t.redeem.reason_code_disabled,
          code_expired: t.redeem.reason_code_expired,
          code_exhausted: t.redeem.reason_code_exhausted,
          already_redeemed: t.redeem.reason_already_redeemed,
          campaign_already_used: t.redeem.reason_campaign_already_used,
          rate_limited: t.redeem.reason_rate_limited,
          auth_required: t.redeem.reason_auth_required,
          network: t.redeem.reason_network,
        };
        Alert.alert(t.redeem.failedTitle, REASON_COPY[res.reason] ?? t.redeem.reason_invalid_code);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.hero, neu.raisedSoft]}>
        <Feather name="gift" size={26} color={C.accent} />
      </View>
      <Text style={styles.subtitle}>{t.redeem.subtitle}</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder={t.redeem.placeholder}
        placeholderTextColor={C.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={handleRedeem}
        keyboardAppearance={isDark ? 'dark' : 'light'}
        selectionColor={C.accent}
      />
      <NeuButton
        label={busy ? '…' : t.redeem.button}
        icon="check"
        onPress={handleRedeem}
        disabled={!code.trim() || busy}
      />
    </ScrollView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.xl, gap: SPACING.lg },
  hero: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: withAlpha(C.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: SPACING.xl,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  input: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.lg,
    color: C.textPrimary,
    textAlign: 'center',
    letterSpacing: 2,
  },
});

export default RedeemCode;
