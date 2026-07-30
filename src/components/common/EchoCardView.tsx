/**
 * EchoCardView — renders a filled EchoCard (see services/echoCards) inside a chat
 * reply. Surface-agnostic (pure props, no nav/store deps) so BOTH chat surfaces
 * (MoneyChat + EchoInlineChat) mount the same component. Draws whichever slots
 * the card carries: header label · hero big-number · progress bar · nested tile ·
 * icon rows · total. Onyx/neu styling to match the rest of the app.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from './neu';
import CategoryIcon from './CategoryIcon';
import { withAlpha } from '../../constants';
import { EchoCard, EchoCardRow, EchoPillTone } from '../../services/echoCards/types';
import { CARD_COLORS } from '../../services/echoCards/format';

const money2 = (n: number) =>
  Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── icon badge: brand logo / photo render self-contained; glyphs get a tinted
//    well; no icon → a colored letter tile ──
const IconBadge = ({ icon, color, name, C }: { icon?: string; color?: string; name: string; C: any }) => {
  const tint = color || C.accent;
  if (icon) {
    const selfTile = icon.startsWith('photo:') || icon.startsWith('logo/');
    return (
      <View style={[styles.badge, selfTile ? styles.badgeBare : { backgroundColor: withAlpha(tint, 0.15) }]}>
        <CategoryIcon icon={icon} size={selfTile ? (icon.startsWith('photo:') ? 27 : 34) : 20} color={tint} />
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(tint, 0.9) }]}>
      <Text style={styles.badgeLetter}>{(name || '?').trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
};

const Pill = ({ text, tone, C }: { text: string; tone?: EchoPillTone; C: any }) => {
  const map: Record<EchoPillTone, string> = {
    neutral: C.textMuted, good: C.positive, warn: CARD_COLORS.warn,
    up: CARD_COLORS.out, down: CARD_COLORS.in,
  };
  const c = map[tone || 'neutral'];
  return (
    <View style={[styles.pill, { backgroundColor: withAlpha(c, 0.16) }]}>
      <Text style={[styles.pillText, { color: c }]}>{text}</Text>
    </View>
  );
};

const Amount = ({ value, text, unit, currency, styleAmount, styleUnit }: {
  value?: number; text?: string; unit?: string; currency: string; styleAmount: any; styleUnit: any;
}) => {
  if (text != null) return <Text style={styleAmount}>{text}</Text>;
  if (value == null) return null;
  const neg = value < 0;
  return (
    <Text style={styleAmount}>
      {neg ? '- ' : ''}{currency} {money2(value)}{unit ? <Text style={styleUnit}> {unit}</Text> : null}
    </Text>
  );
};

const CardRow = ({ row, currency, C }: { row: EchoCardRow; currency: string; C: any }) => (
  <View style={styles.row}>
    <IconBadge icon={row.icon} color={row.iconColor} name={row.name} C={C} />
    <View style={styles.rowMid}>
      <Text style={[styles.rowName, { color: C.textPrimary }]} numberOfLines={1}>{row.name}</Text>
      {!!row.detail && <Text style={[styles.rowDetail, { color: C.textMuted }]} numberOfLines={1}>{row.detail}</Text>}
    </View>
    <View style={styles.rowRight}>
      {!!row.pill && <Pill text={row.pill.text} tone={row.pill.tone} C={C} />}
      {(row.amount != null || row.amountText != null) && (
        <Amount
          value={row.amount} text={row.amountText} unit={row.unit} currency={currency}
          styleAmount={[styles.rowAmount, { color: C.textPrimary }]}
          styleUnit={[styles.rowUnit, { color: C.textMuted }]}
        />
      )}
    </View>
  </View>
);

const EchoCardView = React.memo(({ card }: { card: EchoCard }) => {
  const C = useCalm();
  const neu = useNeu(undefined, { faintDark: true });
  const accent =
    card.accent === 'gold' ? C.gold :
    card.accent === 'teal' ? C.positive :
    card.accent === 'warn' ? CARD_COLORS.warn : C.accent;
  const cardStyle = useMemo(() => ({ backgroundColor: C.background }), [C]);

  const { hero, tile, rows, total, progress } = card;

  return (
    <View style={[neu.raisedSoft, styles.card, cardStyle]}>
      {/* header label */}
      <View style={styles.labelRow}>
        {!!card.icon && <Feather name={card.icon as any} size={12} color={accent} />}
        <Text style={[styles.label, { color: accent }]}>{card.label}</Text>
      </View>

      {/* hero big number */}
      {!!hero && (
        <View style={styles.heroWrap}>
          {hero.amountText != null ? (
            <Text style={[styles.heroAmount, { color: C.textPrimary }]}>{hero.amountText}</Text>
          ) : hero.amount != null ? (
            <Text style={[styles.heroAmount, { color: C.textPrimary }]}>
              {hero.amount < 0 ? '- ' : ''}
              <Text style={[styles.heroCur, { color: C.textMuted }]}>{card.currency} </Text>
              {money2(hero.amount)}
              {!!hero.unit && <Text style={[styles.heroUnit, { color: C.textSecondary }]}> {hero.unit}</Text>}
            </Text>
          ) : null}
          {!!hero.subline && <Text style={[styles.subline, { color: C.textMuted }]}>{hero.subline}</Text>}
        </View>
      )}

      {/* progress */}
      {!!progress && (
        <View style={styles.progressWrap}>
          <View style={[styles.track, { backgroundColor: withAlpha(C.textPrimary, 0.08) }]}>
            <View style={[styles.fill, { backgroundColor: accent, width: `${Math.max(0, Math.min(100, progress.pct))}%` }]} />
          </View>
          {(!!progress.footLeft || !!progress.footRight) && (
            <View style={styles.progressFoot}>
              <Text style={[styles.footText, { color: C.textMuted }]}>{progress.footLeft || ''}</Text>
              <Text style={[styles.footText, { color: C.textMuted }]}>{progress.footRight || ''}</Text>
            </View>
          )}
        </View>
      )}

      {/* nested tile */}
      {!!tile && (
        <View style={[styles.tile, { backgroundColor: withAlpha(C.textPrimary, 0.04) }]}>
          <IconBadge icon={tile.icon} color={tile.iconColor} name={tile.name} C={C} />
          <View style={styles.rowMid}>
            {!!tile.topLabel && <Text style={[styles.tileTop, { color: C.textMuted }]}>{tile.topLabel}</Text>}
            <Text style={[styles.tileName, { color: C.textPrimary }]} numberOfLines={1}>{tile.name}</Text>
          </View>
          <View style={styles.rowRight}>
            <Amount
              value={tile.amount} text={tile.amountText} currency={card.currency}
              styleAmount={[styles.rowAmount, { color: C.textPrimary }]} styleUnit={[]}
            />
            {!!tile.unit && <Text style={[styles.rowUnit, { color: C.textMuted }]}>{tile.unit}</Text>}
          </View>
        </View>
      )}

      {/* rows */}
      {!!rows?.length && (
        <View style={styles.rows}>
          {rows.map((r, i) => (
            <View key={i}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: withAlpha(C.textPrimary, 0.06) }]} />}
              <CardRow row={r} currency={card.currency} C={C} />
            </View>
          ))}
        </View>
      )}

      {/* total */}
      {!!total && (
        <View style={[styles.totalRow, { borderTopColor: withAlpha(C.textPrimary, 0.08) }]}>
          <Text style={[styles.totalLabel, { color: C.textSecondary }]}>{total.label}</Text>
          <Amount
            value={total.amount} text={total.amountText} unit={total.unit} currency={card.currency}
            styleAmount={[styles.totalValue, { color: C.textPrimary }]}
            styleUnit={[styles.rowUnit, { color: C.textMuted }]}
          />
        </View>
      )}
    </View>
  );
});

EchoCardView.displayName = 'EchoCardView';
export default EchoCardView;

const styles = StyleSheet.create({
  card: { alignSelf: 'flex-start', width: '90%', maxWidth: 460, borderRadius: 20, padding: 16, marginTop: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  label: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '700' },

  heroWrap: { marginBottom: 12 },
  heroAmount: { fontSize: 38, fontWeight: '800', letterSpacing: -1, lineHeight: 42, fontVariant: ['tabular-nums'] },
  heroCur: { fontSize: 19, fontWeight: '600', letterSpacing: 0 },
  heroUnit: { fontSize: 16, fontWeight: '600' },
  subline: { fontSize: 13, marginTop: 5, lineHeight: 18 },

  progressWrap: { marginBottom: 12 },
  track: { height: 9, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  progressFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  footText: { fontSize: 12, fontVariant: ['tabular-nums'] },

  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 11, marginBottom: 4 },
  tileTop: { fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700' },
  tileName: { fontSize: 15, fontWeight: '600', marginTop: 2 },

  rows: { marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowMid: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14.5, fontWeight: '600' },
  rowDetail: { fontSize: 12, marginTop: 1 },
  rowRight: { alignItems: 'flex-end', gap: 3 },
  rowAmount: { fontSize: 14.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rowUnit: { fontSize: 11 },
  divider: { height: 1 },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },

  badge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeBare: { backgroundColor: 'transparent' },
  badgeLetter: { color: '#fff', fontSize: 16, fontWeight: '800' },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '700' },
});
