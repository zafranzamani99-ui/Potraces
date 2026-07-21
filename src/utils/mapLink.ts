/**
 * Google Maps / Waze link parsing for the Collectz venue preview card.
 * Pure module (no imports) — tsx-testable.
 *
 * Short links (maps.app.goo.gl, waze.com/ul without coords) can't be resolved
 * client-side — parseMapCoords returns null for those; the raw URL still works
 * for the open-in-app buttons.
 */

export interface MapCoords {
  lat: number;
  lon: number;
}

const COORD = /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/;

function valid(lat: number, lon: number): boolean {
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
}

export function isGoogleMapsUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes('google.') && u.includes('/maps') || u.includes('maps.app.goo.gl') || u.includes('goo.gl/maps');
}

export function isWazeUrl(url: string): boolean {
  return url.toLowerCase().includes('waze.com');
}

/** True when the string looks like a maps/waze link worth showing a card for. */
export function isMapsLink(url: string): boolean {
  return isGoogleMapsUrl(url) || isWazeUrl(url);
}

/** Extract lat/lon from a Google Maps or Waze link. Null = unparseable (short link or place-name query). */
export function parseMapCoords(url: string): MapCoords | null {
  if (!url) return null;
  const u = url.trim();

  // Waze: ?ll=lat,lon (ul / live-map links; both raw and %2C separators)
  const waze =
    u.match(/[?&]ll=(-?\d{1,2}(?:\.\d+)?)%2C(-?\d{1,3}(?:\.\d+)?)/i) ??
    u.match(/[?&]ll=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i);
  if (waze) {
    const lat = parseFloat(waze[1]);
    const lon = parseFloat(waze[2]);
    if (valid(lat, lon)) return { lat, lon };
  }

  // Google place page: .../@lat,lon,zoom...
  const at = u.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (at) {
    const lat = parseFloat(at[1]);
    const lon = parseFloat(at[2]);
    if (valid(lat, lon)) return { lat, lon };
  }

  // Google params: q / query / ll / daddr / destination / saddr = lat,lon
  for (const key of ['q', 'query', 'll', 'daddr', 'destination', 'saddr']) {
    const m = u.match(new RegExp(`[?&]${key}=([^&]+)`));
    if (!m) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(m[1]);
    } catch {
      decoded = m[1];
    }
    const c = decoded.match(COORD);
    if (c) {
      const lat = parseFloat(c[1]);
      const lon = parseFloat(c[2]);
      if (valid(lat, lon)) return { lat, lon };
    }
  }

  return null;
}

export function googleMapsUrl(c: MapCoords): string {
  return `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}`;
}

export function wazeUrl(c: MapCoords): string {
  return `https://waze.com/ul?ll=${c.lat},${c.lon}&navigate=yes`;
}

/**
 * Waze SEARCH deep-link, for when a pasted link has no parseable lat/lon — a
 * short `maps.app.goo.gl` link hides its coords behind a redirect, and a
 * place-name query has none at all. Without this the Waze button falls back to
 * the original Google URL, which opens Google Maps instead of Waze.
 */
export function wazeSearchUrl(query: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}

/** Google Maps SEARCH deep-link by place name — the no-coords counterpart. */
export function googleSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
