// Shared Service — TransactionBridgeService.ts
// Creates a Transaction record automatically whenever an Invoice or Inventory
// payment is saved. Keeps the transactions ledger complete without requiring
// the user to manually re-enter data that is already known.
//
// Missing fields that must be supplied by the caller:
//   - company  (office/branch)   — asked inline in Invoice & Inventory payment forms
//   - plMainCategory / plSubCategory  — auto-mapped based on context

import { TransactionFirebaseService } from '../../transactions/models/transactionFirebaseService';
import { Transaction } from '../../transactions/models/types';

export type TxCompany =
  | 'Bullion Electronics - Saudia'
  | 'Bullion Electronics - Dubai'
  | 'Bullion Electronics - Chad'
  | 'Bullion Electronics - Sudan'
  | 'Bullion Electronics - Other';

export interface InvoiceTxPayload {
  invoiceNumber:  string;
  date:           string;
  customerName:   string;
  totalAmount:    number;
  paidAmount:     number;
  paymentMode:    'Cash' | 'Bank' | 'Cheque';
  bankId?:        string;
  bankName?:      string;
  chequeNumber?:  string;
  chequeBank?:    string;
  chequeDate?:    string;
  paymentStatus:  'Full' | 'Partial' | 'Unpaid';
  company:        TxCompany;
  salesperson?:   string;
  note?:          string;
  digitalStamp?:  boolean;
}

export interface InventoryTxPayload {
  transactionId:  string;   // INV-DDMMYY-NNN
  brandName:      string;
  modelName:      string;
  date:           string;
  totalAmount:    number;
  paidAmount:     number;
  paymentStatus:  'paid' | 'unpaid' | 'partial';
  paymentMode:    'cash' | 'bank';
  bankId?:        string;
  bankName?:      string;
  installments?:  Array<{ mode: string; bankId?: string; bankName?: string; amount: number; note?: string; date: string }>;
  company:        TxCompany;
  note?:          string;
}

// ── Auto-generate a sequential-style TXN ID linked to the source ──────────────
function makeTxId(prefix: 'INV' | 'INVY', sourceId: string): string {
  // e.g. INV-240426-001 → TXN-INV-240426-001
  //      inventory INV-240426-003 → TXN-INVY-240426-003
  return `TXN-${prefix}-${sourceId.replace(/^(INV-|INVY-)/, '')}`;
}

// ── Create transaction from Invoice save ──────────────────────────────────────
export async function createTransactionFromInvoice(payload: InvoiceTxPayload): Promise<void> {
  if (payload.paymentStatus === 'Unpaid' || payload.paidAmount <= 0) return;

  const txId = makeTxId('INV', payload.invoiceNumber);

  // Avoid duplicate if invoice is re-saved (edit)
  try {
    const exists = await TransactionFirebaseService.transactionIdExists(txId);
    if (exists) {
      // Update existing instead
      // (transaction already logged from original save — skip to avoid double entry)
      console.log(`[TxBridge] Transaction ${txId} already exists — skipping duplicate`);
      return;
    }
  } catch { /* allow create to proceed */ }

  const mode = payload.paymentMode === 'Bank'   ? 'Bank'
             : payload.paymentMode === 'Cheque' ? 'Cheque'
             : 'Cash';

  const now  = new Date();
  const time = now.toTimeString().split(' ')[0];

  const isPartial = payload.paymentStatus === 'Partial';
  const remaining = Math.max(0, payload.totalAmount - payload.paidAmount);

  const txData: Omit<Transaction, 'id'> = {
    transactionId:   txId,
    date:            payload.date,
    time,
    company:         payload.company,
    mainCategory:    'Cash Inflow',
    subCategory:     'Invoice / Sale',
    detailCategory:  `Invoice: ${payload.invoiceNumber} — ${payload.customerName}`,
    amount:          payload.totalAmount,
    mode,
    bankId:          mode === 'Bank'   ? payload.bankId   : undefined,
    bankName:        mode === 'Bank'   ? payload.bankName : undefined,
    chequeNumber:    mode === 'Cheque' ? payload.chequeNumber : undefined,
    chequeBank:      mode === 'Cheque' ? payload.chequeBank   : undefined,
    chequeDate:      mode === 'Cheque' ? payload.chequeDate   : undefined,
    amountPaid:      payload.paidAmount,
    remainingAmount: remaining,
    paymentStatus:   isPartial ? 'Partial' : 'Full',
    totalPaid:       payload.paidAmount,
    isFullyCleared:  !isPartial && mode !== 'Cheque',
    paidBy:          payload.customerName,
    paidTo:          undefined,
    note:            payload.note || `Invoice ${payload.invoiceNumber}${payload.salesperson ? ` — SP: ${payload.salesperson}` : ''}`,
    partialPayments: [],
    linkedType:      'invoice',
    linkedId:        payload.invoiceNumber,
    // P&L: Invoice sale = Revenue
    plMainCategory:  'Revenue',
    plSubCategory:   'Service / Invoice Sales',
    // Balance Sheet: cash/bank asset increases
    bsMainCategory:  'Assets',
    bsSubCategory:   mode === 'Cash' ? 'Cash & Cash Equivalents' : 'Bank Balances',
    approvalStatus:  'not_required',   // Inflow never needs approval
  };

  await TransactionFirebaseService.createTransaction(txData);
  console.log(`[TxBridge] ✅ Invoice transaction created: ${txId}`);
}

// ── Create transaction(s) from Inventory payment ──────────────────────────────
// If instalments exist, creates one transaction row per instalment.
// Otherwise creates a single transaction for the full payment.
export async function createTransactionFromInventory(payload: InventoryTxPayload): Promise<void> {
  if (payload.paymentStatus === 'unpaid' || payload.paidAmount <= 0) return;

  const now  = new Date();
  const time = now.toTimeString().split(' ')[0];

  const description = `${payload.brandName} ${payload.modelName} — ${payload.transactionId}`;

  if (payload.installments && payload.installments.length > 0) {
    // One transaction row per instalment
    for (const [idx, inst] of payload.installments.entries()) {
      const instTxId = `TXN-INVY-${payload.transactionId.replace(/^INV-/, '')}-${idx + 1}`;
      try {
        const exists = await TransactionFirebaseService.transactionIdExists(instTxId);
        if (exists) { console.log(`[TxBridge] ${instTxId} already exists — skipping`); continue; }
      } catch { /* allow */ }

      const instMode = inst.mode === 'bank' ? 'Bank' : 'Cash';
      const txData: Omit<Transaction, 'id'> = {
        transactionId:   instTxId,
        date:            inst.date || payload.date,
        time,
        company:         payload.company,
        mainCategory:    'Cash Outflow',
        subCategory:     'Inventory Purchase',
        detailCategory:  `${description} — Instalment #${idx + 1}${inst.note ? ` (${inst.note})` : ''}`,
        amount:          inst.amount,
        mode:            instMode as 'Cash' | 'Bank',
        bankId:          instMode === 'Bank' ? inst.bankId   : undefined,
        bankName:        instMode === 'Bank' ? inst.bankName : undefined,
        amountPaid:      inst.amount,
        remainingAmount: 0,
        paymentStatus:   'Full',
        totalPaid:       inst.amount,
        isFullyCleared:  true,
        paidBy:          undefined,
        paidTo:          'Supplier',
        note:            payload.note || description,
        partialPayments: [],
        linkedType:      'inventory',
        linkedId:        payload.transactionId,
        // P&L: Inventory purchase = COGS
        plMainCategory:  'Cost of Goods Sold (COGS)',
        plSubCategory:   'Purchase & Inventory',
        // Balance Sheet: inventory asset increases, cash/bank decreases
        bsMainCategory:  'Assets',
        bsSubCategory:   'Inventory',
        approvalStatus:  'not_required',   // Outflow from system; already approved by adding
      };
      await TransactionFirebaseService.createTransaction(txData);
      console.log(`[TxBridge] ✅ Inventory instalment transaction: ${instTxId}`);
    }
  } else {
    // Single payment transaction
    const txId = `TXN-INVY-${payload.transactionId.replace(/^INV-/, '')}`;
    try {
      const exists = await TransactionFirebaseService.transactionIdExists(txId);
      if (exists) { console.log(`[TxBridge] ${txId} already exists — skipping`); return; }
    } catch { /* allow */ }

    const mode = payload.paymentMode === 'bank' ? 'Bank' : 'Cash';
    const isPartial = payload.paymentStatus === 'partial';
    const remaining = Math.max(0, payload.totalAmount - payload.paidAmount);

    const txData: Omit<Transaction, 'id'> = {
      transactionId:   txId,
      date:            payload.date,
      time,
      company:         payload.company,
      mainCategory:    'Cash Outflow',
      subCategory:     'Inventory Purchase',
      detailCategory:  description,
      amount:          payload.totalAmount,
      mode:            mode as 'Cash' | 'Bank',
      bankId:          mode === 'Bank' ? payload.bankId   : undefined,
      bankName:        mode === 'Bank' ? payload.bankName : undefined,
      amountPaid:      payload.paidAmount,
      remainingAmount: remaining,
      paymentStatus:   isPartial ? 'Partial' : 'Full',
      totalPaid:       payload.paidAmount,
      isFullyCleared:  !isPartial,
      paidBy:          undefined,
      paidTo:          'Supplier',
      note:            payload.note || description,
      partialPayments: [],
      linkedType:      'inventory',
      linkedId:        payload.transactionId,
      plMainCategory:  'Cost of Goods Sold (COGS)',
      plSubCategory:   'Purchase & Inventory',
      bsMainCategory:  'Assets',
      bsSubCategory:   'Inventory',
      approvalStatus:  'not_required',
    };
    await TransactionFirebaseService.createTransaction(txData);
    console.log(`[TxBridge] ✅ Inventory transaction created: ${txId}`);
  }
}