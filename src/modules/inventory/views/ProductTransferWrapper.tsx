// Inventory Module - Wrapper
// ProductTransferWrapper — full-page report at /product-transfer (kept intact
// even though the Transfer tile in the inventory dashboard now opens the
// popup version via ProductTransferCreateWrapper). Anything that navigates
// to /product-transfer still lands here.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useProductTransferViewModel } from '../viewModels/useProductTransferViewModel';
import { ProductTransferView } from './ProductTransferView';

export const ProductTransferWrapper: React.FC = () => {
  const navigate  = useNavigate();
  const viewModel = useProductTransferViewModel();

  return (
    <ProductTransferView
      transfers={viewModel.transfers}
      viewTransfer={viewModel.viewTransfer}
      isLoading={viewModel.isLoading}
      stats={viewModel.stats}
      onAdd={() => navigate('/product-transfer/new')}
      onView={t => viewModel.setViewTransfer(t)}
      onMarkReceived={(t, receiverName) => viewModel.handleMarkReceived(t, receiverName)}
      onDelete={id => viewModel.handleDeleteTransfer(id)}
      onCloseView={() => viewModel.setViewTransfer(null)}
      formatDateTime={viewModel.formatDateTime}
    />
  );
};