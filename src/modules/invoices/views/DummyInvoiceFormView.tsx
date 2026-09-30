// Dummy Invoice Module - Form View
// Fully manual form — no inventory lookup, free-text products, all fields editable
// Used for: Dummy, Proforma, Booking, Quotation invoices

import React, { useState, useRef, useEffect } from 'react';
import {
  Plus, Trash2, X, Loader2, ChevronDown, FileText, User,
  Phone, Hash, ArrowLeft, Check, Save, Download,
  ImagePlus, Stamp, ClipboardList, Receipt, Paperclip,
} from 'lucide-react';
import { downloadInvoicePdf } from '../models/invoicePdfService';
import { toast } from 'sonner';
import { UseDummyInvoiceFormViewModelReturn } from '../viewModels/useDummyInvoiceFormViewModel';
import { DummyInvoiceType } from '../models/DummyInvoiceFirebaseService';
import { sanitizeNameInput, sanitizePhoneInput, sanitizeCNICInput } from '../../../utils/validators';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

const TYPES: { value: DummyInvoiceType; label: string; prefix: string; color: string; bg: string; border: string }[] = [
  { value: 'Dummy',     label: 'Fictitious Invoice', prefix: 'DUM', color: '#334155', bg: '#f1f5f9', border: '#cbd5e1' },
  { value: 'Proforma',  label: 'Proforma Invoice', prefix: 'PRF', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  { value: 'Booking',   label: 'Booking Invoice',  prefix: 'BOK', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'Quotation', label: 'Quotation',        prefix: 'QUO', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
];

const STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted'];

const S = {
  card: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '22px 24px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' } as React.CSSProperties,
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 } as React.CSSProperties,
  input: (err?: boolean): React.CSSProperties => ({
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: `1px solid ${err ? '#ef4444' : '#d1d5db'}`,
    backgroundColor: err ? '#fef2f2' : '#fff',
    fontSize: 13, color: '#111827', outline: 'none', boxSizing: 'border-box',
  }),
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } as React.CSSProperties,
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 } as React.CSSProperties,
};

/** Small colored icon chip used before a section title — gives each card a
 *  distinct visual identity at a glance instead of uniform grey headings. */
function SectionTitle({ icon, color, bg, children }: { icon: React.ReactNode; color: string; bg: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>{children}</div>
    </div>
  );
}

interface Props extends UseDummyInvoiceFormViewModelReturn {}

export function DummyInvoiceFormView(props: Props) {
  // Follows the Admin's global currency setting — symbol-only, no conversion.
  const { symbol: currencySymbol } = useGlobalCurrency();
  const {
    invoiceType, setInvoiceType,
    invoiceNumber, setInvoiceNumber,
    date, setDate, validUntil, setValidUntil,
    customerName, setCustomerName,
    customerPhone, setCustomerPhone,
    customerPhone2, setCustomerPhone2,
    customerCNIC, setCustomerCNIC,
    customerCity, setCustomerCity,
    customerProvince, setCustomerProvince,
    customerAddress, setCustomerAddress,
    products, addProduct, removeProduct, updateProduct,
    totalAmount,
    salesperson, setSalesperson,
    notes, setNotes,
    status, setStatus,
    savedSalespersons,
    imageDataUrl, isUploadingImage, handleImageUpload, removeImage,
    digitalStamp, setDigitalStamp,
    isEditing, isSaving, isLoading,
    handleSave, handleCancel,
  } = props;

  const [showSpDropdown, setShowSpDropdown] = useState(false);
  const spRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = ''; // allow re-selecting the same file later
  };

  useEffect(() => {
    const h = (e: MouseEvent) => { if (spRef.current && !spRef.current.contains(e.target as Node)) setShowSpDropdown(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selectedType = TYPES.find(t => t.value === invoiceType) || TYPES[0];

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10, color: '#64748b' }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
      Loading…
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f8fafc' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 3px rgba(15,23,42,0.03)' }}>
        <button onClick={handleCancel}
          style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          <ArrowLeft size={17} />
        </button>
        <div style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: selectedType.color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 8px ${selectedType.color}40` }}>
          <FileText size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>
            {isEditing ? `Edit ${selectedType.label}` : `New ${selectedType.label}`}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', marginTop: 1 }}>
            {invoiceNumber || 'Generating number…'}
          </div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#94a3b8', padding: '3px 8px', borderRadius: 999, border: '1px solid #e2e8f0', textTransform: 'uppercase' }}>
          Independent of Inventory
        </div>
        {/* PDF Download */}
        <button
          type="button"
          title="Download PDF"
          onClick={async () => {
            try {
              const invoiceForPdf: any = {
                id: '', invoiceNumber: invoiceNumber, date,
                status: 'Draft', deliveryStatus: 'Self-collect',
                customerName: customerName || '', customerPhone: customerPhone || '',
                customerPhone2, customerCNIC: customerCNIC || '',
                customerCity: customerCity || '', customerProvince: customerProvince || '',
                customerAddress,
                salesperson,
                totalAmount,
                paidAmount: 0, remainingAmount: totalAmount, paymentStatus: 'Unpaid',
                payments: [],
                products: products.map((p, i) => ({
                  id: p.id || String(i), productId: '', productName: p.productName,
                  brandName: '', modelName: p.productName, category: '',
                  description: p.description || '', quantity: p.quantity,
                  price: p.unitPrice, total: p.total, serialNumbers: [], currency: 'AED',
                })),
                exchangeWarrantyNote: notes || '',
                selectedCurrencies: ['AED'],
                supplierCostTotal: 0, purchaseCostTotal: 0, miscExpense: 0,
                deductionCharges: 0, cargoAmount: 0, customsAmount: 0, agentAmount: 0,
                branch: '', digitalStamp, imageDataUrl: imageDataUrl || undefined,
              };
              await downloadInvoicePdf(invoiceForPdf);
            } catch (err: any) {
              toast.error('PDF failed: ' + (err?.message || 'error'));
            }
          }}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          <Download size={15} /> PDF
        </button>

        {/* Status */}
        <div style={{ position: 'relative' }}>
          <select value={status} onChange={e => setStatus(e.target.value)}
            style={{ padding: '6px 28px 6px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#374151', backgroundColor: '#f8fafc', appearance: 'none', cursor: 'pointer', outline: 'none' }}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Invoice Type selector */}
        <div style={S.card}>
          <SectionTitle icon={<Receipt size={15} color="#334155" />} bg="#f1f5f9" color="#334155">Invoice Type</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {TYPES.map(t => {
              const sel = invoiceType === t.value;
              return (
                <button key={t.value} type="button" onClick={() => setInvoiceType(t.value)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${sel ? t.border : '#e5e7eb'}`,
                    backgroundColor: sel ? t.bg : '#fff', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 6px', borderRadius: 4, backgroundColor: sel ? t.color : '#e5e7eb', color: sel ? '#fff' : '#6b7280' }}>
                    {t.prefix}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: sel ? 700 : 500, color: sel ? t.color : '#374151' }}>{t.label}</span>
                  {sel && <Check size={13} color={t.color} style={{ marginLeft: 'auto' }} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Invoice meta */}
        <div style={S.card}>
          <SectionTitle icon={<Hash size={15} color="#1d4ed8" />} bg="#eff6ff" color="#1d4ed8">Invoice Details</SectionTitle>
          <div style={S.grid3}>
            <div>
              <label style={S.label}>Invoice Number</label>
              <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} style={S.input()} />
            </div>
            <div>
              <label style={S.label}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={S.input()} />
            </div>
            <div>
              <label style={S.label}>Valid Until {invoiceType === 'Quotation' ? '*' : '(optional)'}</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={S.input()} />
            </div>
          </div>
        </div>

        {/* Customer info */}
        <div style={S.card}>
          <SectionTitle icon={<User size={15} color="#15803d" />} bg="#f0fdf4" color="#15803d">Customer Information</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={S.grid2}>
              <div>
                <label style={S.label}>Customer Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" value={customerName} onChange={e => setCustomerName(sanitizeNameInput(e.target.value))} style={S.input(!customerName.trim())} placeholder="e.g. John Doe" />
              </div>
              <div>
                <label style={S.label}>Identity</label>
                <input type="text" value={customerCNIC} onChange={e => setCustomerCNIC(sanitizeCNICInput(e.target.value))} style={S.input()} placeholder="e.g. 12345-1234567-1" />
              </div>
            </div>
            <div style={S.grid2}>
              <div>
                <label style={S.label}>Phone Number</label>
                <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(sanitizePhoneInput(e.target.value))} style={S.input()} placeholder="e.g. +971501234567" />
              </div>
              <div>
                <label style={S.label}>Second Phone</label>
                <input type="tel" value={customerPhone2} onChange={e => setCustomerPhone2(sanitizePhoneInput(e.target.value))} style={S.input()} placeholder="e.g. +971509876543" />
              </div>
            </div>
            <div style={S.grid3}>
              <div>
                <label style={S.label}>Country</label>
                <input type="text" value={customerProvince} onChange={e => setCustomerProvince(e.target.value)} style={S.input()} />
              </div>
              <div>
                <label style={S.label}>City</label>
                <input type="text" value={customerCity} onChange={e => setCustomerCity(e.target.value)} style={S.input()} />
              </div>
              <div>
                <label style={S.label}>Address</label>
                <input type="text" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} style={S.input()} />
              </div>
            </div>
          </div>
        </div>

        {/* Products — fully manual */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <SectionTitle icon={<ClipboardList size={15} color="#b45309" />} bg="#fffbeb" color="#b45309">
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                Products / Services
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>({products.length})</span>
              </span>
            </SectionTitle>
            <button type="button" onClick={addProduct}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', backgroundColor: '#0f172a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={14} /> Add Line
            </button>
          </div>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 100px 100px 36px', gap: 8, marginBottom: 8 }}>
            {['Product / Service', 'Description', 'Qty', 'Unit Price', 'Total', ''].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {products.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 80px 100px 100px 36px', gap: 8, alignItems: 'center' }}>
                <input type="text" value={p.productName}
                  onChange={e => updateProduct(p.id, 'productName', e.target.value)}
                  placeholder="Product name"
                  style={{ ...S.input(!p.productName.trim() && products.length > 1), fontSize: 12 }} />
                <input type="text" value={p.description}
                  onChange={e => updateProduct(p.id, 'description', e.target.value)}
                  placeholder="Details / specs"
                  style={{ ...S.input(), fontSize: 12 }} />
                <input type="number" min={1} value={p.quantity}
                  onChange={e => updateProduct(p.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ ...S.input(), textAlign: 'center', fontSize: 12 }} />
                <input type="number" min={0} step="any" value={p.unitPrice || ''}
                  onChange={e => updateProduct(p.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  style={{ ...S.input(), textAlign: 'right', fontSize: 12 }} />
                <div style={{ padding: '9px 10px', borderRadius: 8, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                  {p.total > 0 ? p.total.toLocaleString('en-AE', { minimumFractionDigits: 2 }) : '—'}
                </div>
                <button type="button" onClick={() => removeProduct(p.id)}
                  disabled={products.length === 1}
                  style={{ width: 32, height: 32, borderRadius: 7, border: '1px solid #fecaca', backgroundColor: '#fef2f2', cursor: products.length === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: products.length === 1 ? 0.4 : 1 }}>
                  <Trash2 size={13} color="#ef4444" />
                </button>
              </div>
            ))}
          </div>

          {/* Total */}
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ padding: '12px 20px', backgroundColor: '#0f172a', borderRadius: 10, display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
                {currencySymbol} {totalAmount.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Attachment + Digital Stamp */}
        <div style={S.card}>
          <SectionTitle icon={<Paperclip size={15} color="#7c3aed" />} bg="#f5f3ff" color="#7c3aed">Attachment &amp; Digital Stamp</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Image attachment */}
            <div>
              <label style={S.label}>Attached Image <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional — printed on the PDF)</span></label>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} />
              {imageDataUrl ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={imageDataUrl} alt="Attachment preview"
                    style={{ width: 168, height: 168, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0', display: 'block' }} />
                  <button type="button" onClick={removeImage} title="Remove image"
                    style={{ position: 'absolute', top: -8, right: -8, width: 26, height: 26, borderRadius: '50%', border: '2px solid #fff', backgroundColor: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
                    <X size={13} strokeWidth={3} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploadingImage}
                  style={{
                    width: 168, height: 168, borderRadius: 10, border: '2px dashed #cbd5e1', backgroundColor: '#f8fafc',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                    cursor: isUploadingImage ? 'wait' : 'pointer', color: '#64748b',
                  }}>
                  {isUploadingImage
                    ? <><Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /><span style={{ fontSize: 11, fontWeight: 600 }}>Processing…</span></>
                    : <><ImagePlus size={22} /><span style={{ fontSize: 11, fontWeight: 600 }}>Click to upload</span></>}
                </button>
              )}
            </div>

            {/* Digital stamp toggle */}
            <div>
              <label style={S.label}>Company Stamp</label>
              <button type="button" onClick={() => setDigitalStamp(!digitalStamp)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                  padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${digitalStamp ? '#a78bfa' : '#e2e8f0'}`,
                  backgroundColor: digitalStamp ? '#f5f3ff' : '#fff',
                }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                  backgroundColor: digitalStamp ? '#7c3aed' : '#f1f5f9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Stamp size={18} color={digitalStamp ? '#fff' : '#94a3b8'} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Digital Stamp on PDF</div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>Prints the company stamp on the generated PDF</div>
                </div>
                <div style={{
                  width: 40, height: 22, borderRadius: 999, flexShrink: 0, position: 'relative',
                  backgroundColor: digitalStamp ? '#7c3aed' : '#d1d5db', transition: 'background-color 0.15s',
                }}>
                  <div style={{
                    position: 'absolute', top: 2, left: digitalStamp ? 20 : 2, width: 18, height: 18, borderRadius: '50%',
                    backgroundColor: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Sales & Notes */}
        <div style={S.card}>
          <SectionTitle icon={<Phone size={15} color="#334155" />} bg="#f1f5f9" color="#334155">Sales Details</SectionTitle>
          <div style={S.grid2}>
            {/* Salesperson */}
            <div ref={spRef} style={{ position: 'relative' }}>
              <label style={S.label}>Salesperson</label>
              <input type="text" value={salesperson}
                onChange={e => { setSalesperson(e.target.value); setShowSpDropdown(true); }}
                onFocus={() => setShowSpDropdown(true)}
                placeholder=""
                autoComplete="off"
                style={S.input()} />
              {showSpDropdown && (() => {
                const filtered = savedSalespersons.filter(s =>
                  !salesperson || s.toLowerCase().includes(salesperson.toLowerCase())
                );
                if (filtered.length === 0) return null;
                return (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 99, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 180, overflowY: 'auto' }}>
                    {filtered.map(sp => (
                      <div key={sp} onMouseDown={e => { e.preventDefault(); setSalesperson(sp); setShowSpDropdown(false); }}
                        style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#111827' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}>
                        {sp}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            {/* Notes */}
            <div>
              <label style={S.label}>Notes / Terms</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder=""
                style={{ ...S.input(), resize: 'vertical', lineHeight: 1.5 }} />
            </div>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" onClick={handleCancel}
          style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={15} /> Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={isSaving}
          style={{ padding: '11px 28px', borderRadius: 8, border: 'none', backgroundColor: isSaving ? '#94a3b8' : '#0f172a', color: '#fff', fontWeight: 700, fontSize: 14, cursor: isSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          {isSaving
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
            : <><Save size={16} /> {isEditing ? 'Update' : 'Save'} {selectedType.label}</>}
        </button>
      </div>
    </div>
  );
}