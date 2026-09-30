// Inventory Module - Wrapper
import React from 'react';
import { useDamagedInventoryViewModel } from '../viewModels/useDamagedInventoryViewModel';
import { DamagedInventoryView } from './DamagedInventoryView';

export const DamagedInventoryWrapper: React.FC = () => {
  const vm = useDamagedInventoryViewModel();
  return <DamagedInventoryView {...vm} />;
};