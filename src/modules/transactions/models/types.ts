// Transactions Module - Types

export interface PartialPayment {
  id: string;
  amount: number;
  date: string;
  time: string;
  method: 'Cash' | 'Cheque' | 'Bank';
  bankId?: string;
  bankName?: string;
  chequeNumber?: string;
  chequeDate?: string;
  chequeBank?: string;
  isCleared: boolean;
  depositedDate?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  uploadedAt: string;
}

// â”€â”€ Approval Status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// pending_approval  â†’ just created, waiting for admin to approve via email
// approved          â†’ admin clicked Approve in email
// rejected          â†’ admin clicked Reject in email
// not_required      â†’ legacy / manually bypassed
export type ApprovalStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'not_required';

export interface Transaction {
  id: string;
  transactionId: string;
  date: string;
  time: string;
  company: string;
  mainCategory: string;
  subCategory: string;
  detailCategory?: string;
  amount: number;
  mode: 'Cash' | 'Bank' | 'Cheque';
  currency?: string;
  // Original (pre-conversion) currency the user actually typed the amount in
  // (e.g. 'AED'), preserved for display fidelity. `amount`/`amountPaid` above
  // are always PKR-canonical regardless of this field.
  originalCurrency?: string;
  originalAmount?: number;
  originalAmountPaid?: number;
  bankName?: string;
  bankId?: string;
  chequeNumber?: string;
  chequeDate?: string;
  chequeBank?: string;
  transactionReference?: string;
  note: string;
  paidBy?: string;
  paidTo?: string;
  accountablePerson?: string;
  transactionBy?: string;
  employeeId?: string;
  employeeName?: string;
  // Approval workflow
  approvalStatus?: ApprovalStatus;
  approvalToken?: string;      // secure token embedded in email links
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  // Payment tracking
  amountPaid?: number;
  paymentStatus?: 'Full' | 'Partial';
  remainingAmount?: number;
  partialPayments?: PartialPayment[];
  totalPaid?: number;
  isFullyCleared?: boolean;
  depositedToBank?: boolean;
      attachments?: Attachment[];
  // Profit & Loss classification
  plMainCategory?: PLMainCategory;
  plSubCategory?: string;
  // Balance Sheet classification
  bsMainCategory?: BSMainCategory;
  bsSubCategory?: string;
  // Linked record info
  // 'inventory' is written by TransactionBridgeService when a purchase is
  // booked from the Inventory module.
  linkedType?: 'salary' | 'loan' | 'bill' | 'invoice' | 'commission' | 'inventory' | 'manual';
  linkedId?: string;
  linkedRef?: string;
  // Salary fields
  baseSalary?: number;
  commission?: number;
  deductions?: number;
  netAmount?: number;
  salaryMonth?: string;
  isAdvanceSalary?: boolean;
  advanceAmount?: number;
  // Loan fields
  loanType?: 'Receivable' | 'Payable';
  borrowerName?: string;
  lenderName?: string;
  expectedReturnDate?: string;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Phase 1 â€” NEW fields (all optional, backward-compat with legacy)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  // Semantic mapping between old model and new UI:
  //   â€¢ `mainCategory` ('Cash Inflow' | 'Cash Outflow')  â†”  UI "TYPE"     (Inflow / Outflow)
  //   â€¢ `subCategory`                                     â†”  UI "CATEGORY"
  //   â€¢ `subCategoryDetail`  (NEW)                        â†”  UI "SUB CATEGORY" (third level, user-managed per category)
  //
  // Read helpers in transactionsService.ts (`getTxAccount`, `getTxCategoryPath`)
  // resolve this for both new AND legacy transactions, so anywhere that already
  // reads `mainCategory` / `subCategory` / `mode` keeps working unchanged.

  /** Third-level category tag under `subCategory`. User-defined per Category (see DynamicCategory type 'subCategoryDetail'). */
  subCategoryDetail?: string;

  /**
   * Links an import payment to the shipment it belongs to.
   *
   * Set only when subCategory is PURCHASE_ORDER_CATEGORY. Kept so a ledger
   * entry and the charge or payment it produced can be reconciled, and so
   * deleting the entry can reverse the other side.
   */
  shipmentId?: string;
  shipmentNumber?: string;

  /** Which month a utility bill covers, e.g. '2026-08'. Set by the Bills module. */
  billMonth?: string;

  /** Receipt or slip image, shown in the Bills viewer. */
  imageUrl?: string;

  /** Currency the salary was agreed in, when it differs from the ledger's. */
  salaryCurrency?: string;

  /**
   * The salary converted to AED at the rate used on the day.
   *
   * Stored alongside salaryCurrency rather than recomputed, so a rate change
   * next month cannot restate a payroll run that has already been paid.
   */
  salaryAED?: number;

  /** Same, in PKR. Both are stored because payroll is reviewed in either. */
  salaryPKR?: number;
  /** 'Shipment' pays the supplier; the rest add to the landed cost. */
  shipmentPaymentKind?: 'Shipment' | 'Customs' | 'Freight' | 'Tax' | 'Other';

  /** Unified account reference. `'cash-in-hand'` for the virtual cash account, otherwise a bank doc id. */
  accountId?: string;
  /** Fast discriminator so callers don't need to look up the bank doc to know if it's Cash. */
  accountType?: AccountType;
  /** Denormalized account name for list display without joining. */
  accountName?: string;

  /** Explicit branch reference (replaces string `company` at write time; `company` remains for legacy reads). */
  branchId?: string;
  branchName?: string;

  /** Optional remitter (Inflow only) â€” "Who sent this money" in the reference UI. */
  remitterName?: string;

  /** Required attachment URL on new records. Legacy records may only have `attachments[]`. */
  attachmentUrl?: string;
}

export interface TransactionItem {
  id: string;
  mainCategory: string;
  subCategory: string;
  detailCategory: string;
  amount: number;
  amountPaid: number;
  remainingAmount: number;
  paymentStatus: 'Full' | 'Partial';
  paidBy: string;
  paidTo: string;
  note: string;
  receipt?: File | null;
  dueDate?: string;
}

export interface TransactionFilters {
  searchTerm: string;
  mainCategory: string;
  dateFrom: string;
  dateTo: string;
  paymentStatus: string;
  company: string;
  approvalStatus: string;   // '' | 'pending_approval' | 'approved' | 'rejected'
}

export interface TransactionStats {
  totalInflow: number;
  totalOutflow: number;
  netBalance: number;
  transactionCount: number;
  pendingCount: number;
  totalPending: number;
  pendingApprovalCount: number;  // new
}

export interface PendingPaymentData {
  amount: number;
  bankId: string;
  method: 'Cash' | 'Cheque' | 'Bank';
  chequeNumber?: string;
  chequeDate?: string;
  chequeBank?: string;
}

// â”€â”€ In-app Notification (stored in Firestore /appNotifications) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type AppNotificationType =
  | 'transaction_pending_approval'
  | 'transaction_approved'
  | 'transaction_rejected'
  | 'payment_pending'
  | 'payment_cleared'
  | 'user_registration_pending'
  | 'info';

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  title: string;
  message: string;
  transactionId?: string;
  transactionRef?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  isRead: boolean;
  createdAt: string;
  expiresAt?: string;
}

// â”€â”€ Company / Branch (user-managed, stored in Firestore /companies) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface Company {
  id: string;
  name: string;
  createdAt: string;
}

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const COMPANIES = [
  { id: 'sau', name: 'Bullion Electronics - Saudia' },
  { id: 'dxb', name: 'Bullion Electronics - Dubai' },
  { id: 'cad', name: 'Bullion Electronics - Chad' },
  { id: 'sdn', name: 'Bullion Electronics - Sudan' },
  { id: 'oth', name: 'Bullion Electronics - Other' },
];

export const MAIN_CATEGORIES = ['Cash Inflow', 'Cash Outflow', 'Loan'];

/** Special Outflow category that opens an invoice-picker in the transaction modal.
 *  Picking it wires the transaction into the invoice's misc-expense history via
 *  InvoiceMiscExpenseService.recordExpense (which also books the ledger entry
 *  itself, so the modal must NOT double-book). */
export const INVOICE_MISC_EXPENSE_CATEGORY = 'Invoice Misc Expense';

/** Special Inflow category that opens an invoice-picker for recording customer
 *  payments against a sales invoice. Modal routes the save through
 *  InvoicePaymentService.recordPayment (which updates invoice payment history
 *  AND books the ledger entry â€” modal must NOT double-book). */
export const SALES_INVOICE_CATEGORY = 'Sales Invoice';

/** Special Outflow category that opens an invoice-picker for recording supplier
 *  payments (paying the supplier for goods sold via a specific invoice). Modal
 *  routes the save through InvoiceSupplierPaymentService.recordPayment which
 *  updates invoice.supplierPaidAmount / supplierPayments[] AND books the ledger
 *  entry â€” modal must NOT double-book. */
export const SOLD_GOODS_PAYMENT_CATEGORY = 'Supplier Cost';

/**
 * Special Outflow category that opens a shipment picker.
 *
 * Which shipments are offered depends on the sub-kind chosen beneath it, and
 * the two halves have opposite gates:
 *
 *   Shipment                     receiving IS finalised, and money is still owed
 *   Customs/Freight/Tax/Other    costing is NOT finalised
 *
 * They are opposite because what is owed to the supplier is built on received
 * quantity â€” unsettled until receiving is finalised â€” while a charge added
 * after costing is signed off would restate a landed cost someone has used.
 *
 * The save routes through PurchasedOrderFirebaseService, which writes the
 * charge or the payment. The modal books the ledger entry itself, so unlike
 * the invoice categories above there is no double-book risk: the shipment
 * service does not touch the ledger.
 */
export const PURCHASE_ORDER_CATEGORY = 'Purchase Order';

/**
 * 'Shipment' settles the goods and goes to the supplier. The other four add to
 * what the goods cost and go to the clearing agent or the government. Two
 * payments against the same shipment on the same day are not interchangeable,
 * so the kind is stored rather than inferred from a label users can rename.
 */
export const PURCHASE_ORDER_SUB_KINDS = [
  'Shipment', 'Customs', 'Freight', 'Tax', 'Other',
] as const;
export type PurchaseOrderSubKind = typeof PURCHASE_ORDER_SUB_KINDS[number];

export const SUB_CATEGORIES: Record<string, string[]> = {
  // â”€â”€ Inflow (money coming in) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Matches the reference exactly â€” three categories, no more. Sub-category
  // handling picks up the finer-grained distinctions (Loan / Commission /
  // Other are managed as user-added Sub-categories per parent).
  'Cash Inflow': [
    'Account Payable',
    'Account Receivable',
  ],
  // â”€â”€ Outflow (money going out) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Reorganized into a curated tree that matches the reference UI.
  // The special "Invoice Misc Expense" entry opens the invoice picker.
  // "Sold Goods Payment" also opens the invoice picker â€” for paying the
  // supplier of goods sold via an invoice (see SOLD_GOODS_PAYMENT_CATEGORY).
  'Cash Outflow': [
    'Invoice Misc Expense',           // Special: opens invoice picker
    'Payrolls',
    'Utility Bills & Rents',
    'Grocery & Stationery',
    'Advertising and Marketing',
    'Purchase Order',
    'Supplier Cost',                  // Special: opens invoice picker (supplier payment)
    'Logistics & Freight',
    'Bank Charges',
    'Travelling, Accommodations & Food',
    'Zakat & Donations',
    'Tax & Consultations',
    'Account Payable',
    'Account Receivable',
    'Other Expenses',
  ],
  'Loan': [
    'Loan given',
    'Loan received',
    'Official Loan',
    'Personal loan',
    'Other loan - Full',
    'Other loan - Partial',
  ],
};

// â”€â”€ Dynamic Category (user-added, stored in Firestore /dynamicCategories) â”€â”€â”€â”€â”€
export interface DynamicCategory {
  id: string;
  // 'mainCategory' / 'subCategory'         â†’ transaction category tree
  // 'subCategoryDetail' (NEW)              â†’ third-level tag under a subCategory
  //                                          e.g. Category='Utilities' â†’ SubCat='Electricity Bill'
  // 'plMainCategory' / 'plSubCategory'     â†’ P&L category tree
  // 'bsMainCategory' / 'bsSubCategory'     â†’ Balance Sheet category tree
  type: 'mainCategory' | 'subCategory' | 'subCategoryDetail' | 'billCategory'
      | 'plMainCategory' | 'plSubCategory' | 'bsMainCategory' | 'bsSubCategory';
  // For 'subCategory' this is the parent mainCategory ('Cash Inflow' / 'Cash Outflow' / 'Loan').
  // For 'subCategoryDetail' this is the parent subCategory string.
  parentCategory?: string;
  name: string;
  /**
   * Optional because the callers that add a category on the fly â€” the bills
   * form is one â€” let Firestore stamp it on write. Requiring it here made a
   * valid create fail typecheck while the document it produced was correct.
   */
  createdAt?: string;
}

// â”€â”€ Profit & Loss Categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type PLMainCategory =
  | 'Revenue'
  | 'Cost of Goods Sold (COGS)'
  | 'Operating Expenses';

export interface PLCategory {
  main: PLMainCategory;
  sub: string;
}

export const PL_CATEGORIES: Record<PLMainCategory, string[]> = {
  'Revenue': [
    'Service / Invoice Sales',
    'Service Income',
  ],
  'Cost of Goods Sold (COGS)': [
    'Purchase & Inventory',
  ],
  'Operating Expenses': [
    'Salaries & Wages',
    'Utilities',
    'Rent',
    'Marketing',
    'Miscellaneous',
  ],
};

// â”€â”€ Balance Sheet Categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type BSMainCategory =
  | 'Assets'
  | 'Liabilities & Equity';

export interface BSCategory {
  main: BSMainCategory;
  sub: string;
}

export const BS_CATEGORIES: Record<BSMainCategory, string[]> = {
  'Assets': [
    'Cash & Cash Equivalents',
    'Accounts Receivable',
    'Inventory',
    'Prepaid Expenses',
    'Fixed Assets',
    'Other Assets',
  ],
  'Liabilities & Equity': [
    'Accounts Payable',
    'Short-term Loans',
    'Long-term Loans',
    'Accrued Expenses',
    'Owner Equity / Capital',
    'Retained Earnings',
    'Other Liabilities',
  ],
};

export const LOAN_SUB_CATEGORIES = new Set([
  'Loan received - From Employee',
  'Loan received - From Company',
  'Loan paid to employee',
  'Loan given',
  'Loan received',
  'Official Loan',
  'Personal loan',
  'Other loan - Full',
  'Other loan - Partial',
]);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Phase 1 â€” NEW: Accounts & Branches (Cash + Banks as unified accounts)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Which "kind" of account this is. Cash-in-Hand is virtual, banks are real Firestore docs. */
export type AccountType = 'cash' | 'bank';

/** Doc id of the virtual Cash-in-Hand account. Balances for this id are computed
 *  from all cash-mode transactions, not stored on any doc. */
export const CASH_IN_HAND_ID = 'cash-in-hand';
export const CASH_IN_HAND_NAME = 'Cash in Hand';

/**
 * Unified account model. Cash-in-Hand is a synthesized instance with id
 * `CASH_IN_HAND_ID`; every bank account in the `banks` collection also becomes
 * an `Account` for the transaction UI.
 *
 * Balance is always live-computed from transactions (source of truth) rather
 * than trusted from the bank doc â€” that keeps balances honest even when other
 * modules write bank-side debits/credits without going through this ledger.
 */
export interface Account {
  id: string;                 // CASH_IN_HAND_ID or a bank doc id
  name: string;               // 'Cash in Hand' | 'HBL â€” Main Branch' etc
  type: AccountType;
  balance: number;            // live-computed running balance
  accountNumber?: string;     // banks only
  currency?: string;          // default 'AED'
}

/** Branch record (kept as a Firestore doc so it can be added/renamed by the user). */
export interface Branch {
  id: string;
  name: string;               // e.g. 'Main Office', 'DHA Warehouse'
  createdAt?: string;
}
