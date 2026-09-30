// Inventory Module - View Layer
// CreateInventoryView - Multi-step wizard for creating and editing products
//
// CHANGES:
//   - Payment step: Cash/Bank toggle replaces plain text dropdown
//   - Bank dropdown fetches live bank list from Firestore when Bank is selected
//   - Cheque option also prompts for bank selection
//   - bankId + bankName passed through setField so ViewModel saves them
//   - All other logic (TXN ID, serials, stepper, confirmation) unchanged
//   - LocationSelector & SerialLocationSelector now imported from shared LocationSelector.tsx
//     (supports Add New location → persisted to Firestore appConfig/inventoryLocations)
//   - Picking a brand + model now prefills Type, Description, Retail Price,
//     Warranty and Location from the last time that pair was entered

import React, { useState, useEffect, useRef } from 'react';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, AlertCircle,
  Loader2, Hash, Banknote, Building2, CreditCard, ChevronDown,
  ImagePlus, X,
} from 'lucide-react';
import {
  ProductFormData,
  ValidationResult,
  InventoryEntryStep,
} from '../models/types';
import { InventoryService } from '../models/inventoryService';
import { BrandModelSelector } from '../components/BrandModelSelector';
import { fetchModelProfileByName, modelProfilePatch, fetchSavedDescriptions } from '../models/BrandModelService';
import type { ModelEntry } from '../models/BrandModelService';
import { InventoryCurrencyDropdown, CurrencyPriceInput } from './InventoryCurrencyDropdown';
// ── Shared location components (load from Firestore, support Add New) ─────────
import { LocationSelector, SerialLocationSelector } from './LocationSelector';
import { CATEGORIES } from '../viewModels/useInventoryMultimodelViewModel';

// ── Types ─────────────────────────────────────────────────────────────────────

import type { Shipment } from '../../purchased-orders/models/types';
import type { StockInLine } from '../models/shipmentStockIn';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

interface BankOption { id: string; name: string; balance: number; }

interface CreateInventoryViewProps {
  formData: ProductFormData;
  currentStep: InventoryEntryStep;
  validation: ValidationResult;
  isSubmitting: boolean;
  isEditMode: boolean;
  editingId: string | null;
  isFetchingProduct?: boolean;
  isGeneratingTxnId?: boolean;
  serialInput: string;
  serialCity: string;
  setField: (field: string, value: any) => void;
  setCurrentStep: (step: InventoryEntryStep) => void;
  setSerialInput: (value: string) => void;
  setSerialCity: (value: string) => void;
  addSerialNumber: () => void;
  removeSerialNumber: (serial: string) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  handleSubmit: () => void;
  handleCancel: () => void;
  // ── Stock in from a shipment (optional — the wrapper may not pass them) ──
  source?: 'manual' | 'shipment';
  setSource?: (s: 'manual' | 'shipment') => void;
  shipments?: Shipment[];
  shipmentsLoading?: boolean;
  selectedShipmentId?: string;
  setSelectedShipmentId?: (id: string) => void;
  shipmentLines?: StockInLine[];
  selectedLineId?: string;
  setSelectedLineId?: (id: string) => void;
  selectedLine?: StockInLine | null;
  marginPercent?: number;
  setMarginPercent?: (n: number) => void;

  // Images (optional)
  selectedImages?: File[];
  addImages?: (files: File[]) => void;
  removeImage?: (index: number) => void;
  removeExistingImage?: (index: number) => void;
}

// ── Payment method options ────────────────────────────────────────────────────

const PAYMENT_MODES = [
  { value: 'Cash',          label: 'Cash',          icon: Banknote,   color: '#16a34a', bg: '#f0fdf4', border: '#22c55e', needsBank: false },
  { value: 'Bank Transfer', label: 'Bank Transfer', icon: Building2,  color: '#2563eb', bg: '#eff6ff', border: '#3b82f6', needsBank: true  },
  { value: 'Cheque',        label: 'Cheque',        icon: CreditCard, color: '#7c3aed', bg: '#f5f3ff', border: '#8b5cf6', needsBank: true  },
  { value: 'Credit Card',   label: 'Credit Card',   icon: CreditCard, color: '#d97706', bg: '#fffbeb', border: '#f59e0b', needsBank: false },
];

// ── ImageUploadSection ────────────────────────────────────────────────────────

function ImageUploadSection({
  images,
  existingUrls,
  onAdd,
  onRemove,
  onRemoveExisting,
}: {
  images: File[];
  existingUrls: string[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onRemoveExisting?: (index: number) => void;
}) {
  const fileInputRef              = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]   = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imgs.length) onAdd(imgs);
  };

  const totalCount = existingUrls.length + images.length;

  return (
    <div className="border border-gray-200 rounded-xl p-5 bg-white">
      <div className="flex items-center gap-2 mb-4">
        <ImagePlus size={16} className="text-gray-500" />
        <span className="text-sm font-semibold text-gray-700">Product Images</span>
        <span className="text-xs text-gray-400 font-normal ml-1">(Optional)</span>
        {totalCount > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-600">
            {totalCount} {totalCount === 1 ? 'image' : 'images'}
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#6366f1' : '#d1d5db'}`,
          borderRadius: 10, padding: '20px', textAlign: 'center',
          cursor: 'pointer', backgroundColor: dragging ? '#f0f4ff' : '#f9fafb',
          transition: 'all 0.15s',
        }}
      >
        <ImagePlus size={24} color={dragging ? '#6366f1' : '#94a3b8'} style={{ margin: '0 auto 8px' }} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: dragging ? '#6366f1' : '#6b7280' }}>
          {dragging ? 'Drop images here' : 'Click or drag & drop images'}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>JPG, PNG, WEBP supported</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {/* Existing (already-uploaded) images — shown in edit mode */}
            {existingUrls.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wide">Saved</p>
          <div className="flex flex-wrap gap-2">
            {existingUrls.map((url, i) => (
              <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                <img src={url} alt={`img-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {onRemoveExisting && (
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm('Remove this image?')) onRemoveExisting(i); }}
                    title="Remove"
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 18, height: 18, borderRadius: '50%', border: 'none',
                      backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >
                    <X size={11} color="#fff" strokeWidth={3} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Newly-selected (pending upload) images */}
      {images.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wide">New — will upload on save</p>
          <div className="flex flex-wrap gap-2">
            {images.map((file, i) => {
              const url = URL.createObjectURL(file);
              return (
                <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                  <img src={url} alt={file.name} onLoad={() => URL.revokeObjectURL(url)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    onClick={e => { e.stopPropagation(); onRemove(i); }}
                    style={{
                      position: 'absolute', top: 2, right: 2,
                      width: 18, height: 18, borderRadius: '50%',
                      backgroundColor: 'rgba(0,0,0,0.6)', border: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >
                    <X size={11} color="#fff" strokeWidth={3} />
                  </button>
                </div>
              );
            })}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 72, height: 72, borderRadius: 8, border: '2px dashed #cbd5e1',
                backgroundColor: '#f8fafc', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                color: '#94a3b8', flexShrink: 0,
              }}
            >
              <Plus size={16} />
              <span style={{ fontSize: 9, fontWeight: 700 }}>More</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Description input with a picker for descriptions already saved against this
 * brand + model.
 *
 * The multi-model screen has had this for a while; the single-product screen
 * had a bare textarea, so the only way a description came back here was the
 * profile prefill silently filling the box. When it did not fire — a new model,
 * a brand typed with different casing — the user had no way to reach text they
 * had definitely written before, and retyped it.
 *
 * Controlled, unlike the multi-model version. That one needs a ref and
 * `defaultValue` because its rows re-render from a list; here `formData` is the
 * single source of truth and React keeps the caret stable on its own.
 *
 * The picker only renders when there is something to pick, so a first-ever
 * entry sees exactly the plain textarea it saw before.
 */
function DescriptionField({
  value,
  brandName,
  modelName,
  onChange,
}: {
  value: string;
  brandName: string;
  modelName: string;
  onChange: (v: string) => void;
}) {
  const [saved, setSaved]     = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const brand = (brandName || '').trim();
    if (!brand) { setSaved([]); return; }
    let cancelled = false;
    setLoading(true);
    fetchSavedDescriptions(brand, modelName)
      .then(list => { if (!cancelled) setSaved(list); })
      .catch(()  => { if (!cancelled) setSaved([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brandName, modelName]);

  // One line, enough to tell entries apart in a <select>.
  const summarise = (text: string) => {
    const oneLine = text.replace(/\s+/g, ' ').trim();
    return oneLine.length > 70 ? `${oneLine.slice(0, 70)}…` : oneLine;
  };

  return (
    <div className="md:col-span-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>

      {(loading || saved.length > 0) && (
        <select
          value=""
          disabled={loading}
          onChange={e => { if (e.target.value) onChange(e.target.value); }}
          className="w-full px-3 py-2 mb-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white cursor-pointer text-sm"
        >
          <option value="">
            {loading
              ? 'Loading saved descriptions…'
              : `— Use a saved description (${saved.length}) —`}
          </option>
          {saved.map((text, i) => (
            <option key={i} value={text}>{summarise(text)}</option>
          ))}
        </select>
      )}

      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white whitespace-pre-wrap"
        placeholder="Notes, specs, warranty terms. Press Enter for a new line — each line is preserved."
      />
    </div>
  );
}

export function CreateInventoryView({
  formData,
  currentStep,
  validation,
  isSubmitting,
  isEditMode,
  editingId,
  isFetchingProduct,
  isGeneratingTxnId,
  serialInput,
  serialCity,
  setField,
  setSerialInput,
  setSerialCity,
  addSerialNumber,
  removeSerialNumber,
  goToNextStep,
  goToPreviousStep,
  handleSubmit,
  handleCancel,
  source = 'manual',
  setSource,
  shipments = [],
  shipmentsLoading = false,
  selectedShipmentId = '',
  setSelectedShipmentId,
  shipmentLines = [],
  selectedLineId = '',
  setSelectedLineId,
  selectedLine = null,
  marginPercent = 25,
  setMarginPercent,
  selectedImages = [],
  addImages,
  removeImage,
  removeExistingImage,
}: CreateInventoryViewProps) {

  // Subscribed purely so this whole view re-renders the instant the Admin
  // changes the global currency — getGlobalCurrencySymbol() calls throughout
  // this file always read the live value regardless of this call.
  useGlobalCurrency();

  // ── Banks — fetched once when payment step mounts ─────────────────────────
  const [banks, setBanks]               = useState<BankOption[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);

  useEffect(() => {
    if (currentStep !== 'payment') return;
    setBanksLoading(true);
    getDocs(query(collection(db, 'banks'), orderBy('name')))
      .then(snap => {
        setBanks(snap.docs.map(d => {
          const b = d.data() as any;
          return { id: d.id, name: b.name || '—', balance: Number(b.balance) || 0 };
        }));
      })
      .catch(() => {})
      .finally(() => setBanksLoading(false));
  }, [currentStep]);

  // ── Product profile prefill ───────────────────────────────────────────────
  // Picking a brand + model pulls back what was saved against that pair last
  // time: Type, Description, Retail Price, Warranty and Location. Without it,
  // the same product had to be retyped in full on every restock.
  //
  // formDataRef mirrors formData on every render so the async branch below
  // reads the CURRENT values rather than a snapshot taken when the lookup
  // started. Reading the prop directly inside an async closure would capture
  // the render it was created in and go stale the moment anything else changes.
  const formDataRef = useRef(formData);
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  // The model the user most recently picked, lowercased. A lookup that resolves
  // after they have moved on to a different model is discarded, not applied.
  const activeModelRef = useRef('');

  // NON-DESTRUCTIVE: modelProfilePatch only returns fields that are still
  // blank, so anything already typed survives. The lookup is async and someone
  // can easily be typing a Description while it is in flight — clobbering that
  // would be worse than not prefilling at all.
  const applyProfile = (profile: ModelEntry | null | undefined) => {
    const patch = modelProfilePatch(formDataRef.current, profile);
    Object.entries(patch).forEach(([field, value]) => setField(field, value));
  };

  const prefillFromModel = (modelName: string, inMemory?: ModelEntry) => {
    const model = (modelName || '').trim();
    activeModelRef.current = model.toLowerCase();
    if (!model) return;

    // (a) Synchronous pass, from the profile the selector already had loaded.
    //     fetchBrands() carries the whole profile, so the common case needs no
    //     round-trip at all and the fields fill the instant the model is picked.
    applyProfile(inMemory);

    // (b) Async fallback. Model docs created before the profile fields existed
    //     hold nothing, so fetchModelProfileByName also reads the newest Product
    //     with the same brand + model. That is what makes this work on data
    //     already in Firestore — no migration, no "save it once first".
    void (async () => {
      try {
        const brandName = (formDataRef.current.brandName || '').trim();
        if (!brandName) return;
        const profile = await fetchModelProfileByName(brandName, model);
        if (!profile) return;
        if (activeModelRef.current !== model.toLowerCase()) return;
        applyProfile(profile);
      } catch (err) {
        console.error('[Inventory] model profile prefill failed:', err);
      }
    })();
  };

  const selectedMode = PAYMENT_MODES.find(m => m.value === formData.paymentMethod) || null;
  const needsBank    = selectedMode?.needsBank ?? false;

  const ratesLoading = false;
  const ratesError = false;
  const lastUpdated = null;

  // ── Stepper config ────────────────────────────────────────────────────────
  // Payment step removed — flow is now Product Details → Confirmation.
  // Payments are recorded later from the Transactions module.
  const steps = [
    { id: 'details',      label: 'Product Details', number: 1 },
    { id: 'confirmation', label: 'Confirmation',    number: 2 },
  ];
  const currentIdx = steps.findIndex(s => s.id === currentStep);

  const inputCls = (hasError?: boolean) =>
    `w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white ${
      hasError ? 'border-red-500 bg-red-50' : 'border-gray-300'
    }`;

  const btnAddSerial: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
    backgroundColor: '#4f46e5', color: '#ffffff',
    fontWeight: 600, fontSize: 14, border: 'none', whiteSpace: 'nowrap',
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isFetchingProduct) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Loading product details...</p>
          <p className="text-sm text-gray-400 mt-1">Fetching from Firestore</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Product Details
  // ══════════════════════════════════════════════════════════════════════════
  const renderDetailsStep = () => {
    const isCredit = (formData as any).ownershipType === 'Credit';
    const fromShipment = source === 'shipment';
    return (
    <div className="space-y-6">

      {/* ── Where this stock comes from ────────────────────────────────────
          Two paths through one screen. From a shipment the cost is the landed
          figure and the units come off the order; by hand it is typed. Asking
          first is what stops someone entering stock that is already on a
          shipment and paying for it twice in the books. */}
      {setSource && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Source</label>
          <div className="flex gap-2">
            {(['shipment', 'manual'] as const).map(opt => (
              <button key={opt} type="button" onClick={() => setSource(opt)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  source === opt
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {opt === 'shipment' ? 'From shipment' : 'Enter by hand'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Ownership Toggle — Credit or Owned ──
          Moved ahead of the Shipment picker so ownership is decided before
          the shipment/cost details below it — same two blocks, just
          reordered, nothing inside either one changed. */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Ownership Type <span className="text-red-500">*</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            {
              value: 'Owned',
              label: 'Owned Inventory',
              sub: 'Fully paid or will be paid via cash / bank',
              color: '#15803d', bg: '#f0fdf4', border: '#22c55e',
              emoji: '💳',
            },
            {
              value: 'Credit',
              label: 'Third-party Inventory',
              sub: 'Taken from supplier on credit — payment due later',
              color: '#b45309', bg: '#fffbeb', border: '#f59e0b',
              emoji: '🤝',
            },
          ].map(opt => {
            const sel = (formData as any).ownershipType === opt.value || (!( formData as any).ownershipType && opt.value === 'Owned');
            return (
              <button key={opt.value} type="button"
                onClick={() => setField('ownershipType', opt.value)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                  padding: '16px 18px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${sel ? opt.border : '#e5e7eb'}`,
                  backgroundColor: sel ? opt.bg : '#fff',
                  boxShadow: sel ? `0 0 0 3px ${opt.border}30` : 'none',
                  transition: 'all 0.18s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <span style={{ fontSize: 20 }}>{opt.emoji}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: sel ? opt.color : '#374151' }}>{opt.label}</span>
                  {sel && (
                    <span style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: '50%', backgroundColor: opt.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={12} color="#fff" />
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: sel ? opt.color : '#6b7280', fontWeight: 500, lineHeight: 1.4 }}>{opt.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      {fromShipment && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Shipment</label>
            <select value={selectedShipmentId}
              onChange={e => setSelectedShipmentId?.(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm">
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

          {/* Lines with nothing left are not listed — a row reading 0 remaining
              is a row nobody can act on, and four of them hide the one that
              matters. */}
          {selectedShipmentId && (
            shipmentLines.length === 0 ? (
              <p className="text-sm text-gray-500">
                Every unit on this shipment has already been stocked in.
              </p>
            ) : (
              <LockedScrollTable maxHeight="50vh" className="rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-semibold">Product</th>
                      <th className="px-3 py-2 text-right font-semibold">Ordered</th>
                      <th className="px-3 py-2 text-right font-semibold">Stocked</th>
                      <th className="px-3 py-2 text-right font-semibold">Left</th>
                      <th className="px-3 py-2 text-right font-semibold">Landed / unit</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {shipmentLines.map(l => {
                      const on = l.lineId === selectedLineId;
                      return (
                        <tr key={l.lineId}
                          onClick={() => setSelectedLineId?.(l.lineId)}
                          className={`border-t border-gray-100 cursor-pointer transition-colors ${
                            on ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {l.productName}
                            {l.modelName && <span className="text-gray-400"> · {l.modelName}</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{l.ordered}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{l.stocked || '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{l.remaining}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">
                            {l.landedUnitCost.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {on && <span className="text-indigo-600 text-xs font-bold">selected</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </LockedScrollTable>
            )
          )}

          {/* What makes up the cost. Shown because a locked figure with no
              working behind it is the thing people stop trusting first. */}
          {selectedLine && (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                Landed cost per unit
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                {([
                  ['Goods',   selectedLine.goodsPerUnit],
                  ['Customs', selectedLine.customsPerUnit],
                  ['Freight', selectedLine.freightPerUnit],
                  ['Tax',     selectedLine.taxPerUnit],
                  ['Other',   selectedLine.otherPerUnit],
                ] as Array<[string, number]>).map(([label, v]) => (
                  <div key={label}>
                    <div className="text-xs text-gray-400">{label}</div>
                    <div className={`tabular-nums font-semibold ${v > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                      {v.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Cost per unit</span>
                <span className="text-lg font-bold tabular-nums text-gray-900">
                  {selectedLine.landedUnitCost.toFixed(2)}
                </span>
              </div>
              {selectedLine.stocked > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  {selectedLine.stocked} unit{selectedLine.stocked === 1 ? '' : 's'} already went out at a lower
                  cost. Charges paid since then land on the {selectedLine.remaining} still here, so this is
                  higher than the shipment average.
                </p>
              )}
            </div>
          )}

          {selectedLine && setMarginPercent && (
            <div className="flex items-end gap-3">
              <div className="w-32">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Margin %</label>
                <input type="number" min={0} step="any" value={marginPercent}
                  onChange={e => setMarginPercent(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm tabular-nums" />
              </div>
              <p className="text-xs text-gray-500 pb-2.5">
                Fills the sell price. It stays editable, but never below {selectedLine.landedUnitCost.toFixed(2)} —
                selling under cost is a loss on every unit, and it is the kind that only shows up at month end.
              </p>
            </div>
          )}
        </div>
      )}

      {validation.fieldErrors?.costPrice && (
        <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900">{validation.fieldErrors.costPrice}</p>
            <p className="text-sm text-amber-700 mt-1">
              Cost price is required for profit calculations and inventory valuation.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── Brand & Model ── */}
        <div className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand & Model *</label>
              {isEditMode && formData.brandName && (
                <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <span className="text-blue-600 font-medium">Currently editing: </span>
                  <span className="text-blue-900 font-semibold">{formData.brandName} — {formData.modelName}</span>
                  <span className="ml-2 text-blue-400 text-xs">(change below if needed)</span>
                </div>
              )}
            </div>
            <div className="min-w-[220px]">
              <InventoryCurrencyDropdown
                loading={ratesLoading}
                error={ratesError}
                lastUpdated={lastUpdated}
                label="Display currency"
                compact
              />
            </div>
          </div>
          <BrandModelSelector
            initialBrandId={isEditMode ? (formData.brandId || undefined) : undefined}
            initialModelId={isEditMode ? (formData.modelId || undefined) : undefined}
            onBrandChange={(brandId, brandName) => {
              setField('brandId', brandId);
              setField('brandName', brandName);
            }}
            onModelChange={(modelId, modelName, costPrice, sellPrice, profile) => {
              setField('modelId', modelId);
              setField('modelName', modelName);
              if (typeof sellPrice === 'number' && sellPrice > 0) setField('sellPrice', sellPrice);
              if (typeof costPrice === 'number' && costPrice > 0 && !(formData.costPrice > 0)) {
                setField('costPrice', costPrice);
              }
              // Edit mode is excluded on purpose: the form already holds this
              // product's real values, and quietly filling its blanks would
              // introduce a change the user never made.
              if (!isEditMode) prefillFromModel(modelName, profile);
            }}
          />
          {(validation.fieldErrors?.brandName || validation.fieldErrors?.modelName) && (
            <p className="text-red-500 text-sm mt-1">Please select a brand and model</p>
          )}
        </div>

        {/* ── Type ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
          <select
            value={formData.category || ''}
            onChange={e => setField('category', e.target.value)}
            className={inputCls(!!validation.fieldErrors?.category)}
          >
            <option value="">Select type</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {validation.fieldErrors?.category && (
            <p className="text-red-500 text-sm mt-1">{validation.fieldErrors.category}</p>
          )}
        </div>

        {/* ── Buy Type ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Buy Type</label>
          <select
            value={formData.buyType || 'Import'}
            onChange={e => setField('buyType', e.target.value)}
            className={inputCls()}
          >
            <option value="Import">Import</option>
            <option value="Export">Export</option>
          </select>
        </div>

        {/* ── Purchasing Cost (what we paid to buy) ── */}
        <div>
          <CurrencyPriceInput
            label="Purchasing Cost"
            pkrValue={formData.costPrice ?? 0}
            onChange={value => setField('costPrice', value)}
            required
          />
          <p className="text-xs text-gray-400 mt-1">What this product cost us — used for inventory valuation, never shown on customer invoices.</p>
          {validation.fieldErrors?.costPrice && (
            <p className="text-red-500 text-sm mt-1">{validation.fieldErrors.costPrice}</p>
          )}
        </div>

        {/* ── Retail Price (what customers pay — appears on the invoice) ── */}
        <div>
          <CurrencyPriceInput
            label="Retail Price"
            pkrValue={formData.sellPrice ?? 0}
            onChange={value => setField('sellPrice', value)}
            required
          />
          <p className="text-xs text-gray-400 mt-1">The price shown to customers on their sales invoice.</p>
          {validation.fieldErrors?.sellPrice && (
            <p className="text-red-500 text-sm mt-1">{validation.fieldErrors.sellPrice}</p>
          )}
        </div>

        {/* ── Warranty ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Warranty (Years)</label>
          <input
            type="number"
            value={formData.warrantyYears || ''}
            onChange={e => setField('warrantyYears', parseFloat(e.target.value) || 0)}
            className={inputCls()}
            placeholder="e.g. 1"
            min={0}
          />
        </div>

        {/* ── Primary Location — uses shared LocationSelector ── */}
        <div>
          <LocationSelector
            value={formData.location || ''}
            onChange={loc => setField('location', loc)}
            label="Stocking Location *"
            placeholder="Select location"
          />
        </div>

        {/* ── Status ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={formData.status || 'New'}
            onChange={e => setField('status', e.target.value)}
            className={inputCls()}
          >
            {['New', 'In Transit', 'On-Order', 'Available', 'Sold', 'Damaged', 'Returned', 'Used'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* ── Description ── */}
        <DescriptionField
          value={formData.description || ''}
          brandName={formData.brandName || ''}
          modelName={formData.modelName || ''}
          onChange={v => setField('description', v)}
        />
      </div>

      {/* ── Serial Numbers ── */}
      <div className="border-t border-gray-200 pt-6">
        <h4 className="text-lg font-semibold text-gray-800 mb-1">Serial Numbers</h4>
        {isEditMode && (
          <p className="text-xs text-gray-500 mb-3">
            Serials already saved in Firestore are shown below. Add or remove as needed.
          </p>
        )}
        {/* Serial input row — serial text + SerialLocationSelector + Add button */}
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={serialInput}
            onChange={e => setSerialInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSerialNumber(); } }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="Enter serial number"
          />
          {/* SerialLocationSelector — dropdown + Add New, persisted to Firestore */}
          <SerialLocationSelector
            value={serialCity}
            onChange={setSerialCity}
            placeholder="Location (optional)"
          />
          <button type="button" onClick={addSerialNumber} style={btnAddSerial}>
            <Plus size={18} /> Add
          </button>
        </div>

        {validation.fieldErrors?.serialNumbers && (
          <p className="text-red-500 text-sm mb-3">{validation.fieldErrors.serialNumbers}</p>
        )}

        {formData.serialNumbers.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {formData.serialNumbers.map(serial => (
              <div key={serial} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                <div>
                  <p className="font-mono text-sm font-medium text-gray-900">{serial}</p>
                  {formData.serialCities?.[serial] && (
                    <p className="text-xs text-gray-500 mt-0.5">{formData.serialCities[serial]}</p>
                  )}
                </div>
                <button type="button" onClick={() => removeSerialNumber(serial)}
                  className="p-1.5 hover:bg-red-100 rounded-lg transition-colors" title="Remove">
                  <Trash2 size={16} className="text-red-500" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic py-2">No serial numbers added yet.</p>
        )}
        <p className="text-xs text-gray-400 mt-2">
          {formData.serialNumbers.length} serial{formData.serialNumbers.length !== 1 ? 's' : ''} — stock count syncs automatically
        </p>
      </div>

      {/* ── Product Images (optional) ── */}
      <ImageUploadSection
        images={selectedImages}
        existingUrls={(formData as any).imageUrls || []}
        onAdd={addImages ?? (() => {})}
        onRemove={removeImage ?? (() => {})}
        onRemoveExisting={removeExistingImage}
      />
    </div>
  ); };

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Payment Info (Credit or Owned depending on ownershipType)
  // ══════════════════════════════════════════════════════════════════════════
  const renderPaymentStep = () => {
    const isCredit    = (formData as any).ownershipType === 'Credit';
    const totalAmount = (formData.costPrice ?? 0) * (formData.stock || 0);
    const paid        = isCredit ? ((formData as any).supplierPaidAmount ?? 0) : (formData.paidAmount ?? 0);
    const remaining   = Math.max(0, totalAmount - paid);

    // ── CREDIT SCREEN ───────────────────────────────────────────────────────
    if (isCredit) return (
      <div className="space-y-6">

        {/* Credit info banner */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12 }}>
          <span style={{ fontSize: 22 }}>🤝</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#92400e' }}>Third-party Inventory — Supplier Payable</div>
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 2, lineHeight: 1.5 }}>
              This inventory was taken from a supplier on credit. Record how much has been paid so far — the rest will appear in Payables.
            </div>
          </div>
        </div>

        {/* Supplier cost */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Cost per unit ({getGlobalCurrencySymbol()})</label>
          <input type="number" min={0} step="any"
            value={(formData as any).supplierCost ?? formData.costPrice ?? ''}
            onChange={e => setField('supplierCost', parseFloat(e.target.value) || 0)}
            className={inputCls()}
            placeholder="Total cost owed to supplier per unit"
          />
          <p className="text-xs text-gray-400 mt-1">Pre-filled from cost price — adjust if different from what supplier charges</p>
        </div>

        {/* Amount paid so far */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid to Supplier So Far ({getGlobalCurrencySymbol()})</label>
          <input type="number" min={0} step="any"
            value={(formData as any).supplierPaidAmount ?? ''}
            onChange={e => setField('supplierPaidAmount', parseFloat(e.target.value) || 0)}
            className={inputCls()}
            placeholder="0 if nothing paid yet"
          />
        </div>

        {/* Payment channel for what's been paid */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Payment Channel (for amount paid)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {PAYMENT_MODES.map(mode => {
              const Icon = mode.icon;
              const sel  = (formData as any).supplierPaymentChannel === mode.value;
              return (
                <button key={mode.value} type="button"
                  onClick={() => setField('supplierPaymentChannel', mode.value)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${sel ? mode.border : '#e5e7eb'}`, backgroundColor: sel ? mode.bg : '#fff', transition: 'all 0.15s' }}>
                  <Icon size={18} color={sel ? mode.color : '#9ca3af'} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: sel ? mode.color : '#374151' }}>{mode.label}</span>
                  {sel && <Check size={13} color={mode.color} style={{ marginLeft: 'auto' }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Payment summary card */}
        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 12 }}>Credit Summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#b45309' }}>Supplier cost / unit</span>
              <span style={{ fontWeight: 700 }}>{getGlobalCurrencySymbol()} {((formData as any).supplierCost ?? formData.costPrice ?? 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#b45309' }}>Units</span>
              <span style={{ fontWeight: 700 }}>{formData.stock}</span>
            </div>
            <div style={{ borderTop: '1px solid #fde68a', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15 }}>
              <span style={{ color: '#92400e' }}>Total owed</span>
              <span style={{ color: '#b45309' }}>{getGlobalCurrencySymbol()} {(((formData as any).supplierCost ?? formData.costPrice ?? 0) * (formData.stock || 0)).toLocaleString()}</span>
            </div>
            {paid > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#15803d' }}>Paid so far</span>
                  <span style={{ fontWeight: 700, color: '#15803d' }}>{getGlobalCurrencySymbol()} {paid.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#b91c1c' }}>Still owed</span>
                  <span style={{ fontWeight: 700, color: '#b91c1c' }}>{getGlobalCurrencySymbol()} {remaining.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );

    // ── OWNED / PAYMENT SCREEN ──────────────────────────────────────────────
    return (
      <div className="space-y-6">

        {/* ── Transaction ID — read-only ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Transaction ID</label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 8,
            border: '1px solid #c7d2fe', backgroundColor: '#eef2ff',
          }}>
            {isGeneratingTxnId ? (
              <>
                <Loader2 size={16} color="#6366f1" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#6366f1', fontWeight: 600 }}>Generating transaction ID…</span>
              </>
            ) : (
              <>
                <Hash size={16} color="#6366f1" style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 800, color: '#3730a3', letterSpacing: '0.04em' }}>
                  {formData.transactionId || '—'}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#818cf8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Auto-generated
                </span>
              </>
            )}
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            This ID is saved to Firestore and links to all cash / bank activity records.
          </p>
        </div>

        {/* ── Payment Method — icon toggle cards ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Payment Method *</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {PAYMENT_MODES.map(mode => {
              const Icon = mode.icon;
              const sel  = formData.paymentMethod === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => {
                    setField('paymentMethod', mode.value);
                    if (!mode.needsBank) {
                      setField('bankId', undefined);
                      setField('bankName', undefined);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${sel ? mode.border : '#e5e7eb'}`,
                    backgroundColor: sel ? mode.bg : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={20} color={sel ? mode.color : '#9ca3af'} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: sel ? mode.color : '#374151' }}>
                    {mode.label}
                  </span>
                  {sel && <Check size={14} color={mode.color} style={{ marginLeft: 'auto' }} />}
                </button>
              );
            })}
          </div>
          {validation.fieldErrors?.paymentMethod && (
            <p className="text-red-500 text-sm mt-2">{validation.fieldErrors.paymentMethod}</p>
          )}
        </div>

        {/* ── Bank Selector — shown for Bank Transfer & Cheque ── */}
        {needsBank && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formData.paymentMethod === 'Cheque' ? 'Issuing Bank *' : 'Bank Account *'}
            </label>
            {banksLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, backgroundColor: '#f9fafb' }}>
                <Loader2 size={14} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13, color: '#6b7280' }}>Loading bank accounts…</span>
              </div>
            ) : banks.length === 0 ? (
              <div style={{ padding: '10px 14px', border: '1px solid #fde68a', borderRadius: 8, backgroundColor: '#fffbeb', fontSize: 13, color: '#92400e' }}>
                ⚠ No bank accounts found. Add one in Banking → Bank Accounts first.
              </div>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <select
                    value={formData.bankId || ''}
                    onChange={e => {
                      const bank = banks.find(b => b.id === e.target.value);
                      setField('bankId',   bank?.id   || '');
                      setField('bankName', bank?.name || '');
                    }}
                    style={{
                      width: '100%', padding: '10px 36px 10px 12px',
                      border: `1px solid ${validation.fieldErrors?.bankId ? '#ef4444' : '#d1d5db'}`,
                      borderRadius: 8, fontSize: 14, color: '#111827',
                      backgroundColor: '#fff', appearance: 'none', outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="">— Select bank account —</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name}{b.balance !== undefined ? ` — ${getGlobalCurrencySymbol()} ${b.balance.toLocaleString()}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
                {formData.bankName && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', backgroundColor: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
                    <Building2 size={12} /> {formData.bankName}
                  </div>
                )}
              </>
            )}
            {validation.fieldErrors?.bankId && (
              <p className="text-red-500 text-sm mt-1">{validation.fieldErrors.bankId}</p>
            )}
          </div>
        )}

        {/* ── Amount Paid ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid ({getGlobalCurrencySymbol()})</label>
          <input
            type="number"
            value={formData.paidAmount ?? ''}
            onChange={e => {
              const raw = e.target.value;
              setField('paidAmount', raw === '' ? undefined : (parseFloat(raw) || 0));
            }}
            className={inputCls()}
            placeholder="Enter amount paid (leave blank if unpaid)"
            min={0}
            step="any"
          />
        </div>

        {/* ── Payment Summary ── */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-3">Payment Summary</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-700">Purchasing Cost per unit:</span>
              <span className="font-semibold text-blue-900">{InventoryService.formatCurrency(formData.costPrice ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-700">Quantity:</span>
              <span className="font-semibold text-blue-900">{formData.stock} units</span>
            </div>
            <div style={{ borderTop: '1px solid #bfdbfe', margin: '8px 0' }} />
            <div className="flex justify-between font-bold text-base">
              <span className="text-blue-900">Total Amount:</span>
              <span className="text-blue-900">{InventoryService.formatCurrency(totalAmount)}</span>
            </div>
            {paid > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-blue-700">Paid:</span>
                  <span className="font-semibold text-green-700">{InventoryService.formatCurrency(paid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">Remaining:</span>
                  <span className={`font-semibold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {InventoryService.formatCurrency(remaining)}
                  </span>
                </div>
              </>
            )}
            {formData.paymentMethod && (
              <div style={{ borderTop: '1px solid #bfdbfe', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-blue-700">Method:</span>
                <span className="font-semibold text-blue-900">
                  {formData.paymentMethod}
                  {formData.bankName ? ` — ${formData.bankName}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Confirmation
  // ══════════════════════════════════════════════════════════════════════════
  const renderConfirmationStep = () => (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Check className="w-8 h-8 text-green-600" />
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">
        Ready to {isEditMode ? 'Update' : 'Save'} Product
      </h3>
      <p className="text-gray-600 mb-6">
        Review the summary, then click{' '}
        <strong style={{ color: '#15803d' }}>{isEditMode ? 'Update Product' : 'Save Product'}</strong>{' '}
        to write to Firestore.
      </p>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 max-w-md mx-auto text-left">
        <div className="space-y-3 text-sm">
          {([
            ['Transaction ID', formData.transactionId || '—'],
            ['Product',        `${formData.brandName} ${formData.modelName}`],
            ['Type',       formData.category || '—'],
            ['Location',       formData.location || '—'],
            ['Status',         formData.status   || '—'],
            ['Stock',          `${formData.stock} units`],
            ['Purchasing Cost', InventoryService.formatCurrency(formData.costPrice ?? 0)],
            ['Retail Price',    InventoryService.formatCurrency(formData.sellPrice  || 0)],
            ['Description',    formData.description || '—'],
            ['Ownership',  (formData as any).ownershipType || 'Owned'],
            // Payment method removed — payments are tracked from the Transactions module.
            // Credit-ownership shows supplier balance so the payable is visible, but
            // amounts paid / method are all reconciled elsewhere.
            ...((formData as any).ownershipType === 'Credit' ? [
              ['Supplier Cost', InventoryService.formatCurrency((formData as any).supplierCost ?? formData.costPrice ?? 0)],
            ] as [string,string][] : [] as [string,string][]),
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <span className="text-gray-500 flex-shrink-0">{label}:</span>
              <span className={`font-semibold text-right max-w-[55%] ${
                // Description keeps paragraph breaks; everything else stays on one line
                label === 'Description'
                  ? 'whitespace-pre-wrap break-words text-gray-900'
                  : label === 'Transaction ID'
                    ? 'truncate font-mono text-indigo-700'
                    : 'truncate text-gray-900'
              }`}>
                {value}
              </span>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-gray-200 pt-3 mt-2">
            <span className="text-gray-500">Serials:</span>
            <span className="font-semibold text-gray-900">{formData.serialNumbers.length} entered</span>
          </div>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">

        {/* Page header */}
        <div className="flex items-center gap-4 mb-4">
          <button type="button" onClick={handleCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700">
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">
              {isEditMode ? 'Edit Inventory Item' : 'Create New Inventory'}
            </h2>
            <p className="text-sm text-gray-500">
              {isEditMode
                ? 'Update fields below and save changes to Firestore'
                : 'Fill in the details to add a new product'}
              {!isEditMode && formData.transactionId && !isGeneratingTxnId && (
                <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono">
                  {formData.transactionId}
                </span>
              )}
              {editingId && isEditMode && (
                <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono">
                  #{editingId.slice(-8)}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: 'rgba(255,255,255,0.97)', borderBottom: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', maxWidth: 560, margin: '0 auto', padding: '16px 16px' }}>
            {steps.map((step, index) => {
              const isActive = step.id === currentStep;
              const isDone   = currentIdx > index;
              const isLast   = index === steps.length - 1;
              return (
                <React.Fragment key={step.id}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: 110 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 17,
                      backgroundColor: isDone ? '#4f46e5' : isActive ? '#818cf8' : '#f3f4f6',
                      color: (isDone || isActive) ? '#fff' : '#6b7280',
                      boxShadow: isActive ? '0 0 0 4px #e0e7ff' : 'none',
                      transform: isActive ? 'scale(1.1)' : 'scale(1)',
                      transition: 'all 0.2s',
                    }}>
                      {isDone ? <Check size={20} /> : step.number}
                    </div>
                    <span style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: (isDone || isActive) ? '#4338ca' : '#9ca3af', textAlign: 'center' }}>
                      {step.label}
                    </span>
                  </div>
                  {!isLast && (
                    <div style={{ flex: 1, height: 4, borderRadius: 9999, margin: '0 8px', backgroundColor: isDone ? '#4f46e5' : '#e5e7eb', transition: 'background-color 0.3s' }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {currentStep === 'details'      && renderDetailsStep()}
          {currentStep === 'confirmation' && renderConfirmationStep()}

          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 32, paddingTop: 24, borderTop: '1px solid #e5e7eb' }}>

            <button
              type="button"
              onClick={currentStep === 'details' ? handleCancel : goToPreviousStep}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, cursor: 'pointer', backgroundColor: '#f3f4f6', color: '#111827', fontWeight: 600, fontSize: 14, border: '1px solid #d1d5db' }}
            >
              <ArrowLeft size={18} />
              {currentStep === 'details' ? 'Cancel' : 'Back'}
            </button>

            {currentStep !== 'confirmation' ? (
              <button
                type="button"
                onClick={goToNextStep}
                disabled={isGeneratingTxnId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 24px', borderRadius: 8,
                  cursor: isGeneratingTxnId ? 'not-allowed' : 'pointer',
                  backgroundColor: isGeneratingTxnId ? '#e0e7ff' : '#4f46e5',
                  color: isGeneratingTxnId ? '#6366f1' : '#ffffff',
                  fontWeight: 700, fontSize: 14, border: 'none',
                  boxShadow: isGeneratingTxnId ? 'none' : '0 2px 6px rgba(79,70,229,0.35)',
                  opacity: isGeneratingTxnId ? 0.7 : 1,
                }}
              >
                {isGeneratingTxnId
                  ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Preparing ID…</>
                  : <>Next <ArrowRight size={18} /></>
                }
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || isGeneratingTxnId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '11px 30px', borderRadius: 8, border: 'none',
                  backgroundColor: (isSubmitting || isGeneratingTxnId) ? '#4ade80' : '#15803d',
                  color: '#ffffff', fontWeight: 700, fontSize: 15,
                  cursor: (isSubmitting || isGeneratingTxnId) ? 'not-allowed' : 'pointer',
                  opacity: (isSubmitting || isGeneratingTxnId) ? 0.8 : 1,
                  boxShadow: '0 2px 10px rgba(21,128,61,0.4)', letterSpacing: '0.01em',
                }}
              >
                {isSubmitting ? (
                  <><Loader2 size={18} className="animate-spin" />{isEditMode ? 'Updating...' : 'Saving...'}</>
                ) : (
                  <><Check size={18} />{isEditMode ? 'Update Product' : 'Save Product'}</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}