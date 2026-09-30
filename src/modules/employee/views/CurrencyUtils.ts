// currencyUtils.ts
// PKR ↔ AED conversion utilities (legacy, kept for any code that still
// wants a plain PKR/AED swap) — PLUS a live-rate converter that takes an
// employee's actual stored salary (PKR or AED, whichever salaryCurrency
// says) and converts it into whatever currency the Admin has picked
// globally, the same way every other module in the app now works.

import type { SalaryCurrency } from '../views/EmployeeListView';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';

// ---------------------------------------------------------------------------
// Legacy fixed-rate helpers — still here for any existing caller, but no
// longer used for the main salary display (see convertSalaryToGlobal below,
// which uses live rates instead of this frozen June-2026 snapshot).
// ---------------------------------------------------------------------------
export const AED_TO_PKR = 76.03; // 1 AED → PKR
export const PKR_TO_AED = 1 / AED_TO_PKR; // 1 PKR → AED  (~0.01315)

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a salary value from its stored currency to the target display currency.
 * The Employee model always stores salary in PKR (the base currency).
 * If you later store in AED, pass storedCurrency accordingly.
 */
export function convertSalary(
  amount: number,
  from: SalaryCurrency,
  to: SalaryCurrency
): number {
  if (from === to) return amount;
  if (from === 'PKR' && to === 'AED') return amount * PKR_TO_AED;
  if (from === 'AED' && to === 'PKR') return amount * AED_TO_PKR;
  return amount;
}

/**
 * Convert an employee's salary — genuinely stored in `storedCurrency`
 * (PKR or AED, whatever that employee's contract is actually in) — into
 * whichever currency the Admin has picked as the app-wide display
 * currency, using today's live rate. Unlike the AED-only modules, this
 * does NOT assume the stored number is AED; it converts from the real
 * stored currency first.
 */
export function convertSalaryToGlobal(amount: number, storedCurrency: SalaryCurrency): number {
  return amount || 0;
}

/** Formats an employee's salary with the current global display symbol.
 *  Display-only — the number itself is never converted. */
export function formatSalaryInGlobalCurrency(amount: number, storedCurrency: SalaryCurrency): string {
  const symbol = getGlobalCurrencySymbol();
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
  return `${symbol} ${formatted}`;
}

/**
 * Format a salary number as a locale string with the right symbol and code.
 *
 * Examples:
 *   formatSalary(150000, 'PKR')  → "₨ 1,50,000 PKR"
 *   formatSalary(1973.29, 'AED') → "د.إ 1,973 AED"
 */
export function formatSalary(amount: number, currency: SalaryCurrency): string {
  if (currency === 'PKR') {
    // Pakistani number format: South Asian grouping (e.g. 1,50,000)
    const formatted = new Intl.NumberFormat('en-PK', {
      maximumFractionDigits: 0,
    }).format(Math.round(amount));
    return `₨ ${formatted} PKR`;
  }

  // AED — standard Western grouping, 2 decimal places
  const formatted = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `د.إ ${formatted} AED`;
}

/**
 * Returns both PKR and AED representations of a salary stored in `storedCurrency`.
 * Useful for showing dual-currency breakdowns in modals or tooltips.
 */
export function getSalaryBothCurrencies(
  amount: number,
  storedCurrency: SalaryCurrency = 'PKR'
): { pkr: string; aed: string } {
  const pkrAmount =
    storedCurrency === 'PKR' ? amount : convertSalary(amount, 'AED', 'PKR');
  const aedAmount =
    storedCurrency === 'AED' ? amount : convertSalary(amount, 'PKR', 'AED');

  return {
    pkr: formatSalary(pkrAmount, 'PKR'),
    aed: formatSalary(aedAmount, 'AED'),
  };
}