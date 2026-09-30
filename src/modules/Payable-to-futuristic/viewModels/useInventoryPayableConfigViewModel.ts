// viewModels/useInventoryPayableConfigViewModel.ts
// Manages state for the "Configure Inventory Payables" panel.
// Loads all inventory products (for the dropdown) and all existing configs.
//
// UPDATED: Supports entering the fixed amount in AED or USD.
//          The stored value is always fixedAmountAed (converted if needed).

import { useState, useEffect, useCallback } from 'react';
import type { Product } from '../../inventory/models/types';
import type {
  InventoryPayableConfig,
  CreateInventoryPayableConfigDTO,
  PayableSlab,
} from '../models/inventoryPayableConfig.types';
import {
  fetchAllInventoryPayableConfigs,
  createInventoryPayableConfig,
  deleteInventoryPayableConfig,
} from '../models/inventoryPayableConfigService';

// We fetch products directly from the inventory Firestore service
import { InventoryFirebaseService } from '../../inventory/models/InventoryFirebaseService';

// Exchange rate: 1 USD = 3.67 AED
const USD_TO_AED = 3.67;

export interface UseInventoryPayableConfigReturn {
  // Inventory dropdown data
  products:        Product[];
  productsLoading: boolean;

  // Existing configs
  configs:         InventoryPayableConfig[];
  configsLoading:  boolean;
  configsError:    string | null;

  // Form state
  selectedProductId: string;
  inputCurrency:     'AED' | 'USD';
  inputAmount:       string;
  notes:             string;
  setSelectedProductId: (id: string) => void;
  setInputCurrency:     (c: 'AED' | 'USD') => void;
  setInputAmount:       (v: string) => void;
  setNotes:             (v: string) => void;

  // Slab editing (price-based commission bands)
  useSlabs:    boolean;
  setUseSlabs: (v: boolean) => void;
  slabs:       PayableSlab[];
  addSlab:     () => void;
  updateSlab:  (index: number, patch: Partial<PayableSlab>) => void;
  removeSlab:  (index: number) => void;

  // Computed preview (always in AED + other currencies)
  previewAed: number | null;

  // Actions
  submitConfig:   () => Promise<void>;
  deleteConfig:   (id: string) => Promise<void>;
  actionLoading:  boolean;
  actionError:    string | null;
  successMessage: string | null;

  refresh: () => Promise<void>;
}

export function useInventoryPayableConfigViewModel(): UseInventoryPayableConfigReturn {
  // ── Products (inventory dropdown) ────────────────────────────────────────
  const [products,        setProducts]        = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  // ── Configs ───────────────────────────────────────────────────────────────
  const [configs,        setConfigs]        = useState<InventoryPayableConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [configsError,   setConfigsError]   = useState<string | null>(null);

  // ── Form ──────────────────────────────────────────────────────────────────
  const [selectedProductId, setSelectedProductId] = useState('');
  const [inputCurrency,     setInputCurrency]     = useState<'AED' | 'USD'>('AED');
  const [inputAmount,       setInputAmount]       = useState('');
  const [notes,             setNotes]             = useState('');

  // ── Slabs ───────────────────────────────────────────────────────────────────
  const [useSlabs, setUseSlabs] = useState(false);
  const [slabs,    setSlabs]    = useState<PayableSlab[]>([]);

  const addSlab = useCallback(() => {
    setSlabs((prev) => {
      const lastMax = prev.length > 0 ? prev[prev.length - 1].maxSalePrice : null;
      const nextMin = lastMax != null ? lastMax + 1 : 0;
      return [...prev, { minSalePrice: nextMin, maxSalePrice: null, payableAmountAed: 0 }];
    });
  }, []);

  const updateSlab = useCallback((index: number, patch: Partial<PayableSlab>) => {
    setSlabs((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }, []);

  const removeSlab = useCallback((index: number) => {
    setSlabs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Action state ──────────────────────────────────────────────────────────
  const [actionLoading,  setActionLoading]  = useState(false);
  const [actionError,    setActionError]    = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ── Computed preview ──────────────────────────────────────────────────────
  const previewAed: number | null = (() => {
    const v = parseFloat(inputAmount);
    if (isNaN(v) || v <= 0) return null;
    return inputCurrency === 'USD' ? parseFloat((v * USD_TO_AED).toFixed(2)) : v;
  })();

  // ── Load products ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setProductsLoading(true);
        const all = await InventoryFirebaseService.fetchAllProducts();
        // Show only available products (not sold/damaged)
        const filtered = all.filter((p) => p.status !== 'Sold' && p.status !== 'Damaged');
        console.log(`[InventoryPayableConfig] Loaded ${filtered.length} inventory items for dropdown`);
        setProducts(filtered);
      } catch (err) {
        console.error('[InventoryPayableConfig] failed to load products:', err);
      } finally {
        setProductsLoading(false);
      }
    })();
  }, []);

  // ── Load configs ──────────────────────────────────────────────────────────
  const loadConfigs = useCallback(async () => {
    try {
      setConfigsLoading(true);
      setConfigsError(null);
      const data = await fetchAllInventoryPayableConfigs();
      console.log(`[InventoryPayableConfig] Loaded ${data.length} existing configs`);
      setConfigs(data);
    } catch (err: any) {
      setConfigsError(err?.message ?? 'Failed to load configurations');
    } finally {
      setConfigsLoading(false);
    }
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitConfig = useCallback(async () => {
    setActionError(null);
    setSuccessMessage(null);

    const cleanProductId = selectedProductId.trim();

    if (!cleanProductId) {
      setActionError('Please select an inventory item.');
      return;
    }
    const product = products.find((p) => p.id === cleanProductId);
    if (!product) {
      setActionError('Selected product not found.');
      return;
    }

    // Validate slabs if enabled
    const cleanSlabs: PayableSlab[] = useSlabs
      ? slabs
          .map((s) => ({
            minSalePrice:     Number(s.minSalePrice) || 0,
            maxSalePrice:     s.maxSalePrice === null ? null : (Number(s.maxSalePrice) || 0),
            payableAmountAed: Number(s.payableAmountAed) || 0,
          }))
          .sort((a, b) => a.minSalePrice - b.minSalePrice)
      : [];

    if (useSlabs) {
      if (cleanSlabs.length === 0) {
        setActionError('Add at least one slab, or turn off price-based slabs.');
        return;
      }
      for (let i = 0; i < cleanSlabs.length; i++) {
        const s = cleanSlabs[i];
        if (s.maxSalePrice != null && s.maxSalePrice < s.minSalePrice) {
          setActionError(`Slab ${i + 1}: max sale price cannot be less than min.`);
          return;
        }
        if (s.payableAmountAed <= 0) {
          setActionError(`Slab ${i + 1}: enter a payable amount greater than 0.`);
          return;
        }
        if (i > 0) {
          const prev = cleanSlabs[i - 1];
          if (prev.maxSalePrice == null) {
            setActionError(`Slab ${i}: an open-ended band must be the last slab.`);
            return;
          }
          if (s.minSalePrice <= prev.maxSalePrice) {
            setActionError(`Slab ${i + 1} overlaps the previous band. Bands must not overlap.`);
            return;
          }
        }
      }
    }

    const rawAmount = parseFloat(inputAmount);
    const hasFlat   = !!inputAmount && !isNaN(rawAmount) && rawAmount > 0;

    // Flat amount required only when slabs are off; when slabs are on it's an
    // optional fallback (used if a sale price matches no band).
    if (!useSlabs && !hasFlat) {
      setActionError(`Please enter a valid ${inputCurrency} amount greater than 0.`);
      return;
    }

    // Always store flat fallback in AED (0 if none provided while using slabs)
    const fixedAmountAed = hasFlat
      ? (inputCurrency === 'USD' ? parseFloat((rawAmount * USD_TO_AED).toFixed(2)) : rawAmount)
      : 0;

    const dto: CreateInventoryPayableConfigDTO = {
      productId:      cleanProductId,
      productName:    `${product.brandName} ${product.modelName}`.trim(),
      brandName:      product.brandName,
      modelName:      product.modelName,
      fixedAmountAed,
      inputCurrency,
      inputAmount:    hasFlat ? rawAmount : 0,
      slabs:          cleanSlabs,
      notes:          notes.trim() || undefined,
    };

    console.log('[InventoryPayableConfig] Submitting config:', dto);

    try {
      setActionLoading(true);
      await createInventoryPayableConfig(dto);
      await loadConfigs();
      // Reset form
      setSelectedProductId('');
      setInputAmount('');
      setNotes('');
      setSlabs([]);
      setUseSlabs(false);
      const displayAmount = useSlabs
        ? `${cleanSlabs.length} slab${cleanSlabs.length !== 1 ? 's' : ''}`
        : inputCurrency === 'USD'
          ? `$${rawAmount.toFixed(2)} → AED ${fixedAmountAed.toFixed(2)}`
          : `AED ${fixedAmountAed.toFixed(2)}`;
      setSuccessMessage(`Config saved: ${dto.productName} → ${displayAmount}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('[InventoryPayableConfig] Submit failed:', err);
      setActionError(err?.message ?? 'Failed to save config');
    } finally {
      setActionLoading(false);
    }
  }, [selectedProductId, inputAmount, inputCurrency, notes, products, loadConfigs, useSlabs, slabs]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteConfig = useCallback(async (id: string) => {
    try {
      setActionLoading(true);
      setActionError(null);
      await deleteInventoryPayableConfig(id);
      await loadConfigs();
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to delete config');
    } finally {
      setActionLoading(false);
    }
  }, [loadConfigs]);

  return {
    products,
    productsLoading,
    configs,
    configsLoading,
    configsError,
    selectedProductId,
    inputCurrency,
    inputAmount,
    notes,
    setSelectedProductId,
    setInputCurrency,
    setInputAmount,
    setNotes,
    useSlabs,
    setUseSlabs,
    slabs,
    addSlab,
    updateSlab,
    removeSlab,
    previewAed,
    submitConfig,
    deleteConfig,
    actionLoading,
    actionError,
    successMessage,
    refresh: loadConfigs,
  };
}