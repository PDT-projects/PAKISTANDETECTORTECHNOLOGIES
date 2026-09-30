import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, AlertCircle, Loader2 } from 'lucide-react';
import { CurrencyCode, RateMap, CURRENCIES, getCurrencyMeta } from './currencyUtils';

interface CurrencyDropdownProps {
  primary?: CurrencyCode;
  extras?: CurrencyCode[];
  onPrimaryChange?: (c: CurrencyCode) => void;
  onExtrasChange?: (c: CurrencyCode[]) => void;
  loading?: boolean;
  error?: boolean;
  lastUpdated?: Date | null;
  // when true, allow selecting other currencies (only used by TopBar)
  allowSelect?: boolean;
}

export function CurrencyDropdown({
  primary = 'AED', extras = [], onPrimaryChange = () => {}, onExtrasChange = () => {},
  loading = false, error = false, lastUpdated = null, allowSelect = false,
}: CurrencyDropdownProps) {
  // Compact badge for non-selectable contexts
  if (!allowSelect) {
    const meta = getCurrencyMeta(primary);
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">{meta.code}</span>
      </div>
    );
  }

  // Full dropdown behaviour (used only in TopBar)
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const primaryMeta = getCurrencyMeta(primary);

  const toggleExtra = (code: CurrencyCode) => {
    if (code === primary) return;
    onExtrasChange(extras.includes(code) ? extras.filter(c => c !== code) : [...extras, code]);
  };

  const selectPrimary = (code: CurrencyCode) => {
    onPrimaryChange(code);
    onExtrasChange(extras.filter(c => c !== code));
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-3 flex-wrap" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300"
      >
        <span className="inline-flex items-center justify-center px-2 py-1 text-[11px] font-extrabold tracking-widest text-slate-700 bg-slate-100 rounded">
          {primaryMeta.code}
        </span>
        <span>{primaryMeta.label}</span>
        <ChevronDown size={14} className={`${open ? 'rotate-180' : ''} transition-transform`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Primary Currency</p>
          </div>
          {CURRENCIES.map(cur => {
            const selected = primary === cur.code;
            return (
              <button
                key={cur.code}
                onClick={() => selectPrimary(cur.code)}
                className={`w-full px-4 py-3 text-left transition ${selected ? 'bg-slate-50' : 'hover:bg-slate-100'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{cur.code}</div>
                    <div className="text-xs text-slate-500">{cur.label}</div>
                  </div>
                  <div className={`flex items-center justify-center h-6 w-6 rounded-lg border ${selected ? 'border-slate-900 bg-slate-900' : 'border-slate-200'}`}>
                    {selected && <Check size={14} className="text-white" />}
                  </div>
                </div>
              </button>
            );
          })}
          <div className="border-t border-slate-200 px-4 pt-3 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Also show</p>
          </div>
          {CURRENCIES.filter(cur => cur.code !== primary).map(cur => {
            const checked = extras.includes(cur.code);
            return (
              <button
                key={cur.code}
                onClick={() => toggleExtra(cur.code)}
                className="w-full px-4 py-3 text-left transition hover:bg-slate-100"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{cur.code}</div>
                    <div className="text-xs text-slate-500">{cur.label}</div>
                  </div>
                  <div className={`h-6 w-6 rounded-lg border ${checked ? 'border-slate-900 bg-slate-900' : 'border-slate-200'} flex items-center justify-center`}>
                    {checked && <Check size={14} className="text-white" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <Loader2 size={12} className="animate-spin" /> Updating rates...
        </span>
      )}
      {!loading && error && (
        <span className="inline-flex items-center gap-1 text-xs text-amber-500">
          <AlertCircle size={12} /> Estimated rates
        </span>
      )}
      {!loading && !error && lastUpdated && (
        <span className="text-xs text-slate-500">Live · {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      )}
    </div>
  );
}

export interface CurrencyRowsProps {
  extras: CurrencyCode[];
  pkrAmount?: number;
  rates?: RateMap;
  dark?: boolean;
}

export function CurrencyRows({ extras, pkrAmount, rates }: CurrencyRowsProps) {
  if (extras.length === 0) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
      {extras.map(code => {
        const meta = getCurrencyMeta(code);
        const amount = 0; // conversion handled elsewhere; kept placeholder for compatibility
        return (
          <div key={code} className="flex items-center justify-between text-sm text-slate-600">
            <span className="font-semibold">{code}</span>
            <span>{/* fmtCurrency(amount, code) */}</span>
          </div>
        );
      })}
    </div>
  );
}
