// Employee Module - Wrapper Component
// EmployeeListWrapper - Connects ViewModel to View

import React from 'react';
import { useEmployeeListViewModel } from '../viewModels/useEmployeeListViewModel';
import { EmployeeListView } from './EmployeeListView';

export const EmployeeListWrapper: React.FC = () => {
  const viewModel = useEmployeeListViewModel();
  return <EmployeeListView {...viewModel} />;
};