// Inventory Module - View Layer
// InventoryPayablesView — supplier-credit stock that has sold out and is still owed

import React from 'react';
import { ArrowLeft, Wallet, Search, Loader2, X, Download } from 'lucide-react';
import { UseInventoryPayablesViewModelReturn } from '../viewModels/useInventoryPayablesViewModel';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import { exportReportToPdf, exportReportToExcel } from '../../../shared/reportExport/reportExport';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8,
  fontSize: 13, outline: 'none', color: '#111827', backgroundColor: '#fff', boxSizing: 'border-box',
};

export const InventoryPayablesView: React.FC<UseInventoryPayablesViewModelReturn> = ({
  filteredRecords, isLoading, error, search, setSearch, totalPayable, totalFuturePayable,
  payProduct, setPayProduct, payAmount, setPayAmount, payChannel, setPayChannel,
  banks, isBanksLoading, selectedBankId, setSelectedBankId,
  isSubmittingPayment, paymentError, handleRecordPayment, formatCurrency, onBack,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc' }}>
    <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          <ArrowLeft size={17} />
        </button>
        <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Wallet size={17} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Inventory Payables</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Supplier-credit stock that has sold out — amounts still owed</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Due Now (Sold Out)</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#b45309' }}>{formatCurrency(totalPayable)}</div>
          {totalFuturePayable > 0 && (
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
              + {formatCurrency(totalFuturePayable)} still in stock
            </div>
          )}
        </div>
        <button
          onClick={() => {
            const rows = filteredRecords.map(r => {
              const remaining = Math.max(0, (r.supplierCost || 0) - (r.supplierPaidAmount || 0));
              return [
                r.brandName, r.modelName, (r.stock ?? 0) === 0 ? 'Sold Out - Due' : `${r.stock} in stock`,
                formatCurrency(r.supplierCost), formatCurrency(r.supplierPaidAmount || 0),
                formatCurrency(remaining), r.supplierPaymentStatus || 'Unpaid',
              ];
            });
            exportReportToExcel({
              title: 'Inventory Payables',
              subtitle: `Due Now: ${formatCurrency(totalPayable)}`,
              columns: ['Brand', 'Model', 'Stock Status', 'Supplier Cost', 'Paid', 'Remaining', 'Status'].map(h => ({ header: h })),
              rows,
              filename: `inventory-payables-${new Date().toISOString().slice(0, 10)}`,
            });
          }}
          disabled={filteredRecords.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e2e8f0',
            borderRadius: 9, backgroundColor: '#fff', color: '#334155', fontSize: 13, fontWeight: 600,
            cursor: filteredRecords.length === 0 ? 'not-allowed' : 'pointer', opacity: filteredRecords.length === 0 ? 0.5 : 1,
            whiteSpace: 'nowrap' }}>
          <Download size={14} /> Excel
        </button>
        <button
          onClick={() => {
            const rows = filteredRecords.map(r => {
              const remaining = Math.max(0, (r.supplierCost || 0) - (r.supplierPaidAmount || 0));
              return [
                r.brandName, r.modelName, (r.stock ?? 0) === 0 ? 'Sold Out - Due' : `${r.stock} in stock`,
                formatCurrency(r.supplierCost), formatCurrency(r.supplierPaidAmount || 0),
                formatCurrency(remaining), r.supplierPaymentStatus || 'Unpaid',
              ];
            });
            exportReportToPdf({
              title: 'Inventory Payables',
              subtitle: `Due Now: ${formatCurrency(totalPayable)}`,
              columns: ['Brand', 'Model', 'Stock Status', 'Supplier Cost', 'Paid', 'Remaining', 'Status'].map(h => ({ header: h })),
              rows,
              filename: `inventory-payables-${new Date().toISOString().slice(0, 10)}`,
            });
          }}
          disabled={filteredRecords.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid #e2e8f0',
            borderRadius: 9, backgroundColor: '#fff', color: '#334155', fontSize: 13, fontWeight: 600,
            cursor: filteredRecords.length === 0 ? 'not-allowed' : 'pointer', opacity: filteredRecords.length === 0 ? 0.5 : 1,
            whiteSpace: 'nowrap' }}>
          <Download size={14} /> PDF
        </button>
      </div>
    </div>

    <div style={{ padding: '14px 24px' }}>
      <div style={{ position: 'relative', maxWidth: 320 }}>
        <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search brand, model…"
          style={{ width: '100%', padding: '9px 12px 9px 32px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' }} />
      </div>
    </div>

    <div style={{ flex: 1, overflow: 'hidden', padding: '0 24px 24px', display: 'flex', flexDirection: 'column' }}>
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
        </div>
      ) : error ? (
        <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>
      ) : filteredRecords.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>No supplier-credit inventory with an outstanding balance.</div>
      ) : (
        <LockedScrollTable maxHeight="65vh">
        <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {['Brand', 'Model', 'Stock Status', 'Supplier Cost', 'Paid', 'Remaining', 'Status', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map(r => {
              const remaining = Math.max(0, (r.supplierCost || 0) - (r.supplierPaidAmount || 0));
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{r.brandName}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{r.modelName}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                      backgroundColor: (r.stock ?? 0) === 0 ? '#fee2e2' : '#e0f2fe',
                      color: (r.stock ?? 0) === 0 ? '#b91c1c' : '#0369a1',
                    }}>
                      {(r.stock ?? 0) === 0 ? 'Sold Out — Due' : `${r.stock} in stock`}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{formatCurrency(r.supplierCost)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#16a34a' }}>{formatCurrency(r.supplierPaidAmount || 0)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#b45309' }}>{formatCurrency(remaining)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                      backgroundColor: r.supplierPaymentStatus === 'Partial' ? '#fef3c7' : '#fee2e2',
                      color: r.supplierPaymentStatus === 'Partial' ? '#92400e' : '#b91c1c',
                    }}>
                      {r.supplierPaymentStatus || 'Unpaid'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => setPayProduct(r)}
                      style={{ padding: '6px 12px', borderRadius: 6, border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Record Payment
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </LockedScrollTable>
      )}
    </div>

    {/* Record Payment modal */}
    {payProduct && (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, width: 380, maxWidth: '90vw' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              Pay {payProduct.brandName} — {payProduct.modelName}
            </div>
            <button onClick={() => setPayProduct(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
            Remaining: {formatCurrency(Math.max(0, (payProduct.supplierCost || 0) - (payProduct.supplierPaidAmount || 0)))}
          </div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Amount ({getGlobalCurrencySymbol()}) *</label>
          <input type="number" min={0} value={payAmount} onChange={e => setPayAmount(Number(e.target.value))} style={{ ...inp, marginBottom: 14 }} />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Paid Via</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: payChannel === 'Bank' ? 12 : 18 }}>
            {(['Cash', 'Bank'] as const).map(ch => (
              <button key={ch} onClick={() => setPayChannel(ch)} style={{
                padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                border: `2px solid ${payChannel === ch ? '#0f172a' : '#e2e8f0'}`,
                backgroundColor: payChannel === ch ? '#f1f5f9' : '#fff', color: payChannel === ch ? '#0f172a' : '#6b7280',
              }}>
                {ch}
              </button>
            ))}
          </div>

          {payChannel === 'Bank' && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Bank Account *</label>
              <select value={selectedBankId} onChange={e => setSelectedBankId(e.target.value)} style={inp} disabled={isBanksLoading}>
                <option value="">{isBanksLoading ? 'Loading banks…' : '— Select bank account —'}</option>
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{b.name}{typeof (b as any).balance === 'number' ? ` (${formatCurrency((b as any).balance)})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {paymentError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{paymentError}</p>}

          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>
            This will deduct {formatCurrency(payAmount)} from {payChannel === 'Cash' ? 'cash' : 'the selected bank account'} and update the payment status automatically.
          </div>

          <button onClick={handleRecordPayment} disabled={isSubmittingPayment}
            style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', backgroundColor: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: isSubmittingPayment ? 0.7 : 1 }}>
            {isSubmittingPayment ? 'Saving…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    )}
  </div>
);