// Inventory Module - Wrapper
import React from 'react';
import { useInventoryCostingDetailsViewModel } from '../viewModels/useInventoryCostingDetailsViewModel';
import { InventoryCostingDetailsView } from './InventoryCostingDetailsView';
export const InventoryCostingDetailsWrapper: React.FC = () => {
  const viewModel = useInventoryCostingDetailsViewModel();
  return <InventoryCostingDetailsView {...viewModel} />;
};