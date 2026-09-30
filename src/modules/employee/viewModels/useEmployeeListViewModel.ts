// Employee Module - ViewModel Layer
// useEmployeeListViewModel - Business logic for employee list page

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Employee, EmployeeFilters } from '../models/types';
import { EmployeeService } from '../models/employeeService';
import { EmployeeFirebaseService } from '../models/employeeFirebaseService';
import type { SalaryCurrency } from '../views/EmployeeFormView';

interface UseEmployeeListViewModelReturn {
  employees: Employee[];
  uniquePositions: string[];
  isLoading: boolean;
  error: string | null;
  filters: EmployeeFilters;
  showFilters: boolean;
  activeFilterCount: number;
  displayCurrency: SalaryCurrency;
  onCurrencyToggle: (currency: SalaryCurrency) => void;
  viewEmployee: Employee | null;
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  setFilter: (key: keyof EmployeeFilters, value: any) => void;
  clearFilters: () => void;
  toggleFilters: () => void;
  setViewEmployee: (employee: Employee | null) => void;
  handleEdit: (id: string) => void;
  handleDelete: (id: string) => void;
  handleAddEmployee: () => void;
  refreshEmployees: () => Promise<void>;
}

export function useEmployeeListViewModel(): UseEmployeeListViewModelReturn {
  const navigate = useNavigate();

  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // UPDATED: AED is now the primary/default display currency
  const [displayCurrency, setDisplayCurrency] = useState<SalaryCurrency>('AED');
  const [filters, setFilters] = useState<EmployeeFilters>({
    nameSearch: '',
    positionFilter: '',
    minSalary: null,
    maxSalary: null,
    phoneSearch: '',
    emailSearch: '',
    statusFilter: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null);

  const fetchEmployees = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const employees = await EmployeeFirebaseService.fetchAllEmployees();
      setAllEmployees(employees);
    } catch (err) {
      console.error('❌ Error loading employees:', err);
      setError('Failed to load employees. Please try again.');
      toast.error('Failed to load employees');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const employees = useMemo(() => EmployeeService.filterEmployees(allEmployees, filters), [allEmployees, filters]);
  const uniquePositions = useMemo(() => EmployeeService.getUniquePositions(allEmployees), [allEmployees]);
  const stats = useMemo(() => EmployeeService.calculateStats(employees), [employees]);
  const activeFilterCount = useMemo(() => EmployeeService.countActiveFilters(filters), [filters]);

  const setFilter = useCallback((key: keyof EmployeeFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ nameSearch: '', positionFilter: '', minSalary: null, maxSalary: null, phoneSearch: '', emailSearch: '', statusFilter: '' });
  }, []);

  const toggleFilters = useCallback(() => setShowFilters(prev => !prev), []);
  const handleEdit = useCallback((id: string) => navigate(`/employees/${id}/edit`), [navigate]);
  const handleDelete = useCallback((id: string) => navigate(`/employees/${id}/delete`), [navigate]);
  const handleAddEmployee = useCallback(() => navigate('/employees/create'), [navigate]);
  const refreshEmployees = useCallback(async () => { await fetchEmployees(); toast.success('Employee list refreshed'); }, [fetchEmployees]);

  return {
    employees,
    uniquePositions,
    isLoading,
    error,
    filters,
    showFilters,
    activeFilterCount,
    displayCurrency,
    onCurrencyToggle: setDisplayCurrency,
    viewEmployee,
    totalCount: stats.totalCount,
    activeCount: stats.activeCount,
    inactiveCount: stats.inactiveCount,
    setFilter,
    clearFilters,
    toggleFilters,
    setViewEmployee,
    handleEdit,
    handleDelete,
    handleAddEmployee,
    refreshEmployees,
  };
}