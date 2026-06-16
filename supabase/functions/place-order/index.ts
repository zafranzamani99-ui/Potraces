import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * place-order — the public order-submission gateway.
 *
 * The public order page (docs/index.html) used to INSERT straight into
 * seller_orders with the anon key. That let anyone read the key from page
 * source and curl unlimited fake orders (each firing the seller's push
 * trigger), and let a buyer send their own total_amount (e.g. RM 0.01 for a
 * real order). This function closes both holes:
 *
 *   page -> POST /functions/v1/place-order
 *        -> validate input
 *        -> optional Cloudflare Turnstile check
 *        -> resolve seller by slug
 *        -> per-seller flood cap (max 20 order_link orders / minute)
 *        -> verify every product is active + owned by the seller
 *        -> RECOMPUTE total_amount from server-side prices (never trust client)
 *        -> service-role INSERT (source='order_link', user_id=null, seller_id)
 *   The existing trg_notify_order_link push trigger fires unchanged.
 *
 * After this ships, the anon INSERT policy is revoked (separate migration) so
 * this function is the ONLY way to create an order_link order.
 *
 * Public function (verify_jwt=false). Secrets (Deno env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — auto-provided by the runtime.
 *   TURNSTILE_SECRET — optional; if unset, the captcha check is skipped (soft
 *     path) so the page keeps working before real keys are added.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET');
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Per-seller flood caps. A real micro-seller never legitimately exceeds these,
// but they bound sustained push-spam: a steady-drip attacker can't ring the
// seller's phone more than a handful of times a minute or run all day.
//   short window — burst protection.
const FLOOD_LIMIT = 10;
const FLOOD_WINDOW_MS = 60 * 1000;
//   long window — caps the all-day steady-drip ceiling.
const FLOOD_LIMIT_LONG = 60;
const FLOOD_WINDOW_LONG_MS = 10 * 60 * 1000;

// Reject oversized bodies before parsing. A capped 50-line order with capped
// strings is well under 16 KB; 64 KB leaves generous headroom.
const MAX_BODY_BYTES = 64 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200, extraHeaders?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extraHeaders },
  });

interface ReqItem {
  productId: string;
  quantity: number;
}

interface ServerItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unit: string;
}

Deno.serve(async (req: Request) => {
  // 1) CORS preflight + method guard.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 2) Parse + validate the body. Reject oversized payloads BEFORE parsing so an
  //    unauthenticated caller can't force a multi-megabyte allocate/parse on this
  //    public endpoint. We check the declared content-length first, then re-check
  //    the actual text length in case the header is missing or forged.
  const declaredLen = parseInt(req.headers.get('content-length') || '', 10);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    return json({ error: 'Request too large.' }, 413);
  }
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: 'Request too large.' }, 413);
    raw = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const parsed = validateBody(raw);
  if ('error' in parsed) return json({ error: parsed.error }, 400);
  const { slug, items, customer, turnstileToken } = parsed;

  // 3) Turnstile (optional). If a secret is configured, the token must verify.
  //    If not configured, we proceed — this is the ONLY soft path, so the page
  //    keeps working before real Cloudflare keys are wired up.
  if (TURNSTILE_SECRET) {
    const remoteIp = req.headers.get('cf-connecting-ip')
      || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const ok = await verifyTurnstile(TURNSTILE_SECRET, turnstileToken, remoteIp);
    if (!ok) return json({ error: 'Could not verify you are human. Please try again.' }, 403);
  } else {
    console.warn('place-order: TURNSTILE_SECRET not set — skipping captcha (soft path).');
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 4) Resolve the seller by slug.
    const { data: seller, error: sellerErr } = await admin
      .from('seller_profiles_public')
      .select('id, user_id')
      .eq('slug', slug)
      .maybeSingle();
    if (sellerErr) throw sellerErr;
    if (!seller) return json({ error: 'Shop not found. Please check your link.' }, 404);

    // 5) Per-seller flood caps. Pull this seller's order_link timestamps over the
    //    longer window once, then evaluate both the short (burst) and long
    //    (all-day drip) caps from it.
    const now = Date.now();
    const longSince = new Date(now - FLOOD_WINDOW_LONG_MS).toISOString();
    const { data: recent, error: recentErr } = await admin
      .from('seller_orders')
      .select('created_at')
      .eq('seller_id', seller.id)
      .eq('source', 'order_link')
      .gt('created_at', longSince)
      .order('created_at', { ascending: true });
    if (recentErr) throw recentErr;

    const times = (recent ?? []).map((r) => new Date(r.created_at).getTime());
    const shortCutoff = now - FLOOD_WINDOW_MS;
    const inShort = times.filter((t) => t > shortCutoff);
    const overShort = inShort.length >= FLOOD_LIMIT;
    const overLong = times.length >= FLOOD_LIMIT_LONG;
    if (overShort || overLong) {
      // Real remaining wait = until the oldest order in the breached window ages
      // out. Take the larger of the two windows that are actually over cap.
      let retryAfterMs = 0;
      if (overShort) retryAfterMs = Math.max(retryAfterMs, FLOOD_WINDOW_MS - (now - inShort[0]));
      if (overLong) retryAfterMs = Math.max(retryAfterMs, FLOOD_WINDOW_LONG_MS - (now - times[0]));
      retryAfterMs = Math.max(0, retryAfterMs);
      return json(
        { error: 'This shop is receiving lots of orders right now. Please try again shortly.', retryAfterMs },
        429,
        { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
      );
    }

    // 6) Fetch the requested products — must be active + owned by this seller.
    const requestedIds = items.map((i) => i.productId);
    const { data: products, error: prodErr } = await admin
      .from('seller_products')
      .select('id, name, price_per_unit, unit')
      .eq('user_id', seller.user_id)
      .eq('is_active', true)
      .in('id', requestedIds);
    if (prodErr) throw prodErr;

    const byId = new Map<string, { id: string; name: string; price_per_unit: number; unit: string }>();
    for (const p of products ?? []) {
      byId.set(p.id, { id: p.id, name: p.name, price_per_unit: parseFloat(p.price_per_unit), unit: p.unit });
    }

    // Every requested product must resolve (active + owned). Otherwise reject —
    // a stale/forged id means the client's basket no longer matches the shop.
    const serverItems: ServerItem[] = [];
    for (const it of items) {
      const p = byId.get(it.productId);
      if (!p) return json({ error: 'One of the selected items is no longer available. Please refresh and try again.' }, 400);
      serverItems.push({
        productId: p.id,
        productName: p.name,
        quantity: it.quantity,
        unitPrice: p.price_per_unit,
        unit: p.unit,
      });
    }

    // 7) Recompute the total from server prices — never trust the client.
    const total = round2(serverItems.reduce((s, x) => s + x.unitPrice * x.quantity, 0));

    // 8) Insert via service role. Keep source='order_link', seller_id set,
    //    user_id null so the existing push trigger still fires.
    const { data: inserted, error: insErr } = await admin
      .from('seller_orders')
      .insert({
        user_id: null,
        source: 'order_link',
        seller_id: seller.id,
        items: serverItems,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_address: customer.address ?? null,
        note: customer.note ?? null,
        total_amount: total,
        status: 'pending',
        is_paid: false,
      })
      .select('id')
      .single();
    if (insErr) throw insErr;

    // 9) Done. Return the server-recomputed total so the buyer's success screen
    //    and WhatsApp message match the recorded order even if a price changed
    //    mid-session.
    return json({ ok: true, orderId: inserted.id, total });
  } catch (e) {
    // Never leak internals to the public caller.
    console.error('place-order failed:', e);
    return json({ error: 'Something went wrong placing your order. Please try again.' }, 500);
  }
});

// ─── Validation ─────────────────────────────────────────────────────────────

type Validated = {
  slug: string;
  items: ReqItem[];
  customer: { name: string; phone: string; address?: string; note?: string };
  turnstileToken?: string;
};

function validateBody(raw: unknown): Validated | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Invalid request.' };
  const b = raw as Record<string, unknown>;

  // slug
  const slug = typeof b.slug === 'string' ? b.slug.trim() : '';
  if (!slug) return { error: 'Missing shop link.' };

  // items
  if (!Array.isArray(b.items) || b.items.length === 0) return { error: 'Please select at least one item.' };
  if (b.items.length > 50) return { error: 'Too many items in one order.' };
  const items: ReqItem[] = [];
  for (const rawItem of b.items) {
    if (!rawItem || typeof rawItem !== 'object') return { error: 'Invalid item in order.' };
    const it = rawItem as Record<string, unknown>;
    const productId = typeof it.productId === 'string' ? it.productId.trim() : '';
    if (!productId) return { error: 'Invalid item in order.' };
    const quantity = it.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return { error: 'Item quantity must be between 1 and 999.' };
    }
    items.push({ productId, quantity });
  }

  // customer
  if (!b.customer || typeof b.customer !== 'object') return { error: 'Please enter your details.' };
  const c = b.customer as Record<string, unknown>;

  const name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!name) return { error: 'Please enter your name.' };
  if (name.length > 100) return { error: 'Name is too long.' };

  const phoneDigits = typeof c.phone === 'string' ? c.phone.replace(/\D/g, '') : '';
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    return { error: 'Please enter a valid phone number.' };
  }

  const addressRaw = typeof c.address === 'string' ? c.address.trim() : '';
  if (addressRaw.length > 300) return { error: 'Address is too long.' };

  const noteRaw = typeof c.note === 'string' ? c.note.trim() : '';
  if (noteRaw.length > 500) return { error: 'Note is too long.' };

  const turnstileToken = typeof b.turnstileToken === 'string' ? b.turnstileToken : undefined;

  return {
    slug,
    items,
    customer: {
      name,
      phone: phoneDigits,
      address: addressRaw || undefined,
      note: noteRaw || undefined,
    },
    turnstileToken,
  };
}

// ─── Turnstile ──────────────────────────────────────────────────────────────

async function verifyTurnstile(secret: string, token: string | undefined, remoteIp: string): Promise<boolean> {
  if (!token) return false;
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (remoteIp) form.append('remoteip', remoteIp);
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form });
    const out = (await res.json()) as { success?: boolean };
    return out.success === true;
  } catch (e) {
    console.error('place-order: Turnstile verify failed:', e);
    return false;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
