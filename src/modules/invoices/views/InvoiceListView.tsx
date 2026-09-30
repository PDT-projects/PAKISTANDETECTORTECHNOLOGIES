// Invoice Module - List View

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';
import {
  FileText, Plus, Search, Eye, X, Loader2, FileDown,
  Filter, XCircle, Truck, CreditCard, Hash, Building2, MapPin, Trash2,
  Pencil, Banknote, Landmark, ChevronDown, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { Invoice, InvoiceStats, InvoiceFilters, InvoiceSelectionSummary, PaymentMode } from '../models/types';
import {
  calculateSupplierCost, calculatePurchaseCost, calculateMiscExpense,
  calculateNetAmount, calculateNetProfit, calculatePaidAmount, calculateRemainingAmount,
  extractCost,
} from '../models/invoiceService';
import { downloadInvoicePdf, generateInvoicePdf } from '../models/invoicePdfService';
import { useInvoiceFormViewModel } from '../viewModels/useInvoiceFormViewModel';
import { InventoryFirebaseService } from '../../inventory/models/InventoryFirebaseService';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import { useColumnVisibility, ColumnVisibilityMenu } from '../../../shared/components/ColumnVisibility';
import { usePagination, PaginationBar } from '../../../shared/components/Pagination';
import { exportTableToExcel } from '../../../shared/excelExport/exportTableToExcel';
// InvoiceMiscExpenseService import removed — misc expense creation moved to Transactions module.

interface Props {
  invoices: Invoice[];
  filteredInvoices: Invoice[];
  stats: InvoiceStats;
  filters: InvoiceFilters;
  viewingInvoice: Invoice | null;
  isLoading: boolean;
  onSearch: (searchTerm: string) => void;
    // Multi-select filters — the ViewModel and InvoiceMultiFilter both work
  // with arrays. These signatures were left over from the old single-select
  // dropdowns and no longer matched either side.
  onStatusFilter: (statuses: string[]) => void;
  onCityFilter: (cities: string[]) => void;
  onSalespersonFilter: (salespersons: string[]) => void;
  onBrandFilter: (brands: string[]) => void;
  onModelFilter: (models: string[]) => void;
  brandOptions: string[];
  modelOptions: string[];
  onDateFromFilter: (date: string) => void;
  onDateToFilter: (date: string) => void;
  onClearFilters: () => void;
  availableCities: string[];
  availableSalespersons: string[];
  salespersonMap?: Record<string, string>;
  onViewInvoice: (invoice: Invoice) => void;
  onCloseView: () => void;
  onEditInvoice: (id: string) => void;
  onCreateInvoice: () => void;
  formatCurrency: (amount: number) => string;
  formatDate: (dateString: string) => string;
  // selection
  selectedIds: string[];
  isSelected: (id: string) => boolean;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  allFilteredSelected: boolean;
  clearSelection: () => void;
  selectionSummary: InvoiceSelectionSummary;
  hasSelection: boolean;
  // payment
  banks: { id: string; name: string; accountNumber: string; balance: number; currency?: string }[];
  paymentInvoice: Invoice | null;
  isRecordingPayment: boolean;
  openPayment: (invoice: Invoice) => void;
  closePayment: () => void;
  submitPayment: (input: { amount: number; mode: PaymentMode; date: string; bankId?: string; note?: string }) => Promise<void>;
}

// ── Multi-select filter dropdown ──────────────────────────────────────────────
function InvoiceMultiFilter({ label, selected, onChange, options, displayName }: {
  label: string; selected: string[]; onChange: (v: string[]) => void;
  options: string[]; displayName?: (v: string) => string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const display = displayName ?? ((v: string) => v);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const toggle = (opt: string) => onChange(selected.includes(opt) ? selected.filter(v => v !== opt) : [...selected, opt]);
  const has = selected.length > 0;
  return (
    <div ref={ref} style={{ display:'flex', flexDirection:'column', gap:4, minWidth:130, flex:1, position:'relative' }}>
      <label style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</label>
      <button type="button" onClick={() => setOpen(p => !p)}
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'7px 10px',
          border:`1.5px solid ${has?'#334155':'#e2e8f0'}`, borderRadius:7, fontSize:12, backgroundColor:has?'#f1f5f9':'#fff',
          color:has?'#0f172a':'#9ca3af', cursor:'pointer', fontWeight:has?700:400, textAlign:'left' }}>
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
          {has ? (selected.length === 1 ? display(selected[0]) : `${selected.length} selected`) : 'All'}
        </span>
        <ChevronDown size={13} style={{ flexShrink:0, marginLeft:4 }} />
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:999, backgroundColor:'#fff',
          border:'1px solid #e2e8f0', borderRadius:9, boxShadow:'0 8px 28px rgba(0,0,0,0.13)', minWidth:180, overflow:'hidden' }}>
          <div style={{ padding:'7px 10px', borderBottom:'1px solid #f1f5f9', display:'flex', gap:8 }}>
            <button type="button" onClick={() => onChange(options)} style={{ fontSize:11, fontWeight:700, color:'#334155', border:'none', background:'none', cursor:'pointer', padding:0 }}>Select all</button>
            <span style={{ color:'#e2e8f0' }}>|</span>
            <button type="button" onClick={() => onChange([])} style={{ fontSize:11, fontWeight:700, color:'#94a3b8', border:'none', background:'none', cursor:'pointer', padding:0 }}>Clear</button>
          </div>
          <div style={{ maxHeight:220, overflowY:'auto' }}>
            {options.map(opt => {
              const checked = selected.includes(opt);
              return (
                <div key={opt} onClick={() => toggle(opt)}
                  style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 12px', cursor:'pointer', fontSize:12,
                    backgroundColor:checked?'#f1f5f9':'transparent', color:checked?'#0f172a':'#374151', fontWeight:checked?600:400, userSelect:'none' }}>
                  <span style={{ width:15, height:15, borderRadius:4, flexShrink:0, border:`2px solid ${checked?'#0f172a':'#d1d5db'}`,
                    backgroundColor:checked?'#0f172a':'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {checked && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </span>
                  {display(opt)}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {has && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginTop:2 }}>
          {selected.map(v => (
            <span key={v} style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 6px', borderRadius:99, fontSize:10, fontWeight:700, backgroundColor:'#0f172a', color:'#fff' }}>
              {display(v)}
              <span onClick={e => { e.stopPropagation(); toggle(v); }} style={{ cursor:'pointer', display:'flex', alignItems:'center' }}>
                <X size={9} color="#fff" />
              </span>
            </span>
          ))}
        </div>
      )}
    </div>

  );
}

function deliveryBadge(status: string) {
  const map: Record<string, string> = {
    'Delivered':    'bg-green-100 text-green-800',
    'Self-collect': 'bg-blue-100 text-blue-800',
    'LCS':          'bg-yellow-100 text-yellow-800',
    'Daewoo':       'bg-purple-100 text-purple-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-700';
}

function receivedBadge(status: string) {
  const map: Record<string, string> = {
    'Received':   'bg-green-100 text-green-800',
    'In Process': 'bg-yellow-100 text-yellow-800',
    'Pending':    'bg-gray-100 text-gray-600',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Paid: 'bg-green-100 text-green-800',
    Partial: 'bg-amber-100 text-amber-800',
    Unpaid: 'bg-red-100 text-red-800',
    Returned: 'bg-gray-200 text-gray-600',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

interface PaymentModalBank { id: string; name: string; accountNumber: string; balance: number; currency?: string; }
interface PaymentInput { amount: number; mode: PaymentMode; date: string; bankId?: string; note?: string; }

function PaymentModal({
  invoice, banks, isSaving, onClose, onSubmit, formatDisplay,
}: {
  invoice: Invoice; banks: PaymentModalBank[]; isSaving: boolean;
  onClose: () => void; onSubmit: (input: PaymentInput) => void;
  formatDisplay: (n: number) => string;
}) {
  const total = invoice.totalAmount || 0;
  const alreadyPaid = calculatePaidAmount(invoice);
  const remaining = Math.max(0, total - alreadyPaid);

  const [amount, setAmount] = useState<number>(remaining);
  const [mode, setMode] = useState<PaymentMode>('Cash');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [bankId, setBankId] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const willClear = amount >= remaining && remaining > 0;
  const valid = amount > 0 && (mode !== 'Bank' || !!bankId);

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        ref={el => {
          if (el) {
            el.style.setProperty('width', '520px', 'important');
            el.style.setProperty('min-width', '0', 'important');
            el.style.setProperty('max-width', '92vw', 'important');
          }
        }}
        style={{ background: '#ffffff', borderRadius: 12, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
          <div>
            <h3 className="text-base font-bold text-gray-900">Record Payment</h3>
            <p className="text-xs text-gray-400">{invoice.invoiceNumber} · {invoice.customerName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-200"><X size={18} /></button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total', value: formatDisplay(total), color: 'text-gray-900' },
              { label: 'Already Paid', value: formatDisplay(alreadyPaid), color: 'text-green-600' },
              { label: 'Remaining', value: formatDisplay(remaining), color: 'text-red-600' },
            ].map(c => (
              <div key={c.label} className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{c.label}</div>
                <div className={`text-sm font-extrabold mt-0.5 ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Amount Paying Now *</label>
              <input type="number" min="0" max={remaining || undefined} value={amount || ''}
                onChange={e => setAmount(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900" />
            </div>
          </div>

          <p className="text-xs text-gray-500">
            {willClear
              ? <>Full remaining amount — invoice moves to <strong className="text-green-700">Paid</strong>.</>
              : <>Partial payment — invoice stays <strong className="text-amber-700">Partial</strong>.</>}
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payment Method *</label>
            <div className="grid grid-cols-2 gap-2">
              {([['Cash', Banknote], ['Bank', Landmark]] as [PaymentMode, any][]).map(([m, Icon]) => {
                const sel = mode === m;
                return (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-semibold transition ${
                      sel ? 'border-gray-800 bg-gray-100 text-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    <Icon size={16} /> {m === 'Bank' ? 'Bank Transfer' : 'Cash'}
                  </button>
                );
              })}
            </div>
          </div>

          {mode === 'Bank' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Receiving Bank *</label>
              <select value={bankId} onChange={e => setBankId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900">
                <option value="">Select bank account</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.name} — {b.accountNumber}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Note <span className="font-normal text-gray-400">(optional)</span></label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. cash received at counter"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
          <button onClick={onClose} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 text-sm font-medium whitespace-nowrap flex-shrink-0">
            <X size={15} style={{ flexShrink: 0 }} /> <span>Cancel</span>
          </button>
          <button onClick={() => onSubmit({ amount, mode, date, bankId: bankId || undefined, note: note || undefined })}
            disabled={!valid || isSaving}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold disabled:opacity-50 whitespace-nowrap flex-shrink-0 hover:brightness-125 transition"
            style={{ backgroundColor: '#1f2937' }}>
            {isSaving
              ? <><Loader2 size={15} className="animate-spin" style={{ flexShrink: 0 }} /> <span>Saving…</span></>
              : <span>Confirm Payment</span>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


// ── Quick Invoice Creation Modal ─────────────────────────────────────────────
function QuickInvoiceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const vm = useInvoiceFormViewModel();

  // ── Customer ──────────────────────────────────────────────────────────────
  const [custName,     setCustName]     = React.useState('');
  const [custPhone,    setCustPhone]    = React.useState('');
  const [custCNIC,     setCustCNIC]     = React.useState('');
  const [custCity,     setCustCity]     = React.useState('');
  const [custCountry,  setCustCountry]  = React.useState('');
  const [custAddress,  setCustAddress]  = React.useState('');
  const [showSugg,     setShowSugg]     = React.useState(false);
  const [salesperson,  setSalesperson]  = React.useState('');
  const [showAddSp,    setShowAddSp]    = React.useState(false);
  const [newSpName,    setNewSpName]    = React.useState('');
  const [savingSp,     setSavingSp]     = React.useState(false);
  const [delivery,     setDelivery]     = React.useState('Self-collect');
  const [addStamp,     setAddStamp]     = React.useState(false);
  // Defaults to true so a user who never touches it gets the behaviour every
  // invoice has had until now.
  const [showImages,   setShowImages]   = React.useState(true);
  const [shipping,     setShipping]     = React.useState<number | ''>('');
  const [discount,     setDiscount]     = React.useState<number | ''>('');
  const [saving,       setSaving]       = React.useState(false);

  const [savedCustomers, setSavedCustomers] = React.useState<any[]>([]);
  const savedSps: string[] = (vm as any).savedSalespersons || [];

  // Fetch customers directly
  React.useEffect(() => {
    import('firebase/firestore').then(({ collection, getDocs, query, orderBy }) =>
      import('../../../api/firebase/firebase').then(({ db }) =>
        getDocs(query(collection(db, 'customers'), orderBy('customerName'))).then(snap => {
          setSavedCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }).catch(() => {})
      )
    );
  }, []);
  const custSugg = custName.trim()
    ? savedCustomers.filter((x: any) => x.customerName?.toLowerCase().includes(custName.toLowerCase()) || x.customerPhone?.includes(custName)).slice(0, 6)
    : savedCustomers.slice(0, 4);

  const fillCust = (x: any) => {
    setCustName(x.customerName||''); setCustPhone(x.customerPhone||'');
    setCustCNIC(x.customerCNIC||''); setCustCity(x.customerCity||'');
    setCustCountry(x.customerProvince||''); setCustAddress(x.customerAddress||'');
    setShowSugg(false);
  };

  // ── Products ──────────────────────────────────────────────────────────────
  const [allLocations, setAllLocations] = React.useState<string[]>([]);
  const [prodLocation, setProdLocation] = React.useState('');
  const [products,     setProducts]     = React.useState<any[]>([]);
  const [prodLoading,  setProdLoading]  = React.useState(true);

  // The standalone "load locations" effect that used to live here was removed —
  // fetchProducts() below already sets allLocations. Loading them separately
  // pulled in every location that had ever held a product, including ones
  // whose stock had since been fully sold (e.g. showing "germny" long after
  // its inventory was gone). Deriving locations from the filtered product
  // list is the single source of truth.

  // Fetch products via InventoryFirebaseService — this is the same code path
  // the Inventory dashboard uses. It filters out `isDeleted` records and
  // returns only what should be visible as live stock. Using a raw Firestore
  // query here (as the old code did) bypassed those filters, so soft-deleted
  // products and stale locations like "germny" leaked into the dropdown even
  // after they'd been removed from inventory.
  const fetchProducts = React.useCallback((_loc: string) => {
    setProdLoading(true);
    InventoryFirebaseService.fetchAllProducts()
      .then((rawProducts: any[]) => {
        const mapped = rawProducts
          // Exclude on-order records that haven't been received yet — they're
          // in the collection but aren't sellable inventory.
          .filter(p => p.receivableStatus !== 'Pending')
          .map(p => ({
            id: p.id,
            label: `${p.brandName || ''} ${p.modelName || ''}`.trim(),
            brandName: p.brandName || '',
            modelName: p.modelName || '',
            location:  p.location  || '',
            // Per-serial city overrides (populated by the transfer flow).
            // A product with product.location='Sudan' can still have some
            // serials sitting in 'Chad' via serialCities — we need the map
            // to decide correctly whether the product is available at a
            // selected location.
            serialCities:  p.serialCities  || {},
            sellPrice: p.sellPrice || p.salePrice || 0,
            stock:     p.stock     || 0,
            serialNumbers: p.serialNumbers || [],
            serialStatus:  p.serialStatus  || {},
            supplierCost: p.ownershipType === 'Credit' ? (p.supplierCost || p.costPrice || 0) : 0,
            purchaseCost: p.ownershipType === 'Credit' ? 0 : (p.costPrice || p.purchaseCost || 0),
            ownershipType: p.ownershipType || 'Owned',
            category: p.category || '',
            description: p.description || '',
          }));
        // Only surface products with at least one Available/Returned serial.
        // Products whose stock counter is stale (says >0 while every serial
        // is Sold/Damaged) get filtered out here.
        const all = mapped.filter(p => {
          const serials: string[] = Array.isArray(p.serialNumbers) ? p.serialNumbers : [];
          if (serials.length === 0) return false;
          return serials.some(s => {
            const status = p.serialStatus?.[s] || 'Available';
            return status === 'Available' || status === 'Returned';
          });
        });
        // Location dropdown derived from BOTH product.location AND every
        // per-serial city in serialCities — otherwise transferred cities
        // (e.g. serials moved to Chad while the product default remained
        // Sudan) would never appear in the filter dropdown.
        const locs = new Set<string>();
        all.forEach(p => {
          if (p.location) locs.add(p.location);
          Object.values(p.serialCities || {}).forEach((c: any) => {
            if (c) locs.add(String(c));
          });
        });
        setAllLocations(Array.from(locs).sort());
        setAllProductsCache(all);
        setProducts(all);
      })
      .catch(err => {
        console.error('[QuickInvoiceModal] fetchAllProducts failed:', err);
        setProducts([]);
      })
      .finally(() => setProdLoading(false));
  }, []);

  const [allProductsCache, setAllProductsCache] = React.useState<any[]>([]);
  React.useEffect(() => { fetchProducts(''); }, [fetchProducts]);
  React.useEffect(() => {
    if (allProductsCache.length === 0) return;
    if (!prodLocation) {
      setProducts(allProductsCache);
      return;
    }
    // FIX: previously this filtered by `p.location === prodLocation` alone,
    // which missed any product whose per-serial map (serialCities) had
    // serials sitting in the selected city while the product-wide default
    // pointed elsewhere. Result: after a partial transfer, the "Chad"
    // filter showed nothing even though Chad had inventory.
    //
    // Now a product qualifies when EITHER the product default matches OR
    // any Available/Returned serial's per-serial city matches.
    setProducts(allProductsCache.filter((p: any) => {
      if (p.location === prodLocation) return true;
      const cities = p.serialCities || {};
      return (p.serialNumbers || []).some((s: string) => {
        const status = p.serialStatus?.[s] || 'Available';
        if (status !== 'Available' && status !== 'Returned') return false;
        return (cities[s] || p.location || '') === prodLocation;
      });
    }));
  }, [prodLocation, allProductsCache]);

  // ── Lines ─────────────────────────────────────────────────────────────────
  type Line = { id: string; productId: string; serial: string; qty: number; price: number };
  const [lines, setLines] = React.useState<Line[]>([{ id: '1', productId: '', serial: '', qty: 1, price: 0 }]);

  const addLine    = () => setLines(p => [...p, { id: String(Date.now()), productId: '', serial: '', qty: 1, price: 0 }]);
  const removeLine = (id: string) => setLines(p => p.length > 1 ? p.filter(l => l.id !== id) : p);
  const updateLine = (id: string, field: keyof Line, val: any) =>
    setLines(p => p.map(l => {
      if (l.id !== id) return l;
      const u = { ...l, [field]: val };
      if (field === 'productId') {
        const prod = products.find((x: any) => x.id === val);
        u.price  = prod?.sellPrice || 0;
        u.serial = '';
      }
      return u;
    }));

  const getSerials = (productId: string, lineId: string) => {
    const prod = products.find((x: any) => x.id === productId);
    if (!prod) return [];
    const used = lines.filter(l => l.id !== lineId && l.productId === productId).map(l => l.serial);
    return (prod.serialNumbers || []).filter((s: string) => {
      if (prod.serialStatus?.[s] === 'Sold') return false;
      if (used.includes(s)) return false;
      // When a location filter is active, only surface serials that are
      // actually at that location (per-serial map first, product default
      // as fallback). Without this, picking a product in Chad could still
      // show Sudan serials in the serial dropdown.
      if (prodLocation) {
        const serialCity = prod.serialCities?.[s] || prod.location || '';
        if (serialCity !== prodLocation) return false;
      }
      return true;
    });
  };

  // Line-items subtotal, then apply shipping (adds) and discount (subtracts)
  // to arrive at the final invoice total. Values are clamped so a huge
  // discount can't push the invoice below zero.
  const subtotal      = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const shippingNum   = Math.max(0, Number(shipping) || 0);
  const discountNum   = Math.max(0, Math.min(subtotal + shippingNum, Number(discount) || 0));
  const total         = Math.max(0, subtotal + shippingNum - discountNum);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!custName.trim()) { toast.error('Customer name is required'); return; }
    if (!lines.some(l => l.productId)) { toast.error('Select at least one product'); return; }
    setSaving(true);
    try {
      const { InvoiceFirebaseService } = await import('../models/InvoiceFirebaseService');
      const { CustomerFirebaseService } = await import('../models/CustomerFirebaseService');
      const validLines = lines.filter(l => l.productId);
      const invoiceProducts = validLines.map((l, i) => {
        const p = products.find((x: any) => x.id === l.productId);
        // FIX: was reading p?.purchaseCost directly — that field doesn't exist
        // on Product (the real field is costPrice), so purchase cost was
        // always 0 here for Owned stock, and the Credit/Owned distinction was
        // ignored entirely. extractCost() is the same ownership-aware mapping
        // the main invoice form uses.
        const { supplierCost, purchaseCost } = p ? extractCost(p) : { supplierCost: 0, purchaseCost: 0 };
        return {
          id: String(i), productId: l.productId,
          productName: p ? `${p.brandName} ${p.modelName}` : '',
          brandName: p?.brandName || '', modelName: p?.modelName || '',
          category: p?.category || '', description: p?.description || '',
          quantity: l.qty, price: l.price, total: l.qty * l.price,
          serialNumbers: l.serial ? [l.serial] : [], currency: 'AED',
          supplierCost,
          purchaseCost,
          ownershipType: p?.ownershipType,
        };
      });
      await InvoiceFirebaseService.createInvoice({
        invoiceNumber: vm.formData.invoiceNumber || '',
        date: vm.formData.date || new Date().toLocaleDateString('en-CA'),
        customerName: custName, customerPhone: custPhone,
        customerCNIC: custCNIC, customerCity: custCity,
        customerProvince: custCountry, customerAddress: custAddress || undefined,
        salesperson: salesperson || undefined,
        exchangeWarrantyNote: '',
        deliveryStatus: delivery, deliveryReceivedStatus: 'Pending',
        status: 'Unpaid', paymentStatus: 'unpaid',
        collectionMethod: 'Unpaid', payments: [],
        paidAmount: 0, remainingAmount: total, totalAmount: total,
        supplierCostTotal: calculateSupplierCost({ products: invoiceProducts as any }),
        purchaseCostTotal: calculatePurchaseCost({ products: invoiceProducts as any }),
        miscExpense: 0,
        deductionCharges: discountNum,
        cargoAmount:      shippingNum,
        customsAmount: 0, agentAmount: 0,
                selectedCurrencies: ['AED'], branch: '', digitalStamp: addStamp,
        showProductImages: showImages,
        products: invoiceProducts,
      } as any);

      // ── Deduct stock from inventory ──────────────────────────────────────────
      // Uses InventoryFirebaseService.markSerialsSold, the single canonical
      // write-point for recording per-serial sale metadata:
      //   - serialStatus[serial] = 'Sold'
      //   - serialSoldDates[serial] = <ISO>
      //   - serialInvoiceNumbers[serial] = <invoice number>   ← the field
      //     the Inventory dashboard reads for its "Invoice #" column.
      //
      // The old inline code here set serialStatus + serialSoldDates but never
      // wrote serialInvoiceNumbers, which is why sold rows always showed a
      // blank "—" in that column.
      const soldDate = new Date().toISOString();
      const invoiceNumberForLink = vm.formData.invoiceNumber || '';
      const { doc, getDoc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../../../api/firebase/firebase');
      for (let li = 0; li < validLines.length; li++) {
        const l = validLines[li];
        try {
          const prodRef = doc(db, 'products', l.productId);
          const snap = await getDoc(prodRef);
          if (!snap.exists()) continue;
          const pdata = snap.data() as any;

          // Resolve which serial(s) to mark sold — either the one the user
          // explicitly picked, or the first still-Available one if they didn't.
          const targetSerials: string[] = [];
          if (l.serial) {
            targetSerials.push(l.serial);
          } else {
            const avail = (pdata.serialNumbers || []).find(
              (s: string) => pdata.serialStatus?.[s] !== 'Sold'
            );
            if (avail) targetSerials.push(avail);
          }
          if (targetSerials.length === 0) continue;

          // FIX: this call previously omitted paymentStatus/supplierCost
          // entirely, so serialInvoiceSupplierCost / serialInvoicePaymentStatus
          // never got written for a sale made through this screen — the
          // Inventory Report and Payables view had nothing to show for it.
          // Every invoice created here starts 'Unpaid' (see status: 'Unpaid'
          // above), so the snapshot status is always 'Unpaid' at this point,
          // matching the main invoice form's behaviour.
          const rowCost = invoiceProducts[li];
          await InventoryFirebaseService.markSerialsSold(
            l.productId,
            targetSerials.map(s => ({
              serial: s,
              invoiceNumber: invoiceNumberForLink,
              soldDate,
              paymentStatus: 'Unpaid',
              supplierCost: rowCost?.supplierCost || rowCost?.purchaseCost || 0,
            })),
            soldDate,
          );

          // 2) Stock counter + product-level status (independent update)
          const nextStatus = { ...(pdata.serialStatus || {}) };
          targetSerials.forEach(s => { nextStatus[s] = 'Sold'; });
          const newStock = Math.max(0, (pdata.stock || 0) - l.qty);
          const allSold = (pdata.serialNumbers || []).length > 0 &&
            (pdata.serialNumbers || []).every((s: string) => nextStatus[s] === 'Sold');

          await updateDoc(prodRef, {
            stock: newStock,
            status: allSold || newStock === 0 ? 'Sold' : pdata.status,
            updatedAt: soldDate,
          });
        } catch (stockErr) {
          console.warn('[Invoice] Stock deduction failed for', l.productId, stockErr);
        }
      }

      // Auto-save customer
      CustomerFirebaseService.upsertCustomer({
        customerName: custName, customerPhone: custPhone,
        customerCNIC: custCNIC, customerCity: custCity,
        customerProvince: custCountry, customerAddress: custAddress||undefined,
        exchangeWarrantyNote: '',
      } as any).catch(() => {});
      toast.success(`✅ Invoice ${vm.formData.invoiceNumber} created`);
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create invoice');
    } finally { setSaving(false); }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const iSty: React.CSSProperties = { width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'7px 11px', fontSize:12, color:'#111827', backgroundColor:'#fff', outline:'none', boxSizing:'border-box' };
  const lbl:  React.CSSProperties = { fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 };
  const card: React.CSSProperties = { backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'12px 14px' };

  return createPortal(
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, backgroundColor:'rgba(15,23,42,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:660, maxWidth:'96vw', maxHeight:'92vh', backgroundColor:'#f8fafc', borderRadius:14, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.35)', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ backgroundColor:'#fff', padding:'12px 18px', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:'#111827' }}>Create Invoice</div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>{vm.formData.invoiceNumber||'…'} · {vm.formData.date}</div>
          </div>
          <button onClick={onClose} style={{ width:26, height:26, borderRadius:6, border:'1px solid #e2e8f0', backgroundColor:'#f8fafc', cursor:'pointer', fontSize:16, color:'#6b7280', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:12, display:'flex', flexDirection:'column', gap:10 }}>

          {/* ── Customer ── */}
          <div style={card}>
            <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', marginBottom:8 }}>Customer</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {/* Name autocomplete */}
              <div style={{ position:'relative' }}>
                <label style={lbl}>Name *</label>
                <input value={custName}
                  onChange={e => { setCustName(e.target.value); setShowSugg(true); }}
                  onFocus={() => setShowSugg(true)}
                  onBlur={() => setTimeout(() => setShowSugg(false), 150)}
                  placeholder="Type name or search…"
                  style={{ ...iSty, fontWeight: custName?600:400 }} />
                {showSugg && custSugg.length > 0 && (
                  <div style={{ position:'absolute', top:'calc(100% + 2px)', left:0, right:0, zIndex:200, backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:9, boxShadow:'0 8px 20px rgba(0,0,0,0.15)', maxHeight:140, overflowY:'auto' }}>
                    {custSugg.map((s: any, i: number) => (
                      <div key={i} onMouseDown={() => fillCust(s)}
                        style={{ padding:'7px 12px', cursor:'pointer', borderBottom:'1px solid #f9fafb' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor='#f8fafc'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor=''}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{s.customerName}</div>
                        <div style={{ fontSize:11, color:'#94a3b8' }}>{s.customerPhone}{s.customerCity?` · ${s.customerCity}`:''}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Row: phone + CNIC */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div>
                  <label style={lbl}>Phone</label>
                  <input type="tel" value={custPhone} onChange={e=>setCustPhone(e.target.value)} style={iSty} />
                </div>
                <div>
                  <label style={lbl}>Identity</label>
                  <input value={custCNIC} onChange={e=>setCustCNIC(e.target.value)} style={iSty} />
                </div>
              </div>
              {/* Row: city + country + address */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                <div>
                  <label style={lbl}>City</label>
                  <input value={custCity} onChange={e=>setCustCity(e.target.value)} style={iSty} />
                </div>
                <div>
                  <label style={lbl}>Country</label>
                  <input value={custCountry} onChange={e=>setCustCountry(e.target.value)} style={iSty} />
                </div>
                <div>
                  <label style={lbl}>Address</label>
                  <input value={custAddress} onChange={e=>setCustAddress(e.target.value)} style={iSty} />
                </div>
              </div>
              {/* Salesperson — proper select + inline Add button.
                  The old free-text input with a datalist was confusing —
                  users didn't realize they could type a new name, and
                  saved ones didn't render as a visible list. Now the
                  dropdown shows every saved salesperson, and the +Add
                  button opens an inline input that persists to
                  appConfig/salespersons via vm.handleAddSalesperson. */}
              <div>
                <label style={lbl}>Salesperson</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    value={salesperson}
                    onChange={e => setSalesperson(e.target.value)}
                    style={{ ...iSty, flex: 1, appearance: 'none', paddingRight: 28, cursor: 'pointer' }}
                  >
                    <option value="">— None —</option>
                    {savedSps.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => { setShowAddSp(true); setNewSpName(''); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                      backgroundColor: '#fff', color: '#334155',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                    title="Add a new salesperson (saved for future invoices)"
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>

                {showAddSp && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <input
                      autoFocus
                      value={newSpName}
                      onChange={e => setNewSpName(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter' && newSpName.trim() && !savingSp) {
                          setSavingSp(true);
                          try {
                            await (vm as any).handleAddSalesperson?.(newSpName.trim());
                            setSalesperson(newSpName.trim());
                            setNewSpName('');
                            setShowAddSp(false);
                          } finally { setSavingSp(false); }
                        }
                      }}
                      disabled={savingSp}
                      placeholder="Salesperson name"
                      style={{ ...iSty, flex: 1, opacity: savingSp ? 0.6 : 1 }}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (savingSp || !newSpName.trim()) return;
                        setSavingSp(true);
                        try {
                          await (vm as any).handleAddSalesperson?.(newSpName.trim());
                          setSalesperson(newSpName.trim());
                          setNewSpName('');
                          setShowAddSp(false);
                        } finally { setSavingSp(false); }
                      }}
                      disabled={savingSp || !newSpName.trim()}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '9px 14px', borderRadius: 8, border: 'none',
                        backgroundColor: savingSp ? '#94a3b8' : '#0f172a', color: '#fff',
                        fontSize: 12, fontWeight: 700,
                        cursor: savingSp ? 'not-allowed' : 'pointer',
                        opacity: !newSpName.trim() && !savingSp ? 0.5 : 1,
                      }}
                    >
                      {savingSp
                        ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                        : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddSp(false); setNewSpName(''); }}
                      disabled={savingSp}
                      style={{
                        padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                        backgroundColor: '#fff', color: '#334155', fontSize: 12, fontWeight: 700,
                        cursor: savingSp ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Products ── */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Products</span>
                <select value={prodLocation} onChange={e => setProdLocation(e.target.value)}
                  style={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', color: prodLocation ? '#0f172a' : '#94a3b8', backgroundColor: prodLocation ? '#f1f5f9' : '#f9fafb', cursor: 'pointer', outline: 'none' }}>
                  <option value="">All locations ({products.length})</option>
                  {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                {prodLoading && <Loader2 size={13} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />}
              </div>
              <button onClick={addLine}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 7, border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <Plus size={12} /> Add Product
              </button>
            </div>

            {/* Empty-state banner — very unlikely but if lines somehow ends
                up empty, at least the modal doesn't look broken. */}
            {lines.length === 0 && (
              <div style={{ padding: '14px 12px', textAlign: 'center', fontSize: 12, color: '#94a3b8', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
                No product lines. Click <b>+ Add Product</b> above to start.
              </div>
            )}

            {/* One card per product line — labeled fields, hard to miss. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lines.map((l, i) => {
                const serials = getSerials(l.productId, l.id);
                return (
                  <div key={l.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, backgroundColor: '#fafbfc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        Line {i + 1}
                      </span>
                      <button onClick={() => removeLine(l.id)} disabled={lines.length === 1}
                        title="Remove line"
                        style={{ border: 'none', background: 'transparent', cursor: lines.length === 1 ? 'not-allowed' : 'pointer', opacity: lines.length === 1 ? 0.3 : 1, display: 'flex', padding: 0 }}>
                        <X size={14} color="#ef4444" />
                      </button>
                    </div>

                    {/* Product select */}
                    <div style={{ marginBottom: 6 }}>
                      <label style={{ ...lbl, fontSize: 9 }}>Product</label>
                      <select value={l.productId} onChange={e => updateLine(l.id, 'productId', e.target.value)}
                        style={{ ...iSty, padding: '6px 8px', fontSize: 12, color: l.productId ? '#111827' : '#94a3b8' }}>
                        <option value="">
                          {prodLoading ? 'Loading products…'
                            : products.length === 0 ? 'No products available'
                            : '— select product —'}
                        </option>
                        {products.map((p: any) => {
                          // Compute the count that actually applies right now:
                          //  - If a location filter is active → count only Available/Returned
                          //    serials that live at that specific location (per serialCities,
                          //    falling back to product.location).
                          //  - Otherwise → total Available/Returned across all locations.
                          // Previously we always showed p.stock, which is the product-wide
                          // total. That said "3 left · Chad" while the serial dropdown for
                          // that product (correctly filtered) showed only 1.
                          const serials: string[] = p.serialNumbers || [];
                          let count = 0;
                          for (const s of serials) {
                            const st = p.serialStatus?.[s] || 'Available';
                            if (st !== 'Available' && st !== 'Returned') continue;
                            if (prodLocation) {
                              const city = p.serialCities?.[s] || p.location || '';
                              if (city !== prodLocation) continue;
                            }
                            count++;
                          }
                          const shownLoc = prodLocation || p.location || '';
                          return (
                            <option key={p.id} value={p.id}>
                              {p.brandName} {p.modelName} ({getGlobalCurrencySymbol()} {(p.sellPrice || 0).toLocaleString()}, {count} left{shownLoc ? ` · ${shownLoc}` : ''})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Serial + Qty + Price row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 60px 100px', gap: 6 }}>
                      <div>
                        <label style={{ ...lbl, fontSize: 9 }}>Serial No.</label>
                        <select value={l.serial} onChange={e => updateLine(l.id, 'serial', e.target.value)}
                          disabled={!l.productId}
                          style={{ ...iSty, padding: '6px 8px', fontSize: 12, opacity: l.productId ? 1 : 0.4 }}>
                          <option value="">— any —</option>
                          {serials.map((s: string) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ ...lbl, fontSize: 9 }}>Qty</label>
                        <input type="number" min={1} value={l.qty}
                          onChange={e => updateLine(l.id, 'qty', parseInt(e.target.value) || 1)}
                          style={{ ...iSty, padding: '6px 8px', fontSize: 12, textAlign: 'center' }} />
                      </div>
                      <div>
                        <label style={{ ...lbl, fontSize: 9 }}>Price ({getGlobalCurrencySymbol()})</label>
                        <input type="number" min={0} step="any" value={l.price || ''}
                          onChange={e => updateLine(l.id, 'price', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          style={{ ...iSty, padding: '6px 8px', fontSize: 12, textAlign: 'right' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Charges ─────────────────────────────────────────────
              Optional shipping (adds to total) and discount (subtracts).
              Both feed the invoice's cargoAmount/deductionCharges fields
              which the PDF Totals block already renders. */}
          <div style={card}>
            <label style={{ ...lbl, marginBottom:7 }}>Charges</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={{ ...lbl, fontSize:10 }}>Shipping ({getGlobalCurrencySymbol()})</label>
                <input
                  type="number" min={0} step="any"
                  value={shipping}
                  onChange={e => setShipping(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  style={iSty}
                />
              </div>
              <div>
                <label style={{ ...lbl, fontSize:10 }}>Discount ({getGlobalCurrencySymbol()})</label>
                <input
                  type="number" min={0} step="any"
                  value={discount}
                  onChange={e => setDiscount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  style={iSty}
                />
              </div>
            </div>
            {(shippingNum > 0 || discountNum > 0) && (
              <div style={{
                marginTop: 10, padding: '8px 10px', backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 8,
                fontSize: 11, color: '#64748b',
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 4,
                fontVariantNumeric: 'tabular-nums',
              }}>
                <span>Subtotal</span>
                <span style={{ color: '#0f172a', fontWeight: 700 }}>{getGlobalCurrencySymbol()} {subtotal.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</span>
                {shippingNum > 0 && <>
                  <span>+ Shipping</span>
                  <span style={{ color: '#0f172a', fontWeight: 700 }}>{getGlobalCurrencySymbol()} {shippingNum.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</span>
                </>}
                {discountNum > 0 && <>
                  <span>− Discount</span>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>{getGlobalCurrencySymbol()} {discountNum.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</span>
                </>}
                <span style={{ color: '#0f172a', fontWeight: 800, paddingTop: 4, borderTop: '1px solid #e2e8f0', marginTop: 2 }}>Total</span>
                <span style={{ color: '#0f172a', fontWeight: 800, paddingTop: 4, borderTop: '1px solid #e2e8f0', marginTop: 2 }}>{getGlobalCurrencySymbol()} {total.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>

          {/* ── Delivery ── */}
          <div style={card}>
            <label style={{ ...lbl, marginBottom:7 }}>Delivery Method</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {['Self-collect','Courier','COD','Self Delivered'].map(v => (
                <button key={v} onClick={() => setDelivery(v)}
                  style={{ padding:'6px 12px', borderRadius:7, cursor:'pointer', fontSize:11, fontWeight:600,
                    border:`2px solid ${delivery===v?'#111827':'#e2e8f0'}`,
                    backgroundColor:delivery===v?'#111827':'#fff',
                    color:delivery===v?'#fff':'#6b7280' }}>{v}</button>
              ))}
            </div>

            {/* Stamp toggle — checkbox drives whether the PDF renders the
                Bullion stamp (loaded from /BullionStamp.jpeg) alongside the
                Terms & Conditions on the invoice PDF. Opt-in by default. */}
            <label
              onClick={() => setAddStamp(v => !v)}
              style={{
                marginTop: 12,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8,
                border: `1.5px solid ${addStamp ? '#111827' : '#e2e8f0'}`,
                backgroundColor: addStamp ? '#f8fafc' : '#fff',
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <span style={{
                width: 16, height: 16, borderRadius: 4,
                border: `1.5px solid ${addStamp ? '#111827' : '#cbd5e1'}`,
                backgroundColor: addStamp ? '#111827' : '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {addStamp && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5L4.5 9L10 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: addStamp ? '#111827' : '#64748b' }}>
                Include digital stamp on PDF
              </span>
            </label>

            {/* Some customers want the product photo, others read it as
                clutter. With this off the PDF removes the image column
                entirely rather than leaving a blank gutter down every row. */}
            <label
              onClick={() => setShowImages(v => !v)}
              style={{
                marginTop: 8, marginLeft: 8,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8,
                border: `1.5px solid ${showImages ? '#111827' : '#e2e8f0'}`,
                backgroundColor: showImages ? '#f8fafc' : '#fff',
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <span style={{
                width: 16, height: 16, borderRadius: 4,
                border: `1.5px solid ${showImages ? '#111827' : '#cbd5e1'}`,
                backgroundColor: showImages ? '#111827' : '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {showImages && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5L4.5 9L10 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: showImages ? '#111827' : '#64748b' }}>
                Show product images on PDF
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ backgroundColor:'#fff', borderTop:'1px solid #e2e8f0', padding:'11px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ fontSize:13, color:'#6b7280' }}>
            Total: <strong style={{ color:'#111827', fontSize:15 }}>{getGlobalCurrencySymbol()} {total.toLocaleString('en-AE',{minimumFractionDigits:2})}</strong>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #d1d5db', backgroundColor:'#fff', color:'#374151', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
            <button onClick={handleGenerate} disabled={saving}
              style={{ padding:'8px 20px', borderRadius:8, border:'none', backgroundColor:saving?'#94a3b8':'#111827', color:'#fff', fontWeight:700, fontSize:13, cursor:saving?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:6 }}>
              {saving ? <><Loader2 size={14} style={{ animation:'spin 1s linear infinite' }}/> Saving…</> : <><Check size={14}/> Generate Invoice</>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}




export function InvoiceListView({
  invoices, filteredInvoices, stats, filters, viewingInvoice, isLoading,
  onSearch, onStatusFilter, onCityFilter, onSalespersonFilter,
  onBrandFilter, onModelFilter, brandOptions, modelOptions,
  onDateFromFilter, onDateToFilter, onClearFilters,
  availableCities, availableSalespersons,
  salespersonMap = {},
  onViewInvoice, onCloseView, onEditInvoice, onCreateInvoice,
  formatCurrency, formatDate,
  selectedIds, isSelected, toggleSelect, toggleSelectAll, allFilteredSelected,
  clearSelection, selectionSummary, hasSelection,
  banks, paymentInvoice, isRecordingPayment, openPayment, closePayment, submitPayment,
}: Props) {

  // Subscribed purely so this whole view re-renders the instant the Admin
  // changes the global currency — getGlobalCurrencySymbol()/formatDisplay()
  // below always read the live value regardless, but without this the page
  // wouldn't repaint until something else triggered a re-render.
  useGlobalCurrency();

  // ── Inventory products for PDF image enrichment ──────────────────────────
  // Older invoices were saved before product images existed, so their rows
  // have no imageUrls. Passing the live product list lets the PDF generator
  // look the image up by productId and render it anyway.
  const [pdfProducts, setPdfProducts] = useState<any[]>([]);

  // ── Net Profit filter ─────────────────────────────────────────────────
  // Purely client-side — Net Profit is a calculated figure, not a stored
  // field, so there's nothing to filter in Firestore. Applied on top of
  // whatever filteredInvoices already is.
  const [profitFilter, setProfitFilter] = useState<'all' | 'profit' | 'loss'>('all');

  // ── Price Range filter (NEW) ────────────────────────────────────────────
  // Client-side min/max on the invoice total (the "Amount" column). Kept
  // as strings so an empty box means "no bound on that side" rather than 0.
  const [priceMin, setPriceMin] = useState<string>('');
  const [priceMax, setPriceMax] = useState<string>('');

  // ── Delivery / COD filter (NEW) ─────────────────────────────────────────
  // deliveryStatus is saved as whatever the Delivery Method buttons wrote at
  // invoice-creation time (Self-collect / Courier / COD / Self Delivered),
  // which is a wider set than the older LCS / Daewoo / Delivered values —
  // so options are seeded with every method used anywhere in the app and
  // topped up with whatever is actually saved on real invoices, the same
  // way the Location filter already seeds ALLOWED_CITIES and tops up from
  // real data.
  const KNOWN_DELIVERY_METHODS = ['Self-collect', 'Courier', 'COD', 'Self Delivered', 'LCS', 'Daewoo', 'Delivered'];
  const deliveryOptions = React.useMemo(() => {
    const s = new Set<string>(KNOWN_DELIVERY_METHODS);
    invoices.forEach(inv => { if (inv.deliveryStatus) s.add(inv.deliveryStatus); });
    return Array.from(s);
  }, [invoices]);
  const [deliveryFilter, setDeliveryFilter] = useState<string[]>([]);

  const visibleInvoices = React.useMemo(() => {
    let result = filteredInvoices;

    if (profitFilter !== 'all') {
      result = result.filter(inv => {
        const misc = Number(inv.miscExpense) || 0;
        const discount = Number((inv as any).deductionCharges) || 0;
        const shipping = Number((inv as any).cargoAmount) || 0;
        const netSale = (inv.totalAmount || 0) - discount - misc;
        const netProfit = netSale - calculateSupplierCost(inv) - calculatePurchaseCost(inv) - shipping;
        return profitFilter === 'profit' ? netProfit >= 0 : netProfit < 0;
      });
    }

    if (priceMin.trim() !== '') {
      const min = parseFloat(priceMin);
      if (!isNaN(min)) result = result.filter(inv => (inv.totalAmount || 0) >= min);
    }
    if (priceMax.trim() !== '') {
      const max = parseFloat(priceMax);
      if (!isNaN(max)) result = result.filter(inv => (inv.totalAmount || 0) <= max);
    }

    if (deliveryFilter.length > 0) {
      result = result.filter(inv => deliveryFilter.includes(inv.deliveryStatus));
    }

    return result;
  }, [filteredInvoices, profitFilter, priceMin, priceMax, deliveryFilter]);

  const INVOICE_COLUMNS = ['Invoice #', 'Date', 'Customer', 'Branch / Location',
    'Salesperson', 'Brand', 'Model', `Amount (${getGlobalCurrencySymbol()})`,
    'Supplier Cost', 'Purchase Cost', 'Shipping', 'Discount', 'Misc Exp',
    'Net Sale', 'Net Profit', 'Paid', 'Amount Left',
    'Delivery', 'Payment', 'Status', 'Actions'];
  const cols = useColumnVisibility('invoice-list', INVOICE_COLUMNS);
  const invLabelColsVisible = ['Invoice #', 'Date', 'Customer', 'Branch / Location', 'Salesperson', 'Brand', 'Model']
    .filter(c => cols.isVisible(c)).length;
  const invTrailingColsVisible = ['Delivery', 'Payment', 'Status', 'Actions']
    .filter(c => cols.isVisible(c)).length;
  const pg = usePagination(visibleInvoices, 'invoice-list');

  useEffect(() => {
    let cancelled = false;
    InventoryFirebaseService.fetchAllProducts()
      .then(list => {
        if (cancelled) return;
        setPdfProducts(list as any[]);
        const withImg = (list as any[]).filter(p => p.imageUrls?.length > 0).length;
        console.log(`[InvoiceList] PDF products loaded: ${(list as any[]).length}, ${withImg} with images`);
      })
      .catch(err => console.warn('[InvoiceList] PDF product fetch failed:', err));
    return () => { cancelled = true; };
  }, []);

  const spName = (idOrName: string | undefined): string => {
    if (!idOrName) return '—';
    if (salespersonMap[idOrName]) return salespersonMap[idOrName];
    const looksLikeId = idOrName.length > 15 && !/\s/.test(idOrName);
    if (looksLikeId) return idOrName.slice(0, 8) + '…';
    return idOrName;
  };

  const [generatingPdf, setGeneratingPdf] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const formatDisplay = (aedAmount: number): string => {
    const symbol = getGlobalCurrencySymbol();
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(aedAmount || 0);
    return `${symbol} ${formatted}`;
  };

  // FIX: Added toast.error() so the user sees feedback when PDF generation
  // fails, instead of the error being silently swallowed in the catch block.
  const handleDownloadPdf = async (invoice: Invoice) => {
    if (generatingPdf.has(invoice.id)) return;
    setGeneratingPdf(prev => new Set(prev).add(invoice.id));
    try {
           await downloadInvoicePdf(invoice, { enrichWithProducts: pdfProducts });
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('PDF download failed. Please try again.');
    } finally {
      setGeneratingPdf(prev => { const n = new Set(prev); n.delete(invoice.id); return n; });
    }
  };

  // PDF preview state
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);

  const openPdfPreview = useCallback(async (invoice: Invoice) => {
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
           const blob = await generateInvoicePdf(invoice, { enrichWithProducts: pdfProducts });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      toast.error('Failed to generate PDF preview');
       } finally {
      setPreviewLoading(false);
    }
  }, [pdfProducts]);

  const closePdfPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [previewUrl]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  // miscExpenseInvoice state removed — misc expenses are added from Transactions module now.

  const hasActiveFilters =
    !!filters.searchTerm ||
    (Array.isArray(filters.statusFilter) ? filters.statusFilter.length > 0 : filters.statusFilter !== 'all') ||
    !!filters.dateFrom || !!filters.dateTo ||
    (Array.isArray(filters.cityFilter) ? filters.cityFilter.length > 0 : !!filters.cityFilter) ||
    (Array.isArray(filters.salespersonFilter) ? filters.salespersonFilter.length > 0 : !!filters.salespersonFilter) ||
    (Array.isArray(filters.brandFilter) && filters.brandFilter.length > 0) ||
    (Array.isArray(filters.modelFilter) && filters.modelFilter.length > 0) ||
    profitFilter !== 'all' || priceMin.trim() !== '' || priceMax.trim() !== '' || deliveryFilter.length > 0;

  // Clears the viewModel-managed filters AND the local ones added on top
  // (Net Profit, Price Range, Delivery) so "Clear all" really clears
  // everything shown in the filter bar.
  const handleClearAll = () => {
    onClearFilters();
    setProfitFilter('all');
    setPriceMin('');
    setPriceMax('');
    setDeliveryFilter([]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-gray-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 pb-28">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoices</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            {visibleInvoices.length} of {invoices.length} invoices shown
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const headers = ['Date', 'Invoice #', 'Customer Name', 'City', 'Total Amount', 'Supplier Cost', 'Purchase Cost', 'Discount', 'Misc Expense', 'Net Amount', 'Net Profit', 'Paid', 'Remaining', 'Status', 'Salesperson', 'Delivery Status'];
              const rows = visibleInvoices.map(inv => [
                inv.date, inv.invoiceNumber, inv.customerName, inv.customerCity || '',
                inv.totalAmount, calculateSupplierCost(inv), calculatePurchaseCost(inv),
                Number((inv as any).deductionCharges) || 0, Number(inv.miscExpense) || 0,
                calculateNetAmount(inv), calculateNetProfit(inv), calculatePaidAmount(inv),
                calculateRemainingAmount(inv), inv.status, inv.salesperson || 'N/A', inv.deliveryStatus,
              ]);
              exportTableToExcel({
                title: 'Invoices',
                subtitle: `${visibleInvoices.length} of ${invoices.length} invoices`,
                columns: headers.map(h => ({ header: h })),
                rows,
                filename: `invoices-${new Date().toISOString().slice(0, 10)}`,
              });
            }}
            disabled={visibleInvoices.length === 0}
            title="Download as Excel"
            style={{ borderColor: '#e2e8f0', color: '#334155' }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-white font-semibold text-sm whitespace-nowrap flex-shrink-0 hover:bg-gray-50 transition-colors disabled:opacity-50">
            <FileDown size={16} /> Excel
          </button>
          <ColumnVisibilityMenu controller={cols} />
          <button
            onClick={() => navigate('/invoices/deleted')}
            title="Deleted Invoices"
            style={{ borderColor: '#fecaca', color: '#b91c1c' }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-white font-semibold text-sm whitespace-nowrap flex-shrink-0 hover:bg-red-50 transition-colors">
            <Trash2 size={16} /> Deleted Invoices
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{ backgroundColor: '#1f2937', color: '#ffffff', border: '1px solid #374151' }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg active:scale-95 transition-all font-semibold shadow-md whitespace-nowrap flex-shrink-0">
            <Plus size={18} /> Create Invoice
          </button>
        </div>
      </div>



      {/* ── Filter Bar — multi-select ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={15} className="text-gray-600" />
          <span className="text-sm font-semibold text-gray-700">Filters</span>
          {hasActiveFilters && (
            <button onClick={handleClearAll} className="ml-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium">
              <XCircle size={13} /> Clear all
            </button>
          )}
        </div>
                <div className="flex flex-wrap gap-3 items-start">
          {/* Search reaches the product lines now — brand, model, category and
              every serial number — so it needs somewhere to be typed. */}
          <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:280, flex:'1 1 280px' }}>
            <label style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em' }}>Search</label>
            <input
              type="text"
              value={filters.searchTerm}
              onChange={e => onSearch(e.target.value)}
              placeholder="Invoice no, customer, brand, model or serial…"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white text-gray-900"
            />
          </div>

          <InvoiceMultiFilter label="Status"
            selected={Array.isArray(filters.statusFilter) ? filters.statusFilter as string[] : []}
            onChange={v => onStatusFilter(v as any)}
            options={['Paid', 'Unpaid', 'Partial']} />
          <InvoiceMultiFilter label="Location"
            selected={Array.isArray(filters.cityFilter) ? filters.cityFilter as string[] : (filters.cityFilter ? [filters.cityFilter as string] : [])}
            onChange={v => onCityFilter(v)}
            options={availableCities} />
          <InvoiceMultiFilter label="Salesperson"
            selected={Array.isArray(filters.salespersonFilter) ? filters.salespersonFilter as string[] : (filters.salespersonFilter ? [filters.salespersonFilter as string] : [])}
            onChange={v => onSalespersonFilter(v)}
            options={availableSalespersons}
            displayName={sp => spName(sp)} />
            
          {/* Brand and model are stored separately on every line but were only
              ever shown joined, so neither could be filtered on. Models narrow
              to the selected brands — the full list is too long to be usable. */}
          <InvoiceMultiFilter label="Brand"
            selected={filters.brandFilter}
            onChange={v => onBrandFilter(v)}
            options={brandOptions} />
          <InvoiceMultiFilter label="Model"
            selected={filters.modelFilter}
            onChange={v => onModelFilter(v)}
            options={modelOptions} />

          <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:130 }}>
            <label style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em' }}>From Date</label>
            <input type="date" value={filters.dateFrom} onChange={e => onDateFromFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white text-gray-900" />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:130 }}>
            <label style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em' }}>To Date</label>
            <input type="date" value={filters.dateTo} onChange={e => onDateToFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white text-gray-900" />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:150 }}>
            <label style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em' }}>Net Profit</label>
            <select
              value={profitFilter}
              onChange={e => setProfitFilter(e.target.value as 'all' | 'profit' | 'loss')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white text-gray-900"
              style={{ cursor: 'pointer' }}
            >
              <option value="all">All invoices</option>
              <option value="profit">Profitable only</option>
              <option value="loss">Loss-making only</option>
            </select>
          </div>

          {/* Price Range — client-side min/max on the invoice total. */}
          <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:170 }}>
            <label style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em' }}>
              Price Range ({getGlobalCurrencySymbol()})
            </label>
            <div style={{ display:'flex', gap:6 }}>
              <input
                type="number"
                min={0}
                value={priceMin}
                onChange={e => setPriceMin(e.target.value)}
                placeholder="Min"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white text-gray-900"
                style={{ width: '50%' }}
              />
              <input
                type="number"
                min={0}
                value={priceMax}
                onChange={e => setPriceMax(e.target.value)}
                placeholder="Max"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 bg-white text-gray-900"
                style={{ width: '50%' }}
              />
            </div>
          </div>

          {/* Delivery / COD — same multi-select control as Status/Location/etc. */}
          <InvoiceMultiFilter label="Delivery"
            selected={deliveryFilter}
            onChange={v => setDeliveryFilter(v)}
            options={deliveryOptions} />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <LockedScrollTable>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-gray-800" title="Select all filtered" />
                </th>
                  {[
                  'Invoice #', 'Date', 'Customer', 'Branch / Location',
                  'Salesperson', 'Brand', 'Model', `Amount (${getGlobalCurrencySymbol()})`,
                  'Supplier Cost', 'Purchase Cost',
                  'Shipping', 'Discount', 'Misc Exp',
                  'Net Sale', 'Net Profit', 'Paid', 'Amount Left',
                  'Delivery', 'Payment', 'Status', 'Actions',
                ].filter(h => cols.isVisible(h)).map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleInvoices.length === 0 ? (
                <tr>
                  <td colSpan={cols.visibleCount + 1} className="px-4 py-14 text-center text-gray-400">
                    <FileText className="mx-auto mb-3 text-gray-300" size={44} />
                    <p className="font-medium text-gray-500">No invoices found</p>
                    <p className="text-xs mt-1">
                      {hasActiveFilters ? 'Try adjusting your filters' : 'Create your first invoice to get started'}
                    </p>
                  </td>
                </tr>
              ) : pg.pageRows.map(invoice => {
                const supplierCost = calculateSupplierCost(invoice);
                const purchaseCost = calculatePurchaseCost(invoice);
                // Misc Expense is ONLY the running total added from the
                // Transactions module (InvoiceMiscExpenseService writes it
                // to invoice.miscExpense). Shipping and discount are
                // customer-facing charges on the invoice and should NOT
                // count as misc expense — they have their own columns now.
                const misc = Number(invoice.miscExpense) || 0;
                // Shipping (cargoAmount) and discount (deductionCharges)
                // are broken out into their own columns.
                const shipping = Number((invoice as any).cargoAmount) || 0;
                const discount = Number((invoice as any).deductionCharges) || 0;
                const netSale = (invoice.totalAmount || 0) - discount - misc;
                const netProfit = netSale - supplierCost - purchaseCost - shipping;
                const paid = calculatePaidAmount(invoice);
                const remaining = calculateRemainingAmount(invoice);
                const selected = isSelected(invoice.id);
                return (
                <tr key={invoice.id} className={`transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>

                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selected} onChange={() => toggleSelect(invoice.id)}
                      className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-gray-800" />
                  </td>

                  {cols.isVisible('Invoice #') && <td className="px-3 py-3 font-semibold text-gray-800 whitespace-nowrap">
                    {invoice.invoiceNumber}
                  </td>}

                  {cols.isVisible('Date') && <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                    {formatDate(invoice.date)}
                  </td>}

                  {cols.isVisible('Customer') && <td className="px-3 py-3">
                    <p className="font-medium text-gray-900">
                      {invoice.customerName}
                      {invoice.customerName === 'Internal - Import Charge Adjustment' && (
                        <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, padding: '2px 6px',
                          borderRadius: 99, backgroundColor: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe',
                          textTransform: 'uppercase', letterSpacing: '.04em', verticalAlign: 'middle' }}>
                          System
                        </span>
                      )}
                    </p>
                    {/* Which shipment's late import charge this invoice absorbs.
                        Previously this only existed as a sentence inside the
                        invoice's own warranty-note field — invisible from the
                        list, so there was no way to tell which shipment a
                        given "System" invoice belonged to without opening it.
                        Older adjustment invoices created before this field
                        existed won't have it and just show the badge above. */}
                    {invoice.sourceShipmentNumber && (
                      <p className="text-xs mt-0.5" style={{ color: '#7c3aed' }}>
                        Shipment: {invoice.sourceShipmentNumber}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">{invoice.customerPhone}</p>
                    {invoice.customerPhone2 && (
                      <p className="text-xs text-gray-400">{invoice.customerPhone2}</p>
                    )}
                  </td>}

                  {cols.isVisible('Branch / Location') && <td className="px-3 py-3">
                    <p className="font-medium text-gray-800 text-sm">{invoice.customerCity || '—'}</p>
                    {invoice.salespersonLocation && (
                      <p className="text-xs text-gray-400 mt-0.5">{invoice.salespersonLocation}</p>
                    )}
                    {invoice.productLocation && (
                      <p className="text-xs text-gray-600 mt-0.5">Stock: {invoice.productLocation}</p>
                    )}
                  </td>}

                  {cols.isVisible('Salesperson') && <td className="px-3 py-3">
                    {invoice.salesperson ? (
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{spName(invoice.salesperson)}</p>
                        {invoice.clientDealBy && (
                          <p className="text-xs text-gray-400 mt-0.5">Deal: {spName(invoice.clientDealBy)}</p>
                        )}
                        {invoice.referralBy && (
                          <p className="text-xs text-gray-400">Ref: {invoice.referralBy}</p>
                        )}
                      </div>
                    ) : <span className="text-gray-300 text-sm">—</span>}
                  </td>}

                                       {/* Brand — its own column.
                      productName is `${brandName} ${modelName}`, and model names
                      here often repeat the brand, which is how "FISHER FISHER F11"
                      appeared. Both are stored separately, so each gets a column
                      and the model drops the brand when it already leads with it. */}
                  {cols.isVisible('Brand') && <td className="px-3 py-3" style={{ maxWidth: 120 }}>
                    {invoice.products.map((p: any, pi: number) => (
                      <div key={pi} style={{
                        marginBottom: pi < invoice.products.length - 1 ? 4 : 0,
                        fontSize: 12, fontWeight: 700, color: '#0f172a',
                        whiteSpace: 'nowrap', overflow: 'hidden',
                        textOverflow: 'ellipsis', maxWidth: 110,
                      }}>
                        {(p.brandName || '').trim() || '—'}
                      </div>
                    ))}
                  </td>}

                  {cols.isVisible('Model') && <td className="px-3 py-3" style={{ maxWidth: 190 }}>
                    {invoice.products.map((p: any, pi: number) => {
                      const brand = (p.brandName || '').trim();
                      const model = (p.modelName || '').trim();
                      const modelShort = brand && model.toLowerCase().startsWith(brand.toLowerCase())
                        ? model.slice(brand.length).trim()
                        : model;
                      return (
                        <div key={pi} style={{ marginBottom: pi < invoice.products.length - 1 ? 4 : 0 }}>
                          <div style={{ fontSize: 12, color: '#0f172a', whiteSpace: 'nowrap',
                                        overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                            {modelShort || p.productName || '—'}
                          </div>
                          {p.serialNumbers?.length > 0 && (
                            <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace',
                                          whiteSpace: 'nowrap', overflow: 'hidden',
                                          textOverflow: 'ellipsis', maxWidth: 180 }}>
                              {p.serialNumbers.slice(0, 2).join(', ')}{p.serialNumbers.length > 2 ? ` +${p.serialNumbers.length - 2}` : ''}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </td>}
                  

                  {cols.isVisible(`Amount (${getGlobalCurrencySymbol()})`) && <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">
                    {formatDisplay(invoice.totalAmount)}
                  </td>}
                  {cols.isVisible('Supplier Cost') && <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                    {(() => {
                      const hasSupplier = supplierCost > 0 && purchaseCost === 0;
                      return hasSupplier ? formatDisplay(supplierCost) : '—';
                    })()}
                  </td>}
                  {cols.isVisible('Purchase Cost') && <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                    {(() => {
                      const hasSupplierOnly = supplierCost > 0 && purchaseCost === 0;
                      return !hasSupplierOnly && purchaseCost > 0 ? formatDisplay(purchaseCost) : '—';
                    })()}
                  </td>}
                  {/* COGS per-row column removed — total is shown in footer only */}
                  {cols.isVisible('Shipping') && <td className="px-3 py-3 whitespace-nowrap">{shipping > 0 ? <span className="text-slate-800 font-medium">{formatDisplay(shipping)}</span> : '—'}</td>}
                  {cols.isVisible('Discount') && <td className="px-3 py-3 whitespace-nowrap">{discount > 0 ? <span className="text-red-600 font-medium">−{formatDisplay(discount)}</span> : '—'}</td>}
                  {cols.isVisible('Misc Exp') && <td className="px-3 py-3 whitespace-nowrap">{misc > 0 ? <span className="text-red-600 font-medium">{formatDisplay(misc)}</span> : '—'}</td>}
                  {cols.isVisible('Net Sale') && <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatDisplay(netSale)}</td>}
                  {cols.isVisible('Net Profit') && <td className={`px-3 py-3 font-semibold whitespace-nowrap ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {netProfit >= 0 ? formatDisplay(netProfit) : `−${formatDisplay(Math.abs(netProfit))}`}
                  </td>}
                  {cols.isVisible('Paid') && <td className="px-3 py-3 whitespace-nowrap">
                    {invoice.status === 'Unpaid'
                      ? <span className="text-gray-300">—</span>
                      : paid > 0
                      ? <span className="text-green-700 font-semibold">{formatDisplay(paid)}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>}
                  {cols.isVisible('Amount Left') && <td className="px-3 py-3 whitespace-nowrap">
                    {invoice.status === 'Paid'
                      ? <span className="text-green-600 font-semibold">Cleared</span>
                      : invoice.status === 'Unpaid'
                      ? <span className="text-red-600 font-semibold">{formatDisplay(invoice.totalAmount)}</span>
                      : remaining > 0
                      ? <span className="text-red-600 font-semibold">{formatDisplay(remaining)}</span>
                      : <span className="text-green-600 font-semibold">Cleared</span>}
                  </td>}

                  {cols.isVisible('Delivery') && <td className="px-3 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${deliveryBadge(invoice.deliveryStatus)}`}>
                      {invoice.deliveryStatus}
                    </span>
                    {invoice.deliveryReceivedStatus && invoice.deliveryReceivedStatus !== 'Pending' && (
                      <span className={`block mt-1 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${receivedBadge(invoice.deliveryReceivedStatus)}`}>
                        {invoice.deliveryReceivedStatus}
                      </span>
                    )}
                  </td>}

                  {cols.isVisible('Payment') && <td className="px-3 py-3">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {invoice.status !== 'Paid' && invoice.status !== 'Returned' && (
                        <button onClick={() => openPayment(invoice)}
                          className="inline-flex items-center justify-center text-xs font-semibold px-3 py-1.5 rounded-md text-white whitespace-nowrap hover:brightness-125 transition"
                          style={{ backgroundColor: '#1f2937' }}>
                          Record Payment
                        </button>
                      )}
                      {/* + Misc Exp button removed — misc expenses now added from Transactions module */}
                    </div>
                    {invoice.paymentMode && invoice.status !== 'Unpaid' && (
                      <div className="mt-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          invoice.paymentMode === 'Cash'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {invoice.paymentMode === 'Cash' ? 'Cash' : 'Bank'}
                        </span>
                      </div>
                    )}
                  </td>}

                  {cols.isVisible('Status') && <td className="px-3 py-3">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusBadge(invoice.status)}`}>
                      {invoice.status}
                    </span>
                  </td>}

                  {cols.isVisible('Actions') && <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openPdfPreview(invoice)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="View PDF">
                        <Eye size={15} />
                      </button>

                      <button onClick={() => navigate(`/invoices/${invoice.id}/delete`)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete">
                        <Trash2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDownloadPdf(invoice)}
                        disabled={generatingPdf.has(invoice.id)}
                        className="p-1.5 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-40"
                        title="Download PDF">
                        {generatingPdf.has(invoice.id)
                          ? <Loader2 size={15} className="animate-spin" />
                          : <FileDown size={15} />}
                      </button>
                    </div>
                  </td>}
                </tr>
                );
              })}
            </tbody>
            {visibleInvoices.length > 0 && (() => {
              const src = hasSelection
                ? visibleInvoices.filter(i => isSelected(i.id))
                : visibleInvoices;
              const tTotal    = src.reduce((s, i) => s + (i.totalAmount || 0), 0);
              const tSupplier = src.reduce((s, i) => s + calculateSupplierCost(i), 0);
              const tPurchase = src.reduce((s, i) => s + calculatePurchaseCost(i), 0);
              // COGS = supplier cost when purchase cost is zero, else purchase cost (mutually exclusive per invoice)
              const tCogs     = src.reduce((s, i) => {
                const sc = calculateSupplierCost(i);
                const pc = calculatePurchaseCost(i);
                return s + (sc > 0 && pc === 0 ? sc : pc);
              }, 0);
              const tMisc     = src.reduce((s, i) => s + (Number(i.miscExpense) || 0), 0);
              const tShipping = src.reduce((s, i) => s + (Number((i as any).cargoAmount)      || 0), 0);
              const tDiscount = src.reduce((s, i) => s + (Number((i as any).deductionCharges) || 0), 0);
              const tNet      = tTotal - tDiscount - tMisc;
              const tNetProfit = tNet - tCogs - tShipping;
              const tPaid     = src.reduce((s, i) => s + calculatePaidAmount(i), 0);
              const tLeft     = src.reduce((s, i) => s + calculateRemainingAmount(i), 0);
              return (
                <tfoot>
                  <tr style={{ backgroundColor: '#0f172a' }}>
                    {/* Label cell */}
                    <td colSpan={Math.max(1, invLabelColsVisible + 1)} style={{ padding: '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                          {hasSelection ? `${src.length} selected` : `All ${src.length}`}
                        </span>
                        {hasSelection && (
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 99, backgroundColor: '#1e293b', color: '#94a3b8', fontWeight: 700 }}>
                            of {visibleInvoices.length} total
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Amount */}
                    {cols.isVisible(`Amount (${getGlobalCurrencySymbol()})`) && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Amount</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{formatDisplay(tTotal)}</div>
                    </td>}
                    {/* Supplier Cost */}
                    {cols.isVisible('Supplier Cost') && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Supplier</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#94a3b8' }}>
                        {src.some(i => calculateSupplierCost(i) > 0 && calculatePurchaseCost(i) === 0)
                          ? formatDisplay(src.filter(i => calculatePurchaseCost(i) === 0).reduce((s, i) => s + calculateSupplierCost(i), 0))
                          : '—'}
                      </div>
                    </td>}
                    {/* Purchase Cost */}
                    {cols.isVisible('Purchase Cost') && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Purchase</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#94a3b8' }}>{tPurchase > 0 ? formatDisplay(tPurchase) : '—'}</div>
                    </td>}
                    {/* COGS per-column removed — total displayed in the trailing summary cell */}
                    {/* Shipping */}
                    {cols.isVisible('Shipping') && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Shipping</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: tShipping > 0 ? '#e2e8f0' : '#94a3b8' }}>{tShipping > 0 ? formatDisplay(tShipping) : '—'}</div>
                    </td>}
                    {/* Discount */}
                    {cols.isVisible('Discount') && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Discount</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: tDiscount > 0 ? '#fca5a5' : '#94a3b8' }}>{tDiscount > 0 ? `−${formatDisplay(tDiscount)}` : '—'}</div>
                    </td>}
                    {/* Misc Exp */}
                    {cols.isVisible('Misc Exp') && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Misc Exp</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#fca5a5' }}>{tMisc > 0 ? formatDisplay(tMisc) : '—'}</div>
                    </td>}
                    {/* Net Sale */}
                    {cols.isVisible('Net Sale') && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', borderLeft: '1px solid #1e293b' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Net Sale</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{formatDisplay(tNet)}</div>
                    </td>}
                    {/* Net Profit */}
                    {cols.isVisible('Net Profit') && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Net Profit</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: tNetProfit >= 0 ? '#86efac' : '#fca5a5' }}>
                        {tNetProfit >= 0 ? formatDisplay(tNetProfit) : `−${formatDisplay(Math.abs(tNetProfit))}`}
                      </div>
                    </td>}
                    {/* Paid */}
                    {cols.isVisible('Paid') && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Paid</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#86efac' }}>{tPaid > 0 ? formatDisplay(tPaid) : '—'}</div>
                    </td>}
                    {/* Amount Left */}
                    {cols.isVisible('Amount Left') && <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Left</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: tLeft > 0 ? '#fca5a5' : '#86efac' }}>
                        {tLeft > 0 ? formatDisplay(tLeft) : '—'}
                      </div>
                    </td>}
                    {/* COGS grand total displayed here — no per-row column above, just the sum at the end */}
                    <td colSpan={Math.max(1, invTrailingColsVisible)} style={{ padding: '10px 12px', whiteSpace: 'nowrap', borderLeft: '1px solid #1e293b' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>COGS Total</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#c4b5fd' }}>
                        {tCogs > 0 ? formatDisplay(tCogs) : '—'}
                      </div>
                    </td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </LockedScrollTable>
        <PaginationBar controller={pg} />
      </div>

      {/* ── Payment Modal ── */}
      {paymentInvoice && (
        <PaymentModal invoice={paymentInvoice} banks={banks} isSaving={isRecordingPayment}
          onClose={closePayment} onSubmit={submitPayment} formatDisplay={formatDisplay} />
      )}

      {/* ── View Modal ── */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">

            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Invoice Details</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{viewingInvoice.invoiceNumber}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadPdf(viewingInvoice)}
                  disabled={generatingPdf.has(viewingInvoice.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-40">
                  {generatingPdf.has(viewingInvoice.id)
                    ? <><Loader2 size={13} className="animate-spin" /> Generating…</>
                    : <><FileDown size={14} /> Download PDF</>}
                </button>
                <button onClick={onCloseView} className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">

              {/* ── Customer & Invoice Info ── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Customer & Invoice</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-gray-500">Invoice #</p><p className="font-medium">{viewingInvoice.invoiceNumber}</p></div>
                  <div><p className="text-gray-500">Date</p><p className="font-medium">{formatDate(viewingInvoice.date)}</p></div>
                  <div>
                    <p className="text-gray-500">Customer</p>
                    <p className="font-medium">{viewingInvoice.customerName}</p>
                    <p className="text-xs text-gray-400">{viewingInvoice.customerPhone}</p>
                    {viewingInvoice.customerPhone2 && <p className="text-xs text-gray-400">{viewingInvoice.customerPhone2}</p>}
                  </div>
                  <div><p className="text-gray-500">CNIC</p><p className="font-medium font-mono text-xs">{viewingInvoice.customerCNIC}</p></div>
                  <div>
                    <p className="text-gray-500">Location</p>
                    <p className="font-medium">{viewingInvoice.customerCity}{viewingInvoice.customerProvince ? `, ${viewingInvoice.customerProvince}` : ''}</p>
                    {viewingInvoice.customerAddress && <p className="text-xs text-gray-400 mt-0.5">{viewingInvoice.customerAddress}</p>}
                  </div>
                  {viewingInvoice.warrantyLocation && (
                    <div><p className="text-gray-500">Warranty Location</p><p className="font-medium">{viewingInvoice.warrantyLocation}</p></div>
                  )}
                </div>
              </div>

              {/* ── Branch / Sales Info ── */}
              {(viewingInvoice.salesperson || viewingInvoice.salespersonLocation || viewingInvoice.clientDealBy || viewingInvoice.referralBy || viewingInvoice.createdBy || viewingInvoice.productLocation) && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Building2 size={12} /> Branch & Sales Info
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {viewingInvoice.salesperson && (
                      <div><p className="text-gray-500">Salesperson</p><p className="font-medium">{spName(viewingInvoice.salesperson)}</p></div>
                    )}
                    {viewingInvoice.salespersonLocation && (
                      <div><p className="text-gray-500">Branch / Location</p><p className="font-medium">{viewingInvoice.salespersonLocation}</p></div>
                    )}
                    {viewingInvoice.clientDealBy && (
                      <div><p className="text-gray-500">Client Deal By</p><p className="font-medium">{spName(viewingInvoice.clientDealBy)}</p></div>
                    )}
                    {viewingInvoice.referralBy && (
                      <div><p className="text-gray-500">Referral By</p><p className="font-medium">{viewingInvoice.referralBy}</p></div>
                    )}
                    {viewingInvoice.createdBy && (
                      <div><p className="text-gray-500">Created By</p><p className="font-medium">{spName(viewingInvoice.createdBy)}</p></div>
                    )}
                    {viewingInvoice.productLocation && (
                      <div><p className="text-gray-500">Product / Stock Location</p><p className="font-medium">{viewingInvoice.productLocation}</p></div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Products ── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Products</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Product</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Qty</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Serials</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingInvoice.products.map((p, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                                                    <td className="px-3 py-2.5">
                            {/* Same brand-repeat problem as the list table. */}
                            <p className="font-medium text-gray-900">{(p.brandName || '').trim() || p.productName}</p>
                            {(() => {
                              const brand = (p.brandName || '').trim();
                              const model = (p.modelName || '').trim();
                              const short = brand && model.toLowerCase().startsWith(brand.toLowerCase())
                                ? model.slice(brand.length).trim() : model;
                              return short ? <p className="text-xs text-gray-500">{short}</p> : null;
                            })()}
                            {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">{p.quantity} × {formatDisplay(p.price)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {(p.serialNumbers || []).map(s => (
                                <span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">{s}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium">{formatDisplay(p.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Delivery ── */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 mb-1">Delivery Status</p>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${deliveryBadge(viewingInvoice.deliveryStatus)}`}>
                    {viewingInvoice.deliveryStatus}
                  </span>
                </div>
                <div>
                  <p className="text-gray-500 mb-1">Received Status</p>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${receivedBadge(viewingInvoice.deliveryReceivedStatus)}`}>
                    {viewingInvoice.deliveryReceivedStatus}
                  </span>
                </div>
                {viewingInvoice.collectionMethod && (
                  <div>
                    <p className="text-gray-500 mb-1">Collection Method</p>
                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                      {viewingInvoice.collectionMethod}
                    </span>
                  </div>
                )}
              </div>

              {/* ── Payment ── */}
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <CreditCard size={12} /> Payment Details
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">Pay Status</p>
                    <span className={`inline-flex mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${
                      viewingInvoice.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>{viewingInvoice.status}</span>
                  </div>
                  {viewingInvoice.paymentMode && (
                    <div><p className="text-gray-500">Mode</p><p className="font-medium">{viewingInvoice.paymentMode}</p></div>
                  )}
                  {viewingInvoice.paymentStatus && (
                    <div><p className="text-gray-500">Full / Partial</p><p className="font-medium">{viewingInvoice.paymentStatus}</p></div>
                  )}
                  {viewingInvoice.paymentStatus === 'Partial' && (
                    <>
                      <div><p className="text-gray-500">Paid Amount</p><p className="font-medium text-green-700">{formatDisplay(viewingInvoice.paidAmount || 0)}</p></div>
                      <div><p className="text-gray-500">Remaining</p><p className="font-medium text-red-600">{formatDisplay(viewingInvoice.remainingAmount || 0)}</p></div>
                    </>
                  )}
                  {viewingInvoice.paymentMode === 'Online' && viewingInvoice.bankName && (
                    <>
                      <div><p className="text-gray-500">Bank</p><p className="font-medium">{viewingInvoice.bankName}</p></div>
                      {viewingInvoice.bankAccountNumber && (
                        <div><p className="text-gray-500">Account #</p><p className="font-mono text-xs">{viewingInvoice.bankAccountNumber}</p></div>
                      )}
                    </>
                  )}
                  {viewingInvoice.paidBy && <div><p className="text-gray-500">Paid By</p><p className="font-medium">{viewingInvoice.paidBy}</p></div>}
                  {viewingInvoice.paidTo && <div><p className="text-gray-500">Paid To</p><p className="font-medium">{viewingInvoice.paidTo}</p></div>}
                </div>
              </div>

              {/* ── Totals ── */}
              <div className="border border-gray-200 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">{formatDisplay(viewingInvoice.totalAmount)}</span>
                </div>
                {(viewingInvoice.deductionCharges || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Deduction Charges</span>
                    <span className="text-red-600 font-medium">−{formatDisplay(viewingInvoice.deductionCharges)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-gray-200 pt-2 mt-1">
                  <span className="text-base font-bold text-gray-900">Net Total</span>
                  <span className="text-2xl font-bold text-gray-800">
                    {formatDisplay(viewingInvoice.totalAmount - (viewingInvoice.deductionCharges || 0))}
                  </span>
                </div>
              </div>

              {viewingInvoice.exchangeWarrantyNote && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                  <p className="text-xs font-semibold text-yellow-700 mb-1">Exchange / Warranty Note</p>
                  <p className="text-gray-700">{viewingInvoice.exchangeWarrantyNote}</p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Misc Expense Modal removed — add misc expenses from the Transactions module */}

      {/* Quick Create Invoice Modal */}
      {showCreateModal && (
        <QuickInvoiceModal
          onClose={() => setShowCreateModal(false)}
          onSaved={() => { setShowCreateModal(false); }}
        />
      )}

      {/* PDF Preview Modal */}
      {(previewUrl || previewLoading) && createPortal(
        <div onClick={closePdfPreview}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '82vw', maxWidth: 960, height: '90vh', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Invoice Preview</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {previewUrl && (
                  <button onClick={() => { const a = document.createElement('a'); a.href = previewUrl!; a.download = 'invoice.pdf'; a.click(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 7, border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    <FileDown size={14} /> Download
                  </button>
                )}
                <button onClick={closePdfPreview}
                  style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 18, fontWeight: 700 }}>
                  ×
                </button>
              </div>
            </div>
            {previewLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#64748b', fontSize: 14 }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Generating PDF…
              </div>
            ) : previewUrl ? (
              <iframe ref={previewRef} src={previewUrl} style={{ flex: 1, border: 'none', width: '100%' }} title="Invoice PDF Preview" />
            ) : null}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}