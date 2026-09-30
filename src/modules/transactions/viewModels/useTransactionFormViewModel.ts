// Transactions Module - Form ViewModel
// Approval rules:
//   Cash Inflow  → approvalStatus: 'not_required'  (notification email only, no approval)
//   Cash Outflow → approvalStatus: 'pending_approval' (approval email with Approve/Reject)
//   Loan (given) → approvalStatus: 'pending_approval' (approval email with Approve/Reject)
//   Loan (received) → approvalStatus: 'not_required' (notification email only)

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Transaction, TransactionItem, SUB_CATEGORIES, DynamicCategory, PLMainCategory, BSMainCategory, Company } from '../models/types';
import { formatCurrency } from '../models/transactionsService';
import { TransactionFirebaseService } from '../models/transactionFirebaseService';
import { BankFirebaseService } from '../../banking/models/bankFirebaseService';
import { fetchCurrencyRates, convertCurrency, CURRENCY_RATE_FALLBACK, calculateSupplierCost } from '../../invoices/models/invoiceService';
import { InvoiceFirebaseService } from '../../invoices/models/InvoiceFirebaseService';
import { Invoice } from '../../invoices/models/types';
import { InvoicePaymentService } from '../../invoices/models/InvoicePaymentService';
import { SOLD_GOODS_PAYMENT_CATEGORY } from '../models/types';

interface BankInfo { id: string; name: string; balance: number; }

// ── Currency support ─────────────────────────────────────────────────────────
export type SupportedCurrency = 'AED';

export interface CurrencyOption {
  code: SupportedCurrency;
  name: string;
  symbol: string;
  flag: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', flag: '🇦🇪' },
];

export function formatCurrencyWithCode(amount: number, currency: SupportedCurrency): string {
  const opt = SUPPORTED_CURRENCIES.find(c => c.code === currency);
  const sym = opt?.symbol ?? currency;
  const formatted = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${sym} ${formatted}`;
}
// ─────────────────────────────────────────────────────────────────────────────

export interface UseTransactionFormViewModelReturn {
  office: string;
  date: string;
  transactionType: 'Cash Inflow' | 'Cash Outflow' | 'Loan';
  paymentMode: 'Cash' | 'Bank' | 'Cheque';
  selectedBank: string;
  chequeNumber: string;
  chequeDate: string;
  chequeBank: string;
  setChequeNumber: (v: string) => void;
  setChequeDate: (v: string) => void;
  setChequeBank: (v: string) => void;
  manualDate: string;
  setManualDate: (v: string) => void;
  isPayableReceivable: boolean;
  enableMultiple: boolean;
  transactionItems: TransactionItem[];
  transactionId: string;
  isGeneratingId: boolean;
  isEditingId: boolean;
  setTransactionId: (id: string) => void;
  setIsEditingId: (v: boolean) => void;
  totalAmount: number;
  totalPaid: number;
  totalRemaining: number;
  currentBankBalance: number;
  remainingBalanceAfter: number;
  banks: BankInfo[];
  isLoading: boolean;
  isSaving: boolean;
  isEditing: boolean;
  setOffice: (v: string) => void;
  setDate: (v: string) => void;
  setTransactionType: (v: 'Cash Inflow' | 'Cash Outflow' | 'Loan') => void;
  setPaymentMode: (v: 'Cash' | 'Bank' | 'Cheque') => void;
  setSelectedBank: (v: string) => void;
  setEnableMultiple: (v: boolean) => void;
  updateItem: (id: string, field: keyof TransactionItem, value: any) => void;
  addItem: () => void;
  removeItem: (id: string) => void;
  handleSave: () => Promise<void>;
  handleCancel: () => void;
  formatCurrency: (n: number) => string;
  formatDateDisplay: (d: string) => string;
  duplicateIdError: string;
  setDuplicateIdError: (msg: string) => void;
  // Profit & Loss
  plMainCategory: PLMainCategory | '';
  plSubCategory: string;
  setPlMainCategory: (v: PLMainCategory | '') => void;
  setPlSubCategory: (v: string) => void;
  // Balance Sheet
  bsMainCategory: BSMainCategory | '';
  bsSubCategory: string;
  setBsMainCategory: (v: BSMainCategory | '') => void;
  setBsSubCategory: (v: string) => void;
  // Dynamic categories (transaction)
  dynamicSubCategories: DynamicCategory[];
  onAddSubCategory: (parentCategory: string, name: string) => Promise<string | null>;
  onDeleteSubCategory: (id: string) => Promise<void>;
  // Dynamic categories (P&L)
  dynamicPLCategories: DynamicCategory[];
  onAddPLMainCategory: (name: string) => Promise<string | null>;
  onAddPLSubCategory: (parentCategory: string, name: string) => Promise<string | null>;
  onDeletePLCategory: (id: string) => Promise<void>;
  // Dynamic categories (Balance Sheet)
  dynamicBSCategories: DynamicCategory[];
  onAddBSMainCategory: (name: string) => Promise<string | null>;
  onAddBSSubCategory: (parentCategory: string, name: string) => Promise<string | null>;
  onDeleteBSCategory: (id: string) => Promise<void>;
  // Companies / Branches
  companies: Company[];
  onAddCompany: (name: string) => Promise<string | null>;
  // Currency
  currency: SupportedCurrency;
  setCurrency: (c: SupportedCurrency) => void;
  currencyOptions: CurrencyOption[];
  currencyRates: Record<string, number>;
  // ── Sold Goods (supplier) Payment picker ──────────────────────────────
  // When user picks "Sold Goods Payment" as the Category, this picker shows
  // invoices with outstanding supplier cost. Selecting one auto-fills the
  // item's amount with the outstanding balance and routes handleSave through
  // InvoicePaymentService.recordSupplierPayment (which books the ledger row
  // itself — modal must NOT double-book via createTransaction).
  supplierPaymentInvoices: SupplierPaymentInvoiceOption[];
  supplierPaymentInvoicesLoading: boolean;
  selectedSupplierInvoiceId: string;
  selectSupplierInvoice: (itemId: string, invoiceId: string) => void;
}

/** One row shown in the Sold Goods Payment invoice picker. */
export interface SupplierPaymentInvoiceOption {
  id: string;                        // Firestore doc id
  invoiceNumber: string;
  customerName: string;
  date: string;
  supplierCostTotal: number;         // total owed to supplier for this invoice
  supplierPaidAmount: number;        // already paid to supplier so far
  outstandingAmount: number;         // supplierCostTotal − supplierPaidAmount
  supplierPaymentStatus: 'Unpaid' | 'Partial' | 'Paid';
}

const emptyItem = (type: string): TransactionItem => ({
  id: Date.now().toString(),
  mainCategory: type, subCategory: '', detailCategory: '',
  amount: 0, amountPaid: 0, remainingAmount: 0,
  paymentStatus: 'Full', paidBy: '', paidTo: '', note: '', dueDate: '',
});

/** Sub-categories that represent a Payable/Receivable entry. When any item in
 *  the form has one of these selected: the Location/Branch field is hidden
 *  (not applicable) and the Note/Description field is relabeled to
 *  "Purpose of Loan". */
export const PAYABLE_RECEIVABLE_SUB_CATEGORIES = new Set(['Account Payable', 'Account Receivable']);

/** Generate a secure random token for approval email links */
function generateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Determine whether a transaction needs admin approval.
 *
 * Rules:
 *  - Cash Outflow            → always needs approval
 *  - Loan (given/payable)    → needs approval  (loan given out = money leaving)
 *  - Cash Inflow             → NO approval needed (money coming in)
 *  - Loan (received)         → NO approval needed (money coming in)
 */
const LOAN_GIVEN_SUB_CATEGORIES = new Set([
  'Loan given',
  'Official Loan',
  'Personal loan',
  'Other loan - Full',
  'Other loan - Partial',
  'Loan paid to employee',
]);

function requiresApproval(
  mainCategory: 'Cash Inflow' | 'Cash Outflow' | 'Loan',
  subCategory: string
): boolean {
  if (mainCategory === 'Cash Outflow') return true;
  if (mainCategory === 'Loan' && LOAN_GIVEN_SUB_CATEGORIES.has(subCategory)) return true;
  return false; // Cash Inflow and Loan received → no approval
}

export function useTransactionFormViewModel(): UseTransactionFormViewModelReturn {
  const navigate = useNavigate();
  const { id }   = useParams<{ id: string }>();

  const [banks,            setBanks]            = useState<BankInfo[]>([]);
  const [editingTx,        setEditingTx]        = useState<Transaction | null>(null);
  const [isLoading,        setIsLoading]        = useState(true);
  const [isSaving,         setIsSaving]         = useState(false);
  const [transactionId,    setTransactionId]    = useState('');
  const [isGeneratingId,   setIsGeneratingId]   = useState(true);
  const [isEditingId,      setIsEditingId]      = useState(false);
  const [duplicateIdError, setDuplicateIdError] = useState('');

  const [office,          setOffice]               = useState('loc-sa');
  const [date,            setDate]                 = useState(new Date().toISOString().split('T')[0]);
  const [manualDate,      setManualDate]           = useState('');
  const [transactionType, setTransactionTypeState] = useState<'Cash Inflow' | 'Cash Outflow' | 'Loan'>('Cash Inflow');
  const [paymentMode,     setPaymentMode]          = useState<'Cash' | 'Bank' | 'Cheque'>('Cash');
  const [selectedBank,    setSelectedBank]         = useState('');

  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate,   setChequeDate]   = useState('');

  // ── Sold Goods (Supplier) Payment picker state ──────────────────────────
  const [supplierPaymentInvoices,        setSupplierPaymentInvoices]        = useState<SupplierPaymentInvoiceOption[]>([]);
  const [supplierPaymentInvoicesLoading, setSupplierPaymentInvoicesLoading] = useState(false);
  const [selectedSupplierInvoiceId,      setSelectedSupplierInvoiceId]      = useState<string>('');
  // Full invoice cache keyed by id — needed when we call recordSupplierPayment on save.
  const [supplierInvoiceCache, setSupplierInvoiceCache] = useState<Record<string, Invoice>>({});
  const [chequeBank,   setChequeBank]   = useState('');

  // Currency state — default to AED
  const [currency, setCurrency] = useState<SupportedCurrency>('AED');
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>(CURRENCY_RATE_FALLBACK as any);

  const [enableMultiple,       setEnableMultiple]       = useState(false);
  const [transactionItems,     setTransactionItems]     = useState<TransactionItem[]>([emptyItem('Cash Inflow')]);
  const [dynamicSubCategories, setDynamicSubCategories] = useState<DynamicCategory[]>([]);
  const [dynamicPLCategories,  setDynamicPLCategories]  = useState<DynamicCategory[]>([]);
  const [dynamicBSCategories,  setDynamicBSCategories]  = useState<DynamicCategory[]>([]);
  const [plMainCategory,       setPlMainCategoryState]  = useState<PLMainCategory | ''>('');
  const [plSubCategory,        setPlSubCategory]        = useState('');
  const [bsMainCategory,       setBsMainCategoryState]  = useState<BSMainCategory | ''>('');
  const [bsSubCategory,        setBsSubCategory]        = useState('');
  // Locations — default seed (Saudia, Dubai, Chad, Sudan) + Firestore user-added
  const DEFAULT_LOCATIONS: Company[] = [
    { id: 'loc-sa', name: 'Bullion Electronics - Saudia', createdAt: 'static' },
    { id: 'loc-ae', name: 'Bullion Electronics - Dubai',  createdAt: 'static' },
    { id: 'loc-td', name: 'Bullion Electronics - Chad',   createdAt: 'static' },
    { id: 'loc-sd', name: 'Bullion Electronics - Sudan',  createdAt: 'static' },
  ];
  const [companies, setCompanies] = useState<Company[]>(DEFAULT_LOCATIONS);

  // ── Load banks + existing transaction (edit mode) ──────────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const bankList = await BankFirebaseService.fetchAllBanks().catch(() => []);
        setBanks(bankList as any[]);

        // Fetch live currency rates (non-blocking — falls back to static rates on error)
        fetchCurrencyRates().then(rates => {
          if (rates) setCurrencyRates(rates as any);
        }).catch(() => {/* silently use fallback */});

        // Load user-added dynamic categories
        const dynCats = await TransactionFirebaseService.fetchDynamicCategories().catch(() => []);
        setDynamicSubCategories(dynCats.filter(d => d.type === 'subCategory' || d.type === 'mainCategory'));
        setDynamicPLCategories(dynCats.filter(d => d.type === 'plMainCategory' || d.type === 'plSubCategory'));
        setDynamicBSCategories(dynCats.filter(d => d.type === 'bsMainCategory' || d.type === 'bsSubCategory'));

        // Load companies from Firestore and merge with static seed
        const firestoreCompanies = await TransactionFirebaseService.fetchCompanies().catch(() => []);
        setCompanies(prev => {
          const merged = [...prev];
          firestoreCompanies.forEach(fc => {
            if (!merged.find(m => m.id === fc.id)) {
              merged.push(fc);
            }
          });
          return merged;
        });

        if (id) {
          const tx = await TransactionFirebaseService.fetchTransactionById(id);
          if (tx) {
            setEditingTx(tx);
            setTransactionId(tx.transactionId || '');
            setIsGeneratingId(false);
            const officeId = DEFAULT_LOCATIONS.find(o => o.name === tx.company)?.id
                          || DEFAULT_LOCATIONS.find(o => tx.company?.includes(o.name))?.id
                          || DEFAULT_LOCATIONS[0].id;
            setOffice(officeId);
            setDate(tx.date);
            setManualDate(tx.date);
            setTransactionTypeState(tx.mainCategory as any);
            setPaymentMode(tx.mode);
            if (tx.bankId)       setSelectedBank(tx.bankId);
            if (tx.chequeNumber) setChequeNumber(tx.chequeNumber);
            if (tx.chequeDate)   setChequeDate(tx.chequeDate);
            if (tx.chequeBank)   setChequeBank(tx.chequeBank || '');
            if (tx.plMainCategory) setPlMainCategoryState(tx.plMainCategory);
            if (tx.plSubCategory)  setPlSubCategory(tx.plSubCategory);
            if (tx.bsMainCategory) setBsMainCategoryState(tx.bsMainCategory);
            if (tx.bsSubCategory)  setBsSubCategory(tx.bsSubCategory);
            // Restore saved currency if present
            if ((tx as any).currency && SUPPORTED_CURRENCIES.find(c => c.code === (tx as any).currency)) {
              setCurrency((tx as any).currency as SupportedCurrency);
            }
            setTransactionItems([{
              id:              tx.id,
              mainCategory:    tx.mainCategory    || '',
              subCategory:     tx.subCategory     || '',
              detailCategory:  tx.detailCategory  || '',
              amount:          tx.amount          || 0,
              amountPaid:      tx.amountPaid      ?? tx.amount ?? 0,
              remainingAmount: tx.remainingAmount ?? 0,
              paymentStatus:   tx.paymentStatus   ?? 'Full',
              paidBy:          tx.paidBy          || '',
              paidTo:          tx.paidTo          || '',
              note:            tx.note            || '',
              dueDate:         tx.dueDate         || '',
            }]);
          }
        } else {
          const now = new Date();
          const dd  = String(now.getDate()).padStart(2, '0');
          const mm  = String(now.getMonth() + 1).padStart(2, '0');
          const yy  = String(now.getFullYear()).slice(-2);
          setTransactionId(`TXN-${dd}${mm}${yy}-###`);
          setIsGeneratingId(false);
        }
      } catch {
        toast.error('Failed to load form data');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id]);

  const setTransactionType = useCallback((type: 'Cash Inflow' | 'Cash Outflow' | 'Loan') => {
    setTransactionTypeState(type);
    setTransactionItems(items => items.map(i => ({ ...i, mainCategory: type, subCategory: '' })));
  }, []);

  const setPlMainCategory = useCallback((v: PLMainCategory | '') => {
    setPlMainCategoryState(v);
    setPlSubCategory('');
  }, []);

  const setBsMainCategory = useCallback((v: BSMainCategory | '') => {
    setBsMainCategoryState(v);
    setBsSubCategory('');
  }, []);

// NEW: Classification suggestion mappings
interface ClassificationSuggestion {
  plMain?: PLMainCategory;
  plSub?: string;
  bsMain?: BSMainCategory;
  bsSub?: string;
}

const getSuggestedClassification = (
  mainCategory: 'Cash Inflow' | 'Cash Outflow' | 'Loan',
  subCategory: string
): ClassificationSuggestion | null => {
  const sub = subCategory.toLowerCase();
  
  // P&L Revenue (Cash Inflow - sales)
  if (mainCategory === 'Cash Inflow') {
    if (sub.includes('sale') || sub.includes('payment received')) {
      return { plMain: 'Revenue', plSub: 'Service / Invoice Sales' };
    }
    if (sub.includes('commission')) {
      return { plMain: 'Revenue', plSub: 'Service Income' };
    }
  }
  
  // P&L COGS (Purchases)
  if (sub === 'purchase') {
    return { plMain: 'Cost of Goods Sold (COGS)', plSub: 'Purchase & Inventory' };
  }
  
  // P&L OpEx (Salaries, Utilities, Rent)
  if (mainCategory === 'Cash Outflow') {
    if (sub.includes('salary') || sub.includes('commission paid')) {
      return { plMain: 'Operating Expenses', plSub: 'Salaries & Wages' };
    }
    if (sub.includes('rent') || sub.includes('electricity') || sub.includes('gas') || sub.includes('internet')) {
      return { plMain: 'Operating Expenses', plSub: 'Utilities' };
    }
    if (sub.includes('office rent')) {
      return { plMain: 'Operating Expenses', plSub: 'Rent' };
    }
  }
  
  // BS Assets (Inventory, Receivables)
  if (sub === 'purchase') {
    return { bsMain: 'Assets', bsSub: 'Inventory' };
  }
  if (mainCategory === 'Cash Inflow' && !sub.includes('loan')) {
    return { bsMain: 'Assets', bsSub: 'Cash & Cash Equivalents' };
  }
  
  // BS Liabilities (Payables, Loans)
  if (mainCategory === 'Cash Outflow' && (sub.includes('payment to') || sub.includes('loan paid'))) {
    return { bsMain: 'Liabilities & Equity', bsSub: 'Accounts Payable' };
  }
  
  return null;
};

  const updateItem = useCallback((itemId: string, field: keyof TransactionItem, value: any) => {
    setTransactionItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const updated = { ...item, [field]: value };
      
      // NEW: Auto-suggest classification on subCategory change
      if (field === 'subCategory' && value && !plMainCategory && !bsMainCategory) {
        const suggestion = getSuggestedClassification(transactionType, value as string);
        if (suggestion) {
          if (suggestion.plMain) {
            setPlMainCategoryState(suggestion.plMain);
            if (suggestion.plSub) setPlSubCategory(suggestion.plSub);
          } else if (suggestion.bsMain) {
            setBsMainCategoryState(suggestion.bsMain);
            if (suggestion.bsSub) setBsSubCategory(suggestion.bsSub);
          }
          toast.message('💡 Suggested classification applied (edit if needed)');
        }
      }
      
      if (field === 'amount' || field === 'amountPaid') {
        const amount     = field === 'amount'     ? Number(value) : item.amount;
        const amountPaid = field === 'amountPaid' ? Number(value) : item.amountPaid;
        // Blank / zero amountPaid means fully paid — only mark Partial when a
        // specific partial amount has been explicitly entered (> 0 and < total).
        const isExplicitPartial = amountPaid > 0 && amountPaid < amount;
        updated.remainingAmount = isExplicitPartial ? amount - amountPaid : 0;
        updated.paymentStatus   = isExplicitPartial ? 'Partial' : 'Full';
      }
      return updated;
    }));
  }, [transactionType, plMainCategory, bsMainCategory]);

  const addItem = useCallback(() =>
    setTransactionItems(p => [...p, { ...emptyItem(transactionType), id: Date.now().toString() }]),
  [transactionType]);

  const removeItem = useCallback((itemId: string) =>
    setTransactionItems(p => p.filter(i => i.id !== itemId)),
  []);

  // ── Sold Goods (Supplier) Payment picker: load invoices with outstanding
  //     supplier cost. Runs lazily when the user picks "Sold Goods Payment"
  //     as the Category on any item row.
  const needsSupplierInvoices = useMemo(
    () => transactionItems.some(i => i.subCategory === SOLD_GOODS_PAYMENT_CATEGORY),
    [transactionItems],
  );

  useEffect(() => {
    if (!needsSupplierInvoices)             return;
    if (supplierPaymentInvoicesLoading)     return;
    if (supplierPaymentInvoices.length > 0) return;
    let cancelled = false;
    (async () => {
      setSupplierPaymentInvoicesLoading(true);
      try {
        const all = await InvoiceFirebaseService.fetchAllInvoices();
        const cache: Record<string, Invoice> = {};
        const rows: SupplierPaymentInvoiceOption[] = [];
        for (const inv of all) {
          const total = (inv as any).supplierCostTotal || calculateSupplierCost(inv);
          if (total <= 0) continue;                          // no supplier cost — skip
          if (inv.status === 'Returned') continue;           // returned invoices aren't payable
          const paid        = Number((inv as any).supplierPaidAmount) || 0;
          const outstanding = Math.max(0, total - paid);
          const status: 'Unpaid' | 'Partial' | 'Paid' =
            outstanding <= 0.01 ? 'Paid'
              : paid > 0 ? 'Partial'
              : 'Unpaid';
          if (status === 'Paid') continue;                   // fully settled — hide
          cache[inv.id] = inv;
          rows.push({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            customerName: inv.customerName,
            date: inv.date,
            supplierCostTotal: total,
            supplierPaidAmount: paid,
            outstandingAmount: outstanding,
            supplierPaymentStatus: status,
          });
        }
        rows.sort((a, b) => (a.date < b.date ? 1 : -1));     // newest first
        if (cancelled) return;
        setSupplierPaymentInvoices(rows);
        setSupplierInvoiceCache(cache);
        console.log(`[Transaction VM] Loaded ${rows.length} invoice(s) with outstanding supplier cost`);
      } catch (err) {
        console.error('[Transaction VM] Failed to load supplier-payment invoices:', err);
        toast.error('Could not load invoices for supplier payment');
      } finally {
        if (!cancelled) setSupplierPaymentInvoicesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [needsSupplierInvoices, supplierPaymentInvoicesLoading, supplierPaymentInvoices.length]);

  /** Select an invoice for a Sold Goods Payment row: auto-fills item.amount
   *  with the outstanding supplier balance and remembers the invoice for save. */
  const selectSupplierInvoice = useCallback((itemId: string, invoiceId: string) => {
    setSelectedSupplierInvoiceId(invoiceId);
    const row = supplierPaymentInvoices.find(r => r.id === invoiceId);
    if (!row) return;
    // Auto-fill the amount with what's outstanding to the supplier.
    setTransactionItems(prev => prev.map(item =>
      item.id === itemId
        ? {
            ...item,
            amount:         row.outstandingAmount,
            amountPaid:     row.outstandingAmount,
            remainingAmount: 0,
            paymentStatus:  'Full',
            paidTo:         `Supplier (${row.invoiceNumber})`,
            note:           item.note || `Supplier payment for invoice ${row.invoiceNumber} — ${row.customerName}`,
          }
        : item
    ));
  }, [supplierPaymentInvoices]);

  // ── Computed totals ─────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    totalAmount:    transactionItems.reduce((s, i) => s + (i.amount || 0), 0),
    totalPaid:      transactionItems.reduce((s, i) => s + (i.amountPaid || 0), 0),
    totalRemaining: transactionItems.reduce((s, i) => s + (i.remainingAmount || 0), 0),
  }), [transactionItems]);

  const currentBankBalance = useMemo(() =>
    banks.find(b => b.id === selectedBank)?.balance ?? 0,
  [banks, selectedBank]);

  const remainingBalanceAfter = useMemo(() => {
    if (paymentMode !== 'Bank' || !selectedBank) return currentBankBalance;
    // totals.totalAmount is AED (item.amount is always AED-denominated);
    // currentBankBalance is PKR-canonical — convert before combining.
    const totalAmountPKR = +convertCurrency(totals.totalAmount, 'AED', 'PKR', currencyRates as any).toFixed(2);
    return transactionType === 'Cash Inflow'
      ? currentBankBalance + totalAmountPKR
      : currentBankBalance - totalAmountPKR;
  }, [currentBankBalance, totals.totalAmount, transactionType, paymentMode, selectedBank, currencyRates]);

  // ── Currency-aware formatter ────────────────────────────────────────────────
  const formatCurrencyLocal = useCallback(
    (n: number) => formatCurrencyWithCode(n, currency),
    [currency]
  );

  // ── Payable/Receivable detection ────────────────────────────────────────────
  // When any item's sub-category is Account Payable/Account Receivable, the
  // Location/Branch field is not applicable and gets hidden, and the
  // Note/Description field is relabeled to "Purpose of Loan" in the view.
  const isPayableReceivable = useMemo(
    () => transactionItems.some(item => PAYABLE_RECEIVABLE_SUB_CATEGORIES.has(item.subCategory)),
    [transactionItems]
  );

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    const errors: string[] = [];
    if (!office && !isPayableReceivable) errors.push('Select an office/branch');
    if (!date)   errors.push('Select a date');
    for (const [i, item] of transactionItems.entries()) {
      const n = transactionItems.length > 1 ? ` (item ${i + 1})` : '';
      if (!item.subCategory)                errors.push(`Sub category is required${n}`);
      if (!item.amount || item.amount <= 0)  errors.push(`Amount must be greater than 0${n}`);
      if (transactionType !== 'Cash Inflow') {
        if (item.amountPaid < 0)             errors.push(`Amount paid cannot be negative${n}`);
        if (item.amountPaid > item.amount)   errors.push(`Amount paid cannot exceed total amount${n}`);
      }
      if (!editingTx && !item.receipt)      errors.push(`Evidence attachment is required${n}`);
    }
    if (paymentMode === 'Bank'   && !selectedBank)          errors.push('Select a bank for bank transactions');
    if (paymentMode === 'Cheque' && !chequeNumber.trim())   errors.push('Enter the cheque number');
    // ── Classification: at least one of P&L or BS must be set ─────────────
    const hasClassification = (plMainCategory && plSubCategory) || (bsMainCategory && bsSubCategory);
    if (!hasClassification) {
      errors.push('Classification required: select at least a P&L category or a Balance Sheet category (with sub-category)');
    }
    return errors;
  }, [office, date, transactionItems, paymentMode, selectedBank, chequeNumber, transactionType, plMainCategory, plSubCategory, bsMainCategory, bsSubCategory, isPayableReceivable, editingTx]);

  const updateBankBalance = useCallback(async (bankId: string, amount: number, isInflow: boolean) => {
    if (!bankId) return;
    const bank = banks.find(b => b.id === bankId);
    if (!bank) return;
    const newBalance = isInflow ? bank.balance + amount : bank.balance - amount;
    await BankFirebaseService.updateBankBalance(bankId, newBalance);
    setBanks(prev => prev.map(b => b.id === bankId ? { ...b, balance: newBalance } : b));
  }, [banks]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const errors = validate();
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    setIsSaving(true);
    try {
      const isInflow = transactionType === 'Cash Inflow';
      let firstTxId  = '';
      let needsApprovalFirst = false;

      if (editingTx) {
        // ── Edit mode ─────────────────────────────────────────────────────
        const item = transactionItems[0];
        const effectiveDate = manualDate.trim() || date;

        // CurrencyAmountInput in the View always stores AED in item.amount /
        // item.amountPaid, regardless of which currency the user typed in.
        // Firestore's `amount` field is AED-canonical (used by dashboards,
        // Balance Sheet, reports, etc.) — save it as-is, no PKR conversion.
        // (Previously this was converted to PKR here, which meant every
        // amount you typed got scaled ~76x before landing in Firestore,
        // and every report reading `amount` back out treated that inflated
        // number as if it were already AED.)
        const amountAED     = +Number(item.amount).toFixed(2);
        const amountPaidAED = +Number(item.amountPaid || 0).toFixed(2);
        const remainingAED  = Math.max(0, amountAED - amountPaidAED);

        const updatedData: Partial<Transaction> = {
          date:            effectiveDate,
          mainCategory:    transactionType,
          subCategory:     item.subCategory,
          detailCategory:  item.detailCategory,
          amount:          amountAED,
          amountPaid:      amountPaidAED,
          remainingAmount: remainingAED,
          paymentStatus:   item.paymentStatus,
          paidBy:          item.paidBy,
          paidTo:          item.paidTo,
          note:            item.note,
          dueDate:         item.dueDate || undefined,
          mode:            paymentMode,
          bankId:          paymentMode === 'Bank' ? selectedBank : undefined,
          chequeNumber:    paymentMode === 'Cheque' ? chequeNumber : undefined,
          chequeDate:      paymentMode === 'Cheque' ? chequeDate   : undefined,
          chequeBank:      paymentMode === 'Cheque' ? chequeBank   : undefined,
          plMainCategory:  plMainCategory || undefined,
          plSubCategory:   plSubCategory  || undefined,
          bsMainCategory:  bsMainCategory || undefined,
          bsSubCategory:   bsSubCategory  || undefined,
          currency,
          // ── Original (AED, pre-conversion) fields for display fidelity ──
          originalCurrency:    (item as any).inputCurrency || 'AED',
          originalAmount:      item.amount,
          originalAmountPaid:  item.amountPaid || item.amount,
        } as any;
        await TransactionFirebaseService.updateTransaction(editingTx.id, updatedData);
        firstTxId = editingTx.transactionId || editingTx.id;

        if (paymentMode === 'Bank') {
          await updateBankBalance(selectedBank, amountAED, isInflow);
        }
      } else {
        // ── Create mode ───────────────────────────────────────────────────
        for (const [idx, item] of transactionItems.entries()) {
          // ── SPECIAL: Sold Goods Payment routes through the merged supplier
          // service. Do NOT fall through to the normal createTransaction below
          // or we'd double-book the cash movement.
          if (item.subCategory === SOLD_GOODS_PAYMENT_CATEGORY) {
            const invForPayment = supplierInvoiceCache[selectedSupplierInvoiceId];
            if (!invForPayment) {
              toast.error('Please select an invoice for the supplier payment');
              setIsSaving(false);
              return;
            }
            const officeObj      = companies.find(c => c.id === office);
            const companyName    = officeObj ? officeObj.name : office;
            const effectiveDate  = manualDate.trim() || date;
            const amountAED      = item.amount;
            try {
              const result = await InvoicePaymentService.recordSupplierPayment({
                invoice: invForPayment,
                amount:  amountAED,
                mode:    paymentMode,
                date:    effectiveDate,
                bankId:      paymentMode === 'Bank'   ? selectedBank : undefined,
                bankName:    paymentMode === 'Bank'
                  ? banks.find(b => b.id === selectedBank)?.name
                  : undefined,
                chequeNumber:  paymentMode === 'Cheque' ? chequeNumber : undefined,
                chequeDate:    paymentMode === 'Cheque' ? chequeDate   : undefined,
                chequeBank:    paymentMode === 'Cheque' ? chequeBank   : undefined,
                note:          item.note,
                company:       companyName as any,
              });
              if (idx === 0) firstTxId = result.transactionId;
              if (paymentMode === 'Bank' && selectedBank) {
                await updateBankBalance(selectedBank, amountAED, false); // outflow
              }
            } catch (err: any) {
              console.error('[Transaction VM] Supplier payment failed:', err);
              toast.error(err?.message || 'Supplier payment failed');
              setIsSaving(false);
              return;
            }
            continue; // Next item — bypass the normal createTransaction below
          }

          const needs = requiresApproval(transactionType, item.subCategory);
          if (idx === 0) needsApprovalFirst = needs;

          // Resolve sequential ID
          let resolvedId = transactionId;
          if (resolvedId.includes('###')) {
            resolvedId = await TransactionFirebaseService.generateTransactionId();
          }
          if (idx > 0) {
            resolvedId = await TransactionFirebaseService.generateTransactionId();
          }

          // Check for duplicate
          const exists = await TransactionFirebaseService.transactionIdExists(resolvedId);
          if (exists) {
            setDuplicateIdError(resolvedId);
            setIsSaving(false);
            return;
          }

          const token          = generateToken();
          const approvalStatus = needs ? 'pending_approval' : 'not_required';
          const officeObj      = companies.find(c => c.id === office);
          const companyName    = officeObj ? officeObj.name : office;

          // CurrencyAmountInput in the View always stores AED in item.amount /
          // item.amountPaid, regardless of which currency the user typed in.
          // Firestore's `amount` field is AED-canonical (used by dashboards,
          // Balance Sheet, reports, etc.) — save it as-is, no PKR conversion.
          const inputCurrency  = (item as any).inputCurrency || 'AED';
          const amountAED2     = +Number(item.amount).toFixed(2);
          const amountPaidAED  = +Number(item.amountPaid || item.amount).toFixed(2);
          const remainingAED   = item.remainingAmount
            ? +Number(item.remainingAmount).toFixed(2)
            : Math.max(0, amountAED2 - amountPaidAED);

          const effectiveDate = manualDate.trim() || date;
          const txData: Omit<Transaction, 'id'> = {
            transactionId:   resolvedId,
            date:            effectiveDate,
            time:            new Date().toTimeString().slice(0, 5),
            mainCategory:    transactionType,
            subCategory:     item.subCategory,
            detailCategory:  item.detailCategory,
            // AED is the authoritative stored value now; originals (as typed,
            // in inputCurrency) are preserved below for display fidelity.
            amount:          amountAED2,
            amountPaid:      amountPaidAED,
            remainingAmount: remainingAED,
            paymentStatus:   item.paymentStatus,
            paidBy:          item.paidBy,
            paidTo:          item.paidTo,
            note:            item.note,
            dueDate:         item.dueDate || undefined,
            mode:            paymentMode,
            bankId:          paymentMode === 'Bank'    ? selectedBank  : undefined,
            chequeNumber:    paymentMode === 'Cheque'  ? chequeNumber  : undefined,
            chequeDate:      paymentMode === 'Cheque'  ? chequeDate    : undefined,
            chequeBank:      paymentMode === 'Cheque'  ? chequeBank    : undefined,
            company:         companyName,
            approvalStatus,
            approvalToken:   token,
            plMainCategory:  plMainCategory || undefined,
            plSubCategory:   plSubCategory  || undefined,
            bsMainCategory:  bsMainCategory || undefined,
            bsSubCategory:   bsSubCategory  || undefined,
            currency,
            // ── Original (pre-conversion) currency fields ──────────────────
            originalCurrency:    inputCurrency,
            originalAmount:      item.amount,
            originalAmountPaid:  item.amountPaid || item.amount,
          } as any;

          await TransactionFirebaseService.createTransaction(txData);
          if (idx === 0) firstTxId = resolvedId;

          if (paymentMode === 'Bank' && selectedBank) {
            await updateBankBalance(selectedBank, amountAED2, isInflow);
          }
        }
      }

      if (editingTx) {
        toast.success('Transaction updated successfully', {
          description: `ID: ${firstTxId}`,
          duration:    4000,
        });
      } else {
        if (needsApprovalFirst) {
          toast.success('Transaction saved — waiting for admin approval', {
            description: `ID: ${firstTxId}`,
            duration:    5000,
          });
        } else {
          toast.success('Transaction saved successfully', {
            description: `ID: ${firstTxId}`,
            duration:    4000,
          });
        }
      }

      navigate('/transactions');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save transaction');
    } finally {
      setIsSaving(false);
    }
  }, [
    validate, editingTx, transactionItems, office, date, manualDate,
    transactionType, paymentMode, selectedBank, banks,
    navigate, transactionId, chequeNumber, chequeDate, chequeBank,
    updateBankBalance, plMainCategory, plSubCategory, bsMainCategory, bsSubCategory,
    currency, companies, currencyRates,
  ]);

  const handleCancel = useCallback(() => navigate('/transactions'), [navigate]);

  /** Save a new user-defined sub-category to Firestore and return its name */
  const onAddSubCategory = useCallback(async (
    parentCategory: string,
    name: string,
  ): Promise<string | null> => {
    try {
      const created = await TransactionFirebaseService.addDynamicCategory({
        type:           'subCategory',
        parentCategory,
        name,
        createdAt:      new Date().toISOString(),
      });
      setDynamicSubCategories(prev => [...prev, created]);
      toast.success(`Sub-category "${name}" saved`);
      return name;
    } catch {
      toast.error('Failed to save category');
      return null;
    }
  }, []);

  const onDeleteSubCategory = useCallback(async (id: string): Promise<void> => {
    try {
      await TransactionFirebaseService.deleteDynamicCategory(id);
      setDynamicSubCategories(prev => prev.filter(d => d.id !== id));
      toast.success('Category deleted');
    } catch {
      toast.error('Failed to delete category');
    }
  }, []);

  const onAddPLMainCategory = useCallback(async (name: string): Promise<string | null> => {
    try {
      const created = await TransactionFirebaseService.addDynamicCategory({
        type:      'plMainCategory',
        name:      name.trim(),
        createdAt: new Date().toISOString(),
      });
      setDynamicPLCategories(prev => [...prev, created]);
      toast.success(`P&L category "${name}" saved`);
      return name.trim();
    } catch {
      toast.error('Failed to save P&L category');
      return null;
    }
  }, []);

  const onAddPLSubCategory = useCallback(async (
    parentCategory: string,
    name: string,
  ): Promise<string | null> => {
    try {
      const created = await TransactionFirebaseService.addDynamicCategory({
        type:           'plSubCategory',
        parentCategory,
        name:           name.trim(),
        createdAt:      new Date().toISOString(),
      });
      setDynamicPLCategories(prev => [...prev, created]);
      toast.success(`P&L sub-category "${name}" saved`);
      return name.trim();
    } catch {
      toast.error('Failed to save P&L sub-category');
      return null;
    }
  }, []);

  const onDeletePLCategory = useCallback(async (id: string): Promise<void> => {
    try {
      await TransactionFirebaseService.deleteDynamicCategory(id);
      setDynamicPLCategories(prev => prev.filter(d => d.id !== id));
      toast.success('P&L category deleted');
    } catch {
      toast.error('Failed to delete P&L category');
    }
  }, []);

  const onAddBSMainCategory = useCallback(async (name: string): Promise<string | null> => {
    try {
      const created = await TransactionFirebaseService.addDynamicCategory({
        type:      'bsMainCategory',
        name:      name.trim(),
        createdAt: new Date().toISOString(),
      });
      setDynamicBSCategories(prev => [...prev, created]);
      toast.success(`Balance Sheet category "${name}" saved`);
      return name.trim();
    } catch {
      toast.error('Failed to save Balance Sheet category');
      return null;
    }
  }, []);

  const onAddBSSubCategory = useCallback(async (
    parentCategory: string,
    name: string,
  ): Promise<string | null> => {
    try {
      const created = await TransactionFirebaseService.addDynamicCategory({
        type:           'bsSubCategory',
        parentCategory,
        name:           name.trim(),
        createdAt:      new Date().toISOString(),
      });
      setDynamicBSCategories(prev => [...prev, created]);
      toast.success(`Balance Sheet sub-category "${name}" saved`);
      return name.trim();
    } catch {
      toast.error('Failed to save Balance Sheet sub-category');
      return null;
    }
  }, []);

  const onDeleteBSCategory = useCallback(async (id: string): Promise<void> => {
    try {
      await TransactionFirebaseService.deleteDynamicCategory(id);
      setDynamicBSCategories(prev => prev.filter(d => d.id !== id));
      toast.success('Balance Sheet category deleted');
    } catch {
      toast.error('Failed to delete Balance Sheet category');
    }
  }, []);

  /** Add a new company/branch to Firestore */
  const onAddCompany = useCallback(async (name: string): Promise<string | null> => {
    try {
      const created = await TransactionFirebaseService.addCompany(name);
      setCompanies(prev => [...prev, created]);
      toast.success(`Company "${name}" saved`);
      return created.id;
    } catch {
      toast.error('Failed to save company');
      return null;
    }
  }, []);

  const formatDateDisplay = useCallback((d: string) =>
    d ? new Date(d).toLocaleDateString('en-PK', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }) : '',
  []);

  return {
    office, date, transactionType, paymentMode, selectedBank,
    chequeNumber, chequeDate, chequeBank,
    setChequeNumber, setChequeDate, setChequeBank,
    enableMultiple, transactionItems,
    transactionId, isGeneratingId, isEditingId,
    setTransactionId, setIsEditingId,
    totalAmount:    totals.totalAmount,
    totalPaid:      totals.totalPaid,
    totalRemaining: totals.totalRemaining,
    currentBankBalance, remainingBalanceAfter,
    banks, isLoading, isSaving, isEditing: !!editingTx,
    setOffice, setDate, setTransactionType, setPaymentMode, setSelectedBank,
    setEnableMultiple, updateItem, addItem, removeItem,
    handleSave, handleCancel,
    manualDate, setManualDate,
    isPayableReceivable,
    formatCurrency: formatCurrencyLocal,
    formatDateDisplay,
    duplicateIdError, setDuplicateIdError,
    plMainCategory, plSubCategory, setPlMainCategory, setPlSubCategory,
    bsMainCategory, bsSubCategory, setBsMainCategory, setBsSubCategory,
    dynamicSubCategories, onAddSubCategory, onDeleteSubCategory,
    dynamicPLCategories, onAddPLMainCategory, onAddPLSubCategory, onDeletePLCategory,
    dynamicBSCategories, onAddBSMainCategory, onAddBSSubCategory, onDeleteBSCategory,
    companies, onAddCompany,
    currency, setCurrency, currencyOptions: SUPPORTED_CURRENCIES,
    currencyRates,
    // Sold Goods (supplier) Payment picker
    supplierPaymentInvoices,
    supplierPaymentInvoicesLoading,
    selectedSupplierInvoiceId,
    selectSupplierInvoice,
  };
}