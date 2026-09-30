// Banking Module - Bank Activity Report View
import React, { useState, useRef, useEffect } from 'react';
import {
  RefreshCw, Search, Filter, X, Banknote, Building2,
  ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Package, TrendingUp,
  TrendingDown, Activity, ChevronDown, ChevronUp, Calendar, FileText,
  DollarSign, Loader2, Download,
} from 'lucide-react';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import { exportReportToPdf, exportReportToExcel } from '../../../shared/reportExport/reportExport';
import { useBankActivityViewModel, ActivityEntry, ActivityType } from '../viewModels/useBankActivityViewModel';

// ── Multi-Select Dropdown ──────────────────────────────────────────────────────
function MultiSelectDropdown({
  options, selected, onChange, placeholder, labelFn,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  labelFn?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);

  const label =
    selected.length === 0 ? placeholder :
    selected.length === 1 ? (labelFn ? labelFn(selected[0]) : selected[0]) :
    `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-left flex items-center justify-between text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-transparent"
      >
        <span className={selected.length === 0 ? 'text-gray-400' : 'text-gray-900'}>{label}</span>
        <ChevronDown size={15} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
            <button type="button" onClick={() => onChange([...options])} className="text-xs text-gray-700 font-medium hover:underline">Select all</button>
            <button type="button" onClick={() => onChange([])} className="text-xs text-gray-500 hover:underline">Clear</button>
          </div>
          <div className="overflow-y-auto">
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="accent-gray-700 w-4 h-4 rounded" />
                <span className="text-gray-800">{labelFn ? labelFn(opt) : opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pill ───────────────────────────────────────────────────────────────────────
function Pill({ label, onRemove, colorClass = 'bg-gray-700/10 text-gray-700' }: {
  label: string; onRemove: () => void; colorClass?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
      {label}
      <button type="button" onClick={onRemove} className="hover:opacity-70"><X size={11} /></button>
    </span>
  );
}

// ── Type Badge ─────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: ActivityType }) {
  const cfg: Record<ActivityType, { label: string; cls: string; Icon: React.ElementType }> = {
    bank_debit:    { label: 'Bank Debit',  cls: 'bg-red-50 text-red-700',    Icon: ArrowUpCircle   },
    bank_credit:   { label: 'Bank Credit', cls: 'bg-green-50 text-green-700', Icon: ArrowDownCircle },
    bank_transfer: { label: 'Transfer',    cls: 'bg-purple-50 text-purple-700', Icon: ArrowLeftRight },
    cash_in:       { label: 'Cash In',     cls: 'bg-emerald-50 text-emerald-700', Icon: TrendingUp  },
    cash_out:      { label: 'Cash Out',    cls: 'bg-amber-50 text-amber-700',  Icon: TrendingDown   },
    inventory:     { label: 'Inventory',   cls: 'bg-cyan-50 text-cyan-700',    Icon: Package        },
  };
  const { label, cls, Icon } = cfg[type] ?? cfg.bank_debit;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>
      <Icon size={10} /> {label}
    </span>
  );
}

// ── Mode Badge ─────────────────────────────────────────────────────────────────
function ModeBadge({ mode, bankName }: { mode: 'Bank' | 'Cash'; bankName?: string }) {
  return mode === 'Bank' ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600" title={bankName}>
      <Building2 size={11} /> {bankName || 'Bank'}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
      <Banknote size={11} /> Cash
    </span>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, Icon }: {
  label: string; value: string; sub?: string; color: string; Icon: React.ElementType;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
          <Icon size={16} color={color} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

// ── Main View ──────────────────────────────────────────────────────────────────
export function BankActivityView() {
  const {
    filteredEntries, banks, uniqueCategories,
    stats, isLoading, error, filters,
    setFilter, clearFilters, refreshData, formatCurrency, formatDate,
  } = useBankActivityViewModel();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allTime, setAllTime]       = useState(false);

  // Multi-select local state (view-level; we translate to viewmodel's single-value filters)
  const [selectedBanks,      setSelectedBanks]      = useState<string[]>([]);
  const [selectedModes,      setSelectedModes]      = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Sync multi-selects → viewmodel filters (single values → pass '' when multiple/none selected, 
  // actual filtering for multi is done via the wrapper below)
  // We filter via filteredEntries override when multi selections exist
  const bankOptions     = banks.map(b => b.id);
  const bankLabelFn     = (id: string) => banks.find(b => b.id === id)?.name ?? id;
  const modeOptions     = ['Bank', 'Cash'];
  const categoryOptions = uniqueCategories;

  // Apply multi-select on top of viewmodel filteredEntries
  const displayEntries = filteredEntries.filter(e => {
    if (selectedBanks.length      > 0 && !selectedBanks.includes(e.bankId ?? ''))    return false;
    if (selectedModes.length      > 0 && !selectedModes.includes(e.mode))             return false;
    if (selectedCategories.length > 0 && !selectedCategories.includes(e.category ?? '')) return false;
    if (allTime) return true; // date already cleared in viewmodel
    return true;
  });

  // Sync allTime → viewmodel date filters
  useEffect(() => {
    if (allTime) {
      setFilter('dateFrom', '');
      setFilter('dateTo', '');
    }
  }, [allTime]);

  const hasActiveFilters =
    filters.searchTerm || selectedBanks.length > 0 || selectedModes.length > 0 ||
    selectedCategories.length > 0 || filters.dateFrom || filters.dateTo || allTime;

  const handleClearAll = () => {
    clearFilters();
    setSelectedBanks([]);
    setSelectedModes([]);
    setSelectedCategories([]);
    setAllTime(false);
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bank Activity Report</h1>
            <p className="text-sm text-gray-600">All transactions — banks, cash, inventory payments, transfers</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            const headers = ['Date', 'Type', 'Description', 'Reference', 'Mode / Bank', 'Amount'];
            const rows = displayEntries.map(entry => [
              formatDate(entry.date), entry.type, entry.description || '—', entry.reference || '—',
              entry.mode || entry.bankName || '—', formatCurrency(entry.amount),
            ]);
            exportReportToExcel({
              title: 'Bank Activity Report',
              subtitle: `${displayEntries.length} entries`,
              columns: headers.map(h => ({ header: h })),
              rows,
              filename: `bank-activity-${new Date().toISOString().slice(0, 10)}`,
            });
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={14} /> Excel
        </button>
        <button
          onClick={() => {
            const headers = ['Date', 'Type', 'Description', 'Reference', 'Mode / Bank', 'Amount'];
            const rows = displayEntries.map(entry => [
              formatDate(entry.date), entry.type, entry.description || '—', entry.reference || '—',
              entry.mode || entry.bankName || '—', formatCurrency(entry.amount),
            ]);
            exportReportToPdf({
              title: 'Bank Activity Report',
              subtitle: `${displayEntries.length} entries`,
              columns: headers.map(h => ({ header: h })),
              rows,
              filename: `bank-activity-${new Date().toISOString().slice(0, 10)}`,
            });
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={14} /> PDF
        </button>
        <button
          onClick={() => refreshData()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/20 rounded-lg hover:bg-[#10b981]/20 transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <StatCard label="Bank Debits"  value={formatCurrency(stats.totalBankDebits)}  color="#dc2626" Icon={ArrowUpCircle}  sub={`Net flow: ${formatCurrency(stats.netBankFlow)}`} />
        <StatCard label="Bank Credits" value={formatCurrency(stats.totalBankCredits)} color="#16a34a" Icon={ArrowDownCircle} />
        <StatCard label="Cash Out"     value={formatCurrency(stats.totalCashOut)}      color="#d97706" Icon={TrendingDown}   sub={`Cash In: ${formatCurrency(stats.totalCashIn)}`} />
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-gray-700" />
          <h2 className="font-semibold text-gray-900">Filters</h2>
          {hasActiveFilters && (
            <button onClick={handleClearAll} className="ml-auto text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1">
              <X size={13} /> Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <Search size={13} /> Search
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={filters.searchTerm}
                onChange={e => setFilter('searchTerm', e.target.value)}
                placeholder="Description, bank, ref…"
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-transparent"
              />
            </div>
          </div>

          {/* Bank multi-select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <Building2 size={13} /> Bank
            </label>
            <MultiSelectDropdown
              options={bankOptions}
              selected={selectedBanks}
              onChange={setSelectedBanks}
              placeholder="All Banks"
              labelFn={bankLabelFn}
            />
          </div>

          {/* Mode multi-select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <Banknote size={13} /> Mode
            </label>
            <MultiSelectDropdown
              options={modeOptions}
              selected={selectedModes}
              onChange={setSelectedModes}
              placeholder="All Modes"
            />
          </div>

          {/* Category multi-select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <FileText size={13} /> Category
            </label>
            <MultiSelectDropdown
              options={categoryOptions}
              selected={selectedCategories}
              onChange={setSelectedCategories}
              placeholder="All Categories"
            />
          </div>

          {/* Date From */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <Calendar size={13} /> Date From
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              disabled={allTime}
              onChange={e => setFilter('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <Calendar size={13} /> Date To
            </label>
            <input
              type="date"
              value={filters.dateTo}
              disabled={allTime}
              onChange={e => setFilter('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
            />
            <button
              type="button"
              onClick={() => setAllTime(v => !v)}
              className={`mt-1.5 w-full text-xs font-medium py-1 rounded-md border transition-colors ${
                allTime
                  ? 'bg-gray-700 text-white border-gray-700'
                  : 'bg-white text-gray-700 border-gray-700 hover:bg-gray-700/10'
              }`}
            >
              {allTime ? '✓ All Time' : 'Show All Time'}
            </button>
          </div>
        </div>

        {/* Active pills */}
        {hasActiveFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Active:</span>
            {filters.searchTerm && (
              <Pill label={`"${filters.searchTerm}"`} onRemove={() => setFilter('searchTerm', '')} colorClass="bg-gray-700/10 text-gray-700" />
            )}
            {allTime
              ? <Pill label="All Time" onRemove={() => setAllTime(false)} colorClass="bg-gray-700/10 text-gray-700" />
              : (filters.dateFrom || filters.dateTo) && (
                <Pill
                  label={`${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`}
                  onRemove={() => { setFilter('dateFrom', ''); setFilter('dateTo', ''); }}
                  colorClass="bg-gray-700/10 text-gray-700"
                />
              )
            }
            {selectedBanks.map(id => (
              <Pill key={id} label={bankLabelFn(id)} onRemove={() => setSelectedBanks(prev => prev.filter(x => x !== id))} colorClass="bg-blue-50 text-blue-700" />
            ))}
            {selectedModes.map(m => (
              <Pill key={m} label={m} onRemove={() => setSelectedModes(prev => prev.filter(x => x !== m))} colorClass="bg-gray-100 text-gray-700" />
            ))}
            {selectedCategories.map(c => (
              <Pill key={c} label={c} onRemove={() => setSelectedCategories(prev => prev.filter(x => x !== c))} colorClass="bg-[#10b981]/10 text-[#10b981]" />
            ))}
          </div>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Activity Entries</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {displayEntries.length} {displayEntries.length === 1 ? 'entry' : 'entries'} · Sorted newest first
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Loader2 size={26} className="text-gray-700 animate-spin" />
            <span className="text-gray-500 text-sm">Loading activity data…</span>
          </div>
        ) : error ? (
          <div className="py-12 text-center text-red-600 text-sm">{error}</div>
        ) : displayEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <Activity size={40} className="opacity-30" />
            <p className="text-sm">No activity found. Try adjusting your filters.</p>
          </div>
        ) : (
          <LockedScrollTable maxHeight="65vh">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Date', 'Type', 'Description', 'Reference', 'Mode / Bank', 'Amount', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sticky top-0 bg-gray-50">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayEntries.map((entry, idx) => {
                  const isExpanded = expandedId === entry.id;
                  const isDebit    = ['bank_debit', 'cash_out', 'bank_transfer'].includes(entry.type);

                  return (
                    <React.Fragment key={entry.id}>
                      <tr
                        className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-700/5 cursor-pointer transition-colors`}
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      >
                        <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatDate(entry.date)}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <TypeBadge type={entry.type} />
                          {entry.isInstalment && (
                            <span className="ml-1.5 text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-full">
                              INST #{entry.instalmentIndex}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 max-w-[220px]">
                          <div className="text-sm text-gray-800 truncate" title={entry.description}>
                            {entry.description || '—'}
                          </div>
                          {entry.category && (
                            <div className="text-xs text-gray-400 mt-0.5">{entry.category}</div>
                          )}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap font-mono text-xs text-gray-700 font-semibold">
                          {entry.reference || '—'}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <ModeBadge mode={entry.mode} bankName={entry.bankName} />
                        </td>
                        <td className={`px-5 py-3 whitespace-nowrap text-sm font-bold text-right ${isDebit ? 'text-red-600' : 'text-green-600'}`}>
                          {isDebit ? '−' : '+'}{formatCurrency(entry.amount)}
                        </td>
                        <td className="px-5 py-3 text-gray-400">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr className="bg-purple-50 border-l-4 border-gray-700">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
                              {[
                                ['Date',      formatDate(entry.date)],
                                ['Type',      entry.type.replace('_', ' ').toUpperCase()],
                                ['Mode',      entry.mode],
                                ['Bank',      entry.bankName || '—'],
                                ['Reference', entry.reference || '—'],
                                ['Category',  entry.category || '—'],
                                ['Amount',    formatCurrency(entry.amount)],
                                ['Note',      entry.note || '—'],
                              ].map(([k, v]) => (
                                <div key={k}>
                                  <span className="text-[#7c3aed] font-bold uppercase tracking-wide text-[10px]">{k}</span>
                                  <div className="text-gray-800 font-semibold mt-0.5">{v}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </LockedScrollTable>
        )}

        {/* Footer total */}
        {displayEntries.length > 0 && !isLoading && (
          <div className="bg-gray-50 border-t-2 border-gray-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign size={18} className="text-gray-700" />
              <span className="font-semibold text-gray-900">Total Entries</span>
              <span className="text-sm text-gray-500">{displayEntries.length}</span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="text-right">
                <p className="text-xs text-gray-400">Total Debits / Out</p>
                <p className="font-bold text-red-600">{formatCurrency(stats.totalBankDebits + stats.totalCashOut)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Total Credits / In</p>
                <p className="font-bold text-green-600">{formatCurrency(stats.totalBankCredits + stats.totalCashIn)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}