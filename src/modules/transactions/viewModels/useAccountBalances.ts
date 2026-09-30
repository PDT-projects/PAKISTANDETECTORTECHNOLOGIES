// Transactions Module - Shared Account Balances hook
//
// ONE source of truth for "what is each account actually worth right now" —
// must always agree with the Balance Sheet report (BalanceSheetReport.tsx),
// which is the number users trust.
//
// THREE bugs fixed here (2026-09):
//
// 1. The Add Transaction popup's Account dropdown showed a STALE bank
//    balance (e.g. a bank seeded/left at 10 that had a 5 outflow booked
//    against it still showed 10). Root cause: banksWithLiveBalance used to
//    just mirror the raw bank doc (`= banks`), on the theory that whoever
//    books a transaction also keeps the bank doc's `balance` field current.
//    Nothing in the live UI actually did that, so the number never moved.
//
//    The fix everywhere ELSE in this app that shows a bank's live balance
//    (the Transactions page's "Banks" tile, Banks Manager, the Dashboard,
//    the Balance Sheet) is to treat the bank doc's `balance` field as a
//    STATIC OPENING SEED — set once, never touched again — and always
//    DERIVE the live number as computeBankBalance(transactions, bankId,
//    opening), the same opening+ledger pattern Cash-in-Hand already uses.
//    banksWithLiveBalance now does exactly that, so this popup finally
//    agrees with every other screen.
//
//    A short-lived fix once tried the opposite approach instead — writing
//    the running total back into the bank doc's `balance` field on every
//    QuickTransactionModal save (BankFirebaseService.updateBankBalance()).
//    That corrupted the "opening seed" invariant every other screen relies
//    on: computeBankBalance would then add the SAME ledger entry on top of
//    an already-adjusted seed, double-counting it (visible as Banks
//    Manager's "Current live balance" reading lower than it should, or
//    landing on 0). That write was removed — see QuickTransactionModal.tsx.
//    Any bank whose stored balance was mutated while that write was live
//    needs its Opening Balance reset by hand, once, in Banks Manager.
//
// 2. Cash-in-Hand opening balance came from a DIFFERENT Firestore doc
//    (`settings/cashOpening`, a separate manual "Opening Balances" setting)
//    than the one the Balance Sheet / Dashboard use (`cashInHand` collection,
//    via CashFirebaseService). It also never merged in the `cash_transactions`
//    ledger collection, only the generic `transactions` collection. Fix:
//    cashBalance now uses the exact same opening source + merge/dedupe logic
//    as BalanceSheetReport, so the popup and the Balance Sheet always agree.
//
// 3. Even after (2), the "Opening Balances" modal (TransactionListView) was
//    still WRITING the Cash-in-Hand amount to the old `settings/cashOpening`
//    doc — nothing reads that doc anymore, so every save silently went
//    nowhere and the "Opening Bal" tile never moved. Fixed at the write site
//    (the modal now calls CashFirebaseService.setPrimaryCashOpening()), and
//    Cash here is now a genuine onSnapshot subscription (like banks already
//    were) instead of a one-time fetch on mount, so a save reflects
//    immediately with no page reload.

import { useEffect, useMemo, useState } from 'react';
import { Transaction } from '../models/types';
import { TransactionFirebaseService } from '../models/transactionFirebaseService';
import { CashFirebaseService } from '../../banking/models/cashFirebaseService';
import { computeBankBalance } from '../models/transactionsService';

export interface AccountBank {
  id: string;
  name: string;
  /** Opening seed on `banks`; ledger-derived live balance on `banksWithLiveBalance`. */
  balance: number;
  accountNumber?: string;
}

export interface UseAccountBalancesReturn {
  /** Raw bank docs, live from Firestore. `balance` here is the static OPENING seed. */
  banks: AccountBank[];
  /** Same banks, with `balance` replaced by computeBankBalance(transactions, id, opening) — the live figure. */
  banksWithLiveBalance: AccountBank[];
  /** Cash-in-Hand opening balance — same source as the Balance Sheet (`cashInHand` collection). */
  cashOpening: number;
  /** Cash-in-Hand LIVE balance = opening + merged cash ledger. Matches the Balance Sheet exactly. */
  cashBalance: number;
  /** Sum of every opening seed (cash + all banks). */
  openingTotal: number;
  /** Sum of every live balance (cash + all banks). */
  liveTotal: number;
  isLoading: boolean;
}

/**
 * @param transactions The live transactions list (from useTransactionListViewModel's
 *                     onSnapshot subscription). Used both for the Cash-mode merge and
 *                     to derive each bank's live balance from its opening seed.
 */
export function useAccountBalances(transactions: Transaction[]): UseAccountBalancesReturn {
  const [banks,        setBanks]        = useState<AccountBank[]>([]);
  const [cashOpening,  setCashOpening]  = useState<number>(0);
  const [cashLedgerTxns, setCashLedgerTxns] = useState<any[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);

  useEffect(() => {
    let cashRecordsReady = false;
    let cashTxnsReady = false;
    let banksReady = false;
    const settle = () => { if (cashRecordsReady && cashTxnsReady && banksReady) setIsLoading(false); };

    // Same opening source as BalanceSheetReport / Dashboard: the `cashInHand`
    // collection, NOT the separate `settings/cashOpening` doc. Live via
    // onSnapshot (not a one-time fetch) so a save from the Opening Balances
    // modal — or anything else that touches this collection — shows up here
    // immediately, matching how `banks` already behaves below.
    const unsubCashRecords = CashFirebaseService.subscribeToCashRecords(records => {
      setCashOpening(records[0]?.balance || 0);
      cashRecordsReady = true;
      settle();
    });

    const unsubCashTxns = CashFirebaseService.subscribeToCashTransactions(txns => {
      setCashLedgerTxns(txns);
      cashTxnsReady = true;
      settle();
    });

    const unsubBanks = TransactionFirebaseService.subscribeToBanks(list => {
      setBanks(list);
      banksReady = true;
      settle();
    });

    return () => { unsubCashRecords(); unsubCashTxns(); unsubBanks(); };
  }, []);

  // Cash: opening (cashInHand collection) + cash_transactions ledger, merged
  // and deduped with any 'transactions' doc paid via Cash mode — identical
  // logic to BalanceSheetReport's `details.cashIn / details.cashOut`, so the
  // popup and the Balance Sheet never disagree.
  const cashBalance = useMemo(() => {
    const cashModeTxns = (transactions || []).filter((t: any) => t.mode === 'Cash');
    const cashKeyOf = (t: any) => {
      const ref = (t.note || '').trim().toLowerCase();
      return ref ? `${ref}__${t.amount}` : `id__${t.id}`;
    };
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const t of [...cashLedgerTxns, ...cashModeTxns]) {
      const key = cashKeyOf(t);
      if (!seen.has(key)) { seen.add(key); merged.push(t); }
    }
    const cashIn  = merged.filter(t => t.mainCategory === 'Cash Inflow').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const cashOut = merged.filter(t => t.mainCategory === 'Cash Outflow').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return cashOpening + cashIn - cashOut;
  }, [transactions, cashLedgerTxns, cashOpening]);

  // Banks: `banks[].balance` is the static opening seed (never written to
  // after the bank is created). The live figure is always DERIVED —
  // opening + this bank's transaction ledger — the same computeBankBalance
  // pattern the Transactions page, Banks Manager, Dashboard and Balance
  // Sheet already use, so this popup's Account dropdown finally agrees with
  // all of them instead of showing a stale, never-updated number.
  const banksWithLiveBalance = useMemo(
    () => banks.map(b => ({ ...b, balance: computeBankBalance(transactions, b.id, b.balance || 0) })),
    [banks, transactions],
  );

  const openingTotal = useMemo(
    () => cashOpening + banks.reduce((s, b) => s + (b.balance || 0), 0),
    [cashOpening, banks],
  );

  const liveTotal = useMemo(
    () => cashBalance + banksWithLiveBalance.reduce((s, b) => s + (b.balance || 0), 0),
    [cashBalance, banksWithLiveBalance],
  );

  return {
    banks,
    banksWithLiveBalance,
    cashOpening,
    cashBalance,
    openingTotal,
    liveTotal,
    isLoading,
  };
}