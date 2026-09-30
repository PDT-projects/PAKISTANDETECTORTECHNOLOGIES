// viewModels/usePayableToFuturistic.ts
import { useState, useEffect, useCallback } from 'react';
import type { CurrencyAmounts } from '../models/payableToFuturistic';
import {
  fetchPayablesSummaryByInvoice,
  recordPayment,
  createManualPayable,
  updatePayableAmount,
  fetchBankAccounts,
  fetchCashAccounts,
  type InvoicePayableSummary,
  type DerivedPayable,
  type RecordPaymentPayload,
  type ManualPayablePayload,
  type BankAccount,
  type CashAccount,
} from '../models/payableToFuturisticService';

export type { InvoicePayableSummary, DerivedPayable, BankAccount, CashAccount };

export interface UsePayableToFuturisticReturn {
  summaries:        InvoicePayableSummary[];
  totals:           CurrencyAmounts;
  loading:          boolean;
  error:            string | null;
  refresh:          () => Promise<void>;
  addManualEntry:   (payload: ManualPayablePayload) => Promise<void>;
  markPayment:      (firestoreId: string, payload: RecordPaymentPayload) => Promise<void>;
  editAmount:       (firestoreId: string, newAmountAed: number) => Promise<void>;
  actionLoading:    boolean;
  actionError:      string | null;

  // Bank / cash accounts for the payment modal
  bankAccounts:      BankAccount[];
  cashAccounts:      CashAccount[];
  accountsLoading:   boolean;
  refreshAccounts:   () => Promise<void>;
}

export function usePayableToFuturistic(): UsePayableToFuturisticReturn {
  const [summaries,     setSummaries]     = useState<InvoicePayableSummary[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState<string | null>(null);

  // Bank / cash
  const [bankAccounts,    setBankAccounts]    = useState<BankAccount[]>([]);
  const [cashAccounts,    setCashAccounts]    = useState<CashAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPayablesSummaryByInvoice();
      setSummaries(data);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load payables from Futuristic products');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      setAccountsLoading(true);
      const [banks, cash] = await Promise.all([fetchBankAccounts(), fetchCashAccounts()]);
      setBankAccounts(banks);
      setCashAccounts(cash);
    } catch (err) {
      console.error('[usePayableToFuturistic] Failed to load accounts:', err);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => { load(); },         [load]);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const addManualEntry = useCallback(async (payload: ManualPayablePayload) => {
    try {
      setActionLoading(true);
      setActionError(null);
      await createManualPayable(payload);
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to create manual entry');
      throw err;
    } finally {
      setActionLoading(false);
    }
  }, [load]);

  const markPayment = useCallback(async (firestoreId: string, payload: RecordPaymentPayload) => {
    try {
      setActionLoading(true);
      setActionError(null);
      await recordPayment(firestoreId, payload);
      await Promise.all([load(), loadAccounts()]); // refresh both payables and balances
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to record payment');
      throw err;
    } finally {
      setActionLoading(false);
    }
  }, [load, loadAccounts]);

  const editAmount = useCallback(async (firestoreId: string, newAmountAed: number) => {
    try {
      setActionLoading(true);
      setActionError(null);
      await updatePayableAmount(firestoreId, newAmountAed);
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to update amount');
      throw err;
    } finally {
      setActionLoading(false);
    }
  }, [load]);

  // Grand totals across all invoices
  const totals: CurrencyAmounts = summaries.reduce(
    (acc, s) => ({
      aed: acc.aed + s.totalAmounts.aed,
      pkr: acc.pkr + s.totalAmounts.pkr,
      sar: acc.sar + s.totalAmounts.sar,
      usd: acc.usd + s.totalAmounts.usd,
    }),
    { aed: 0, pkr: 0, sar: 0, usd: 0 }
  );

  return {
    summaries, totals, loading, error, refresh: load,
    addManualEntry, markPayment, editAmount, actionLoading, actionError,
    bankAccounts, cashAccounts, accountsLoading,
    refreshAccounts: loadAccounts,
  };
}