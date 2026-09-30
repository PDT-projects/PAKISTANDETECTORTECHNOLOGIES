// Employee Module - View Layer
// EmployeeFormView - Shared form page for Create/Edit employee

import { ArrowLeft } from 'lucide-react';
import { Employee } from '../models/types';
import { EmployeeFormFields } from './components/EmployeeFormFields';

// Single source of truth for this type — import from here everywhere
export type SalaryCurrency = 'PKR' | 'AED';

interface EmployeeFormViewProps {
  formData: Partial<Employee>;
  isEditMode: boolean;
  pageTitle: string;
  submitButtonText: string;
  allLocations: string[];
  addCustomLocation: (name: string) => void;
  onFieldChange: (field: keyof Employee, value: any) => void;
  onSubmit: () => void;
  onCancel: () => void;
  salaryCurrency: SalaryCurrency;
  onSalaryCurrencyChange: (currency: SalaryCurrency) => void;
}

export function EmployeeFormView({
  formData, isEditMode, pageTitle, submitButtonText,
  allLocations, addCustomLocation, onFieldChange,
  onSubmit, onCancel, salaryCurrency, onSalaryCurrencyChange,
}: EmployeeFormViewProps) {
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Header */}
        <div style={{ backgroundColor: '#374151' }} className="flex items-center justify-between p-6 border-b border-gray-200 text-white rounded-t-xl">
          <div className="flex items-center gap-3">
            <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Back to Employees">
              <ArrowLeft size={20} />
            </button>
            <h3 className="text-xl font-bold">{pageTitle}</h3>
          </div>

          {/* Currency Selector */}
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-sm">Salary in:</span>
            <div className="flex items-center bg-white/10 rounded-lg p-1 gap-1">
              {(['PKR', 'AED'] as SalaryCurrency[]).map(cur => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => onSalaryCurrencyChange(cur)}
                  style={salaryCurrency === cur ? { backgroundColor: '#ffffff', color: '#374151' } : {}}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    salaryCurrency === cur
                      ? 'font-semibold shadow-sm'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {cur === 'PKR' ? '₨ PKR' : 'د.إ AED'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Form Content */}
        <div className="p-8 max-w-4xl mx-auto">
          <div className="space-y-4">
            <EmployeeFormFields
              formData={formData}
              onFieldChange={onFieldChange}
              allLocations={allLocations}
              addCustomLocation={addCustomLocation}
              salaryCurrency={salaryCurrency}
              onSalaryCurrencyChange={onSalaryCurrencyChange}
            />

            <div className="flex items-center justify-end gap-3 pt-4">
              <button onClick={onCancel} className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { console.log('🖱️ Submit clicked'); onSubmit(); }}
                style={{ backgroundColor: '#374151' }}
                className="px-6 py-2.5 text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                {submitButtonText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}