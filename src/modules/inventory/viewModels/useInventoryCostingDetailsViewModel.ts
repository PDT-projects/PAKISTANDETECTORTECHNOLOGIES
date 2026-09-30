// Inventory Module - ViewModel Layer
// useInventoryCostingDetailsViewModel - Step 3: Multi-model costing inputs
// UPDATED: Fetches brand's existing models from Firestore for dropdown in CostingTable.
//          Saves brand + models to Firestore on Next so dropdown is pre-populated.

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CostingOption, InventoryEntryType, CostingModel, CostingInfo } from '../models/types';
import {
  createEmptyCostingModel,
  recalculateAllModels,
  createInitialCostingInfo,
  calculateModelCosts,
} from '../models/costingCalculator';
import { BrandModelFirebaseService } from '../models/InventoryFirebaseService';

// ── Known brand list (same as shown in the Brand dropdown UI) ─────────────────
export const KNOWN_BRANDS = [
  'AKAAS DETECTORS', 'Andralian', 'Black Dog Xtreme', 'Bounty Hunter VLF',
  'China', 'DHFHJ', 'Detector', 'Detek', 'EKibi', 'Fisher', 'GEO',
  'GROGROUND', 'GOLD XTRA', 'GTR TURKEY', 'Garrett', 'Gold Star',
  'Gold Stinger X5', 'Hira Dedector', 'JOKER', 'Lorenz', 'Minelab',
  'Multimax', 'Nokta', 'Nokta Makro', 'OKM', 'OKM EXP 6000 PROFESSIONAL PLUS',
  'PMX', 'Practice', 'Quest', 'Reaper 2', 'Super Wand', 'Teknetics',
  'WHITES', 'X5 ID Maxx', 'XP', 'yrVHc70ojKVFNl9wkLYb',
];

export interface BrandModelOption {
  id: string;
  modelName: string;
  costPrice?: number;
}

export interface UseInventoryCostingDetailsViewModelReturn {
  costingInfo: CostingInfo | undefined;
  costingOption: CostingOption;
  inventoryType: InventoryEntryType;
  isSaving: boolean;
  saveError: string | null;
  validationErrors: { [key: string]: string };
  isValid: boolean;
  setCostingBrandName: (value: string) => void;
  setUsdRate: (value: number) => void;
  setTotalCustomsValue: (value: number) => void;
  setTotalFreightValue: (value: number) => void;
  addModel: () => void;
  updateModelField: (modelId: string, field: keyof CostingModel, value: string | number) => void;
  removeModel: (modelId: string) => void;
  handleNext: () => void;
  handleBack: () => void;
  showCostingFields: boolean;
  costingSummary: {
    totalUnitCostUSD: number;
    shipmentTotalUSD: number;
    consignmentValue: number;
    totalValueOfBrand: number;
  };
  // NEW: models available for the selected brand
  brandModelOptions: BrandModelOption[];
  brandModelOptionsLoading: boolean;
}

export function useInventoryCostingDetailsViewModel(): UseInventoryCostingDetailsViewModelReturn {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const costingOption = (searchParams.get('costing') as CostingOption) || 'without';
  const inventoryType = (searchParams.get('type') as InventoryEntryType) || 'payment';

  const [costingInfo, setCostingInfo] = useState<CostingInfo | undefined>(() =>
    costingOption === 'with' ? createInitialCostingInfo() : undefined
  );
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Fetch existing models when brand name changes ────────────────────────────
  const [brandModelOptions, setBrandModelOptions] = useState<BrandModelOption[]>([]);
  const [brandModelOptionsLoading, setBrandModelOptionsLoading] = useState(false);

  useEffect(() => {
    const brandName = costingInfo?.brandName?.trim();
    if (!brandName) {
      setBrandModelOptions([]);
      return;
    }
    let cancelled = false;
    setBrandModelOptionsLoading(true);
    BrandModelFirebaseService.fetchModelsByBrandName(brandName)
      .then(models => {
        if (!cancelled) setBrandModelOptions(models);
      })
      .catch(() => {
        if (!cancelled) setBrandModelOptions([]);
      })
      .finally(() => {
        if (!cancelled) setBrandModelOptionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [costingInfo?.brandName]);

  // ── Recalculate when global fields change ────────────────────────────────────
  useEffect(() => {
    if (costingOption === 'with' && costingInfo && costingInfo.models.length > 0) {
      const { models, usdRate, totalCustomsValue, totalFreightValue } = costingInfo;
      const result = recalculateAllModels(models, usdRate, totalCustomsValue, totalFreightValue);
      setCostingInfo(prev => prev ? {
        ...prev,
        models:            result.models,
        totalUnitCostUSD:  result.summary.totalUnitCostUSD,
        shipmentTotalUSD:  result.summary.shipmentTotalUSD,
        consignmentValue:  result.summary.consignmentValue,
        totalValueOfBrand: result.summary.totalValueOfBrand,
      } : undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costingInfo?.usdRate, costingInfo?.totalCustomsValue, costingInfo?.totalFreightValue, costingOption]);

  const setCostingBrandName  = useCallback((v: string) => setCostingInfo(p => p ? { ...p, brandName: v } : undefined), []);
  const setUsdRate           = useCallback((v: number) => setCostingInfo(p => p ? { ...p, usdRate: v } : undefined), []);
  const setTotalCustomsValue = useCallback((v: number) => setCostingInfo(p => p ? { ...p, totalCustomsValue: v } : undefined), []);
  const setTotalFreightValue = useCallback((v: number) => setCostingInfo(p => p ? { ...p, totalFreightValue: v } : undefined), []);

  const addModel = useCallback(() => {
    setCostingInfo(prev => prev ? { ...prev, models: [...prev.models, createEmptyCostingModel()] } : undefined);
  }, []);

  const updateModelField = useCallback((modelId: string, field: keyof CostingModel, value: string | number) => {
    setCostingInfo(prev => {
      if (!prev) return prev;
      const tot  = prev.models.reduce((s, m) => s + m.unitCostUSD, 0);
      const ship = prev.models.reduce((s, m) => s + m.units * m.unitCostUSD, 0);
      const updated = prev.models.map(m => {
        if (m.id !== modelId) return m;
        return calculateModelCosts({ ...m, [field]: value }, tot, ship, prev.usdRate, prev.totalCustomsValue, prev.totalFreightValue);
      });
      const result = recalculateAllModels(updated, prev.usdRate, prev.totalCustomsValue, prev.totalFreightValue);
      return {
        ...prev,
        models:            result.models,
        totalUnitCostUSD:  result.summary.totalUnitCostUSD,
        shipmentTotalUSD:  result.summary.shipmentTotalUSD,
        consignmentValue:  result.summary.consignmentValue,
        totalValueOfBrand: result.summary.totalValueOfBrand,
      };
    });
  }, []);

  const removeModel = useCallback((modelId: string) => {
    setCostingInfo(prev => {
      if (!prev) return prev;
      const updated = prev.models.filter(m => m.id !== modelId);
      if (updated.length > 0) {
        const result = recalculateAllModels(updated, prev.usdRate, prev.totalCustomsValue, prev.totalFreightValue);
        return {
          ...prev,
          models:            result.models,
          totalUnitCostUSD:  result.summary.totalUnitCostUSD,
          shipmentTotalUSD:  result.summary.shipmentTotalUSD,
          consignmentValue:  result.summary.consignmentValue,
          totalValueOfBrand: result.summary.totalValueOfBrand,
        };
      }
      return { ...prev, models: [], totalUnitCostUSD: 0, shipmentTotalUSD: 0, consignmentValue: 0, totalValueOfBrand: 0 };
    });
  }, []);

  const validateForm = useCallback((): boolean => {
    const errors: { [key: string]: string } = {};
    if (costingOption === 'with' && costingInfo) {
      if (!costingInfo.brandName.trim()) errors.brandName = 'Brand name is required';
      if (costingInfo.models.length === 0) errors.models = 'At least one model is required';
      costingInfo.models.forEach((m, i) => {
        if (!m.modelName.trim()) errors[`model_${i}`] = `Model ${i + 1} name is required`;
        if (m.units <= 0)        errors[`units_${i}`] = `Model ${i + 1} units must be > 0`;
        if (m.unitCostUSD <= 0)  errors[`cost_${i}`]  = `Model ${i + 1} unit cost must be > 0`;
      });
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [costingInfo, costingOption]);

  const isValid = useMemo(() => {
    if (costingOption !== 'with') return true;
    if (!costingInfo || costingInfo.models.length === 0) return false;
    return costingInfo.brandName.trim() !== '' &&
      costingInfo.models.every(m => m.modelName.trim() !== '' && m.units > 0 && m.unitCostUSD > 0);
  }, [costingInfo, costingOption]);

  const costingSummary = useMemo(() => ({
    totalUnitCostUSD:  costingInfo?.totalUnitCostUSD  || 0,
    shipmentTotalUSD:  costingInfo?.shipmentTotalUSD  || 0,
    consignmentValue:  costingInfo?.consignmentValue  || 0,
    totalValueOfBrand: costingInfo?.totalValueOfBrand || 0,
  }), [costingInfo]);

  const handleNext = useCallback(async () => {
    if (!validateForm()) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const params = new URLSearchParams({ type: inventoryType, costing: costingOption });

      if (costingOption === 'with' && costingInfo) {
        // Save brand + models to Firestore → they appear in dropdown on next screen
        const { brandId, modelIds } = await BrandModelFirebaseService.saveCostingBrandAndModels(
          costingInfo.brandName,
          costingInfo.models.map(m => ({ modelName: m.modelName, costPrice: m.totalLandedUnitCost }))
        );

        params.set('costingBrandName',  costingInfo.brandName);
        params.set('costingBrandId',    brandId);
        params.set('costingModelIds',   JSON.stringify(modelIds));
        params.set('usdRate',           costingInfo.usdRate.toString());
        params.set('totalCustomsValue', costingInfo.totalCustomsValue.toString());
        params.set('totalFreightValue', costingInfo.totalFreightValue.toString());
        params.set('consignmentValue',  costingInfo.consignmentValue.toString());
        params.set('totalValueOfBrand', costingInfo.totalValueOfBrand.toString());
        params.set('shipmentTotalUSD',  costingInfo.shipmentTotalUSD.toString());
        params.set('totalUnitCostUSD',  costingInfo.totalUnitCostUSD.toString());
        params.set('costingModels',     JSON.stringify(costingInfo.models));
      }

      navigate(`/inventory/create-new/details?${params.toString()}`);
    } catch (error) {
      const msg = 'Failed to save costing data. Please try again.';
      setSaveError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [navigate, costingInfo, costingOption, validateForm, inventoryType]);

  const handleBack = useCallback(() => navigate(`/inventory/create-new/costing?type=${inventoryType}`), [navigate, inventoryType]);

  return {
    costingInfo, costingOption, inventoryType, isSaving, saveError,
    validationErrors, isValid,
    setCostingBrandName, setUsdRate, setTotalCustomsValue, setTotalFreightValue,
    addModel, updateModelField, removeModel,
    handleNext, handleBack,
    showCostingFields: costingOption === 'with',
    costingSummary,
    brandModelOptions,
    brandModelOptionsLoading,
  };
}