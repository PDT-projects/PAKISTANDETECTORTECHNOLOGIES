// Employee Module - ViewModel Layer
// useEmployeeFormViewModel - Business logic for employee form (Create/Edit)
// UPDATED: salaryCurrency ('PKR' | 'AED') is stored on the employee and
//          propagated through create/edit flows.

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Employee, CreateEmployeeDTO, UpdateEmployeeDTO } from '../models/types';
import { EmployeeService } from '../models/employeeService';
import { EmployeeFirebaseService } from '../models/employeeFirebaseService';
import type { SalaryCurrency } from '../views/EmployeeFormView';

export const DEFAULT_EMPLOYEE_LOCATIONS: readonly string[] = [
  'Dubai', 'Abu Dhabi', 'Sharjah', 'Riyadh', 'Jeddah', 'Dammam',
  'Doha', 'Kuwait City', 'Muscat', 'Bahrain', 'Chad', 'Sudan',
  'Cairo', 'Nairobi', 'Lagos', 'London', 'Toronto', 'New York', 'Other',
];

const CUSTOM_LOCATIONS_KEY = 'employee_custom_locations';
function loadCustomEmployeeLocations(): string[] {
  try { const raw = localStorage.getItem(CUSTOM_LOCATIONS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveCustomEmployeeLocations(locs: string[]): void {
  try { localStorage.setItem(CUSTOM_LOCATIONS_KEY, JSON.stringify(locs)); } catch {}
}

interface UseEmployeeFormViewModelProps { mode: 'create' | 'edit'; }

interface UseEmployeeFormViewModelReturn {
  formData: Partial<Employee>;
  isValid: boolean;
  errorMessage: string | null;
  isLoading: boolean;
  isSaving: boolean;
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

export function useEmployeeFormViewModel({ mode }: UseEmployeeFormViewModelProps): UseEmployeeFormViewModelReturn {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [formData, setFormData] = useState<Partial<Employee>>(EmployeeService.getDefaultFormData());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // salaryCurrency mirrors formData.salaryCurrency for convenience; kept in sync
  const [salaryCurrency, setSalaryCurrencyState] = useState<SalaryCurrency>('AED');
  const [customLocations, setCustomLocations] = useState<string[]>(loadCustomEmployeeLocations);

  const allLocations: string[] = [
    ...DEFAULT_EMPLOYEE_LOCATIONS,
    ...customLocations.filter(l => !(DEFAULT_EMPLOYEE_LOCATIONS as readonly string[]).includes(l)),
  ];

  const addCustomLocation = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCustomLocations(prev => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      saveCustomEmployeeLocations(next);
      return next;
    });
  }, []);

  const isEditMode = mode === 'edit';
  const validation = EmployeeService.validateEmployee(formData);

  useEffect(() => {
    if (isEditMode && id) {
      (async () => {
        try {
          setIsLoading(true);
          const employee = await EmployeeFirebaseService.fetchEmployeeById(id);
          if (employee) {
            setFormData(employee);
            // Restore the persisted currency
            setSalaryCurrencyState((employee as any).salaryCurrency || 'AED');
          }
          else { toast.error('Employee not found'); navigate('/employees'); }
        } catch { toast.error('Failed to load employee'); navigate('/employees'); }
        finally { setIsLoading(false); }
      })();
    }
  }, [isEditMode, id, navigate]);

  const setField = useCallback((field: keyof Employee, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Keep salaryCurrency in formData and in local state in sync
  const onSalaryCurrencyChange = useCallback((currency: SalaryCurrency) => {
    setSalaryCurrencyState(currency);
    setFormData(prev => ({ ...prev, salaryCurrency: currency }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const v = EmployeeService.validateEmployee(formData);
    if (!v.isValid) { toast.error(v.error || 'Please fill in all required fields'); return; }
    setIsSaving(true);
    try {
      // Always persist salaryCurrency alongside the employee record
      const payload = { ...(formData as CreateEmployeeDTO), salaryCurrency };
      if (isEditMode && id) {
        await EmployeeFirebaseService.updateEmployee({ ...payload, id });
        toast.success('Employee updated successfully');
      } else {
        await EmployeeFirebaseService.createEmployee(payload);
        toast.success('Employee added successfully');
      }
      navigate('/employees');
    } catch { toast.error('An error occurred while saving the employee'); }
    finally { setIsSaving(false); }
  }, [formData, isEditMode, id, navigate, salaryCurrency]);

  return {
    formData, isValid: validation.isValid, errorMessage: validation.error,
    isLoading, isSaving, isEditMode,
    pageTitle: isEditMode ? 'Edit Employee' : 'Add Employee',
    submitButtonText: isEditMode ? 'Update Employee' : 'Save Employee',
    allLocations, addCustomLocation,
    onFieldChange: setField, onSubmit: handleSubmit,
    onCancel: useCallback(() => navigate('/employees'), [navigate]),
    salaryCurrency, onSalaryCurrencyChange,
  };
}