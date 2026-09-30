// BrandModelService.ts
// Manages brands and models in Firestore.
// Collections: `brands` + `brandModels`
//
// ⚠️  IF BRANDS ARE MISSING (e.g. only "Hh" shows up):
//     Your Firestore already has stale data so seedIfEmpty() skips re-seeding.
//     Fix: call forceReseed() ONCE from a dev button or temporary useEffect:
//
//       import { forceReseed } from '../models/BrandModelService';
//       await forceReseed();   // wipes brands + brandModels, writes all 33
//
//     Remove the call after it runs — it is destructive.

import {
  collection, getDocs, getDoc, addDoc, doc, updateDoc,
  query, orderBy, where, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface BrandModel {
  id:     string;
  name:   string;
  models: ModelEntry[];
}

/**
 * A model under a brand.
 *
 * The profile fields below are the reason "Description doesn't fetch when I add
 * the same product again": this interface used to stop at costPrice/sellPrice,
 * and fetchBrands() mapped exactly those two off the Firestore doc. So prices
 * came back and nothing else could, no matter what was stored.
 *
 * WHAT BELONGS HERE: facts about the PRODUCT that survive a restock.
 * WHAT DOESN'T: serial numbers, quantity, stock-in date, ownership type,
 * supplier payment state — those describe a BATCH and must stay blank on a new
 * entry.
 */
export interface ModelEntry {
  id:         string;
  brandId:    string;
  name:       string;
  costPrice?: number;
  sellPrice?: number;

  // ── Product profile ────────────────────────────────────────────────────
  category?:      string;
  description?:   string;
  warrantyYears?: number;
  buyType?:       string;
  location?:      string;
  /** ISO timestamp of the purchase that last refreshed costPrice. */
  lastCostAt?:    string;
}

/** The profile slice written back after a product saves. */
export interface ModelProfileInput {
  category?:      string;
  description?:   string;
  costPrice?:     number;
  sellPrice?:     number;
  warrantyYears?: number;
  buyType?:       string;
  location?:      string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection names
// ─────────────────────────────────────────────────────────────────────────────

const BRANDS_COL = 'brands';
const MODELS_COL = 'brandModels';

// ─────────────────────────────────────────────────────────────────────────────
// Master seed — 33 brands, complete model lists
// ─────────────────────────────────────────────────────────────────────────────

export const SEED_BRANDS: { name: string; models: string[] }[] = [
  { name: 'AKA',                            models: ['Signum HM', 'AKA Signum MFD', 'AKA-SIGNUM Coil 15"', 'HF RANDOM', 'AKA INTRONIKA', 'Smart Pulse'] },
  { name: 'AS DETECTORS',                   models: ['Multi max'] },
  { name: 'Andralian',                      models: ['Andralian'] },
  { name: 'Black Dog Xtreme',               models: ['Black Dog'] },
  { name: 'Bounty Hunter VLF',              models: ['Bounty Hunter'] },
  { name: 'China',                          models: ['GDX 8000', 'Gold Hunter', 'TIANXUN', 'VRP 1000'] },
  { name: 'DHFHJ',                          models: ['Armest * 17'] },
  { name: 'Detector',                       models: ['Metal Detector'] },
  { name: 'Detek',                          models: ['Detek Coil'] },
  { name: 'EKibi',                          models: ['EKIBI T1', 'Ekibi VLF DETECTOR', 'EKIBI M1', 'EKIBI EMF System'] },
  { name: 'Fisher',                         models: ['Fisher f75', 'Fisher F11', 'Fisher F22', 'F44', 'Fisher F44', 'Fisher GOLDBUG'] },
  { name: 'GEOGROUND',                      models: ['Gold Legend'] },
  { name: 'GOLD XTRA',                      models: ['GOLD XTRA GX', 'GOLD XTRA TGX PRO', 'GOLD XTRA TGX LITE', 'GOLD XTRA TGX PRO PLUS', 'GOLD XTRA REVEALER', 'Unveiler'] },
  { name: 'GTR TURKEY',                     models: ['GTR TURKEY'] },
  { name: 'Garrett',                        models: ['Garrett Metal Detector 400i', 'Garrett Metal Detector-AT Gold', 'Garrett Metal Detector- Pro Pointer AT', 'Garrett Metal Detector-300i', 'Garrett Metal Detector-2500', 'Garrett Ace Apex', 'Garrett Paining Kit', 'Gold Master 24k', 'Garrett Metal Detector 200i', 'Apex', 'Garrett 200i', 'Garrett 400i'] },
  { name: 'Gold Star',                      models: ['GOLD STAR GT-18 Accessories', 'GOLD STAR GT 18'] },
  { name: 'Gold Stinger X5',               models: ['Gold Stinger X5'] },
  { name: 'Hira Dedector',                  models: ['GTR'] },
  { name: 'JOKER',                          models: ['Joker X2'] },
  { name: 'Lorenz',                         models: ['Lorenz Deepmax Z1', 'Lorenz Deepmax Z2'] },
  { name: 'Minelab',                        models: ['Minelab GPX Coil', 'Minelab Gold Monster 1000', 'GPX 5000', 'SDC 2300'] },
  { name: 'Multimax',                       models: ['Multimax'] },
  { name: 'Nokta',                          models: ['Simplex', 'Mini Hoard', 'Au Gold Finder Controller', 'C45 Coil', 'CF 77', 'Gold Kruzer', 'Gold Racer', 'Impact Pro', 'Jeo Hunter 3D', 'Racer 2', 'Pinpointer PulseDive', 'Pointer', 'Premium Gold Digger', 'Scuba Coil', 'REPLACEABLE SCUBA COIL UNIT BLACK -PD', 'Simplex BT', 'Simplex Ultra', 'T44 Search Coil', 'TMD101', 'Wireless Head Phones', 'Simplex Lite', 'Simplex Plus', 'Nokta FindX', 'Nokta FindX Pro', 'Nokta Score', 'Nokta Score 3 ProPack', 'IM45 Coil', 'The Legend', 'PIMAX', 'Triple Score', 'Accu Pointer'] },
  { name: 'Nokta Makro',                    models: ['NOKTA Mini Hoard', 'NOkTA Au Gold Finder Controller', 'The legend', 'Nokta Simplex Plus', 'Triple Score', 'Nokta Impact Pro', 'Score'] },
  { name: 'OKM',                            models: ['OKM EXP 6000 PROFESSIONAL PLUS', 'OKM Water Detector', 'Okm Detta Ranger Professional Plus', 'OkM Delta Ranger Professional'] },
  { name: 'OKM EXP 6000 PROFESSIONAL PLUS', models: [] },
  { name: 'PMX',                            models: ['PMX GOLD', 'Pimax Expert Multi'] },
  { name: 'Quest',                          models: ['Quest Pinpointer', 'Quest Q35', 'Quest Scuba', 'Quest V80', 'Quest X5', 'Quest V60', 'Quest X10Pro', 'X10 ID Maxx', 'X5 ID Maxx', 'Quest Xpointer Maxx'] },
  { name: 'Reaper 2',                       models: ['Reaper 2'] },
  { name: 'Super Wand',                     models: ['Hand-Held Secutiry Detector'] },
  { name: 'Teknetics',                      models: ['Teknetics Alpha', 'Teknetics Delta', 'Teknetics Eurotek', 'Teknetics Eurotek Pro', 'Teknetics G2+', 'Teknetics T2', 'Alpha'] },
  { name: 'WHITES',                         models: ['WHITES SUPER GMT', 'WHITES TM 808'] },
  { name: 'X5 ID Maxx',                     models: [] },
  { name: 'XP',                             models: ['ORX CHARGER', 'WS5 Head Phones', 'XP DEUS', 'XP Deus 13"', 'XP Dues II', 'XP Gold Batea Kit', 'XP Gold Prospecting Sluice', 'XP HF 5" Coil', 'XP PANNING KIT', 'XP-GMAXXX II', 'XP- Gmaxx II', 'XP-Gmaxx Power', 'XP-MI-4', 'XP-ORX', 'XP Dues Control Unit', 'XP Sluice'] },
  { name: 'Practice',                       models: ['Testing Model', 'EvenTracking'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function deleteCollection(colName: string): Promise<void> {
  const snap = await getDocs(collection(db, colName));
  if (snap.empty) return;
  let batch = writeBatch(db);
  let n = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    n++;
    if (n >= 490) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n > 0) await batch.commit();
}

async function writeSeedData(): Promise<void> {
  let batch = writeBatch(db);
  let n = 0;

  const flush = async () => {
    if (n > 0) { await batch.commit(); batch = writeBatch(db); n = 0; }
  };

  for (const brand of SEED_BRANDS) {
    const brandRef = doc(collection(db, BRANDS_COL));
    batch.set(brandRef, { name: brand.name, createdAt: serverTimestamp() });
    n++;
    for (const modelName of brand.models) {
      const modelRef = doc(collection(db, MODELS_COL));
      batch.set(modelRef, { brandId: brandRef.id, name: modelName, createdAt: serverTimestamp() });
      n++;
      if (n >= 490) await flush();
    }
  }
  await flush();
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  forceReseed — DESTRUCTIVE. Call once to fix stale Firestore data.
//     After running, remove the call from your code.
// ─────────────────────────────────────────────────────────────────────────────

let _seeded = false;

export async function forceReseed(): Promise<void> {
  console.log('⚠️  forceReseed: clearing brands & brandModels…');
  await Promise.all([
    deleteCollection(BRANDS_COL),
    deleteCollection(MODELS_COL),
  ]);
  _seeded = false;
  console.log('🌱 Writing all 33 brands…');
  await writeSeedData();
  _seeded = true;
  console.log('✅ forceReseed done — reload the page');
}

// ─────────────────────────────────────────────────────────────────────────────
// seedIfEmpty — normal startup path
// ─────────────────────────────────────────────────────────────────────────────

async function seedIfEmpty(): Promise<void> {
  if (_seeded) return;
  const snap = await getDocs(collection(db, BRANDS_COL));
  if (!snap.empty) { _seeded = true; return; }
  console.log('🌱 First run — seeding brands…');
  await writeSeedData();
  _seeded = true;
  console.log('✅ Seed complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchBrands(): Promise<BrandModel[]> {
  await seedIfEmpty();

  const [brandsSnap, modelsSnap] = await Promise.all([
    getDocs(query(collection(db, BRANDS_COL), orderBy('name'))),
    getDocs(query(collection(db, MODELS_COL), orderBy('name'))),
  ]);

  const modelsMap: Record<string, ModelEntry[]> = {};
  modelsSnap.docs.forEach(d => {
    const m = d.data() as any;
    if (!modelsMap[m.brandId]) modelsMap[m.brandId] = [];
    modelsMap[m.brandId].push({
      id: d.id, brandId: m.brandId, name: m.name,
      costPrice: m.costPrice, sellPrice: m.sellPrice,
      // Carry the whole profile through. Anything not mapped here is invisible
      // to the UI regardless of what Firestore holds — that was the bug.
      category:      m.category,
      description:   m.description,
      warrantyYears: m.warrantyYears,
      buyType:       m.buyType,
      location:      m.location,
      lastCostAt:    m.lastCostAt,
    });
  });

  return brandsSnap.docs.map(d => ({
    id:     d.id,
    name:   (d.data() as any).name,
    models: modelsMap[d.id] ?? [],
  }));
}

export async function addBrand(name: string): Promise<BrandModel> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Brand name cannot be empty');
  const ref = await addDoc(collection(db, BRANDS_COL), { name: trimmed, createdAt: serverTimestamp() });
  return { id: ref.id, name: trimmed, models: [] };
}

export async function addModel(brandId: string, modelName: string): Promise<ModelEntry> {
  const trimmed = modelName.trim();
  if (!trimmed) throw new Error('Model name cannot be empty');
  if (!brandId)  throw new Error('brandId is required');
  const ref = await addDoc(collection(db, MODELS_COL), { brandId, name: trimmed, createdAt: serverTimestamp() });
  return { id: ref.id, brandId, name: trimmed };
}

export async function updateModelPrices(modelId: string, costPrice: number, sellPrice: number): Promise<void> {
  await updateDoc(doc(db, MODELS_COL, modelId), { costPrice, sellPrice });
}

/**
 * Persist the product profile onto a model doc. Call AFTER a product saves, so
 * the next entry of the same brand + model prefills from it.
 *
 * This is the write half that never existed: addModel() stores only the name,
 * and updateModelPrices() only the two prices, so Description and Type had
 * nowhere to live between entries.
 *
 * Empty/undefined values are dropped rather than written, so a blank field on
 * one entry can't erase a good value saved earlier.
 *
 * Never throws — profile bookkeeping must not fail the save that triggered it.
 */
export async function updateModelProfile(
  modelId: string,
  profile: ModelProfileInput,
): Promise<void> {
  if (!modelId) return;
  try {
    const now = new Date().toISOString();
    const body: Record<string, any> = {};

    if (profile.category)             body.category      = profile.category;
    if (profile.description)          body.description   = profile.description;
    if (profile.sellPrice)            body.sellPrice     = profile.sellPrice;
    if (profile.warrantyYears != null) body.warrantyYears = profile.warrantyYears;
    if (profile.buyType)              body.buyType       = profile.buyType;
    if (profile.location)             body.location      = profile.location;
    // Cost is refreshed but timestamped, so the form can offer it as a visible
    // "last paid X on Y" prompt rather than a silent default. Purchase cost
    // genuinely moves between restocks, and a stale one accepted unnoticed
    // corrupts COGS on every entry.
    if (profile.costPrice != null) { body.costPrice = profile.costPrice; body.lastCostAt = now; }

    if (Object.keys(body).length === 0) return;
    body.updatedAt = now;

    await updateDoc(doc(db, MODELS_COL, modelId), body);
    console.log('✅ Model profile saved:', modelId);
  } catch (err) {
    console.error('[BrandModelService] updateModelProfile failed:', err);
  }
}

/**
 * Merge a model's profile into form state WITHOUT clobbering anything already
 * typed. Pure function — no React, no Firestore.
 *
 * The lookup that produces `model` is async, so the user can easily be typing a
 * Description while it is still in flight; overwriting that would be worse than
 * not prefilling at all. Only blank fields get written.
 *
 * costPrice is deliberately NOT applied — surface `model.costPrice` +
 * `model.lastCostAt` as a hint beside the field instead.
 */
export function applyModelProfile<T extends Record<string, any>>(
  form: T,
  model: ModelEntry | null | undefined,
  fieldMap: ModelProfileFieldMap = {},
): T {
  if (!model) return form;
  const next: Record<string, any> = { ...form };

  Object.assign(next, modelProfilePatch(form, model, fieldMap));

  return next as T;
}

/**
 * Same merge rule as applyModelProfile, but returns ONLY the fields that would
 * change, rather than a whole new form object.
 *
 * CreateInventoryView is the reason this exists. That view holds no form object
 * of its own — it receives the ViewModel's generic `setField(name, value)` and
 * nothing else — so it cannot use the whole-object version above. It needs a
 * list of writes to perform.
 *
 * Returns {} when there is nothing to apply, so callers can skip the writes
 * entirely and avoid pointless re-renders.
 *
 * costPrice is deliberately excluded here, exactly as in applyModelProfile:
 * purchase cost genuinely moves between restocks, and a stale one accepted
 * unnoticed corrupts COGS on every entry. Surface `model.costPrice` +
 * `model.lastCostAt` as a visible hint instead of writing it.
 */
/**
 * Maps a profile field onto a DIFFERENTLY NAMED field on the target form.
 *
 * This exists because MultiModelEntry calls the stocking location
 * `stockingLocation`, not `location`. applyModelProfile() writes `location`
 * unconditionally, so on the multi-model grid it has always been writing a key
 * nothing reads — the value lands on the object and the input, bound to
 * `stockingLocation`, never shows it.
 */
export type ModelProfileFieldMap = Partial<Record<ModelProfileField, string>>;

export type ModelProfileField =
  'category' | 'description' | 'sellPrice' | 'warrantyYears' | 'buyType' | 'location';

const PROFILE_FIELDS: ModelProfileField[] =
  ['category', 'description', 'sellPrice', 'warrantyYears', 'buyType', 'location'];

export function modelProfilePatch<T extends Record<string, any>>(
  form: T,
  model: ModelEntry | null | undefined,
  fieldMap: ModelProfileFieldMap = {},
): Partial<T> {
  if (!model) return {};
  const blank = (v: any) => v === undefined || v === null || v === '' || v === 0;
  const patch: Record<string, any> = {};
  const skipped: string[] = [];

  for (const field of PROFILE_FIELDS) {
    const target = fieldMap[field] ?? field;
    const incoming = (model as any)[field];
    if (!incoming) { skipped.push(`${field}=empty`); continue; }
    if (!blank(form[target])) { skipped.push(`${target}=already-set`); continue; }
    patch[target] = incoming;
  }

  // Left in deliberately. This feature fails silently by nature — a field that
  // does not fill looks identical whether the profile was missing, the value
  // was empty, or the form already held something. One line in the console
  // distinguishes all three without a debugger.
  console.debug('[BrandModelService] modelProfilePatch', {
    model: model.name, applied: patch, skipped,
  });

  return patch as Partial<T>;
}

// ═══════════════════════════════════════════════════════════════════════════
// NAME-BASED PROFILE API
// ═══════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS
// ---------------
// updateModelProfile() / applyModelProfile() above both key off a Firestore
// model doc id. The multi-model inventory flow never captures one — it carries
// brand and model NAMES only — so those two are unusable from there.
//
// Everything below takes names instead and resolves the id internally. Same
// storage, same docs, no schema difference; only the entry point changes.
//
// Matching is trimmed and case-insensitive throughout, so "GoldXtra" typed on
// one entry and "goldxtra" on the next still resolve to the same model.

const PRODUCTS_COL = 'products';

/** Trimmed, case-insensitive comparison key. */
const nameKey = (v: string): string => (v || '').trim().toLowerCase();

/**
 * Resolve a brand + model name pair to its Firestore model doc id.
 * Returns null when the pair doesn't exist yet.
 */
export async function resolveModelId(
  brandName: string,
  modelName: string,
): Promise<string | null> {
  if (!nameKey(brandName) || !nameKey(modelName)) return null;
  try {
    // Brand first. Fetched by exact name, then re-checked case-insensitively,
    // because Firestore equality filters are case-SENSITIVE and the brand may
    // have been stored with different casing than the user just typed.
    const brandsSnap = await getDocs(collection(db, BRANDS_COL));
    const brandDoc = brandsSnap.docs.find(
      d => nameKey((d.data() as any).name) === nameKey(brandName),
    );
    if (!brandDoc) return null;

    // Then the model under that brand. One equality filter only — adding a
    // second would need a composite index, and a missing index fails the query
    // outright at runtime rather than degrading.
    const modelsSnap = await getDocs(query(
      collection(db, MODELS_COL), where('brandId', '==', brandDoc.id),
    ));
    const modelDoc = modelsSnap.docs.find(
      d => nameKey((d.data() as any).name) === nameKey(modelName),
    );
    return modelDoc ? modelDoc.id : null;
  } catch (err) {
    console.error('[BrandModelService] resolveModelId failed:', err);
    return null;
  }
}

/**
 * Persist a product profile using brand + model NAMES. Call after a product
 * saves successfully.
 *
 * Never throws — profile bookkeeping must not fail the save that triggered it.
 */
export async function saveModelProfileByName(
  brandName: string,
  modelName: string,
  profile: ModelProfileInput,
): Promise<void> {
  const b = (brandName || '').trim();
  const m = (modelName || '').trim();
  if (!b || !m) return;

  try {
    // ── Resolve or CREATE the brand ────────────────────────────────────────
    // This function used to bail with a warning when the pair had no docs yet,
    // which meant any brand or model the user typed fresh — the common case on
    // a first entry — saved nothing at all. Silently. The product itself was
    // stored fine, so nothing looked wrong until the next entry failed to
    // prefill. Create what's missing instead.
    const brandsSnap = await getDocs(collection(db, BRANDS_COL));
    let brandDoc = brandsSnap.docs.find(
      d => nameKey((d.data() as any).name) === nameKey(b),
    );
    let brandId: string;
    if (brandDoc) {
      brandId = brandDoc.id;
    } else {
      const ref = await addDoc(collection(db, BRANDS_COL), {
        name: b, createdAt: serverTimestamp(),
      });
      brandId = ref.id;
      console.log(`[BrandModelService] created brand "${b}"`);
    }

    // ── Resolve or CREATE the model ────────────────────────────────────────
    const modelsSnap = await getDocs(query(
      collection(db, MODELS_COL), where('brandId', '==', brandId),
    ));
    const modelDoc = modelsSnap.docs.find(
      d => nameKey((d.data() as any).name) === nameKey(m),
    );

    const now  = new Date().toISOString();
    const body: Record<string, any> = {};
    if (profile.category)              body.category      = profile.category;
    if (profile.description)           body.description   = profile.description;
    if (profile.sellPrice)             body.sellPrice     = profile.sellPrice;
    if (profile.warrantyYears != null) body.warrantyYears = profile.warrantyYears;
    if (profile.buyType)               body.buyType       = profile.buyType;
    if (profile.location)              body.location      = profile.location;
    if (profile.costPrice != null) { body.costPrice = profile.costPrice; body.lastCostAt = now; }
    body.updatedAt = now;

    if (modelDoc) {
      await updateDoc(doc(db, MODELS_COL, modelDoc.id), body);
      console.log(`✅ [BrandModelService] profile saved on model "${m}" (${modelDoc.id})`, body);
    } else {
      const ref = await addDoc(collection(db, MODELS_COL), {
        brandId, name: m, createdAt: serverTimestamp(), ...body,
      });
      console.log(`✅ [BrandModelService] created model "${m}" with profile (${ref.id})`, body);
    }
  } catch (err) {
    console.error('[BrandModelService] saveModelProfileByName failed:', err);
  }
}

/**
 * Everything known about a brand + model pair, for prefilling a form.
 * Returns null when the pair has never been entered before.
 *
 * THE PRODUCT FALLBACK IS THE IMPORTANT PART. Every model doc you already have
 * predates the profile fields, so reading the doc alone returns nothing until
 * each product has been re-saved once. Any gap is therefore filled from the
 * most recent Product with the same brand + model — and those already carry
 * description, category and warrantyYears. Prefill works on existing data
 * immediately: no migration, no backfill, no "save it once first".
 */
export async function fetchModelProfileByName(
  brandName: string,
  modelName: string,
): Promise<ModelEntry | null> {
  if (!nameKey(brandName) || !nameKey(modelName)) return null;

  const compact = (o: Record<string, any>): Record<string, any> =>
    Object.fromEntries(Object.entries(o).filter(
      ([, v]) => v !== undefined && v !== null && v !== '',
    ));

  // (a) The model doc.
  let fromModel: Record<string, any> = {};
  let modelId = '';
  let brandId = '';
  try {
    const id = await resolveModelId(brandName, modelName);
    if (id) {
      modelId = id;
      // Was: where('__name__', '==', id). The Firebase JS SDK expects a
      // DocumentReference or a full path for __name__ comparisons, not a bare
      // id string — so that query returned nothing every time and the model
      // doc's profile was silently never read. getDoc is the correct call.
      const snap = await getDoc(doc(db, MODELS_COL, id));
      const m = snap.exists() ? (snap.data() as any) : null;
      if (m) {
        brandId = m.brandId || '';
        fromModel = compact({
          category:      m.category,
          description:   m.description,
          sellPrice:     m.sellPrice,
          costPrice:     m.costPrice,
          warrantyYears: m.warrantyYears,
          buyType:       m.buyType,
          location:      m.location,
          lastCostAt:    m.lastCostAt,
        });
      }
    }
  } catch (err) {
    console.error('[BrandModelService] model read failed:', err);
  }

  // (b) Fallback: newest Product with the same brand + model.
    // (b) Fallback: newest Product with the same brand + model.
  //
  // This reads EVERY product of the brand and filters in memory. On a brand
  // with 40 products that is 40 documents — and loadModels used to call this
  // once per model, so a 6-model brand pulled 240 documents on every lookup.
  // It only exists for records saved before model profiles were written, so
  // skip it entirely once the model doc already answered.
  let fromProduct: Record<string, any> = {};
  const modelDocIsComplete =
    fromModel.category !== undefined && fromModel.description !== undefined;
  if (modelDocIsComplete) {
    return { id: modelId, brandId, name: modelName.trim(), ...fromModel } as ModelEntry;
  }
  try {
       const snap = await getDocs(query(
      collection(db, PRODUCTS_COL), where('brandName', '==', brandName.trim()),
    ));
    const newest = snap.docs
      .map(d => d.data() as any)
      .filter(p => nameKey(p.modelName) === nameKey(modelName))
      .sort((a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
    if (newest) {
      fromProduct = compact({
        category:      newest.category,
        description:   newest.description,
        sellPrice:     newest.sellPrice,
        costPrice:     newest.costPrice,
        warrantyYears: newest.warrantyYears,
        buyType:       newest.buyType,
        location:      newest.location,
        lastCostAt:    newest.createdAt,
      });
    }
  } catch (err) {
    console.error('[BrandModelService] product fallback failed:', err);
  }

  const merged = { ...fromProduct, ...fromModel };
  if (Object.keys(merged).length === 0) return null;

  return {
    id: modelId, brandId, name: modelName.trim(), ...merged,
  } as ModelEntry;
}

/**
 * Pure helper for the read side when brands are already loaded in memory.
 * Avoids a round-trip when fetchBrands() output is already on hand.
 */
export function findModelByName(
  brands: BrandModel[],
  brandName: string,
  modelName: string,
): ModelEntry | null {
  const brand = brands.find(b => nameKey(b.name) === nameKey(brandName));
  if (!brand) return null;
  return brand.models.find(m => nameKey(m.name) === nameKey(modelName)) ?? null;
}
/**
 * Every distinct description previously saved for a brand (+ model), newest
 * first, for the Description dropdown.
 *
 * Prefers descriptions written against the exact brand + model. When that pair
 * has none, it falls back to every description under the brand — a new model
 * from a familiar brand usually reuses the same boilerplate, and offering it is
 * more useful than an empty list.
 *
 * Blank descriptions are dropped, so products saved with an empty Description
 * field never appear as an empty row in the dropdown.
 *
 * Never throws — a failed lookup returns [] and the field degrades to plain
 * free text.
 */
export async function fetchSavedDescriptions(
  brandName: string,
  modelName?: string,
): Promise<string[]> {
  const brand = (brandName || '').trim();
  if (!brand) return [];

  try {
    const snap = await getDocs(query(
      collection(db, PRODUCTS_COL), where('brandName', '==', brand),
    ));

    const rows = snap.docs
      .map(d => d.data() as any)
      .filter(p => typeof p.description === 'string' && p.description.trim() !== '');

    const model    = nameKey(modelName || '');
    const forModel = model ? rows.filter(p => nameKey(p.modelName) === model) : [];
    const pool     = forModel.length > 0 ? forModel : rows;

    pool.sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const seen: Set<string> = new Set();
    const out: string[] = [];
    for (const p of pool) {
      const text = String(p.description).trim();
      const key  = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
      if (out.length >= 25) break;
    }

    console.debug('[BrandModelService] fetchSavedDescriptions', {
      brand, model: modelName, found: out.length, scopedToModel: forModel.length > 0,
    });
    return out;
  } catch (err) {
    console.error('[BrandModelService] fetchSavedDescriptions failed:', err);
    return [];
  }
}