// ─── EARN PRO · SHARE PANE ─────────────────────────────────────────────────
// Share & Earn Pro submit flow (AUGUST.md, decided 2026-07-29): post about
// the app WITH a screenshot on Instagram / 小红书 (RED) / Reddit / Facebook /
// X / Threads → paste the post URL (+ optional proof screenshot) → the team
// reviews the like count by hand (admin Rewards tab) and approves a tier
// (30+ likes → 1 month · 100+ → 1 year · viral → forever). Rules source of
// truth: src/utils/shareRewardRules.ts; backend: share-reward-submit edge
// function + migration 20260806110000_share_reward_submissions.sql.

import React from 'react';
import { View, Text, TextInput, StyleSheet, Alert, ActivityIndicator, Image, Pressable } from 'react-native';
import PageScrollView from '../../../components/common/PageScrollView';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import NeuButton from '../../../components/common/NeuButton';
import { useNeu } from '../../../components/common/neu';
import {
  submitShareReward,
  fetchMyShareRewards,
  type MyShareReward,
} from '../../../services/shareReward';
import {
  SHARE_PLATFORMS,
  SHARE_REWARD_CAP_PER_YEAR,
  SHARE_MIN_ACCOUNT_AGE_DAYS,
  type SharePlatform,
} from '../../../utils/shareRewardRules';
import { lightTap, selectionChanged } from '../../../services/haptics';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../../constants';
import { useCalm, useIsDark } from '../../../hooks/useCalm';
import { useT } from '../../../i18n';

const SharePane: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const t = useT();

  const [mine, setMine] = React.useState<MyShareReward[] | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [platform, setPlatform] = React.useState<SharePlatform>('instagram');
  const [postUrl, setPostUrl] = React.useState('');
  const [shotUri, setShotUri] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const PLATFORM_LABELS: Record<SharePlatform, string> = {
    instagram: t.shareEarn.platformInstagram,
    red: t.shareEarn.platformRed,
    reddit: t.shareEarn.platformReddit,
    facebook: t.shareEarn.platformFacebook,
    x: t.shareEarn.platformX,
    threads: t.shareEarn.platformThreads,
  };

  React.useEffect(() => {
    let alive = true;
    fetchMyShareRewards()
      .then((rows) => { if (alive) { setMine(rows); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const fill = (s: string, vars: Record<string, string | number>) =>
    Object.keys(vars).reduce((out, k) => out.split(`{${k}}`).join(String(vars[k])), s);

  const handlePickShot = async () => {
    lightTap();
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    const uri = res.canceled ? null : (res.assets?.[0]?.uri ?? null);
    if (uri) setShotUri(uri);
  };

  const handleSubmit = async () => {
    if (busy || !postUrl.trim()) return;
    setBusy(true);
    try {
      const res = await submitShareReward({ platform, postUrl, screenshotUri: shotUri });
      if (res.ok) {
        setPostUrl('');
        setShotUri(null);
        Alert.alert(t.shareEarn.submittedTitle, t.shareEarn.submittedBody);
        // Refresh "your submissions" so the new row shows as in review.
        const rows = await fetchMyShareRewards();
        if (rows) setMine(rows);
      } else {
        const REASON_COPY: Record<string, string> = {
          invalid_url: t.shareEarn.reason_invalid_url,
          wrong_platform: t.shareEarn.reason_wrong_platform,
          already_submitted: t.shareEarn.reason_already_submitted,
          account_too_new: fill(t.shareEarn.reason_account_too_new, { days: SHARE_MIN_ACCOUNT_AGE_DAYS }),
          year_cap_reached: fill(t.shareEarn.reason_year_cap_reached, { cap: SHARE_REWARD_CAP_PER_YEAR }),
          auth_required: t.shareEarn.reason_auth_required,
          network: t.shareEarn.reason_network,
        };
        Alert.alert(t.shareEarn.failedTitle, REASON_COPY[res.reason] ?? t.shareEarn.reason_network);
      }
    } finally {
      setBusy(false);
    }
  };

  // Signed out / unreachable — same discipline as the Invite pane.
  if (loaded && mine === null) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <Feather name="user" size={28} color={C.textMuted} />
        <Text style={styles.signInTitle}>{t.settings.signInRequired}</Text>
        <Text style={styles.signInBody}>{t.shareEarn.signInBody}</Text>
      </View>
    );
  }

  return (
    <PageScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {!loaded ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: SPACING['3xl'] }} />
      ) : (
        <>
          {/* How it works */}
          <View style={[styles.card, neu.raisedSoft]}>
            <Text style={styles.cardTitle}>{t.shareEarn.howTitle}</Text>
            <Text style={styles.cardBody}>{t.shareEarn.howBody}</Text>
            <View style={styles.tierRow}>
              <Feather name="heart" size={14} color={C.accent} />
              <Text style={styles.tierText}>{t.shareEarn.tierMonth}</Text>
            </View>
            <View style={styles.tierRow}>
              <Feather name="trending-up" size={14} color={C.accent} />
              <Text style={styles.tierText}>{t.shareEarn.tierYear}</Text>
            </View>
            <View style={styles.tierRow}>
              <Feather name="zap" size={14} color={C.accent} />
              <Text style={styles.tierText}>{t.shareEarn.tierForever}</Text>
            </View>
          </View>

          {/* Submit form */}
          <View style={[styles.card, neu.raisedSoft]}>
            <Text style={styles.cardLabel}>{t.shareEarn.platformLabel}</Text>
            <View style={styles.pills}>
              {SHARE_PLATFORMS.map((p) => {
                const active = p === platform;
                return (
                  <Pressable
                    key={p}
                    onPress={() => { if (!active) { selectionChanged(); setPlatform(p); } }}
                    style={[styles.pill, neu.raisedSoft, active && styles.pillActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{PLATFORM_LABELS[p]}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.cardLabel}>{t.shareEarn.urlLabel}</Text>
            <TextInput
              style={styles.input}
              value={postUrl}
              onChangeText={setPostUrl}
              placeholder={t.shareEarn.urlPlaceholder}
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />

            <Text style={styles.cardLabel}>{t.shareEarn.shotLabel}</Text>
            {shotUri ? (
              <View style={styles.shotRow}>
                <Image source={{ uri: shotUri }} style={styles.shotThumb} />
                <Pressable onPress={() => { lightTap(); setShotUri(null); }} style={styles.shotRemove} accessibilityRole="button">
                  <Feather name="x" size={14} color={C.textSecondary} />
                  <Text style={styles.shotRemoveText}>{t.shareEarn.shotRemove}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={handlePickShot} style={styles.shotAdd} accessibilityRole="button">
                <Feather name="image" size={15} color={C.accent} />
                <Text style={styles.shotAddText}>{t.shareEarn.shotAdd}</Text>
              </Pressable>
            )}
            <Text style={styles.cardHint}>{t.shareEarn.shotHint}</Text>

            <NeuButton
              label={busy ? '…' : t.shareEarn.submit}
              icon="send"
              onPress={handleSubmit}
              disabled={!postUrl.trim() || busy}
            />
            <Text style={styles.rulesNote}>
              {fill(t.shareEarn.rulesNote, { cap: SHARE_REWARD_CAP_PER_YEAR, days: SHARE_MIN_ACCOUNT_AGE_DAYS })}
            </Text>
          </View>

          {/* My submissions */}
          <View style={[styles.card, neu.raisedSoft]}>
            <Text style={styles.cardLabel}>{t.shareEarn.mySubmissions}</Text>
            {(mine ?? []).length === 0 ? (
              <Text style={styles.cardHint}>{t.shareEarn.emptySubmissions}</Text>
            ) : (
              (mine ?? []).map((row) => (
                <View key={row.id} style={styles.subRow}>
                  <View style={styles.subMain}>
                    <Text style={styles.subPlatform}>{PLATFORM_LABELS[row.platform] ?? row.platform}</Text>
                    <Text style={styles.subUrl} numberOfLines={1}>{row.post_url}</Text>
                  </View>
                  {row.status === 'approved' ? (
                    <Text style={styles.subApproved}>
                      {fill(t.shareEarn.approvedLine, { days: row.awarded_days ?? 0 })}
                    </Text>
                  ) : (
                    <Text style={row.status === 'rejected' ? styles.subRejected : styles.subPending}>
                      {row.status === 'rejected' ? t.shareEarn.statusRejected : t.shareEarn.statusPending}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        </>
      )}
    </PageScrollView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm },
  signInTitle: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary, marginTop: SPACING.sm },
  signInBody: { fontSize: TYPOGRAPHY.size.base, color: C.textSecondary, textAlign: 'center', lineHeight: 22 },
  content: { padding: SPACING.xl, gap: SPACING.lg },
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  cardTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  cardBody: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, lineHeight: 20, marginBottom: SPACING.xs },
  cardLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: SPACING.xs,
  },
  cardHint: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  tierText: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, lineHeight: 20 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.full,
  },
  pillActive: { backgroundColor: C.accent },
  pillText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary },
  pillTextActive: { color: C.onAccent, fontWeight: TYPOGRAPHY.weight.bold },
  input: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  shotAdd: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
  shotAddText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
  shotRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  shotThumb: { width: 56, height: 56, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border },
  shotRemove: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  shotRemoveText: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
  rulesNote: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, lineHeight: 17, marginTop: SPACING.xs },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
  },
  subMain: { flex: 1, gap: 1 },
  subPlatform: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
  subUrl: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted },
  subPending: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary },
  subApproved: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.bold, color: C.positive },
  subRejected: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textMuted },
});

export default SharePane;
