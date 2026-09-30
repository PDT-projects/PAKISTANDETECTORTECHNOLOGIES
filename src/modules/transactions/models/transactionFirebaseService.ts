// Transactions Module - Firebase Service
// Adds: approval workflow (approve/reject), AppNotification CRUD

import {
  collection, getDocs, getDoc, addDoc, updateDoc,
  deleteDoc, doc, query, where, runTransaction,
  onSnapshot, orderBy, Unsubscribe, deleteField, setDoc,
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { Transaction, PartialPayment, AppNotification, DynamicCategory } from './types';

const COLLECTION       = 'transactions';
const DELETED_COLLECTION = 'deleted_transactions';
const COUNTER_COL      = 'transactionCounters';
const NOTIF_COLLECTION = 'appNotifications';
const CATEGORIES_COL   = 'dynamicCategories';
const COMPANIES_COL    = 'companies';
const BANKS_COL        = 'banks';
const SETTINGS_COL     = 'settings';
const CASH_OPENING_DOC = 'cashOpening';

// ── Deep strip of undefined values ───────────────────────────────────────────
function deepStripUndefined(value: any): any {
  if (Array.isArray(value)) return value.map(deepStripUndefined);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, deepStripUndefined(v)])
    );
  }
  return value;
}

// ── Legacy currency normalization (AED-first) ─────────────────────────────────
// Transactions saved before the AED switch hold PKR amounts and no `currency`
// field. Convert those to AED on read using fixed fallback rates. New
// transactions carry currency:'AED' and pass through untouched.
const PKR_TO_AED = 3.67 / 279.5;
const pkrToAed = (n: number) => Math.round((n || 0) * PKR_TO_AED * 100) / 100;

/**
 * Firestore doc → Transaction.
 *
 * TWO THINGS CHANGED HERE, both of which were causing the list and the balance
 * math to disagree with themselves:
 *
 * 1. IT NOW SPREADS `data` FIRST.
 *    The old version listed fields explicitly and therefore silently DROPPED
 *    every field added after it was written — accountId, accountType,
 *    accountName, subCategoryDetail, branchId, branchName, remitterName,
 *    attachments, attachmentUrl, currency, originalCurrency… Since the list's
 *    onSnapshot path spread the raw doc but refreshTransactions() went through
 *    this mapper, the SAME transaction had different fields depending on which
 *    path last populated the store. getTxAccount() would fall back to the
 *    legacy mode/bankId branch, the Sub Category column would blank out, and
 *    running balances would shift. Spreading first makes that class of bug
 *    impossible.
 *
 * 2. LEGACY PKR DETECTION NO LONGER USES A BARE AMOUNT THRESHOLD.
 *    `legacy = amount > 50000` divided ANY transaction over 50,000 by ~76 on
 *    read — including brand-new, correctly-stored AED ones. createTransaction
 *    has always stamped `currency: 'AED'` on new records, so the ABSENCE of
 *    that field is the reliable signal. The amount threshold is kept as a
 *    second condition purely to preserve existing behaviour for genuinely old
 *    records; see the note in the module README about backfilling `currency`
 *    so this heuristic can be deleted outright.
 */
export function mapTransactionDoc(d: any): Transaction {
  const data = d.data ? d.data() : d;

  const legacy = !data.currency && (Number(data.amount) || 0) > 50000;
  const amt = (n: any) => (n == null ? n : (legacy ? pkrToAed(Number(n) || 0) : n));

  return {
    // Keep every stored field, known or not.
    ...data,

    id:                   d.id ?? data.id,

    // Defaults for fields the UI assumes are always present.
    transactionId:        data.transactionId        || '',
    date:                 data.date                 || '',
    time:                 data.time                 || '',
    company:              data.company              || '',
    mainCategory:         data.mainCategory         || '',
    subCategory:          data.subCategory          || '',
    mode:                 data.mode                 || 'Cash',
    note:                 data.note                 || '',
    approvalStatus:       data.approvalStatus       || 'not_required',

    // Currency-normalized numerics.
    amount:               amt(data.amount           || 0),
    amountPaid:           amt(data.amountPaid),
    remainingAmount:      amt(data.remainingAmount),
    totalPaid:            amt(data.totalPaid),
    partialPayments:      (data.partialPayments || []).map((p: any) => ({ ...p, amount: amt(p.amount) })),
  } as Transaction;
}

/** @deprecated Renamed to `mapTransactionDoc` and exported. */
const docToTransaction = mapTransactionDoc;

/**
 * The ONE ordering used for the transactions list: newest first, by date, then
 * time, then createdAt. Exported so the live onSnapshot subscription and the
 * one-shot fetch produce identical order — previously the subscription applied
 * no ordering at all, so the list came back in Firestore document-id order and
 * the running-balance column (which is computed chronologically) appeared to
 * jump around at random.
 */
export const compareTransactionsNewestFirst = (a: Transaction, b: Transaction): number => {
  const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime();
  if (dateCompare !== 0) return dateCompare;
  const timeCompare = (b.time || '').localeCompare(a.time || '');
  if (timeCompare !== 0) return timeCompare;
  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
};

/** Sort a transactions array newest-first. Returns a new array. */
export const sortTransactionsNewestFirst = (list: Transaction[]): Transaction[] =>
  [...list].sort(compareTransactionsNewestFirst);

function docToNotification(d: any): AppNotification {
  const data = d.data() || {};
  return {
    id:             d.id,
    type:           data.type           || 'info',
    title:          data.title          || '',
    message:        data.message        || '',
    transactionId:  data.transactionId,
    transactionRef: data.transactionRef,
    userId:         data.userId,
    userEmail:      data.userEmail,
    userName:       data.userName,
    isRead:         data.isRead         ?? false,
    createdAt:      data.createdAt      || new Date().toISOString(),
    expiresAt:      data.expiresAt,
  };
}

export class TransactionFirebaseService {

  // ═══════════════════════════════════════════════════════════════════════
  // Transaction ID — PEEK (read-only) vs COMMIT (atomic increment)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // WHY THE SPLIT EXISTS
  // --------------------
  // The old single `generateTransactionId()` incremented the Firestore counter
  // the moment it was called. QuickTransactionModal called it on mount, so just
  // OPENING the modal and pressing ✕ burned a number permanently and punched a
  // hole in the daily sequence (…-004, …-006, …-007).
  //
  //   peekNextTransactionId()        → pure read. Safe on mount, safe on every
  //                                    re-render, safe to cancel. Never consumes.
  //   subscribeToNextTransactionId() → same, but live: if someone else saves
  //                                    while your modal is open, the preview
  //                                    moves to the next free number by itself.
  //   commitTransactionId()          → the atomic runTransaction increment.
  //                                    Call ONCE, inside the save path, right
  //                                    before the document is written.
  //
  // Two people previewing the same number is harmless: the commit is a single
  // atomic runTransaction, so whoever saves first takes it and the second is
  // handed the next number at commit time. The preview is a hint, the commit
  // is the truth.

  /** Counter doc key for a given day: DDMMYY. */
  private static counterKey(date: Date = new Date()): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}${mm}${yy}`;
  }

  private static formatTxId(key: string, n: number): string {
    return `TXN-${key}-${String(n).padStart(3, '0')}`;
  }

  /**
   * READ-ONLY preview of the next transaction ID. Does NOT consume a number.
   * Use this for anything the user can still cancel out of.
   */
  static async peekNextTransactionId(date: Date = new Date()): Promise<string> {
    const key = TransactionFirebaseService.counterKey(date);
    try {
      const snap = await getDoc(doc(db, COUNTER_COL, key));
      const n = (snap.exists() ? (snap.data().count || 0) : 0) + 1;
      return TransactionFirebaseService.formatTxId(key, n);
    } catch (err) {
      console.error('[TxId] peek failed — showing …-001 as placeholder:', err);
      return TransactionFirebaseService.formatTxId(key, 1);
    }
  }

  /**
   * Live READ-ONLY preview. Returns an unsubscribe function — call it on unmount.
   * Still never consumes a number.
   */
  static subscribeToNextTransactionId(
    callback: (id: string) => void,
    date: Date = new Date(),
  ): Unsubscribe {
    const key = TransactionFirebaseService.counterKey(date);
    return onSnapshot(
      doc(db, COUNTER_COL, key),
      (snap) => {
        const n = (snap.exists() ? (snap.data()?.count || 0) : 0) + 1;
        callback(TransactionFirebaseService.formatTxId(key, n));
      },
      (err) => {
        console.error('[TxId] preview subscription failed:', err);
        callback(TransactionFirebaseService.formatTxId(key, 1));
      },
    );
  }

  /**
   * CONSUMES the next transaction ID atomically. Only ever call this from a
   * save path, immediately before writing the transaction document.
   */
  static async commitTransactionId(date: Date = new Date()): Promise<string> {
    const key = TransactionFirebaseService.counterKey(date);
    const ref = doc(db, COUNTER_COL, key);
    try {
      const next = await runTransaction(db, async (txn) => {
        const snap = await txn.get(ref);
        const n    = snap.exists() ? (snap.data().count || 0) + 1 : 1;
        txn.set(ref, { date: key, count: n }, { merge: true });
        return n;
      });
      return TransactionFirebaseService.formatTxId(key, next);
    } catch (err) {
      console.error('Counter transaction failed, using timestamp fallback:', err);
      return `TXN-${key}-${String(Date.now()).slice(-5)}`;
    }
  }

  /**
   * @deprecated Ambiguous name — it always consumed a number even when the
   * caller only wanted to display one. Kept so existing callers keep compiling.
   * New code: `peekNextTransactionId()` to show, `commitTransactionId()` to save.
   */
  static async generateTransactionId(): Promise<string> {
    return TransactionFirebaseService.commitTransactionId();
  }

  static async transactionIdExists(transactionId: string): Promise<boolean> {
    try {
      const q    = query(collection(db, COLLECTION), where('transactionId', '==', transactionId));
      const snap = await getDocs(q);
      return !snap.empty;
    } catch {
      return false;
    }
  }

  // ── Fetch all transactions ────────────────────────────────────────────────
  static async fetchAllTransactions(): Promise<Transaction[]> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTION));
      const list = sortTransactionsNewestFirst(snapshot.docs.map(mapTransactionDoc));
      console.log(`✅ Fetched ${list.length} transactions`);
      return list;
    } catch (error) {
      console.error('❌ Error fetching transactions:', error);
      throw new Error('Failed to fetch transactions');
    }
  }

  static async fetchTransactionById(id: string): Promise<Transaction | null> {
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return docToTransaction(snap);
    } catch (error) {
      console.error('❌ Error fetching transaction:', error);
      throw new Error('Failed to fetch transaction');
    }
  }

  // ── Create transaction ────────────────────────────────────────────────────
  static async createTransaction(data: Omit<Transaction, 'id'>): Promise<Transaction> {
    try {
      const now  = new Date().toISOString();
      const body = deepStripUndefined({ ...data, currency: (data as any).currency || 'AED', createdAt: now, updatedAt: now });

      // Debug: confirm classification fields reach Firestore (remove once confirmed working)
      console.log('📊 Saving classification:', {
        plMainCategory: body.plMainCategory ?? '(not set)',
        plSubCategory:  body.plSubCategory  ?? '(not set)',
        bsMainCategory: body.bsMainCategory ?? '(not set)',
        bsSubCategory:  body.bsSubCategory  ?? '(not set)',
      });

      const ref  = await addDoc(collection(db, COLLECTION), body);
      console.log('✅ Transaction created:', ref.id);
      return { ...data, id: ref.id, createdAt: now, updatedAt: now };
    } catch (error) {
      console.error('❌ Error creating transaction:', error);
      throw new Error('Failed to create transaction');
    }
  }

  // ── Update transaction ────────────────────────────────────────────────────
  static async updateTransaction(id: string, data: Partial<Omit<Transaction, 'id'>>): Promise<void> {
    try {
      // Strip undefined from everything except classification fields which may need
      // to be explicitly deleted when the user clears them in the form.
      // Firestore updateDoc is a MERGE — omitting a key leaves the old value untouched,
      // so we must send deleteField() when the user clears a classification.
      const base = deepStripUndefined({ ...data, updatedAt: new Date().toISOString() });

      // Override classification fields: empty string → deleteField() sentinel
      if ('plMainCategory' in data)
        base.plMainCategory = data.plMainCategory || deleteField();
      if ('plSubCategory' in data)
        base.plSubCategory  = data.plSubCategory  || deleteField();
      if ('bsMainCategory' in data)
        base.bsMainCategory = data.bsMainCategory || deleteField();
      if ('bsSubCategory' in data)
        base.bsSubCategory  = data.bsSubCategory  || deleteField();

      // Debug: confirm classification fields (remove once confirmed working)
      console.log('📊 Updating classification:', {
        plMainCategory: data.plMainCategory ?? '(unchanged)',
        plSubCategory:  data.plSubCategory  ?? '(unchanged)',
        bsMainCategory: data.bsMainCategory ?? '(unchanged)',
        bsSubCategory:  data.bsSubCategory  ?? '(unchanged)',
      });

      await updateDoc(doc(db, COLLECTION, id), base);
      console.log('✅ Transaction updated:', id);
    } catch (error) {
      console.error('❌ Error updating transaction:', error);
      throw new Error('Failed to update transaction');
    }
  }

  // ── Delete transaction (soft — archived to deleted_transactions) ─────────
  //
  // Reads the transaction, snapshots it into the `deleted_transactions`
  // collection with `deletedAt` + `deletedBy` metadata, and only then removes
  // it from the live `transactions` collection.
  //
  // Why this restores the balance for free: every balance helper (Cash-in-Hand,
  // per-bank, monthly flow) iterates the LIVE transactions list. Once the doc
  // is gone from `transactions`, it's automatically excluded from every running
  // total, so the numbers snap back to what they were before the transaction
  // existed. Nothing else on the compute side needs to change.
  //
  // Deleted records are read-only afterwards — this service intentionally has
  // no method to delete them again, so the archive is append-only.
  static async deleteTransaction(
    id: string,
    deletedBy?: { uid: string; email: string; displayName?: string },
  ): Promise<void> {
    try {
      const ref  = doc(db, COLLECTION, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        console.warn(`[TransactionFirebaseService] transaction ${id} not found — skipping delete`);
        return;
      }
      const data = snap.data() as any;

      // A ledger entry linked to a shipment has a second half — a charge or a
      // supplier payment. Deleting the entry without reversing it would leave
      // the costing sheet holding a figure the ledger no longer has.
      //
      // Refused outright once the costing is finalised: the landed cost is a
      // number someone has used, and a deletion moving it silently is how a
      // figure that was right on Monday is wrong on Friday with nothing
      // recording why. Reopen the costing first.
      if (data.shipmentId) {
        const { PurchasedOrderFirebaseService } = await import(
          '../../purchased-orders/models/purchasedOrderFirebaseService'
        );
        const shipment = await PurchasedOrderFirebaseService.fetchById(data.shipmentId);

        if (shipment) {
          const isSupplierPay = data.shipmentPaymentKind === 'Shipment';

          if (!isSupplierPay && shipment.costingStatus === 'Complete') {
            throw new Error(
              `This payment is part of shipment ${shipment.shipmentNumber}, whose costing is finalised. `
              + 'Reopen the costing before deleting it.',
            );
          }

          if (isSupplierPay) {
            await PurchasedOrderFirebaseService.removeSupplierPaymentByTransaction(shipment.id, id);
          } else {
            await PurchasedOrderFirebaseService.removeChargeByTransaction(shipment.id, id);
          }
        }
      }

      const archive = deepStripUndefined({
        ...data,
        originalId:     id,
        deletedAt:      new Date().toISOString(),
        deletedBy:      deletedBy?.uid || 'unknown',
        deletedByEmail: deletedBy?.email || 'unknown',
        deletedByName:  deletedBy?.displayName || deletedBy?.email || 'Unknown user',
      });
      await addDoc(collection(db, DELETED_COLLECTION), archive);
      await deleteDoc(ref);

      console.log(`✅ Transaction ${id} archived to deleted_transactions by ${deletedBy?.email || 'unknown'}`);
    } catch (error) {
      console.error('❌ Error deleting transaction:', error);
      throw new Error('Failed to delete transaction');
    }
  }

  // ── Fetch archived (deleted) transactions ────────────────────────────────
  static async fetchDeletedTransactions(): Promise<Array<Transaction & {
    originalId?: string;
    deletedAt?: string;
    deletedBy?: string;
    deletedByEmail?: string;
    deletedByName?: string;
  }>> {
    try {
      const snap = await getDocs(query(collection(db, DELETED_COLLECTION), orderBy('deletedAt', 'desc')));
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    } catch (error) {
      console.error('❌ Error fetching deleted transactions:', error);
      return [];
    }
  }

  // ── Approval workflow ─────────────────────────────────────────────────────

  /**
   * Called from the approve HTTP Cloud Function.
   * Updates the transaction status to 'approved' and clears the token.
   */
  static async approveTransaction(firestoreId: string): Promise<void> {
    await TransactionFirebaseService.updateTransaction(firestoreId, {
      approvalStatus: 'approved',
      approvedAt:     new Date().toISOString(),
      approvalToken:  undefined,
    });
  }

  /**
   * Called from the reject HTTP Cloud Function.
   */
  static async rejectTransaction(firestoreId: string, reason?: string): Promise<void> {
    await TransactionFirebaseService.updateTransaction(firestoreId, {
      approvalStatus:  'rejected',
      rejectedAt:      new Date().toISOString(),
      rejectionReason: reason || 'Rejected by admin',
      approvalToken:   undefined,
    });
  }

  /**
   * Fetch all transactions pending approval.
   */
  static async fetchPendingApprovals(): Promise<Transaction[]> {
    try {
      const q    = query(collection(db, COLLECTION), where('approvalStatus', '==', 'pending_approval'));
      const snap = await getDocs(q);
      return snap.docs.map(docToTransaction);
    } catch (error) {
      console.error('❌ Error fetching pending approvals:', error);
      throw new Error('Failed to fetch pending approvals');
    }
  }

  // ── Partial payments ──────────────────────────────────────────────────────
  static async addPartialPayment(transactionId: string, payment: PartialPayment): Promise<void> {
    try {
      const snap = await getDoc(doc(db, COLLECTION, transactionId));
      if (!snap.exists()) throw new Error('Transaction not found');
      const tx = docToTransaction(snap);

      const cleanPayment    = deepStripUndefined(payment) as PartialPayment;
      const updatedPayments = [...(tx.partialPayments || []), cleanPayment];
      const totalPaid       = updatedPayments.reduce((s, p) => s + p.amount, 0);
      const remaining       = Math.max(0, tx.amount - totalPaid);
      const isFullyCleared  = remaining <= 0 && updatedPayments.every(p => p.isCleared || p.method === 'Bank');

      await TransactionFirebaseService.updateTransaction(transactionId, {
        partialPayments: updatedPayments,
        totalPaid,
        remainingAmount: remaining,
        isFullyCleared,
        paymentStatus:   remaining <= 0 ? 'Full' : 'Partial',
      });
      console.log('✅ Partial payment added:', transactionId);
    } catch (error) {
      console.error('❌ Error adding partial payment:', error);
      throw new Error('Failed to add partial payment');
    }
  }

  static async markPaymentCleared(transactionId: string, paymentId: string): Promise<void> {
    try {
      const snap = await getDoc(doc(db, COLLECTION, transactionId));
      if (!snap.exists()) throw new Error('Transaction not found');
      const tx = docToTransaction(snap);

      const updatedPayments = (tx.partialPayments || []).map(p =>
        p.id === paymentId ? { ...p, isCleared: true } : p
      );
      const totalPaid      = updatedPayments.reduce((s, p) => s + p.amount, 0);
      const remaining      = Math.max(0, tx.amount - totalPaid);
      const isFullyCleared = remaining <= 0 && updatedPayments.every(p => p.isCleared);

      await TransactionFirebaseService.updateTransaction(transactionId, {
        partialPayments: updatedPayments,
        totalPaid,
        remainingAmount: remaining,
        isFullyCleared,
      });
      console.log('✅ Payment cleared:', paymentId);
    } catch (error) {
      console.error('❌ Error marking payment cleared:', error);
      throw new Error('Failed to mark payment as cleared');
    }
  }

  // ── Mark the main cheque transaction itself as cleared ────────────────────
  static async markTransactionCleared(transactionId: string): Promise<void> {
    try {
      await TransactionFirebaseService.updateTransaction(transactionId, {
        isFullyCleared: true,
        paymentStatus:  'Full',
      });
      console.log('✅ Transaction cleared:', transactionId);
    } catch (error) {
      console.error('❌ Error clearing transaction:', error);
      throw new Error('Failed to clear transaction');
    }
  }

  // ── App Notifications (Firestore) ─────────────────────────────────────────

  /** Create a notification document */
  static async createNotification(
    data: Omit<AppNotification, 'id'>
  ): Promise<AppNotification> {
    const ref = await addDoc(collection(db, NOTIF_COLLECTION), deepStripUndefined(data));
    return { ...data, id: ref.id };
  }

  /** Mark one notification as read */
  static async markNotificationRead(id: string): Promise<void> {
    await updateDoc(doc(db, NOTIF_COLLECTION, id), { isRead: true });
  }

  /** Mark all notifications as read */
  static async markAllNotificationsRead(): Promise<void> {
    const snap = await getDocs(
      query(collection(db, NOTIF_COLLECTION), where('isRead', '==', false))
    );
    await Promise.all(snap.docs.map(d => updateDoc(d.ref, { isRead: true })));
  }

  /** Delete a notification */
  static async deleteNotification(id: string): Promise<void> {
    await deleteDoc(doc(db, NOTIF_COLLECTION, id));
  }

  /** Delete notifications related to a specific transaction */
  static async deleteNotificationsForTransaction(transactionId: string): Promise<void> {
    try {
      const q    = query(collection(db, NOTIF_COLLECTION), where('transactionId', '==', transactionId));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    } catch (err) {
      console.error('Failed to delete notifications for transaction:', err);
    }
  }

  /**
   * Real-time listener for notifications (newest first).
   * Returns an unsubscribe function — call it on component unmount.
   */
  static subscribeToNotifications(
    callback: (notifications: AppNotification[]) => void
  ): Unsubscribe {
    return onSnapshot(
      collection(db, NOTIF_COLLECTION),
      (snap) => {
        const notifications = snap.docs
          .map(docToNotification)
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        callback(notifications);
      },
      (err) => {
        console.error('❌ subscribeToNotifications error:', err);
        callback([]);
      }
    );
  }

  // ── Dynamic Categories ────────────────────────────────────────────────────

  /** Fetch all user-added categories */
  static async fetchDynamicCategories(): Promise<DynamicCategory[]> {
    try {
      const snap = await getDocs(collection(db, CATEGORIES_COL));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as DynamicCategory));
    } catch (error) {
      console.error('❌ Error fetching dynamic categories:', error);
      return [];
    }
  }

  /** Add a new dynamic category */
  static async addDynamicCategory(
    data: Omit<DynamicCategory, 'id'>
  ): Promise<DynamicCategory> {
    const ref = await addDoc(collection(db, CATEGORIES_COL), deepStripUndefined(data));
    console.log('✅ Dynamic category added:', ref.id);
    return { ...data, id: ref.id };
  }

  /** Delete a dynamic category */
  static async deleteDynamicCategory(id: string): Promise<void> {
    await deleteDoc(doc(db, CATEGORIES_COL, id));
  }

  // ── Companies / Branches ──────────────────────────────────────────────────

  /** Fetch all companies/branches from Firestore */
  static async fetchCompanies(): Promise<{ id: string; name: string; createdAt: string }[]> {
    try {
      const snap = await getDocs(collection(db, COMPANIES_COL));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; name: string; createdAt: string }));
    } catch (error) {
      console.error('❌ Error fetching companies:', error);
      return [];
    }
  }

  /** Add a new company/branch */
  static async addCompany(name: string): Promise<{ id: string; name: string; createdAt: string }> {
    const data = { name: name.trim(), createdAt: new Date().toISOString() };
    const ref = await addDoc(collection(db, COMPANIES_COL), deepStripUndefined(data));
    console.log('✅ Company added:', ref.id);
    return { ...data, id: ref.id };
  }

  /** Delete a company/branch */
  static async deleteCompany(id: string): Promise<void> {
    await deleteDoc(doc(db, COMPANIES_COL, id));
  }

  // ── Accounts: Cash-in-Hand opening balance + bank list ────────────────────
  //
  // The Cash-in-Hand opening balance lives in ONE doc (`settings/cashOpening`)
  // and is the seed the running-balance math starts from. It used to be read
  // only inside TransactionListView, which is why the transaction modal's
  // Account dropdown showed the raw ledger delta and ignored the opening
  // balance entirely. These helpers make it a shared, live source of truth so
  // every screen reads the same number.

  /** One-shot read of the Cash-in-Hand opening balance. */
  static async fetchCashOpening(): Promise<number> {
    try {
      const snap = await getDoc(doc(db, SETTINGS_COL, CASH_OPENING_DOC));
      return snap.exists() ? Number((snap.data() as any).amount) || 0 : 0;
    } catch (error) {
      console.error('❌ Error fetching cash opening balance:', error);
      return 0;
    }
  }

  /**
   * Live subscription to the Cash-in-Hand opening balance. Any screen using
   * this updates the instant the Opening Balances modal saves — no refresh,
   * no remount, no stale dropdown.
   */
  static subscribeToCashOpening(callback: (amount: number) => void): Unsubscribe {
    return onSnapshot(
      doc(db, SETTINGS_COL, CASH_OPENING_DOC),
      (snap) => callback(snap.exists() ? Number((snap.data() as any)?.amount) || 0 : 0),
      (err) => {
        console.error('❌ cashOpening subscription failed:', err);
        callback(0);
      },
    );
  }

  /** Write the Cash-in-Hand opening balance. Merges, so other settings survive. */
  static async setCashOpening(amount: number): Promise<void> {
    await setDoc(
      doc(db, SETTINGS_COL, CASH_OPENING_DOC),
      { amount: Number(amount) || 0, updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }

  /** Live subscription to the bank list (id, name, opening balance, acct no). */
  static subscribeToBanks(
    callback: (banks: { id: string; name: string; balance: number; accountNumber?: string }[]) => void,
  ): Unsubscribe {
    return onSnapshot(
      query(collection(db, BANKS_COL), orderBy('name')),
      (snap) => callback(snap.docs.map(d => {
        const b = d.data() as any;
        return {
          id:            d.id,
          name:          b.name || '—',
          balance:       Number(b.balance) || 0,
          accountNumber: b.accountNumber,
        };
      })),
      (err) => {
        console.error('❌ banks subscription failed:', err);
        callback([]);
      },
    );
  }
}