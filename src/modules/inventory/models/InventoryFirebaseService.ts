/**
 * Inventory Module - Firebase Firestore Service Layer
 *
 * FIX: deleteProduct now HARD-DELETES from the `products` collection after
 * archiving to `deleted_products`. Previously it only set isDeleted:true,
 * leaving the document in `products` â€” causing the collection to appear
 * empty in the Firebase Console and confusing live queries.
 *
 * deleteSerial similarly hard-deletes when the last serial is removed.
 * fetchAllProducts no longer needs the isDeleted filter (kept as safety net).
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  runTransaction,
} from 'firebase/firestore';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db } from '../../../api/firebase/firebase';

// ==================== IMAGE UPLOAD ====================

const storage = getStorage();

export async function uploadInventoryImages(
  images: File[],
  productKey: string
): Promise<string[]> {
  return Promise.all(images.map(async file => {
    const ext     = file.name.split('.').pop() ?? 'jpg';
    const mime    = file.type || (ext === 'png' ? 'image/png' : 'image/jpeg');
    const path    = `inventory-images/${productKey}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const fileRef = storageRef(storage, path);
    const timeoutMs = 30_000;
    const uploadPromise = uploadBytes(fileRef, file, { contentType: mime })
      .then(() => getDownloadURL(fileRef));
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error(
        `Upload timed out after ${timeoutMs / 1000}s â€” check Firebase Storage CORS configuration.`
      )), timeoutMs)
    );
    return Promise.race([uploadPromise, timeoutPromise]);
  }));
}

export async function fetchImageAsBase64(url: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onload = () => {
      if (xhr.status !== 200) { resolve(null); return; }
      const blob: Blob = xhr.response;
      if (!blob || blob.size === 0) { resolve(null); return; }
      const mime = blob.type.toLowerCase();
      const format: 'PNG' | 'JPEG' = mime.includes('png') ? 'PNG' : 'JPEG';
      const reader = new FileReader();
      reader.onload  = () => { const dataUrl = reader.result as string; resolve(dataUrl ? { dataUrl, format } : null); };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    };
    xhr.onerror   = () => resolve(null);
    xhr.ontimeout = () => resolve(null);
    xhr.timeout   = 8000;
    xhr.send();
  });
}

export async function deleteInventoryImage(url: string): Promise<void> {
  try {
    const fileRef = storageRef(storage, url);
    await deleteObject(fileRef);
  } catch { /* non-blocking */ }
}

import type {
  Product, ProductTransfer, CreateProductDTO, UpdateProductDTO,
  CreateTransferDTO, ProductStatus, SerialStatus, CostingInfo,
  DamagedProduct, InventoryReportRow, PaymentChannel, SupplierPaymentStatus,
} from './types';

// ==================== COLLECTION NAMES ====================

const PRODUCTS_COLLECTION          = 'products';
const TRANSFERS_COLLECTION         = 'transfers';
const BRANDS_COLLECTION            = 'brands';
const MODELS_COLLECTION            = 'brandModels';
const COUNTERS_COLLECTION          = 'inv_counters';
const DELETED_PRODUCTS_COLLECTION  = 'deleted_products';
const DAMAGED_PRODUCTS_COLLECTION  = 'damaged_products';

// ==================== TYPES ====================

export interface DeletedProduct extends Product {
  originalId:     string;
  _archiveId:     string;
  deletedAt:      string;
  deletedBy:      string;
  deletedByEmail: string;
  deletedByName:  string;
}

// ==================== UTILITIES ====================

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

export async function generateInventoryTransactionId(): Promise<string> {
  const now     = new Date();
  const dd      = String(now.getDate()).padStart(2, '0');
  const mm      = String(now.getMonth() + 1).padStart(2, '0');
  const yy      = String(now.getFullYear()).slice(-2);
  const dateKey = `${dd}${mm}${yy}`;
  const prefix  = `INV-${dateKey}`;
  const counterRef = doc(db, COUNTERS_COLLECTION, prefix);
  const newCount = await runTransaction(db, async (tx) => {
    const snap    = await tx.get(counterRef);
    const current = snap.exists() ? (snap.data().count as number) : 0;
    const next    = current + 1;
    tx.set(counterRef, { count: next, updatedAt: new Date().toISOString() });
    return next;
  });
  return `${prefix}-${String(newCount).padStart(3, '0')}`;
}

// ==================== TRANSFORMS ====================

const PKR_PER_USD = 279.5;
const AED_PER_USD = 3.67;
const PKR_TO_AED  = AED_PER_USD / PKR_PER_USD;
const pkrToAed = (n: number) => Math.round((n || 0) * PKR_TO_AED * 100) / 100;

function transformDocToProduct(docSnap: any): Product {
  const d = docSnap.data();
  const isLegacyPKR = (d.sellPrice ?? d.costPrice ?? 0) > 50000;
  const conv = (n: number) => (isLegacyPKR ? pkrToAed(n) : (n ?? 0));
  return {
    id:            docSnap.id,
    brandName:     d.brandName     || '',
    modelName:     d.modelName     || '',
    category:      d.category      || '',
    costPrice:     conv(d.costPrice ?? 0),
    sellPrice:     conv(d.sellPrice ?? 0),
    buyType:       d.buyType       || 'Import',
    warrantyYears: d.warrantyYears ?? 0,
    stock:         d.stock         ?? 0,
    location:      d.location      || '',
    serialNumbers: d.serialNumbers || [],
    serialCities:  d.serialCities  || {},
    serialStatus:  d.serialStatus  || {},
    description:   d.description   || '',
    status:        d.status        || 'New',
    isDamaged:     d.isDamaged     ?? false,
    brandId:       d.brandId       || '',
    modelId:       d.modelId       || '',
    costingId:     d.costingId     || '',
    billId:              d.billId              || undefined,
    receivableStatus:    d.receivableStatus    || undefined,
    expectedReceiveDate: d.expectedReceiveDate || undefined,
    costingOption:       d.costingOption       || undefined,
    costing:             d.costing             || undefined,
    costingUsdRate:           d.costingUsdRate           ?? undefined,
    costingTotalCustomsValue: d.costingTotalCustomsValue ?? undefined,
    costingTotalFreightValue: d.costingTotalFreightValue ?? undefined,
    costingShipmentTotalUSD:  d.costingShipmentTotalUSD  ?? undefined,
    costingConsignmentValue:  d.costingConsignmentValue  ?? undefined,
    costingTotalValueOfBrand: d.costingTotalValueOfBrand ?? undefined,
    costingModelsJson:        d.costingModelsJson        || undefined,
    imageUrls:     d.imageUrls     || [],
    ownershipType:            d.ownershipType            || undefined,
    supplierCost:             d.supplierCost             ?? undefined,
    supplierPaymentStatus:    d.supplierPaymentStatus    || undefined,
    supplierPaidAmount:       d.supplierPaidAmount       ?? undefined,
    supplierRemainingAmount:  d.supplierRemainingAmount  ?? undefined,
    supplierPaymentChannel:   d.supplierPaymentChannel   || undefined,
    serialStockInDates:       d.serialStockInDates       || {},
    serialStockInDatesManual: d.serialStockInDatesManual || {},
    serialSoldDates:          d.serialSoldDates          || {},
    serialInvoiceNumbers:     d.serialInvoiceNumbers     || {},
    createdAt: d.createdAt || '',
    updatedAt: d.updatedAt || '',
  };
}

function transformDocToDamaged(docSnap: any): DamagedProduct {
  const d = docSnap.data();
  return {
    id:           docSnap.id,
    productId:    d.productId    || '',
    brandName:    d.brandName    || '',
    modelName:    d.modelName    || '',
    serialNumber: d.serialNumber || '',
    location:     d.location     || '',
    reason:       d.reason       || '',
    damagedAt:    d.damagedAt    || '',
    damagedBy:    d.damagedBy    || '',
  };
}

function transformDocToTransfer(docSnap: any): ProductTransfer {
  const d = docSnap.data();
  return {
    id:             docSnap.id,
    productId:      d.productId      || '',
    productName:    d.productName    || '',
    brandName:      d.brandName      || '',
    modelName:      d.modelName      || '',
    fromLocation:   d.fromLocation   || '',
    toLocation:     d.toLocation     || '',
    quantity:       d.quantity       ?? 0,
    serialNumbers:  d.serialNumbers  || [],
    date:           d.date           || '',
    transferDate:   d.transferDate   || '',
    status:         d.status         || 'Pending',
    transferredBy:  d.transferredBy  || '',
    note:           d.note           || '',
    notes:          d.notes          || '',
    receiptName:    d.receiptName    || undefined,
    receiptType:    d.receiptType    || undefined,
    receiptDataUrl: d.receiptDataUrl || undefined,
    shipmentCost:   d.shipmentCost   ?? undefined,
    costPerUnit:    d.costPerUnit    ?? undefined,
    transferItems:  d.transferItems  || undefined,
    createdAt:      d.createdAt      || '',
    receivedAt:     d.receivedAt     || undefined,
    receiverName:   d.receiverName   || undefined,
  };
}

export interface BrandDoc { id: string; name: string; createdAt?: string; }
export interface ModelDoc {
  id: string; name: string; brandId: string;
  costPrice?: number; sellPrice?: number; createdAt?: string;
  category?: string; description?: string; warrantyYears?: number;
  buyType?: string; location?: string; lastCostAt?: string;
}

function transformDocToBrand(docSnap: any): BrandDoc {
  const d = docSnap.data();
  return { id: docSnap.id, name: d.name || '', createdAt: d.createdAt || '' };
}

function transformDocToModel(docSnap: any): ModelDoc {
  const d = docSnap.data();
  return {
    id:           docSnap.id,
    name:         d.name      || '',
    brandId:      d.brandId   || '',
    costPrice:    d.costPrice ?? undefined,
    sellPrice:    d.sellPrice ?? undefined,
    createdAt:    d.createdAt || '',
    category:     d.category      ?? undefined,
    description:  d.description   ?? undefined,
    warrantyYears:d.warrantyYears ?? undefined,
    buyType:      d.buyType       ?? undefined,
    location:     d.location      ?? undefined,
    lastCostAt:   d.lastCostAt    ?? undefined,
  };
}

// ==================== PRODUCT SERVICE ====================

export class InventoryFirebaseService {

  static async fetchAllProducts(): Promise<Product[]> {
    try {
      console.log('ðŸ”¥ Fetching all products...');
      const q = query(collection(db, PRODUCTS_COLLECTION), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const products: Product[] = [];
      snapshot.forEach(d => {
        // Safety net: skip any legacy soft-deleted docs that weren't hard-deleted
        if ((d.data() as any).isDeleted) return;
        products.push(transformDocToProduct(d));
      });
      console.log(`âœ… Fetched ${products.length} products`);
      return products;
    } catch (error) {
      console.error('âŒ Error fetching products:', error);
      throw new Error('Failed to fetch products from Firestore');
    }
  }

  static async fetchProductsByType(inventoryType: 'in-stock' | 'on-order'): Promise<Product[]> {
    try {
      const ref = collection(db, PRODUCTS_COLLECTION);
      let snapshot;
      if (inventoryType === 'on-order') {
        snapshot = await getDocs(query(ref, where('receivableStatus', '==', 'Pending')));
      } else {
        snapshot = await getDocs(query(ref, orderBy('createdAt', 'desc')));
      }
      const products: Product[] = [];
      snapshot.forEach(d => {
        if ((d.data() as any).isDeleted) return;
        const p = transformDocToProduct(d);
        if (inventoryType === 'in-stock' && p.receivableStatus === 'Pending') return;
        products.push(p);
      });
      if (inventoryType === 'on-order') {
        products.sort((a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
      }
      return products;
    } catch (error) {
      console.error(`âŒ Error fetching ${inventoryType} products:`, error);
      throw new Error('Failed to fetch products from Firestore');
    }
  }

  static async fetchProductById(id: string): Promise<Product | null> {
    try {
      const snap = await getDoc(doc(db, PRODUCTS_COLLECTION, id));
      if (!snap.exists()) return null;
      return transformDocToProduct(snap);
    } catch (error) {
      throw new Error('Failed to fetch product from Firestore');
    }
  }

  private static arraysEqual(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  static async findDuplicateInventory(criteria: {
    brandName: string; modelName: string; costPrice: number;
    sellPrice: number; location: string; serialNumbers: string[];
  }, ignoreId?: string) {
    const products = await InventoryFirebaseService.fetchAllProducts();
    const incomingSerials = criteria.serialNumbers.map(s => s.trim()).filter(s => s !== '');
    if (incomingSerials.length > 0) {
      const duplicates = new Set<string>();
      for (const product of products) {
        if (product.id === ignoreId) continue;
        (product.serialNumbers || []).forEach(serial => {
          if (incomingSerials.includes(serial)) duplicates.add(serial);
        });
      }
      if (duplicates.size > 0) return { type: 'serial', serials: Array.from(duplicates) } as const;
    }
    const normalizedSerials = [...incomingSerials].sort();
    const exactMatch = products.find(product => {
      if (product.id === ignoreId) return false;
      if (product.brandName !== criteria.brandName || product.modelName !== criteria.modelName ||
          product.costPrice !== criteria.costPrice || product.sellPrice !== criteria.sellPrice ||
          product.location  !== criteria.location) return false;
      const existingSerials = (product.serialNumbers || []).map(s => s.trim()).filter(s => s !== '').sort();
      return InventoryFirebaseService.arraysEqual(existingSerials, normalizedSerials);
    });
    if (exactMatch) return { type: 'product', existingProduct: exactMatch } as const;
    return null;
  }

  static async createProduct(
    dto: CreateProductDTO,
    paymentInfo?: { paymentStatus: 'paid' | 'unpaid' | 'partial'; transactionId?: string; paidAmount?: number; totalAmount?: number; }
  ): Promise<Product> {
    try {
      console.log('ðŸ”¥ Creating product:', dto.brandName, dto.modelName);
      const now = new Date().toISOString();
      const serialStatus: { [key: string]: SerialStatus } = {};
      dto.serialNumbers.forEach(s => { serialStatus[s] = 'Available'; });

      const serialCities = { ...dto.serialCities };
      if (dto.location) {
        dto.serialNumbers.forEach(s => { if (!serialCities[s]) serialCities[s] = dto.location!; });
      }
      const serialStockInDates = { ...(dto.serialStockInDates || {}) };
      dto.serialNumbers.forEach(s => { if (!serialStockInDates[s]) serialStockInDates[s] = now; });

      let costingFields = {};
      if (dto.costingOption === 'with' && dto.costing) {
        const c = dto.costing;
        costingFields = stripUndefined({
          costingUsdRate:           c.usdRate,
          costingTotalCustomsValue: c.totalCustomsValue,
          costingTotalFreightValue: c.totalFreightValue,
          costingShipmentTotalUSD:  c.shipmentTotalUSD,
          costingConsignmentValue:  c.consignmentValue,
          costingTotalValueOfBrand: c.totalValueOfBrand,
          costingModelsJson:        JSON.stringify(c.models),
          costing:                  c,
        });
      }

      const duplicateCheck = await InventoryFirebaseService.findDuplicateInventory({
        brandName: dto.brandName, modelName: dto.modelName,
        costPrice: dto.costPrice ?? 0, sellPrice: dto.sellPrice,
        location: dto.location || '', serialNumbers: dto.serialNumbers || [],
      });
      if (duplicateCheck) {
        if (duplicateCheck.type === 'serial' && duplicateCheck.serials?.length > 0)
          throw new Error(`Duplicate serial number${duplicateCheck.serials.length > 1 ? 's' : ''}: ${duplicateCheck.serials.join(', ')}`);
        throw new Error('Duplicate inventory already exists with the same product, price, location and serial numbers.');
      }

      const remainingAmount = paymentInfo ? (paymentInfo.totalAmount || 0) - (paymentInfo.paidAmount || 0) : undefined;
      const data = stripUndefined({
        brandName: dto.brandName, modelName: dto.modelName, category: dto.category,
        costPrice: dto.costPrice ?? 0, sellPrice: dto.sellPrice, currency: 'AED',
        buyType: dto.buyType, warrantyYears: dto.warrantyYears, stock: dto.stock,
        location: dto.location, serialNumbers: dto.serialNumbers, serialCities,
        serialStatus, serialStockInDates,
        serialStockInDatesManual: dto.serialStockInDatesManual || {},
        description: dto.description ?? '', status: dto.status, isDamaged: dto.isDamaged,
        costingOption: dto.costingOption, imageUrls: dto.imageUrls || [],
        ownershipType: dto.ownershipType,
        supplierCost:           dto.ownershipType === 'Credit' ? (dto.supplierCost ?? 0) : undefined,
        supplierPaymentStatus:  dto.ownershipType === 'Credit' ? (dto.supplierPaymentStatus || 'Unpaid') : undefined,
        supplierPaidAmount:     dto.supplierPaidAmount,
        supplierPaymentChannel: dto.supplierPaymentChannel,
        billId: dto.billId, receivableStatus: dto.receivableStatus,
        expectedReceiveDate: dto.expectedReceiveDate,
        paymentStatus: paymentInfo?.paymentStatus, transactionId: paymentInfo?.transactionId,
        paidAmount: paymentInfo?.paidAmount, totalAmount: paymentInfo?.totalAmount, remainingAmount,
        ...costingFields, createdAt: now, updatedAt: now,
      });

      const docRef = await addDoc(collection(db, PRODUCTS_COLLECTION), data);
      console.log('âœ… Product created:', docRef.id);
      return transformDocToProduct(await getDoc(docRef));
    } catch (error) {
      console.error('âŒ Error creating product:', error);
      if (error instanceof Error && error.message.toLowerCase().includes('duplicate')) throw error;
      throw new Error('Failed to create product in Firestore');
    }
  }
     /**
   * Add serials to a product that already exists.
   *
   * A second batch from a shipment is not a new product â€” it is the same model,
   * bought later at a different landed cost. The serials join the array, the
   * cost goes on the serial, and costPrice becomes the weighted average so
   * every report that reads it keeps a sensible number.
   */
  static async addSerialsToProduct(id: string, batch: {
    serials: string[]; landedUnitCost: number; shipmentId: string;
    shipmentNumber?: string; location: string; sellPrice?: number;
    costingFields?: Record<string, number>;
  }): Promise<void> {
    const ref  = doc(db, PRODUCTS_COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Product not found');
    const p = snap.data() as Product;

    const existing = p.serialNumbers || [];
    const clash    = batch.serials.filter(s => existing.includes(s));
    if (clash.length) throw new Error(`Serial ${clash[0]} is already on this product`);

    const serialNumbers = [...existing, ...batch.serials];
    const now = new Date().toISOString();

    // Weighted average across both batches. The per-serial map holds the truth;
    // this keeps every report that reads costPrice showing a sensible number.
    const oldQty  = existing.length;
    const oldCost = Number(p.costPrice) || 0;
    const newQty  = batch.serials.length;
    const costPrice = serialNumbers.length > 0
      ? Math.round(((oldQty * oldCost + newQty * batch.landedUnitCost) / serialNumbers.length) * 100) / 100
      : batch.landedUnitCost;

    const add = <T,>(map: Record<string, T> | undefined, v: T) => ({
      ...(map || {}),
      ...Object.fromEntries(batch.serials.map(s => [s, v])),
    });

    await updateDoc(ref, stripUndefined({
      serialNumbers,
      stock: serialNumbers.length,
      costPrice,
      // Only raised, never lowered: a later batch costing more should not drop
      // the price of stock already on the shelf.
      sellPrice: batch.sellPrice && batch.sellPrice > (Number(p.sellPrice) || 0)
        ? batch.sellPrice : p.sellPrice,

      serialCities:       add(p.serialCities, batch.location),
      serialStatus:       add(p.serialStatus, 'Available' as any),
      serialStockInDates: add(p.serialStockInDates, now.slice(0, 10)),
      serialCostPrice:    add((p as any).serialCostPrice, batch.landedUnitCost),
      serialShipmentId:   add((p as any).serialShipmentId, batch.shipmentId),

      status: 'Available',
      ...(batch.costingFields || {}),
      updatedAt: now,
    }));
  }
  static async updateProduct(id: string, dto: UpdateProductDTO): Promise<Product> {
    try {
      console.log('ðŸ”¥ Updating product:', id);
      const now = new Date().toISOString();
      let costingFields = {};
      if (dto.costingOption === 'with' && dto.costing) {
        const c = dto.costing;
        costingFields = stripUndefined({
          costingUsdRate: c.usdRate, costingTotalCustomsValue: c.totalCustomsValue,
          costingTotalFreightValue: c.totalFreightValue, costingShipmentTotalUSD: c.shipmentTotalUSD,
          costingConsignmentValue: c.consignmentValue, costingTotalValueOfBrand: c.totalValueOfBrand,
          costingModelsJson: JSON.stringify(c.models), costing: c,
        });
      }
      /**
       * Only what the caller actually sent.
       *
       * costPrice and description were unconditional with a `?? 0` and a `?? ''`
       * behind them, so a partial update â€” attaching an image, say â€” wrote a
       * cost of zero and a blank description over whatever the product had.
       *
       * The product was created with 315, the image upload called this a moment
       * later with only { imageUrls }, and 315 became 0. Nothing reported it:
       * both writes succeeded, and only the report showed the damage.
       *
       * Every other field below was already guarded this way. These two were
       * not.
       */
      const updateData: Record<string, any> = { updatedAt: now };
      if (dto.costPrice   !== undefined) updateData.costPrice   = dto.costPrice;
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.brandName     !== undefined) updateData.brandName     = dto.brandName;
      if (dto.modelName     !== undefined) updateData.modelName     = dto.modelName;
      if (dto.category      !== undefined) updateData.category      = dto.category;
      if (dto.sellPrice     !== undefined) updateData.sellPrice     = dto.sellPrice;
      if (dto.buyType       !== undefined) updateData.buyType       = dto.buyType;
      if (dto.warrantyYears !== undefined) updateData.warrantyYears = dto.warrantyYears;
      if (dto.stock         !== undefined) updateData.stock         = dto.stock;
      if (dto.location      !== undefined) updateData.location      = dto.location;
      if (dto.serialNumbers !== undefined) updateData.serialNumbers = dto.serialNumbers;
      if (dto.serialCities  !== undefined) updateData.serialCities  = dto.serialCities;
      if (dto.serialStatus  !== undefined) updateData.serialStatus  = dto.serialStatus;
      if (dto.status        !== undefined) updateData.status        = dto.status;
      if (dto.isDamaged     !== undefined) updateData.isDamaged     = dto.isDamaged;
      if (dto.costingOption !== undefined) updateData.costingOption = dto.costingOption;
      if (dto.imageUrls     !== undefined) updateData.imageUrls     = dto.imageUrls;
      if (dto.ownershipType           !== undefined) updateData.ownershipType           = dto.ownershipType;
      if (dto.supplierCost            !== undefined) updateData.supplierCost            = dto.supplierCost;
      if (dto.supplierPaymentStatus   !== undefined) updateData.supplierPaymentStatus   = dto.supplierPaymentStatus;
      if (dto.supplierPaidAmount      !== undefined) updateData.supplierPaidAmount      = dto.supplierPaidAmount;
      if (dto.supplierPaymentChannel  !== undefined) updateData.supplierPaymentChannel  = dto.supplierPaymentChannel;
      if (dto.serialStockInDates      !== undefined) updateData.serialStockInDates      = dto.serialStockInDates;
      if (dto.serialStockInDatesManual !== undefined) updateData.serialStockInDatesManual = dto.serialStockInDatesManual;
      if (dto.serialSoldDates         !== undefined) updateData.serialSoldDates         = dto.serialSoldDates;
      if (dto.serialInvoiceNumbers    !== undefined) updateData.serialInvoiceNumbers    = dto.serialInvoiceNumbers;
      Object.assign(updateData, costingFields);
      const ref = doc(db, PRODUCTS_COLLECTION, id);
      await updateDoc(ref, updateData);
      console.log('âœ… Product updated:', id);
      return transformDocToProduct(await getDoc(ref));
    } catch (error) {
      console.error(`âŒ Error updating product ${id}:`, error);
      throw new Error('Failed to update product in Firestore');
    }
  }

  static async receiveProduct(id: string): Promise<void> {
    try {
      await updateDoc(doc(db, PRODUCTS_COLLECTION, id), {
        receivableStatus: 'Received', status: 'Available' as ProductStatus,
        receivedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      console.log('âœ… Product received:', id);
    } catch (error) {
      throw new Error('Failed to receive product in Firestore');
    }
  }

  /**
   * FIX: Hard-deletes from `products` after archiving to `deleted_products`.
   * Previously used isDeleted:true flag which left documents in the collection,
   * making the Firebase Console show the collection as empty.
   */
  static async deleteProduct(
    id: string,
    deletedBy: { uid: string; email: string; displayName?: string }
  ): Promise<void> {
    try {
      console.log(`ðŸ”¥ Deleting product ${id} by ${deletedBy.email}...`);
      const productRef  = doc(db, PRODUCTS_COLLECTION, id);
      const productSnap = await getDoc(productRef);
      if (!productSnap.exists()) throw new Error(`Product ${id} not found`);
      const now = new Date().toISOString();

      // Step 1: Archive full copy to deleted_products
      await addDoc(collection(db, DELETED_PRODUCTS_COLLECTION), {
        ...productSnap.data(),
        originalId:     id,
        deletedAt:      now,
        deletedBy:      deletedBy.uid,
        deletedByEmail: deletedBy.email,
        deletedByName:  deletedBy.displayName || deletedBy.email,
      });

      // Step 2: HARD DELETE from products collection
      // (previously only set isDeleted:true â€” fixed here)
      await deleteDoc(productRef);

      console.log(`âœ… Product ${id} archived to deleted_products and removed from products collection`);
    } catch (error) {
      console.error(`âŒ Error deleting product ${id}:`, error);
      throw new Error('Failed to delete product');
    }
  }

  /**
   * FIX: Last-serial path also hard-deletes via the fixed deleteProduct above.
   */
  static async deleteSerial(
    productId: string,
    serial: string,
    deletedBy: { uid: string; email: string; displayName?: string }
  ): Promise<void> {
    try {
      console.log(`ðŸ”¥ Deleting serial ${serial} of product ${productId}...`);
      const productRef  = doc(db, PRODUCTS_COLLECTION, productId);
      const productSnap = await getDoc(productRef);
      if (!productSnap.exists()) throw new Error(`Product ${productId} not found`);
      const p = productSnap.data() as any;

      const existingSerials: string[] = Array.isArray(p.serialNumbers) ? p.serialNumbers : [];
      const now = new Date().toISOString();
      const remainingSerials = existingSerials.filter(s => s !== serial);

      // Last serial â€” delegate to deleteProduct (which now hard-deletes)
      if (existingSerials.includes(serial) && remainingSerials.length === 0) {
        console.log(`â†ªï¸  Last serial â€” delegating to deleteProduct for ${productId}`);
        await this.deleteProduct(productId, deletedBy);
        return;
      }

      // Archive single-serial snapshot
      const archiveSnapshot = {
        ...p,
        originalId:    productId,
        serialNumbers: [serial],
        serialCities:  p.serialCities?.[serial]  ? { [serial]: p.serialCities[serial]  } : {},
        serialStatus:  p.serialStatus?.[serial]  ? { [serial]: p.serialStatus[serial]  } : {},
        serialStockInDates:       p.serialStockInDates?.[serial]       ? { [serial]: p.serialStockInDates[serial]       } : {},
        serialStockInDatesManual: p.serialStockInDatesManual?.[serial] ? { [serial]: p.serialStockInDatesManual[serial] } : {},
        serialSoldDates:          p.serialSoldDates?.[serial]          ? { [serial]: p.serialSoldDates[serial]          } : {},
        serialInvoiceNumbers:     p.serialInvoiceNumbers?.[serial]     ? { [serial]: p.serialInvoiceNumbers[serial]     } : {},
        stock:         1,
        deletionScope: 'serial' as const,
        deletedAt:      now,
        deletedBy:      deletedBy.uid,
        deletedByEmail: deletedBy.email,
        deletedByName:  deletedBy.displayName || deletedBy.email,
      };
      await addDoc(collection(db, DELETED_PRODUCTS_COLLECTION), archiveSnapshot);

      // Update live product (remove just this serial)
      if (existingSerials.includes(serial)) {
        const cleanedCities:  Record<string, any> = { ...(p.serialCities  || {}) }; delete cleanedCities[serial];
        const cleanedStatus:  Record<string, any> = { ...(p.serialStatus  || {}) }; delete cleanedStatus[serial];
        const cleanedStockIn: Record<string, any> = { ...(p.serialStockInDates || {}) }; delete cleanedStockIn[serial];
        const cleanedManual:  Record<string, any> = { ...(p.serialStockInDatesManual || {}) }; delete cleanedManual[serial];
        const cleanedSold:    Record<string, any> = { ...(p.serialSoldDates || {}) }; delete cleanedSold[serial];
        const cleanedInvoice: Record<string, any> = { ...(p.serialInvoiceNumbers || {}) }; delete cleanedInvoice[serial];
        await updateDoc(productRef, {
          stock: remainingSerials.length, serialNumbers: remainingSerials,
          serialCities: cleanedCities, serialStatus: cleanedStatus,
          serialStockInDates: cleanedStockIn, serialStockInDatesManual: cleanedManual,
          serialSoldDates: cleanedSold, serialInvoiceNumbers: cleanedInvoice, updatedAt: now,
        });
      }
      console.log(`âœ… Serial ${serial} deleted â€” remaining: ${remainingSerials.length}`);
    } catch (error) {
      console.error(`âŒ Error deleting serial ${serial}:`, error);
      throw new Error('Failed to delete serial');
    }
  }

  static async markSerialsSold(
    productId: string,
    sales: Array<{
      serial: string;
      invoiceNumber: string;
      soldDate?: string;
      paymentStatus?: 'Paid' | 'Partial' | 'Unpaid';
      supplierCost?: number;
    }>,
    soldDate?: string,
  ): Promise<void> {
    if (!productId || !sales || sales.length === 0) return;
    try {
      const ref  = doc(db, PRODUCTS_COLLECTION, productId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error(`Product ${productId} not found`);
      const p = snap.data() as any;
      const now = new Date().toISOString();
      const fallbackDate = soldDate || now;
      const nextStatus:   Record<string, any> = { ...(p.serialStatus         || {}) };
      const nextSoldDate: Record<string, any> = { ...(p.serialSoldDates      || {}) };
      const nextInvoice:  Record<string, any> = { ...(p.serialInvoiceNumbers || {}) };
      // Written here rather than on the product, because two units of the same
      // model can leave on different invoices with different terms.
      const nextPayStat:  Record<string, any> = { ...((p as any).serialInvoicePaymentStatus || {}) };
      const nextSupCost:  Record<string, any> = { ...((p as any).serialInvoiceSupplierCost  || {}) };
      for (const s of sales) {
        if (!s.serial) continue;
        nextStatus[s.serial]   = 'Sold';
        nextSoldDate[s.serial] = s.soldDate || fallbackDate;
        nextInvoice[s.serial]  = s.invoiceNumber || '';
        if (s.paymentStatus !== undefined) nextPayStat[s.serial] = s.paymentStatus;
        if (s.supplierCost  !== undefined) nextSupCost[s.serial] = s.supplierCost;
      }
      await updateDoc(ref, {
        serialStatus: nextStatus,
        serialSoldDates: nextSoldDate,
        serialInvoiceNumbers: nextInvoice,
        serialInvoicePaymentStatus: nextPayStat,
        serialInvoiceSupplierCost:  nextSupCost,
        updatedAt: now,
      });
      console.log(`âœ… Marked ${sales.length} serial(s) as Sold on product ${productId}`);
    } catch (error) {
      console.error(`âŒ Error marking serials sold on ${productId}:`, error);
      throw new Error('Failed to mark serials as sold');
    }
  }

  static async updateSerialPaymentStatus(
    productId: string,
    serials: string[],
    paymentStatus: 'Paid' | 'Partial' | 'Unpaid',
  ): Promise<void> {
    if (!productId || !serials || serials.length === 0) return;
    try {
      const ref  = doc(db, PRODUCTS_COLLECTION, productId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const p = snap.data() as any;
      const nextPayStat: Record<string, any> = { ...(p.serialInvoicePaymentStatus || {}) };
      serials.forEach(s => { if (s) nextPayStat[s] = paymentStatus; });
      await updateDoc(ref, {
        serialInvoicePaymentStatus: nextPayStat,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Error updating serial payment status on ${productId}:`, error);
      throw new Error('Failed to update serial payment status');
    }
  }

  /**
   * Adds `amount` on top of whatever cost a serial already carries.
   *
   * Used when a shipment charge arrives after stock-in, for units that are
   * already in Inventory but not yet sold — their landedUnitCost was
   * snapshotted once, at stock-in time, and never moves on its own. This
   * lets a late-arriving charge still reach the units that will eventually
   * carry it into an invoice's Purchase Cost.
   *
   * BUG FIX: this used to write only `serialCostPrice` (the per-serial map).
   * That map, in practice, is never read anywhere else in the app — every
   * consumer that needs a unit's cost (extractCost() at invoice-creation
   * time, the Inventory Report's "Purchasing Cost" column, the Balance
   * Sheet's Owned Inventory valuation) reads the flat, product-level
   * `costPrice` field instead. So a late-charge top-up updated a number
   * nothing downstream ever looked at: it never showed up on the product,
   * never reached that unit's eventual invoice/COGS, and never moved the
   * Balance Sheet's inventory value — even though the toast said the cost
   * had been "updated". Now `costPrice` is folded in too, the same
   * weighted-average way addSerialsToProduct() already keeps it in sync:
   * total value across every serial the product has ever carried, divided
   * by the serial count.
   */
  static async topUpSerialCosts(
    productId: string,
    additions: Record<string, number>,
  ): Promise<void> {
    if (!productId || !additions || Object.keys(additions).length === 0) return;
    try {
      const ref  = doc(db, PRODUCTS_COLLECTION, productId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const p = snap.data() as any;
      const nextCost: Record<string, number> = { ...(p.serialCostPrice || {}) };
      let totalAdded = 0;
      Object.entries(additions).forEach(([serial, add]) => {
        if (!serial || !(add > 0)) return;
        nextCost[serial] = (Number(nextCost[serial]) || 0) + add;
        totalAdded += add;
      });
      if (totalAdded <= 0) return;

      const serialCount = (p.serialNumbers || []).length || 1;
      const oldCostPrice = Number(p.costPrice) || 0;
      const costPrice = Math.round(((oldCostPrice * serialCount + totalAdded) / serialCount) * 100) / 100;

      await updateDoc(ref, {
        serialCostPrice: nextCost,
        costPrice,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Error topping up serial costs on ${productId}:`, error);
      throw new Error('Failed to top up serial costs');
    }
  }

  static async fetchDeletedProducts(): Promise<DeletedProduct[]> {
    try {
      const q = query(collection(db, DELETED_PRODUCTS_COLLECTION), orderBy('deletedAt', 'desc'));
      const snapshot = await getDocs(q);
      const results: DeletedProduct[] = [];
      snapshot.forEach(d => {
        const data = d.data() as any;
        const fakeSnap = { id: data.originalId || d.id, data: () => data };
        results.push({
          ...transformDocToProduct(fakeSnap),
          deletedAt:      data.deletedAt      || '',
          deletedBy:      data.deletedBy      || '',
          deletedByEmail: data.deletedByEmail || '',
          deletedByName:  data.deletedByName  || '',
          originalId:     data.originalId     || d.id,
          _archiveId:     d.id,
        });
      });
      console.log(`âœ… Fetched ${results.length} deleted products`);
      return results;
    } catch (error) {
      throw new Error('Failed to fetch deleted products');
    }
  }

  /**
   * Restore a product from deleted_products back to the live products collection.
   * Removes the deletion metadata fields before restoring.
   */
  static async restoreProduct(
    archiveId: string,
    originalId: string
  ): Promise<void> {
    try {
      console.log(`ðŸ”¥ Restoring product ${originalId} from archive ${archiveId}...`);
      const archiveRef  = doc(db, DELETED_PRODUCTS_COLLECTION, archiveId);
      const archiveSnap = await getDoc(archiveRef);
      if (!archiveSnap.exists()) throw new Error('Archive record not found');
      const data = archiveSnap.data() as any;

      // Strip deletion metadata
      const { originalId: _oid, _archiveId: _aid, deletedAt, deletedBy,
              deletedByEmail, deletedByName, isDeleted, deletionScope, ...cleanData } = data;

      // Restore to products collection with original ID
      const productRef = doc(db, PRODUCTS_COLLECTION, originalId);
      const existingSnap = await getDoc(productRef);

      if (existingSnap.exists()) {
        // Document exists (legacy isDeleted flag) â€” update it
        await updateDoc(productRef, { ...cleanData, isDeleted: false, updatedAt: new Date().toISOString() });
      } else {
        // Document was hard-deleted â€” recreate it
        // We can't set a specific doc ID with addDoc, so we use setDoc equivalent
        const { setDoc } = await import('firebase/firestore');
        await setDoc(productRef, { ...cleanData, updatedAt: new Date().toISOString() });
      }

      // Remove from deleted_products archive
      await deleteDoc(archiveRef);
      console.log(`âœ… Product ${originalId} restored to products collection`);
    } catch (error) {
      console.error(`âŒ Error restoring product ${originalId}:`, error);
      throw new Error('Failed to restore product');
    }
  }

  static async findProductBySerial(serial: string): Promise<Product | null> {
    try {
      const trimmed = serial.trim();
      if (!trimmed) return null;
      const q = query(collection(db, PRODUCTS_COLLECTION), where('serialNumbers', 'array-contains', trimmed));
      const snap = await getDocs(q);
      const match = snap.docs.find(d => !(d.data() as any).isDeleted);
      if (!match) return null;
      return transformDocToProduct(match);
    } catch (error) {
      throw new Error('Failed to search for serial number');
    }
  }

  static async returnSerialToStock(productId: string, serial: string): Promise<void> {
    try {
      const ref  = doc(db, PRODUCTS_COLLECTION, productId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Product not found');
      const d = snap.data() as any;
      const now = new Date().toISOString();
      const serialStatus:      Record<string, string> = { ...(d.serialStatus || {}),      [serial]: 'Available' };
      const serialStockInDates:Record<string, string> = { ...(d.serialStockInDates || {}), [serial]: now };
      const serialSoldDates:   Record<string, string> = { ...(d.serialSoldDates || {}) };
      delete serialSoldDates[serial];
      const wasNotInStock = !(d.serialNumbers || []).includes(serial);
      const serialNumbers: string[] = wasNotInStock
        ? [...(d.serialNumbers || []), serial]
        : d.serialNumbers;
      await updateDoc(ref, stripUndefined({
        serialNumbers, serialStatus, serialStockInDates, serialSoldDates,
        stock: wasNotInStock ? (d.stock || 0) + 1 : d.stock,
        ownershipType: d.ownershipType === 'Credit' ? 'Owned' : d.ownershipType,
        updatedAt: now,
      }));
      console.log(`âœ… Serial ${serial} returned to stock on product ${productId}`);
    } catch (error) {
      throw new Error('Failed to return serial to stock');
    }
  }

  static async moveSerialToDamaged(
    productId: string, serial: string,
    damagedBy?: { uid: string; email: string }, reason?: string
  ): Promise<void> {
    try {
      const ref  = doc(db, PRODUCTS_COLLECTION, productId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Product not found');
      const d = snap.data() as any;
      const now = new Date().toISOString();
      const serialNumbers: string[] = (d.serialNumbers || []).filter((s: string) => s !== serial);
      const serialStatus  = { ...(d.serialStatus || {}) };  delete serialStatus[serial];
      const serialCities  = { ...(d.serialCities || {}) };
      const location      = serialCities[serial] || d.location || '';
      delete serialCities[serial];
      const serialStockInDates = { ...(d.serialStockInDates || {}) }; delete serialStockInDates[serial];
      await addDoc(collection(db, DAMAGED_PRODUCTS_COLLECTION), stripUndefined({
        productId, brandName: d.brandName || '', modelName: d.modelName || '',
        serialNumber: serial, location, reason, damagedAt: now, damagedBy: damagedBy?.email || '',
      }));
      await updateDoc(ref, stripUndefined({
        serialNumbers, serialStatus, serialCities, serialStockInDates,
        stock: Math.max(0, (d.stock || 0) - 1), updatedAt: now,
      }));
      console.log(`âœ… Serial ${serial} moved to damaged inventory`);
    } catch (error) {
      throw new Error('Failed to move serial to damaged inventory');
    }
  }

  static async fetchDamagedProducts(): Promise<DamagedProduct[]> {
    try {
      const q    = query(collection(db, DAMAGED_PRODUCTS_COLLECTION), orderBy('damagedAt', 'desc'));
      const snap = await getDocs(q);
      const results: DamagedProduct[] = [];
      snap.forEach(d => results.push(transformDocToDamaged(d)));
      return results;
    } catch (error) {
      throw new Error('Failed to fetch damaged inventory');
    }
  }

  static async fetchInventoryReportRows(): Promise<InventoryReportRow[]> {
    const products = await InventoryFirebaseService.fetchAllProducts();
    const rows: InventoryReportRow[] = [];
    for (const p of products) {
      const serials = p.serialNumbers && p.serialNumbers.length > 0 ? p.serialNumbers : [''];
      for (const serial of serials) {
        const serialStatus = serial ? p.serialStatus?.[serial] : undefined;
        rows.push({
          productId: p.id, brandName: p.brandName, modelName: p.modelName,
          serialNumber: serial,
          stockInDateAuto:   (serial && p.serialStockInDates?.[serial]) || p.createdAt || '',
          stockInDateManual: serial ? p.serialStockInDatesManual?.[serial] : undefined,
          type:         p.category || '',
          location:     (serial && p.serialCities?.[serial]) || p.location || '',
          ownershipType: p.ownershipType || '',
          condition:    p.status,
          currentStatus: serialStatus === 'Sold' ? 'Sold' : 'In Stock',
          soldDate:      serial ? p.serialSoldDates?.[serial]      : undefined,
          invoiceNumber: serial ? p.serialInvoiceNumbers?.[serial] : undefined,
          // Supplier cost from the invoice that sold this unit when there is
          // one, falling back to the product's own figure. On Owned stock the
          // product has none, which is why this column was always blank.
          supplierCost:            (serial ? (p as any).serialInvoiceSupplierCost?.[serial] : undefined)
                                   ?? (p.ownershipType === 'Credit' ? p.supplierCost : undefined),
          purchasingCost:          p.ownershipType === 'Owned'  ? p.costPrice               : undefined,
          // The invoice's payment status â€” which is what "Sold Goods Payment"
          // means. The supplier one stays as a fallback so Credit stock that has
          // not been sold still shows something.
          supplierPaymentStatus:   (serial ? (p as any).serialInvoicePaymentStatus?.[serial] : undefined)
                                   ?? (p.ownershipType === 'Credit' ? p.supplierPaymentStatus : undefined),
          supplierPaidAmount:      p.ownershipType === 'Credit' ? p.supplierPaidAmount      : undefined,
          supplierRemainingAmount: p.ownershipType === 'Credit' && p.supplierCost !== undefined
            ? Math.max(0, (p.supplierCost || 0) - (p.supplierPaidAmount || 0)) : undefined,
          supplierPaymentChannel: p.ownershipType === 'Credit' ? p.supplierPaymentChannel : undefined,
        });
      }
    }
    return rows;
  }

  static isConnected(): boolean { return !!db; }

  static async generateTransactionId(): Promise<string> {
    const now      = new Date();
    const dd       = String(now.getDate()).padStart(2, '0');
    const mm       = String(now.getMonth() + 1).padStart(2, '0');
    const yy       = String(now.getFullYear()).slice(-2);
    const datePart = `${dd}${mm}${yy}`;
    const counterRef = doc(db, 'counters', `inventory_txn_${datePart}`);
    const nextCount = await runTransaction(db, async (txn) => {
      const snap    = await txn.get(counterRef);
      const current = snap.exists() ? (snap.data().count as number) : 0;
      const next    = current + 1;
      txn.set(counterRef, { count: next, date: datePart }, { merge: true });
      return next;
    });
    return `TXN-${datePart}-${String(nextCount).padStart(3, '0')}`;
  }

  static async fetchPayableProducts(): Promise<Product[]> {
    try {
      const all = await InventoryFirebaseService.fetchAllProducts();
      return all.filter(p => p.ownershipType === 'Credit' && (p.supplierPaymentStatus !== 'Cleared' || ((p.supplierCost || 0) - (p.supplierPaidAmount || 0) > 0)));
    } catch (error) {
      console.error('Failed to fetch payable products:', error);
      throw error;
    }
  }

  static async recordSupplierPayment(
    productId: string,
    paidAmount: number,
    channel: PaymentChannel
  ): Promise<void> {
    const product = await InventoryFirebaseService.fetchProductById(productId);
    if (!product) throw new Error('Product not found');
    const newPaidAmount = (product.supplierPaidAmount || 0) + paidAmount;
    const remaining = Math.max(0, (product.supplierCost || 0) - newPaidAmount);
    const status: SupplierPaymentStatus = remaining <= 0 ? 'Cleared' : 'Partial';
    await updateDoc(doc(db, PRODUCTS_COLLECTION, productId), {
      supplierPaidAmount: newPaidAmount,
      supplierRemainingAmount: remaining,
      supplierPaymentStatus: status,
      supplierPaymentChannel: channel,
      updatedAt: new Date().toISOString(),
    });
  }
}

// ==================== TRANSFER SERVICE ====================

export class TransferFirebaseService {

  static async fetchAllTransfers(): Promise<ProductTransfer[]> {
    try {
      const q = query(collection(db, TRANSFERS_COLLECTION), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      const transfers: ProductTransfer[] = [];
      snapshot.forEach(d => transfers.push(transformDocToTransfer(d)));
      return transfers;
    } catch (error) {
      throw new Error('Failed to fetch transfers from Firestore');
    }
  }

  static async fetchTransferById(id: string): Promise<ProductTransfer | null> {
    try {
      const snap = await getDoc(doc(db, TRANSFERS_COLLECTION, id));
      if (!snap.exists()) return null;
      return transformDocToTransfer(snap);
    } catch (error) {
      throw new Error('Failed to fetch transfer from Firestore');
    }
  }

  static async createTransfer(dto: CreateTransferDTO & {
    productName: string; brandName?: string; modelName?: string;
    transferredBy?: string; note?: string;
    receiptName?: string; receiptType?: string; receiptDataUrl?: string;
  }): Promise<ProductTransfer> {
    try {
      const now  = new Date().toISOString();
      const data = stripUndefined({
        productId: dto.productId, productName: dto.productName,
        brandName: dto.brandName, modelName: dto.modelName,
        fromLocation: dto.fromLocation, toLocation: dto.toLocation,
        quantity: dto.quantity, serialNumbers: dto.serialNumbers,
        date: dto.transferDate, transferDate: dto.transferDate,
        status: 'In Transit' as const, transferredBy: dto.transferredBy,
                note: dto.note, notes: dto.notes,
        receiptName: dto.receiptName, receiptType: dto.receiptType,
        receiptDataUrl: dto.receiptDataUrl,
        // Previously omitted, so the cost the user entered on the form was
        // dropped here and never reached Firestore.
        shipmentCost: dto.shipmentCost,
        costPerUnit: dto.costPerUnit,
        transferItems: dto.transferItems,
        createdAt: now,
      });
      const docRef = await addDoc(collection(db, TRANSFERS_COLLECTION), data);
      return transformDocToTransfer(await getDoc(docRef));
    } catch (error) {
      throw new Error('Failed to create transfer in Firestore');
    }
  }

  // `receiverName` was previously never accepted here — the viewModel tried
  // to write it via TransferFirebaseService.updateTransferReceiver(), a
  // method that has never existed on this class. That call (and its
  // catch-block fallback to an equally nonexistent patchTransfer()) used
  // optional chaining, so calling a missing method silently resolved to
  // undefined instead of throwing — the catch block never ran, and the
  // receiver's name typed into the required "Mark as Received" field was
  // discarded on every transfer, with no error shown anywhere. Fixed by
  // accepting it here and writing it in the same update as status.
  //
  // Also removed: this used to independently re-derive and re-write the
  // product's serialCities/location whenever status became 'Received'. Its
  // only caller (useProductTransferViewModel.handleMarkReceived) already
  // performs a more complete product update — serialCities, serialStatus,
  // stockInDate and serialStockInDates — immediately before calling this,
  // so the block here was redundant (an extra read + write recomputing the
  // same cities) and a latent race if two transfers for the same product
  // were ever marked Received close together.
  static async updateTransferStatus(
    id: string,
    status: ProductTransfer['status'],
    receivedAt?: string,
    receiverName?: string,
  ): Promise<void> {
    try {
      const ref = doc(db, TRANSFERS_COLLECTION, id);
      await updateDoc(ref, stripUndefined({
        status, receivedAt, receiverName, updatedAt: new Date().toISOString(),
      }));
    } catch (error) {
      throw new Error('Failed to update transfer status in Firestore');
    }
  }

  static async deleteTransfer(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, TRANSFERS_COLLECTION, id));
    } catch (error) {
      throw new Error('Failed to delete transfer from Firestore');
    }
  }

}

// ==================== BRAND / MODEL SERVICE ====================

export class BrandModelFirebaseService {

  static async fetchAllBrands(): Promise<BrandDoc[]> {
    try {
      const q = query(collection(db, BRANDS_COLLECTION), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      const brands: BrandDoc[] = [];
      snapshot.forEach(d => brands.push(transformDocToBrand(d)));
      return brands;
    } catch (error) {
      throw new Error('Failed to fetch brands from Firestore');
    }
  }

  static async fetchModelsByBrand(brandId: string): Promise<ModelDoc[]> {
    try {
      const q = query(collection(db, MODELS_COLLECTION), where('brandId', '==', brandId));
      const snapshot = await getDocs(q);
      const models: ModelDoc[] = [];
      snapshot.forEach(d => models.push(transformDocToModel(d)));
      models.sort((a, b) => a.name.localeCompare(b.name));
      return models;
    } catch (error) {
      throw new Error('Failed to fetch models from Firestore');
    }
  }

    static async createBrand(name: string): Promise<BrandDoc> {
    try {
      const now  = new Date().toISOString();
      const want = name.trim();
      const key  = want.toLowerCase();

      // Firestore equality is case-sensitive, so "Nokta", "nokta" and "NOKTA"
      // used to become three separate brands â€” each with its own models and
      // its own slice of the stock. Match in memory before creating.
      const snap = await getDocs(collection(db, BRANDS_COLLECTION));
      const existing = snap.docs.find(
        d => String((d.data() as any).name || '').trim().toLowerCase() === key,
      );
      if (existing) {
        const d = existing.data() as any;
        return { id: existing.id, name: d.name || want, createdAt: d.createdAt || '' };
      }

      const docRef = await addDoc(collection(db, BRANDS_COLLECTION), { name: want, createdAt: now });
      return { id: docRef.id, name: want, createdAt: now };
    } catch (error) {
      throw new Error('Failed to create brand in Firestore');
    }
  }
    static async createModel(brandId: string, name: string, costPrice?: number, sellPrice?: number): Promise<ModelDoc> {
    try {
      const now  = new Date().toISOString();
      const want = name.trim();
      const key  = want.toLowerCase();

      // Same case-sensitivity trap as createBrand â€” one equality filter on
      // brandId (which is exact), then match the name in memory.
      const snap = await getDocs(
        query(collection(db, MODELS_COLLECTION), where('brandId', '==', brandId)),
      );
      const existing = snap.docs.find(
        d => String((d.data() as any).name || '').trim().toLowerCase() === key,
      );
      if (existing) {
        const d = existing.data() as any;
        return {
          id: existing.id, name: d.name || want, brandId,
          costPrice: d.costPrice ?? costPrice,
          sellPrice: d.sellPrice ?? sellPrice,
          createdAt: d.createdAt || '',
        };
      }

      const data   = stripUndefined({ name: want, brandId, costPrice, sellPrice, createdAt: now });
      const docRef = await addDoc(collection(db, MODELS_COLLECTION), data);
      return { id: docRef.id, name: want, brandId, costPrice, sellPrice, createdAt: now };
    } catch (error) {
      throw new Error('Failed to create model in Firestore');
    }
  }
  static async saveCostingBrandAndModels(
    brandName: string,
    models: Array<{ modelName: string; costPrice?: number }>
  ): Promise<{ brandId: string; modelIds: string[] }> {
    try {
      const bq    = query(collection(db, BRANDS_COLLECTION), where('name', '==', brandName));
      const bSnap = await getDocs(bq);
      let brandId: string;
      if (!bSnap.empty) { brandId = bSnap.docs[0].id; }
      else { const b = await BrandModelFirebaseService.createBrand(brandName); brandId = b.id; }

      const modelIds: string[] = [];
      for (const m of models) {
        if (!m.modelName.trim()) continue;
        const mq    = query(collection(db, MODELS_COLLECTION), where('brandId', '==', brandId), where('name', '==', m.modelName));
        const mSnap = await getDocs(mq);
        if (!mSnap.empty) { modelIds.push(mSnap.docs[0].id); }
        else { const created = await BrandModelFirebaseService.createModel(brandId, m.modelName, m.costPrice); modelIds.push(created.id); }
      }
      return { brandId, modelIds };
    } catch (error) {
      throw new Error('Failed to save brand and models to Firestore');
    }
  }

  static async fetchModelsByBrandName(
    brandName: string
  ): Promise<Array<{ id: string; modelName: string; costPrice?: number; sellPrice?: number }>> {
    try {
      if (!brandName.trim()) return [];
            // Firestore equality is case-sensitive and has no case-insensitive
      // operator. A brand stored as "Nokta" therefore missed entirely when the
      // user typed "nokta", and the empty result was indistinguishable from
      // "this brand has no models". Read the brand list and match in memory.
      const key   = brandName.trim().toLowerCase();
      const bSnap = await getDocs(collection(db, BRANDS_COLLECTION));
      const match = bSnap.docs.find(
        d => String((d.data() as any).name || '').trim().toLowerCase() === key,
      );
      if (!match) return [];
      const brandId = match.id;
      const mq    = query(collection(db, MODELS_COLLECTION), where('brandId', '==', brandId));
      const mSnap = await getDocs(mq);
      const models: Array<{ id: string; modelName: string; costPrice?: number; sellPrice?: number }> = [];
      mSnap.forEach(d => {
        const data = d.data() as any;
        models.push({ id: d.id, modelName: data.name || '', costPrice: data.costPrice ?? undefined, sellPrice: data.sellPrice ?? undefined });
      });
            models.sort((a, b) => a.modelName.localeCompare(b.modelName));
      return models;
    } catch (error) {
      console.warn('[INV] fetchModelsByBrandName failed for', brandName, error);
      return [];
    }
  }

}
