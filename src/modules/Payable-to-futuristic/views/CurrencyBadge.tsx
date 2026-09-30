// components/CurrencyBadge.tsx
// Shows a single currency amount with its symbol, styled as a small chip.

import React from 'react';
import type { Currency } from '../models/payableToFuturistic';
import { CURRENCY_SYMBOLS } from '../models/payableToFuturistic';

interface Props {
  amount: number;
  currency: Currency;
  primary?: boolean;  // AED gets the prominent treatment
}

export const CurrencyBadge: React.FC<Props> = ({ amount, currency, primary = false }) => {
  const symbol = CURRENCY_SYMBOLS[currency];
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (primary) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-900 font-semibold text-base">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{symbol}</span>
        {formatted}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-2 py-0.5">
      <span className="font-medium text-gray-400">{symbol}</span>
      {formatted}
    </span>
  );
};