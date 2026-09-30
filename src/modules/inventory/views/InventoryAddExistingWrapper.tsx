// Inventory Module - Wrapper
import React from 'react';
import { useInventoryAddExistingViewModel } from '../viewModels/useInventoryAddExistingViewModel';
import { InventoryAddExistingView } from './InventoryAddExistingView';

export const InventoryAddExistingWrapper: React.FC = () => {
  const viewModel = useInventoryAddExistingViewModel();
  return <InventoryAddExistingView {...viewModel} />;
};