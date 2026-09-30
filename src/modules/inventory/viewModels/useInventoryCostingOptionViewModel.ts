// Inventory Module - ViewModel Layer
// useInventoryCostingOptionViewModel - Step 2: Choose costing option
// UPDATED: "without costing" now routes to the multi-model entry page
//          instead of jumping straight to single-product details.

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CostingOption } from '../models/types';

export interface UseInventoryCostingOptionViewModelReturn {
  selectedOption: CostingOption | null;
  selectOption: (option: CostingOption) => void;
  selectOptionAndContinue: (option: CostingOption) => void;
  handleContinue: () => void;
  handleBack: () => void;
  canContinue: boolean;
}

export function useInventoryCostingOptionViewModel(): UseInventoryCostingOptionViewModelReturn {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedOption, setSelectedOption] = useState<CostingOption | null>(null);
  const inventoryType = searchParams.get('type') || 'payment';

  // Credit inventory never gets a with/without costing choice — always "without".
  useEffect(() => {
    if (inventoryType === 'credit') {
      navigate(`/inventory/create-new/multi-models?type=${inventoryType}&costing=without`, { replace: true });
    }
  }, [inventoryType, navigate]);

  const selectOption = useCallback((option: CostingOption) => setSelectedOption(option), []);

  const selectOptionAndContinue = useCallback((option: CostingOption) => {
    setSelectedOption(option);
    if (option === 'with') {
      // With costing → costing details (USD rate, customs, freight per model)
      navigate(`/inventory/create-new/costing-details?type=${inventoryType}&costing=${option}`);
    } else {
      // Without costing → multi-model entry (brand + multiple models at once)
      navigate(`/inventory/create-new/multi-models?type=${inventoryType}&costing=${option}`);
    }
  }, [navigate, inventoryType]);

  const handleContinue = useCallback(() => {
    if (!selectedOption) return;
    if (selectedOption === 'with') {
      navigate(`/inventory/create-new/costing-details?type=${inventoryType}&costing=${selectedOption}`);
    } else {
      navigate(`/inventory/create-new/multi-models?type=${inventoryType}&costing=${selectedOption}`);
    }
  }, [navigate, selectedOption, inventoryType]);

  const handleBack = useCallback(() => navigate('/inventory/create-new'), [navigate]);

  return {
    selectedOption, selectOption, selectOptionAndContinue,
    handleContinue, handleBack,
    canContinue: selectedOption !== null,
  };
}