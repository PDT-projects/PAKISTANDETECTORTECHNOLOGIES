// Inventory Module - ViewModel Layer
// useInventoryMultiModelViewModel
// "Without Costing" path: select a brand, add multiple models at once.
// Each model has: modelName, costPrice, sellPrice, category, qty, status,
//                stockingLocation, dealerPrice, description, serialNumbers.
// On Next → saves every row, then returns to the inventory list.

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { InventoryEntryType, INVENTORY_LOCATIONS, CreateProductDTO } from '../models/types';
import { BrandModelFirebaseService, InventoryFirebaseService } from '../models/InventoryFirebaseService';
import { uploadInventoryImages } from '../models/InventoryFirebaseService';
import { saveModelProfileByName } from '../models/BrandModelService';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';

export const KNOWN_BRANDS = [
  'AKAAS DETECTORS', 'Andralian', 'Black Dog Xtreme', 'Bounty Hunter VLF',
  'China', 'DHFHJ', 'Detector', 'Detek', 'EKibi', 'Fisher', 'GEO',
  'GROGROUND', 'GOLD XTRA', 'GTR TURKEY', 'Garrett', 'Gold Star',
  'Gold Stinger X5', 'Hira Dedector', 'JOKER', 'Lorenz', 'Minelab',
  'Multimax', 'Nokta', 'Nokta Makro', 'OKM', 'OKM EXP 6000 PROFESSIONAL PLUS',
  'PMX', 'Practice', 'Quest', 'Reaper 2', 'Super Wand', 'Teknetics',
  'WHITES', 'X5 ID Maxx', 'XP',
];

export const CATEGORIES = ['Finished Goods', 'Accessories'];

export const STOCKING_LOCATIONS = [...INVENTORY_LOCATIONS];

export const STATUSES = ['New', 'Used', 'Returned'];

export interface MultiModelEntry {
  id: string;
  modelName: string;
  costPrice: number;
  sellPrice: number;
  category: string;
  stockQty: number;
  status: string;
  stockingLocation: string;
  dealerPrice: number;
  description: string;
  serialNumbers: string[];      // filled one per unit
  serialCities: { [s: string]: string };
  images: File[];               // optional product images (not yet uploaded)
  imageUrls: string[];          // uploaded URLs (filled after save)
}

export interface BrandOption {
  id: string;
  name: string;
}

export interface ModelOption {
  id: string;
  modelName: string;
  costPrice?: number;
  sellPrice?: number;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyEntry(): MultiModelEntry {
  return {
    id: makeId(),
    modelName: '',
    costPrice: 0,
    sellPrice: 0,
    category: '',
    stockQty: 1,
    status: 'New',
    stockingLocation: '',
    dealerPrice: 0,
    description: '',
    serialNumbers: [''],
    serialCities: {},
    images: [],
    imageUrls: [],
  };
}

export interface UseInventoryMultiModelViewModelReturn {
  inventoryType: InventoryEntryType;
  // Brand
  selectedBrandId: string;
  selectedBrandName: string;
  setBrand: (id: string, name: string) => void;
  brands: BrandOption[];
  brandsLoading: boolean;
  // model dropdown per row
  modelOptions: ModelOption[];
  modelOptionsLoading: boolean;
  // entries
  entries: MultiModelEntry[];
  addEntry: () => void;
  removeEntry: (id: string) => void;
  updateEntry: (id: string, patch: Partial<MultiModelEntry>) => void;
  // serial helpers per entry
  setEntrySerial: (entryId: string, idx: number, value: string) => void;
  setEntrySerialCity: (entryId: string, idx: number, city: string) => void;
  setEntryImages: (entryId: string, files: File[]) => void;
  removeEntryImage: (entryId: string, index: number) => void;
  // totals
  grandTotalCost: number;
  grandTotalUnits: number;
  // validation
  validationErrors: { [key: string]: string };
  isValid: boolean;
  // navigation
  handleNext: () => void;
  handleBack: () => void;
  isSaving: boolean;
  formatCurrency: (n: number) => string;
}

export function useInventoryMultiModelViewModel(): UseInventoryMultiModelViewModelReturn {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inventoryType = (searchParams.get('type') as InventoryEntryType) || 'payment';

  // ── Brand list ────────────────────────────────────────────────────────────
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'brands'), orderBy('name')));
        const fromDb: BrandOption[] = snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name || d.id }));
        // Merge with KNOWN_BRANDS (de-dup by name)
        const allNames = new Set(fromDb.map(b => b.name.toLowerCase()));
        const extras = KNOWN_BRANDS
          .filter(n => !allNames.has(n.toLowerCase()))
          .map(n => ({ id: n, name: n }));
        setBrands([...fromDb, ...extras].sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        setBrands(KNOWN_BRANDS.map(n => ({ id: n, name: n })));
      } finally {
        setBrandsLoading(false);
      }
    };
    load();
  }, []);

  // ── Selected brand ────────────────────────────────────────────────────────
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedBrandName, setSelectedBrandName] = useState('');

  // ── Model options for selected brand ─────────────────────────────────────
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);

  useEffect(() => {
    if (!selectedBrandName.trim()) { setModelOptions([]); return; }
    let cancelled = false;
    setModelOptionsLoading(true);
    BrandModelFirebaseService.fetchModelsByBrandName(selectedBrandName)
      .then(models => { if (!cancelled) setModelOptions(models); })
      .catch(() => { if (!cancelled) setModelOptions([]); })
      .finally(() => { if (!cancelled) setModelOptionsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBrandName]);

  const setBrand = useCallback((id: string, name: string) => {
    setSelectedBrandId(id);
    setSelectedBrandName(name);
  }, []);

  // ── Multi-model entries ───────────────────────────────────────────────────
  const [entries, setEntries] = useState<MultiModelEntry[]>([emptyEntry()]);

  const addEntry = useCallback(() => {
    setEntries(prev => [...prev, emptyEntry()]);
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => prev.length > 1 ? prev.filter(e => e.id !== id) : prev);
  }, []);

  // Pure state update. The product-profile prefill that used to live here has
  // moved into InventoryMultimodelView, for two reasons:
  //
  //   1. The free-text model input calls updateEntry on EVERY KEYSTROKE, so a
  //      lookup hung off `'modelName' in patch` fired once per character —
  //      nine Firestore round-trips to type "Signum HM", eight of them against
  //      partial names that match nothing, all resolving out of order. The view
  //      fires it once, on blur or on dropdown selection.
  //
  //   2. applyModelProfile() writes `location`, but this entry type calls that
  //      field `stockingLocation`. The value landed on a key nothing reads. The
  //      view passes an explicit field map instead.
  const updateEntry = useCallback((id: string, patch: Partial<MultiModelEntry>) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, ...patch };
      // Resize serialNumbers array when stockQty changes
      if ('stockQty' in patch) {
        const qty = Math.max(1, patch.stockQty ?? 1);
        const serials = [...updated.serialNumbers];
        while (serials.length < qty) serials.push('');
        serials.length = qty;
        updated.serialNumbers = serials;
        updated.stockQty = qty;
      }
      return updated;
    }));
  }, []);

  const setEntrySerial = useCallback((entryId: string, idx: number, value: string) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      const serials = [...e.serialNumbers];
      const old = serials[idx];
      serials[idx] = value;
      const cities = { ...e.serialCities };
      if (old && cities[old]) {
        const city = cities[old];
        delete cities[old];
        if (value) cities[value] = city;
      }
      return { ...e, serialNumbers: serials, serialCities: cities };
    }));
  }, []);

  const setEntrySerialCity = useCallback((entryId: string, idx: number, city: string) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      const serial = e.serialNumbers[idx];
      if (!serial) return e;
      return { ...e, serialCities: { ...e.serialCities, [serial]: city } };
    }));
  }, []);

  const setEntryImages = useCallback((entryId: string, files: File[]) => {
    setEntries(prev => prev.map(e =>
      e.id !== entryId ? e : { ...e, images: [...e.images, ...files] }
    ));
  }, []);

  const removeEntryImage = useCallback((entryId: string, index: number) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      const images = e.images.filter((_, i) => i !== index);
      return { ...e, images };
    }));
  }, []);

  // ── Totals ────────────────────────────────────────────────────────────────
  const grandTotalCost = useMemo(
    () => entries.reduce((s, e) => s + e.costPrice * e.stockQty, 0),
    [entries]
  );
  const grandTotalUnits = useMemo(
    () => entries.reduce((s, e) => s + e.stockQty, 0),
    [entries]
  );

  // ── Validation ────────────────────────────────────────────────────────────
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  const isValid = useMemo(() => {
    if (!selectedBrandName.trim()) return false;
    return entries.every(e => {
      const validSerials = e.serialNumbers.filter(s => s.trim() !== '');
      return (
        e.modelName.trim() !== '' &&
        e.costPrice > 0 &&
        e.sellPrice > 0 &&
        e.category.trim() !== '' &&
        e.stockQty > 0 &&
        e.stockingLocation.trim() !== '' &&
        // Serial numbers are REQUIRED — one per unit, no blanks, no duplicates
        validSerials.length === e.stockQty &&
        new Set(validSerials).size === validSerials.length
      );
    });
  }, [selectedBrandName, entries]);

  const validateForm = useCallback((): boolean => {
    const errors: { [key: string]: string } = {};
    if (!selectedBrandName.trim()) errors.brand = 'Please select a brand';
    entries.forEach((e, i) => {
      if (!e.modelName.trim()) errors[`model_${i}`] = `Row ${i + 1}: model name required`;
      if (e.costPrice <= 0)    errors[`cost_${i}`]  = `Row ${i + 1}: cost price required`;
      if (e.sellPrice <= 0)    errors[`sell_${i}`]  = `Row ${i + 1}: sell price required`;
      if (!e.category.trim())  errors[`cat_${i}`]   = `Row ${i + 1}: category required`;
      if (e.stockQty <= 0)     errors[`qty_${i}`]   = `Row ${i + 1}: quantity must be > 0`;
      if (!e.stockingLocation) errors[`loc_${i}`]   = `Row ${i + 1}: stocking location required`;

      // Serial numbers are REQUIRED and must match stockQty
      const validSerials = e.serialNumbers.filter(s => s.trim() !== '');
      if (validSerials.length === 0) {
        errors[`serials_${i}`] = `Row ${i + 1}: serial numbers are required`;
      } else if (validSerials.length !== e.stockQty) {
        errors[`serials_${i}`] = `Row ${i + 1}: provide ${e.stockQty} serial number${e.stockQty === 1 ? '' : 's'} (${validSerials.length} filled)`;
      } else if (new Set(validSerials).size !== validSerials.length) {
        errors[`serials_${i}`] = `Row ${i + 1}: duplicate serial numbers found`;
      }
    });
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [selectedBrandName, entries]);

  // ── isSaving ──────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);

  // ── handleNext → save all entries directly (no payment step) ────────────
  // Payment tracking was removed from the add-inventory flow. Items are saved
  // with paymentStatus = 'unpaid' and can be paid off later from the
  // Transactions / Payables modules.
  const handleNext = useCallback(async () => {
    if (!validateForm()) {
      toast.error('Please fix the highlighted errors before continuing.');
      return;
    }
    setIsSaving(true);
    try {
      // Persist brand + models to Firestore so they appear in future dropdowns
      try {
        await BrandModelFirebaseService.saveCostingBrandAndModels(
          selectedBrandName,
          entries.map(e => ({ modelName: e.modelName, costPrice: e.costPrice })),
        );
      } catch {
        // non-blocking — proceed even if save fails
      }

      let successCount = 0;
      const failed: string[] = [];
      // Profile writes are collected and settled BEFORE navigating. See the
      // comment at the await below — this is the reason descriptions were not
      // coming back on the next entry.
      const profileWrites: Promise<void>[] = [];

      // Sequential — parallel writes on the same brand+model pair could race
      // against the duplicate-serial check inside createProduct.
      for (const e of entries) {
        try {
          const validSerials = e.serialNumbers.filter(s => s.trim() !== '');
          const description  = (e.description || '').trim();

          // Upload images if any (non-blocking failure)
          let imageUrls: string[] = [];
          if (e.images.length > 0) {
            try {
              const productKey = `${selectedBrandName}-${e.modelName}-${Date.now()}`.replace(/\s+/g, '_');
              imageUrls = await uploadInventoryImages(e.images, productKey);
            } catch (imgErr) {
              console.warn(`Image upload failed for ${e.modelName}:`, imgErr);
            }
          }

          // Seed per-serial city map: entry-specific overrides over stocking default
          const serialCities: { [k: string]: string } = { ...e.serialCities };
          validSerials.forEach(s => {
            if (!serialCities[s]) serialCities[s] = e.stockingLocation;
          });

          const dto: CreateProductDTO = {
            brandName:     selectedBrandName,
            modelName:     e.modelName,
            category:      e.category,
            costPrice:     e.costPrice,
            sellPrice:     e.sellPrice,
            buyType:       'Import',
            warrantyYears: 1,
            stock:         e.stockQty,
            location:      e.stockingLocation,
            description,
            serialNumbers: validSerials,
            serialCities,
            status:        (e.status as any) || 'New',
            isDamaged:     false,
            costingOption: 'without',
            imageUrls,
          } as any;

          // ── DIAGNOSTIC — remove once the description issue is resolved ────
          // Prints exactly what is about to be sent to Firestore. If ENTRY is
          // empty, the textarea never reached state. If ENTRY has text but DTO
          // is empty, the DTO build is dropping it. If both have text but the
          // Firestore doc does not, the running bundle is not this file.
          console.log(
            '%c[SAVE] description check',
            'background:#b91c1c;color:#fff;padding:2px 6px;border-radius:3px',
            { model: e.modelName, ENTRY: JSON.stringify(e.description), DTO: JSON.stringify(dto.description) },
          );

          // paymentStatus: 'unpaid' — this new item is a payable to be
          // reconciled later from the Transactions module. No paidAmount here.
          await InventoryFirebaseService.createProduct(dto, {
            paymentStatus: 'unpaid',
            totalAmount:   e.costPrice * e.stockQty,
          });

          // Remember this product against its model doc so the next entry of the
          // same brand + model prefills.
          //
          // warrantyYears and buyType are deliberately NOT written from here.
          // This screen does not collect them — the DTO above hardcodes 1 and
          // 'Import' — so sending them would overwrite whatever the single-product
          // screen saved with those two constants, every single time.
          profileWrites.push(
            saveModelProfileByName(selectedBrandName, e.modelName, {
              category:    e.category,
              description,
              sellPrice:   e.sellPrice,
              costPrice:   e.costPrice,
              location:    e.stockingLocation,
            })
          );

          successCount++;
        } catch (err) {
          console.error(`Failed to save entry (${e.modelName}):`, err);
          failed.push(e.modelName || `row-${entries.indexOf(e) + 1}`);
        }
      }

      // THIS AWAIT IS THE FIX for descriptions not persisting.
      //
      // These calls used to be fired with `void` and never awaited, then
      // navigate() ran immediately on the next line. saveModelProfileByName
      // makes THREE sequential Firestore round-trips (read brands → read models
      // → write), so it is still mid-flight when the route changes and the
      // component unmounts. The product itself saved fine, which is why the item
      // appeared in inventory and nothing looked wrong — but the profile write
      // carrying the description frequently never landed, so the next entry of
      // the same model had nothing to fetch back.
      //
      // allSettled, not all: a failed profile write must never turn a successful
      // product save into an error.
      if (profileWrites.length > 0) {
        const results = await Promise.allSettled(profileWrites);
        const rejected = results.filter(r => r.status === 'rejected').length;
        if (rejected > 0) console.warn(`[Inventory] ${rejected} profile write(s) failed`);
      }

      if (failed.length === 0) {
        toast.success(`✅ ${successCount} product${successCount === 1 ? '' : 's'} added to inventory`);
        navigate('/inventory');
      } else if (successCount === 0) {
        toast.error(`Failed to save any items. Check console for details.`);
      } else {
        toast.warning(`Saved ${successCount}, but ${failed.length} failed: ${failed.join(', ')}`);
        // Partial success — still return to inventory so the user sees what saved
        navigate('/inventory');
      }
    } catch (err) {
      console.error('Multi-model save fatal error:', err);
      toast.error('Failed to save inventory. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [validateForm, selectedBrandName, entries, inventoryType, navigate]);

  const handleBack = useCallback(() => {
    // Credit inventory skips the costing-option screen entirely (always "without"),
    // so going back from here must return to the Type step, not the Costing step —
    // otherwise the Costing step immediately redirects back here, looping in place.
    if (inventoryType === 'credit') {
      navigate(`/inventory/create-new?type=${inventoryType}`);
    } else {
      navigate(`/inventory/create-new/costing?type=${inventoryType}`);
    }
  }, [navigate, inventoryType]);

  const formatCurrency = useCallback((n: number) =>
    new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      currencyDisplay: 'code',      // renders "PKR" instead of the locale symbol "Rs"
      minimumFractionDigits: 0,
    }).format(n)
  , []);

  return {
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
  };
}