import { useState, useMemo, useRef, useEffect } from 'react';
import { FileText, DollarSign, Percent, Calendar, MapPin, User, Filter, X, ChevronDown } from 'lucide-react';
import { formatGlobalCurrency } from '../../shared/currency/globalCurrency';
import { LockedScrollTable } from '../../shared/components/LockedScrollTable';

type Commission = {
  id: string;
  salesperson: string;
  salespersonName: string;
  city: string;
  month: string; // Format: "YYYY-MM"
  totalSales: number;
  appliedSlabFrom: number;
  appliedSlabTo: number;
  commissionPercentage: number;
  calculatedCommissionAmount: number;
  overriddenCommissionPercentage?: number;
  overriddenCommissionAmount?: number;
  status: 'Calculated' | 'Adjusted' | 'Confirmed';
  calculatedBy: string;
  confirmedBy?: string;
  calculatedAt: string;
  confirmedAt?: string;
  isLocked: boolean;
};

type CommissionReportProps = {
  commissions: Commission[];
};

// ─── Multi-Select Dropdown ────────────────────────────────────────────────────
function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  labelFn,
}: {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
  labelFn?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? (labelFn ? labelFn(selected[0]) : selected[0])
      : `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-left flex items-center justify-between text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={selected.length === 0 ? 'text-gray-400' : 'text-gray-900'}>{label}</span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
            <button type="button" onClick={() => onChange([...options])} className="text-xs text-blue-600 font-medium hover:underline">
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
                  className="accent-blue-600 w-4 h-4 rounded"
                />
                <span className="text-gray-800">{labelFn ? labelFn(opt) : opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────────────
function Pill({ label, onRemove, color = 'blue' }: { label: string; onRemove: () => void; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    gray: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${colors[color] ?? colors.blue}`}>
      {label}
      <button type="button" onClick={onRemove} className="hover:opacity-70"><X size={11} /></button>
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function CommissionReport({ commissions }: CommissionReportProps) {
  // Derive unique option lists from data
  const cityOptions = useMemo(() => [...new Set(commissions.map(c => c.city))].sort(), [commissions]);
  const salespersonOptions = useMemo(() => [...new Set(commissions.map(c => c.salespersonName))].sort(), [commissions]);
  const statusOptions: Commission['status'][] = ['Calculated', 'Adjusted', 'Confirmed'];

  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const [allTime, setAllTime] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: firstDayOfMonth,
    dateTo: today,
    salespersons: [] as string[],
    cities: [] as string[],
    statuses: [] as string[],
  });

  const formatCurrency = (amount: number) => formatGlobalCurrency(amount);

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  const filteredCommissions = useMemo(() => {
    return commissions.filter(c => {
      // Date range — compare month strings (YYYY-MM) against date range
      if (!allTime) {
        const commDate = new Date(c.month + '-01');
        const from = new Date(filters.dateFrom);
        const to = new Date(filters.dateTo);
        // normalise to start-of-month for fair comparison
        from.setDate(1); to.setDate(1);
        if (commDate < from || commDate > to) return false;
      }
      if (filters.salespersons.length > 0 && !filters.salespersons.includes(c.salespersonName)) return false;
      if (filters.cities.length > 0 && !filters.cities.includes(c.city)) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(c.status)) return false;
      return true;
    });
  }, [commissions, filters, allTime]);

  const totalAmount = useMemo(
    () => filteredCommissions.reduce((sum, c) => sum + (c.overriddenCommissionAmount || c.calculatedCommissionAmount), 0),
    [filteredCommissions]
  );

  const avgRate = useMemo(() => {
    if (filteredCommissions.length === 0) return 0;
    return filteredCommissions.reduce((sum, c) => sum + (c.overriddenCommissionPercentage || c.commissionPercentage), 0) / filteredCommissions.length;
  }, [filteredCommissions]);

  const hasActiveFilters =
    !allTime ||
    filters.salespersons.length > 0 ||
    filters.cities.length > 0 ||
    filters.statuses.length > 0;

  const clearAll = () => {
    setAllTime(false);
    setFilters({ dateFrom: firstDayOfMonth, dateTo: today, salespersons: [], cities: [], statuses: [] });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FileText size={28} />
            Commission Report
          </h2>
          <p className="text-sm text-gray-600 mt-1">View and analyze commission payments</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Commissions</p>
              <p className="text-2xl font-bold text-gray-900">{filteredCommissions.length}</p>
            </div>
            <FileText size={24} className="text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Amount</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
            </div>
            <DollarSign size={24} className="text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Confirmed</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredCommissions.filter(c => c.status === 'Confirmed').length}
              </p>
            </div>
            <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
              <div className="w-3 h-3 bg-green-600 rounded-full" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Average Rate</p>
              <p className="text-2xl font-bold text-gray-900">{avgRate.toFixed(1)}%</p>
            </div>
            <Percent size={24} className="text-purple-600" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Filters</h3>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
            />
            <button
              type="button"
              onClick={() => setAllTime(v => !v)}
              className={`mt-1.5 w-full text-xs font-medium py-1 rounded-md border transition-colors ${
                allTime ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50'
              }`}
            >
              {allTime ? '✓ All Time' : 'Show All Time'}
            </button>
          </div>

          {/* Salesperson */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <User size={13} /> Salesperson
            </label>
            <MultiSelectDropdown
              options={salespersonOptions}
              selected={filters.salespersons}
              onChange={v => setFilters({ ...filters, salespersons: v })}
              placeholder="All Salespersons"
            />
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <MapPin size={13} /> City / Office
            </label>
            <MultiSelectDropdown
              options={cityOptions}
              selected={filters.cities}
              onChange={v => setFilters({ ...filters, cities: v })}
              placeholder="All Cities"
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
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Active:</span>
            {allTime
              ? <Pill label="All Time" onRemove={() => setAllTime(false)} color="blue" />
              : <Pill label={`${filters.dateFrom} → ${filters.dateTo}`} onRemove={() => setFilters({ ...filters, dateFrom: firstDayOfMonth, dateTo: today })} color="blue" />
            }
            {filters.salespersons.map(s => (
              <Pill key={s} label={s} onRemove={() => setFilters({ ...filters, salespersons: filters.salespersons.filter(x => x !== s) })} color="purple" />
            ))}
            {filters.cities.map(c => (
              <Pill key={c} label={c} onRemove={() => setFilters({ ...filters, cities: filters.cities.filter(x => x !== c) })} color="gray" />
            ))}
            {filters.statuses.map(s => (
              <Pill key={s} label={s} onRemove={() => setFilters({ ...filters, statuses: filters.statuses.filter(x => x !== s) })} color="green" />
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Commission Details</h3>
          <p className="text-sm text-gray-600 mt-1">
            Showing {filteredCommissions.length} of {commissions.length} commissions
          </p>
        </div>

        <LockedScrollTable maxHeight="65vh">
          <table className="w-full min-w-max">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                  <User size={14} className="inline mr-1" />Salesperson
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                  <MapPin size={14} className="inline mr-1" />City
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                  <Calendar size={14} className="inline mr-1" />Month
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                  <DollarSign size={14} className="inline mr-1" />Total Sales
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                  Applied Slab
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                  <Percent size={14} className="inline mr-1" />Commission %
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[130px]">
                  <DollarSign size={14} className="inline mr-1" />Commission Amt
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px]">Calculated By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[140px]">Confirmed By</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCommissions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium">No commission data found</p>
                    <p className="text-sm">Try adjusting your filters or calculate commissions first.</p>
                  </td>
                </tr>
              ) : (
                filteredCommissions.map((commission, index) => (
                  <tr key={commission.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {commission.salespersonName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{commission.city}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatMonth(commission.month)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(commission.totalSales)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {formatCurrency(commission.appliedSlabFrom)} – {formatCurrency(commission.appliedSlabTo)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {commission.overriddenCommissionPercentage || commission.commissionPercentage}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                      {formatCurrency(commission.overriddenCommissionAmount || commission.calculatedCommissionAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${
                        commission.status === 'Confirmed' ? 'bg-green-100 text-green-800' :
                        commission.status === 'Adjusted'  ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {commission.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{commission.calculatedBy}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{commission.confirmedBy || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </LockedScrollTable>

        {/* Footer total */}
        {filteredCommissions.length > 0 && (
          <div className="bg-gray-50 border-t-2 border-blue-600 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign size={18} className="text-blue-600" />
              <span className="font-semibold text-gray-900">Total</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Commission Amount</p>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}