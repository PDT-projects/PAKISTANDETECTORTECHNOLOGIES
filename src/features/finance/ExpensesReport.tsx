// ExpensesReport.tsx — self-contained, fetches own data from Firestore
import { useState, useMemo, useEffect, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../api/firebase/firebase';
import {
  Download, Eye, Calendar, DollarSign, TrendingDown, Receipt,
  XCircle, Loader2, Filter, FileText, ChevronDown, X
} from 'lucide-react';
import { toast } from 'sonner';
import { LockedScrollTable } from '../../shared/components/LockedScrollTable';
import { exportReportToPdf, exportReportToExcel } from '../../shared/reportExport/reportExport';
import { formatGlobalCurrency } from '../../shared/currency/globalCurrency';

type Expense = {
  id: string;
  date: string;
  transactionId: string;
  mainCategory: string;
  subCategory: string;
  amount: number;
  mode: 'Cash' | 'Bank';
  bankName?: string;
  notes?: string;
  performedBy?: string;
};

// ─── Multi-Select Dropdown ────────────────────────────────────────────────────
function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
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
    selected.length === 1 ? selected[0] :
    `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-left flex items-center justify-between text-sm focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:border-transparent"
      >
        <span className={selected.length === 0 ? 'text-gray-400' : 'text-gray-900'}>{label}</span>
        <ChevronDown size={15} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
            <button type="button" onClick={() => onChange([...options])} className="text-xs text-[#4f46e5] font-medium hover:underline">
              Select all
            </button>
            <button type="button" onClick={() => onChange([])} className="text-xs text-gray-500 hover:underline">
              Clear
            </button>
          </div>
          <div className="overflow-y-auto">
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="accent-[#4f46e5] w-4 h-4 rounded"
                />
                <span className="text-gray-800">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────────────
function Pill({
  label,
  onRemove,
  colorClass = 'bg-[#4f46e5]/10 text-[#4f46e5]',
}: {
  label: string;
  onRemove: () => void;
  colorClass?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
      {label}
      <button type="button" onClick={onRemove} className="hover:opacity-70"><X size={11} /></button>
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ExpensesReport() {
  const [data, setData]           = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewExpense, setViewExpense] = useState<Expense | null>(null);

  const today          = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0];

  const [allTime, setAllTime] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom:   firstDayOfMonth,
    dateTo:     today,
    categories: [] as string[],
    modes:      [] as string[],
  });

  // Fetch
  useEffect(() => {
    (async () => {
      try {
        const q    = query(collection(db, 'transactions'), where('mainCategory', '==', 'Cash Outflow'));
        const snap = await getDocs(q);
        const records: Expense[] = snap.docs.map(d => {
          const r = d.data() as any;
          return {
            id:            d.id,
            date:          r.date         || r.createdAt || new Date().toISOString(),
            transactionId: r.transactionId || d.id.slice(0, 8),
            mainCategory:  r.mainCategory  || 'Cash Outflow',
            subCategory:   r.subCategory   || '—',
            amount:        Number(r.amount) || 0,
            mode:          (r.mode as 'Cash' | 'Bank') || 'Cash',
            bankName:      r.bankName  || '',
            notes:         r.note || r.notes || '',
            performedBy:   r.performedBy || '',
          };
        });
        records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setData(records);
      } catch (err) {
        console.error('ExpensesReport fetch error:', err);
        toast.error('Failed to load expenses data');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Derived option lists
  const categoryOptions = useMemo(() => [...new Set(data.map(e => e.subCategory))].sort(), [data]);
  const modeOptions = ['Cash', 'Bank'];

  const filteredData = useMemo(() => {
    return data.filter(e => {
      if (!allTime) {
        const d    = new Date(e.date);
        const from = new Date(filters.dateFrom);
        const to   = new Date(filters.dateTo);
        if (d < from || d > to) return false;
      }
      if (filters.categories.length > 0 && !filters.categories.includes(e.subCategory)) return false;
      if (filters.modes.length      > 0 && !filters.modes.includes(e.mode))             return false;
      return true;
    });
  }, [data, filters, allTime]);

  const totalAmount = useMemo(() => filteredData.reduce((s, e) => s + e.amount, 0), [filteredData]);
  const cashTotal   = useMemo(() => filteredData.filter(e => e.mode === 'Cash').reduce((s, e) => s + e.amount, 0), [filteredData]);

  const formatCurrency = (n: number) => formatGlobalCurrency(n);

  const handleExportCSV = () => {
    const headers = ['Date', 'ID', 'Category', 'Amount', 'Mode', 'Bank', 'Notes'];
    const rows = filteredData.map(e => [
      new Date(e.date).toLocaleDateString('en-AE'),
      e.transactionId, e.subCategory, e.amount, e.mode, e.bankName || '', e.notes || ''
    ].map(v => `"${v}"`).join(','));
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = allTime
      ? `expenses-all-time.csv`
      : `expenses-${filters.dateFrom}-to-${filters.dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Expenses exported');
  };

  const hasActiveFilters =
    allTime || filters.categories.length > 0 || filters.modes.length > 0;

  const clearAll = () => {
    setAllTime(false);
    setFilters({ dateFrom: firstDayOfMonth, dateTo: today, categories: [], modes: [] });
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 gap-3">
      <Loader2 size={26} className="text-[#4f46e5] animate-spin" />
      <span className="text-gray-500 text-sm">Loading expenses…</span>
    </div>
  );

  return (
    <div className="p-8 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#4f46e5] rounded-lg flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Expenses Report</h1>
            <p className="text-sm text-gray-600">All expense transactions categorized and tracked</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            const headers = ['Date', 'ID', 'Category', 'Amount', 'Mode', 'Bank', 'Notes'];
            const rows = filteredData.map(e => [
              new Date(e.date).toLocaleDateString('en-AE'),
              e.transactionId, e.subCategory, e.amount, e.mode, e.bankName || '', e.notes || '',
            ]);
            exportReportToExcel({
              title: 'Expenses Report',
              subtitle: allTime ? 'All time' : `${filters.dateFrom} to ${filters.dateTo}`,
              columns: headers.map(h => ({ header: h })),
              rows,
              filename: allTime ? 'expenses-all-time' : `expenses-${filters.dateFrom}-to-${filters.dateTo}`,
            });
          }}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <Download size={16} /> Excel
        </button>
        <button
          onClick={() => {
            const headers = ['Date', 'ID', 'Category', 'Amount', 'Mode', 'Bank', 'Notes'];
            const rows = filteredData.map(e => [
              new Date(e.date).toLocaleDateString('en-AE'),
              e.transactionId, e.subCategory, e.amount, e.mode, e.bankName || '', e.notes || '',
            ]);
            exportReportToPdf({
              title: 'Expenses Report',
              subtitle: allTime ? 'All time' : `${filters.dateFrom} to ${filters.dateTo}`,
              columns: headers.map(h => ({ header: h })),
              rows,
              filename: allTime ? 'expenses-all-time' : `expenses-${filters.dateFrom}-to-${filters.dateTo}`,
            });
          }}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <Download size={16} /> PDF
        </button>
        <button
          onClick={handleExportCSV}
          className="px-4 py-2 bg-[#10b981] text-white rounded-lg hover:bg-[#059669] transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <Download size={16} /> Export CSV
        </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Expenses</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
            </div>
            <div className="w-12 h-12 bg-[#4f46e5]/10 rounded-lg flex items-center justify-center">
              <TrendingDown size={24} className="text-[#4f46e5]" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Transactions</p>
              <p className="text-3xl font-bold text-gray-900">{filteredData.length}</p>
            </div>
            <div className="w-12 h-12 bg-[#10b981]/10 rounded-lg flex items-center justify-center">
              <Receipt size={24} className="text-[#10b981]" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Cash Expenses</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(cashTotal)}</p>
            </div>
            <div className="w-12 h-12 bg-[#ef4444]/10 rounded-lg flex items-center justify-center">
              <DollarSign size={24} className="text-[#ef4444]" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-[#4f46e5]" />
          <h2 className="font-semibold text-gray-900">Filters</h2>
          {hasActiveFilters && (
            <button onClick={clearAll} className="ml-auto text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1">
              <X size={13} /> Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date From */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <Calendar size={13} /> Date From
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              disabled={allTime}
              onChange={e => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4f46e5] focus:border-transparent focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
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
              onChange={e => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4f46e5] focus:border-transparent focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
            />
            <button
              type="button"
              onClick={() => setAllTime(v => !v)}
              className={`mt-1.5 w-full text-xs font-medium py-1 rounded-md border transition-colors ${
                allTime
                  ? 'bg-[#4f46e5] text-white border-[#4f46e5]'
                  : 'bg-white text-[#4f46e5] border-[#4f46e5] hover:bg-[#4f46e5]/10'
              }`}
            >
              {allTime ? '✓ All Time' : 'Show All Time'}
            </button>
          </div>

          {/* Category multi-select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <FileText size={13} /> Category
            </label>
            <MultiSelectDropdown
              options={categoryOptions}
              selected={filters.categories}
              onChange={v => setFilters({ ...filters, categories: v })}
              placeholder="All Categories"
            />
          </div>

          {/* Mode multi-select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <DollarSign size={13} /> Payment Mode
            </label>
            <MultiSelectDropdown
              options={modeOptions}
              selected={filters.modes}
              onChange={v => setFilters({ ...filters, modes: v })}
              placeholder="All Modes"
            />
          </div>
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Active:</span>

            {allTime
              ? <Pill label="All Time" onRemove={() => setAllTime(false)} colorClass="bg-[#4f46e5]/10 text-[#4f46e5]" />
              : <Pill
                  label={`${filters.dateFrom} → ${filters.dateTo}`}
                  onRemove={() => setFilters({ ...filters, dateFrom: firstDayOfMonth, dateTo: today })}
                  colorClass="bg-[#4f46e5]/10 text-[#4f46e5]"
                />
            }
            {filters.categories.map(c => (
              <Pill
                key={c} label={c}
                onRemove={() => setFilters({ ...filters, categories: filters.categories.filter(x => x !== c) })}
                colorClass="bg-[#10b981]/10 text-[#10b981]"
              />
            ))}
            {filters.modes.map(m => (
              <Pill
                key={m} label={m}
                onRemove={() => setFilters({ ...filters, modes: filters.modes.filter(x => x !== m) })}
                colorClass="bg-gray-100 text-gray-700"
              />
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Expense Transactions</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Showing {filteredData.length} of {data.length} records
            </p>
          </div>
        </div>

        <LockedScrollTable maxHeight="65vh">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mode</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-gray-500">
                    <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium">No expenses found</p>
                    <p className="text-sm mt-1">Try adjusting your filters to see more results</p>
                  </td>
                </tr>
              ) : (
                filteredData.map((exp, index) => (
                  <tr
                    key={exp.id}
                    className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-400" />
                        {new Date(exp.date).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-600">{exp.transactionId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{exp.subCategory}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                      {formatCurrency(exp.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        exp.mode === 'Cash' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {exp.mode === 'Cash' ? <DollarSign size={11} /> : <TrendingDown size={11} />}
                        {exp.mode}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => setViewExpense(exp)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4f46e5] bg-[#4f46e5]/10 rounded-lg hover:bg-[#4f46e5]/20 transition-colors"
                      >
                        <Eye size={13} /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </LockedScrollTable>

        {/* Footer total */}
        {filteredData.length > 0 && (
          <div className="bg-gray-50 border-t-2 border-[#4f46e5] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign size={18} className="text-[#4f46e5]" />
                <span className="font-semibold text-gray-900">Total</span>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Total Expenses</p>
                <p className="text-2xl font-bold text-[#4f46e5]">{formatCurrency(totalAmount)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {viewExpense && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#4f46e5]/10 rounded-lg flex items-center justify-center">
                  <Receipt size={18} className="text-[#4f46e5]" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{viewExpense.subCategory}</h3>
              </div>
              <button onClick={() => setViewExpense(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <XCircle size={22} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-5">
              {[
                ['Date',     new Date(viewExpense.date).toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' })],
                ['ID',       viewExpense.transactionId],
                ['Category', viewExpense.subCategory],
                ['Mode',     viewExpense.mode],
                ['Bank',     viewExpense.bankName || '—'],
                ['Performed By', viewExpense.performedBy || '—'],
              ].map(([l, v]) => (
                <div key={l}>
                  <p className="text-xs text-gray-500 mb-0.5">{l}</p>
                  <p className="text-sm font-medium text-gray-900">{v}</p>
                </div>
              ))}
              {viewExpense.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 mb-0.5">Notes</p>
                  <p className="text-sm font-medium text-gray-900">{viewExpense.notes}</p>
                </div>
              )}
              <div className="col-span-2 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Amount</p>
                <p className="text-3xl font-bold text-[#4f46e5]">{formatCurrency(viewExpense.amount)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}