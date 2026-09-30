// Banking Module - Types

export interface Bank {
  id: string;
  name: string;
  accountNumber: string;
  balance: number;
  currency?: 'AED' | 'PKR';
}

export interface BankTransfer {
  id: string;
  date: string;
  fromBankId: string;
  fromBankName: string;
  toBankId: string;
  toBankName: string;
  amount: number;
  note: string;
}

export interface CashTransaction {
  id: string;
  date: string;
  company: string;
  mainCategory: 'Cash Inflow' | 'Cash Outflow' | 'Inventory Purchase';
  subCategory: string;
  amount: number;
  mode: 'Cash';
  note?: string;
  location?: string;
  reference?: string;
  inventoryId?: string;
}

export interface BankStats {
  totalBanks: number;
  totalBalance: number;
  highestBalance: number;
  lowestBalance: number;
}

export interface TransferStats {
  totalTransfers: number;
  totalAmount: number;
  thisMonth: number;
}

export interface CashStats {
  totalCashInHand: number;
  totalInflow: number;
  totalOutflow: number;
  transactionCount: number;
  inflowCount: number;
  outflowCount: number;
  openingBalance: number;
}

export interface DashboardStats {
  totalBankBalance: number;
  totalCashInHand: number;
  totalLiquidity: number;
  bankCount: number;
}

export interface BankFormData {
  name: string;
  accountNumber: string;
  balance: number;
  currency: 'AED' | 'PKR';
}

export interface TransferFormData {
  fromBankId: string;
  toBankId: string;
  amount: number;
  note: string;
  date: string;
}

export interface BankFilters {
  searchTerm: string;
}

export interface TransferFilters {
  searchTerm: string;
  startDate: string | null;
  endDate: string | null;
}

export interface CashFilters {
  searchTerm: string;
  filterType: 'all' | 'inflow' | 'outflow';
}

export interface CashFormData {
  date: string;
  company: string;
  mainCategory: 'Cash Inflow' | 'Cash Outflow';
  subCategory: string;
  amount: number;
  note: string;
  location: string;
}