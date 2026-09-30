// FixedBillsReport.tsx — self-contained, fetches own data from Firestore
import { useState, useMemo, useEffect, useRef } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../api/firebase/firebase';
import {
  Download, Eye, Calendar, FileText, AlertTriangle, CheckCircle,
  XCircle, Loader2, Filter, ChevronDown, X, DollarSign, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { LockedScrollTable } from '../../shared/components/LockedScrollTable';
import { exportReportToPdf, exportReportToExcel } from '../../shared/reportExport/reportExport';
import { formatGlobalCurrency } from '../../shared/currency/globalCurrency';

type BillRecord = {
  id: string;
  vendorName: string;
  billNumber: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: 'Due' | 'Paid' | 'Overdue';
  category: string;
  repeat: boolean;
};

// ─── Multi-Select Dropdown ────────────────────────────────────────────────────
function MultiSelectDropdown({
  options, selected, onChange, placeholder,
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
            <button type="button" onClick={() => onChange([...options])} className="text-xs text-[#4f46e5] font-medium hover:underline">Select all</button>
            <button type="button" onClick={() => onChange([])} className="text-xs text-gray-500 hover:underline">Clear</button>
          </div>
          <div className="overflow-y-auto">
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="accent-[#4f46e5] w-4 h-4 rounded" />
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
function Pill({ label, onRemove, colorClass = 'bg-[#4f46e5]/10 text-[#4f46e5]' }: {
  label: string; onRemove: () => void; colorClass?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
      {label}
      <button type="button" onClick={onRemove} className="hover:opacity-70"><X size={11} /></button>
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function FixedBillsReport() {
  const [data, setData]           = useState<BillRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewBill, setViewBill]   = useState<BillRecord | null>(null);

  const today           = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0];

  const [allTime, setAllTime] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom:   firstDayOfMonth,
    dateTo:     today,
    categories: [] as string[],
    vendors:    [] as string[],
    statuses:   [] as string[],
    recurring:  [] as string[], // 'Recurring' | 'One-time'
  });

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'bills'));
        const records: BillRecord[] = snap.docs.map(d => {
          const b = d.data() as any;
          let status: 'Due' | 'Paid' | 'Overdue' = b.status || 'Due';
          if (!b.status && b.dueDate) {
            status = new Date(b.dueDate) < new Date() ? 'Overdue' : 'Due';
          }
          return {
            id:         d.id,
            vendorName: b.vendorName || b.vendor   || '—',
            billNumber: b.billNumber || b.billNo   || d.id.slice(0, 8),
            amount:     Number(b.amount) || 0,
            dueDate:    b.dueDate    || new Date().toISOString(),
            paidDate:   b.paidDate   || undefined,
            status,
            category:   b.category  || 'General',
            repeat:     b.repeat    || b.recurring || false,
          };
        });
        setData(records);
      } catch (err) {
        console.error('FixedBillsReport fetch error:', err);
        toast.error('Failed to load bills data');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Derived option lists
  const categoryOptions = useMemo(() => [...new Set(data.map(b => b.category))].sort(), [data]);
  const vendorOptions   = useMemo(() => [...new Set(data.map(b => b.vendorName))].sort(), [data]);
  const statusOptions   = ['Due', 'Paid', 'Overdue'];
  const recurringOptions = ['Recurring', 'One-time'];

  const filteredData = useMemo(() => {
    return data.filter(b => {
      if (!allTime) {
        const d    = new Date(b.dueDate);
        const from = new Date(filters.dateFrom);
        const to   = new Date(filters.dateTo);
        if (d < from || d > to) return false;
      }
      if (filters.categories.length > 0 && !filters.categories.includes(b.category))    return false;
      if (filters.vendors.length    > 0 && !filters.vendors.includes(b.vendorName))      return false;
      if (filters.statuses.length   > 0 && !filters.statuses.includes(b.status))         return false;
      if (filters.recurring.length  > 0) {
        const tag = b.repeat ? 'Recurring' : 'One-time';
        if (!filters.recurring.includes(tag)) return false;
      }
      return true;
    });
  }, [data, filters, allTime]);

  const totalDue     = useMemo(() => filteredData.filter(b => b.status === 'Due').reduce((s, b) => s + b.amount, 0), [filteredData]);
  const totalOverdue = useMemo(() => filteredData.filter(b => b.status === 'Overdue').reduce((s, b) => s + b.amount, 0), [filteredData]);
  const totalAll     = useMemo(() => filteredData.reduce((s, b) => s + b.amount, 0), [filteredData]);

  const formatCurrency = (n: number) => formatGlobalCurrency(n);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' });

  const handleExportCSV = () => {
    const headers = ['Vendor', 'Bill Number', 'Category', 'Amount', 'Due Date', 'Status', 'Recurring'];
    const rows = filteredData.map(b =>
      [b.vendorName, b.billNumber, b.category, b.amount, b.dueDate, b.status, b.repeat ? 'Yes' : 'No']
        .map(v => `"${v}"`).join(',')
    );
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = allTime ? `fixed-bills-all-time.csv` : `fixed-bills-${filters.dateFrom}-to-${filters.dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Fixed bills report exported');
  };

  const hasActiveFilters =
    allTime || filters.categories.length > 0 || filters.vendors.length > 0 ||
    filters.statuses.length > 0 || filters.recurring.length > 0;

  const clearAll = () => {
    setAllTime(false);
    setFilters({ dateFrom: firstDayOfMonth, dateTo: today, categories: [], vendors: [], statuses: [], recurring: [] });
  };

  const statusColor = (s: string) =>
    s === 'Paid' ? 'bg-green-100 text-green-800' :
    s === 'Due'  ? 'bg-yellow-100 text-yellow-800' :
    'bg-red-100 text-red-800';

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 gap-3">
      <Loader2 size={26} className="text-[#4f46e5] animate-spin" />
      <span className="text-gray-500 text-sm">Loading bills…</span>
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
            <h1 className="text-2xl font-bold text-gray-900">Fixed Bills Report</h1>
            <p className="text-sm text-gray-600">Recurring bills, due dates, and payment tracking</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            const headers = ['Vendor', 'Bill Number', 'Category', 'Amount', 'Due Date', 'Status', 'Recurring'];
            const rows = filteredData.map(b => [b.vendorName, b.billNumber, b.category, b.amount, b.dueDate, b.status, b.repeat ? 'Yes' : 'No']);
            exportReportToExcel({
              title: 'Fixed Bills Report',
              subtitle: allTime ? 'All time' : `${filters.dateFrom} to ${filters.dateTo}`,
              columns: headers.map(h => ({ header: h })),
              rows,
              filename: allTime ? 'fixed-bills-all-time' : `fixed-bills-${filters.dateFrom}-to-${filters.dateTo}`,
            });
          }}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <Download size={16} /> Excel
        </button>
        <button
          onClick={() => {
            const headers = ['Vendor', 'Bill Number', 'Category', 'Amount', 'Due Date', 'Status', 'Recurring'];
            const rows = filteredData.map(b => [b.vendorName, b.billNumber, b.category, b.amount, b.dueDate, b.status, b.repeat ? 'Yes' : 'No']);
            exportReportToPdf({
              title: 'Fixed Bills Report',
              subtitle: allTime ? 'All time' : `${filters.dateFrom} to ${filters.dateTo}`,
              columns: headers.map(h => ({ header: h })),
              rows,
              filename: allTime ? 'fixed-bills-all-time' : `fixed-bills-${filters.dateFrom}-to-${filters.dateTo}`,
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
              <p className="text-sm text-gray-600 mb-1">Total Bills</p>
              <p className="text-3xl font-bold text-gray-900">{filteredData.length}</p>
            </div>
            <div className="w-12 h-12 bg-[#4f46e5]/10 rounded-lg flex items-center justify-center">
              <FileText size={24} className="text-[#4f46e5]" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Overdue Amount</p>
              <p className="text-3xl font-bold text-red-600">{formatCurrency(totalOverdue)}</p>
            </div>
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
              <AlertTriangle size={24} className="text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Due Amount</p>
              <p className="text-3xl font-bold text-yellow-600">{formatCurrency(totalDue)}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-50 rounded-lg flex items-center justify-center">
              <CheckCircle size={24} className="text-yellow-600" />
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">

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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
            />
            <button
              type="button"
              onClick={() => setAllTime(v => !v)}
              className={`mt-1.5 w-full text-xs font-medium py-1 rounded-md border transition-colors ${
                allTime ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#4f46e5] border-[#4f46e5] hover:bg-[#4f46e5]/10'
              }`}
            >
              {allTime ? '✓ All Time' : 'Show All Time'}
            </button>
          </div>

          {/* Vendor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <FileText size={13} /> Vendor
            </label>
            <MultiSelectDropdown
              options={vendorOptions}
              selected={filters.vendors}
              onChange={v => setFilters({ ...filters, vendors: v })}
              placeholder="All Vendors"
            />
          </div>

          {/* Category */}
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

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
            <MultiSelectDropdown
              options={statusOptions}
              selected={filters.statuses}
              onChange={v => setFilters({ ...filters, statuses: v })}
              placeholder="All Statuses"
            />
          </div>

          {/* Recurring */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <RefreshCw size={13} /> Type
            </label>
            <MultiSelectDropdown
              options={recurringOptions}
              selected={filters.recurring}
              onChange={v => setFilters({ ...filters, recurring: v })}
              placeholder="All Types"
            />
          </div>
        </div>

        {/* Active pills */}
        {hasActiveFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Active:</span>
            {allTime
              ? <Pill label="All Time" onRemove={() => setAllTime(false)} colorClass="bg-[#4f46e5]/10 text-[#4f46e5]" />
              : (filters.dateFrom || filters.dateTo) && (
                <Pill
                  label={`${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`}
                  onRemove={() => setFilters({ ...filters, dateFrom: firstDayOfMonth, dateTo: today })}
                  colorClass="bg-[#4f46e5]/10 text-[#4f46e5]"
                />
              )
            }
            {filters.vendors.map(v => (
              <Pill key={v} label={v} onRemove={() => setFilters({ ...filters, vendors: filters.vendors.filter(x => x !== v) })} colorClass="bg-[#4f46e5]/10 text-[#4f46e5]" />
            ))}
            {filters.categories.map(c => (
              <Pill key={c} label={c} onRemove={() => setFilters({ ...filters, categories: filters.categories.filter(x => x !== c) })} colorClass="bg-[#10b981]/10 text-[#10b981]" />
            ))}
            {filters.statuses.map(s => (
              <Pill
                key={s} label={s}
                onRemove={() => setFilters({ ...filters, statuses: filters.statuses.filter(x => x !== s) })}
                colorClass={s === 'Paid' ? 'bg-green-100 text-green-700' : s === 'Due' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}
              />
            ))}
            {filters.recurring.map(r => (
              <Pill key={r} label={r} onRemove={() => setFilters({ ...filters, recurring: filters.recurring.filter(x => x !== r) })} colorClass="bg-purple-50 text-purple-700" />
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Bill Records</h3>
          <p className="text-sm text-gray-500 mt-0.5">Showing {filteredData.length} of {data.length} bills</p>
        </div>

        <LockedScrollTable maxHeight="65vh">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Vendor', 'Bill #', 'Category', 'Amount', 'Due Date', 'Type', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-gray-500">
                    <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium">No bills found</p>
                    <p className="text-sm mt-1">Try adjusting your filters</p>
                  </td>
                </tr>
              ) : (
                filteredData.map((bill, index) => (
                  <tr key={bill.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{bill.vendorName}</td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-gray-600">{bill.billNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{bill.category}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">{formatCurrency(bill.amount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={13} className="text-gray-400" />
                        {formatDate(bill.dueDate)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {bill.repeat
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700"><RefreshCw size={10} /> Recurring</span>
                        : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">One-time</span>
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor(bill.status)}`}>
                        {bill.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => setViewBill(bill)}
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
              <div className="flex items-center gap-8 text-right">
                <div>
                  <p className="text-xs text-gray-400">Overdue</p>
                  <p className="text-sm font-bold text-red-600">{formatCurrency(totalOverdue)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Due</p>
                  <p className="text-sm font-bold text-yellow-600">{formatCurrency(totalDue)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">All Bills</p>
                  <p className="text-2xl font-bold text-[#4f46e5]">{formatCurrency(totalAll)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {viewBill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#4f46e5]/10 rounded-lg flex items-center justify-center">
                  <FileText size={18} className="text-[#4f46e5]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{viewBill.vendorName}</h3>
                  <p className="text-xs text-gray-500 font-mono">{viewBill.billNumber}</p>
                </div>
              </div>
              <button onClick={() => setViewBill(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <XCircle size={22} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-5">
                {[
                  ['Category',  viewBill.category],
                  ['Due Date',  formatDate(viewBill.dueDate)],
                  ...(viewBill.paidDate ? [['Paid Date', formatDate(viewBill.paidDate)]] : []),
                  ['Type', viewBill.repeat ? 'Recurring' : 'One-time'],
                ].map(([l, v]) => (
                  <div key={l} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">{l}</p>
                    <p className="text-sm font-semibold text-gray-900">{v}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between p-4 bg-[#4f46e5]/5 rounded-xl">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Amount</p>
                  <p className="text-3xl font-bold text-[#4f46e5]">{formatCurrency(viewBill.amount)}</p>
                </div>
                <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${statusColor(viewBill.status)}`}>
                  {viewBill.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}