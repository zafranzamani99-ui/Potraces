import { supabase } from './supabase';
import { SellerProduct, SellerOrder, Season, SellerCustomer, IngredientCost, RecurringCost, CostTemplate } from '../types';
import { useSellerStore } from '../store/sellerStore';

// ─── Safe date parsing ────────────────────────────────────────────────────────
const sd = (v: any): Date => {
  if (!v) return new Date();
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
};

/** Get current auth session. Returns null if not authenticated. */
async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  // Check if token needs refresh (within 60s of expiry)
  const expiresAt = session.expires_at ?? 0;
  if (expiresAt * 1000 < Date.now() + 60000) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    return refreshed ?? session;
  }
  return session;
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

/** Clears the cached profile ID (call on sign-out). */
export function clearProfileCache(): void {
  _cachedProfileId = null;
}

// ─── Push helpers ─────────────────────────────────────────────────────────────

function toIso(d: Date | string | undefined | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : d;
}

export async function pushProducts(products: SellerProduct[]): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const syncStart = new Date().toISOString();

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

  // Tombstone: delete remote products removed locally, only if older than sync start
  const localIds = new Set(products.map((p) => p.id));
  const { data: remote } = await supabase
    .from('seller_products')
    .select('local_id, updated_at')
    .eq('user_id', session.user.id);

  if (remote && remote.length > 0) {
    const toDelete = remote
      .filter((r) => r.local_id && !localIds.has(r.local_id) && r.updated_at < syncStart)
      .map((r) => r.local_id as string);

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
  const syncStart = new Date().toISOString();

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
        delivery_date: toIso(o.deliveryDate),
        order_number: o.orderNumber ?? null,
      })
      .eq('id', o.supabaseId!);
  }

  // ── Tombstone: delete remote app orders removed locally, only if older than sync start ────
  const { data: remoteOrders } = await supabase
    .from('seller_orders')
    .select('local_id, updated_at')
    .eq('user_id', session.user.id)
    .eq('source', 'app');

  if (remoteOrders && remoteOrders.length > 0) {
    const localIdSet = new Set(localIds);
    const toDelete = remoteOrders
      .filter((r) => r.local_id && !localIdSet.has(r.local_id) && r.updated_at < syncStart)
      .map((r) => r.local_id as string);

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
  const syncStart = new Date().toISOString();

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

  // Tombstone: delete remote seasons removed locally, only if older than sync start
  const localIds = new Set(seasons.map((s) => s.id));
  const { data: remote } = await supabase
    .from('seller_seasons')
    .select('local_id, updated_at')
    .eq('user_id', session.user.id);

  if (remote && remote.length > 0) {
    const toDelete = remote
      .filter((r) => r.local_id && !localIds.has(r.local_id) && r.updated_at < syncStart)
      .map((r) => r.local_id as string);

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
  const syncStart = new Date().toISOString();

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

  // Tombstone: delete remote customers removed locally, only if older than sync start
  const localIds = new Set(customers.map((c) => c.id));
  const { data: remote } = await supabase
    .from('seller_customers')
    .select('local_id, updated_at')
    .eq('user_id', session.user.id);

  if (remote && remote.length > 0) {
    const toDelete = remote
      .filter((r) => r.local_id && !localIds.has(r.local_id) && r.updated_at < syncStart)
      .map((r) => r.local_id as string);

    if (toDelete.length > 0) {
      await supabase
        .from('seller_customers')
        .delete()
        .eq('user_id', session.user.id)
        .in('local_id', toDelete);
    }
  }
}

export async function pushIngredientCosts(ingredientCosts: IngredientCost[]): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const syncStart = new Date().toISOString();

  if (ingredientCosts.length > 0) {
    const rows = ingredientCosts.map((c) => ({
      user_id: session.user.id,
      local_id: c.id,
      description: c.description,
      amount: c.amount,
      date: toIso(c.date) ?? new Date().toISOString(),
      season_local_id: c.seasonId ?? null,
      product_id: c.productId ?? null,
      synced_to_personal: c.syncedToPersonal ?? false,
      personal_transaction_id: c.personalTransactionId ?? null,
    }));

    await supabase
      .from('seller_ingredient_costs')
      .upsert(rows, { onConflict: 'user_id,local_id' });
  }

  // Tombstone: delete remote ingredient costs removed locally, only if older than sync start
  const localIds = new Set(ingredientCosts.map((c) => c.id));
  const { data: remote } = await supabase
    .from('seller_ingredient_costs')
    .select('local_id, updated_at')
    .eq('user_id', session.user.id);

  if (remote && remote.length > 0) {
    const toDelete = remote
      .filter((r) => r.local_id && !localIds.has(r.local_id) && r.updated_at < syncStart)
      .map((r) => r.local_id as string);

    if (toDelete.length > 0) {
      await supabase
        .from('seller_ingredient_costs')
        .delete()
        .eq('user_id', session.user.id)
        .in('local_id', toDelete);
    }
  }
}

export async function pushRecurringCosts(recurringCosts: RecurringCost[]): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const syncStart = new Date().toISOString();

  if (recurringCosts.length > 0) {
    const rows = recurringCosts.map((r) => ({
      user_id: session.user.id,
      local_id: r.id,
      description: r.description,
      amount: r.amount,
      frequency: r.frequency,
      next_due: toIso(r.nextDue) ?? new Date().toISOString(),
      season_local_id: r.seasonId ?? null,
      is_active: r.isActive,
    }));

    await supabase
      .from('seller_recurring_costs')
      .upsert(rows, { onConflict: 'user_id,local_id' });
  }

  // Tombstone: delete remote recurring costs removed locally, only if older than sync start
  const localIds = new Set(recurringCosts.map((r) => r.id));
  const { data: remote } = await supabase
    .from('seller_recurring_costs')
    .select('local_id, updated_at')
    .eq('user_id', session.user.id);

  if (remote && remote.length > 0) {
    const toDelete = remote
      .filter((r) => r.local_id && !localIds.has(r.local_id) && r.updated_at < syncStart)
      .map((r) => r.local_id as string);

    if (toDelete.length > 0) {
      await supabase
        .from('seller_recurring_costs')
        .delete()
        .eq('user_id', session.user.id)
        .in('local_id', toDelete);
    }
  }
}

export async function pushCostTemplates(costTemplates: CostTemplate[]): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const syncStart = new Date().toISOString();

  if (costTemplates.length > 0) {
    const rows = costTemplates.map((t) => ({
      user_id: session.user.id,
      local_id: t.id,
      description: t.description,
      amount: t.amount,
    }));

    await supabase
      .from('seller_cost_templates')
      .upsert(rows, { onConflict: 'user_id,local_id' });
  }

  // Tombstone: delete remote cost templates removed locally, only if older than sync start
  const localIds = new Set(costTemplates.map((t) => t.id));
  const { data: remote } = await supabase
    .from('seller_cost_templates')
    .select('local_id, updated_at')
    .eq('user_id', session.user.id);

  if (remote && remote.length > 0) {
    const toDelete = remote
      .filter((r) => r.local_id && !localIds.has(r.local_id) && r.updated_at < syncStart)
      .map((r) => r.local_id as string);

    if (toDelete.length > 0) {
      await supabase
        .from('seller_cost_templates')
        .delete()
        .eq('user_id', session.user.id)
        .in('local_id', toDelete);
    }
  }
}

// ─── Pull from Supabase ───────────────────────────────────────────────────────

/**
 * Pull remote data and merge into local store.
 * Adds items that don't exist locally (by local_id) and updates existing items
 * if the remote updated_at is newer than the local updatedAt.
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
    const localProductMap = new Map(store.products.map((p) => [p.id, p]));
    let productsChanged = false;
    let updatedProducts = [...store.products];

    for (const rp of remoteProducts) {
      if (!rp.local_id) continue;
      const local = localProductMap.get(rp.local_id);

      const remoteItem: SellerProduct = {
        id: rp.local_id,
        name: rp.name,
        description: rp.description ?? undefined,
        pricePerUnit: rp.price_per_unit,
        costPerUnit: rp.cost_per_unit ?? undefined,
        unit: rp.unit,
        isActive: rp.is_active,
        totalSold: rp.total_sold ?? 0,
        trackStock: rp.track_stock ?? false,
        stockQuantity: rp.stock_quantity ?? undefined,
        createdAt: sd(rp.created_at),
        updatedAt: sd(rp.updated_at),
      };

      if (!local) {
        updatedProducts.push(remoteItem);
        productsChanged = true;
      } else if (rp.updated_at && sd(rp.updated_at).getTime() > sd(local.updatedAt).getTime()) {
        updatedProducts = updatedProducts.map((p) =>
          p.id === rp.local_id ? remoteItem : p
        );
        productsChanged = true;
      }
    }

    if (productsChanged) {
      useSellerStore.setState({ products: updatedProducts });
    }
  }

  // Pull seasons
  const { data: remoteSeasons } = await supabase
    .from('seller_seasons')
    .select('*')
    .eq('user_id', userId);

  if (remoteSeasons && remoteSeasons.length > 0) {
    const localSeasonMap = new Map(store.seasons.map((s) => [s.id, s]));
    let seasonsChanged = false;
    let updatedSeasons = [...store.seasons];

    for (const rs of remoteSeasons) {
      if (!rs.local_id) continue;
      const local = localSeasonMap.get(rs.local_id);

      const remoteItem: Season = {
        id: rs.local_id,
        name: rs.name,
        startDate: sd(rs.start_date),
        endDate: rs.end_date ? sd(rs.end_date) : undefined,
        isActive: rs.is_active,
        note: rs.note ?? undefined,
        costBudget: rs.cost_budget ?? undefined,
        revenueTarget: rs.revenue_target ?? undefined,
        createdAt: sd(rs.created_at),
      };

      if (!local) {
        updatedSeasons.push(remoteItem);
        seasonsChanged = true;
      } else if (rs.updated_at && sd(rs.updated_at).getTime() > sd(local.createdAt).getTime()) {
        // Seasons don't have updatedAt locally — compare remote updated_at with local createdAt as best approximation
        updatedSeasons = updatedSeasons.map((s) =>
          s.id === rs.local_id ? remoteItem : s
        );
        seasonsChanged = true;
      }
    }

    if (seasonsChanged) {
      useSellerStore.setState({ seasons: updatedSeasons });
    }
  }

  // Pull customers
  const { data: remoteCustomers } = await supabase
    .from('seller_customers')
    .select('*')
    .eq('user_id', userId);

  if (remoteCustomers && remoteCustomers.length > 0) {
    const localCustomerMap = new Map(store.sellerCustomers.map((c) => [c.id, c]));
    let customersChanged = false;
    let updatedCustomers = [...store.sellerCustomers];

    for (const rc of remoteCustomers) {
      if (!rc.local_id) continue;
      const local = localCustomerMap.get(rc.local_id);

      const remoteItem: SellerCustomer = {
        id: rc.local_id,
        name: rc.name,
        phone: rc.phone ?? undefined,
        address: rc.address ?? undefined,
        note: rc.note ?? undefined,
        isVip: rc.is_vip ?? false,
        createdAt: sd(rc.created_at),
      };

      if (!local) {
        updatedCustomers.push(remoteItem);
        customersChanged = true;
      } else if (rc.updated_at && sd(rc.updated_at).getTime() > sd(local.createdAt).getTime()) {
        // Customers don't have updatedAt locally — compare remote updated_at with local createdAt
        updatedCustomers = updatedCustomers.map((c) =>
          c.id === rc.local_id ? remoteItem : c
        );
        customersChanged = true;
      }
    }

    if (customersChanged) {
      useSellerStore.setState({ sellerCustomers: updatedCustomers });
    }
  }

  // Pull app orders
  const { data: remoteOrders } = await supabase
    .from('seller_orders')
    .select('*')
    .eq('user_id', userId)
    .eq('source', 'app');

  if (remoteOrders && remoteOrders.length > 0) {
    const localOrderMap = new Map(store.orders.map((o) => [o.id, o]));
    let ordersChanged = false;
    let updatedOrders = [...store.orders];

    for (const ro of remoteOrders) {
      if (!ro.local_id) continue;
      const local = localOrderMap.get(ro.local_id);

      const remoteItem: SellerOrder = {
        id: ro.local_id,
        orderNumber: ro.order_number ?? undefined,
        items: ro.items ?? [],
        customerName: ro.customer_name ?? undefined,
        customerPhone: ro.customer_phone ?? undefined,
        customerAddress: ro.customer_address ?? undefined,
        totalAmount: ro.total_amount,
        date: sd(ro.created_at),
        status: ro.status as any,
        isPaid: ro.is_paid,
        paidAmount: ro.paid_amount ?? undefined,
        paymentMethod: (ro.payment_method as any) ?? undefined,
        paidAt: ro.paid_at ? sd(ro.paid_at) : undefined,
        note: ro.note ?? undefined,
        deliveryDate: ro.delivery_date ? sd(ro.delivery_date) : undefined,
        seasonId: ro.season_local_id ?? undefined,
        deposits: Array.isArray(ro.deposits)
          ? ro.deposits.map((d: any) => ({
              ...d,
              date: d.date ? sd(d.date) : new Date(),
            }))
          : [],
        source: 'app',
        supabaseId: ro.id,
        createdAt: sd(ro.created_at),
        updatedAt: sd(ro.updated_at),
      };

      if (!local) {
        updatedOrders.push(remoteItem);
        ordersChanged = true;
      } else if (ro.updated_at && sd(ro.updated_at).getTime() > sd(local.updatedAt).getTime()) {
        updatedOrders = updatedOrders.map((o) =>
          o.id === ro.local_id ? remoteItem : o
        );
        ordersChanged = true;
      }
    }

    if (ordersChanged) {
      useSellerStore.setState({ orders: updatedOrders });
    }
  }

  // Pull ingredient costs
  const { data: remoteIngredientCosts } = await supabase
    .from('seller_ingredient_costs')
    .select('*')
    .eq('user_id', userId);

  if (remoteIngredientCosts && remoteIngredientCosts.length > 0) {
    const localCostMap = new Map(store.ingredientCosts.map((c) => [c.id, c]));
    let costsChanged = false;
    let updatedCosts = [...store.ingredientCosts];

    for (const rc of remoteIngredientCosts) {
      if (!rc.local_id) continue;
      const local = localCostMap.get(rc.local_id);

      const remoteItem: IngredientCost = {
        id: rc.local_id,
        description: rc.description,
        amount: rc.amount,
        date: sd(rc.date),
        seasonId: rc.season_local_id ?? undefined,
        productId: rc.product_id ?? undefined,
        syncedToPersonal: rc.synced_to_personal ?? false,
        personalTransactionId: rc.personal_transaction_id ?? undefined,
      };

      if (!local) {
        updatedCosts.push(remoteItem);
        costsChanged = true;
      } else if (rc.updated_at && sd(rc.updated_at).getTime() > sd(local.date).getTime()) {
        // IngredientCost doesn't have updatedAt — use date as approximation
        updatedCosts = updatedCosts.map((c) =>
          c.id === rc.local_id ? remoteItem : c
        );
        costsChanged = true;
      }
    }

    if (costsChanged) {
      useSellerStore.setState({ ingredientCosts: updatedCosts });
    }
  }

  // Pull recurring costs
  const { data: remoteRecurringCosts } = await supabase
    .from('seller_recurring_costs')
    .select('*')
    .eq('user_id', userId);

  if (remoteRecurringCosts && remoteRecurringCosts.length > 0) {
    const localRcMap = new Map(store.recurringCosts.map((r) => [r.id, r]));
    let rcsChanged = false;
    let updatedRcs = [...store.recurringCosts];

    for (const rr of remoteRecurringCosts) {
      if (!rr.local_id) continue;
      const local = localRcMap.get(rr.local_id);

      const remoteItem: RecurringCost = {
        id: rr.local_id,
        description: rr.description,
        amount: rr.amount,
        frequency: rr.frequency as any,
        nextDue: sd(rr.next_due),
        seasonId: rr.season_local_id ?? undefined,
        isActive: rr.is_active,
        createdAt: sd(rr.created_at),
      };

      if (!local) {
        updatedRcs.push(remoteItem);
        rcsChanged = true;
      } else if (rr.updated_at && sd(rr.updated_at).getTime() > sd(local.createdAt).getTime()) {
        updatedRcs = updatedRcs.map((r) =>
          r.id === rr.local_id ? remoteItem : r
        );
        rcsChanged = true;
      }
    }

    if (rcsChanged) {
      useSellerStore.setState({ recurringCosts: updatedRcs });
    }
  }

  // Pull cost templates
  const { data: remoteCostTemplates } = await supabase
    .from('seller_cost_templates')
    .select('*')
    .eq('user_id', userId);

  if (remoteCostTemplates && remoteCostTemplates.length > 0) {
    const localTplMap = new Map(store.costTemplates.map((t) => [t.id, t]));
    let tplsChanged = false;
    let updatedTpls = [...store.costTemplates];

    for (const rt of remoteCostTemplates) {
      if (!rt.local_id) continue;
      const local = localTplMap.get(rt.local_id);

      const remoteItem: CostTemplate = {
        id: rt.local_id,
        description: rt.description,
        amount: rt.amount,
      };

      if (!local) {
        updatedTpls.push(remoteItem);
        tplsChanged = true;
      }
      // CostTemplate has no timestamps locally for comparison, so only add new ones
    }

    if (tplsChanged) {
      useSellerStore.setState({ costTemplates: updatedTpls });
    }
  }
}

// ─── Full sync ────────────────────────────────────────────────────────────────

/**
 * Sync all local seller data to Supabase. Fire-and-forget — errors are logged.
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

    const results = await Promise.allSettled([
      pushProducts(store.products),
      pushOrders(store.orders, profileId),
      pushSeasons(store.seasons),
      pushCustomers(store.sellerCustomers),
      pushIngredientCosts(store.ingredientCosts),
      pushRecurringCosts(store.recurringCosts),
      pushCostTemplates(store.costTemplates),
    ]);

    const pushNames = ['products', 'orders', 'seasons', 'customers', 'ingredientCosts', 'recurringCosts', 'costTemplates'];
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.warn(`[sellerSync] push ${pushNames[i]} failed:`, result.reason instanceof Error ? result.reason.message : result.reason);
      }
    });
  } catch (err) {
    console.warn('[sellerSync] syncAll failed:', err instanceof Error ? err.message : err);
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
