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
// GET /map-preview?u=<encoded google-maps/waze link>&w=..&h=..
//   Short-link resolver: share links (maps.app.goo.gl, waze.com/ul/…) carry
//   no lat/lon the client can read, so the server follows the redirect and
//   pulls coords out of the FINAL url, then serves the same static image.
//   Host-allowlisted (google / goo.gl / waze) — never proxies page content.
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

// Mirror of the coord extraction in src/utils/mapLink.ts (functions are
// standalone — keep the regexes in sync).
const validCoords = (lat: number, lon: number) =>
  Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);

function coordsFromUrl(u: string): { lat: number; lon: number } | null {
  const waze =
    u.match(/[?&]ll=(-?\d{1,2}(?:\.\d+)?)%2C(-?\d{1,3}(?:\.\d+)?)/i) ??
    u.match(/[?&]ll=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i);
  if (waze) {
    const lat = parseFloat(waze[1]);
    const lon = parseFloat(waze[2]);
    if (validCoords(lat, lon)) return { lat, lon };
  }
  const at = u.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (at) {
    const lat = parseFloat(at[1]);
    const lon = parseFloat(at[2]);
    if (validCoords(lat, lon)) return { lat, lon };
  }
  // Place-page data blob: …!3d<lat>!4d<lon>… (no @viewport in newer links).
  const bang = u.match(/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (bang) {
    const lat = parseFloat(bang[1]);
    const lon = parseFloat(bang[2]);
    if (validCoords(lat, lon)) return { lat, lon };
  }
  // q=/query=/daddr=lat,lon param forms (mirrors the client parser).
  for (const key of ['q', 'query', 'daddr', 'destination']) {
    const m = u.match(new RegExp(`[?&]${key}=(-?\\d{1,2}(?:\\.\\d+)?)(?:,|%2C)(-?\\d{1,3}(?:\\.\\d+)?)(?:&|$)`, 'i'));
    if (m) {
      const lat = parseFloat(m[1]);
      const lon = parseFloat(m[2]);
      if (validCoords(lat, lon)) return { lat, lon };
    }
  }
  return null;
}

/**
 * Address fallback: iOS-app share links (…?g_st=ic) often resolve to
 * google.com/maps?q=<place name + address> with NO coordinates anywhere in
 * the URL. Static Maps accepts an address as center/markers directly (it
 * geocodes internally), so extract the q= text and let Google place the pin.
 */
function addressFromUrl(u: string): string | null {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return null;
  }
  const q = url.searchParams.get('q') ?? url.searchParams.get('query');
  if (q && q.trim() && !/^-?\d{1,2}(\.\d+)?,/.test(q.trim())) return q.trim();
  // Place-page path: /maps/place/<name>/…
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
  if (place) {
    try {
      const name = decodeURIComponent(place[1]).replace(/\+/g, ' ').trim();
      if (name) return name;
    } catch {
      // fall through
    }
  }
  return null;
}

// Only map hosts may be resolved — this is a coord extractor, not a proxy.
const ALLOWED_HOST = /(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$|(^|\.)waze\.com$/i;

interface Resolved {
  coords?: { lat: number; lon: number };
  /** Plain-text place/address for Static Maps' own geocoder (no coords found). */
  address?: string;
}

/** Follow a share link's redirects; return coords — or an address fallback. */
async function resolveShortLink(raw: string): Promise<Resolved | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !ALLOWED_HOST.test(u.hostname)) return null;
  // Coords already in the raw link (waze ?ll=, full @lat,lon) — no fetch needed.
  const direct = coordsFromUrl(raw);
  if (direct) return { coords: direct };
  try {
    const res = await fetch(raw, { redirect: 'follow' });
    res.body?.cancel(); // only the final URL matters, not the page
    const final = res.url || raw;
    const coords = coordsFromUrl(final);
    if (coords) return { coords };
    const address = addressFromUrl(final);
    return address ? { address } : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  if (!MAPS_KEY) return json({ error: 'not-configured' }, 503);

  const url = new URL(req.url);
  let lat = parseCoord(url.searchParams.get('lat'));
  let lon = parseCoord(url.searchParams.get('lon'));

  // Short-link path: resolve ?u= to coords — or an address — when lat/lon
  // aren't given. Newer iOS-app share links (?g_st=ic) redirect to an
  // address-only URL, so the address fallback is what keeps those previews alive.
  let address: string | null = null;
  const uParam = url.searchParams.get('u');
  if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && uParam) {
    const resolved = await resolveShortLink(uParam);
    if (resolved?.coords) {
      lat = resolved.coords.lat;
      lon = resolved.coords.lon;
    } else if (resolved?.address) {
      address = resolved.address;
    }
  }

  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  if (!hasCoords && !address) {
    return json({ error: 'bad-coords' }, 400);
  }

  const zRaw = parseInt(url.searchParams.get('z') ?? '', 10);
  const z = clamp(Number.isFinite(zRaw) ? zRaw : 16, 3, 19);
  const wRaw = parseInt(url.searchParams.get('w') ?? '', 10);
  const w = clamp(Number.isFinite(wRaw) ? wRaw : 600, 100, 1280);
  const hRaw = parseInt(url.searchParams.get('h') ?? '', 10);
  const h = clamp(Number.isFinite(hRaw) ? hRaw : 300, 100, 1280);

  // Static Maps geocodes a plain-text center/markers itself — one API, one key.
  const center = hasCoords ? `${lat},${lon}` : encodeURIComponent(address!);
  const upstream =
    `https://maps.googleapis.com/maps/api/staticmap?center=${center}` +
    `&zoom=${z}&size=${w}x${h}&scale=2&maptype=roadmap` +
    // Classic red pin (Google's marker red) — the olive 0x4F5104 accent read as
    // a murky green blob on the map and the owner rejected it.
    `&markers=color:0xEA4335%7C${center}&key=${MAPS_KEY}`;

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
