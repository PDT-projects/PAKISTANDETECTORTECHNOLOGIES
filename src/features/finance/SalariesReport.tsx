// SalariesReport.tsx — self-contained, fetches own data from Firestore
import { useState, useMemo, useEffect, useRef } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../api/firebase/firebase';
import {
  Download, Eye, Users, DollarSign, TrendingUp, XCircle,
  Loader2, Filter, ChevronDown, X, Calendar, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { LockedScrollTable } from '../../shared/components/LockedScrollTable';
import { exportReportToPdf, exportReportToExcel } from '../../shared/reportExport/reportExport';
import { formatGlobalCurrency } from '../../shared/currency/globalCurrency';

type SalaryRecord = {
  id: string;
  employeeName: string;
  salaryMonth: string;
  baseSalary: number;
  commission: number;
  deductions: number;
  netAmount: number;
  paymentStatus: string;
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
export function SalariesReport() {
  const [data, setData]           = useState<SalaryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewRecord, setViewRecord] = useState<SalaryRecord | null>(null);

  const today           = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0];

  const [allTime, setAllTime] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom:   firstDayOfMonth,
    dateTo:     today,
    employees:  [] as string[],
    months:     [] as string[],
    statuses:   [] as string[],
  });

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'salaries'));
        const records: SalaryRecord[] = snap.docs.map(d => {
          const r = d.data() as any;
          return {
            id:            d.id,
            employeeName:  r.employeeName  || r.employee?.name || '—',
            salaryMonth:   r.salaryMonth   || r.month          || '—',
            baseSalary:    Number(r.baseSalary)  || 0,
            commission:    Number(r.commission)  || 0,
            deductions:    Number(r.deductions)  || 0,
            netAmount:     Number(r.netAmount || r.amount) || 0,
            paymentStatus: r.paymentStatus || r.status || 'Pending',
          };
        });
        setData(records);
      } catch (err) {
        console.error('SalariesReport fetch error:', err);
        toast.error('Failed to load salaries data');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Derived option lists from data
  const employeeOptions = useMemo(() => [...new Set(data.map(r => r.employeeName))].sort(), [data]);
  const monthOptions    = useMemo(() => [...new Set(data.map(r => r.salaryMonth))].sort(), [data]);
  const statusOptions   = ['Paid', 'Pending', 'Partial'];

  const filteredData = useMemo(() => {
    return data.filter(r => {
      // Date range — treat salaryMonth as a comparable string (YYYY-MM)
      if (!allTime && (filters.dateFrom || filters.dateTo)) {
        const monthDate = new Date(r.salaryMonth + '-01');
        if (filters.dateFrom) {
          const from = new Date(filters.dateFrom); from.setDate(1);
          if (monthDate < from) return false;
        }
        if (filters.dateTo) {
          const to = new Date(filters.dateTo); to.setDate(1);
          if (monthDate > to) return false;
        }
      }
      if (filters.employees.length > 0 && !filters.employees.includes(r.employeeName)) return false;
      if (filters.months.length    > 0 && !filters.months.includes(r.salaryMonth))     return false;
      if (filters.statuses.length  > 0 && !filters.statuses.includes(r.paymentStatus)) return false;
      return true;
    });
  }, [data, filters, allTime]);

  const totalPayroll = useMemo(() => filteredData.reduce((s, r) => s + r.netAmount, 0), [filteredData]);
  const pendingTotal = useMemo(() => filteredData.filter(r => r.paymentStatus === 'Pending').reduce((s, r) => s + r.netAmount, 0), [filteredData]);
  const paidCount    = useMemo(() => filteredData.filter(r => r.paymentStatus === 'Paid').length, [filteredData]);

  const formatCurrency = (n: number) => formatGlobalCurrency(n);

  const handleExportCSV = () => {
    const headers = ['Employee', 'Month', 'Base Salary', 'Commission', 'Deductions', 'Net Amount', 'Status'];
    const rows = filteredData.map(r =>
      [r.employeeName, r.salaryMonth, r.baseSalary, r.commission, r.deductions, r.netAmount, r.paymentStatus]
        .map(v => `"${v}"`).join(',')
    );
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = allTime ? `salaries-all-time.csv` : `salaries-${filters.dateFrom}-to-${filters.dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Salaries report exported');
  };

  const hasActiveFilters =
    allTime || filters.employees.length > 0 || filters.months.length > 0 ||
    filters.statuses.length > 0 || (!allTime && (filters.dateFrom || filters.dateTo));

  const clearAll = () => {
    setAllTime(false);
    setFilters({ dateFrom: firstDayOfMonth, dateTo: today, employees: [], months: [], statuses: [] });
  };

  const statusColor = (status: string) => {
    if (status === 'Paid')    return 'bg-green-100 text-green-800';
    if (status === 'Partial') return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 gap-3">
      <Loader2 size={26} className="text-[#4f46e5] animate-spin" />
      <span className="text-gray-500 text-sm">Loading salaries…</span>
    </div>
  );

  return (
    <div className="p-8 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#4f46e5] rounded-lg flex items-center justify-center">
            <Users size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Salaries Report</h1>
            <p className="text-sm text-gray-600">Employee payroll, payments, and status tracking</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            const headers = ['Employee', 'Month', 'Base Salary', 'Commission', 'Deductions', 'Net Amount', 'Status'];
            const rows = filteredData.map(r => [r.employeeName, r.salaryMonth, r.baseSalary, r.commission, r.deductions, r.netAmount, r.paymentStatus]);
            exportReportToExcel({
              title: 'Salaries Report',
              subtitle: allTime ? 'All time' : `${filters.dateFrom} to ${filters.dateTo}`,
              columns: headers.map(h => ({ header: h })),
              rows,
              filename: allTime ? 'salaries-all-time' : `salaries-${filters.dateFrom}-to-${filters.dateTo}`,
            });
          }}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <Download size={16} /> Excel
        </button>
        <button
          onClick={() => {
            const headers = ['Employee', 'Month', 'Base Salary', 'Commission', 'Deductions', 'Net Amount', 'Status'];
            const rows = filteredData.map(r => [r.employeeName, r.salaryMonth, r.baseSalary, r.commission, r.deductions, r.netAmount, r.paymentStatus]);
            exportReportToPdf({
              title: 'Salaries Report',
              subtitle: allTime ? 'All time' : `${filters.dateFrom} to ${filters.dateTo}`,
              columns: headers.map(h => ({ header: h })),
              rows,
              filename: allTime ? 'salaries-all-time' : `salaries-${filters.dateFrom}-to-${filters.dateTo}`,
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
              <p className="text-sm text-gray-600 mb-1">Employees Paid</p>
              <p className="text-3xl font-bold text-gray-900">{paidCount}</p>
            </div>
            <div className="w-12 h-12 bg-[#4f46e5]/10 rounded-lg flex items-center justify-center">
              <Users size={24} className="text-[#4f46e5]" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Payroll</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalPayroll)}</p>
            </div>
            <div className="w-12 h-12 bg-[#10b981]/10 rounded-lg flex items-center justify-center">
              <DollarSign size={24} className="text-[#10b981]" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Pending Payroll</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(pendingTotal)}</p>
            </div>
            <div className="w-12 h-12 bg-[#ef4444]/10 rounded-lg flex items-center justify-center">
              <TrendingUp size={24} className="text-[#ef4444]" />
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">

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

          {/* Employee multi-select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <Users size={13} /> Employee
            </label>
            <MultiSelectDropdown
              options={employeeOptions}
              selected={filters.employees}
              onChange={v => setFilters({ ...filters, employees: v })}
              placeholder="All Employees"
            />
          </div>

          {/* Month multi-select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <FileText size={13} /> Month
            </label>
            <MultiSelectDropdown
              options={monthOptions}
              selected={filters.months}
              onChange={v => setFilters({ ...filters, months: v })}
              placeholder="All Months"
            />
          </div>

          {/* Status multi-select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
            <MultiSelectDropdown
              options={statusOptions}
              selected={filters.statuses}
              onChange={v => setFilters({ ...filters, statuses: v })}
              placeholder="All Statuses"
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
            {filters.employees.map(e => (
              <Pill key={e} label={e} onRemove={() => setFilters({ ...filters, employees: filters.employees.filter(x => x !== e) })} colorClass="bg-purple-50 text-purple-700" />
            ))}
            {filters.months.map(m => (
              <Pill key={m} label={m} onRemove={() => setFilters({ ...filters, months: filters.months.filter(x => x !== m) })} colorClass="bg-[#4f46e5]/10 text-[#4f46e5]" />
            ))}
            {filters.statuses.map(s => (
              <Pill
                key={s} label={s}
                onRemove={() => setFilters({ ...filters, statuses: filters.statuses.filter(x => x !== s) })}
                colorClass={s === 'Paid' ? 'bg-green-100 text-green-700' : s === 'Partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}
              />
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Salary Records</h3>
          <p className="text-sm text-gray-500 mt-0.5">Showing {filteredData.length} of {data.length} records</p>
        </div>

        <LockedScrollTable maxHeight="65vh">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Employee', 'Month', 'Base Salary', 'Commission', 'Deductions', 'Net Amount', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-gray-500">
                    <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium">No salary records found</p>
                    <p className="text-sm mt-1">Try adjusting your filters</p>
                  </td>
                </tr>
              ) : (
                filteredData.map((record, index) => (
                  <tr key={record.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{record.employeeName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{record.salaryMonth}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">{formatCurrency(record.baseSalary)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-700 text-right">+{formatCurrency(record.commission)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600 text-right">−{formatCurrency(record.deductions)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">{formatCurrency(record.netAmount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor(record.paymentStatus)}`}>
                        {record.paymentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => setViewRecord(record)}
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
                <span className="font-semibold text-gray-900">Total Payroll</span>
              </div>
              <div className="flex items-center gap-8 text-right">
                <div>
                  <p className="text-xs text-gray-400">Pending</p>
                  <p className="text-sm font-bold text-red-600">{formatCurrency(pendingTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Net Total</p>
                  <p className="text-2xl font-bold text-[#4f46e5]">{formatCurrency(totalPayroll)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {viewRecord && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#4f46e5]/10 rounded-lg flex items-center justify-center">
                  <Users size={18} className="text-[#4f46e5]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{viewRecord.employeeName}</h3>
                  <p className="text-xs text-gray-500">{viewRecord.salaryMonth}</p>
                </div>
              </div>
              <button onClick={() => setViewRecord(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <XCircle size={22} className="text-gray-400" />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-5 mb-5">
                {[
                  ['Base Salary',  formatCurrency(viewRecord.baseSalary),  'text-gray-900'],
                  ['Commission',   `+${formatCurrency(viewRecord.commission)}`, 'text-green-700'],
                  ['Deductions',   `−${formatCurrency(viewRecord.deductions)}`, 'text-red-600'],
                  ['Month',        viewRecord.salaryMonth,                  'text-gray-900'],
                ].map(([l, v, cls]) => (
                  <div key={l} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">{l}</p>
                    <p className={`text-sm font-bold ${cls}`}>{v}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between p-4 bg-[#4f46e5]/5 rounded-xl mb-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Net Amount</p>
                  <p className="text-3xl font-bold text-[#4f46e5]">{formatCurrency(viewRecord.netAmount)}</p>
                </div>
                <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${statusColor(viewRecord.paymentStatus)}`}>
                  {viewRecord.paymentStatus}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}