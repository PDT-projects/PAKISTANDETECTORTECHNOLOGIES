// Banking Module - Public API

export type {
  Bank,
  BankTransfer,
  CashTransaction,
  BankStats,
  TransferStats,
  CashStats,
  DashboardStats,
  BankFormData,
  TransferFormData,
  BankFilters,
  TransferFilters,
  CashFilters,
  CashFormData
} from './models/types';

// The Banking module's own screens (Overview, Bank Accounts, Transfers, Cash
// Ledger) were removed from the app's navigation and routing — Bank Accounts
// management already lives inside the Transactions module (Opening Balances
// + Banks Manager), and Transfers/Cash Ledger had no other screen so they
// went with it. What's exported below is what's still load-bearing: other
// modules (Invoices, Inventory, Transactions, Dashboard, Balance Sheet,
// Bills, Pending Payments) read/write bank and cash data through these
// services directly, independent of the removed screens.
export { BankingService, CASH_LOCATIONS } from './models/bankingService';
export { BankFirebaseService } from './models/bankFirebaseService';
export { CashFirebaseService } from './models/cashFirebaseService';