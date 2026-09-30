import { useState, useMemo, useRef, useEffect } from 'react';
// import { InventoryAuditLog } from '../App';
type InventoryAuditLog = any;
import { History, Filter, Download, Eye, Calendar, User, Package, ArrowRightLeft, AlertTriangle, CheckCircle, XCircle, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { LockedScrollTable } from '../../shared/components/LockedScrollTable';
import { exportReportToPdf, exportReportToExcel } from '../../shared/reportExport/reportExport';

type ProductTransferReportProps = {
  transferLogs: InventoryAuditLog[];
};

// ── Shared MultiSelect ────────────────────────────────────────────────────────
function MultiSelect({
  label, options, selected, onChange, placeholder = 'All', disabled = false,
}: {
  label: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const display = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full border rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 transition-colors
          ${disabled ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' :
            open ? 'border-indigo-500 ring-1 ring-indigo-300 bg-white' :
            selected.length > 0 ? 'border-indigo-400 bg-indigo-50 text-indigo-700' :
            'bg-white border-gray-300 hover:border-indigo-400 cursor-pointer'}`}>
        <span className={selected.length === 0 ? 'text-gray-400' : 'font-medium'}>{display}</span>
        <ChevronDown size={13} className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''} text-gray-400`} />
      </button>
      {selected.length > 1 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selected.map(v => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
              {v}<button onClick={() => toggle(v)}><X size={9} /></button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {options.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400 italic">No options</p> : (
            <>
              {selected.length > 0 && (
                <button onClick={() => { onChange([]); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 border-b border-gray-100 font-medium">
                  ✕ Clear selection
                </button>
              )}
              {options.map(opt => (
                <label key={opt} className="flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 cursor-pointer text-sm">
                  <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="accent-indigo-600 w-3.5 h-3.5 rounded flex-shrink-0" />
                  <span className="text-gray-800">{opt}</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ProductTransferReport({ transferLogs }: ProductTransferReportProps) {
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedPerformedBy, setSelectedPerformedBy] = useState<string[]>([]);
  const [selectedFromLocations, setSelectedFromLocations] = useState<string[]>([]);
  const [selectedToLocations, setSelectedToLocations] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [viewLog, setViewLog] = useState<InventoryAuditLog | null>(null);

  // ── Derived filter options ──────────────────────────────────────────────────
  const actions = useMemo(() => {
    const s = new Set<string>();
    transferLogs.forEach(l => l.action && s.add(l.action));
    return Array.from(s).sort();
  }, [transferLogs]);

  const brands = useMemo(() => {
    const s = new Set<string>();
    transferLogs.forEach(l => l.brandName && s.add(l.brandName));
    return Array.from(s).sort();
  }, [transferLogs]);

  // Models filtered by selected brands
  const availableModels = useMemo(() => {
    const s = new Set<string>();
    transferLogs.forEach(l => {
      if ((selectedBrands.length === 0 || selectedBrands.includes(l.brandName)) && l.modelName) {
        s.add(l.modelName);
      }
    });
    return Array.from(s).sort();
  }, [transferLogs, selectedBrands]);

  useEffect(() => {
    setSelectedModels(prev => prev.filter(m => availableModels.includes(m)));
  }, [availableModels]);

  const performers = useMemo(() => {
    const s = new Set<string>();
    transferLogs.forEach(l => l.performedBy && s.add(l.performedBy));
    return Array.from(s).sort();
  }, [transferLogs]);

  const fromLocations = useMemo(() => {
    const s = new Set<string>();
    transferLogs.forEach(l => l.fromLocation && s.add(l.fromLocation));
    return Array.from(s).sort();
  }, [transferLogs]);

  const toLocations = useMemo(() => {
    const s = new Set<string>();
    transferLogs.forEach(l => l.toLocation && s.add(l.toLocation));
    return Array.from(s).sort();
  }, [transferLogs]);

  // ── Filtered logs ──────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    return transferLogs.filter(log => {
      if (selectedAction && log.action !== selectedAction) return false;
      if (selectedBrands.length > 0 && !selectedBrands.includes(log.brandName)) return false;
      if (selectedModels.length > 0 && !selectedModels.includes(log.modelName)) return false;
      if (selectedPerformedBy.length > 0 && !selectedPerformedBy.includes(log.performedBy)) return false;
      if (selectedFromLocations.length > 0 && !selectedFromLocations.includes(log.fromLocation)) return false;
      if (selectedToLocations.length > 0 && !selectedToLocations.includes(log.toLocation)) return false;
      if (startDate) {
        const logDate = new Date(log.timestamp);
        if (logDate < new Date(startDate)) return false;
      }
      if (endDate) {
        const logDate = new Date(log.timestamp);
        if (logDate > new Date(endDate + 'T23:59:59')) return false;
      }
      return true;
    });
  }, [transferLogs, selectedAction, selectedBrands, selectedModels, selectedPerformedBy, selectedFromLocations, selectedToLocations, startDate, endDate]);

  const hasActiveFilters = selectedAction || selectedBrands.length > 0 || selectedModels.length > 0 ||
    selectedPerformedBy.length > 0 || selectedFromLocations.length > 0 || selectedToLocations.length > 0 ||
    startDate || endDate;

  const clearFilters = () => {
    setSelectedAction('');
    setSelectedBrands([]);
    setSelectedModels([]);
    setSelectedPerformedBy([]);
    setSelectedFromLocations([]);
    setSelectedToLocations([]);
    setStartDate('');
    setEndDate('');
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'Added': return <CheckCircle size={16} className="text-green-600" />;
      case 'Removed': return <XCircle size={16} className="text-red-600" />;
      case 'Transferred': return <ArrowRightLeft size={16} className="text-blue-600" />;
      case 'Status Changed': return <AlertTriangle size={16} className="text-yellow-600" />;
      case 'Manual Entry': return <Package size={16} className="text-purple-600" />;
      default: return <History size={16} className="text-gray-600" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'Added': return 'bg-green-100 text-green-800';
      case 'Removed': return 'bg-red-100 text-red-800';
      case 'Transferred': return 'bg-blue-100 text-blue-800';
      case 'Status Changed': return 'bg-yellow-100 text-yellow-800';
      case 'Manual Entry': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Action', 'Product', 'Brand', 'Model', 'Serial Numbers', 'From Location', 'To Location', 'Old Status', 'New Status', 'Quantity', 'Performed By', 'Notes'];
    const rows: string[] = [];
    filteredLogs.forEach(log => {
      rows.push([
        new Date(log.timestamp).toLocaleString('en-AE'), log.action, log.productName,
        log.brandName, log.modelName, log.serialNumbers.join('; '),
        log.fromLocation || '', log.toLocation || '', log.oldStatus || '',
        log.newStatus || '', log.quantity.toString(), log.performedBy, log.notes || ''
      ].join(','));
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-transfer-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Product transfer report exported successfully');
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Product Transfer Report</h2>
        <p className="text-sm text-gray-600 mt-1">Complete history of product transfers and inventory movements</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2"><History size={18} className="text-blue-600" /><p className="text-sm text-gray-600">Total Entries</p></div>
          <p className="text-2xl font-bold text-[#4f46e5]">{filteredLogs.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2"><CheckCircle size={18} className="text-green-600" /><p className="text-sm text-gray-600">Additions</p></div>
          <p className="text-2xl font-bold text-green-600">{filteredLogs.filter(l => l.action === 'Added').length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2"><ArrowRightLeft size={18} className="text-blue-600" /><p className="text-sm text-gray-600">Transfers</p></div>
          <p className="text-2xl font-bold text-blue-600">{filteredLogs.filter(l => l.action === 'Transferred').length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={18} className="text-yellow-600" /><p className="text-sm text-gray-600">Status Changes</p></div>
          <p className="text-2xl font-bold text-yellow-600">{filteredLogs.filter(l => l.action === 'Status Changed').length}</p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-600" />
            <h3 className="font-semibold text-gray-900">Filters</h3>
            {hasActiveFilters && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">Active</span>
            )}
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1">
              <X size={12} /> Clear all filters
            </button>
          )}
        </div>

        {/* Row 1: Date range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 mb-4 border-b border-gray-100">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Calendar size={14} className="text-gray-500" /> Start Date
            </label>
            <input type="date" value={startDate} max={endDate || undefined} onChange={e => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Calendar size={14} className="text-gray-500" /> End Date
            </label>
            <input type="date" value={endDate} min={startDate || undefined} onChange={e => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
          </div>
        </div>

        {/* Row 2: Action, From Location, To Location, Performed By */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select value={selectedAction} onChange={e => setSelectedAction(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400
                ${selectedAction ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-300'}`}>
              <option value="">All Actions</option>
              {actions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <MultiSelect label="From Location" options={fromLocations} selected={selectedFromLocations} onChange={setSelectedFromLocations} placeholder="All Locations" />
          <MultiSelect label="To Location" options={toLocations} selected={selectedToLocations} onChange={setSelectedToLocations} placeholder="All Locations" />
          <MultiSelect label="Performed By" options={performers} selected={selectedPerformedBy} onChange={setSelectedPerformedBy} placeholder="All Users" />
        </div>

        {/* Row 3: Brand, Model */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MultiSelect label="Brand" options={brands} selected={selectedBrands} onChange={setSelectedBrands} placeholder="All Brands" />
          <MultiSelect
            label={`Model${selectedBrands.length > 0 ? ` (${selectedBrands.join(', ')})` : ''}`}
            options={availableModels} selected={selectedModels} onChange={setSelectedModels}
            placeholder="All Models" disabled={availableModels.length === 0}
          />
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
            {startDate && <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">From: {startDate}<button onClick={() => setStartDate('')}><X size={9} /></button></span>}
            {endDate && <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">To: {endDate}<button onClick={() => setEndDate('')}><X size={9} /></button></span>}
            {selectedAction && <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-50 text-yellow-700 text-xs rounded-full">{selectedAction}<button onClick={() => setSelectedAction('')}><X size={9} /></button></span>}
            {selectedFromLocations.map(l => <span key={l} className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 text-xs rounded-full">From: {l}<button onClick={() => setSelectedFromLocations(selectedFromLocations.filter(v => v !== l))}><X size={9} /></button></span>)}
            {selectedToLocations.map(l => <span key={l} className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full">To: {l}<button onClick={() => setSelectedToLocations(selectedToLocations.filter(v => v !== l))}><X size={9} /></button></span>)}
            {selectedBrands.map(b => <span key={b} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-full">{b}<button onClick={() => setSelectedBrands(selectedBrands.filter(v => v !== b))}><X size={9} /></button></span>)}
            {selectedModels.map(m => <span key={m} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full">{m}<button onClick={() => setSelectedModels(selectedModels.filter(v => v !== m))}><X size={9} /></button></span>)}
            {selectedPerformedBy.map(p => <span key={p} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-full">{p}<button onClick={() => setSelectedPerformedBy(selectedPerformedBy.filter(v => v !== p))}><X size={9} /></button></span>)}
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              const headers = ['Timestamp', 'Action', 'Product', 'Brand', 'Model', 'Serial Numbers', 'From Location', 'To Location', 'Old Status', 'New Status', 'Quantity', 'Performed By', 'Notes'];
              const rows = filteredLogs.map(log => [
                new Date(log.timestamp).toLocaleString('en-AE'), log.action, log.productName,
                log.brandName, log.modelName, log.serialNumbers.join('; '),
                log.fromLocation || '', log.toLocation || '', log.oldStatus || '',
                log.newStatus || '', log.quantity, log.performedBy, log.notes || '',
              ]);
              exportReportToExcel({
                title: 'Product Transfer Log',
                subtitle: `${filteredLogs.length} entries`,
                columns: headers.map(h => ({ header: h })),
                rows,
                filename: `product-transfer-log-${new Date().toISOString().slice(0, 10)}`,
              });
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Download size={16} /> Excel
          </button>
          <button
            onClick={() => {
              const headers = ['Timestamp', 'Action', 'Product', 'Brand', 'Model', 'Serial Numbers', 'From Location', 'To Location', 'Old Status', 'New Status', 'Quantity', 'Performed By', 'Notes'];
              const rows = filteredLogs.map(log => [
                new Date(log.timestamp).toLocaleString('en-AE'), log.action, log.productName,
                log.brandName, log.modelName, log.serialNumbers.join('; '),
                log.fromLocation || '', log.toLocation || '', log.oldStatus || '',
                log.newStatus || '', log.quantity, log.performedBy, log.notes || '',
              ]);
              exportReportToPdf({
                title: 'Product Transfer Log',
                subtitle: `${filteredLogs.length} entries`,
                columns: headers.map(h => ({ header: h })),
                rows,
                filename: `product-transfer-log-${new Date().toISOString().slice(0, 10)}`,
              });
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Download size={16} /> PDF
          </button>
          <button onClick={handleExportCSV} className="px-4 py-2 text-sm font-medium text-white bg-[#10b981] rounded-lg hover:bg-[#059669] flex items-center gap-2">
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100">
          <p className="text-sm text-gray-600">Showing <span className="font-semibold text-gray-900">{filteredLogs.length}</span> of {transferLogs.length} entries</p>
        </div>
        <LockedScrollTable maxHeight="65vh">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performed By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No audit log entries found</td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center gap-2"><Calendar size={14} className="text-gray-400" />{new Date(log.timestamp).toLocaleString('en-AE')}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getActionColor(log.action)}`}>
                        {getActionIcon(log.action)}{log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <p className="font-medium">{log.productName}</p>
                      <p className="text-xs text-gray-500">{log.brandName} {log.modelName}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="max-w-xs">
                        {log.fromLocation && log.toLocation && (
                          <p className="text-xs"><span className="font-medium">{log.fromLocation}</span> → <span className="font-medium">{log.toLocation}</span></p>
                        )}
                        {log.oldStatus && log.newStatus && (
                          <p className="text-xs">Status: <span className="font-medium">{log.oldStatus}</span> → <span className="font-medium">{log.newStatus}</span></p>
                        )}
                        <p className="text-xs">Qty: {log.quantity} • Serials: {log.serialNumbers.length}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center gap-2"><User size={14} className="text-gray-400" />{log.performedBy}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button onClick={() => setViewLog(log)} className="p-2 text-[#4f46e5] hover:bg-[#4f46e5]/10 rounded-lg transition-colors" title="View Details">
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </LockedScrollTable>
      </div>

      {/* View Log Details Modal */}
      {viewLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold">Audit Log Details</h3>
              <button onClick={() => setViewLog(null)} className="text-gray-500 hover:text-gray-700"><XCircle size={24} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-sm text-gray-600">Timestamp</p><p className="font-medium text-gray-900">{new Date(viewLog.timestamp).toLocaleString('en-AE')}</p></div>
                <div>
                  <p className="text-sm text-gray-600">Action</p>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full ${getActionColor(viewLog.action)}`}>
                    {getActionIcon(viewLog.action)}{viewLog.action}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Product</p>
                  <p className="font-medium text-gray-900">{viewLog.productName}</p>
                  <p className="text-sm text-gray-500">{viewLog.brandName} {viewLog.modelName}</p>
                </div>
                <div><p className="text-sm text-gray-600">Quantity</p><p className="font-medium text-gray-900">{viewLog.quantity}</p></div>
                <div><p className="text-sm text-gray-600">Performed By</p><p className="font-medium text-gray-900">{viewLog.performedBy}</p></div>
                {viewLog.relatedInvoiceId && <div><p className="text-sm text-gray-600">Related Invoice</p><p className="font-medium text-gray-900">{viewLog.relatedInvoiceId}</p></div>}
              </div>
              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 mb-2">Serial Numbers ({viewLog.serialNumbers.length})</p>
                <div className="flex flex-wrap gap-2">
                  {viewLog.serialNumbers.map((serial: string, idx: number) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs font-mono"><Package size={10} />{serial}</span>
                  ))}
                </div>
              </div>
              {(viewLog.fromLocation || viewLog.toLocation) && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-2">Location Changes</p>
                  <div className="flex items-center gap-2">
                    {viewLog.fromLocation && <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">From: {viewLog.fromLocation}</span>}
                    {viewLog.toLocation && <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">To: {viewLog.toLocation}</span>}
                  </div>
                </div>
              )}
              {(viewLog.oldStatus || viewLog.newStatus) && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-2">Status Changes</p>
                  <div className="flex items-center gap-2">
                    {viewLog.oldStatus && <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">Old: {viewLog.oldStatus}</span>}
                    {viewLog.newStatus && <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">New: {viewLog.newStatus}</span>}
                  </div>
                </div>
              )}
              {viewLog.notes && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-1">Notes</p>
                  <p className="font-medium text-gray-900">{viewLog.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}