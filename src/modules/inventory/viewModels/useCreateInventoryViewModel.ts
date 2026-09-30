// Inventory Module - ViewModel Layer
// useCreateInventoryViewModel - Multi-step inventory creation & editing wizard
//
// CHANGES:
//   - Transaction ID (TXN-DDMMYY-###) generated on mount via
//     InventoryFirebaseService.generateTransactionId() — no direct db/firebase
//     import here; all Firestore access is encapsulated in the service.
//   - transactionId stored in formData and saved to Firestore via paymentInfo
//   - ID shown as read-only on Payment step; edit mode preserves original ID
//   - isGeneratingTxnId returned so View can gate the Next button

import { useState, useCallback, useEffect, useMemo} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { saveModelProfileByName } from '../models/BrandModelService';
import {
  ProductFormData,
  InventoryEntryStep,
  ValidationResult,
  CreateProductDTO,
  UpdateProductDTO,
} from '../models/types';
import { InventoryFirebaseService, uploadInventoryImages, deleteInventoryImage } from '../models/InventoryFirebaseService';

// ─────────────────────────────────────────────────────────────────────────────
// Pure-JS fallback — used only when Firestore is unreachable.
// Format: TXN-DDMMYY-###  e.g. TXN-220426-743
// ─────────────────────────────────────────────────────────────────────────────
function generateFallbackTxnId(): string {
  const now     = new Date();
  const dd      = String(now.getDate()).padStart(2, '0');
  const mm      = String(now.getMonth() + 1).padStart(2, '0');
  const yy      = String(now.getFullYear()).slice(-2);
  const counter = String(Math.floor(Math.random() * 900) + 100);
  return `TXN-${dd}${mm}${yy}-${counter}`;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Default margin on stock brought in from a shipment. Editable per stock-in. */
export const DEFAULT_MARGIN_PERCENT = 25;

export interface UseCreateInventoryViewModelReturn {
  currentStep: InventoryEntryStep;

  // ── Stock in from a shipment ──────────────────────────────────────────────
  // Two paths through one screen. 'shipment' fixes the cost from the landed
  // figure and deducts the units; 'manual' is the form as it was.
  source: 'manual' | 'shipment';
  setSource: (s: 'manual' | 'shipment') => void;
  shipments: Shipment[];
  shipmentsLoading: boolean;
  selectedShipmentId: string;
  setSelectedShipmentId: (id: string) => void;
  shipmentLines: StockInLine[];
  selectedLineId: string;
  setSelectedLineId: (id: string) => void;
  selectedLine: StockInLine | null;
  marginPercent: number;
  setMarginPercent: (n: number) => void;

  formData: ProductFormData;
  validation: ValidationResult;
  isSubmitting: boolean;
  isEditMode: boolean;
  editingId: string | null;
  serialInput: string;
  serialCity: string;
  isFetchingProduct: boolean;
  isGeneratingTxnId: boolean;
  // Images
  selectedImages: File[];
  addImages: (files: File[]) => void;
  removeImage: (index: number) => void;
  removeExistingImage: (index: number) => Promise<void>;
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
  loadFromExisting: (existingData: ProductFormData, docId: string) => void;
}

import { PurchasedOrderFirebaseService } from '../../purchased-orders/models/purchasedOrderFirebaseService';
import type { Shipment } from '../../purchased-orders/models/types';
import {
  stockInLines, stockInFromShipment, suggestedSellPrice, checkSellPrice,
  type StockInLine,
} from '../models/shipmentStockIn';

const EMPTY_FORM: ProductFormData = {
  brandId:       '',
  brandName:     '',
  modelId:       '',
  modelName:     '',
  category:      '',
  costPrice:     0,
  sellPrice:     0,
  buyType:       'Import' as const,
  warrantyYears: 0,
  stock:         0,
  location:      '',
  description:   '',
  paymentMethod: undefined,
  paidAmount:    undefined,
  transactionId: '',
  serialNumbers: [],
  serialCities:  {},
  isDamaged:     false,
  status:        'New',
  currentStep:   'details' as const,
};

export function useCreateInventoryViewModel(): UseCreateInventoryViewModelReturn {
  const navigate = useNavigate();
  const params   = useParams<{ id?: string }>();

  const [currentStep,       setCurrentStep]       = useState<InventoryEntryStep>('details');
  const [isEditMode,        setIsEditMode]         = useState(false);
  const [editingId,         setEditingId]          = useState<string | null>(null);
  const [isFetchingProduct, setIsFetchingProduct]  = useState(false);
  const [isGeneratingTxnId, setIsGeneratingTxnId]  = useState(false);
  const [formData,          setFormData]           = useState<ProductFormData>(EMPTY_FORM);
  const [serialInput,       setSerialInput]        = useState('');
  const [serialCity,        setSerialCity]         = useState('');
  const [validation,        setValidation]         = useState<ValidationResult>({ isValid: true, fieldErrors: {} });
  const [isSubmitting,      setIsSubmitting]       = useState(false);
  const [selectedImages,    setSelectedImages]      = useState<File[]>([]);

  const [source, setSource] = useState<'manual' | 'shipment'>('manual');
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [selectedLineId, setSelectedLineId] = useState('');
  const [marginPercent, setMarginPercent] = useState(DEFAULT_MARGIN_PERCENT);

  // Loaded once, when the shipment path is first chosen. Nobody opening this
  // screen to type a product by hand should wait for a collection read.
  useEffect(() => {
    if (source !== 'shipment' || shipments.length > 0 || shipmentsLoading) return;
    setShipmentsLoading(true);
    PurchasedOrderFirebaseService.fetchAll()
      .then(list => setShipments(list.filter(sh => sh.status !== 'Cancelled')))
      .catch(() => toast.error('Could not load shipments'))
      .finally(() => setShipmentsLoading(false));
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedShipment = useMemo(
    () => shipments.find(sh => sh.id === selectedShipmentId) || null,
    [shipments, selectedShipmentId],
  );

  /** Only lines with something left. A row reading 0 remaining cannot be acted on. */
  const shipmentLines = useMemo(
    () => (selectedShipment ? stockInLines(selectedShipment) : []),
    [selectedShipment],
  );

  const selectedLine = useMemo(
    () => shipmentLines.find(l => l.lineId === selectedLineId) || null,
    [shipmentLines, selectedLineId],
  );

  // Changing the shipment invalidates the line, and the line drives the cost.
  useEffect(() => { setSelectedLineId(''); }, [selectedShipmentId]);

  /**
   * Picking a line fills the form from the shipment.
   *
   * Cost comes from the landed figure and is not editable — it is the whole
   * point of stocking in from a shipment. The sell price is a suggestion at the
   * current margin and stays editable, with a floor at cost.
   */
  useEffect(() => {
    if (!selectedLine || !selectedShipment) return;
    setFormData(prev => ({
      ...prev,
      brandName: selectedShipment.brandName,
      brandId:   selectedShipment.brandId,
      modelName: selectedLine.modelName || selectedLine.productName,
      costPrice: selectedLine.landedUnitCost,
      sellPrice: suggestedSellPrice(selectedLine.landedUnitCost, marginPercent),
      buyType:   'Import',
      status:    'Available',
    }));
  }, [selectedLineId, marginPercent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generate TXN ID on mount — CREATE mode only ───────────────────────────
  // InventoryFirebaseService.generateTransactionId() owns the db reference
  // and the Firestore atomic counter logic. We just call it here.
  useEffect(() => {
    if (params?.id) return; // edit mode — keep original ID from Firestore document

    setIsGeneratingTxnId(true);
    InventoryFirebaseService.generateTransactionId()
      .then(id => {
        setFormData(prev => ({ ...prev, transactionId: id }));
        console.log('✅ TXN ID generated:', id);
      })
      .catch(err => {
        console.error('⚠️ TXN ID generation failed, using fallback:', err);
        const fallback = generateFallbackTxnId();
        setFormData(prev => ({ ...prev, transactionId: fallback }));
      })
      .finally(() => setIsGeneratingTxnId(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Edit mode: fetch product from Firestore ───────────────────────────────
  useEffect(() => {
    const productId = params?.id;
    if (!productId) return;

    setIsEditMode(true);
    setEditingId(productId);
    setIsFetchingProduct(true);

    (async () => {
      try {
        const product = await InventoryFirebaseService.fetchProductById(productId);
        if (!product) {
          toast.error('Product not found');
          navigate('/inventory');
          return;
        }

        const hydrated: ProductFormData = {
          brandId:       product.brandId       || '',
          brandName:     product.brandName     || '',
          modelId:       product.modelId       || '',
          modelName:     product.modelName     || '',
          category:      product.category      || '',
          costPrice:     product.costPrice     ?? 0,
          sellPrice:     product.sellPrice     ?? 0,
          buyType:       product.buyType       || 'Import',
          warrantyYears: product.warrantyYears ?? 0,
          stock:         product.stock         ?? 0,
          location:      product.location      || '',
          description:   product.description   || '',
          serialNumbers: product.serialNumbers || [],
          serialCities:  product.serialCities  || {},
          isDamaged:     product.isDamaged     ?? false,
          status:        product.status        || 'New',
          costingOption: product.costingOption,
          costing:       product.costing,
          transactionId: product.transactionId || '',   // preserve original TXN ID
          imageUrls:     (product as any).imageUrls || [],
          paymentMethod: undefined,
          paidAmount:    undefined,
          currentStep:   'details' as const,
        };

        setFormData(hydrated);
        setCurrentStep('details');
        console.log('✅ Loaded product for editing:', { productId, transactionId: product.transactionId });
      } catch (err) {
        console.error('❌ Failed to fetch product for editing:', err);
        toast.error('Failed to load product for editing');
        navigate('/inventory');
      } finally {
        setIsFetchingProduct(false);
      }
    })();
  }, [params?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Image management ─────────────────────────────────────────────────────
  const addImages = useCallback((files: File[]) => {
    setSelectedImages(prev => [...prev, ...files.filter(f => f.type.startsWith('image/'))]);
  }, []);

  const removeImage = useCallback((index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const removeExistingImage = useCallback(async (index: number) => {
    if (!editingId) {
      toast.error('No product selected to delete image from');
      return;
    }
    const existing: string[] = (formData as any).imageUrls || [];
    if (!existing[index]) return;
    const url = existing[index];
    try {
      // Remove from storage (non-blocking if fails) and update Firestore
      await deleteInventoryImage(url);
      const updated = existing.filter((_, i) => i !== index);
      await InventoryFirebaseService.updateProduct(editingId, { imageUrls: updated });
      setFormData(prev => ({ ...prev, imageUrls: updated }));
      toast.success('Image removed');
    } catch (err) {
      console.error('Failed to delete image:', err);
      toast.error('Failed to remove image');
    }
  }, [editingId, formData]);

  // ── setField ──────────────────────────────────────────────────────────────
  const setField = useCallback((field: string, value: any) => {
    let sanitised = value;
    if (typeof sanitised === 'number' && isNaN(sanitised)) sanitised = 0;
    if (field === 'costPrice') {
      const parsed = typeof sanitised === 'string' ? parseFloat(sanitised) : Number(sanitised);
      sanitised = isFinite(parsed) ? parsed : 0;
    }
    setFormData(prev => ({ ...prev, [field]: sanitised }));
  }, []);

  // ── Serial numbers ────────────────────────────────────────────────────────
  const addSerialNumber = useCallback(() => {
    if (!serialInput.trim()) return;
    if (formData.serialNumbers.includes(serialInput.trim())) {
      toast.error('Serial number already exists');
      return;
    }
    const trimmed = serialInput.trim();
    const city    = serialCity.trim() || formData.location || '';
    setFormData(prev => ({
      ...prev,
      serialNumbers: [...prev.serialNumbers, trimmed],
      serialCities:  { ...prev.serialCities, [trimmed]: city },
      stock:         prev.serialNumbers.length + 1,
    }));
    setSerialInput('');
    setSerialCity('');
  }, [serialInput, serialCity, formData.serialNumbers, formData.location]);

  const removeSerialNumber = useCallback((serial: string) => {
    setFormData(prev => {
      const newSerials = prev.serialNumbers.filter(s => s !== serial);
      const newCities  = { ...prev.serialCities };
      delete newCities[serial];
      return { ...prev, serialNumbers: newSerials, serialCities: newCities, stock: newSerials.length };
    });
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────
  const validateCurrentStep = useCallback((): boolean => {
    const fieldErrors: { [key: string]: string } = {};
    const validSerials = formData.serialNumbers.filter(s => s.trim() !== '');

    if (currentStep === 'details') {
      if (!formData.brandName)                              fieldErrors.brandName  = 'Brand is required';
      if (!formData.modelName)                              fieldErrors.modelName  = 'Model is required';
      if (!formData.category)                               fieldErrors.category   = 'Category is required';
      if (!formData.sellPrice || formData.sellPrice <= 0)   fieldErrors.sellPrice  = 'Valid sell price required';
      if (formData.costPrice === undefined || formData.costPrice === null || (formData.costPrice as any) === '')
        fieldErrors.costPrice = 'Cost price is required (can be 0)';

      // Serial numbers are REQUIRED (not optional) when adding new inventory.
      // Edit mode preserves whatever serials were there before — the entry-time
      // requirement doesn't retroactively apply to existing records.
      if (!isEditMode) {
        if (!formData.stock || formData.stock <= 0) {
          fieldErrors.stock = 'Stock quantity must be at least 1';
        } else if (validSerials.length === 0) {
          fieldErrors.serialNumbers = 'Serial numbers are required';
        } else if (validSerials.length !== formData.stock) {
          fieldErrors.serialNumbers = `Provide ${formData.stock} serial number${formData.stock > 1 ? 's' : ''} (${validSerials.length} filled)`;
        } else if (new Set(validSerials).size !== validSerials.length) {
          fieldErrors.serialNumbers = 'Duplicate serial numbers found';
        }
      }
    }
    // NOTE: Payment step was removed from the add-inventory flow.
    // Payments are managed later from the Transactions module. handleSubmit
    // saves the product with paymentStatus: 'unpaid' when no method is set.

    setValidation({ isValid: Object.keys(fieldErrors).length === 0, fieldErrors });
    return Object.keys(fieldErrors).length === 0;
  }, [currentStep, formData, isEditMode]);

  const goToNextStep = useCallback(() => {
    if (!validateCurrentStep()) return;
    // Payment step removed — flow is now details → confirmation → save
    const steps: InventoryEntryStep[] = ['details', 'confirmation'];
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) setCurrentStep(steps[idx + 1]);
  }, [currentStep, validateCurrentStep]);

  const goToPreviousStep = useCallback(() => {
    const steps: InventoryEntryStep[] = ['details', 'confirmation'];
    const idx = steps.indexOf(currentStep);
    if (idx > 0) setCurrentStep(steps[idx - 1]);
  }, [currentStep]);

  const loadFromExisting = useCallback((existingData: ProductFormData, docId: string) => {
    setIsEditMode(true);
    setEditingId(docId);
    setFormData({ ...existingData, costPrice: existingData.costPrice ?? 0 });
    setCurrentStep('details');
  }, []);

  // ── SUBMIT ────────────────────────────────────────────────────────────────
  /**
   * Stock in from a shipment.
   *
   * A separate path, not a flag inside the manual one. It writes to two
   * collections and freezes a cost; folding that into a branch of the ordinary
   * submit is how the two quietly diverge.
   */
  const submitFromShipment = useCallback(async () => {
    if (!selectedShipment || !selectedLine) {
      toast.error('Pick a shipment and a product line'); return;
    }
    const serials = (formData.serialNumbers || []).map(x => x.trim()).filter(Boolean);
    if (serials.length === 0) { toast.error('Add the serial numbers'); return; }
    if (serials.length > selectedLine.remaining) {
      toast.error(`Only ${selectedLine.remaining} unit${selectedLine.remaining === 1 ? '' : 's'} remain on this line`);
      return;
    }
    const priceCheck = checkSellPrice(formData.sellPrice, selectedLine.landedUnitCost);
    if (!priceCheck.allowed) { toast.error(priceCheck.reason!); return; }

    setIsSubmitting(true);
    try {
      const res = await stockInFromShipment({
        shipmentId: selectedShipment.id,
        lineId:     selectedLine.lineId,
        serials,
        sellPrice:  formData.sellPrice,
        location:   formData.location,
        category:   formData.category,
        warrantyYears: formData.warrantyYears,
        description:   formData.description,
      });

      // Images are a separate, non-blocking step, the same as the manual path:
      // stock that exists matters more than a photo that failed to upload.
      if (selectedImages.length > 0) {
        try {
          const urls = await uploadInventoryImages(selectedImages, res.productId);
          if (urls.length) await InventoryFirebaseService.updateProduct(res.productId, { imageUrls: urls });
        } catch {
          toast.warning('Stock added, but the images could not be uploaded');
        }
      }

      toast.success(
        `${serials.length} unit${serials.length === 1 ? '' : 's'} stocked in at ${res.landedUnitCost.toFixed(2)}`
        + (res.created ? ' — new product created' : ''),
      );
      navigate('/inventory');
    } catch (e: any) {
      toast.error(e?.message || 'Could not stock in from the shipment');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedShipment, selectedLine, formData, selectedImages, navigate]);

  const handleSubmit = useCallback(async () => {
    if (source === 'shipment') { await submitFromShipment(); return; }
    if (!validateCurrentStep()) return;
    setIsSubmitting(true);

    try {
      const rawCost  = formData.costPrice;
      const costPrice: number =
        typeof rawCost === 'number' && isFinite(rawCost) ? rawCost : 0;

      const totalAmount   = costPrice * (formData.stock ?? 0);
      const paidAmount    = formData.paidAmount ?? 0;
      const paymentStatus: 'paid' | 'unpaid' | 'partial' =
        paidAmount >= totalAmount ? 'paid' :
        paidAmount > 0            ? 'partial' :
                                    'unpaid';

      const duplicateCheck = await InventoryFirebaseService.findDuplicateInventory({
        brandName: formData.brandName,
        modelName: formData.modelName,
        costPrice,
        sellPrice: formData.sellPrice,
        location: formData.location,
        serialNumbers: formData.serialNumbers || [],
      }, isEditMode ? editingId ?? undefined : undefined);

      if (duplicateCheck) {
        if (duplicateCheck.type === 'serial' && duplicateCheck.serials?.length) {
          toast.error(`This inventory contains serial number${duplicateCheck.serials.length > 1 ? 's' : ''} already in stock: ${duplicateCheck.serials.join(', ')}`);
        } else {
          toast.error('This inventory already exists with the same product, price, location and serial numbers.');
        }
        return;
      }

      if (isEditMode && editingId) {
        // ── UPDATE ─────────────────────────────────────────────────────────
        //
        // IMPORTANT: Save product data to Firestore FIRST, then attempt image
        // upload in a separate non-blocking step.  Previously both were in the
        // same try/catch, so a CORS failure on Firebase Storage would silently
        // abort the entire update and the user saw "Updating..." with nothing saved.
        const existingUrls: string[] = (formData as any).imageUrls || [];

        const updateDto: UpdateProductDTO = {
          brandName:     formData.brandName,
          modelName:     formData.modelName,
          category:      formData.category,
          costPrice,
          sellPrice:     formData.sellPrice,
          buyType:       formData.buyType,
          warrantyYears: formData.warrantyYears,
          stock:         formData.stock,
          location:      formData.location,
          description:   formData.description,
          serialNumbers: formData.serialNumbers,
          serialCities:  formData.serialCities,
          status:        formData.status,
          isDamaged:     formData.isDamaged,
          costingOption: formData.costingOption,
          costing:       formData.costing,
          transactionId: formData.transactionId || undefined,
          // Save with existing URLs first; new ones patched in below if upload succeeds
          imageUrls:     existingUrls,
        };

        // Step 1: Save product data — always, never blocked by image issues
        await InventoryFirebaseService.updateProduct(editingId, updateDto);

        // Step 2: Upload new images and patch — non-blocking, won't abort the save
        if (selectedImages.length > 0) {
          try {
            const newImageUrls = await uploadInventoryImages(selectedImages, editingId);
            const mergedUrls = [...existingUrls, ...newImageUrls];
            await InventoryFirebaseService.updateProduct(editingId, { imageUrls: mergedUrls });
            toast.success(`✅ Inventory updated with ${newImageUrls.length} image(s) — ${formData.transactionId || editingId}`);
          } catch (imgErr) {
            // Product data is already saved — only images failed
            console.error('Image upload failed (product was saved):', imgErr);
            toast.success(`✅ Inventory updated — ${formData.transactionId || editingId}`);
            toast.warning(
              'Images could not be uploaded (CORS error). Product data was saved successfully. ' +
              'Fix: configure CORS on your Firebase Storage bucket (see README).',
              { duration: 8000 }
            );
          }
        } else {
          toast.success(`✅ Inventory updated — ${formData.transactionId || editingId}`);
        }

      } else {
        // ── CREATE ─────────────────────────────────────────────────────────
        // Create the product first with empty imageUrls, then upload images
        // in a separate non-blocking step.  This ensures the product is always
        // saved to Firestore even if Firebase Storage CORS upload fails.
        const createDto: CreateProductDTO = {
          brandName:     formData.brandName,
          modelName:     formData.modelName,
          category:      formData.category,
          costPrice,
          sellPrice:     formData.sellPrice,
          buyType:       formData.buyType,
          warrantyYears: formData.warrantyYears,
          stock:         formData.stock,
          location:      formData.location,
          description:   formData.description,
          serialNumbers: formData.serialNumbers,
          serialCities:  formData.serialCities  || {},
          status:        formData.status,
          isDamaged:     formData.isDamaged      ?? false,
          costingOption: formData.costingOption,
          costing:       formData.costing,
          transactionId: formData.transactionId,
          imageUrls:     [], // patched below after upload
        };

        const paymentInfo = formData.paymentMethod
          ? {
              paymentStatus,
              transactionId:  formData.transactionId,
              paidAmount:     formData.paidAmount,
              totalAmount,
              paymentMode:    formData.paymentMethod === 'Cash' ? 'cash' : 'bank',
            }
          : {
              paymentStatus:  'unpaid' as const,
              transactionId:  formData.transactionId,
              totalAmount,
            };

        // Step 1: Save product — guaranteed to succeed even if images fail
        const createdProduct = await InventoryFirebaseService.createProduct(createDto, paymentInfo);

        // Step 2: Upload images non-blocking — patch imageUrls on the new doc
        if (selectedImages.length > 0) {
          try {
            const productKey = `${formData.brandName}-${formData.modelName}-${createdProduct.id}`.replace(/\s+/g, '_');
            const imageUrls = await uploadInventoryImages(selectedImages, productKey);
            await InventoryFirebaseService.updateProduct(createdProduct.id, { imageUrls });
            toast.success(`✅ Inventory saved with ${imageUrls.length} image(s) — ${formData.transactionId}`);
          } catch (imgErr) {
            console.error('Image upload failed on create (product was saved):', imgErr);
            toast.success(`✅ Inventory saved — ${formData.transactionId}`);
            toast.warning(
              'Images could not be uploaded (CORS error). Product was saved. ' +
              'Fix: configure CORS on your Firebase Storage bucket.',
              { duration: 8000 }
            );
          }
        } else {
          toast.success(`✅ Inventory saved — ${formData.transactionId}`);
        }
      }

      // ── Remember this model's profile ───────────────────────────────────
      //
      // This flow (used by both Add Inventory and Edit Inventory, via
      // InventoryEditWrapper) read profiles back through CreateInventoryView's
      // fetchModelProfileByName call but never wrote one. The description
      // survived only because fetchModelProfileByName falls back to the newest
      // matching Product — and that fallback matches brandName with a
      // case-SENSITIVE Firestore equality filter, so "Garrett" saved once and
      // "garrett" typed the next time found nothing. Writing the profile onto
      // the model doc makes the lookup reliable, and makes the description
      // visible to fetchBrands() and the brand/model dropdowns too.
      //
      // AWAITED, deliberately. navigate() is on the next line and
      // saveModelProfileByName makes three sequential Firestore round-trips, so
      // an un-awaited call does not survive the unmount. The multi-model screen
      // hit exactly this and left a note about it.
      //
      // allSettled semantics via the service itself: saveModelProfileByName
      // never throws, so profile bookkeeping cannot turn a successful product
      // save into an error toast.
      await saveModelProfileByName(formData.brandName, formData.modelName, {
        category:      formData.category,
        description:   formData.description,
        sellPrice:     formData.sellPrice,
        costPrice,
        warrantyYears: formData.warrantyYears,
        buyType:       formData.buyType,
        location:      formData.location,
      });

      navigate('/inventory/view');
    } catch (error) {
      console.error('❌ Error saving inventory item:', error);
      toast.error(isEditMode ? 'Failed to update inventory item' : 'Failed to create inventory item');
    } finally {
      setIsSubmitting(false);
    }
  }, [validateCurrentStep, formData, navigate, isEditMode, editingId]);

  const handleCancel = useCallback(() => navigate('/inventory'), [navigate]);
  return {
    currentStep,
    source, setSource,
    shipments, shipmentsLoading,
    selectedShipmentId, setSelectedShipmentId,
    shipmentLines, selectedLineId, setSelectedLineId, selectedLine,
    marginPercent, setMarginPercent,
    formData,
    validation,
    isSubmitting,
    isEditMode,
    editingId,
    isFetchingProduct,
    isGeneratingTxnId,
    selectedImages,
    addImages,
    removeImage,
    removeExistingImage,
    serialInput,
    serialCity,
    setField,
    setCurrentStep,
    setSerialInput,
    setSerialCity,
    addSerialNumber,
    removeSerialNumber,
    goToNextStep,
    goToPreviousStep,
    handleSubmit,
    handleCancel,
    loadFromExisting,
  };
}