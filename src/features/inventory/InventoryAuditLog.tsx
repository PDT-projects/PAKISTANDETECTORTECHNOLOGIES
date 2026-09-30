import { useState, useMemo } from 'react';
import { InventoryAuditLog } from '../App';
import { History, Filter, Download, Eye, Calendar, User, Package, ArrowRightLeft, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { LockedScrollTable } from '../../shared/components/LockedScrollTable';
import { exportReportToPdf, exportReportToExcel } from '../../shared/reportExport/reportExport';

type ProductTransferReportProps = {\n  transferLogs: InventoryAuditLog[];\n};

export function ProductTransferReport({ transferLogs }: ProductTransferReportProps) {
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedPerformedBy, setSelectedPerformedBy] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [viewLog, setViewLog] = useState<InventoryAuditLog | null>(null);

  // Get unique values for filters
  const actions = useMemo(() => {
    const actionSet = new Set<string>();
    auditLogs.forEach(log => actionSet.add(log.action));
    return Array.from(actionSet).sort();
  }, [auditLogs]);

  const products = useMemo(() => {
    const productSet = new Set<string>();
    auditLogs.forEach(log => productSet.add(`${log.brandName} ${log.modelName}`));
    return Array.from(productSet).sort();
  }, [auditLogs]);

  const performers = useMemo(() => {
    const performerSet = new Set<string>();
    auditLogs.forEach(log => performerSet.add(log.performedBy));
    return Array.from(performerSet).sort();
  }, [auditLogs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (selectedAction && log.action !== selectedAction) return false;
      if (selectedProduct && `${log.brandName} ${log.modelName}` !== selectedProduct) return false;
      if (selectedPerformedBy && log.performedBy !== selectedPerformedBy) return false;
      return true;
    });
  }, [auditLogs, selectedAction, selectedProduct, selectedPerformedBy]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'Added':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'Removed':
        return <XCircle size={16} className="text-red-600" />;
      case 'Transferred':
        return <ArrowRightLeft size={16} className="text-blue-600" />;
      case 'Status Changed':
        return <AlertTriangle size={16} className="text-yellow-600" />;
      case 'Manual Entry':
        return <Package size={16} className="text-purple-600" />;
      default:
        return <History size={16} className="text-gray-600" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'Added':
        return 'bg-green-100 text-green-800';
      case 'Removed':
        return 'bg-red-100 text-red-800';
      case 'Transferred':
        return 'bg-blue-100 text-blue-800';
      case 'Status Changed':
        return 'bg-yellow-100 text-yellow-800';
      case 'Manual Entry':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Action', 'Product', 'Brand', 'Model', 'Serial Numbers', 'From Location', 'To Location', 'Old Status', 'New Status', 'Quantity', 'Performed By', 'Notes'];
    const rows: string[] = [];

    filteredLogs.forEach(log => {
      rows.push([
        new Date(log.timestamp).toLocaleString('en-AE'),
        log.action,
        log.productName,
        log.brandName,
        log.modelName,
        log.serialNumbers.join('; '),
        log.fromLocation || '',
        log.toLocation || '',
        log.oldStatus || '',
        log.newStatus || '',
        log.quantity.toString(),
        log.performedBy,
        log.notes || ''
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

  const clearFilters = () => {
    setSelectedAction('');
    setSelectedProduct('');
    setSelectedPerformedBy('');
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
          <div className="flex items-center gap-2 mb-2">
            <History size={18} className="text-blue-600" />
            <p className="text-sm text-gray-600">Total Entries</p>
          </div>
          <p className="text-2xl font-bold text-[#4f46e5]">{filteredLogs.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={18} className="text-green-600" />
            <p className="text-sm text-gray-600">Additions</p>
          </div>
          <p className="text-2xl font-bold text-green-600">
            {filteredLogs.filter(log => log.action === 'Added').length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowRightLeft size={18} className="text-blue-600" />
            <p className="text-sm text-gray-600">Transfers</p>
          </div>
          <p className="text-2xl font-bold text-blue-600">
            {filteredLogs.filter(log => log.action === 'Transferred').length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-yellow-600" />
            <p className="text-sm text-gray-600">Status Changes</p>
          </div>
          <p className="text-2xl font-bold text-yellow-600">
            {filteredLogs.filter(log => log.action === 'Status Changed').length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-gray-600" />
          <h3 className="font-semibold text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Actions</option>
              {actions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Products</option>
              {products.map(product => (
                <option key={product} value={product}>{product}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Performed By</label>
            <select
              value={selectedPerformedBy}
              onChange={(e) => setSelectedPerformedBy(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Users</option>
              {performers.map(performer => (
                <option key={performer} value={performer}>{performer}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          {(selectedAction || selectedProduct || selectedPerformedBy) && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Clear Filters
            </button>
          )}
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
                title: 'Inventory Audit Log',
                subtitle: `${filteredLogs.length} entries`,
                columns: headers.map(h => ({ header: h })),
                rows,
                filename: `inventory-audit-log-${new Date().toISOString().slice(0, 10)}`,
              });
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Download size={16} />
            Excel
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
                title: 'Inventory Audit Log',
                subtitle: `${filteredLogs.length} entries`,
                columns: headers.map(h => ({ header: h })),
                rows,
                filename: `inventory-audit-log-${new Date().toISOString().slice(0, 10)}`,
              });
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Download size={16} />
            PDF
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 text-sm font-medium text-white bg-[#10b981] rounded-lg hover:bg-[#059669] flex items-center gap-2"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
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
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No audit log entries found
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-400" />
                        {new Date(log.timestamp).toLocaleString('en-PK')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${getActionColor(log.action)}`}>
                        {getActionIcon(log.action)}
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div>
                        <p className="font-medium">{log.productName}</p>
                        <p className="text-xs text-gray-500">{log.brandName} {log.modelName}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="max-w-xs">
                        {log.fromLocation && log.toLocation && (
                          <p className="text-xs">
                            <span className="font-medium">{log.fromLocation}</span> → <span className="font-medium">{log.toLocation}</span>
                          </p>
                        )}
                        {log.oldStatus && log.newStatus && (
                          <p className="text-xs">
                            Status: <span className="font-medium">{log.oldStatus}</span> → <span className="font-medium">{log.newStatus}</span>
                          </p>
                        )}
                        <p className="text-xs">Qty: {log.quantity} • Serials: {log.serialNumbers.length}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-gray-400" />
                        {log.performedBy}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => setViewLog(log)}
                        className="p-2 text-[#4f46e5] hover:bg-[#4f46e5]/10 rounded-lg transition-colors"
                        title="View Details"
                      >
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
<button onClick={() => setViewLog(null)} className="text-gray-500 hover:text-gray-700">\n                <XCircle size={24} />\n              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Timestamp</p>
                  <p className="font-medium text-gray-900">{new Date(viewLog.timestamp).toLocaleString('en-PK')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Action</p>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full ${getActionColor(viewLog.action)}`}>
                    {getActionIcon(viewLog.action)}
                    {viewLog.action}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Product</p>
                  <p className="font-medium text-gray-900">{viewLog.productName}</p>
                  <p className="text-sm text-gray-500">{viewLog.brandName} {viewLog.modelName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Quantity</p>
                  <p className="font-medium text-gray-900">{viewLog.quantity}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Performed By</p>
                  <p className="font-medium text-gray-900">{viewLog.performedBy}</p>
                </div>
                {viewLog.relatedInvoiceId && (
                  <div>
                    <p className="text-sm text-gray-600">Related Invoice</p>
                    <p className="font-medium text-gray-900">{viewLog.relatedInvoiceId}</p>
                  </div>
                )}
              </div>

              {/* Serial Numbers */}
              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 mb-2">Serial Numbers ({viewLog.serialNumbers.length})</p>
                <div className="flex flex-wrap gap-2">
                  {viewLog.serialNumbers.map((serial, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                      <Package size={10} />
                      {serial}
                    </span>
                  ))}
                </div>
              </div>

              {/* Location Changes */}
              {(viewLog.fromLocation || viewLog.toLocation) && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-2">Location Changes</p>
                  <div className="flex items-center gap-2">
                    {viewLog.fromLocation && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                        From: {viewLog.fromLocation}
                      </span>
                    )}
                    {viewLog.toLocation && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                        To: {viewLog.toLocation}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Status Changes */}
              {(viewLog.oldStatus || viewLog.newStatus) && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-2">Status Changes</p>
                  <div className="flex items-center gap-2">
                    {viewLog.oldStatus && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                        Old: {viewLog.oldStatus}
                      </span>
                    )}
                    {viewLog.newStatus && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                        New: {viewLog.newStatus}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
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
