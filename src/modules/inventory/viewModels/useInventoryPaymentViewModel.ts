// Inventory Module - ViewModel Layer
// useInventoryPaymentViewModel - Final step: payment & save to Firestore
// UPDATED:
//   - Reads `multiModels` from URL (without-costing path) as a single shipment
//   - Aggregates all models as one stock entry sharing one transaction ID
//   - Partial payments saved as pending payment record in Firestore
//   - Payment is also recorded as a cash/bank transaction (outflow)
//   - Transaction ID format: TXN-DDMMYY-###

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ProductFormData, CostingOption, BuyType, ProductStatus,
  InventoryEntryType, CostingInfo, CostingModel, CreateProductDTO,
} from '../models/types';
import { InventoryFirebaseService, generateInventoryTransactionId } from '../models/InventoryFirebaseService';
import { BankFirebaseService } from '../../banking/models/bankFirebaseService';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';
import { CashFirebaseService } from '../../banking/models/cashFirebaseService';
import { Bank } from '../../banking/models/types';
import { createTransactionFromInventory, TxCompany } from '../../transactions/models/TransactionBridgeService';

export const DEFAULT_INVENTORY_BRANCHES: string[] = [];
const COMPANY_PREFIX = 'Bullion Electronics - ';
export function makeInventoryBranchValue(branch: string): TxCompany {
  return `${COMPANY_PREFIX}${branch}` as TxCompany;
}
export function branchFromInventoryValue(value: string): string {
  return value.replace(COMPANY_PREFIX, '');
}

export type PaymentStatusType = 'paid' | 'unpaid' | 'partial';
export type PaymentMode = 'cash' | 'bank';
export type OwnershipType = 'Owned' | 'Credit';

export interface InstallmentEntry {
  id: string;
  mode: PaymentMode;
  bankId?: string;
  bankName?: string;
  amount: number;
  note?: string;
  date: string;
}

// ── Multi-model entry shape (from multi-model page URL params) ────────────────
export interface MultiModelPaymentEntry {
  modelName: string;
  costPrice: number;
  salePrice: number;
  quantity: number;
  category: string;
  status: string;
  location: string;
  dealerPrice?: number;
  description?: string;
  serialNumbers: string[];
  serialCities: { [k: string]: string };
}

export interface UseInventoryPaymentViewModelReturn {
  formData: Partial<ProductFormData>;
  costingOption: CostingOption;
  inventoryType: InventoryEntryType;
  totalAmount: number;
  paymentStatus: PaymentStatusType;
  transactionId: string;
  isGeneratingId: boolean;
  isEditingTransactionId: boolean;
  paidAmount: number;
  remainingAmount: number;
  validationErrors: { [key: string]: string };
  isValid: boolean;
  isSaving: boolean;

  ownershipType: OwnershipType;
  manualStockInDate: string;
  setManualStockInDate: (v: string) => void;

  paymentMode: PaymentMode;
  setPaymentMode: (mode: PaymentMode) => void;
  selectedBankId: string;
  setSelectedBankId: (id: string) => void;
  banks: Bank[];
  isBanksLoading: boolean;

  installments: InstallmentEntry[];
  addInstallment: () => void;
  removeInstallment: (id: string) => void;
  updateInstallment: (id: string, patch: Partial<InstallmentEntry>) => void;
  instalmentTotal: number;

  inventoryCompany: TxCompany;
  setInventoryCompany: (v: TxCompany) => void;
  inventoryBranches: string[];
  handleAddInventoryBranch: (name: string) => Promise<void>;

  setPaymentStatus: (status: PaymentStatusType) => void;
  setTransactionId: (id: string) => void;
  setIsEditingTransactionId: (v: boolean) => void;
  setPaidAmount: (value: number) => void;
  duplicateDialogOpen: boolean;
  setDuplicateDialogOpen: (open: boolean) => void;
  duplicateDialogMessage: string;
  setDuplicateDialogMessage: (message: string) => void;
  handleSubmit: () => void;
  handleBack: () => void;
  formatCurrency: (amount: number) => string;

  // Extended summary for multi-model display
  productSummary: {
    brandName: string; modelName: string; category: string;
    stock: number; sellPrice: number; status: string; inventoryType: string;
    location: string;
    totalValueOfBrand?: number; modelCount?: number;
  };
  // Multi-model entries (for the summary table)
  multiModelEntries: MultiModelPaymentEntry[];
  isMultiModel: boolean;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function generateFallbackTransactionId(): string {
  const now = new Date();
  const dd  = String(now.getDate()).padStart(2, '0');
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const yy  = String(now.getFullYear()).slice(-2);
  const counter = String(Math.floor(Math.random() * 900) + 100);
  return `TXN-${dd}${mm}${yy}-${counter}`;
}

// ── Save pending payment to Firestore ─────────────────────────────────────────
async function savePendingPayment(params: {
  transactionId: string;
  brandName: string;
  modelNames: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatusType;
  inventoryType: InventoryEntryType;
}) {
  if (params.paymentStatus === 'paid') return; // no pending record needed

  await addDoc(collection(db, 'pendingInventoryPayments'), {
    transactionId:   params.transactionId,
    brandName:       params.brandName,
    modelNames:      params.modelNames,
    totalAmount:     params.totalAmount,
    paidAmount:      params.paidAmount,
    remainingAmount: params.remainingAmount,
    paymentStatus:   params.paymentStatus,
    inventoryType:   params.inventoryType,
    createdAt:       serverTimestamp(),
    status:          'pending', // 'pending' | 'settled'
  });
}

export function useInventoryPaymentViewModel(): UseInventoryPaymentViewModelReturn {
  const navigate = useNavigate();
  const { formatCurrency: formatGlobalAmount } = useGlobalCurrency();
  const [searchParams] = useSearchParams();
  const [isSaving, setIsSaving]                       = useState(false);
  const [inventoryCompany, setInventoryCompany]         = useState<TxCompany>(makeInventoryBranchValue(DEFAULT_INVENTORY_BRANCHES[0] || 'Other') as TxCompany);
  const [inventoryBranches, setInventoryBranches]       = useState<string[]>(DEFAULT_INVENTORY_BRANCHES);
  const [isGeneratingId, setIsGeneratingId]           = useState(true);
  const [transactionId, setTransactionId]             = useState('');
  const [isEditingTransactionId, setIsEditingTransactionId] = useState(false);

  const [banks, setBanks]               = useState<Bank[]>([]);
  const [isBanksLoading, setIsBanksLoading] = useState(true);

  useEffect(() => {
    BankFirebaseService.fetchAllBanks()
      .then(setBanks)
      .catch(() => {})
      .finally(() => setIsBanksLoading(false));
    getDoc(doc(db, 'appConfig', 'branches'))
      .then(snap => {
        if (snap.exists()) {
          const saved = snap.data().list as string[] || [];
          setInventoryBranches([...new Set([...DEFAULT_INVENTORY_BRANCHES, ...saved])].sort());
        }
      })
      .catch(() => {});
  }, []);

  const [paymentMode, setPaymentMode]       = useState<PaymentMode>('cash');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [installments, setInstallments]     = useState<InstallmentEntry[]>([]);

  const addInstallment = useCallback(() => {
    setInstallments(prev => [...prev, {
      id: makeId(), mode: 'cash', amount: 0,
      date: new Date().toISOString().slice(0, 10), note: '',
    }]);
  }, []);

  const removeInstallment = useCallback((id: string) => {
    setInstallments(prev => prev.filter(e => e.id !== id));
  }, []);

  const updateInstallment = useCallback((id: string, patch: Partial<InstallmentEntry>) => {
    setInstallments(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  const instalmentTotal = useMemo(
    () => installments.reduce((s, e) => s + (e.amount || 0), 0),
    [installments]
  );

  // ── Parse URL params ────────────────────────────────────────────────────────
  const costingOption   = (searchParams.get('costing') as CostingOption)      || 'without';
  const inventoryType   = (searchParams.get('type')    as InventoryEntryType) || 'payment';
  const brandName       = searchParams.get('brandName')    || '';
  const modelName       = searchParams.get('modelName')    || '';
  const category        = searchParams.get('category')     || '';
  const sellPrice       = Number(searchParams.get('sellPrice'))     || 0;
  const buyType         = (searchParams.get('buyType') as BuyType)  || 'Import';
  const warrantyYears   = Number(searchParams.get('warrantyYears')) || 0;
  const stock           = Number(searchParams.get('stock'))         || 0;
  const description     = searchParams.get('description')  || '';
  const status          = (searchParams.get('status') as ProductStatus) || 'New';
  const isDamaged       = searchParams.get('isDamaged') === 'true';
  const location        = searchParams.get('location')     || '';
  const costPrice       = Number(searchParams.get('costPrice'))     || 0;
  const serialNumbers: string[]                = JSON.parse(searchParams.get('serialNumbers') || '[]');
  const serialCities:  { [k: string]: string } = JSON.parse(searchParams.get('serialCities')  || '{}');
  const costingBrandId = searchParams.get('costingBrandId') || '';

  // ── Multi-model entries (without-costing path) ────────────────────────────
  const multiModelEntries: MultiModelPaymentEntry[] = useMemo(
    () => JSON.parse(searchParams.get('multiModels') || '[]'),
    [searchParams]
  );
  const isMultiModel = multiModelEntries.length > 0;

  // ── With-costing selected models ──────────────────────────────────────────
  const selectedModels: Array<{
    modelId: string; modelName: string; costPrice: number; salePrice: number; quantity: number;
    serialNumbers?: string[]; serialCities?: { [k: string]: string };
  }> = JSON.parse(searchParams.get('selectedModels') || '[]');

  let costing: CostingInfo | undefined;
  if (costingOption === 'with') {
    const models: CostingModel[] = JSON.parse(searchParams.get('costingModels') || '[]');
    costing = {
      brandName:         searchParams.get('costingBrandName') || brandName,
      usdRate:           Number(searchParams.get('usdRate'))           || 0,
      totalCustomsValue: Number(searchParams.get('totalCustomsValue')) || 0,
      totalFreightValue: Number(searchParams.get('totalFreightValue')) || 0,
      models,
      totalUnitCostUSD:  Number(searchParams.get('totalUnitCostUSD'))  || 0,
      shipmentTotalUSD:  Number(searchParams.get('shipmentTotalUSD'))  || 0,
      consignmentValue:  Number(searchParams.get('consignmentValue'))  || 0,
      totalValueOfBrand: Number(searchParams.get('totalValueOfBrand')) || 0,
    };
  }

  const formData: Partial<ProductFormData> = {
    costingOption, brandName, modelName, category, sellPrice, buyType,
    warrantyYears, stock, description, status, isDamaged,
    location, serialNumbers, serialCities, costing,
  };

  // ── Generate transaction ID ────────────────────────────────────────────────
  useEffect(() => {
    const generate = async () => {
      setIsGeneratingId(true);
      try {
        const id = await generateInventoryTransactionId();
        setTransactionId(id);
      } catch {
        setTransactionId(generateFallbackTransactionId());
      } finally {
        setIsGeneratingId(false);
      }
    };
    generate();
  }, []);

  // Decided in Step 1 (Type Selection) — 'credit' or 'payment' — not re-asked here.
  const ownershipType: OwnershipType = inventoryType === 'credit' ? 'Credit' : 'Owned';
  const isCredit = ownershipType === 'Credit';

  // Optional manual stock-in date — if left blank, each serial gets the
  // creation timestamp automatically (existing service default behavior).
  const [manualStockInDate, setManualStockInDate] = useState<string>('');

  const [paymentStatus, setPaymentStatusState] = useState<PaymentStatusType>('paid');
  const [paidAmount, setPaidAmountState]       = useState(0);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateDialogMessage, setDuplicateDialogMessage] = useState('');

  // ── Total amount: multiModel path uses grandTotalCost; with costing uses costing.totalValueOfBrand ─
  const totalAmount = useMemo(() => {
    if (isMultiModel) {
      const fromParam = Number(searchParams.get('grandTotalCost')) || 0;
      if (fromParam > 0) return fromParam;
      return multiModelEntries.reduce((s, e) => s + e.costPrice * e.quantity, 0);
    }
    if (costingOption === 'with' && costing?.totalValueOfBrand) return costing.totalValueOfBrand;
    return sellPrice * stock;
  }, [isMultiModel, costingOption, costing?.totalValueOfBrand, sellPrice, stock, multiModelEntries, searchParams]);

  const remainingAmount = useMemo(() => Math.max(0, totalAmount - paidAmount), [totalAmount, paidAmount]);

  const setPaymentStatus = useCallback((s: PaymentStatusType) => {
    setPaymentStatusState(s);
    if (s === 'unpaid')    { setPaidAmountState(0); setInstallments([]); }
    else if (s === 'paid') { setPaidAmountState(totalAmount); setInstallments([]); }
    else                   { setPaidAmountState(0); }
  }, [totalAmount]);

  const setPaidAmount = useCallback((v: number) => setPaidAmountState(v), []);

  const formatCurrency = useCallback((amount: number) =>
    formatGlobalAmount(amount)
  , [formatGlobalAmount]);

  const validateForm = useCallback((): boolean => {
    const errors: { [key: string]: string } = {};
    if (!transactionId.trim()) errors.transactionId = 'Transaction ID is required';
    // Supplier-credit inventory has no payment yet — cost is settled later,
    // once the stock is sold — so payment-method/amount fields don't apply.
    if (!isCredit) {
      if (paymentStatus !== 'unpaid' && paymentMode === 'bank' && !selectedBankId)
        errors.bankId = 'Please select a bank account';
      if (paymentStatus === 'partial') {
        if (installments.length > 0) {
          installments.forEach((inst, i) => {
            if (inst.amount <= 0) errors[`inst_${i}`] = 'Amount must be > 0';
            if (inst.mode === 'bank' && !inst.bankId) errors[`inst_bank_${i}`] = 'Select a bank';
          });
        } else if (paidAmount <= 0) {
          errors.paidAmount = 'Paid amount must be greater than 0 for partial payments';
        }
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [isCredit, paymentStatus, paidAmount, transactionId, paymentMode, selectedBankId, installments]);

  const isValid = useMemo(() => {
    if (isGeneratingId) return false;
    if (!transactionId.trim()) return false;
    if (isCredit) return true;
    if (paymentStatus !== 'unpaid' && paymentMode === 'bank' && !selectedBankId) return false;
    if (paymentStatus === 'partial') {
      if (installments.length > 0) return installments.every(i => i.amount > 0 && (i.mode === 'cash' || !!i.bankId));
      return paidAmount > 0;
    }
    return true;
  }, [isCredit, paymentStatus, paidAmount, isGeneratingId, transactionId, paymentMode, selectedBankId, installments]);

  // ── Record payment activity ────────────────────────────────────────────────
  const modelDisplayName = isMultiModel
    ? multiModelEntries.map(e => e.modelName).join(', ')
    : (costingOption === 'with' && selectedModels.length > 0
        ? selectedModels.map(m => m.modelName).join(', ')
        : modelName);

  const recordPaymentActivity = useCallback(async (
    _effectivePaid: number,
    entries: Array<{ mode: PaymentMode; bankId?: string; bankName?: string; amount: number; note?: string; date: string; }>
  ) => {
    const today = new Date().toISOString().slice(0, 10);
    for (const entry of entries) {
      if (entry.mode === 'cash') {
        try {
          const cashRecord = await CashFirebaseService.getOrCreateCashForLocation(
            location || 'Head Office - Dubai'
          );
          await CashFirebaseService.addCashTransaction({
            date:          entry.date || today,
            company:       brandName,
            mainCategory:  'Inventory Purchase' as const,
            subCategory:   `${modelDisplayName} — ${transactionId}`,
            amount:        -entry.amount,
            mode:          'Cash',
            note:          entry.note || `Inventory payment — ${transactionId}`,
            location:      location || '',
            reference:     transactionId,
            inventoryId:   transactionId,
          });
        } catch (err) {
          console.error('Failed to record cash transaction:', err);
        }
      } else if (entry.mode === 'bank' && entry.bankId) {
        try {
          await BankFirebaseService.addBankTransaction({
            bankId:      entry.bankId,
            bankName:    entry.bankName || '',
            date:        entry.date || today,
            type:        'debit',
            amount:      entry.amount,
            description: `Inventory Purchase — ${brandName} ${modelDisplayName} [${transactionId}]`,
            reference:   transactionId,
            inventoryId: transactionId,
            category:    'Inventory',
            note:        entry.note || '',
          });
        } catch (err) {
          console.error('Failed to record bank transaction:', err);
        }
      }
    }
  }, [brandName, modelDisplayName, transactionId, location]);

  const buildPaymentEntries = useCallback((): Array<{
    mode: PaymentMode; bankId?: string; bankName?: string;
    amount: number; note?: string; date: string;
  }> => {
    const today = new Date().toISOString().slice(0, 10);
    if (paymentStatus === 'unpaid') return [];
    if (paymentStatus === 'partial' && installments.length > 0) {
      return installments.map(inst => ({
        mode:     inst.mode,
        bankId:   inst.bankId,
        bankName: inst.bankName || banks.find(b => b.id === inst.bankId)?.name,
        amount:   inst.amount,
        note:     inst.note,
        date:     inst.date || today,
      }));
    }
    const selectedBank = banks.find(b => b.id === selectedBankId);
    return [{
      mode:     paymentMode,
      bankId:   paymentMode === 'bank' ? selectedBankId : undefined,
      bankName: paymentMode === 'bank' ? selectedBank?.name : undefined,
      amount:   paymentStatus === 'paid' ? totalAmount : paidAmount,
      date:     today,
    }];
  }, [paymentStatus, paymentMode, selectedBankId, banks, paidAmount, totalAmount, installments]);

  // ── Save to Firestore ──────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    setIsSaving(true);

    try {
      // Supplier-credit inventory: nothing is paid at entry time, so there are
      // no cash/bank entries to record — the cost is settled later, once the
      // stock sells out, via the Inventory Payables screen.
      const entries       = isCredit ? [] : buildPaymentEntries();
      const effectivePaid = isCredit ? 0 : entries.reduce((s, e) => s + e.amount, 0);
      const selectedBank  = banks.find(b => b.id === selectedBankId);
      // Manual stock-in date override — blank means "auto" (service defaults
      // every serial to the creation timestamp).
      const manualDateIso = manualStockInDate ? new Date(manualStockInDate).toISOString() : undefined;
      const buildStockInDates = (serials: string[]) =>
        manualDateIso ? Object.fromEntries(serials.map(s => [s, manualDateIso])) : undefined;
      const paymentInfo   = isCredit
        ? { paymentStatus: 'unpaid' as const, transactionId, totalAmount }
        : {
            paymentStatus,
            transactionId:   paymentStatus !== 'unpaid' ? transactionId : undefined,
            paidAmount:      effectivePaid || undefined,
            totalAmount,
            paymentMode:     paymentStatus !== 'unpaid' ? paymentMode     : undefined,
            bankId:          (paymentMode === 'bank' && paymentStatus !== 'unpaid') ? selectedBankId   : undefined,
            bankName:        (paymentMode === 'bank' && paymentStatus !== 'unpaid') ? selectedBank?.name : undefined,
            installments:    installments.length > 0 ? installments : undefined,
          };

      // ── MULTI-MODEL PATH (without costing — multiple models at once) ────────
      if (isMultiModel) {
        for (const me of multiModelEntries) {
          const validSerials = (me.serialNumbers || []).filter((s: string) => s.trim() !== '');
          const smCities: { [k: string]: string } = { ...(me.serialCities || {}) };
          if (me.location) {
            validSerials.forEach((s: string) => { if (!smCities[s]) smCities[s] = me.location; });
          }
          const dto: CreateProductDTO = {
            brandName,
            modelName:    me.modelName,
            category:     me.category,
            costPrice:    me.costPrice,
            sellPrice:    me.salePrice,
            buyType:      'Import',
            warrantyYears: 0,
            stock:        me.quantity,
            location:     me.location,
            serialNumbers: validSerials,
            serialCities:  smCities,
            description:   me.description || '',
            status:        (me.status as ProductStatus) || 'New',
            isDamaged:     false,
            costingOption: 'without',
            costing:       undefined,
            ownershipType:         ownershipType,
            supplierCost:          isCredit ? me.costPrice * me.quantity : undefined,
            supplierPaymentStatus: isCredit ? 'Unpaid' : undefined,
            serialStockInDatesManual: buildStockInDates(validSerials),
            // Store dealer price in custom field if supported
            ...(me.dealerPrice ? { dealerPrice: me.dealerPrice } : {}),
          };
          try {
            await InventoryFirebaseService.createProduct(dto, paymentInfo);
          } catch (err) {
            if (err instanceof Error && err.message.toLowerCase().includes('duplicate')) {
              // Enrich message with model name so user knows which model blocked
              const serials = err.message.replace(/^duplicate serial numbers?:\s*/i, '').trim();
              throw new Error(`__DUPLICATE__MODEL:${me.modelName}|SERIALS:${serials}`);
            }
            throw err;
          }
        }
      }
      // ── WITH COSTING PATH ────────────────────────────────────────────────────
      else if (costingOption === 'with' && selectedModels.length > 0) {
        for (const sm of selectedModels) {
          const validSerials = (sm.serialNumbers || []).filter((s: string) => s.trim() !== '');
          const smSerialCities: { [k: string]: string } = { ...(sm.serialCities || {}) };
          if (location) {
            validSerials.forEach((s: string) => { if (!smSerialCities[s]) smSerialCities[s] = location; });
          }
          const dto: CreateProductDTO = {
            brandName, modelName: sm.modelName, category,
            costPrice: sm.costPrice, sellPrice: sm.salePrice, buyType, warrantyYears,
            stock: sm.quantity, location,
            serialNumbers: validSerials, serialCities: smSerialCities,
            description, status, isDamaged,
            costingOption: 'with', costing,
            ownershipType:         ownershipType,
            supplierCost:          isCredit ? sm.costPrice * sm.quantity : undefined,
            supplierPaymentStatus: isCredit ? 'Unpaid' : undefined,
            serialStockInDatesManual: buildStockInDates(validSerials),
          };
          try {
            await InventoryFirebaseService.createProduct(dto, paymentInfo);
          } catch (err) {
            if (err instanceof Error && err.message.toLowerCase().includes('duplicate')) {
              const serials = err.message.replace(/^duplicate serial numbers?:\s*/i, '').trim();
              throw new Error(`__DUPLICATE__MODEL:${sm.modelName}|SERIALS:${serials}`);
            }
            throw err;
          }
        }
      }
      // ── SINGLE PRODUCT PATH ──────────────────────────────────────────────────
      else {
        const seededCities: { [k: string]: string } = { ...serialCities };
        if (location) {
          serialNumbers.forEach(s => { if (!seededCities[s]) seededCities[s] = location; });
        }
        const dto: CreateProductDTO = {
          brandName, modelName, category, costPrice, sellPrice, buyType, warrantyYears,
          stock, location, serialNumbers, serialCities: seededCities,
          description, status, isDamaged,
          costingOption: costingOption === 'with' ? 'with' : 'without',
          costing:       costingOption === 'with' ? costing : undefined,
          ownershipType:         ownershipType,
          supplierCost:          isCredit ? costPrice * stock : undefined,
          supplierPaymentStatus: isCredit ? 'Unpaid' : undefined,
          serialStockInDatesManual: buildStockInDates(serialNumbers),
        };
        await InventoryFirebaseService.createProduct(dto, paymentInfo);
      }

      // ── Record payment transactions — supplier-credit inventory has no
      // cash/bank movement at entry time, so skip entirely ──────────────────
      if (!isCredit && entries.length > 0) {
        await recordPaymentActivity(effectivePaid, entries);
      }

      // ── Save pending payment record if partial/unpaid (not applicable to
      // supplier-credit inventory — that's tracked via Inventory Payables) ──
      if (!isCredit && paymentStatus !== 'paid') {
        await savePendingPayment({
          transactionId,
          brandName,
          modelNames: isMultiModel
            ? multiModelEntries.map(e => e.modelName).join(', ')
            : (costingOption === 'with' && selectedModels.length > 0
                ? selectedModels.map(m => m.modelName).join(', ')
                : modelName),
          totalAmount,
          paidAmount:      effectivePaid,
          remainingAmount: Math.max(0, totalAmount - effectivePaid),
          paymentStatus,
          inventoryType,
        });
      }

      // ── Create transaction record (non-blocking) — skipped for supplier
      // credit since no cash/bank transaction actually happened ─────────────
      if (!isCredit) {
        createTransactionFromInventory({
          transactionId,
          brandName,
          modelName: modelDisplayName,
          date:      new Date().toISOString().split('T')[0],
          totalAmount,
          paidAmount:   effectivePaid,
          paymentStatus,
          paymentMode,
          bankId:   paymentMode === 'bank' ? selectedBankId : undefined,
          bankName: paymentMode === 'bank' ? banks.find(b => b.id === selectedBankId)?.name : undefined,
          installments: installments.length > 0 ? installments : undefined,
          company: inventoryCompany,
        }).catch(err => console.warn('[TxBridge] Inventory transaction failed (non-blocking):', err));
      }

      const successMsg = isCredit
        ? `✅ Inventory added on supplier credit — payable once sold out — ${transactionId}`
        : paymentStatus === 'partial'
          ? `✅ Inventory added — ${formatCurrency(totalAmount - effectivePaid)} pending — ${transactionId}`
          : paymentStatus === 'unpaid'
            ? `✅ Inventory added (unpaid) — ${transactionId}`
            : `✅ Inventory added — ${transactionId}`;

      toast.success(successMsg);
      navigate('/inventory/view');

    } catch (error) {
      console.error('Error saving product:', error);
      const rawMessage = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error, Object.getOwnPropertyNames(error) || undefined);

      if (rawMessage.toLowerCase().includes('duplicate') || rawMessage.startsWith('__DUPLICATE__')) {
        // Reset isSaving immediately so the UI unfreezes before the dialog opens.
        // The finally block will also set it false, which is harmless.
        setIsSaving(false);
        // Parse enriched format: __DUPLICATE__MODEL:<name>|SERIALS:<serials>
        let userMessage: string;
        if (rawMessage.startsWith('__DUPLICATE__')) {
          const modelMatch  = rawMessage.match(/MODEL:([^|]+)/);
          const serialMatch = rawMessage.match(/SERIALS:(.+)$/);
          const modelLabel  = modelMatch  ? ` for model "${modelMatch[1].trim()}"` : '';
          const serialList  = serialMatch ? serialMatch[1].trim() : '';
          const serialsFormatted = serialList
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => '• ' + s)
            .join('\n');
          userMessage = 'The following serial number' + (serialList.includes(',') ? 's are' : ' is') + ' already registered in the system' + modelLabel + ':\n\n' + serialsFormatted + '\n\nPlease check your inventory — this item may have already been added. Remove or replace the duplicate serial number(s) before submitting.';
        } else {
          // Simple serial duplicate from single-product path
          const serialsRaw = rawMessage.replace(/^duplicate serial numbers?:\s*/i, '').trim();
          const serialsFormatted = serialsRaw
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => '• ' + s)
            .join('\n');
          userMessage = 'The following serial number' + (serialsRaw.includes(',') ? 's are' : ' is') + ' already registered in the system:\n\n' + serialsFormatted + '\n\nPlease check your inventory — this item may have already been added. Remove or replace the duplicate serial number(s) before submitting.';
        }
        setDuplicateDialogMessage(userMessage);
        setDuplicateDialogOpen(true);
      } else {
        toast.error('Failed to save product. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    validateForm, isMultiModel, multiModelEntries, costingOption, selectedModels,
    brandName, modelName, category, costPrice, sellPrice, buyType, warrantyYears, stock,
    description, status, isDamaged, serialNumbers, serialCities, inventoryType, costing,
    paymentStatus, transactionId, paidAmount, totalAmount, navigate, location,
    paymentMode, selectedBankId, banks, installments, buildPaymentEntries,
    recordPaymentActivity, inventoryCompany, modelDisplayName, formatCurrency, costingBrandId,
    isCredit, ownershipType, manualStockInDate,
  ]);

  const handleBack = useCallback(() => {
    if (isMultiModel) {
      // Back to multi-model page
      const params = new URLSearchParams({
        type:    inventoryType,
        costing: 'without',
        brandName,
      });
      navigate(`/inventory/create-new/multi-models?${params.toString()}`);
      return;
    }
    const params = new URLSearchParams({
      type: inventoryType, costing: costingOption, brandName, modelName,
      category, costPrice: costPrice.toString(), sellPrice: sellPrice.toString(), buyType,
      warrantyYears: warrantyYears.toString(), stock: stock.toString(),
      description, status, isDamaged: isDamaged.toString(),
      location,
      serialNumbers: JSON.stringify(serialNumbers),
      serialCities:  JSON.stringify(serialCities),
    });
    if (costingBrandId) params.set('costingBrandId', costingBrandId);
    if (costingOption === 'with' && costing) {
      params.set('usdRate',           costing.usdRate.toString());
      params.set('totalCustomsValue', costing.totalCustomsValue.toString());
      params.set('totalFreightValue', costing.totalFreightValue.toString());
      params.set('shipmentTotalUSD',  costing.shipmentTotalUSD.toString());
      params.set('consignmentValue',  costing.consignmentValue.toString());
      params.set('totalValueOfBrand', costing.totalValueOfBrand.toString());
      params.set('totalUnitCostUSD',  costing.totalUnitCostUSD.toString());
      params.set('costingModels',     JSON.stringify(costing.models));
      params.set('costingBrandName',  costing.brandName);
    }
    params.set('selectedModels', JSON.stringify(selectedModels));
    navigate(`/inventory/create-new/details?${params.toString()}`);
  }, [
    navigate, isMultiModel, inventoryType, costingOption, brandName, modelName,
    category, sellPrice, buyType, warrantyYears, stock, description, status,
    isDamaged, location, serialNumbers, serialCities, costing, selectedModels, costingBrandId, costPrice,
  ]);

  // ── Product summary ────────────────────────────────────────────────────────
  const productSummary = useMemo(() => {
    if (isMultiModel) {
      const totalUnits = multiModelEntries.reduce((s, e) => s + e.quantity, 0);
      const avgSell    = multiModelEntries.length
        ? multiModelEntries.reduce((s, e) => s + e.salePrice, 0) / multiModelEntries.length
        : 0;
      return {
        brandName,
        modelName: `${multiModelEntries.length} models`,
        category:  multiModelEntries[0]?.category || '',
        stock:     totalUnits,
        sellPrice: avgSell,
        status:    multiModelEntries[0]?.status || 'New',
        inventoryType,
        location:  multiModelEntries[0]?.location || '',
        modelCount: multiModelEntries.length,
      };
    }
    return {
      brandName, modelName, category, stock, sellPrice, status, inventoryType,
      location,
      totalValueOfBrand: costingOption === 'with' ? costing?.totalValueOfBrand : undefined,
      modelCount:        costingOption === 'with' ? costing?.models.length      : undefined,
    };
  }, [brandName, modelName, category, stock, sellPrice, status, inventoryType, costingOption, costing, location, isMultiModel, multiModelEntries]);

  const handleAddInventoryBranch = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = [...new Set([...inventoryBranches, trimmed])].sort();
    setInventoryBranches(updated);
    setInventoryCompany(makeInventoryBranchValue(trimmed));
    try {
      await setDoc(doc(db, 'appConfig', 'branches'), { list: updated }, { merge: true });
    } catch (err) {
      console.error('[Branch] Save failed:', err);
    }
  }, [inventoryBranches]);

  return {
    formData, costingOption, inventoryType, totalAmount,
    ownershipType,
    manualStockInDate, setManualStockInDate,
    paymentStatus, transactionId, isGeneratingId,
    isEditingTransactionId, setIsEditingTransactionId,
    paidAmount, remainingAmount,
    validationErrors, isValid, isSaving,
    paymentMode, setPaymentMode,
    selectedBankId, setSelectedBankId,
    banks, isBanksLoading,
    installments, addInstallment, removeInstallment, updateInstallment, instalmentTotal,
    inventoryCompany, setInventoryCompany,
    inventoryBranches, handleAddInventoryBranch,
    setPaymentStatus, setTransactionId, setPaidAmount,
    duplicateDialogOpen, setDuplicateDialogOpen, duplicateDialogMessage, setDuplicateDialogMessage,
    handleSubmit, handleBack, formatCurrency, productSummary,
    multiModelEntries, isMultiModel,
  };
}