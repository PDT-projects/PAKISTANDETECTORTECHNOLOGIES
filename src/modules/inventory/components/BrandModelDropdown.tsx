// Inventory Module - Component
// BrandModelDropdown - Combobox-style Brand/Model selector
// Fetches from Firestore via BrandModelFirebaseService

import React, { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Plus, Loader2, Tag, Box } from 'lucide-react';
import { BrandModelFirebaseService, BrandDoc, ModelDoc } from '../models/InventoryFirebaseService';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

interface BrandModelDropdownProps {
  onBrandChange: (brandId: string, brandName: string) => void;
  /**
   * `model` carries the whole stored profile — category, description,
   * warrantyYears, buyType, location — so the parent can prefill the rest of
   * its form without a second Firestore round-trip. Optional, so existing
   * callers that only destructure three params keep compiling.
   */
  onModelChange: (modelId: string, modelName: string, costPrice: number, model?: ModelDoc) => void;
  defaultBrandId?: string;
  defaultModelId?: string;
  className?: string;
}

export const BrandModelDropdown: React.FC<BrandModelDropdownProps> = ({
  onBrandChange, onModelChange, defaultBrandId, defaultModelId, className,
}) => {
  // Follows the Admin's global currency setting — symbol-only, no conversion.
  const { symbol: currencySymbol } = useGlobalCurrency();
  const [brandOpen, setBrandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<BrandDoc | null>(null);
  const [selectedModel, setSelectedModel] = useState<{ id: string; name: string; costPrice: number; description?: string } | null>(null);
  const [brands, setBrands] = useState<BrandDoc[]>([]);
  const [models, setModels] = useState<ModelDoc[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');

  useEffect(() => { loadBrands(); }, []);
  useEffect(() => {
    if (selectedBrand?.id) loadModels(selectedBrand.id);
    else setModels([]);
  }, [selectedBrand?.id]);

  const loadBrands = async () => {
    setLoadingBrands(true);
    try {
      const fetched = await BrandModelFirebaseService.fetchAllBrands();
      setBrands(fetched);
      if (defaultBrandId) {
        const match = fetched.find(b => b.id === defaultBrandId);
        if (match) { setSelectedBrand(match); onBrandChange(match.id, match.name); }
      }
    } catch { setBrands([]); }
    finally { setLoadingBrands(false); }
  };

  const loadModels = async (brandId: string) => {
    setLoadingModels(true);
    try {
      const fetched = await BrandModelFirebaseService.fetchModelsByBrand(brandId);
      setModels(fetched);
      if (defaultModelId) {
        const match = fetched.find(m => m.id === defaultModelId);
        if (match) {
          const cp = match.costPrice || 0;
          setSelectedModel({ id: match.id, name: match.name, costPrice: cp, description: match.description });
          onModelChange(match.id, match.name, cp, match);
        }
      }
    } catch { setModels([]); }
    finally { setLoadingModels(false); }
  };

  const filteredBrands = brands.filter(b => b.name.toLowerCase().includes(brandSearch.toLowerCase()));
  const filteredModels = models.filter(m => m.name.toLowerCase().includes(modelSearch.toLowerCase()));

  const handleBrandSelect = (brand: BrandDoc) => {
    setSelectedBrand(brand); setSelectedModel(null);
    setBrandOpen(false); setBrandSearch('');
    onBrandChange(brand.id, brand.name);
  };

  const handleModelSelect = (model: ModelDoc) => {
    const cp = model.costPrice || 0;
    setSelectedModel({ id: model.id, name: model.name, costPrice: cp, description: model.description });
    setModelOpen(false); setModelSearch('');
    onModelChange(model.id, model.name, cp, model);
  };

  return (
    <div className={`space-y-4 ${className || ''}`}>
      {/* Brand */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-100">
            <Tag className="h-3.5 w-3.5 text-blue-600" />
          </span>
          Brand <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <button type="button" onClick={() => setBrandOpen(p => !p)} disabled={loadingBrands}
            className="w-full justify-between h-11 px-4 font-normal rounded-xl border flex items-center bg-white shadow-sm transition-all duration-150 hover:border-blue-400 hover:bg-blue-50/30">
            <span className="truncate text-sm">
              {loadingBrands ? 'Loading brands...' : selectedBrand?.name || 'Select a brand...'}
            </span>
            {loadingBrands
              ? <Loader2 className="ml-2 h-4 w-4 animate-spin text-gray-300" />
              : <ChevronsUpDown className="ml-2 h-4 w-4 text-gray-300" />}
          </button>
          {brandOpen && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden">
              <div className="border-b border-gray-100 bg-gray-50/50 px-3">
                <input autoFocus value={brandSearch} onChange={e => setBrandSearch(e.target.value)}
                  placeholder="Search brand..." className="h-10 w-full text-sm bg-transparent border-0 outline-none" />
              </div>
              <div className="max-h-52 overflow-y-auto py-1.5">
                {filteredBrands.length === 0
                  ? <div className="py-8 text-center"><div className="text-2xl mb-1">🏷️</div><div className="text-sm text-gray-400">No brands found</div></div>
                  : filteredBrands.map(brand => (
                    <button key={brand.id} type="button" onClick={() => handleBrandSelect(brand)}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm transition-colors ${selectedBrand?.id === brand.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <div className={`w-2 h-2 rounded-full ${selectedBrand?.id === brand.id ? 'bg-blue-500' : 'bg-gray-200'}`} />
                      <span className="flex-1 text-left">{brand.name}</span>
                      {selectedBrand?.id === brand.id && <Check className="h-3.5 w-3.5 text-blue-500" />}
                    </button>
                  ))
                }
                <div className="mx-3 my-1 border-t border-gray-100" />
                <button type="button" onClick={() => setBrandOpen(false)}
                  className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm text-blue-500 hover:bg-blue-50/60 font-medium">
                  <div className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-blue-100">
                    <Plus className="h-3 w-3 text-blue-600" />
                  </div>
                  Add new brand
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-purple-100">
            <Box className="h-3.5 w-3.5 text-purple-600" />
          </span>
          Model <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <button type="button" onClick={() => { if (selectedBrand) setModelOpen(p => !p); }}
            disabled={!selectedBrand || loadingModels}
            className={`w-full justify-between h-11 px-4 font-normal rounded-xl border flex items-center bg-white shadow-sm transition-all duration-150 hover:border-purple-400 hover:bg-purple-50/30 ${!selectedBrand ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''}`}>
            <span className="truncate text-sm">
              {!selectedBrand ? 'Select a brand first'
                : loadingModels ? 'Loading models...'
                : selectedModel?.name || 'Select a model...'}
            </span>
            {loadingModels
              ? <Loader2 className="ml-2 h-4 w-4 animate-spin text-gray-300" />
              : <ChevronsUpDown className="ml-2 h-4 w-4 text-gray-300" />}
          </button>
          {modelOpen && selectedBrand && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden">
              <div className="border-b border-gray-100 bg-gray-50/50 px-3">
                <input autoFocus value={modelSearch} onChange={e => setModelSearch(e.target.value)}
                  placeholder="Search model..." className="h-10 w-full text-sm bg-transparent border-0 outline-none" />
              </div>
              <div className="max-h-52 overflow-y-auto py-1.5">
                {filteredModels.length === 0
                  ? <div className="py-8 text-center"><div className="text-2xl mb-1">📦</div><div className="text-sm text-gray-400">No models for {selectedBrand.name}</div></div>
                  : filteredModels.map(model => (
                    <button key={model.id} type="button" onClick={() => handleModelSelect(model)}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm transition-colors ${selectedModel?.id === model.id ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <div className={`w-2 h-2 rounded-full ${selectedModel?.id === model.id ? 'bg-purple-500' : 'bg-gray-200'}`} />
                      <span className="flex-1 text-left">{model.name}</span>
                      {model.costPrice != null && model.costPrice > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selectedModel?.id === model.id ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                          {currencySymbol} {model.costPrice.toLocaleString()}
                        </span>
                      )}
                      {selectedModel?.id === model.id && <Check className="h-3.5 w-3.5 text-purple-500" />}
                    </button>
                  ))
                }
                <div className="mx-3 my-1 border-t border-gray-100" />
                <button type="button" onClick={() => setModelOpen(false)}
                  className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm text-purple-500 hover:bg-purple-50/60 font-medium">
                  <div className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-purple-100">
                    <Plus className="h-3 w-3 text-purple-600" />
                  </div>
                  Add new model for {selectedBrand.name}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary badge */}
      {(selectedBrand || selectedModel) && (
        <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/60 to-purple-50/40 px-4 py-3 space-y-2.5">
          {selectedBrand && (
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-100"><Tag className="h-3.5 w-3.5 text-blue-500" /></span>
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Brand</span>
              <span className="font-semibold text-gray-800">{selectedBrand.name}</span>
            </div>
          )}
          {selectedModel && (
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-purple-100"><Box className="h-3.5 w-3.5 text-purple-500" /></span>
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Model</span>
              <span className="font-semibold text-gray-800">{selectedModel.name}</span>
              <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-white border border-blue-200 text-blue-600 font-semibold shadow-sm whitespace-nowrap">
                {currencySymbol} {selectedModel.costPrice?.toLocaleString()}
              </span>
            </div>
          )}
          {/* Saved description. Shown because it is the field users most often
              assume did not carry over — it is not visible at a glance in the
              form the way Type or Warranty are. */}
          {selectedModel?.description && (
            <div className="flex items-start gap-3 text-sm pt-1 border-t border-blue-100/70">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 shrink-0 mt-0.5">
                <Box className="h-3.5 w-3.5 text-slate-500" />
              </span>
              <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider shrink-0 mt-1">Saved</span>
              <span className="text-gray-600 text-xs leading-relaxed whitespace-pre-wrap line-clamp-3">
                {selectedModel.description}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};