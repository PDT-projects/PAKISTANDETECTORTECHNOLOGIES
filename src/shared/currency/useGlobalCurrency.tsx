// Shared "changing point" for every module's display currency.
//
// This is a thin adapter over the app's one system-wide currency setting
// (CurrencyContext.tsx -> Firestore `settings/currency`) - the same setting
// the admin controls from the "System Currency" dropdown in User Management,
// and the same one already driving the Income Statement, Balance Sheet,
// Payable/Receivable reports and the Purchased Orders module.
//
// Every consumer reads through this file instead of CurrencyContext directly
// so they all share one "changing point": change the currency once in User
// Management and Banking, Employee, Inventory and Purchased Orders update
// together.
//
// Symbol-only, same rule as everywhere else this system follows: nothing
// here converts a stored number. `formatCurrency` only changes the label
// Intl.NumberFormat prints next to a figure - the figure's magnitude is
// never touched.

import { useCallback, useEffect, type ReactNode } from 'react';
import { useCurrency } from '../../providers/context/CurrencyContext';
import { CURRENCIES } from '../../features/finance/currencyUtils';
import { bootGlobalCurrency } from './globalCurrency';

/** Short, unambiguous symbol for each currency the admin can pick (User
 *  Management's dropdown offers exactly these five, via currencyUtils.ts). */
const CODE_SYMBOL: Record<string, string> = {
  PKR: 'Rs',
  USD: '$',
  CAD: 'CA$',
  AED: 'AED',
  SAR: 'SAR',
};

export interface GlobalCurrency {
  /** The system-wide currency code, e.g. 'AED', 'USD'. */
  code: string;
  /** Human-readable name, e.g. 'US Dollar'. Falls back to the code if unrecognized. */
  name: string;
  /** Short symbol, e.g. '$', 'Rs'. Falls back to the code if unrecognized. */
  symbol: string;
  /** Formats a stored figure in the live global currency. No conversion — same
   *  number, different label. Returns '—' for an undefined amount. */
  formatCurrency: (n?: number) => string;
}

export function useGlobalCurrency(): GlobalCurrency {
  const { primary } = useCurrency();
  const meta = CURRENCIES.find(c => c.code === primary);

  const formatCurrency = useCallback((n?: number) => {
    if (n === undefined) return '—';
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: primary,
      minimumFractionDigits: 0,
    }).format(n);
  }, [primary]);

  return {
    code: primary,
    name: meta?.label ?? primary,
    symbol: CODE_SYMBOL[primary] ?? primary,
    formatCurrency,
  };
}

/**
 * Mounted once at the very top of App.tsx, wrapping everything else
 * (AuthProvider, the router, the toaster). Starts globalCurrency.ts's own
 * backup Firestore subscription — see that file's top comment for why it's
 * a backup and not the primary path. The primary path is CurrencyContext
 * (mounted separately in main.tsx, above App) calling syncGlobalCurrencyCode()
 * directly whenever its own subscription delivers a value, so
 * getGlobalCurrencySymbol() et al. stay correct even if this boot never runs.
 *
 * Never withholds or delays rendering its children.
 */
export function GlobalCurrencyBoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    return bootGlobalCurrency();
  }, []);
  return <>{children}</>;
}

export default useGlobalCurrency;
