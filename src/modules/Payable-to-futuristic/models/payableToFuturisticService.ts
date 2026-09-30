// models/payableToFuturisticService.ts
//
// UPDATED: Now reads directly from `payable_to_futuristic` collection
// (written by futuristicPayableBridge.ts on invoice creation) instead of
// scanning the products collection. This is simpler, faster, and accurate.
//
// NEW: recordPayment() — marks a payable item as partially/fully paid,
//      and optionally deducts from a bank account or cash balance.
// NEW: createManualPayable() — lets the user add a manual entry from the UI.
// NEW: fetchBankAccounts() — loads real bank accounts with live balances.
// NEW: fetchCashBalance() — loads the current cash balance.

import {
  collection, doc, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc, query, orderBy, runTransaction,
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import type { CurrencyAmounts } from './payableToFuturistic';
import { ZERO_AMOUNTS, aedToAllCurrencies } from './payableToFuturistic';

const PAYABLE_COLLECTION = 'payable_to_futuristic';
const BANK_COLLECTION    = 'bank_accounts';     // adjust to your actual collection name
const CASH_COLLECTION    = 'cash_accounts';     // adjust to your actual collection name
const TX_COLLECTION      = 'transactions';      // ledger / transaction log collection

function nowISO(): string { return new Date().toISOString(); }

// ── Bank / Cash types ─────────────────────────────────────────────────────────
export interface BankAccount {
  id:          string;
  accountName: string;   // e.g. "Emirates NBD — AED"
  bankName:    string;
  currency:    string;   // 'AED' | 'USD' etc.
  balance:     number;   // current balance in the account's currency
  isActive:    boolean;
}

export interface CashAccount {
  id:       string;
  name:     string;     // e.g. "Office Cash"
  currency: string;
  balance:  number;
}

// ── Fetch bank accounts ───────────────────────────────────────────────────────
export async function fetchBankAccounts(): Promise<BankAccount[]> {
  try {
    const q    = query(collection(db, BANK_COLLECTION), orderBy('accountName'));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id:          d.id,
          accountName: data.accountName || data.name || 'Unnamed Account',
          bankName:    data.bankName    || data.bank || '',
          currency:    data.currency    || 'AED',
          balance:     data.balance     ?? data.currentBalance ?? data.liquidity ?? 0,
          isActive:    data.isActive    !== false,
        } as BankAccount;
      })
      .filter((a) => a.isActive);
  } catch (err) {
    console.error('[PayableService] Failed to fetch bank accounts:', err);
    return [];
  }
}

// ── Fetch cash accounts ───────────────────────────────────────────────────────
export async function fetchCashAccounts(): Promise<CashAccount[]> {
  try {
    const q    = query(collection(db, CASH_COLLECTION));
    const snap = await getDocs(q);
    if (snap.empty) {
      // Many apps store cash as a single doc — try a known fallback path
      return [];
    }
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id:       d.id,
        name:     data.name || data.accountName || 'Cash',
        currency: data.currency || 'AED',
        balance:  data.balance  ?? data.currentBalance ?? 0,
      } as CashAccount;
    });
  } catch (err) {
    console.error('[PayableService] Failed to fetch cash accounts:', err);
    return [];
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface DerivedPayable {
  productId:     string;
  modelName:     string;
  location:      string;
  invoiceId:     string | null;
  invoiceNumber: string | null;
  saleDate:      string | null;
  usdPrice:      number;
  amounts:       CurrencyAmounts;
  paidAmounts:   CurrencyAmounts;
  status:        'pending' | 'partial' | 'paid';
  description:   string;
  notes:         string;
  dueDate:       string;
  firestoreId:   string; // the payable_to_futuristic doc ID
}

export interface InvoicePayableSummary {
  invoiceId:     string;
  invoiceNumber: string;
  saleDate:      string | null;
  items:         DerivedPayable[];
  totalAmounts:  CurrencyAmounts;
  paidAmounts:   CurrencyAmounts;
  status:        'pending' | 'partial' | 'paid';
}

// ── Read all payables (grouped by invoice) ────────────────────────────────────
export async function fetchPayablesSummaryByInvoice(): Promise<InvoicePayableSummary[]> {
  const q    = query(collection(db, PAYABLE_COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  const items: DerivedPayable[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      firestoreId:   d.id,
      productId:     data.productId     || '',
      modelName:     data.modelName     || '',
      location:      data.location      || '',
      invoiceId:     data.invoiceId     || null,
      invoiceNumber: data.invoiceNumber || null,
      saleDate:      data.saleDate      || data.createdAt || null,
      usdPrice:      data.usdPrice      || 0,
      amounts:       data.amounts       || ZERO_AMOUNTS,
      paidAmounts:   data.paidAmounts   || ZERO_AMOUNTS,
      status:        data.status        || 'pending',
      description:   data.description   || data.modelName || '',
      notes:         data.notes         || '',
      dueDate:       data.dueDate       || '',
    };
  });

  // Group by invoiceId (manual entries without invoiceId grouped individually)
  const groups: Record<string, DerivedPayable[]> = {};
  for (const item of items) {
    const key = item.invoiceId ?? `manual-${item.firestoreId}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  return Object.entries(groups).map(([, groupItems]) => {
    const first = groupItems[0];

    const totalAmounts: CurrencyAmounts = groupItems.reduce(
      (acc, i) => ({
        aed: acc.aed + i.amounts.aed,
        pkr: acc.pkr + i.amounts.pkr,
        sar: acc.sar + i.amounts.sar,
        usd: acc.usd + i.amounts.usd,
      }),
      { aed: 0, pkr: 0, sar: 0, usd: 0 }
    );

    const paidAmounts: CurrencyAmounts = groupItems.reduce(
      (acc, i) => ({
        aed: acc.aed + i.paidAmounts.aed,
        pkr: acc.pkr + i.paidAmounts.pkr,
        sar: acc.sar + i.paidAmounts.sar,
        usd: acc.usd + i.paidAmounts.usd,
      }),
      { aed: 0, pkr: 0, sar: 0, usd: 0 }
    );

    const allPaid  = groupItems.every((i) => i.status === 'paid');
    const anyPaid  = groupItems.some((i) => i.status === 'paid' || i.status === 'partial');
    const status: 'pending' | 'partial' | 'paid' = allPaid ? 'paid' : anyPaid ? 'partial' : 'pending';

    return {
      invoiceId:     first.invoiceId    ?? first.firestoreId,
      invoiceNumber: first.invoiceNumber ?? 'Manual Entry',
      saleDate:      first.saleDate,
      items:         groupItems,
      totalAmounts,
      paidAmounts,
      status,
    };
  });
}

// ── Record a payment against a single payable item ────────────────────────────
export interface RecordPaymentPayload {
  /** Amount paid in AED — will be converted to all currencies */
  paidAed: number;
  notes?: string;
  /** Payment method chosen by the user */
  paymentMethod: 'bank' | 'cash';
  /** ID of the bank_account doc (required when paymentMethod === 'bank') */
  bankAccountId?: string;
  /** ID of the cash_account doc (required when paymentMethod === 'cash') */
  cashAccountId?: string;
}

export async function recordPayment(firestoreId: string, payload: RecordPaymentPayload) {
  const payableRef = doc(db, PAYABLE_COLLECTION, firestoreId);

  // Use a Firestore transaction so the balance deduction and payable update
  // are both atomic — either both succeed or neither does.
  let newPaidAmounts: CurrencyAmounts;
  let status: 'pending' | 'partial' | 'paid';

  await runTransaction(db, async (tx) => {
    // 1. Read current payable
    const snap = await tx.get(payableRef);
    if (!snap.exists()) throw new Error(`Payable ${firestoreId} not found`);

    const data       = snap.data();
    const totalAed   = (data.amounts?.aed   ?? 0) as number;
    const alreadyAed = (data.paidAmounts?.aed ?? 0) as number;
    const newPaidAed = Math.min(alreadyAed + payload.paidAed, totalAed);

    newPaidAmounts = aedToAllCurrencies(newPaidAed);
    status = newPaidAed >= totalAed ? 'paid' : newPaidAed > 0 ? 'partial' : 'pending';

    // 2. Update the payable doc
    tx.update(payableRef, {
      paidAmounts: newPaidAmounts,
      status,
      notes:     payload.notes ?? data.notes ?? '',
      updatedAt: nowISO(),
    });

    // 3. Deduct from bank or cash account
    if (payload.paymentMethod === 'bank' && payload.bankAccountId) {
      const bankRef  = doc(db, BANK_COLLECTION, payload.bankAccountId);
      const bankSnap = await tx.get(bankRef);
      if (bankSnap.exists()) {
        const bankData      = bankSnap.data();
        const currentBal    = bankData.balance ?? bankData.currentBalance ?? bankData.liquidity ?? 0;
        const newBal        = Math.max(0, currentBal - payload.paidAed);
        tx.update(bankRef, { balance: newBal, updatedAt: nowISO() });
      }
    } else if (payload.paymentMethod === 'cash' && payload.cashAccountId) {
      const cashRef  = doc(db, CASH_COLLECTION, payload.cashAccountId);
      const cashSnap = await tx.get(cashRef);
      if (cashSnap.exists()) {
        const cashData   = cashSnap.data();
        const currentBal = cashData.balance ?? cashData.currentBalance ?? 0;
        const newBal     = Math.max(0, currentBal - payload.paidAed);
        tx.update(cashRef, { balance: newBal, updatedAt: nowISO() });
      }
    }
  });

  // 4. Write a transaction log entry (outside the atomic tx — non-critical)
  try {
    await addDoc(collection(db, TX_COLLECTION), {
      type:          'payable_payment',
      payableId:     firestoreId,
      amountAed:     payload.paidAed,
      paymentMethod: payload.paymentMethod,
      bankAccountId: payload.bankAccountId ?? null,
      cashAccountId: payload.cashAccountId ?? null,
      notes:         payload.notes ?? '',
      createdAt:     nowISO(),
    });
  } catch (logErr) {
    // Log failure is non-critical — don't fail the whole operation
    console.warn('[PayableService] Failed to write transaction log:', logErr);
  }

  return { newPaidAmounts: newPaidAmounts!, status: status! };
}

// ── Edit the amount of an existing payable (inline row edit) ──────────────────
// Recalculates all currency amounts from a new AED figure. Clamps any existing
// paid amount so it never exceeds the new total, and recomputes status.
export async function updatePayableAmount(firestoreId: string, newAmountAed: number) {
  const ref  = doc(db, PAYABLE_COLLECTION, firestoreId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Payable ${firestoreId} not found`);

  const data       = snap.data();
  const amounts    = aedToAllCurrencies(newAmountAed);
  const paidAed    = (data.paidAmounts?.aed ?? 0) as number;
  const clampedAed = Math.min(paidAed, newAmountAed);
  const paidAmounts = clampedAed === paidAed
    ? (data.paidAmounts ?? ZERO_AMOUNTS)
    : aedToAllCurrencies(clampedAed);

  const status: 'pending' | 'partial' | 'paid' =
    clampedAed >= newAmountAed && newAmountAed > 0 ? 'paid'
    : clampedAed > 0 ? 'partial'
    : 'pending';

  await updateDoc(ref, {
    amounts,
    usdPrice: amounts.usd,
    paidAmounts,
    status,
    amountEdited: true,
    updatedAt: nowISO(),
  });

  return { amounts, paidAmounts, status };
}

// ── Create a manual payable entry from the UI ─────────────────────────────────
export interface ManualPayablePayload {
  modelName:   string;
  description: string;
  amountAed:   number;       // user enters in AED
  dueDate:     string;
  notes?:      string;
  location?:   string;
}

export async function createManualPayable(payload: ManualPayablePayload) {
  const now     = nowISO();
  const amounts = aedToAllCurrencies(payload.amountAed);

  const data = {
    invoiceId:     null,
    invoiceNumber: null,
    productId:     '',
    modelName:     payload.modelName,
    brandName:     'Futuristic',
    location:      payload.location ?? '',
    description:   payload.description,
    amounts,
    usdPrice:      amounts.usd,
    paidAmounts:   ZERO_AMOUNTS,
    status:        'pending' as const,
    dueDate:       payload.dueDate,
    notes:         payload.notes ?? '',
    createdAt:     now,
    updatedAt:     now,
    saleDate:      now.split('T')[0],
    isManual:      true,
  };

  const ref = await addDoc(collection(db, PAYABLE_COLLECTION), data);
  return { id: ref.id, ...data };
}

// ── Legacy / manual CRUD (kept for compatibility) ─────────────────────────────
export async function fetchAllPayables() {
  const q    = query(collection(db, PAYABLE_COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchPayableById(id: string) {
  const snap = await getDoc(doc(db, PAYABLE_COLLECTION, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export interface CreatePayablePayload {
  description: string;
  amounts:     CurrencyAmounts;
  dueDate:     string;
  notes?:      string;
}

export async function createPayable(payload: CreatePayablePayload) {
  const now  = nowISO();
  const data = {
    description: payload.description,
    modelName:   '',
    productId:   '',
    amounts:     payload.amounts,
    paidAmounts: ZERO_AMOUNTS,
    status:      'pending' as const,
    dueDate:     payload.dueDate,
    notes:       payload.notes ?? '',
    createdAt:   now,
    updatedAt:   now,
  };
  const ref = await addDoc(collection(db, PAYABLE_COLLECTION), data);
  return { id: ref.id, ...data };
}

export interface UpdatePayablePayload {
  description?: string;
  amounts?:     CurrencyAmounts;
  paidAmounts?: CurrencyAmounts;
  status?:      'pending' | 'partial' | 'paid';
  dueDate?:     string;
  notes?:       string;
}

export async function updatePayable(id: string, payload: UpdatePayablePayload) {
  await updateDoc(doc(db, PAYABLE_COLLECTION, id), { ...payload, updatedAt: nowISO() });
}

export async function deletePayable(id: string) {
  await deleteDoc(doc(db, PAYABLE_COLLECTION, id));
}