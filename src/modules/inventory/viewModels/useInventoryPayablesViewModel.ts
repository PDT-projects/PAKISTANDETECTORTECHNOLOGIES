// Inventory Module - ViewModel Layer
// useInventoryPayablesViewModel
// Lists supplier-credit inventory with an outstanding balance and lets the
// user record a payment against it — deducting from the chosen bank account
// or cash liquidity, exactly like the main inventory Payment step does.

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Product } from '../models/types';
import { InventoryFirebaseService } from '../models/InventoryFirebaseService';
import { BankFirebaseService } from '../../banking/models/bankFirebaseService';
import { CashFirebaseService } from '../../banking/models/cashFirebaseService';
import { Bank } from '../../banking/models/types';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

export interface UseInventoryPayablesViewModelReturn {
  records: Product[];
  filteredRecords: Product[];
  isLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  totalPayable: number;
  totalFuturePayable: number;
  payProduct: Product | null;
  setPayProduct: (p: Product | null) => void;
  payAmount: number;
  setPayAmount: (v: number) => void;
  payChannel: 'Cash' | 'Bank';
  setPayChannel: (v: 'Cash' | 'Bank') => void;
  banks: Bank[];
  isBanksLoading: boolean;
  selectedBankId: string;
  setSelectedBankId: (v: string) => void;
  isSubmittingPayment: boolean;
  paymentError: string | null;
  handleRecordPayment: () => Promise<void>;
  formatCurrency: (n?: number) => string;
  onBack: () => void;
}

export function useInventoryPayablesViewModel(): UseInventoryPayablesViewModelReturn {
  const navigate = useNavigate();
  const { formatCurrency: formatGlobalAmount } = useGlobalCurrency();
  const [records, setRecords]   = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');

  const [payProduct, setPayProductState] = useState<Product | null>(null);
  const [payAmount, setPayAmount]        = useState(0);
  const [payChannel, setPayChannel]      = useState<'Cash' | 'Bank'>('Cash');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [banks, setBanks] = useState<Bank[]>([]);
  const [isBanksLoading, setIsBanksLoading] = useState(true);

  useEffect(() => {
    BankFirebaseService.fetchAllBanks()
      .then(setBanks)
      .catch(() => setBanks([]))
      .finally(() => setIsBanksLoading(false));
  }, []);

  const load = useCallback(() => {
    setIsLoading(true);
    InventoryFirebaseService.fetchPayableProducts()
      .then(setRecords)
      .catch(e => setError(e.message || 'Failed to load inventory payables'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const s = search.toLowerCase();
    return records.filter(r =>
      r.brandName.toLowerCase().includes(s) || r.modelName.toLowerCase().includes(s)
    );
  }, [records, search]);

  const totalPayable = useMemo(
    () => records
      .filter(r => (r.stock ?? 0) === 0)
      .reduce((sum, r) => sum + Math.max(0, (r.supplierCost || 0) - (r.supplierPaidAmount || 0)), 0),
    [records]
  );
  const totalFuturePayable = useMemo(
    () => records
      .filter(r => (r.stock ?? 0) > 0)
      .reduce((sum, r) => sum + Math.max(0, (r.supplierCost || 0) - (r.supplierPaidAmount || 0)), 0),
    [records]
  );

  const setPayProduct = useCallback((p: Product | null) => {
    setPayProductState(p);
    setPayAmount(p ? Math.max(0, (p.supplierCost || 0) - (p.supplierPaidAmount || 0)) : 0);
    setPayChannel('Cash');
    setSelectedBankId('');
    setPaymentError(null);
  }, []);

  const handleRecordPayment = useCallback(async () => {
    if (!payProduct || payAmount <= 0) { toast.error('Enter a valid payment amount'); return; }
    if (payChannel === 'Bank' && !selectedBankId) { setPaymentError('Please select a bank account'); return; }
    setPaymentError(null);
    setIsSubmittingPayment(true);
    const reference = `SUP-PAY-${payProduct.id}-${Date.now()}`;
    const label = `${payProduct.brandName} ${payProduct.modelName}`;
    try {
      // 1) Update the product's supplier-payment status/paid amount
      await InventoryFirebaseService.recordSupplierPayment(payProduct.id, payAmount, payChannel);

      // 2) Deduct from the chosen liquidity source, same mechanism the main
      //    inventory Payment step uses for bank/cash purchase payments.
      if (payChannel === 'Cash') {
        await CashFirebaseService.getOrCreateCashForLocation(payProduct.location || 'Head Office - Dubai');
        await CashFirebaseService.addCashTransaction({
          date:         new Date().toISOString().slice(0, 10),
          company:      payProduct.brandName,
          mainCategory: 'Inventory Purchase' as const,
          subCategory:  `Supplier Payable — ${label}`,
          amount:       -payAmount,
          mode:         'Cash',
          note:         `Supplier credit payment — ${label}`,
          location:     payProduct.location || '',
          reference,
          inventoryId:  payProduct.id,
        });
      } else {
        const bank = banks.find(b => b.id === selectedBankId);
        await BankFirebaseService.addBankTransaction({
          bankId:      selectedBankId,
          bankName:    bank?.name || '',
          date:        new Date().toISOString().slice(0, 10),
          type:        'debit',
          amount:      payAmount,
          description: `Supplier Payable — ${label}`,
          reference,
          inventoryId: payProduct.id,
          category:    'Inventory',
          note:        `Supplier credit payment`,
        });
      }

      toast.success(`Payment of ${formatCurrency(payAmount)} recorded for ${label}`);
      setPayProductState(null);
      load();
    } catch (err) {
      console.error('Failed to record supplier payment:', err);
      toast.error('Failed to record payment');
    } finally {
      setIsSubmittingPayment(false);
    }
  }, [payProduct, payAmount, payChannel, selectedBankId, banks, load]);

  const formatCurrency = useCallback((n?: number) =>
    n === undefined ? '—' : formatGlobalAmount(n)
  , [formatGlobalAmount]);

  const onBack = useCallback(() => navigate('/inventory'), [navigate]);

  return {
    records, filteredRecords, isLoading, error, search, setSearch, totalPayable, totalFuturePayable,
    payProduct, setPayProduct, payAmount, setPayAmount, payChannel, setPayChannel,
    banks, isBanksLoading, selectedBankId, setSelectedBankId,
    isSubmittingPayment, paymentError, handleRecordPayment, formatCurrency, onBack,
  };
}