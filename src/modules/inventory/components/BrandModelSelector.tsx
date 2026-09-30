// Inventory Module - Component Layer
// BrandModelSelector.tsx
// Smart brand + model dropdowns that:
//   - Load from Firestore (seeded on first use)
//   - Allow adding new brand or model with an inline "Add new" option
//   - New entries are saved to Firestore immediately
//   - onBrandChange / onModelChange callbacks update the parent form
//
// onModelChange now forwards the WHOLE ModelEntry as a 5th argument. fetchBrands()
// already loads category / description / warrantyYears / buyType / location onto
// every model, but this component used to hand the parent only the two prices, so
// the rest died at the component boundary and every re-entry of the same product
// started with a blank Type, Warranty and Description. The extra argument is
// optional, so existing callers that only destructure four params keep compiling.

import { useState, useEffect, useRef } from 'react';
import { Loader2, Check, ChevronDown } from 'lucide-react';
import { fetchBrands, addBrand, addModel, BrandModel, ModelEntry } from '../models/BrandModelService';
import { toast } from 'sonner';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

interface BrandModelSelectorProps {
  initialBrandId?: string;
  initialModelId?: string;
  onBrandChange: (brandId: string, brandName: string) => void;
  /**
   * `profile` carries everything stored against the model — category,
   * description, warrantyYears, buyType, location, lastCostAt — so the parent
   * can prefill the rest of the form without a second Firestore round-trip.
   * Undefined for a model the user has just created inline, which has no
   * profile yet.
   */
  onModelChange: (
    modelId: string,
    modelName: string,
    costPrice?: number,
    sellPrice?: number,
    profile?: ModelEntry,
  ) => void;
  brandError?: string;
  modelError?: string;
}

const SEL_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 36px 10px 12px',
  border: '1px solid #d1d5db', borderRadius: 8,
  fontSize: 14, color: '#111827', backgroundColor: '#fff',
  appearance: 'none', outline: 'none', cursor: 'pointer',
  backgroundImage: 'none',
};

const ADD_NEW_VALUE = '__ADD_NEW__';

export function BrandModelSelector({
  initialBrandId,
  initialModelId,
  onBrandChange,
  onModelChange,
  brandError,
  modelError,
}: BrandModelSelectorProps) {
  // Follows the Admin's global currency setting — symbol-only, no conversion.
  const { symbol: currencySymbol } = useGlobalCurrency();
  const [brands, setBrands]                 = useState<BrandModel[]>([]);
  const [isLoading, setIsLoading]           = useState(true);
  const [selectedBrandId, setSelectedBrandId] = useState(initialBrandId || '');
  const [selectedModelId, setSelectedModelId] = useState(initialModelId || '');

  // Inline "add new" state
  const [addingBrand, setAddingBrand]   = useState(false);
  const [addingModel, setAddingModel]   = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [isSavingModel, setIsSavingModel] = useState(false);

  const brandInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  // Load brands on mount
  useEffect(() => {
    setIsLoading(true);
    fetchBrands()
      .then(data => {
        setBrands(data);
        // If edit mode — pre-select brand/model
        if (initialBrandId) {
          const brand = data.find(b => b.id === initialBrandId);
          if (brand) onBrandChange(brand.id, brand.name);
        }
        if (initialBrandId && initialModelId) {
          const brand = data.find(b => b.id === initialBrandId);
          const model = brand?.models.find(m => m.id === initialModelId);
          if (model) onModelChange(model.id, model.name, model.costPrice, model.sellPrice, model);
        }
      })
      .catch(() => toast.error('Failed to load brands'))
      .finally(() => setIsLoading(false));
  }, []); // eslint-disable-line

  // Focus new-name inputs when they appear
  useEffect(() => { if (addingBrand) brandInputRef.current?.focus(); }, [addingBrand]);
  useEffect(() => { if (addingModel) modelInputRef.current?.focus(); }, [addingModel]);

  const selectedBrand = brands.find(b => b.id === selectedBrandId) || null;
  const modelList     = selectedBrand?.models || [];

  // ── Brand selection ───────────────────────────────────────────────────────
  const handleBrandChange = (value: string) => {
    if (value === ADD_NEW_VALUE) {
      setAddingBrand(true);
      setNewBrandName('');
      return;
    }
    setSelectedBrandId(value);
    setSelectedModelId('');
    const brand = brands.find(b => b.id === value);
    if (brand) onBrandChange(brand.id, brand.name);
    else       onBrandChange('', '');
  };

  const handleSaveNewBrand = async () => {
    if (!newBrandName.trim()) return;
    setIsSavingBrand(true);
    try {
      const created = await addBrand(newBrandName.trim());
      setBrands(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedBrandId(created.id);
      setSelectedModelId('');
      onBrandChange(created.id, created.name);
      setAddingBrand(false);
      setNewBrandName('');
      toast.success(`Brand "${created.name}" saved`);
    } catch {
      toast.error('Failed to save brand');
    } finally {
      setIsSavingBrand(false);
    }
  };

  // ── Model selection ───────────────────────────────────────────────────────
  const handleModelChange = (value: string) => {
    if (value === ADD_NEW_VALUE) {
      setAddingModel(true);
      setNewModelName('');
      return;
    }
    setSelectedModelId(value);
    const model = modelList.find(m => m.id === value);
    if (model) onModelChange(model.id, model.name, model.costPrice, model.sellPrice, model);
    else       onModelChange('', '');
  };

  const handleSaveNewModel = async () => {
    if (!newModelName.trim() || !selectedBrandId) return;
    setIsSavingModel(true);
    try {
      const created = await addModel(selectedBrandId, newModelName.trim());
      setBrands(prev => prev.map(b =>
        b.id === selectedBrandId
          ? { ...b, models: [...b.models, created].sort((a, b) => a.name.localeCompare(b.name)) }
          : b
      ));
      setSelectedModelId(created.id);
      onModelChange(created.id, created.name);
      setAddingModel(false);
      setNewModelName('');
      toast.success(`Model "${created.name}" saved`);
    } catch {
      toast.error('Failed to save model');
    } finally {
      setIsSavingModel(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, backgroundColor: '#f9fafb' }}>
        <Loader2 size={16} color="#334155" style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 13, color: '#6b7280' }}>Loading brands…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Brand Dropdown ─────────────────────────────────────────────────── */}
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
          Brand *
        </label>

        {addingBrand ? (
          /* Inline add brand */
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={brandInputRef}
              type="text"
              value={newBrandName}
              onChange={e => setNewBrandName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveNewBrand(); if (e.key === 'Escape') setAddingBrand(false); }}
              style={{ flex: 1, padding: '10px 12px', border: '2px solid #334155', borderRadius: 8, fontSize: 14, outline: 'none' }}
              placeholder="Enter new brand name…"
            />
            <button
              onClick={handleSaveNewBrand}
              disabled={isSavingBrand || !newBrandName.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '8px 14px', borderRadius: 8, border: 'none',
                backgroundColor: isSavingBrand ? '#94a3b8' : '#0f172a',
                color: '#fff', cursor: isSavingBrand ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >
              {isSavingBrand ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
              Save
            </button>
            <button
              onClick={() => setAddingBrand(false)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          /* Brand select */
          <div style={{ position: 'relative' }}>
            <select
              value={selectedBrandId}
              onChange={e => handleBrandChange(e.target.value)}
              style={{ ...SEL_STYLE, borderColor: brandError ? '#ef4444' : '#d1d5db' }}
            >
              <option value="">— Select brand —</option>
              {brands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
              <option value={ADD_NEW_VALUE}>➕ Add new brand…</option>
            </select>
            <ChevronDown size={16} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
          </div>
        )}

        {brandError && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{brandError}</p>}
      </div>

      {/* ── Model Dropdown — only shown when a brand is selected ──────────── */}
      {selectedBrandId && !addingBrand && (
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
            Model *
          </label>

          {addingModel ? (
            /* Inline add model */
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={modelInputRef}
                type="text"
                value={newModelName}
                onChange={e => setNewModelName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveNewModel(); if (e.key === 'Escape') setAddingModel(false); }}
                style={{ flex: 1, padding: '10px 12px', border: '2px solid #334155', borderRadius: 8, fontSize: 14, outline: 'none' }}
                placeholder={`New model for ${selectedBrand?.name}…`}
              />
              <button
                onClick={handleSaveNewModel}
                disabled={isSavingModel || !newModelName.trim()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  backgroundColor: isSavingModel ? '#94a3b8' : '#0f172a',
                  color: '#fff', cursor: isSavingModel ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {isSavingModel ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                Save
              </button>
              <button
                onClick={() => setAddingModel(false)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            /* Model select */
            <div style={{ position: 'relative' }}>
              <select
                value={selectedModelId}
                onChange={e => handleModelChange(e.target.value)}
                style={{ ...SEL_STYLE, borderColor: modelError ? '#ef4444' : '#d1d5db' }}
              >
                <option value="">— Select model —</option>
                {modelList.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
                <option value={ADD_NEW_VALUE}>➕ Add new model…</option>
              </select>
              <ChevronDown size={16} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
            </div>
          )}

          {modelError && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{modelError}</p>}

          {/* Show selected model info */}
          {selectedModelId && !addingModel && (() => {
            const m = modelList.find(m => m.id === selectedModelId);
            if (!m) return null;
            // Fields the parent will prefill from this model's saved profile.
            // Listing them tells the user why Type/Warranty/Description just
            // filled themselves in, instead of leaving it to look like a glitch.
            // Description is listed last and truncated — it is the longest of
            // these and the one users most often assume did not carry over,
            // because unlike Type or Warranty it is not visible at a glance in
            // the form below.
            const shortDesc = (m.description || '').replace(/\s+/g, ' ').trim();
            const carried = [
              m.category      ? `Type: ${m.category}` : '',
              m.warrantyYears ? `Warranty: ${m.warrantyYears} yr` : '',
              m.buyType       ? m.buyType : '',
              m.location      ? `📍 ${m.location}` : '',
              shortDesc       ? `Description: ${shortDesc.length > 40 ? shortDesc.slice(0, 40) + '…' : shortDesc}` : '',
            ].filter(Boolean);

            return (
              <div style={{ marginTop: 6, padding: '6px 10px', backgroundColor: '#f1f5f9', borderRadius: 6, fontSize: 12, color: '#1e293b', fontWeight: 600 }}>
                <div>
                  ✓ {selectedBrand?.name} — {m.name}
                  {(m.costPrice || m.sellPrice) && (
                    <span style={{ marginLeft: 8, fontWeight: 400, color: '#334155' }}>
                      {m.costPrice ? `Cost: ${currencySymbol} ${m.costPrice.toLocaleString()}` : ''}
                      {m.costPrice && m.sellPrice ? ' · ' : ''}
                      {m.sellPrice ? `Sell: ${currencySymbol} ${m.sellPrice.toLocaleString()}` : ''}
                    </span>
                  )}
                </div>
                {carried.length > 0 && (
                  <div style={{ marginTop: 3, fontWeight: 400, color: '#64748b', fontSize: 11 }}>
                    Filled from last entry — {carried.join(' · ')}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}