export interface Budget {
  id: string;
  category: 'Expenses';
  subCategory: string;
  period: 'Monthly' | 'Quarterly' | 'Yearly';
  budgetLimit: number;
  spent: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetSummary {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  alerts: number;
}
