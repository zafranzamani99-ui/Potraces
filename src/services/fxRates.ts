import AsyncStorage from '@react-native-async-storage/async-storage';

// Supported currencies for the picker. MYR is the base.
export const SUPPORTED_CURRENCIES = [
  'MYR', 'SGD', 'USD', 'THB', 'IDR', 'VND', 'PHP', 'JPY', 'EUR', 'GBP', 'AUD', 'CNY',
] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

const CACHE_KEY = 'fx-rates-v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

interface CachedRates {
  base: 'MYR';
  rates: Record<string, number>; // rates[X] = 1 MYR in X
  fetchedAt: number; // epoch ms
}

// Fallback rates (approximate, frozen Jan 2026). Used if fetch fails.
const FALLBACK_RATES: Record<string, number> = {
  MYR: 1,
  SGD: 0.30,
  USD: 0.22,
  THB: 7.7,
  IDR: 3500,
  VND: 5500,
  PHP: 12.5,
  JPY: 33,
  EUR: 0.20,
  GBP: 0.17,
  AUD: 0.34,
  CNY: 1.6,
};

let inMemoryCache: CachedRates | null = null;
let inflight: Promise<CachedRates> | null = null;

async function readFromStorage(): Promise<CachedRates | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRates;
    if (!parsed?.rates || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchFromApi(): Promise<CachedRates> {
  const res = await fetch('https://open.er-api.com/v6/latest/MYR');
  if (!res.ok) throw new Error(`fx api ${res.status}`);
  const data = await res.json();
  if (data?.result !== 'success' || !data?.rates) throw new Error('fx bad response');
  return {
    base: 'MYR',
    rates: data.rates,
    fetchedAt: Date.now(),
  };
}

/** Return cached rates if fresh; otherwise fetch. Falls back to hardcoded
 *  rates on failure so the UI never hard-errors. */
export async function getRates(): Promise<CachedRates> {
  if (inMemoryCache && Date.now() - inMemoryCache.fetchedAt < CACHE_TTL_MS) {
    return inMemoryCache;
  }
  if (!inMemoryCache) {
    const stored = await readFromStorage();
    if (stored) inMemoryCache = stored;
  }
  if (inMemoryCache && Date.now() - inMemoryCache.fetchedAt < CACHE_TTL_MS) {
    return inMemoryCache;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const fresh = await fetchFromApi();
      inMemoryCache = fresh;
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
      return fresh;
    } catch {
      // Never throw — return whatever we have, else fallback.
      const fb: CachedRates = {
        base: 'MYR',
        rates: FALLBACK_RATES,
        fetchedAt: Date.now() - CACHE_TTL_MS + 60 * 1000, // soft stale
      };
      inMemoryCache = inMemoryCache ?? fb;
      return inMemoryCache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Convert `amount` from `fromCurrency` to MYR. Returns null if rates missing. */
export function toMyr(
  amount: number,
  fromCurrency: string,
  rates: Record<string, number>,
): number | null {
  const fc = fromCurrency.toUpperCase();
  if (fc === 'MYR') return amount;
  const rate = rates[fc];
  if (!rate || rate <= 0) return null;
  return amount / rate; // rates[X] = 1 MYR in X, so amountX / rate = MYR
}
