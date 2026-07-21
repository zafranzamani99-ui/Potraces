/**
 * personalSyncMerge — PURE conflict/merge helpers for personal-mode sync.
 *
 * WHY THIS FILE EXISTS (and is separate from personalSync.ts):
 *   Same reason personalSyncMappers is separate — these are the multi-device
 *   conflict-resolution rules (LWW, child-array unions, per-table mergers), and
 *   they can only be tsx-tested if they're free of React-Native / store /
 *   Supabase imports. Everything here is a pure function of its inputs: the
 *   caller (personalSync.pullAll) passes the tombstone set in explicitly instead
 *   of the old closure over store state. Behavior is EXTRACTED VERBATIM from
 *   pullAll (2026-07-22) — do not "improve" a rule here without a test.
 *
 *   Allowed imports: `import type` from ../types plus other PURE modules
 *   (utils/money, savingsMath — both RN-free by design).
 *   mergeSubscription/mergePaymentHistory stay in personalSyncMappers (they
 *   predate this file and scripts/test-subscription-merge.ts imports them there).
 *
 * Run:  npm run test:sync-merge   (tsx — see scripts/, added by the test agent.)
 */
import type { Debt, Goal, SavingsAccount, SavedReceipt, Wallet } from '../types';
import { roundMoney } from '../utils/money';
import { replayCapitalMoves } from '../screens/personal/savings/savingsMath';

// ─── Scalar helpers ───────────────────────────────────────────────────────────
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** The side with the newer updatedAt; REMOTE (second arg) wins exact ties. */
export const newer = <T extends { updatedAt?: Date }>(a: T, b: T): T =>
  (b.updatedAt?.getTime?.() ?? 0) >= (a.updatedAt?.getTime?.() ?? 0) ? b : a;

/**
 * First value that's actually present. Unlike `??`, this treats '' as empty —
 * so an empty remote field can NEVER blank a real local one (descriptions etc.).
 */
export const keep = (...vals: any[]) => vals.find((v) => v !== undefined && v !== null && v !== '');

/**
 * Union nested money arrays (payments / contributions / snapshots) by stable
 * child id so a concurrent edit on another device can NEVER silently drop one
 * (whole-row LWW would). On a genuine id conflict keep the copy with the
 * longer editLog (more edits = newer).
 */
export const childUnion = <C extends { id: string; editLog?: any[] }>(a: C[] = [], b: C[] = []): C[] => {
  const m = new Map<string, C>();
  for (const x of a) m.set(x.id, x);
  for (const x of b) {
    const ex = m.get(x.id);
    if (!ex || (x.editLog?.length ?? 0) > (ex.editLog?.length ?? 0)) m.set(x.id, x);
  }
  return Array.from(m.values());
};

// skew-tolerant LWW: near-ties (within the window) fall back to a stable
// deterministic tiebreak (higher id wins) so a slightly-fast device clock
// can't silently invert which edit wins.
export const SKEW_MS = 2000;
export const remoteWinsScalar = (existing: any, r: any): boolean => {
  const re = r.updatedAt?.getTime?.() ?? 0;
  const ex = existing.updatedAt?.getTime?.() ?? 0;
  if (Math.abs(re - ex) <= SKEW_MS) return String(r.id) > String(existing.id);
  return re > ex;
};

// ─── Generic id-keyed merge ───────────────────────────────────────────────────
/**
 * Merge a local and a remote collection by id.
 * - `deletedIds`: every tombstoned id (durable local + ephemeral + cloud
 *   soft-deletes). A tombstoned row is REMOVED from the result even if the local
 *   copy still holds it, and a remote copy can never re-add it — this is the
 *   "never resurrect a deleted row" guarantee for EVERY table (wallets included).
 * - `mergeFn`: per-table conflict merger; without one, whole-row skew-tolerant
 *   LWW (remoteWinsScalar) decides.
 */
export const mergeById = <T extends { id: string; updatedAt?: Date }>(
  local: T[],
  remote: T[],
  opts?: { mergeFn?: (l: T, r: T) => T; deletedIds?: Set<string> },
): T[] => {
  const deletedIds = opts?.deletedIds;
  const mergeFn = opts?.mergeFn;
  const map = new Map<string, T>();
  for (const l of local) { if (deletedIds?.has(l.id)) continue; map.set(l.id, l); }
  for (const r of remote) {
    if (deletedIds?.has(r.id)) continue;
    const existing = map.get(r.id);
    if (!existing) { map.set(r.id, r); continue; }
    if (mergeFn) {
      map.set(r.id, mergeFn(existing, r));
    } else if (remoteWinsScalar(existing, r)) {
      map.set(r.id, r);
    }
  }
  return Array.from(map.values());
};

// ─── Per-table mergers (called as mergeFn(local, remote)) ─────────────────────
// Append-only-safe merges: scalar fields by LWW, children UNIONED, derived
// totals recomputed from the merged children (matches the store formulas).
export const mergeDebt = (l: Debt, r: Debt): Debt => {
  const base = newer(l, r);
  const payments = childUnion(l.payments ?? [], r.payments ?? []);
  const paidAmount = round2(Math.min(base.totalAmount, payments.reduce((s: number, p: any) => s + (p.amount || 0), 0)));
  const status = paidAmount >= base.totalAmount ? 'settled' : paidAmount > 0 ? 'partial' : 'pending';
  // These fields aren't carried in the remote schema yet — keep the local value
  // so a pull can't drop a debt's grouping/description and hide it from the list.
  return {
    ...base, payments, paidAmount, status,
    groupId: keep(base.groupId, l.groupId, r.groupId),
    description: keep(base.description, l.description, r.description) ?? '',
    category: keep(base.category, l.category, r.category),
    // walletId is carried through sync at runtime (debtFromRemote sets it) but
    // isn't declared on the Debt interface — read it off-type, params stay typed.
    walletId: keep((base as any).walletId, (l as any).walletId, (r as any).walletId),
    mode: keep(base.mode, l.mode, r.mode) ?? 'personal',
    isArchived: base.isArchived ?? l.isArchived,
    archivedAt: base.archivedAt ?? l.archivedAt,
    editLog: (base.editLog && base.editLog.length) ? base.editLog : (l.editLog ?? r.editLog),
    contact: (base.contact && base.contact.name) ? base.contact : (l.contact ?? r.contact),
  } as Debt;
};

export const mergeGoal = (l: Goal, r: Goal): Goal => {
  const base = newer(l, r);
  const contributions = childUnion(l.contributions ?? [], r.contributions ?? []);
  const currentAmount = round2(contributions.reduce((s: number, c: any) => s + (c.amount || 0), 0));
  // icon/color/iconName/imageUri/category aren't round-tripped through Supabase
  // yet — keep the local values so a pull can't blank a goal's look.
  return {
    ...base, contributions, currentAmount,
    icon: keep(base.icon, l.icon, r.icon),
    color: keep(base.color, l.color, r.color),
    // iconName isn't on the Goal interface — read it off-type, params stay typed.
    iconName: keep((base as any).iconName, (l as any).iconName, (r as any).iconName),
    imageUri: keep(base.imageUri, l.imageUri, r.imageUri),
    category: keep(base.category, l.category, r.category),
  } as Goal;
};

// B2: LWW scalars, but NEVER clobber this device's local image reference.
// imageUri is a device-local file path (receiptFromRemote leaves it undefined),
// and remoteImagePath is the shared bucket path — keep whichever side has each
// so a cross-device pull can't blank a receipt's image on this device.
export const mergeReceipt = (l: SavedReceipt, r: SavedReceipt): SavedReceipt => {
  const base = newer(l, r);
  return {
    ...base,
    imageUri: keep(base.imageUri, l.imageUri, r.imageUri),
    remoteImagePath: keep(base.remoteImagePath, l.remoteImagePath, r.remoteImagePath),
  } as SavedReceipt;
};

export const mergeSavings = (l: SavingsAccount, r: SavingsAccount): SavingsAccount => {
  const base = newer(l, r);
  const dateMs = (d: any) => new Date(d).getTime(); // Date objects OR ISO strings
  // Union snapshots by id (whole-row LWW would drop one recorded on the other
  // device), then sort ASCENDING by date. childUnion returns them in insertion
  // order (local first, remote-only appended), but every consumer reads
  // history[history.length - 1] as the LATEST snapshot (stale-date detection,
  // Echo's "last updated", month-start baselines for gain math) — so an unsorted
  // array can surface an OLDER snapshot as "latest" after a multi-device merge.
  const history = childUnion<any>(l.history ?? [], r.history ?? []);
  history.sort((a: any, b: any) => dateMs(a.date) - dateMs(b.date));
  let currentValue = base.currentValue;
  if (history.length) {
    const latest = history.reduce((a: any, b: any) =>
      (dateMs(b.date) > dateMs(a.date) ? b : a));
    currentValue = latest.value;
  }
  // Cost basis is a RUNNING field: basis = seed + Σ(capital moves in history).
  // Both devices' deposit/withdrawal snapshots are already in the merged,
  // date-sorted history, so RE-DERIVE the basis from it — plain LWW would keep
  // only one device's basis and corrupt gain/return after concurrent capital
  // moves. Reconstruct each side's seed (basis minus its own capital moves); if
  // they agree use it, else fall back to the newer row's seed (a rare "put in"
  // edit conflict — a per-field edit timestamp would be the full fix, deferred).
  const sortAsc = (h: any[]) => [...(h ?? [])].sort((x: any, y: any) => dateMs(x.date) - dateMs(y.date));
  const seedOf = (acc: SavingsAccount) => roundMoney(acc.initialInvestment - replayCapitalMoves(sortAsc(acc.history)));
  const seedL = seedOf(l), seedR = seedOf(r);
  const seed = seedL === seedR ? seedL : seedOf(base);
  const initialInvestment = roundMoney(Math.max(0, seed + replayCapitalMoves(history)));
  // target / annualRate are user preferences (not money-critical), so keep plain
  // LWW from `base` until per-field edit timestamps ship.
  return { ...base, history, currentValue, initialInvestment } as SavingsAccount;
};

/**
 * Wallet merge (replaces the old whole-row LWW that could clobber a wallet's
 * look OR its money fields with a stale side's values wholesale).
 * Rules:
 * - MONEY (balance / usedCredit / initialBalance / creditLimit): resolved by the
 *   NEWER side (`base`) — balance and usedCredit move together on every spend,
 *   so splitting them across sides could fabricate a state neither device saw.
 *   `??` fallbacks only fill a value the newer side is genuinely MISSING
 *   (undefined — e.g. a non-credit wallet round-trip), never a real 0.
 * - IDENTITY/COSMETIC (name / type / color / icon / presetId / creditBank /
 *   creditNetwork): per-field newer-wins with the empty-guard `keep`, so an
 *   empty string on the newer side can never blank the older side's real value.
 * - DELETION: never resurrects — a deleted wallet is excluded BEFORE this runs
 *   (cloud deleted_at rows are partitioned out of the pull, and mergeById skips
 *   every tombstoned id on both sides). This mergeFn only sees two LIVE copies.
 */
export const mergeWallet = (l: Wallet, r: Wallet): Wallet => {
  const base = newer(l, r);
  const other = base === l ? r : l;
  return {
    ...base,
    // money — newer side authoritative
    balance: base.balance,
    usedCredit: base.usedCredit ?? other.usedCredit,
    creditLimit: base.creditLimit ?? other.creditLimit,
    initialBalance: base.initialBalance ?? other.initialBalance,
    // identity/cosmetic — per-field newer-wins, empty never blanks real
    name: keep(base.name, other.name) ?? base.name,
    type: keep(base.type, other.type) ?? base.type,
    color: keep(base.color, other.color) ?? base.color,
    icon: keep(base.icon, other.icon) ?? base.icon,
    presetId: keep(base.presetId, other.presetId),
    creditBank: keep(base.creditBank, other.creditBank),
    creditNetwork: keep(base.creditNetwork, other.creditNetwork),
  } as Wallet;
};

// ─── Budget category dedup ────────────────────────────────────────────────────
/**
 * Enforce the one-budget-per-category invariant that addBudget guarantees
 * locally but mergeById (keyed by id) can violate when two devices create the
 * same category. Keeps the most-recently-edited budget per category; the caller
 * must tombstone the returned loserIds (delete remotely + block re-pull) — else
 * the hero double-counts both allocation and spend, and duplicate rings render.
 */
export const dedupeBudgetsByCategory = <T extends { id: string; category?: string; updatedAt?: Date }>(
  merged: T[],
): { winners: T[]; loserIds: string[] } => {
  const winners = new Map<string, T>();
  const loserIds: string[] = [];
  for (const b of merged) {
    const key = (b.category ?? '').toLowerCase();
    const cur = winners.get(key);
    if (!cur) { winners.set(key, b); continue; }
    const bWins = remoteWinsScalar(cur as any, b as any); // b newer than cur? (latest edit, id tie-break)
    if (bWins) { loserIds.push(cur.id); winners.set(key, b); }
    else { loserIds.push(b.id); }
  }
  return { winners: Array.from(winners.values()), loserIds };
};
