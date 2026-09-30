// Inventory Module - View Layer
// InventoryReturnView - Add Returned Inventory
// Step 1: choose condition (Not Damaged / Damaged) via two cards.
// Step 2: search serial number, shows linked invoice (both conditions), submit.

import React from 'react';
import { ArrowLeft, Undo2, Search, Loader2, CheckCircle2, XCircle, AlertTriangle, PackageCheck, PackageX, Check } from 'lucide-react';
import { UseInventoryReturnViewModelReturn } from '../viewModels/useInventoryReturnViewModel';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8,
  fontSize: 14, outline: 'none', color: '#111827', backgroundColor: '#fff', boxSizing: 'border-box',
};

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          <ArrowLeft size={17} />
        </button>
        <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Undo2 size={17} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Add Returned Inventory</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Choose how this return should be processed</div>
        </div>
      </div>
    </div>
  );
}

export const InventoryReturnView: React.FC<UseInventoryReturnViewModelReturn> = ({
  step, chooseCondition, backToChoose,
  serialInput, setSerialInput, isSearching, foundProduct, linkedInvoice, notFound, handleSearch, selectInvoiceSerial,
  isDamaged, damageReason, setDamageReason,
  isSubmitting, handleSubmit, reset, onBack,
  recentInvoices, damagedRecords,
}) => {
  // Follows the Admin's global currency setting — symbol-only, no conversion.
  const { symbol: currencySymbol } = useGlobalCurrency();

  // ── Step 1: two condition cards ─────────────────────────────────────────
  if (step === 'choose') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc' }}>
        <Header onBack={onBack} />
        <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 20, maxWidth: 900, margin: '0 auto 20px' }}>
            Is the returned product damaged?
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, maxWidth: 900, margin: '0 auto' }}>
            <button
              onClick={() => chooseCondition(false)}
              style={{ display: 'flex', flexDirection: 'column', padding: 22, textAlign: 'left', cursor: 'pointer', border: '2px solid #e2e8f0', borderRadius: 14, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#dcfce7' }}>
                  <PackageCheck size={24} color="#16a34a" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Not Damaged</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Back to stock</div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, margin: '0 0 14px 0' }}>
                Returns to stock under the same serial number with a fresh stock-in date. Linked invoice moves to Deleted Invoices.
              </p>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>Select →</span>
            </button>
            <button
              onClick={() => chooseCondition(true)}
              style={{ display: 'flex', flexDirection: 'column', padding: 22, textAlign: 'left', cursor: 'pointer', border: '2px solid #e2e8f0', borderRadius: 14, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#fee2e2' }}>
                  <PackageX size={24} color="#dc2626" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Damaged</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Move to Damaged Inventory</div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, margin: '0 0 14px 0' }}>
                Removed from live stock entirely and archived. Won't appear in inventory list/report. Linked invoice also moves to Deleted Invoices.
              </p>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>Select →</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: search + result ──────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc' }}>
      <Header onBack={backToChoose} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8,
            backgroundColor: isDamaged ? '#fef2f2' : '#f0fdf4', color: isDamaged ? '#dc2626' : '#16a34a',
            fontWeight: 700, fontSize: 13,
          }}>
            <Check size={15} /> Condition: {isDamaged ? 'Damaged' : 'Not Damaged'}
            <button onClick={backToChoose} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }}>
              Change
            </button>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Serial Number *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text" value={serialInput}
                onChange={e => setSerialInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Scan or type serial number"
                style={inp}
              />
              <button
                onClick={handleSearch} disabled={isSearching}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 8, border: 'none', backgroundColor: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {isSearching ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={15} />} Search
              </button>
            </div>
          </div>

          {notFound && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#dc2626', fontSize: 13 }}>
              <XCircle size={16} /> No inventory item found with that serial number.
            </div>
          )}

          {foundProduct && (
            <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', fontWeight: 700, fontSize: 13 }}>
                <CheckCircle2 size={16} /> Item found
              </div>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{foundProduct.brandName} — {foundProduct.modelName}</div>
                <div style={{ color: '#64748b', marginTop: 2 }}>
                  Location: {foundProduct.location || '—'} · Ownership: {foundProduct.ownershipType || '—'}
                </div>
              </div>

              {linkedInvoice && (
                <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, fontSize: 13 }}>
                  <div style={{ fontWeight: 700, color: '#1e3a8a' }}>Linked Invoice: {linkedInvoice.invoiceNumber}</div>
                  <div style={{ color: '#1e40af', marginTop: 2 }}>
                    {linkedInvoice.customerName} · {linkedInvoice.date} · {currencySymbol} {linkedInvoice.totalAmount?.toLocaleString()}
                  </div>
                  <div style={{ color: '#1e40af', marginTop: 4, fontSize: 12 }}>
                    This invoice will move to Deleted Invoices when you submit.
                  </div>
                </div>
              )}

              {isDamaged && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Damage Note (optional)</label>
                  <textarea
                    value={damageReason} onChange={e => setDamageReason(e.target.value)}
                    rows={3} placeholder="Describe the damage…"
                    style={{ ...inp, resize: 'vertical' }}
                  />
                </div>
              )}

              {!isDamaged && foundProduct.ownershipType === 'Credit' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92400e' }}>
                  <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                  This item is currently on supplier credit. Returning it will mark the product as Owned.
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={reset} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  onClick={handleSubmit} disabled={isSubmitting}
                  style={{
                    padding: '10px 20px', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    backgroundColor: isDamaged ? '#dc2626' : '#16a34a', opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? 'Processing…' : isDamaged ? 'Move to Damaged Inventory' : 'Return to Stock'}
                </button>
              </div>
            </div>
          )}

          {/* Recent Invoices — shown for both conditions, helps locate serials */}
          <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Recent Invoices</div>
            {recentInvoices.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>No invoices found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                {recentInvoices.map(inv => (
                  <div key={inv.id} style={{ padding: '8px 10px', borderRadius: 8, backgroundColor: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{inv.invoiceNumber}</span>
                      <span style={{ color: '#64748b' }}>{inv.customerName}</span>
                      <span style={{ color: '#64748b' }}>{inv.date}</span>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{currencySymbol} {inv.totalAmount?.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {(inv.products || []).flatMap(p => (p.serialNumbers || []).filter(Boolean).map(serial => ({ serial, productId: p.productId }))).map(({ serial, productId }) => (
                        <button
                          key={serial}
                          onClick={() => selectInvoiceSerial(serial, productId)}
                          title="Click to select this serial and process the return"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                            padding: '5px 10px', borderRadius: 6,
                            border: '1.5px solid #0f172a', backgroundColor: '#0f172a', color: '#fff', cursor: 'pointer',
                          }}
                        >
                          {serial} <span style={{ fontWeight: 600 }}>· Select</span>
                        </button>
                      ))}
                    </div>
                    {(inv.products || []).every(p => !(p.serialNumbers || []).some(Boolean)) && (
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>No serial numbers recorded on this invoice.</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Damaged Records — shown only in the Damaged flow, confirms items are saved */}
          {isDamaged && (
            <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #fecaca', padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Damaged Inventory (recent)</div>
              {damagedRecords.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9ca3af' }}>No damaged records yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {damagedRecords.map(d => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 8, backgroundColor: '#fef2f2', fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{d.brandName} {d.modelName}</span>
                      <span style={{ fontFamily: 'monospace', color: '#64748b' }}>{d.serialNumber}</span>
                      <span style={{ color: '#64748b' }}>{d.damagedAt ? new Date(d.damagedAt).toLocaleDateString() : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};