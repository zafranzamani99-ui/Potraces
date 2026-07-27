// ─── INVITE FRIENDS ──────────────────────────────────────────────────────
// Referral hub: my code + share (referrals.ts), reward progress and the
// Collectz milestone line (referral_progress RPC), and an "enter a friend's
// code" box for eligible new accounts (server rejects the rest — the reason
// copy is shown). Contract: docs/plans/premium-grants-and-rewards.md.

import React from 'react';
import { View, Text, TextInput, StyleSheet, Share, Alert, ActivityIndicator } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import NeuButton from '../../components/common/NeuButton';
import { useNeu } from '../../components/common/neu';
import { fetchReferralProgress, claimReferral, type ReferralProgress } from '../../services/entitlements';
import { referralMessage } from '../../services/referrals';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';

const InviteFriends: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const t = useT();
  const { showToast } = useToast();

  const [progress, setProgress] = React.useState<ReferralProgress | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [friendCode, setFriendCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    fetchReferralProgress()
      .then((p) => { if (alive) { setProgress(p); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const handleShare = async () => {
    if (!progress?.code) return;
    lightTap();
    try {
      await Share.share({ message: referralMessage(progress.code) });
    } catch {
      // ignore user-cancelled
    }
  };

  const handleCopy = async () => {
    if (!progress?.code) return;
    lightTap();
    await Clipboard.setStringAsync(progress.code);
    showToast(t.rewards.copied, 'success');
  };

  const handleApplyFriendCode = async () => {
    const input = friendCode.trim();
    if (!input || busy) return;
    setBusy(true);
    try {
      const res = await claimReferral({ code: input, source: 'link', session: null });
      if (res.ok) {
        const tier = res.welcomeTier.charAt(0).toUpperCase() + res.welcomeTier.slice(1);
        setFriendCode('');
        Alert.alert(
          t.rewards.claimSuccess
            .replace('{days}', String(res.welcomeDays))
            .replace('{tier}', tier),
        );
      } else {
        const REASON_COPY: Record<string, string> = {
          invalid_code: t.rewards.reason_invalid_code,
          self_referral: t.rewards.reason_self_referral,
          same_device: t.rewards.reason_same_device,
          already_referred: t.rewards.reason_already_referred,
          account_too_old: t.rewards.reason_account_too_old,
          auth_required: t.rewards.reason_auth_required,
          network: t.rewards.reason_network,
        };
        Alert.alert(t.rewards.claimFailedTitle, REASON_COPY[res.reason] ?? t.rewards.reason_invalid_code);
      }
    } finally {
      setBusy(false);
    }
  };

  const fill = (s: string, vars: Record<string, string | number>) =>
    Object.keys(vars).reduce((out, k) => out.split(`{${k}}`).join(String(vars[k])), s);

  // Signed out / unreachable — same message the old share row alerted.
  if (loaded && !progress) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: C.background }]}>
        <Feather name="user" size={28} color={C.textMuted} />
        <Text style={styles.signInTitle}>{t.settings.signInRequired}</Text>
        <Text style={styles.signInBody}>{t.settings.signInRequiredInvite}</Text>
      </View>
    );
  }

  const settling = (progress?.pending ?? 0) + (progress?.qualified ?? 0);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {!loaded || !progress ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: SPACING['3xl'] }} />
      ) : (
        <>
          <Text style={styles.subtitle}>
            {fill(t.rewards.inviteSubtitle, { days: progress.rewardDaysEach, tier: 'Pro' })}
          </Text>

          {/* My code + share */}
          <View style={[styles.card, neu.raisedSoft]}>
            <Text style={styles.cardLabel}>{t.rewards.yourCode}</Text>
            <Text style={styles.codeValue}>{progress.code ?? '—'}</Text>
            <View style={styles.cardButtons}>
              <View style={styles.cardButton}>
                <NeuButton label={t.rewards.copy} icon="copy" onPress={handleCopy} disabled={!progress.code} />
              </View>
              <View style={styles.cardButton}>
                <NeuButton label={t.rewards.share} icon="share-2" onPress={handleShare} disabled={!progress.code} />
              </View>
            </View>
          </View>

          {/* Progress */}
          <View style={[styles.card, neu.raisedSoft]}>
            <Text style={styles.cardLabel}>{t.rewards.progressTitle}</Text>
            <View style={styles.statRow}>
              <Feather name="users" size={15} color={C.textSecondary} />
              <Text style={styles.statText}>
                {`${fill(t.rewards.joinedRewarded, { n: progress.rewarded })} · ${fill(t.rewards.joinedPending, { n: settling })}`}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Feather name="gift" size={15} color={C.textSecondary} />
              <Text style={styles.statText}>{fill(t.rewards.daysEarned, { days: progress.daysEarned })}</Text>
            </View>
            <View style={styles.statRow}>
              <Feather name="pie-chart" size={15} color={C.textSecondary} />
              <Text style={styles.statText}>
                {fill(t.rewards.capLine, { used: progress.capUsed, cap: progress.capPerYear })}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Feather name="flag" size={15} color={C.textSecondary} />
              <Text style={styles.statText}>
                {progress.milestoneDone
                  ? t.rewards.milestoneDone
                  : fill(t.rewards.milestoneLine, { have: progress.milestoneHave, needed: progress.milestoneNeeded })}
              </Text>
            </View>
          </View>

          {/* Enter a friend's code */}
          <View style={[styles.card, neu.raisedSoft]}>
            <Text style={styles.cardLabel}>{t.rewards.friendCodeTitle}</Text>
            <Text style={styles.cardHint}>{t.rewards.friendCodeHint}</Text>
            <TextInput
              style={styles.input}
              value={friendCode}
              onChangeText={setFriendCode}
              placeholder={t.rewards.friendCodePlaceholder}
              placeholderTextColor={C.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleApplyFriendCode}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
            <NeuButton
              label={busy ? '…' : t.rewards.apply}
              icon="check"
              onPress={handleApplyFriendCode}
              disabled={!friendCode.trim() || busy}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm },
  signInTitle: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary, marginTop: SPACING.sm },
  signInBody: { fontSize: TYPOGRAPHY.size.base, color: C.textSecondary, textAlign: 'center', lineHeight: 22 },
  content: { padding: SPACING.xl, gap: SPACING.lg },
  subtitle: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  cardLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardHint: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted },
  codeValue: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    textAlign: 'center',
    letterSpacing: 5,
    fontVariant: ['tabular-nums'],
  },
  cardButtons: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  cardButton: { flex: 1 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  statText: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, lineHeight: 20 },
  input: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: SPACING.xs,
  },
});

export default InviteFriends;
