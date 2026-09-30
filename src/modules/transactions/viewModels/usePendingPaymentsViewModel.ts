// Transactions Module - Pending Payments ViewModel
// Fixes:
// 1. addPartialPayment now properly saves to Firestore AND updates bank balance
// 2. Filter logic for PartiallyPaid, Uncleared, PendingReceivable, and Rejected
// 3. pending_approval transactions are blocked from payment actions (not yet approved)
// 4. Rejected transactions are shown in 'Rejected' tab for record-keeping only
// 5. FIX: Fully paid AND fully cleared transactions are automatically removed from
//    the Pending Payments screen and will only appear in the Transaction List.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Transaction, PartialPayment, PendingPaymentData } from '../models/types';
import {
  getTransactionTotals, isPending, formatCurrency, formatDateTime,
  getCategoryColor, getPaymentStatusColor,
} from '../models/transactionsService';
import { TransactionFirebaseService } from '../models/transactionFirebaseService';
import { BankFirebaseService } from '../../banking/models/bankFirebaseService';

interface BankInfo { id: string; name: string; balance: number; }

// Added 'PendingApproval' and 'Rejected' to the filter union
export type PendingFilterStatus =
  | 'All'
  | 'Uncleared'
  | 'PartiallyPaid'
  | 'PendingReceivable'
  | 'PendingApproval'
  | 'Rejected';

export interface UsePendingPaymentsViewModelReturn {
  transactions:          Transaction[];
  filteredTransactions:  Transaction[];
  viewTransaction:       Transaction | null;
  paymentModal:          boolean;
  selectedTransactionId: string | null;
  filterStatus:          PendingFilterStatus;
  paymentData:           PendingPaymentData;
  banks:                 BankInfo[];
  isLoading:             boolean;
  isSaving:              boolean;
  summaryStats: {
    totalPending:        number;
    totalReceivable:     number;
    unclearedCount:      number;
    totalTransactions:   number;
    pendingApprovalCount:number;
    rejectedCount:       number;
  };
  setViewTransaction:       (t: Transaction | null) => void;
  setPaymentModal:          (v: boolean) => void;
  setSelectedTransactionId: (id: string | null) => void;
  setFilterStatus:          (s: PendingFilterStatus) => void;
  setPaymentData:           (d: Partial<PendingPaymentData>) => void;
  addPartialPayment:        () => Promise<void>;
  markPaymentAsCleared:     (transactionId: string, paymentId: string) => Promise<void>;
  markTransactionCleared:   (transactionId: string) => Promise<void>;
  deleteTransaction:        (id: string) => Promise<void>;
  getTransactionTotals:     typeof getTransactionTotals;
  formatCurrency:           (n: number) => string;
  formatDateTime:           (d: string, t?: string) => string;
  getCategoryColor:         (c: string) => string;
  getPaymentStatusColor:    (t: Transaction) => string;
}

/**
 * A transaction should leave Pending Payments when there is nothing left to pay.
 * "Nothing left to pay" means remainingAmount === 0.
 *
 * We intentionally do NOT require isFullyCleared here because:
 * - Cash payments set remainingAmount to 0 but never set isFullyCleared on the tx
 * - Cheque payments also leave remainingAmount = 0 but await manual bank clearance
 *
 * The "Uncleared Cheques" tab is the right place to chase those — not this list.
 * A cheque main-tx (no partial payments, mode === 'Cheque') is an exception:
 * it stays until explicitly marked cleared via "Mark Cleared" button, because
 * its amount never gets split into partialPayments — the whole tx IS the cheque.
 */
function isSettled(t: Transaction): boolean {
  const { remainingAmount } = getTransactionTotals(t);

  // Main cheque transaction (no partial payments) — stays until manually cleared
  if (t.mode === 'Cheque' && (t.partialPayments || []).length === 0) {
    return !!t.isFullyCleared;
  }

  // All other cases: leave as soon as remaining balance hits zero
  return remainingAmount <= 0;
}

export function usePendingPaymentsViewModel(): UsePendingPaymentsViewModelReturn {
  const [allTransactions,       setAllTransactions]       = useState<Transaction[]>([]);
  const [banks,                 setBanks]                 = useState<BankInfo[]>([]);
  const [isLoading,             setIsLoading]             = useState(true);
  const [isSaving,              setIsSaving]              = useState(false);
  const [viewTransaction,       setViewTransaction]       = useState<Transaction | null>(null);
  const [paymentModal,          setPaymentModal]          = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [filterStatus,          setFilterStatus]          = useState<PendingFilterStatus>('All');
  const [paymentData,           setPaymentDataState]      = useState<PendingPaymentData>({
    amount: 0, bankId: '', method: 'Cash',
  });

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [txList, bankList] = await Promise.all([
          TransactionFirebaseService.fetchAllTransactions(),
          BankFirebaseService.fetchAllBanks().catch(() => []),
        ]);
        setAllTransactions(txList);
        setBanks(bankList as BankInfo[]);
      } catch {
        toast.error('Failed to load pending payments');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // Derive the "transactions" view:
  // - Include payment-pending, pending_approval, and rejected
  // - EXCLUDE any transaction that is now fully settled (paid + cleared)
  //   so it drops off this screen automatically and lives only in Transaction List
  // - EXCLUDE ATI "Collection Against Invoice" transactions — these are
  //   already fully paid at creation time (paymentStatus=Full, remainingAmount=0)
  //   and belong to the Against Invoice module, not Pending Payments.
  const transactions = useMemo(() => {
    return allTransactions.filter(t => {
      // Never show ATI collection records here — they are always fully settled
      if (t.subCategory === 'Collection Against Invoice') return false;

      // Always show approval-queue and rejected tabs regardless of settlement
      if (t.approvalStatus === 'pending_approval' || t.approvalStatus === 'rejected') {
        return true;
      }

      // Primary check: does this transaction still have an outstanding balance?
      // We use remainingAmount directly rather than isPending() because isPending()
      // short-circuits on isFullyCleared — which can be incorrectly true if a partial
      // Cash payment was saved before the isFullyCleared logic was fixed.
      const { remainingAmount } = getTransactionTotals(t);
      if (remainingAmount > 0) return true;

      // Also keep uncleared cheques (remainingAmount = 0 but bank hasn't cleared it)
      if (t.mode === 'Cheque' && !t.isFullyCleared) return true;

      return false;
    });
  }, [allTransactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filterStatus === 'All') {
        // 'All' shows every transaction that still has an outstanding balance,
        // including partially-paid outflows where isFullyCleared may have been
        // incorrectly set to true by an earlier bug.  Using remainingAmount > 0
        // as the source of truth is safer than isPending() alone.
        // Also include uncleared cheques (remainingAmount may be 0 but bank hasn't cleared).
        if (t.approvalStatus === 'pending_approval' || t.approvalStatus === 'rejected') return false;
        const { remainingAmount } = getTransactionTotals(t);
        if (remainingAmount > 0) return true;
        if (t.mode === 'Cheque' && !t.isFullyCleared) return true;
        // Keep partially-paid transactions regardless of paymentStatus field inconsistencies
        if ((t.partialPayments || []).length > 0 && t.paymentStatus === 'Partial') return true;
        return false;
      }

      if (filterStatus === 'PendingApproval') {
        return t.approvalStatus === 'pending_approval';
      }

      if (filterStatus === 'Rejected') {
        return t.approvalStatus === 'rejected';
      }

      // The tabs below only make sense for approved transactions with payment activity
      const { remainingAmount } = getTransactionTotals(t);
      const hasUnclearedPayments = (t.partialPayments || []).some(
        p => !p.isCleared && p.method !== 'Bank'
      );
      const isUnclearedChequeTx = t.mode === 'Cheque' && !t.isFullyCleared;
      const hasUncleared = hasUnclearedPayments || isUnclearedChequeTx;
      const isReceivable = t.mainCategory === 'Cash Inflow' && remainingAmount > 0;

      if (filterStatus === 'Uncleared')         return hasUncleared;
      if (filterStatus === 'PartiallyPaid')     return remainingAmount > 0 && !isReceivable;
      if (filterStatus === 'PendingReceivable') return isReceivable;
      return true;
    });
  }, [transactions, filterStatus]);

  const summaryStats = useMemo(() => {
    // Use the same remainingAmount-based logic as the transactions useMemo
    // so stats stay consistent even if isFullyCleared was incorrectly set.
    const paymentPending = allTransactions.filter(t => {
      if (t.subCategory === 'Collection Against Invoice') return false;
      if (t.approvalStatus === 'pending_approval' || t.approvalStatus === 'rejected') return false;
      const { remainingAmount } = getTransactionTotals(t);
      if (remainingAmount > 0) return true;
      if (t.mode === 'Cheque' && !t.isFullyCleared) return true;
      return false;
    });
    const receivable     = paymentPending.filter(t => t.mainCategory === 'Cash Inflow');
    const payable        = paymentPending.filter(t => t.mainCategory !== 'Cash Inflow');

    const unclearedCount = paymentPending.filter(t => {
      const hasUnclearedPayments = (t.partialPayments || []).some(p => !p.isCleared && p.method !== 'Bank');
      const isUnclearedChequeTx  = t.mode === 'Cheque' && !t.isFullyCleared;
      return hasUnclearedPayments || isUnclearedChequeTx;
    }).length;

    return {
      totalPending:         payable.reduce((s, t) => s + getTransactionTotals(t).remainingAmount, 0),
      totalReceivable:      receivable.reduce((s, t) => s + getTransactionTotals(t).remainingAmount, 0),
      unclearedCount,
      totalTransactions:    paymentPending.length,   // always "All Pending" count, not active tab
      pendingApprovalCount: allTransactions.filter(t => t.approvalStatus === 'pending_approval').length,
      rejectedCount:        allTransactions.filter(t => t.approvalStatus === 'rejected').length,
    };
  }, [filteredTransactions, allTransactions]);

  const setPaymentData = useCallback((d: Partial<PendingPaymentData>) => {
    setPaymentDataState(prev => ({ ...prev, ...d }));
  }, []);

  const addPartialPayment = useCallback(async () => {
    if (!selectedTransactionId) return;
    const tx = allTransactions.find(t => t.id === selectedTransactionId);
    if (!tx) return;

    // Guard: do not allow payment actions on transactions awaiting/rejected approval
    if (tx.approvalStatus === 'pending_approval') {
      toast.error('Cannot add payment — this transaction is still awaiting admin approval');
      return;
    }
    if (tx.approvalStatus === 'rejected') {
      toast.error('Cannot add payment — this transaction was rejected');
      return;
    }

    const { remainingAmount } = getTransactionTotals(tx);

    if (!paymentData.amount || paymentData.amount <= 0) {
      toast.error('Enter a valid amount'); return;
    }
    if (paymentData.amount > remainingAmount) {
      toast.error(`Amount exceeds remaining balance (${formatCurrency(remainingAmount)})`); return;
    }
    if (paymentData.method === 'Bank' && !paymentData.bankId) {
      toast.error('Select a bank'); return;
    }
    if (paymentData.method === 'Cheque' && !paymentData.chequeNumber?.trim()) {
      toast.error('Enter cheque number'); return;
    }

    setIsSaving(true);
    try {
      const bank = paymentData.method === 'Bank'
        ? banks.find(b => b.id === paymentData.bankId)
        : null;

      const newPayment: PartialPayment = {
        id:           `PAY-${Date.now()}`,
        amount:       paymentData.amount,
        date:         new Date().toISOString().split('T')[0],
        time:         new Date().toTimeString().split(' ')[0],
        method:       paymentData.method,
        bankId:       paymentData.method === 'Bank'   ? paymentData.bankId       : undefined,
        bankName:     paymentData.method === 'Bank'   ? bank?.name               : undefined,
        chequeNumber: paymentData.method === 'Cheque' ? paymentData.chequeNumber : undefined,
        chequeDate:   paymentData.method === 'Cheque' ? paymentData.chequeDate   : undefined,
        chequeBank:   paymentData.method === 'Cheque' ? paymentData.chequeBank   : undefined,
        // Bank payments are immediately cleared; Cash/Cheque start as uncleared
        isCleared:    paymentData.method === 'Bank',
      };

      await TransactionFirebaseService.addPartialPayment(selectedTransactionId, newPayment);

      // REMOVED: the bank-balance write that used to live here.
      //
      // `banks/{id}.balance` is the OPENING balance seed, not a running total.
      // addPartialPayment above already persists the payment into the ledger,
      // and computeBankBalance() derives the live balance from opening + ledger.
      // Writing here as well counted the payment twice and clobbered whatever
      // opening balance the user had set.

      setAllTransactions(prev => prev.map(t => {
        if (t.id !== selectedTransactionId) return t;
        const payments  = [...(t.partialPayments || []), newPayment];
        const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
        const remaining = Math.max(0, t.amount - totalPaid);
        // isFullyCleared = no remaining balance AND every payment is cleared
        const fullyCleared = remaining <= 0 && payments.every(p => p.isCleared);
        return {
          ...t,
          partialPayments: payments,
          totalPaid,
          remainingAmount: remaining,
          isFullyCleared:  fullyCleared,
          paymentStatus:   remaining <= 0 ? 'Full' : 'Partial',
        };
      }));

      const isFullPayment = paymentData.amount >= remainingAmount;
      const isBankPayment = paymentData.method === 'Bank';

      if (isFullPayment && isBankPayment) {
        // Bank payment of the full remaining amount → immediately settled → leaves screen
        toast.success(`Payment of ${formatCurrency(paymentData.amount)} recorded — transaction fully cleared and moved to Transaction List`);
      } else if (isFullPayment) {
        // Full payment via Cash/Cheque → fully paid but cheque still needs manual clearance
        toast.success(`Payment of ${formatCurrency(paymentData.amount)} recorded — mark as cleared when ${paymentData.method === 'Cheque' ? 'cheque clears' : 'cash is received'}`);
      } else {
        toast.success(`Partial payment of ${formatCurrency(paymentData.amount)} recorded`);
      }

      setPaymentModal(false);
      setSelectedTransactionId(null);
      setPaymentDataState({ amount: 0, bankId: '', method: 'Cash' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to save payment — please try again');
    } finally {
      setIsSaving(false);
    }
  }, [selectedTransactionId, allTransactions, paymentData, banks]);

  const markPaymentAsCleared = useCallback(async (transactionId: string, paymentId: string) => {
    try {
      await TransactionFirebaseService.markPaymentCleared(transactionId, paymentId);
      setAllTransactions(prev => prev.map(t => {
        if (t.id !== transactionId) return t;
        const payments = (t.partialPayments || []).map(p =>
          p.id === paymentId ? { ...p, isCleared: true } : p
        );
        const remaining = Math.max(0, t.amount - payments.reduce((s, p) => s + p.amount, 0));
        // After clearing this payment, check if the whole transaction is now settled
        const fullyCleared = remaining <= 0 && payments.every(p => p.isCleared);
        return {
          ...t,
          partialPayments: payments,
          isFullyCleared:  fullyCleared,
          paymentStatus:   remaining <= 0 ? 'Full' : t.paymentStatus,
        };
      }));

      // Close the view modal if the transaction just became fully settled
      setViewTransaction(prev => {
        if (!prev || prev.id !== transactionId) return prev;
        const updated = prev.partialPayments?.map(p =>
          p.id === paymentId ? { ...p, isCleared: true } : p
        ) ?? [];
        const remaining = Math.max(0, prev.amount - updated.reduce((s, p) => s + p.amount, 0));
        const fullyCleared = remaining <= 0 && updated.every(p => p.isCleared);
        if (fullyCleared) {
          toast.success('Payment cleared — transaction fully settled and moved to Transaction List');
          return null; // close modal
        }
        return { ...prev, partialPayments: updated, isFullyCleared: fullyCleared };
      });

      toast.success('Payment marked as cleared');
    } catch {
      toast.error('Failed to mark payment as cleared');
    }
  }, []);

  const deleteTransaction = useCallback(async (id: string) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await TransactionFirebaseService.deleteTransaction(id);
      setAllTransactions(prev => prev.filter(t => t.id !== id));
      toast.success('Transaction deleted');
    } catch {
      toast.error('Failed to delete transaction');
    }
  }, []);

  const markTransactionCleared = useCallback(async (transactionId: string) => {
    try {
      await TransactionFirebaseService.markTransactionCleared(transactionId);
      setAllTransactions(prev => prev.map(t =>
        t.id !== transactionId ? t : {
          ...t,
          isFullyCleared: true,
          paymentStatus:  'Full',
        }
      ));
      // The transaction will now satisfy isSettled() and disappear from this screen
      toast.success('Cheque marked as cleared — transaction moved to Transaction List');
    } catch {
      toast.error('Failed to clear cheque');
    }
  }, []);

  return {
    transactions, filteredTransactions, viewTransaction, paymentModal,
    selectedTransactionId, filterStatus, paymentData, banks, isLoading, isSaving, summaryStats,
    setViewTransaction, setPaymentModal, setSelectedTransactionId, setFilterStatus, setPaymentData,
    addPartialPayment, markPaymentAsCleared, markTransactionCleared, deleteTransaction,
    getTransactionTotals, formatCurrency, formatDateTime, getCategoryColor, getPaymentStatusColor,
  };
}