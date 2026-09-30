// Employee Module - ViewModel Layer
// useEmployeeDeleteViewModel - Business logic for employee delete confirmation with Data Connect

import { useEffect, useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Employee } from '../models/types';
import { EmployeeFirebaseService } from '../models/employeeFirebaseService';

/**
 * Return type for useEmployeeDeleteViewModel
 */
interface UseEmployeeDeleteViewModelReturn {
  // Data
  employee: Employee | null;
  isLoading: boolean;
  isDeleting: boolean;
  
  // Actions
  onDelete: () => void;
  onCancel: () => void;
}


/**
 * ViewModel hook for Employee Delete confirmation page
 * Now integrated with Firebase Data Connect
 */
export function useEmployeeDeleteViewModel(): UseEmployeeDeleteViewModelReturn {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  // ==================== STATE ====================
  
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  // ==================== EFFECTS ====================
  
  // Load employee data when component mounts
  useEffect(() => {
    if (id) {
      const loadEmployee = async () => {
        try {
          setIsLoading(true);
          console.log(`🔄 Loading employee ${id} for deletion...`);
          
const emp = await EmployeeFirebaseService.fetchEmployeeById(id);
          
          if (emp) {
            setEmployee(emp);
            console.log('✅ Employee loaded for deletion:', emp.name);
          } else {
            toast.error('Employee not found');
            navigate('/employees');
          }
        } catch (error) {
          console.error('❌ Error loading employee:', error);
          toast.error('Failed to load employee');
          navigate('/employees');
        } finally {
          setIsLoading(false);
        }
      };

      loadEmployee();
    } else {
      toast.error('Invalid employee ID');
      navigate('/employees');
    }
  }, [id, navigate]);

  // ==================== ACTIONS ====================
  
  /**
   * Handle delete confirmation
   */
  const handleDelete = useCallback(async () => {
    if (!id) {
      toast.error('Invalid employee ID');
      return;
    }

    setIsDeleting(true);

    try {
      console.log('🗑️ Deleting employee:', id);
await EmployeeFirebaseService.deleteEmployee(id);
      
      toast.success('Employee deleted successfully');
      console.log('✅ Employee deleted, navigating to /employees');
      navigate('/employees');
    } catch (error) {
      console.error('❌ Error deleting employee:', error);
      toast.error('An error occurred while deleting the employee');
    } finally {
      setIsDeleting(false);
    }
  }, [id, navigate]);

  /**
   * Handle cancel action
   */
  const handleCancel = useCallback(() => {
    navigate('/employees');
  }, [navigate]);

  // ==================== RETURN ====================
  
  return {
    employee,
    isLoading,
    isDeleting,
    onDelete: handleDelete,
    onCancel: handleCancel
  };

}

