// Inventory Module - Wrapper
import React from 'react';
import { useInventoryPaymentViewModel } from '../viewModels/useInventoryPaymentViewModel';
import { InventoryPaymentView } from './InventoryPaymentView';

export const InventoryPaymentWrapper: React.FC = () => {
  const viewModel = useInventoryPaymentViewModel();
  return <InventoryPaymentView {...viewModel} />;
};