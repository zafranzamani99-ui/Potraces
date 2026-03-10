import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get caller identity
    const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    // Delete all seller data in order (respecting foreign keys)
    // Orders reference seller_profiles(id), so get profile id first
    const { data: profile } = await admin
      .from('seller_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (profile) {
      // Delete order_link orders (seller_id reference)
      await admin
        .from('seller_orders')
        .delete()
        .eq('seller_id', profile.id);
    }

    // Delete user-owned data
    await admin.from('seller_orders').delete().eq('user_id', userId);
    await admin.from('seller_products').delete().eq('user_id', userId);
    await admin.from('seller_seasons').delete().eq('user_id', userId);
    await admin.from('seller_customers').delete().eq('user_id', userId);
    await admin.from('otp_verifications').delete().eq('user_id', userId);
    await admin.from('seller_profiles').delete().eq('user_id', userId);

    // Delete the auth user entirely
    await admin.auth.admin.deleteUser(userId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
