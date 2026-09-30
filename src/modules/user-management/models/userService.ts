import { 
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  serverTimestamp,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from '../../../api/firebase/firebase';

export type Screen = 
  | 'Dashboard'
  // Finance/Transactions
  | 'Transaction List'
  | 'Add Transaction'
  | 'Transaction Edit'
  | 'Transaction Delete'
  | 'Pending Payments'
  | 'Bills List'
  | 'Create Bill'
  | 'Edit Bill'
  | 'Delete Bill'
  | 'Salary Dashboard'
  | 'Salary All List'
  | 'Salary Regular List'
  | 'Salary Advance List'
  | 'Create Regular Salary'
  | 'Create Advance Salary'
  | 'Salary Edit'
  | 'Salary Delete'
  // Invoices
  | 'Invoices List'
  | 'Create Invoice'
  | 'Edit Invoice'
  | 'Delete Invoice'
  | 'Invoice Reports'
  | 'Dummy Invoices'
  | 'Deleted Invoices'
  // Inventory
  | 'Inventory Dashboard'
  | 'Inventory View'
  | 'Inventory Receivable'
  | 'Deleted Inventory'
  | 'Inventory Add Returned'
  | 'Damaged Inventory'
  | 'Inventory Type Selection'
  | 'Inventory Costing Option'
  | 'Inventory Costing Details'
  | 'Inventory Multi Models'
  | 'Inventory Product Details'
  | 'Inventory Payment'
  | 'Inventory Add Existing'
  | 'Product Transfer List'
  | 'Create Product Transfer'
  // Purchases & Supplier Payables
  | 'Payable to Futuristic'
  // Employees
  | 'Employees List'
  | 'Create Employee'
  | 'Edit Employee'
  | 'Delete Employee'
  // Loans
  | 'Loans Dashboard'
  | 'All Loans List'
  | 'Loans Payable'
  | 'Loans Receivable'
  | 'Create Loan'
  | 'Create Payable Loan'
  | 'Create Receivable Loan'
  | 'Edit Loan'
  | 'Loan Payment'
  // Commission
  | 'Commission Slabs'
  | 'Commission Calculation'
  | 'Commission Reports'
  // Budgets
  | 'Budgets List'
  | 'Create Budget'
  | 'Edit Budget'
  | 'Delete Budget'
  // Reports (Finance)
  | 'Balance Sheet Report'
  | 'Bank Balance Report'
  | 'Bank Activity Report'
  | 'Expenses Report'
  | 'Fixed Bills Report'
  | 'Profit Loss Report'
  | 'Salaries Report'
  // Reports (Sales)
  | 'Commission Report'
  | 'Sales Report'
  | 'Referral Report'
  // Reports (Inventory)
  | 'Inventory Report'
  | 'Product Transfer Report'
  | 'Inventory Charts'
  // Reports (Other)
  | 'Transaction History Report'
  | 'Loan History'
  // User Management (super admin only)
  | 'User Management'
  | 'Assets Management';

export interface ScreenGroup {
  title: string;
  screens: Screen[];
}

export const VIEW_ONLY_SCREENS: Screen[] = [
  'Dashboard',
  'Transaction List',
  'Pending Payments',
  'Bills List',
  'Salary Dashboard',
  'Salary All List',
  'Salary Regular List',
  'Salary Advance List',
  'Invoices List',
  'Invoice Reports',
  'Dummy Invoices',
  'Deleted Invoices',
  'Inventory Dashboard',
  'Inventory View',
  'Inventory Receivable',
  'Deleted Inventory',
  'Damaged Inventory',
  'Product Transfer List',
  'Payable to Futuristic',
  'Employees List',
  'Loans Dashboard',
  'All Loans List',
  'Loans Payable',
  'Loans Receivable',
  'Commission Reports',
  'Budgets List',
  'Balance Sheet Report',
  'Bank Balance Report',
  'Bank Activity Report',
  'Expenses Report',
  'Fixed Bills Report',
  'Profit Loss Report',
  'Salaries Report',
  'Commission Report',
  'Sales Report',
  'Referral Report',
  'Inventory Report',
  'Product Transfer Report',
  'Inventory Charts',
  'Transaction History Report',
  'Loan History',
  'Assets Management',
];

export const ALL_SCREEN_GROUPS: ScreenGroup[] = [
  {
    title: 'Dashboard',
    screens: ['Dashboard']
  },
  {
    title: 'Transactions & Bills',
    screens: [
      'Transaction List', 'Add Transaction', 'Transaction Edit', 'Transaction Delete', 
      'Pending Payments', 'Bills List', 'Create Bill', 'Edit Bill', 'Delete Bill'
    ]
  },
  {
    title: 'Salary Management',
    screens: [
      'Salary Dashboard', 'Salary All List', 'Salary Regular List', 'Salary Advance List',
      'Create Regular Salary', 'Create Advance Salary', 'Salary Edit', 'Salary Delete'
    ]
  },
  {
    title: 'Invoices',
    screens: ['Invoices List', 'Create Invoice', 'Edit Invoice', 'Delete Invoice', 'Invoice Reports', 'Dummy Invoices', 'Deleted Invoices']
  },
  {
    title: 'Inventory',
    screens: [
      'Inventory Dashboard', 'Inventory View', 'Inventory Receivable', 'Deleted Inventory', 'Inventory Add Returned', 'Damaged Inventory',
      'Inventory Type Selection', 'Inventory Costing Option', 'Inventory Costing Details', 'Inventory Multi Models', 'Inventory Product Details',
      'Inventory Payment', 'Inventory Add Existing'
    ]
  },
  {
    title: 'Product Transfer',
    screens: ['Product Transfer List', 'Create Product Transfer']
  },
  {
    title: 'Purchases & Payables',
    screens: ['Payable to Futuristic']
  },
  {
    title: 'Employees',
    screens: ['Employees List', 'Create Employee', 'Edit Employee', 'Delete Employee']
  },
  {
    title: 'Loans',
    screens: [
      'Loans Dashboard', 'All Loans List', 'Loans Payable', 'Loans Receivable',
      'Create Loan', 'Create Payable Loan', 'Create Receivable Loan', 'Edit Loan', 'Loan Payment'
    ]
  },
  {
    title: 'Commission',
    screens: ['Commission Slabs', 'Commission Calculation', 'Commission Reports']
  },
  {
    title: 'Budgets',
    screens: ['Budgets List', 'Create Budget', 'Edit Budget', 'Delete Budget']
  },
  {
    title: 'Finance Reports',
    screens: [
      'Balance Sheet Report', 'Bank Balance Report', 'Bank Activity Report', 'Expenses Report', 
      'Fixed Bills Report', 'Profit Loss Report', 'Salaries Report',
      'Transaction History Report', 'Loan History'
    ]
  },
  {
    title: 'Sales Reports',
    screens: ['Commission Report', 'Sales Report', 'Referral Report']
  },
  {
    title: 'Inventory Reports',
    screens: ['Inventory Report', 'Product Transfer Report', 'Inventory Charts']
  },
  {
    title: 'Assets Management',
    screens: ['Assets Management']
  }
];


export interface UserData {
  uid: string;
  email: string;
  fullName?: string;
  branch: string;
  permissions: Screen[];
  role: 'user' | 'super_admin';
  status?: 'pending' | 'approved' | 'rejected' | string;
  createdAt: Timestamp | any;
  createdBy?: string;
  lastModified?: Timestamp | any;
  lastModifiedBy?: string;
}

export async function createUser(
  email: string, 
  password: string, 
  branch: string, 
  permissions: Screen[],
  createdByEmail: string
): Promise<UserData> {
  try {
    if (!email || !password || !branch || permissions.length === 0) {
      throw new Error('Email, password, branch, and at least one permission are required');
    }

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userData: UserData = {
      uid: user.uid,
      email: user.email!,
      branch,
      permissions,
      role: 'user',
      status: 'approved',
      createdAt: serverTimestamp(),
      createdBy: createdByEmail,
    };

    await setDoc(doc(db, 'users', user.uid), userData);

    return userData;
  } catch (error: any) {
    console.error('Error creating user:', error);
    throw new Error(error.message || 'Failed to create user');
  }
}

export async function getUser(uid: string): Promise<UserData | null> {
  try {
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (docSnap.exists()) {
      return docSnap.data() as UserData;
    }
    return null;
  } catch (error: any) {
    console.error('Error fetching user:', error);
    throw new Error(error.message || 'Failed to fetch user');
  }
}

export async function getUsersByBranch(branch: string): Promise<UserData[]> {
  try {
    const q = query(collection(db, 'users'), where('branch', '==', branch));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as UserData);
  } catch (error: any) {
    console.error('Error fetching users by branch:', error);
    throw new Error(error.message || 'Failed to fetch users');
  }
}

export async function getAllUsers(): Promise<UserData[]> {
  try {
    const querySnapshot = await getDocs(collection(db, 'users'));
    return querySnapshot.docs.map(doc => doc.data() as UserData);
  } catch (error: any) {
    console.error('Error fetching all users:', error);
    throw new Error(error.message || 'Failed to fetch users');
  }
}

export async function updateUserPermissions(
  uid: string,
  permissions: Screen[],
  updatedByEmail: string
): Promise<void> {
  try {
    if (permissions.length === 0) {
      throw new Error('User must have at least one permission');
    }

    await updateDoc(doc(db, 'users', uid), {
      permissions,
      lastModified: serverTimestamp(),
      lastModifiedBy: updatedByEmail,
    });
  } catch (error: any) {
    console.error('Error updating user permissions:', error);
    throw new Error(error.message || 'Failed to update permissions');
  }
}

export async function updateUserBranch(
  uid: string,
  branch: string,
  updatedByEmail: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      branch,
      lastModified: serverTimestamp(),
      lastModifiedBy: updatedByEmail,
    });
  } catch (error: any) {
    console.error('Error updating user branch:', error);
    throw new Error(error.message || 'Failed to update branch');
  }
}

export async function deleteUser(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch (error: any) {
    console.error('Error deleting user:', error);
    throw new Error(error.message || 'Failed to delete user');
  }
}

export async function approveUser(
  uid: string,
  branch: string,
  permissions: Screen[],
  approvedByEmail: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      status: 'approved',
      branch: branch || 'Saudia',
      permissions: permissions || [],
      lastModified: serverTimestamp(),
      lastModifiedBy: approvedByEmail,
    });
  } catch (error: any) {
    console.error('Error approving user:', error);
    throw new Error(error.message || 'Failed to approve user');
  }
}

export async function rejectUser(
  uid: string,
  rejectedByEmail: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      status: 'rejected',
      lastModified: serverTimestamp(),
      lastModifiedBy: rejectedByEmail,
    });
  } catch (error: any) {
    console.error('Error rejecting user:', error);
    throw new Error(error.message || 'Failed to reject user');
  }
}

export function hasScreenPermission(userData: UserData | null, screen: Screen): boolean {
  if (!userData) return false;
  if (userData.role === 'super_admin') return true;
  return userData.permissions.includes(screen);
}

export function getUserScreens(userData: UserData | null): Screen[] {
  if (!userData) return [];
  
  if (userData.role === 'super_admin') {
    return Object.values(ALL_SCREEN_GROUPS).flatMap(group => group.screens);
  }
  
  return userData.permissions;
}