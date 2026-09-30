// Inventory Module - Wrapper
import React from 'react';
import { useInventoryPayablesViewModel } from '../viewModels/useInventoryPayablesViewModel';
import { InventoryPayablesView } from './InventoryPayablesView';

export const InventoryPayablesWrapper: React.FC = () => {
  const vm = useInventoryPayablesViewModel();
  return <InventoryPayablesView {...vm} />;
};