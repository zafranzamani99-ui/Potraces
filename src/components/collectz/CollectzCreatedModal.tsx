// CollectzCreatedModal — the "Session created" confirmation.
//
// Replaces the old fire-and-forget (navigate + auto-open the share sheet). After
// a session is created this floats up a summary of everything configured, plus
// the join CODE and LINK as two tap-to-copy cards, a "Share to WhatsApp" CTA, and
// a "View session" way out. Self-contained: it builds the announcement and copies
// to the clipboard itself; the parent only says where "View session" goes.
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Share } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { collectzCategoryColor } from '../../constants/collectzColors';
import { lightTap, successNotification } from '../../services/haptics';
import FloatingModal from '../common/FloatingModal';
import NeuButton from '../common/NeuButton';
import { useNeu } from '../common/neu';
import {
  CollectzSession,
  collectzUrl,
  buildWhatsappAnnouncement,
  ensureCollectzLinkReferralCode,
} from '../../services/collectzService';
import { fmtEventRange, fmtMoney, fill } from '../../screens/personal/collectz/collectzFormat';

interface Props {
  visible: boolean;
  session: CollectzSession | null;
  /** Active players — drives the "÷ N" equal-split line + the announcement. */
  activeCount: number;
  /** Everyone on the roster (active + reserve) for the summary count. */
  rosterCount: number;
  /** "View session" and backdrop dismissal both route here (→ the detail screen). */
  onOpen: () => void;
}

const CollectzCreatedModal: React.FC<Props> = ({ visible, session, activeCount, rosterCount, onOpen }) => {
  const C = useCalm();
  const t = useT();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neuF = useNeu(undefined, { faintDark: true }); // cards/wells (Onyx rule 3)
  const neuFull = useNeu(); // full neu — the success icon LIFTS off the surface
  const [copied, setCopied] = useState<null | 'code' | 'link'>(null);

  // Warm the organizer's referral code so the link below carries ?r= when copied
  // or shared (see collectzService.ensureCollectzLinkReferralCode).
  useEffect(() => {
    if (visible) void ensureCollectzLinkReferralCode();
  }, [visible]);

  if (!session) return null;
  const url = collectzUrl(session.share_code);
  // Category identity — the check badge + share CTA wear the session's color.
  const catColor = collectzCategoryColor(session.category, isDark);

  const copy = async (which: 'code' | 'link') => {
    lightTap();
    await Clipboard.setStringAsync(which === 'link' ? url : session.share_code);
    setCopied(which);
    setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  };

  const shareNow = () => {
    Share.share({ message: buildWhatsappAnnouncement(session, activeCount) }).catch(() => {});
  };

  // ── Summary lines — only the ones that carry data show ──
  const payLine =
    session.scheme === 'flat' && session.default_share != null
      ? fill(t.collectz.perPerson, { amount: fmtMoney(session.default_share, session.currency) })
      : session.scheme === 'equal' && session.total_amount != null
        ? fill(t.collectz.totalAmount, { amount: fmtMoney(session.total_amount, session.currency) })
        : session.scheme === 'custom'
          ? t.collectz.schemeCustom
          : null;
  const capLine =
    session.team_count != null && session.team_size != null
      ? fill(t.collectz.createdTeamsSummary, { t: session.team_count, n: session.team_size })
      : session.max_participants != null
        ? fill(t.collectz.createdCapSummary, { n: session.max_participants })
        : null;
  // Court/venue cost is its own line — but not for 'equal', where the total IS the split.
  const costLine =
    session.total_amount != null && session.scheme !== 'equal'
      ? fmtMoney(session.total_amount, session.currency)
      : null;

  const rows: Array<{ icon: keyof typeof Feather.glyphMap; text: string }> = [];
  const when = fmtEventRange(session.event_at, session.event_end);
  if (when) rows.push({ icon: 'calendar', text: when });
  if (session.venue) rows.push({ icon: 'map-pin', text: session.venue });
  if (payLine) rows.push({ icon: 'credit-card', text: payLine });
  if (costLine) rows.push({ icon: 'file-text', text: fill(t.collectz.createdCostSummary, { amount: costLine }) });
  if (capLine) rows.push({ icon: 'users', text: capLine });
  if (rosterCount > 0) rows.push({ icon: 'user-check', text: fill(t.collectz.createdRosterSummary, { n: rosterCount }) });

  const renderCopyCard = (which: 'code' | 'link') => {
    const active = copied === which;
    const isLink = which === 'link';
    return (
      <Pressable
        onPress={() => copy(which)}
        accessibilityRole="button"
        accessibilityLabel={isLink ? t.collectz.createdLinkHint : t.collectz.createdCodeHint}
        style={({ pressed }) => [styles.copyCard, neuF.raisedSoft, pressed && { opacity: 0.9 }]}
      >
        <View style={styles.copyLeft}>
          <Text style={styles.copyLabel}>{isLink ? t.collectz.createdLinkLabel : t.collectz.createdCodeLabel}</Text>
          <Text style={isLink ? styles.linkValue : styles.codeValue} numberOfLines={1}>
            {isLink ? url : session.share_code}
          </Text>
          <Text style={[styles.copyHint, active && styles.copyHintActive]}>
            {active
              ? isLink
                ? t.collectz.linkCopied
                : t.collectz.codeCopied
              : isLink
                ? t.collectz.createdLinkHint
                : t.collectz.createdCodeHint}
          </Text>
        </View>
        <View style={[styles.copyWell, neuF.well, active && { backgroundColor: withAlpha(C.accent, 0.12) }]}>
          <Feather name={active ? 'check' : 'copy'} size={16} color={active ? C.accent : C.textSecondary} />
        </View>
      </Pressable>
    );
  };

  return (
    <FloatingModal visible={visible} onClose={onOpen} entrance="fade" showDragHandle={false} maxWidth={440} borderless>
      <View style={styles.wrap}>
        <View style={[styles.check, neuFull.raised, { backgroundColor: withAlpha(catColor, 0.14) }]}>
          <Feather name="check" size={26} color={catColor} />
        </View>
        <Text style={styles.title}>{t.collectz.createdTitle}</Text>
        <Text style={styles.name} numberOfLines={2}>{session.title}</Text>

        {rows.length > 0 && (
          <View style={styles.summary}>
            {rows.map((r, i) => (
              <View key={i} style={styles.summaryRow}>
                <Feather name={r.icon} size={14} color={C.textMuted} style={styles.summaryIcon} />
                <Text style={styles.summaryText}>{r.text}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.shareHint}>{t.collectz.createdSubtitle}</Text>
        {renderCopyCard('code')}
        {renderCopyCard('link')}

        <NeuButton
          icon="share-2"
          label={t.collectz.createdShareCta}
          onPress={shareNow}
          color={catColor}
          style={{ marginTop: SPACING.sm }}
        />
        <Pressable
          onPress={() => { successNotification(); onOpen(); }}
          style={({ pressed }) => [styles.viewBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t.collectz.createdViewSession}
        >
          <Text style={styles.viewText}>{t.collectz.createdViewSession}</Text>
          <Feather name="arrow-right" size={16} color={C.accent} />
        </Pressable>
      </View>
    </FloatingModal>
  );
};

const makeStyles = (C: ReturnType<typeof useCalm>) =>
  StyleSheet.create({
    wrap: { padding: SPACING.lg, gap: SPACING.sm, alignItems: 'stretch' },
    check: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: SPACING.xs,
    },
    title: {
      fontSize: TYPOGRAPHY.size.xl,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      textAlign: 'center',
    },
    name: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textSecondary,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    // Summary block
    summary: {
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      gap: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    summaryIcon: { width: 16, textAlign: 'center' },
    summaryText: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
    // Share hint
    shareHint: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textMuted,
      textAlign: 'center',
      marginTop: SPACING.xs,
    },
    // Copy cards (code + link)
    copyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: C.background,
    },
    copyLeft: { flex: 1, minWidth: 0 },
    copyLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 2,
    },
    codeValue: {
      fontSize: TYPOGRAPHY.size['2xl'],
      fontWeight: TYPOGRAPHY.weight.bold,
      letterSpacing: 4,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    linkValue: { fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary },
    copyHint: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 3 },
    copyHintActive: { color: C.accent, fontWeight: TYPOGRAPHY.weight.semibold },
    copyWell: {
      width: 38,
      height: 38,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // View-session link
    viewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: SPACING.sm,
      marginTop: SPACING.xs,
    },
    viewText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
  });

export default CollectzCreatedModal;
