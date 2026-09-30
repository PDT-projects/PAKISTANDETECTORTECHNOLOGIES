// Inventory Module - ViewModel Layer
// useInventoryProductDetailsViewModel - Step 4: Product details
// Change: `location` field added to formData, passed through URL to payment step.
// With costing: location applies to the whole shipment (shared across models).
// Without costing: location is a required field for the single product.
// Change: `stockInDateManual` field added to formData, passed through URL to payment step.

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ProductFormData, CostingOption, BuyType, ProductStatus,
  InventoryEntryType, CostingModel, INVENTORY_LOCATIONS, CreateProductDTO,
} from '../models/types';
import {
  createInitialCostingInfo, calculateModelCosts,
  recalculateAllModels, createEmptyCostingModel,
} from '../models/costingCalculator';
import { BrandModelFirebaseService, InventoryFirebaseService } from '../models/InventoryFirebaseService';
import {
  fetchModelProfileByName, saveModelProfileByName, applyModelProfile,
} from '../models/BrandModelService';

const CATEGORIES = [
  'Detection Equipment', 'Security Equipment', 'Imaging Equipment',
  'Surveillance Systems', 'Access Control', 'Other',
];

/**
 * Wait for profile writes to land before the caller navigates away.
 *
 * saveModelProfileByName makes three sequential Firestore round-trips (read
 * brands → read models → write). Firing it without awaiting and then calling
 * navigate() unmounts the component mid-flight, and the write carrying the
 * description is frequently lost — while the product itself saves fine, so
 * nothing looks wrong until the next entry of the same model fails to prefill.
 *
 * allSettled, never all: profile bookkeeping must not turn a successful product
 * save into an error.
 */
async function settleProfileWrites(writes: Promise<void>[]): Promise<void> {
  if (writes.length === 0) return;
  const results = await Promise.allSettled(writes);
  const rejected = results.filter(r => r.status === 'rejected').length;
  if (rejected > 0) {
    console.warn(`[Inventory] ${rejected} model-profile write(s) failed — descriptions may not prefill next time`);
  }
}

export interface SelectedModel {
  modelId: string;
  modelName: string;
  costPrice: number;
  salePrice: number;
  quantity: number;
  serialNumbers: string[];
  serialCities: { [serial: string]: string };
}

export interface UseInventoryProductDetailsViewModelReturn {
  singleModel: { brandId?: string; modelId?: string; brandName: string; modelName: string; costPrice:number; sellPrice: number; quantity: number };
  setSingleModelField: (field: string, value: string | number) => void;
  formData: ProductFormData;
  costingOption: CostingOption;
  inventoryType: InventoryEntryType;
  costingBrandId: string;
  costingBrandName: string;
  preloadedModels: SelectedModel[];
  isLoadingModels: boolean;
  serialInputs: string[];
  validationErrors: { [key: string]: string };
  isValid: boolean;
  setBrandName: (v: string) => void;
  setModelName: (v: string) => void;
  setCategory: (v: string) => void;
  setCostPrice: (v: number) => void;  // ← FIX: was missing
  setSellPrice: (v: number) => void;
  setBuyType: (v: BuyType) => void;
  setWarrantyYears: (v: number) => void;
  setStock: (v: number) => void;
  setLocation: (v: string) => void;           // ← new
  setStockInDateManual: (v: string) => void;  // ← new: manual stock-in date override
  setDescription: (v: string) => void;
  setStatus: (v: ProductStatus) => void;
  setIsDamaged: (v: boolean) => void;
  setCostingBrandName: (v: string) => void;
  setUsdRate: (v: number) => void;
  setTotalCustomsValue: (v: number) => void;
  setTotalFreightValue: (v: number) => void;
  addModel: () => void;
  updateModelField: (modelId: string, field: keyof CostingModel, value: string | number) => void;
  removeModel: (modelId: string) => void;
  updateSerialNumber: (index: number, value: string) => void;
  updateSerialCity: (index: number, value: string) => void;
  updateModelSerial: (modelIdx: number, serialIdx: number, value: string) => void;
  updateModelSerialCity: (modelIdx: number, serialIdx: number, city: string) => void;
  handleNext: (selectedModels?: SelectedModel[]) => Promise<void> | void;
  handleBack: () => void;
  isSaving: boolean;
  showCostingFields: boolean;
  categories: string[];
  cities: string[];
  costingSummary: {
    totalUnitCostUSD: number; shipmentTotalUSD: number;
    consignmentValue: number; totalValueOfBrand: number;
  };
}

export function useInventoryProductDetailsViewModel(): UseInventoryProductDetailsViewModelReturn {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const costingOption    = (searchParams.get('costing') as CostingOption)    || 'without';
  const inventoryType    = (searchParams.get('type') as InventoryEntryType)  || 'payment';
  const costingBrandId   = searchParams.get('costingBrandId')   || '';
  const costingBrandName = searchParams.get('costingBrandName') || '';
  const costingModelIds: string[] = JSON.parse(searchParams.get('costingModelIds') || '[]');

  // Pre-load models from Firestore for with-costing path
  const [preloadedModels, setPreloadedModels] = useState<SelectedModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  useEffect(() => {
    if (costingOption !== 'with' || !costingBrandId) return;
    const fetchCostingModels = async () => {
      setIsLoadingModels(true);
      try {
        const allModels = await BrandModelFirebaseService.fetchModelsByBrand(costingBrandId);
        const filtered  = costingModelIds.length > 0
          ? allModels.filter(m => costingModelIds.includes(m.id))
          : allModels;
        const mapped: SelectedModel[] = filtered.map(m => ({
          modelId:       m.id,
          modelName:     m.name,
          costPrice:     m.costPrice || 0,
          salePrice:     Math.round((m.costPrice || 0) * 1.3),
          quantity:      1,
          serialNumbers: [''],
          serialCities:  {},
        }));
        setPreloadedModels(mapped);
      } catch (err) {
        console.error('❌ Failed to pre-load costing models:', err);
      } finally {
        setIsLoadingModels(false);
      }
    };
    fetchCostingModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costingBrandId, costingOption]);

  // Form state
const [singleModel, setSingleModel] = useState({
    brandId: '', modelId: '', brandName: '', modelName: '', costPrice: 0, sellPrice: 0, quantity: 1,
  });
  const setSingleModelField = useCallback((field: string, value: string | number) => {
    setSingleModel(prev => ({ ...prev, [field]: value }));
  }, []);

  const [formData, setFormData] = useState<ProductFormData>({
    currentStep: 2,
    costingOption,
    brandName:     costingBrandName,
    modelName:     '',
    category:      '',
    costPrice:     0,
    sellPrice:     0,
    buyType:       'Import',
    warrantyYears: 0,
    stock:         0,
    location:      '',             // ← new
    stockInDateManual: '',         // ← new: manual stock-in date override
    description:   '',
    status:        'New',
    isDamaged:     false,
    serialNumbers: [],
    serialCities:  {},
    costing: costingOption === 'with' ? (() => {
      const c = createInitialCostingInfo();
      return {
        ...c,
        brandName:         costingBrandName,
        usdRate:           Number(searchParams.get('usdRate'))           || 0,
        totalCustomsValue: Number(searchParams.get('totalCustomsValue')) || 0,
        totalFreightValue: Number(searchParams.get('totalFreightValue')) || 0,
        shipmentTotalUSD:  Number(searchParams.get('shipmentTotalUSD'))  || 0,
        consignmentValue:  Number(searchParams.get('consignmentValue'))  || 0,
        totalValueOfBrand: Number(searchParams.get('totalValueOfBrand')) || 0,
        totalUnitCostUSD:  Number(searchParams.get('totalUnitCostUSD'))  || 0,
        models: JSON.parse(searchParams.get('costingModels') || '[]'),
      };
    })() : undefined,
  });

  const [serialInputs, setSerialInputs]           = useState<string[]>([]);
  const [validationErrors, setValidationErrors]   = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (costingOption === 'with' && formData.costing && formData.costing.models.length > 0) {
      const { models, usdRate, totalCustomsValue, totalFreightValue } = formData.costing;
      const result = recalculateAllModels(models, usdRate, totalCustomsValue, totalFreightValue);
      setFormData(prev => ({
        ...prev, costing: prev.costing ? {
          ...prev.costing, models: result.models,
          totalUnitCostUSD:  result.summary.totalUnitCostUSD,
          shipmentTotalUSD:  result.summary.shipmentTotalUSD,
          consignmentValue:  result.summary.consignmentValue,
          totalValueOfBrand: result.summary.totalValueOfBrand,
        } : undefined,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.costing?.usdRate, formData.costing?.totalCustomsValue, formData.costing?.totalFreightValue, costingOption]);

  // Stock / serial handlers
  const handleStockChange = useCallback((newStock: number) => {
    setFormData(prev => ({ ...prev, stock: newStock }));
    setSerialInputs(prev => {
      if (newStock > prev.length)
        return [...prev, ...Array(newStock - prev.length).fill('')];
      if (newStock < prev.length) {
        const removed = prev.slice(newStock);
        setFormData(pd => ({
          ...pd,
          serialCities: Object.fromEntries(
            Object.entries(pd.serialCities).filter(([k]) => !removed.includes(k))
          ),
        }));
        return prev.slice(0, newStock);
      }
      return prev;
    });
  }, []);

  // Field setters
  // Mirrors formData every render so async callbacks can read the CURRENT
  // values without closing over a stale snapshot or abusing setFormData.
  const formDataRef = useRef(formData);
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const setBrandName     = useCallback((v: string)        => setFormData(p => ({ ...p, brandName: v })), []);
  // Setting the model name also pulls back everything saved for this brand +
  // model last time — Category, Description, Retail Price, warranty, location.
  // That is the whole point of the feature: stop retyping the same product
  // identity on every restock.
  //
  // NON-DESTRUCTIVE: applyModelProfile only writes fields that are still blank.
  // The lookup is async and the user can easily be typing a Description while
  // it is in flight, so clobbering would be worse than not prefilling. The
  // functional setFormData re-reads the LATEST state rather than a copy taken
  // when the request started, and bails if the model changed again meanwhile.
  const setModelName = useCallback((v: string) => {
    setFormData(p => ({ ...p, modelName: v }));

    const modelName = (v || '').trim();
    if (!modelName) return;

    void (async () => {
      try {
        // Read the brand from a ref, NOT by calling setFormData with a no-op
        // updater. That earlier trick never worked: React does not run the
        // updater synchronously, and returning `p` unchanged makes it bail out
        // of the update altogether — so the local variable was still empty on
        // the next line and this whole prefill returned immediately, every
        // single time. The ref below mirrors formData on every render, so it
        // always holds the current brand at the moment the model is picked.
        const brandName = (formDataRef.current.brandName || '').trim();
        if (!brandName) return;

        const profile = await fetchModelProfileByName(brandName, modelName);
        if (!profile) return;

        setFormData(p => {
          if ((p.modelName || '').trim().toLowerCase() !== modelName.toLowerCase()) return p;
          return applyModelProfile(p, profile);
        });
      } catch (err) {
        console.error('[Inventory] model profile prefill failed:', err);
      }
    })();
  }, []);
  const setCategory      = useCallback((v: string)        => setFormData(p => ({ ...p, category: v })), []);
  const setCostPrice     = useCallback((v: number)        => setFormData(p => ({ ...p, costPrice: v })), []); // ← FIX: was missing entirely
  const setSellPrice     = useCallback((v: number)        => setFormData(p => ({ ...p, sellPrice: v })), []);
  const setBuyType       = useCallback((v: BuyType)       => setFormData(p => ({ ...p, buyType: v })), []);
  const setWarrantyYears = useCallback((v: number)        => setFormData(p => ({ ...p, warrantyYears:v })), []);
  const setStock         = useCallback((v: number)        => handleStockChange(v), [handleStockChange]);
  const setLocation      = useCallback((v: string)        => setFormData(p => ({ ...p, location: v })), []); // ← new
  const setStockInDateManual = useCallback((v: string)    => setFormData(p => ({ ...p, stockInDateManual: v })), []); // ← new
  const setDescription   = useCallback((v: string)        => setFormData(p => ({ ...p, description: v})), []);
  const setStatus        = useCallback((v: ProductStatus) => setFormData(p => ({ ...p, status: v })),[]);
  const setIsDamaged     = useCallback((v: boolean)       => setFormData(p => ({ ...p, isDamaged: v })), []);

  const setCostingBrandNameFn = useCallback((v: string) =>
    setFormData(p => ({ ...p, costing: p.costing ? { ...p.costing, brandName: v } : undefined })), []);
  const setUsdRate            = useCallback((v: number) =>
    setFormData(p => ({ ...p, costing: p.costing ? { ...p.costing, usdRate: v } : undefined })), []);
  const setTotalCustomsValue  = useCallback((v: number) =>
    setFormData(p => ({ ...p, costing: p.costing ? { ...p.costing, totalCustomsValue: v } : undefined})), []);
  const setTotalFreightValue  = useCallback((v: number) =>
    setFormData(p => ({ ...p, costing: p.costing ? { ...p.costing, totalFreightValue: v } : undefined})), []);

  const addModel = useCallback(() => {
    setFormData(p => ({
      ...p,
      costing: p.costing
        ? { ...p.costing, models: [...p.costing.models, createEmptyCostingModel()] }
        : undefined,
    }));
  }, []);

  const updateModelField = useCallback((modelId: string, field: keyof CostingModel, value: string | number) => {
    setFormData(prev => {
      if (!prev.costing) return prev;
      const tot  = prev.costing.models.reduce((s, m) => s + m.unitCostUSD, 0);
      const ship = prev.costing.models.reduce((s, m) => s + m.units * m.unitCostUSD, 0);
      const updated = prev.costing.models.map(m =>
        m.id !== modelId ? m :
        calculateModelCosts({ ...m, [field]: value }, tot, ship,
          prev.costing!.usdRate, prev.costing!.totalCustomsValue, prev.costing!.totalFreightValue)
      );
      const result = recalculateAllModels(updated, prev.costing.usdRate, prev.costing.totalCustomsValue, prev.costing.totalFreightValue);
      return {
        ...prev, costing: {
          ...prev.costing, models: result.models,
          totalUnitCostUSD:  result.summary.totalUnitCostUSD,
          shipmentTotalUSD:  result.summary.shipmentTotalUSD,
          consignmentValue:  result.summary.consignmentValue,
          totalValueOfBrand: result.summary.totalValueOfBrand,
        },
      };
    });
  }, []);

  const removeModel = useCallback((modelId: string) => {
    setFormData(prev => {
      if (!prev.costing) return prev;
      const updated = prev.costing.models.filter(m => m.id !== modelId);
      if (updated.length > 0) {
        const result = recalculateAllModels(updated, prev.costing.usdRate, prev.costing.totalCustomsValue, prev.costing.totalFreightValue);
        return {
          ...prev, costing: {
            ...prev.costing, models: result.models,
            totalUnitCostUSD:  result.summary.totalUnitCostUSD,
            shipmentTotalUSD:  result.summary.shipmentTotalUSD,
            consignmentValue:  result.summary.consignmentValue,
            totalValueOfBrand: result.summary.totalValueOfBrand,
          },
        };
      }
      return { ...prev, costing: { ...prev.costing, models: [], totalUnitCostUSD: 0, shipmentTotalUSD: 0, consignmentValue: 0, totalValueOfBrand: 0 } };
    });
  }, []);

  const updateSerialNumber = useCallback((index: number, value: string) => {
    setSerialInputs(prev => {
      const updated = [...prev];
      const old = updated[index];
      updated[index] = value;
      if (old && formData.serialCities[old]) {
        setFormData(pd => {
          const cities = { ...pd.serialCities };
          const city = cities[old]; delete cities[old];
          if (value) cities[value] = city;
          return { ...pd, serialCities: cities };
        });
      }
      return updated;
    });
  }, [formData.serialCities]);

  const updateSerialCity = useCallback((index: number, value: string) => {
    const key = serialInputs[index];
    if (!key) return;
    setFormData(prev => ({ ...prev, serialCities: { ...prev.serialCities, [key]: value } }));
  }, [serialInputs]);

  // Validation
  const validateForm = useCallback((selectedModels?: SelectedModel[]): boolean => {
    const errors: { [key: string]: string } = {};
    if (!formData.brandName.trim()) errors.brandName = 'Brand name is required';
    if (costingOption !== 'with' && !formData.modelName.trim()) errors.modelName = 'Model name is required';
    if (!formData.category.trim()) errors.category = 'Category is required';
    if (!formData.description.trim()) errors.description = 'Description is required';
    // Location is required for both paths
    if (!formData.location?.trim()) errors.location = 'Location is required';

    if (costingOption === 'with' && (!selectedModels || selectedModels.length === 0))
      errors.models = 'At least one model is required';

    if (costingOption === 'with' && selectedModels) {
      selectedModels.forEach((m, i) => {
        const validSerials = m.serialNumbers.filter(s => s.trim() !== '');
        // Serial numbers REQUIRED per model
        if (m.quantity <= 0) {
          errors[`qty_${i}`] = `${m.modelName || `Row ${i + 1}`}: quantity must be at least 1`;
        } else if (validSerials.length === 0) {
          errors[`serials_${i}`] = `${m.modelName || `Row ${i + 1}`}: serial numbers are required`;
        } else if (validSerials.length !== m.quantity) {
          errors[`serials_${i}`] = `${m.modelName || `Row ${i + 1}`}: provide ${m.quantity} serial number${m.quantity > 1 ? 's' : ''} (${validSerials.length} filled)`;
        } else if (new Set(validSerials).size !== validSerials.length) {
          errors[`serials_${i}`] = `${m.modelName || `Row ${i + 1}`}: duplicate serial numbers found`;
        }
      });
    } else {
      const validSerials = serialInputs.filter(s => s.trim() !== '');
      // Serial numbers REQUIRED — stock must be at least 1 and every unit must have a serial
      if (!formData.stock || formData.stock <= 0) {
        errors.stock = 'Stock quantity must be at least 1';
      } else if (validSerials.length === 0) {
        errors.serialNumbers = 'Serial numbers are required';
      } else if (validSerials.length !== formData.stock) {
        errors.serialNumbers = `Provide ${formData.stock} serial number${formData.stock > 1 ? 's' : ''} (${validSerials.length} filled)`;
      } else if (new Set(validSerials).size !== validSerials.length) {
        errors.serialNumbers = 'Duplicate serial numbers found';
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData, serialInputs, costingOption]);

  const isValid = useMemo(() => {
    const hasBasic = formData.brandName.trim() !== '' &&
      formData.category.trim() !== '' &&
      (formData.location?.trim() || '') !== '';     // ← location required
    if (costingOption !== 'with') return formData.modelName.trim() !== '' && hasBasic;
    return hasBasic;
  }, [formData, costingOption]);

  const costingSummary = useMemo(() => ({
    totalUnitCostUSD:  formData.costing?.totalUnitCostUSD  || 0,
    shipmentTotalUSD:  formData.costing?.shipmentTotalUSD  || 0,
    consignmentValue:  formData.costing?.consignmentValue  || 0,
    totalValueOfBrand: formData.costing?.totalValueOfBrand || 0,
  }), [formData.costing]);

  // ── isSaving flag for the save button ──
  const [isSaving, setIsSaving] = useState(false);

  // ── handleNext → save inventory directly (no payment step) ────────────────
  // Payment collection was removed from the add flow. Products are saved
  // with paymentStatus = 'unpaid' and reconciled later from the Transactions
  // module. selectedModels only appears in the 'with costing' path.
  const handleNext = useCallback(async (selectedModels?: SelectedModel[]) => {
    if (!validateForm(selectedModels)) return;
    setIsSaving(true);
    try {
      // With costing: one product per selected model
      if (costingOption === 'with' && selectedModels && selectedModels.length > 0) {
        let successCount = 0;
        const failed: string[] = [];
        // Profile writes are gathered and settled after the loop rather than
        // awaited inside it: one product's slow bookkeeping should not hold up
        // the next product's save.
        const profileWrites: Promise<void>[] = [];
        for (const m of selectedModels) {
          try {
            const validSerials = m.serialNumbers.filter(s => s.trim() !== '');
            const serialCities: { [k: string]: string } = { ...(m.serialCities || {}) };
            validSerials.forEach(s => {
              if (!serialCities[s]) serialCities[s] = formData.location || '';
            });
            const dto: CreateProductDTO = {
              brandName:     formData.brandName,
              modelName:     m.modelName,
              category:      formData.category,
              costPrice:     m.costPrice ?? formData.costPrice ?? 0,
              sellPrice:     m.salePrice ?? formData.sellPrice ?? 0,
              buyType:       formData.buyType || 'Import',
              warrantyYears: formData.warrantyYears || 1,
              stock:         m.quantity,
              location:      formData.location || '',
              description:   formData.description,
              serialNumbers: validSerials,
              serialCities,
              status:        formData.status || 'New',
              isDamaged:     formData.isDamaged ?? false,
              costingOption: 'with',
              costing:       formData.costing,
            } as any;
            await InventoryFirebaseService.createProduct(dto, {
              paymentStatus: 'unpaid',
              totalAmount:   (dto.costPrice || 0) * (dto.stock || 0),
            });

            // Remember this product's identity against its model doc so the
            // next entry of the same brand + model prefills.
            //
            // COLLECTED, NOT FIRED-AND-FORGOTTEN. This used to be `void`-ed and
            // navigate() ran moments later on line ~483. saveModelProfileByName
            // makes THREE sequential Firestore round-trips (read brands → read
            // models → write), so the route change unmounted this component
            // while the write was still in flight and the description never
            // landed. The product itself saved fine, which is exactly why
            // nothing looked broken until the next entry failed to prefill.
            //
            // The multi-model screen already hit this and fixed it the same way;
            // this branch was simply missed. Awaited below, before navigate().
            profileWrites.push(saveModelProfileByName(dto.brandName, dto.modelName, {
              category:      dto.category,
              description:   dto.description,
              sellPrice:     dto.sellPrice,
              costPrice:     dto.costPrice,
              warrantyYears: dto.warrantyYears,
              buyType:       dto.buyType,
              location:      dto.location,
            }));

            successCount++;
          } catch (err) {
            console.error(`Failed to save model ${m.modelName}:`, err);
            failed.push(m.modelName);
          }
        }
        // Land every profile write before the route changes. allSettled, not
        // all: a failed profile write must never turn a successful product save
        // into an error.
        await settleProfileWrites(profileWrites);

        if (failed.length === 0) {
          toast.success(`✅ ${successCount} product${successCount === 1 ? '' : 's'} added to inventory`);
          navigate('/inventory');
        } else if (successCount === 0) {
          toast.error('Failed to save any items. Check console for details.');
        } else {
          toast.warning(`Saved ${successCount}, but ${failed.length} failed: ${failed.join(', ')}`);
          navigate('/inventory');
        }
        return;
      }

      // Without costing: single product built from formData + serialInputs
      const validSerials = serialInputs.filter(s => s.trim() !== '');
      const serialCities: { [k: string]: string } = { ...(formData.serialCities || {}) };
      validSerials.forEach(s => {
        if (!serialCities[s]) serialCities[s] = formData.location || '';
      });
      const dto: CreateProductDTO = {
        brandName:     formData.brandName,
        modelName:     formData.modelName,
        category:      formData.category,
        costPrice:     formData.costPrice ?? 0,
        sellPrice:     formData.sellPrice,
        buyType:       formData.buyType || 'Import',
        warrantyYears: formData.warrantyYears || 1,
        stock:         formData.stock,
        location:      formData.location || '',
        description:   formData.description,
        serialNumbers: validSerials,
        serialCities,
        status:        formData.status || 'New',
        isDamaged:     formData.isDamaged ?? false,
        costingOption: 'without',
      } as any;
      await InventoryFirebaseService.createProduct(dto, {
        paymentStatus: 'unpaid',
        totalAmount:   (dto.costPrice || 0) * (dto.stock || 0),
      });

      // Awaited for the same reason as the with-costing branch above: navigate()
      // is on the next line but one, and an un-awaited write does not survive
      // the unmount.
      await settleProfileWrites([
        saveModelProfileByName(dto.brandName, dto.modelName, {
          category:      dto.category,
          description:   dto.description,
          sellPrice:     dto.sellPrice,
          costPrice:     dto.costPrice,
          warrantyYears: dto.warrantyYears,
          buyType:       dto.buyType,
          location:      dto.location,
        }),
      ]);

      toast.success('✅ Product added to inventory');
      navigate('/inventory');
    } catch (err) {
      console.error('Product details save error:', err);
      toast.error('Failed to save inventory. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [navigate, formData, serialInputs, costingOption, validateForm]);

  const handleBack = useCallback(() => {
    if (costingOption === 'with')
      navigate(`/inventory/create-new/costing-details?type=${inventoryType}&costing=${costingOption}`);
    else
      navigate(`/inventory/create-new/costing?type=${inventoryType}`);
  }, [navigate, inventoryType, costingOption]);

  return {
    singleModel, setSingleModelField, formData, costingOption, inventoryType,
    costingBrandId, costingBrandName,
    preloadedModels, isLoadingModels,
    serialInputs, validationErrors, isValid,
    setBrandName, setModelName, setCategory, setCostPrice, setSellPrice, setBuyType,
    setWarrantyYears, setStock, setLocation, setStockInDateManual, setDescription, setStatus, setIsDamaged,
    setCostingBrandName: setCostingBrandNameFn,
    setUsdRate, setTotalCustomsValue, setTotalFreightValue,
    addModel, updateModelField, removeModel,
    updateSerialNumber, updateSerialCity,
    updateModelSerial:     () => {},
    updateModelSerialCity: () => {},
    handleNext, handleBack, isSaving,
    showCostingFields: costingOption === 'with',
    categories: CATEGORIES,
    cities: [...INVENTORY_LOCATIONS],
    costingSummary,
  };
}