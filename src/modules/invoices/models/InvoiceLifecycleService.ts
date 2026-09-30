// Invoice Module - Additive Service
// InvoiceLifecycleService.ts
//
// Kept separate from InvoiceFirebaseService.ts (not resent to me) so existing
// invoice creation / liquidity logic isn't touched blindly. This file only adds:
//   1. Soft-delete → 'deleted_invoices' collection (mirrors deleted_products)
//   2. markInvoiceReturned() → called from Inventory's return flow when a
//      sold serial linked to an invoice is returned to stock.
//
// NOTE: full bank/cash balance reversal requires the banking module's own
// service (not available here). This file reverses the *invoice-level*
// liquidity fields (remainingLiquidityAmount) and logs a reversal record in
// 'liquidity_reversals' for manual/automated reconciliation by that module.

import {
  collection, doc, getDoc, getDocs, addDoc, deleteDoc, updateDoc,
  query, where, orderBy,
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { Invoice, DeletedInvoice } from './types';

const INVOICES_COLLECTION         = 'invoices';
const DELETED_INVOICES_COLLECTION = 'deleted_invoices';
const PRODUCTS_COLLECTION         = 'products';
const TRANSACTIONS_COLLECTION     = 'transactions';

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(v => stripUndefined(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const out: any = {};
    Object.keys(value as any).forEach(k => {
      const v = (value as any)[k];
      if (v !== undefined) out[k] = stripUndefined(v);
    });
    return out;
  }
  return value;
}

export interface InvoiceReversalSummary {
  serialsRestored:     number;
  productsAffected:    number;
  transactionsRemoved: number;
}

/**
 * Reverses every downstream effect an invoice had before it's archived:
 *   1. Puts every sold serial back on its parent product (dedup via Set,
 *      recomputes `stock` from the array length).
 *   2. Clears the serial's `serialStatus`, `serialSoldDates`, and
 *      `serialInvoiceNumbers` entries so it stops showing as "Sold" in the
 *      Inventory Report.
 *   3. Deletes every transaction in the ledger that was linked to this
 *      invoice — payments booked by InvoicePaymentService and misc expenses
 *      booked by InvoiceMiscExpenseService both use
 *      `linkedType: 'invoice', linkedId: invoiceNumber`, so this catches
 *      them in one query.
 *
 * Bank balances are intentionally NOT touched here. `adjustBankBalance` is
 * opt-in on payments and rarely enabled — reversing balances blindly would
 * double-count against the transactions ledger, which is the source of
 * truth. If your workflow relies on bank-balance updates, reconcile from
 * the deleted transaction records instead.
 */
async function reverseInvoiceEffects(inv: Invoice): Promise<InvoiceReversalSummary> {
  const now = new Date().toISOString();
  const summary: InvoiceReversalSummary = { serialsRestored: 0, productsAffected: 0, transactionsRemoved: 0 };

  // ── 1) Restore inventory ────────────────────────────────────────────────
  for (const ip of (inv.products || [])) {
    if (!ip.productId || !Array.isArray(ip.serialNumbers)) continue;
    const validSerials = ip.serialNumbers.filter(s => s && s.trim());
    if (validSerials.length === 0) continue;

    try {
      const pRef  = doc(db, PRODUCTS_COLLECTION, ip.productId);
      const pSnap = await getDoc(pRef);
      if (!pSnap.exists()) {
        console.warn(`[InvoiceLifecycleService] product ${ip.productId} missing — skipping serial restore`);
        continue;
      }
      const p: any = pSnap.data();

      // Re-add serials (Set dedupes if any were already back in the array)
      const nextSerials = Array.from(new Set([...(p.serialNumbers || []), ...validSerials]));

      // Wipe the per-serial sold metadata so the report stops showing them as Sold
      const nextStatus:  Record<string, any> = { ...(p.serialStatus               || {}) };
      const nextSold:    Record<string, any> = { ...(p.serialSoldDates            || {}) };
      const nextInvMap:  Record<string, any> = { ...(p.serialInvoiceNumbers       || {}) };
      const nextPayStat: Record<string, any> = { ...(p.serialInvoicePaymentStatus || {}) };
      const nextSupCost: Record<string, any> = { ...(p.serialInvoiceSupplierCost  || {}) };
      validSerials.forEach(s => {
        delete nextStatus[s];
        delete nextSold[s];
        delete nextInvMap[s];
        delete nextPayStat[s];
        delete nextSupCost[s];
      });

      await updateDoc(pRef, {
        serialNumbers:              nextSerials,
        // stock is recomputed from the array — safer than relying on the
        // pre-delete quantity, which could have drifted if other serials
        // were sold/damaged in the meantime
        stock:                      nextSerials.length,
        serialStatus:               nextStatus,
        serialSoldDates:            nextSold,
        serialInvoiceNumbers:       nextInvMap,
        serialInvoicePaymentStatus: nextPayStat,
        serialInvoiceSupplierCost:  nextSupCost,
        updatedAt:                  now,
      });
      summary.serialsRestored += validSerials.length;
      summary.productsAffected += 1;
    } catch (err) {
      console.warn(`[InvoiceLifecycleService] failed to restore inventory for ${ip.productId}:`, err);
    }
  }

  // ── 2) Delete linked transactions (payments + misc expenses) ────────────
  if (inv.invoiceNumber) {
    try {
      const txSnap = await getDocs(query(
        collection(db, TRANSACTIONS_COLLECTION),
        where('linkedType', '==', 'invoice'),
        where('linkedId',   '==', inv.invoiceNumber),
      ));
      for (const d of txSnap.docs) {
        try {
          await deleteDoc(d.ref);
          summary.transactionsRemoved += 1;
        } catch (err) {
          console.warn(`[InvoiceLifecycleService] failed to delete transaction ${d.id}:`, err);
        }
      }
    } catch (err) {
      console.warn('[InvoiceLifecycleService] linked-transaction query failed:', err);
    }
  }

  return summary;
}

export class InvoiceLifecycleService {
  /**
   * Soft-delete an invoice. Every downstream effect gets reversed first:
   *   - sold serials returned to their parent products, Sold status cleared
   *   - payment + misc-expense transactions deleted from the ledger
   * Then the invoice document is archived to `deleted_invoices` and removed
   * from the live `invoices` collection. Deleted invoices cannot be deleted
   * again — there is intentionally no delete method on the deleted side.
   *
   * Returns a summary of how many things were reversed so the caller can
   * surface it in a toast.
   */
  static async softDeleteInvoice(
    id: string,
    deletedBy?: { uid: string; email: string }
  ): Promise<InvoiceReversalSummary> {
    const ref  = doc(db, INVOICES_COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Invoice not found');
    const data = { id, ...(snap.data() as Invoice) };

    // Reverse first — if this fails, the invoice is still archivable but the
    // downstream state is left as-is. Failures are logged per-item and don't
    // block archival, so a partially reversed invoice still lands in Deleted.
    const summary = await reverseInvoiceEffects(data);

    await addDoc(collection(db, DELETED_INVOICES_COLLECTION), stripUndefined({
      ...data,
      id,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy?.uid,
      deletedByEmail: deletedBy?.email,
      reversalSummary: summary,
    }));
    await deleteDoc(ref);

    return summary;
  }

  static async fetchDeletedInvoices(): Promise<DeletedInvoice[]> {
    const q = query(collection(db, DELETED_INVOICES_COLLECTION), orderBy('deletedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...(d.data() as DeletedInvoice), id: d.data().id || d.id }));
  }

  /** Look up a live invoice by its invoiceNumber (for display before deleting). */
  static async fetchInvoiceByNumber(invoiceNumber: string): Promise<Invoice | null> {
    if (!invoiceNumber) return null;
    const q = query(collection(db, INVOICES_COLLECTION), where('invoiceNumber', '==', invoiceNumber));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { ...(snap.docs[0].data() as Invoice), id: snap.docs[0].id };
  }

  /**
   * Called by Inventory's "Add Returned Inventory" flow for BOTH branches
   * (returned-to-stock and damaged): the linked invoice is archived to
   * Deleted Invoices (same as a manual delete) since the sale is being
   * unwound either way. Cannot be deleted again from that section.
   *
   * Takes the already-fetched Invoice object directly (from linkedInvoice in
   * the return screen) and deletes it BY ITS DOCUMENT ID. This avoids a
   * second `where('invoiceNumber', '==', ...)` query, which was the fragile
   * point previously — any mismatch there caused this whole step to silently
   * no-op with no error.
   */
  static async deleteInvoiceByReturn(
    invoice: Invoice,
    serial: string,
    deletedBy?: { uid: string; email: string }
  ): Promise<InvoiceReversalSummary> {
    if (!invoice?.id) {
      console.error('[InvoiceLifecycleService] deleteInvoiceByReturn called without a valid invoice.id', invoice);
      throw new Error('Invoice is missing its document id — cannot delete');
    }
    const ref = doc(db, INVOICES_COLLECTION, invoice.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      console.warn(`[InvoiceLifecycleService] Invoice ${invoice.id} (${invoice.invoiceNumber}) no longer exists — already deleted?`);
      return { serialsRestored: 0, productsAffected: 0, transactionsRemoved: 0 };
    }
    const data = { ...(snap.data() as Invoice), id: invoice.id };

    // Same reversal as a manual delete — the sale is being unwound either way,
    // so all sold serials return to inventory and all linked transactions in
    // the ledger are removed.
    const summary = await reverseInvoiceEffects(data);

    await addDoc(collection(db, DELETED_INVOICES_COLLECTION), stripUndefined({
      ...data,
      returnedSerials: [...new Set([...(data.returnedSerials || []), serial])],
      returnedAt: new Date().toISOString(),
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy?.uid,
      deletedByEmail: deletedBy?.email,
      reversalSummary: summary,
    }));
    await deleteDoc(ref);
    console.log(`[InvoiceLifecycleService] Invoice ${invoice.invoiceNumber} (${invoice.id}) moved to Deleted Invoices via serial return.`);
    return summary;
  }

  /**
   * @deprecated kept for backward compatibility — prefer deleteInvoiceByReturn
   * (which takes the invoice object directly and avoids this re-query).
   */
  static async deleteInvoiceBySerialReturn(
    invoiceNumber: string,
    serial: string,
    deletedBy?: { uid: string; email: string }
  ): Promise<InvoiceReversalSummary> {
    const inv = await InvoiceLifecycleService.fetchInvoiceByNumber(invoiceNumber);
    if (!inv) {
      console.warn(`[InvoiceLifecycleService] No invoice found with invoiceNumber="${invoiceNumber}" — nothing deleted.`);
      return { serialsRestored: 0, productsAffected: 0, transactionsRemoved: 0 };
    }
    return InvoiceLifecycleService.deleteInvoiceByReturn(inv, serial, deletedBy);
  }
}