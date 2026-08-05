import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl, Image, Modal } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useNeu } from '../../components/common/neu';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { supabasePersonal } from '../../services/supabase';
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
  const [shotUrls, setShotUrls] = useState<Record<string, string>>({}); // storage path -> signed URL
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null); // fullscreen photo viewer

  const load = useCallback(async () => {
    setError(false);
    try {
      const rows = await listMyFeedback();
      setSignedOut(false);
      setReports(rows);
      // Sign every attached screenshot so the thumbnails render (owner read
      // policy lets a user sign their own <uid>/ files).
      const paths = rows.flatMap((r) => shotPathsOf(r));
      if (paths.length) {
        const { data: signed } = await supabasePersonal.storage
          .from('beta-screenshots')
          .createSignedUrls(paths, 3600);
        const map: Record<string, string> = {};
        if (Array.isArray(signed)) {
          for (const s of signed) if (s?.path && s?.signedUrl) map[s.path] = s.signedUrl;
        }
        setShotUrls(map);
      } else {
        setShotUrls({});
      }
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
              {(() => {
                const urls = shotPathsOf(r)
                  .map((p) => shotUrls[p])
                  .filter((u): u is string => !!u);
                if (!urls.length) return null;
                return (
                  <View style={styles.shotsRow}>
                    {urls.map((u) => (
                      <TouchableOpacity key={u} onPress={() => { lightTap(); setViewerUrl(u); }} activeOpacity={0.85}>
                        <Image source={{ uri: u }} style={styles.shot} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}
            </View>
          );
        })}
      </ScrollView>

      {/* Fullscreen photo viewer: opaque black page, X at top right,
          tap the photo to close */}
      <Modal
        visible={!!viewerUrl}
        animationType="fade"
        onRequestClose={() => setViewerUrl(null)}
      >
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity
            style={styles.viewerTapArea}
            activeOpacity={1}
            onPress={() => setViewerUrl(null)}
          >
            {viewerUrl && (
              <Image source={{ uri: viewerUrl }} style={styles.viewerImg} resizeMode="contain" />
            )}
          </TouchableOpacity>
          {/* Big bottom close button, impossible to miss */}
          <TouchableOpacity
            style={[styles.viewerCloseBottom, { bottom: insets.bottom + 28 }]}
            onPress={() => setViewerUrl(null)}
            hitSlop={12}
          >
            <Feather name="x" size={26} color="#000" />
          </TouchableOpacity>
        </View>
      </Modal>
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

/** All screenshot storage paths attached to a report (single web one + the in-app array). */
function shotPathsOf(r: MyFeedbackReport): string[] {
  return [
    ...(r.screenshot_path ? [r.screenshot_path] : []),
    ...(Array.isArray(r.screenshot_paths) ? r.screenshot_paths : []),
  ];
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
  shotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  shot: { width: 72, height: 72, borderRadius: RADIUS.md },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerTapArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImg: { width: '100%', height: '85%' },
  viewerCloseBottom: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 2,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default FeedbackReports;
