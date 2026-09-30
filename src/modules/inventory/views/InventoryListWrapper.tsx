// Inventory Module - Wrapper
import React from 'react';
import { useAuth } from '../../../providers/context/AuthContext';
import { useInventoryListViewModel } from '../viewModels/useInventoryListViewModel';
import { useProductTransferViewModel } from '../viewModels/useProductTransferViewModel';
import { InventoryListView } from './InventoryListView';

interface Props { inventoryType?: 'in-stock' | 'on-order'; }

export const InventoryListWrapper: React.FC<Props> = ({ inventoryType = 'in-stock' }) => {
  const { user } = useAuth();
  const viewModel = useInventoryListViewModel(inventoryType);
  const { transfers } = useProductTransferViewModel();

  return (
    <InventoryListView
      products={viewModel.products}
      categories={viewModel.categories}
      uniqueLocations={viewModel.uniqueLocations}
      filters={viewModel.filters}
      showFilters={viewModel.showFilters}
      activeFilterCount={viewModel.activeFilterCount}
      viewProduct={viewModel.viewProduct}
      isLoading={viewModel.isLoading}
      stats={viewModel.stats}
      setFilter={viewModel.setFilter}
      clearFilters={viewModel.clearFilters}
      toggleFilters={viewModel.toggleFilters}
      setViewProduct={viewModel.setViewProduct}
      onAddNew={viewModel.onAddNew}
      onAddToExisting={viewModel.onAddToExisting}
      onTransfer={viewModel.onTransfer}
      onReceiveProduct={viewModel.onReceiveProduct}
      onDelete={viewModel.onDelete}
      currentUser={user}
      transfers={transfers}
    />
  );
};