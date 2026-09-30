// Invoice Module - Wrapper
import React from 'react';
import { useDeletedInvoicesViewModel } from '../viewModels/useDeletedInvoicesViewModel';
import { DeletedInvoicesView } from './DeletedInvoicesView';

export function DeletedInvoicesWrapper() {
  const vm = useDeletedInvoicesViewModel();
  return <DeletedInvoicesView {...vm} />;
}