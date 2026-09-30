// Inventory Module - Shared Component
// InventoryCurrencyDropdown
//
// Drop-in currency selector that matches the Dashboard's CurrencyDropdown look & feel.
// Usage:
//   const currency = useInventoryCurrency();
//   <InventoryCurrencyDropdown {...currency} />

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { CurrencyDropdown } from '../../../features/finance/CurrencyPicker';
import { CurrencyCode, CurrencyMeta, getCurrencyMeta } from '../viewModels/useInventoryCurrency';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InventoryCurrencyDropdownProps {
  loading?: boolean;
  error?: boolean;
  lastUpdated?: Date | null;
  /** label shown before the trigger button, defaults to "Currency" */
  label?: string;
  /** if true, the dropdown has a compact pill style (for use inside table headers, etc.) */
  compact?: boolean;
}

// ── InventoryCurrencyDropdown ─────────────────────────────────────────────────

export function InventoryCurrencyDropdown({
  loading = false,
  error = false,
  lastUpdated = null,
  label,
  compact = false,
}: InventoryCurrencyDropdownProps) {
  // Follows the Admin's global currency setting — symbol-only, no conversion.
  // Was hardcoded to 'AED' before, so this badge never reflected what was
  // actually selected in User Management.
  const { code: globalCode } = useGlobalCurrency();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {label && (
        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</span>
      )}

      {/* Live currency badge */}
      <CurrencyDropdown primary={globalCode as CurrencyCode} extras={[]} loading={loading} error={error} lastUpdated={lastUpdated} />

      {loading && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>
          <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Updating…
        </span>
      )}
      {error && !loading && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>
          <AlertCircle size={11} /> Estimated rates
        </span>
      )}
      {lastUpdated && !loading && !error && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b', fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />
          Live · {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}

// ── CurrencyExtraRows ─────────────────────────────────────────────────────────
// Renders secondary currency rows under a price value (same as Dashboard's CurrencyRows)

export function CurrencyExtraRows({
  extras,
  pkrAmount,
  rates,
}: {
  extras: CurrencyCode[];
  /** Base amount in the canonical stored unit (AED). Name kept for compatibility. */
  pkrAmount: number;
  rates: Record<CurrencyCode, number>;
}) {
  if (extras.length === 0) return null;

  const formatInCurrency = (amount: number, meta: CurrencyMeta): string => {
    // Round to the currency's decimal precision first to eliminate floating-point
    // drift (e.g. 699.9999999 → 700, or 700.0000001 → 700).
    const factor = Math.pow(10, meta.decimals);
    const rounded = Math.round(amount * factor) / factor;
    try {
      return new Intl.NumberFormat(meta.locale, {
        style: 'currency', currency: meta.code,
        minimumFractionDigits: meta.decimals,
        maximumFractionDigits: meta.decimals,
      }).format(rounded);
    } catch {
      return `${meta.symbol}${rounded.toFixed(meta.decimals)}`;
    }
  };

  // Base amount is AED. AED shows as-is; other currencies convert from the AED base.
  const aedAmount = pkrAmount;

  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {extras.map(code => {
        const meta = getCurrencyMeta(code);
        const converted =
          code === 'AED'
            ? aedAmount
            : rates?.AED
              ? (aedAmount / rates.AED) * rates[code]
              : aedAmount;
        return (
          <div key={code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9ca3af' }}>
              <span style={{ fontSize: 9, fontWeight: 700, background: '#f1f5f9', color: '#6b7280', padding: '1px 4px', borderRadius: 3 }}>
                {meta.flag}
              </span>
              {code}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
              {formatInCurrency(converted, meta)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── CurrencyPriceInput ────────────────────────────────────────────────────────
// AED is the single source of truth. The value typed is stored verbatim — no
// PKR round-trip, no toFixed() drift. Typing 700 stores exactly 700.
//
// The prop is still named `pkrValue`/`onChange(pkrEquivalent)` for backwards
// compatibility with every caller, but the number now represents the AED amount
// (i.e. the canonical stored unit). The currency <select> is retained only as a
// non-converting label so the UI looks unchanged.
//
// Usage:
//   <CurrencyPriceInput
//     pkrValue={product.sellPrice}   // canonical stored value (AED)
//     onChange={(v) => setField(v)}  // called with the exact typed value
//     rates={rates}
//     label="Sell Price"
//   />

export interface CurrencyPriceInputProps {
  /** Canonical stored value (AED). Name kept for backwards compatibility. */
  pkrValue: number;
  /** Called with the exact value the user typed (AED). No conversion applied. */
  onChange: (value: number) => void;
  label?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

export function CurrencyPriceInput({
  pkrValue,
  onChange,
  label,
  disabled = false,
  required = false,
  placeholder = '0',
}: CurrencyPriceInputProps) {
  // Follows the Admin's global currency setting — symbol-only label, no
  // conversion. The stored value is always the canonical unit regardless of
  // what this badge says; only the printed code changes.
  const { code: globalCode } = useGlobalCurrency();

  const [rawInput, setRawInput] = useState<string>(pkrValue > 0 ? String(pkrValue) : '');
  const isFocused = useRef(false);
  const lastEmitted = useRef<number>(pkrValue);

  // Sync display when the stored value changes externally, but never while the user is actively typing.
  useEffect(() => {
    if (isFocused.current) return;
    if (Math.abs(lastEmitted.current - pkrValue) < 0.0001) return;
    lastEmitted.current = pkrValue;
    setRawInput(pkrValue > 0 ? String(pkrValue) : '');
  }, [pkrValue]);

  const displayValue = isFocused.current ? rawInput : (pkrValue > 0 ? String(pkrValue) : '');

  const handleChange = (raw: string) => {
    setRawInput(raw);
    if (raw === '') { lastEmitted.current = 0; onChange(0); return; }
    const num = parseFloat(raw);
    if (isNaN(num) || num < 0) { lastEmitted.current = 0; onChange(0); return; }
    lastEmitted.current = num;
    onChange(num);
  };

  const inp: React.CSSProperties = {
    flex: 1,
    padding: '9px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '0 8px 8px 0',
    fontSize: 13,
    outline: 'none',
    color: '#111827',
    backgroundColor: disabled ? '#f9fafb' : '#fff',
    boxSizing: 'border-box',
    borderLeft: 'none',
  };

  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
          {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
      )}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '9px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px 0 0 8px',
            fontSize: 12,
            fontWeight: 700,
            color: '#374151',
            backgroundColor: '#f8fafc',
            flexShrink: 0,
          }}
        >
          {globalCode}
        </div>

        {/* Number input — value stored exactly as typed */}
        <input
          type="number"
          value={displayValue}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => {
            isFocused.current = true;
            setRawInput(pkrValue > 0 ? String(pkrValue) : '');
          }}
          onBlur={() => {
            isFocused.current = false;
            setRawInput(prev => prev);
          }}
          disabled={disabled}
          placeholder={placeholder}
          min={0}
          step="any"
          style={inp}
        />
      </div>
    </div>
  );
}