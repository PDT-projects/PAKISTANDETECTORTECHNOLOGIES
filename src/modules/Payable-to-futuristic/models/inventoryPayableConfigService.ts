// models/inventoryPayableConfigService.ts
// CRUD for the `inventory_payable_configs` Firestore collection.
// Each document maps a productId → fixedAmountAed.
// The bridge reads this collection when an invoice is created.
//
// HARDENED: productId is always trimmed before write/read so that stray
// whitespace can never cause a silent match failure. Debug logs added to
// fetchConfigForProduct so mismatches are visible in the console instead
// of failing silently.
//
// UPDATED: Stores inputCurrency + inputAmount alongside fixedAmountAed
// (which is always in AED) so the Configure tab can display what the user
// originally typed (AED or USD).

import {
  collection, doc, getDocs, addDoc,
  updateDoc, deleteDoc, query, orderBy, where,
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import type {
  InventoryPayableConfig,
  CreateInventoryPayableConfigDTO,
} from './inventoryPayableConfig.types';

const COLLECTION = 'inventory_payable_configs';

function nowISO(): string { return new Date().toISOString(); }

function docToConfig(d: any): InventoryPayableConfig {
  const data = d.data ? d.data() : d;
  return {
    id:             d.id,
    productId:      (data.productId      || '').trim(),
    productName:    data.productName    || '',
    brandName:      data.brandName      || '',
    modelName:      data.modelName      || '',
    fixedAmountAed: data.fixedAmountAed ?? 0,
    inputCurrency:  data.inputCurrency  || 'AED',
    inputAmount:    data.inputAmount    ?? data.fixedAmountAed ?? 0,
    slabs:          Array.isArray(data.slabs) ? data.slabs : [],
    notes:          data.notes          || '',
    createdAt:      data.createdAt      || '',
    updatedAt:      data.updatedAt      || '',
  };
}

// ── Fetch all configs ─────────────────────────────────────────────────────────
export async function fetchAllInventoryPayableConfigs(): Promise<InventoryPayableConfig[]> {
  const q    = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(docToConfig);
}

// ── Fetch config for a specific productId (used by bridge) ───────────────────
export async function fetchConfigForProduct(productId: string): Promise<InventoryPayableConfig | null> {
  const cleanId = (productId || '').trim();

  if (!cleanId) {
    console.warn('[InventoryPayableConfig] fetchConfigForProduct called with empty productId');
    return null;
  }

  const q    = query(collection(db, COLLECTION), where('productId', '==', cleanId));
  const snap = await getDocs(q);

  if (snap.empty) {
    console.log(`[InventoryPayableConfig] No config found for productId="${cleanId}"`);
    return null;
  }

  const config = docToConfig(snap.docs[0]);
  console.log(`[InventoryPayableConfig] Config found for productId="${cleanId}": AED ${config.fixedAmountAed}`);
  return config;
}

// ── Create a new config ───────────────────────────────────────────────────────
export async function createInventoryPayableConfig(
  dto: CreateInventoryPayableConfigDTO
): Promise<InventoryPayableConfig> {
  const cleanId = (dto.productId || '').trim();
  if (!cleanId) throw new Error('productId is required to create a payable config');

  // Prevent duplicates: if config already exists for this productId, update it
  const existing = await fetchConfigForProduct(cleanId);
  if (existing) {
    await updateInventoryPayableConfig(existing.id, {
      fixedAmountAed: dto.fixedAmountAed,
      inputCurrency:  dto.inputCurrency,
      inputAmount:    dto.inputAmount,
      slabs:          dto.slabs ?? [],
      notes:          dto.notes ?? '',
      productName:    dto.productName,
      brandName:      dto.brandName,
      modelName:      dto.modelName,
    });
    return { ...existing, ...dto, productId: cleanId, updatedAt: nowISO() };
  }

  const now  = nowISO();
  const data = {
    productId:      cleanId,
    productName:    dto.productName,
    brandName:      dto.brandName,
    modelName:      dto.modelName,
    fixedAmountAed: dto.fixedAmountAed,
    inputCurrency:  dto.inputCurrency,
    inputAmount:    dto.inputAmount,
    slabs:          dto.slabs ?? [],
    notes:          dto.notes ?? '',
    createdAt:      now,
    updatedAt:      now,
  };
  const ref = await addDoc(collection(db, COLLECTION), data);
  console.log(`[InventoryPayableConfig] Created config for productId="${cleanId}"`);
  return { id: ref.id, ...data };
}

// ── Update a config ───────────────────────────────────────────────────────────
export async function updateInventoryPayableConfig(
  id: string,
  updates: Partial<Omit<InventoryPayableConfig, 'id' | 'createdAt'>>
): Promise<void> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) clean[k] = v;
  }
  await updateDoc(doc(db, COLLECTION, id), { ...clean, updatedAt: nowISO() });
}

// ── Delete a config ───────────────────────────────────────────────────────────
export async function deleteInventoryPayableConfig(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}