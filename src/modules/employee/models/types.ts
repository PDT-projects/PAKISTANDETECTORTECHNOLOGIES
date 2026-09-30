// Employee Module - Model Layer
// Data interfaces and types extracted from App.tsx

/**
 * Employee entity representing an employee in the system
 */
export interface Employee {
  id: string;
  name: string;
  position: string;
  salary: number;
  phone: string;
  email: string;
  joinDate: string;
  status: 'active' | 'inactive';
  location: 'Karachi' | 'Islamabad' | 'Lahore' | 'Dubai' | 'Saudia' | 'Chad' | 'Sudan' | string;
  accountNumber: string;
  bankName: string;
  accountTitle: string;
  salaryCurrency?: 'PKR' | 'AED';
  createdAt?: string;
  updatedAt?: string;
}



/**
 * DTO for creating a new employee
 */
export interface CreateEmployeeDTO {
  name: string;
  position: string;
  salary: number;
  phone: string;
  email: string;
  joinDate: string;
  status: 'active' | 'inactive';
  location: 'Karachi' | 'Islamabad' | 'Lahore' | 'Dubai' | 'Saudia' | 'Chad' | 'Sudan' | string;
  accountNumber: string;
  bankName: string;
  accountTitle: string;
  salaryCurrency?: 'PKR' | 'AED';
}



/**
 * DTO for updating an existing employee
 */
export interface UpdateEmployeeDTO extends CreateEmployeeDTO {
  id: string;
}

/**
 * Filter criteria for employee list
 */
export interface EmployeeFilters {
  nameSearch: string;
  positionFilter: string;
  minSalary: number | null;
  maxSalary: number | null;
  phoneSearch: string;
  emailSearch: string;
  statusFilter: '' | 'active' | 'inactive';
}

/**
 * Employee statistics for dashboard/display
 */
export interface EmployeeStats {
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  averageSalary: number;
  totalSalary: number;
}

/**
 * Validation result for employee data
 */
export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}