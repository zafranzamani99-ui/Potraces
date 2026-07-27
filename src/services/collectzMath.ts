// Collectz — pure share/progress math.
//
// Kept free of RN/expo imports so it runs under plain tsx (see
// scripts/test-collectz-math.ts) and inside any JS runtime.
// MUST stay in lockstep with effectiveShares() in supabase/functions/collectz-join.

export type CollectzSchemeLike = 'flat' | 'equal' | 'custom';

export interface CollectzSchemeInput {
  scheme: CollectzSchemeLike;
  total_amount: number | null;
  default_share: number | null;
}

export interface CollectzShareRow {
  id: string;
  slot: 'active' | 'reserve';
  share_amount: number | null;
  status?: string;
  /** Membership gate (join approval) — absent means an approved member. */
  join_status?: string;
}

/** Approved + playing rows — the only ones that pay or count toward splits. */
function isPayingMember(p: CollectzShareRow): boolean {
  return p.slot === 'active' && (p.join_status ?? 'active') === 'active';
}

/**
 * Effective per-person share for every ACTIVE participant, in roster order.
 * Custom amount wins; otherwise the scheme default. Reserves pay nothing and
 * are excluded from the map — so are requested/declined joins (they're not
 * roster members yet). Equal splits are cent-exact — remainder cents go
 * to the earliest entries so shares always sum back to the total.
 */
export function computeShares(
  session: CollectzSchemeInput,
  participants: CollectzShareRow[],
): Map<string, number | null> {
  const actives = participants.filter(isPayingMember);
  const out = new Map<string, number | null>();

  let equalCents: number[] = [];
  if (session.scheme === 'equal' && session.total_amount != null && actives.length > 0) {
    const totalCents = Math.round(session.total_amount * 100);
    const base = Math.floor(totalCents / actives.length);
    const rem = totalCents - base * actives.length;
    equalCents = actives.map((_, i) => base + (i < rem ? 1 : 0));
  }

  actives.forEach((p, i) => {
    if (p.share_amount != null) out.set(p.id, p.share_amount);
    else if (session.scheme === 'flat') out.set(p.id, session.default_share);
    else if (session.scheme === 'equal') out.set(p.id, equalCents.length > 0 ? equalCents[i] / 100 : null);
    else out.set(p.id, null);
  });
  return out;
}

/** Organizer-side rollup: confirmed vs target, in ringgit. */
export function computeProgress(
  session: CollectzSchemeInput,
  participants: CollectzShareRow[],
): { activeCount: number; confirmedCount: number; target: number | null; confirmed: number } {
  const shares = computeShares(session, participants);
  const actives = participants.filter(isPayingMember);
  const confirmed = actives.filter((p) => p.status === 'confirmed');
  const sum = (rows: CollectzShareRow[]) => rows.reduce((acc, p) => acc + (shares.get(p.id) ?? 0), 0);
  return {
    activeCount: actives.length,
    confirmedCount: confirmed.length,
    target: actives.some((p) => shares.get(p.id) == null) ? null : sum(actives),
    confirmed: sum(confirmed),
  };
}
