import { useCallback, useEffect, useState } from 'react';

// Shared currency conversion utilities for finance reports.

export type CurrencyCode = 'PKR' | 'USD' | 'CAD' | 'AED' | 'SAR' | 'GBP' | 'EUR';

export interface CurrencyMeta {
  code: CurrencyCode;
  label: string;
  flag: string;
  locale: string;
  decimals: number;
}

export const CURRENCIES: CurrencyMeta[] = [
  { code: 'PKR', label: 'Pakistani Rupee', flag: '🇵🇰', locale: 'en-PK', decimals: 0 },
  { code: 'USD', label: 'US Dollar',         flag: '🇺🇸', locale: 'en-US', decimals: 2 },
  { code: 'CAD', label: 'Canadian Dollar',   flag: '🇨🇦', locale: 'en-CA', decimals: 2 },
  { code: 'AED', label: 'UAE Dirham',        flag: '🇦🇪', locale: 'en-AE', decimals: 2 },
  { code: 'SAR', label: 'Saudi Riyal',       flag: '🇸🇦', locale: 'en-US', decimals: 2 },
  { code: 'GBP', label: 'British Pound',     flag: '🇬🇧', locale: 'en-GB', decimals: 2 },
  { code: 'EUR', label: 'Euro',              flag: '🇪🇺', locale: 'en-IE', decimals: 2 },
];

export type RateMap = Record<CurrencyCode, number>;

export const FALLBACK_RATES: RateMap = {
  PKR: 279.5,
  USD: 1,
  CAD: 1.38,
  AED: 3.67,
  SAR: 3.75,
  GBP: 0.79,
  EUR: 0.92,
};

export const convertFromPKR = (amount: number, target: CurrencyCode, rates: RateMap): number =>
  target === 'PKR' ? amount : (amount / rates.PKR) * rates[target];

export const getCurrencyMeta = (code: CurrencyCode): CurrencyMeta => {
  const meta = CURRENCIES.find(c => c.code === code);
  if (!meta) throw new Error(`Unsupported currency code: ${code}`);
  return meta;
};

export const fmtCurrency = (amount: number, code: CurrencyCode): string => {
  const meta = getCurrencyMeta(code);
  try {
    return new Intl.NumberFormat(meta.locale, {
      style: 'currency', currency: meta.code,
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    }).format(amount);
  } catch {
    return `${meta.code} ${amount.toFixed(meta.decimals)}`;
  }
};

export function useCurrencyRates() {
  const [rates, setRates] = useState<RateMap>(FALLBACK_RATES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await res.json();
      if (data.result === 'success') {
        setRates({
          PKR: data.rates.PKR,
          USD: 1,
          CAD: data.rates.CAD,
          AED: data.rates.AED,
          SAR: data.rates.SAR,
          GBP: data.rates.GBP,
          EUR: data.rates.EUR,
        });
        setLastUpdated(new Date());
        setError(false);
      } else {
        throw new Error('Failed to load currency rates');
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchRates]);

  return { rates, loading, error, lastUpdated };
}
