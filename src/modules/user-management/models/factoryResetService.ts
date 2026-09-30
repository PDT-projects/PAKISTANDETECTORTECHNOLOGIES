// Factory Reset — wipes every business record and leaves an empty system.
//
// WHAT THIS TOUCHES
// ─────────────────
// Documents only. No code, no rules, no configuration, no Storage files, and
// no Firebase Auth accounts. After a reset the app behaves exactly as before —
// every screen, button and calculation is untouched, there is simply nothing
// in the tables.
//
// WHAT IT DELIBERATELY KEEPS
// ──────────────────────────
//   users              — deleting these locks everyone out of the app,
//                         including the person pressing the button. Their
//                         Firebase Auth login would still work but the app
//                         would have no role or permissions for them, so
//                         every screen would refuse to open. Recovering
//                         means editing Firestore by hand.
//   appConfig/globalCurrency — the Admin's display-currency choice. A genuine
//                         app-level preference, not a business record, and
//                         a fresh system still needs a currency to open in.
//
// appConfig ALSO holds several user-added dropdown lists — inventory
// locations, transfer locations, branches, salesperson names, salesperson
// locations, country/city pairs. These are business data (this company's
// warehouse layout, this company's branch names) wearing a settings-shaped
// document, and were previously lumped in with globalCurrency and skipped
// entirely — a location added by hand would survive every reset and had to
// be deleted by hand too. RESET_CONFIG_DOCS clears exactly these, by name,
// so nothing else under appConfig is touched.
//
// Everything else goes, counters included: leaving invoiceCounters behind
// would make the first new invoice come out as INV-000827 in an empty system.

import {
  collection, getDocs, writeBatch, query, limit, doc, deleteDoc, getDoc,
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';

/** Firestore caps a batch at 500 writes. */
const BATCH_SIZE = 400;

/**
 * appConfig documents that are user-added business lists, not app settings.
 * Cleared by exact id on every reset — appConfig/globalCurrency (and
 * anything else under appConfig this list doesn't name) is left alone.
 */
export const RESET_CONFIG_DOCS: string[] = [
  'inventoryLocations',
  'transferLocations',
  'branches',
  'salespersonLocations',
  'salespersons',
  'countryCities',
];

/**
 * Every collection the app writes to. Kept as one list so a reset can never
 * quietly miss a table — a leftover collection is worse than no reset at all,
 * because the system looks clean while stale rows still feed the reports.
 */
export const RESET_COLLECTIONS: string[] = [
  // ── Transactions & cash ──────────────────────────────────────────────────
  'transactions',
  'deleted_transactions',
  'transactionCounters',
  'cash_transactions',
  'cashInHand',
  'cash_accounts',
  'dynamicCategories',
  'companies',

  // ── Invoices ─────────────────────────────────────────────────────────────
  'invoices',
  'deleted_invoices',
  'invoiceCounters',
  'dummy_invoices',
  'dummy_invoice_counters',
  'customers',
  'salespersons',
  'againstInvoiceEntries',
  'atiCounters',

  // ── Inventory ────────────────────────────────────────────────────────────
  'products',
  'deleted_products',
  'damaged_products',
  'brands',
  'brandModels',
  'transfers',
  'inv_counters',
  'pendingInventoryPayments',

  // ── Banking ──────────────────────────────────────────────────────────────
  'banks',
  'bank_accounts',
  'bank_transactions',
  'bank_transfers',

  // ── Purchased orders ─────────────────────────────────────────────────────
  'purchasedOrders',

  // ── Payable to Futuristic ────────────────────────────────────────────────
  'payable_to_futuristic',
  'inventory_payable_configs',

  // ── People & misc ────────────────────────────────────────────────────────
  'employees',
  'appNotifications',
  'counters',
  'settings',

  // ── Removed modules — rows may still exist from before they were dropped ──
  'bills',
  'loans',
  'salaries',
  'commissions',
];

export interface ResetProgress {
  collection: string;
  deleted: number;
  /** Set when a collection could not be cleared — usually a rules block. */
  error?: string;
}

/**
 * Delete every document in one collection, in batches.
 *
 * Re-queries after each batch rather than paginating with a cursor: documents
 * are disappearing as we go, so a cursor into a shrinking collection skips
 * rows. Asking for "the next 400 that still exist" is slower but leaves
 * nothing behind.
 */
async function wipeCollection(name: string): Promise<ResetProgress> {
  let deleted = 0;
  try {
    for (;;) {
      const snap = await getDocs(query(collection(db, name), limit(BATCH_SIZE)));
      if (snap.empty) break;

      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;

      // A short pause keeps a large wipe from tripping Firestore's write limits.
      if (snap.size === BATCH_SIZE) await new Promise(r => setTimeout(r, 120));
    }
    return { collection: name, deleted };
  } catch (err: any) {
    // One blocked collection must not abandon the rest. Several collections
    // have no security rule of their own and fall under the default deny, so
    // a permission error here is expected rather than exceptional.
    return {
      collection: name,
      deleted,
      error: String(err?.code || err?.message || err),
    };
  }
}

/**
 * Delete one appConfig document by id. Unlike wipeCollection this removes a
 * single, named document — used for the business-data lists that live under
 * appConfig alongside settings that must survive the reset.
 */
async function wipeConfigDoc(id: string): Promise<ResetProgress> {
  try {
    await deleteDoc(doc(db, 'appConfig', id));
    return { collection: `appConfig/${id}`, deleted: 1 };
  } catch (err: any) {
    // Missing doc (nothing was ever added) is not an error — same outcome as
    // a successful clear, just nothing to remove.
    if (err?.code === 'not-found') return { collection: `appConfig/${id}`, deleted: 0 };
    return {
      collection: `appConfig/${id}`,
      deleted: 0,
      error: String(err?.code || err?.message || err),
    };
  }
}

/**
 * Clear just the custom-list documents (RESET_CONFIG_DOCS), without
 * touching any business collection. For clearing out locations/branches/etc
 * added before this fix existed, without running a full factory reset.
 */
export async function clearCustomLists(
  onProgress?: (p: ResetProgress, index: number, total: number) => void,
): Promise<ResetProgress[]> {
  const results: ResetProgress[] = [];
  for (let i = 0; i < RESET_CONFIG_DOCS.length; i++) {
    const result = await wipeConfigDoc(RESET_CONFIG_DOCS[i]);
    results.push(result);
    onProgress?.(result, i + 1, RESET_CONFIG_DOCS.length);
  }
  return results;
}

/**
 * Wipe every collection in RESET_COLLECTIONS, then clear the business-data
 * documents named in RESET_CONFIG_DOCS.
 *
 * Sequential on purpose. Firing forty collection wipes at once would hit
 * Firestore's per-second write cap, and the retries make a large reset slower
 * than doing it in order.
 *
 * @param onProgress called after each collection so the UI can show movement —
 *                   a reset of a busy system takes a while and a frozen screen
 *                   invites a page refresh mid-delete.
 */
export async function factoryReset(
  onProgress?: (p: ResetProgress, index: number, total: number) => void,
): Promise<ResetProgress[]> {
  const results: ResetProgress[] = [];
  const total = RESET_COLLECTIONS.length + RESET_CONFIG_DOCS.length;

  for (let i = 0; i < RESET_COLLECTIONS.length; i++) {
    const name = RESET_COLLECTIONS[i];
    const result = await wipeCollection(name);
    results.push(result);
    onProgress?.(result, i + 1, total);
  }

  for (let i = 0; i < RESET_CONFIG_DOCS.length; i++) {
    const result = await wipeConfigDoc(RESET_CONFIG_DOCS[i]);
    results.push(result);
    onProgress?.(result, RESET_COLLECTIONS.length + i + 1, total);
  }

  return results;
}

/** Rows found per collection, so the user sees what is about to go. */
export async function countAllRecords(): Promise<{ total: number; perCollection: Record<string, number> }> {
  const perCollection: Record<string, number> = {};
  let total = 0;

  for (const name of RESET_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, name));
      if (snap.size > 0) {
        perCollection[name] = snap.size;
        total += snap.size;
      }
    } catch {
      // Unreadable collection — skipped in the count. The wipe will report it.
    }
  }

  for (const id of RESET_CONFIG_DOCS) {
    try {
      const snap = await getDoc(doc(db, 'appConfig', id));
      if (snap.exists()) {
        const list = (snap.data()?.list as unknown[]) || [];
        if (list.length > 0) {
          perCollection[`appConfig/${id}`] = list.length;
          total += list.length;
        }
      }
    } catch {
      // Unreadable doc — skipped in the count, same as an unreadable collection above.
    }
  }

  return { total, perCollection };
}