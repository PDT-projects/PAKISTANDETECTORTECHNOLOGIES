// Inventory Module - View Layer
// InventoryDashboardView — unified dashboard
// • Compact action cards (no Report / View All — merged into table)
// • 4 stat cards
// • Always-visible multi-select filters
// • Full per-serial report table (Stock-In, Type, Brand, Model, Serial,
//   Location, Ownership, Condition, Status, Sold Date, Invoice #,
//   Supplier Cost, Purchasing Cost, Sold Goods Payment)
// • Checkboxes + sticky totals footer

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import { useColumnVisibility, ColumnVisibilityMenu } from '../../../shared/components/ColumnVisibility';
import { usePagination, PaginationBar } from '../../../shared/components/Pagination';
import { exportReportToPdf, exportReportToExcel } from '../../../shared/reportExport/reportExport';
import {
  Package, Plus, RotateCcw, ArrowLeftRight, Wallet, AlertTriangle,
  Trash2, Search, X, MapPin, Loader2, ChevronDown, Eye, Download,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useInventoryReportViewModel } from '../viewModels/useInventoryReportViewModel';
import { InventoryFirebaseService } from '../models/InventoryFirebaseService';
import { InvoiceLifecycleService } from '../../invoices/models/InvoiceLifecycleService';
import { generateInvoicePdf } from '../../invoices/models/invoicePdfService';
import { useAuth } from '../../../providers/context/AuthContext';
import { InventoryTypeSelectionView } from './InventoryTypeSelectionView';
import { InventoryReturnWrapper } from './InventoryReturnWrapper';
import { DamagedInventoryWrapper } from './DamagedInventoryWrapper';
import { DeletedInventoryWrapper } from './DeletedInventoryWrapper';
import { ProductTransferCreateWrapper } from './ProductTransferCreateWrapper';
import { useProductTransferViewModel } from '../viewModels/useProductTransferViewModel';
import { InventoryReportRow } from '../models/types';

// ── Props ─────────────────────────────────────────────────────────────────────
interface InventoryDashboardViewProps {
  onAddNewInventory: () => void;
  onAddToExisting: () => void;
  onAddReturnedInventory: () => void;
  onViewReceivable: () => void;
  onViewInventory: () => void;
  onViewReport: () => void;
  onProductTransfer: () => void;
  onViewDeleted: () => void;
  onViewPayables: () => void;
  onViewTransfer: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PAYMENT_DISPLAY: Record<string, string> = {
  Cleared: 'Clear', Partial: 'Partial', Unpaid: 'Pending',
};
const PAYMENT_COLOR: Record<string, { bg: string; color: string }> = {
  Clear:   { bg: '#dcfce7', color: '#15803d' },
  Partial: { bg: '#fef3c7', color: '#92400e' },
  Pending: { bg: '#fee2e2', color: '#b91c1c' },
};
const conditionStyle = (c: string): { bg: string; color: string } => ({
  New:      { bg: '#dbeafe', color: '#1d4ed8' },
  Used:     { bg: '#f1f5f9', color: '#334155' },
  Damaged:  { bg: '#fee2e2', color: '#b91c1c' },
  Returned: { bg: '#fef3c7', color: '#92400e' },
} as any)[c] || { bg: '#f3f4f6', color: '#6b7280' };

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, backgroundColor: bg, color }}>
      {label}
    </span>
  );
}

// ── Multi-select filter dropdown ──────────────────────────────────────────────
function MultiFilter({ label, selected, onChange, options }: {
  label: string; selected: string[]; onChange: (v: string[]) => void; options: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter(v => v !== opt) : [...selected, opt]);
  const has = selected.length > 0;

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 120, flex: 1, position: 'relative' }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</label>
      <button type="button" onClick={() => setOpen(p => !p)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7px 10px',
          border: `1.5px solid ${has ? '#334155' : '#e2e8f0'}`, borderRadius: 7, fontSize: 12,
          backgroundColor: has ? '#f1f5f9' : '#fff', color: has ? '#0f172a' : '#94a3b8',
          cursor: 'pointer', fontWeight: has ? 700 : 400, outline: 'none', textAlign: 'left' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {has ? (selected.length === 1 ? selected[0] : `${selected.length} selected`) : 'All'}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0, marginLeft: 4, color: '#94a3b8' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 999, backgroundColor: '#fff',
          border: '1px solid #e2e8f0', borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,0.13)', minWidth: 180, overflow: 'hidden' }}>
          <div style={{ padding: '7px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => onChange(options)} style={{ fontSize: 11, fontWeight: 700, color: '#334155', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>All</button>
            <span style={{ color: '#e2e8f0' }}>|</span>
            <button type="button" onClick={() => onChange([])} style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {options.length === 0
              ? <div style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8' }}>No options</div>
              : options.map(opt => {
                const checked = selected.includes(opt);
                return (
                  <div key={opt} onClick={() => toggle(opt)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', cursor: 'pointer',
                      fontSize: 12, backgroundColor: checked ? '#f1f5f9' : 'transparent',
                      color: checked ? '#0f172a' : '#374151', fontWeight: checked ? 600 : 400, userSelect: 'none' }}>
                    <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px solid ${checked ? '#0f172a' : '#d1d5db'}`, backgroundColor: checked ? '#0f172a' : '#fff', transition: 'all 0.12s' }}>
                      {checked && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </span>
                    {opt}
                  </div>
                );
              })}
          </div>
        </div>
      )}
      {has && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
          {selected.map(v => (
            <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700, backgroundColor: '#0f172a', color: '#fff' }}>
              {v}
              <span onClick={e => { e.stopPropagation(); toggle(v); }} style={{ cursor: 'pointer', display: 'flex' }}><X size={8} color="#fff" /></span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function InventoryDashboardView({
  onAddNewInventory,
  onAddReturnedInventory,
  onViewPayables,
  onViewTransfer,
  onViewDeleted,
}: InventoryDashboardViewProps) {
  const navigate = useNavigate();
  const vm = useInventoryReportViewModel();
  const { transfers } = useProductTransferViewModel();

  // ── Popup state ───────────────────────────────────────────────────────────
  type PopupType = 'add-new' | 'add-returned' | 'transfer' | 'damaged' | 'deleted' | null;
  const [activePopup, setActivePopup] = useState<PopupType>(null);
  const [prevPopup,   setPrevPopup]   = useState<PopupType>(null);

  const closePopup = () => {
    setPrevPopup(activePopup);
    setActivePopup(null);
  };

  // Refresh inventory list whenever a popup closes
  useEffect(() => {
    if (prevPopup !== null) {
      vm.refresh();
      setPrevPopup(null);
    }
  }, [prevPopup]);

  // ── Checkbox state ────────────────────────────────────────────────────────
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const rowKey = (r: InventoryReportRow) => `${r.productId}-${r.serialNumber}`;

  const allKeys = useMemo(() => vm.filteredRows.map(rowKey), [vm.filteredRows]);
  const allChecked = allKeys.length > 0 && allKeys.every(k => selectedKeys.has(k));
  const someChecked = allKeys.some(k => selectedKeys.has(k));

  const toggleAll = () => {
    if (allChecked) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(allKeys));
  };
  const toggleRow = (k: string) => {
    const next = new Set(selectedKeys);
    next.has(k) ? next.delete(k) : next.add(k);
    setSelectedKeys(next);
  };

  // ── Filter-driven visible rows ──────────────────────────────────────────
  // Explicitly depend on all VM filter states so React re-renders correctly
  // when any filter changes (all filters are string[] arrays — multi-select)
  const displayed = useMemo(() => vm.filteredRows, [
    vm.filteredRows,
    vm.statusFilter,
    vm.ownershipFilter,
    vm.brandFilter,
    vm.modelFilter,
    vm.typeFilter,
    vm.locationFilter,
    vm.conditionFilter,
    vm.search,
    vm.dateFrom,
    vm.dateTo,
  ]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalRows     = vm.rows.length;
  const totalInStock  = vm.rows.filter(r => r.currentStatus !== 'Sold').length;
  const ownedInStock  = vm.rows.filter(r => r.ownershipType !== 'Credit' && r.currentStatus !== 'Sold').length;
  const creditInStock = vm.rows.filter(r => r.ownershipType === 'Credit' && r.currentStatus !== 'Sold').length;
  const inTransit     = transfers.filter(t => t.status === 'In Transit' || t.status === 'Pending').length;

  // ── Totals for selected / all visible rows ────────────────────────────────
  const selectedRows = displayed.filter(r => selectedKeys.has(rowKey(r)));
  const totalsSource = selectedRows.length > 0 ? selectedRows : displayed;
  const totalSupplier   = totalsSource.reduce((s, r) => s + (r.supplierCost   || 0), 0);
  const totalPurchasing = totalsSource.reduce((s, r) => s + (r.purchasingCost || 0), 0);
  const totalPaid       = totalsSource.reduce((s, r) => s + (r.supplierPaidAmount || 0), 0);

  // Footer totals follow the Admin's global currency, same as the per-row
  // cells below (vm.formatCurrency) — this used to be a separate helper
  // hardcoded to the Arabic Dirham sign, which drifted from the rest of the
  // table the moment the admin picked any other currency.
  const fmtAED = (n: number) => n > 0 ? vm.formatCurrency(n) : '—';

  // ── Active filter count ───────────────────────────────────────────────────
  const activeFilters = vm.activeFilterCount;

  const clearAll = () => { vm.clearFilters(); };

  // ── Bulk delete on selected rows ──────────────────────────────────────────
  // Each selected row is one serial. We call deleteSerial() per row so
  // multiple serials from the same product are removed individually — the
  // parent product only disappears when its LAST serial is removed (that
  // fallback is baked into deleteSerial itself).
  const { user } = useAuth();
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [isBulkDeleting,    setIsBulkDeleting]    = useState(false);
  // ── Per-row delete ────
  const [confirmRowDelete, setConfirmRowDelete] = useState<InventoryReportRow | null>(null);
  const [isRowDeleting,    setIsRowDeleting]    = useState(false);

  // ── Invoice PDF preview ──
  // When the user clicks the eye icon in the Invoice # column, we look up
  // the invoice by number, render a PDF, and show it in an inline modal.
  // Kept in local component state (not the VM) because the preview is a
  // one-off action tied to a row and doesn't need to survive VM refreshes.
  const [invoicePreviewUrl,    setInvoicePreviewUrl]    = useState<string | null>(null);
  const [invoicePreviewLoading, setInvoicePreviewLoading] = useState(false);
  const [invoicePreviewNumber, setInvoicePreviewNumber] = useState<string>('');
  const [invoicePreviewInvoice, setInvoicePreviewInvoice] = useState<any>(null);

  // ── Inventory products for PDF image enrichment ──────────────────────────
  // FIX: the invoice-preview PDF opened from here (the eye icon in the
  // Invoice # column) was always missing the product photo, even though the
  // exact same generateInvoicePdf() renderer shows it fine from the Invoices
  // module. Root cause: InvoiceListView.tsx passes a live products list as
  // `{ enrichWithProducts }` so the PDF can look up a photo by productId when
  // the invoice's own saved line item has no imageUrls (e.g. older invoices,
  // or system-generated adjustment lines) — this call site never passed that
  // option, so the renderer had no fallback and silently drew no image.
  // Same fetch-once pattern as InvoiceListView.tsx, so both previews agree.
  const [pdfProducts, setPdfProducts] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    InventoryFirebaseService.fetchAllProducts()
      .then(list => { if (!cancelled) setPdfProducts(list as any[]); })
      .catch(err => console.warn('[InventoryDashboard] PDF product fetch failed:', err));
    return () => { cancelled = true; };
  }, []);

  const openInvoicePreview = useCallback(async (invoiceNumber: string) => {
    if (!invoiceNumber) return;
    setInvoicePreviewNumber(invoiceNumber);
    setInvoicePreviewLoading(true);
    try {
      const inv = await InvoiceLifecycleService.fetchInvoiceByNumber(invoiceNumber);
      if (!inv) {
        toast.error(`Invoice ${invoiceNumber} not found (may have been deleted)`);
        setInvoicePreviewNumber('');
        return;
      }
      setInvoicePreviewInvoice(inv);
      const blob = await generateInvoicePdf(inv as any, { enrichWithProducts: pdfProducts });
      const url  = URL.createObjectURL(blob);
      setInvoicePreviewUrl(url);
    } catch (err) {
      console.error('[InventoryDashboard] Invoice PDF preview failed:', err);
      toast.error('Failed to open invoice PDF');
      setInvoicePreviewNumber('');
    } finally {
      setInvoicePreviewLoading(false);
    }
  }, [pdfProducts]);

  const closeInvoicePreview = useCallback(() => {
    if (invoicePreviewUrl) URL.revokeObjectURL(invoicePreviewUrl);
    setInvoicePreviewUrl(null);
    setInvoicePreviewNumber('');
    setInvoicePreviewInvoice(null);
  }, [invoicePreviewUrl]);

  // Clean up the blob URL on unmount so it doesn't leak.
  useEffect(() => {
    return () => { if (invoicePreviewUrl) URL.revokeObjectURL(invoicePreviewUrl); };
  }, [invoicePreviewUrl]);

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return;
    setIsBulkDeleting(true);
    const deletedBy = user
      ? { uid: user.uid, email: user.email || '', displayName: user.displayName || undefined }
      : { uid: 'unknown', email: 'unknown@system', displayName: 'Unknown User' };
    const failed: Array<{ productId: string; serial: string }> = [];
    try {
      // Sequential — same-product deletes race if run in parallel because
      // they read + rewrite the parent product's serial arrays.
      for (const row of selectedRows) {
        try {
          await InventoryFirebaseService.deleteSerial(row.productId, row.serialNumber, deletedBy);
        } catch (e) {
          console.error(`Bulk delete failed for serial ${row.serialNumber} of ${row.productId}:`, e);
          failed.push({ productId: row.productId, serial: row.serialNumber });
        }
      }
      const succeeded = selectedRows.length - failed.length;
      if (failed.length === 0) {
        toast.success(`${succeeded} serial${succeeded === 1 ? '' : 's'} moved to Deleted Inventory`);
      } else {
        toast.error(`Deleted ${succeeded}, ${failed.length} failed — check console.`);
      }
      setSelectedKeys(new Set());
      setConfirmBulkDelete(false);
      vm.refresh(); // refetch rows so deleted items disappear
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleRowDelete = async () => {
    if (!confirmRowDelete) return;
    setIsRowDeleting(true);
    const deletedBy = user
      ? { uid: user.uid, email: user.email || '', displayName: user.displayName || undefined }
      : { uid: 'unknown', email: 'unknown@system', displayName: 'Unknown User' };
    try {
      await InventoryFirebaseService.deleteSerial(
        confirmRowDelete.productId,
        confirmRowDelete.serialNumber,
        deletedBy,
      );
      toast.success(
        `Serial ${confirmRowDelete.serialNumber || '(no serial)'} of ${confirmRowDelete.brandName} ${confirmRowDelete.modelName} moved to Deleted Inventory`,
      );
      // Drop this row from local selection if it was checked
      const key = rowKey(confirmRowDelete);
      if (selectedKeys.has(key)) {
        const next = new Set(selectedKeys);
        next.delete(key);
        setSelectedKeys(next);
      }
      setConfirmRowDelete(null);
      vm.refresh();
    } catch (e) {
      console.error(`Row delete failed for ${confirmRowDelete.productId}:`, e);
      toast.error('Failed to delete item. Please try again.');
    } finally {
      setIsRowDeleting(false);
    }
  };

  // ── Quick action cards ────────────────────────────────────────────────────
  const quickActions = [
    { label: 'Add New',      icon: Plus,           onClick: () => setActivePopup('add-new'),      iconColor: '#0f172a', iconBg: '#f1f5f9', border: '#cbd5e1', hoverBorder: '#334155', hoverBg: '#f1f5f9' },
    { label: 'Add Returned', icon: RotateCcw,      onClick: () => setActivePopup('add-returned'), iconColor: '#d97706', iconBg: '#fffbeb', border: '#fde68a', hoverBorder: '#f59e0b', hoverBg: '#fffbeb' },
    { label: 'Transfer',     icon: ArrowLeftRight, onClick: () => setActivePopup('transfer'),      iconColor: '#1d4ed8', iconBg: '#eff6ff', border: '#bfdbfe', hoverBorder: '#3b82f6', hoverBg: '#eff6ff' },
    { label: 'Damaged',      icon: AlertTriangle,  onClick: () => setActivePopup('damaged'),       iconColor: '#b91c1c', iconBg: '#fef2f2', border: '#fecaca', hoverBorder: '#ef4444', hoverBg: '#fef2f2' },
    { label: 'Deleted',      icon: Trash2,         onClick: () => setActivePopup('deleted'),       iconColor: '#64748b', iconBg: '#f8fafc', border: '#e2e8f0', hoverBorder: '#94a3b8', hoverBg: '#f1f5f9' },
  ];

  const HEADERS = [
    '', // checkbox
    'Stock-In Date (Auto)', 'Stock-In Date (Manual)',
    'Type', 'Brand', 'Model', 'Serial No.',
    'Location', 'Ownership', 'Condition', 'Status',
    'Sold Date', 'Invoice #', 'Supplier Cost', 'Purchasing Cost', 'Sold Goods Payment',
    'Actions',
  ];
  const cols = useColumnVisibility('inventory-dashboard', HEADERS.slice(1));
  const pg = usePagination(displayed, 'inventory-dashboard');
  const invDashLabelColsVisible = ['Stock-In Date (Auto)', 'Stock-In Date (Manual)', 'Type', 'Brand', 'Model',
    'Serial No.', 'Location', 'Ownership', 'Condition', 'Status', 'Sold Date', 'Invoice #']
    .filter(c => cols.isVisible(c)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc', overflowY: 'auto' }}>
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Page title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Package size={20} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Inventory</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Per-serial inventory with sales, costs and payment tracking</div>
          </div>
          <button
            onClick={() => {
              const rows = displayed.map((r: any) => [
                vm.formatDate(r.stockInDateAuto), r.stockInDateManual ? vm.formatDate(r.stockInDateManual) : '—',
                r.type || '—', r.brandName, r.modelName, r.serialNumber || '—', r.location || '—',
                r.ownershipType || '—', r.condition, r.currentStatus,
                r.currentStatus === 'Sold' ? vm.formatDate(r.soldDate) : '—', r.invoiceNumber || '—',
                vm.formatCurrency(r.supplierCost), vm.formatCurrency(r.purchasingCost),
                r.supplierPaymentStatus || '—',
              ]);
              exportReportToExcel({
                title: 'Inventory',
                subtitle: `${displayed.length} records`,
                columns: HEADERS.slice(1, -1).map(h => ({ header: h })),
                rows,
                filename: `inventory-${new Date().toISOString().slice(0, 10)}`,
              });
            }}
            disabled={displayed.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e2e8f0',
              borderRadius: 9, backgroundColor: '#fff', color: '#334155', fontSize: 13, fontWeight: 600,
              cursor: displayed.length === 0 ? 'not-allowed' : 'pointer', opacity: displayed.length === 0 ? 0.5 : 1,
              whiteSpace: 'nowrap' }}>
            <Download size={14} /> Excel
          </button>
          <ColumnVisibilityMenu controller={cols} />
          <button
            onClick={() => {
              const rows = displayed.map((r: any) => [
                vm.formatDate(r.stockInDateAuto), r.stockInDateManual ? vm.formatDate(r.stockInDateManual) : '—',
                r.type || '—', r.brandName, r.modelName, r.serialNumber || '—', r.location || '—',
                r.ownershipType || '—', r.condition, r.currentStatus,
                r.currentStatus === 'Sold' ? vm.formatDate(r.soldDate) : '—', r.invoiceNumber || '—',
                vm.formatCurrency(r.supplierCost), vm.formatCurrency(r.purchasingCost),
                r.supplierPaymentStatus || '—',
              ]);
              exportReportToPdf({
                title: 'Inventory',
                subtitle: `${displayed.length} records`,
                columns: HEADERS.slice(1, -1).map(h => ({ header: h })),
                rows,
                filename: `inventory-${new Date().toISOString().slice(0, 10)}`,
              });
            }}
            disabled={displayed.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e2e8f0',
              borderRadius: 9, backgroundColor: '#fff', color: '#334155', fontSize: 13, fontWeight: 600,
              cursor: displayed.length === 0 ? 'not-allowed' : 'pointer', opacity: displayed.length === 0 ? 0.5 : 1,
              whiteSpace: 'nowrap' }}>
            <Download size={14} /> PDF
          </button>
        </div>

        {/* Quick action cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))', gap: 8 }}>
          {quickActions.map(card => {
            const Icon = card.icon;
            return (
              <button key={card.label} onClick={card.onClick}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px',
                  border: `1.5px solid ${card.border}`, borderRadius: 11, backgroundColor: '#fff',
                  cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.17s' }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = card.hoverBorder; el.style.backgroundColor = card.hoverBg; el.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = card.border; el.style.backgroundColor = '#fff'; el.style.transform = 'translateY(0)'; }}
              >
                <div style={{ padding: 7, borderRadius: 8, backgroundColor: card.iconBg, flexShrink: 0 }}>
                  <Icon size={14} color={card.iconColor} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{card.label}</span>
              </button>
            );
          })}
        </div>

        {/* Always-visible filter bar */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Filters</span>
            {activeFilters > 0 && (
              <button onClick={clearAll}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7, border: '1px solid #fecaca', backgroundColor: '#fef2f2', fontSize: 11, fontWeight: 700, color: '#b91c1c', cursor: 'pointer' }}>
                <X size={11} /> Clear ({activeFilters})
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: 2, minWidth: 200 }}>
              <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="text" value={vm.search} onChange={e => vm.setSearch(e.target.value)}
                placeholder="Search brand, model, serial, invoice…"
                style={{ width: '100%', paddingLeft: 28, paddingRight: vm.search ? 28 : 10, paddingTop: 7, paddingBottom: 7,
                  border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', color: '#0f172a', backgroundColor: '#f8fafc', boxSizing: 'border-box' }} />
              {vm.search && (
                <button onClick={() => vm.setSearch('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', display: 'flex' }}>
                  <X size={12} color="#94a3b8" />
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <MultiFilter label="Brand"     selected={vm.brandFilter}  onChange={v => { vm.setBrandFilter(v); vm.setModelFilter([]); }} options={vm.brandOptions} />
            <MultiFilter label="Model"     selected={vm.modelFilter}  onChange={vm.setModelFilter}  options={vm.modelOptions} />
            <MultiFilter label="Type"      selected={vm.typeFilter}      onChange={vm.setTypeFilter}      options={vm.typeOptions} />
            <MultiFilter label="Location"  selected={vm.locationFilter}  onChange={vm.setLocationFilter}  options={vm.locationOptions} />
            <MultiFilter label="Condition" selected={vm.conditionFilter} onChange={vm.setConditionFilter} options={['New', 'Used']} />
            <MultiFilter label="Status"    selected={vm.statusFilter}    onChange={vm.setStatusFilter}    options={['In Stock', 'Sold']} />
            <MultiFilter label="Ownership" selected={vm.ownershipFilter} onChange={vm.setOwnershipFilter} options={['Owned', 'Credit']} />

            {/* Date range */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 130 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>From Date</label>
              <input type="date" value={vm.dateFrom} onChange={e => vm.setDateFrom(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', color: '#0f172a', backgroundColor: '#fff' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 130 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>To Date</label>
              <input type="date" value={vm.dateTo} onChange={e => vm.setDateTo(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, outline: 'none', color: '#0f172a', backgroundColor: '#fff' }} />
            </div>
          </div>
        </div>

        {/* Inventory table */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              Inventory
              {!vm.isLoading && (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: '#64748b' }}>
                  {selectedRows.length > 0
                    ? `${selectedRows.length} selected of ${displayed.length}`
                    : `${displayed.length} item${displayed.length !== 1 ? 's' : ''}`}
                </span>
              )}
            </span>
            {selectedRows.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setSelectedKeys(new Set())}
                  style={{ fontSize: 11, color: '#64748b', border: 'none', background: 'none', cursor: 'pointer' }}>
                  Clear selection
                </button>
                <button
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={isBulkDeleting}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 12, fontWeight: 700, padding: '5px 11px',
                    border: 'none', borderRadius: 6,
                    backgroundColor: '#dc2626', color: '#fff',
                    cursor: isBulkDeleting ? 'not-allowed' : 'pointer',
                    opacity: isBulkDeleting ? 0.6 : 1,
                    boxShadow: '0 1px 3px rgba(220,38,38,0.35)',
                  }}
                >
                  <Trash2 size={12} /> Delete ({selectedRows.length})
                </button>
              </div>
            )}
          </div>

          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            {vm.isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '28px 20px', color: '#64748b', fontSize: 13 }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading inventory…
              </div>
            ) : displayed.length === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No inventory items match your filters.
              </div>
            ) : (
              <LockedScrollTable maxHeight="68vh">
                {/* borderSpacing 0 with separate borders — sticky headers are
                    unreliable under border-collapse. */}
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                  <thead>
                    <tr>
                      {/* Checkbox all */}
                      <th style={{ padding: '9px 12px', width: 36, textAlign: 'center', backgroundColor: '#0f172a', position: 'sticky', top: 0, zIndex: 10 }}>
                        <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
                          onChange={toggleAll}
                          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#fff' }} />
                      </th>
                      {HEADERS.slice(1).filter(h => cols.isVisible(h)).map(h => (
                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap', backgroundColor: '#0f172a', position: 'sticky', top: 0, zIndex: 10 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pg.pageRows.map((r, idx) => {
                      const key = rowKey(r);
                      const checked = selectedKeys.has(key);
                      const payLabel = r.supplierPaymentStatus ? (PAYMENT_DISPLAY[r.supplierPaymentStatus] || r.supplierPaymentStatus) : null;
                      const condS = conditionStyle(r.condition);
                      return (
                        <tr key={key}
                          style={{ boxShadow: idx < pg.pageRows.length - 1 ? 'inset 0 -1px 0 #f1f5f9' : 'none', backgroundColor: checked ? '#f0f9ff' : idx % 2 === 1 ? '#fafafa' : '#fff', transition: 'background 0.1s' }}
                          onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = checked ? '#f0f9ff' : idx % 2 === 1 ? '#fafafa' : '#fff'; }}
                        >
                          <td style={{ padding: '9px 12px', textAlign: 'center', verticalAlign: 'middle' }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleRow(key)}
                              style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#0f172a' }} />
                          </td>
                          {cols.isVisible('Stock-In Date (Auto)') && <td style={{ padding: '9px 12px', color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{vm.formatDate(r.stockInDateAuto)}</td>}
                          {cols.isVisible('Stock-In Date (Manual)') && <td
                            style={{
                              padding: '9px 12px',
                              whiteSpace: 'nowrap',
                              verticalAlign: 'middle',
                              // Manual date is user-set; auto date is system-set and can't be edited.
                              // When the user hasn't overridden the auto date, show a dim '—'.
                              color: r.stockInDateManual ? '#0f172a' : '#cbd5e1',
                              fontWeight: r.stockInDateManual ? 600 : 400,
                            }}
                            title={r.stockInDateManual ? 'Manual override — user-entered stock-in date' : 'No manual override — auto date is the source of truth'}
                          >
                            {r.stockInDateManual ? vm.formatDate(r.stockInDateManual) : '—'}
                          </td>}
                          {cols.isVisible('Type') && <td style={{ padding: '9px 12px', color: '#64748b', verticalAlign: 'middle' }}>{r.type || '—'}</td>}
                          {cols.isVisible('Brand') && <td style={{ padding: '9px 12px', fontWeight: 700, color: '#0f172a', verticalAlign: 'middle' }}>{r.brandName}</td>}
                          {cols.isVisible('Model') && <td style={{ padding: '9px 12px', color: '#334155', verticalAlign: 'middle' }}>{r.modelName}</td>}
                          {cols.isVisible('Serial No.') && <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 11, color: '#334155', verticalAlign: 'middle' }}>{r.serialNumber || '—'}</td>}
                          {cols.isVisible('Location') && <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                            {r.location ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#475569' }}>
                                <MapPin size={11} />{r.location}
                              </span>
                            ) : <span style={{ color: '#94a3b8' }}>—</span>}
                          </td>}
                          {cols.isVisible('Ownership') && <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                            <Badge
                              label={r.ownershipType || '—'}
                              bg={r.ownershipType === 'Credit' ? '#fef3c7' : '#f1f5f9'}
                              color={r.ownershipType === 'Credit' ? '#92400e' : '#334155'}
                            />
                          </td>}
                          {cols.isVisible('Condition') && <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                            <Badge label={r.condition} bg={condS.bg} color={condS.color} />
                          </td>}
                          {cols.isVisible('Status') && <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                            <Badge
                              label={r.currentStatus}
                              bg={r.currentStatus === 'Sold' ? '#e0e7ff' : '#dcfce7'}
                              color={r.currentStatus === 'Sold' ? '#4338ca' : '#15803d'}
                            />
                          </td>}
                          {cols.isVisible('Sold Date') && <td style={{ padding: '9px 12px', color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                            {r.currentStatus === 'Sold' ? vm.formatDate(r.soldDate) : '—'}
                          </td>}
                          {cols.isVisible('Invoice #') && <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                            {r.currentStatus === 'Sold' && r.invoiceNumber ? (
                              <button
                                onClick={() => openInvoicePreview(r.invoiceNumber!)}
                                title={`View invoice ${r.invoiceNumber} (PDF)`}
                                disabled={invoicePreviewLoading && invoicePreviewNumber === r.invoiceNumber}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 30, height: 26, borderRadius: 6, border: '1px solid #e2e8f0',
                                  backgroundColor: '#fff', cursor: 'pointer', color: '#4338ca',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eef2ff'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff';   e.currentTarget.style.borderColor = '#e2e8f0'; }}
                              >
                                {invoicePreviewLoading && invoicePreviewNumber === r.invoiceNumber
                                  ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                  : <Eye size={13} />}
                              </button>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                            )}
                          </td>}
                          {cols.isVisible('Supplier Cost') && <td style={{ padding: '9px 12px', color: '#334155', verticalAlign: 'middle' }}>{vm.formatCurrency(r.supplierCost)}</td>}
                          {cols.isVisible('Purchasing Cost') && <td style={{ padding: '9px 12px', color: '#334155', verticalAlign: 'middle' }}>{vm.formatCurrency(r.purchasingCost)}</td>}
                          {cols.isVisible('Sold Goods Payment') && <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                            {payLabel
                              ? <Badge label={payLabel} bg={PAYMENT_COLOR[payLabel]?.bg || '#f3f4f6'} color={PAYMENT_COLOR[payLabel]?.color || '#6b7280'} />
                              : <span style={{ color: '#94a3b8' }}>—</span>}
                          </td>}
                          {cols.isVisible('Actions') && <td style={{ padding: '9px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                            <button
                              onClick={e => { e.stopPropagation(); setConfirmRowDelete(r); }}
                              title={`Delete ${r.brandName} ${r.modelName}`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 28, height: 28, borderRadius: 6, border: '1px solid #fecaca',
                                backgroundColor: '#fff', color: '#dc2626', cursor: 'pointer',
                                transition: 'all 0.12s',
                              }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = '#dc2626';
                                (e.currentTarget as HTMLElement).style.color = '#fff';
                                (e.currentTarget as HTMLElement).style.borderColor = '#dc2626';
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = '#fff';
                                (e.currentTarget as HTMLElement).style.color = '#dc2626';
                                (e.currentTarget as HTMLElement).style.borderColor = '#fecaca';
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>}
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Sticky totals footer */}
                  <tfoot>
                    <tr style={{ backgroundColor: '#0f172a', position: 'sticky', bottom: 0 }}>
                      <td colSpan={Math.max(1, invDashLabelColsVisible + 1)} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        {selectedRows.length > 0 ? `Totals — ${selectedRows.length} selected rows` : `Totals — all ${displayed.length} rows`}
                      </td>
                      {cols.isVisible('Supplier Cost') && <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>{fmtAED(totalSupplier)}</td>}
                      {cols.isVisible('Purchasing Cost') && <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>{fmtAED(totalPurchasing)}</td>}
                      {cols.isVisible('Sold Goods Payment') && <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#4ade80', whiteSpace: 'nowrap' }}>{fmtAED(totalPaid)}</td>}
                      {cols.isVisible('Actions') && <td />}
                    </tr>
                  </tfoot>
                </table>
              </LockedScrollTable>
            )}
          </div>
        </div>

      </div>

      {/* ── Action Popups ── */}
      {activePopup && createPortal(
        <div onClick={closePopup}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '90vw', maxWidth: 860, height: '88vh', backgroundColor: '#f8fafc', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <button onClick={closePopup}
              style={{ position: 'absolute', top: 12, right: 14, zIndex: 10, width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#64748b' }}>×</button>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {activePopup === 'add-new'      && <InventoryTypeSelectionView handleBack={closePopup} onClose={() => { closePopup(); setTimeout(() => vm.refresh(), 300); }} />}
              {activePopup === 'add-returned' && <InventoryReturnWrapper />}
              {activePopup === 'transfer'     && <ProductTransferCreateWrapper />}
              {activePopup === 'damaged'      && <DamagedInventoryWrapper />}
              {activePopup === 'deleted'      && <DeletedInventoryWrapper />}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Bulk Delete Confirmation Modal ── */}
      {confirmBulkDelete && createPortal(
        <div
          onClick={() => !isBulkDeleting && setConfirmBulkDelete(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: '#fff', borderRadius: 14, width: 420, maxWidth: '100%', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fef2f2' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={22} color="#dc2626" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#991b1b' }}>Delete selected items?</div>
                <div style={{ fontSize: 12, color: '#b91c1c' }}>Items move to Deleted Inventory — recoverable.</div>
              </div>
            </div>
            <div style={{ padding: '16px 20px', fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
              You've selected <b>{selectedRows.length}</b> serial{selectedRows.length === 1 ? '' : 's'} to delete.
              Each will be individually removed from stock — sibling serials of the same product are not affected.
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
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                  backgroundColor: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: isBulkDeleting ? 'not-allowed' : 'pointer', opacity: isBulkDeleting ? 0.6 : 1,
                }}
              >
                {isBulkDeleting ? 'Deleting…' : `Delete ${selectedRows.length}`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Single-Row Delete Confirmation Modal ── */}
      {confirmRowDelete && createPortal(
        <div
          onClick={() => !isRowDeleting && setConfirmRowDelete(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: '#fff', borderRadius: 14, width: 420, maxWidth: '100%', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#fef2f2' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={22} color="#dc2626" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#991b1b' }}>Delete this item?</div>
                <div style={{ fontSize: 12, color: '#b91c1c' }}>Moves to Deleted Inventory — recoverable.</div>
              </div>
            </div>
            <div style={{ padding: '16px 20px', fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
              <div style={{ padding: '12px 14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                  {confirmRowDelete.brandName} — {confirmRowDelete.modelName}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <span>Serial: <b style={{ fontFamily: 'monospace', color: '#0f172a' }}>{confirmRowDelete.serialNumber || '—'}</b></span>
                  <span>Location: <b style={{ color: '#0f172a' }}>{confirmRowDelete.location || '—'}</b></span>
                </div>
              </div>
              <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1e3a8a' }}>
                Only this serial is removed from stock — sibling serials of the same product stay untouched.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>
              <button
                onClick={() => setConfirmRowDelete(null)}
                disabled={isRowDeleting}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleRowDelete}
                disabled={isRowDeleting}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                  backgroundColor: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: isRowDeleting ? 'not-allowed' : 'pointer', opacity: isRowDeleting ? 0.6 : 1,
                }}
              >
                {isRowDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Invoice PDF preview modal ──
          Rendered via portal so it overlays every other popup. Uses an iframe
          on the blob URL for the PDF — the browser's built-in viewer handles
          scrolling / zoom / print out of the box, and we get a Download link
          for a quick save. Backdrop click closes; blob URL is revoked in the
          effect above so nothing leaks. */}
      {(invoicePreviewUrl || invoicePreviewLoading) && createPortal(
        <div
          onClick={closeInvoicePreview}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.7)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '90vw', maxWidth: 900, height: '92vh',
              backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.55)',
            }}
          >
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ width: 30, height: 30, borderRadius: 7, backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Eye size={14} color="#4338ca" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Invoice preview</div>
                  <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                    {invoicePreviewNumber}
                    {invoicePreviewInvoice?.customerName ? ` · ${invoicePreviewInvoice.customerName}` : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {invoicePreviewUrl && (
                  <a
                    href={invoicePreviewUrl}
                    download={`${invoicePreviewNumber || 'invoice'}.pdf`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', fontSize: 12, fontWeight: 700,
                      color: '#0f172a', backgroundColor: '#f1f5f9', borderRadius: 7,
                      textDecoration: 'none',
                    }}
                    title="Download PDF"
                  >
                    <Download size={12} /> Download
                  </a>
                )}
                <button
                  onClick={closeInvoicePreview}
                  style={{
                    width: 30, height: 30, borderRadius: 7,
                    border: '1px solid #e2e8f0', backgroundColor: '#fff',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b',
                  }}
                  title="Close preview"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, backgroundColor: '#f8fafc' }}>
              {invoicePreviewLoading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', gap: 10 }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: 13 }}>Generating PDF…</span>
                </div>
              ) : invoicePreviewUrl ? (
                <iframe
                  src={invoicePreviewUrl}
                  title={`Invoice ${invoicePreviewNumber}`}
                  style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#fff' }}
                />
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}