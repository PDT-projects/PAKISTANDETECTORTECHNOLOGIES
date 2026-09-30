// Banking Module - Bank Activity Report ViewModel
// useBankActivityViewModel
// Aggregates ALL financial activity:
//   1. bank_transactions  (direct bank entries / transfers)
//   2. inventory paymentInfo (from products collection where paymentMode === 'bank')
//   3. cash_transactions  (manual cash entries)
//   4. transactions       (transaction module, any mode)

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { BankFirebaseService } from '../models/bankFirebaseService';
import { CashFirebaseService } from '../models/cashFirebaseService';
import { Bank } from '../models/types';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

export type ActivityType = 'bank_debit' | 'bank_credit' | 'bank_transfer' | 'cash_in' | 'cash_out' | 'inventory';

export interface ActivityEntry {
  id:          string;
  date:        string;
  type:        ActivityType;
  mode:        'Bank' | 'Cash';
  bankId?:     string;
  bankName?:   string;
  amount:      number;
  description: string;
  reference?:  string;
  category?:   string;
  note?:       string;
  // For instalment rows
  isInstalment?: boolean;
  instalmentIndex?: number;
}

export interface BankActivityFilters {
  searchTerm:  string;
  bankId:      string;         // '' = all
  mode:        'all' | 'Bank' | 'Cash';
  category:    string;         // '' = all
  dateFrom:    string;
  dateTo:      string;
}

export interface BankActivityStats {
  totalBankDebits:   number;
  totalBankCredits:  number;
  totalCashIn:       number;
  totalCashOut:      number;
  netBankFlow:       number;
  netCashFlow:       number;
  totalEntries:      number;
}

const DEFAULT_FILTERS: BankActivityFilters = {
  searchTerm: '',
  bankId:     '',
  mode:       'all',
  category:   '',
  dateFrom:   '',
  dateTo:     '',
};

// ── Fetch helpers ──────────────────────────────────────────────────────────────
async function fetchBankTransactions(): Promise<ActivityEntry[]> {
  try {
    const snap = await getDocs(collection(db, 'bank_transactions'));
    return snap.docs.map(d => {
      const data = d.data() as any;
      return {
        id:          d.id,
        date:        data.date || data.createdAt || new Date().toISOString(),
        type:        (data.type === 'credit' ? 'bank_credit' : 'bank_debit') as ActivityType,
        mode:        'Bank' as const,
        bankId:      data.bankId,
        bankName:    data.bankName || '',
        amount:      Math.abs(data.amount || 0),
        description: data.description || data.note || '',
        reference:   data.reference || '',
        category:    data.category || '',
        note:        data.note || '',
      };
    });
  } catch { return []; }
}

async function fetchBankTransfers(): Promise<ActivityEntry[]> {
  try {
    const snap = await getDocs(collection(db, 'bank_transfers'));
    return snap.docs.map(d => {
      const data = d.data() as any;
      return {
        id:          d.id,
        date:        data.date || new Date().toISOString(),
        type:        'bank_transfer' as ActivityType,
        mode:        'Bank' as const,
        bankId:      data.fromBankId,
        bankName:    `${data.fromBankName} → ${data.toBankName}`,
        amount:      Math.abs(data.amount || 0),
        description: `Transfer: ${data.fromBankName} → ${data.toBankName}`,
        reference:   data.reference || '',
        category:    'Bank Transfer',
        note:        data.note || '',
      };
    });
  } catch { return []; }
}

async function fetchInventoryPayments(): Promise<ActivityEntry[]> {
  try {
    const snap = await getDocs(collection(db, 'products'));
    const entries: ActivityEntry[] = [];

    snap.docs.forEach(d => {
      const data   = d.data() as any;
      const pi     = data.paymentInfo;
      if (!pi || pi.paymentStatus === 'unpaid') return;

      const baseDesc = `Inventory: ${data.brandName || ''} ${data.modelName || ''}`.trim();

      if (pi.installments?.length > 0) {
        // One row per instalment
        pi.installments.forEach((inst: any, idx: number) => {
          entries.push({
            id:               `${d.id}-inst-${idx}`,
            date:             inst.date || pi.date || new Date().toISOString(),
            type:             inst.mode === 'bank' ? 'bank_debit' : 'cash_out',
            mode:             inst.mode === 'bank' ? 'Bank' : 'Cash',
            bankId:           inst.bankId,
            bankName:         inst.bankName || '',
            amount:           inst.amount || 0,
            description:      `${baseDesc} — Instalment #${idx + 1}`,
            reference:        pi.transactionId || '',
            category:         'Inventory',
            note:             inst.note || '',
            isInstalment:     true,
            instalmentIndex:  idx + 1,
          });
        });
      } else {
        entries.push({
          id:          `${d.id}-payment`,
          date:        pi.date || data.createdAt || new Date().toISOString(),
          type:        pi.paymentMode === 'bank' ? 'bank_debit' : 'cash_out',
          mode:        pi.paymentMode === 'bank' ? 'Bank' : 'Cash',
          bankId:      pi.bankId,
          bankName:    pi.bankName || '',
          amount:      pi.paidAmount || pi.totalAmount || 0,
          description: baseDesc,
          reference:   pi.transactionId || '',
          category:    'Inventory',
          note:        '',
        });
      }
    });

    return entries;
  } catch { return []; }
}

async function fetchCashActivities(): Promise<ActivityEntry[]> {
  try {
    const [cashTxns, modeTxns] = await Promise.all([
      CashFirebaseService.fetchAllCashTransactions(),
      (async () => {
        const snap = await getDocs(query(collection(db, 'transactions')));
        return snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id:          d.id,
            date:        data.date || data.createdAt || new Date().toISOString(),
            type:        (data.mainCategory?.toLowerCase().includes('inflow') ? 'cash_in' : 'cash_out') as ActivityType,
            mode:        (data.mode || 'Cash') as 'Cash' | 'Bank',
            amount:      Math.abs(data.amount || 0),
            description: [data.company, data.subCategory].filter(Boolean).join(' — '),
            reference:   data.reference || '',
            category:    data.mainCategory || '',
            note:        data.note || '',
          };
        });
      })(),
    ]);

    const seen = new Set<string>();
    const result: ActivityEntry[] = [];

    const mapCash = (t: any): ActivityEntry => ({
      id:          t.id,
      date:        t.date,
      type:        t.mainCategory?.toLowerCase().includes('inflow') ? 'cash_in' : 'cash_out',
      mode:        'Cash',
      amount:      Math.abs(t.amount || 0),
      description: [t.company, t.subCategory].filter(Boolean).join(' — ') || t.note || '',
      reference:   t.reference || '',
      category:    t.mainCategory || '',
      note:        t.note || '',
    });

    for (const t of cashTxns) {
      if (!seen.has(t.id)) { seen.add(t.id); result.push(mapCash(t)); }
    }
    for (const t of modeTxns) {
      if (!seen.has(t.id) && t.mode === 'Cash') { seen.add(t.id); result.push(t as ActivityEntry); }
    }

    return result;
  } catch { return []; }
}

// ── Main hook ──────────────────────────────────────────────────────────────────
export function useBankActivityViewModel() {
  const { formatCurrency: formatGlobalAmount } = useGlobalCurrency();
  const [allEntries, setAllEntries]   = useState<ActivityEntry[]>([]);
  const [banks, setBanks]             = useState<Bank[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [filters, setFilters]         = useState<BankActivityFilters>(DEFAULT_FILTERS);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [bankTxns, transfers, invPayments, cashActs, bankList] = await Promise.all([
        fetchBankTransactions(),
        fetchBankTransfers(),
        fetchInventoryPayments(),
        fetchCashActivities(),
        BankFirebaseService.fetchAllBanks(),
      ]);

      // Merge, deduplicate by id, sort newest first
      const seen = new Set<string>();
      const merged: ActivityEntry[] = [];
      for (const e of [...bankTxns, ...transfers, ...invPayments, ...cashActs]) {
        if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
      }
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setAllEntries(merged);
      setBanks(bankList);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load activity data';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtered entries ───────────────────────────────────────────────────────
  const filteredEntries = useMemo(() => {
    return allEntries.filter(e => {
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        const haystack = [e.description, e.bankName, e.reference, e.category, e.note].join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (filters.bankId && e.bankId !== filters.bankId) return false;
      if (filters.mode !== 'all' && e.mode !== filters.mode) return false;
      if (filters.category && e.category !== filters.category) return false;
      if (filters.dateFrom && e.date < filters.dateFrom) return false;
      if (filters.dateTo   && e.date > filters.dateTo)   return false;
      return true;
    });
  }, [allEntries, filters]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats: BankActivityStats = useMemo(() => {
    return filteredEntries.reduce((acc, e) => {
      if (e.type === 'bank_credit') acc.totalBankCredits  += e.amount;
      if (e.type === 'bank_debit')  acc.totalBankDebits   += e.amount;
      if (e.type === 'cash_in')     acc.totalCashIn        += e.amount;
      if (e.type === 'cash_out')    acc.totalCashOut       += e.amount;
      acc.totalEntries++;
      return acc;
    }, {
      totalBankDebits: 0, totalBankCredits: 0,
      totalCashIn: 0,     totalCashOut: 0,
      netBankFlow: 0,     netCashFlow: 0,
      totalEntries: 0,
    } as BankActivityStats);
  }, [filteredEntries]);

  const statsWithNet: BankActivityStats = {
    ...stats,
    netBankFlow: stats.totalBankCredits - stats.totalBankDebits,
    netCashFlow: stats.totalCashIn - stats.totalCashOut,
  };

  // ── Unique categories for filter dropdown ──────────────────────────────────
  const uniqueCategories = useMemo(() =>
    Array.from(new Set(allEntries.map(e => e.category).filter(Boolean))).sort()
  , [allEntries]);

  const setFilter    = useCallback((key: keyof BankActivityFilters, value: string) =>
    setFilters(prev => ({ ...prev, [key]: value })), []);
  const clearFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const formatCurrency = useCallback((n: number) =>
    formatGlobalAmount(n)
  , [formatGlobalAmount]);

  const formatDate = useCallback((d: string) => {
    try { return new Intl.DateTimeFormat('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d)); }
    catch { return d; }
  }, []);

  return {
    allEntries, filteredEntries,
    banks, uniqueCategories,
    stats: statsWithNet,
    isLoading, error,
    filters,
    setFilter, clearFilters,
    refreshData: loadData,
    formatCurrency, formatDate,
  };
}