// Inventory Module - Wrapper
// DeletedInventoryWrapper
// FIX: was rendering a nonexistent `../pages/DeletedInventoryPage`, which is why
//      the Deleted Inventory card failed to open. Now wired the same way as
//      every other wrapper in this module (Damaged, Report, etc.).

import React from 'react';
import { useDeletedInventoryViewModel } from '../viewModels/useDeletedInventoryViewModel';
import { DeletedInventoryView } from './DeletedInventoryView';

export const DeletedInventoryWrapper: React.FC = () => {
  const vm = useDeletedInventoryViewModel();
  return <DeletedInventoryView {...vm} />;
};