// Transactions Module - Form View (Create / Edit)

import React, { useState } from 'react';
import {
  ArrowLeft, Plus, Trash2, Building2, Wallet, TrendingUp, TrendingDown,
  Upload, Calculator, User, Users, CheckCircle, AlertCircle, Repeat, Loader2,
  Hash, Edit2, Check, X, CreditCard, Lock, BarChart2,
} from 'lucide-react';
import { SUB_CATEGORIES, TransactionItem, DynamicCategory, PL_CATEGORIES, PLMainCategory, BS_CATEGORIES, BSMainCategory } from '../models/types';
import { UseTransactionFormViewModelReturn } from '../viewModels/useTransactionFormViewModel';
import { SUPPORTED_CURRENCIES, SupportedCurrency, PAYABLE_RECEIVABLE_SUB_CATEGORIES } from '../viewModels/useTransactionFormViewModel';
import { convertCurrency } from '../../invoices/models/invoiceService';
import { sanitizeNameInput, validateName } from '../../../utils/validators';

interface Props extends UseTransactionFormViewModelReturn {}

function fallbackFormatBankCurrency(n: number, bankCurrency?: SupportedCurrency): string {
  const opt = SUPPORTED_CURRENCIES.find(c => c.code === (bankCurrency ?? 'AED'));
  const sym = opt?.symbol ?? (bankCurrency ?? 'PKR');
  return `${sym} ${new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none text-sm';
const lbl = 'block text-sm font-medium text-gray-700 mb-1';

// ── CurrencyAmountInput ───────────────────────────────────────────────────────
// Lets the user type an amount in any supported currency.
// The AED equivalent is computed on every keystroke and pushed to the parent.
// On currency switch the display value is immediately re-expressed in the new unit.
//
// State contract:
//   displayValue       — what the <input> shows; always in `inputCurrency` units
//   item.amount        — AED authoritative value stored in ViewModel
//   item.inputCurrency — which currency the user typed in (stored as extra field)
function CurrencyAmountInput({
  value,          // AED value from ViewModel
  inputCurrency,  // currently selected input currency
  currencyRates,
  placeholder,
  hasError,
  label,
  hint,
  onAmountChange,     // (aedValue, originalValue, currency) => void
  onCurrencyChange,   // (newCurrency) => void
  readOnly,
}: {
  value: number;
  inputCurrency: SupportedCurrency;
  currencyRates: Record<string, number>;
  placeholder?: string;
  hasError?: boolean;
  label: string;
  hint?: string;
  onAmountChange: (aedValue: number, originalValue: number, currency: SupportedCurrency) => void;
  onCurrencyChange: (c: SupportedCurrency) => void;
  readOnly?: boolean;
}) {
  // Convert AED → display currency for initial render
  const toDisplay = (aed: number, cur: SupportedCurrency): number => {
    if (aed === 0) return 0;
    if (cur === 'AED') return aed;
    return +convertCurrency(aed, 'AED', cur as any, currencyRates as any).toFixed(2);
  };

  const [displayValue, setDisplayValue] = React.useState<number>(
    () => toDisplay(value, inputCurrency)
  );

  // Sync when AED value changes externally OR currency switches
  const prevRef = React.useRef<{ aed: number; cur: SupportedCurrency }>({ aed: value, cur: inputCurrency });
  React.useEffect(() => {
    const prev = prevRef.current;
    const currencyChanged = prev.cur !== inputCurrency;
    const valueChanged    = prev.aed !== value;
    if (currencyChanged || (valueChanged && !currencyChanged)) {
      setDisplayValue(toDisplay(value, inputCurrency));
    }
    prevRef.current = { aed: value, cur: inputCurrency };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inputCurrency]);

  const aedPer1Unit = inputCurrency === 'AED'
    ? 1
    : +convertCurrency(1, inputCurrency as any, 'AED', currencyRates as any).toFixed(2);

  const handleAmountChange = (raw: number) => {
    setDisplayValue(raw);
    const aed = inputCurrency === 'AED'
      ? raw
      : +convertCurrency(raw, inputCurrency as any, 'AED', currencyRates as any).toFixed(2);
    onAmountChange(aed, raw, inputCurrency);
  };

  const handleCurrencyChange = (newCur: SupportedCurrency) => {
    // Re-express current AED value in new currency immediately
    setDisplayValue(toDisplay(value, newCur));
    onCurrencyChange(newCur);
  };

  return (
    <div>
      <label className={lbl}>
        {label}
        {inputCurrency !== 'AED' && (
          <span className="ml-1 text-xs font-normal text-blue-500">· {inputCurrency}</span>
        )}
      </label>
      <div className="flex gap-1.5">
        <input
          type="number"
          min="0"
          step="any"
          value={displayValue || ''}
          readOnly={readOnly}
          onChange={e => !readOnly && handleAmountChange(Number(e.target.value))}
          placeholder={placeholder || '0'}
          className={`${inp} flex-1 ${hasError ? 'border-red-400 ring-1 ring-red-300' : ''} ${readOnly ? 'bg-gray-50 cursor-not-allowed' : ''}`}
        />
        {!readOnly && (
          <select
            value={inputCurrency}
            onChange={e => handleCurrencyChange(e.target.value as SupportedCurrency)}
            className="px-1.5 py-1 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 shrink-0"
            title="Select input currency — amount is always stored in AED"
          >
            {SUPPORTED_CURRENCIES.map(c => (
              <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
            ))}
          </select>
        )}
      </div>
      {inputCurrency !== 'AED' && value > 0 && (
        <div className="mt-1 space-y-0.5">
          <p className="text-xs text-gray-500">
            ≈ <span className="font-semibold text-gray-700">
              AED {value.toLocaleString('en-AE', { maximumFractionDigits: 0 })}
            </span>
            <span className="ml-1.5 text-gray-400">
              · 1 {inputCurrency} = AED {aedPer1Unit.toLocaleString('en-AE', { maximumFractionDigits: 2 })}
            </span>
          </p>
        </div>
      )}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export function TransactionFormView(props: Props) {
  const {
    office, date, manualDate, transactionType, paymentMode, selectedBank, isPayableReceivable,
    chequeNumber, chequeDate, chequeBank,
    setChequeNumber, setChequeDate, setChequeBank,
    setManualDate, enableMultiple, transactionItems,
    transactionId, isGeneratingId, isEditingId, setTransactionId, setIsEditingId,
    duplicateIdError, setDuplicateIdError,
    totalAmount, totalPaid, totalRemaining, currentBankBalance, remainingBalanceAfter,
    banks, isLoading, isSaving, isEditing,
    setOffice, setDate, setTransactionType, setPaymentMode, setSelectedBank,
    setEnableMultiple, updateItem, addItem, removeItem,
    handleSave, handleCancel, formatCurrency, formatDateDisplay,
    plMainCategory, plSubCategory, setPlMainCategory, setPlSubCategory,
    dynamicSubCategories, onAddSubCategory,
    dynamicPLCategories, onAddPLMainCategory, onAddPLSubCategory, onDeletePLCategory,
    dynamicBSCategories, onAddBSMainCategory, onAddBSSubCategory, onDeleteBSCategory,
    bsMainCategory, bsSubCategory, setBsMainCategory, setBsSubCategory,
    companies, onAddCompany,
    currencyRates,
    supplierPaymentInvoices, supplierPaymentInvoicesLoading,
    selectedSupplierInvoiceId, selectSupplierInvoice,
  } = props;

  const formatBankCurrency = (props as any).formatBankCurrency ?? fallbackFormatBankCurrency;
  const [saveAttempted,    setSaveAttempted]    = useState(false);
  const [addingSubCatFor,  setAddingSubCatFor]  = useState<string | null>(null);
  const [newSubCatName,    setNewSubCatName]    = useState('');
  const [savingSubCat,     setSavingSubCat]     = useState(false);
  // P&L inline-add state
  const [addingPLMain,     setAddingPLMain]     = useState(false);
  const [newPLMainName,    setNewPLMainName]    = useState('');
  const [savingPLMain,     setSavingPLMain]     = useState(false);
  const [addingPLSub,      setAddingPLSub]      = useState(false);
  const [newPLSubName,     setNewPLSubName]     = useState('');
  const [savingPLSub,      setSavingPLSub]      = useState(false);
  // Balance Sheet inline-add state
  const [addingBSMain,     setAddingBSMain]     = useState(false);
  const [newBSMainName,    setNewBSMainName]    = useState('');
  const [savingBSMain,     setSavingBSMain]     = useState(false);
  const [addingBSSub,      setAddingBSSub]      = useState(false);
  const [newBSSubName,     setNewBSSubName]     = useState('');
  const [savingBSSub,      setSavingBSSub]      = useState(false);
  // Company inline-add state
  const [addingCompany,    setAddingCompany]    = useState(false);
  const [newCompanyName,   setNewCompanyName]   = useState('');
  const [savingCompany,    setSavingCompany]    = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-slate-700" />
      </div>
    );
  }

  const selectedBankData = banks.find(b => b.id === selectedBank);
  const isPreviewId = transactionId?.includes('###');
  const isInflow = transactionType === 'Cash Inflow';

  // ── AED summary helpers ────────────────────────────────────────────────────
  // Items now store amounts in AED internally, so this is just a display formatter.
  const formatAED = (aed: number): string => {
    return `AED ${(aed || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  // ──────────────────────────────────────────────────────────────────────────

  // Classification is required — at least one of P&L or BS must be fully set
  const hasClassification = (plMainCategory && plSubCategory) || (bsMainCategory && bsSubCategory);
  const classificationError = saveAttempted && !hasClassification;

  const handleAddSubCat = async (itemId: string) => {
    if (!newSubCatName.trim()) return;
    setSavingSubCat(true);
    const added = await onAddSubCategory(transactionType, newSubCatName.trim());
    if (added) updateItem(itemId, 'subCategory', added);
    setNewSubCatName('');
    setAddingSubCatFor(null);
    setSavingSubCat(false);
  };

  const handleAddPLMain = async () => {
    if (!newPLMainName.trim()) return;
    setSavingPLMain(true);
    const added = await onAddPLMainCategory(newPLMainName.trim());
    if (added) setPlMainCategory(added as any);
    setNewPLMainName('');
    setAddingPLMain(false);
    setSavingPLMain(false);
  };

  const handleAddPLSub = async () => {
    if (!newPLSubName.trim() || !plMainCategory) return;
    setSavingPLSub(true);
    const added = await onAddPLSubCategory(plMainCategory, newPLSubName.trim());
    if (added) setPlSubCategory(added);
    setNewPLSubName('');
    setAddingPLSub(false);
    setSavingPLSub(false);
  };

  const handleAddBSMain = async () => {
    if (!newBSMainName.trim()) return;
    setSavingBSMain(true);
    const added = await onAddBSMainCategory(newBSMainName.trim());
    if (added) setBsMainCategory(added as any);
    setNewBSMainName('');
    setAddingBSMain(false);
    setSavingBSMain(false);
  };

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) return;
    setSavingCompany(true);
    const added = await onAddCompany(newCompanyName.trim());
    if (added) setOffice(added);
    setNewCompanyName('');
    setAddingCompany(false);
    setSavingCompany(false);
  };

  const handleAddBSSub = async () => {
    if (!newBSSubName.trim() || !bsMainCategory) return;
    setSavingBSSub(true);
    const added = await onAddBSSubCategory(bsMainCategory, newBSSubName.trim());
    if (added) setBsSubCategory(added);
    setNewBSSubName('');
    setAddingBSSub(false);
    setSavingBSSub(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto" style={{background:'#f8fafc', minHeight:'100%'}}>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={handleCancel} style={{padding:'8px', borderRadius:'10px', border:'1px solid #e5e7eb', background:'white', color:'#6b7280', cursor:'pointer', display:'flex', alignItems:'center', transition:'all 0.15s'}}
          onMouseEnter={e => (e.currentTarget.style.borderColor='#d1d5db')}
          onMouseLeave={e => (e.currentTarget.style.borderColor='#e5e7eb')}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{fontSize:'22px', fontWeight:700, color:'#111827', margin:0}}>{isEditing ? 'Edit Transaction' : 'Add Transaction'}</h2>
          <p style={{fontSize:'13px', color:'#9ca3af', margin:'2px 0 0 0'}}>Record a financial transaction</p>
        </div>
      </div>

      <div className="space-y-5">

        {/* Transaction ID */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Hash className="w-5 h-5 text-slate-800" /> Transaction ID
          </h3>
          {isGeneratingId ? (
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              <span className="text-sm text-gray-500">Preparing ID...</span>
            </div>
          ) : isEditingId ? (
            <div className="flex items-center gap-2">
              <input type="text" value={transactionId}
                onChange={e => setTransactionId(e.target.value.toUpperCase())}
                autoFocus placeholder="e.g. TXN-160326-005"
                className="flex-1 px-4 py-2.5 border border-slate-400 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              <button type="button" onClick={() => setIsEditingId(false)}
                style={{padding:"10px", borderRadius:"8px", background:"#1e293b", color:"white", border:"none", cursor:"pointer"}}><Check size={16} /></button>
              <button type="button" onClick={() => setIsEditingId(false)}
                style={{padding:"10px", borderRadius:"8px", background:"#f3f4f6", color:"#6b7280", border:"none", cursor:"pointer"}}><X size={16} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className={`flex-1 flex items-center justify-between px-4 py-2.5 rounded-lg border ${
                isPreviewId ? 'bg-gray-50 border-gray-200' : 'bg-slate-50 border-slate-300'
              }`}>
                <span className={`font-mono text-sm font-bold tracking-widest ${isPreviewId ? 'text-gray-400' : 'text-slate-900'}`}>
                  {transactionId || '—'}
                </span>
                <span className={`text-xs ml-2 ${isPreviewId ? 'text-gray-400' : 'text-slate-500'}`}>
                  {isPreviewId ? 'assigned on save' : 'auto-generated'}
                </span>
              </div>
              {!isEditing && (
                <button type="button" onClick={() => setIsEditingId(true)}
                  style={{padding:"10px", background:"white", border:"1px solid #d1d5db", color:"#6b7280", borderRadius:"8px", cursor:"pointer"}}>
                  <Edit2 size={16} />
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            {isEditing
              ? 'Transaction ID is locked after creation.'
              : isPreviewId
                ? '🔒 A unique sequential ID is assigned automatically on save. Click ✏️ to set a custom ID.'
                : '✅ Custom ID set. Duplicates are blocked on save.'}
          </p>
        </div>

        {/* General Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-slate-800" /> General Information
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {!isPayableReceivable && (
              <div>
                <label className={lbl}>Location/Branch *</label>
                {addingCompany ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={newCompanyName}
                      onChange={e => setNewCompanyName(e.target.value)}
                      placeholder="New location name..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') { handleAddCompany(); }
                        if (e.key === 'Escape') { setAddingCompany(false); setNewCompanyName(''); }
                      }}
                      className="flex-1 px-3 py-2 border border-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                    <button type="button" disabled={savingCompany || !newCompanyName.trim()}
                      onClick={handleAddCompany}
                      style={{padding:"8px", borderRadius:"8px", background:"#1e293b", color:"white", border:"none", cursor:"pointer"}}>
                      {savingCompany ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    </button>
                    <button type="button"
                      onClick={() => { setAddingCompany(false); setNewCompanyName(''); }}
                      style={{padding:"8px", borderRadius:"8px", background:"#f3f4f6", color:"#6b7280", border:"none", cursor:"pointer"}}>
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select value={office} onChange={e => setOffice(e.target.value)} className={`flex-1 ${inp}`}>
                      {companies.map((c: {id: string; name: string}) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      type="button"
                      title="Add new location"
                      onClick={() => { setAddingCompany(true); setNewCompanyName(''); }}
                      style={{padding:"8px", borderRadius:"8px", background:"#f8fafc", color:"#1e293b", border:"1px solid #bbf7d0", cursor:"pointer", flexShrink:0}}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className={`space-y-3 ${isPayableReceivable ? 'col-span-2' : ''}`}>
              <div>
                <label className={lbl}>
                  Automatic Date <span className="text-xs font-normal text-gray-400 ml-1">(today)</span>
                </label>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg min-h-[38px]">
                  <Lock size={13} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-600">{formatDateDisplay(date)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">This date is pre-filled automatically. Use the manual override below only if you need a different transaction date.</p>
              </div>
              <div>
                <label className={lbl}>Manual Date Override <span className="text-xs font-normal text-gray-400">(optional)</span></label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={e => setManualDate(e.target.value)}
                  className={inp}
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank to use the automatic date. If set, this value will overwrite the auto date when saving.</p>
              </div>
              <div>
                <label className={lbl}>Due Date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="date"
                  value={transactionItems[0]?.dueDate || ''}
                  onChange={e => updateItem(transactionItems[0]?.id, 'dueDate', e.target.value)}
                  className={inp}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Transaction Type */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-slate-800" /> Transaction Type
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {(['Cash Inflow', 'Cash Outflow', 'Loan'] as const).map(type => (
              <button key={type} type="button" onClick={() => setTransactionType(type)}
                style={{padding:'16px', border: transactionType === type ? '2px solid #1e293b' : '2px solid #e5e7eb', borderRadius:'12px', textAlign:'center', background: transactionType === type ? '#f8fafc' : 'white', cursor:'pointer', transition:'all 0.15s', width:'100%'}}>
                <div className="flex justify-center mb-2">
                  {type === 'Cash Inflow'  && <TrendingUp  className="w-6 h-6 text-slate-700" />}
                  {type === 'Cash Outflow' && <TrendingDown className="w-6 h-6 text-red-500" />}
                  {type === 'Loan'         && <Wallet       className="w-6 h-6 text-blue-500" />}
                </div>
                <span className="font-medium text-sm">{type}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-slate-800" /> Payment Method
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {(['Cash', 'Bank', 'Cheque'] as const).map(mode => (
              <button key={mode} type="button" onClick={() => setPaymentMode(mode)}
                style={{padding:'12px', border: paymentMode === mode ? '2px solid #1e293b' : '2px solid #e5e7eb', borderRadius:'12px', textAlign:'center', fontWeight:500, fontSize:'14px', background: paymentMode === mode ? '#f8fafc' : 'white', color: paymentMode === mode ? '#1e293b' : '#374151', cursor:'pointer', transition:'all 0.15s', width:'100%'}}>
                {mode}
              </button>
            ))}
          </div>

          {paymentMode === 'Bank' && (
            <div className="space-y-3">
              <div>
                <label className={lbl}>Select Bank Account *</label>
                <select value={selectedBank} onChange={e => setSelectedBank(e.target.value)}
                  className={`${inp} ${saveAttempted && !selectedBank ? 'border-red-400 ring-1 ring-red-300' : ''}`}>
                  <option value="">Select a bank</option>
                  {banks.filter(b => (b as any).currency !== 'PKR').map(b => (
                    <option key={b.id} value={b.id}>{b.name} — {formatBankCurrency(b.balance, (b as any).currency)}</option>
                  ))}
                </select>
              </div>
              {selectedBankData && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">Current Balance</p>
                  <p className="text-xl font-bold text-blue-700">{formatBankCurrency(currentBankBalance, (selectedBankData as any)?.currency)}</p>
                </div>
              )}
            </div>
          )}

          {paymentMode === 'Cheque' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard size={16} className="text-purple-600" />
                <span className="text-sm font-medium text-gray-700">Cheque Details</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={lbl}>Cheque Number *</label>
                  <input type="text" value={chequeNumber}
                    onChange={e => setChequeNumber(e.target.value)}
                    placeholder="e.g. 001234"
                    className={`${inp} ${saveAttempted && !chequeNumber.trim() ? 'border-red-400 ring-1 ring-red-300' : ''}`} />
                </div>
                <div>
                  <label className={lbl}>Cheque Date <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="date" value={chequeDate}
                    onChange={e => setChequeDate(e.target.value)}
                    className={inp} />
                </div>
                <div>
                  <label className={lbl}>Bank on Cheque <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" value={chequeBank}
                    onChange={e => setChequeBank(e.target.value)}
                    placeholder="e.g. HBL, MCB..."
                    className={inp} />
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-700">
                ℹ️ Cheque payments are saved as <strong>Uncleared</strong> and appear in Pending Payments until manually cleared.
              </div>
            </div>
          )}

          {paymentMode === 'Bank' && selectedBank && (
            <div style={{marginTop:"16px", background:"#f8fafc", border:"1px solid #bbf7d0", borderRadius:"10px", padding:"16px"}}>
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Balance After Transaction</h4>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Current Balance:</span>
                <span className="font-medium">{formatBankCurrency(currentBankBalance, (selectedBankData as any)?.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{isInflow ? '+ Inflow:' : '− Deducting:'}</span>
                <span className={`font-medium ${isInflow ? 'text-slate-800' : 'text-red-600'}`}>
                  {formatCurrency(isInflow ? totalAmount : totalPaid)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                <span>Balance After:</span>
                <span className={remainingBalanceAfter < 0 ? 'text-red-600' : 'text-slate-800'}>
                  {formatBankCurrency(remainingBalanceAfter, (selectedBankData as any)?.currency)}
                </span>
              </div>
              {remainingBalanceAfter < 0 && (
                <p className="text-xs text-red-600 mt-1">⚠️ This transaction will overdraw the account</p>
              )}
            </div>
          )}
        </div>

        {/* Multiple toggle */}
        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Repeat className="w-5 h-5 text-slate-800" />
            <div>
              <p className="font-medium text-gray-900 text-sm">Enable multiple transactions</p>
              <p className="text-xs text-gray-400">Batch process multiple items at once</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={enableMultiple} onChange={e => setEnableMultiple(e.target.checked)} className="sr-only peer" />
            <div className="w-10 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-slate-500/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-4 after:transition-all peer-checked:bg-slate-800"></div>
          </label>
        </div>

        {/* Transaction Items */}
        {transactionItems.map((item, index) => (
          <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Transaction #{index + 1}</h3>
              {enableMultiple && transactionItems.length > 1 && (
                <button type="button" onClick={() => removeItem(item.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {/* Category */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className={lbl}>Main Category</label>
                <input type="text" value={transactionType} readOnly className={`${inp} bg-gray-50 text-gray-500`} />
              </div>
              <div>
                <label className={lbl}>Sub Category *</label>
                {addingSubCatFor === item.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={newSubCatName}
                      onChange={e => setNewSubCatName(e.target.value)}
                      placeholder="New sub-category name..."
                      onKeyDown={e => {
                        if (e.key === 'Enter') { handleAddSubCat(item.id); }
                        if (e.key === 'Escape') { setAddingSubCatFor(null); setNewSubCatName(''); }
                      }}
                      className="flex-1 px-3 py-2 border border-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                    <button type="button" disabled={savingSubCat || !newSubCatName.trim()}
                      onClick={() => handleAddSubCat(item.id)}
                      style={{padding:"8px", borderRadius:"8px", background:"#1e293b", color:"white", border:"none", cursor:"pointer"}}>
                      {savingSubCat ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    </button>
                    <button type="button"
                      onClick={() => { setAddingSubCatFor(null); setNewSubCatName(''); }}
                      style={{padding:"8px", borderRadius:"8px", background:"#f3f4f6", color:"#6b7280", border:"none", cursor:"pointer"}}>
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={item.subCategory}
                      onChange={e => updateItem(item.id, 'subCategory', e.target.value)}
                      className={`flex-1 ${inp} ${saveAttempted && !item.subCategory ? 'border-red-400 ring-1 ring-red-300' : ''}`}
                    >
                      <option value="">Select sub category</option>
                      {(SUB_CATEGORIES[transactionType] || []).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      {(dynamicSubCategories || [])
                        .filter(d => d.parentCategory === transactionType)
                        .map(d => (
                          <option key={d.id} value={d.name}>+ {d.name}</option>
                        ))
                      }
                    </select>
                    <button
                      type="button"
                      title="Add new sub-category"
                      onClick={() => { setAddingSubCatFor(item.id); setNewSubCatName(''); }}
                      style={{padding:"8px", borderRadius:"8px", background:"#f8fafc", color:"#1e293b", border:"1px solid #bbf7d0", cursor:"pointer", flexShrink:0}}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                )}
              </div>

              {/* ── SOLD GOODS PAYMENT: invoice picker ─────────────────────────
                  Only visible when the Category is "Sold Goods Payment".
                  Shows invoices with outstanding supplier cost so the user
                  can select which invoice this payment is against. Selecting
                  one auto-fills the amount with the remaining supplier owed. */}
              {item.subCategory === 'Sold Goods Payment' && (
                <div className="col-span-2">
                  <label className={lbl}>
                    Invoice (Supplier owed) <span className="text-red-500">*</span>
                  </label>
                  {supplierPaymentInvoicesLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500">
                      <Loader2 size={14} className="animate-spin" /> Loading invoices with outstanding supplier cost...
                    </div>
                  ) : supplierPaymentInvoices.length === 0 ? (
                    <div className="px-3 py-2 border border-amber-200 bg-amber-50 rounded-lg text-sm text-amber-800">
                      No invoices found with outstanding supplier cost. All suppliers are already paid, or no invoices have supplier cost recorded.
                    </div>
                  ) : (
                    <>
                      <select
                        value={selectedSupplierInvoiceId}
                        onChange={e => selectSupplierInvoice(item.id, e.target.value)}
                        className={`${inp} ${saveAttempted && !selectedSupplierInvoiceId ? 'border-red-400 ring-1 ring-red-300' : ''}`}
                      >
                        <option value="">— Select an invoice to pay supplier for —</option>
                        {supplierPaymentInvoices.map(inv => (
                          <option key={inv.id} value={inv.id}>
                            {inv.invoiceNumber} · {inv.customerName} · Owed AED {inv.outstandingAmount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {inv.supplierPaymentStatus === 'Partial' ? ' (Partial)' : ''}
                          </option>
                        ))}
                      </select>
                      {selectedSupplierInvoiceId && (() => {
                        const sel = supplierPaymentInvoices.find(r => r.id === selectedSupplierInvoiceId);
                        if (!sel) return null;
                        return (
                          <div className="mt-2 p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <div className="text-slate-500 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Total supplier cost</div>
                                <div className="text-slate-900 font-bold text-sm">AED {sel.supplierCostTotal.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              </div>
                              <div>
                                <div className="text-slate-500 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Already paid</div>
                                <div className="text-emerald-700 font-bold text-sm">AED {sel.supplierPaidAmount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              </div>
                              <div>
                                <div className="text-slate-500 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>Outstanding</div>
                                <div className="text-red-700 font-bold text-sm">AED {sel.outstandingAmount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              </div>
                            </div>
                            <div className="mt-2 text-slate-500 italic">
                              Amount below has been pre-filled with the outstanding balance. Adjust if paying only a portion.
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}
              <div className="col-span-2">
                <label className={lbl}>Detail Category <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={item.detailCategory} onChange={e => updateItem(item.id, 'detailCategory', e.target.value)}
                  placeholder="Additional detail..." className={inp} />
              </div>
            </div>

            {/* Amounts */}
            <div className="border-t pt-4 mb-4">
              <h4 className="font-medium text-gray-800 text-sm mb-3">Amount Details</h4>
              {isInflow ? (
                <div className="grid grid-cols-3 gap-4">
                  <CurrencyAmountInput
                    label="Total Amount *"
                    value={item.amount || 0}
                    inputCurrency={(item as any).inputCurrency || 'AED'}
                    currencyRates={currencyRates}
                    hasError={saveAttempted && (!item.amount || item.amount <= 0)}
                    onAmountChange={(aed, orig, cur) => {
                      updateItem(item.id, 'amount', aed);
                      updateItem(item.id, 'inputCurrency' as any, cur);
                      updateItem(item.id, 'originalAmount' as any, orig);
                    }}
                    onCurrencyChange={cur => updateItem(item.id, 'inputCurrency' as any, cur)}
                  />
                  <CurrencyAmountInput
                    label={`Amount Received`}
                    hint="Leave blank if fully received"
                    value={item.amountPaid || 0}
                    inputCurrency={(item as any).inputCurrency || 'AED'}
                    currencyRates={currencyRates}
                    onAmountChange={(aed, orig) => {
                      updateItem(item.id, 'amountPaid', aed);
                      updateItem(item.id, 'originalAmountPaid' as any, orig);
                    }}
                    onCurrencyChange={cur => updateItem(item.id, 'inputCurrency' as any, cur)}
                  />
                  <div>
                    <label className={lbl}>Status</label>
                    <div className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${
                      item.paymentStatus === 'Full'
                        ? 'bg-slate-50 border-slate-300 text-slate-800'
                        : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                    }`}>
                      {item.paymentStatus === 'Full' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                      {item.paymentStatus === 'Full' ? 'Fully Received' : 'Partial Receipt'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <CurrencyAmountInput
                    label="Total Amount *"
                    value={item.amount || 0}
                    inputCurrency={(item as any).inputCurrency || 'AED'}
                    currencyRates={currencyRates}
                    hasError={saveAttempted && (!item.amount || item.amount <= 0)}
                    onAmountChange={(aed, orig, cur) => {
                      updateItem(item.id, 'amount', aed);
                      updateItem(item.id, 'inputCurrency' as any, cur);
                      updateItem(item.id, 'originalAmount' as any, orig);
                    }}
                    onCurrencyChange={cur => updateItem(item.id, 'inputCurrency' as any, cur)}
                  />
                  <CurrencyAmountInput
                    label="Amount Paid"
                    hint="Leave blank for full payment"
                    value={item.amountPaid || 0}
                    inputCurrency={(item as any).inputCurrency || 'AED'}
                    currencyRates={currencyRates}
                    onAmountChange={(aed, orig) => {
                      updateItem(item.id, 'amountPaid', aed);
                      updateItem(item.id, 'originalAmountPaid' as any, orig);
                    }}
                    onCurrencyChange={cur => updateItem(item.id, 'inputCurrency' as any, cur)}
                  />
                  <div>
                    <label className={lbl}>Payment Status</label>
                    <div className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${
                      item.paymentStatus === 'Full'
                        ? 'bg-slate-50 border-slate-300 text-slate-800'
                        : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                    }`}>
                      {item.paymentStatus === 'Full' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                      {item.paymentStatus}
                    </div>
                  </div>
                </div>
              )}
              {item.paymentStatus === 'Partial' && item.remainingAmount > 0 && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  {isInflow
                    ? `📥 Partial receipt — ${formatCurrency(item.remainingAmount)} still to be received. Will appear in Pending Receivable.`
                    : `⚠️ Partial — Remaining: ${formatCurrency(item.remainingAmount)} will appear in Pending Payments.`}
                </div>
              )}
            </div>

            {/* Parties */}
            <div className="border-t pt-4 mb-4">
              <h4 className="font-medium text-gray-800 text-sm mb-3 flex items-center gap-1.5">
                <Users size={14} /> Parties Involved
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Paid By <span className="text-gray-400 font-normal">(optional)</span></label>
                  <div className="flex items-center border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-slate-500 focus-within:border-slate-700 bg-white overflow-hidden">
                    <span className="flex items-center justify-center pl-3 pr-2 text-gray-400 shrink-0">
                      <User size={14} />
                    </span>
                    <input type="text" value={item.paidBy || ''} onChange={e => updateItem(item.id, 'paidBy', sanitizeNameInput(e.target.value))}
                      placeholder="Who paid (letters only)"
                      className="flex-1 py-2 pr-3 text-sm bg-transparent outline-none placeholder-gray-400" />
                  </div>
                </div>
                <div>
                  <label className={lbl}>Paid To <span className="text-gray-400 font-normal">(optional)</span></label>
                  <div className="flex items-center border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-slate-500 focus-within:border-slate-700 bg-white overflow-hidden">
                    <span className="flex items-center justify-center pl-3 pr-2 text-gray-400 shrink-0">
                      <User size={14} />
                    </span>
                    <input type="text" value={item.paidTo || ''} onChange={e => updateItem(item.id, 'paidTo', sanitizeNameInput(e.target.value))}
                      placeholder="Who received (letters only)"
                      className="flex-1 py-2 pr-3 text-sm bg-transparent outline-none placeholder-gray-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="border-t pt-4 mb-4">
              <label className={lbl}>
                {PAYABLE_RECEIVABLE_SUB_CATEGORIES.has(item.subCategory)
                  ? 'Purpose of Loan'
                  : <>Note / Description <span className="text-gray-400 font-normal">(optional)</span></>}
              </label>
              <textarea value={item.note} onChange={e => updateItem(item.id, 'note', e.target.value)}
                rows={2} placeholder="Add details..." className={`${inp} resize-none`} />
            </div>

            {/* Evidence */}
            <div className="border-t pt-4">
              <label className={lbl}>Evidence *</label>
              <label style={{display:"flex", alignItems:"center", gap:"8px", padding:"8px 16px", border:`2px dashed ${saveAttempted && !item.receipt ? '#f87171' : '#d1d5db'}`, borderRadius:"8px", cursor:"pointer"}}>
                <Upload size={16} className="text-gray-400" />
                <span className="text-sm text-gray-500">Upload Evidence</span>
                <input type="file" accept="image/*" onChange={e => updateItem(item.id, 'receipt', e.target.files?.[0] || null)} className="hidden" />
              </label>
              {item.receipt ? (
                <p className="text-xs text-slate-800 mt-1 flex items-center gap-1">
                  <CheckCircle size={12} /> {(item.receipt as File).name}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Evidence is required to save this transaction.</p>
              )}
            </div>
          </div>
        ))}

        {/* Add Another */}
        {enableMultiple && (
          <button type="button" onClick={addItem}
            style={{width:"100%", padding:"12px", border:"2px dashed #d1d5db", borderRadius:"12px", background:"white", color:"#6b7280", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", fontSize:"14px", fontWeight:500}}>
            <Plus size={16} /> Add Another Transaction
          </button>
        )}

        {/* Profit & Loss Classification */}
        <div className={`bg-white rounded-xl border p-5 shadow-sm transition-colors ${
          classificationError && !plMainCategory
            ? 'border-red-400 ring-1 ring-red-300'
            : 'border-gray-200'
        }`}>
          <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-slate-800" /> Profit &amp; Loss Classification
            <span className="ml-1 text-xs font-normal text-orange-500 font-medium">
              {classificationError && !plMainCategory ? '* required (or fill Balance Sheet below)' : '(at least one required)'}
            </span>
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Tag this transaction to a P&amp;L category so it flows into Revenue, COGS, or Operating Expenses automatically.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

            {/* ── P&L Main Category ── */}
            <div>
              <label className={lbl}>P&amp;L Category</label>
              {addingPLMain ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text" autoFocus value={newPLMainName}
                    onChange={e => setNewPLMainName(e.target.value)}
                    placeholder="e.g. Other Income"
                    onKeyDown={e => { if (e.key === 'Enter') handleAddPLMain(); if (e.key === 'Escape') { setAddingPLMain(false); setNewPLMainName(''); } }}
                    className="flex-1 px-3 py-2 border border-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <button type="button" disabled={savingPLMain || !newPLMainName.trim()} onClick={handleAddPLMain}
                    style={{padding:"8px", borderRadius:"8px", background:"#1e293b", color:"white", border:"none", cursor:"pointer"}}>
                    {savingPLMain ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  </button>
                  <button type="button" onClick={() => { setAddingPLMain(false); setNewPLMainName(''); }}
                    style={{padding:"8px", borderRadius:"8px", background:"#f3f4f6", color:"#6b7280", border:"none", cursor:"pointer"}}><X size={15} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <select value={plMainCategory} onChange={e => setPlMainCategory(e.target.value as any)}
                    className={`flex-1 ${inp}`}>
                    <option value="">— Not classified —</option>
                    {/* Built-in P&L main categories */}
                    {(Object.keys(PL_CATEGORIES) as PLMainCategory[]).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    {/* User-added P&L main categories */}
                    {dynamicPLCategories.filter(d => d.type === 'plMainCategory').map(d => (
                      <option key={d.id} value={d.name}>✦ {d.name}</option>
                    ))}
                  </select>
                  <button type="button" title="Add new P&L category"
                    onClick={() => { setAddingPLMain(true); setNewPLMainName(''); }}
                    style={{padding:"8px", borderRadius:"8px", background:"#f8fafc", color:"#1e293b", border:"1px solid #bbf7d0", cursor:"pointer", flexShrink:0}}>
                    <Plus size={15} />
                  </button>
                </div>
              )}
            </div>

            {/* ── P&L Sub Category ── */}
            <div>
              <label className={lbl}>P&amp;L Sub Category</label>
              {addingPLSub ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text" autoFocus value={newPLSubName}
                    onChange={e => setNewPLSubName(e.target.value)}
                    placeholder={plMainCategory ? `Sub-category under ${plMainCategory}` : 'Select main category first'}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddPLSub(); if (e.key === 'Escape') { setAddingPLSub(false); setNewPLSubName(''); } }}
                    className="flex-1 px-3 py-2 border border-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <button type="button" disabled={savingPLSub || !newPLSubName.trim() || !plMainCategory} onClick={handleAddPLSub}
                    style={{padding:"8px", borderRadius:"8px", background:"#1e293b", color:"white", border:"none", cursor:"pointer"}}>
                    {savingPLSub ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  </button>
                  <button type="button" onClick={() => { setAddingPLSub(false); setNewPLSubName(''); }}
                    style={{padding:"8px", borderRadius:"8px", background:"#f3f4f6", color:"#6b7280", border:"none", cursor:"pointer"}}><X size={15} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <select value={plSubCategory} onChange={e => setPlSubCategory(e.target.value)}
                    disabled={!plMainCategory}
                    className={`flex-1 ${inp} ${!plMainCategory ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}>
                    <option value="">— Select sub category —</option>
                    {/* Built-in sub-categories for selected main */}
                    {plMainCategory && (PL_CATEGORIES[plMainCategory as PLMainCategory] || []).map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                    {/* User-added sub-categories for selected main */}
                    {plMainCategory && dynamicPLCategories
                      .filter(d => d.type === 'plSubCategory' && d.parentCategory === plMainCategory)
                      .map(d => (
                        <option key={d.id} value={d.name}>✦ {d.name}</option>
                      ))}
                  </select>
                  <button type="button" title="Add new P&L sub-category"
                    disabled={!plMainCategory}
                    onClick={() => { setAddingPLSub(true); setNewPLSubName(''); }}
                    style={{padding:"8px", borderRadius:"8px", background:"#f8fafc", color:"#1e293b", border:"1px solid #bbf7d0", cursor:"pointer", flexShrink:0}}>
                    <Plus size={15} />
                  </button>
                </div>
              )}
              {!plMainCategory && !addingPLSub && (
                <p className="text-xs text-gray-400 mt-1">Select a P&amp;L category first</p>
              )}
            </div>
          </div>

          {/* P&L live preview card */}
          {plMainCategory && (
            <div className={`rounded-xl border p-4 text-sm ${
              plMainCategory === 'Revenue'
                ? 'bg-slate-50 border-slate-300'
                : plMainCategory === 'Cost of Goods Sold (COGS)'
                ? 'bg-orange-50 border-orange-200'
                : 'bg-purple-50 border-purple-200'
            }`}>
              <p className={`font-semibold mb-2 ${
                plMainCategory === 'Revenue' ? 'text-slate-900'
                : plMainCategory === 'Cost of Goods Sold (COGS)' ? 'text-orange-800'
                : 'text-purple-800'
              }`}>
                {plMainCategory === 'Revenue' && '📈 Revenue'}
                {plMainCategory === 'Cost of Goods Sold (COGS)' && '📦 Cost of Goods Sold (COGS)'}
                {plMainCategory === 'Operating Expenses' && '🏢 Operating Expenses'}
                {/* User-added main categories */}
                {!['Revenue','Cost of Goods Sold (COGS)','Operating Expenses'].includes(plMainCategory) && `✦ ${plMainCategory}`}
              </p>
              <div className={`text-xs space-y-1 ${
                plMainCategory === 'Revenue' ? 'text-slate-800'
                : plMainCategory === 'Cost of Goods Sold (COGS)' ? 'text-orange-700'
                : 'text-purple-700'
              }`}>
                {plMainCategory === 'Revenue' && <><p>• Adds to <strong>Total Revenue</strong></p><p>• Gross Profit = Revenue − COGS</p></>}
                {plMainCategory === 'Cost of Goods Sold (COGS)' && <><p>• Deducted from Revenue → <strong>Gross Profit</strong></p><p>• Gross Profit = Revenue − COGS</p></>}
                {plMainCategory === 'Operating Expenses' && <><p>• Added to <strong>Total Operating Expenses</strong></p><p>• Net Profit = Gross Profit − Total OpEx</p></>}
                {!['Revenue','Cost of Goods Sold (COGS)','Operating Expenses'].includes(plMainCategory) && <p>• Custom P&amp;L category — tracked separately in reports</p>}
                {plSubCategory && <p className="mt-1 font-medium">Sub: {plSubCategory}</p>}
              </div>

              {/* P&L waterfall mini-diagram */}
              <div className="mt-3 pt-3 border-t border-white/60 grid grid-cols-3 gap-2 text-center text-xs font-medium">
                <div className={`rounded-lg py-1.5 px-2 ${plMainCategory === 'Revenue' ? 'bg-slate-200/70 ring-2 ring-slate-400' : 'bg-white/70'}`}>
                  <p className="text-gray-400 text-[10px] uppercase tracking-wide mb-0.5">Revenue</p>
                  <p className="text-slate-800">Sales</p>
                </div>
                <div className={`rounded-lg py-1.5 px-2 ${plMainCategory === 'Cost of Goods Sold (COGS)' ? 'bg-orange-200/70 ring-2 ring-orange-400' : 'bg-white/70'}`}>
                  <p className="text-gray-400 text-[10px] uppercase tracking-wide mb-0.5">Gross Profit</p>
                  <p className="text-blue-700">Rev − COGS</p>
                </div>
                <div className={`rounded-lg py-1.5 px-2 ${plMainCategory === 'Operating Expenses' ? 'bg-purple-200/70 ring-2 ring-purple-400' : 'bg-white/70'}`}>
                  <p className="text-gray-400 text-[10px] uppercase tracking-wide mb-0.5">Net Profit</p>
                  <p className="text-slate-800">GP − OpEx</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Balance Sheet Classification */}
        <div className={`bg-white rounded-xl border p-5 shadow-sm transition-colors ${
          classificationError && !bsMainCategory
            ? 'border-red-400 ring-1 ring-red-300'
            : 'border-gray-200'
        }`}>
          <h3 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-slate-800" /> Balance Sheet Classification
            <span className="ml-1 text-xs font-normal text-orange-500 font-medium">
              {classificationError && !bsMainCategory ? '* required (or fill P&L above)' : '(at least one required)'}
            </span>
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Tag this transaction as an <strong>Asset</strong> or a <strong>Liability / Equity</strong> item so it appears correctly on the Balance Sheet.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

            {/* ── BS Main Category ── */}
            <div>
              <label className={lbl}>Balance Sheet Side</label>
              {addingBSMain ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text" autoFocus value={newBSMainName}
                    onChange={e => setNewBSMainName(e.target.value)}
                    placeholder="e.g. Other Assets"
                    onKeyDown={e => {
                      if (e.key === 'Enter')  handleAddBSMain();
                      if (e.key === 'Escape') { setAddingBSMain(false); setNewBSMainName(''); }
                    }}
                    className="flex-1 px-3 py-2 border border-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <button type="button" disabled={savingBSMain || !newBSMainName.trim()} onClick={handleAddBSMain}
                    style={{padding:"8px", borderRadius:"8px", background:"#1e293b", color:"white", border:"none", cursor:"pointer"}}>
                    {savingBSMain ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  </button>
                  <button type="button" onClick={() => { setAddingBSMain(false); setNewBSMainName(''); }}
                    style={{padding:"8px", borderRadius:"8px", background:"#f3f4f6", color:"#6b7280", border:"none", cursor:"pointer"}}><X size={15} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <select value={bsMainCategory} onChange={e => setBsMainCategory(e.target.value as BSMainCategory | '')}
                    className={`flex-1 ${inp}`}>
                    <option value="">— Not classified —</option>
                    {(Object.keys(BS_CATEGORIES) as BSMainCategory[]).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    {dynamicBSCategories.filter(d => d.type === 'bsMainCategory').map(d => (
                      <option key={d.id} value={d.name}>✦ {d.name}</option>
                    ))}
                  </select>
                  <button type="button" title="Add new Balance Sheet category"
                    onClick={() => { setAddingBSMain(true); setNewBSMainName(''); }}
                    style={{padding:"8px", borderRadius:"8px", background:"#f8fafc", color:"#1e293b", border:"1px solid #bbf7d0", cursor:"pointer", flexShrink:0}}>
                    <Plus size={15} />
                  </button>
                </div>
              )}
            </div>

            {/* ── BS Sub Category ── */}
            <div>
              <label className={lbl}>Balance Sheet Line Item</label>
              {addingBSSub ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text" autoFocus value={newBSSubName}
                    onChange={e => setNewBSSubName(e.target.value)}
                    placeholder={bsMainCategory ? `Line item under ${bsMainCategory}` : 'Select side first'}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  handleAddBSSub();
                      if (e.key === 'Escape') { setAddingBSSub(false); setNewBSSubName(''); }
                    }}
                    className="flex-1 px-3 py-2 border border-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <button type="button" disabled={savingBSSub || !newBSSubName.trim() || !bsMainCategory} onClick={handleAddBSSub}
                    style={{padding:"8px", borderRadius:"8px", background:"#1e293b", color:"white", border:"none", cursor:"pointer"}}>
                    {savingBSSub ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  </button>
                  <button type="button" onClick={() => { setAddingBSSub(false); setNewBSSubName(''); }}
                    style={{padding:"8px", borderRadius:"8px", background:"#f3f4f6", color:"#6b7280", border:"none", cursor:"pointer"}}><X size={15} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <select value={bsSubCategory} onChange={e => setBsSubCategory(e.target.value)}
                    disabled={!bsMainCategory}
                    className={`flex-1 ${inp} ${!bsMainCategory ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}>
                    <option value="">— Select line item —</option>
                    {bsMainCategory && (BS_CATEGORIES[bsMainCategory as BSMainCategory] || []).map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                    {bsMainCategory && dynamicBSCategories
                      .filter(d => d.type === 'bsSubCategory' && d.parentCategory === bsMainCategory)
                      .map(d => (
                        <option key={d.id} value={d.name}>✦ {d.name}</option>
                      ))}
                  </select>
                  <button type="button" title="Add new line item"
                    disabled={!bsMainCategory}
                    onClick={() => { setAddingBSSub(true); setNewBSSubName(''); }}
                    style={{padding:"8px", borderRadius:"8px", background:"#f8fafc", color:"#1e293b", border:"1px solid #bbf7d0", cursor:"pointer", flexShrink:0}}>
                    <Plus size={15} />
                  </button>
                </div>
              )}
              {!bsMainCategory && !addingBSSub && (
                <p className="text-xs text-gray-400 mt-1">Select a Balance Sheet side first</p>
              )}
            </div>
          </div>

          {/* BS live preview */}
          {bsMainCategory && (
            <div className={`rounded-xl border p-4 text-sm ${
              bsMainCategory === 'Assets'
                ? 'bg-slate-50 border-slate-300'
                : 'bg-rose-50 border-rose-200'
            }`}>
              {/* Header */}
              <p className={`font-semibold mb-2 ${
                bsMainCategory === 'Assets' ? 'text-slate-900' : 'text-rose-800'
              }`}>
                {bsMainCategory === 'Assets' ? '🏦 Assets' : '📋 Liabilities & Equity'}
                {!['Assets','Liabilities & Equity'].includes(bsMainCategory) && `✦ ${bsMainCategory}`}
              </p>

              <div className={`text-xs space-y-1 mb-3 ${
                bsMainCategory === 'Assets' ? 'text-slate-800' : 'text-rose-700'
              }`}>
                {bsMainCategory === 'Assets' && (
                  <><p>• Recorded on the <strong>left side</strong> of the Balance Sheet</p>
                  <p>• Represents what the business <strong>owns</strong></p></>
                )}
                {bsMainCategory === 'Liabilities & Equity' && (
                  <><p>• Recorded on the <strong>right side</strong> of the Balance Sheet</p>
                  <p>• Represents what the business <strong>owes or is funded by</strong></p></>
                )}
                {!['Assets','Liabilities & Equity'].includes(bsMainCategory) && (
                  <p>• Custom Balance Sheet category — tracked separately in reports</p>
                )}
                {bsSubCategory && <p className="mt-1 font-medium">Line item: {bsSubCategory}</p>}
              </div>

              {/* Accounting equation visual */}
              <div className="mt-2 pt-3 border-t border-white/60">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-2 text-center font-medium">Accounting Equation</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
                  <div className={`rounded-lg py-2 px-1 ${bsMainCategory === 'Assets' ? 'bg-slate-200 ring-2 ring-slate-500 text-slate-900' : 'bg-white/70 text-slate-800'}`}>
                    <p className="text-[10px] font-normal text-gray-400 mb-0.5">LEFT</p>
                    Assets
                  </div>
                  <div className="flex items-center justify-center text-gray-400 text-lg font-bold">=</div>
                  <div className={`rounded-lg py-2 px-1 ${bsMainCategory === 'Liabilities & Equity' ? 'bg-rose-200/80 ring-2 ring-rose-500 text-rose-900' : 'bg-white/70 text-rose-700'}`}>
                    <p className="text-[10px] font-normal text-gray-400 mb-0.5">RIGHT</p>
                    Liabilities + Equity
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Grand Total */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Summary</h3>
          {isInflow ? (
            <div className="grid grid-cols-2 gap-4 text-center">
              <div style={{background:'#f8fafc', border:'1px solid #99f6e4', borderRadius:'12px', padding:'16px'}}>
                <p style={{color:'#1e293b', fontSize:'12px', fontWeight:500, marginBottom:'4px'}}>Total Inflow Amount</p>
                <p style={{fontSize:'24px', fontWeight:700, color:'#0f172a'}}>{formatAED(totalAmount)}</p>
              </div>
              <div style={{background:'#f9fafb', border:'1px solid #f3f4f6', borderRadius:'12px', padding:'16px'}}>
                <p style={{color:'#6b7280', fontSize:'12px', fontWeight:500, marginBottom:'4px'}}>Items</p>
                <p style={{fontSize:'24px', fontWeight:700, color:'#111827'}}>{transactionItems.length}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div style={{background:'#f9fafb', border:'1px solid #f3f4f6', borderRadius:'12px', padding:'16px'}}>
                <p style={{color:'#6b7280', fontSize:'12px', fontWeight:500, marginBottom:'4px'}}>Total Amount</p>
                <p style={{fontSize:'24px', fontWeight:700, color:'#111827'}}>{formatAED(totalAmount)}</p>
              </div>
              <div style={{background:'#f8fafc', border:'1px solid #99f6e4', borderRadius:'12px', padding:'16px'}}>
                <p style={{color:'#1e293b', fontSize:'12px', fontWeight:500, marginBottom:'4px'}}>Total Paid</p>
                <p style={{fontSize:'24px', fontWeight:700, color:'#0f172a'}}>{formatAED(totalPaid)}</p>
              </div>
              <div style={{background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'12px', padding:'16px'}}>
                <p style={{color:'#d97706', fontSize:'12px', fontWeight:500, marginBottom:'4px'}}>Total Remaining</p>
                <p style={{fontSize:'24px', fontWeight:700, color:'#b45309'}}>{formatAED(totalRemaining)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Validation errors */}
        {saveAttempted && !isSaving && (
          (() => {
            const errs: string[] = [];
            if (!office && !isPayableReceivable) errs.push('Select a location/branch');
            if (!date)   errs.push('Select a date');
              transactionItems.forEach((item, i) => {
                const n = transactionItems.length > 1 ? ` (item ${i + 1})` : '';
                if (!item.subCategory)               errs.push(`Sub category is required${n}`);
                if (!item.amount || item.amount <= 0) errs.push(`Amount must be greater than 0${n}`);
                if (!isInflow && item.amountPaid > item.amount) errs.push(`Amount paid cannot exceed total${n}`);
                if (!isEditing && !item.receipt)     errs.push(`Evidence is required${n}`);
                if (item.paidBy?.trim()) {
                  const pbVal = validateName(item.paidBy, 'Paid By', false);
                  if (!pbVal.isValid) errs.push(`${pbVal.error}${n}`);
                }
                if (item.paidTo?.trim()) {
                  const ptVal = validateName(item.paidTo, 'Paid To', false);
                  if (!ptVal.isValid) errs.push(`${ptVal.error}${n}`);
                }
              });
            if (!hasClassification) errs.push('Select at least a P&L category or a Balance Sheet category (with sub-category)');
            if (paymentMode === 'Bank' && !selectedBank)          errs.push('Select a bank for bank transactions');
            if (paymentMode === 'Cheque' && !chequeNumber.trim()) errs.push('Enter the cheque number');
            if (errs.length === 0) return null;
            return (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-1">
                <p className="font-semibold mb-2 flex items-center gap-2"><AlertCircle size={16} /> Please fix the following:</p>
                {errs.map((e, i) => <p key={i}>• {e}</p>)}
              </div>
            );
          })()
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-10 pt-2">
          <button type="button" onClick={handleCancel}
            style={{padding:'10px 20px', borderRadius:'8px', border:'1px solid #e5e7eb', background:'white', color:'#374151', fontWeight:500, fontSize:'14px', cursor:'pointer', transition:'all 0.15s'}}>
            Cancel
          </button>
          <button type="button"
            onClick={() => { setSaveAttempted(true); handleSave(); }}
            disabled={isSaving}
            style={{display:'flex', alignItems:'center', gap:'6px', padding:'10px 24px', borderRadius:'8px', border:'none', background: isSaving ? '#94a3b8' : '#1e293b', color:'white', fontWeight:600, fontSize:'14px', cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.7 : 1, transition:'all 0.15s'}}>
            {isSaving
              ? <><Loader2 size={16} className="animate-spin" /> Saving...</>
              : <><Plus size={16} /> {isEditing ? 'Save Changes' : `Save ${transactionItems.length > 1 ? transactionItems.length + ' Transactions' : 'Transaction'}`}</>
            }
          </button>
        </div>

      </div>

      {/* Duplicate ID Modal */}
      {duplicateIdError && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-red-600 px-6 py-5 flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-full"><AlertCircle className="w-6 h-6 text-white" /></div>
              <div>
                <h3 className="text-lg font-bold text-white">Duplicate Transaction ID</h3>
                <p className="text-red-100 text-sm">This ID is already in use</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-xs text-red-400 font-medium uppercase tracking-wide mb-1">Conflicting ID</p>
                <p className="font-mono text-xl font-bold text-red-700 tracking-widest">{duplicateIdError}</p>
              </div>
              <p className="text-sm text-gray-600">A transaction with this ID already exists. Choose an option below.</p>
              <div className="text-sm text-gray-500 space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                  <p>Click <strong>"Use New ID"</strong> — system auto-assigns a fresh unique ID</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                  <p>Click <strong>"Edit ID"</strong> — manually enter a different custom ID</p>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button type="button"
                onClick={() => { setDuplicateIdError(''); setIsEditingId(true); setTransactionId(''); }}
                style={{flex:1, padding:"10px", border:"2px solid #d1d5db", borderRadius:"12px", background:"white", color:"#374151", fontWeight:500, cursor:"pointer"}}>
                ✏️ Edit ID
              </button>
              <button type="button"
                onClick={() => {
                  setDuplicateIdError('');
                  const now = new Date();
                  const dd  = String(now.getDate()).padStart(2, '0');
                  const mm  = String(now.getMonth() + 1).padStart(2, '0');
                  const yy  = String(now.getFullYear()).slice(-2);
                  setTransactionId(`TXN-${dd}${mm}${yy}-###`);
                  setIsEditingId(false);
                }}
                style={{flex:1, padding:"10px", background:"#1e293b", color:"white", border:"none", borderRadius:"12px", fontWeight:600, cursor:"pointer"}}>
                🔄 Use New ID
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}