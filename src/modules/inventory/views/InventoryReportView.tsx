// Inventory Module - View Layer
// InventoryReportView - per-serial inventory report
// Styled to match InventoryListView's table exactly; columns match the sheet:
// Stock-in Date (Auto), Stock-in Date (Manual), Type, Brand, Model, Serial No.,
// Location, Ownership, Condition, Current Status, Sold Date, Invoice #,
// Supplier/Purchasing Cost, Sold Goods Payment.

import React from 'react';
import { toast } from 'sonner';
import { ArrowLeft, FileBarChart, Search, Loader2, Filter, X, Tag, Layers, MapPin, Package, Activity, Shield, Trash2, AlertTriangle, FileDown } from 'lucide-react';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import { exportTableToExcel } from '../../../shared/excelExport/exportTableToExcel';
import { useInventoryReportViewModel } from '../viewModels/useInventoryReportViewModel';
import { MultiSelectFilter } from './InventoryListView';
import { useAuth } from '../../../providers/context/AuthContext';

type VM = ReturnType<typeof useInventoryReportViewModel>;

const HEADERS = [
  'Stock-In Date (Auto)', 'Stock-In Date (Manual)', 'Type', 'Brand', 'Model',
  'Serial No.', 'Location', 'Ownership', 'Condition', 'Current Status',
  'Sold Date', 'Invoice #', 'Supplier Cost', 'Purchasing Cost', 'Sold Goods Payment',
];

// Supplier credit payment status, relabeled for display: Cleared→Clear, Unpaid→Pending
const PAYMENT_DISPLAY: Record<string, string> = { Cleared: 'Clear', Partial: 'Partial', Unpaid: 'Pending' };
const PAYMENT_COLOR: Record<string, string> = {
  Clear: 'bg-green-100 text-green-700', Partial: 'bg-amber-100 text-amber-800', Pending: 'bg-red-100 text-red-700',
};

const conditionColor = (c: string) => {
  const map: Record<string, string> = {
    New: 'bg-blue-100 text-blue-700', Used: 'bg-slate-100 text-slate-700',
    Damaged: 'bg-red-100 text-red-700', Returned: 'bg-amber-100 text-amber-800',
  };
  return map[c] || 'bg-gray-100 text-gray-700';
};

export const InventoryReportView: React.FC<VM & { embedded?: boolean; hideFilterToggle?: boolean }> = (props) => {
  const {
    filteredRows, isLoading, error, search, setSearch,
    showFilters, toggleFilters, clearFilters, activeFilterCount,
    hideFilterToggle,
    statusFilter, setStatusFilter, ownershipFilter, setOwnershipFilter,
    typeFilter, setTypeFilter, typeOptions,
    locationFilter, setLocationFilter, locationOptions,
    conditionFilter, setConditionFilter, conditionOptions,
    brandFilter, setBrandFilter, brandOptions,
    modelFilter, setModelFilter, modelOptions,
    dateFrom, setDateFrom, dateTo, setDateTo,
    formatCurrency, formatDate, onBack, embedded,
    // selection + bulk delete (added in the ViewModel)
    isRowSelected, toggleRow, toggleAllVisible, clearSelection,
    allVisibleSelected, isBulkDeleting, bulkDeleteSelected, selectedRowIds,
  } = props;

  const { user } = useAuth();
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  // Static option lists (mirror the `<select>` markup we replaced)
  const STATUS_OPTIONS = React.useMemo(() => ['In Stock', 'Sold'], []);
  const OWNERSHIP_OPTIONS = React.useMemo(() => ['Owned', 'Credit'], []);

  // Count of distinct products (not rows) that would be deleted
  const distinctSelectedProductCount = React.useMemo(() => {
    const s = new Set<string>();
    filteredRows.forEach(r => { if (isRowSelected(r)) s.add(r.productId); });
    return s.size;
  }, [filteredRows, isRowSelected]);

  const selectedRowCount = selectedRowIds.size;

  const handleConfirmBulkDelete = async () => {
    const deletedBy = user
      ? { uid: user.uid, email: user.email || '', displayName: user.displayName || undefined }
      : { uid: 'unknown', email: 'unknown@system', displayName: 'Unknown User' };
    try {
      const { deletedCount, failed } = await bulkDeleteSelected(deletedBy);
      setConfirmBulkDelete(false);
      if (failed.length === 0) {
        toast.success(`Deleted ${deletedCount} product${deletedCount === 1 ? '' : 's'} — moved to Deleted Inventory`);
      } else {
        toast.error(`Deleted ${deletedCount}, but ${failed.length} failed. Check console for details.`);
      }
    } catch (e) {
      console.error(e);
      toast.error('Bulk delete failed. Please try again.');
    }
  };

  return (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: embedded ? 'transparent' : '#f8fafc' }}>
    {!embedded && (
    <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          <ArrowLeft size={17} />
        </button>
        <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileBarChart size={17} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Inventory Report</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Full per-serial breakdown of every inventory item</div>
        </div>
      </div>
    </div>
    )}

    <div className="p-6">
      {/* ── Search + Filters toggle (matches View Inventory) ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search brand, model, serial, location, invoice…"
            style={{
              width: '100%', padding: '10px 14px 10px 38px', borderRadius: 10, fontSize: 14,
              border: `1.5px solid ${search ? '#1e293b' : '#e2e8f0'}`,
              backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} title="Clear search"
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: 6, border: 'none', cursor: 'pointer',
                backgroundColor: '#f1f5f9', color: '#64748b',
              }}>
              <X size={12} />
            </button>
          )}
        </div>
        <button
          onClick={() => {
            const rows = filteredRows.map(r => {
              const paymentLabel = r.supplierPaymentStatus ? (PAYMENT_DISPLAY[r.supplierPaymentStatus] || r.supplierPaymentStatus) : '—';
              return [
                formatDate(r.stockInDateAuto), r.stockInDateManual ? formatDate(r.stockInDateManual) : '—',
                r.type || '—', r.brandName, r.modelName, r.serialNumber || '—', r.location || '—',
                r.ownershipType || '—', r.condition, r.currentStatus, formatDate(r.soldDate),
                r.invoiceNumber || '—', formatCurrency(r.supplierCost), formatCurrency(r.purchasingCost), paymentLabel,
              ];
            });
            exportTableToExcel({
              title: 'Inventory Report',
              subtitle: `${filteredRows.length} records`,
              columns: HEADERS.map(h => ({ header: h })),
              rows,
              filename: `inventory-report-${new Date().toISOString().slice(0, 10)}`,
            });
          }}
          disabled={filteredRows.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: '1px solid #e2e8f0',
            borderRadius: 10, backgroundColor: '#fff', color: '#334155', fontSize: 14, fontWeight: 600,
            cursor: filteredRows.length === 0 ? 'not-allowed' : 'pointer', opacity: filteredRows.length === 0 ? 0.5 : 1,
            whiteSpace: 'nowrap' }}>
          <FileDown size={14} /> Excel
        </button>
        {!hideFilterToggle && (
          <button
            onClick={toggleFilters}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 14,
              cursor: 'pointer', border: 'none',
              backgroundColor: showFilters ? '#0f172a' : '#f1f5f9',
              color: showFilters ? '#fff' : '#374151',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <Filter size={16} />
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
        )}
      </div>

      {showFilters && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <MultiSelectFilter
              label="Brand"
              pluralLabel="Brands"
              icon={Tag}
              options={brandOptions}
              selected={brandFilter}
              onChange={setBrandFilter}
              allLabel="All Brands"
            />
            <MultiSelectFilter
              label="Model"
              pluralLabel="Models"
              icon={Layers}
              options={modelOptions}
              selected={modelFilter}
              onChange={setModelFilter}
              allLabel="All Models"
            />
            <MultiSelectFilter
              label="Type"
              pluralLabel="Types"
              icon={Package}
              options={typeOptions}
              selected={typeFilter}
              onChange={setTypeFilter}
              allLabel="All Types"
            />
            <MultiSelectFilter
              label="Location"
              pluralLabel="Locations"
              icon={MapPin}
              options={locationOptions}
              selected={locationFilter}
              onChange={setLocationFilter}
              allLabel="All Locations"
            />
            <MultiSelectFilter
              label="Condition"
              pluralLabel="Conditions"
              icon={Tag}
              options={conditionOptions}
              selected={conditionFilter}
              onChange={setConditionFilter}
              allLabel="All Conditions"
            />
            <MultiSelectFilter
              label="Current Status"
              pluralLabel="Statuses"
              icon={Activity}
              options={STATUS_OPTIONS}
              selected={statusFilter}
              onChange={setStatusFilter}
              allLabel="All Statuses"
            />
            <MultiSelectFilter
              label="Ownership"
              pluralLabel="Ownerships"
              icon={Shield}
              options={OWNERSHIP_OPTIONS}
              selected={ownershipFilter}
              onChange={setOwnershipFilter}
              allLabel="All Ownership"
            />
            <div className="flex items-end">
              <button onClick={clearFilters}
                className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm">
                Clear Filters
              </button>
            </div>
            <div className="md:col-span-3 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock-In Date Range</label>
              <div className="flex items-center gap-2">
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk actions bar (shows only when rows are selected) ── */}
      {selectedRowCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', marginBottom: 12, borderRadius: 10,
          backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#1e3a8a' }}>
            <span style={{ fontWeight: 700 }}>{selectedRowCount} row{selectedRowCount === 1 ? '' : 's'} selected</span>
            {distinctSelectedProductCount !== selectedRowCount && (
              <span style={{ fontSize: 12, color: '#475569' }}>
                ({distinctSelectedProductCount} product{distinctSelectedProductCount === 1 ? '' : 's'} will be deleted)
              </span>
            )}
            <button onClick={clearSelection}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #cbd5e1',
                borderRadius: 6, backgroundColor: '#fff', fontSize: 12, cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
              <X size={12} /> Clear
            </button>
          </div>
          <button onClick={() => setConfirmBulkDelete(true)} disabled={isBulkDeleting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none',
              borderRadius: 8, backgroundColor: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: isBulkDeleting ? 'not-allowed' : 'pointer', opacity: isBulkDeleting ? 0.6 : 1,
              boxShadow: '0 2px 6px rgba(220,38,38,0.25)' }}>
            <Trash2 size={14} /> {isBulkDeleting ? 'Deleting…' : 'Delete Selected'}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading report…
        </div>
      ) : error ? (
        <div className="text-red-600 text-sm">{error}</div>
      ) : filteredRows.length === 0 ? (
        <div className="text-gray-400 text-sm">No inventory records match your filters.</div>
      ) : (
        <LockedScrollTable maxHeight="70vh" className="bg-white rounded-xl shadow-sm border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th className="px-4 py-2.5 bg-gray-50" style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    title="Select all visible rows"
                    style={{ width: 15, height: 15, cursor: 'pointer' }}
                  />
                </th>
                {HEADERS.map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap bg-gray-50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((r, i) => {
                const paymentLabel = r.supplierPaymentStatus ? (PAYMENT_DISPLAY[r.supplierPaymentStatus] || r.supplierPaymentStatus) : null;
                const selected = isRowSelected(r);
                return (
                  <tr
                    key={`${r.productId}-${r.serialNumber}-${i}`}
                    style={{ backgroundColor: selected ? '#eff6ff' : (i % 2 === 1 ? '#fafafa' : '#fff') }}
                  >
                    <td className="px-4 py-2.5" style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleRow(r)}
                        style={{ width: 15, height: 15, cursor: 'pointer' }}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">{formatDate(r.stockInDateAuto)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">{r.stockInDateManual ? formatDate(r.stockInDateManual) : '—'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{r.type || '—'}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-900 text-sm">{r.brandName}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-700">{r.modelName}</td>
                    <td className="px-4 py-2.5 text-sm font-mono text-gray-700">{r.serialNumber || '—'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{r.location || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${r.ownershipType === 'Credit' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                        {r.ownershipType || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${conditionColor(r.condition)}`}>{r.condition}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${r.currentStatus === 'Sold' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>
                        {r.currentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap">{formatDate(r.soldDate)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{r.invoiceNumber || '—'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{formatCurrency(r.supplierCost)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{formatCurrency(r.purchasingCost)}</td>
                    <td className="px-4 py-2.5">
                      {paymentLabel ? (
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${PAYMENT_COLOR[paymentLabel] || 'bg-gray-100 text-gray-700'}`}>{paymentLabel}</span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </LockedScrollTable>
      )}
    </div>

    {/* ── Bulk delete confirmation modal ── */}
    {confirmBulkDelete && (
      <div style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
      }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 14, width: 420, maxWidth: '100%', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={22} color="#dc2626" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Delete selected items?</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>They'll be moved to Deleted Inventory.</div>
            </div>
          </div>
          <div style={{ padding: '16px 20px', fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
            You've selected <b>{selectedRowCount}</b> row{selectedRowCount === 1 ? '' : 's'}
            {distinctSelectedProductCount !== selectedRowCount && (
              <> from <b>{distinctSelectedProductCount}</b> distinct product{distinctSelectedProductCount === 1 ? '' : 's'}</>
            )}.
            {distinctSelectedProductCount !== selectedRowCount && (
              <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#78350f' }}>
                Note: this deletes at the product level — all serials belonging to those products will be affected.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
            <button
              onClick={() => setConfirmBulkDelete(false)}
              disabled={isBulkDeleting}
              style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmBulkDelete}
              disabled={isBulkDeleting}
              style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                backgroundColor: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: isBulkDeleting ? 'not-allowed' : 'pointer', opacity: isBulkDeleting ? 0.6 : 1 }}
            >
              {isBulkDeleting ? 'Deleting…' : `Delete ${distinctSelectedProductCount}`}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
  );
};