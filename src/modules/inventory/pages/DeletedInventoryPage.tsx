// Inventory Module - Page Layer
// DeletedInventoryPage
// Wires useDeletedInventoryViewModel → DeletedInventoryView

import React from 'react';
import { useDeletedInventoryViewModel } from '../viewModels/useDeletedInventoryViewModel';
import { DeletedInventoryView } from '../views/DeletedInventoryView';

export function DeletedInventoryPage() {
  const vm = useDeletedInventoryViewModel();

  return (
    <DeletedInventoryView
      records={vm.records}
      filteredRecords={vm.filteredRecords}
      isLoading={vm.isLoading}
      error={vm.error}
      search={vm.search}
      setSearch={vm.setSearch}
      viewItem={vm.viewItem}
      setViewItem={vm.setViewItem}
      onBack={vm.onBack}
      totalCount={vm.totalCount}
    />
  );
}