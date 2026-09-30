// Employee Module - Firebase Firestore Service Layer
// Handles all Firebase Firestore operations for employees

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  QueryConstraint
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { Employee, CreateEmployeeDTO, UpdateEmployeeDTO } from './types';

// Collection name for employees
const EMPLOYEES_COLLECTION = 'employees';

/**
 * Transform Firestore document to Employee type
 */
function transformDocToEmployee(docSnap: any): Employee {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    name: data.name || '',
    position: data.position || '',
    salary: data.salary || 0,
    phone: data.phone || '',
    email: data.email || '',
    joinDate: data.joinDate || '',
    status: data.status || 'active',
    location: data.location || 'Karachi',
    accountNumber: data.accountNumber || '',
    bankName: data.bankName || '',
    accountTitle: data.accountTitle || '',
    // Dual-currency: must be read back or salary module can't know which currency
    // Fallback to 'AED' — system default; old records without this field are AED
    salaryCurrency: data.salaryCurrency || 'AED',
  };
}

/**
 * EmployeeFirebaseService - Firebase Firestore operations
 */
export class EmployeeFirebaseService {

  // ==================== READ OPERATIONS ====================

  /**
   * Fetch all employees from Firestore
   */
  static async fetchAllEmployees(): Promise<Employee[]> {
    try {
      console.log('🔥 Fetching all employees from Firestore...');
      
      const employeesRef = collection(db, EMPLOYEES_COLLECTION);
      const queryConstraints: QueryConstraint[] = [
        orderBy('name', 'asc')
      ];
      
      const q = query(employeesRef, ...queryConstraints);
      const querySnapshot = await getDocs(q);
      
      const employees: Employee[] = [];
      querySnapshot.forEach((doc) => {
        employees.push(transformDocToEmployee(doc));
      });

      console.log(`✅ Fetched ${employees.length} employees from Firestore`);
      return employees;
    } catch (error) {
      console.error('❌ Error fetching employees from Firestore:', error);
      throw new Error('Failed to fetch employees from Firestore');
    }
  }

  /**
   * Fetch a single employee by ID
   */
  static async fetchEmployeeById(id: string): Promise<Employee | null> {
    try {
      console.log(`🔥 Fetching employee ${id} from Firestore...`);
      
      const employeeRef = doc(db, EMPLOYEES_COLLECTION, id);
      const docSnap = await getDoc(employeeRef);
      
      if (!docSnap.exists()) {
        console.log('⚠️ Employee not found');
        return null;
      }

      const employee = transformDocToEmployee(docSnap);
      console.log('✅ Employee fetched:', employee.name);
      return employee;
    } catch (error) {
      console.error(`❌ Error fetching employee ${id} from Firestore:`, error);
      throw new Error('Failed to fetch employee from Firestore');
    }
  }

  /**
   * Fetch employees by status
   */
  static async fetchEmployeesByStatus(status: 'active' | 'inactive'): Promise<Employee[]> {
    try {
      console.log(`🔥 Fetching ${status} employees from Firestore...`);
      
      const employeesRef = collection(db, EMPLOYEES_COLLECTION);
      const q = query(
        employeesRef,
        where('status', '==', status),
        orderBy('name', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      
      const employees: Employee[] = [];
      querySnapshot.forEach((doc) => {
        employees.push(transformDocToEmployee(doc));
      });

      console.log(`✅ Fetched ${employees.length} ${status} employees`);
      return employees;
    } catch (error) {
      console.error(`❌ Error fetching ${status} employees:`, error);
      throw new Error(`Failed to fetch ${status} employees`);
    }
  }

  // ==================== WRITE OPERATIONS ====================

  /**
   * Create a new employee in Firestore
   */
  static async createEmployee(data: CreateEmployeeDTO): Promise<Employee> {
    try {
      console.log('🔥 Creating employee in Firestore:', data.name);
      
      const employeesRef = collection(db, EMPLOYEES_COLLECTION);
      const docRef = await addDoc(employeesRef, {
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const createdEmployee: Employee = {
        ...data,
        id: docRef.id,
      };
      
      console.log('✅ Employee created with ID:', createdEmployee.id);
      return createdEmployee;
    } catch (error) {
      console.error('❌ Error creating employee in Firestore:', error);
      throw new Error('Failed to create employee in Firestore');
    }
  }

  /**
   * Update an existing employee in Firestore
   */
  static async updateEmployee(data: UpdateEmployeeDTO): Promise<Employee> {
    try {
      console.log('🔥 Updating employee in Firestore:', data.id);
      
      const employeeRef = doc(db, EMPLOYEES_COLLECTION, data.id);
      await updateDoc(employeeRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      });

      console.log('✅ Employee updated:', data.id);
      return data as Employee;
    } catch (error) {
      console.error(`❌ Error updating employee ${data.id}:`, error);
      throw new Error('Failed to update employee in Firestore');
    }
  }

  /**
   * Delete an employee from Firestore
   */
  static async deleteEmployee(id: string): Promise<void> {
    try {
      console.log('🔥 Deleting employee from Firestore:', id);
      
      const employeeRef = doc(db, EMPLOYEES_COLLECTION, id);
      await deleteDoc(employeeRef);
      
      console.log('✅ Employee deleted:', id);
    } catch (error) {
      console.error(`❌ Error deleting employee ${id}:`, error);
      throw new Error('Failed to delete employee from Firestore');
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Check if Firestore is connected
   */
  static isConnected(): boolean {
    return !!db;
  }

  /**
   * Reset the connection (useful for testing)
   */
  static resetConnection(): void {
    // Firestore doesn't need reset as it's a singleton
  }
}