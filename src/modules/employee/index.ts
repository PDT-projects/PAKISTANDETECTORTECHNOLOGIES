// Employee Module - Public API
// Export all components, hooks, and types for external use

// Models
export * from './models/types';
export { EmployeeService } from './models/employeeService';
export { EmployeeFirebaseService } from './models/employeeFirebaseService';

// ViewModels
export { useEmployeeListViewModel } from './viewModels/useEmployeeListViewModel';
export { useEmployeeFormViewModel } from './viewModels/useEmployeeFormViewModel';
export { useEmployeeDeleteViewModel } from './viewModels/useEmployeeDeleteViewModel';

// Views
export { EmployeeListView } from './views/EmployeeListView';
export { EmployeeFormView } from './views/EmployeeFormView';
export { EmployeeDeleteView } from './views/EmployeeDeleteView';

// Wrappers
export { EmployeeListWrapper } from './views/EmployeeListWrapper';
export { EmployeeCreateWrapper } from './views/EmployeeCreateWrapper';
export { EmployeeEditWrapper } from './views/EmployeeEditWrapper';
export { EmployeeDeleteWrapper } from './views/EmployeeDeleteWrapper';

// Components

export { EmployeeFilters } from './views/components/EmployeeFilters';
export { EmployeeTable } from './views/components/EmployeeTable';
export { EmployeeViewModal } from './views/components/EmployeeViewModal';
export { EmployeeFormFields } from './views/components/EmployeeFormFields';

