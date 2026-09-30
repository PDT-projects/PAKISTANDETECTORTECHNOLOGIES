// Banking Module - Service Layer
// Pure business logic — no Firestore, no localStorage, no React

import {
  Bank,
  BankTransfer,
  CashTransaction,
  BankStats,
  TransferStats,
  CashStats,
  DashboardStats,
  BankFormData,
  TransferFormData
} from './types';
import { validateName, validatePositiveAmount } from '../../../utils/validators';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';

export class BankingService {

  // Every caller of formatCurrency(amount) — no explicit currency — now
  // converts live into the Admin's global display currency, matching every
  // other module. Callers that explicitly pass a specific bank's own
  // currency (e.g. showing that one account's real PKR balance next to its
  // name) are respected as before — that's real data about that account,
  // not a relabeled AED figure.
  static formatCurrency(amount: number, currency?: 'AED' | 'PKR'): string {
    if (currency) {
      // Caller explicitly wants this specific currency (e.g. a bank's own
      // account currency) — honour it exactly as before, no global override.
      if (currency === 'PKR') {
        return new Intl.NumberFormat('en-PK', {
          style: 'currency',
          currency: 'PKR',
          minimumFractionDigits: 0
        }).format(amount);
      }
      return new Intl.NumberFormat('en-AE', {
        style: 'currency',
        currency: 'AED',
        minimumFractionDigits: 0
      }).format(amount);
    }

    // No explicit currency given — this is the "generic display" path used
    // by Dashboard/List/Form screens. Just swap in the Admin's global
    // symbol — the number itself is never converted.
    const symbol = getGlobalCurrencySymbol();
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
    return `${symbol} ${formatted}`;
  }

  static formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-AE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  // ==================== STATS ====================

  static calculateBankStats(banks: Bank[]): BankStats {
    return {
      totalBanks: banks.length,
      totalBalance: banks.reduce((sum, b) => sum + b.balance, 0),
      highestBalance: banks.length > 0 ? Math.max(...banks.map(b => b.balance)) : 0,
      lowestBalance: banks.length > 0 ? Math.min(...banks.map(b => b.balance)) : 0
    };
  }

  static calculateTransferStats(transfers: BankTransfer[]): TransferStats {
    const now = new Date();
    const thisMonthAmount = transfers
      .filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      totalTransfers: transfers.length,
      totalAmount: transfers.reduce((sum, t) => sum + t.amount, 0),
      thisMonth: thisMonthAmount
    };
  }

  static calculateCashStats(transactions: CashTransaction[], openingBalance: number = 0): CashStats {
    const inflow = transactions.filter(t => t.mainCategory === 'Cash Inflow');
    const outflow = transactions.filter(t => t.mainCategory === 'Cash Outflow');
    const totalInflow = inflow.reduce((sum, t) => sum + t.amount, 0);
    const totalOutflow = outflow.reduce((sum, t) => sum + t.amount, 0);
    return {
      totalCashInHand: openingBalance + totalInflow - totalOutflow,
      totalInflow,
      totalOutflow,
      transactionCount: transactions.length,
      inflowCount: inflow.length,
      outflowCount: outflow.length,
      openingBalance
    };
  }

  static calculateDashboardStats(banks: Bank[], cashTransactions: CashTransaction[], openingBalance: number = 0): DashboardStats {
    const totalBankBalance = banks.reduce((sum, b) => sum + b.balance, 0);
    const cashStats = this.calculateCashStats(cashTransactions, openingBalance);
    return {
      totalBankBalance,
      totalCashInHand: cashStats.totalCashInHand,
      totalLiquidity: totalBankBalance + cashStats.totalCashInHand,
      bankCount: banks.length
    };
  }

  // ==================== FILTERS ====================

  static filterBanks(banks: Bank[], searchTerm: string): Bank[] {
    if (!searchTerm.trim()) return banks;
    const term = searchTerm.toLowerCase();
    return banks.filter(b =>
      b.name.toLowerCase().includes(term) ||
      b.accountNumber.toLowerCase().includes(term)
    );
  }

  static filterTransfers(transfers: BankTransfer[], searchTerm: string, startDate: string | null, endDate: string | null): BankTransfer[] {
    return transfers.filter(t => {
      const matchesSearch = !searchTerm.trim() ||
        t.fromBankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.toBankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.note?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStart = !startDate || t.date >= startDate;
      const matchesEnd = !endDate || t.date <= endDate;
      return matchesSearch && matchesStart && matchesEnd;
    });
  }

  static filterCashTransactions(
    transactions: CashTransaction[],
    searchTerm: string,
    filterType: 'all' | 'inflow' | 'outflow'
  ): CashTransaction[] {
    return transactions.filter(t => {
      const matchesSearch = !searchTerm.trim() ||
        t.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.subCategory.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.note?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType =
        filterType === 'all' ||
        (filterType === 'inflow' && t.mainCategory === 'Cash Inflow') ||
        (filterType === 'outflow' && t.mainCategory === 'Cash Outflow');
      return matchesSearch && matchesType;
    });
  }

  // ==================== VALIDATION ====================

  static validateBankForm(formData: BankFormData, existingBanks: Bank[], excludeId?: string): Record<string, string> {
    const errors: Record<string, string> = {};
    const nameVal = validateName(formData.name, 'Bank name', true);
    if (!nameVal.isValid) errors.name = nameVal.error!;
    if (!formData.accountNumber.trim()) errors.accountNumber = 'Account number is required';
    if (formData.balance < 0) errors.balance = 'Balance cannot be negative';
    const duplicate = existingBanks.find(b =>
      b.id !== excludeId &&
      b.accountNumber.toLowerCase() === formData.accountNumber.toLowerCase()
    );
    if (duplicate) errors.accountNumber = 'Account number already exists';
    return errors;
  }

  static validateTransferForm(formData: TransferFormData, banks: Bank[]): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!formData.fromBankId) errors.fromBankId = 'Please select source bank';
    if (!formData.toBankId) errors.toBankId = 'Please select destination bank';
    if (formData.fromBankId && formData.toBankId && formData.fromBankId === formData.toBankId) {
      errors.toBankId = 'Cannot transfer to the same bank';
    }
    const amtVal = validatePositiveAmount(formData.amount, 'Transfer amount', true);
    if (!amtVal.isValid) errors.amount = amtVal.error!;
    if (!formData.date) errors.date = 'Date is required';
    const fromBank = banks.find(b => b.id === formData.fromBankId);
    if (fromBank && formData.amount > fromBank.balance) {
      errors.amount = 'Insufficient balance in source bank';
    }
    return errors;
  }

  static validateCashForm(formData: any): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!formData.date) errors.date = 'Date is required';
    const compVal = validateName(formData.company, 'Company/Party', true);
    if (!compVal.isValid) errors.company = compVal.error!;
    if (!formData.subCategory) errors.subCategory = 'Category is required';
    const amtVal = validatePositiveAmount(formData.amount, 'Amount', true);
    if (!amtVal.isValid) errors.amount = amtVal.error!;
    if (!formData.location) errors.location = 'Location is required';
    return errors;
  }

  // ==================== DEFAULTS ====================

  static getDefaultBankFormData(): BankFormData {
    return { name: '', accountNumber: '', balance: 0, currency: 'AED' };
  }

  static getDefaultTransferFormData(): TransferFormData {
    return {
      fromBankId: '',
      toBankId: '',
      amount: 0,
      note: '',
      date: new Date().toISOString().split('T')[0]
    };
  }

  static getDefaultCashFormData() {
    return {
      date: new Date().toISOString().split('T')[0],
      company: '',
      mainCategory: 'Cash Inflow' as const,
      subCategory: '',
      amount: 0,
      note: '',
      location: ''
    };
  }

  static sortByDate<T extends { date: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}

export const CASH_LOCATIONS = [
  'Head Office - Islamabad',
  'Karachi Branch',
  'Lahore Branch',
  'Bullion RND/SITE',
  'Asif Branch'
] as const;