// Employee Module - View Layer
// EmployeeViewModal Component - Modal for viewing employee details

import { X } from 'lucide-react';
import { Employee } from '../../models/types';
import type { SalaryCurrency } from '../EmployeeFormView';
import { formatSalaryInGlobalCurrency, formatSalary } from '../CurrencyUtils';

interface EmployeeViewModalProps {
  employee: Employee;
  onClose: () => void;
  formatCurrency: (amount: number, currency?: SalaryCurrency) => string;
  formatDate: (dateString: string) => string;
  convertSalary: (amount: number, from: SalaryCurrency, to: SalaryCurrency) => number;
  displayCurrency: SalaryCurrency;
}

export function EmployeeViewModal({
  employee,
  onClose,
  formatDate,
}: EmployeeViewModalProps) {
  // employee.salaryCurrency is what this employee is actually paid in —
  // primarySalary converts that, live, into the Admin's global currency;
  // secondarySalary shows the real, original figure for reference.
  const empCurrency: SalaryCurrency = (employee as any).salaryCurrency || 'AED';
  const primarySalary = formatSalaryInGlobalCurrency(employee.salary, empCurrency);
  const secondarySalary = formatSalary(employee.salary, empCurrency);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full shadow-xl">
        {/* Header */}
        <div style={{ backgroundColor: "#374151" }} className="flex items-center justify-between p-6 border-b border-gray-200 text-white rounded-t-xl">
          <h3 className="text-xl font-bold">Employee Details</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Name</p>
              <p className="font-medium text-gray-900">{employee.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Position</p>
              <p className="font-medium text-gray-900">{employee.position}</p>
            </div>

            {/* Salary — dual currency */}
            <div className="col-span-2 bg-gray-50 rounded-lg p-4 border border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Salary</p>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-lg font-bold text-gray-900">{primarySalary}</p>
                  <p className="text-xs text-gray-400 mt-0.5">≈ {secondarySalary}</p>
                </div>
                <p className="text-xs text-gray-400 border-l border-gray-200 pl-4">
                  Rate: 1 AED = 76.03 PKR
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Phone</p>
              <p className="font-medium text-gray-900">{employee.phone || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Email</p>
              <p className="font-medium text-gray-900">{employee.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Join Date</p>
              <p className="font-medium text-gray-900">{formatDate(employee.joinDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Location</p>
              <p className="font-medium text-gray-900">{employee.location || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</p>
              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                employee.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {employee.status}
              </span>
            </div>

            {/* Bank details */}
            {(employee.bankName || employee.accountNumber) && (
              <div className="col-span-2 border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Bank Details</p>
                <div className="grid grid-cols-2 gap-4">
                  {employee.bankName && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Bank</p>
                      <p className="font-medium text-gray-900">{employee.bankName}</p>
                    </div>
                  )}
                  {employee.accountTitle && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Account Title</p>
                      <p className="font-medium text-gray-900">{employee.accountTitle}</p>
                    </div>
                  )}
                  {employee.accountNumber && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500 mb-1">Account Number</p>
                      <p className="font-medium text-gray-900 font-mono">{employee.accountNumber}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}