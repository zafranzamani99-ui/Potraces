import { supabase } from './supabase';
import { SellerProduct, SellerOrder, Season, SellerCustomer } from '../types';
import { useSellerStore } from '../store/sellerStore';

/** Get current auth session. Returns null if not authenticated. */
async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ?? null;
}

// ─── Profile management ───────────────────────────────────────────────────────

export interface SellerProfileData {
  displayName: string | null;
  slug: string | null;
  shopNotice: string | null;
}

export async function getSellerProfile(): Promise<SellerProfileData | null> {
  const session = await getSession();
  if (!session) return null;

  const { data } = await supabase
    .from('seller_profiles')
    .select('display_name, slug, shop_notice')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!data) return { displayName: null, slug: null, shopNotice: null };
  return { displayName: data.display_name, slug: data.slug, shopNotice: data.shop_notice };
}

/** Create or update display_name + slug + shop_notice. Returns error string or null. */
export async function updateSellerProfile(
  displayName: string,
  slug: string,
  shopNotice?: string,
): Promise<string | null> {
  const session = await getSession();
  if (!session) return 'Not authenticated. Please sign in.';

  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!cleanSlug) return 'URL kedai tidak sah';

  // Ensure profile row exists first
  await ensureProfile();

  const { error } = await supabase
    .from('seller_profiles')
    .update({
      display_name: displayName.trim() || null,
      slug: cleanSlug,
      shop_notice: shopNotice?.trim() || null,
    })
    .eq('user_id', session.user.id);

  if (error) {
    if (error.code === '23505') return 'This link is already taken. Try a different one.';
    return error.message;
  }
  return null;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

let _cachedProfileId: string | null = null;

/** Get or create the seller_profiles row. Returns the Supabase profile UUID. */
export async function ensureProfile(): Promise<string | null> {
  if (_cachedProfileId) return _cachedProfileId;

  const session = await getSession();
  if (!session) return null;

  const userId = session.user.id;

  // Try existing profile first
  const { data: existing } = await supabase
    .from('seller_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    _cachedProfileId = existing.id;
    return existing.id;
  }

  // Create profile
  const { data: created } = await supabase
    .from('seller_profiles')
    .insert({ user_id: userId, currency: 'RM' })
    .select('id')
    .single();

  if (created) {
    _cachedProfileId = created.id;
    return created.id;
  }

  return null;
}

/** Returns the cached profile ID if already resolved, without a network call. */
export function getCachedProfileId(): string | null {
  return _cachedProfileId;
}

// ─── Push helpers ─────────────────────────────────────────────────────────────

function toIso(d: Date | string | undefined | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : d;
}

export async function pushProducts(products: SellerProduct[]): Promise<void> {
  const session = await getSession();
  if (!session) return;

  if (products.length > 0) {
    const rows = products.map((p) => ({
      user_id: session.user.id,
      local_id: p.id,
      name: p.name,
      description: p.description ?? null,
      price_per_unit: p.pricePerUnit,
      cost_per_unit: p.costPerUnit ?? null,
      unit: p.unit,
      is_active: p.isActive,
      total_sold: p.totalSold,
      track_stock: p.trackStock ?? false,
      stock_quantity: p.stockQuantity ?? null,
    }));

    await supabase
      .from('seller_products')
      .upsert(rows, { onConflict: 'user_id,local_id' });
  }

  // Tombstone: delete remote products removed locally
  const localIds = new Set(products.map((p) => p.id));
  const { data: remote } = await supabase
    .from('seller_products')
    .select('local_id')
    .eq('user_id', session.user.id);

  if (remote && remote.length > 0) {
    const toDelete = remote
      .map((r) => r.local_id as string)
      .filter((id) => id && !localIds.has(id));

    if (toDelete.length > 0) {
      await supabase
        .from('seller_products')
        .delete()
        .eq('user_id', session.user.id)
        .in('local_id', toDelete);
    }
  }
}

export async function pushOrders(
  orders: SellerOrder[],
  profileId: string,
): Promise<void> {
  const session = await getSession();
  if (!session) return;

  // ── App-originated orders ──────────────────────────────────
  const appOrders = orders.filter((o) => o.source !== 'order_link');
  const localIds = appOrders.map((o) => o.id);

  if (appOrders.length > 0) {
    const rows = appOrders.map((o) => ({
      user_id: session.user.id,
      local_id: o.id,
      order_number: o.orderNumber ?? null,
      items: o.items,
      customer_name: o.customerName ?? null,
      customer_phone: o.customerPhone ?? null,
      customer_address: o.customerAddress ?? null,
      total_amount: o.totalAmount,
      status: o.status,
      is_paid: o.isPaid,
      paid_amount: o.paidAmount ?? null,
      payment_method: o.paymentMethod ?? null,
      paid_at: toIso(o.paidAt),
      note: o.note ?? null,
      delivery_date: toIso(o.deliveryDate),
      season_local_id: o.seasonId ?? null,
      deposits: o.deposits ?? [],
      source: 'app',
      seller_id: profileId,
    }));

    await supabase
      .from('seller_orders')
      .upsert(rows, { onConflict: 'user_id,local_id' });
  }

  // ── Order_link orders — push local edits back ──────────────
  const editedLinkOrders = orders.filter(
    (o) => o.source === 'order_link' && o.supabaseId,
  );

  for (const o of editedLinkOrders) {
    await supabase
      .from('seller_orders')
      .update({
        items: o.items,
        total_amount: o.totalAmount,
        customer_name: o.customerName ?? null,
        customer_phone: o.customerPhone ?? null,
        customer_address: o.customerAddress ?? null,
        status: o.status,
        is_paid: o.isPaid,
        paid_amount: o.paidAmount ?? null,
        payment_method: o.paymentMethod ?? null,
        paid_at: toIso(o.paidAt),
        note: o.note ?? null,
        deposits: o.deposits ?? [],
      })
      .eq('id', o.supabaseId!);
  }

  // ── Tombstone: delete remote app orders removed locally ────
  const { data: remoteOrders } = await supabase
    .from('seller_orders')
    .select('local_id')
    .eq('user_id', session.user.id)
    .eq('source', 'app');

  if (remoteOrders && remoteOrders.length > 0) {
    const toDelete = remoteOrders
      .map((r) => r.local_id as string)
      .filter((id) => id && !localIds.includes(id));

    if (toDelete.length > 0) {
      await supabase
        .from('seller_orders')
        .delete()
        .eq('user_id', session.user.id)
        .eq('source', 'app')
        .in('local_id', toDelete);
    }
  }
}

export async function pushSeasons(seasons: Season[]): Promise<void> {
  const session = await getSession();
  if (!session) return;

  if (seasons.length > 0) {
    const rows = seasons.map((s) => ({
      user_id: session.user.id,
      local_id: s.id,
      name: s.name,
      start_date: toIso(s.startDate)!,
      end_date: toIso(s.endDate),
      is_active: s.isActive,
      note: s.note ?? null,
      cost_budget: s.costBudget ?? null,
      revenue_target: s.revenueTarget ?? null,
    }));

    await supabase
      .from('seller_seasons')
      .upsert(rows, { onConflict: 'user_id,local_id' });
  }

  // Tombstone: delete remote seasons removed locally
  const localIds = new Set(seasons.map((s) => s.id));
  const { data: remote } = await supabase
    .from('seller_seasons')
    .select('local_id')
    .eq('user_id', session.user.id);

  if (remote && remote.length > 0) {
    const toDelete = remote
      .map((r) => r.local_id as string)
      .filter((id) => id && !localIds.has(id));

    if (toDelete.length > 0) {
      await supabase
        .from('seller_seasons')
        .delete()
        .eq('user_id', session.user.id)
        .in('local_id', toDelete);
    }
  }
}

export async function pushCustomers(customers: SellerCustomer[]): Promise<void> {
  const session = await getSession();
  if (!session) return;

  if (customers.length > 0) {
    const rows = customers.map((c) => ({
      user_id: session.user.id,
      local_id: c.id,
      name: c.name,
      phone: c.phone ?? null,
      address: c.address ?? null,
      note: c.note ?? null,
      is_vip: c.isVip ?? false,
    }));

    await supabase
      .from('seller_customers')
      .upsert(rows, { onConflict: 'user_id,local_id' });
  }

  // Tombstone: delete remote customers removed locally
  const localIds = new Set(customers.map((c) => c.id));
  const { data: remote } = await supabase
    .from('seller_customers')
    .select('local_id')
    .eq('user_id', session.user.id);

  if (remote && remote.length > 0) {
    const toDelete = remote
      .map((r) => r.local_id as string)
      .filter((id) => id && !localIds.has(id));

    if (toDelete.length > 0) {
      await supabase
        .from('seller_customers')
        .delete()
        .eq('user_id', session.user.id)
        .in('local_id', toDelete);
    }
  }
}

// ─── Pull from Supabase ───────────────────────────────────────────────────────

/**
 * Pull remote data and merge into local store.
 * Only adds items that don't already exist locally (by local_id).
 * Must run BEFORE push to prevent tombstone logic from deleting remote data.
 */
export async function pullAll(): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const userId = session.user.id;
  const store = useSellerStore.getState();

  // Pull products
  const { data: remoteProducts } = await supabase
    .from('seller_products')
    .select('*')
    .eq('user_id', userId);

  if (remoteProducts && remoteProducts.length > 0) {
    const localProductIds = new Set(store.products.map((p) => p.id));
    for (const rp of remoteProducts) {
      if (rp.local_id && !localProductIds.has(rp.local_id)) {
        store.addProduct({
          name: rp.name,
          pricePerUnit: rp.price_per_unit,
          costPerUnit: rp.cost_per_unit ?? undefined,
          unit: rp.unit,
          isActive: rp.is_active,
          trackStock: rp.track_stock ?? false,
          stockQuantity: rp.stock_quantity ?? undefined,
          description: rp.description ?? undefined,
        });
        // Fix the ID to match remote local_id
        useSellerStore.setState((s) => ({
          products: s.products.map((p) =>
            p.name === rp.name && p.id !== rp.local_id
              ? { ...p, id: rp.local_id, totalSold: rp.total_sold ?? 0 }
              : p
          ),
        }));
      }
    }
  }

  // Pull seasons
  const { data: remoteSeasons } = await supabase
    .from('seller_seasons')
    .select('*')
    .eq('user_id', userId);

  if (remoteSeasons && remoteSeasons.length > 0) {
    const localSeasonIds = new Set(store.seasons.map((s) => s.id));
    for (const rs of remoteSeasons) {
      if (rs.local_id && !localSeasonIds.has(rs.local_id)) {
        useSellerStore.setState((s) => ({
          seasons: [
            ...s.seasons,
            {
              id: rs.local_id,
              name: rs.name,
              startDate: new Date(rs.start_date),
              endDate: rs.end_date ? new Date(rs.end_date) : undefined,
              isActive: rs.is_active,
              note: rs.note ?? undefined,
              costBudget: rs.cost_budget ?? undefined,
              revenueTarget: rs.revenue_target ?? undefined,
            },
          ],
        }));
      }
    }
  }

  // Pull customers
  const { data: remoteCustomers } = await supabase
    .from('seller_customers')
    .select('*')
    .eq('user_id', userId);

  if (remoteCustomers && remoteCustomers.length > 0) {
    const localCustomerIds = new Set(store.sellerCustomers.map((c) => c.id));
    for (const rc of remoteCustomers) {
      if (rc.local_id && !localCustomerIds.has(rc.local_id)) {
        useSellerStore.setState((s) => ({
          sellerCustomers: [
            ...s.sellerCustomers,
            {
              id: rc.local_id,
              name: rc.name,
              phone: rc.phone ?? undefined,
              address: rc.address ?? undefined,
              note: rc.note ?? undefined,
              isVip: rc.is_vip ?? false,
            },
          ],
        }));
      }
    }
  }

  // Pull app orders
  const { data: remoteOrders } = await supabase
    .from('seller_orders')
    .select('*')
    .eq('user_id', userId)
    .eq('source', 'app');

  if (remoteOrders && remoteOrders.length > 0) {
    const localOrderIds = new Set(store.orders.map((o) => o.id));
    for (const ro of remoteOrders) {
      if (ro.local_id && !localOrderIds.has(ro.local_id)) {
        useSellerStore.setState((s) => ({
          orders: [
            ...s.orders,
            {
              id: ro.local_id,
              orderNumber: ro.order_number ?? undefined,
              items: ro.items ?? [],
              customerName: ro.customer_name ?? undefined,
              customerPhone: ro.customer_phone ?? undefined,
              customerAddress: ro.customer_address ?? undefined,
              totalAmount: ro.total_amount,
              status: ro.status as any,
              isPaid: ro.is_paid,
              paidAmount: ro.paid_amount ?? undefined,
              paymentMethod: ro.payment_method as any ?? undefined,
              paidAt: ro.paid_at ? new Date(ro.paid_at) : undefined,
              note: ro.note ?? undefined,
              deliveryDate: ro.delivery_date ? new Date(ro.delivery_date) : undefined,
              seasonId: ro.season_local_id ?? undefined,
              deposits: ro.deposits ?? [],
              source: 'app',
              supabaseId: ro.id,
              createdAt: new Date(ro.created_at),
              updatedAt: new Date(ro.updated_at),
            },
          ],
        }));
      }
    }
  }
}

// ─── Full sync ────────────────────────────────────────────────────────────────

/**
 * Sync all local seller data to Supabase. Fire-and-forget — errors are swallowed.
 * Call on startup and on app foreground.
 * Pulls remote data first to prevent tombstone deletion on new devices.
 */
export async function syncAll(
  products: SellerProduct[],
  orders: SellerOrder[],
  seasons: Season[],
  customers: SellerCustomer[],
): Promise<void> {
  try {
    const profileId = await ensureProfile();
    if (!profileId) return;

    // Pull first — prevents empty local store from deleting remote data
    await pullAll();

    // Re-read store after pull (may have new items merged in)
    const store = useSellerStore.getState();

    await Promise.allSettled([
      pushProducts(store.products),
      pushOrders(store.orders, profileId),
      pushSeasons(store.seasons),
      pushCustomers(store.sellerCustomers),
    ]);
  } catch {
    // Sync failures are non-fatal — app works fully offline
  }
}

// ─── Delete order from Supabase ───────────────────────────────────────────────

/**
 * Delete an order from Supabase by its supabaseId.
 * Used when deleting order_link orders locally so they don't reappear on next pull.
 */
export async function deleteOrderFromSupabase(supabaseId: string): Promise<void> {
  const profileId = await ensureProfile();
  if (!profileId) return;

  await supabase
    .from('seller_orders')
    .delete()
    .eq('id', supabaseId)
    .eq('seller_id', profileId);
}

// ─── Pull order_link orders ────────────────────────────────────────────────────

/**
 * Fetch all order_link orders for this seller from Supabase and merge any
 * that aren't already in local state (matched by supabaseId).
 */
export async function pullOrderLinkOrders(): Promise<void> {
  const profileId = await ensureProfile();
  if (!profileId) return;

  const { data } = await supabase
    .from('seller_orders')
    .select('*')
    .eq('seller_id', profileId)
    .eq('source', 'order_link')
    .is('user_id', null)
    .order('created_at', { ascending: false });

  if (!data || data.length === 0) return;

  const { addOrderLinkOrder, orders } = useSellerStore.getState();
  const knownIds = new Set(orders.filter((o) => o.supabaseId).map((o) => o.supabaseId));

  for (const row of data) {
    if (!knownIds.has(row.id)) {
      addOrderLinkOrder(row as Record<string, unknown>);
    }
  }
}

// ─── Realtime — order_link orders ─────────────────────────────────────────────

/**
 * Subscribe to new orders placed by customers via the order link.
 * Returns an unsubscribe function.
 *
 * @param profileId  The seller's Supabase profile UUID (from ensureProfile())
 * @param onNewOrder Called with the raw Supabase row for each new order_link order
 */
export function subscribeToOrderLinkOrders(
  profileId: string,
  onNewOrder: (row: Record<string, unknown>) => void,
): () => void {
  const channel = supabase
    .channel(`order_link_${profileId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'seller_orders',
        filter: `seller_id=eq.${profileId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        if (row.source === 'order_link') {
          onNewOrder(row);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
