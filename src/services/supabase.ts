import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: AsyncStorage,
  },
});

// ─── Auth helpers ────────────────────────────────────────────────────────────

/** Map phone number to a fake email for Supabase email auth. */
export function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@potraces.app`;
}

/** Get existing auth session (no auto-creation). */
export async function getAuthSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** Sign up with phone + password. */
export async function signUpWithPhone(phone: string, password: string) {
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

/** Sign in with phone + password. */
export async function signInWithPhone(phone: string, password: string) {
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** Sign out. */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Request OTP code for Telegram verification. */
export async function requestOtp(phone: string): Promise<{ code: string; expiresAt: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/request-otp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Check if the current user's seller profile is verified. */
export async function checkVerification(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const { data } = await supabase
    .from('seller_profiles')
    .select('is_verified')
    .eq('user_id', session.user.id)
    .maybeSingle();

  return data?.is_verified ?? false;
}

/** Delete all business data on server and delete the auth user. */
export async function clearBusinessDataRemote() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/clear-business-data`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to clear remote data (${res.status})`);
  }
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
