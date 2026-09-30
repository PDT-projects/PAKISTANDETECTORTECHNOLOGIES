// Inventory Module - Wrapper
import React from 'react';
import { useInventoryReturnViewModel } from '../viewModels/useInventoryReturnViewModel';
import { InventoryReturnView } from './InventoryReturnView';

export const InventoryReturnWrapper: React.FC = () => {
  const viewModel = useInventoryReturnViewModel();
  return <InventoryReturnView {...viewModel} />;
};