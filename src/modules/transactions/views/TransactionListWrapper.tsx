// Transactions Module - List Wrapper
// Intercepts "Add Transaction" to open the QuickTransactionModal popup
// instead of navigating to a separate page.
//
// FIXED: account balances now come from the shared `useAccountBalances` hook,
// which seeds Cash-in-Hand with the opening balance stored in
// `settings/cashOpening`. Previously this file computed
// `computeCashInHandBalance(vm.transactions)` with no seed, so the modal's
// Account dropdown showed the raw ledger delta and never reflected the opening
// balance — even right after the user set or changed it.
//
// Also fixed: banks/companies used to load only once the modal was opened
// (`if (!showModal) return`), so the first render of the dropdown showed an
// empty list and a 0 balance until the fetch landed. Both are now loaded up
// front, and banks stay live via onSnapshot.
//
// FIXED (again): even with the above, clicking "Add Transaction" the instant
// the page opened could still show the dropdown with each account's raw
// OPENING balance and no ledger delta applied yet — `useAccountBalances`
// exposes `isLoading` for exactly this window (its bank/cash subscriptions
// haven't resolved), but nothing here was checking it. The modal could mount
// and read `banksWithLiveBalance` mid-flight. Now: clicking the button while
// still loading just queues the open — the modal itself is never rendered
// until `isLoading` is false, so the Account dropdown can never show a
// pre-ledger number again.

import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { useTransactionListViewModel } from '../viewModels/useTransactionListViewModel';
import { useAccountBalances } from '../viewModels/useAccountBalances';
import { TransactionListView } from './TransactionListView';
import { QuickTransactionModal } from './QuickTransactionModal';

export function TransactionListWrapper() {
  const vm = useTransactionListViewModel();
  const [showModal, setShowModal]     = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [companies, setCompanies]     = useState<string[]>(['Main Office']);

  // Cash-in-Hand + per-bank balances, live, opening-balance-seeded.
  const { banksWithLiveBalance, cashBalance, isLoading: accountsLoading } =
    useAccountBalances(vm.transactions);

  // Branch/company list for the popup. Loaded once on mount rather than on
  // modal open so the dropdown is populated the instant the modal appears.
  useEffect(() => {
    getDocs(collection(db, 'companies'))
      .then(snap => {
        const list = snap.docs.map(d => (d.data() as any).name).filter(Boolean);
        setCompanies(list.length ? list : ['Main Office']);
      })
      .catch(() => setCompanies(['Main Office']));
  }, []);

  // If the user clicks "Add Transaction" while account balances are still
  // resolving, don't open the modal yet — queue it, and open automatically
  // the moment the live balances land. This is the fix: the dropdown can
  // never render with a stale/opening-only number again.
  const handleCreateTransaction = () => {
    if (accountsLoading) {
      setPendingOpen(true);
    } else {
      setShowModal(true);
    }
  };

  useEffect(() => {
    if (pendingOpen && !accountsLoading) {
      setShowModal(true);
      setPendingOpen(false);
    }
  }, [pendingOpen, accountsLoading]);

  return (
    <>
      <TransactionListView
        {...vm}
        handleCreateTransaction={handleCreateTransaction}
      />
      {/* Extra safety: even if showModal were somehow set true early, never
          actually mount the modal until live balances have finished loading. */}
      {showModal && !accountsLoading && (
        <QuickTransactionModal
          banks={banksWithLiveBalance}
          companies={companies}
          cashBalance={cashBalance}
          transactions={vm.transactions}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            // onSnapshot keeps the list live, but trigger a manual refresh too
            vm.refreshTransactions?.();
          }}
        />
      )}
    </>
  );
}