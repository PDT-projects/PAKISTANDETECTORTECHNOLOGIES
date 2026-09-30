// Transactions Module - Transaction List View (Phase 4 redesign)
//
// Rewritten to match the reference Image 1 layout:
//   • Compact summary strip: OPENING BAL · INFLOW·MO · OUTFLOW·MO · NET·MO · CASH · BANKS·N
//   • Filter chip row:       FILTER · Category · Sub-category · Account · Branch · Settled only · + Add Transaction
//   • Table columns:         TXN ID · DATE · MANUAL DATE · TYPE · CATEGORY · SUB CATEGORY · ACCOUNT
//                            · AMOUNT · CASH IN (teal) · CASH OUT (red) · BALANCE · BALANCE DUE · STATUS · (actions)
//   • Empty state:           "No transactions yet — click '+ Add Transaction' to record one."
//
// Same Props interface as the previous view — drop-in compatible with existing
// wrapper. All row actions (view / edit / delete) preserved as a compact icon
// group in the trailing ACTIONS cell.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Trash2, X, Filter as FilterIcon, Check,
  ChevronDown, Wallet, Landmark, TrendingUp, TrendingDown, Loader2,
  PlusCircle, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Search, Clock, RotateCcw,
  History, Eye, Download as DownloadIcon, Calculator,
} from 'lucide-react';
import { collection, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useAccountBalances } from '../viewModels/useAccountBalances';
import { toast } from 'sonner';
import { db } from '../../../api/firebase/firebase';
import {
  Transaction, TransactionFilters, TransactionStats, CASH_IN_HAND_ID,
} from '../models/types';
import {
  getTransactionTotals,
  getTxAccount, getTxCategoryPath,
  computeCashInHandBalance, computeBankBalance, computeMonthlyFlow, computeTotalFlow,
} from '../models/transactionsService';
import { TransactionFirebaseService } from '../models/transactionFirebaseService';
import { CashFirebaseService } from '../../banking/models/cashFirebaseService';
import { InvoiceFirebaseService } from '../../invoices/models/InvoiceFirebaseService';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';
import { getGlobalCurrencySymbol, getGlobalCurrency } from '../../../shared/currency/globalCurrency';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import { useColumnVisibility, ColumnVisibilityMenu } from '../../../shared/components/ColumnVisibility';
import { usePagination, PaginationBar } from '../../../shared/components/Pagination';
import { exportReportToPdf, exportReportToExcel } from '../../../shared/reportExport/reportExport';
import { CurrencyCode } from '../../../features/finance/currencyUtils';

// ── Props ───────────────────────────────────────────────────────────────────
interface Props {
  transactions: Transaction[];
  filteredTransactions: Transaction[];
  stats: TransactionStats;
  filters: TransactionFilters;
  isLoading: boolean;
  viewTransaction: Transaction | null;
  setFilters: (f: Partial<TransactionFilters>) => void;
  setViewTransaction: (t: Transaction | null) => void;
  handleDeleteTransaction: (id: string) => void;
  handleCreateTransaction: () => void;
  handleEditTransaction: (id: string) => void;
  handleExportCSV: () => void;
  formatCurrency: (n: number) => string;
  formatDate: (d: string) => string;
  formatDateTime: (d: string, t?: string) => string;
  getCategoryColor: (c: string) => string;
}

// ── Currency prefix — now live, reads the Admin's global currency setting
// and converts the AED amount for display. Kept as function calls (not
// plain constants) so every render picks up the latest symbol/rate.
const CURRENCY = () => getGlobalCurrencySymbol();
const fmt = (n: number) => {
  return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// ── View ────────────────────────────────────────────────────────────────────
export function TransactionListView({
  transactions, filteredTransactions, filters, isLoading,
  setFilters,
  handleDeleteTransaction, handleCreateTransaction, handleEditTransaction, setViewTransaction,
  formatDate,
}: Props) {
  // Subscribed purely so this whole view (and its child modals below, which
  // close over the module-level CURRENCY()/fmt() functions) re-renders the
  // instant the Admin changes the global currency — CURRENCY()/fmt() always
  // read the live value regardless, this just triggers the re-render.
  useGlobalCurrency();


  // ── Accounts (drives Opening Balance, Banks·N, and the Account filter) ──
  //
  // Both the bank list and the Cash-in-Hand opening balance now come from the
  // shared `useAccountBalances` hook, which is backed by live onSnapshot
  // subscriptions. This is the same hook TransactionListWrapper feeds into
  // QuickTransactionModal, so the summary strip here and the Account dropdown
  // in the transaction popup can no longer disagree about the opening balance.
  const { banks, cashOpening } = useAccountBalances(transactions);

  // The modals below still call onSaved={refreshAccounts}. Subscriptions make
  // that redundant — the new value arrives on its own — but the shim is kept so
  // those call sites don't need to change and so an explicit save still feels
  // acknowledged.
  const refreshAccounts = React.useCallback(async () => { /* live via onSnapshot */ }, []);

  // ── Modal open state ─────────────────────────────────────────────────
  const [openingModal, setOpeningModal] = useState(false);
  const [banksModal,   setBanksModal]   = useState(false);
  const [deletedModal, setDeletedModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [isDeleting,    setIsDeleting]    = useState(false);
  const [historyTx,     setHistoryTx]     = useState<Transaction | null>(null);
  const [evidenceTx,    setEvidenceTx]    = useState<Transaction | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  // ── Summary metrics (all live-computed from `transactions`) ──────────────
  const summary = useMemo(() => {
    const monthly = computeMonthlyFlow(transactions);
    // Cash live balance = cash opening seed + cash-mode transactions delta.
    // computeCashInHandBalance now takes the seed directly, matching how
    // computeBankBalance has always worked.
    const cash = computeCashInHandBalance(transactions, cashOpening);
    const bankSum = banks.reduce(
      (sum, b) => sum + computeBankBalance(transactions, b.id, b.balance),
      0,
    );
    // Opening balance = cash opening seed + all bank opening seeds.
    const opening = cashOpening + banks.reduce((s, b) => s + b.balance, 0);
    return { ...monthly, cash, bankSum, opening, bankCount: banks.length, cashOpening };
  }, [transactions, banks, cashOpening]);

  // ── Local filter chip state (drives which dropdown is open) ──────────────
  const [openChip, setOpenChip] = useState<null | 'filter' | 'category' | 'subcategory' | 'account' | 'branch'>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openChip) return;
    const handler = (e: MouseEvent) => {
      if (chipRef.current && !chipRef.current.contains(e.target as Node)) setOpenChip(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openChip]);

  // Options for the Category / Sub-category / Account / Branch chips —
  // derived from the currently loaded transactions + banks list.
  const categoryOptions = useMemo(() => {
    const s = new Set<string>();
    transactions.forEach(t => { const c = getTxCategoryPath(t).category; if (c) s.add(c); });
    return [...s].sort();
  }, [transactions]);
  const subCategoryOptions = useMemo(() => {
    const s = new Set<string>();
    transactions.forEach(t => { const sc = getTxCategoryPath(t).subCategory; if (sc) s.add(sc); });
    return [...s].sort();
  }, [transactions]);
  const accountOptions = useMemo(() => {
    const list: Array<{ id: string; name: string; type: 'cash' | 'bank' }> = [
      { id: 'cash-in-hand', name: 'Cash in Hand', type: 'cash' },
    ];
    banks.forEach(b => list.push({ id: b.id, name: b.name, type: 'bank' }));
    return list;
  }, [banks]);
  const branchOptions = useMemo(() => {
    const s = new Set<string>();
    transactions.forEach(t => { const b = t.branchName || t.company; if (b) s.add(b); });
    return [...s].sort();
  }, [transactions]);

  // ── Chip filter state (kept local — doesn't touch the VM's filters) ─────
  const [chipCategory,    setChipCategory]    = useState<string>('');
  const [chipSubCategory, setChipSubCategory] = useState<string>('');
  const [chipAccount,     setChipAccount]     = useState<string>('');
  const [chipBranch,      setChipBranch]      = useState<string>('');
  const [chipType,        setChipType]        = useState<'' | 'Inflow' | 'Outflow'>('');
  const [settledOnly,     setSettledOnly]     = useState<boolean>(false);
  const [pendingOnly,     setPendingOnly]     = useState<boolean>(false);

  // A transaction counts as "pending" when either:
  //   • its approval is still awaited/rejected, or
  //   • the ledger acknowledges a partial payment with money still due.
  // Matches what usePendingPaymentsViewModel filters on so the two lists agree.
  // A transaction is considered "pending" when either:
  //   1. Its approval is awaiting or was rejected (workflow gate)
  //   2. It has an amount still owed on the transaction ITSELF (manual
  //      partial like "recorded 60 of 100")
  //   3. It's linked to an invoice that's still partially outstanding —
  //      InvoicePaymentService writes paymentStatus='Partial' on the
  //      payment transaction as a linkage flag whenever the parent
  //      invoice still has a balance owed. The Cash In column on such
  //      transactions matches Amount (the payment IS atomic), but the
  //      invoice is not settled, so it belongs on the Pending list.
  const isPending = (t: Transaction): boolean => {
    if (t.approvalStatus === 'pending_approval') return true;
    if (t.approvalStatus === 'rejected') return true;
    if (t.paymentStatus === 'Partial') return true;
    const { remainingAmount } = getTransactionTotals(t);
    if (remainingAmount > 0) return true;
    return false;
  };

  // Live count for the callout above the table
  const pendingCount = useMemo(
    () => filteredTransactions.filter(isPending).length,
    [filteredTransactions],
  );
  const pendingTotal = useMemo(
    () => filteredTransactions.reduce((s, t) => s + (isPending(t) ? getTransactionTotals(t).remainingAmount : 0), 0),
    [filteredTransactions],
  );

  // Apply chip filters on top of the VM's filteredTransactions.
  const rows = useMemo(() => {
    return filteredTransactions.filter(t => {
      if (chipCategory && getTxCategoryPath(t).category !== chipCategory) return false;
      if (chipSubCategory && getTxCategoryPath(t).subCategory !== chipSubCategory) return false;
      if (chipAccount && getTxAccount(t).id !== chipAccount) return false;
      if (chipBranch) {
        const b = t.branchName || t.company;
        if (b !== chipBranch) return false;
      }
      if (settledOnly && t.paymentStatus !== 'Full') return false;
      if (pendingOnly && !isPending(t)) return false;
      if (chipType === 'Inflow'  && t.mainCategory !== 'Cash Inflow')  return false;
      if (chipType === 'Outflow' && t.mainCategory !== 'Cash Outflow') return false;
      return true;
    });
  }, [filteredTransactions, chipCategory, chipSubCategory, chipAccount, chipBranch, settledOnly, pendingOnly, chipType]);

  // ── Footer totals — sums whatever `rows` currently shows, so it tracks
  // every filter/search/chip live. Same getTransactionTotals() each row
  // already uses; nothing new is calculated here.
  const TXN_COLUMNS = ['Txn ID', 'Date', 'Manual Date', 'Type', 'Category', 'Sub Category', 'Account',
    'Amount', 'Cash In', 'Cash Out', 'Balance', 'Balance Due', 'Evidence', 'Status', 'Actions'];
  const cols = useColumnVisibility('transactions-list', TXN_COLUMNS);
  const labelColsVisible = ['Txn ID', 'Date', 'Manual Date', 'Type', 'Category', 'Sub Category', 'Account']
    .filter(c => cols.isVisible(c)).length;
  const trailingColsVisible = ['Evidence', 'Status', 'Actions'].filter(c => cols.isVisible(c)).length;

  const pg = usePagination(rows, 'transactions-list');

  const footerTotals = useMemo(() => {
    return rows.reduce((acc, t) => {
      const { totalPaid, remainingAmount } = getTransactionTotals(t);
      const isIn  = t.mainCategory === 'Cash Inflow';
      const isOut = t.mainCategory === 'Cash Outflow';
      acc.amount += t.amount || 0;
      acc.cashIn += isIn ? totalPaid : 0;
      acc.cashOut += isOut ? totalPaid : 0;
      acc.balanceDue += remainingAmount > 0 ? remainingAmount : 0;
      return acc;
    }, { amount: 0, cashIn: 0, cashOut: 0, balanceDue: 0 });
  }, [rows]);

  // ── Running balance per account for the BALANCE column ──────────────────
  //
  // Walks the FULL ledger chronologically (oldest first) and records the
  // running per-account total at each transaction. Rendered back in whatever
  // order the user is looking at.
  //
  // WHY `transactions` AND NOT `rows`: this used to iterate the filtered rows,
  // so the moment any filter or chip was active the running balance restarted
  // from the opening seed and skipped every excluded transaction — producing a
  // "balance" that had never existed in reality. A running balance is a
  // property of the account's whole history; filtering changes which rows you
  // SEE, never what the balance WAS at that point.
  //
  // Cash is seeded with its opening balance (previously hard-coded to 0, which
  // made this column disagree with the Cash tile by exactly the opening amount).
  const balanceByRow = useMemo(() => {
    const seeded: Record<string, number> = { 'cash-in-hand': cashOpening };
    banks.forEach(b => { seeded[b.id] = b.balance; });

    const chrono = [...transactions].sort((a, b) => {
      const ka = (a.date || '') + ' ' + (a.time || '');
      const kb = (b.date || '') + ' ' + (b.time || '');
      return ka.localeCompare(kb);
    });

    const runningByAcc: Record<string, number> = { ...seeded };
    const map = new Map<string, number>();
    for (const t of chrono) {
      const acc = getTxAccount(t);
      const running = runningByAcc[acc.id] ?? 0;
      const { totalPaid } = getTransactionTotals(t);
      const isIn  = t.mainCategory === 'Cash Inflow';
      const isOut = t.mainCategory === 'Cash Outflow';
      const isCommitted = t.approvalStatus === 'approved' || t.approvalStatus === 'not_required' || !t.approvalStatus;
      const delta = isCommitted ? (isIn ? totalPaid : isOut ? -totalPaid : 0) : 0;
      const next = running + delta;
      runningByAcc[acc.id] = next;
      map.set(t.id, next);
    }
    return map;
  }, [transactions, banks, cashOpening]);

  const hasAnyChipFilter = !!(chipCategory || chipSubCategory || chipAccount || chipBranch || settledOnly || pendingOnly || chipType);

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, backgroundColor: '#f8fafc', minHeight: '100%' }}>

      {/* ── Summary strip ───────────────────────────────────────────────
          Every tile is clickable — click filters the list by that tile's
          concept (Inflow tile → chipType='Inflow', etc). Opening Bal opens
          the Opening Balances modal; Banks opens the Banks manager. The
          chevron on the right toggles a detail panel that spells out the
          full reconcile (Balance at End of Month · Sum of All Accounts ·
          Outstanding Balance · Balanced/Difference summary).                */}
      <div style={{
        backgroundColor: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 44px 14px 18px',
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0,1fr))',
          gap: 14,
          position: 'relative',
        }}>
          <SummaryCell tone="opening" label="Opening Bal"  value={summary.opening}
            icon={<PlusCircle size={15} />}
            onClick={() => setOpeningModal(true)}
            title="Set opening balances for each account" />
          <SummaryCell tone="inflow"  label="Inflow · Mo"  value={summary.inflow}
            icon={<ArrowUpCircle size={15} />}
            active={chipType === 'Inflow'}
            onClick={() => setChipType(chipType === 'Inflow' ? '' : 'Inflow')}
            title="Filter to Inflow transactions" />
          <SummaryCell tone="outflow" label="Outflow · Mo" value={summary.outflow}
            icon={<ArrowDownCircle size={15} />}
            active={chipType === 'Outflow'}
            onClick={() => setChipType(chipType === 'Outflow' ? '' : 'Outflow')}
            title="Filter to Outflow transactions" />
          <SummaryCell tone="net"     label="Net · Mo"     value={summary.net}
            icon={<ArrowLeftRight size={15} />}
            onClick={() => setDetailPanelOpen(v => !v)}
            title="Toggle reconcile detail" />
          <SummaryCell tone="cash"    label="Cash"         value={summary.cash}
            icon={<Wallet size={15} />}
            active={chipAccount === CASH_IN_HAND_ID}
            onClick={() => setChipAccount(chipAccount === CASH_IN_HAND_ID ? '' : CASH_IN_HAND_ID)}
            title="Filter to Cash-in-Hand transactions" />
          <SummaryCell tone="banks"   label={`Banks · ${summary.bankCount}`} value={summary.bankSum}
            icon={<Landmark size={15} />}
            onClick={() => setBanksModal(true)}
            title="Add / rename / remove bank accounts" />

          {/* Chevron expand toggle — anchored top-right of the strip */}
          <button
            onClick={() => setDetailPanelOpen(v => !v)}
            title={detailPanelOpen ? 'Hide details' : 'Show reconcile details'}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              width: 28, height: 28, borderRadius: 8, border: '1px solid #e2e8f0',
              backgroundColor: '#fff', cursor: 'pointer', color: '#475569',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronDown size={14} style={{ transform: detailPanelOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
        </div>

        {/* Expanded reconcile detail panel */}
        {detailPanelOpen && (
          <ReconcileDetail
            banks={banks}
            transactions={transactions}
            cashOpening={cashOpening}
            summary={summary}
          />
        )}
      </div>

      {/* ── Section header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>Transactions</h2>
      </div>

      {/* ── Filter chip row ────────────────────────────────────────────── */}
      <div ref={chipRef} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', position: 'relative' }}>
        {/* Filter (search) */}
        <FilterChip
          icon={<FilterIcon size={12} />}
          label="Filter"
          active={!!filters.searchTerm}
          activeColor="#0f172a"
          onClick={() => setOpenChip(openChip === 'filter' ? null : 'filter')}
        />
        {openChip === 'filter' && (
          <Panel>
            <div style={{ padding: 12, minWidth: 260 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  autoFocus
                  value={filters.searchTerm}
                  onChange={e => setFilters({ searchTerm: e.target.value })}
                  placeholder="Search TXN ID, note, remitter, …"
                  style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none' }}
                />
              </div>
            </div>
          </Panel>
        )}

        {/* Category */}
        <Chip
          label="Category" active={!!chipCategory} activeValue={chipCategory}
          onOpen={() => setOpenChip(openChip === 'category' ? null : 'category')}
          onClear={() => setChipCategory('')}
        />
        {openChip === 'category' && (
          <Panel>
            <ListPanel
              title="Category" empty="No categories yet"
              options={categoryOptions} value={chipCategory}
              onPick={v => { setChipCategory(v); setOpenChip(null); }}
            />
          </Panel>
        )}

        {/* Sub-category */}
        <Chip
          label="Sub-category" active={!!chipSubCategory} activeValue={chipSubCategory}
          onOpen={() => setOpenChip(openChip === 'subcategory' ? null : 'subcategory')}
          onClear={() => setChipSubCategory('')}
        />
        {openChip === 'subcategory' && (
          <Panel>
            <ListPanel
              title="Sub-category" empty="No sub-categories yet"
              options={subCategoryOptions} value={chipSubCategory}
              onPick={v => { setChipSubCategory(v); setOpenChip(null); }}
            />
          </Panel>
        )}

        {/* Account */}
        <Chip
          label="Account" active={!!chipAccount}
          activeValue={accountOptions.find(a => a.id === chipAccount)?.name}
          onOpen={() => setOpenChip(openChip === 'account' ? null : 'account')}
          onClear={() => setChipAccount('')}
        />
        {openChip === 'account' && (
          <Panel>
            <div style={{ minWidth: 240, maxHeight: 260, overflowY: 'auto' }}>
              <PanelHeader>All accounts</PanelHeader>
              <PickRow selected={chipAccount === ''} onClick={() => { setChipAccount(''); setOpenChip(null); }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>All accounts</span>
              </PickRow>
              <div style={{ padding: '6px 12px 4px', fontSize: 12, fontWeight: 600, color: '#64748b', backgroundColor: '#f8fafc' }}>Cash</div>
              <PickRow selected={chipAccount === 'cash-in-hand'} onClick={() => { setChipAccount('cash-in-hand'); setOpenChip(null); }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <Wallet size={12} color="#65a30d" /> Cash in Hand
                </span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{CURRENCY()} {fmt(summary.cash)}</span>
              </PickRow>
              <div style={{ padding: '6px 12px 4px', fontSize: 12, fontWeight: 600, color: '#64748b', backgroundColor: '#f8fafc' }}>Bank</div>
              {banks.map(b => (
                <PickRow key={b.id} selected={chipAccount === b.id} onClick={() => { setChipAccount(b.id); setOpenChip(null); }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <Landmark size={12} color="#2563eb" /> {b.name}
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{CURRENCY()} {fmt(computeBankBalance(transactions, b.id, b.balance))}</span>
                </PickRow>
              ))}
            </div>
          </Panel>
        )}

        {/* Branch */}
        <Chip
          label="Branch" active={!!chipBranch} activeValue={chipBranch}
          onOpen={() => setOpenChip(openChip === 'branch' ? null : 'branch')}
          onClear={() => setChipBranch('')}
        />
        {openChip === 'branch' && (
          <Panel>
            <ListPanel
              title="Branch" empty="No branches yet"
              options={branchOptions} value={chipBranch}
              onPick={v => { setChipBranch(v); setOpenChip(null); }}
            />
          </Panel>
        )}

        {/* Settled only toggle */}
        <button
          onClick={() => setSettledOnly(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 13px', borderRadius: 99,
            border: `1px solid ${settledOnly ? '#0f172a' : '#e2e8f0'}`,
            backgroundColor: settledOnly ? '#0f172a' : '#fff',
            color: settledOnly ? '#fff' : '#334155',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Check size={12} /> Settled only
        </button>

        {/* Pending only toggle — surfaces the pending-payments view inline */}
        <button
          onClick={() => setPendingOnly(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 13px', borderRadius: 99,
            border: `1px solid ${pendingOnly ? '#c2410c' : '#e2e8f0'}`,
            backgroundColor: pendingOnly ? '#c2410c' : '#fff',
            color: pendingOnly ? '#fff' : '#334155',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Clock size={12} /> Pending only
          {pendingCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 18, height: 16, padding: '0 6px', borderRadius: 99,
              fontSize: 10, fontWeight: 800,
              backgroundColor: pendingOnly ? 'rgba(255,255,255,0.25)' : '#fff7ed',
              color: pendingOnly ? '#fff' : '#c2410c',
            }}>
              {pendingCount}
            </span>
          )}
        </button>

        {/* Spacer + actions */}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setDeletedModal(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 14px', borderRadius: 10,
            border: '1px solid #e2e8f0', backgroundColor: '#fff',
            color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
          title="View audit log of deleted transactions"
        >
          <Trash2 size={13} /> Deleted Transactions
        </button>
        <button
          onClick={handleCreateTransaction}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 10, border: 'none',
            backgroundColor: '#0f172a', color: '#fff',
            fontSize: 13, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(15,23,42,0.35)',
          }}
        >
          <Plus size={14} /> Add Transaction
        </button>
      </div>

      {/* Active chip badges (Clear all) */}
      {hasAnyChipFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: -8 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Active filters:</span>
          {chipCategory && <ActiveBadge label={`Category: ${chipCategory}`} onRemove={() => setChipCategory('')} />}
          {chipSubCategory && <ActiveBadge label={`Sub: ${chipSubCategory}`} onRemove={() => setChipSubCategory('')} />}
          {chipAccount && <ActiveBadge label={`Account: ${accountOptions.find(a => a.id === chipAccount)?.name || ''}`} onRemove={() => setChipAccount('')} />}
          {chipBranch && <ActiveBadge label={`Branch: ${chipBranch}`} onRemove={() => setChipBranch('')} />}
          {chipType && <ActiveBadge label={`Type: ${chipType}`} onRemove={() => setChipType('')} />}
          {settledOnly && <ActiveBadge label="Settled only" onRemove={() => setSettledOnly(false)} />}
          {pendingOnly && <ActiveBadge label="Pending only" onRemove={() => setPendingOnly(false)} />}
          <button
            onClick={() => { setChipCategory(''); setChipSubCategory(''); setChipAccount(''); setChipBranch(''); setSettledOnly(false); setPendingOnly(false); setChipType(''); }}
            style={{ fontSize: 11, color: '#4f46e5', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700 }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Pending payments callout ────────────────────────────────────
          Only rendered when there are pending payments AND the user hasn't
          already filtered to pending-only. Clicking "View" toggles the
          filter chip so the table narrows to just those rows.               */}
      {pendingCount > 0 && !pendingOnly && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderRadius: 10,
          backgroundColor: '#fff7ed', border: '1px solid #fed7aa',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#ffedd5', color: '#c2410c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={16} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#9a3412' }}>
                {pendingCount} pending payment{pendingCount === 1 ? '' : 's'}
              </div>
              <div style={{ fontSize: 11, color: '#c2410c' }}>
                {pendingTotal > 0
                  ? <>Total outstanding: <b>{CURRENCY()} {fmt(pendingTotal)}</b></>
                  : 'Includes invoice-linked payments and awaiting-approval entries'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setPendingOnly(true)}
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none',
              backgroundColor: '#c2410c', color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            View pending <ChevronDown size={11} style={{ transform: 'rotate(-90deg)' }} />
          </button>
        </div>
      )}

      {/* ── Export toolbar ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        <button
          onClick={() => {
            const headers = ['Txn ID', 'Date', 'Type', 'Category', 'Sub Category', 'Account', 'Amount', 'Paid', 'Balance', 'Remaining', 'Status'];
            const exportRows = rows.map(t => {
              const cat = getTxCategoryPath(t);
              const acc = getTxAccount(t);
              const { totalPaid, remainingAmount } = getTransactionTotals(t);
              const isIn = t.mainCategory === 'Cash Inflow';
              const running = balanceByRow.get(t.id) ?? 0;
              return [
                t.transactionId, formatDate(t.date), isIn ? 'Inflow' : (t.mainCategory === 'Cash Outflow' ? 'Outflow' : t.mainCategory),
                cat.category || '', cat.subCategory || '', acc.name,
                t.amount || 0,
                totalPaid || 0,
                running || 0,
                remainingAmount || 0,
                t.paymentStatus || '',
              ];
            });
            exportReportToExcel({
              title: 'Transactions',
              subtitle: `${rows.length} transactions — amounts in ${getGlobalCurrency().code}`,
              columns: headers.map(h => ({ header: h })),
              rows: exportRows,
              filename: `transactions-${new Date().toISOString().slice(0, 10)}`,
            });
          }}
          disabled={rows.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #e2e8f0',
            borderRadius: 8, backgroundColor: '#fff', color: '#334155', fontSize: 13, fontWeight: 600,
            cursor: rows.length === 0 ? 'not-allowed' : 'pointer', opacity: rows.length === 0 ? 0.5 : 1 }}>
          <DownloadIcon size={14} /> Excel
        </button>
        <button
          onClick={() => {
            const headers = ['Txn ID', 'Date', 'Type', 'Category', 'Sub Category', 'Account', 'Amount', 'Paid', 'Balance', 'Remaining', 'Status'];
            const exportRows = rows.map(t => {
              const cat = getTxCategoryPath(t);
              const acc = getTxAccount(t);
              const { totalPaid, remainingAmount } = getTransactionTotals(t);
              const isIn = t.mainCategory === 'Cash Inflow';
              const running = balanceByRow.get(t.id) ?? 0;
              return [
                t.transactionId, formatDate(t.date), isIn ? 'Inflow' : (t.mainCategory === 'Cash Outflow' ? 'Outflow' : t.mainCategory),
                cat.category || '', cat.subCategory || '', acc.name,
                t.amount || 0,
                totalPaid || 0,
                running || 0,
                remainingAmount || 0,
                t.paymentStatus || '',
              ];
            });
            exportReportToPdf({
              title: 'Transactions',
              subtitle: `${rows.length} transactions — amounts in ${getGlobalCurrency().code}`,
              columns: headers.map(h => ({ header: h })),
              rows: exportRows,
              filename: `transactions-${new Date().toISOString().slice(0, 10)}`,
            });
          }}
          disabled={rows.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #e2e8f0',
            borderRadius: 8, backgroundColor: '#fff', color: '#334155', fontSize: 13, fontWeight: 600,
            cursor: rows.length === 0 ? 'not-allowed' : 'pointer', opacity: rows.length === 0 ? 0.5 : 1 }}>
          <DownloadIcon size={14} /> PDF
        </button>
        <ColumnVisibilityMenu controller={cols} />
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <LockedScrollTable maxHeight="68vh">
          {/* borderSpacing 0 with separate borders: sticky headers are
              unreliable under border-collapse. */}
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1200 }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                {(['Txn ID','Date','Manual Date','Type','Category','Sub Category','Account','Amount'] as const)
                  .filter(h => cols.isVisible(h))
                  .map(h => (
                  <ThCell key={h}>{h}</ThCell>
                ))}
                {cols.isVisible('Cash In')     && <ThCell tone="inflow">Cash In</ThCell>}
                {cols.isVisible('Cash Out')    && <ThCell tone="outflow">Cash Out</ThCell>}
                {cols.isVisible('Balance')     && <ThCell>Balance</ThCell>}
                {cols.isVisible('Balance Due') && <ThCell>Balance Due</ThCell>}
                {cols.isVisible('Evidence')    && <ThCell>Evidence</ThCell>}
                {cols.isVisible('Status')      && <ThCell>Status</ThCell>}
                {cols.isVisible('Actions')     && <ThCell align="right">Actions</ThCell>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={cols.visibleCount} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} /> Loading…
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={cols.visibleCount} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  {transactions.length === 0
                    ? <>No transactions yet — click <b>"+ Add Transaction"</b> to record one.</>
                    : 'No transactions match the current filters.'}
                </td></tr>
              ) : (
                pg.pageRows.map(t => {
                  const cat = getTxCategoryPath(t);
                  const acc = getTxAccount(t);
                  const { totalPaid, remainingAmount } = getTransactionTotals(t);
                  const isIn  = t.mainCategory === 'Cash Inflow';
                  const isOut = t.mainCategory === 'Cash Outflow';
                  const running = balanceByRow.get(t.id) ?? 0;

                  return (
                    <tr key={t.id} style={{ boxShadow: 'inset 0 -1px 0 #f1f5f9' }}>
                      {cols.isVisible('Txn ID') && <TdCell mono color="#4f46e5" weight={700}>{t.transactionId}</TdCell>}
                      {cols.isVisible('Date') && <TdCell>{formatDate(t.date)}</TdCell>}
                      {cols.isVisible('Manual Date') && <TdCell>{t.date ? formatDate(t.date) : '—'}</TdCell>}
                      {cols.isVisible('Type') && (
                      <TdCell>
                        {isIn  && <TypeBadge label="Inflow"  tone="inflow" />}
                        {isOut && <TypeBadge label="Outflow" tone="outflow" />}
                        {!isIn && !isOut && <TypeBadge label={t.mainCategory} tone="loan" />}
                      </TdCell>
                      )}
                      {cols.isVisible('Category') && <TdCell>{cat.category || '—'}</TdCell>}
                      {cols.isVisible('Sub Category') && <TdCell>{cat.subCategory || '—'}</TdCell>}
                      {cols.isVisible('Account') && (
                      <TdCell>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          {acc.type === 'cash'
                            ? <Wallet size={11} color="#65a30d" />
                            : <Landmark size={11} color="#2563eb" />}
                          {acc.name}
                        </span>
                      </TdCell>
                      )}
                      {cols.isVisible('Amount') && <TdCell num>{fmt(t.amount || 0)}</TdCell>}
                      {cols.isVisible('Cash In') && <TdCell num tone="inflow"  bold>{isIn  ? fmt(totalPaid) : '—'}</TdCell>}
                      {cols.isVisible('Cash Out') && <TdCell num tone="outflow" bold>{isOut ? fmt(totalPaid) : '—'}</TdCell>}
                      {cols.isVisible('Balance') && <TdCell num>{fmt(running)}</TdCell>}
                      {cols.isVisible('Balance Due') && <TdCell num tone={remainingAmount > 0 ? 'outflow' : undefined}>{remainingAmount > 0 ? fmt(remainingAmount) : '—'}</TdCell>}
                      {cols.isVisible('Evidence') && (
                      <TdCell>
                        {evidenceOf(t)
                          ? (
                            <button
                              onClick={() => setEvidenceTx(t)}
                              title="View evidence"
                              style={{
                                border: 'none', background: 'transparent', cursor: 'pointer',
                                color: '#4f46e5', padding: 2, display: 'inline-flex',
                              }}
                            ><Eye size={14} /></button>
                          )
                          : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </TdCell>
                      )}
                      {cols.isVisible('Status') && (
                      <TdCell>
                        <StatusBadge status={t.paymentStatus} approvalStatus={t.approvalStatus} />
                      </TdCell>
                      )}
                      {cols.isVisible('Actions') && (
                      <TdCell align="right">
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          {t.linkedType === 'invoice' && (
                            <IconAction
                              title="View invoice payment history"
                              onClick={() => setHistoryTx(t)}
                              color="#4f46e5"
                            ><History size={12} /></IconAction>
                          )}
                          <IconAction title="Delete" onClick={() => setPendingDelete(t)} color="#dc2626"><Trash2 size={12} /></IconAction>
                        </div>
                      </TdCell>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            {!isLoading && rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={Math.max(1, labelColsVisible)} style={{
                    padding: '11px 10px', backgroundColor: '#0f172a', borderTop: '1px solid #1e293b',
                    position: 'sticky', bottom: 0, zIndex: 15,
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>
                      <Calculator size={14} color="#93c5fd" /> Totals ({rows.length} shown)
                    </span>
                  </td>
                  {cols.isVisible('Amount') && (
                  <td style={{
                    padding: '11px 10px', backgroundColor: '#0f172a', borderTop: '1px solid #1e293b', textAlign: 'right',
                    position: 'sticky', bottom: 0, zIndex: 15,
                  }}>
                    <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase' }}>Amount</div>
                    <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(footerTotals.amount)}</div>
                  </td>
                  )}
                  {cols.isVisible('Cash In') && (
                  <td style={{
                    padding: '11px 10px', backgroundColor: '#0f172a', borderTop: '1px solid #1e293b', borderLeft: '1px solid #1e293b', textAlign: 'right',
                    position: 'sticky', bottom: 0, zIndex: 15,
                  }}>
                    <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase' }}>Cash in</div>
                    <div style={{ color: '#86efac', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(footerTotals.cashIn)}</div>
                  </td>
                  )}
                  {cols.isVisible('Cash Out') && (
                  <td style={{
                    padding: '11px 10px', backgroundColor: '#0f172a', borderTop: '1px solid #1e293b', borderLeft: '1px solid #1e293b', textAlign: 'right',
                    position: 'sticky', bottom: 0, zIndex: 15,
                  }}>
                    <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase' }}>Cash out</div>
                    <div style={{ color: '#fca5a5', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(footerTotals.cashOut)}</div>
                  </td>
                  )}
                  {cols.isVisible('Balance') && (
                    <td style={{ padding: '11px 10px', backgroundColor: '#0f172a', borderTop: '1px solid #1e293b', position: 'sticky', bottom: 0, zIndex: 15 }} />
                  )}
                  {cols.isVisible('Balance Due') && (
                  <td style={{
                    padding: '11px 10px', backgroundColor: '#0f172a', borderTop: '1px solid #1e293b', borderLeft: '1px solid #1e293b', textAlign: 'right',
                    position: 'sticky', bottom: 0, zIndex: 15,
                  }}>
                    <div style={{ color: '#64748b', fontSize: 9, textTransform: 'uppercase' }}>Balance due</div>
                    <div style={{ color: '#fcd34d', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(footerTotals.balanceDue)}</div>
                  </td>
                  )}
                  {trailingColsVisible > 0 && (
                    <td colSpan={trailingColsVisible} style={{ padding: '11px 10px', backgroundColor: '#0f172a', borderTop: '1px solid #1e293b', position: 'sticky', bottom: 0, zIndex: 15 }} />
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </LockedScrollTable>
        <PaginationBar controller={pg} />
      </div>

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {openingModal && (
        <OpeningBalancesModal
          banks={banks}
          cashOpening={cashOpening}
          transactions={transactions}
          onClose={() => setOpeningModal(false)}
          onSaved={async () => { await refreshAccounts(); setOpeningModal(false); }}
        />
      )}
      {banksModal && (
        <BanksManagerModal
          banks={banks}
          transactions={transactions}
          onClose={() => setBanksModal(false)}
          onSaved={async () => { await refreshAccounts(); }}
        />
      )}
      {evidenceTx && (
        <EvidenceModal tx={evidenceTx} onClose={() => setEvidenceTx(null)} />
      )}
      {deletedModal && (
        <DeletedTransactionsModal
          onClose={() => setDeletedModal(false)}
          formatDate={formatDate}
        />
      )}
      {pendingDelete && (
        <ConfirmDeleteModal
          transaction={pendingDelete}
          isDeleting={isDeleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            const id = pendingDelete.id;
            setIsDeleting(true);
            try {
              await handleDeleteTransaction(id);
            } finally {
              setIsDeleting(false);
              setPendingDelete(null);
            }
          }}
          formatDate={formatDate}
        />
      )}
      {historyTx && (
        <PaymentHistoryModal
          transaction={historyTx}
          onClose={() => setHistoryTx(null)}
          formatDate={formatDate}
        />
      )}
    </div>
  );
}

// ── Cells / chips / helpers ─────────────────────────────────────────────────

function SummaryCell({ tone, label, value, icon, onClick, active, title }: {
  tone: 'opening' | 'inflow' | 'outflow' | 'net' | 'cash' | 'banks';
  label: string; value: number; icon: React.ReactNode;
  onClick?: () => void; active?: boolean; title?: string;
}) {
  const palette: Record<string, { bg: string; fg: string }> = {
    opening: { bg: '#fff7ed', fg: '#c2410c' },
    inflow:  { bg: '#ecfdf5', fg: '#059669' },
    outflow: { bg: '#fef2f2', fg: '#dc2626' },
    net:     { bg: '#f1f5f9', fg: '#0f172a' },
    cash:    { bg: '#f0f9ff', fg: '#0369a1' },
    banks:   { bg: '#eef2ff', fg: '#4338ca' },
  };
  const p = palette[tone];
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
        padding: '6px 8px', borderRadius: 10,
        // Active tiles get a subtle ring + tinted background so users can see
        // which filter is currently applied via the summary strip.
        border: active ? `1.5px solid ${p.fg}` : '1.5px solid transparent',
        backgroundColor: active ? p.bg : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all .12s',
        textAlign: 'left',
      }}
      onMouseEnter={e => { if (onClick && !active) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
      onMouseLeave={e => { if (onClick && !active) e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: p.bg, color: p.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: p.fg, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 4 }}>{CURRENCY()}</span>{fmt(value)}
        </div>
      </div>
    </button>
  );
}

function Chip({ label, active, activeValue, onOpen, onClear }: {
  label: string; active: boolean; activeValue?: string;
  onOpen: () => void; onClear: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 13px', borderRadius: 99,
        border: `1px solid ${active ? '#0f172a' : '#e2e8f0'}`,
        backgroundColor: active ? '#0f172a' : '#fff',
        color: active ? '#fff' : '#334155',
        fontSize: 12, fontWeight: 700, cursor: 'pointer',
      }}
    >
      {label}{active && activeValue ? `: ${activeValue}` : ''}
      {active
        ? <X size={12} onClick={e => { e.stopPropagation(); onClear(); }} />
        : <ChevronDown size={12} />}
    </button>
  );
}

function FilterChip({ icon, label, active, activeColor, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; activeColor: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '7px 13px', borderRadius: 99,
      border: `1px solid ${active ? activeColor : '#e2e8f0'}`,
      backgroundColor: active ? activeColor : '#fff',
      color: active ? '#fff' : '#334155',
      fontSize: 12, fontWeight: 700, cursor: 'pointer',
    }}>
      {icon} {label} <ChevronDown size={12} />
    </button>
  );
}

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 20,
      backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
      boxShadow: '0 12px 28px rgba(15,23,42,0.14)', overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

const PanelHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#64748b', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
      {children}
    </div>
  );
}

function ListPanel({ title, empty, options, value, onPick }: {
  title: string; empty: string; options: string[]; value: string; onPick: (v: string) => void;
}) {
  return (
    <div style={{ minWidth: 220, maxHeight: 260, overflowY: 'auto' }}>
      <PanelHeader>{title}</PanelHeader>
      <PickRow selected={value === ''} onClick={() => onPick('')}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>All</span>
      </PickRow>
      {options.length === 0 ? (
        <div style={{ padding: '12px 14px', fontSize: 12, color: '#94a3b8' }}>{empty}</div>
      ) : options.map(o => (
        <PickRow key={o} selected={value === o} onClick={() => onPick(o)}>
          <span style={{ fontSize: 12 }}>{o}</span>
        </PickRow>
      ))}
    </div>
  );
}

const PickRow: React.FC<{ selected: boolean; onClick: () => void; children: React.ReactNode }> = ({ selected, onClick, children }) => {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 12px', cursor: 'pointer',
        backgroundColor: selected ? '#fff7ed' : '#fff',
        borderBottom: '1px solid #f8fafc',
      }}
    >
      {children}
      {selected && <Check size={12} color="#c2410c" />}
    </div>
  );
}

function ActiveBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99, backgroundColor: '#eef2ff', color: '#3730a3',
      fontSize: 11, fontWeight: 700,
    }}>
      {label}
      <X size={10} style={{ cursor: 'pointer' }} onClick={onRemove} />
    </span>
  );
}

const ThCell: React.FC<{
  children: React.ReactNode; tone?: 'inflow' | 'outflow'; align?: 'left' | 'right';
}> = ({ children, tone, align }) => {
  // Header row is charcoal (#0f172a) so tint the Cash In / Cash Out columns
  // with dark-mode friendly backgrounds and give every cell a light
  // foreground so text stays readable against the dark row.
  const toneBg = tone === 'inflow' ? 'rgba(16,185,129,0.15)'
    : tone === 'outflow' ? 'rgba(239,68,68,0.15)'
    : 'transparent';
  const toneFg = tone === 'inflow' ? '#6ee7b7'
    : tone === 'outflow' ? '#fca5a5'
    : '#cbd5e1';
  return (
    <th style={{
      padding: '12px 12px',
      textAlign: align || 'left',
      fontSize: 12, fontWeight: 600,
      color: toneFg, whiteSpace: 'nowrap',
      position: 'sticky', top: 0, zIndex: 3,
      // The tone tints are translucent. A sticky cell needs an opaque backdrop
      // or the rows scrolling underneath show straight through it, so the tint
      // is layered over the solid header colour instead of replacing it.
      backgroundColor: '#0f172a',
      backgroundImage: `linear-gradient(${toneBg}, ${toneBg})`,
    }}>
      {children}
    </th>
  );
};

const TdCell: React.FC<{
  children: React.ReactNode; num?: boolean; tone?: 'inflow' | 'outflow';
  bold?: boolean; mono?: boolean; weight?: number; color?: string; align?: 'left' | 'right';
}> = ({ children, num, tone, bold, mono, weight, color, align }) => {
  const toneBg = tone === 'inflow' ? '#f0fdf4' : tone === 'outflow' ? '#fef2f2' : 'transparent';
  const toneFg = tone === 'inflow' ? '#059669' : tone === 'outflow' ? '#dc2626' : color || '#334155';
  return (
    <td style={{
      padding: '12px 12px',
      fontSize: 13,
      fontWeight: weight ?? (bold ? 700 : 500),
      textAlign: align || (num ? 'right' : 'left'),
      color: toneFg,
      backgroundColor: toneBg,
      fontFamily: mono ? 'monospace' : undefined,
      fontVariantNumeric: num ? 'tabular-nums' : undefined,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </td>
  );
};

function TypeBadge({ label, tone }: { label: string; tone: 'inflow' | 'outflow' | 'loan' }) {
  const palette = {
    inflow:  { bg: '#ecfdf5', fg: '#059669', icon: <TrendingUp size={10} /> },
    outflow: { bg: '#fef2f2', fg: '#dc2626', icon: <TrendingDown size={10} /> },
    loan:    { bg: '#eef2ff', fg: '#4338ca', icon: null },
  }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      backgroundColor: palette.bg, color: palette.fg,
      fontSize: 10, fontWeight: 700,
    }}>
      {palette.icon} {label}
    </span>
  );
}

function StatusBadge({ status, approvalStatus }: { status?: string; approvalStatus?: string }) {
  if (approvalStatus === 'pending_approval') {
    return <span style={pill('#fef3c7', '#92400e')}>Pending Approval</span>;
  }
  if (approvalStatus === 'rejected') {
    return <span style={pill('#fee2e2', '#991b1b')}>Rejected</span>;
  }
  if (status === 'Partial') return <span style={pill('#fef3c7', '#92400e')}>Partial</span>;
  if (status === 'Full')    return <span style={pill('#ecfdf5', '#065f46')}>Settled</span>;
  return <span style={pill('#f1f5f9', '#64748b')}>{status || '—'}</span>;
}
const pill = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99,
  backgroundColor: bg, color: fg, fontSize: 10, fontWeight: 700,
});

const IconAction: React.FC<{
  title: string; onClick: () => void; color: string; children: React.ReactNode;
}> = ({ title, onClick, color, children }) => {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        width: 26, height: 24, borderRadius: 6, border: '1px solid #e2e8f0',
        backgroundColor: '#fff', cursor: 'pointer', color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ReconcileDetail — expanded panel shown when the ▾ chevron is clicked
//
// Three cards + a Balanced/Difference summary that mirrors the reference
// screenshot (Image 2). Balance at End of Month · Sum of All Accounts ·
// Outstanding Balance from the payables/receivables side.
// ═══════════════════════════════════════════════════════════════════════════
const ReconcileDetail: React.FC<{
  banks: Array<{ id: string; name: string; balance: number }>;
  transactions: Transaction[];
  cashOpening: number;
  summary: { opening: number; inflow: number; outflow: number; cash: number; bankSum: number };
}> = ({ banks, transactions, cashOpening, summary }) => {
  // "Total balance" = opening + every inflow - every outflow, ALL TIME.
  //
  // This used to use summary.inflow / summary.outflow, which come from
  // computeMonthlyFlow() and only cover the CURRENT MONTH — then compared the
  // result against all-time account balances below. The two only agreed because
  // every transaction in the system happened to be in the current month; the
  // first time a transaction rolled over into a new month the panel would have
  // reported a bogus "Difference" equal to all prior-month activity. Compare
  // like with like.
  const allTime = useMemo(() => computeTotalFlow(transactions), [transactions]);
  const totalBalance = summary.opening + allTime.inflow - allTime.outflow;
  // "Sum of all accounts" is the same number arrived at from the other side —
  // add live cash balance + each bank's live balance. If both numbers agree,
  // the books are balanced.
  const cashLive = summary.cash;
  const bankLive = banks.map(b => ({
    id: b.id, name: b.name,
    live: computeBankBalance(transactions, b.id, b.balance),
  }));
  const sumAccounts = cashLive + bankLive.reduce((s, b) => s + b.live, 0);
  const diff = totalBalance - sumAccounts;

  return (
    <div style={{ padding: '16px 18px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr)) auto', gap: 14 }}>

        {/* Balance at End of Month */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 10 }}>Balance from Opening</div>
          <ReconRow label={<>Opening</>} value={summary.opening} />
          <ReconRow label={<>+ Inflows</>} value={allTime.inflow} tone="inflow" />
          <ReconRow label={<>− Outflows</>} value={allTime.outflow} tone="outflow" />
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Total balance</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>{CURRENCY()} {fmt(totalBalance)}</span>
          </div>
        </div>

        {/* Sum of All Accounts */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 10 }}>Sum of All Accounts</div>
          <ReconRow label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Wallet size={11} color="#65a30d" /> Cash in hand</span>} value={cashLive} />
          {bankLive.map(b => (
            <ReconRow
              key={b.id}
              label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Landmark size={11} color="#2563eb" /> {b.name}</span>}
              value={b.live}
            />
          ))}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Total balance</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>{CURRENCY()} {fmt(sumAccounts)}</span>
          </div>
        </div>

        {/* Outstanding Balance (placeholder — receivables/payables would come from invoices module) */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 10 }}>Outstanding Balance</div>
          <ReconRow label={<>Receivables · owed to you</>} value={0} muted />
          <ReconRow label={<>Payables · you owe</>} value={0} muted />
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Net position</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#334155' }}>{CURRENCY()} 0</span>
          </div>
        </div>

        {/* Balanced / Difference summary */}
        <div style={{
          backgroundColor: Math.abs(diff) < 0.5 ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${Math.abs(diff) < 0.5 ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 10, padding: 14, minWidth: 190,
        }}>
          <div style={{ textAlign: 'center' }}>
            {Math.abs(diff) < 0.5 ? (
              <>
                <div style={{ width: 42, height: 42, borderRadius: 99, backgroundColor: '#059669', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Check size={20} strokeWidth={3} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#059669' }}>Balanced</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Accounts matched</div>
              </>
            ) : (
              <>
                <div style={{ width: 42, height: 42, borderRadius: 99, backgroundColor: '#dc2626', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <X size={20} strokeWidth={3} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#dc2626' }}>Off by {CURRENCY()} {fmt(Math.abs(diff))}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Reconcile needed</div>
              </>
            )}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${Math.abs(diff) < 0.5 ? '#bbf7d0' : '#fecaca'}`, fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#64748b' }}>Cash</span>
              <span style={{ color: '#0f172a', fontWeight: 700 }}>{CURRENCY()} {fmt(cashLive)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Banks</span>
              <span style={{ color: '#0f172a', fontWeight: 700 }}>{CURRENCY()} {fmt(summary.bankSum)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ReconRow: React.FC<{ label: React.ReactNode; value: number; tone?: 'inflow' | 'outflow'; muted?: boolean }> = ({ label, value, tone, muted }) => {
  const color = muted ? '#94a3b8'
    : tone === 'inflow' ? '#059669'
    : tone === 'outflow' ? '#dc2626'
    : '#0f172a';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: '#475569' }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{CURRENCY()} {fmt(value)}</span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// OpeningBalancesModal — set the seed balance for each account (Cash + banks)
//
// Doesn't create a transaction — it just persists a starting-point number so
// the running-balance math has a base to add ledger deltas to. Cash goes into
// the primary `cashInHand` record (same one the Balance Sheet / Dashboard /
// "Opening Bal" tile all read — see CashFirebaseService.setPrimaryCashOpening);
// banks go into each bank doc's `.balance` field.
// ═══════════════════════════════════════════════════════════════════════════
const OpeningBalancesModal: React.FC<{
  /** Needed so each row can show the LIVE balance next to the opening one. */
  transactions: Transaction[];
  banks: Array<{ id: string; name: string; balance: number }>;
  cashOpening: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}> = ({ banks, cashOpening, transactions, onClose, onSaved }) => {
  // The row subtitles used to read "Current balance: {opening}" — they were
  // printing the OPENING balance under a "current" label. That is exactly why
  // Cash in Hand appeared to be worth 4,060 here while every other surface in
  // the app said -7,372. Show both, correctly named.
  const liveCash = useMemo(
    () => computeCashInHandBalance(transactions, cashOpening),
    [transactions, cashOpening],
  );
  const liveBank = useMemo(
    () => Object.fromEntries(
      banks.map(b => [b.id, computeBankBalance(transactions, b.id, b.balance)]),
    ) as Record<string, number>,
    [banks, transactions],
  );

  const [cash, setCash] = useState<number>(cashOpening);
  const [bankOpen, setBankOpen] = useState<Record<string, number>>(
    Object.fromEntries(banks.map(b => [b.id, b.balance])),
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Cash opening → the primary `cashInHand` record, the SAME source the
      // "Opening Bal" tile, the Cash tile and the Balance Sheet Report all
      // read. (Previously wrote to a separate `settings/cashOpening` doc that
      // nothing read anymore, so this save silently went nowhere.)
      await CashFirebaseService.setPrimaryCashOpening(Number(cash) || 0);
      // Each bank opening → the bank doc's `balance` field
      for (const b of banks) {
        const next = Number(bankOpen[b.id]) || 0;
        if (next !== b.balance) {
          await updateDoc(doc(db, 'banks', b.id), { balance: next });
        }
      }
      toast.success('Opening balances saved');
      await onSaved();
    } catch (err: any) {
      console.error('[OpeningBalancesModal] save failed:', err);
      toast.error(err?.message || 'Failed to save opening balances');
    } finally {
      setSaving(false);
    }
  };

  const inp: React.CSSProperties = {
    padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 13, textAlign: 'right', width: 130, outline: 'none',
    fontVariantNumeric: 'tabular-nums',
  };

  return createPortal(
    <div onClick={onClose} style={backdrop}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalBox, maxWidth: 540 }}>
        <div style={modalHeader}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Opening Balances</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Starting amount for each account before any transactions</div>
          </div>
          <button onClick={onClose} style={modalClose}><X size={14} /></button>
        </div>

        <div style={{ padding: '14px 18px', maxHeight: '60vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 6, padding: '0 6px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>Account</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textAlign: 'right' }}>Opening Balance</div>
          </div>

          {/* Cash-in-Hand */}
          <div style={acctRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#f0fdf4', color: '#65a30d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={14} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Cash in Hand</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  Opening: {fmt(cashOpening)} · Current: {fmt(liveCash)}
                </div>
              </div>
            </div>
            <input type="number" step="any" value={cash} onChange={e => setCash(Number(e.target.value) || 0)} style={inp} />
          </div>

          {/* Banks */}
          {banks.map(b => (
            <div key={b.id} style={acctRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#eef2ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Landmark size={14} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Opening: {fmt(b.balance)} · Current: {fmt(liveBank[b.id] ?? b.balance)}
                  </div>
                </div>
              </div>
              <input type="number" step="any" value={bankOpen[b.id] ?? 0} onChange={e => setBankOpen(prev => ({ ...prev, [b.id]: Number(e.target.value) || 0 }))} style={inp} />
            </div>
          ))}

          <div style={{ marginTop: 12, padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8, fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
            This doesn't create a transaction — it's just each account's starting point.
            Live balance = <b>opening + inflows − outflows</b>.
          </div>
        </div>

        <div style={modalFooter}>
          <button onClick={onClose} disabled={saving} style={btnGhost}><X size={12} /> Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Check size={12} /> Save</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// BanksManagerModal — inline bank CRUD (add / rename / edit opening / delete)
//
// Everything the removed Banking screen used to do, folded into the
// transactions module. Uses the `banks` collection Firestore directly.
// ═══════════════════════════════════════════════════════════════════════════
const BanksManagerModal: React.FC<{
  banks: Array<{ id: string; name: string; balance: number }>;
  transactions: Transaction[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}> = ({ banks, transactions, onClose, onSaved }) => {
  const [rows, setRows] = useState<Array<{ id: string; name: string; balance: number; isNew?: boolean; toDelete?: boolean }>>(
    banks.map(b => ({ ...b })),
  );
  const [saving, setSaving] = useState(false);

  const addRow = () => {
    setRows(prev => [...prev, { id: `new-${Date.now()}-${prev.length}`, name: '', balance: 0, isNew: true }]);
  };
  const markDelete = (id: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, toDelete: !r.toDelete } : r));
  };
  const update = (id: string, patch: Partial<{ name: string; balance: number }>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const totalBalance = rows.filter(r => !r.toDelete).reduce((s, r) => s + (Number(r.balance) || 0), 0);
  const visibleCount = rows.filter(r => !r.toDelete && !r.isNew).length + rows.filter(r => !r.toDelete && r.isNew && r.name.trim()).length;

  const handleSave = async () => {
    // Validate: no blank names among non-deleted rows
    const kept = rows.filter(r => !r.toDelete);
    for (const r of kept) {
      if (!r.name.trim()) { toast.error('Every bank needs a name'); return; }
    }
    setSaving(true);
    try {
      for (const r of rows) {
        if (r.isNew && !r.toDelete && r.name.trim()) {
          // Add new bank
          await addDoc(collection(db, 'banks'), {
            name: r.name.trim(),
            balance: Number(r.balance) || 0,
            createdAt: new Date().toISOString(),
          });
        } else if (!r.isNew && r.toDelete) {
          // Delete existing bank
          await deleteDoc(doc(db, 'banks', r.id));
        } else if (!r.isNew && !r.toDelete) {
          // Update existing bank (only if it changed)
          const original = banks.find(b => b.id === r.id);
          if (original && (original.name !== r.name || original.balance !== r.balance)) {
            await updateDoc(doc(db, 'banks', r.id), {
              name: r.name.trim(),
              balance: Number(r.balance) || 0,
            });
          }
        }
      }
      toast.success('Bank accounts updated');
      await onSaved();
      onClose();
    } catch (err: any) {
      console.error('[BanksManagerModal] save failed:', err);
      toast.error(err?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const inp: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
    fontSize: 12, outline: 'none', width: '100%',
  };

  return createPortal(
    <div onClick={onClose} style={backdrop}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalBox, maxWidth: 640 }}>
        <div style={modalHeader}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Bank Accounts</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Live balance per bank — add, rename, or adjust opening balances</div>
          </div>
          <button onClick={onClose} style={modalClose}><X size={14} /></button>
        </div>

        <div style={{ padding: '14px 18px', maxHeight: '65vh', overflowY: 'auto' }}>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div style={{ padding: 12, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>Banks</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{visibleCount}</div>
            </div>
            <div style={{ padding: 12, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>Total Balance</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalBalance)}</div>
            </div>
          </div>

          {/* Rows */}
          {rows.map(r => {
            const live = r.isNew ? Number(r.balance) || 0 : computeBankBalance(transactions, r.id, Number(r.balance) || 0);
            return (
              <div key={r.id} style={{ padding: 12, marginBottom: 10, border: `1px solid ${r.toDelete ? '#fecaca' : '#e2e8f0'}`, borderRadius: 8, backgroundColor: r.toDelete ? '#fef2f2' : '#fff', opacity: r.toDelete ? 0.6 : 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 8, alignItems: 'end' }}>
                  <div>
                    <label style={miniLabel}>Bank Name</label>
                    <input value={r.name} onChange={e => update(r.id, { name: e.target.value })} placeholder="e.g. HBL — Main Branch" style={inp} disabled={r.toDelete} />
                  </div>
                  <div>
                    <label style={miniLabel}>Opening Balance</label>
                    <input type="number" step="any" value={r.balance} onChange={e => update(r.id, { balance: Number(e.target.value) || 0 })} style={{ ...inp, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} disabled={r.toDelete} />
                  </div>
                  <button onClick={() => markDelete(r.id)} title={r.toDelete ? 'Undo delete' : 'Remove bank'} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', color: r.toDelete ? '#059669' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {r.toDelete ? <RotateCcw size={13} /> : <Trash2 size={13} />}
                  </button>
                </div>
                {!r.isNew && !r.toDelete && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Current live balance</span>
                    <span style={{ fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{CURRENCY()} {fmt(live)}</span>
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={addRow} style={{ ...btnGhost, width: '100%', justifyContent: 'center', padding: '10px 12px', border: '1px dashed #cbd5e1' }}>
            <Plus size={13} /> Add Bank Branch
          </button>

          <div style={{ marginTop: 12, padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8, fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
            Renaming or changing opening balance here updates that bank going forward.
            Removing a bank does <b>not</b> delete its past transactions, but they'll stop appearing in the
            bank balance cards above.
          </div>
        </div>

        <div style={modalFooter}>
          <button onClick={onClose} disabled={saving} style={btnGhost}><X size={12} /> Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Check size={12} /> Save Changes</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// Modal styling helpers
// ═══════════════════════════════════════════════════════════════════════════
const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', zIndex: 10000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const modalBox: React.CSSProperties = {
  width: '100%', maxHeight: '92vh', backgroundColor: '#fff', borderRadius: 14,
  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.55)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
};
const modalHeader: React.CSSProperties = {
  padding: '14px 20px', borderBottom: '1px solid #f1f5f9',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
};
const modalClose: React.CSSProperties = {
  width: 28, height: 28, border: '1px solid #e2e8f0', borderRadius: 7,
  backgroundColor: '#fff', cursor: 'pointer', color: '#64748b',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modalFooter: React.CSSProperties = {
  padding: '14px 20px', borderTop: '1px solid #f1f5f9',
  display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0, backgroundColor: '#fff',
};
const acctRow: React.CSSProperties = {
  padding: '10px 12px', marginBottom: 8, border: '1px solid #e2e8f0', borderRadius: 10,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
};
const miniLabel: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 4,
};
const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8,
  border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8,
  border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};

// ═══════════════════════════════════════════════════════════════════════════
// DeletedTransactionsModal — read-only audit log of archived transactions
//
// Shows every record archived via TransactionFirebaseService.deleteTransaction,
// with WHO deleted (email + display name), WHEN (localized date/time), and
// the original transaction fields. No delete/edit actions here — the archive
// is append-only by design.
// ═══════════════════════════════════════════════════════════════════════════
const DeletedTransactionsModal: React.FC<{
  onClose: () => void;
  formatDate: (d: string) => string;
}> = ({ onClose, formatDate }) => {
  const [rows, setRows] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    TransactionFirebaseService.fetchDeletedTransactions()
      .then(setRows)
      .catch(err => {
        console.error('[DeletedTransactionsModal] fetch failed:', err);
        toast.error('Failed to load deleted transactions');
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter(r =>
      (r.transactionId || '').toLowerCase().includes(s) ||
      (r.subCategory   || '').toLowerCase().includes(s) ||
      (r.mainCategory  || '').toLowerCase().includes(s) ||
      (r.note          || '').toLowerCase().includes(s) ||
      (r.deletedByEmail|| '').toLowerCase().includes(s) ||
      (r.deletedByName || '').toLowerCase().includes(s),
    );
  }, [rows, search]);

  const fmtDateTime = (iso?: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  };

  return createPortal(
    <div onClick={onClose} style={backdrop}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalBox, maxWidth: 960, width: '96vw' }}>
        <div style={modalHeader}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trash2 size={15} color="#dc2626" /> Deleted Transactions
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Read-only audit trail — deleted records cannot be restored or removed from here
            </div>
          </div>
          <button onClick={onClose} style={modalClose}><X size={14} /></button>
        </div>

        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search TXN ID, category, note, or who deleted…"
              style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ maxHeight: '65vh', overflowY: 'auto', padding: '4px 0' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              {rows.length === 0 ? 'No transactions have been deleted yet.' : 'No records match your search.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#0f172a' }}>
                  {['Txn ID','Original Date','Type','Category','Account','Amount','Deleted By','Deleted At'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: 'left',
                      fontSize: 11, fontWeight: 600, color: '#cbd5e1',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const isIn  = r.mainCategory === 'Cash Inflow';
                  const isOut = r.mainCategory === 'Cash Outflow';
                  const accName = r.accountName || r.bankName || (r.mode === 'Cash' ? 'Cash in Hand' : '—');
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={cellMono}>{r.transactionId || '—'}</td>
                      <td style={cell}>{r.date ? formatDate(r.date) : '—'}</td>
                      <td style={cell}>
                        {isIn  && <TypeBadge label="Inflow"  tone="inflow" />}
                        {isOut && <TypeBadge label="Outflow" tone="outflow" />}
                        {!isIn && !isOut && <TypeBadge label={r.mainCategory || '—'} tone="loan" />}
                      </td>
                      <td style={cell}>{r.subCategory || '—'}</td>
                      <td style={cell}>{accName}</td>
                      <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {CURRENCY()} {fmt(r.amount || 0)}
                      </td>
                      <td style={cell}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 700 }}>
                            {r.deletedByName || r.deletedByEmail || 'Unknown'}
                          </span>
                          {r.deletedByEmail && r.deletedByName && (
                            <span style={{ fontSize: 10, color: '#64748b' }}>{r.deletedByEmail}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...cell, fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>
                        {fmtDateTime(r.deletedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ ...modalFooter, justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            {loading ? '…' : `${filtered.length} of ${rows.length} record${rows.length === 1 ? '' : 's'}`}
          </div>
          <button onClick={onClose} style={btnGhost}><X size={12} /> Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};        
const cell: React.CSSProperties = {
  padding: '10px 12px', fontSize: 12, color: '#334155', whiteSpace: 'nowrap',
};
const cellMono: React.CSSProperties = { ...cell, fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5' };

// ═══════════════════════════════════════════════════════════════════════════
// ConfirmDeleteModal — proper in-app confirmation for transaction delete
//
// Replaces the browser's native `window.confirm()` (which shows an unstyled
// "localhost:3000 says…" dialog) with a themed modal that:
//   • Shows the transaction being deleted (txn id, category, account, amount)
//   • Explains this is a soft-delete (archived + balance restored)
//   • Says the archive is append-only (can't restore, can't re-delete)
// ═══════════════════════════════════════════════════════════════════════════
const ConfirmDeleteModal: React.FC<{
  transaction: Transaction;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  formatDate: (d: string) => string;
}> = ({ transaction: t, isDeleting, onCancel, onConfirm, formatDate }) => {
  const acc  = getTxAccount(t);
  const path = getTxCategoryPath(t);
  const isIn  = t.mainCategory === 'Cash Inflow';
  const isOut = t.mainCategory === 'Cash Outflow';

  return createPortal(
    <div onClick={isDeleting ? undefined : onCancel} style={backdrop}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalBox, maxWidth: 460 }}>
        {/* Header */}
        <div style={{ ...modalHeader, borderBottom: 'none', paddingBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Trash2 size={18} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Delete this transaction?</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                It will be archived to Deleted Transactions
              </div>
            </div>
          </div>
          {!isDeleting && (
            <button onClick={onCancel} style={modalClose}><X size={14} /></button>
          )}
        </div>

        {/* Transaction snapshot */}
        <div style={{ padding: '10px 20px 6px' }}>
          <div style={{
            padding: 14, borderRadius: 10, backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
          }}>
            {/* Top row: TXN + amount */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 2 }}>Transaction</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4f46e5', fontFamily: 'monospace' }}>{t.transactionId}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 2 }}>Amount</div>
                <div style={{
                  fontSize: 15, fontWeight: 800,
                  color: isIn ? '#059669' : isOut ? '#dc2626' : '#334155',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {isIn ? '+' : isOut ? '−' : ''}{CURRENCY()} {fmt(t.amount || 0)}
                </div>
              </div>
            </div>

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
              <DetailRow label="Type" value={
                isIn  ? <TypeBadge label="Inflow"  tone="inflow" />
                : isOut ? <TypeBadge label="Outflow" tone="outflow" />
                : <TypeBadge label={t.mainCategory || '—'} tone="loan" />
              } />
              <DetailRow label="Date" value={<span style={{ color: '#334155' }}>{formatDate(t.date)}</span>} />
              <DetailRow label="Category" value={<span style={{ color: '#334155' }}>{path.category || '—'}</span>} />
              <DetailRow label="Account" value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#334155' }}>
                  {acc.type === 'cash' ? <Wallet size={11} color="#65a30d" /> : <Landmark size={11} color="#2563eb" />}
                  {acc.name}
                </span>
              } />
              {(path.subCategory || t.note) && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 2 }}>
                    {path.subCategory ? 'Sub Category' : 'Note'}
                  </div>
                  <div style={{ fontSize: 12, color: '#334155' }}>
                    {path.subCategory || t.note || '—'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Explanation */}
        <div style={{ padding: '4px 20px 14px' }}>
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            backgroundColor: '#fff7ed', border: '1px solid #fed7aa',
            fontSize: 11, color: '#9a3412', lineHeight: 1.5,
          }}>
            <b style={{ color: '#c2410c' }}>Note:</b> the balance will be restored automatically. This
            record will still be visible in <b>Deleted Transactions</b> along with who deleted it
            and when — but it <b>cannot be restored or re-deleted</b> from there.
          </div>
        </div>

        {/* Footer */}
        <div style={modalFooter}>
          <button onClick={onCancel} disabled={isDeleting} style={btnGhost}>
            <X size={12} /> Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 8, border: 'none',
              backgroundColor: isDeleting ? '#94a3b8' : '#dc2626', color: '#fff',
              fontSize: 13, fontWeight: 800, cursor: isDeleting ? 'not-allowed' : 'pointer',
            }}
          >
            {isDeleting
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</>
              : <><Trash2 size={13} /> Delete Transaction</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 12 }}>{value}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════
// PaymentHistoryModal — read-only invoice payment log
//
// Opened from the History (⏱) icon on any transaction whose linkedType is
// 'invoice'. Fetches the linked invoice by number, then shows:
//   • Invoice summary (total / paid / remaining)
//   • Every payment: date · mode · amount · bank / cheque / note
//   • Every misc expense (if any) — same style, distinct color
// Deliberately read-only. To change or remove entries, the user goes to the
// invoice itself or deletes the source transaction (which reverses via the
// existing linkedType/linkedId query).
// ═══════════════════════════════════════════════════════════════════════════
const PaymentHistoryModal: React.FC<{
  transaction: Transaction;
  onClose: () => void;
  formatDate: (d: string) => string;
}> = ({ transaction: t, onClose, formatDate }) => {
  const [invoice, setInvoice] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const invNum = t.linkedId;
    if (!invNum) { setLoading(false); return; }
    // linkedId stores the invoice NUMBER (not doc id). Use InvoiceLifecycleService
    // ergonomics via a small fallback — filter fetchAllInvoices by matching number.
    setLoading(true);
    InvoiceFirebaseService.fetchAllInvoices()
      .then(list => {
        const match = list.find((i: any) => i.invoiceNumber === invNum);
        setInvoice(match || null);
      })
      .catch(err => {
        console.error('[PaymentHistoryModal] fetch failed:', err);
      })
      .finally(() => setLoading(false));
  }, [t.linkedId]);

  const payments      = (invoice?.payments      || []) as Array<any>;
  const miscExpenses  = (invoice?.miscExpenses  || []) as Array<any>;
  const total         = Number(invoice?.totalAmount) || 0;
  const paid          = Number(invoice?.paidAmount)
    || payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining     = Math.max(0, total - paid);

  return createPortal(
    <div onClick={onClose} style={backdrop}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalBox, maxWidth: 640 }}>
        <div style={modalHeader}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={15} color="#4f46e5" /> Payment History
            </div>
            <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
              {t.linkedId || '—'}{invoice?.customerName ? ` · ${invoice.customerName}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={modalClose}><X size={14} /></button>
        </div>

        <div style={{ padding: '14px 20px', maxHeight: '65vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading invoice…
            </div>
          ) : !invoice ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Invoice {t.linkedId} not found. It may have been deleted.
            </div>
          ) : (
            <>
              {/* Summary row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                <MiniStat label="Total"     value={total}     fg="#0f172a" />
                <MiniStat label="Paid"      value={paid}      fg="#059669" />
                <MiniStat label="Remaining" value={remaining} fg={remaining > 0 ? '#c2410c' : '#94a3b8'} />
              </div>

              {/* Payments */}
              <div style={{ marginBottom: miscExpenses.length > 0 ? 16 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', marginBottom: 8 }}>
                  Payments · {payments.length}
                </div>
                {payments.length === 0 ? (
                  <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: 12, backgroundColor: '#f8fafc', borderRadius: 8 }}>
                    No payments recorded yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {payments.map((p: any, i: number) => (
                      <HistoryRow
                        key={p.id || i}
                        date={p.date}
                        mode={p.mode}
                        detail={p.bankName || p.chequeNumber || p.note}
                        amount={Number(p.amount) || 0}
                        formatDate={formatDate}
                        tone="in"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Misc expenses */}
              {miscExpenses.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>
                    Misc Expenses · {miscExpenses.length}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {miscExpenses.map((m: any, i: number) => (
                      <HistoryRow
                        key={m.id || i}
                        date={m.date}
                        mode={m.mode}
                        detail={m.category || m.note}
                        amount={Number(m.amount) || 0}
                        formatDate={formatDate}
                        tone="out"
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ ...modalFooter, justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Read-only — changes go through the invoice or the source transaction
          </div>
          <button onClick={onClose} style={btnGhost}><X size={12} /> Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const MiniStat: React.FC<{ label: string; value: number; fg: string }> = ({ label, value, fg }) => (
  <div style={{ textAlign: 'center', padding: '10px 6px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
    <div style={{ fontSize: 15, fontWeight: 800, color: fg, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
      <span style={{ fontSize: 10, color: '#94a3b8', marginRight: 3 }}>{CURRENCY()}</span>{fmt(value)}
    </div>
  </div>
);

const HistoryRow: React.FC<{
  date?: string; mode?: string; detail?: string; amount: number;
  formatDate: (d: string) => string;
  tone: 'in' | 'out';
}> = ({ date, mode, detail, amount, formatDate, tone }) => {
  const modeChip = mode === 'Bank' ? { bg: '#dbeafe', fg: '#1d4ed8' }
    : mode === 'Cheque' ? { bg: '#fef3c7', fg: '#92400e' }
    : { bg: '#dcfce7', fg: '#166534' };
  const amountFg = tone === 'in' ? '#059669' : '#dc2626';
  const rowBg    = tone === 'in' ? '#f0fdf4' : '#fef2f2';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '110px 70px 1fr auto', gap: 10, alignItems: 'center',
      padding: '8px 10px', backgroundColor: rowBg, borderRadius: 8, fontSize: 12,
    }}>
      <span style={{ color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{date ? formatDate(date) : '—'}</span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '2px 8px', borderRadius: 99,
        backgroundColor: modeChip.bg, color: modeChip.fg,
        fontSize: 10, fontWeight: 700,
      }}>{mode || 'Cash'}</span>
      <span style={{ color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail || '—'}</span>
      <span style={{ color: amountFg, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {tone === 'in' ? '+' : '−'}{CURRENCY()} {fmt(amount)}
      </span>
    </div>
  );
};
/** The evidence data-url for a row, whichever field it was stored in.
 *  Newer rows carry attachmentUrl; older ones only have attachments[0].dataUrl.
 *  Reading just one of them left half the rows looking like they had no proof. */
function evidenceOf(t: any): { url: string; name: string; type: string } | null {
  const first = Array.isArray(t?.attachments) ? t.attachments[0] : null;
  const url   = String(t?.attachmentUrl || first?.dataUrl || '');
  if (!url) return null;
  return {
    url,
    name: String(first?.name || `evidence-${t?.transactionId || 'file'}`),
    type: String(first?.type || (url.startsWith('data:application/pdf') ? 'application/pdf' : 'image')),
  };
}

/** Full-size look at a row's evidence. Images render inline; PDFs go in an
 *  iframe — one method for both left a blank frame on PDFs, which reads as
 *  broken rather than as the wrong viewer. */
function EvidenceModal({ tx, onClose }: { tx: any; onClose: () => void }) {
  const ev = evidenceOf(tx);
  if (!ev) return null;
  const isPdf = ev.type.includes('pdf') || ev.url.startsWith('data:application/pdf');

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: isPdf ? '80vw' : 'auto', maxWidth: '92vw', maxHeight: '90vh',
          backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '12px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Evidence</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{tx.transactionId} · {ev.name}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={ev.url} download={ev.name}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                borderRadius: 7, border: '1px solid #e2e8f0', backgroundColor: '#fff',
                color: '#334155', fontSize: 12, fontWeight: 700, textDecoration: 'none',
              }}
            ><DownloadIcon size={13} /> Download</a>
            <button onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: 7, border: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc', cursor: 'pointer', color: '#64748b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            ><X size={15} /></button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#f8fafc', minHeight: 200 }}>
          {isPdf
            ? <iframe src={ev.url} title="Evidence" style={{ width: '100%', height: '78vh', border: 'none' }} />
            : <img src={ev.url} alt="Evidence" style={{ display: 'block', maxWidth: '88vw', maxHeight: '78vh' }} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}