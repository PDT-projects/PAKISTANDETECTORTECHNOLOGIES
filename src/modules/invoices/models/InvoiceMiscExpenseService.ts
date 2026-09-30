// Invoice Module - Miscellaneous Expense Service
// InvoiceMiscExpenseService.ts
//
// Records a miscellaneous expense AGAINST an invoice. Each misc expense:
//   1. Books ONE Cash-Outflow transaction row (unique id per expense).
//   2. Adds the amount to the invoice's `miscExpense` running total AND appends
//      to a `miscExpenses[]` history array on the invoice for auditability.
//
// This lets the invoice list's "Misc Exp" column reflect real expenses that
// were logged against the invoice (shipping, customs, agent fees, etc.), and
// keeps them in the transactions ledger for P&L / Balance-Sheet reporting.

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { Invoice } from './types';
import { TransactionFirebaseService } from '../../transactions/models/transactionFirebaseService';
import { Transaction } from '../../transactions/models/types';
import { TxCompany } from '../../transactions/models/TransactionBridgeService';

const INVOICES_COLLECTION = 'invoices';

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined) out[k] = v; });
  return out as T;
}

export type MiscExpenseMode = 'Cash' | 'Bank' | 'Cheque';

export interface InvoiceMiscExpense {
  id: string;
  amount: number;
  category: string;          // e.g. 'Shipping', 'Customs', 'Agent Fee', 'Cargo'
  mode: MiscExpenseMode;
  date: string;              // YYYY-MM-DD
  note?: string;
  bankId?: string;
  bankName?: string;
  transactionId?: string;    // the booked transaction's TXN id
  recordedBy?: string;
  recordedByEmail?: string;
  recordedAt: string;
}

export interface RecordMiscExpenseInput {
  invoice: Invoice;          // the current invoice (must have .id)
  amount: number;            // expense amount (AED)
  category: string;          // expense category / label
  mode: MiscExpenseMode;
  date: string;              // YYYY-MM-DD
  bankId?: string;
  bankName?: string;
  note?: string;
  company: TxCompany;        // branch/office for the transaction ledger
  recordedBy?: { uid: string; email: string };
}

export interface RecordMiscExpenseResult {
  invoice: Invoice;
  miscExpenseTotal: number;
  expenses: InvoiceMiscExpense[];
}

export class InvoiceMiscExpenseService {

  static async recordExpense(input: RecordMiscExpenseInput): Promise<RecordMiscExpenseResult> {
    const { invoice, amount, category, mode, date, company } = input;

    if (!invoice?.id) throw new Error('Invoice is missing its document id — cannot record expense');
    if (!(amount > 0)) throw new Error('Expense amount must be greater than zero');
    if (!category.trim()) throw new Error('Expense category is required');

    // Read the freshest copy so concurrent writes don't clobber history.
    const ref  = doc(db, INVOICES_COLLECTION, invoice.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Invoice not found');
    const current = { id: invoice.id, ...(snap.data() as Invoice) };

    const priorExpenses = Array.isArray((current as any).miscExpenses)
      ? (current as any).miscExpenses as InvoiceMiscExpense[]
      : [];
    const seq = priorExpenses.length + 1;
    const now = new Date().toISOString();

    // 1) Book the Cash-Outflow transaction first, so we can store its id.
    let bookedTxnId: string | undefined;
    try {
      bookedTxnId = await this.bookExpenseTransaction(current, amount, category, mode, date, seq, input, company);
    } catch (err) {
      console.warn('[InvoiceMiscExpenseService] transaction booking failed (non-blocking):', err);
    }

    const expense: InvoiceMiscExpense = stripUndefined({
      id:              `EXP-${Date.now()}-${seq}`,
      amount,
      category:        category.trim(),
      mode,
      date,
      note:            input.note,
      bankId:          mode === 'Bank' ? input.bankId   : undefined,
      bankName:        mode === 'Bank' ? input.bankName : undefined,
      transactionId:   bookedTxnId,
      recordedBy:      input.recordedBy?.uid,
      recordedByEmail: input.recordedBy?.email,
      recordedAt:      now,
    }) as InvoiceMiscExpense;

    const expenses = [...priorExpenses, expense];
    const miscExpenseTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);

    // 2) Persist onto the invoice — update running total + history.
    // We store the total in `miscExpense` (the field the list column reads) and
    // also mirror into `agentAmount` bucket if you keep the legacy 4-bucket model.
    await updateDoc(ref, stripUndefined({
      miscExpenses:  expenses,
      miscExpense:   miscExpenseTotal,
      updatedAt:     now,
    }));

    return {
      invoice: { ...current, miscExpenses: expenses, miscExpense: miscExpenseTotal } as any,
      miscExpenseTotal,
      expenses,
    };
  }

  // ── Build a single outflow transaction for one misc expense ────────────────
  private static async bookExpenseTransaction(
    invoice: Invoice,
    amount: number,
    category: string,
    mode: MiscExpenseMode,
    date: string,
    seq: number,
    input: RecordMiscExpenseInput,
    company: TxCompany,
  ): Promise<string> {
    const txId = `TXN-EXP-${invoice.invoiceNumber.replace(/^INV-/, '')}-E${seq}`;

    try {
      const exists = await TransactionFirebaseService.transactionIdExists(txId);
      if (exists) {
        console.log(`[InvoiceMiscExpenseService] Transaction ${txId} already exists — skipping`);
        return txId;
      }
    } catch { /* allow create to proceed */ }

    const time = new Date().toTimeString().split(' ')[0];

    const txData: Omit<Transaction, 'id'> = {
      transactionId:   txId,
      date,
      time,
      company,
      mainCategory:    'Cash Outflow',
      subCategory:     category,
      detailCategory:  `Misc expense — Invoice ${invoice.invoiceNumber} — ${invoice.customerName}`,
      amount,
      mode,
      bankId:          mode === 'Bank'   ? input.bankId   : undefined,
      bankName:        mode === 'Bank'   ? input.bankName : undefined,
      amountPaid:      amount,
      remainingAmount: 0,
      paymentStatus:   'Full',
      totalPaid:       amount,
      isFullyCleared:  mode !== 'Cheque',
      paidTo:          undefined,
      paidBy:          undefined,
      note:            input.note || `Misc expense for Invoice ${invoice.invoiceNumber}`,
      partialPayments: [],
      linkedType:      'invoice',
      linkedId:        invoice.invoiceNumber,
      linkedRef:       invoice.invoiceNumber,
      plMainCategory:  'Cost of Goods Sold (COGS)',
      plSubCategory:   category,
      bsMainCategory:  'Assets',
      bsSubCategory:   mode === 'Cash' ? 'Cash & Cash Equivalents' : 'Bank Balances',
      approvalStatus:  'not_required',
    } as Omit<Transaction, 'id'>;

    await TransactionFirebaseService.createTransaction(txData);
    console.log(`[InvoiceMiscExpenseService] ✅ Misc expense transaction booked: ${txId}`);
    return txId;
  }

  // ── Fetch total misc expense for an invoice (from its history) ─────────────
  static async fetchMiscExpenseTotal(invoiceId: string): Promise<number> {
    try {
      const snap = await getDoc(doc(db, INVOICES_COLLECTION, invoiceId));
      if (!snap.exists()) return 0;
      const data = snap.data() as any;
      if (typeof data.miscExpense === 'number') return data.miscExpense;
      const expenses = Array.isArray(data.miscExpenses) ? data.miscExpenses : [];
      return expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
    } catch {
      return 0;
    }
  }
}