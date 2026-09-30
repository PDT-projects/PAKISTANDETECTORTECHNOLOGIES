// Inventory Module - ViewModel Layer
// useInventoryDashboardViewModel - Navigation hub for inventory entry options
// FIX: Added onViewDeleted navigation handler for the Deleted Inventory card

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface UseInventoryDashboardViewModelReturn {
  onAddNewInventory: () => void;
  onAddToExisting: () => void;
  onAddReturnedInventory: () => void;
  onViewReceivable: () => void;
  onViewInventory: () => void;
  onViewReport: () => void;
  onProductTransfer: () => void;
  onViewDeleted: () => void;
  onViewPayables: () => void;
}

export function useInventoryDashboardViewModel(): UseInventoryDashboardViewModelReturn {
  const navigate = useNavigate();

  const onAddNewInventory      = useCallback(() => navigate('/inventory/create-new'), [navigate]);
  const onAddToExisting        = useCallback(() => navigate('/inventory/add-existing'), [navigate]);
  const onAddReturnedInventory = useCallback(() => navigate('/inventory/add-returned'), [navigate]);
  const onViewReceivable       = useCallback(() => navigate('/inventory/receivable'), [navigate]);
  const onViewInventory        = useCallback(() => navigate('/inventory/view'), [navigate]);
  const onViewReport           = useCallback(() => navigate('/inventory/report'), [navigate]);
  const onProductTransfer      = useCallback(() => navigate('/product-transfer'), [navigate]);
  const onViewDeleted          = useCallback(() => navigate('/inventory/deleted'), [navigate]);
  const onViewPayables         = useCallback(() => navigate('/inventory/payables'), [navigate]);

  return {
    onAddNewInventory,
    onAddToExisting,
    onAddReturnedInventory,
    onViewReceivable,
    onViewInventory,
    onViewReport,
    onProductTransfer,
    onViewDeleted,
    onViewPayables,
  };
}