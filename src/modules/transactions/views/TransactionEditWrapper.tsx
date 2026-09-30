// Transactions Module - Edit Wrapper (uses same form vm — reads id from URL params)
import React from 'react';
import { useTransactionFormViewModel } from '../viewModels/useTransactionFormViewModel';
import { TransactionFormView } from './TransactionFormView';
export function TransactionEditWrapper() {
  const vm = useTransactionFormViewModel();
  return <TransactionFormView {...vm} />;
}