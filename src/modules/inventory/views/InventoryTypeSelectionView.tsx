// Inventory Module - View Layer
// Single unified form — add one or multiple products at once
// "+ Add Another Product" adds more brand/model rows inline

import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Check, Plus, Trash2, Loader2, Banknote,
  Building2, CreditCard, X, ChevronDown, MapPin,
  Wallet, Users, ImagePlus,
} from 'lucide-react';
import { collection, getDocs, query, orderBy, where, limit } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { toast } from 'sonner';
import {
  InventoryFirebaseService,
  BrandModelFirebaseService,
  generateInventoryTransactionId,
  uploadInventoryImages,
} from '../models/InventoryFirebaseService';
import {
  fetchModelProfileByName,
  saveModelProfileByName,
} from '../models/BrandModelService';
import { LocationSelector } from './LocationSelector';
import { CATEGORIES } from '../viewModels/useInventoryMultimodelViewModel';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';
import { useNavigate } from 'react-router-dom';
import { PurchasedOrderFirebaseService } from '../../purchased-orders/models/purchasedOrderFirebaseService';
import type { Shipment } from '../../purchased-orders/models/types';
import {
  stockInLines, suggestedSellPrice,
  type StockInLine,
} from '../models/shipmentStockIn';

/** Default margin on stock brought in from a shipment. Editable per row. */
const DEFAULT_MARGIN_PERCENT = 25;

interface BankOption { id: string; name: string; balance: number; }
interface BrandSuggestion { id: string; name: string; }
interface ModelSuggestion {
  id: string;
  name: string;
  costPrice?: number;
  description?: string;
  category?: string;
  sellPrice?: number;
  lastCostAt?: string;
}

// ── Product row type ───────────────────────────────────────────────────────
interface ProductRow {
  /**
   * Set when the row was filled from a shipment line.
   *
   * The cost then comes from the landed figure and is not editable — that is
   * the whole point of stocking in from a shipment rather than typing it. The
   * line id is what the save routes back to, so the units come off the right
   * line.
   */
  shipmentId?: string;
  shipmentLineId?: string;
  shipmentLine?: StockInLine;
  /**
   * A product on the SAME shipment/brand that was not itemized on the
   * manifest (the container held one more model than was listed, or one
   * arrived that nobody expected). `shipmentId` stays set — the unit is
   * still this shipment's stock and gets tagged with it on save — but
   * there is no `shipmentLineId` to fill the row from, so Model and Cost
   * are typed by hand instead of picked from the shipment's line list.
   */
  manualModelInShipment?: boolean;
  id: string;
  brandName: string;
  modelName: string;
  category: string;
  description: string;
  quantity: number;
  costPrice: number;   // Purchasing / supplier cost — internal only
  sellPrice: number;   // Retail price — what customers see on the invoice
    serials: string[]; // one per slot
  // Stock settings are PER PRODUCT. A single shipment can land different
  // models in different branches, so location/condition/date cannot be
  // shared across rows.
    location: string;
  status: string;
  stockInDate: string;
  images: File[];
}
const S = {
  card: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' } as React.CSSProperties,
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 } as React.CSSProperties,
  inp: (err?: boolean): React.CSSProperties => ({
    width: '100%', padding: '8px 11px', borderRadius: 8,
    border: `1px solid ${err ? '#ef4444' : '#d1d5db'}`,
    backgroundColor: err ? '#fef2f2' : '#fff',
    fontSize: 13, color: '#111827', outline: 'none', boxSizing: 'border-box',
  }),
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as React.CSSProperties,
};

const PAYMENT_MODES = [
  { value: 'Cash',          label: 'Cash',   icon: Banknote,   color: '#16a34a', bg: '#f0fdf4', border: '#22c55e' },
  { value: 'Bank Transfer', label: 'Bank',   icon: Building2,  color: '#2563eb', bg: '#eff6ff', border: '#3b82f6' },
  { value: 'Cheque',        label: 'Cheque', icon: CreditCard, color: '#7c3aed', bg: '#f5f3ff', border: '#8b5cf6' },
];

function newRow(): ProductRow {
return { id: Math.random().toString(36).slice(2), brandName: '', modelName: '', category: '', description: '', quantity: 1, costPrice: 0, sellPrice: 0, serials: [], location: '', status: 'New', stockInDate: '', images: [] };
}
// ── Brand/model autocomplete for a single row ──────────────────────────────
function BrandModelInputs({ row, onChange, brandSuggestions, modelSuggestions, onBrandSelect, onModelSelect, error, isCredit, shipmentLines, onModelPick }: {
  shipmentLines?: StockInLine[];
  onModelPick?: (lineId: string) => void;
  row: ProductRow;
  onChange: (field: keyof ProductRow, val: any) => void;
  brandSuggestions: BrandSuggestion[];
  modelSuggestions: ModelSuggestion[];
  onBrandSelect: (name: string) => void;
  onModelSelect: (name: string, model?: ModelSuggestion) => void;
  error?: { brand?: string; model?: string; category?: string; cost?: string; retail?: string; serials?: string; quantity?: string };
  isCredit: boolean;
}) {
  // Follows the Admin's global currency setting — symbol-only, no conversion.
  const { symbol: currencySymbol } = useGlobalCurrency();
  const [openBrand, setOpenBrand] = useState(false);
  const [openModel, setOpenModel] = useState(false);
  const brandRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (brandRef.current && !brandRef.current.contains(e.target as Node)) setOpenBrand(false);
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setOpenModel(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filteredBrands = row.brandName.trim()
    ? brandSuggestions.filter(b => b.name.toLowerCase().includes(row.brandName.toLowerCase()))
    : brandSuggestions;
  const filteredModels = row.modelName.trim()
        ? modelSuggestions.filter(m => m.name.toLowerCase().includes(row.modelName.toLowerCase()))
    : modelSuggestions;

  // A typed name that matches nothing on file is about to create a NEW brand or
  // model on save. Surfacing that as an explicit row makes the consequence
  // visible — a stray space or typo used to create a silent duplicate.
  const typedBrand = row.brandName.trim();
  const typedModel = row.modelName.trim();
  const showAddBrand = typedBrand.length > 0 &&
    !brandSuggestions.some(b => b.name.trim().toLowerCase() === typedBrand.toLowerCase());
  const showAddModel = typedModel.length > 0 && typedBrand.length > 0 &&
    !modelSuggestions.some(m => m.name.trim().toLowerCase() === typedModel.toLowerCase());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={S.grid2}>
        {/* Brand — locked to the shipment's brand when this row came from one;
            typed by hand otherwise (the plain On-Credit / manual path). */}
        <div ref={brandRef}>
          <label style={S.label}>Brand <span style={{ color: '#ef4444' }}>*</span></label>
          {row.shipmentId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', minHeight: 36, boxSizing: 'border-box' }}>
              <Building2 size={14} color="#94a3b8" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{row.brandName || '—'}</span>
            </div>
          ) : (
          <div style={{ position: 'relative' }}>
            <input type="text" value={row.brandName}
              onChange={e => { onChange('brandName', e.target.value); onChange('modelName', ''); setOpenBrand(true); }}
              onFocus={() => setOpenBrand(true)}
              placeholder="Type brand…" autoComplete="off"
              style={S.inp(!!error?.brand)} />
                        {openBrand && (filteredBrands.length > 0 || showAddBrand) && (
              <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 99, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxHeight: 180, overflowY: 'auto' }}>
                {filteredBrands.map(b => (
                  <div key={b.id} onMouseDown={e => { e.preventDefault(); onChange('brandName', b.name); onBrandSelect(b.name); setOpenBrand(false); }}
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#111827' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}>{b.name}</div>
                ))}
                {showAddBrand && (
                  <div onMouseDown={e => { e.preventDefault(); onBrandSelect(row.brandName.trim()); setOpenBrand(false); }}
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#2563eb', fontWeight: 600, borderTop: filteredBrands.length ? '1px solid #f1f5f9' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}>
                    <Plus size={13} /> Add "{row.brandName.trim()}" as new brand
                  </div>
                )}
              </div>
            )}
            {error?.brand && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{error.brand}</p>}
          </div>
          )}
        </div>

        {/* Model — the shipment's own line list when this row came from one
            (this is the ONLY model control in that case — it used to also
            render the free-text box below, so "Model" showed up twice on the
            same row); typed by hand otherwise. A shipment row can also drop
            into hand-typed Model via "+ New model on this shipment" below —
            it keeps shipmentId (still tagged to this shipment on save) but
            has no line to fill itself from. */}
        <div ref={modelRef}>
          <label style={S.label}>Model <span style={{ color: '#ef4444' }}>*</span></label>
          {row.shipmentId && !row.manualModelInShipment ? (
            <div style={{ position: 'relative' }}>
              <select value={row.shipmentLineId || ''}
                onChange={e => onModelPick?.(e.target.value)}
                style={{ ...S.inp(!!error?.model), appearance: 'none', paddingRight: 28, cursor: 'pointer' }}>
                <option value="">Select model…</option>
                {(shipmentLines || []).map(l => (
                  <option key={l.lineId} value={l.lineId}>
                    {l.modelName || l.productName} — {l.remaining} remaining
                  </option>
                ))}
                <option value="__new__">+ New model on this shipment (not on the list)</option>
              </select>
              <ChevronDown size={13} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#9ca3af' }} />
              {error?.model && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{error.model}</p>}
              {row.shipmentLine && (
                <p style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d', marginTop: 4 }}>
                  {row.shipmentLine.remaining} unit{row.shipmentLine.remaining === 1 ? '' : 's'} left on this shipment
                </p>
              )}
            </div>
          ) : row.shipmentId ? (
            <div>
              <input type="text" value={row.modelName}
                onChange={e => onChange('modelName', e.target.value)}
                placeholder="Type the model name…" autoComplete="off"
                style={S.inp(!!error?.model)} />
              {error?.model && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{error.model}</p>}
              <p style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>
                Still tagged to this shipment · not on its manifest, so cost is typed, not landed ·{' '}
                <span
                  onClick={() => { onChange('manualModelInShipment', false); onChange('modelName', ''); }}
                  style={{ color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}
                >
                  choose from the shipment's list instead
                </span>
              </p>
            </div>
          ) : (
          <div style={{ position: 'relative' }}>
            <input type="text" value={row.modelName}
              onChange={e => { onChange('modelName', e.target.value); setOpenModel(true); }}
              onFocus={() => setOpenModel(true)}
              placeholder="Type model…" autoComplete="off"
              style={S.inp(!!error?.model)} />
              {openModel && (filteredModels.length > 0 || showAddModel) && (
              <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 99, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxHeight: 180, overflowY: 'auto' }}>
                {filteredModels.map(m => (
                  <div key={m.id} onMouseDown={e => { e.preventDefault(); onChange('modelName', m.name); onModelSelect(m.name, m); setOpenModel(false); }}
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#111827' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                                        {m.costPrice ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{currencySymbol} {m.costPrice.toLocaleString()}</div> : null}
                  </div>
                ))}
                {showAddModel && (
                  <div onMouseDown={e => { e.preventDefault(); setOpenModel(false); }}
                    style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#2563eb', fontWeight: 600, borderTop: filteredModels.length ? '1px solid #f1f5f9' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}>
                    <Plus size={13} /> Add "{row.modelName.trim()}" as new model
                  </div>
                )}
              </div>
            )}
            {error?.model && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{error.model}</p>}
          </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
        {/* Category — always a real category picker now. It used to double as
            the shipment's model list, so a row filled from a shipment could
            never have its category set at all. */}
        <div>
          <label style={S.label}>Category <span style={{ color: '#ef4444' }}>*</span></label>
          <div style={{ position: 'relative' }}>
            <select value={row.category} onChange={e => onChange('category', e.target.value)}
              style={{ ...S.inp(!!error?.category), appearance: 'none', paddingRight: 28, cursor: 'pointer' }}>
              <option value="">Select…</option>
              {(CATEGORIES || []).map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={13} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#9ca3af' }} />
          </div>
          {error?.category && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{error.category}</p>}
        </div>
        {/* Description — multi-line so users can enter paragraphs (made in UK / 3 years warranty / etc) */}
        <div>
          <label style={S.label}>Description</label>
          <textarea
            value={row.description}
            onChange={e => onChange('description', e.target.value)}
            placeholder={'Optional — Enter for a new line\nMade in UK\n3 years warranty'}
            rows={3}
            style={{
              ...S.inp(),
              height: 'auto',
              minHeight: 60,
              paddingTop: 8,
              paddingBottom: 8,
              resize: 'vertical',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              fontFamily: 'inherit',
            }}
          />
        </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 12 }}>
        {/* Qty */}
        <div>
          <label style={S.label}>Qty</label>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button type="button" onClick={() => { const n = Math.max(1, row.quantity - 1); onChange('quantity', n); onChange('serials', row.serials.slice(0, n)); }}
              style={{ width: 26, height: 36, border: '1px solid #d1d5db', borderRight: 'none', borderRadius: '7px 0 0 7px', backgroundColor: '#f3f4f6', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>−</button>
            <input type="number" min={1} value={row.quantity}
              onChange={e => { const n = Math.max(1, parseInt(e.target.value)||1); onChange('quantity', n); if (n < row.serials.length) onChange('serials', row.serials.slice(0, n)); }}
              style={{ width: 30, height: 36, border: '1px solid #d1d5db', textAlign: 'center', fontSize: 13, fontWeight: 700, outline: 'none' }} />
            <button type="button" onClick={() => onChange('quantity', row.quantity + 1)}
              style={{ width: 26, height: 36, border: '1px solid #d1d5db', borderLeft: 'none', borderRadius: '0 7px 7px 0', backgroundColor: '#f3f4f6', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>+</button>
          </div>
        </div>
        {/* Cost — label switches with ownership type:
              • Owned (Against Payment) → Purchasing Cost (bought outright)
              • Credit (On Credit)      → Supplier Cost   (owed to supplier)
             Either way it writes to row.costPrice and is internal only. */}
        <div>
          <label style={S.label} title={isCredit
            ? 'What you owe the supplier per unit. Recorded as a payable until settled.'
            : 'What you paid to buy this stock. Used for internal valuation only.'}>
            {isCredit ? 'Supplier Cost' : 'Purchasing Cost'} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({currencySymbol})</span> <span style={{ color: '#ef4444' }}>*</span>
          </label>
          {/* Editable on every row, including the ones filled from a shipment.
              The landed figure is a strong default, not a lock — a clerk who
              can see it is wrong and cannot change it will enter the product
              somewhere else instead. */}
          <input type="number" min={0} step="any" value={row.costPrice || ''}
            onChange={e => onChange('costPrice', parseFloat(e.target.value) || 0)}
            placeholder="0.00" style={S.inp(!!error?.cost)} />
          {error?.cost && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{error.cost}</p>}
        </div>
        {/* Retail Price — customer-facing, appears on the invoice */}
        <div>
          <label style={S.label} title="What customers pay. This is the price that appears on their sales invoice.">
            Retail Price <span style={{ color: '#9ca3af', fontWeight: 400 }}>({currencySymbol})</span> <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input type="number" min={0} step="any" value={row.sellPrice || ''}
            onChange={e => onChange('sellPrice', parseFloat(e.target.value) || 0)}
            placeholder="0.00" style={S.inp(!!error?.retail)} />
          {error?.retail && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{error.retail}</p>}
        </div>
      </div>

      {/* Cost breakdown — what makes up the landed figure above. Given its own
          full-width row (rather than squeezed inside the Cost field's own
          narrow column) so five numbers actually have room to read clearly.
          A locked figure with no working behind it is the first thing people
          stop trusting. */}
      {row.shipmentLine && (
        <div style={{ padding: '10px 14px', borderRadius: 8,
                      border: '1px solid #e2e8f0', backgroundColor: '#fbfcfe' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8',
                        textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Cost Breakdown — per unit
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {([
              ['Goods',   row.shipmentLine.goodsPerUnit],
              ['Customs', row.shipmentLine.customsPerUnit],
              ['Freight', row.shipmentLine.freightPerUnit],
              ['Tax',     row.shipmentLine.taxPerUnit],
              ['Other',   row.shipmentLine.otherPerUnit],
            ] as Array<[string, number]>).map(([lbl, v]) => (
              <div key={lbl}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8',
                              textTransform: 'uppercase', letterSpacing: '.04em' }}>{lbl}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700,
                              color: v > 0 ? '#0f172a' : '#cbd5e1',
                              fontVariantNumeric: 'tabular-nums' }}>{v.toFixed(2)}</div>
              </div>
            ))}
          </div>
          {row.shipmentLine.stocked > 0 && (
            <p style={{ fontSize: 10.5, color: '#b45309', margin: '9px 0 0', lineHeight: 1.5 }}>
              {row.shipmentLine.stocked} unit{row.shipmentLine.stocked === 1 ? '' : 's'} already went out at a
              lower cost. Charges paid since then land on the {row.shipmentLine.remaining} still here, so this
              is higher than the shipment average.
            </p>
          )}
        </div>
      )}
      </div>

      {/* Serial slots — REQUIRED, one per unit */}
      <div>
        <label style={S.label}>
          Serial Numbers <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: row.quantity }).map((_, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#94a3b8', width: 24, textAlign: 'right', flexShrink: 0 }}>#{idx+1}</span>
              <input type="text" value={row.serials[idx] || ''}
                onChange={e => { const next = [...row.serials]; next[idx] = e.target.value; onChange('serials', next); }}
                placeholder={`Serial #${idx+1}`}
                style={{ ...S.inp(!!error?.serials), fontSize: 12, flex: 1 }} />
            </div>
          ))}
        </div>
        {error?.serials && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{error.serials}</p>}
        {row.costPrice > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
            Subtotal: <strong style={{ color: '#0f172a' }}>{currencySymbol} {(row.costPrice * (row.serials.filter(s=>s.trim()).length || row.quantity)).toLocaleString()}</strong>
            <span style={{ marginLeft: 8, color: '#94a3b8' }}>({row.serials.filter(s=>s.trim()).length || row.quantity} unit{(row.serials.filter(s=>s.trim()).length || row.quantity)!==1?'s':''})</span>
          </div>
        )}
      </div>
    </div>
  );
}
// ── Per-product image picker ──────────────────────────────────────────────
// Each row owns its own File[] plus its own input ref and drag state. A single
// shared ref would target whichever picker rendered last, so clicking row 2's
// dropzone opened row 1's file dialog.
function ProductImages({ images, onChange }: {
  images: File[];
  onChange: (next: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const add = (files: FileList | File[]) =>
    onChange([...images, ...Array.from(files).filter(f => f.type.startsWith('image/'))]);

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #e2e8f0' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ImagePlus size={14} /> Product Images <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
      </div>
      <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{ border: `2px dashed ${dragging ? '#6366f1' : '#d1d5db'}`, borderRadius: 10, padding: '16px', textAlign: 'center', cursor: 'pointer', backgroundColor: dragging ? '#f0f4ff' : '#f9fafb', marginBottom: images.length ? 12 : 0 }}>
        <ImagePlus size={19} color={dragging ? '#6366f1' : '#94a3b8'} style={{ margin: '0 auto 5px' }} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#6b7280' }}>Click or drag &amp; drop images</p>
        <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: 'none' }}
          onChange={e => { add(e.target.files || []); e.target.value = ''; }} />
      </div>
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {images.map((file, i) => {
            const url = URL.createObjectURL(file);
            return (
              <div key={i} style={{ position: 'relative', width: 68, height: 68, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                <img src={url} alt="" onLoad={() => URL.revokeObjectURL(url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button type="button" onClick={e => { e.stopPropagation(); onChange(images.filter((_, j) => j !== i)); }}
                  style={{ position: 'absolute', top: 2, right: 2, width: 17, height: 17, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <X size={9} color="#fff" strokeWidth={3} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// ── Main component ────────────────────────────────────────────────────────────
export const InventoryTypeSelectionView: React.FC<{ handleBack?: () => void; onClose?: () => void }> = ({ onClose }) => {
  // Follows the Admin's global currency setting — symbol-only, no conversion.
  const { symbol: currencySymbol } = useGlobalCurrency();
  const navigate  = useNavigate();
  const afterSave = () => { if (onClose) { onClose(); } else { navigate('/inventory'); } };

  // ── Ownership ─────────────────────────────────────────────────────────────
  const [ownership, setOwnership] = useState<'Owned'|'Credit'>('Owned');
  const isCredit = ownership === 'Credit';

  // ── Source ────────────────────────────────────────────────────────────────
  // Source is no longer a separate choice the clerk makes — it follows the
  // Ownership Type directly: Against Payment (Owned) is always filled from a
  // shipment (that is what "paying the supplier now" against a landed order
  // means), while On Credit stays a plain, simple hand-entry row exactly like
  // this screen worked before the shipment flow existed — no shipment picker,
  // no margin field.
  const source: 'manual' | 'shipment' = ownership === 'Owned' ? 'shipment' : 'manual';
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [shipmentId, setShipmentId] = useState('');
  const [marginPercent, setMarginPercent] = useState(DEFAULT_MARGIN_PERCENT);

  // Loaded when the shipment path is first chosen. Nobody opening this screen
  // to type a product by hand should wait for a collection read.
  useEffect(() => {
    if (source !== 'shipment' || shipments.length > 0 || shipmentsLoading) return;
    setShipmentsLoading(true);
    PurchasedOrderFirebaseService.fetchAll()
      // Only shipments with something left. One where every unit is already in
      // stock is not a choice — it is a row that cannot be acted on, and a list
      // of them hides the ones that can.
      .then(list => setShipments(
        list.filter(sh => sh.status !== 'Cancelled' && stockInLines(sh).length > 0)))
      .catch(() => toast.error('Could not load shipments'))
      .finally(() => setShipmentsLoading(false));
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedShipment = shipments.find(sh => sh.id === shipmentId) || null;

  // ── Product rows ──────────────────────────────────────────────────────────
  const [rows, setRows] = useState<ProductRow[]>([newRow()]);
  const [rowErrors, setRowErrors] = useState<Record<string, any>>({});

  // Switching to On Credit drops any shipment this row was linked to — Credit
  // rows are always plain hand entry, so a leftover shipmentId here would
  // still try to deduct stock off that shipment on save, and would still show
  // the shipment's model list instead of a normal Category field below.
  useEffect(() => {
    if (ownership !== 'Credit') return;
    setShipmentId('');
    setRows(prev => prev.map(r => (r.shipmentId
      ? { ...r, shipmentId: undefined, shipmentLineId: undefined, shipmentLine: undefined, manualModelInShipment: false }
      : r)));
  }, [ownership]);

  const updateRow = (id: string, field: keyof ProductRow, val: any) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));

  /**
   * Fill one row per shipment line.
   *
   * A shipment has several lines and this form has several rows, so the whole
   * order goes in at once — the clerk types serials and a retail price and
   * nothing else. Lines with nothing left are skipped: a row nobody can fill
   * is a row that hides the ones they can.
   */
  /**
   * Attach the shipment to every row, without filling them.
   *
   * The clerk picks the model per row from the dropdown that is already there.
   * Filling one row per line looked helpful and was not: it produced rows
   * nobody asked for and buried the choice they had come to make.
   */
  const attachShipment = (sh: Shipment) => {
    setRows(prev => prev.map(r => ({
      ...r,
      brandName: sh.brandName,
      shipmentId: sh.id,
      shipmentLineId: undefined,
      shipmentLine: undefined,
      manualModelInShipment: false,
      category: '',
    })));
  };

  /**
   * Model chosen — fill the row from that line.
   *
   * Cost is the landed figure as it stands now, so a row started before a
   * customs payment and one started after carry different costs. That is the
   * point, not a fault.
   */
  /** Category this brand + model was entered as before, if it has been. */
  const modelProfileCategory = (brand: string, model: string): string => {
    for (const list of Object.values(modelSuggestionsByRow)) {
      const hit = (list || []).find(m => m.name?.toLowerCase() === model.toLowerCase());
      if (hit && (hit as any).category) return (hit as any).category;
    }
    return '';
  };

  const pickModel = (rowId: string, lineId: string) => {
    // "+ New model on this shipment" — this row is not one of the manifest's
    // lines. Keep shipmentId/brandName (it is still this shipment's stock)
    // but clear anything that pointed at a specific line, and let Model/Cost
    // be typed by hand from here on.
    if (lineId === '__new__') {
      setRows(prev => prev.map(r => r.id !== rowId ? r : {
        ...r,
        manualModelInShipment: true,
        shipmentLineId: undefined,
        shipmentLine: undefined,
        modelName: '',
        costPrice: 0,
      }));
      return;
    }

    const sh = shipments.find(x => x.id === rows.find(r => r.id === rowId)?.shipmentId);
    if (!sh) return;
    const l = stockInLines(sh).find(x => x.lineId === lineId);
    if (!l) return;

    setRows(prev => prev.map(r => r.id !== rowId ? r : {
      ...r,
      manualModelInShipment: false,
      modelName: l.modelName || l.productName,
      // Category from what this brand and model was entered as last time. The
      // dropdown that would normally set it is showing the model list, so this
      // is the only place it can come from — and for a model seen before, it is
      // the right answer with no typing.
      category:  r.category || modelProfileCategory(sh.brandName, l.modelName || l.productName) || '',
      quantity:  Math.min(r.quantity || 1, l.remaining),
      costPrice: l.landedUnitCost,
      sellPrice: suggestedSellPrice(l.landedUnitCost, marginPercent),
      serials:   Array.from({ length: Math.min(r.quantity || 1, l.remaining) }, (_, i) => r.serials[i] || ''),
      shipmentLineId: l.lineId,
      shipmentLine:   l,
    }));
  };

  // Changing the margin re-prices every shipment row that has not been typed
  // over. A row someone edited keeps what they set.
  useEffect(() => {
    if (source !== 'shipment') return;
    setRows(prev => prev.map(r => {
      if (!r.shipmentLine) return r;
      const auto = suggestedSellPrice(r.shipmentLine.landedUnitCost, marginPercent);
      return { ...r, sellPrice: auto };
    }));
  }, [marginPercent]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new row while a shipment is active must start attached to it too —
  // otherwise "+ Add Another Product" reopens a blank manual-looking row
  // (no brand, no shipmentId) in the middle of an Against-Payment batch that
  // is supposed to be shipment-only end to end.
  const addRow = () => setRows(prev => [
    ...prev,
    selectedShipment
      ? { ...newRow(), brandName: selectedShipment.brandName, shipmentId: selectedShipment.id }
      : newRow(),
  ]);
  const removeRow = (id: string) => setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);

  // ── Brand/Model suggestions per row ──────────────────────────────────────
  const [brandSuggestions, setBrandSuggestions] = useState<BrandSuggestion[]>([]);
  const [modelSuggestionsByRow, setModelSuggestionsByRow] = useState<Record<string, ModelSuggestion[]>>({});

    useEffect(() => {
    BrandModelFirebaseService.fetchAllBrands().then(setBrandSuggestions).catch(() => {});
  }, []);

  // Brand lookup runs on every keystroke. Two guards keep that sane:
  //   modelReqRef   — a per-row request counter. A response whose id no longer
  //                   matches the latest one is discarded, so a slow reply for
  //                   "Nokt" can never overwrite a fresh reply for "Nokta".
  //   modelTimerRef — 350ms debounce, so typing a 5-letter brand fires one
  //                   lookup instead of five.
  const [costHint, setCostHint] = useState<Record<string, string>>({});

  const modelReqRef   = useRef<Record<string, number>>({});
  const modelTimerRef = useRef<Record<string, any>>({});

  const loadModelsDebounced = (rowId: string, brandName: string) => {
    clearTimeout(modelTimerRef.current[rowId]);
    modelTimerRef.current[rowId] = setTimeout(() => loadModels(rowId, brandName), 350);
  };

  useEffect(() => () => {
    Object.values(modelTimerRef.current).forEach(t => clearTimeout(t));
  }, []);

    const loadModels = async (rowId: string, brandName: string) => {
    const reqId = (modelReqRef.current[rowId] || 0) + 1;
    modelReqRef.current[rowId] = reqId;

    if (!brandName.trim()) { setModelSuggestionsByRow(prev => ({ ...prev, [rowId]: [] })); return; }
    try {
            const models = await BrandModelFirebaseService.fetchModelsByBrandName(brandName.trim());
      if (modelReqRef.current[rowId] !== reqId) return;

      // WHY THIS NO LONGER QUERIES products DIRECTLY
      // --------------------------------------------
      // It used to run:
      //
      //   where('brandName','==',…) + where('modelName','==',…)
      //   + orderBy('createdAt','desc') + limit(1)
      //
      // Two equality filters plus an orderBy on a THIRD field requires a
      // composite index. Without one Firestore does not degrade — it rejects
      // the query outright at runtime. The bare `catch` then swallowed the
      // error and returned description: '' for every model, every time, with
      // nothing in the console. That is why descriptions never came back on
      // this screen no matter what was stored.
      //
      // fetchModelProfileByName is built to avoid exactly this: it uses a
      // single equality filter and narrows in memory. It also reads the model
      // doc first and falls back to the newest matching product, so it works on
      // records saved before profiles existed. Its name matching is trimmed and
      // case-insensitive, which the old query was not — "Garrett" saved once
      // and "garrett" typed later missed entirely.
      const enriched: ModelSuggestion[] = await Promise.all(models.map(async m => {
        try {
          const profile = await fetchModelProfileByName(brandName.trim(), m.modelName);
          return {
            id: m.id,
            name: m.modelName,
            costPrice: m.costPrice,
                       description: profile?.description || '',
            category:   profile?.category   || '',
            sellPrice:  profile?.sellPrice  || 0,
            lastCostAt: profile?.lastCostAt || '',
          };
        } catch (err) {
          // Logged, not swallowed. A silent empty description is
          // indistinguishable from "nothing was ever saved".
          console.warn(`[INV] description lookup failed for ${brandName}/${m.modelName}:`, err);
          return { id: m.id, name: m.modelName, costPrice: m.costPrice, description: '' };
        }
      }));
            if (modelReqRef.current[rowId] !== reqId) return;
      setModelSuggestionsByRow(prev => ({ ...prev, [rowId]: enriched }));
    } catch (err) {
      console.warn('[INV] loadModels failed:', err);
      if (modelReqRef.current[rowId] === reqId)
        setModelSuggestionsByRow(prev => ({ ...prev, [rowId]: [] }));
    }
  };

  // ── Shared fields ─────────────────────────────────────────────────────────
  
  
  // NOTE: Payment collection has been removed from the add-inventory flow.
  // Every new item is saved as `paymentStatus: 'unpaid'` and reconciled later
  // from the Transactions / Payables module. The `Credit` / `Owned` ownership
  // toggle remains because it decides whether the item shows up in Payables.

  const [txnId,    setTxnId]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    generateInventoryTransactionId().then(setTxnId).catch(() => setTxnId('TXN-'+Date.now()));
  }, []);

  const grandTotal = rows.reduce((s, r) => s + r.costPrice * (r.serials.filter(x=>x.trim()).length || r.quantity), 0);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    // Validate
    const errs: Record<string, any> = {};
    let hasErr = false;
    rows.forEach((r, i) => {
      const e: any = {};
      if (!r.brandName.trim())  { e.brand    = 'Required'; hasErr = true; }
      // In shipment mode modelName is only set once a line is picked (or typed,
      // for a new-on-this-shipment row), so this one check covers "nothing
      // chosen/typed yet" for both.
      if (!r.modelName.trim())  { e.model    = 'Required'; hasErr = true; }
      // A shipment row still needs a line UNLESS it was explicitly marked as a
      // new model on that same shipment — that one is typed by hand instead.
      if (r.shipmentId && !r.shipmentLineId && !r.manualModelInShipment) { e.model = 'Pick a model'; hasErr = true; }
      // Category is now its own field on every row — shipment rows included —
      // so it is always required, never implied by the model picked.
      if (!r.category.trim()) { e.category = 'Required'; hasErr = true; }
      // More than the shipment has left is stock that was never bought, and the
      // shipment stops balancing at the same moment.
      if (r.shipmentLine) {
        const want = r.serials.filter(x => x.trim()).length || r.quantity;
        if (want > r.shipmentLine.remaining) {
          e.cost = `Only ${r.shipmentLine.remaining} unit(s) remain on this line`;
          hasErr = true;
        }
      }

      // A cost of zero is not a free product, it is a cost nobody entered — and
      // zero cost reads as 100% margin on every report downstream. Refused
      // rather than defaulted, because a default here is silent.
      if (!r.costPrice || r.costPrice <= 0) { e.cost = 'Required'; hasErr = true; }
      if (!r.sellPrice || r.sellPrice <= 0) { e.retail = 'Required'; hasErr = true; }

      // Selling below cost is a loss on every unit, and it is the kind that
      // hides: the invoice looks normal and the margin only shows up in a
      // month-end report. Refused, not warned about — and on every row, not
      // only the ones that came from a shipment.
      if (r.costPrice > 0 && r.sellPrice > 0 && r.sellPrice < r.costPrice) {
        e.retail = `Retail cannot be below the cost of ${r.costPrice.toFixed(2)}`;
        hasErr = true;
      }

      // Serial numbers are REQUIRED, must match the row's quantity, and no duplicates
      const validSerials = r.serials.filter(s => s.trim() !== '');
      if (!r.quantity || r.quantity <= 0) {
        e.quantity = 'Must be at least 1'; hasErr = true;
      } else if (validSerials.length === 0) {
        e.serials = 'Serial numbers are required'; hasErr = true;
      } else if (validSerials.length !== r.quantity) {
        e.serials = `Provide ${r.quantity} serial${r.quantity === 1 ? '' : 's'} (${validSerials.length} filled)`; hasErr = true;
      } else if (new Set(validSerials).size !== validSerials.length) {
        e.serials = 'Duplicate serial numbers'; hasErr = true;
      }

      if (Object.keys(e).length) errs[r.id] = e;
    });
       rows.forEach((r, i) => {
      if (!r.location.trim()) { toast.error(`Product ${i + 1}: location is required`); hasErr = true; }
    });
    if (hasErr) {
      setRowErrors(errs);
      if (Object.values(errs).some((e: any) => e.serials || e.quantity)) {
        toast.error('Fix serial-number errors before saving');
      }
      return;
    }
    setRowErrors({});
    setSaving(true);
    setSaveError('');

    try {
            // manualDateIso is now derived per row inside the loop below.
      // This screen never wrote a model profile at all — it saved the product
      // and stopped, so `brandModels` docs stayed bare and there was nothing for
      // the next entry to read back.
      const profileWrites: Promise<void>[] = [];

      for (const row of rows) {
        // Ensure brand
        let brandId = brandSuggestions.find(b => b.name.toLowerCase() === row.brandName.toLowerCase())?.id || '';
        if (!brandId) {
          const created = await BrandModelFirebaseService.createBrand(row.brandName.trim());
          brandId = created.id;
          setBrandSuggestions(prev => [...prev, { id: created.id, name: created.name }]);
        }
        // Ensure model
        const rowModels = modelSuggestionsByRow[row.id] || [];
        if (!rowModels.find(m => m.name.toLowerCase() === row.modelName.toLowerCase())) {
          await BrandModelFirebaseService.createModel(brandId, row.modelName.trim(), row.costPrice).catch(() => {});
        }

        const validSerials = row.serials.filter(s => s.trim());
        const stock = validSerials.length || row.quantity;
        const seededCities: Record<string, string> = {};
                const manualDateIso = row.stockInDate ? new Date(row.stockInDate).toISOString() : undefined;
        if (row.location) validSerials.forEach(s => { seededCities[s] = row.location; });

        const dto: any = {
          brandName: row.brandName.trim(), modelName: row.modelName.trim(),
          category: row.category, description: row.description.trim(),
          // Purchasing cost is internal only. Retail (sellPrice) is what flows to
          // the invoice — see updateProductWithSelection in invoiceService.ts.
          costPrice: row.costPrice, sellPrice: row.sellPrice,
          buyType: 'Import', warrantyYears: 0, stock, location: row.location,
          serialNumbers: validSerials, serialCities: seededCities,
                    status: row.status as any, isDamaged: false, costingOption: 'without',
          ownershipType: ownership,
          // Payment collection removed — supplier balance is still recorded for
          // Credit-ownership so it shows in Payables, but no amount-paid /
          // payment-channel is captured here. Both are set later from Transactions.
          //
          // FIX: supplierCost is a PER-UNIT figure everywhere it's consumed
          // (invoiceService.calculateSupplierCost multiplies it by quantity;
          // extractCost() in the invoice form treats it as per-unit; the
          // Payables total does too). It was previously saved as the whole
          // batch's total (costPrice * stock), which then got multiplied by
          // quantity AGAIN downstream — every supplier-cost figure for a
          // multi-unit Credit batch was inflated by the batch size.
          supplierCost:          isCredit ? row.costPrice : undefined,
          supplierPaymentStatus: isCredit ? 'Unpaid' : undefined,
          supplierPaidAmount:    undefined,
          supplierPaymentChannel:undefined,
          serialStockInDatesManual: manualDateIso
            ? Object.fromEntries(validSerials.map(s => [s, manualDateIso])) : undefined,
          // The cost goes on the serial as well as the product. Two units of
          // the same model bought on different shipments cost different
          // amounts, and a single costPrice averages that away.
          serialCostPrice: Object.fromEntries(validSerials.map(s => [s, row.costPrice])),
          serialShipmentId: row.shipmentId
            ? Object.fromEntries(validSerials.map(s => [s, row.shipmentId!])) : undefined,
        };

        const totalAmount = row.costPrice * stock;
        const payInfo: any = {
          paymentStatus: 'unpaid',
          transactionId: txnId,
          totalAmount,
        };

        // Remember this row's profile against its model doc so the next entry
        // of the same brand + model prefills. Collected here, settled after the
        // loop — see the await below.
        profileWrites.push(
          saveModelProfileByName(dto.brandName, dto.modelName, {
            category:    row.category,
            description: row.description.trim(),
            sellPrice:   row.sellPrice,
                        costPrice:   row.costPrice,
            location:    row.location,
          })
        );

        // The product is created the same way whether or not it came from a
        // shipment. One write path, not two — the shipment only supplies the
        // numbers that fill the row.
        let created: any;
        try {
          console.log('[INV] dto going to createProduct:', {
            costPrice: dto.costPrice, sellPrice: dto.sellPrice,
            category: dto.category, rowCost: row.costPrice,
          });
          created = await InventoryFirebaseService.createProduct(dto, payInfo);
        } catch (createErr: any) {
          console.error('[INV] createProduct failed:', createErr?.message, createErr);
          throw createErr;
        }

        // ── Deduct from the shipment ──────────────────────────────────────
        // A separate call, after the product exists. If this fails the product
        // is still saved and the shipment still shows the units as available,
        // which a second attempt corrects. Folded into the create, a failure
        // here would lose a product that was otherwise fine.
        if (row.shipmentId && row.shipmentLineId) {
          try {
            await PurchasedOrderFirebaseService.recordStockBatch(row.shipmentId, row.shipmentLineId, {
              quantity: validSerials.length,
              landedUnitCost: row.costPrice,
              productId: created?.id,
            });
          } catch (e: any) {
            toast.warning(
              `${row.brandName} ${row.modelName} saved, but the shipment was not updated: `
              + `${e?.message || 'unknown error'}`,
            );
          }
        }

        // ── Image upload ──────────────────────────────────────────────────────
        // Previously: `if (images.length > 0 && rows.indexOf(row) === 0)` — this
        //   only attached images to the FIRST product in a batch. If a user
        //   added images and then reordered / added another row above, or
        //   simply added a second product first, no images were saved.
        // Now: we attach the batch of images to EVERY product in the batch
        //   (each product ends up with the same imageUrls), and we scream in
        //   the console + a toast if anything at all fails.
        if (row.images.length > 0) {
          const createdId = created?.id;
          if (!createdId) {
            console.error('[INV] âŒ Cannot upload images: created product has no .id. created =', created);
            toast.error('Product saved but images could not be linked (no product id returned).');
          } else {
            try {
              console.log('[INV] Uploading', row.images.length, 'image(s) for product', createdId);
            const urls = await uploadInventoryImages(row.images, createdId);
              console.log('[INV] uploadInventoryImages returned:', urls);
              if (!Array.isArray(urls) || urls.length === 0) {
                console.error('[INV] âŒ uploadInventoryImages returned empty/invalid:', urls);
                toast.error('Image upload returned no URLs. Check Storage rules / network.');
              } else {
                await InventoryFirebaseService.updateProduct(createdId, { imageUrls: urls } as any);
                console.log('[INV] ✅ imageUrls persisted on product', createdId, ':', urls);
              }
            } catch (imgErr: any) {
              // Loud — the user was seeing this fail silently.
              console.error('[INV] âŒ Image upload FAILED for product', createdId, ':', imgErr);
              toast.error(`Image upload failed: ${imgErr?.message || 'Unknown error'}. Product saved without image.`);
            }
          }
        }
      }

      // AWAITED BEFORE afterSave(). afterSave() either closes the modal or
      // navigates, and saveModelProfileByName makes three sequential Firestore
      // round-trips (read brands → read models → write). Un-awaited, it is still
      // in flight when this component unmounts and the write is dropped — the
      // product saves fine, so nothing looks wrong until the next entry comes
      // back blank.
      //
      // allSettled, never all: failed profile bookkeeping must not turn a
      // successful product save into an error.
      if (profileWrites.length > 0) {
        const results = await Promise.allSettled(profileWrites);
        const rejected = results.filter(r => r.status === 'rejected').length;
        if (rejected > 0) {
          console.warn(`[INV] ${rejected} model-profile write(s) failed — descriptions may not prefill next time`);
        }
      }

      console.log('[INV] All products saved successfully');
      toast.success(`✅ ${rows.length} product${rows.length > 1 ? 's' : ''} added to inventory`);
      afterSave();
    } catch (err: any) {
      console.error('[INV] Save error:', err);
      const msg = err?.message || 'Failed to save inventory';
      setSaveError(msg);
      toast.error(msg);
      alert(`âŒ Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f8fafc' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => afterSave()} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={17} color="#64748b" />
        </button>
        <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={17} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Add Inventory</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>TXN: {txnId || '…'}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Ownership ──
            Moved ahead of Shipment so ownership is decided first — same
            block as before, just reordered, nothing inside it changed. */}
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Ownership Type</div>
          <div style={S.grid2}>
            {[
              { value: 'Owned',  label: 'Owned Inventory',       sub: 'Paying supplier now',   Icon: Wallet, color: '#15803d', bg: '#f0fdf4', border: '#22c55e' },
              { value: 'Credit', label: 'Third-party Inventory', sub: 'Pay supplier later',    Icon: Users,  color: '#b45309', bg: '#fffbeb', border: '#f59e0b' },
            ].map(opt => {
              const sel = ownership === opt.value;
              return (
                <button key={opt.value} type="button" onClick={() => setOwnership(opt.value as any)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, cursor: 'pointer', border: `2px solid ${sel ? opt.border : '#e5e7eb'}`, backgroundColor: sel ? opt.bg : '#fff', transition: 'all 0.15s' }}>
                  <div style={{ padding: 7, borderRadius: 8, backgroundColor: sel ? `${opt.border}25` : '#f1f5f9' }}>
                    <opt.Icon size={19} color={sel ? opt.color : '#94a3b8'} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sel ? opt.color : '#374151' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: sel ? opt.color : '#9ca3af' }}>{opt.sub}</div>
                  </div>
                  {sel && <span style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: '50%', backgroundColor: opt.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={12} color="#fff" /></span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Shipment ──
            Only for Against Payment — paying the supplier now against a
            landed order means the rows are filled from that order and the
            cost is the landed figure. On Credit never shows this: it is a
            plain, simple hand-entry row, exactly like this screen worked
            before shipment stock-in existed — no shipment to pick, no
            margin to set. */}
        {ownership === 'Owned' && (
          <div style={S.card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Shipment</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={S.label}>Pick a shipment <span style={{ color: '#ef4444' }}>*</span></label>
                  <select value={shipmentId}
                    onChange={e => {
                      const id = e.target.value;
                      setShipmentId(id);
                      const sh = shipments.find(x => x.id === id);
                      if (sh) attachShipment(sh);
                    }}
                    style={{ ...S.inp(), cursor: 'pointer' }}>
                    <option value="">
                      {shipmentsLoading ? 'Loading shipments…'
                        : shipments.length === 0 ? 'No shipments found'
                        : '— select shipment —'}
                    </option>
                    {shipments.map(sh => (
                      <option key={sh.id} value={sh.id}>
                        {sh.shipmentNumber} · {sh.brandName} · {sh.supplierName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Margin %</label>
                  <input type="number" min={0} step="any" value={marginPercent}
                    onChange={e => setMarginPercent(parseFloat(e.target.value) || 0)}
                    style={{ ...S.inp(), textAlign: 'right' }} />
                </div>
              </div>

              {selectedShipment && (
                <p style={{ fontSize: 11.5, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
                  One row per line, filled with what is still on the order. The purchasing cost
                  is the landed figure and cannot be edited — that is the point of stocking in
                  from a shipment. Retail is filled at {marginPercent}% and stays editable, but
                  never below cost: selling under it is a loss on every unit, and the kind that
                  only shows up at month end.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Product rows ── */}
        {rows.map((row, idx) => (
          <div key={row.id} style={{ ...S.card, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</span>
                Product {rows.length > 1 ? `#${idx + 1}` : ''}
              </div>
              {rows.length > 1 && (
                <button type="button" onClick={() => removeRow(row.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid #fecaca', backgroundColor: '#fef2f2', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#ef4444' }}>
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
            <BrandModelInputs
              row={row}
              shipmentLines={row.shipmentId
                ? stockInLines(shipments.find(x => x.id === row.shipmentId) || ({} as any))
                : undefined}
              onModelPick={lineId => pickModel(row.id, lineId)}
              onChange={(field, val) => {
                updateRow(row.id, field, val);
                                if (field === 'brandName') loadModelsDebounced(row.id, val);
                if (field === 'costPrice') setCostHint(prev => ({ ...prev, [row.id]: '' }));
              }}
              brandSuggestions={brandSuggestions}
              modelSuggestions={modelSuggestionsByRow[row.id] || []}
              onBrandSelect={name => loadModels(row.id, name)}
                            onModelSelect={(name, model) => {
                if (model?.description) updateRow(row.id, 'description', model.description);
                if (model?.category)    updateRow(row.id, 'category',    model.category);
                if (model?.sellPrice && model.sellPrice > 0) updateRow(row.id, 'sellPrice', model.sellPrice);
                if (model?.costPrice && model.costPrice > 0) {
                  updateRow(row.id, 'costPrice', model.costPrice);
                  setCostHint(prev => ({ ...prev, [row.id]: model.lastCostAt || 'previous purchase' }));
                }
              }}
                           error={rowErrors[row.id]}
              isCredit={isCredit}
            />

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #e2e8f0' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Stock Settings</div>
              <div style={S.grid2}>
                <div>
                  <label style={S.label}>Location <span style={{ color: '#ef4444' }}>*</span></label>
                  <LocationSelector value={row.location} onChange={v => updateRow(row.id, 'location', v)} label="" placeholder="Select location" />
                </div>
                <div>
                  <label style={S.label}>Condition</label>
                  <div style={{ position: 'relative' }}>
                    <select value={row.status} onChange={e => updateRow(row.id, 'status', e.target.value)}
                      style={{ ...S.inp(), appearance: 'none', paddingRight: 28, cursor: 'pointer' }}>
                      {['New','Used'].map(sv => <option key={sv} value={sv}>{sv}</option>)}
                    </select>
                    <ChevronDown size={13} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#9ca3af' }} />
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={S.label}>Stock-In Date</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', backgroundColor: '#f1f5f9', borderRadius: 8, marginBottom: 6, border: '1px solid #e2e8f0' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#22c55e', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Auto</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto' }}>recorded on save</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="date" value={row.stockInDate} onChange={e => updateRow(row.id, 'stockInDate', e.target.value)} style={{ ...S.inp(), flex: 1 }} />
                  {row.stockInDate && <button type="button" onClick={() => updateRow(row.id, 'stockInDate', '')} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={12} /></button>}
                </div>
                            </div>
            </div>

            <ProductImages images={row.images} onChange={next => updateRow(row.id, 'images', next)} />
          </div>
        ))}
        {/* ── Add Another Product ── */}
        <button type="button" onClick={addRow}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 10, border: '2px dashed #cbd5e1', backgroundColor: '#f8fafc', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#64748b', transition: 'all 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#0f172a'; (e.currentTarget as HTMLElement).style.color = '#0f172a'; (e.currentTarget as HTMLElement).style.backgroundColor = '#f1f5f9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1'; (e.currentTarget as HTMLElement).style.color = '#64748b'; (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'; }}>
          <Plus size={16} /> Add Another Product
        </button>         
                {/* Payment (removed)
            Payment collection UI removed from this flow. All new items are
            saved as unpaid and reconciled from the Transactions module.
            The Credit / Owned toggle is kept above so the item shows in
            Payables correctly, but no amounts or channels are captured here. */}
        <div style={{ padding: '12px 16px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Wallet size={16} color="#1d4ed8" />
          <div style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 1.5 }}>
            <b>Payment tracked separately.</b> This inventory will be saved as{' '}
            <b>unpaid</b>{isCredit ? ' and appear in Inventory Payables' : ''}. Record payment later from the Transactions module.
          </div>
        </div>

        {/* Grand total */}
        {grandTotal > 0 && (
          <div style={{ backgroundColor: '#0f172a', borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Grand Total — {rows.length} product{rows.length!==1?'s':''}
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{currencySymbol} {grandTotal.toLocaleString()}</span>
          </div>
        )}

      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {saveError && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>âš ï¸</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 2 }}>Save Failed</div>
              <div style={{ fontSize: 12, color: '#dc2626' }}>{saveError}</div>
            </div>
            <button onClick={() => setSaveError('')} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, flexShrink: 0 }}>×</button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={() => afterSave()} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={15} /> Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            style={{ padding: '11px 28px', borderRadius: 8, border: 'none', backgroundColor: saving ? '#94a3b8' : '#15803d', color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: saving ? 'none' : '0 2px 8px rgba(21,128,61,0.35)' }}>
            {saving
              ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
              : <><Check size={16} /> Save {rows.length > 1 ? `All ${rows.length} Products` : 'Inventory'}</>}
          </button>
        </div>
      </div>
    </div>
  );
};