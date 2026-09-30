// Invoice Module - Shared Component
// InvoiceMultiFilter — reusable multi-select dropdown with checkboxes.
// Used in InvoiceListView and InvoiceReportView.

import React from 'react';
import { ChevronDown, X } from 'lucide-react';

interface InvoiceMultiFilterProps {
  label: string;
  selected: string[];
  onChange: (v: string[]) => void;
  options: string[];
  /** Optional display name mapper (e.g. salesperson id → name) */
  displayName?: (v: string) => string;
}

export function InvoiceMultiFilter({
  label,
  selected,
  onChange,
  options,
  displayName,
}: InvoiceMultiFilterProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const display = displayName ?? ((v: string) => v);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter(v => v !== opt) : [...selected, opt]);

  const hasSelection = selected.length > 0;

  return (
    <div ref={ref} className="flex flex-col gap-1 relative min-w-[130px] flex-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</label>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border transition-all outline-none cursor-pointer text-left ${
          hasSelection
            ? 'border-gray-800 bg-gray-50 text-gray-900 font-semibold'
            : 'border-gray-300 bg-white text-gray-400 font-normal'
        }`}
      >
        <span className="truncate flex-1">
          {hasSelection
            ? selected.length === 1
              ? display(selected[0])
              : `${selected.length} selected`
            : 'All'}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 ml-1 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 z-[999] mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-[180px] max-w-[240px]">
          {/* Select all / Clear */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <button
              type="button"
              onClick={() => onChange(options)}
              className="text-[11px] font-bold text-gray-700 hover:text-gray-900 bg-none border-none cursor-pointer p-0"
            >
              Select all
            </button>
            <span className="text-gray-200 text-sm">|</span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] font-bold text-gray-400 hover:text-gray-600 bg-none border-none cursor-pointer p-0"
            >
              Clear
            </button>
          </div>

          {/* Options */}
          <div className="max-h-56 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400">No options</div>
            ) : (
              options.map(opt => {
                const checked = selected.includes(opt);
                return (
                  <div
                    key={opt}
                    onClick={() => toggle(opt)}
                    className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm select-none transition-colors ${
                      checked ? 'bg-gray-50 text-gray-900 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {/* Custom checkbox */}
                    <span
                      className="shrink-0 flex items-center justify-center rounded"
                      style={{
                        width: 15, height: 15,
                        border: `2px solid ${checked ? '#111827' : '#d1d5db'}`,
                        backgroundColor: checked ? '#111827' : '#fff',
                        transition: 'all 0.12s',
                      }}
                    >
                      {checked && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{display(opt)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Pill tags for selected values */}
      {hasSelection && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {selected.map(v => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-900 text-white"
            >
              <span className="truncate max-w-[80px]">{display(v)}</span>
              <span
                onClick={e => { e.stopPropagation(); toggle(v); }}
                className="cursor-pointer flex items-center"
              >
                <X size={8} color="white" />
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}