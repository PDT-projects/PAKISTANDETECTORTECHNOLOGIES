// Employee Module - Wrapper Component
// EmployeeCreateWrapper - Connects ViewModel to View for creating employees

import React from 'react';
import { useEmployeeFormViewModel } from '../viewModels/useEmployeeFormViewModel';
import { EmployeeFormView } from './EmployeeFormView';

export const EmployeeCreateWrapper: React.FC = () => {
  const viewModel = useEmployeeFormViewModel({ mode: 'create' });
  return <EmployeeFormView {...viewModel} />;
};
