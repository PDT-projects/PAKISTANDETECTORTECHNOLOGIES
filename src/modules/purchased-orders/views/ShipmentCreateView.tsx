// Purchased Orders — create shipment
// Product lines, import charges, and a live landed-cost preview.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Check, Loader2, Calculator } from 'lucide-react';
import { PurchasedOrderFirebaseService, nextShipmentNumber } from '../models/purchasedOrderFirebaseService';
import {
  calculateShipmentCosting, validateShipment,
  emptyLine, money,
} from '../models/purchasedOrderService';
import {
  ShipmentLine, ShipmentCurrency, DisplayCurrency,
  SHIPMENT_CURRENCIES,
} from '../models/types';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

const S = {
  card:  { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '18px 20px' } as React.CSSProperties,
  h:     { fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 } as React.CSSProperties,
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 } as React.CSSProperties,
  inp:   { width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: '#fff', fontSize: 13, color: '#111827', outline: 'none', boxSizing: 'border-box' } as React.CSSProperties,
  grid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 } as React.CSSProperties,
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * AED per one unit of the supplier's currency, as a starting point.
 *
 * A default rather than a lookup: the rate on the day of a purchase order is
 * whatever the bank gave, and an accountant correcting it against the advice is
 * the only person who knows the real figure. A live rate would look
 * authoritative while being just as wrong.
 */
const RATE_DEFAULTS: Record<ShipmentCurrency, number> = {
  AED: 1,
  USD: 3.67,
  EUR: 4.00,
  GBP: 4.65,
  PKR: 0.0131,
  SAR: 0.98,
  CAD: 2.70,
};

export const ShipmentCreateView: React.FC = () => {
  const navigate = useNavigate();

  const [brandName, setBrandName]   = useState('');
  const [shipmentNumber, setNumber] = useState('');
  const [supplierName, setSupplier] = useState('');
  const [originCountry, setOrigin]  = useState('');
  const [destinationCountry, setDest] = useState('');

  // Stamped by the system, not asked for. A purchase order is raised on the day
  // it is raised; backdating is a correction, and a correction belongs on the
  // details screen where it reads as a change rather than a default.
  const orderDate = today();

  // The costing engine reaches its AED base by multiplying every line by this
  // rate, so both fields have to reach the document. They are asked for rather
  // than assumed, because a USD 19,076 proforma booked at rate 1 would land as
  // AED 19,076 instead of AED 70,009 — wrong by 73%, with nothing reporting it.
  const [currency, setCurrency] = useState<ShipmentCurrency>('AED');
  const [exchangeRate, setRate] = useState(1);

  // What every money() call below displays in — the Admin's global currency
  // pick, same as the List and Detail pages. Falls back to AED if that pick
  // (e.g. a currency this module's costing sheet doesn't carry a rate for)
  // isn't one of the six this module supports. This is the landed-cost
  // display currency, separate from `currency` above, which is what the
  // supplier billed in.
  const { code: globalCode } = useGlobalCurrency();
  const view: DisplayCurrency = (SHIPMENT_CURRENCIES as string[]).includes(globalCode)
    ? (globalCode as DisplayCurrency)
    : 'AED';

  const [freightAmount, setFreight] = useState(0);
  const [customsAmount, setCustoms] = useState(0);
  const [otherCharges, setOther]    = useState(0);
  const [salesTaxAmount, setTax]    = useState(0);
  const [notes, setNotes]           = useState('');

  const [lines, setLines]           = useState<ShipmentLine[]>([emptyLine()]);
  const [saving, setSaving]         = useState(false);
  const [errors, setErrors]         = useState<string[]>([]);
  const [numberTouched, setNumberTouched] = useState(false);
  const [rateTouched, setRateTouched]     = useState(false);

  // Changing the currency moves the rate to that currency's default, until
  // someone types a rate of their own. After that it stays put: an accountant
  // who entered the bank's figure should not have it overwritten.
  useEffect(() => {
    if (rateTouched) return;
    setRate(RATE_DEFAULTS[currency] ?? 1);
  }, [currency, rateTouched]);

  // The number follows the brand until someone types over it. Regenerating
  // after that would discard a deliberate choice — a shipment raised against
  // last month's order still needs its own number.
  //
  // There is exactly one generator. A second effect used to run beside this
  // one calling the old suggestShipmentNumber, which produces SHP-BRAND-YY-NNN
  // with no month, and whichever resolved last won — which is why the month
  // kept disappearing from the number.
  useEffect(() => {
    if (numberTouched) return;
    const b = brandName.trim();
    if (!b) { setNumber(''); return; }
    let cancelled = false;
    nextShipmentNumber(b).then(n => { if (!cancelled) setNumber(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, [brandName, numberTouched]);

  /**
   * Product name follows the brand.
   *
   * Every line on a shipment is the same brand — that is what a shipment is —
   * so typing it once on the header and again on every line is work with no
   * decision in it.
   *
   * Only lines still carrying the previous brand are updated. A line someone
   * has typed over keeps what they typed, so correcting the brand does not
   * discard a product name that was deliberately different.
   */
  const prevBrand = useRef('');
  useEffect(() => {
    const next = brandName.trim();
    const prev = prevBrand.current;
    prevBrand.current = next;
    if (next === prev) return;

    setLines(ls => ls.map(l => {
      const current = (l.productName || '').trim();
      if (current === '' || current === prev) return { ...l, productName: next };
      return l;
    }));
  }, [brandName]);

  const addLine = () =>
    // A new line starts on the brand too, for the same reason.
    setLines(p => [...p, { ...emptyLine(), productName: brandName.trim() }]);

  const updateLine = (id: string, field: keyof ShipmentLine, val: any) =>
    setLines(prev => prev.map(l => (l.id === id ? { ...l, [field]: val } : l)));

  const preview = useMemo(
    () => calculateShipmentCosting({
      currency, exchangeRate,
      lines, freightAmount, customsAmount, otherCharges, salesTaxAmount,
    }),
    [currency, exchangeRate, lines, freightAmount, customsAmount, otherCharges, salesTaxAmount],
  );

  const handleSave = async () => {
    const dto = {
      shipmentNumber: shipmentNumber.trim(),
      brandName: brandName.trim(),
      supplierName: supplierName.trim(),
      originCountry: originCountry.trim(),
      destinationCountry: destinationCountry.trim(),
      orderDate,
      // Dispatch, arrival and tracking are recorded on the details screen once
      // the goods are actually moving. A clerk raising the order knows none of
      // them, so the form does not ask.
      shipmentDate: undefined,
      expectedArrivalDate: undefined,
      actualArrivalDate: undefined,
      trackingNumber: undefined,
      currency,
      exchangeRate: Number(exchangeRate) > 0 ? Number(exchangeRate) : 1,
      // A new purchase order is Ordered. It becomes In Transit when a dispatch
      // date is entered on the details screen.
      status: 'Ordered' as const,
      customsStatus: 'Not Applied' as const,
      freightStatus: 'Not Applied' as const,
      costingStatus: 'Pending' as const,
      freightAmount: Number(freightAmount) || 0,
      customsAmount: Number(customsAmount) || 0,
      otherCharges:   Number(otherCharges)   || 0,
      salesTaxAmount: Number(salesTaxAmount) || 0,
      supplierOrderNumber: undefined,
      // discountPercent stays on the line and stays zero. The engine still
      // subtracts it, so a shipment entered before the field was removed keeps
      // its figures.
      lines: lines.filter(l => l.productName.trim()),
      notes: notes.trim() || undefined,
    };

    const v = validateShipment(dto as any);
    if (!v.isValid) {
      setErrors(v.errors);
      toast.error(v.errors[0]);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const created = await PurchasedOrderFirebaseService.create(dto as any);
      toast.success(`Shipment ${created.shipmentNumber} created`);
      navigate(`/purchased-orders/${created.id}`);
    } catch (err: any) {
      const msg = err?.message || 'Failed to create shipment';
      setErrors([msg]);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f8fafc' }}>

      <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => navigate('/purchased-orders')}
          style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={17} color="#64748b" />
        </button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>New Shipment</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Record an incoming import consignment</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {errors.length > 0 && (
          <div style={{ ...S.card, borderColor: '#fecaca', backgroundColor: '#fef2f2' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>
              Fix {errors.length} issue{errors.length === 1 ? '' : 's'} before saving
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#dc2626' }}>
              {errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* Basics.
            No placeholders on the country fields. A greyed-out "Turkey" reads as
            a value at a glance, and the label already says what the field is. */}
        <div style={S.card}>
          <div style={S.h}>Shipment details</div>
          <div style={S.grid}>
            <div>
              <label style={S.label}>Brand <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" value={brandName} onChange={e => setBrandName(e.target.value)} style={S.inp} />
            </div>
            <div>
              <label style={S.label}>Shipment number <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" value={shipmentNumber}
                onChange={e => { setNumber(e.target.value); setNumberTouched(true); }}
                style={S.inp} />
            </div>
            <div>
              <label style={S.label}>Supplier <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" value={supplierName} onChange={e => setSupplier(e.target.value)} style={S.inp} />
            </div>
            <div>
              <label style={S.label}>Origin country <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" value={originCountry} onChange={e => setOrigin(e.target.value)} style={S.inp} />
            </div>
            <div>
              <label style={S.label}>Destination</label>
              <input type="text" value={destinationCountry} onChange={e => setDest(e.target.value)} style={S.inp} />
            </div>
            <div>
              <label style={S.label}>Order date</label>
              {/* Stamped by the system. A purchase order is raised on the day it
                  is raised; backdating is a correction and belongs on the details
                  screen, where it reads as a change rather than a default. */}
              <div style={{ ...S.inp, backgroundColor: '#f8fafc', color: '#475569', display: 'flex', alignItems: 'center' }}>
                {orderDate}
              </div>
            </div>
            <div>
              <label style={S.label}>Supplier currency</label>
              <select value={currency}
                onChange={e => setCurrency(e.target.value as ShipmentCurrency)}
                style={{ ...S.inp, cursor: 'pointer' }}>
                {SHIPMENT_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>
                Exchange rate
                {/* "AED per 1 AED" is a rate of 1 stated as a rate — true but
                    meaningless, and the field beside it is already disabled
                    for this exact reason. Only show the ratio when it is
                    actually a conversion between two different currencies. */}
                {currency !== 'AED' && (
                  <span style={{ fontWeight: 400, color: '#94a3b8' }}> — AED per 1 {currency}</span>
                )}
              </label>
              <input type="number" min={0} step="any"
                value={exchangeRate || ''}
                disabled={currency === 'AED'}
                onChange={e => { setRate(parseFloat(e.target.value) || 0); setRateTouched(true); }}
                style={{ ...S.inp,
                         backgroundColor: currency === 'AED' ? '#f8fafc' : '#fff',
                         color: currency === 'AED' ? '#94a3b8' : '#111827' }} />
            </div>
          </div>

          {/* Every figure on the costing sheet is AED. Saying so once, here,
              is what stops someone entering a USD price and reading the total
              as USD. */}
          {currency !== 'AED' && (
            <p style={{ fontSize: 11, color: '#64748b', margin: '12px 0 0' }}>
              Enter prices and charges in {currency}. The costing sheet converts everything
              to AED at {exchangeRate || '—'}, and that rate is frozen on this shipment —
              a later change cannot restate a costing already done.
            </p>
          )}
        </div>

        {/* Lines */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ ...S.h, marginBottom: 0 }}>Product lines</div>
            <button type="button" onClick={addLine}
              style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} /> Add line
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lines.map((l, i) => {
              // Read the line's converted total from the costing engine
              // (preview.lines is index-aligned with `lines` — same array,
              // same order) instead of recomputing it here.
              //
              // The removed local calculation was: qty × price, less
              // discount — entirely in the SUPPLIER's currency — and then
              // handed straight to money(_, view), which just prints
              // whatever the display-currency symbol is next to the number
              // with no conversion. So a line entered as EUR 12,500 at an
              // exchange rate of 4 was shown as "PKR 12,500.00" — the
              // exchange rate was never applied. The engine's netTotalBase
              // is the same qty×price-less-discount figure but ALREADY
              // multiplied by the exchange rate (see purchasedOrderService's
              // calculateShipmentCosting), which is the correct AED value —
              // matching every other figure on this page (the "Landed cost
              // preview" card below already reads *Base fields the same way).
              const lineNetBase = preview.lines[i]?.netTotalBase ?? 0;
              return (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '22px 1.5fr 1fr 62px 70px 100px 112px 28px', gap: 7, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>{i + 1}</span>
                  <input type="text" value={l.productName} onChange={e => updateLine(l.id, 'productName', e.target.value)}
                    placeholder="Product name" style={{ ...S.inp, fontSize: 12 }} />
                  <input type="text" value={l.modelName} onChange={e => updateLine(l.id, 'modelName', e.target.value)}
                    placeholder="Model" style={{ ...S.inp, fontSize: 12 }} />
                  <input type="number" min={1} step={1} value={l.quantity || ''}
                    onChange={e => updateLine(l.id, 'quantity', parseInt(e.target.value, 10) || 0)}
                    placeholder="Qty" style={{ ...S.inp, fontSize: 12 }} />
                  {/* Fixed rather than a dropdown: EA is the only unit that can
                      carry a landed cost into inventory, which tracks stock by
                      serial number. Shown so the line still reads across from the
                      supplier's proforma, where every row says EA. */}
                  <div style={{ ...S.inp, fontSize: 12, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', backgroundColor: '#f8fafc',
                                color: '#64748b', fontWeight: 600 }}>
                    EA
                  </div>
                  <input type="number" min={0} step="any" value={l.unitPrice || ''}
                    onChange={e => updateLine(l.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                    placeholder={`Price (${currency})`} style={{ ...S.inp, fontSize: 12 }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                    {money(lineNetBase, view)}
                  </div>
                  <button type="button" disabled={lines.length === 1}
                    onClick={() => setLines(p => p.filter(x => x.id !== l.id))}
                    style={{ border: 'none', background: 'none', cursor: lines.length === 1 ? 'not-allowed' : 'pointer', color: lines.length === 1 ? '#e2e8f0' : '#cbd5e1', padding: 3 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>{preview.totalQuantity} units</span>
            {/* purchaseNet is pre-exchange-rate (still in the supplier's
                currency) — the same bug as the per-line total above.
                purchaseNetBase is the same figure after the exchange rate,
                consistent with every other total on this page. */}
            <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{money(preview.purchaseNetBase, view)}</span>
          </div>
        </div>

        {/* Import charges */}
        <div style={S.card}>
          <div style={S.h}>
            Import charges
            {currency !== 'AED' && (
              <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}> — in {currency}</span>
            )}
          </div>
          <div style={S.grid}>
            <div>
              <label style={S.label}>Freight</label>
              <input type="number" min={0} step="any" value={freightAmount || ''}
                onChange={e => setFreight(parseFloat(e.target.value) || 0)} placeholder="0.00" style={S.inp} />
            </div>
            <div>
              <label style={S.label}>Customs duty</label>
              <input type="number" min={0} step="any" value={customsAmount || ''}
                onChange={e => setCustoms(parseFloat(e.target.value) || 0)} placeholder="0.00" style={S.inp} />
            </div>
            <div>
              <label style={S.label}>Other import costs</label>
              <input type="number" min={0} step="any" value={otherCharges || ''}
                onChange={e => setOther(parseFloat(e.target.value) || 0)} placeholder="0.00" style={S.inp} />
            </div>
            <div>
              <label style={S.label}>Sales tax</label>
              <input type="number" min={0} step="any" value={salesTaxAmount || ''}
                onChange={e => setTax(parseFloat(e.target.value) || 0)} placeholder="0.00" style={S.inp} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={S.label}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              style={{ ...S.inp, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        {/* Live preview */}
        {preview.landedTotal > 0 && (
          <div style={{ ...S.card, backgroundColor: '#0f172a', border: 'none' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calculator size={13} /> Landed cost preview
            </div>
            {[
              ['Purchase cost',      preview.purchaseNetBase],
              ['Freight',            preview.freightBase],
              ['Customs duty',       preview.customsBase],
              ['Other import costs', preview.otherBase],
              ['Sales tax',          preview.taxBase],
            ].map(([label, val]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ fontSize: 12, color: '#cbd5e1' }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{money(val as number, view)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #334155', marginTop: 8, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Total landed cost</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{money(preview.landedTotal, view)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>Average landed unit cost</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{money(preview.averageLandedUnitCost, view)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', justifyContent: 'space-between' }}>
        <button type="button" onClick={() => navigate('/purchased-orders')}
          style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: '#f3f4f6', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={15} /> Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          style={{ padding: '11px 28px', borderRadius: 8, border: 'none', backgroundColor: saving ? '#94a3b8' : '#0f172a', color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          {saving
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
            : <><Check size={16} /> Create Shipment</>}
        </button>
      </div>
    </div>
  );
};