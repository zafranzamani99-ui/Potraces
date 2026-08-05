import { importRowKey, ImportRowKey } from './importDedup';
import type { Transaction } from '../types';

/**
 * A parsed statement/CSV row awaiting reconciliation against existing transactions.
 * Structurally the import-dedup identity shape: wallet + day + sen amount + type +
 * (description — only Tier 0 ever looks at it) — plus optional FX originals. When
 * the parser supplies the foreign amount/currency, the FX-exact pass (between
 * tiers 1 and 2) matches on them; every other tier ignores them.
 */
export type MatchCandidate = ImportRowKey & {
  originalAmount?: number | null;
  originalCurrency?: string | null;
};

export type MatchTier = 0 | 1 | 2 | 'new';

export type MatchResult = {
  tier: MatchTier;
  matchedTxId?: string;
  matchedWalletId?: string;
  dateGapDays?: number;
};

/**
 * Local calendar-day serial: the LOCAL y/m/d rendered as a day number so tiers 1/2
 * can subtract for |Δdate| in calendar days. Mirrors the dayKey() extraction in
 * importDedup.ts (getFullYear/getMonth/getDate — local time, time-of-day ignored);
 * Date.UTC normalizes month/year overflow so e.g. Jan 31 → Feb 2 is exactly 2 days.
 * Returns null for invalid dates.
 */
function daySerial(d: Date | string | number): number | null {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  // Exact integer: UTC midnights are whole multiples of 86 400 000 ms.
  return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / 86400000;
}

/** Sen-exact amount — same normalization importRowKey uses (no float drift, no tolerance). */
function senOf(amount: number): number {
  return Math.round((Number(amount) || 0) * 100);
}

/**
 * FX identity for the FX-exact pass: the original amount in original-unit sen +
 * uppercase-normalized 3-letter currency. Null when unusable (amount missing,
 * non-finite or ≤0, or currency not a 3-letter code) — such rows simply never
 * FX-match and fall back to the plain sen-bucket rules.
 */
function fxIdentity(
  amount: number | null | undefined,
  currency: string | null | undefined,
): { fxSen: number; fxCurrency: string } | null {
  const a = Number(amount);
  const cur = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  if (!Number.isFinite(a) || a <= 0 || !/^[A-Z]{3}$/.test(cur)) return null;
  return { fxSen: Math.round(a * 100), fxCurrency: cur };
}

type IndexedRow = {
  tx: Transaction;
  day: number | null;
  sen: number;
  wallet: string; // '' when undefined — same normalization as importRowKey
  walletDefined: boolean;
  hasFx: boolean; // originalAmount set → FX involvement forces Tier 2, never plain Tier 1 (the FX-exact pass may still upgrade it)
  fxSen: number | null; // originalAmount in original-unit sen, when a usable FX identity exists
  fxCurrency: string | null; // uppercase-normalized 3-letter currency, when usable
  claimed: boolean;
  ord: number; // stable order → deterministic pairing
};

type Parsed = {
  day: number;
  sen: number;
  type: 'income' | 'expense';
  wallet: string;
  walletDefined: boolean;
  fxSen: number | null;
  fxCurrency: string | null;
};

/**
 * Reconciliation matching engine (design doc §3). Pure, synchronous, client-side.
 *
 * Returns a MatchResult[] parallel to `candidates`:
 *  - tier 0: exact re-import key (importRowKey) — silent skip. Multiset-aware:
 *    N identical candidates are skipped only while N unmatched identical existing
 *    rows remain.
 *  - tier 1: same wallet + exact sen amount + same type + |Δdate| ≤ 2 calendar days
 *    — auto "already logged". FX-exact pairs also land here: both sides carry the
 *    same original foreign amount (to the sen in the original unit) and currency,
 *    same wallet, |Δdate| ≤ 7 — identity-grade evidence (the foreign original is
 *    stable; the settled MYR figure drifts with the rate), so it outranks review.
 *  - tier 2: same wallet with |Δdate| 3–7 days, OR any same-wallet |Δdate| ≤ 7 match
 *    where the existing row has originalAmount set (FX — settled ≠ authorized, never
 *    auto-decided unless the FX-exact pass above upgrades it), OR cross-wallet
 *    (both walletIds defined and different) with exact amount + type + |Δdate| ≤ 7
 *    — human review.
 *  - 'new': no match.
 *
 * Hard rules (§3):
 *  - Amount equality is exact to the sen; description is NEVER consulted for tiers
 *    1/2 (only tier 0's key contains it).
 *  - One-to-one assignment across the whole candidate set: each existing row is
 *    claimed by at most one candidate, each candidate matches at most one row.
 *    Passes run tier 0 → 1 → FX-exact → 2, same-wallet before cross-wallet, so a
 *    cross-wallet claim can never steal a row another candidate can same-wallet
 *    match; within a pass, pairs are formed greedily by smallest date gap.
 *  - Every existing transaction is eligible regardless of inputMethod (manual,
 *    share, quick-log, earlier imports) — cross-channel matching is the point.
 *  - Candidates with an invalid date or a non-finite/≤0 amount never match
 *    (callers pre-filter; this is defensive).
 */
export function matchTransactions(existing: Transaction[], candidates: MatchCandidate[]): MatchResult[] {
  // Index existing rows once. Tiers 1/2 look up a (senAmount, type) bucket instead
  // of scanning all rows per candidate — ~O(n + eligible pairs), not O(n²).
  // (§3: consumer volumes make even the naive scan trivial, but the bucketing is free.)
  const rows: IndexedRow[] = existing.map((tx, ord) => {
    const fx = fxIdentity(tx.originalAmount, tx.originalCurrency);
    return {
      tx,
      day: daySerial(tx.date),
      sen: senOf(tx.amount),
      wallet: tx.walletId ?? '',
      walletDefined: tx.walletId != null && tx.walletId !== '',
      hasFx: tx.originalAmount != null,
      fxSen: fx?.fxSen ?? null,
      fxCurrency: fx?.fxCurrency ?? null,
      claimed: false,
      ord,
    };
  });

  const bySenType = new Map<string, IndexedRow[]>();
  // FX-carrying rows get a second index by foreign identity — the (sen|type)
  // bucket can't find FX-exact pairs because the settled MYR amounts may differ.
  // FX rows are rare, so this map stays tiny.
  const byFxKey = new Map<string, IndexedRow[]>();
  const tier0Queues = new Map<string, { rows: IndexedRow[]; i: number }>();
  for (const r of rows) {
    const bk = `${r.sen}|${r.tx.type}`;
    let b = bySenType.get(bk);
    if (!b) bySenType.set(bk, (b = []));
    b.push(r);
    if (r.fxSen !== null && r.fxCurrency) {
      const fk = `${r.fxSen}|${r.fxCurrency}|${r.tx.type}`;
      let fb = byFxKey.get(fk);
      if (!fb) byFxKey.set(fk, (fb = []));
      fb.push(r);
    }
    const k0 = importRowKey(r.tx);
    let q = tier0Queues.get(k0);
    if (!q) tier0Queues.set(k0, (q = { rows: [], i: 0 }));
    q.rows.push(r);
  }

  const results: (MatchResult | null)[] = candidates.map(() => null);

  // Parse + validate candidates up front. Invalid rows (bad date, non-finite or
  // ≤0 amount) stay null and fall through every pass to 'new'.
  const parsed: (Parsed | null)[] = candidates.map((c) => {
    const day = daySerial(c.date);
    const amount = Number(c.amount);
    if (day === null || !Number.isFinite(amount) || amount <= 0) return null;
    const fx = fxIdentity(c.originalAmount, c.originalCurrency);
    return {
      day,
      sen: senOf(amount),
      type: c.type,
      wallet: c.walletId ?? '',
      walletDefined: c.walletId != null && c.walletId !== '',
      fxSen: fx?.fxSen ?? null,
      fxCurrency: fx?.fxCurrency ?? null,
    };
  });

  // --- Tier 0: exact re-import key, multiset semantics (consume one existing row
  // per identical candidate, FIFO per key). Consumed rows are unavailable later.
  candidates.forEach((c, ci) => {
    if (!parsed[ci]) return;
    const q = tier0Queues.get(importRowKey(c));
    if (!q) return;
    while (q.i < q.rows.length && q.rows[q.i].claimed) q.i++;
    if (q.i < q.rows.length) {
      const r = q.rows[q.i];
      r.claimed = true;
      results[ci] = { tier: 0, matchedTxId: r.tx.id, matchedWalletId: r.tx.walletId, dateGapDays: 0 };
    }
  });

  // One-to-one greedy pass: collect every eligible (candidate, row) pair, then
  // assign by smallest date gap first; a claimed row / matched candidate is skipped.
  // `bucketFor` picks which existing-row index the pass scans — the (sen|type)
  // bucket for MYR-identity passes, the (fxSen|CURRENCY|type) bucket for FX-exact.
  const runPass = (
    tier: 1 | 2,
    eligible: (c: Parsed, r: IndexedRow, gap: number) => boolean,
    bucketFor: (c: Parsed) => IndexedRow[] | undefined = (c) => bySenType.get(`${c.sen}|${c.type}`),
  ) => {
    const pairs: { ci: number; r: IndexedRow; gap: number }[] = [];
    parsed.forEach((c, ci) => {
      if (!c || results[ci]) return;
      const bucket = bucketFor(c);
      if (!bucket) return;
      for (const r of bucket) {
        if (r.claimed || r.day === null) continue;
        const gap = Math.abs(c.day - r.day);
        if (eligible(c, r, gap)) pairs.push({ ci, r, gap });
      }
    });
    pairs.sort((a, b) => a.gap - b.gap || a.ci - b.ci || a.r.ord - b.r.ord);
    for (const p of pairs) {
      if (results[p.ci] || p.r.claimed) continue;
      p.r.claimed = true;
      results[p.ci] = {
        tier,
        matchedTxId: p.r.tx.id,
        matchedWalletId: p.r.tx.walletId,
        dateGapDays: p.gap,
      };
    }
  };

  // --- Tier 1: same wallet, exact sen, same type, |Δ| ≤ 2 days. FX rows are
  // excluded — settled ≠ authorized amounts make them review-only (Tier 2)
  // unless the FX-exact pass below upgrades them.
  runPass(1, (c, r, gap) => gap <= 2 && c.wallet === r.wallet && !r.hasFx);

  // --- FX-exact: both sides carry the SAME foreign amount to the sen (original
  // unit) in the SAME currency, same wallet, same type, |Δ| ≤ 7 → Tier 1. The
  // foreign original is identity-grade — the settled MYR figure drifts with the
  // rate, so MYR-sen equality is weaker evidence. Runs between tiers 1 and 2 so
  // plain same-amount matches claim rows first; the bucket key enforces
  // fxSen/currency/type equality, `eligible` the wallet + window.
  runPass(
    1,
    (c, r, gap) => gap <= 7 && c.wallet === r.wallet,
    (c) =>
      c.fxSen === null || !c.fxCurrency
        ? undefined
        : byFxKey.get(`${c.fxSen}|${c.fxCurrency}|${c.type}`),
  );

  // --- Tier 2, same wallet: |Δ| 3–7 days, or any |Δ| ≤ 7 involving an FX row.
  runPass(2, (c, r, gap) => gap <= 7 && c.wallet === r.wallet && (gap >= 3 || r.hasFx));

  // --- Tier 2, cross-wallet: both wallets defined and different, |Δ| ≤ 7 days.
  // Runs last so it never consumes a row another candidate can same-wallet match.
  runPass(2, (c, r, gap) => gap <= 7 && c.walletDefined && r.walletDefined && c.wallet !== r.wallet);

  return results.map((r): MatchResult => r ?? { tier: 'new' });
}
