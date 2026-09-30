// Employee Module - View Layer
// EmployeeTable Component - Table UI for employee list

import { Eye, Edit, Trash2 } from 'lucide-react';
import { Employee } from '../../models/types';
import type { SalaryCurrency } from '../EmployeeFormView';
import { useGlobalCurrency } from '../../../../shared/currency/useGlobalCurrency';
import { formatSalaryInGlobalCurrency } from '../CurrencyUtils';
import { LockedScrollTable } from '../../../../shared/components/LockedScrollTable';

interface EmployeeTableProps {
  employees: Employee[];
  onView: (employee: Employee) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  formatCurrency: (amount: number, currency?: SalaryCurrency) => string;
  convertSalary: (amount: number, from: SalaryCurrency, to: SalaryCurrency) => number;
  displayCurrency: SalaryCurrency;
}

export function EmployeeTable({
  employees,
  onView,
  onEdit,
  onDelete,
}: EmployeeTableProps) {
  // Subscribed so the table re-renders the instant Admin changes the
  // global currency — the actual conversion happens in displaySalary()
  // below, always reading the live setting.
  const { code: globalCode } = useGlobalCurrency();

  if (employees.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-gray-500">
        <div className="text-lg font-medium mb-2">No employees found</div>
        <div className="text-sm">Try adjusting your filters or clearing them to see all employees.</div>
      </div>
    );
  }

  // Convert each employee's salary FROM their own actually-stored currency
  // (employee.salaryCurrency — this is a real fact about their pay, not a
  // relabeled AED figure) INTO whatever currency the Admin has picked
  // globally. If not set, fall back to 'AED' (system default for all old
  // records).
  const displaySalary = (employee: Employee) => {
    const empCurrency: SalaryCurrency = (employee as any).salaryCurrency || 'AED';
    return formatSalaryInGlobalCurrency(employee.salary, empCurrency);
  };

  return (
    <LockedScrollTable maxHeight="65vh">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {['Name', 'Position', `Salary (${globalCode})`, 'Phone', 'Email', 'Status', 'Actions'].map(h => (
              <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {employees.map(employee => (
            <tr key={employee.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{employee.name}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{employee.position}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                {displaySalary(employee)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{employee.phone}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{employee.email}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                  employee.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {employee.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <div className="flex items-center gap-2">
                  <button onClick={() => onView(employee)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="View">
                    <Eye size={16} />
                  </button>
                  <button onClick={() => onEdit(employee.id)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Edit">
                    <Edit size={16} />
                  </button>
                  <button onClick={() => onDelete(employee.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </LockedScrollTable>
  );
}