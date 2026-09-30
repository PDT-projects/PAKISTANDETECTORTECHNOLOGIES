// Inventory Module - Wrapper
// InventoryTypeSelectionWrapper

import React from 'react';
import { useInventoryTypeSelectionViewModel } from '../viewModels/useInventoryTypeSelectionViewModel';
import { InventoryTypeSelectionView } from './InventoryTypeSelectionView';

export const InventoryTypeSelectionWrapper: React.FC = () => {
  const viewModel = useInventoryTypeSelectionViewModel();
  return <InventoryTypeSelectionView {...viewModel} />;
};