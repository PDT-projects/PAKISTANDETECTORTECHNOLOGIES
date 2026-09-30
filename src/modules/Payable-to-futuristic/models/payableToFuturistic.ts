// models/payableToFuturistic.ts
export type Currency = 'AED' | 'PKR' | 'SAR' | 'USD';

export interface CurrencyAmounts {
  aed: number;
  pkr: number;
  sar: number;
  usd: number;
}

export type PayableStatus = 'pending' | 'partial' | 'paid';

export interface PayableToFuturistic {
  id: string;
  description: string;
  modelName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  productId: string;
  location?: string;
  saleDate?: string;
  amounts: CurrencyAmounts;
  paidAmounts: CurrencyAmounts;
  status: PayableStatus;
  dueDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Fixed USD prices per Futuristic model ────────────────────────────────────
export const FUTURISTIC_PRICES_USD: Record<string, number> = {
  'Revealer': 500,
  'Revealer Plus': 700,
  'Unvieler': 750,
  'Unvieler Plus': 900,
  'Tgx Lite': 1300,
  'Tgx Pro': 1500,
  'Tgx Special Edition': 1800,
  'Tgx Pro Plus': 2000,
};

/** Normalise model name for lookup — trim + title-case insensitive match */
export function getFuturisticPrice(modelName: string): number | null {
  const trimmed = modelName.trim();
  // direct match
  if (FUTURISTIC_PRICES_USD[trimmed] !== undefined) return FUTURISTIC_PRICES_USD[trimmed];
  // case-insensitive match
  const lower = trimmed.toLowerCase();
  const key = Object.keys(FUTURISTIC_PRICES_USD).find(
    (k) => k.toLowerCase() === lower
  );
  return key ? FUTURISTIC_PRICES_USD[key] : null;
}

// ── Exchange rates (USD base) ────────────────────────────────────────────────
export const USD_EXCHANGE_RATES: Record<Currency, number> = {
  USD: 1,
  AED: 3.67,
  PKR: 278,
  SAR: 3.75,
};

export function usdToAllCurrencies(usd: number): CurrencyAmounts {
  return {
    usd: parseFloat(usd.toFixed(2)),
    aed: parseFloat((usd * USD_EXCHANGE_RATES.AED).toFixed(2)),
    pkr: parseFloat((usd * USD_EXCHANGE_RATES.PKR).toFixed(2)),
    sar: parseFloat((usd * USD_EXCHANGE_RATES.SAR).toFixed(2)),
  };
}

export const ZERO_AMOUNTS: CurrencyAmounts = { aed: 0, pkr: 0, sar: 0, usd: 0 };


export const DEFAULT_EXCHANGE_RATES: Record<Exclude<Currency, 'AED'>, number> = {
  PKR: 75.5,
  SAR: 1.02,
  USD: 0.272,
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  AED: 'AED',
  PKR: '₨',
  SAR: 'SR',
  USD: '$',
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  AED: 'UAE Dirham (AED)',
  PKR: 'Pakistani Rupee (PKR)',
  SAR: 'Saudi Riyal (SAR)',
  USD: 'US Dollar (USD)',
};

/** Display-only — the same stored AED figure is shown under every
 *  currency's label. No conversion happens anywhere in this function; the
 *  DEFAULT_EXCHANGE_RATES snapshot above is unused now, kept only for any
 *  other caller that might still reference it directly. */
export function aedToAllCurrencies(aed: number): CurrencyAmounts {
  const n = aed || 0;
  return { aed: n, pkr: n, sar: n, usd: n };
}

export function formatCurrency(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}