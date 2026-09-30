// Employee Module - View Layer
// EmployeeListView - Main page for employee list with filters
// UPDATED: EmployeeTable now receives salaryCurrency per employee and shows it
//          alongside the salary amount. The header rate badge is still shown.
// UPDATED: AED is now the primary display currency (shown first in toggle).

import { Plus, Filter, Coins } from 'lucide-react';
import { Employee, EmployeeFilters as EmployeeFiltersType } from '../models/types';
import { EmployeeService } from '../models/employeeService';
import { EmployeeFilters } from './components/EmployeeFilters';
import { EmployeeTable } from './components/EmployeeTable';
import { EmployeeViewModal } from './components/EmployeeViewModal';
import type { SalaryCurrency } from './EmployeeFormView';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

export type { SalaryCurrency };

interface EmployeeListViewProps {
  employees: Employee[];
  uniquePositions: string[];
  filters: EmployeeFiltersType;
  showFilters: boolean;
  activeFilterCount: number;
  displayCurrency: SalaryCurrency;
  onCurrencyToggle: (currency: SalaryCurrency) => void;
  viewEmployee: Employee | null;
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  setFilter: (key: keyof EmployeeFiltersType, value: any) => void;
  clearFilters: () => void;
  toggleFilters: () => void;
  setViewEmployee: (employee: Employee | null) => void;
  handleEdit: (id: string) => void;
  handleDelete: (id: string) => void;
  handleAddEmployee: () => void;
}

export function EmployeeListView({
  employees, uniquePositions, filters, showFilters, activeFilterCount,
  displayCurrency, onCurrencyToggle, viewEmployee, totalCount,
  handleEdit, handleDelete, handleAddEmployee,
  setFilter, clearFilters, toggleFilters, setViewEmployee,
}: EmployeeListViewProps) {
  const { name: globalCurrencyName, symbol: globalCurrencySymbol } = useGlobalCurrency();
  const name = `${globalCurrencySymbol} ${globalCurrencyName}`;
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Employees</h2>
          <p className="text-sm text-gray-500 mt-1">Manage your employee records ({totalCount} total)</p>
        </div>
        <div className="flex items-center gap-3">

          {/* Salaries now follow the Admin's global currency setting
              automatically (converted live from each employee's actual
              pay currency) — this is just a read-only indicator, change
              it from the Admin Dashboard. */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-medium text-gray-600">
            <Coins size={14} className="text-amber-600" />
            {name}
          </div>

          <button
            onClick={toggleFilters}
            style={showFilters ? { backgroundColor: '#374151', color: '#ffffff' } : {}}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              showFilters ? '' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Filter size={20} />
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>

          <button
            onClick={handleAddEmployee}
            style={{ backgroundColor: '#374151' }}
            className="flex items-center gap-2 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus size={20} />
            Add Employee
          </button>
        </div>
      </div>

      {showFilters && (
        <EmployeeFilters filters={filters} uniquePositions={uniquePositions} onFilterChange={setFilter} onClearFilters={clearFilters} />
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">All Employees ({employees.length})</h3>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {/* Legend */}
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" /> AED employees
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> PKR employees
            </span>
            <span>Rate: 1 AED = {EmployeeService.AED_TO_PKR} PKR</span>
          </div>
        </div>
        <EmployeeTable
          employees={employees}
          onView={setViewEmployee}
          onEdit={handleEdit}
          onDelete={handleDelete}
          displayCurrency={displayCurrency}
          formatCurrency={EmployeeService.formatCurrency}
          convertSalary={EmployeeService.convertSalary}
        />
      </div>

      {viewEmployee && (
        <EmployeeViewModal
          employee={viewEmployee}
          onClose={() => setViewEmployee(null)}
          formatCurrency={EmployeeService.formatCurrency}
          formatDate={EmployeeService.formatDate}
          convertSalary={EmployeeService.convertSalary}
          displayCurrency={displayCurrency}
        />
      )}
    </div>
  );
}