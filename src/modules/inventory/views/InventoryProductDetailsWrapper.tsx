// Inventory Module - Wrapper
import React from 'react';
import { useInventoryProductDetailsViewModel } from '../viewModels/useInventoryProductDetailsViewModel';
import { InventoryProductDetailsView } from './InventoryProductDetailsView';
export const InventoryProductDetailsWrapper: React.FC = () => {
  const viewModel = useInventoryProductDetailsViewModel();
  return <InventoryProductDetailsView {...viewModel} />;
};