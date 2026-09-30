// import { repairInflatedTransactions } from './utils/repairTransactions';
// // inside any useEffect:
// useEffect(() => { repairInflatedTransactions(); }, []);


import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './providers/context/AuthContext';
import { GlobalCurrencyBoot } from './shared/currency/useGlobalCurrency';
// import { Budget } from './types/Budget';

// ============================================================
// SHARED TYPES
// Used by router layouts and legacy commented modules
// ============================================================

export type Employee = {
  id: string;
  name: string;
  position: string;
  salary: number;
  phone: string;
  email: string;
  joinDate: string;
  status: 'active' | 'inactive';
};


export type AppData = {
  employees: Employee[];
  // budgets: Budget[];
 
};

export const initialData: AppData = {
  employees: [],
  // budgets: [],
  // transactions: [],
  // loans: [],
  // banks: [],
  // products: [],
  // invoices: [],
  // bankTransfers: [],
  // productTransfers: [],
  // commissionSlabs: [],
  // productCosting: [],
  // commissions: [],
  // receivableStock: [],
};

// ============================================================
// APP ROOT
// ============================================================

export default function App() {
  return (
    <GlobalCurrencyBoot>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" />
      </AuthProvider>
    </GlobalCurrencyBoot>
  );
}