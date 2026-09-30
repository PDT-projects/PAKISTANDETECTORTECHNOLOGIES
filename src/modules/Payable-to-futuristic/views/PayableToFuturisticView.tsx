// views/PayableToFuturisticView.tsx
//
// CHANGES:
//  1. ManualEntryModal — fixed model dropdown to always render correctly;
//     added AED/USD amount toggle; improved form validation messaging.
//  2. PaymentModal — replaced notes-only form with full Bank / Cash selector.
//     Shows live account balances fetched from Firestore. On submit, the
//     chosen account balance is atomically deducted via recordPayment().
//  3. All bank accounts and cash accounts are loaded by usePayableToFuturistic
//     and passed down as props so they are shared without duplicate fetches.

import React, { useState } from 'react';
import {
  Building2, RefreshCw, AlertCircle, Loader2,
  DollarSign, ChevronDown, ChevronRight, Package,
  FileText, MapPin, Plus, X, CreditCard, CheckCircle2,
  Banknote, Wallet, Info, Pencil,
} from 'lucide-react';
import { usePayableToFuturistic } from '../viewModels/usePayableToFuturistic';
import { InventoryPayableConfigPanel } from './InventoryPayableConfigPanel';
import type {
  InvoicePayableSummary,
  DerivedPayable,
  BankAccount,
  CashAccount,
} from '../viewModels/usePayableToFuturistic';
import type { Currency } from '../models/payableToFuturistic';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';
import {
  CURRENCY_SYMBOLS,
  FUTURISTIC_PRICES_USD,
  aedToAllCurrencies,
} from '../models/payableToFuturistic';

const ALL_CURRENCIES: Currency[] = ['AED'];
const FUTURISTIC_MODELS = Object.keys(FUTURISTIC_PRICES_USD);

// 1 USD = 3.67 AED (matches payableToFuturistic.ts USD_EXCHANGE_RATES.AED)
const USD_TO_AED = 3.67;

type CurrKey = 'aed' | 'pkr' | 'sar' | 'usd';
function currKey(c: Currency): CurrKey { return c.toLowerCase() as CurrKey; }

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
}

const S = {
  charcoal:     { backgroundColor: '#1e293b', color: '#ffffff' } as React.CSSProperties,
  charcoalCard: { backgroundColor: '#1e293b', color: '#ffffff', border: '1px solid #334155' } as React.CSSProperties,
  tabActive:    { backgroundColor: '#1e293b', color: '#ffffff' } as React.CSSProperties,
  tabInactive:  { backgroundColor: 'transparent', color: '#64748b' } as React.CSSProperties,
  toggleBtn:    { backgroundColor: '#1e293b', color: '#ffffff', width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } as React.CSSProperties,
};

const STATUS_CFG = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  partial: { label: 'Partial', cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  paid:    { label: 'Paid',    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
};
function StatusBadge({ status }: { status: 'pending' | 'partial' | 'paid' }) {
  const { label, cls } = STATUS_CFG[status];
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

// ── Overlay backdrop ──────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── Manual Entry Modal ────────────────────────────────────────────────────────
interface ManualEntryModalProps {
  onClose:  () => void;
  onSubmit: (payload: {
    modelName: string; description: string; amountAed: number;
    dueDate: string; notes?: string; location?: string;
  }) => Promise<void>;
  loading: boolean;
}

function ManualEntryModal({ onClose, onSubmit, loading }: ManualEntryModalProps) {
  const [modelName,    setModelName]    = useState('');
  const [customModel,  setCustomModel]  = useState('');
  const [amountInput,  setAmountInput]  = useState('');
  const [amountCurr,   setAmountCurr]   = useState<'AED' | 'USD'>('AED');
  const [description,  setDescription]  = useState('');
  const [dueDate,      setDueDate]      = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [notes,    setNotes]    = useState('');
  const [location, setLocation] = useState('');
  const [error,    setError]    = useState('');

  const isCustom     = modelName === '__custom__';
  const resolvedName = isCustom ? customModel.trim() : modelName;

  // Suggested USD price for known models
  const suggestedUsd = !isCustom && modelName && modelName !== '' ? FUTURISTIC_PRICES_USD[modelName] : null;

  // Computed AED from input
  const rawInput = parseFloat(amountInput);
  const computedAed: number | null = (!isNaN(rawInput) && rawInput > 0)
    ? (amountCurr === 'USD' ? parseFloat((rawInput * USD_TO_AED).toFixed(2)) : rawInput)
    : null;

  // Auto-fill when model changes
  function handleModelChange(val: string) {
    setModelName(val);
    setError('');
    if (val && val !== '__custom__') {
      setDescription(`${val} — Futuristic payable`);
      if (FUTURISTIC_PRICES_USD[val]) {
        // Auto-fill in whichever currency is selected
        if (amountCurr === 'USD') {
          setAmountInput(String(FUTURISTIC_PRICES_USD[val]));
        } else {
          setAmountInput((FUTURISTIC_PRICES_USD[val] * USD_TO_AED).toFixed(2));
        }
      }
    } else if (val === '__custom__') {
      setDescription('');
      setAmountInput('');
    }
  }

  // When currency toggle changes, convert existing input
  function handleCurrencyToggle(c: 'AED' | 'USD') {
    if (c === amountCurr) return;
    const v = parseFloat(amountInput);
    if (!isNaN(v) && v > 0) {
      if (c === 'USD') {
        // was AED → convert to USD
        setAmountInput((v / USD_TO_AED).toFixed(2));
      } else {
        // was USD → convert to AED
        setAmountInput((v * USD_TO_AED).toFixed(2));
      }
    }
    setAmountCurr(c);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!resolvedName) { setError('Please select or enter a model name.'); return; }
    if (!computedAed || computedAed <= 0) {
      setError(`Enter a valid ${amountCurr} amount greater than 0.`);
      return;
    }
    if (!dueDate) { setError('Please set a due date.'); return; }

    try {
      await onSubmit({
        modelName:   resolvedName,
        description: description.trim() || `${resolvedName} — Futuristic payable`,
        amountAed:   computedAed,
        dueDate,
        notes:    notes.trim()    || undefined,
        location: location.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save entry.');
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl w-full mx-4 overflow-y-auto" style={{ minWidth: 380, maxWidth: 460, maxHeight: '90vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <div style={{ ...S.charcoal, padding: 8, borderRadius: 10 }}>
            <Plus size={16} color="#fff" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-800">Add Manual Payable</h2>
            <p className="text-xs text-gray-500">Record a Futuristic product payable</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

        {/* Model / Product */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Futuristic Model <span className="text-red-400">*</span>
          </label>
          <select
            value={modelName}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
          >
            <option value="">— Select a model —</option>
            {FUTURISTIC_MODELS.map((m) => (
              <option key={m} value={m}>{m} (${FUTURISTIC_PRICES_USD[m]})</option>
            ))}
            <option value="__custom__">Other / Custom model…</option>
          </select>
          {isCustom && (
            <input
              type="text"
              placeholder="Enter model name"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
            />
          )}
          {suggestedUsd && (
            <p className="mt-1.5 text-xs text-blue-600 flex items-center gap-1">
              <CheckCircle2 size={11} />
              Standard price: <strong>${suggestedUsd}</strong> = <strong>AED {fmt(suggestedUsd * USD_TO_AED)}</strong>
            </p>
          )}
        </div>

        {/* Amount with AED / USD toggle */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Amount <span className="text-red-400">*</span>
          </label>

          {/* Currency toggle */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500">Currency:</span>
            <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-lg">
              {(['AED', 'USD'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleCurrencyToggle(c)}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all"
                  style={
                    amountCurr === c
                      ? { backgroundColor: '#1e293b', color: '#fff' }
                      : { backgroundColor: 'transparent', color: '#64748b' }
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
              {amountCurr === 'USD' ? '$' : 'AED'}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full border border-gray-200 rounded-xl pl-12 pr-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
            />
          </div>

          {/* Conversion preview */}
          {computedAed !== null && (
            <div className="mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex flex-wrap gap-3 items-center">
              <span className="text-xs font-semibold text-slate-700">
                Stored as: AED {fmt(computedAed)}
              </span>
              {(() => {
                const c = aedToAllCurrencies(computedAed);
                return (['PKR', 'SAR', 'USD'] as const).map((sym) => (
                  <span key={sym} className="text-xs text-gray-500 bg-white border border-gray-100 rounded px-2 py-0.5">
                    {sym} {fmt(c[sym.toLowerCase() as 'pkr' | 'sar' | 'usd'])}
                  </span>
                ));
              })()}
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Description</label>
          <input
            type="text"
            placeholder="e.g. Tgx Pro — Invoice #1042"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
          />
        </div>

        {/* Due Date + Location */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Due Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Location</label>
            <input
              type="text"
              placeholder="e.g. Dubai"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Notes</label>
          <textarea
            rows={2}
            placeholder="Optional notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition resize-none"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={S.charcoal}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Save Entry
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────────────
interface PaymentModalProps {
  item:         DerivedPayable;
  bankAccounts: BankAccount[];
  cashAccounts: CashAccount[];
  accountsLoading: boolean;
  onClose:  () => void;
  onSubmit: (
    firestoreId:  string,
    paidAed:      number,
    notes:        string,
    paymentMethod: 'bank' | 'cash',
    bankAccountId?: string,
    cashAccountId?: string,
  ) => Promise<void>;
  loading: boolean;
}

function PaymentModal({
  item, bankAccounts, cashAccounts, accountsLoading,
  onClose, onSubmit, loading,
}: PaymentModalProps) {
  const remainingAed = item.amounts.aed - item.paidAmounts.aed;

  const [paidAed,       setPaidAed]       = useState(remainingAed.toFixed(2));
  const [notes,         setNotes]         = useState(item.notes ?? '');
  const [payMethod,     setPayMethod]     = useState<'bank' | 'cash'>('bank');
  const [bankAccountId, setBankAccountId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [error,         setError]         = useState('');

  // Selected account balance for sanity check
  const selectedBank = bankAccounts.find((b) => b.id === bankAccountId);
  const selectedCash = cashAccounts.find((c) => c.id === cashAccountId);
  const selectedBalance = payMethod === 'bank' ? selectedBank?.balance : selectedCash?.balance;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const amt = parseFloat(paidAed);
    if (!paidAed || isNaN(amt) || amt <= 0) { setError('Enter a valid amount.'); return; }
    if (amt > remainingAed + 0.01)           { setError(`Max payable is AED ${fmt(remainingAed)}.`); return; }
    if (payMethod === 'bank' && !bankAccountId) { setError('Please select a bank account.'); return; }
    if (payMethod === 'cash' && cashAccounts.length > 0 && !cashAccountId) { setError('Please select a cash account.'); return; }

    if (selectedBalance !== undefined && amt > selectedBalance + 0.01) {
      setError(`Insufficient balance. ${payMethod === 'bank' ? selectedBank?.accountName : selectedCash?.name} only has AED ${fmt(selectedBalance)}.`);
      return;
    }

    try {
      await onSubmit(
        item.firestoreId,
        amt,
        notes.trim(),
        payMethod,
        payMethod === 'bank' ? bankAccountId : undefined,
        payMethod === 'cash' ? (cashAccountId || undefined) : undefined,
      );
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to record payment.');
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl w-full mx-4 overflow-y-auto" style={{ minWidth: 360, maxWidth: 440, maxHeight: '90vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <div style={{ backgroundColor: '#059669', padding: 8, borderRadius: 10 }}>
            <CreditCard size={16} color="#fff" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-800">Record Payment</h2>
            <p className="text-xs text-gray-500 max-w-xs truncate">{item.description}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

        {/* Summary strip */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Total</p>
            <p className="text-sm font-bold text-gray-800">AED {fmt(item.amounts.aed)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Paid</p>
            <p className="text-sm font-bold text-emerald-600">AED {fmt(item.paidAmounts.aed)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Remaining</p>
            <p className="text-sm font-bold text-amber-600">AED {fmt(remainingAed)}</p>
          </div>
        </div>

        {/* Amount paid */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Amount Paid ({getGlobalCurrencySymbol()}) <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">AED</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={remainingAed}
              value={paidAed}
              onChange={(e) => setPaidAed(e.target.value)}
              className="w-full border border-gray-200 rounded-xl pl-12 pr-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition"
            />
          </div>
          {/* Quick-fill buttons */}
          <div className="flex gap-2 mt-1.5">
            <button
              type="button"
              onClick={() => setPaidAed(remainingAed.toFixed(2))}
              className="text-xs px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition"
            >
              Full amount
            </button>
            <button
              type="button"
              onClick={() => setPaidAed((remainingAed / 2).toFixed(2))}
              className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100 transition"
            >
              Half
            </button>
          </div>
        </div>

        {/* Payment method toggle */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
            Pay From <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPayMethod('bank')}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition"
              style={
                payMethod === 'bank'
                  ? { backgroundColor: '#1e293b', color: '#fff', borderColor: '#1e293b' }
                  : { backgroundColor: '#f8fafc', color: '#475569', borderColor: '#e2e8f0' }
              }
            >
              <Banknote size={15} /> Bank Account
            </button>
            <button
              type="button"
              onClick={() => setPayMethod('cash')}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition"
              style={
                payMethod === 'cash'
                  ? { backgroundColor: '#1e293b', color: '#fff', borderColor: '#1e293b' }
                  : { backgroundColor: '#f8fafc', color: '#475569', borderColor: '#e2e8f0' }
              }
            >
              <Wallet size={15} /> Cash
            </button>
          </div>
        </div>

        {/* Bank account selector */}
        {payMethod === 'bank' && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Bank Account <span className="text-red-400">*</span>
            </label>
            {accountsLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                <Loader2 size={13} className="animate-spin" /> Loading accounts…
              </div>
            ) : bankAccounts.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Info size={13} />
                No bank accounts found. Add them in the Bank module first.
              </div>
            ) : (
              <>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
                >
                  <option value="">— Select bank account —</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.accountName}{b.bankName ? ` · ${b.bankName}` : ''} — {b.currency} {fmt(b.balance)}
                    </option>
                  ))}
                </select>
                {selectedBank && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs bg-blue-50 border border-blue-100 text-blue-700 rounded-lg px-3 py-1.5">
                    <Banknote size={12} />
                    <span>
                      <strong>{selectedBank.accountName}</strong>
                      {' '}&mdash; Balance: <strong>{selectedBank.currency} {fmt(selectedBank.balance)}</strong>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Cash account selector */}
        {payMethod === 'cash' && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Cash Account
            </label>
            {accountsLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                <Loader2 size={13} className="animate-spin" /> Loading…
              </div>
            ) : cashAccounts.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Info size={13} />
                No cash accounts configured — payment will be recorded without balance deduction.
              </div>
            ) : (
              <>
                <select
                  value={cashAccountId}
                  onChange={(e) => setCashAccountId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
                >
                  <option value="">— Select cash account —</option>
                  {cashAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.currency} {fmt(c.balance)}
                    </option>
                  ))}
                </select>
                {selectedCash && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-lg px-3 py-1.5">
                    <Wallet size={12} />
                    <span>
                      <strong>{selectedCash.name}</strong>
                      {' '}&mdash; Balance: <strong>{selectedCash.currency} {fmt(selectedCash.balance)}</strong>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Notes</label>
          <textarea
            rows={2}
            placeholder="Payment reference, cheque number, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition resize-none"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60"
            style={{ backgroundColor: '#059669', color: '#ffffff' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Record Payment
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Edit Amount Modal ─────────────────────────────────────────────────────────
interface EditAmountModalProps {
  item:     DerivedPayable;
  onClose:  () => void;
  onSubmit: (firestoreId: string, newAmountAed: number) => Promise<void>;
  loading:  boolean;
}

function EditAmountModal({ item, onClose, onSubmit, loading }: EditAmountModalProps) {
  const [amountCurr, setAmountCurr] = useState<'AED' | 'USD'>('AED');
  const [amountInput, setAmountInput] = useState(item.amounts.aed.toFixed(2));
  const [error, setError] = useState('');

  const rawInput = parseFloat(amountInput);
  const computedAed: number | null = (!isNaN(rawInput) && rawInput > 0)
    ? (amountCurr === 'USD' ? parseFloat((rawInput * USD_TO_AED).toFixed(2)) : rawInput)
    : null;

  const paidAed = item.paidAmounts.aed;

  function handleCurrencyToggle(c: 'AED' | 'USD') {
    if (c === amountCurr) return;
    const v = parseFloat(amountInput);
    if (!isNaN(v) && v > 0) {
      setAmountInput(c === 'USD' ? (v / USD_TO_AED).toFixed(2) : (v * USD_TO_AED).toFixed(2));
    }
    setAmountCurr(c);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!computedAed || computedAed <= 0) {
      setError(`Enter a valid ${amountCurr} amount greater than 0.`);
      return;
    }
    try {
      await onSubmit(item.firestoreId, computedAed);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update amount.');
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl w-full mx-4 overflow-y-auto" style={{ minWidth: 360, maxWidth: 440, maxHeight: '90vh' }}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div style={{ ...S.charcoal, padding: 8, borderRadius: 10 }}>
            <Pencil size={16} color="#fff" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-800">Edit Payable Amount</h2>
            <p className="text-xs text-gray-500">{item.modelName}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            New Amount <span className="text-red-400">*</span>
          </label>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500">Currency:</span>
            <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-lg">
              {(['AED', 'USD'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleCurrencyToggle(c)}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all"
                  style={amountCurr === c ? { backgroundColor: '#1e293b', color: '#fff' } : { backgroundColor: 'transparent', color: '#64748b' }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
              {amountCurr === 'USD' ? '$' : 'AED'}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full border border-gray-200 rounded-xl pl-12 pr-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
            />
          </div>

          {computedAed !== null && (
            <div className="mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex flex-wrap gap-3 items-center">
              <span className="text-xs font-semibold text-slate-700">Stored as: AED {fmt(computedAed)}</span>
              {(() => {
                const c = aedToAllCurrencies(computedAed);
                return (['PKR', 'SAR', 'USD'] as const).map((s) => (
                  <span key={s} className="text-xs text-gray-500 bg-white border border-gray-100 rounded px-2 py-0.5">
                    {s} {fmt(c[s.toLowerCase() as 'pkr' | 'sar' | 'usd'])}
                  </span>
                ));
              })()}
            </div>
          )}
        </div>

        {paidAed > 0 && computedAed !== null && computedAed < paidAed && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Info size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              AED {fmt(paidAed)} is already paid on this item. Lowering the total below that will
              cap the paid amount to the new total and mark it fully paid.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={S.charcoal}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Save Amount
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Product sub-row ───────────────────────────────────────────────────────────
function ProductRow({
  item, currency, onPay, onEdit,
}: {
  item: DerivedPayable;
  currency: Currency;
  onPay: (item: DerivedPayable) => void;
  onEdit: (item: DerivedPayable) => void;
}) {
  const k   = currKey(currency);
  const sym = CURRENCY_SYMBOLS[currency];
  const remainingAed = item.amounts.aed - item.paidAmounts.aed;
  const canPay       = item.status !== 'paid' && remainingAed > 0;

  return (
    <tr className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors" style={{ backgroundColor: '#f8fafc' }}>
      <td className="pl-16 pr-4 py-3">
        <div className="flex items-center gap-2">
          <Package size={13} className="text-gray-400 flex-shrink-0" />
          <div>
            <span className="text-sm text-gray-700 font-medium">{item.modelName}</span>
            {item.description && item.description !== item.modelName && (
              <p className="text-xs text-gray-400 truncate max-w-xs">{item.description}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {item.location
          ? <span className="inline-flex items-center gap-1 text-xs text-gray-500"><MapPin size={11} />{item.location}</span>
          : <span className="text-gray-300 text-xs">—</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1.5 justify-end">
          <span className="text-sm font-semibold text-gray-800">{sym} {fmt(item.amounts[k])}</span>
          <button
            onClick={() => onEdit(item)}
            title="Edit amount"
            className="text-gray-300 hover:text-slate-600 transition p-0.5"
          >
            <Pencil size={12} />
          </button>
        </div>
        {item.paidAmounts.aed > 0 && (
          <p className="text-xs text-emerald-600 mt-0.5">Paid: {sym} {fmt(item.paidAmounts[k])}</p>
        )}
      </td>
      <td className="px-4 py-3 text-center"><StatusBadge status={item.status} /></td>
      <td className="px-4 py-3 text-center text-gray-500 text-xs">{fmtDate(item.saleDate)}</td>
      <td className="px-4 py-3 text-center">
        {canPay && (
          <button
            onClick={() => onPay(item)}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition"
            style={{ backgroundColor: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}
          >
            <CreditCard size={11} /> Pay
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Invoice group row ─────────────────────────────────────────────────────────
function InvoiceGroup({
  summary, currency, expanded, onToggle, onPay, onEdit,
}: {
  summary:  InvoicePayableSummary;
  currency: Currency;
  expanded: boolean;
  onToggle: () => void;
  onPay:    (item: DerivedPayable) => void;
  onEdit:   (item: DerivedPayable) => void;
}) {
  const k   = currKey(currency);
  const sym = CURRENCY_SYMBOLS[currency];
  return (
    <>
      <tr className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors" onClick={onToggle}>
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div style={S.toggleBtn}>
              {expanded ? <ChevronDown size={12} color="#fff" /> : <ChevronRight size={12} color="#fff" />}
            </div>
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-800">
                {summary.invoiceNumber !== 'No Invoice' && summary.invoiceNumber !== 'Manual Entry'
                  ? `Invoice #${summary.invoiceNumber}`
                  : summary.invoiceNumber}
              </span>
            </div>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {summary.items.length} item{summary.items.length !== 1 ? 's' : ''}
            </span>
          </div>
        </td>
        <td className="px-4 py-4 text-gray-500 text-xs">{fmtDate(summary.saleDate)}</td>
        <td className="px-4 py-4 text-right">
          <span className="text-base font-bold text-gray-900">{sym} {fmt(summary.totalAmounts[k])}</span>
          {summary.paidAmounts.aed > 0 && (
            <p className="text-xs text-emerald-600 mt-0.5">Paid: {sym} {fmt(summary.paidAmounts[k])}</p>
          )}
        </td>
        <td className="px-4 py-4 text-center"><StatusBadge status={summary.status} /></td>
        <td className="px-4 py-4 text-center text-gray-400 text-xs">{fmtDate(summary.saleDate)}</td>
        <td className="px-4 py-4" />
      </tr>
      {expanded && summary.items.map((item) => (
        <ProductRow key={item.firestoreId} item={item} currency={currency} onPay={onPay} onEdit={onEdit} />
      ))}
    </>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
export const PayableToFuturisticView: React.FC = () => {
  const {
    summaries, totals, loading, error, refresh,
    addManualEntry, markPayment, editAmount, actionLoading,
    bankAccounts, cashAccounts, accountsLoading,
  } = usePayableToFuturistic();

  const [activeTab,      setActiveTab]      = useState<'payables' | 'configure'>('payables');
  // Defaults to whatever the Admin has picked globally (falls back to USD
  // if that's a currency this screen's 4-way breakdown doesn't track, e.g.
  // CAD/GBP/EUR) — the tabs below still let anyone switch manually per visit.
  const { code: globalCode } = useGlobalCurrency();
  const SUPPORTED_HERE: Currency[] = ['AED', 'PKR', 'SAR', 'USD'];
  const [activeCurrency, setActiveCurrency] = useState<Currency>(
    SUPPORTED_HERE.includes(globalCode as Currency) ? (globalCode as Currency) : 'USD'
  );
  const [expandedIds,    setExpandedIds]    = useState<Set<string>>(new Set());
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [payingItem,     setPayingItem]     = useState<DerivedPayable | null>(null);
  const [editingItem,    setEditingItem]    = useState<DerivedPayable | null>(null);

  const toggle     = (id: string) =>
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll   = () => setExpandedIds(new Set(summaries.map((s) => s.invoiceId)));
  const collapseAll = () => setExpandedIds(new Set());

  const totalItems   = summaries.reduce((n, s) => n + s.items.length, 0);
  const pendingCount = summaries.filter((s) => s.status !== 'paid').length;
  const k   = currKey(activeCurrency);
  const sym = CURRENCY_SYMBOLS[activeCurrency];

  // Grand paid totals
  const paidTotals = summaries.reduce(
    (acc, s) => ({
      aed: acc.aed + s.paidAmounts.aed,
      pkr: acc.pkr + s.paidAmounts.pkr,
      sar: acc.sar + s.paidAmounts.sar,
      usd: acc.usd + s.paidAmounts.usd,
    }),
    { aed: 0, pkr: 0, sar: 0, usd: 0 }
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-gray-600" />
          <span className="text-sm text-gray-500">Loading Futuristic payables…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">

      {/* Modals */}
      {showAddModal && (
        <Overlay onClose={() => setShowAddModal(false)}>
          <ManualEntryModal
            onClose={() => setShowAddModal(false)}
            onSubmit={addManualEntry}
            loading={actionLoading}
          />
        </Overlay>
      )}

      {payingItem && (
        <Overlay onClose={() => setPayingItem(null)}>
          <PaymentModal
            item={payingItem}
            bankAccounts={bankAccounts}
            cashAccounts={cashAccounts}
            accountsLoading={accountsLoading}
            onClose={() => setPayingItem(null)}
            onSubmit={async (id, paidAed, notes, paymentMethod, bankAccountId, cashAccountId) =>
              markPayment(id, { paidAed, notes, paymentMethod, bankAccountId, cashAccountId })
            }
            loading={actionLoading}
          />
        </Overlay>
      )}

      {editingItem && (
        <Overlay onClose={() => setEditingItem(null)}>
          <EditAmountModal
            item={editingItem}
            onClose={() => setEditingItem(null)}
            onSubmit={editAmount}
            loading={actionLoading}
          />
        </Overlay>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div style={{ ...S.charcoal, padding: 10, borderRadius: 12 }}>
            <Building2 size={20} color="#ffffff" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Payable to Futuristic</h1>
            <p className="text-xs text-gray-500">
              {totalItems} product{totalItems !== 1 ? 's' : ''} across {summaries.length} invoice{summaries.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'payables' && (
            <>
              <button
                onClick={() => setShowAddModal(true)}
                style={S.charcoal}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl hover:opacity-90 transition shadow-sm"
              >
                <Plus size={14} /> Add Entry
              </button>
              <button
                onClick={refresh}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition shadow-sm"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Tab switcher ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('payables')}
          style={activeTab === 'payables' ? S.tabActive : S.tabInactive}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
        >
          <DollarSign size={13} /> Invoices &amp; Payables
        </button>
        <button
          onClick={() => setActiveTab('configure')}
          style={activeTab === 'configure' ? S.tabActive : S.tabInactive}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
        >
          <Package size={13} /> Configure Inventory
        </button>
      </div>

      {/* ── Configure tab ───────────────────────────────────────────────────── */}
      {activeTab === 'configure' && <InventoryPayableConfigPanel />}

      {/* ── Payables tab content ────────────────────────────────────────────── */}
      {activeTab === 'payables' && (
        <>
          {/* ── Summary Cards ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div style={{ ...S.charcoalCard, borderRadius: 16, padding: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginBottom: 4 }}>Total (USD)</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#ffffff' }}>$ {fmt(totals.usd)}</p>
              {paidTotals.usd > 0 && (
                <p style={{ fontSize: 11, color: '#34d399', marginTop: 4 }}>Paid: $ {fmt(paidTotals.usd)}</p>
              )}
            </div>
            <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
              <p className="text-xs font-medium mb-1 text-gray-500">Total ({getGlobalCurrencySymbol()})</p>
              <p className="text-lg font-bold text-gray-800">{fmt(totals.aed)}</p>
              {paidTotals.aed > 0 && <p className="text-xs text-emerald-600 mt-1">Paid: {fmt(paidTotals.aed)}</p>}
            </div>
          </div>

          {/* ── Pills ──────────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 text-sm px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg">
              <DollarSign size={13} />
              Outstanding: <strong>{pendingCount} invoice{pendingCount !== 1 ? 's' : ''} pending</strong>
            </span>
            <span className="inline-flex items-center gap-2 text-sm px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg">
              <Package size={13} />
              {totalItems} Futuristic unit{totalItems !== 1 ? 's' : ''} tracked
            </span>
          </div>

          {/* ── Currency Tabs ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
            {ALL_CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCurrency(c)}
                style={activeCurrency === c ? S.tabActive : S.tabInactive}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              >
                {c}
              </button>
            ))}
          </div>

          {/* ── Table / Empty ──────────────────────────────────────────────────── */}
          {summaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white border border-gray-100 rounded-2xl">
              <Building2 size={48} className="mb-4 opacity-20" />
              <p className="text-base font-medium text-gray-500">No Futuristic products found</p>
              <p className="text-sm mt-1 text-gray-400 mb-6">
                Products with brand "Futuristic" linked to invoices will appear here.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                style={S.charcoal}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl hover:opacity-90 transition"
              >
                <Plus size={14} /> Add Manual Entry
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Invoices &amp; Products
                </span>
                <div className="flex items-center gap-3">
                  <button onClick={expandAll}   className="text-xs font-medium text-gray-700 hover:underline">Expand all</button>
                  <span className="text-gray-300 text-xs">|</span>
                  <button onClick={collapseAll} className="text-xs text-gray-500 hover:underline">Collapse all</button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Invoice / Product</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Date</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Amount ({activeCurrency})</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Sale Date</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summaries.map((s) => (
                      <InvoiceGroup
                        key={s.invoiceId}
                        summary={s}
                        currency={activeCurrency}
                        expanded={expandedIds.has(s.invoiceId)}
                        onToggle={() => toggle(s.invoiceId)}
                        onPay={setPayingItem}
                        onEdit={setEditingItem}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-5 py-4 font-bold text-gray-800" colSpan={2}>Grand Total</td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-lg font-bold text-gray-900">{sym} {fmt(totals[k])}</span>
                        {paidTotals.aed > 0 && (
                          <p className="text-xs text-emerald-600 mt-0.5">Paid: {sym} {fmt(paidTotals[k])}</p>
                        )}
                      </td>
                      <td colSpan={3} className="px-4 py-4 text-center text-xs text-gray-500">
                        {summaries.filter((s) => s.status === 'paid').length} of {summaries.length} invoices paid
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── Price Reference ────────────────────────────────────────────────── */}
          <details className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden group">
            <summary className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors list-none flex items-center gap-2 select-none">
              <ChevronRight size={13} className="group-open:rotate-90 transition-transform" />
              Futuristic Price Reference
            </summary>
            <div className="px-5 pb-4 pt-1">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(Object.entries(FUTURISTIC_PRICES_USD) as [string, number][]).map(([model, price]) => (
                  <div key={model} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-600">{model}</span>
                    <div className="text-right">
                      <span className="text-xs font-bold text-gray-800">${price}</span>
                      <p className="text-xs text-gray-400">AED {fmt(price * USD_TO_AED)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </>
      )}

    </div>
  );
};