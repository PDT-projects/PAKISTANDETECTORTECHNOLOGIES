import { useState, useEffect, useCallback, useMemo } from 'react';
import { TransactionFirebaseService } from '../../modules/transactions/models/transactionFirebaseService';
import { calculateStats, computeBankBalance } from '../../modules/transactions/models/transactionsService';
import { Transaction } from '../../modules/transactions/models/types';
import type { TransactionStats } from '../../modules/transactions/models/types';
import { CashFirebaseService } from '../../modules/banking/models/cashFirebaseService';
import { BankingService } from '../../modules/banking/models/bankingService';
import { db } from '../../api/firebase/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

// ── Legacy data passthrough ────────────────────────────────────────────────
// Magnitude-based PKR detection (amount > 50000) was unreliable and caused
// real corruption: it could mis-tag a genuinely large AED transaction, or
// (combined with other parts of the app double-converting) produce wildly
// wrong totals. All transactions are written in AED already — pass through
// untouched. If truly old PKR-era docs ever need conversion, do it via a
// one-time migration script, not on every read.
function normTransaction(t: any): any { return t; }
function normInvoice(inv: any): any { return inv; }
function normProduct(p: any): any { return p; }

interface DashboardData {
  transactions: Transaction[];
  banks: any[];
  loans: any[];
  invoices: any[];
  commissions: any[];
  products: any[];
  stats: TransactionStats & {
    cashInflow: number;
    cashOutflow: number;
    cashBalance: number;
    totalBankBalance: number;
    overallBalance: number;
    pendingTransactions: number;
    pendingAmount: number;
    totalLoansReceivable: number;
    totalLoansPayable: number;
    pendingBills: number;
    pendingBillsAmount: number;
    transactionsCount: number;
    invoicesCount: number;
    productsInStockCount: number;
  };
  monthlyChartData: Array<{
    month: string;
    inflow: number;
    outflow: number;
    net: number;
  }>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Returns true if the transaction's date falls within the current calendar month */
function isCurrentMonth(dateStr: string): boolean {
  const now = new Date();
  const txDate = new Date(dateStr);
  return (
    txDate.getFullYear() === now.getFullYear() &&
    txDate.getMonth() === now.getMonth()
  );
}

export function useDashboardData(): DashboardData {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // FIX: Cash Balance card was computed from the generic `transactions`
  // collection (current month only) — a totally different dataset from the
  // real Cash-in-Hand ledger, which is opening balance + cash_transactions +
  // any 'transactions' docs with mode === 'Cash', all-time (not month-bound).
  // That mismatch made the Dashboard show a wrong, much smaller balance than
  // the actual Cash in Hand page. These now mirror that same source.
  const [cashLedgerTxns, setCashLedgerTxns] = useState<any[]>([]);
  const [cashOpeningBalance, setCashOpeningBalance] = useState(0);

  const loadCashLedger = useCallback(async () => {
    try {
      const [cashTxns, records] = await Promise.all([
        CashFirebaseService.fetchAllCashTransactions(),
        CashFirebaseService.fetchAllCashRecords(),
      ]);
      setCashLedgerTxns(cashTxns);
      setCashOpeningBalance(records[0]?.balance || 0);
    } catch (err) {
      console.error('Failed to load cash ledger for dashboard:', err);
    }
  }, []);

  useEffect(() => { loadCashLedger(); }, [loadCashLedger]);


  useEffect(() => {
    // Track how many collections have received their first snapshot.
    // Only clear loading once ALL 6 have arrived.
    let loaded = 0;
    const TOTAL = 6;
    const markLoaded = () => { loaded += 1; if (loaded >= TOTAL) setLoading(false); };

    const unsubTransactions = onSnapshot(
      collection(db, 'transactions'),
      (snap) => {
        const data = snap.docs.map(doc => normTransaction({ id: doc.id, ...doc.data() })) as Transaction[];
        setTransactions(data);
        markLoaded();
      },
      (err) => { setError(`Transactions: ${err.message}`); markLoaded(); }
    );

    const unsubs = [
      onSnapshot(collection(db, 'banks'),
        (snap) => { setBanks(snap.docs.map(d => ({ id: d.id, ...d.data() }))); markLoaded(); },
        () => markLoaded()),
      onSnapshot(collection(db, 'loans'),
        (snap) => { setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() }))); markLoaded(); },
        () => markLoaded()),
      onSnapshot(collection(db, 'invoices'),
        (snap) => { setInvoices(snap.docs.map(d => normInvoice({ id: d.id, ...d.data() }))); markLoaded(); },
        () => markLoaded()),
      onSnapshot(collection(db, 'commissions'),
        (snap) => { setCommissions(snap.docs.map(d => ({ id: d.id, ...d.data() }))); markLoaded(); },
        () => markLoaded()),
      onSnapshot(collection(db, 'products'),
        (snap) => { setProducts(snap.docs.map(d => normProduct({ id: d.id, ...d.data() }))); markLoaded(); },
        () => markLoaded()),
    ];

    return () => {
      unsubTransactions();
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  // ── Current-month transactions only (for the stat cards) ─────────────────
  const currentMonthTransactions = transactions.filter(t => isCurrentMonth(t.date));

  // Stats cards show current month figures only
  const rawStats = calculateStats(currentMonthTransactions);

  // FIX: `banks` state above is the RAW Firestore doc — just the stored
  // opening balance, with no transactions applied. Every screen that reads
  // `banks` from this hook (Balance Sheet's "Bank Balance", the Dashboard's
  // bank total, the AR/AP report) was therefore showing the OPENING balance
  // forever, never the live one — e.g. a bank seeded at 90,000 that had
  // 6,000 net paid out via transactions still showed 90,000 everywhere that
  // used this hook, while the Transactions page (which calls
  // computeBankBalance itself) correctly showed 84,000. `banksLive` applies
  // the same ledger-delta math every other live balance in the app uses, so
  // all of them finally agree.
  const banksLive = useMemo(
    () => banks.map((b: any) => ({
      ...b,
      balance: computeBankBalance(transactions, b.id, b.balance || 0),
    })),
    [banks, transactions],
  );

  const PKR_RATE = 279.5; const AED_RATE = 3.67;
  const totalBankBalance = banksLive.reduce((sum, b: any) => {
    const bal = b.balance || 0;
    const inAed = (b.currency === "PKR" || b.accountCurrency === "PKR") ? (bal / PKR_RATE * AED_RATE) : bal;
    return sum + inAed;
  }, 0);

  // Merge cash_transactions with any 'transactions' docs paid via Cash mode.
  // NOTE: the same sale can create a doc in BOTH collections with DIFFERENT
  // ids ("Invoice / Sale" + "Product sale received"), so dedup must key on
  // the invoice reference (note) + amount, not on id — dedup-by-id lets both
  // duplicates through. This mirrors useCashListViewModel's fix exactly.
  const cashModeTxns = transactions.filter((t: any) => t.mode === 'Cash');
  const cashKeyOf = (t: any) => {
    const ref = (t.note || '').trim().toLowerCase();
    return ref ? `${ref}__${t.amount}` : `id__${t.id}`;
  };
  const seenCashKeys = new Set<string>();
  const mergedCashTxns: any[] = [];
  for (const t of [...cashLedgerTxns, ...cashModeTxns]) {
    const key = cashKeyOf(t);
    if (!seenCashKeys.has(key)) { seenCashKeys.add(key); mergedCashTxns.push(t); }
  }
  const cashStats = BankingService.calculateCashStats(mergedCashTxns, cashOpeningBalance);
  const realCashBalance = cashStats.totalCashInHand;

  const stats = {
    ...rawStats,
    cashInflow: rawStats.totalInflow,
    cashOutflow: rawStats.totalOutflow,
    cashBalance: realCashBalance,
    totalBankBalance,
    // Overall balance = actual cash-in-hand balance + current bank balances
    overallBalance: realCashBalance + totalBankBalance,
    pendingTransactions: rawStats.pendingCount,
    pendingAmount: rawStats.totalPending,
    // Loans are running totals (not time-bound), so still use all loans
    totalLoansReceivable: loans
      .filter((l: any) => l.type === 'Receivable')
      .reduce((sum: number, l: any) => sum + (l.remaining || 0), 0),
    totalLoansPayable: loans
      .filter((l: any) => l.type === 'Payable')
      .reduce((sum: number, l: any) => sum + (l.remaining || 0), 0),
    pendingBills: 0,
    pendingBillsAmount: 0,
    // Current-month counts
    transactionsCount: currentMonthTransactions.length,
    invoicesCount: invoices.filter((inv: any) => isCurrentMonth(inv.date || inv.invoiceDate || inv.createdAt)).length,
    // Products in stock is all-time (not month-bound)
    productsInStockCount: products.filter((p: any) => (p.stock ?? p.quantity ?? 0) > 0).length,
  };

  // ── Chart data uses ALL transactions (last 12 months) ────────────────────
  const monthlyChartData = transactions
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .reduce((acc: any[], t) => {
      const month = new Date(t.date).toLocaleDateString('en-PK', { year: 'numeric', month: 'short' });
      const idx = acc.findIndex(m => m.month === month);
      if (idx >= 0) {
        if (t.mainCategory === 'Cash Inflow') acc[idx].inflow += t.amount;
        else if (t.mainCategory === 'Cash Outflow') acc[idx].outflow += t.amount;
        acc[idx].net = acc[idx].inflow - acc[idx].outflow;
      } else {
        acc.push({
          month,
          inflow: t.mainCategory === 'Cash Inflow' ? t.amount : 0,
          outflow: t.mainCategory === 'Cash Outflow' ? t.amount : 0,
          net: 0,
        });
      }
      return acc;
    }, [])
    .slice(0, 12);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const txns = await TransactionFirebaseService.fetchAllTransactions();
      setTransactions(txns);
      await loadCashLedger();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadCashLedger]);

  return {
    transactions, banks: banksLive, loans, invoices, commissions, products,
    stats,
    monthlyChartData,
    loading,
    error,
    refresh,
  };
}