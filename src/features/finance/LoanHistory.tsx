// LoanHistory.tsx
import { useState, useMemo, useRef, useEffect } from 'react';
import { Printer, Download, Filter, ChevronDown, X, Calendar, DollarSign, FileText, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { formatGlobalCurrency } from '../../shared/currency/globalCurrency';
import { LockedScrollTable } from '../../shared/components/LockedScrollTable';
import { exportReportToPdf, exportReportToExcel } from '../../shared/reportExport/reportExport';

type Loan = {
  id: string;
  entityName: string;
  receiverName: string;
  receiverType: 'Employee' | 'Person';
  loanAmount: number;
  paid: number;
  remaining: number;
  type: 'Payable' | 'Receivable';
  loanType: string;
  status: 'Full' | 'Partial';
  date: string;
  mode: string;
  bankName?: string;
  employeeName?: string;
  paymentHistory?: any[];
  notes?: string;
};

type LoanHistoryProps = { loans: Loan[] };

// â”€â”€â”€ Multi-Select Dropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Pill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const formatCurrency = (v: number) => formatGlobalCurrency(v);

const typeColor   = (t: string) => t === 'Receivable' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800';
const statusColor = (s: string) => s === 'Full' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function LoanHistory({ loans }: LoanHistoryProps) {
  const today           = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0];

  const [allTime, setAllTime] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom:      firstDayOfMonth,
    dateTo:        today,
    types:         [] as string[],   // Payable | Receivable
    statuses:      [] as string[],   // Full | Partial
    loanTypes:     [] as string[],   // loanType categories
    receiverTypes: [] as string[],   // Employee | Person
    modes:         [] as string[],   // Cash | Bank etc.
    names:         [] as string[],   // receiverName
  });

  // Derived option lists
  const nameOptions         = useMemo(() => [...new Set(loans.map(l => l.receiverName || l.entityName))].sort(), [loans]);
  const loanTypeOptions     = useMemo(() => [...new Set(loans.map(l => l.loanType).filter(Boolean))].sort(), [loans]);
  const modeOptions         = useMemo(() => [...new Set(loans.map(l => l.mode).filter(Boolean))].sort(), [loans]);
  const typeOptions         = ['Receivable', 'Payable'];
  const statusOptions       = ['Full', 'Partial'];
  const receiverTypeOptions = ['Employee', 'Person'];

  const filtered = useMemo(() => {
    return loans.filter(l => {
      if (!allTime) {
        const d    = new Date(l.date);
        const from = new Date(filters.dateFrom);
        const to   = new Date(filters.dateTo);
        if (d < from || d > to) return false;
      }
      if (filters.types.length         > 0 && !filters.types.includes(l.type))                              return false;
      if (filters.statuses.length      > 0 && !filters.statuses.includes(l.status))                         return false;
      if (filters.loanTypes.length     > 0 && !filters.loanTypes.includes(l.loanType))                      return false;
      if (filters.receiverTypes.length > 0 && !filters.receiverTypes.includes(l.receiverType))              return false;
      if (filters.modes.length         > 0 && !filters.modes.includes(l.mode))                              return false;
      if (filters.names.length         > 0 && !filters.names.includes(l.receiverName || l.entityName))      return false;
      return true;
    });
  }, [loans, filters, allTime]);

  const totals = useMemo(() => ({
    amount:    filtered.reduce((s, l) => s + l.loanAmount, 0),
    paid:      filtered.reduce((s, l) => s + l.paid,       0),
    remaining: filtered.reduce((s, l) => s + l.remaining,  0),
  }), [filtered]);

  const hasActiveFilters =
    allTime || filters.types.length > 0 || filters.statuses.length > 0 ||
    filters.loanTypes.length > 0 || filters.receiverTypes.length > 0 ||
    filters.modes.length > 0 || filters.names.length > 0;

  const clearAll = () => {
    setAllTime(false);
    setFilters({ dateFrom: firstDayOfMonth, dateTo: today, types: [], statuses: [], loanTypes: [], receiverTypes: [], modes: [], names: [] });
  };

  const handlePrint    = () => { toast.success('Printing loan slip'); window.print(); };
  const handleDownload = () => toast.success('Downloading loan slip');

  return (
    <div className="p-8 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#4f46e5] rounded-lg flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Loan History</h1>
            <p className="text-sm text-gray-600">Complete record of all loans and advances</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <p className="text-sm text-gray-600 mb-1">Total Loans</p>
          <p className="text-3xl font-bold text-gray-900">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-gray-600">Total Amount</p>
            <DollarSign size={16} className="text-[#4f46e5]" />
          </div>
          <p className="text-2xl font-bold text-[#4f46e5]">{formatCurrency(totals.amount)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-gray-600">Total Paid</p>
            <DollarSign size={16} className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totals.paid)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-gray-600">Remaining</p>
            <DollarSign size={16} className="text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(totals.remaining)}</p>
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
              {allTime ? 'âœ“ All Time' : 'Show All Time'}
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <Users size={13} /> Name
            </label>
            <MultiSelectDropdown
              options={nameOptions}
              selected={filters.names}
              onChange={v => setFilters({ ...filters, names: v })}
              placeholder="All Names"
            />
          </div>

          {/* Loan Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <FileText size={13} /> Category
            </label>
            <MultiSelectDropdown
              options={loanTypeOptions}
              selected={filters.loanTypes}
              onChange={v => setFilters({ ...filters, loanTypes: v })}
              placeholder="All Categories"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Loan Type</label>
            <MultiSelectDropdown
              options={typeOptions}
              selected={filters.types}
              onChange={v => setFilters({ ...filters, types: v })}
              placeholder="All Types"
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

          {/* Receiver Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <Users size={13} /> Receiver Type
            </label>
            <MultiSelectDropdown
              options={receiverTypeOptions}
              selected={filters.receiverTypes}
              onChange={v => setFilters({ ...filters, receiverTypes: v })}
              placeholder="All Receivers"
            />
          </div>

          {/* Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Mode</label>
            <MultiSelectDropdown
              options={modeOptions}
              selected={filters.modes}
              onChange={v => setFilters({ ...filters, modes: v })}
              placeholder="All Modes"
            />
          </div>
        </div>

        {/* Active pills */}
        {hasActiveFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Active:</span>
            {allTime
              ? <Pill label="All Time" onRemove={() => setAllTime(false)} />
              : (filters.dateFrom || filters.dateTo) && (
                <Pill
                  label={`${filters.dateFrom || 'â€¦'} â†’ ${filters.dateTo || 'â€¦'}`}
                  onRemove={() => setFilters({ ...filters, dateFrom: firstDayOfMonth, dateTo: today })}
                />
              )
            }
            {filters.names.map(n => (
              <Pill key={n} label={n} onRemove={() => setFilters({ ...filters, names: filters.names.filter(x => x !== n) })} colorClass="bg-purple-50 text-purple-700" />
            ))}
            {filters.loanTypes.map(lt => (
              <Pill key={lt} label={lt} onRemove={() => setFilters({ ...filters, loanTypes: filters.loanTypes.filter(x => x !== lt) })} colorClass="bg-[#10b981]/10 text-[#10b981]" />
            ))}
            {filters.types.map(t => (
              <Pill key={t} label={t} onRemove={() => setFilters({ ...filters, types: filters.types.filter(x => x !== t) })} colorClass={t === 'Receivable' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'} />
            ))}
            {filters.statuses.map(s => (
              <Pill key={s} label={s} onRemove={() => setFilters({ ...filters, statuses: filters.statuses.filter(x => x !== s) })} colorClass={s === 'Full' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'} />
            ))}
            {filters.receiverTypes.map(r => (
              <Pill key={r} label={r} onRemove={() => setFilters({ ...filters, receiverTypes: filters.receiverTypes.filter(x => x !== r) })} colorClass="bg-gray-100 text-gray-700" />
            ))}
            {filters.modes.map(m => (
              <Pill key={m} label={m} onRemove={() => setFilters({ ...filters, modes: filters.modes.filter(x => x !== m) })} colorClass="bg-gray-100 text-gray-700" />
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Loan Records</h3>
            <p className="text-sm text-gray-500 mt-0.5">Showing {filtered.length} of {loans.length} loans</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                const headers = ['Date', 'Name', 'Type', 'Category', 'Mode', 'Amount', 'Paid', 'Remaining', 'Status'];
                const rows = filtered.map(loan => [
                  new Date(loan.date).toLocaleDateString('en-AE'),
                  loan.receiverName || loan.entityName, loan.type, loan.loanType || 'â€”', loan.mode || 'â€”',
                  formatCurrency(loan.loanAmount), formatCurrency(loan.paid), formatCurrency(loan.remaining), loan.status,
                ]);
                exportReportToExcel({
                  title: 'Loan History',
                  subtitle: `${filtered.length} of ${loans.length} loans`,
                  columns: headers.map(h => ({ header: h })),
                  rows,
                  filename: `loan-history-${new Date().toISOString().slice(0, 10)}`,
                });
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <Download size={14} /> Excel
            </button>
            <button
              onClick={() => {
                const headers = ['Date', 'Name', 'Type', 'Category', 'Mode', 'Amount', 'Paid', 'Remaining', 'Status'];
                const rows = filtered.map(loan => [
                  new Date(loan.date).toLocaleDateString('en-AE'),
                  loan.receiverName || loan.entityName, loan.type, loan.loanType || 'â€”', loan.mode || 'â€”',
                  formatCurrency(loan.loanAmount), formatCurrency(loan.paid), formatCurrency(loan.remaining), loan.status,
                ]);
                exportReportToPdf({
                  title: 'Loan History',
                  subtitle: `${filtered.length} of ${loans.length} loans`,
                  columns: headers.map(h => ({ header: h })),
                  rows,
                  filename: `loan-history-${new Date().toISOString().slice(0, 10)}`,
                });
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <Download size={14} /> PDF
            </button>
          </div>
        </div>

        <LockedScrollTable maxHeight="65vh">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Date', 'Name', 'Type', 'Category', 'Mode', 'Amount', 'Paid', 'Remaining', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center text-gray-500">
                    <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium">No loans found</p>
                    <p className="text-sm mt-1">Try adjusting your filters</p>
                  </td>
                </tr>
              ) : (
                filtered.map((loan, index) => (
                  <tr key={loan.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {new Date(loan.date).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {loan.receiverName || loan.entityName}
                      {loan.receiverType && (
                        <span className="ml-1.5 text-[10px] text-gray-400 font-normal">{loan.receiverType}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${typeColor(loan.type)}`}>
                        {loan.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{loan.loanType || 'â€”'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{loan.mode || 'â€”'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{formatCurrency(loan.loanAmount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">{formatCurrency(loan.paid)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600">{formatCurrency(loan.remaining)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${statusColor(loan.status)}`}>
                        {loan.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handlePrint}
                          className="p-1.5 text-[#4f46e5] bg-[#4f46e5]/10 hover:bg-[#4f46e5]/20 rounded-lg transition-colors"
                          title="Print"
                        >
                          <Printer size={14} />
                        </button>
                        <button
                          onClick={handleDownload}
                          className="p-1.5 text-[#10b981] bg-[#10b981]/10 hover:bg-[#10b981]/20 rounded-lg transition-colors"
                          title="Download"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </LockedScrollTable>

        {/* Footer totals */}
        {filtered.length > 0 && (
          <div className="bg-gray-50 border-t-2 border-[#4f46e5] px-6 py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <DollarSign size={18} className="text-[#4f46e5]" />
                <span className="font-semibold text-gray-900">Totals</span>
                <span className="text-sm text-gray-400">({filtered.length} loan{filtered.length !== 1 ? 's' : ''})</span>
              </div>
              <div className="flex items-stretch gap-px rounded-xl overflow-hidden border border-gray-200 text-right">
                <div className="bg-white px-6 py-3 min-w-[140px]">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Total Paid</p>
                  <p className="text-base font-bold text-green-600">{formatCurrency(totals.paid)}</p>
                </div>
                <div className="bg-white px-6 py-3 min-w-[140px]">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Remaining</p>
                  <p className="text-base font-bold text-red-600">{formatCurrency(totals.remaining)}</p>
                </div>
                <div className="bg-[#4f46e5]/5 px-6 py-3 min-w-[160px] border-l-2 border-[#4f46e5]">
                  <p className="text-xs font-medium text-[#4f46e5] uppercase tracking-wide mb-1">Total Amount</p>
                  <p className="text-xl font-bold text-[#4f46e5]">{formatCurrency(totals.amount)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
