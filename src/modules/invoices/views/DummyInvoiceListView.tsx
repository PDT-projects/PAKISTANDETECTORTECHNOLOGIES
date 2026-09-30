// Dummy Invoice Module - List View
// Shows all dummy/proforma/booking/quotation invoices

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, FileText, Loader2, Download, FileSpreadsheet, Pencil, Trash2, Files, Wallet, Clock3 } from 'lucide-react';
import { downloadInvoicePdf, generateInvoicePdf } from '../models/invoicePdfService';
import { downloadDummyInvoiceExcel } from '../models/dummyInvoiceExcel';
import { DummyInvoiceFirebaseService, DummyInvoice, DummyInvoiceType } from '../models/DummyInvoiceFirebaseService';
import { toast } from 'sonner';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

const TYPE_COLORS: Record<DummyInvoiceType, { bg: string; color: string }> = {
  Dummy:     { bg: '#f1f5f9', color: '#334155' },
  Proforma:  { bg: '#dbeafe', color: '#1d4ed8' },
  Booking:   { bg: '#dcfce7', color: '#15803d' },
  Quotation: { bg: '#ede9fe', color: '#7c3aed' },
};

// The stored/filtered value is still 'Dummy' (unchanged, so existing saved
// invoices and the type filter keep working) — only the text shown for it
// is now "Fictitious", matching the rename everywhere else in the module.
const typeDisplayLabel = (t: DummyInvoiceType | 'All'): string => (t === 'Dummy' ? 'Fictitious' : t);

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  Draft:     { bg: '#f1f5f9', color: '#475569' },
  Sent:      { bg: '#dbeafe', color: '#1d4ed8' },
  Accepted:  { bg: '#dcfce7', color: '#15803d' },
  Rejected:  { bg: '#fee2e2', color: '#b91c1c' },
  Expired:   { bg: '#fef3c7', color: '#92400e' },
  Converted: { bg: '#e0e7ff', color: '#4338ca' },
};

export function DummyInvoiceListView() {
  const navigate = useNavigate();
  // Follows the Admin's global currency setting — symbol-only, no conversion.
  const { symbol: currencySymbol } = useGlobalCurrency();
  const [invoices, setInvoices]   = useState<DummyInvoice[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [typeFilter, setTypeFilter] = useState<DummyInvoiceType | 'All'>('All');

  const [pdfUrl,     setPdfUrl]     = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const openPdfPreview = async (inv: DummyInvoice) => {
    setPdfLoading(true);
    setPdfUrl(null);
    try {
      const invoiceForPdf: any = {
        id: inv.id, invoiceNumber: inv.invoiceNumber, date: inv.date,
        status: 'Draft', deliveryStatus: 'Self-collect',
        customerName: inv.customerName || '', customerPhone: inv.customerPhone || '',
        customerPhone2: inv.customerPhone2, customerCNIC: inv.customerCNIC || '',
        customerCity: inv.customerCity || '', customerProvince: inv.customerProvince || '',
        customerAddress: inv.customerAddress, salesperson: inv.salesperson,
        totalAmount: inv.totalAmount || 0,
        paidAmount: 0, remainingAmount: inv.totalAmount || 0, paymentStatus: 'Unpaid',
        payments: [],
        products: inv.products.map((p, i) => ({
          id: p.id || String(i), productId: '', productName: p.productName,
          brandName: '', modelName: p.productName, category: '',
          description: p.description || '', quantity: p.quantity,
          price: p.unitPrice, total: p.total, serialNumbers: [], currency: 'AED',
        })),
        exchangeWarrantyNote: inv.notes || '', selectedCurrencies: ['AED'],
        supplierCostTotal: 0, purchaseCostTotal: 0, miscExpense: 0,
        deductionCharges: 0, cargoAmount: 0, customsAmount: 0, agentAmount: 0,
        branch: '', digitalStamp: !!inv.digitalStamp, imageDataUrl: inv.imageDataUrl,
      };
      const blob = await generateInvoicePdf(invoiceForPdf);
      const url  = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err: any) {
      toast.error('Failed to generate PDF preview');
    } finally {
      setPdfLoading(false);
    }
  };

  const closePdf = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
  };

  const load = () => {
    setLoading(true);
    DummyInvoiceFirebaseService.fetchAll()
      .then(setInvoices)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const displayed = typeFilter === 'All' ? invoices : invoices.filter(i => i.invoiceType === typeFilter);

  const stats = useMemo(() => {
    const totalValue = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
    const draftCount  = invoices.filter(i => i.status === 'Draft').length;
    return { count: invoices.length, totalValue, draftCount };
  }, [invoices]);

  const exportExcel = () => {
    if (displayed.length === 0) { toast.error('Nothing to export'); return; }
    // Use the display label ("Fictitious", not the stored "Dummy") so the
    // downloaded filename matches what the user sees in the filter tabs.
    downloadDummyInvoiceExcel(displayed, typeDisplayLabel(typeFilter));
    toast.success(`Exported ${displayed.length} invoice(s) to Excel`);
  };




  // Map DummyInvoice → Invoice shape for PDF service
  const downloadPdf = async (inv: DummyInvoice) => {
    try {
      const invoiceForPdf: any = {
        id:            inv.id,
        invoiceNumber: inv.invoiceNumber,
        date:          inv.date,
        status:        'Draft',
        deliveryStatus: 'Self-collect',
        customerName:    inv.customerName   || '',
        customerPhone:   inv.customerPhone  || '',
        customerPhone2:  inv.customerPhone2,
        customerCNIC:    inv.customerCNIC   || '',
        customerCity:    inv.customerCity   || '',
        customerProvince:inv.customerProvince || '',
        customerAddress: inv.customerAddress,
        salesperson:     inv.salesperson,
        totalAmount:     inv.totalAmount || 0,
        paidAmount:      0,
        remainingAmount: inv.totalAmount || 0,
        paymentStatus:   'Unpaid',
        payments:        [],
        products: inv.products.map((p, i) => ({
          id:          p.id || String(i),
          productId:   '',
          productName: p.productName,
          brandName:   '',
          modelName:   p.productName,
          category:    '',
          description: p.description || '',
          quantity:    p.quantity,
          price:       p.unitPrice,
          total:       p.total,
          serialNumbers: [],
          currency:    'AED',
        })),
        exchangeWarrantyNote: inv.notes || '',
        selectedCurrencies:   ['AED'],
        supplierCostTotal:    0,
        purchaseCostTotal:    0,
        miscExpense:          0,
        deductionCharges:     0,
        cargoAmount:          0,
        customsAmount:        0,
        agentAmount:          0,
        branch:               '',
        digitalStamp:         !!inv.digitalStamp,
        imageDataUrl:         inv.imageDataUrl,
      };
      await downloadInvoicePdf(invoiceForPdf);
    } catch (err: any) {
      toast.error('PDF generation failed: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleDelete = async (inv: DummyInvoice) => {
    if (!window.confirm(`Delete ${inv.invoiceNumber}?`)) return;
    try {
      await DummyInvoiceFirebaseService.delete(inv.id);
      toast.success('Invoice deleted');
      load();
    } catch (err: any) {
      toast.error('Delete failed: ' + (err?.message || 'Unknown error'));
    }
  };

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Draft Invoices</div>
          <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>Fictitious, Proforma, Booking &amp; Quotation invoices — fully independent of inventory</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={exportExcel}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 9, border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', color: '#15803d', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <FileSpreadsheet size={16} /> Export Excel
          </button>
          <button onClick={() => navigate('/invoices/dummy/new')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 9, border: 'none', backgroundColor: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 10px rgba(15,23,42,0.18)' }}>
            <Plus size={16} /> Create
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Drafts',  value: String(stats.count),                                                          icon: Files,   color: '#334155', bg: '#f1f5f9' },
          { label: 'Combined Value', value: `${currencySymbol} ${stats.totalValue.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, icon: Wallet, color: '#15803d', bg: '#f0fdf4' },
          { label: 'Still in Draft', value: String(stats.draftCount),                                                     icon: Clock3,  color: '#b45309', bg: '#fffbeb' },
        ].map(tile => (
          <div key={tile.label} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: tile.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <tile.icon size={17} color={tile.color} />
            </div>
            <div>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>{tile.value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tile.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Type filter tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['All', 'Dummy', 'Proforma', 'Booking', 'Quotation'] as const).map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${typeFilter === t ? '#0f172a' : '#e2e8f0'}`,
              backgroundColor: typeFilter === t ? '#0f172a' : '#fff',
              color: typeFilter === t ? '#fff' : '#475569',
              fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {typeDisplayLabel(t)}
            {t !== 'All' && (
              <span style={{ marginLeft: 6, fontSize: 10, backgroundColor: typeFilter === t ? 'rgba(255,255,255,0.2)' : '#f1f5f9', color: typeFilter === t ? '#fff' : '#64748b', padding: '1px 5px', borderRadius: 99, fontWeight: 700 }}>
                {invoices.filter(i => i.invoiceType === t).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '28px 20px', color: '#64748b', fontSize: 13 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <FileText size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>No {typeFilter === 'All' ? 'draft' : typeFilter} invoices yet</div>
            <button onClick={() => navigate('/invoices/dummy/new')}
              style={{ marginTop: 12, padding: '8px 18px', borderRadius: 8, border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              + Create one
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a' }}>
                {['Invoice #', 'Type', 'Date', 'Valid Until', 'Customer', 'Products', 'Total', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((inv, i) => {
                const tc = TYPE_COLORS[inv.invoiceType];
                const sc = STATUS_COLORS[inv.status] || { bg: '#f1f5f9', color: '#475569' };
                return (
                  <tr key={inv.id} style={{ borderBottom: i < displayed.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>{inv.invoiceNumber}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, backgroundColor: tc.bg, color: tc.color }}>{typeDisplayLabel(inv.invoiceType)}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{new Date(inv.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td style={{ padding: '10px 14px', color: inv.validUntil ? '#64748b' : '#cbd5e1' }}>
                      {inv.validUntil ? new Date(inv.validUntil).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{inv.customerName || '—'}</div>
                      {inv.customerPhone && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{inv.customerPhone}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b' }}>{inv.products.length} item{inv.products.length !== 1 ? 's' : ''}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>
                      {currencySymbol} {(inv.totalAmount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, backgroundColor: sc.bg, color: sc.color }}>{inv.status}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => navigate(`/invoices/dummy/${inv.id}`)}
                          title="Edit"
                          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Pencil size={13} color="#64748b" />
                        </button>
                        <button onClick={() => openPdfPreview(inv)}
                          title="View PDF"
                          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Eye size={13} color="#64748b" />
                        </button>
                        <button onClick={() => downloadPdf(inv)}
                          title="Download PDF"
                          style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Download size={13} color="#2563eb" />
                        </button>
                        <button onClick={() => handleDelete(inv)}
                          title="Delete"
                          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #fecaca', backgroundColor: '#fef2f2', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={13} color="#ef4444" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {/* PDF Preview Modal */}
      {(pdfUrl || pdfLoading) && (
        <div onClick={closePdf}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '80vw', maxWidth: 900, height: '90vh', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Invoice Preview</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {pdfUrl && (
                  <button onClick={() => { const a = document.createElement('a'); a.href = pdfUrl!; a.download = 'invoice.pdf'; a.click(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 7, border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    <Download size={14} /> Download
                  </button>
                )}
                <button onClick={closePdf}
                  style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 16 }}>
                  ×
                </button>
              </div>
            </div>
            {/* PDF iframe */}
            {pdfLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#64748b' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Generating PDF…
              </div>
            ) : pdfUrl ? (
              <iframe ref={iframeRef} src={pdfUrl} style={{ flex: 1, border: 'none', width: '100%' }} title="Invoice PDF" />
            ) : null}
          </div>
        </div>
      )}

    </div>
  );
}