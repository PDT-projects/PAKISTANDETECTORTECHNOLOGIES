// Employee Module - Wrapper Component
// EmployeeEditWrapper - Connects ViewModel to View for editing employees

import React from 'react';
import { useParams } from 'react-router-dom';
import { useEmployeeFormViewModel } from '../viewModels/useEmployeeFormViewModel';
import { EmployeeFormView } from './EmployeeFormView';

export const EmployeeEditWrapper: React.FC = () => {
  const viewModel = useEmployeeFormViewModel({ mode: 'edit' });
  return <EmployeeFormView {...viewModel} />;
};
