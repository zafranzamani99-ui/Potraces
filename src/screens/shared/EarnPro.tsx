// ─── EARN PRO — the rewards hub ────────────────────────────────────────────
// One screen replacing the old InviteFriends + RedeemCode stack screens
// (AUGUST.md "Earn Pro hub", decided 2026-07-29): segmented Neu pills
// Invite · Share · Redeem. Invite = referral hub, Share = Share & Earn Pro
// submit flow, Redeem = gift codes (+ the clipboard invite-token read — it
// stays behind the Redeem tab so the iOS paste prompt only fires on a
// referral surface, exactly like the standalone RedeemCode screen).
//
// Panes are LAZY-MOUNTED then KEPT ALIVE: a pane first renders when its tab
// is opened (so the Redeem pane's clipboard read fires only on a Redeem
// visit), and stays mounted afterwards (typed input / scroll position
// survive tab switches). The legacy InviteFriends / RedeemCode route names
// still resolve here via initialParams (see RootNavigator).

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useNeu } from '../../components/common/neu';
import InvitePane from './earnPro/InvitePane';
import SharePane from './earnPro/SharePane';
import RedeemPane from './earnPro/RedeemPane';
import { selectionChanged } from '../../services/haptics';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import type { RootStackParamList } from '../../types';

export type EarnProTab = 'invite' | 'share' | 'redeem';
const TABS: EarnProTab[] = ['invite', 'share', 'redeem'];

const isTab = (v: unknown): v is EarnProTab => v === 'invite' || v === 'share' || v === 'redeem';

const EarnPro: React.FC = () => {
  const C = useCalm();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const t = useT();
  const route = useRoute<RouteProp<RootStackParamList, 'EarnPro'>>();

  const initial: EarnProTab = isTab(route.params?.tab) ? route.params.tab : 'invite';
  const [tab, setTab] = React.useState<EarnProTab>(initial);
  const [visited, setVisited] = React.useState<Record<EarnProTab, boolean>>(() => ({
    invite: initial === 'invite',
    share: initial === 'share',
    redeem: initial === 'redeem',
  }));

  const LABELS: Record<EarnProTab, string> = {
    invite: t.shareEarn.tabInvite,
    share: t.shareEarn.tabShare,
    redeem: t.shareEarn.tabRedeem,
  };

  const select = (next: EarnProTab) => {
    if (next === tab) return;
    selectionChanged();
    setTab(next);
    setVisited((v) => (v[next] ? v : { ...v, [next]: true }));
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* Segmented Neu pills — Invite · Share · Redeem */}
      <View style={styles.segRow}>
        {TABS.map((key) => {
          const active = key === tab;
          return (
            <Pressable
              key={key}
              onPress={() => select(key)}
              style={[styles.segPill, neu.raisedSoft, active && styles.segPillActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={LABELS[key]}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{LABELS[key]}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Panes: mounted on first visit, kept alive afterwards. */}
      {TABS.map((key) =>
        visited[key] ? (
          <View key={key} style={key === tab ? styles.paneVisible : styles.paneHidden}>
            {key === 'invite' ? <InvitePane /> : key === 'share' ? <SharePane /> : <RedeemPane />}
          </View>
        ) : null,
      )}
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1 },
  segRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  segPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.full,
  },
  segPillActive: { backgroundColor: C.accent },
  segText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary },
  segTextActive: { color: C.onAccent, fontWeight: TYPOGRAPHY.weight.bold },
  paneVisible: { flex: 1 },
  paneHidden: { flex: 1, display: 'none' },
});

export default EarnPro;
