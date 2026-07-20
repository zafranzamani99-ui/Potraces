// map-preview — server-side proxy for Google Static Maps, so the
// GOOGLE_MAPS_STATIC_KEY never ships in the client bundle (same reason
// ai-proxy holds the AI keys server-side). Public + auth-free: it returns
// a bare cacheable image, no user data.
//
// GET /map-preview?lat=..&lon=..&z=16&w=600&h=300
//   lat/lon  required, finite floats, |lat| <= 90, |lon| <= 180
//   z        optional zoom, default 16, clamped 3..19
//   w/h      optional pixel size, defaults 600x300, clamped 100..1280
//
// Secrets (Deno env): GOOGLE_MAPS_STATIC_KEY (supabase secrets set ...).

const MAPS_KEY = Deno.env.get('GOOGLE_MAPS_STATIC_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Strict coordinate parse: rejects missing/blank params and junk suffixes
// (Number('') would be 0; parseFloat('1.5x') would silently truncate).
const parseCoord = (s: string | null): number => {
  if (s == null || s.trim() === '') return NaN;
  return Number(s);
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  if (!MAPS_KEY) return json({ error: 'not-configured' }, 503);

  const url = new URL(req.url);
  const lat = parseCoord(url.searchParams.get('lat'));
  const lon = parseCoord(url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json({ error: 'bad-coords' }, 400);
  }

  const zRaw = parseInt(url.searchParams.get('z') ?? '', 10);
  const z = clamp(Number.isFinite(zRaw) ? zRaw : 16, 3, 19);
  const wRaw = parseInt(url.searchParams.get('w') ?? '', 10);
  const w = clamp(Number.isFinite(wRaw) ? wRaw : 600, 100, 1280);
  const hRaw = parseInt(url.searchParams.get('h') ?? '', 10);
  const h = clamp(Number.isFinite(hRaw) ? hRaw : 300, 100, 1280);

  const upstream =
    `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}` +
    `&zoom=${z}&size=${w}x${h}&scale=2&maptype=roadmap` +
    `&markers=color:0x4F5104%7C${lat},${lon}&key=${MAPS_KEY}`;

  let res: Response;
  try {
    res = await fetch(upstream);
  } catch {
    return json({ error: 'upstream' }, 502);
  }
  if (!res.ok) return json({ error: 'upstream' }, 502);

  const bytes = await res.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
});
