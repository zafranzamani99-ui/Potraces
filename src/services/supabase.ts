import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Sign in anonymously on first launch.
 * Returns the session — call once at app startup.
 */
export async function ensureAnonSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

export type SupabaseSellerProduct = {
  id: string;
  user_id: string;
  local_id: string | null;
  name: string;
  price_per_unit: number;
  cost_per_unit: number | null;
  unit: string;
  is_active: boolean;
  total_sold: number;
  track_stock: boolean;
  stock_quantity: number | null;
  created_at: string;
  updated_at: string;
};

export type SupabaseSellerOrder = {
  id: string;
  user_id: string | null;
  local_id: string | null;
  order_number: string | null;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    unit: string;
  }>;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  total_amount: number;
  status: string;
  is_paid: boolean;
  paid_amount: number | null;
  payment_method: string | null;
  paid_at: string | null;
  note: string | null;
  delivery_date: string | null;
  season_local_id: string | null;
  source: 'app' | 'order_link';
  seller_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SupabaseSellerProfile = {
  id: string;
  user_id: string;
  display_name: string | null;
  slug: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
};
