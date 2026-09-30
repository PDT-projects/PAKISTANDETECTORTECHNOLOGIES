// Transactions Module - Business Logic Service (no Firestore)

import {
  Transaction, TransactionFilters, TransactionStats, LOAN_SUB_CATEGORIES, BSMainCategory,
  AccountType, CASH_IN_HAND_ID, CASH_IN_HAND_NAME,
} from './types';
import { formatGlobalCurrency } from '../../../shared/currency/globalCurrency';

export const getTransactionTotals = (t: Transaction) => {
  const partialTotal = (t.partialPayments || []).reduce((s, p) => s + p.amount, 0);

  // Priority order for totalPaid:
  // 1. Sum of partialPayments (most accurate, set by addPartialPayment)
  // 2. t.remainingAmount stored in Firestore — if present, back-calculate paid amount
  // 3. t.amountPaid — explicitly stored paid amount
  // 4. If paymentStatus === 'Full', the whole amount is paid
  // 5. Default to 0 — NEVER fall back to t.amount (that would mean "fully paid")
  let totalPaid: number;
  if (partialTotal > 0) {
    totalPaid = partialTotal;
  } else if (t.remainingAmount != null) {
    totalPaid = Math.max(0, (t.amount ?? 0) - t.remainingAmount);
  } else if (t.amountPaid != null) {
    totalPaid = t.amountPaid;
  } else if (t.paymentStatus === 'Full') {
    totalPaid = t.amount ?? 0;
  } else {
    totalPaid = 0;
  }

  const remaining = Math.max(0, (t.amount ?? 0) - totalPaid);
  return { totalPaid, remainingAmount: remaining };
};

export const isPending = (t: Transaction): boolean => {
  // Transactions awaiting or rejected from approval are NEVER payment-pending.
  if (t.approvalStatus === 'pending_approval') return false;
  if (t.approvalStatus === 'rejected')         return false;

  // Fast-exit: Firestore already flagged it as fully cleared/paid.
  if (t.isFullyCleared)           return false;
  if (t.paymentStatus === 'Full') return false;

  // ── Source-of-truth: remaining balance ───────────────────────────────────
  // remainingAmount is persisted by addPartialPayment so it is always up to date.
  // If nothing is left to pay, the transaction is NOT pending — regardless of
  // isCleared flags on individual payments.
  //
  // WHY THIS MATTERS: Cash payments are saved with isCleared: false because they
  // haven't been manually "bank-confirmed", but the money is already paid/received.
  // The old logic checked hasUnclearedPartial BEFORE remainingAmount, which trapped
  // every Cash-paid transaction as Pending forever even at Rs 0 remaining.
  const { remainingAmount } = getTransactionTotals(t);
  if (remainingAmount <= 0) return false;

  // Still has an outstanding balance — it IS pending.
  return true;
};

// FIX: When filtering by 'Loan', match both mainCategory === 'Loan'
// AND inflow/outflow transactions whose subCategory is a loan sub-category.
export const isLoanTransaction = (t: Transaction): boolean => {
  if (t.mainCategory === 'Loan') return true;
  if (LOAN_SUB_CATEGORIES.has(t.subCategory)) return true;
  return false;
};

export const filterTransactions = (transactions: Transaction[], filters: TransactionFilters): Transaction[] =>
  transactions.filter(t => {
    if (filters.searchTerm) {
      const s = filters.searchTerm.toLowerCase();
      if (!t.company.toLowerCase().includes(s) &&
          !t.mainCategory.toLowerCase().includes(s) &&
          !t.subCategory.toLowerCase().includes(s) &&
          !t.note.toLowerCase().includes(s) &&
          !(t.transactionId || '').toLowerCase().includes(s) &&
          !(t.paidBy || '').toLowerCase().includes(s) &&
          !(t.paidTo || '').toLowerCase().includes(s)) return false;
    }
    if (filters.mainCategory) {
      if (filters.mainCategory === 'Loan') {
        if (!isLoanTransaction(t)) return false;
      } else {
        if (t.mainCategory !== filters.mainCategory) return false;
      }
    }
    if (filters.dateFrom && t.date < filters.dateFrom) return false;
    if (filters.dateTo   && t.date > filters.dateTo)   return false;
    if (filters.company  && t.company !== filters.company) return false;
    if (filters.paymentStatus) {
      if (filters.paymentStatus === 'Pending' && !isPending(t)) return false;
      if (filters.paymentStatus === 'Full' && isPending(t)) return false;
    }
    if (filters.approvalStatus) {
      if (t.approvalStatus !== filters.approvalStatus) return false;
    }
    return true;
  });

/**
 * Calculate stats for APPROVED / not_required transactions only.
 * pending_approval and rejected transactions have zero liquidity impact
 * and must not inflate inflow/outflow/balance figures.
 */
export const calculateStats = (transactions: Transaction[]): TransactionStats => {
  const liquid = transactions.filter(
    t => t.approvalStatus === 'approved' || t.approvalStatus === 'not_required' || !t.approvalStatus
  );

  const totalInflow  = liquid.filter(t => t.mainCategory === 'Cash Inflow').reduce((s, t) => s + t.amount, 0);
  const totalOutflow = liquid.filter(t => t.mainCategory === 'Cash Outflow').reduce((s, t) => s + t.amount, 0);
  const pending      = liquid.filter(isPending);
  return {
    totalInflow, totalOutflow,
    netBalance:            totalInflow - totalOutflow,
    transactionCount:      transactions.length,
    pendingCount:          pending.length,
    totalPending:          pending.reduce((s, t) => s + getTransactionTotals(t).remainingAmount, 0),
    pendingApprovalCount:  transactions.filter(t => t.approvalStatus === 'pending_approval').length,
  };
};

export const formatCurrency = (amount: number): string => formatGlobalCurrency(amount);

export const formatDate = (d: string): string =>
  d ? new Date(d).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

export const formatDateTime = (date: string, time?: string): string => {
  const dateStr = formatDate(date);
  return time ? `${dateStr} ${time}` : dateStr;
};

export const getCategoryColor = (category: string): string => {
  if (category === 'Cash Inflow')  return 'bg-green-100 text-green-800';
  if (category === 'Cash Outflow') return 'bg-red-100 text-red-800';
  if (category === 'Loan')         return 'bg-blue-100 text-blue-800';
  return 'bg-gray-100 text-gray-800';
};

export const getPaymentStatusColor = (t: Transaction): string => {
  const { remainingAmount } = getTransactionTotals(t);
  const hasUncleared = (t.partialPayments || []).some(p => !p.isCleared);
  if (remainingAmount === 0 && !hasUncleared) return 'bg-green-100 text-green-800 border-green-200';
  if (hasUncleared) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-orange-100 text-orange-800 border-orange-200';
};

export const exportToCSV = (transactions: Transaction[]): string => {
  const headers = ['Transaction ID', 'Date', 'Time', 'Company', 'Main Category', 'Sub Category', 'Amount', 'Paid', 'Remaining', 'Mode', 'Paid By', 'Paid To', 'Status', 'Approval', 'Note'];
  const rows = transactions.map(t => {
    const { totalPaid, remainingAmount } = getTransactionTotals(t);
    return [
      t.transactionId, t.date, t.time, t.company, t.mainCategory, t.subCategory,
      t.amount.toString(), totalPaid.toString(), remainingAmount.toString(),
      t.mode, t.paidBy || '', t.paidTo || '',
      isPending(t) ? 'Pending' : 'Cleared',
      t.approvalStatus || 'not_required',
      t.note,
    ];
  });
  return [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
};

export const downloadCSV = (csv: string, filename: string) => {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ── Balance Sheet Bucket Resolver ─────────────────────────────────────────────
export const resolveBSBucket = (t: Transaction): { bsMain: string; bsSub: string } | null => {
  if (t.bsMainCategory && t.bsSubCategory) {
    return { bsMain: t.bsMainCategory!, bsSub: t.bsSubCategory! };
  }

  const sub = t.subCategory || '';

  if (t.mainCategory === 'Cash Inflow' && !LOAN_SUB_CATEGORIES.has(sub)) {
    return { bsMain: 'Assets', bsSub: 'Cash & Cash Equivalents' };
  }
  if (sub === 'Purchase') {
    return { bsMain: 'Assets', bsSub: 'Inventory' };
  }
  if (LOAN_SUB_CATEGORIES.has(sub) && t.mainCategory === 'Cash Inflow') {
    return { bsMain: 'Assets', bsSub: 'Accounts Receivable' };
  }
  if (t.mainCategory === 'Cash Outflow') {
    const payableSubs = [
      'Payment to company', 'Payment to person', 'Purchase',
      'Office Rent', 'Electricity Bill', 'Gas Bill'
    ];
    if (payableSubs.includes(sub)) {
      return { bsMain: 'Liabilities & Equity', bsSub: 'Accounts Payable' };
    }
  }
  if (LOAN_SUB_CATEGORIES.has(sub) && t.mainCategory === 'Cash Outflow') {
    return { bsMain: 'Liabilities & Equity', bsSub: 'Short-term Loans' };
  }
  const opExSubs = ['Employee salary', 'Office Rent', 'Utilities'];
  if (t.mainCategory === 'Cash Outflow' && opExSubs.some(s => sub.includes(s))) {
    return { bsMain: 'Liabilities & Equity', bsSub: 'Accrued Expenses' };
  }

  return null;
};
// ═══════════════════════════════════════════════════════════════════════════
// Phase 1 — Read helpers for the new UI model (accounts, three-level categories)
//
// Every helper here reads from BOTH shapes:
//   • New records write the explicit `accountId` / `accountType` / `subCategoryDetail` fields.
//   • Legacy records only have `mode` + `bankId` + `subCategory`.
// Consumers (list, form, stats) call these helpers instead of touching the raw
// fields, so display stays consistent regardless of when the record was written.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve the account a transaction belongs to. Falls back to legacy `mode`
 * + `bankId` when the new fields aren't populated. Cash / Cheque with no bank
 * ref map to the virtual Cash-in-Hand account.
 */
export const getTxAccount = (
  t: Transaction,
): { id: string; type: AccountType; name: string } => {
  if (t.accountId && t.accountType) {
    return {
      id:   t.accountId,
      type: t.accountType,
      name: t.accountName || t.bankName || (t.accountType === 'cash' ? CASH_IN_HAND_NAME : 'Bank'),
    };
  }
  // Legacy fallback: derive from mode + bank fields
  if ((t.mode === 'Bank' || t.mode === 'Cheque') && t.bankId) {
    return { id: t.bankId, type: 'bank', name: t.bankName || 'Bank' };
  }
  return { id: CASH_IN_HAND_ID, type: 'cash', name: CASH_IN_HAND_NAME };
};

/**
 * Resolve the three-level category path.
 *   type      → UI "TYPE" (Inflow / Outflow / Loan)
 *   category  → UI "CATEGORY" (the mid-level tag)
 *   subCategory → UI "SUB CATEGORY" (the third level, optional)
 */
export const getTxCategoryPath = (t: Transaction): {
  type: string;
  category: string;
  subCategory: string | undefined;
} => ({
  type:        t.mainCategory,
  category:    t.subCategory,
  subCategory: t.subCategoryDetail,
});

/**
 * Which transactions actually affect a live balance:
 *   • pending_approval → not yet committed to the ledger
 *   • rejected         → cancelled, doesn't count
 * Everything else (approved or not_required legacy records) does count.
 */
const isLiquid = (t: Transaction) =>
  t.approvalStatus === 'approved' ||
  t.approvalStatus === 'not_required' ||
  !t.approvalStatus;

/**
 * "Realized" amount for balance math — the amount that actually moved money.
 * For Full payments it's the transaction amount; for Partial it's what has
 * been paid so far (amountPaid or the sum of partialPayments via
 * getTransactionTotals). Never uses `amount` when a partial is in play, so
 * balances don't get inflated for money still owed.
 */
const realizedAmount = (t: Transaction): number => {
  const { totalPaid } = getTransactionTotals(t);
  return totalPaid;
};

/**
 * Live balance for the virtual Cash-in-Hand account.
 * Iterates cash-type transactions only, adds inflows, subtracts outflows.
 *
 * `seedBalance` is the Cash-in-Hand OPENING balance (settings/cashOpening.amount).
 * It mirrors how computeBankBalance already seeds from the bank doc's balance.
 * Callers that omit it get the raw ledger delta — which is exactly the bug that
 * made the transaction modal's Account dropdown ignore the opening balance, so
 * pass it everywhere the number is shown to a user.
 */
export const computeCashInHandBalance = (
  transactions: Transaction[],
  seedBalance = 0,
): number => {
  let bal = seedBalance;
  for (const t of transactions) {
    if (!isLiquid(t)) continue;
    if (getTxAccount(t).type !== 'cash') continue;
    if (t.mainCategory === 'Cash Inflow')      bal += realizedAmount(t);
    else if (t.mainCategory === 'Cash Outflow') bal -= realizedAmount(t);
  }
  return bal;
};

/**
 * Live balance for a specific bank account. Optionally seed with an opening
 * balance stored on the bank doc — final balance is opening + ledger delta.
 */
export const computeBankBalance = (
  transactions: Transaction[],
  bankId: string,
  seedBalance = 0,
): number => {
  let bal = seedBalance;
  for (const t of transactions) {
    if (!isLiquid(t)) continue;
    const acc = getTxAccount(t);
    if (acc.type !== 'bank' || acc.id !== bankId) continue;
    if (t.mainCategory === 'Cash Inflow')      bal += realizedAmount(t);
    else if (t.mainCategory === 'Cash Outflow') bal -= realizedAmount(t);
  }
  return bal;
};

/**
 * Inflow / Outflow / Net for a given month (defaults to the current month).
 * Used by the summary bar's "INFLOW · MO" / "OUTFLOW · MO" / "NET · MO" cards.
 */
/**
 * Inflow / Outflow / Net across the ENTIRE ledger, no date window.
 *
 * The reconcile panel needs this: it adds opening + inflows − outflows and
 * compares the result against the sum of all account balances, which are
 * themselves all-time. Feeding it computeMonthlyFlow() only agreed while every
 * transaction in the system sat inside the current month.
 */
export const computeTotalFlow = (
  transactions: Transaction[],
): { inflow: number; outflow: number; net: number } => {
  let inflow = 0, outflow = 0;
  for (const t of transactions) {
    if (!isLiquid(t)) continue;
    if (t.mainCategory === 'Cash Inflow')       inflow  += realizedAmount(t);
    else if (t.mainCategory === 'Cash Outflow') outflow += realizedAmount(t);
  }
  return { inflow, outflow, net: inflow - outflow };
};

export const computeMonthlyFlow = (
  transactions: Transaction[],
  now: Date = new Date(),
): { inflow: number; outflow: number; net: number } => {
  const y = now.getFullYear();
  const m = now.getMonth();
  let inflow = 0, outflow = 0;
  for (const t of transactions) {
    if (!isLiquid(t)) continue;
    if (!t.date) continue;
    const d = new Date(t.date);
    if (d.getFullYear() !== y || d.getMonth() !== m) continue;
    if (t.mainCategory === 'Cash Inflow')       inflow  += realizedAmount(t);
    else if (t.mainCategory === 'Cash Outflow') outflow += realizedAmount(t);
  }
  return { inflow, outflow, net: inflow - outflow };
};
// ─────────────────────────────────────────────────────────────────────────────
// Sub-category outstanding balance
//
// Sub-categories under Account Receivable / Account Payable are used to name a
// counterparty ("Loan to Khalid"). Unlike the free-text Paid By / Paid To
// fields, a sub-category is always PICKED from a dropdown, so the same person
// is always spelled the same way — which makes it a reliable grouping key.
//
// Uses realizedAmount() — the SAME basis as computeCashInHandBalance. This
// matters: entering Total 20,000 / Received 10,000 moves cash by 10,000, so the
// counterparty balance must move by 10,000 too. Using the face `amount` here
// made a single entry shift the two numbers by different amounts, which reads
// as a bug to anyone comparing them. The unpaid remainder isn't owed yet —
// nobody has handed it over.
//
// Legacy rows written before totalPaid existed fall back to `amount`, so an
// old loan doesn't silently read as never having left the drawer.
// ─────────────────────────────────────────────────────────────────────────────

/** Which side of the ledger a CATEGORY (transaction.subCategory) sits on. */
export const sideOfCategory = (category: string): 'receivable' | 'payable' | null => {
  const c = String(category || '').trim().toLowerCase();
  if (c.includes('receivable')) return 'receivable';
  if (c.includes('payable'))    return 'payable';
  return null;
};

/** Money that actually moved, falling back to face value for legacy rows. */
const movedAmount = (t: Transaction): number => {
  const hasPaymentFields =
    t.totalPaid !== undefined || t.amountPaid !== undefined || t.paymentStatus !== undefined;
  return hasPaymentFields ? realizedAmount(t) : (Number(t.amount) || 0);
};

/**
 * Outstanding balance for one sub-category (i.e. one counterparty).
 *
 * Receivable: money OUT raises it (we lent), money IN lowers it (they repaid).
 * Payable:    money IN raises it (we borrowed), money OUT lowers it (we repaid).
 *
 * @returns null when the category has no side (e.g. "Sales Invoice") or no
 *          sub-category is selected — callers should render nothing.
 */
export const computeSubCategoryRemaining = (
  transactions: Transaction[],
  category: string,
  subCategory: string,
): { remaining: number; given: number; returned: number; count: number } | null => {
  const side = sideOfCategory(category);
  if (!side || !subCategory) return null;

  const target = String(subCategory).trim().toLowerCase();
  let raises = 0, lowers = 0, count = 0;

  for (const t of transactions || []) {
    if (!isLiquid(t)) continue;
    if (String(t.subCategoryDetail || '').trim().toLowerCase() !== target) continue;
    if (sideOfCategory(t.subCategory) !== side) continue;

    const amount = movedAmount(t);
    if (amount === 0) continue;

    const isInflow = t.mainCategory === 'Cash Inflow';
    const raisesBalance = side === 'receivable' ? !isInflow : isInflow;

    if (raisesBalance) raises += amount;
    else               lowers += amount;
    count++;
  }

  return {
    remaining: raises - lowers,
    given:     raises,
    returned:  lowers,
    count,
  };
};
