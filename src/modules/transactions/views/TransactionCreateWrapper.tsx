// Transactions Module - Create Wrapper
import React from 'react';
import { useTransactionFormViewModel } from '../viewModels/useTransactionFormViewModel';
import { TransactionFormView } from './TransactionFormView';
export function TransactionCreateWrapper() {
  const vm = useTransactionFormViewModel();
  return <TransactionFormView {...vm} />;
}