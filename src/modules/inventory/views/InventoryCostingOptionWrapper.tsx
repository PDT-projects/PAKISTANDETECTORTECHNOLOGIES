// Inventory Module - Wrapper
import React from 'react';
import { useInventoryCostingOptionViewModel } from '../viewModels/useInventoryCostingOptionViewModel';
import { InventoryCostingOptionView } from './InventoryCostingOptionView';
export const InventoryCostingOptionWrapper: React.FC = () => {
  const viewModel = useInventoryCostingOptionViewModel();
  return <InventoryCostingOptionView {...viewModel} />;
};