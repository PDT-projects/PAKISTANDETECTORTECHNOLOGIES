// Inventory Module - Wrapper
// InventoryDashboardWrapper
// Wires useInventoryDashboardViewModel → InventoryDashboardView.
// The view now pulls its own list + payables data internally,
// so the wrapper only needs to supply navigation callbacks.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useInventoryDashboardViewModel } from '../viewModels/useInventoryDashboardViewModel';
import { InventoryDashboardView } from './InventoryDashboardView';

export const InventoryDashboardWrapper: React.FC = () => {
  const navigate  = useNavigate();
  const viewModel = useInventoryDashboardViewModel();

  return (
    <InventoryDashboardView
      {...viewModel}
      onViewTransfer={() => navigate('/product-transfer')}
    />
  );
};