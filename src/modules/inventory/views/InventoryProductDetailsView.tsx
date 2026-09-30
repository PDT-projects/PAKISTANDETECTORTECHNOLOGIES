// Inventory Module - View Layer
// InventoryProductDetailsView - Step 4: Product Details
// Changes:
//   - Added optional "Dealer Price (AED)" field for both with-costing and without-costing paths
//   - Location dropdown (required) retained for both paths
//   - Fixed "Next: Payment" button text color to black in without-costing flow
//   - ⚠️ TEMPORARY: forceReseed button added — remove after brands are fixed

import React, { useState, useEffect } from 'react';
import {
  Package, Hash, ArrowLeft, ArrowRight, Loader2,
  ChevronDown, ChevronUp, MapPin, Tag, Check,
} from 'lucide-react';
import {
  UseInventoryProductDetailsViewModelReturn,
  SelectedModel,
} from '../viewModels/useInventoryProductDetailsViewModel';
import { BrandModelSelector } from '../components/BrandModelSelector';
import { forceReseed } from '../models/BrandModelService';
import { InventoryCurrencyDropdown, CurrencyPriceInput } from './InventoryCurrencyDropdown';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';



interface InventoryProductDetailsViewProps extends UseInventoryProductDetailsViewModelReturn {}

export const InventoryProductDetailsView: React.FC<InventoryProductDetailsViewProps> = ({
  formData, costingOption, singleModel, setSingleModelField,
  serialInputs, validationErrors,
  setBrandName, setModelName, setCategory, setCostPrice, setSellPrice, setStock,
  setLocation, setDescription, setStatus, updateSerialNumber, updateSerialCity,
  handleNext, handleBack, categories, cities,
  costingBrandId, costingBrandName, preloadedModels, isLoadingModels,
  isSaving,
}) => {
  // Subscribed purely so this view re-renders the instant the Admin changes
  // the global currency — getGlobalCurrencySymbol() calls below always read
  // the live value regardless of this call.
  useGlobalCurrency();

  // Dealer price local state (optional, not validated)
  const [dealerPrice, setDealerPrice] = useState<number | ''>('');

  // ⚠️ TEMPORARY reseed state — remove after brands are fixed
  const [reseedStatus, setReseedStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  const handleReseed = async () => {
    if (!window.confirm(
      '⚠️ This will DELETE all existing brands & models in Firestore and re-seed all 33 brands.\n\nContinue?'
    )) return;
    setReseedStatus('running');
    try {
      await forceReseed();
      setReseedStatus('done');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error('forceReseed failed:', err);
      setReseedStatus('error');
    }
  };

  // With-costing: local selectedModels state owns serial data
  const [selectedModels, setSelectedModels] = useState<SelectedModel[]>([]);
  const [expandedModel, setExpandedModel]   = useState<string | null>(null);

  const ratesLoading = false;
  const ratesError = false;
  const lastUpdated = null;

  useEffect(() => {
    if (preloadedModels.length > 0) {
      setSelectedModels(
        preloadedModels.map(m => ({
          ...m,
          serialNumbers: Array(m.quantity).fill(''),
          serialCities:  {},
        }))
      );
      setExpandedModel(preloadedModels[0]?.modelId || null);
    }
  }, [preloadedModels]);

  const handleUpdateModel = (
    index: number,
    field: 'salePrice' | 'quantity',
    value: number
  ) => {
    setSelectedModels(prev =>
      prev.map((m, i) => {
        if (i !== index) return m;
        if (field === 'quantity') {
          const newQty = Math.max(1, value);
          const serials = [...m.serialNumbers];
          if (newQty > serials.length) {
            while (serials.length < newQty) serials.push('');
          } else {
            const removed = serials.splice(newQty);
            const newCities = { ...m.serialCities };
            removed.forEach(s => { if (s) delete newCities[s]; });
            return { ...m, quantity: newQty, serialNumbers: serials, serialCities: newCities };
          }
          return { ...m, quantity: newQty, serialNumbers: serials };
        }
        return { ...m, [field]: value };
      })
    );
  };

  const handleRemoveModel = (index: number) =>
    setSelectedModels(prev => prev.filter((_, i) => i !== index));

  const handleUpdateSerial = (modelIdx: number, serialIdx: number, value: string) => {
    setSelectedModels(prev =>
      prev.map((m, i) => {
        if (i !== modelIdx) return m;
        const serials   = [...m.serialNumbers];
        const oldSerial = serials[serialIdx];
        serials[serialIdx] = value;
        const newCities = { ...m.serialCities };
        if (oldSerial && newCities[oldSerial]) {
          const city = newCities[oldSerial];
          delete newCities[oldSerial];
          if (value) newCities[value] = city;
        }
        return { ...m, serialNumbers: serials, serialCities: newCities };
      })
    );
  };

  const handleUpdateSerialCity = (modelIdx: number, serialIdx: number, city: string) => {
    setSelectedModels(prev =>
      prev.map((m, i) => {
        if (i !== modelIdx) return m;
        const serial = m.serialNumbers[serialIdx];
        if (!serial) return m;
        return { ...m, serialCities: { ...m.serialCities, [serial]: city } };
      })
    );
  };

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500';

  // ── SHARED COMPONENTS ────────────────────────────────────────────────────────
  const stepsDef = costingOption === 'with'
    ? [{ n: 1, l: 'Type' }, { n: 2, l: 'Costing' }, { n: 3, l: 'Details' }, { n: 4, l: 'Products' }]
    : [{ n: 1, l: 'Type' }, { n: 2, l: 'Costing' }, { n: 3, l: 'Details' }];
  const currentStepNum = costingOption === 'with' ? 4 : 3;

  const ProgressBar = () => (
    <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', maxWidth: costingOption === 'with' ? 640 : 560, margin: '0 auto' }}>
        {stepsDef.map((step, i) => {
          const active = step.n === currentStepNum;
          const done   = step.n < currentStepNum;
          const last   = i === stepsDef.length - 1;
          return (
            <React.Fragment key={step.n}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 13, flexShrink: 0,
                  backgroundColor: done || active ? '#0f172a' : '#e5e7eb',
                  color: done || active ? '#fff' : '#9ca3af',
                  boxShadow: active ? '0 0 0 4px rgba(15,23,42,0.12)' : 'none',
                }}>
                  {done ? '✓' : step.n}
                </div>
                <span style={{ marginTop: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: done || active ? '#0f172a' : '#94a3b8', whiteSpace: 'nowrap' as const }}>
                  {step.l}
                </span>
              </div>
              {!last && (
                <div style={{ flex: 1, height: 2, borderRadius: 99, margin: '0 8px', marginBottom: 20, backgroundColor: done ? '#0f172a' : '#e5e7eb' }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  const DealerPriceField = () => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
        <Tag className="w-4 h-4 text-emerald-500" />
        Dealer Price ({getGlobalCurrencySymbol()})
        <span className="ml-1 text-xs text-gray-400 font-normal">(Optional)</span>
      </label>
      <input
        type="number"
        value={dealerPrice}
        onChange={e => setDealerPrice(e.target.value === '' ? '' : Number(e.target.value))}
        className={inputCls}
        min={0}
        placeholder="e.g. 85000"
      />
      <p className="text-xs text-gray-400 mt-1">
        Special price offered to dealers. Leave blank if not applicable.
      </p>
    </div>
  );

  const LocationField = () => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
        <MapPin className="w-4 h-4 text-indigo-500" />
        Stocking Location <span className="text-red-500">*</span>
      </label>
      <select
        value={formData.location || ''}
        onChange={e => setLocation(e.target.value)}
        className={`${inputCls} ${validationErrors.location ? 'border-red-500' : ''}`}
      >
        <option value="">Select location</option>
        {cities.map(city => (
          <option key={city} value={city}>{city}</option>
        ))}
      </select>
      {validationErrors.location && (
        <p className="text-red-500 text-sm mt-1">{validationErrors.location}</p>
      )}
      <p className="text-xs text-gray-400 mt-1">
        Where these units are being stocked. Serial numbers will be assigned to this location.
      </p>
    </div>
  );

  const CommonFields = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
        <select
          value={formData.category}
          onChange={e => setCategory(e.target.value)}
          className={`${inputCls} ${validationErrors.category ? 'border-red-500' : ''}`}
        >
          <option value="">Select category</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        {validationErrors.category && (
          <p className="text-red-500 text-sm mt-1">{validationErrors.category}</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
        <select
          value={formData.status}
          onChange={e => setStatus(e.target.value as any)}
          className={inputCls}
        >
          <option value="New">New</option>
          <option value="Used">Used</option>
          <option value="Returned">Returned</option>
        </select>
      </div>
      <LocationField />
      <DealerPriceField />
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
        <textarea
          value={formData.description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          placeholder="Notes, specs, warranty terms. Press Enter for a new line — each line is preserved."
          className={`${inputCls} resize-vertical whitespace-pre-wrap`}
        />
        {validationErrors.description && (
          <p className="text-red-500 text-sm mt-1">{validationErrors.description}</p>
        )}
      </div>
    </div>
  );

  // Pass dealerPrice into selectedModels before navigating
  const handleNextWithDealer = (models?: SelectedModel[]) => {
    const enriched = models?.map(m => ({
      ...m,
      dealerPrice: dealerPrice !== '' ? Number(dealerPrice) : undefined,
    }));
    handleNext(enriched as any);
  };

  // ⚠️ TEMPORARY reseed button — fixed position, visible on all sub-views
  const ReseedButton = () => {
    const label = {
      idle:    '🔧 Fix Brands',
      running: '⏳ Fixing...',
      done:    '✅ Done! Reloading...',
      error:   '❌ Failed — see console',
    }[reseedStatus];

    const bg = {
      idle:    '#dc2626',
      running: '#d97706',
      done:    '#16a34a',
      error:   '#7c3aed',
    }[reseedStatus];

    return (
      <button
        onClick={handleReseed}
        disabled={reseedStatus === 'running' || reseedStatus === 'done'}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          padding: '10px 18px', backgroundColor: bg,
          color: '#fff', border: 'none', borderRadius: 8,
          fontWeight: 700, fontSize: 13,
          cursor: reseedStatus === 'idle' ? 'pointer' : 'not-allowed',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        }}
      >
        {label}
      </button>
    );
  };

  // WITHOUT COSTING — single model
  if (costingOption === 'without') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc' }}>

        {/* Header */}
        <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={handleBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
              <ArrowLeft size={16} /> Back
            </button>
            <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Package size={17} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Simple Product Entry</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Quick entry without detailed costing</div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <InventoryCurrencyDropdown
                loading={ratesLoading}
                error={ratesError}
                lastUpdated={lastUpdated}
                compact
              />
            </div>
          </div>
        </div>

        <ProgressBar />

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div className="bg-white rounded-lg shadow-sm border p-8 space-y-6">
            {/* Brand / Model / Prices */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand & Model *</label>
                <BrandModelSelector
                  initialBrandId={singleModel.brandId}
                  initialModelId={singleModel.modelId}
                  onBrandChange={(brandId, brandName) => {
                    setSingleModelField('brandId', brandId);
                    setSingleModelField('brandName', brandName);
                    setBrandName(brandName);
                  }}
                  onModelChange={(modelId, modelName, costPrice, sellPrice) => {
                    setSingleModelField('modelId', modelId);
                    setSingleModelField('modelName', modelName);
                    setModelName(modelName);
                    if (typeof costPrice === 'number' && costPrice > 0) {
                      setSingleModelField('costPrice', costPrice);
                      setCostPrice(costPrice);
                    }
                    if (typeof sellPrice === 'number' && sellPrice > 0) {
                      setSingleModelField('sellPrice', sellPrice);
                      setSellPrice(sellPrice);
                    }
                  }}
                  brandError={validationErrors.brandName}
                  modelError={validationErrors.modelName}
                />
                {(validationErrors.brandName || validationErrors.modelName) && (
                  <p className="text-red-500 text-sm mt-1">Please select a brand and model</p>
                )}
              </div>
              <div>
                <CurrencyPriceInput
                  label="Cost Price"
                  pkrValue={singleModel.costPrice ?? 0}
                  onChange={value => {
                    setSingleModelField('costPrice', value);
                    setCostPrice(value);
                  }}
                  required={false}
                />
              </div>
              <div>
                <CurrencyPriceInput
                  label="Sell Price"
                  pkrValue={singleModel.sellPrice ?? 0}
                  onChange={value => {
                    setSingleModelField('sellPrice', value);
                    setSellPrice(value);
                  }}
                  required
                />
              </div>
            </div>

            {/* Category / Qty / Status / Location / Dealer Price / Description */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category *</label>
                <select
                  value={formData.category}
                  onChange={e => setCategory(e.target.value)}
                  className={`${inputCls} ${validationErrors.category ? 'border-red-500' : ''}`}
                >
                  <option value="">Select category</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                {validationErrors.category && (
                  <p className="text-red-500 text-sm mt-1">{validationErrors.category}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stock Qty *</label>
                <input
                  type="number"
                  value={formData.stock || ''}
                  onChange={e => setStock(Number(e.target.value))}
                  className={inputCls}
                  min={1}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={e => setStatus(e.target.value as any)}
                  className={inputCls}
                >
                  <option value="New">New</option>
                  <option value="Used">Used</option>
                  <option value="Returned">Returned</option>
                </select>
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-indigo-500" />
                  Stocking Location *
                </label>
                <select
                  value={formData.location || ''}
                  onChange={e => setLocation(e.target.value)}
                  className={`${inputCls} ${validationErrors.location ? 'border-red-500' : ''}`}
                >
                  <option value="">Select location</option>
                  {cities.map(city => <option key={city} value={city}>{city}</option>)}
                </select>
                {validationErrors.location && (
                  <p className="text-red-500 text-sm mt-1">{validationErrors.location}</p>
                )}
              </div>

              {/* Dealer Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-emerald-500" />
                  Dealer Price ({getGlobalCurrencySymbol()})
                  <span className="ml-1 text-xs text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="number"
                  value={dealerPrice}
                  onChange={e =>
                    setDealerPrice(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className={inputCls}
                  min={0}
                  placeholder="e.g. 85000"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Special price offered to dealers. Leave blank if not applicable.
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
                <textarea
                  value={formData.description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Notes, specs, warranty terms. Press Enter for a new line — each line is preserved."
                  className={`${inputCls} resize-vertical whitespace-pre-wrap`}
                />
                {validationErrors.description && (
                  <p className="text-red-500 text-sm mt-1">{validationErrors.description}</p>
                )}
              </div>
            </div>

            {/* Serial numbers */}
            {formData.stock > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Hash className="w-5 h-5" />
                  Serial Numbers ({formData.stock} units)
                  {formData.location && (
                    <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      📍 {formData.location}
                    </span>
                  )}
                </h4>
                {validationErrors.serialNumbers && (
                  <p className="text-red-500 text-sm mb-2">{validationErrors.serialNumbers}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-64 overflow-y-auto p-4 bg-gray-50 rounded-lg">
                  {Array.from({ length: formData.stock }, (_, i) => (
                    <div key={i} className="bg-white p-4 rounded-lg border">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Unit {i + 1}</label>
                      <input
                        type="text"
                        value={serialInputs[i] || ''}
                        onChange={e => updateSerialNumber(i, e.target.value)}
                        className="w-full px-3 py-1 border rounded-lg mb-1 text-sm"
                        placeholder={`Serial #${i + 1}`}
                      />
                      <select
                        value={formData.serialCities[serialInputs[i]] || formData.location || ''}
                        onChange={e => updateSerialCity(i, e.target.value)}
                        className="w-full px-3 py-1 border rounded-lg text-sm"
                      >
                        <option value="">Location</option>
                        {cities.map(city => <option key={city} value={city}>{city}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                {formData.location && (
                  <p className="text-xs text-gray-400 mt-2">
                    💡 City defaults to <strong>{formData.location}</strong> if not changed per-unit.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-6 border-t">
              <button
                onClick={handleBack}
                className="px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <ArrowLeft size={18} />Back
              </button>
              <button
                onClick={() => handleNext()}
                disabled={isSaving}
                className="px-8 py-3 rounded-lg font-semibold text-white text-lg shadow-lg flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving
                  ? <><Loader2 size={18} className="animate-spin" /> Saving…</>
                  : <><Check size={18} /> Save Inventory</>
                }
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>
    );
  }

  // WITH COSTING — per-model serial inputs + dealer price in common section
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Package size={17} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Product Details</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Set sale prices & serial numbers for <strong>{costingBrandName}</strong> models</div>
          </div>
        </div>
      </div>

      <ProgressBar />

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div className="bg-white rounded-lg shadow-sm border p-8 space-y-6">
          {/* Loading / status banner */}
          {isLoadingModels ? (
            <div className="flex items-center gap-3 px-5 py-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              <span className="text-sm text-indigo-700 font-medium">
                Fetching models for <strong>{costingBrandName}</strong>...
              </span>
            </div>
          ) : selectedModels.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 border border-amber-200 rounded-lg">
              <Package className="w-5 h-5 text-amber-500" />
              <span className="text-sm text-amber-800">
                No models loaded. Check that the costing step saved models correctly.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-5 py-3 bg-green-50 border border-green-200 rounded-lg">
              <Package className="w-5 h-5 text-green-600" />
              <span className="text-sm text-green-800">
                <strong>{selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''}</strong>{' '}
                loaded. Set the sale price, quantity, and serial numbers for each model below.
              </span>
            </div>
          )}

          {/* Per-model cards */}
          {selectedModels.map((model, modelIdx) => {
            const isExpanded    = expandedModel === model.modelId;
            const filledSerials = model.serialNumbers.filter(s => s.trim() !== '').length;
            const serialError   = validationErrors[`serials_${modelIdx}`];

            return (
              <div
                key={model.modelId}
                className="border border-gray-200 rounded-xl overflow-hidden shadow-sm"
              >
                <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <Package className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{model.modelName}</p>
                      <p className="text-xs text-gray-500">
                        Cost: {getGlobalCurrencySymbol()} {model.costPrice.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600 font-medium whitespace-nowrap">Qty:</label>
                      <input
                        type="number"
                        min="1"
                        value={model.quantity}
                        onChange={e => handleUpdateModel(modelIdx, 'quantity', Number(e.target.value))}
                        className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600 font-medium whitespace-nowrap">Sale Price:</label>
                      <input
                        type="number"
                        min="0"
                        value={model.salePrice || ''}
                        onChange={e => handleUpdateModel(modelIdx, 'salePrice', Number(e.target.value))}
                        className="w-28 px-2 py-1 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        filledSerials === model.quantity && model.quantity > 0
                          ? 'bg-green-100 text-green-700'
                          : filledSerials > 0
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {filledSerials}/{model.quantity} serials
                    </div>
                    <button
                      onClick={() => handleRemoveModel(modelIdx)}
                      className="text-xs text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-lg transition-colors font-medium"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => setExpandedModel(isExpanded ? null : model.modelId)}
                      className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1.5 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                      <Hash size={14} /> Serials
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-6 py-5 bg-white">
                    <div className="flex items-center justify-between mb-4">
                      <h5 className="font-medium text-gray-800 flex items-center gap-2">
                        <Hash className="w-4 h-4 text-indigo-500" />
                        Serial Numbers for{' '}
                        <span className="text-indigo-700">{model.modelName}</span>
                        <span className="text-xs text-gray-400 font-normal">
                          ({model.quantity} unit{model.quantity !== 1 ? 's' : ''})
                        </span>
                        {formData.location && (
                          <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                            📍 {formData.location}
                          </span>
                        )}
                      </h5>
                      {serialError && (
                        <p className="text-red-500 text-xs font-medium">{serialError}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Array.from({ length: model.quantity }, (_, serialIdx) => (
                        <div key={serialIdx} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                            Unit {serialIdx + 1}
                          </label>
                          <input
                            type="text"
                            value={model.serialNumbers[serialIdx] || ''}
                            onChange={e => handleUpdateSerial(modelIdx, serialIdx, e.target.value)}
                            placeholder={`Serial #${serialIdx + 1}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white mb-2"
                          />
                          <select
                            value={
                              model.serialCities[model.serialNumbers[serialIdx]] ||
                              formData.location ||
                              ''
                            }
                            onChange={e => handleUpdateSerialCity(modelIdx, serialIdx, e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300 bg-white text-gray-600"
                          >
                            <option value="">Location (optional)</option>
                            {cities.map(city => <option key={city} value={city}>{city}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    {formData.location && (
                      <p className="text-xs text-gray-400 mt-2">
                        💡 City pre-filled with <strong>{formData.location}</strong> — change per-unit if needed.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {validationErrors.models && (
            <p className="text-red-500 text-sm">{validationErrors.models}</p>
          )}

          {/* Common fields including location + dealer price */}
          <div className="border-t pt-6">
            <h4 className="font-semibold text-gray-900 mb-4">Common Details</h4>
            <CommonFields />
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-8 border-t">
            <button
              onClick={handleBack}
              className="px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <ArrowLeft size={18} />Back to Costing
            </button>
            <div className="flex items-center gap-4">
              {!isLoadingModels && selectedModels.length === 0 && (
                <p className="text-amber-600 text-sm font-medium">At least one model is required</p>
              )}
              <button
                onClick={() => handleNextWithDealer(selectedModels)}
                disabled={isLoadingModels || selectedModels.length === 0 || isSaving}
                className={`px-8 py-3 rounded-lg font-semibold text-lg shadow-lg flex items-center gap-2 transition-colors ${
                  !isLoadingModels && !isSaving && selectedModels.length > 0
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800'
                    : 'bg-gray-200 text-gray-700 cursor-not-allowed'
                }`}
              >
                {isLoadingModels ? (
                  <><Loader2 size={18} className="animate-spin" /> Loading...</>
                ) : isSaving ? (
                  <><Loader2 size={18} className="animate-spin" /> Saving…</>
                ) : (
                  <><Check size={18} /> Save Inventory</>
                )}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};