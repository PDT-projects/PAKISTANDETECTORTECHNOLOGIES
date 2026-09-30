// Inventory Module - ViewModel Layer
// useInventoryTypeSelectionViewModel - Step 1: Credit vs Payment
// CHANGED: was "in-stock vs on-order" — now asks whether this batch is being
// added on supplier credit or paid for now. Generic over InventoryEntryType,
// so no logic changes were needed here — only the type's possible values.

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { InventoryEntryType } from '../models/types';

export interface UseInventoryTypeSelectionViewModelReturn {
  selectedType: InventoryEntryType | null;
  selectType: (type: InventoryEntryType) => void;
  selectTypeAndContinue: (type: InventoryEntryType) => void;
  handleContinue: () => void;
  handleBack: () => void;
  canContinue: boolean;
}

export function useInventoryTypeSelectionViewModel(): UseInventoryTypeSelectionViewModelReturn {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<InventoryEntryType | null>(null);

  const selectType = useCallback((type: InventoryEntryType) => setSelectedType(type), []);

  const selectTypeAndContinue = useCallback((type: InventoryEntryType) => {
    setSelectedType(type);
    navigate(`/inventory/create-new/costing?type=${type}`);
  }, [navigate]);

  const handleContinue = useCallback(() => {
    if (selectedType) navigate(`/inventory/create-new/costing?type=${selectedType}`);
  }, [navigate, selectedType]);

  const handleBack = useCallback(() => navigate('/inventory'), [navigate]);

  return {
    selectedType, selectType, selectTypeAndContinue,
    handleContinue, handleBack, canContinue: selectedType !== null,
  };
}