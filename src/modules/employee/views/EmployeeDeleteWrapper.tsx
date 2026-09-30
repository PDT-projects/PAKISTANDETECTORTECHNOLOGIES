// Employee Module - Wrapper Component
// EmployeeDeleteWrapper - Connects ViewModel to View for deleting employees

import React from 'react';
import { useEmployeeDeleteViewModel } from '../viewModels/useEmployeeDeleteViewModel';
import { EmployeeDeleteView } from './EmployeeDeleteView';

export const EmployeeDeleteWrapper: React.FC = () => {
  const viewModel = useEmployeeDeleteViewModel();
  return <EmployeeDeleteView {...viewModel} />;
};
