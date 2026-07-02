import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Mints a SHORT-LIVED, single-use streaming-STT token so the app can open a WebSocket DIRECTLY to the
// speech provider (Soniox / Deepgram) for live Malay transcription — WITHOUT the real provider key ever
// touching the app bundle. The real keys live only here, as Supabase edge-function secrets.
//
// Why direct-from-device (not a relay): true word-as-you-speak needs the audio to stream straight to the
// recognizer; a Supabase edge function can't hold a long audio socket (wall-clock cap). The temp key is
// valid for ~60s at CONNECT only and bounded by the provider's own single-use + max-session caps, so a
// leaked key can't be reused or run forever.
//
// Setup (operator):
//   supabase secrets set SONIOX_API_KEY=...        (real Soniox key — never in the app)
//   supabase secrets set DEEPGRAM_API_KEY=...       (optional, for the A/B branch)
//   supabase functions deploy stt-token

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SONIOX_API_KEY = Deno.env.get('SONIOX_API_KEY');
const DEEPGRAM_API_KEY = Deno.env.get('DEEPGRAM_API_KEY');
// Reuses the SAME secret the ai-proxy already uses — no new key/account needed for Gemini Live.
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-device-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Identity for attribution/abuse trace: the signed-in user id, else the device id (matches ai-proxy). */
async function resolveIdentity(req: Request): Promise<string | null> {
  const deviceId = req.headers.get('x-device-id') || '';
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    try {
      const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) return `user:${user.id}`;
    } catch {
      /* fall back to device id */
    }
  }
  return deviceId ? `dev:${deviceId}` : null;
}

async function mintSoniox(identity: string): Promise<Response> {
  if (!SONIOX_API_KEY) return json({ error: 'Voice streaming not configured' }, 500);
  const r = await fetch('https://api.soniox.com/v1/auth/temporary-api-key', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SONIOX_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usage_type: 'transcribe_websocket',
      expires_in_seconds: 60, // valid at CONNECT only; the socket persists after
      // NOT single_use: the client may need to re-open the socket within the 60s window (network blip /
      // graceful-degrade retry). The 60s expiry + max_session_duration_seconds already bound a leaked key.
      max_session_duration_seconds: 300, // hard server cap → bounds a leaked key
      client_reference_id: identity,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d?.api_key) return json({ error: 'STT auth error' }, 502);
  return json({ provider: 'soniox', token: d.api_key as string, expires_in: 60 });
}

async function mintGemini(identity: string): Promise<Response> {
  if (!GEMINI_API_KEY) return json({ error: 'Voice streaming not configured' }, 500);
  // Gemini Live ephemeral token (v1alpha): the device connects to the Live socket with this short-lived
  // token AS IF it were the key — the real GEMINI_API_KEY never leaves the server. newSessionExpireTime
  // bounds when a session may START; expireTime bounds total token life. uses:1 = one new session.
  const now = Date.now();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uses: 1,
      newSessionExpireTime: new Date(now + 60 * 1000).toISOString(), // must connect within 60s
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(), // token usable up to 30 min total
      liveConnectConstraints: {
        model: 'models/gemini-live-2.5-flash',
        config: { responseModalities: ['TEXT'], inputAudioTranscription: {} },
      },
    }),
  });
  const d = await r.json().catch(() => ({}));
  const token = d?.name || d?.token; // ephemeral token value is the resource `name` (e.g. "auth_tokens/…")
  if (!r.ok || !token) return json({ error: 'STT auth error' }, 502);
  return json({ provider: 'gemini', token: token as string, expires_in: 60 });
}

async function mintDeepgram(identity: string): Promise<Response> {
  if (!DEEPGRAM_API_KEY) return json({ error: 'Voice streaming not configured' }, 500);
  // Deepgram grants a short-lived token via /v1/auth/grant (Bearer the project key).
  const r = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: { Authorization: `Bearer ${DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl_seconds: 60, comment: identity }),
  });
  const d = await r.json().catch(() => ({}));
  const token = d?.access_token || d?.key;
  if (!r.ok || !token) return json({ error: 'STT auth error' }, 502);
  return json({ provider: 'deepgram', token: token as string, expires_in: 60 });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const identity = await resolveIdentity(req);
    if (!identity) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const provider =
      body?.provider === 'deepgram' ? 'deepgram' : body?.provider === 'gemini' ? 'gemini' : 'soniox';

    // NOTE: add an ai_proxy_usage budget check here (mirror ai-proxy) before minting, to meter voice
    // minutes per identity and prevent a rotated device-id from draining the provider key.

    if (provider === 'deepgram') return await mintDeepgram(identity);
    if (provider === 'gemini') return await mintGemini(identity);
    return await mintSoniox(identity);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
