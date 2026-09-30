// Transaction ID Generator Utility
// Format: PREFIX-YYYYMMDD-XXXX (e.g., SAL-20260203-0005)

type TransactionPrefix =
  | 'SAL' // Salary
  | 'EXP' // Expenses
  | 'INV' // Invoices
  | 'PAY' // Payments
  | 'INC' // Income
  | 'ADV' // Advance
  | 'LOA' // Loans
  | 'BAN' // Bank Transfers
  | 'BIL' // Bills
  | 'OTH'; // Other

// In-memory counter for auto-increment (in production, this would be stored in database)
const dailyCounters: Record<string, number> = {};

export function generateTransactionId(prefix: TransactionPrefix): string {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

  const key = `${prefix}-${dateStr}`;

  // Initialize or increment counter
  if (!dailyCounters[key]) {
    dailyCounters[key] = 1;
  } else {
    dailyCounters[key]++;
  }

  // Format counter as 4-digit number with leading zeros
  const counterStr = dailyCounters[key].toString().padStart(4, '0');

  return `${prefix}-${dateStr}-${counterStr}`;
}

// Helper function to get prefix based on transaction type
export function getTransactionPrefix(mainCategory: string, subCategory?: string): TransactionPrefix {
  if (mainCategory === 'Salary' || subCategory === 'Employee Salary' || subCategory === 'Advance Salary') {
    return 'SAL';
  }
  if (mainCategory === 'Cash Outflow') {
    if (subCategory?.includes('Salary') || subCategory?.includes('Advance')) {
      return 'SAL';
    }
    if (subCategory?.includes('Office') || subCategory?.includes('Rent') || subCategory?.includes('Utility')) {
      return 'EXP';
    }
    if (subCategory?.includes('Commission')) {
      return 'PAY';
    }
    return 'EXP';
  }
  if (mainCategory === 'Cash Inflow') {
    if (subCategory?.includes('Payment') || subCategory?.includes('Sale')) {
      return 'INC';
    }
    return 'INC';
  }
  if (mainCategory === 'Loans & Advances') {
    return 'LOA';
  }
  if (mainCategory === 'Bills') {
    return 'BIL';
  }

  return 'OTH';
}

// Reset counters (useful for testing or daily reset)
export function resetCounters(): void {
  Object.keys(dailyCounters).forEach(key => delete dailyCounters[key]);
}

// Get current counter for a specific key (for testing)
export function getCurrentCounter(prefix: TransactionPrefix): number {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const key = `${prefix}-${dateStr}`;
  return dailyCounters[key] || 0;
}
