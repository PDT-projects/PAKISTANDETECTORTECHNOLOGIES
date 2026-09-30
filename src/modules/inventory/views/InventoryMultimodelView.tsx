// Inventory Module - View Layer
// InventoryMultiModelView
// "Without Costing" path: pick a brand, add N models with all details at once.

import React, { useState, useRef } from 'react';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';
import {
  ArrowLeft, ArrowRight, Package, Plus, Trash2, ChevronDown,
  Hash, Loader2, Check, AlertCircle, ImagePlus, X,
} from 'lucide-react';
import { InventoryCurrencyDropdown, CurrencyPriceInput } from './InventoryCurrencyDropdown';
import {
  UseInventoryMultiModelViewModelReturn,
  CATEGORIES, STOCKING_LOCATIONS, STATUSES, MultiModelEntry,
} from '../viewModels/useInventoryMultimodelViewModel';
import { LocationSelector, SerialLocationSelector } from './LocationSelector';
import {
  fetchModelProfileByName, modelProfilePatch, fetchSavedDescriptions,
} from '../models/BrandModelService';

interface Props extends UseInventoryMultiModelViewModelReturn {}

// ── Stepper ───────────────────────────────────────────────────────────────────
// Payment step removed — inventory saves directly from the Models step and
// any payment tracking is handled later from the Transactions module.
const STEPS = [
  { n: 1, label: 'Type' }, { n: 2, label: 'Costing' },
  { n: 3, label: 'Models' },
];
const Stepper = ({ current }: { current: number }) => (
  <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 32px' }}>
    <div style={{ display: 'flex', alignItems: 'center', maxWidth: 600, margin: '0 auto' }}>
      {STEPS.map((step, i) => {
        const active = step.n === current;
        const done   = step.n < current;
        const last   = i === STEPS.length - 1;
        return (
          <React.Fragment key={step.n}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13,
                backgroundColor: done || active ? '#0f172a' : '#e5e7eb',
                color: done || active ? '#fff' : '#9ca3af',
                boxShadow: active ? '0 0 0 4px rgba(15,23,42,0.12)' : 'none',
              }}>
                {done ? <Check size={14} strokeWidth={3} /> : step.n}
              </div>
              <span style={{ marginTop: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: done || active ? '#0f172a' : '#94a3b8', whiteSpace: 'nowrap' }}>
                {step.label}
              </span>
            </div>
            {!last && <div style={{ flex: 1, height: 2, borderRadius: 99, margin: '0 8px', marginBottom: 20, backgroundColor: done ? '#0f172a' : '#e5e7eb' }} />}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

// ── Input style ───────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8,
  fontSize: 13, outline: 'none', color: '#111827', backgroundColor: '#fff', boxSizing: 'border-box',
};
const inpErr: React.CSSProperties = { ...inp, border: '1px solid #ef4444', backgroundColor: '#fef2f2' };

// ── Serial sub-panel ──────────────────────────────────────────────────────────
function SerialPanel({
  entry, setEntrySerial, setEntrySerialCity,
}: {
  entry: MultiModelEntry;
  setEntrySerial: (entryId: string, idx: number, value: string) => void;
  setEntrySerialCity: (entryId: string, idx: number, city: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const filled = entry.serialNumbers.filter(s => s.trim() !== '').length;

  return (
    <div style={{ marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 14px', background: '#f8fafc', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Hash size={14} color="#334155" />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Serial Numbers — {filled}/{entry.stockQty} entered
          </span>
          {filled === entry.stockQty && entry.stockQty > 0 && (
            <span style={{ padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700, backgroundColor: '#dcfce7', color: '#166534' }}>✓ Complete</span>
          )}
        </div>
        <ChevronDown size={14} color="#9ca3af" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 240, overflowY: 'auto' }}>
          {Array.from({ length: entry.stockQty }, (_, i) => (
            <div key={i} style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Unit {i + 1}
              </label>
              <input
                type="text"
                placeholder={`Serial #${i + 1}`}
                value={entry.serialNumbers[i] || ''}
                onChange={e => setEntrySerial(entry.id, i, e.target.value)}
                style={inp}
              />
              <SerialLocationSelector
                value={entry.serialNumbers[i] ? (entry.serialCities[entry.serialNumbers[i]] || '') : ''}
                onChange={city => setEntrySerialCity(entry.id, i, city)}
                placeholder="Location (optional)"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Image Upload Panel ────────────────────────────────────────────────────────
function ImageUploadPanel({
  entryId,
  images,
  setEntryImages,
  removeEntryImage,
}: {
  entryId: string;
  images: File[];
  setEntryImages: (entryId: string, files: File[]) => void;
  removeEntryImage: (entryId: string, index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const fileInputRef    = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const accepted = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (accepted.length) setEntryImages(entryId, accepted);
  };

  const [dragging, setDragging] = useState(false);

  return (
    <div style={{ marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 14px', background: '#f8fafc', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ImagePlus size={14} color="#334155" />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Product Images
            {images.length > 0 && (
              <span style={{ marginLeft: 6, padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700, backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                {images.length} {images.length === 1 ? 'file' : 'files'} selected
              </span>
            )}
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: '#9ca3af' }}>(Optional)</span>
          </span>
        </div>
        <ChevronDown size={14} color="#9ca3af" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#6366f1' : '#cbd5e1'}`,
              borderRadius: 8, padding: '20px 16px', textAlign: 'center',
              cursor: 'pointer', backgroundColor: dragging ? '#f0f4ff' : '#f8fafc',
              transition: 'all 0.15s',
            }}
          >
            <ImagePlus size={22} color={dragging ? '#6366f1' : '#94a3b8'} style={{ margin: '0 auto 6px' }} />
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: dragging ? '#6366f1' : '#64748b' }}>
              {dragging ? 'Drop to add images' : 'Click or drag images here'}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#9ca3af' }}>JPG, PNG, WEBP — any size</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => handleFiles(e.target.files)}
            />
          </div>

          {/* Previews */}
          {images.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {images.map((file, i) => {
                const url = URL.createObjectURL(file);
                return (
                  <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                    <img src={url} alt={file.name} onLoad={() => URL.revokeObjectURL(url)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      onClick={e => { e.stopPropagation(); removeEntryImage(entryId, i); }}
                      style={{
                        position: 'absolute', top: 2, right: 2,
                        width: 18, height: 18, borderRadius: '50%',
                        backgroundColor: 'rgba(0,0,0,0.6)', border: 'none',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 0,
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
                  color: '#94a3b8',
                }}
              >
                <Plus size={16} />
                <span style={{ fontSize: 9, fontWeight: 700 }}>Add more</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Description Field ─────────────────────────────────────────────────────────
// The textarea stays UNCONTROLLED while you type — React does not rewrite the
// DOM node on every keystroke, so the caret cannot jump when something upstream
// re-renders. That part was right and is kept.
//
// What was wrong: `defaultValue` is read once, at mount, and never again. So a
// description written into the row from anywhere other than this textarea — the
// profile prefill, the dropdown below — updated the entry in state and was never
// shown. The value was always arriving; the field just refused to display it.
// That is the whole "description doesn't fetch" bug.
//
// The effect below closes that gap: when `value` changes to something this field
// did not type, it is pushed into the DOM node directly. Skipped while the field
// has focus, so an in-flight lookup can never yank text out from under the caret.
function DescriptionField({
  entryId,
  value,
  brandName,
  modelName,
  updateEntry,
}: {
  entryId: string;
  value: string;
  brandName: string;
  modelName: string;
  updateEntry: (id: string, patch: Partial<MultiModelEntry>) => void;
}) {
  const areaRef   = React.useRef<HTMLTextAreaElement>(null);
  const lastTyped = React.useRef(value);

  React.useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    if (value === lastTyped.current) return;      // this field's own keystrokes
    if (document.activeElement === el) return;    // never interrupt typing
    el.value = value || '';
    lastTyped.current = value;
  }, [value]);

  // ── Saved descriptions, same idea as the brand and model dropdowns ────────
  const [saved, setSaved]     = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
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

  const applySaved = (text: string) => {
    if (!text) return;
    const el = areaRef.current;
    if (el) el.value = text;
    lastTyped.current = text;
    updateEntry(entryId, { description: text });
  };

  // One line of a saved description, enough to tell entries apart in a <select>.
  const summarise = (text: string) => {
    const oneLine = text.replace(/\s+/g, ' ').trim();
    return oneLine.length > 70 ? `${oneLine.slice(0, 70)}…` : oneLine;
  };

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Description</label>

      {(loading || saved.length > 0) && (
        <select
          value=""
          disabled={loading}
          onChange={ev => applySaved(ev.target.value)}
          style={{
            width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8,
            fontSize: 13, outline: 'none', color: '#111827', backgroundColor: '#fff',
            boxSizing: 'border-box', marginBottom: 6, cursor: 'pointer',
          }}
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
        ref={areaRef}
        key={entryId}
        defaultValue={value}
        onChange={ev => {
          lastTyped.current = ev.target.value;
          updateEntry(entryId, { description: ev.target.value });
        }}
        rows={3}
        placeholder="Notes, specs, warranty terms. Press Enter for a new line —&#10;made in USA&#10;3 years warranty"
        style={{
          width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8,
          fontSize: 13, outline: 'none', color: '#111827', backgroundColor: '#fff',
          boxSizing: 'border-box', resize: 'vertical', whiteSpace: 'pre-wrap',
        }}
      />
    </div>
  );
}

// ── Model Card ─────────────────────────────────────────────────────────────────
function ModelCard({
  entry, index, brandName, modelOptions, modelOptionsLoading, validationErrors,
  updateEntry, removeEntry, setEntrySerial, setEntrySerialCity,
  setEntryImages, removeEntryImage, canRemove,
}: {
  entry: MultiModelEntry;
  index: number;
  brandName: string;
  modelOptions: { id: string; modelName: string; costPrice?: number; sellPrice?: number }[];
  modelOptionsLoading: boolean;
  validationErrors: { [k: string]: string };
  updateEntry: (id: string, patch: Partial<MultiModelEntry>) => void;
  removeEntry: (id: string) => void;
  setEntrySerial: (entryId: string, idx: number, value: string) => void;
  setEntrySerialCity: (entryId: string, idx: number, city: string) => void;
  setEntryImages: (entryId: string, files: File[]) => void;
  removeEntryImage: (entryId: string, index: number) => void;
  canRemove: boolean;
}) {
  const e = entry;
  const hasErr = (key: string) => !!validationErrors[`${key}_${index}`];

  // ── Product profile prefill ─────────────────────────────────────────────
  // Pulls back Type, Description, Retail Price, Warranty and Stocking Location
  // from the last time this brand + model was entered.
  //
  // Driven from the view rather than from updateEntry() in the ViewModel for
  // two reasons. First, the free-text model input fires updateEntry on every
  // keystroke, so a lookup hung off it runs once per character — nine requests
  // to type "Signum HM", eight of them wasted. Second, the row is patched
  // through `updateEntry`, which is already a prop here, so the lookup needs
  // nothing the ViewModel has to expose.
  //
  // `location` is remapped to `stockingLocation`: that is what this entry type
  // calls the field, and writing the unmapped name is why location never
  // appeared here either.
  const entryRef = React.useRef(e);
  entryRef.current = e;

  const prefillFromModel = (rawModelName: string) => {
    const modelName = (rawModelName || '').trim();
    const brand     = (brandName || '').trim();
    if (!modelName || !brand) return;

    void (async () => {
      try {
        const profile = await fetchModelProfileByName(brand, modelName);
        if (!profile) {
          console.debug('[Inventory] no saved profile for', brand, '/', modelName);
          return;
        }
        const current = entryRef.current;
        // Discard if the row moved to a different model while this was in
        // flight, otherwise one row's data lands on another's.
        if ((current.modelName || '').trim().toLowerCase() !== modelName.toLowerCase()) return;

        // NON-DESTRUCTIVE: only fields still blank on the CURRENT row are
        // written, so anything typed during the lookup survives.
        const patch = modelProfilePatch(current, profile, { location: 'stockingLocation' });
        if (Object.keys(patch).length > 0) updateEntry(current.id, patch);
      } catch (err) {
        console.error('[Inventory] model profile prefill failed:', err);
      }
    })();
  };

  return (
    <div style={{
      backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
      padding: '18px 20px', position: 'relative',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, backgroundColor: '#f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: '#0f172a',
          }}>
            {index + 1}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
            {e.modelName || `Model ${index + 1}`}
          </span>
        </div>
        {canRemove && (
          <button onClick={() => removeEntry(e.id)}
            style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #fecaca', backgroundColor: '#fef2f2', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Trash2 size={13} color="#ef4444" />
            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>Remove</span>
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

        {/* Model Name — dropdown + free text */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Model Name *</label>
          {modelOptionsLoading ? (
            <div style={{ ...inp, display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280' }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading models…
            </div>
          ) : modelOptions.length > 0 ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={modelOptions.find(m => m.modelName === e.modelName)?.id || ''}
                onChange={ev => {
                  const found = modelOptions.find(m => m.id === ev.target.value);
                  if (found) {
                    updateEntry(e.id, {
                      modelName: found.modelName,
                      costPrice: found.costPrice ?? e.costPrice,
                      sellPrice: found.sellPrice ?? e.sellPrice,
                    });
                    prefillFromModel(found.modelName);
                  }
                  else updateEntry(e.id, { modelName: '' });
                }}
                style={{ ...inp, flex: 1 }}
              >
                <option value="">— Select existing model —</option>
                {modelOptions.map(m => <option key={m.id} value={m.id}>{m.modelName}</option>)}
              </select>
              <span style={{ alignSelf: 'center', fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>or type:</span>
              <input
                type="text"
                placeholder="New model name"
                value={modelOptions.find(m => m.modelName === e.modelName) ? '' : e.modelName}
                onChange={ev => updateEntry(e.id, { modelName: ev.target.value })}
                onBlur={ev => prefillFromModel(ev.target.value)}
                style={{ ...inp, flex: 1 }}
              />
            </div>
          ) : (
            <input
              type="text"
              placeholder="Enter model name"
              value={e.modelName}
              onChange={ev => updateEntry(e.id, { modelName: ev.target.value })}
              onBlur={ev => prefillFromModel(ev.target.value)}
              style={hasErr('model') ? inpErr : inp}
            />
          )}
          {hasErr('model') && <p style={{ color: '#ef4444', fontSize: 11, marginTop: 3 }}>{validationErrors[`model_${index}`]}</p>}
        </div>

        {/* Purchasing Cost (what we paid to buy — never shown to customers) */}
        <div>
          <CurrencyPriceInput
            label="Purchasing Cost"
            pkrValue={e.costPrice ?? 0}
            onChange={value => updateEntry(e.id, { costPrice: value })}
            placeholder="0"
            required
          />
          {hasErr('cost') && <p style={{ color: '#ef4444', fontSize: 11, marginTop: 3 }}>{validationErrors[`cost_${index}`]}</p>}
        </div>

        {/* Retail Price (what customers see on the invoice) */}
        <div>
          <CurrencyPriceInput
            label="Retail Price"
            pkrValue={e.sellPrice ?? 0}
            onChange={value => updateEntry(e.id, { sellPrice: value })}
            placeholder="0"
            required
          />
        </div>

        {/* Stock Qty */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Stock Qty *</label>
          <input
            type="number"
            value={e.stockQty}
            onChange={ev => updateEntry(e.id, { stockQty: Math.max(1, Number(ev.target.value)) })}
            style={hasErr('qty') ? inpErr : inp}
            min={1}
          />
        </div>

        {/* Type */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Type *</label>
          <select value={e.category} onChange={ev => updateEntry(e.id, { category: ev.target.value })} style={hasErr('cat') ? inpErr : inp}>
            <option value="">Select type</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {hasErr('cat') && <p style={{ color: '#ef4444', fontSize: 11, marginTop: 3 }}>{validationErrors[`cat_${index}`]}</p>}
        </div>

        {/* Status */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Status</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {STATUSES.map(s => (
              <button key={s} onClick={() => updateEntry(e.id, { status: s })}
                style={{
                  flex: 1, padding: '8px 6px', borderRadius: 7, border: `2px solid ${e.status === s ? '#0f172a' : '#e2e8f0'}`,
                  backgroundColor: e.status === s ? '#f1f5f9' : '#fff', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, color: e.status === s ? '#0f172a' : '#6b7280',
                  transition: 'all 0.15s',
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Stocking Location */}
        <div>
          <LocationSelector
            value={e.stockingLocation}
            onChange={loc => updateEntry(e.id, { stockingLocation: loc })}
            label="Stocking Location *"
            placeholder="Select location"
          />
          {hasErr('loc') && <p style={{ color: '#ef4444', fontSize: 11, marginTop: 3 }}>{validationErrors[`loc_${index}`]}</p>}
        </div>

        {/* Dealer Price */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Dealer Price ({getGlobalCurrencySymbol()}) <span style={{ color: '#9ca3af', fontWeight: 400 }}>(Optional)</span></label>
          <input
            type="number"
            value={e.dealerPrice || ''}
            onChange={ev => updateEntry(e.id, { dealerPrice: Number(ev.target.value) })}
            placeholder="Leave blank if N/A"
            style={inp}
            min={0}
          />
        </div>

        {/* Description — uses local state to avoid losing focus on each keystroke */}
        <DescriptionField
          entryId={e.id}
          value={e.description}
          brandName={brandName}
          modelName={e.modelName}
          updateEntry={updateEntry}
        />

        {/* Serial Numbers */}
        <div style={{ gridColumn: '1 / -1' }}>
          <SerialPanel
            entry={e}
            setEntrySerial={setEntrySerial}
            setEntrySerialCity={setEntrySerialCity}
          />
        </div>

        {/* Product Images (optional) */}
        <div style={{ gridColumn: '1 / -1' }}>
          <ImageUploadPanel
            entryId={e.id}
            images={e.images}
            setEntryImages={setEntryImages}
            removeEntryImage={removeEntryImage}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main View ──────────────────────────────────────────────────────────────────
export const InventoryMultiModelView: React.FC<Props> = ({
  inventoryType,
  selectedBrandId, selectedBrandName, setBrand,
  brands, brandsLoading,
  modelOptions, modelOptionsLoading,
  entries, addEntry, removeEntry, updateEntry,
  setEntrySerial, setEntrySerialCity,
  setEntryImages, removeEntryImage,
  grandTotalCost, grandTotalUnits,
  validationErrors, isValid,
  handleNext, handleBack,
  isSaving, formatCurrency,
}) => {
  // Subscribed purely so this view re-renders the instant the Admin changes
  // the global currency — formatPrimary()/getGlobalCurrencySymbol() below
  // always read the live value regardless of this call.
  useGlobalCurrency();
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');

  const ratesLoading = false;
  const ratesError = false;
  const lastUpdated = null;

  const applyNewBrand = () => {
    const name = newBrandName.trim();
    if (!name) return;
    setBrand(name, name);
    setAddingBrand(false);
    setNewBrandName('');
  };

  // ── Grand total ──────────────────────────────────────────────────────────────
  // Amounts are stored in AED (what the user typed). Render directly as AED with
  // no conversion — the previous version multiplied by the FX rate, which turned
  // e.g. 499.99 into ~1,835 and mislabelled it. No math now: store == display.
  const formatPrimary = (amount: number) => {
    const symbol = getGlobalCurrencySymbol();
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount || 0);
    return `${symbol} ${formatted}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={handleBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}>
            <ArrowLeft size={17} />
          </button>
          <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Package size={17} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Add Multiple Models</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Step 3 — Select brand and add all models at once</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <InventoryCurrencyDropdown
              loading={ratesLoading}
              error={ratesError}
              lastUpdated={lastUpdated}
              label="Currency"
              compact
            />
          </div>
        </div>
      </div>

      <Stepper current={3} />

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Brand selector */}
          <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Package size={16} color="#0f172a" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Brand *</span>
              {selectedBrandName && (
                <span style={{ padding: '3px 10px', borderRadius: 99, backgroundColor: '#f1f5f9', color: '#0f172a', fontSize: 12, fontWeight: 700 }}>
                  {selectedBrandName}
                </span>
              )}
            </div>

            {validationErrors.brand && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 12 }}>
                <AlertCircle size={13} color="#ef4444" />
                <span style={{ fontSize: 12, color: '#dc2626' }}>{validationErrors.brand}</span>
              </div>
            )}

            {addingBrand ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={newBrandName}
                  autoFocus
                  onChange={e => setNewBrandName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') applyNewBrand(); if (e.key === 'Escape') setAddingBrand(false); }}
                  placeholder="Type new brand name…"
                  style={{ ...inp, flex: 1, border: '2px solid #334155' }}
                />
                <button onClick={applyNewBrand} style={{ padding: '9px 16px', borderRadius: 8, backgroundColor: '#0f172a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Use</button>
                <button onClick={() => setAddingBrand(false)} style={{ padding: '9px 14px', borderRadius: 8, backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                {brandsLoading ? (
                  <div style={{ ...inp, flex: 1, display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280' }}>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading brands…
                  </div>
                ) : (
                  <select
                    value={selectedBrandId}
                    onChange={e => {
                      const b = brands.find(b => b.id === e.target.value);
                      if (b) setBrand(b.id, b.name);
                    }}
                    style={{ ...inp, flex: 1 }}
                  >
                    <option value="">— Select brand —</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
                <button onClick={() => setAddingBrand(true)}
                  style={{ padding: '9px 14px', borderRadius: 8, border: '1px dashed #334155', backgroundColor: '#f5f3ff', color: '#0f172a', cursor: 'pointer', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
                  <Plus size={14} style={{ display: 'inline', marginRight: 4 }} />
                  Add new brand…
                </button>
              </div>
            )}
          </div>

          {/* Model rows */}
          {entries.map((entry, i) => (
            <ModelCard
              key={entry.id}
              entry={entry}
              index={i}
              brandName={selectedBrandName}
              modelOptions={modelOptions}
              modelOptionsLoading={modelOptionsLoading}
              validationErrors={validationErrors}
              updateEntry={updateEntry}
              removeEntry={removeEntry}
              setEntrySerial={setEntrySerial}
              setEntrySerialCity={setEntrySerialCity}
              setEntryImages={setEntryImages}
              removeEntryImage={removeEntryImage}
              canRemove={entries.length > 1}
            />
          ))}

          {/* Add model button */}
          <button
            onClick={addEntry}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px', borderRadius: 12, border: '2px dashed #cbd5e1',
              backgroundColor: '#f5f3ff', cursor: 'pointer', color: '#0f172a',
              fontWeight: 700, fontSize: 13, transition: 'all 0.2s',
            }}
          >
            <Plus size={18} /> Add Another Model
          </button>

          {/* Grand total summary */}
          <div style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 32 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Models</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 2 }}>{entries.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Units</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 2 }}>{grandTotalUnits}</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Grand Total Cost</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#a5f3fc', marginTop: 2 }}>{formatPrimary(grandTotalCost)}</div>
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={handleBack}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
              <ArrowLeft size={16} /> Back
            </button>
            <button
              onClick={handleNext}
              disabled={isSaving}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '11px 26px',
                borderRadius: 9, border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer',
                backgroundColor: isSaving ? '#cbd5e1' : '#0f172a',
                color: '#fff', fontWeight: 800, fontSize: 14,
                boxShadow: isSaving ? 'none' : '0 2px 10px rgba(15,23,42,0.25)',
                opacity: isSaving ? 0.7 : 1, transition: 'all 0.2s',
              }}
            >
              {isSaving
                ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                : <><Check size={16} /> Save Inventory</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};