// Transactions Module - Public API

// Models
export type {
  Transaction, PartialPayment, Attachment, TransactionItem,
  TransactionFilters, TransactionStats, PendingPaymentData, DynamicCategory,
} from './models/types';
export { COMPANIES, MAIN_CATEGORIES, SUB_CATEGORIES } from './models/types';
export { TransactionFirebaseService } from './models/transactionFirebaseService';
export {
  getTransactionTotals, isPending, filterTransactions, calculateStats,
  formatCurrency, formatDate, formatDateTime, getCategoryColor, getPaymentStatusColor,
  exportToCSV, downloadCSV,
  computeCashInHandBalance, computeBankBalance, computeMonthlyFlow,
  getTxAccount, getTxCategoryPath,
} from './models/transactionsService';

// ViewModels
export { useTransactionListViewModel }   from './viewModels/useTransactionListViewModel';
export { useTransactionFormViewModel }   from './viewModels/useTransactionFormViewModel';
export { usePendingPaymentsViewModel }   from './viewModels/usePendingPaymentsViewModel';
export { useTransactionDeleteViewModel } from './viewModels/useTransactionDeleteViewModel';
export { useAccountBalances }            from './viewModels/useAccountBalances';
export type { AccountBank, UseAccountBalancesReturn } from './viewModels/useAccountBalances';

// Views
export { TransactionListView }    from './views/TransactionListView';
export { TransactionFormView }    from './views/TransactionFormView';
export { PendingPaymentsView }    from './views/PendingPaymentsView';

// Wrappers
export { TransactionListWrapper }    from './views/TransactionListWrapper';
export { TransactionCreateWrapper }  from './views/TransactionCreateWrapper';
export { TransactionEditWrapper }    from './views/TransactionEditWrapper';
export { TransactionDeleteWrapper }  from './views/TransactionDeleteWrapper';
export { PendingPaymentsWrapper }    from './views/PendingPaymentsWrapper';