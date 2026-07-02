// delete-account — full, irreversible deletion of the signed-in user's account.
//
// WHY: both the App Store (Guideline 5.1.1(v)) and Google Play require an app that
// offers account creation to let the user delete the ACCOUNT itself — the auth
// identity and all associated server data — not merely clear local data. The
// client cannot call auth.admin.deleteUser (service-role only), so it runs here.
//
// Deletes, for the caller's user id:
//   • every personal_* row, • every seller_* row (+ order_link orders), • otp rows,
//   • any Storage objects under a "<userId>/" prefix in every bucket (best-effort),
//   • finally the Supabase auth user.
// Deliberately NOT touched: ai_proxy_usage (a non-identifying monthly counter).
//
// CONTRACT: POST, header Authorization: Bearer <user JWT>. Returns { success: true }
// or a non-2xx with { error }. The client wipes local data + signs out only AFTER
// a 2xx — so a failed call (offline etc.) never strands the user with data gone but
// the account still alive.
//
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Personal tables (mirror of clearPersonalDataRemote in src/services/supabase.ts).
const PERSONAL_TABLES = [
  'personal_transactions',
  'personal_wallets',
  'personal_wallet_transfers',
  'personal_subscriptions',
  'personal_budgets',
  'personal_goals',
  'personal_debts',
  'personal_splits',
  'personal_contacts',
  'personal_savings_accounts',
  'personal_receipts',
];

// Seller tables owned directly by user_id (seller_orders + seller_profiles handled
// separately below because of the order_link foreign-key ordering).
const SELLER_USER_TABLES = [
  'seller_products',
  'seller_seasons',
  'seller_customers',
  'otp_verifications',
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'Missing authorization' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve the caller's identity from their JWT.
  let userId: string;
  try {
    const { data: { user }, error } = await admin.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ''),
    );
    if (error || !user) return json({ error: 'Invalid token' }, 401);
    userId = user.id;
  } catch {
    return json({ error: 'Invalid token' }, 401);
  }

  try {
    // 1. Personal rows.
    await Promise.allSettled(
      PERSONAL_TABLES.map((t) => admin.from(t).delete().eq('user_id', userId)),
    );

    // 2. Seller rows. order_link orders reference seller_profiles(id), so clear
    //    those via the profile id first, then everything owned by user_id.
    const { data: profile } = await admin
      .from('seller_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (profile) {
      await admin.from('seller_orders').delete().eq('seller_id', profile.id);
    }
    await admin.from('seller_orders').delete().eq('user_id', userId);
    await Promise.allSettled(
      SELLER_USER_TABLES.map((t) => admin.from(t).delete().eq('user_id', userId)),
    );
    await admin.from('seller_profiles').delete().eq('user_id', userId);

    // 3. Storage: remove any objects this user owns. The app stores user-scoped
    //    files under a "<userId>/" prefix; sweep that prefix in every bucket.
    //    Best-effort — a storage hiccup must not block account deletion.
    try {
      const { data: buckets } = await admin.storage.listBuckets();
      for (const b of buckets ?? []) {
        const { data: objects } = await admin.storage.from(b.id).list(userId, { limit: 1000 });
        if (objects && objects.length) {
          await admin.storage
            .from(b.id)
            .remove(objects.map((o) => `${userId}/${o.name}`));
        }
      }
    } catch {
      // ignore — orphaned objects are unreachable once the auth user is gone.
    }

    // 4. The auth user itself — this is the act that satisfies "delete the account".
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: `Failed to delete user: ${delErr.message}` }, 500);

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
