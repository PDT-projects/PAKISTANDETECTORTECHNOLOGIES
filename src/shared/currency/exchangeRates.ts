// Live exchange-rate cache for the Global Currency feature.
//
// Reuses the exact same free, no-API-key rate source already used by
// src/features/finance/currencyUtils.ts (open.er-api.com), but exposes a
// synchronous getter + background refresh so it can be called from plain
// service files, not just React components (formatGlobalCurrency() is
// called all over the app, often outside any component).

import { FALLBACK_RATES, RateMap, CurrencyCode } from '../../features/finance/currencyUtils';

let rates: RateMap = { ...FALLBACK_RATES };
let lastFetch: number | null = null;
let inFlight: Promise<RateMap> | null = null;
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes, matches useCurrencyRates()

type Listener = () => void;
const listeners = new Set<Listener>();
function notify() { listeners.forEach(l => l()); }

/** Subscribe to rate updates (so components can re-render with fresh numbers
 *  once a background refresh completes). */
export function subscribeToRates(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current cached rates — safe to call synchronously, anywhere. */
export function getRates(): RateMap {
  return rates;
}

/** Fetch fresh rates from the live API. Falls back silently to whatever is
 *  already cached (or the hardcoded FALLBACK_RATES) if the request fails —
 *  a network hiccup should never break currency display. */
export async function refreshRates(): Promise<RateMap> {
  if (inFlight) return inFlight; // de-dupe concurrent callers
  inFlight = (async () => {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await res.json();
      if (data.result === 'success') {
        rates = {
          PKR: data.rates.PKR,
          USD: 1,
          CAD: data.rates.CAD,
          AED: data.rates.AED,
          SAR: data.rates.SAR,
          GBP: data.rates.GBP,
          EUR: data.rates.EUR,
        };
        lastFetch = Date.now();
        notify();
      }
    } catch (err) {
      console.warn('[exchangeRates] live fetch failed, using cached/fallback rates:', err);
    } finally {
      inFlight = null;
    }
    return rates;
  })();
  return inFlight;
}

/** Call on app boot / before first format — refreshes only if the cache is
 *  missing or stale, so repeated calls are cheap. */
export function ensureRatesFresh(): void {
  if (lastFetch === null || Date.now() - lastFetch > REFRESH_INTERVAL_MS) {
    refreshRates(); // fire-and-forget; callers use whatever is cached right now
  }
}

/** AED amount -> the same value converted into `targetCode`, via the
 *  USD-pivot rate table (rates are all "units of X per 1 USD"). Returns the
 *  amount unchanged if the target is AED itself, or if a rate is missing. */
export function convertFromAed(amountAed: number, targetCode: CurrencyCode): number {
  if (targetCode === 'AED') return amountAed;
  const r = rates;
  if (!r.AED || !r[targetCode]) return amountAed;
  return (amountAed / r.AED) * r[targetCode];
}

/** General converter between any two supported currencies (not just from
 *  AED) — used for data that's genuinely stored in a currency other than
 *  AED, e.g. an employee's salary recorded in PKR. Goes via the same
 *  USD-pivot rate table. */
export function convertBetween(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const r = rates;
  if (!r[from] || !r[to]) return amount;
  return (amount / r[from]) * r[to];
}
