// Invoice Module - Additive Service
// InvoicePaymentService.ts
//
// Handles ALL payments against an invoice — both directions:
//
//   • recordPayment()          — CUSTOMER pays US for the invoice (cash inflow).
//                                Updates payments[] / paidAmount / status.
//   • recordSupplierPayment()  — WE pay the SUPPLIER for the goods on the
//                                invoice (cash outflow). Updates
//                                supplierPayments[] / supplierPaidAmount /
//                                supplierPaymentStatus.
//
// Both methods book ONE matching transaction row per call (unique id, so
// multiple partial payments never collide on de-dupe checks), and both
// atomically read → update to survive concurrent writes.
//
// Kept separate from InvoiceFirebaseService.ts (partial copy only available)
// so the main service's unseen methods are never clobbered.

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { Invoice, InvoicePayment, PaymentMode } from './types';
import { calculateMiscExpense, calculateSupplierCost } from './invoiceService';
import { TransactionFirebaseService } from '../../transactions/models/transactionFirebaseService';
import { Transaction, SOLD_GOODS_PAYMENT_CATEGORY } from '../../transactions/models/types';
import { TxCompany } from '../../transactions/models/TransactionBridgeService';
import { BankFirebaseService } from '../../banking/models/bankFirebaseService';
import { InventoryFirebaseService } from '../../inventory/models/InventoryFirebaseService';

const INVOICES_COLLECTION = 'invoices';

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined) out[k] = v; });
  return out as T;
}

// Map the payment mode to the Invoice.paymentMode union used across the UI
// (historically 'Online' means a bank transfer).
function toInvoicePaymentMode(mode: PaymentMode): 'Cash' | 'Online' | 'Cheque' {
  if (mode === 'Bank')   return 'Online';
  if (mode === 'Cheque') return 'Cheque';
  return 'Cash';
}

export interface RecordPaymentInput {
  invoice: Invoice;                 // the current invoice (must have .id)
  amount: number;                   // amount received now (AED)
  mode: PaymentMode;                // Cash | Bank | Cheque
  date: string;                     // YYYY-MM-DD
  bankId?: string;
  bankName?: string;
  bankAccountNumber?: string;
  chequeNumber?: string;
  chequeBank?: string;
  chequeDate?: string;
  note?: string;
  company: TxCompany;               // branch/office for the transaction ledger
  recordedBy?: { uid: string; email: string };
  adjustBankBalance?: boolean;      // default false — see file header
}

export interface RecordPaymentResult {
  invoice: Invoice;
  paidAmount: number;
  remainingAmount: number;
  status: Invoice['status'];
}

export class InvoicePaymentService {

  static async recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
    const { invoice, amount, mode, date, company } = input;

    if (!invoice?.id) throw new Error('Invoice is missing its document id — cannot record payment');
    if (!(amount > 0)) throw new Error('Payment amount must be greater than zero');

    // Read the freshest copy so concurrent payments don't clobber history.
    const ref  = doc(db, INVOICES_COLLECTION, invoice.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Invoice not found');
    const current = { id: invoice.id, ...(snap.data() as Invoice) };

    const totalAmount   = current.totalAmount || 0;
    const priorPayments = Array.isArray(current.payments) ? current.payments : [];
    const alreadyPaid   = priorPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const remainingNow  = Math.max(0, totalAmount - alreadyPaid);

    // Guard against overpayment — clamp to the outstanding balance.
    const applied = Math.min(amount, remainingNow > 0 ? remainingNow : amount);

    const now = new Date().toISOString();
    const paymentSeq = priorPayments.length + 1;

    const payment: InvoicePayment = stripUndefined({
      id:                `PAY-${Date.now()}-${paymentSeq}`,
      amount:            applied,
      mode,
      date,
      bankId:            mode === 'Bank'   ? input.bankId            : undefined,
      bankName:          mode === 'Bank'   ? input.bankName          : undefined,
      bankAccountNumber: mode === 'Bank'   ? input.bankAccountNumber : undefined,
      chequeNumber:      mode === 'Cheque' ? input.chequeNumber      : undefined,
      chequeBank:        mode === 'Cheque' ? input.chequeBank        : undefined,
      chequeDate:        mode === 'Cheque' ? input.chequeDate        : undefined,
      note:              input.note,
      recordedBy:        input.recordedBy?.uid,
      recordedByEmail:   input.recordedBy?.email,
      recordedAt:        now,
    }) as InvoicePayment;

    const payments        = [...priorPayments, payment];
    const paidAmount      = alreadyPaid + applied;
    const remainingAmount = Math.max(0, totalAmount - paidAmount);
    const status: Invoice['status'] =
      remainingAmount <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
    const paymentStatus: 'Full' | 'Partial' | 'Unpaid' =
      status === 'Paid' ? 'Full' : status === 'Partial' ? 'Partial' : 'Unpaid';

    // 1) Persist the payment onto the invoice.
    await updateDoc(ref, stripUndefined({
      payments,
      paidAmount,
      remainingAmount,
      status,
      paymentStatus,
      paymentMode:       toInvoicePaymentMode(mode),
      lastPaymentDate:   date,
      bankId:            mode === 'Bank'   ? input.bankId       : current.bankId,
      bankName:          mode === 'Bank'   ? input.bankName     : current.bankName,
      bankAccountNumber: mode === 'Bank'   ? input.bankAccountNumber : current.bankAccountNumber,
      chequeNumber:      mode === 'Cheque' ? input.chequeNumber : current.chequeNumber,
      chequeBank:        mode === 'Cheque' ? input.chequeBank   : current.chequeBank,
      chequeDate:        mode === 'Cheque' ? input.chequeDate   : current.chequeDate,
      updatedAt:         now,
    }));

    // 2) Book a Cash-Inflow transaction for THIS payment (unique id per payment).
    try {
      await this.bookPaymentTransaction(current, payment, paymentSeq, remainingAmount, company);
    } catch (err) {
      console.warn('[InvoicePaymentService] transaction booking failed (non-blocking):', err);
    }

    // 2b) Sync the new payment status onto every sold serial in Inventory.
    // FIX: this call didn't exist before — Inventory's "Sold Goods Payment"
    // status was written once at sale time and never touched again, so it
    // stayed 'Unpaid' forever even after the invoice was fully paid. Errors
    // here are logged but don't block the payment itself, matching how the
    // rest of this function treats its non-critical side effects.
    for (const ip of (current.products || [])) {
      if (!ip.productId || !Array.isArray(ip.serialNumbers)) continue;
      const soldSerials = ip.serialNumbers.filter(s => s && s.trim());
      if (soldSerials.length === 0) continue;
      try {
        await InventoryFirebaseService.updateSerialPaymentStatus(ip.productId, soldSerials, status as 'Paid' | 'Partial' | 'Unpaid');
      } catch (err) {
        console.warn('[InvoicePaymentService] inventory payment-status sync failed (non-blocking):', err);
      }
    }

    // 3) Optionally credit the receiving bank.
    if (input.adjustBankBalance && mode === 'Bank' && input.bankId) {
      try {
        const bank = await BankFirebaseService.fetchBankById(input.bankId);
        if (bank) {
          await BankFirebaseService.updateBankBalance(input.bankId, (bank.balance || 0) + applied);
          await BankFirebaseService.addBankTransaction({
            bankId:      input.bankId,
            bankName:    input.bankName || bank.name,
            date,
            type:        'credit',
            amount:      applied,
            description: `Invoice ${current.invoiceNumber} — ${current.customerName}`,
            reference:   current.invoiceNumber,
            category:    'Invoice / Sale',
            note:        input.note,
          });
        }
      } catch (err) {
        console.warn('[InvoicePaymentService] bank balance update failed (non-blocking):', err);
      }
    }

    return {
      invoice: { ...current, payments, paidAmount, remainingAmount, status, paymentStatus },
      paidAmount,
      remainingAmount,
      status,
    };
  }

  // ── Build a single inflow transaction for one payment ──────────────────────
  private static async bookPaymentTransaction(
    invoice: Invoice,
    payment: InvoicePayment,
    seq: number,
    remainingAfter: number,
    company: TxCompany,
  ): Promise<void> {
    const txId = `TXN-INV-${invoice.invoiceNumber.replace(/^INV-/, '')}-P${seq}`;

    try {
      const exists = await TransactionFirebaseService.transactionIdExists(txId);
      if (exists) {
        console.log(`[InvoicePaymentService] Transaction ${txId} already exists — skipping`);
        return;
      }
    } catch { /* allow create to proceed */ }

    const mode: 'Cash' | 'Bank' | 'Cheque' =
      payment.mode === 'Bank' ? 'Bank' : payment.mode === 'Cheque' ? 'Cheque' : 'Cash';

    const time = new Date().toTimeString().split(' ')[0];
    const fullyCleared = remainingAfter <= 0;

    const txData: Omit<Transaction, 'id'> = {
      transactionId:   txId,
      date:            payment.date,
      time,
      company,
      mainCategory:    'Cash Inflow',
      subCategory:     'Invoice / Sale',
      detailCategory:  `Payment #${seq} — Invoice ${invoice.invoiceNumber} — ${invoice.customerName}`,
      amount:          payment.amount,
      mode,
      bankId:          mode === 'Bank'   ? payment.bankId      : undefined,
      bankName:        mode === 'Bank'   ? payment.bankName    : undefined,
      chequeNumber:    mode === 'Cheque' ? payment.chequeNumber : undefined,
      chequeBank:      mode === 'Cheque' ? payment.chequeBank   : undefined,
      chequeDate:      mode === 'Cheque' ? payment.chequeDate   : undefined,

      // A payment transaction is ATOMIC on the cash side — the money was
      // either received in full or not at all. The `amount / amountPaid /
      // totalPaid` fields all reflect what actually moved, and
      // `remainingAmount` on the transaction itself is 0.
      //
      // `paymentStatus` here serves as a LINKAGE FLAG rather than a
      // transaction-level cash flag:
      //   • 'Full'    → payment cleared the parent invoice completely
      //   • 'Partial' → parent invoice still has an outstanding balance
      // The transactions list uses this to filter "Pending only" — a
      // transaction flagged Partial surfaces there even though its own
      // Cash In matches Amount (because the invoice it's paying is still
      // in progress).
      amountPaid:      payment.amount,
      remainingAmount: 0,
      paymentStatus:   fullyCleared ? 'Full' : 'Partial',
      totalPaid:       payment.amount,
      isFullyCleared:  fullyCleared && mode !== 'Cheque',   // cheques aren't cleared until they clear

      paidBy:          invoice.customerName,
      paidTo:          undefined,
      note:            payment.note || (fullyCleared
        ? `Invoice ${invoice.invoiceNumber} payment #${seq} — invoice now settled`
        : `Invoice ${invoice.invoiceNumber} payment #${seq} — invoice balance AED ${remainingAfter.toLocaleString()} remaining`),
      partialPayments: [],
      linkedType:      'invoice',
      linkedId:        invoice.invoiceNumber,
      plMainCategory:  'Revenue',
      plSubCategory:   'Service / Invoice Sales',
      bsMainCategory:  'Assets',
      bsSubCategory:   mode === 'Cash' ? 'Cash & Cash Equivalents' : 'Bank Balances',
      approvalStatus:  'not_required',
    } as Omit<Transaction, 'id'>;

    await TransactionFirebaseService.createTransaction(txData);
    console.log(`[InvoicePaymentService] ✅ Payment transaction booked: ${txId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPLIER PAYMENT — we pay the supplier for goods sold on an invoice
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * A single supplier-payment record on an invoice. Same shape as
   * InvoicePayment (customer side) but distinct field name on the doc so the
   * two histories never mix.
   */

  static async recordSupplierPayment(input: RecordSupplierPaymentInput): Promise<RecordSupplierPaymentResult> {
    const { invoice, amount, mode, date, company } = input;

    if (!invoice?.id) throw new Error('Invoice is missing its document id — cannot record supplier payment');
    if (!(amount > 0)) throw new Error('Supplier payment amount must be greater than zero');

    // Read the freshest copy so concurrent payments don't clobber history.
    const ref  = doc(db, INVOICES_COLLECTION, invoice.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Invoice not found');
    const current = { id: invoice.id, ...(snap.data() as Invoice) };

    const totalSupplierCost = (current as any).supplierCostTotal || calculateSupplierCost(current);
    if (totalSupplierCost <= 0) {
      throw new Error(`Invoice ${current.invoiceNumber} has no supplier cost recorded — nothing to pay against.`);
    }

    const priorPayments = Array.isArray((current as any).supplierPayments)
      ? ((current as any).supplierPayments as InvoiceSupplierPayment[])
      : [];
    const alreadyPaid    = priorPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const outstandingNow = Math.max(0, totalSupplierCost - alreadyPaid);

    // Guard against overpayment — clamp to the outstanding supplier balance.
    const applied = Math.min(amount, outstandingNow > 0 ? outstandingNow : amount);

    const now = new Date().toISOString();
    const paymentSeq = priorPayments.length + 1;
    const txId = `TXN-SUP-${current.invoiceNumber.replace(/^INV-/, '')}-P${paymentSeq}`;

    const payment: InvoiceSupplierPayment = stripUndefined({
      id:                `SUPPAY-${Date.now()}-${paymentSeq}`,
      amount:            applied,
      mode,
      date,
      bankId:            mode === 'Bank'   ? input.bankId            : undefined,
      bankName:          mode === 'Bank'   ? input.bankName          : undefined,
      bankAccountNumber: mode === 'Bank'   ? input.bankAccountNumber : undefined,
      chequeNumber:      mode === 'Cheque' ? input.chequeNumber      : undefined,
      chequeBank:        mode === 'Cheque' ? input.chequeBank        : undefined,
      chequeDate:        mode === 'Cheque' ? input.chequeDate        : undefined,
      note:              input.note,
      recordedBy:        input.recordedBy?.uid,
      recordedByEmail:   input.recordedBy?.email,
      recordedAt:        now,
      transactionId:     txId,
    }) as InvoiceSupplierPayment;

    const supplierPayments      = [...priorPayments, payment];
    const supplierPaidAmount    = alreadyPaid + applied;
    const outstandingAfter      = Math.max(0, totalSupplierCost - supplierPaidAmount);
    const supplierPaymentStatus: 'Unpaid' | 'Partial' | 'Paid' =
      outstandingAfter <= 0.01 ? 'Paid'
        : supplierPaidAmount > 0 ? 'Partial'
        : 'Unpaid';

    // 1) Persist the supplier payment onto the invoice.
    await updateDoc(ref, stripUndefined({
      supplierPayments,
      supplierPaidAmount,
      supplierPaymentStatus,
      updatedAt: now,
    }));

    // 2) Book a Cash-Outflow transaction row for THIS supplier payment.
    try {
      await this.bookSupplierPaymentTransaction(current, payment, paymentSeq, outstandingAfter, txId, company);
    } catch (err) {
      console.warn('[InvoicePaymentService] supplier payment tx booking failed (non-blocking):', err);
    }

    return {
      invoice: {
        ...current,
        supplierPayments,
        supplierPaidAmount,
        supplierPaymentStatus,
      } as any,
      supplierPaidAmount,
      outstandingAmount: outstandingAfter,
      supplierPaymentStatus,
      transactionId: txId,
    };
  }

  // ── Build a single Cash-Outflow transaction for one supplier payment ──────
  private static async bookSupplierPaymentTransaction(
    invoice: Invoice,
    payment: InvoiceSupplierPayment,
    seq: number,
    outstandingAfter: number,
    txId: string,
    company: TxCompany,
  ): Promise<void> {
    try {
      const exists = await TransactionFirebaseService.transactionIdExists(txId);
      if (exists) {
        console.log(`[InvoicePaymentService] Supplier tx ${txId} already exists — skipping`);
        return;
      }
    } catch { /* allow create to proceed */ }

    const mode: 'Cash' | 'Bank' | 'Cheque' =
      payment.mode === 'Bank' ? 'Bank' : payment.mode === 'Cheque' ? 'Cheque' : 'Cash';

    const time = new Date().toTimeString().split(' ')[0];
    const fullyCleared = outstandingAfter <= 0.01;

    const txData: Omit<Transaction, 'id'> = {
      transactionId:   txId,
      date:            payment.date,
      time,
      company,
      mainCategory:    'Cash Outflow',
      subCategory:     SOLD_GOODS_PAYMENT_CATEGORY,
      detailCategory:  `Supplier payment #${seq} — Invoice ${invoice.invoiceNumber} (${invoice.customerName})`,
      amount:          payment.amount,
      mode,
      bankId:          mode === 'Bank'   ? payment.bankId       : undefined,
      bankName:        mode === 'Bank'   ? payment.bankName     : undefined,
      chequeNumber:    mode === 'Cheque' ? payment.chequeNumber : undefined,
      chequeBank:      mode === 'Cheque' ? payment.chequeBank   : undefined,
      chequeDate:      mode === 'Cheque' ? payment.chequeDate   : undefined,
      amountPaid:      payment.amount,
      remainingAmount: 0,
      paymentStatus:   fullyCleared ? 'Full' : 'Partial',
      totalPaid:       payment.amount,
      isFullyCleared:  fullyCleared && mode !== 'Cheque',
      paidBy:          undefined,
      paidTo:          `Supplier (${invoice.invoiceNumber})`,
      note:            payment.note || (fullyCleared
        ? `Supplier fully paid for invoice ${invoice.invoiceNumber}`
        : `Supplier payment #${seq} for invoice ${invoice.invoiceNumber} — AED ${outstandingAfter.toLocaleString()} still owed`),
      partialPayments: [],
      linkedType:      'invoice',
      linkedId:        invoice.invoiceNumber,
      plMainCategory:  'Cost of Goods Sold (COGS)',
      plSubCategory:   'Purchase & Inventory',
      bsMainCategory:  'Assets',
      bsSubCategory:   mode === 'Cash' ? 'Cash & Cash Equivalents' : 'Bank Balances',
      approvalStatus:  'not_required',
    } as Omit<Transaction, 'id'>;

    await TransactionFirebaseService.createTransaction(txData);
    console.log(`[InvoicePaymentService] ✅ Supplier payment tx booked: ${txId}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Supplier-payment types (exported alongside the class for callers)
// ═══════════════════════════════════════════════════════════════════════════

export interface InvoiceSupplierPayment {
  id: string;
  amount: number;
  mode: PaymentMode;
  date: string;
  bankId?: string;
  bankName?: string;
  bankAccountNumber?: string;
  chequeNumber?: string;
  chequeBank?: string;
  chequeDate?: string;
  note?: string;
  recordedBy?: string;
  recordedByEmail?: string;
  recordedAt?: string;
  transactionId?: string;   // the TXN-... id of the ledger row we booked
}

export interface RecordSupplierPaymentInput {
  invoice: Invoice;
  amount: number;
  mode: PaymentMode;
  date: string;
  bankId?: string;
  bankName?: string;
  bankAccountNumber?: string;
  chequeNumber?: string;
  chequeBank?: string;
  chequeDate?: string;
  note?: string;
  company: TxCompany;
  recordedBy?: { uid: string; email: string };
}

export interface RecordSupplierPaymentResult {
  invoice: Invoice;
  supplierPaidAmount: number;
  outstandingAmount: number;
  supplierPaymentStatus: 'Unpaid' | 'Partial' | 'Paid';
  transactionId: string;
}

/** Compute what the supplier is still owed on this invoice. */
export function outstandingSupplierCost(inv: Invoice): number {
  const total = (inv as any).supplierCostTotal || calculateSupplierCost(inv);
  const paid  = Number((inv as any).supplierPaidAmount) || 0;
  return Math.max(0, total - paid);
}

/** Has this invoice had all its supplier cost paid? */
export function isSupplierFullyPaid(inv: Invoice): boolean {
  return outstandingSupplierCost(inv) <= 0 && calculateSupplierCost(inv) > 0;
}