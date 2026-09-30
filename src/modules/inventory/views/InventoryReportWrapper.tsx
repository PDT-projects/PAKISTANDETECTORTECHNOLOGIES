// Inventory Module - Wrapper
import React from 'react';
import { useInventoryReportViewModel } from '../viewModels/useInventoryReportViewModel';
import { InventoryReportView } from './InventoryReportView';

export const InventoryReportWrapper: React.FC = () => {
  const viewModel = useInventoryReportViewModel();
  return <InventoryReportView {...viewModel} />;
};