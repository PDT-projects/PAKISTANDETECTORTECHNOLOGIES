// Employee Module - Service Layer
// Business logic, data operations, utilities, and currency helpers

import {
  Employee, CreateEmployeeDTO, UpdateEmployeeDTO,
  EmployeeFilters, EmployeeStats, ValidationResult,
} from './types';
import type { SalaryCurrency } from '../views/EmployeeFormView';

// ── Currency constants ──────────────────────────────────────────────────────
export const AED_TO_PKR = 76.03;  // 1 AED → PKR  (June 2026)
export const PKR_TO_AED = 1 / AED_TO_PKR;

export class EmployeeService {

  // ==================== CURRENCY ====================

  static readonly AED_TO_PKR = AED_TO_PKR;
  static readonly PKR_TO_AED = PKR_TO_AED;

  static convertSalary(amount: number, from: SalaryCurrency, to: SalaryCurrency): number {
    if (from === to) return amount;
    if (from === 'PKR' && to === 'AED') return amount * PKR_TO_AED;
    if (from === 'AED' && to === 'PKR') return amount * AED_TO_PKR;
    return amount;
  }

  static formatCurrency(amount: number, currency: SalaryCurrency = 'PKR'): string {
    if (currency === 'AED') {
      return `د.إ ${new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} AED`;
    }
    return `₨ ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(Math.round(amount))} PKR`;
  }

  // ==================== FILTERING & SEARCH ====================

  static filterEmployees(employees: Employee[], filters: EmployeeFilters): Employee[] {
    return employees.filter(employee => {
      if (filters.nameSearch && !employee.name.toLowerCase().includes(filters.nameSearch.toLowerCase())) return false;
      if (filters.positionFilter && employee.position !== filters.positionFilter) return false;
      const min = filters.minSalary ?? 0;
      const max = filters.maxSalary ?? Infinity;
      if (employee.salary < min || employee.salary > max) return false;
      if (filters.phoneSearch && !employee.phone.toLowerCase().includes(filters.phoneSearch.toLowerCase())) return false;
      if (filters.emailSearch && !employee.email.toLowerCase().includes(filters.emailSearch.toLowerCase())) return false;
      if (filters.statusFilter && employee.status !== filters.statusFilter) return false;
      return true;
    });
  }

  static getUniquePositions(employees: Employee[]): string[] {
    return Array.from(new Set(employees.map(emp => emp.position))).sort();
  }

  // ==================== CRUD ====================

  static createEmployee(employees: Employee[], data: CreateEmployeeDTO): Employee[] {
    return [...employees, { ...data, id: Date.now().toString() }];
  }

  static updateEmployee(employees: Employee[], id: string, data: UpdateEmployeeDTO): Employee[] {
    return employees.map(e => (e.id === id ? { ...data, id: e.id } : e));
  }

  static deleteEmployee(employees: Employee[], id: string): Employee[] {
    return employees.filter(e => e.id !== id);
  }

  static findById(employees: Employee[], id: string): Employee | undefined {
    return employees.find(e => e.id === id);
  }

  // ==================== VALIDATION ====================

  static validateEmployee(data: Partial<Employee>): ValidationResult {
    if (!data.name?.trim()) return { isValid: false, error: 'Name is required' };
    if (!data.position?.trim()) return { isValid: false, error: 'Position is required' };
    if (!data.email?.trim()) return { isValid: false, error: 'Email is required' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { isValid: false, error: 'Please enter a valid email address' };
    if (data.salary !== undefined && data.salary < 0) return { isValid: false, error: 'Salary cannot be negative' };
    if (data.phone?.trim() && !/^[0-9+\-\s()]*$/.test(data.phone)) return { isValid: false, error: 'Please enter a valid phone number' };
    if (!data.location?.trim()) return { isValid: false, error: 'Location is required' };
    return { isValid: true, error: null };
  }

  // ==================== STATISTICS ====================

  static calculateStats(employees: Employee[]): EmployeeStats {
    const totalCount = employees.length;
    const activeCount = employees.filter(e => e.status === 'active').length;
    const inactiveCount = employees.filter(e => e.status === 'inactive').length;
    const totalSalary = employees.reduce((sum, e) => sum + e.salary, 0);
    return { totalCount, activeCount, inactiveCount, averageSalary: totalCount > 0 ? totalSalary / totalCount : 0, totalSalary };
  }

  // ==================== FORMATTING ====================

  static formatDate(dateString: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  static getDefaultFormData(): Partial<Employee> {
    return {
      name: '', position: '', salary: 0, phone: '', email: '',
      joinDate: new Date().toISOString().split('T')[0],
      status: 'active', location: 'Dubai',
      accountNumber: '', bankName: '', accountTitle: '',
    };
  }

  static hasActiveFilters(filters: EmployeeFilters): boolean {
    return !!(filters.nameSearch || filters.positionFilter || filters.minSalary || filters.maxSalary || filters.phoneSearch || filters.emailSearch || filters.statusFilter);
  }

  static countActiveFilters(filters: EmployeeFilters): number {
    return [filters.nameSearch, filters.positionFilter, filters.minSalary, filters.maxSalary, filters.phoneSearch, filters.emailSearch, filters.statusFilter].filter(Boolean).length;
  }
}