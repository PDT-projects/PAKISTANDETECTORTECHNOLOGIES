// Transactions Module - Pending Payments Wrapper
import React from 'react';
import { usePendingPaymentsViewModel } from '../viewModels/usePendingPaymentsViewModel';
import { PendingPaymentsView } from './PendingPaymentsView';
export function PendingPaymentsWrapper() {
  const vm = usePendingPaymentsViewModel();
  return <PendingPaymentsView {...vm} />;
}