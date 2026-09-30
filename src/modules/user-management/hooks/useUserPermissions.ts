import { useEffect, useState } from 'react';
import { type UserData, type Screen, hasScreenPermission, getUserScreens } from '../models/userService';

// All report-type screens — used to decide sidebar Reports link visibility
export const REPORT_SCREENS: Screen[] = [
  'Sales Report', 'Profit Loss Report', 'Balance Sheet Report',
  'Inventory Report', 'Transaction History Report', 'Referral Report',
  'Commission Report', 'Expenses Report', 'Bank Balance Report',
  'Salaries Report', 'Fixed Bills Report', 'Product Transfer Report',
  'Inventory Charts', 'Loan History',
];

// Ordered list of route checks — first matching route wins on login redirect
const ROUTE_PERMISSION_MAP: { screen: Screen; path: string }[] = [
  { screen: 'Dashboard',           path: '/dashboard' },
  { screen: 'Sales Report',        path: '/reports' },
  { screen: 'Profit Loss Report',  path: '/reports' },
  { screen: 'Balance Sheet Report',path: '/reports' },
  { screen: 'Inventory Report',    path: '/reports' },
  { screen: 'Expenses Report',     path: '/reports' },
  { screen: 'Referral Report',     path: '/reports' },
  { screen: 'Commission Report',   path: '/reports' },
  { screen: 'Invoices List',       path: '/invoices' },
  { screen: 'Inventory Dashboard', path: '/inventory' },
  { screen: 'Employees List',      path: '/employees' },
  { screen: 'Add Transaction',     path: '/transactions' },
  { screen: 'Loans Dashboard',     path: '/loans' },
];

export function getFirstAccessibleRoute(userData: UserData | null): string {
  if (!userData) return '/login';
  if (userData.role === 'super_admin') return '/dashboard';

  for (const { screen, path } of ROUTE_PERMISSION_MAP) {
    if (userData.permissions.includes(screen)) return path;
  }

  return '/dashboard';
}

export type { Screen };

interface UseUserPermissionsReturn {
  userData: UserData | null;
  isLoading: boolean;
  hasPermission: (screen: Screen) => boolean;
  availableScreens: Screen[];
  isSuperAdmin: boolean;
  userEmail: string;
  userBranch: string;
  hasAnyReportPermission: boolean;
  firstAccessibleRoute: string;
}

export function useUserPermissions(): UseUserPermissionsReturn {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUserData = () => {
      try {
        const userInfo = localStorage.getItem('userInfo');
        if (userInfo) {
          const parsed = JSON.parse(userInfo);

          // ✅ Normalize role — handle both 'superAdmin' and 'super_admin' stored in localStorage
          const rawRole = parsed.role as string;
          const normalizedRole: 'super_admin' | 'user' =
            rawRole === 'super_admin' || rawRole === 'superAdmin' ? 'super_admin' : 'user';

          setUserData({ ...parsed, role: normalizedRole });
        }
      } catch (error) {
        console.error('Failed to load user data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, []);

  const isSuperAdmin = userData?.role === 'super_admin';

  const hasAnyReportPermission =
    isSuperAdmin ||
    REPORT_SCREENS.some(s => userData?.permissions.includes(s));

  return {
    userData,
    isLoading,
    hasPermission: (screen: Screen) => hasScreenPermission(userData, screen),
    availableScreens: getUserScreens(userData),
    isSuperAdmin,
    userEmail: userData?.email || '',
    userBranch: userData?.branch || '',
    hasAnyReportPermission,
    firstAccessibleRoute: getFirstAccessibleRoute(userData),
  };
}