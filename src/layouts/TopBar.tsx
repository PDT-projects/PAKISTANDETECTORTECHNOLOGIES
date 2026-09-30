// TopBar - simplified: NotificationBell manages its own Firestore state

import { NotificationBell } from './NotificationBell';

type Props = {
  activeModule: string;
  user?: any;
  // legacy props kept for backward compat — no longer used
  notifications?: any[];
  setNotifications?: (n: any[]) => void;
};

const getModuleTitle = (moduleId: string): string => {
  const moduleTitles: { [key: string]: string } = {
    'firestore-test':              'Firestore Test',
    'dashboard':                   'Dashboard',
    'employees':                   'Employees',
    'inventory-entry':             'Inventory',
    'transactions':                'Add Transaction',
    'loans':                       'All Loans',
    'banks':                       'Bank Balances',
    'invoices':                    'Invoices',

    'bank-transfers':              'Bank Transfers',
    'transaction-history':         'Transaction History',
    'pending-payments':            'Pending Payments',
    'loan-history':                'Loan History',
    'transfer-history':            'Transfer History',
    'cash-inflow':                 'Cash Inflow',
    'cash-outflow':                'Cash Outflow',
    'bills':                       'Bills',
    'salary':                      'Salary',
    'advance-salary':              'Advance Salary',
    'loans-payable':               'Loans Payable',
    'loans-receivable':            'Loans Receivable',
    'cash-in-hand':                'Cash in Hand',
    'sales-report':                'Sales Report',
    'referral-report':             'Referral Report',
    'inventory-report':            'Inventory Report',
    'transaction-history-report':  'Transaction History Report',
    'commission-slabs':            'Commission Slabs',
    'commission-calculation':      'Commission Calculation',
    'commission-report':           'Commission Report',
    'inventory-audit-log':         'Inventory Audit Log',
    'budgets':                     'Budgets',
    'operations':                  'Operations',
    'finance':                     'Finance',
    'transaction-menu':            'Transactions',
    'banking-menu':                'Banking',
    'pending-approvals':           'Pending Approvals',
  };
  return moduleTitles[moduleId] || 'Dashboard';
};
 
export function TopBar({ activeModule, user }: Props) {
  const title = getModuleTitle(activeModule);

  return (
    <div className="flex items-center justify-between">
      {/* Left: page title */}
      <div className="text-lg font-semibold text-gray-800">{title}</div>

      {/* Right: bell + profile */}
      <div className="flex items-center gap-4">
        <NotificationBell />

        <div className="flex items-center gap-2 cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-white font-bold">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <span className="text-gray-700 font-medium">{user?.email || 'User'}</span>
        </div>
      </div>
    </div>
  );
}