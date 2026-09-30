// Inventory Module - ViewModel Layer
// useProductTransferCreateViewModel

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Product } from '../models/types';
import { InventoryFirebaseService, TransferFirebaseService } from '../models/InventoryFirebaseService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';

export interface TransferLine {
  productId: string;
  selectedSerials: string[];
}

export interface UseProductTransferCreateViewModelReturn {
  products: Product[];
  locations: string[];
  formData: {
    transferDateTime: string;
    fromLocation: string;
    toLocation: string;
    transferredBy: string;
    note: string;
    shipmentCost: number;
  };
  costPerUnit: number;
  transferItems: TransferLine[];
  showSummary: boolean;
  isSubmitting: boolean;
  isLoading: boolean;
  validation: { isValid: boolean; error?: string };
  setFormField: (field: string, value: any) => void;
  addTransferItem: () => void;
  removeTransferItem: (index: number) => void;
  updateTransferItemProduct: (index: number, productId: string) => void;
  toggleSerial: (lineIndex: number, serial: string) => void;
  toggleSummary: () => void;
  handleSave: () => Promise<void>;
  onBack: () => void;
  getAvailableSerials: (productId?: string, location?: string) => string[];
  getProductStockByLocation: (productId: string, location: string) => number;
  getProductById: (productId: string) => Product | undefined;
  addNewLocation: (value: string) => Promise<string | null>;
  /** Removes one location from the shared list. Admin-only in the UI. */
  removeLocation: (value: string) => Promise<void>;
  /** Clears the entire saved location list back to empty. Admin-only in the UI. */
  resetLocations: () => Promise<void>;
}

function getSerialEffectiveLocation(product: Product, serial: string): string {
  // BUG that this fixes: the previous body just returned `product.location`,
  // ignoring the `serial` argument entirely. That meant when a transfer's
  // create flow rebuilt `serialCities` for the remaining (non-transferred)
  // serials, every remaining serial was written with the same product-wide
  // default — even if some of those serials were actually stored elsewhere
  // via prior transfers. Result: transferring 2 of 5 serials silently
  // rewrote the other 3 to `product.location`, and the inventory list
  // showed them all at the same place.
  //
  // Consult the per-serial map first, then fall back to product.location.
  return product.serialCities?.[serial] || product.location || '';
}

function localDateTimeNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
}

/**
 * Optional overrides for post-save and back behavior. When these callbacks are
 * provided, the VM calls them instead of navigating to `/product-transfer`
 * with react-router. That lets a parent that hosts this view inside a popup
 * keep the user in the popup (e.g. toggle back to a report tab) rather than
 * routing away.
 */
export interface UseProductTransferCreateViewModelOptions {
  onSaveSuccess?: () => void;
  onCancel?: () => void;
}

export function useProductTransferCreateViewModel(
  options?: UseProductTransferCreateViewModelOptions,
): UseProductTransferCreateViewModelReturn {
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    transferDateTime: localDateTimeNow(),
    fromLocation: '',
    toLocation: '',
    transferredBy: '',
    note: '',
    shipmentCost: 0,
  });
  const [transferItems, setTransferItems] = useState<TransferLine[]>([
    { productId: '', selectedSerials: [] },
  ]);
  const [showSummary, setShowSummary] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const fetched = await InventoryFirebaseService.fetchAllProducts();
        setProducts(fetched.filter(p => p.receivableStatus !== 'Pending'));
      } catch (err) {
        toast.error('Failed to load products');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // Locations here used to live in their OWN Firestore doc
  // (appConfig/transferLocations), completely disconnected from the location
  // list every other Inventory screen uses (appConfig/inventoryLocations, via
  // the shared LocationSelector — see LocationSelector.tsx / INVENTORY_LOCATIONS
  // in models/types.ts). That meant a location added while creating inventory
  // never showed up here, and a location added here never showed up anywhere
  // else — two disconnected lists for what is really one set of physical
  // locations. It also carried its own hardcoded seed (['Dubai','Saudia',
  // 'Chad','Sudan']) that was unconditionally merged back in on every load,
  // so even a fully-cleared saved list would still show those four forever.
  //
  // Fixed: this now reads/writes the SAME appConfig/inventoryLocations doc as
  // the rest of Inventory, with no hardcoded fallback — an empty saved list
  // now actually renders as an empty dropdown, and a location added from any
  // screen (Add Inventory, Multi-model, Add Existing, or here) shows up
  // everywhere else immediately.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'appConfig', 'inventoryLocations'));
        if (!mounted) return;
        const list = snap.exists() ? ((snap.data().list as string[]) || []) : [];
        setLocations([...new Set(list)].sort());
      } catch {
        setLocations([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const saveLocationList = useCallback(async (newList: string[]) => {
    try {
      await setDoc(doc(db, 'appConfig', 'inventoryLocations'), { list: newList }, { merge: true });
    } catch (err) {
      toast.error('Failed to save location');
    }
  }, []);

  const addNewLocation = useCallback(async (value: string): Promise<string | null> => {
    const trimmed = (value || '').trim();
    if (!trimmed) return null;
    const updated = [...new Set([...locations, trimmed])].sort();
    setLocations(updated);
    await saveLocationList(updated);
    return trimmed;
  }, [locations, saveLocationList]);

  // Admin-facing "manage locations" actions — there was previously no way to
  // remove a location once added, or to clear the list back to empty, from
  // any screen. Also clears a from/to selection that pointed at the removed
  // location so the form never keeps a dangling, no-longer-listed value.
  const removeLocation = useCallback(async (value: string): Promise<void> => {
    const updated = locations.filter(l => l !== value);
    setLocations(updated);
    await saveLocationList(updated);
    setFormData(prev => ({
      ...prev,
      fromLocation: prev.fromLocation === value ? '' : prev.fromLocation,
      toLocation:   prev.toLocation   === value ? '' : prev.toLocation,
    }));
  }, [locations, saveLocationList]);

  const resetLocations = useCallback(async (): Promise<void> => {
    setLocations([]);
    await saveLocationList([]);
    setFormData(prev => ({ ...prev, fromLocation: '', toLocation: '' }));
  }, [saveLocationList]);

  const getProductById = useCallback(
    (id: string) => products.find(p => p.id === id),
    [products]
  );

  const getAvailableSerials = useCallback(
    (productId?: string, location?: string): string[] => {
      if (!productId || !location) return [];
      const p = getProductById(productId);
      if (!p) return [];
      return (p.serialNumbers || []).filter(s => {
        const effectiveLocation = getSerialEffectiveLocation(p, s);
        const status = p.serialStatus?.[s] || 'Available';
        return effectiveLocation === location && status !== 'In Transit' && status !== 'Damaged';
      });
    },
    [getProductById]
  );

  const getProductStockByLocation = useCallback(
    (productId: string, location: string): number =>
      getAvailableSerials(productId, location).length,
    [getAvailableSerials]
  );

  const setFormField = useCallback(
    (field: string, value: any) => {
      setFormData(prev => ({ ...prev, [field]: value }));
      if (field === 'fromLocation') {
        setTransferItems(prev => prev.map(it => ({ ...it, selectedSerials: [] })));
      }
    },
    []
  );

  const addTransferItem = useCallback(
    () => setTransferItems(prev => [...prev, { productId: '', selectedSerials: [] }]),
    []
  );

  const removeTransferItem = useCallback((index: number) => {
    setTransferItems(prev => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [{ productId: '', selectedSerials: [] }];
    });
  }, []);

  const updateTransferItemProduct = useCallback((index: number, productId: string) => {
    setTransferItems(prev => {
      const items = [...prev];
      items[index] = { productId, selectedSerials: [] };
      return items;
    });
  }, []);

  const toggleSerial = useCallback((lineIndex: number, serial: string) => {
    setTransferItems(prev => {
      const items = prev.map(it => ({ ...it, selectedSerials: [...it.selectedSerials] }));
      const current = items[lineIndex].selectedSerials;
      const idx = current.indexOf(serial);
      if (idx === -1) {
        items[lineIndex].selectedSerials = [...current, serial];
      } else {
        items[lineIndex].selectedSerials = current.filter(s => s !== serial);
      }
      return items;
    });
  }, []);

  const toggleSummary = useCallback(() => setShowSummary(p => !p), []);

  const totalUnits = useMemo(
    () => transferItems.reduce((sum, it) => sum + it.selectedSerials.length, 0),
    [transferItems]
  );

  const costPerUnit = useMemo(
    () => (formData.shipmentCost > 0 && totalUnits > 0
      ? formData.shipmentCost / totalUnits
      : 0),
    [formData.shipmentCost, totalUnits]
  );

  const validation = useMemo(() => {
    if (!formData.fromLocation)
      return { isValid: false, error: 'Select a From location' };
    if (!formData.toLocation)
      return { isValid: false, error: 'Select a To location' };
    if (formData.fromLocation === formData.toLocation)
      return { isValid: false, error: 'From and To locations must be different' };
    if (!formData.transferredBy.trim())
      return { isValid: false, error: 'Enter who is transferring' };
    if (!formData.transferDateTime)
      return { isValid: false, error: 'Select a transfer date and time' };
    for (const item of transferItems) {
      if (!item.productId)
        return { isValid: false, error: 'Select a product for each line' };
      if (item.selectedSerials.length === 0)
        return { isValid: false, error: 'Select at least one serial number per product' };
    }
    return { isValid: true };
  }, [formData, transferItems]);

  const handleSave = useCallback(async () => {
    if (!validation.isValid) { toast.error(validation.error || 'Fix errors first'); return; }
    setIsSubmitting(true);
    try {
      const isoDateTime = new Date(formData.transferDateTime).toISOString();
      // Build a summary of all items for PDF / modal multi-model display
      const transferItemsSummary = transferItems.map(item => {
        const product = getProductById(item.productId);
        return {
          productId:     item.productId,
          productName:   product ? `${product.brandName} ${product.modelName}` : item.productId,
          modelName:     product?.modelName || '',
          brandName:     product?.brandName || '',
          serialNumbers: item.selectedSerials,
          quantity:      item.selectedSerials.length,
        };
      });
      // Per user request: creating a transfer does NOT move the product's
      // current LOCATION until it's marked Received (which is when the
      // receive-side VM updates serialCities + stockInDate) — that keeps the
      // inventory list's "where is it" column stable during in-transit
      // periods, which is what was asked for originally.
      //
      // But leaving a transferred serial's STATUS as 'Available' the whole
      // time it's in transit was a separate bug, not a feature: this same
      // "still Available" serial could be sold on an invoice or picked into
      // a second transfer while it was already on its way somewhere else —
      // nothing anywhere tracked that it was spoken for. Fixed: each
      // transferred serial is now reserved as 'In Transit' the moment the
      // transfer is created (Invoice's own serial picker — see
      // getAvailableSerialsForProduct in useInvoiceFormViewModel — already
      // excludes 'In Transit', so this alone closes the double-booking gap
      // there too). It's released back to 'Available' when the transfer is
      // received (useProductTransferViewModel.handleMarkReceived, which
      // already had this exact line, previously dead code since nothing
      // ever set the status to begin with) or when it's deleted before
      // receipt (useProductTransferViewModel.handleDeleteTransfer).
      const statusPatches: Record<string, Record<string, string>> = {};

      for (const item of transferItems) {
        const product = getProductById(item.productId);
        if (!product) continue;
        await TransferFirebaseService.createTransfer({
          productId:     product.id,
          productName:   `${product.brandName} ${product.modelName}`,
          brandName:     product.brandName,
          modelName:     product.modelName,
          fromLocation:  formData.fromLocation,
          toLocation:    formData.toLocation,
          quantity:      item.selectedSerials.length,
          serialNumbers: item.selectedSerials,
          transferDate:  isoDateTime,
          transferredBy: formData.transferredBy,
          note:          formData.note,
          shipmentCost:  formData.shipmentCost,
          costPerUnit:   costPerUnit,
          transferItems: transferItemsSummary,
        });

        // Accumulate per-product (not per-item) so two items against the
        // same product in one save don't overwrite each other's reservation.
        const base = statusPatches[product.id] || { ...(product.serialStatus || {}) };
        for (const s of item.selectedSerials) base[s] = 'In Transit';
        statusPatches[product.id] = base;
      }

      for (const [productId, serialStatus] of Object.entries(statusPatches)) {
        await InventoryFirebaseService.updateProduct(productId, { serialStatus } as any);
      }
      setProducts(prev => prev.map(p =>
        statusPatches[p.id] ? { ...p, serialStatus: statusPatches[p.id] } as any : p
      ));

      toast.success('Transfer created successfully — pending receipt');
      if (options?.onSaveSuccess) {
        options.onSaveSuccess();
      } else {
        navigate('/product-transfer');
      }
    } catch (err) {
      console.error('Transfer failed:', err);
      toast.error('Failed to create transfer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [validation, transferItems, formData, getProductById, navigate, costPerUnit, options]);

  const onBack = useCallback(() => {
    // Same pattern for Back — if the popup wants to intercept (to toggle
    // back to its report tab), it does; otherwise fall back to routing.
    if (options?.onCancel) {
      options.onCancel();
    } else {
      navigate('/product-transfer');
    }
  }, [navigate, options]);

  return {
    products, locations, formData, transferItems,
    showSummary, isSubmitting, isLoading, validation,
    costPerUnit,
    setFormField, addTransferItem, removeTransferItem,
    updateTransferItemProduct, toggleSerial,
    toggleSummary, handleSave, onBack,
    getAvailableSerials, getProductStockByLocation, getProductById,
    addNewLocation, removeLocation, resetLocations,
  };
}