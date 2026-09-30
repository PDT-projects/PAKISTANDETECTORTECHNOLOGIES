// Inventory Module - View Layer
// InventoryPaymentView - Last Step: Payment information
// UPDATED:
//   - Shows multi-model breakdown table when isMultiModel=true
//   - Pending payment section shows remaining balance clearly
//   - Partial payments tracked per installment

import React, { useState } from 'react';
import {
  CreditCard, CheckCircle, X, AlertCircle, ArrowLeft, Save,
  Edit2, Check, Loader2, MapPin, Banknote, Building2, Plus, Trash2,
  Package, Clock,
} from 'lucide-react';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import {
  UseInventoryPaymentViewModelReturn, PaymentMode,
  makeInventoryBranchValue, branchFromInventoryValue, DEFAULT_INVENTORY_BRANCHES,
  MultiModelPaymentEntry,
} from '../viewModels/useInventoryPaymentViewModel';
import { TxCompany } from '../../transactions/models/TransactionBridgeService';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';
// AlertDialog replaced with a plain custom modal (no Radix/portal dependency)

interface InventoryPaymentViewProps extends UseInventoryPaymentViewModelReturn {}

// ── Stepper ────────────────────────────────────────────────────────────────────
const Stepper = ({ steps, current }: { steps: { number: number; label: string }[]; current: number }) => (
  <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 32px' }}>
    <div style={{ display: 'flex', alignItems: 'center', maxWidth: 700, margin: '0 auto' }}>
      {steps.map((step, i) => {
        const active = step.number === current;
        const done   = step.number < current;
        const last   = i === steps.length - 1;
        return (
          <React.Fragment key={step.number}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13,
                backgroundColor: done || active ? '#0f172a' : '#e5e7eb',
                color: done || active ? '#fff' : '#9ca3af',
                boxShadow: active ? '0 0 0 4px rgba(15,23,42,0.12)' : 'none',
              }}>
                {done ? <Check size={14} strokeWidth={3} /> : step.number}
              </div>
              <span style={{ marginTop: 5, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: done || active ? '#0f172a' : '#94a3b8', whiteSpace: 'nowrap' }}>
                {step.label}
              </span>
            </div>
            {!last && <div style={{ flex: 1, height: 2, borderRadius: 99, margin: '0 6px', marginBottom: 20, backgroundColor: done ? '#0f172a' : '#e5e7eb' }} />}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1px solid #d1d5db',
  borderRadius: 8, fontSize: 13, outline: 'none',
  boxSizing: 'border-box' as const, color: '#111827', backgroundColor: '#fff',
};

// ── Payment Mode Toggle ───────────────────────────────────────────────────────
function PaymentModeToggle({
  mode, onChange, disabled,
}: { mode: PaymentMode; onChange: (m: PaymentMode) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {([
        { value: 'cash' as const,  label: 'Cash',          Icon: Banknote,  color: '#16a34a', bg: '#f0fdf4', border: '#22c55e' },
        { value: 'bank' as const,  label: 'Bank Transfer',  Icon: Building2, color: '#0f172a', bg: '#f1f5f9', border: '#334155' },
      ]).map(({ value, label, Icon, color, bg, border }) => {
        const sel = mode === value;
        return (
          <button key={value} onClick={() => !disabled && onChange(value)} disabled={disabled}
            style={{
              flex: 1, padding: '12px 10px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
              textAlign: 'center', border: `2px solid ${sel ? border : '#e2e8f0'}`,
              backgroundColor: sel ? bg : '#fff', opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
            }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
              <Icon size={20} color={sel ? color : '#9ca3af'} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: sel ? color : '#374151' }}>{label}</div>
          </button>
        );
      })}
    </div>
  );
}

// ── Bank Selector ─────────────────────────────────────────────────────────────
function BankSelector({ banks, value, onChange, error, isBanksLoading }: {
  banks: Array<{ id: string; name: string; balance: number }>;
  value: string; onChange: (id: string) => void;
  error?: string; isBanksLoading?: boolean;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
        Select Bank Account *
      </label>
      {isBanksLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <Loader2 size={14} color="#334155" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 12, color: '#6b7280' }}>Loading bank accounts…</span>
        </div>
      ) : (
        <select value={value} onChange={e => onChange(e.target.value)}
          style={{ ...inp, border: `1px solid ${error ? '#ef4444' : '#d1d5db'}` }}>
          <option value="">— Choose bank account —</option>
          {banks.map(b => (
            <option key={b.id} value={b.id}>
              {b.name} {b.balance !== undefined ? `(Balance: ${getGlobalCurrencySymbol()} ${b.balance.toLocaleString()})` : ''}
            </option>
          ))}
        </select>
      )}
      {error && <p style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{error}</p>}
    </div>
  );
}

// ── Branch Selector ───────────────────────────────────────────────────────────
function InventoryBranchSelector({ branches, inventoryCompany, setInventoryCompany, handleAddInventoryBranch }: {
  branches: string[];
  inventoryCompany: TxCompany;
  setInventoryCompany: (v: TxCompany) => void;
  handleAddInventoryBranch: (name: string) => Promise<void>;
}) {
  const [addingNew, setAddingNew] = React.useState(false);
  const [newBranch, setNewBranch] = React.useState('');
  const [saving,    setSaving]    = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (addingNew) inputRef.current?.focus(); }, [addingNew]);

  const save = async () => {
    if (!newBranch.trim()) return;
    setSaving(true);
    await handleAddInventoryBranch(newBranch.trim());
    setNewBranch(''); setAddingNew(false); setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {branches.map(branch => {
        const val = makeInventoryBranchValue(branch);
        const sel = inventoryCompany === val;
        return (
          <button key={branch} onClick={() => setInventoryCompany(val)}
            style={{
              padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
              border: `2px solid ${sel ? '#0f172a' : '#e2e8f0'}`,
              backgroundColor: sel ? '#f1f5f9' : '#fff', transition: 'all 0.15s',
            }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: sel ? '#1e293b' : '#374151' }}>{branch}</span>
          </button>
        );
      })}
      {addingNew ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input ref={inputRef} type="text" value={newBranch}
            onChange={e => setNewBranch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setAddingNew(false); }}
            style={{ padding: '8px 12px', border: '2px solid #334155', borderRadius: 8, fontSize: 13, outline: 'none', width: 160 }}
            placeholder="Branch name…" />
          <button onClick={save} disabled={saving || !newBranch.trim()}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#0f172a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {saving ? '…' : 'Save'}
          </button>
          <button onClick={() => setAddingNew(false)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setAddingNew(true)}
          style={{ padding: '10px 18px', borderRadius: 8, cursor: 'pointer', border: '2px dashed #cbd5e1', backgroundColor: '#fff', transition: 'all 0.15s' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>➕ Add New</span>
        </button>
      )}
    </div>
  );
}

// ── Multi-model summary table ─────────────────────────────────────────────────
function MultiModelSummaryTable({
  entries, formatCurrency,
}: { entries: MultiModelPaymentEntry[]; formatCurrency: (n: number) => string }) {
  const totalUnits = entries.reduce((s, e) => s + e.quantity, 0);
  const totalCost  = entries.reduce((s, e) => s + e.costPrice * e.quantity, 0);

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Package size={16} color="#0f172a" />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
          Shipment Breakdown — {entries.length} Model{entries.length > 1 ? 's' : ''}
        </span>
        <span style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 99, backgroundColor: '#f1f5f9', color: '#0f172a', fontSize: 12, fontWeight: 700 }}>
          {totalUnits} total units
        </span>
      </div>

      <LockedScrollTable maxHeight="65vh">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {['#', 'Model', 'Qty', 'Cost Price', 'Sell Price', 'Location', 'Row Total'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 12px', color: '#9ca3af', fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#111827' }}>{e.modelName}</td>
                <td style={{ padding: '10px 12px', color: '#374151', textAlign: 'center' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 99, backgroundColor: '#f1f5f9', fontWeight: 700 }}>{e.quantity}</span>
                </td>
                <td style={{ padding: '10px 12px', color: '#374151' }}>{formatCurrency(e.costPrice)}</td>
                <td style={{ padding: '10px 12px', color: '#16a34a', fontWeight: 600 }}>{formatCurrency(e.salePrice)}</td>
                <td style={{ padding: '10px 12px', color: '#334155', fontSize: 12 }}>{e.location || '—'}</td>
                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#111827' }}>{formatCurrency(e.costPrice * e.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#0f172a' }}>
              <td colSpan={2} style={{ padding: '12px 12px', color: '#94a3b8', fontWeight: 700, fontSize: 12 }}>TOTAL</td>
              <td style={{ padding: '12px 12px', color: '#fff', fontWeight: 800, textAlign: 'center' }}>{totalUnits}</td>
              <td colSpan={3} />
              <td style={{ padding: '12px 12px', color: '#a5f3fc', fontWeight: 900, fontSize: 15 }}>{formatCurrency(totalCost)}</td>
            </tr>
          </tfoot>
        </table>
      </LockedScrollTable>
    </div>
  );
}

// ── Pending Payment Banner ─────────────────────────────────────────────────────
function PendingPaymentBanner({
  totalAmount, paidAmount, paymentStatus, formatCurrency,
}: { totalAmount: number; paidAmount: number; paymentStatus: string; formatCurrency: (n: number) => string }) {
  if (paymentStatus === 'paid') return null;
  const remaining = Math.max(0, totalAmount - paidAmount);

  return (
    <div style={{
      backgroundColor: paymentStatus === 'unpaid' ? '#fef2f2' : '#fffbeb',
      border: `1px solid ${paymentStatus === 'unpaid' ? '#fecaca' : '#fde68a'}`,
      borderRadius: 12, padding: '16px 20px',
      display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      <Clock size={22} color={paymentStatus === 'unpaid' ? '#dc2626' : '#d97706'} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: paymentStatus === 'unpaid' ? '#991b1b' : '#92400e', marginBottom: 4 }}>
          {paymentStatus === 'unpaid' ? 'Full amount will be recorded as pending' : 'Remaining balance will be tracked as pending'}
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Amount</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#374151', marginTop: 2 }}>{formatCurrency(totalAmount)}</div>
          </div>
          {paymentStatus === 'partial' && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paid Now</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a', marginTop: 2 }}>{formatCurrency(paidAmount)}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Balance</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: paymentStatus === 'unpaid' ? '#dc2626' : '#d97706', marginTop: 2 }}>{formatCurrency(remaining)}</div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
          This will be saved under <strong>Pending Inventory Payments</strong> and can be settled from the payments module.
        </div>
      </div>
    </div>
  );
}

// ── Main View ──────────────────────────────────────────────────────────────────
export const InventoryPaymentView: React.FC<InventoryPaymentViewProps> = ({
  costingOption, inventoryType, totalAmount,
  ownershipType,
  manualStockInDate, setManualStockInDate,
  paymentStatus, transactionId, isGeneratingId, isEditingTransactionId,
  paidAmount, remainingAmount, validationErrors, isValid, isSaving,
  duplicateDialogOpen, setDuplicateDialogOpen, duplicateDialogMessage, setDuplicateDialogMessage,
  paymentMode, setPaymentMode, selectedBankId, setSelectedBankId, banks, isBanksLoading,
  installments, addInstallment, removeInstallment, updateInstallment, instalmentTotal,
  setPaymentStatus, setTransactionId, setIsEditingTransactionId,
  inventoryCompany, setInventoryCompany,
  inventoryBranches, handleAddInventoryBranch,
  setPaidAmount, handleSubmit, handleBack, formatCurrency, productSummary,
  multiModelEntries, isMultiModel,
}) => {
  const steps = costingOption === 'with'
    ? [
        { number: 1, label: 'Type' }, { number: 2, label: 'Costing' },
        { number: 3, label: 'Details' }, { number: 4, label: 'Products' }, { number: 5, label: 'Payment' },
      ]
    : [
        { number: 1, label: 'Type' }, { number: 2, label: 'Costing' },
        { number: 3, label: 'Models' }, { number: 4, label: 'Payment' },
      ];
  const currentStep = steps.length;

  const handleDuplicateDialogOpenChange = (open: boolean) => {
    setDuplicateDialogOpen(open);
    if (!open) setDuplicateDialogMessage('');
  };

  const isCredit = ownershipType === 'Credit';
  const showPaymentDetails = !isCredit && paymentStatus !== 'unpaid';
  const showInstallments   = !isCredit && paymentStatus === 'partial';

  // Effective paid amount (from installments or field)
  const effectivePaid = installments.length > 0
    ? installments.reduce((s, e) => s + e.amount, 0)
    : (paymentStatus === 'paid' ? totalAmount : paidAmount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleBack}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CreditCard size={17} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Payment Information</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {isMultiModel
                ? `${multiModelEntries.length} models — ${formatCurrency(totalAmount)} total shipment`
                : 'Complete payment details to finalize inventory creation'}
            </div>
          </div>
        </div>
      </div>

      <Stepper steps={steps} current={currentStep} />

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Multi-model breakdown table */}
          {isMultiModel && (
            <MultiModelSummaryTable entries={multiModelEntries} formatCurrency={formatCurrency} />
          )}

          {/* Branch / Company */}
          <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
              Branch / Company *
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: '#6b7280' }}>
                (links this inventory to the transactions ledger)
              </span>
            </label>
            <InventoryBranchSelector
              branches={inventoryBranches}
              inventoryCompany={inventoryCompany}
              setInventoryCompany={setInventoryCompany}
              handleAddInventoryBranch={handleAddInventoryBranch}
            />
          </div>

          {/* Transaction ID */}
          <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Transaction ID</label>
            {isGeneratingId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <Loader2 size={16} color="#334155" style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13, color: '#6b7280' }}>Generating transaction ID...</span>
              </div>
            ) : isEditingTransactionId ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={transactionId}
                  onChange={e => setTransactionId(e.target.value.toUpperCase())} autoFocus
                  style={{ ...inp, flex: 1, border: `1px solid ${validationErrors.transactionId ? '#ef4444' : '#334155'}`, fontFamily: 'monospace', fontWeight: 600 }}
                  placeholder="e.g. TXN-280426-001" />
                <button onClick={() => setIsEditingTransactionId(false)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#22c55e', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Check size={16} />
                </button>
                <button onClick={() => setIsEditingTransactionId(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151' }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#1e293b', letterSpacing: '0.05em' }}>{transactionId}</span>
                  <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 600 }}>AUTO-GENERATED</span>
                </div>
                <button onClick={() => setIsEditingTransactionId(true)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#6b7280' }}>
                  <Edit2 size={15} />
                </button>
              </div>
            )}
            {validationErrors.transactionId && <p style={{ color: '#ef4444', fontSize: 11, marginTop: 5 }}>{validationErrors.transactionId}</p>}
          </div>

          {/* Ownership — decided in Step 1, shown here read-only */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: '14px 20px',
            backgroundColor: isCredit ? '#fffbeb' : '#f0fdf4',
            border: `1px solid ${isCredit ? '#fde68a' : '#bbf7d0'}`,
          }}>
            {isCredit ? <Clock size={18} color="#d97706" /> : <CheckCircle size={18} color="#16a34a" />}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: isCredit ? '#92400e' : '#166534' }}>
                {isCredit ? 'On Supplier Credit' : 'Owned — Paid Now'}
              </div>
              <div style={{ fontSize: 11, color: isCredit ? '#92400e' : '#166534' }}>
                Chosen in Step 1 — go back to change it.
              </div>
            </div>
          </div>

          {/* Stock-In Date — optional manual override */}
          <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Stock-In Date
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: '#6b7280' }}>
                Leave blank to auto-use today's date
              </span>
            </label>
            <input
              type="date"
              value={manualStockInDate}
              onChange={e => setManualStockInDate(e.target.value)}
              style={{ padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', maxWidth: 220 }}
            />
            {manualStockInDate && (
              <p style={{ fontSize: 11, color: '#d97706', marginTop: 6 }}>
                Manual date entered — will be flagged as "manual" in the Inventory Report.
              </p>
            )}
          </div>

          {isCredit ? (
            /* Supplier-credit notice — no payment fields; cost becomes payable once sold out */
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '16px 20px' }}>
              <Clock size={20} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>
                  Purchasing cost: {formatCurrency(totalAmount)}
                </div>
                <div style={{ fontSize: 12, color: '#92400e', marginTop: 4, lineHeight: 1.6 }}>
                  No payment is recorded now. This amount is fixed as the supplier cost and will
                  appear under <strong>Inventory Payables</strong> on the dashboard once this stock is sold out.
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Payment Status */}
              <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 14 }}>Payment Status *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  {([
                    { value: 'paid',    icon: CheckCircle, label: 'Paid',    desc: 'Full payment received',    activeColor: '#16a34a', activeBg: '#f0fdf4', activeBorder: '#22c55e' },
                    { value: 'unpaid',  icon: X,           label: 'Unpaid',  desc: 'No payment yet',           activeColor: '#dc2626', activeBg: '#fef2f2', activeBorder: '#f87171' },
                    { value: 'partial', icon: AlertCircle, label: 'Partial', desc: 'Partial / installments',   activeColor: '#d97706', activeBg: '#fffbeb', activeBorder: '#fbbf24' },
                  ] as const).map(({ value, icon: Icon, label, desc, activeColor, activeBg, activeBorder }) => {
                    const sel = paymentStatus === value;
                    return (
                      <button key={value} onClick={() => setPaymentStatus(value)} style={{
                        padding: '14px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                        border: `2px solid ${sel ? activeBorder : '#e2e8f0'}`,
                        backgroundColor: sel ? activeBg : '#fff', transition: 'all 0.15s',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                          <Icon size={22} color={sel ? activeColor : '#9ca3af'} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: sel ? activeColor : '#374151' }}>{label}</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pending payment banner */}
              <PendingPaymentBanner
                totalAmount={totalAmount}
                paidAmount={effectivePaid}
                paymentStatus={paymentStatus}
                formatCurrency={formatCurrency}
              />
            </>
          )}

          {/* Payment Method (not unpaid) */}
          {showPaymentDetails && (
            <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 14 }}>
                Payment Method *
              </label>
              {(paymentStatus === 'paid' || (paymentStatus === 'partial' && installments.length === 0)) && (
                <>
                  <PaymentModeToggle mode={paymentMode} onChange={setPaymentMode} />
                  {paymentMode === 'bank' && (
                    <BankSelector banks={banks} value={selectedBankId} onChange={setSelectedBankId}
                      error={validationErrors.bankId} isBanksLoading={isBanksLoading} />
                  )}
                </>
              )}
              {paymentStatus === 'partial' && installments.length === 0 && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Paid Amount ({getGlobalCurrencySymbol()}) *
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: '#6b7280' }}>
                      out of {formatCurrency(totalAmount)}
                    </span>
                  </label>
                  <input type="number" min="0" step="0.01" value={paidAmount || ''}
                    onChange={e => setPaidAmount(Number(e.target.value))}
                    style={{ ...inp, border: `1px solid ${validationErrors.paidAmount ? '#ef4444' : '#d1d5db'}` }}
                    placeholder="0.00" />
                  {validationErrors.paidAmount && <p style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{validationErrors.paidAmount}</p>}
                </div>
              )}
            </div>
          )}

          {/* Installments */}
          {showInstallments && (
            <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Installments / Multi-Account Payments</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Split payment across accounts or dates</div>
                </div>
                <button onClick={addInstallment}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#0f172a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  <Plus size={14} /> Add Entry
                </button>
              </div>

              {installments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: 12 }}>
                  Click "Add Entry" to add payment installments, or enter a single amount above.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {installments.map((inst, idx) => (
                    <div key={inst.id} style={{ borderRadius: 10, border: '1px solid #e2e8f0', padding: '14px 16px', backgroundColor: '#fafafa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Payment #{idx + 1}</span>
                        <button onClick={() => removeInstallment(inst.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid #fca5a5', backgroundColor: '#fef2f2', cursor: 'pointer', color: '#dc2626', fontSize: 11 }}>
                          <Trash2 size={12} /> Remove
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5 }}>Mode</label>
                          <PaymentModeToggle mode={inst.mode}
                            onChange={m => updateInstallment(inst.id, { mode: m, bankId: undefined, bankName: undefined })} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5 }}>Amount ({getGlobalCurrencySymbol()}) *</label>
                          <input type="number" min="0" value={inst.amount || ''}
                            onChange={e => updateInstallment(inst.id, { amount: Number(e.target.value) })}
                            style={{ ...inp }} placeholder="0.00" />
                          {validationErrors[`inst_${idx}`] && (
                            <p style={{ color: '#ef4444', fontSize: 10, marginTop: 3 }}>{validationErrors[`inst_${idx}`]}</p>
                          )}
                        </div>
                      </div>
                      {inst.mode === 'bank' && (
                        <div style={{ marginTop: 10 }}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5 }}>Bank Account *</label>
                          <select value={inst.bankId || ''} onChange={e => {
                            const bank = banks.find(b => b.id === e.target.value);
                            updateInstallment(inst.id, { bankId: e.target.value, bankName: bank?.name });
                          }} style={{ ...inp }}>
                            <option value="">— Select bank —</option>
                            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                          {validationErrors[`inst_bank_${idx}`] && (
                            <p style={{ color: '#ef4444', fontSize: 10, marginTop: 3 }}>{validationErrors[`inst_bank_${idx}`]}</p>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5 }}>Date</label>
                          <input type="date" value={inst.date} onChange={e => updateInstallment(inst.id, { date: e.target.value })} style={{ ...inp }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5 }}>Note (optional)</label>
                          <input type="text" value={inst.note || ''}
                            onChange={e => updateInstallment(inst.id, { note: e.target.value })}
                            style={{ ...inp }} placeholder="e.g. First instalment" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingTop: 8, borderTop: '1px dashed #e2e8f0', marginTop: 4 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Instalment Total:</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: instalmentTotal > totalAmount ? '#dc2626' : '#16a34a' }}>
                      {formatCurrency(instalmentTotal)}
                    </span>
                    {instalmentTotal > totalAmount && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>⚠ Exceeds total</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Summaries */}
          <div style={{ display: 'grid', gridTemplateColumns: isMultiModel ? '1fr' : '1fr 1fr', gap: 16 }}>

            {/* Payment summary */}
            <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '20px 24px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 14 }}>{isCredit ? 'Supplier Credit Summary' : 'Payment Summary'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(isCredit ? [
                  { label: 'Total Shipment Amount', value: formatCurrency(totalAmount), color: '#111827', bold: true },
                  { label: 'Supplier Payable',      value: formatCurrency(totalAmount), color: '#d97706', bold: true, border: true },
                ] : [
                  { label: 'Total Shipment Amount', value: formatCurrency(totalAmount), color: '#111827', bold: true },
                  { label: 'Amount Paid',           value: formatCurrency(effectivePaid), color: '#16a34a', bold: false },
                  { label: 'Pending Balance',       value: formatCurrency(Math.max(0, totalAmount - effectivePaid)), color: Math.max(0, totalAmount - effectivePaid) > 0 ? '#dc2626' : '#9ca3af', bold: true, border: true },
                ]).map(({ label, value, color, bold, border }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: border ? '10px 0 0 0' : '3px 0', borderTop: border ? '2px solid #f1f5f9' : 'none', marginTop: border ? 4 : 0 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{label}:</span>
                    <span style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? 800 : 600, color }}>{value}</span>
                  </div>
                ))}
              </div>
              {showPaymentDetails && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Method: </span>
                  {installments.length > 0 ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>
                      Mixed ({installments.filter(i => i.mode === 'cash').length} Cash + {installments.filter(i => i.mode === 'bank').length} Bank)
                    </span>
                  ) : paymentMode === 'cash' ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>💵 Cash</span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>
                      🏦 {banks.find(b => b.id === selectedBankId)?.name || 'Bank Transfer'}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Product summary (single-model only) */}
            {!isMultiModel && (
              <div style={{ backgroundColor: '#f1f5f9', borderRadius: 12, border: '1px solid #cbd5e1', padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>Product Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 8px' }}>
                  {[
                    ['Brand',    productSummary.brandName],
                    ['Model',    productSummary.modelName],
                    ['Category', productSummary.category],
                    ['Stock',    `${productSummary.stock} units`],
                    ['Sell Price', formatCurrency(productSummary.sellPrice)],
                    ['Status',   productSummary.status],
                    ['Costing',  costingOption === 'with' ? 'With Costing' : 'Without Costing'],
                    ['Type',     isCredit ? 'Third-party Inventory' : 'Owned Inventory'],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</span>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {productSummary.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid #cbd5e1' }}>
                    <MapPin size={13} color="#334155" />
                    <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 700 }}>{productSummary.location}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
            <button onClick={handleBack}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
              <ArrowLeft size={16} /> Back
            </button>
            <button onClick={handleSubmit}
              disabled={!isValid || isSaving || isGeneratingId}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '12px 30px', borderRadius: 9, border: 'none',
                backgroundColor: !isValid ? '#e5e7eb' : '#0f172a',
                color: !isValid ? '#9ca3af' : '#fff',
                fontWeight: 800, fontSize: 14,
                cursor: (!isValid || isSaving || isGeneratingId) ? 'not-allowed' : 'pointer',
                boxShadow: isValid ? '0 2px 12px rgba(15,23,42,0.25)' : 'none',
                opacity: isSaving || isGeneratingId ? 0.8 : 1, transition: 'all 0.2s',
              }}>
              {isGeneratingId
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Preparing...</>
                : isSaving
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
                : <><Save size={16} /> Submit Inventory</>
              }
            </button>
          </div>

        </div>
      </div>

      {/* Plain fixed-position modal — bypasses all Radix/portal/z-index issues */}
      {duplicateDialogOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => handleDuplicateDialogOpenChange(false)}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.55)',
              zIndex: 99998,
            }}
          />
          {/* Dialog box */}
          <div style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 99999,
            width: '90%', maxWidth: 480,
            backgroundColor: '#fff',
            borderRadius: 14,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            overflow: 'hidden',
          }}>
            {/* Red header bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              backgroundColor: '#fef2f2', borderBottom: '1px solid #fecaca',
              padding: '16px 20px',
            }}>
              <AlertCircle size={22} color="#dc2626" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#991b1b' }}>
                Duplicate Inventory Detected
              </span>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px' }}>
              {(() => {
                const msg = duplicateDialogMessage || 'This inventory item already exists and cannot be saved again.';
                const lines = msg.split('\n');
                return (
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                    {lines.map((line, i) => {
                      if (line.startsWith('• ')) {
                        return (
                          <span key={i} style={{
                            display: 'inline-flex', alignItems: 'center',
                            margin: '3px 4px 3px 0',
                            padding: '3px 12px', borderRadius: 99,
                            backgroundColor: '#fee2e2', color: '#991b1b',
                            fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                            border: '1px solid #fecaca',
                          }}>
                            {line.slice(2)}
                          </span>
                        );
                      }
                      if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
                      return <p key={i} style={{ margin: '0 0 4px 0' }}>{line}</p>;
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 24px 20px',
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => handleDuplicateDialogOpenChange(false)}
                style={{
                  backgroundColor: '#0f172a', color: '#fff',
                  border: 'none', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', borderRadius: 8,
                  padding: '10px 24px',
                }}
              >
                Got it, go back
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
};