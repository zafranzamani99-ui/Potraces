import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useNeu } from '../../components/common/neu';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import {
  listMyFeedback,
  NotSignedInError,
  type MyFeedbackReport,
  type FeedbackStatus,
} from '../../services/betaFeedback';

/**
 * "Your reports" — the signed-in user's own submitted bug/idea reports with their
 * current status, so they can track progress ("you asked, we fixed it"). RLS
 * scopes the query to their own rows. Reached from Settings, Help & Community.
 */
const FeedbackReports: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const insets = useSafeAreaInsets();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();

  const [reports, setReports] = useState<MyFeedbackReport[] | null>(null); // null = loading
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const rows = await listMyFeedback();
      setSignedOut(false);
      setReports(rows);
    } catch (e) {
      if (e instanceof NotSignedInError) {
        setSignedOut(true);
        setReports([]);
      } else {
        setError(true);
        setReports([]);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const statusMeta = useCallback(
    (s: FeedbackStatus): { label: string; color: string } => {
      switch (s) {
        case 'fixed': return { label: t.settings.frStatusFixed, color: C.positive };
        case 'done': return { label: t.settings.frStatusDone, color: C.positive };
        case 'triaged': return { label: t.settings.frStatusTriaged, color: C.gold };
        case 'wontfix': return { label: t.settings.frStatusWontfix, color: C.textMuted };
        case 'dup': return { label: t.settings.frStatusDup, color: C.textMuted };
        case 'new':
        default: return { label: t.settings.frStatusNew, color: C.textSecondary };
      }
    },
    [t, C],
  );

  if (reports === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  if (signedOut) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>{t.settings.frSignedOut}</Text>
        <TouchableOpacity
          style={[styles.signInBtn, neu.raised]}
          onPress={() => { lightTap(); navigation.navigate('Account', { returnTo: 'FeedbackReports' }); }}
          activeOpacity={0.8}
        >
          <Text style={styles.signInText}>{t.settings.frSignIn}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {error && <Text style={styles.emptyText}>{t.settings.frError}</Text>}
        {!error && reports.length === 0 && <Text style={styles.emptyText}>{t.settings.frEmpty}</Text>}
        {reports.map((r) => {
          const meta = statusMeta(r.status);
          const kind = r.severity === 'idea' ? t.settings.fbIdea : t.settings.fbBug;
          return (
            <View key={r.id} style={[styles.card, neu.raisedSoft]}>
              <View style={styles.cardHead}>
                <View style={[styles.statusChip, { backgroundColor: withAlpha(meta.color, 0.14) }]}>
                  <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
                <Text style={styles.kind}>{kind}</Text>
                <Text style={styles.date}>{fmtDate(r.created_at)}</Text>
              </View>
              <Text style={styles.body}>{r.body}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, maxWidth: 680, width: '100%', alignSelf: 'center' as const },
  center: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.size.base,
    lineHeight: 22,
    color: C.textMuted,
    textAlign: 'center',
  },
  signInBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  signInText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  card: {
    borderRadius: RADIUS.lg,
    backgroundColor: C.background,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  statusChip: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
  },
  statusText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
  },
  kind: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  date: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginLeft: 'auto',
  },
  body: {
    fontSize: TYPOGRAPHY.size.base,
    lineHeight: 21,
    color: C.textPrimary,
  },
});

export default FeedbackReports;
