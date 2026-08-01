# Background Quick-Log ("Finny" flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user log a personal transaction from an iOS Back Tap Shortcut without opening the app — the entry is posted to the backend, confirmed by a banner, and materializes in the app on next open.

**Architecture:** A double-tap runs an Apple Shortcut that collects amount/category/payment/note with native prompts and POSTs them to a new `quick-log` Supabase edge function, authenticated by a per-user Quick-Log key. The function drops a row into a `quick_log_inbox` table and sends a push. The app drains that inbox on next foreground by calling the existing `logQuickExpense()`, so all money logic stays in one place (JS). See spec: `docs/superpowers/specs/2026-07-05-background-quick-log-design.md`.

**Tech Stack:** React Native / Expo (TypeScript), Zustand, Supabase (Postgres + Deno edge functions), Expo push notifications, Apple Shortcuts.

## Global Constraints

- **Key hashing must be identical on both sides.** The app hashes with `expo-crypto` (`Crypto.digestStringAsync(CryptoDigestAlgorithm.SHA256, key)`, default HEX = lowercase) and the edge function with Web Crypto (`crypto.subtle.digest('SHA-256', …)` → lowercase hex). Both are SHA-256 → lowercase hex, so they match by construction. **Canonical vector (assert in both):** `sha256("test-vector-123") === "44c2602d27ab675ffa3e611b2d2f0ef05fca766d63a55a4886b67740a5f154ff"`.
- **React Native has no Web Crypto, and `tsx` cannot import `expo-crypto`** (it transitively pulls `react-native/index.js`, which esbuild can't parse). Therefore: the app uses `expo-crypto` for randomness + hashing (per the existing pattern in `src/services/appleAuth.ts`); the pure, native-free key-formatting logic lives in `src/utils/quickLogKeyFormat.ts` so the `tsx` test can import it; hash parity is asserted against the canonical vector via Node's `crypto` in the test — never by importing the RN module into Node. Do NOT use `crypto.getRandomValues` (no `react-native-get-random-values` polyfill is installed).
- **No jest in this repo.** Automated logic tests are self-running `tsx` scripts under `scripts/` that seed the real Zustand stores and `process.exit(1)` on failure (see `scripts/test-wallet-reconcile.ts`). The compile gate is `npm run typecheck` (`tsc --noEmit`). UI, push, and Shortcut steps are verified **manually** — there is no RN component test harness; do not invent one.
- **Reuse `logQuickExpense()` verbatim** (`src/services/quickLog.ts:92`). Do NOT re-implement wallet/category resolution anywhere else (not in the edge function, not in the drain loop).
- **Currency/locale:** amounts are RM (MYT); dates default to `nowMYT()` (`src/utils/datetime`).
- **Edge function is public** (`verify_jwt = false`): the Quick-Log key is the ONLY auth. Compare via hash lookup; reject unknown/revoked keys with 401 and do no work.
- **Idempotency:** an inbox row is logged **at most once**. `quick_log_inbox.consumed_at` guards the drain.

---

### Task 1: Database schema — `quick_log_keys` + `quick_log_inbox`

**Files:**
- Create: `supabase/migrations/20260705000000_quick_log.sql`

**Interfaces:**
- Produces tables:
  - `public.quick_log_keys(user_id uuid, key_hash text unique, created_at timestamptz, last_used_at timestamptz, revoked boolean)`
  - `public.quick_log_inbox(id uuid pk, user_id uuid, amount numeric, type text, category text, wallet text, note text, occurred_at timestamptz, created_at timestamptz, consumed_at timestamptz)`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260705000000_quick_log.sql`:

```sql
-- Background Quick-Log: per-user auth key + server inbox of pending entries.
-- The edge function (service-role) is the only writer; the owning user reads
-- and updates their own inbox rows to mark them consumed after reconcile.

-- ── quick_log_keys ────────────────────────────────────────────────────────────
-- One active key per user (regenerate = revoke old + insert new). We store only
-- the SHA-256 hex hash, never the raw key.
CREATE TABLE IF NOT EXISTS public.quick_log_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  key_hash     text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked      boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS quick_log_keys_user_idx ON public.quick_log_keys (user_id);

ALTER TABLE public.quick_log_keys ENABLE ROW LEVEL SECURITY;
-- Owner may read/insert/update/revoke their own keys from the app.
DROP POLICY IF EXISTS quick_log_keys_owner ON public.quick_log_keys;
CREATE POLICY quick_log_keys_owner ON public.quick_log_keys
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── quick_log_inbox ───────────────────────────────────────────────────────────
-- Pending entries written by the edge function (service-role). The owning user
-- reads their rows and stamps consumed_at after logQuickExpense() runs.
CREATE TABLE IF NOT EXISTS public.quick_log_inbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  amount      numeric NOT NULL,
  type        text NOT NULL DEFAULT 'expense',
  category    text,
  wallet      text,
  note        text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS quick_log_inbox_user_unconsumed_idx
  ON public.quick_log_inbox (user_id) WHERE consumed_at IS NULL;

ALTER TABLE public.quick_log_inbox ENABLE ROW LEVEL SECURITY;
-- Owner may read + mark consumed. Inserts come from service-role only (no
-- insert policy → RLS blocks user inserts, service-role bypasses RLS).
DROP POLICY IF EXISTS quick_log_inbox_read ON public.quick_log_inbox;
CREATE POLICY quick_log_inbox_read ON public.quick_log_inbox
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS quick_log_inbox_consume ON public.quick_log_inbox;
CREATE POLICY quick_log_inbox_consume ON public.quick_log_inbox
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration locally and verify**

Run: `supabase db reset` (or `supabase migration up` if you have local state to keep)
Expected: completes without error; `\d public.quick_log_keys` and `\d public.quick_log_inbox` show the columns above. If you don't run Supabase locally, verify by applying to a staging project: `supabase db push`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260705000000_quick_log.sql
git commit -m "feat(quick-log): add quick_log_keys + quick_log_inbox tables"
```

---

### Task 2: App-side Quick-Log key service

**Files:**
- Create: `src/utils/quickLogKeyFormat.ts` (pure, native-free — testable under tsx)
- Create: `src/services/quickLogKey.ts` (expo-crypto + supabase)
- Create: `scripts/test-quick-log-key.ts`

**Why the split:** React Native has no Web Crypto, and `tsx` cannot import
`expo-crypto` (it pulls `react-native/index.js`, which esbuild can't parse). So
the pure key-formatting logic lives in a native-free module the test can import;
the expo-crypto calls live in the service and are verified manually + by the Deno
parity check in Task 3. Do NOT use `crypto.getRandomValues` (no
`react-native-get-random-values` polyfill is installed) or Web Crypto here.

**Interfaces:**
- Consumes: `expo-crypto` (`Crypto.getRandomBytes`, `Crypto.digestStringAsync`, `Crypto.CryptoDigestAlgorithm`), `supabase` (`src/services/supabase.ts`).
- Produces:
  - `encodeQuickLogKey(bytes: Uint8Array): string` (pure) — `QLOG-` + Crockford base32 body (one char per byte).
  - `QUICK_LOG_ALPHABET: string` — `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (no I/L/O/U).
  - `generateQuickLogKey(): string` — `encodeQuickLogKey(Crypto.getRandomBytes(24))`.
  - `hashKey(key: string): Promise<string>` — SHA-256 lowercase hex via expo-crypto.
  - `registerQuickLogKey(): Promise<string>` — revoke existing rows, insert `{ user_id, key_hash }`, return the RAW key (shown once).
  - `getQuickLogKeyStatus(): Promise<{ hasActiveKey: boolean }>`.
  - `revokeQuickLogKey(): Promise<void>` — set `revoked = true` on the user's rows.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-quick-log-key.ts` (imports ONLY the native-free format
module + Node's `crypto` for the parity reference — never `quickLogKey.ts`,
which pulls expo-crypto and cannot load under tsx):

```ts
/**
 * Unit test for the pure key-formatting logic + hash parity. expo-crypto cannot
 * run under tsx (it pulls react-native), so we import only the native-free
 * format module and assert hash PARITY against Node's crypto — the canonical
 * reference the app's expo-crypto and the Deno function must both match.
 * Run: npx tsx scripts/test-quick-log-key.ts
 */
import { createHash } from 'node:crypto';
import { encodeQuickLogKey, QUICK_LOG_ALPHABET } from '../src/utils/quickLogKeyFormat';

let failures = 0;
const check = (n: string, c: boolean) => { if (!c) { failures++; console.error('FAIL:', n); } else console.log('ok:', n); };

// Format: deterministic for fixed bytes, correct shape + alphabet.
const bytes = new Uint8Array(24).map((_, i) => (i * 7) & 0xff);
const k = encodeQuickLogKey(bytes);
check('QLOG- prefix', k.startsWith('QLOG-'));
check('24-char body', k.slice(5).length === 24);
check('Crockford alphabet only', /^QLOG-[0-9A-HJKMNP-TV-Z]{24}$/.test(k));
check('deterministic', encodeQuickLogKey(bytes) === k);
check('alphabet excludes I/L/O/U', !/[ILOU]/.test(QUICK_LOG_ALPHABET) && QUICK_LOG_ALPHABET.length === 32);

// Hash parity: the canonical SHA-256 hex the app (expo-crypto) and the Deno
// function (Web Crypto) must both produce for "test-vector-123".
const CANON = '44c2602d27ab675ffa3e611b2d2f0ef05fca766d63a55a4886b67740a5f154ff';
check('node sha256 matches canonical', createHash('sha256').update('test-vector-123').digest('hex') === CANON);

if (failures) { console.error(`${failures} failures`); process.exit(1); }
console.log('all passed; canonical hash =', CANON);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx scripts/test-quick-log-key.ts`
Expected: FAIL — `Cannot find module '../src/utils/quickLogKeyFormat'`.

- [ ] **Step 3a: Implement the pure format module `src/utils/quickLogKeyFormat.ts`**

```ts
/** Pure, native-free key formatting so it is unit-testable under tsx. */
export const QUICK_LOG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I/L/O/U)

/** Map random bytes → "QLOG-" + Crockford base32 body (one char per byte). */
export function encodeQuickLogKey(bytes: Uint8Array): string {
  let body = '';
  for (const b of bytes) body += QUICK_LOG_ALPHABET[b % QUICK_LOG_ALPHABET.length];
  return `QLOG-${body}`;
}
```

- [ ] **Step 3b: Implement the service `src/services/quickLogKey.ts`**

```ts
/**
 * Quick-Log key — per-user secret that authenticates the Back Tap Shortcut to
 * the `quick-log` edge function. We store only the SHA-256 hex hash server-side
 * (quick_log_keys); the raw key is shown to the user once, to paste into the
 * Shortcut. See docs/superpowers/specs/2026-07-05-background-quick-log-design.md.
 */
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { encodeQuickLogKey } from '../utils/quickLogKeyFormat';

/** 24-char Crockford base32 body with a QLOG- prefix, from expo-crypto randomness. */
export function generateQuickLogKey(): string {
  return encodeQuickLogKey(Crypto.getRandomBytes(24));
}

/** SHA-256 → lowercase hex (default HEX encoding). MUST match the Deno function. */
export async function hashKey(key: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key.trim());
}

async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/** Revoke any existing keys, mint+store a new one, return the RAW key (once). */
export async function registerQuickLogKey(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new Error('not-signed-in');
  await supabase.from('quick_log_keys').update({ revoked: true })
    .eq('user_id', userId).eq('revoked', false);
  const key = generateQuickLogKey();
  const key_hash = await hashKey(key);
  const { error } = await supabase.from('quick_log_keys')
    .insert({ user_id: userId, key_hash });
  if (error) throw error;
  return key;
}

export async function getQuickLogKeyStatus(): Promise<{ hasActiveKey: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { hasActiveKey: false };
  const { count } = await supabase.from('quick_log_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('revoked', false);
  return { hasActiveKey: (count ?? 0) > 0 };
}

export async function revokeQuickLogKey(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await supabase.from('quick_log_keys').update({ revoked: true })
    .eq('user_id', userId).eq('revoked', false);
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx tsx scripts/test-quick-log-key.ts && npm run typecheck`
Expected: `all passed; canonical hash = 44c2602d…`; typecheck clean. (The test does not exercise expo-crypto — that path is proven end-to-end by the Task 3 curl and confirmed against the same canonical vector in Task 3 Step 3.)

- [ ] **Step 5: Commit**

```bash
git add src/utils/quickLogKeyFormat.ts src/services/quickLogKey.ts scripts/test-quick-log-key.ts
git commit -m "feat(quick-log): add per-user key service (generate/hash/register/revoke)"
```

---

### Task 3: `quick-log` edge function

**Files:**
- Create: `supabase/functions/quick-log/index.ts`
- Modify: `supabase/config.toml` (add `[functions.quick-log] verify_jwt = false`)

**Interfaces:**
- Consumes: `quick_log_keys` (key_hash lookup), `quick_log_inbox` (insert), `device_tokens` (push), `hashKey` behaviour from Task 2 (same SHA-256 hex).
- Produces: `POST /functions/v1/quick-log` accepting
  `{ key: string, amount: number|string, type?: 'expense'|'income', category?: string, wallet?: string, note?: string, occurred_at?: string }`
  → `200 { ok: true }` on success, `401` bad/revoked key, `400` bad amount.

- [ ] **Step 1: Add the function config**

In `supabase/config.toml`, append:

```toml
[functions.quick-log]
verify_jwt = false
```

- [ ] **Step 2: Implement `supabase/functions/quick-log/index.ts`**

```ts
// Background Quick-Log endpoint. Public (verify_jwt=false): the user's Quick-Log
// key is the only auth. Validates the key → inserts a quick_log_inbox row →
// sends a push. Does NO wallet/category math — the app reconciles on next open.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** SHA-256 → lowercase hex. MUST match src/services/quickLogKey.ts hashKey. */
async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key.trim());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const CATEGORY_LABELS: Record<string, string> = {
  food: '🍔 Food & Dining', transport: '🚗 Transportation', shopping: '🛍️ Shopping',
  entertainment: '🎬 Entertainment', health: '❤️ Healthcare', other: 'Other',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: 'bad-json' }, 400); }

  const key = typeof payload.key === 'string' ? payload.key : '';
  if (!key) return json({ error: 'missing-key' }, 401);

  // Validate key → user.
  const key_hash = await hashKey(key);
  const { data: keyRow } = await admin.from('quick_log_keys')
    .select('user_id, revoked').eq('key_hash', key_hash).maybeSingle();
  if (!keyRow || keyRow.revoked) return json({ error: 'invalid-key' }, 401);
  const userId = keyRow.user_id as string;

  // Parse + validate amount.
  const amount = Math.round((parseFloat(String(payload.amount).replace(/[^0-9.]/g, '')) + Number.EPSILON) * 100) / 100;
  if (!(amount > 0)) return json({ error: 'bad-amount' }, 400);

  const type = payload.type === 'income' ? 'income' : 'expense';
  const category = typeof payload.category === 'string' ? payload.category : null;
  const wallet = typeof payload.wallet === 'string' ? payload.wallet : null;
  const note = typeof payload.note === 'string' ? payload.note.slice(0, 200) : null;
  let occurred_at = new Date().toISOString();
  if (payload.occurred_at) {
    const d = new Date(payload.occurred_at);
    if (!Number.isNaN(d.getTime())) occurred_at = d.toISOString();
  }

  const { error: insErr } = await admin.from('quick_log_inbox')
    .insert({ user_id: userId, amount, type, category, wallet, note, occurred_at });
  if (insErr) return json({ error: 'insert-failed' }, 500);

  await admin.from('quick_log_keys')
    .update({ last_used_at: new Date().toISOString() }).eq('key_hash', key_hash);

  // Best-effort push (never fails the log).
  try {
    const { data: tokens } = await admin.from('device_tokens')
      .select('token').eq('user_id', userId);
    if (tokens && tokens.length) {
      const label = category ? (CATEGORY_LABELS[category] ?? category) : 'your wallet';
      const verb = type === 'income' ? 'in' : 'out';
      const messages = tokens.map((t: { token: string }) => ({
        to: t.token,
        title: `Logged RM${amount.toFixed(2)} ${verb}`,
        body: `${note ? note + ' · ' : ''}${label}`,
        sound: 'default',
        priority: 'high',
        channelId: 'orders',
        data: { type: 'quick_log' },
      }));
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
    }
  } catch { /* ignore push errors */ }

  return json({ ok: true });
});
```

- [ ] **Step 3: Verify hashing parity (blocking)**

The `hashKey` here MUST equal the canonical vector (Global Constraints). Confirm with a scratch `deno eval` computing SHA-256 over `"test-vector-123"`.
Run: `deno eval 'const d=await crypto.subtle.digest("SHA-256", new TextEncoder().encode("test-vector-123")); console.log(Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join(""))'`
Expected: exactly `44c2602d27ab675ffa3e611b2d2f0ef05fca766d63a55a4886b67740a5f154ff`. If different, stop and fix. (If `deno` isn't installed, this is proven anyway by the Task 4 curl round-trip using a real app-generated key.)

- [ ] **Step 4: Integration-test with curl**

Serve locally: `supabase functions serve quick-log --no-verify-jwt` (in another shell).
First register a key in the running app (Task 7) OR insert a test key row manually:
`insert into quick_log_keys(user_id, key_hash) values ('<a-real-user-id>', '<hash of TESTKEY>');`
Then:

Run:
```bash
curl -s -X POST http://localhost:54321/functions/v1/quick-log \
  -H 'Content-Type: application/json' \
  -d '{"key":"TESTKEY","amount":"23.90","category":"food","wallet":"Cash","note":"Dinner"}'
```
Expected: `{"ok":true}`. Then `select * from quick_log_inbox;` shows the row. A wrong key returns `{"error":"invalid-key"}` with 401.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/quick-log/index.ts supabase/config.toml
git commit -m "feat(quick-log): add quick-log edge function (validate key, inbox insert, push)"
```

---

### Task 4: Inbox drain service

**Files:**
- Create: `src/services/quickLogInboxMap.ts` (pure, native-free — testable under tsx)
- Create: `src/services/quickLogInbox.ts` (supabase drain)
- Create: `scripts/test-quick-log-inbox.ts`

**Why the split:** `src/services/supabase.ts` imports `expo-secure-store` (a
native module), so any module importing supabase CANNOT be loaded by `tsx` (same
class of failure as Task 2's expo-crypto). This mirrors the repo's own
convention — `scripts/test-personal-sync-roundtrip.ts` tests `personalSyncMappers.ts`
precisely because the mappers are pure and supabase-free. So the pure row→params
mapper lives in `quickLogInboxMap.ts` (no supabase); the drain that needs
supabase lives in `quickLogInbox.ts`. The test imports only the pure mapper +
`logQuickExpense` (whose store deps are tsx-safe, proven by `npm run test:wallet`)
— never `quickLogInbox.ts`.

**Interfaces:**
- Consumes: `logQuickExpense` / `type QuickLogParams` (`src/services/quickLog.ts:92`), `supabase`, the real Zustand stores.
- Produces:
  - `QuickLogInboxRow` (interface) + `mapInboxRowToQuickLog(row): QuickLogParams` in `quickLogInboxMap.ts` (pure mapper).
  - `drainQuickLogInbox(): Promise<number>` in `quickLogInbox.ts` — fetch un-consumed rows for the user, run `logQuickExpense` per row, stamp `consumed_at`, return the count logged. Idempotent (only rows with `consumed_at IS NULL`).

- [ ] **Step 1: Write the failing test**

Create `scripts/test-quick-log-inbox.ts` (imports ONLY the native-free mapper +
`logQuickExpense` + stores — never `quickLogInbox.ts`, which pulls supabase and
cannot load under tsx):

```ts
/**
 * Unit test for the pure inbox → logQuickExpense mapping and its wallet effect.
 * Imports only the native-free mapper + logQuickExpense (store deps are tsx-safe
 * per test:wallet) — NOT quickLogInbox.ts, which imports supabase
 * (expo-secure-store) and cannot load under tsx. The supabase fetch/mark path in
 * drainQuickLogInbox() is verified manually.
 * Run: npx tsx scripts/test-quick-log-inbox.ts
 */
import { mapInboxRowToQuickLog, type QuickLogInboxRow } from '../src/services/quickLogInboxMap';
import { logQuickExpense } from '../src/services/quickLog';
import { useWalletStore } from '../src/store/walletStore';
import { usePersonalStore } from '../src/store/personalStore';

let failures = 0;
const check = (n: string, c: boolean) => { if (!c) { failures++; console.error('FAIL:', n); } else console.log('ok:', n); };

// Seed one wallet (categories fall back to 'other' inside logQuickExpense).
useWalletStore.setState({ wallets: [{ id: 'w1', name: 'Cash', type: 'ewallet', balance: 100, icon: 'dollar-sign', color: '#000', isDefault: true } as any] });

const row: QuickLogInboxRow = {
  id: 'r1', user_id: 'u1', amount: 23.9, type: 'expense',
  category: 'food', wallet: 'Cash', note: 'Dinner',
  occurred_at: '2026-07-05T10:00:00.000Z', consumed_at: null,
};

const params = mapInboxRowToQuickLog(row);
check('amount mapped', params.amount === 23.9);
check('type mapped', params.type === 'expense');
check('category mapped', params.category === 'food');
check('wallet mapped', params.wallet === 'Cash');
check('note mapped', params.note === 'Dinner');
check('date is a Date', params.date instanceof Date);
check('invalid occurred_at → undefined date', mapInboxRowToQuickLog({ ...row, occurred_at: 'not-a-date' }).date === undefined);

const before = useWalletStore.getState().wallets[0].balance;
const result = logQuickExpense(params);
check('logQuickExpense returned a result', !!result);
const after = useWalletStore.getState().wallets[0].balance;
check('wallet deducted by amount', Math.round((before - after) * 100) / 100 === 23.9);
check('transaction written', usePersonalStore.getState().transactions.some((t: any) => t.amount === 23.9));

if (failures) { console.error(`${failures} failures`); process.exit(1); }
console.log('all passed');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx scripts/test-quick-log-inbox.ts`
Expected: FAIL — `Cannot find module '../src/services/quickLogInboxMap'`.

- [ ] **Step 3a: Implement the pure mapper `src/services/quickLogInboxMap.ts`**

```ts
/**
 * Pure inbox-row → logQuickExpense params mapping. Native-free (no supabase, no
 * expo-*) so it is unit-testable under tsx — same split rationale as the repo's
 * personalSyncMappers.ts. See docs/superpowers/specs/2026-07-05-background-quick-log-design.md.
 */
import type { QuickLogParams } from './quickLog';

export interface QuickLogInboxRow {
  id: string;
  user_id: string;
  amount: number;
  type: 'expense' | 'income';
  category: string | null;
  wallet: string | null;
  note: string | null;
  occurred_at: string;
  consumed_at: string | null;
}

/** Pure mapping: inbox row → logQuickExpense params. */
export function mapInboxRowToQuickLog(row: QuickLogInboxRow): QuickLogParams {
  const d = new Date(row.occurred_at);
  return {
    amount: Number(row.amount),
    type: row.type === 'income' ? 'income' : 'expense',
    category: row.category ?? undefined,
    wallet: row.wallet ?? undefined,
    note: row.note ?? undefined,
    date: Number.isNaN(d.getTime()) ? undefined : d,
  };
}
```

- [ ] **Step 3b: Implement the drain `src/services/quickLogInbox.ts`**

```ts
/**
 * Drains quick_log_inbox rows (written by the quick-log edge function while the
 * app was closed) into real personal transactions via logQuickExpense. Runs on
 * foreground/login. Idempotent: only rows with consumed_at IS NULL are logged,
 * and each is stamped consumed_at immediately after.
 */
import { supabase } from './supabase';
import { logQuickExpense } from './quickLog';
import { mapInboxRowToQuickLog, type QuickLogInboxRow } from './quickLogInboxMap';

/** Fetch → log → mark consumed. Returns how many rows were logged. */
export async function drainQuickLogInbox(): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return 0;

  const { data: rows, error } = await supabase
    .from('quick_log_inbox')
    .select('*')
    .eq('user_id', userId)
    .is('consumed_at', null)
    .order('occurred_at', { ascending: true });
  if (error || !rows || rows.length === 0) return 0;

  let logged = 0;
  for (const row of rows as QuickLogInboxRow[]) {
    const result = logQuickExpense(mapInboxRowToQuickLog(row));
    // Stamp consumed even if amount was invalid (result null) so we don't retry
    // a permanently-bad row forever.
    await supabase.from('quick_log_inbox')
      .update({ consumed_at: new Date().toISOString() }).eq('id', row.id);
    if (result) logged++;
  }
  return logged;
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx tsx scripts/test-quick-log-inbox.ts && npm run typecheck`
Expected: `all passed`; typecheck clean. (`npm run typecheck` runs over the whole
repo, which has unrelated WIP — if it reports errors, confirm none are in the
three new files; pre-existing errors elsewhere are not this task's regression.)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(quick-log): add inbox drain (map row → logQuickExpense, idempotent)" -- src/services/quickLogInboxMap.ts src/services/quickLogInbox.ts scripts/test-quick-log-inbox.ts
```

---

### Task 5: Run the drain on foreground + login

**Files:**
- Modify: `App.tsx` (near the existing `Linking`/`AppState` effects, ~`App.tsx:434`)

**Interfaces:**
- Consumes: `drainQuickLogInbox` (Task 4).

- [ ] **Step 1: Import the drain**

At the top of `App.tsx`, beside the existing `import { logQuickExpense, undoQuickExpense } from './src/services/quickLog';` (App.tsx:23), add:

```ts
import { drainQuickLogInbox } from './src/services/quickLogInbox';
```

- [ ] **Step 2: Add an effect that drains on mount + on foreground**

Add this effect alongside the other top-level effects in the root component (near the deep-link effect, App.tsx:434). Use the existing `AppState` import if present; otherwise add `import { AppState } from 'react-native';`.

```ts
// Drain any entries the Back Tap Shortcut logged while the app was closed.
React.useEffect(() => {
  const run = () => { drainQuickLogInbox().catch(() => {}); };
  run(); // cold start
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') run();
  });
  return () => sub.remove();
}, []);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual verification**

Insert a `quick_log_inbox` row via SQL (or via the curl in Task 3), then foreground the app (background → active). Expected: the transaction appears in the personal transaction list and the wallet balance drops; the inbox row now has a `consumed_at`. Re-foregrounding does NOT double-log.

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat(quick-log): drain inbox on cold start and foreground"
```

---

### Task 6: Push-tap → personal history navigation

**Files:**
- Modify: `App.tsx` — the `Notifications.addNotificationResponseReceivedListener` block (App.tsx:445-454)

**Interfaces:**
- Consumes: existing `useAppStore.setMode`, `navigationRef`.

- [ ] **Step 1: Extend the notification-response handler**

The existing handler (App.tsx:445) branches on `data.type === 'new_order' | 'payment_received'` and, for orders, does `setMode('business')` then `setTimeout(() => navigationRef.isReady() && navigationRef.navigate(...), 300)`. Mirror that exact shape for a new `quick_log` branch, added **before** the order branch's effect returns:

```ts
if (data?.type === 'quick_log') {
  // Switch to personal mode (RootNavigator re-renders to PersonalNavigator) and
  // land on the Dashboard tab, where the month's transactions are shown.
  useAppStore.getState().setMode('personal');
  setTimeout(() => {
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('PersonalMain', { screen: 'Dashboard' });
    }
  }, 300);
  return;
}
```

**Route names (verified):** the personal tab navigator is mounted at the root
route `PersonalMain` (`src/navigation/RootNavigator.tsx:274-276`), and its
default/first tab is `Dashboard` (`src/navigation/PersonalNavigator.tsx:73`). So
the nested navigate target is `navigate('PersonalMain', { screen: 'Dashboard' })`
— NOT `'Personal'`. Match the order branch's `navigationRef.isReady()` + 300 ms
delay exactly (mode switch needs the navigator to re-mount first).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

Trigger a quick-log via curl (Task 3) so a push arrives, OR send an Expo test push with `data: { type: 'quick_log' }`. Tap it. Expected: app opens in personal mode on the Dashboard; the drained entry (Task 5 runs on foreground) is visible.

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat(quick-log): tap quick-log push → open personal dashboard"
```

---

### Task 7: "Quick Log" setup screen + Settings entry

**Files:**
- Create: `src/screens/personal/QuickLogSetup.tsx`
- Modify: `src/navigation/RootNavigator.tsx` (register the screen)
- Modify: `src/screens/shared/Settings.tsx` (add a SettingRow in the "money" section)
- Modify: `src/i18n/en.ts` and `src/i18n/ms.ts` (strings)

**Interfaces:**
- Consumes: `registerQuickLogKey`, `getQuickLogKeyStatus`, `revokeQuickLogKey` (Task 2).

- [ ] **Step 1: Add i18n strings**

In `src/i18n/en.ts`, under the `settings` object add:

```ts
quickLog: {
  row: 'Quick Log (Back Tap)',
  title: 'Quick Log',
  intro: 'Log an expense by double-tapping the back of your phone — without opening the app.',
  generate: 'Generate my key',
  regenerate: 'Regenerate key',
  copyKey: 'Copy key',
  copied: 'Key copied',
  keyOnceWarning: 'Copy it now — you won’t see it again. Paste it into the Shortcut on first run.',
  getShortcut: 'Get the Shortcut',
  revoke: 'Turn off Quick Log',
  active: 'Quick Log is set up.',
  inactive: 'Quick Log is not set up yet.',
  signInFirst: 'Sign in to Potraces first.',
},
```

Add the same keys to `src/i18n/ms.ts` with Malay copy (mirror the existing tone):

```ts
quickLog: {
  row: 'Log Pantas (Ketik Belakang)',
  title: 'Log Pantas',
  intro: 'Log perbelanjaan dengan mengetik dua kali belakang telefon — tanpa membuka aplikasi.',
  generate: 'Jana kunci saya',
  regenerate: 'Jana semula kunci',
  copyKey: 'Salin kunci',
  copied: 'Kunci disalin',
  keyOnceWarning: 'Salin sekarang — anda tak akan lihat semula. Tampal ke dalam Shortcut kali pertama.',
  getShortcut: 'Dapatkan Shortcut',
  revoke: 'Matikan Log Pantas',
  active: 'Log Pantas sudah disediakan.',
  inactive: 'Log Pantas belum disediakan.',
  signInFirst: 'Log masuk ke Potraces dahulu.',
},
```

**i18n placement (important):** both `src/i18n/en.ts` and `src/i18n/ms.ts`
currently have uncommitted work-in-progress. Add the `quickLog` block INSIDE the
existing `settings: { … }` object (so it reads `t.settings.quickLog.*`), matching
the file's existing indentation/quote style, and add it to BOTH files with the
SAME keys (the `lint:i18n` check and typed `t` require en/ms parity). Do not
disturb the surrounding WIP lines.

- [ ] **Step 2: Create the screen `src/screens/personal/QuickLogSetup.tsx`**

Follow existing screen structure (SafeAreaView + ScrollView + themed styles). The
imports/hooks below are the app's REAL APIs (verified): theme via `useCalm()`
(returns the palette `C`, e.g. `C.background`, `C.text`, `C.textSecondary`,
`C.border`, `C.surface`, `C.accent`, `C.danger`) from `../../hooks/useCalm`;
translations via `useT()` from `../../i18n`; toasts via `useToast()` →
`showToast(msg, 'success'|'error'|'info')` from `../../context/ToastContext`;
`SPACING`/`RADIUS` from `../../constants`. `expo-clipboard` is installed (~8.0.8).
There is NO `useTheme`/`colors` hook and no `Toast` module in `components/common`.
Replace the `SHORTCUT_URL` placeholder once you publish the iCloud Shortcut (Task 8).

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../../i18n';
import { useCalm } from '../../hooks/useCalm';
import { useToast } from '../../context/ToastContext';
import { SPACING, RADIUS } from '../../constants';
import {
  registerQuickLogKey, getQuickLogKeyStatus, revokeQuickLogKey,
} from '../../services/quickLogKey';

// TODO(Task 8): replace with the published iCloud Shortcut link.
const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/REPLACE_ME';

export default function QuickLogSetup() {
  const t = useT();
  const C = useCalm();
  const { showToast } = useToast();
  const [hasKey, setHasKey] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getQuickLogKeyStatus().then((s) => setHasKey(s.hasActiveKey)); }, []);

  const onGenerate = async () => {
    setBusy(true);
    try {
      const key = await registerQuickLogKey();
      setShownKey(key);
      setHasKey(true);
    } catch {
      showToast(t.settings.quickLog.signInFirst, 'error');
    } finally { setBusy(false); }
  };

  const onCopy = async () => {
    if (!shownKey) return;
    await Clipboard.setStringAsync(shownKey);
    showToast(t.settings.quickLog.copied, 'success');
  };

  const onRevoke = async () => {
    await revokeQuickLogKey();
    setHasKey(false);
    setShownKey(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.intro, { color: C.textSecondary }]}>
          {t.settings.quickLog.intro}
        </Text>
        <Text style={[styles.status, { color: C.text }]}>
          {hasKey ? t.settings.quickLog.active : t.settings.quickLog.inactive}
        </Text>

        {shownKey && (
          <View style={[styles.keyBox, { borderColor: C.border, backgroundColor: C.surface }]}>
            <Text selectable style={[styles.key, { color: C.text }]}>{shownKey}</Text>
            <Text style={[styles.warn, { color: C.textSecondary }]}>
              {t.settings.quickLog.keyOnceWarning}
            </Text>
            <Pressable style={[styles.btn, { backgroundColor: C.accent }]} onPress={onCopy}>
              <Text style={styles.btnText}>{t.settings.quickLog.copyKey}</Text>
            </Pressable>
          </View>
        )}

        <Pressable disabled={busy} style={[styles.btn, { backgroundColor: C.accent }]} onPress={onGenerate}>
          <Text style={styles.btnText}>
            {hasKey ? t.settings.quickLog.regenerate : t.settings.quickLog.generate}
          </Text>
        </Pressable>

        <Pressable style={[styles.btn, styles.secondary, { borderColor: C.border }]}
          onPress={() => Linking.openURL(SHORTCUT_URL)}>
          <Text style={[styles.btnText, { color: C.text }]}>{t.settings.quickLog.getShortcut}</Text>
        </Pressable>

        {hasKey && (
          <Pressable style={styles.revoke} onPress={onRevoke}>
            <Text style={{ color: C.danger }}>{t.settings.quickLog.revoke}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: SPACING.lg, gap: SPACING.md },
  intro: { fontSize: 15, lineHeight: 22 },
  status: { fontSize: 15, fontWeight: '600' },
  keyBox: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
  key: { fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  warn: { fontSize: 13, lineHeight: 18 },
  btn: { borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondary: { backgroundColor: 'transparent', borderWidth: 1 },
  revoke: { alignItems: 'center', paddingVertical: 12 },
});
```

Note: `useCalm`/`useT`/`useToast`/`SPACING`/`RADIUS` paths above are verified, but
still confirm `RADIUS.md` and `SPACING.lg/md/sm` exist in `src/constants` (they're
used across `Settings.tsx`); if a specific key is missing, substitute the nearest
existing one. Match the neighbouring personal screens (e.g. `Goals.tsx`,
`Settings.tsx`) for any header/nav-options convention.

- [ ] **Step 3: Register the screen in `RootNavigator.tsx`**

Add the import at the top: `import QuickLogSetup from '../screens/personal/QuickLogSetup';`
Then add a `Stack.Screen` next to the other personal detail screens (near
`ReceiptHistory`, RootNavigator.tsx:335). **Copy the sibling screen's exact
registration shape** — how it sets the `options` title in particular: do NOT
assume a `t`/translation variable is in scope here; use the SAME mechanism the
neighbouring `Stack.Screen` entries already use for their titles (inspect
RootNavigator.tsx:330-340 first). Minimal correct form:

```tsx
<Stack.Screen name="QuickLogSetup" component={QuickLogSetup} />
```

(add `options` for the title only if/how the siblings do — matching their pattern).

- [ ] **Step 4: Add the Settings row**

In `src/screens/shared/Settings.tsx`, in the "money" section (near the existing
quick-add settings, ~Settings.tsx:544), add a `SettingRow` that navigates to the
new screen. **Match the exact props the existing `<SettingRow …/>` usages take in
this file** — inspect a current usage first (it likely uses `label`/`icon`/`onPress`
or similar, and `t` is available as `useT()` here). Illustrative only:

```tsx
<SettingRow label={t.settings.quickLog.row} onPress={() => navigation.navigate('QuickLogSetup')} />
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean (fix any import-path mismatches surfaced here).

- [ ] **Step 6: Manual verification**

Build/run the app. Settings → "Quick Log (Back Tap)" opens the screen. Tap "Generate my key" → a key shows with the one-time warning → "Copy key" copies it → toast. Reopen: status shows "set up", no raw key shown. "Turn off Quick Log" flips it back.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(quick-log): add Quick Log setup screen + settings entry" -- src/screens/personal/QuickLogSetup.tsx src/navigation/RootNavigator.tsx src/screens/shared/Settings.tsx src/i18n/en.ts src/i18n/ms.ts
```
Note: `Settings.tsx`, `en.ts`, and `ms.ts` have pre-existing uncommitted WIP on
`main`. A pathspec commit of those paths WILL include that WIP alongside your
edits — that is expected here (the user opted to build on `main`). Do not attempt
to separate it; just commit these five paths and nothing else.

---

### Task 8: The Apple Shortcut recipe (user-built) + docs

**Files:**
- Create: `docs/quick-log-shortcut.md`

**Interfaces:**
- Consumes: the deployed `quick-log` endpoint and the user's Quick-Log key.

- [ ] **Step 1: Write the recipe doc**

Create `docs/quick-log-shortcut.md`:

```markdown
# Potraces Quick Log — Back Tap Shortcut

One-time setup for a user:
1. In Potraces: Settings → **Quick Log (Back Tap)** → **Generate my key** → **Copy key**.
2. Open the shared Shortcut link (the "Get the Shortcut" button) and **Add Shortcut**.
3. On first run it asks for your key — **paste** it. (Stored in the Shortcut forever.)
4. Settings (iOS) → Accessibility → Touch → **Back Tap** → **Double Tap** → choose **Potraces Quick Log**.

## Shortcut actions (build once, share as an iCloud link)
1. **Text** → your Quick-Log key (or an Import Question "Your Potraces key").
2. **Ask for Input** — Number — "Amount" → var `Amount`.
3. **Choose from Menu** — Food & Dining / Transportation / Shopping / Entertainment /
   Healthcare / Other. Each branch sets `Category` to the matching id:
   `food` / `transport` / `shopping` / `entertainment` / `health` / `other`.
4. **Choose from Menu** — Cash / Maybank / TNG / Card / … → set `Wallet` to the label text.
5. **Ask for Input** — Text — "Note" → var `Note`.
6. **Get Contents of URL**
   - URL: `https://iydqeeonaljqapulboaz.supabase.co/functions/v1/quick-log`
   - Method: POST, Headers: `Content-Type: application/json`
   - Request Body (JSON):
     `{ "key": Key, "amount": Amount, "category": Category, "wallet": Wallet, "note": Note }`
7. **If** the response contains `"ok":true` → **Show Notification** "Logged RM[Amount] to [Category]".
   **Otherwise** (offline / error) → **Open URL**
   `potraces://add?amount=[Amount]&category=[Category]&wallet=[Wallet]&note=[Note]`
   (the offline fallback — opens the app and logs locally).
```

- [ ] **Step 2: Build + publish the real Shortcut**

In the iOS Shortcuts app, build the actions above, test end-to-end (double-tap → menus → banner → entry appears in the app), then **Share → Copy iCloud Link**. Paste that link into `SHORTCUT_URL` in `src/screens/personal/QuickLogSetup.tsx` (replace the `REPLACE_ME` placeholder) and re-run `npm run typecheck`.

- [ ] **Step 3: Commit**

```bash
git add docs/quick-log-shortcut.md src/screens/personal/QuickLogSetup.tsx
git commit -m "docs(quick-log): add Back Tap Shortcut recipe + wire iCloud link"
```

---

## Self-Review

**Spec coverage:**
- Hard constraint (URL scheme foregrounds) → backend path via Tasks 1/3/4. ✓
- Decision 1 (inbox + reconcile) → Task 1 (inbox), Task 4 (drain via `logQuickExpense`). ✓
- Decision 2 (per-user key, hashed) → Task 1 (`quick_log_keys`), Task 2 (service), Task 3 (validation). ✓
- Setup UX (one-time paste) → Task 7 (screen), Task 8 (Shortcut import). ✓
- Shortcut recipe (amount/category/payment/note/POST/banner) → Task 8. ✓
- Push → History → Task 3 (send), Task 6 (tap-nav). ✓
- Offline fallback to `potraces://add` → Task 8 Step 1. ✓
- Edge cases (logged-out, offline, bad amount, dup drains, revoked) → Task 3 (bad amount/revoked), Task 4 (dup via consumed_at), Task 8 (offline), Task 7 (logged-out toast). ✓

**Placeholder scan:** The only intentional placeholder is `SHORTCUT_URL = REPLACE_ME`, resolved in Task 8 Step 2 (you cannot know the iCloud link until you publish the Shortcut). No requirement-level TBDs.

**Type consistency:** `hashKey` (SHA-256 hex) defined identically in Task 2 and Task 3, cross-checked in Task 3 Step 3. `QuickLogParams` consumed by Task 4 matches `src/services/quickLog.ts:17`. `mapInboxRowToQuickLog` / `drainQuickLogInbox` names consistent between Task 4 and Task 5. Inbox column names identical across Task 1 (DDL), Task 3 (insert), Task 4 (select).
