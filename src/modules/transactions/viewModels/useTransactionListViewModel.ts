// Transactions Module - List ViewModel

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { Transaction, TransactionFilters, TransactionStats } from '../models/types';
import {
  filterTransactions, calculateStats, formatCurrency, formatDate,
  formatDateTime, getCategoryColor, exportToCSV, downloadCSV,
} from '../models/transactionsService';
import {
  TransactionFirebaseService, mapTransactionDoc, sortTransactionsNewestFirst,
} from '../models/transactionFirebaseService';
import { useAuth } from '../../../providers/context/AuthContext';

export interface UseTransactionListViewModelReturn {
  transactions: Transaction[];
  filteredTransactions: Transaction[];
  stats: TransactionStats;
  filters: TransactionFilters;
  isLoading: boolean;
  viewTransaction: Transaction | null;
  setFilters: (f: Partial<TransactionFilters>) => void;
  setViewTransaction: (t: Transaction | null) => void;
  handleDeleteTransaction: (id: string) => Promise<void>;
  handleCreateTransaction: () => void;
  handleEditTransaction: (id: string) => void;
  handleExportCSV: () => void;
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
  formatDateTime: (d: string, t?: string) => string;
  getCategoryColor: (c: string) => string;
  // Expose so wrappers can add partial payments
  refreshTransactions: () => Promise<void>;
  updateTransactionLocal: (id: string, data: Partial<Transaction>) => void;
}

const DEFAULT_FILTERS: TransactionFilters = {
  searchTerm: '', mainCategory: '', dateFrom: '', dateTo: '',
  paymentStatus: '', company: '', approvalStatus: '',
};

export function useTransactionListViewModel(): UseTransactionListViewModelReturn {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [filters,      setFiltersState] = useState<TransactionFilters>(DEFAULT_FILTERS);
  const [viewTransaction, setViewTransaction] = useState<Transaction | null>(null);

  // ── Live subscription ─────────────────────────────────────────────────────
  // Previously this loaded transactions ONCE on mount via fetchAllTransactions()
  // and never updated again. Editing an invoice correctly wrote the new amount
  // to Firestore, but this list (and anything reading `transactions` from it)
  // kept showing the stale snapshot from page load. onSnapshot keeps it live.
  useEffect(() => {
    setIsLoading(true);
    const unsub = onSnapshot(
      collection(db, 'transactions'),
      (snap) => {
        // TWO FIXES HERE:
        //
        // 1. mapTransactionDoc instead of a raw spread. This path used to
        //    return raw Firestore data while refreshTransactions() went through
        //    the service's mapper, so the same transaction had different shapes
        //    (and different AMOUNTS, thanks to the legacy-PKR conversion)
        //    depending on which one populated the store last. Every save called
        //    refreshTransactions(), so the numbers visibly shifted after saving.
        //
        // 2. Sorting. The query has no orderBy, so docs arrive in Firestore
        //    document-id order — which is why the list showed 25 Jul, 25 Jul,
        //    27 Jul, 25 Jul, 27 Jul… and why the chronologically-computed
        //    BALANCE column looked like nonsense against it. Sorting client-side
        //    rather than adding orderBy('date') to the query is deliberate:
        //    Firestore silently EXCLUDES documents missing the ordered field,
        //    so any transaction without a `date` would vanish from the list.
        const data = sortTransactionsNewestFirst(snap.docs.map(mapTransactionDoc));
        setTransactions(data);
        setIsLoading(false);
      },
      () => {
        toast.error('Failed to load transactions');
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Kept for callers that still expect a manual refresh function (e.g. after
  // a local optimistic update); onSnapshot already keeps data live, so this
  // just re-reads once on demand without needing a separate code path.
  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await TransactionFirebaseService.fetchAllTransactions();
      setTransactions(data);
    } catch {
      toast.error('Failed to load transactions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, filters),
    [transactions, filters]
  );
  const stats = useMemo(() => calculateStats(filteredTransactions), [filteredTransactions]);

  const setFilters = useCallback((f: Partial<TransactionFilters>) => {
    setFiltersState(prev => ({ ...prev, ...f }));
  }, []);

  const handleDeleteTransaction = useCallback(async (id: string) => {
    // Confirmation was moved into the view (ConfirmDeleteModal in
    // TransactionListView) so the popup styling matches the rest of the app.
    // By the time this handler runs, the user has already confirmed.
    try {
      const deletedBy = user
        ? { uid: user.uid, email: user.email || '', displayName: user.displayName || undefined }
        : undefined;
      await TransactionFirebaseService.deleteTransaction(id, deletedBy);
      setTransactions(prev => prev.filter(t => t.id !== id));
      toast.success('Transaction archived — balance restored');
    } catch {
      toast.error('Failed to delete transaction');
    }
  }, [user]);

  const handleCreateTransaction = useCallback(() => navigate('/transactions/new'), [navigate]);
  const handleEditTransaction    = useCallback((id: string) => navigate(`/transactions/${id}/edit`), [navigate]);

  const handleExportCSV = useCallback(() => {
    const csv = exportToCSV(filteredTransactions);
    downloadCSV(csv, `transactions-${new Date().toISOString().split('T')[0]}.csv`);
  }, [filteredTransactions]);

  const updateTransactionLocal = useCallback((id: string, data: Partial<Transaction>) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
  }, []);

  return {
    transactions, filteredTransactions, stats, filters, isLoading, viewTransaction,
    setFilters, setViewTransaction,
    handleDeleteTransaction, handleCreateTransaction, handleEditTransaction, handleExportCSV,
    formatCurrency, formatDate, formatDateTime, getCategoryColor,
    refreshTransactions: loadTransactions, updateTransactionLocal,
  };
}