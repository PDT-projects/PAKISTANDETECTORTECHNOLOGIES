// Purchased Orders — shipment detail
//
// The screen this replaces was a spreadsheet, where an accountant could click
// any cell and read the formula behind it. Losing that is what makes people
// stop trusting a costing screen, so every calculated figure here carries its
// arithmetic and shows it on hover.
//
// Customs, freight, other charges and tax are edited in place and the whole
// sheet recalculates as you type. Nothing is written until Save.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Check, Clock, Loader2, Ship, Truck, FileText, Calculator,
  AlertTriangle, Save, PackageCheck, FileDown, X, Paperclip, Trash2, Upload, Lock, Banknote,
} from 'lucide-react';
import { PurchasedOrderFirebaseService } from '../models/purchasedOrderFirebaseService';
import {
  calculateShipmentCosting, shipmentWorkflow, money, moneyRaw, round2,
  canFinaliseReceiving, isReceivingLocked,
  supplierPayable, supplierRemaining,
  isChargeKindClosed, openChargeKinds, canFinaliseCosting, shipmentTimeline,
  stockedQuantity, stockedValue, remainingToStock, remainingLandedUnitCost,
  unallocatedCharge,
} from '../models/purchasedOrderService';
import { Shipment, DisplayCurrency, ChargeKind, CHARGE_KINDS, SHIPMENT_CURRENCIES } from '../models/types';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';
import { downloadGoodsReceivedPdf } from '../models/goodsReceivedPdf';
import { downloadCostingExcel } from '../models/costingExcel';
import {
  uploadAttachment, removeAttachment, formatBytes, isImage,
  MAX_ATTACHMENT_BYTES,
} from '../models/shipmentAttachments';
import { ATTACHMENT_KINDS, type AttachmentKind } from '../models/types';
import { LockedPaymentRow } from '../components/ShipmentUI';

/**
 * Design tokens.
 *
 * One place for spacing, radius and colour so the module reads as one
 * application rather than nine cards that were each styled on the day they were
 * written. Every value below was already in the file — this only gathers them.
 */
const T = {
  bg:      '#f6f8fb',
  surface: '#ffffff',
  border:  '#e6eaf0',
  hair:    '#f1f5f9',

  ink:     '#0f172a',
  body:    '#475569',
  muted:   '#94a3b8',
  faint:   '#cbd5e1',

  brand:   '#1e3a8a',
  ok:      '#15803d',
  okBg:    '#f0fdf4',
  okLine:  '#bbf7d0',
  warn:    '#b45309',
  warnBg:  '#fffbeb',
  danger:  '#b91c1c',
  dangerBg:'#fef2f2',

  r:   10,
  rSm: 7,
  gap: 14,
} as const;

/**
 * A tint per section.
 *
 * Nine white cards in a column give the eye nothing to navigate by — scrolling
 * back to "the charges one" means reading every heading. A pale wash lets each
 * section be found by colour, and the tints are close enough in value that the
 * page still reads as one surface rather than a chart.
 */
const TINT = {
  costing:   { bg: '#fbfcfe', line: '#dde6f2', hover: '#f5f8fd' },
  charges:   { bg: '#fdfcfa', line: '#eee3d4', hover: '#fbf7f1' },
  supplier:  { bg: '#fbfdfb', line: '#d9e9dd', hover: '#f4faf5' },
  receiving: { bg: '#fcfbfd', line: '#e5dff0', hover: '#f8f5fc' },
  overview:  { bg: '#fbfcfd', line: '#e2e8f0', hover: '#f6f9fc' },
  progress:  { bg: '#fcfcfa', line: '#e8e8d8', hover: '#f9f9f2' },
  documents: { bg: '#fbfcfd', line: '#dee7ee', hover: '#f5f9fc' },
  notes:     { bg: '#fdfdfb', line: '#e9e7dd', hover: '#faf9f4' },
} as const;

/** Card with its section tint. The class carries hover; the tint carries identity. */
const card = (t: keyof typeof TINT): React.CSSProperties => ({
  backgroundColor: TINT[t].bg,
  border: `1px solid ${TINT[t].line}`,
  borderRadius: T.r,
  padding: '16px 18px',
});

const S = {
  card:  { backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '16px 18px' } as React.CSSProperties,
  h:     { fontSize: 12.5, fontWeight: 700, color: T.ink, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7, letterSpacing: '-.01em' } as React.CSSProperties,
  th:    { padding: '7px 9px', fontSize: 10.5, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: `1px solid ${T.border}` } as React.CSSProperties,
  // Numbers in a monospaced face with tabular figures, so a column of money
  // lines up digit under digit. It is what makes a ledger scannable, and the
  // proportional default was quietly undoing the right-alignment.
  td:    { padding: '7px 9px', fontSize: 12, color: T.ink, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: `1px solid ${T.hair}`, fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' } as React.CSSProperties,
  inp:   { width: '100%', padding: '7px 10px', borderRadius: T.rSm, border: `1px solid #d5dbe4`, fontSize: 13, color: '#111827', outline: 'none', boxSizing: 'border-box', backgroundColor: T.surface } as React.CSSProperties,
  label: { display: 'block', fontSize: 10.5, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 } as React.CSSProperties,
};

/**
 * Everything that cannot be an inline style: hover, focus, keyframes and the
 * reduced-motion opt-out. Mounted once, at the top of the tree.
 */
const CSS = `
.po-card { transition: background-color .16s ease, border-color .16s ease; }
.po-card:hover { background-color: var(--po-hover); border-color: var(--po-line-hover); }

.po-btn { transition: filter .12s ease, transform .06s ease; }
.po-btn:hover:not(:disabled) { filter: brightness(.94); }
.po-btn:active:not(:disabled) { transform: translateY(1px); }
.po-btn:focus-visible { outline: 2px solid #1e3a8a; outline-offset: 2px; }

.po-inp { transition: border-color .14s ease, box-shadow .14s ease; }
.po-inp:focus { border-color: #93b4e8; box-shadow: 0 0 0 3px rgba(30,58,138,.10); }

.po-row { transition: background-color .12s ease; }
.po-row:hover { background-color: #f4f7fb; }

tbody tr.po-trow { transition: background-color .12s ease; }
tbody tr.po-trow:hover td { background-color: #f5f8fc; }

/* Only the newest row animates. Re-animating the whole list on every add makes
   a page that has settled look like it reloaded. */
@keyframes poRowIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.po-row-new { animation: poRowIn .22s ease both; }

@keyframes poTipIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
.po-tip { animation: poTipIn .12s ease both; }

@keyframes poPop { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
.po-pop { animation: poPop .28s cubic-bezier(.34,1.4,.64,1) both; }

/* Fires once after a save, on the figure that moved. */
@keyframes poPulse { 0% { box-shadow: 0 0 0 0 rgba(21,128,61,.34); } 100% { box-shadow: 0 0 0 11px rgba(21,128,61,0); } }
.po-pulse { animation: poPulse .85s ease-out 1; }

@keyframes poModalIn { from { opacity: 0; transform: scale(.97); } to { opacity: 1; transform: none; } }
.po-modal { animation: poModalIn .15s ease both; }
.po-backdrop { backdrop-filter: blur(2.5px); -webkit-backdrop-filter: blur(2.5px); }

@keyframes poShimmer { from { background-position: -420px 0; } to { background-position: 420px 0; } }
.po-skel {
  background: linear-gradient(90deg, #eef1f6 8%, #f7f9fc 20%, #eef1f6 32%);
  background-size: 840px 100%;
  animation: poShimmer 1.15s linear infinite;
  border-radius: 6px;
}

.po-grid { grid-template-columns: 1fr; }
@media (min-width: 1100px) { .po-grid { grid-template-columns: minmax(0,2.05fr) minmax(320px,1fr); } }

/* Someone who has asked the operating system for less movement has asked for
   less movement here too. */
@media (prefers-reduced-motion: reduce) {
  .po-card, .po-btn, .po-inp, .po-row, tbody tr.po-trow { transition: none !important; }
  .po-row-new, .po-tip, .po-pop, .po-pulse, .po-modal, .po-skel { animation: none !important; }
  .po-skel { background: #eef1f6; }
}
`;

/** Button hierarchy in one place, so a secondary action never outweighs a primary one. */
function btn(kind: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ok', disabled = false): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 13px', borderRadius: T.rSm,
    fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1, transition: 'background-color .12s',
  };
  // The .po-btn class carries hover, press and focus — those cannot be inline.
  if (kind === 'primary')   return { ...base, border: 'none', backgroundColor: T.ink,    color: '#fff' };
  if (kind === 'ok')        return { ...base, border: 'none', backgroundColor: T.ok,     color: '#fff' };
  if (kind === 'danger')    return { ...base, border: 'none', backgroundColor: T.danger, color: '#fff' };
  if (kind === 'secondary') return { ...base, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.body };
  return { ...base, border: 'none', backgroundColor: 'transparent', color: T.body, padding: '6px 9px' };
}

/** A headline number. Four of these sit above the fold so nothing has to be scrolled for. */
function Stat({ label, value, sub, tone, pulse }: {
  label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'brand'; pulse?: boolean;
}) {
  const colour = tone === 'ok' ? T.ok : tone === 'warn' ? T.warn : T.ink;
  return (
    <div className={pulse ? 'po-pulse' : undefined}
      style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r,
               padding: '13px 15px 13px 17px', position: 'relative', overflow: 'hidden' }}>
      {/* A thin bar rather than a coloured card. It marks the tone at a glance
          without turning a figure into a warning the reader has to dismiss. */}
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                                 backgroundColor: colour, opacity: .82 }} />
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 750, color: colour, marginTop: 4, letterSpacing: '-.02em',
                    fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Loading shape. A spinner says something is happening; this says what is coming. */
function Skeleton() {
  const bar = (w: number | string, h = 12) =>
    <div className="po-skel" style={{ width: w, height: h }} />;
  return (
    <div style={{ padding: '16px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div className="po-skel" style={{ width: 32, height: 32, borderRadius: T.rSm }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bar(190, 15)}{bar(260, 10)}
        </div>
      </div>
      <div style={{ display: 'grid', gap: T.gap, marginBottom: T.gap,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ ...S.card, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {bar('55%', 9)}{bar('72%', 19)}{bar('62%', 9)}
          </div>
        ))}
      </div>
      <div className="po-grid" style={{ display: 'grid', gap: T.gap, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: T.gap }}>
          {[210, 150, 140].map((h, i) => <div key={i} className="po-skel" style={{ height: h, borderRadius: T.r }} />)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: T.gap }}>
          {[120, 190, 130].map((h, i) => <div key={i} className="po-skel" style={{ height: h, borderRadius: T.r }} />)}
        </div>
      </div>
    </div>
  );
}

/** Small status label. Used for shipment state and for the two locks. */
function Chip({ text, tone }: { text: string; tone: 'ok' | 'warn' | 'neutral' }) {
  const c = tone === 'ok'   ? { bg: T.okBg,  fg: T.ok,   line: T.okLine }
          : tone === 'warn' ? { bg: T.warnBg, fg: T.warn, line: '#fde68a' }
          :                   { bg: T.hair,  fg: T.body, line: T.border };
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                   backgroundColor: c.bg, color: c.fg, border: `1px solid ${c.line}`, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}
/**
 * A number that explains itself. The dotted underline is the affordance; the
 * tooltip is positioned from the cursor and flips left near the right edge so
 * it never runs off screen on the widest column.
 */
function Cell({ text, formula, bold, tone }: {
  text: string; formula?: string; bold?: boolean; tone?: 'ok' | 'muted';
}) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const colour = tone === 'ok' ? '#15803d' : tone === 'muted' ? '#94a3b8' : '#0f172a';

  if (!formula) return <td style={{ ...S.td, fontWeight: bold ? 700 : 400, color: colour }}>{text}</td>;

  return (
    <td
      style={{ ...S.td, fontWeight: bold ? 700 : 400, color: colour, cursor: 'help', borderBottom: '1px dotted #cbd5e1' }}
      onMouseMove={e => setTip({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setTip(null)}
    >
      {text}
      {tip && (
        <div style={{
          position: 'fixed',
          left: tip.x + 340 > window.innerWidth ? tip.x - 340 : tip.x + 14,
          top: tip.y + 14,
          zIndex: 999, maxWidth: 330,
          backgroundColor: '#0f172a', color: '#e2e8f0',
          border: '1px solid #334155', borderRadius: 8, padding: '10px 12px',
          fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', textAlign: 'left',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          pointerEvents: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.28)',
        }} className="po-tip">{formula}</div>
      )}
    </td>
  );
}

function Field({ label, value }: { label: string; value?: string | number }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, marginTop: 3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String(value || '')}>
        {value || '—'}
      </div>
    </div>
  );
}

export const ShipmentDetailsView: React.FC = () => {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  // Follows the Admin's global currency setting — money() and
  // convertForDisplay both take a target and convert the stored AED figure
  // live; AED stays the source of truth. Falls back to AED if the global
  // pick (e.g. CAD) isn't one of the six currencies this costing sheet
  // supports.
  const { code: globalCode } = useGlobalCurrency();
  const view: DisplayCurrency = (SHIPMENT_CURRENCIES as string[]).includes(globalCode)
    ? (globalCode as DisplayCurrency)
    : 'AED';

  // Charges are edited locally and committed on Save, so a half-typed number
  // never reaches Firestore and the sheet still recalculates on every keystroke.
  const [charges, setCharges] = useState({ freight: 0, customs: 0, other: 0, tax: 0 });
  const [dirty, setDirty] = useState(false);

  // Receiving lock. Two confirmations rather than one action: finalising stops
  // the numbers changing, and reopening a finalised receipt has to be a
  // deliberate act with a reason attached.
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [reopening, setReopening]       = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  // A single shared "is anything saving" flag meant every button on this
  // page disabled together the moment ANY one action was in flight — close
  // Customs, and Freight/Tax/Other looked locked too for that whole window.
  // Each action now carries its own key, so only the button that triggered
  // a save is ever disabled by it.
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busy = busyAction !== null; // kept for any leftover generic reads
  const setBusy = (v: boolean) => setBusyAction(v ? 'generic' : null);
  const isBusy = (key: string) => busyAction === key;

  // Charge entry. Kept separate from the four legacy amounts: a shipment uses
  // one or the other, never both, and the panel switches on whether a list
  // exists.
  const [addingCharge, setAddingCharge] = useState(false);
  const [chargeDraft, setChargeDraft]   = useState<{ kind: ChargeKind; amount: string; date: string; description: string }>({
    kind: 'Customs', amount: '', date: new Date().toLocaleDateString('en-CA'), description: '',
  });

  const [addingPayment, setAddingPayment] = useState(false);
  const [payDraft, setPayDraft] = useState({
    amount: '', date: new Date().toLocaleDateString('en-CA'), description: '',
  });

  // Attachments. The kind is picked before the file dialog opens, so the
  // upload knows what it is without a second prompt afterwards.
  const [attachKind, setAttachKind] = useState<AttachmentKind>('Proforma');
  const [uploading, setUploading]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set for one second after a save so the figure that moved says so. Without
  // it a successful save is a toast that has already gone by the time the eye
  // reaches the number.
  const [justSaved, setJustSaved] = useState(false);

  const [confirmCosting, setConfirmCosting]   = useState(false);
  const [reopenCostingOn, setReopenCostingOn] = useState(false);
  const [costingReason, setCostingReason]     = useState('');
  const loadedRef = useRef(false);

  /**
   * Escape closes whichever modal is open.
   *
   * Cancel only — never confirm. A key that sometimes finalises a costing is a
   * key nobody can press with confidence.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setConfirmFinal(false);
      setReopening(false);
      setAddingCharge(false);
      setAddingPayment(false);
      setConfirmCosting(false);
      setReopenCostingOn(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      try {
        const s = await PurchasedOrderFirebaseService.fetchById(id);
        if (cancelled) return;
        setShipment(s);
        if (s) {
          setCharges({
            freight: s.freightAmount, customs: s.customsAmount,
            other: s.otherCharges,    tax: s.salesTaxAmount,
          });
          loadedRef.current = true;
        }
      } catch (err: any) {
        if (!cancelled) toast.error(err?.message || 'Failed to load shipment');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  /**
   * Costed from the LOCAL edits, not the stored document, so the table reflects
   * what you are typing before you commit it.
   */
  const costing = useMemo(() => {
    if (!shipment) return null;
    return calculateShipmentCosting({
      currency: shipment.currency,
      exchangeRate: shipment.exchangeRate,
      lines: shipment.lines,

      // The charge list has to be passed, or the engine never sees it.
      //
      // It was missing, which is why a customs payment recorded in Transactions
      // showed in the four tiles above — those read chargeTotals(shipment)
      // directly — while the table below stayed on the old stored amounts.
      // Two readings of the same thing, one of them blind.
      charges: shipment.charges,

      // Used only when there is no list. These are the local edits, so a
      // half-typed number still recalculates the sheet without being saved.
      freightAmount: charges.freight,
      customsAmount: charges.customs,
      otherCharges: charges.other,
      salesTaxAmount: charges.tax,
    });
  }, [shipment, charges]);

  const setCharge = (k: keyof typeof charges, v: number) => {
    setCharges(p => ({ ...p, [k]: v }));
    if (loadedRef.current) setDirty(true);
  };
  // Derived once and read in several places. isReceivingLocked is the single
  // definition of "finalised" — the view never tests the status string itself.
  const locked = isReceivingLocked(shipment);

  // Costing lock is separate from the receiving lock. Receiving finalises when
  // the goods land; costing finalises when the last charge is in. A shipment
  // sits in both states at once for weeks, and that is normal.
  const costingLocked = shipment?.costingStatus === 'Complete';
  // Read from the costing pass rather than the document, so the tiles and the
  // table below cannot disagree. Reading the document directly is what let them
  // drift: the tiles showed a charge the table had not been given.
  const ct = costing
    ? { customs: costing.customsBase, freight: costing.freightBase,
        tax: costing.taxBase, other: costing.otherBase,
        total: round2(costing.customsBase + costing.freightBase + costing.taxBase + costing.otherBase) }
    : { customs: 0, freight: 0, tax: 0, other: 0, total: 0 };

  // Guarded because this runs on the first render, before the fetch resolves —
  // the null check that returns the loading screen sits further down the file.
  //
  // Owed comes from the costing sheet, so the picker, this panel and the sheet
  // are one number rather than two that ought to agree.
  const owed = shipment
    ? supplierPayable({
        lines: shipment.lines,
        currency: shipment.currency,
        exchangeRate: shipment.exchangeRate,
      })
    : 0;
  const paid      = Number(shipment?.supplierPaidAmount) || 0;
  const remaining = Math.max(0, round2(owed - paid));

  const addCharge = useCallback(async () => {
    if (!id) return;
    const amt = parseFloat(chargeDraft.amount);
    if (!(amt > 0)) { toast.error('Enter an amount greater than zero'); return; }
    setBusyAction('addCharge');
    try {
      const result = await PurchasedOrderFirebaseService.addCharge(id, {
        kind: chargeDraft.kind,
        amount: amt,
        date: chargeDraft.date,
        description: chargeDraft.description.trim(),
      });
      const fresh = await PurchasedOrderFirebaseService.fetchById(id);
      if (fresh) setShipment(fresh);
      setAddingCharge(false);
      setChargeDraft({ kind: 'Customs', amount: '', date: new Date().toLocaleDateString('en-CA'), description: '' });
      const { adjustmentInvoiceNumbers } = result;
      if (adjustmentInvoiceNumbers.length > 0) {
        toast.success(
          `Charge added. Absorbed via adjustment invoice${adjustmentInvoiceNumbers.length > 1 ? 's' : ''} ` +
          `${adjustmentInvoiceNumbers.join(', ')} — check Invoices to see ${adjustmentInvoiceNumbers.length > 1 ? 'them' : 'it'}.`,
          { duration: 7000 },
        );
      } else {
        toast.success('Charge added');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Could not add the charge');
    } finally { setBusyAction(null); }
  }, [id, chargeDraft]);

  const removeCharge = useCallback(async (chargeId: string) => {
    if (!id) return;
    setBusyAction(`removeCharge:${chargeId}`);
    try {
      await PurchasedOrderFirebaseService.removeCharge(id, chargeId);
      const fresh = await PurchasedOrderFirebaseService.fetchById(id);
      if (fresh) setShipment(fresh);
      toast.success('Charge removed');
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove the charge');
    } finally { setBusyAction(null); }
  }, [id]);

  const finaliseCosting = useCallback(async () => {
    if (!id) return;
    setBusyAction('finaliseCosting');
    try {
      await PurchasedOrderFirebaseService.finaliseCosting(id);
      const fresh = await PurchasedOrderFirebaseService.fetchById(id);
      if (fresh) setShipment(fresh);
      setConfirmCosting(false);
      toast.success('Costing finalised');
    } catch (e: any) {
      toast.error(e?.message || 'Could not finalise the costing');
    } finally { setBusyAction(null); }
  }, [id]);

  const addSupplierPayment = useCallback(async () => {
    if (!id) return;
    const amt = parseFloat(payDraft.amount);
    if (!(amt > 0)) { toast.error('Enter an amount greater than zero'); return; }
    setBusyAction('addSupplierPayment');
    try {
      await PurchasedOrderFirebaseService.recordSupplierPayment(id, {
        amount: amt,
        date: payDraft.date,
        description: payDraft.description.trim() || 'Payment to supplier',
      });
      const fresh = await PurchasedOrderFirebaseService.fetchById(id);
      if (fresh) setShipment(fresh);
      setAddingPayment(false);
      setPayDraft({ amount: '', date: new Date().toLocaleDateString('en-CA'), description: '' });
      toast.success('Payment recorded');
    } catch (e: any) {
      toast.error(e?.message || 'Could not record the payment');
    } finally { setBusyAction(null); }
  }, [id, payDraft]);

  const removeSupplierPayment = useCallback(async (paymentId: string) => {
    if (!id) return;
    setBusyAction(`removePayment:${paymentId}`);
    try {
      await PurchasedOrderFirebaseService.removeSupplierPayment(id, paymentId);
      const fresh = await PurchasedOrderFirebaseService.fetchById(id);
      if (fresh) setShipment(fresh);
      toast.success('Payment removed');
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove the payment');
    } finally { setBusyAction(null); }
  }, [id]);

  const onPickFiles = useCallback(async (files: FileList | null) => {
    if (!id || !files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    // Uploaded one at a time rather than in parallel: each writes the shipment
    // document, and concurrent writes would overwrite each other's list.
    for (const file of Array.from(files)) {
      try {
        await uploadAttachment(id, file, attachKind);
        ok += 1;
      } catch (e: any) {
        toast.error(e?.message || `Could not upload ${file.name}`);
      }
    }
    const fresh = await PurchasedOrderFirebaseService.fetchById(id);
    if (fresh) setShipment(fresh);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (ok > 0) toast.success(ok === 1 ? 'File attached' : `${ok} files attached`);
  }, [id, attachKind]);

  const onRemoveAttachment = useCallback(async (attachmentId: string) => {
    if (!id) return;
    try {
      await removeAttachment(id, attachmentId);
      const fresh = await PurchasedOrderFirebaseService.fetchById(id);
      if (fresh) setShipment(fresh);
      toast.success('Attachment removed');
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove the attachment');
    }
  }, [id]);

  /**
   * Declare a charge kind finished, or reopen it.
   *
   * A plain toggle with no prompt: reopening restates nothing, it only says
   * another invoice turned up, which is normal. Reopening the *costing* asks
   * for a reason because that does restate a signed-off figure.
   */
  const toggleChargeKind = useCallback(async (kind: ChargeKind, close: boolean) => {
    if (!id) return;
    setBusyAction(`charge:${kind}`);
    try {
      if (close) await PurchasedOrderFirebaseService.closeChargeKind(id, kind);
      else       await PurchasedOrderFirebaseService.reopenChargeKind(id, kind);
      const fresh = await PurchasedOrderFirebaseService.fetchById(id);
      if (fresh) setShipment(fresh);
      toast.success(close ? `${kind} marked complete` : `${kind} reopened`);
    } catch (e: any) {
      toast.error(e?.message || `Could not update ${kind.toLowerCase()}`);
    } finally { setBusyAction(null); }
  }, [id]);

  const reopenCosting = useCallback(async () => {
    if (!id || !costingReason.trim()) return;
    setBusyAction('reopenCosting');
    try {
      await PurchasedOrderFirebaseService.reopenCosting(id, costingReason.trim());
      const fresh = await PurchasedOrderFirebaseService.fetchById(id);
      if (fresh) setShipment(fresh);
      setReopenCostingOn(false);
      setCostingReason('');
      toast.success('Costing reopened');
    } catch (e: any) {
      toast.error(e?.message || 'Could not reopen the costing');
    } finally { setBusyAction(null); }
  }, [id, costingReason]);
  const finaliseCheck = shipment
    ? canFinaliseReceiving(shipment)
    : { allowed: false, reason: 'Loading' };

  const finalise = useCallback(async () => {
    if (!id) return;
    setBusyAction('finaliseReceiving');
    try {
      await PurchasedOrderFirebaseService.finaliseReceiving(id);
      const fresh = await PurchasedOrderFirebaseService.fetchById(id);
      if (fresh) setShipment(fresh);
      setConfirmFinal(false);
      toast.success('Receipt finalised');
    } catch (e: any) {
      toast.error(e?.message || 'Could not finalise the receipt');
    } finally { setBusyAction(null); }
  }, [id]);

  const reopen = useCallback(async () => {
    if (!id || !reopenReason.trim()) return;
    setBusyAction('reopenReceiving');
    try {
      await PurchasedOrderFirebaseService.reopenReceiving(id, reopenReason.trim());
      const fresh = await PurchasedOrderFirebaseService.fetchById(id);
      if (fresh) setShipment(fresh);
      setReopening(false);
      setReopenReason('');
      toast.success('Receiving reopened');
    } catch (e: any) {
      toast.error(e?.message || 'Could not reopen receiving');
    } finally { setBusyAction(null); }
  }, [id, reopenReason]);

  const save = useCallback(async () => {
    if (!id || !shipment) return;
    setSaving(true);
    try {
      await PurchasedOrderFirebaseService.update(id, {
        freightAmount: charges.freight,
        customsAmount: charges.customs,
        otherCharges:  charges.other,
        salesTaxAmount: charges.tax,
      });
      setShipment(prev => prev ? {
        ...prev,
        freightAmount: charges.freight, customsAmount: charges.customs,
        otherCharges: charges.other, salesTaxAmount: charges.tax,
      } : prev);
      setDirty(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 900);
      toast.success('Shipment saved');
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [id, shipment, charges]);

  /**
   * Status-only write. Nothing calls it since Mark arrived went, and it is kept
   * because the next status action on this screen will want it — deleting and
   * rewriting it costs more than the line it saves.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const patch = useCallback(async (p: Partial<Shipment>) => {
    if (!id) return;
    setSaving(true);
    try {
      await PurchasedOrderFirebaseService.patchStatus(id, p);
      setShipment(prev => (prev ? { ...prev, ...p } : prev));
      toast.success('Shipment updated');
    } catch (err: any) {
      toast.error(err?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  }, [id]);

  if (loading) {
    return (
      <div style={{ height: '100%', backgroundColor: T.bg, overflow: 'hidden' }}>
        <style>{CSS}</style>
        <Skeleton />
      </div>
    );
  }

  if (!shipment || !costing) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Shipment not found</div>
        <button type="button" onClick={() => navigate('/purchased-orders')}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13 }}>
          Back to Purchased Orders
        </button>
      </div>
    );
  }

  const c   = costing;
  const cur = shipment.currency;
  const M   = (aed: number) => money(aed, view);
  // Passed the stored shipment, not the costed lines: the stages read the
  // charge list and the supplier balance now, and both live on the document.
  const flow = shipmentWorkflow(shipment);

  const stageDone    = flow.filter(f => f.state === 'Completed').length;
  const totalStocked = c.lines.reduce((a, l) => a + stockedQuantity(l), 0);

  // unallocatedCharge() sums the charge share sitting on every line that is
  // fully stocked in — once every ordered unit has been received, a new
  // charge always leaves this line via allocateNewChargeAcrossShipment's
  // dummy adjustment invoice, whether that line's unit is still sitting
  // unsold in inventory or has already been sold. Both cases get the same
  // treatment now (a traceable ADJ-xxxx invoice, never a silent top-up to
  // the unit's own recorded cost), so there is nothing left to split by sold
  // status — the whole total is "absorbed via adjustment invoice".
  const absorbedViaAdjustment = round2(unallocatedCharge(c.lines));
  const costingCheck = canFinaliseCosting(shipment);
  const timeline     = shipmentTimeline(shipment);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: T.bg }}>
      <style>{CSS}</style>

      {/* ── Header ──────────────────────────────────────────────────────────
          Identity, state and the one action that can be pending. Save appears
          only when there is something unsaved, so the bar is quiet by default
          and the button means something when it shows. */}
      <div style={{ flexShrink: 0, backgroundColor: T.surface, borderBottom: `1px solid ${T.border}`,
                    padding: '11px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => navigate('/purchased-orders')} aria-label="Back"
          style={{ width: 32, height: 32, borderRadius: T.rSm, border: `1px solid ${T.border}`,
                   backgroundColor: T.surface, cursor: 'pointer', display: 'flex',
                   alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ArrowLeft size={16} color={T.body} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 750, color: T.ink, letterSpacing: '-.02em' }}>
              {shipment.shipmentNumber}
            </span>
            <Chip text={shipment.status} tone={locked ? 'ok' : 'neutral'} />
            {costingLocked && <Chip text="Costing finalised" tone="ok" />}
            {locked && <Chip text="Received" tone="ok" />}
          </div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shipment.brandName} · {shipment.supplierName} · {shipment.originCountry}
            {shipment.destinationCountry ? ` → ${shipment.destinationCountry}` : ''}
          </div>
        </div>

        <span style={{ fontSize: 11, color: T.muted, whiteSpace: 'nowrap' }}>
          {stageDone} of {flow.length} stages
        </span>

        {dirty && (
          <button type="button" onClick={save} disabled={saving} className="po-btn" style={btn('primary', saving)}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Save
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px 28px' }}>

        {/* ── Headline figures ─────────────────────────────────────────────
            The four numbers someone opens this screen to see. They were at the
            bottom, inside a dark panel, below five cards of detail. */}
        <div style={{ display: 'grid', gap: T.gap, marginBottom: T.gap,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <Stat label="Landed total"  value={M(c.landedTotal)} pulse={justSaved}
                sub={`${M(c.purchaseNetBase)} goods + ${M(ct.total)} charges`} />
          <Stat label="Landed / unit" value={M(c.averageLandedUnitCost)}
                sub={`blended across ${c.lines.length} line${c.lines.length === 1 ? '' : 's'}`} tone="ok" />
          <Stat label="Units"         value={String(c.totalQuantity)}
                sub={locked ? 'received' : 'on order'} />
          <Stat label="Owed to supplier" value={M(remaining)}
                sub={remaining > 0 ? `${M(paid)} of ${M(owed)} paid` : 'settled'}
                tone={remaining > 0 ? 'warn' : 'ok'} />
        </div>

        {/* Two columns on a desktop: the costing work on the left, context on
            the right. Collapses to one below 1100px. */}
        <div className="po-grid" style={{ display: 'grid', gap: T.gap, alignItems: 'start' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: T.gap, minWidth: 0 }}>

        {/* Commercial invoice + costing */}
        <div className="po-card" style={{ ...card('costing'), '--po-hover': TINT.costing.hover, '--po-line-hover': TINT.costing.line } as React.CSSProperties}>
          <div style={{ ...S.h, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <FileText size={14} /> Costing sheet
            </span>
            {/* Exported with live formulas, not values. The spreadsheet this
                replaced let an accountant click a cell and read how the number
                was reached; exporting values would lose exactly that. */}
            <button type="button" onClick={() => downloadCostingExcel(shipment, c)}
              style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #bbf7d0',
                       backgroundColor: '#f0fdf4', color: '#15803d', fontWeight: 700,
                       fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <FileDown size={13} /> Export to Excel
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '-6px 0 12px' }}>
            Hover any calculated figure to see the arithmetic behind it.
            Import charges are allocated by each line's share of net purchase value.
          </p>
          <LockedScrollTable maxHeight="60vh">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1520 }}>
              <thead>
                <tr>
                  <th style={{ ...S.th, textAlign: 'left' }}>Product</th>
                  <th style={S.th}>Qty</th>
                  <th style={S.th}>UOM</th>
                  <th style={S.th}>Unit price{cur !== 'AED' ? ` (${cur})` : ''}</th>
                  {/* Discount is no longer collected, so net is simply qty x price
                      and the column says so. Share was the allocation basis; the
                      engine still uses it, it is just not a number anyone reads. */}
                  <th style={S.th}>Amount</th>
                  <th style={S.th}>Share</th>
                  {/* Each charge twice: on the line, then per unit. The
                      spreadsheet this replaced showed both, because the first
                      answers "what did this line absorb" and the second is what
                      goes into stock valuation. */}
                  <th style={S.th}>Customs</th>
                  <th style={S.th}>Customs / u</th>
                  <th style={S.th}>Freight</th>
                  <th style={S.th}>Freight / u</th>
                  <th style={S.th}>Tax</th>
                  <th style={S.th}>Tax / u</th>
                  <th style={S.th}>Other</th>
                  <th style={S.th}>Other / u</th>
                  <th style={S.th}>Landed</th>
                  <th style={S.th}>Landed / unit</th>
                  {/* What has left for stock, at the rate frozen that day, and
                      what the units still here now cost. Charges arriving after
                      a stock-in cannot reach units already gone — some are on
                      sold invoices — so the remainder absorbs them. */}
                  <th style={S.th}>Stocked</th>
                  <th style={S.th}>Cost then</th>
                  <th style={S.th}>Left</th>
                  <th style={S.th}>Cost now</th>
                </tr>
              </thead>
              <tbody>
                {c.lines.map(l => (
                  <tr key={l.id} className="po-trow">
                    <td style={{ ...S.td, textAlign: 'left', fontWeight: 600 }}>
                      {l.productName}{l.modelName ? <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {l.modelName}</span> : null}
                    </td>
                    <td style={S.td}>{l.quantity}</td>
                    <td style={{ ...S.td, color: '#94a3b8' }}>{l.uom}</td>
                    {/* This column's header already says "(EUR)" etc. when the
                        shipment isn't in AED — l.unitPrice is the raw supplier
                        price, never multiplied by the exchange rate. It has to
                        be printed with the supplier's OWN currency code
                        (moneyRaw), not money(_, view), which would slap the
                        unrelated display-currency symbol on an unconverted
                        number — e.g. "PKR 12,500" on a price that is really
                        EUR 12,500. */}
                    <td style={S.td}>{moneyRaw(l.unitPrice, cur)}</td>
                    <Cell text={M(l.netTotalBase)} formula={l.formulas.netTotalBase} />
                    <Cell text={(l.share * 100).toFixed(2) + '%'} formula={l.formulas.share} tone="muted" />
                    <Cell text={M(l.customsShare)}   formula={l.formulas.customsShare} />
                    <Cell text={M(l.dutyPerUnit)}    formula={l.formulas.dutyPerUnit} tone="muted" />
                    <Cell text={M(l.freightShare)}   formula={l.formulas.freightShare} />
                    <Cell text={M(l.freightPerUnit)} formula={l.formulas.freightPerUnit} tone="muted" />
                    <Cell text={M(l.taxShare)}       formula={l.formulas.taxShare} />
                    <Cell text={M(l.taxPerUnit)}     formula={l.formulas.taxPerUnit} tone="muted" />
                    <Cell text={M(l.otherShare)}     formula={l.formulas.otherShare} />
                    <Cell text={M(l.otherPerUnit)}   formula={l.formulas.otherPerUnit} tone="muted" />
                    <Cell text={M(l.landedTotal)}    formula={l.formulas.landedTotal} bold />
                    <Cell text={M(l.landedUnitCost)} formula={l.formulas.landedUnitCost} bold tone="ok" />
                    {(() => {
                      const sq   = stockedQuantity(l);
                      const sv   = stockedValue(l);
                      const left = remainingToStock(l);
                      const now  = remainingLandedUnitCost(l);
                      const then = sq > 0 ? round2(sv / sq) : 0;
                      // Grey when nothing has moved yet: a zero that means
                      // "not started" should not read like a figure.
                      return (
                        <>
                          <td style={{ ...S.td, fontWeight: sq > 0 ? 700 : 400, color: sq > 0 ? T.ink : T.faint }}>
                            {sq || '—'}
                          </td>
                          <Cell text={sq > 0 ? M(then) : '—'} tone="muted"
                                formula={sq > 0
                                  ? `Cost then = value stocked / units stocked\n= ${M(sv)} / ${sq}\n= ${M(then)}\n\nFrozen when the units left. Later charges cannot reach them — some are on sold invoices.`
                                  : undefined} />
                          <td style={{ ...S.td, fontWeight: 700, color: left > 0 ? T.ink : T.ok }}>
                            {left}
                          </td>
                          <Cell text={left > 0 ? M(now) : '—'} bold
                                tone={left > 0 && now > l.landedUnitCost ? undefined : 'muted'}
                                formula={left > 0
                                  ? `Cost now = (landed total − value stocked) / units left\n= (${M(l.landedTotal)} − ${M(sv)}) / ${left}\n= ${M(now)}\n\n${now > l.landedUnitCost
                                      ? `Higher than the ${M(l.landedUnitCost)} average because charges arrived after ${sq} unit${sq === 1 ? '' : 's'} had already left.`
                                      : 'Nothing has been stocked yet, so this is the full landed unit cost.'}`
                                  : 'Every unit is in stock. Later charges go to the unallocated row.'} />
                        </>
                      );
                    })()}
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ ...S.td, textAlign: 'left', fontWeight: 700 }}>Total</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{c.totalQuantity}</td>
                  {/* UOM and Unit price have no meaningful total. */}
                  <td colSpan={2} style={S.td} />
                  <Cell text={M(c.purchaseNetBase)} formula={c.formulas.purchaseNetBase} bold />
                  <td style={{ ...S.td, fontWeight: 700 }}>100%</td>
                  <Cell text={M(c.customsBase)} formula={c.formulas.customsBase} bold />
                  {/* Per-unit totals have no meaning across lines of different
                      prices — the blended average sits in the last column. */}
                  <td style={S.td} />
                  <Cell text={M(c.freightBase)} formula={c.formulas.freightBase} bold />
                  <td style={S.td} />
                  <Cell text={M(c.taxBase)} formula={c.formulas.taxBase} bold />
                  <td style={S.td} />
                  <Cell text={M(c.otherBase)} formula={c.formulas.otherBase} bold />
                  <td style={S.td} />
                  <Cell text={M(c.landedTotal)} formula={c.formulas.landedTotal} bold />
                  <Cell text={M(c.averageLandedUnitCost)} formula={c.formulas.averageLandedUnitCost} bold tone="ok" />
                  <td style={{ ...S.td, fontWeight: 700 }}>{totalStocked || '—'}</td>
                  <td style={S.td} />
                  <td style={{ ...S.td, fontWeight: 700 }}>{c.totalQuantity - totalStocked}</td>
                  <td style={S.td} />
                </tr>

                {/* Charges that arrived after a line was fully stocked in —
                    whether its unit(s) are still sitting unsold in inventory
                    or have already been sold. Both are treated the same way
                    now (allocateNewChargeAcrossShipment always absorbs this
                    via a dummy $0 adjustment invoice, never a silent bump to
                    the unit's own recorded cost), so one row covers both:
                    there is no longer a distinct "still carried on the unit"
                    case to show separately. */}
                {absorbedViaAdjustment > 0 && (
                  <tr style={{ backgroundColor: '#eff6ff' }}>
                    <td colSpan={4} style={{ ...S.td, textAlign: 'left', fontWeight: 700, color: '#1d4ed8' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Check size={12} /> Late charges — absorbed via adjustment invoice
                      </span>
                    </td>
                    <Cell text={M(absorbedViaAdjustment)} bold tone={undefined}
                          formula={`These charges landed after this line was fully stocked in — whether its unit(s) are still sitting unsold in inventory or have already been sold on a real invoice, the result is the same: this amount cannot be put on the unit's own recorded cost (which stays frozen from the original stock-in), so it is absorbed via a $0-revenue adjustment invoice instead (see Invoices).\n\nThe shipment still balances: stocked value + remaining value + ${M(absorbedViaAdjustment)} = ${M(c.landedTotal)}.\n\nThis is not stock. Nothing reaches inventory.`} />
                    <td colSpan={15} style={S.td} />
                  </tr>
                )}
              </tbody>
            </table>
          </LockedScrollTable>

          {/* Closure check — the spreadsheet had no equivalent, so a broken
              formula could sit unnoticed for months. */}
          <div style={{
            marginTop: 12, padding: '9px 13px', borderRadius: 8, fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 8,
            backgroundColor: c.reconciles ? '#f0fdf4' : '#fef2f2',
            color: c.reconciles ? '#15803d' : '#b91c1c',
            border: `1px solid ${c.reconciles ? '#bbf7d0' : '#fecaca'}`,
          }}>
            {c.reconciles ? <Check size={14} /> : <AlertTriangle size={14} />}
            <span style={{ cursor: 'help' }} title={c.formulas.reconciles}>
              {c.reconciles
                ? `Closure check passed — line landed totals sum to ${M(c.landedTotal)}, exactly the shipment total.`
                : 'Closure check FAILED — the line totals do not sum to the shipment total. Hover for detail.'}
            </span>
          </div>
        </div>

        {/* Charges — live */}
        <div className="po-card" style={{ ...card('charges'), '--po-hover': TINT.charges.hover, '--po-line-hover': TINT.charges.line } as React.CSSProperties}>
          <div style={{ ...S.h, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Calculator size={14} /> Charges and payments
              {costingLocked && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                               backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                  Costing finalised
                </span>
              )}
            </span>
          </div>

          {/* Totals per kind, from the list when there is one and from the four
              stored amounts when there is not. Every shipment entered before
              charges became a list is in the second state. */}
          {/* One tile per kind, each with its own completion.
              Customs, freight, tax and other are billed as often as the agent
              invoices them, and nothing in the numbers says the last one has
              arrived. Somebody declares it, and until they do the shipment keeps
              appearing under that kind in the Transactions picker. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 14 }}>
            {CHARGE_KINDS.map(kind => {
              const v      = ct[kind.toLowerCase() as 'customs' | 'freight' | 'tax' | 'other'];
              const closed = isChargeKindClosed(shipment, kind);
              const closedAt = shipment.chargeClosure?.[kind]?.closedAt;
              const closedAtText = closedAt
                ? new Date(closedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : undefined;
              return (
                <LockedPaymentRow key={kind} label={`${kind} paid`} amountText={M(v)}
                  closedAt={closedAtText} state={closed ? 'locked' : 'pending'} />
              );
            })}
          </div>

          {/* Every payment that makes up those totals. A clearing agent bills
              duty, then storage, then a handling fee — the list is what answers
              "why did the landed cost move". */}
          {timeline.length > 0 ? (
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 9, overflow: 'hidden' }}>
              {timeline.map((e, i) => {
                const isClose    = e.kind === 'Closed';
                const isSupplier = e.kind === 'Supplier';
                return (
                  <div key={e.id} className={`po-row${i === 0 ? ' po-row-new' : ''}`}
                    style={{ display: 'grid', gridTemplateColumns: '74px 86px 1fr 108px',
                             gap: 8, alignItems: 'center', padding: '8px 12px', fontSize: 12,
                             borderTop: i === 0 ? 'none' : `1px solid ${T.hair}`,
                             backgroundColor: isClose ? '#fbfdfb' : 'transparent' }}>
                    <span style={{ color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
                      {e.date || '—'}
                    </span>

                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                                   fontWeight: 700,
                                   color: isClose ? T.ok : isSupplier ? T.brand : T.ink }}>
                      {isClose && <Check size={11} />}
                      {isClose ? 'Complete' : e.kind}
                    </span>

                    <span style={{ color: T.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={e.adjustmentInvoiceNumbers?.length
                            ? `This charge had a line with no stock left to carry it, so it was auto-absorbed via adjustment invoice(s): ${e.adjustmentInvoiceNumbers.join(', ')} — see Invoices.`
                            : undefined}>
                      {e.label}
                      {e.transactionRef && (
                        <span style={{ color: T.muted, fontFamily: 'ui-monospace, monospace' }}> · {e.transactionRef}</span>
                      )}
                      {e.bankName && <span style={{ color: T.muted }}> · {e.bankName}</span>}
                      {/* Persistent replacement for the one-time toast shown
                          when the charge was added — without this, coming
                          back to the shipment later showed no sign that part
                          of this charge had been absorbed via a dummy
                          invoice rather than landing on stock. */}
                      {!!e.adjustmentInvoiceNumbers?.length && (
                        <span style={{ color: '#7c3aed', fontWeight: 700 }}>
                          {' '}→ Adjustment: {e.adjustmentInvoiceNumbers.join(', ')}
                        </span>
                      )}
                    </span>

                    <span style={{ textAlign: 'right', fontWeight: 700,
                                   color: isSupplier ? T.ok : T.ink, fontVariantNumeric: 'tabular-nums' }}>
                      {e.amount > 0 ? M(e.amount) : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {/* No list yet — the four stored amounts remain editable so an
                  existing shipment keeps working exactly as it did. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                {([
                  ['Freight',      'freight'],
                  ['Customs duty', 'customs'],
                  ['Other charges','other'],
                  ['Sales tax',    'tax'],
                ] as const).map(([label, key]) => (
                  <div key={key}>
                    <label style={S.label}>{label}</label>
                    <input type="number" min={0} step="any"
                      value={charges[key] || ''}
                      disabled={costingLocked}
                      onChange={e => setCharge(key, parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="po-inp" style={{ ...S.inp, backgroundColor: costingLocked ? '#f8fafc' : '#fff' }} />
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '12px 0 0' }}>
                Change any value and the table below recalculates immediately. Nothing is written until you press Save.
                Adding a charge above switches this shipment to the itemised list.
              </p>
            </>
          )}
        </div>

        {/* Supplier payments — separate from import charges, because this money
            settles the purchase and goes to the supplier, while charges go to
            the clearing agent and the government. */}
        <div className="po-card" style={{ ...card('supplier'), '--po-hover': TINT.supplier.hover, '--po-line-hover': TINT.supplier.line } as React.CSSProperties}>
          <div style={{ ...S.h, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Banknote size={14} /> Supplier payments
              {remaining <= 0 && owed > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                               backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                  Settled
                </span>
              )}
            </span>
          </div>

          {/* No longer waits for the receipt. What is owed comes from the costing
              sheet, and that is known the moment the lines are entered. */}
          <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
                {([
                  ['Owed for received goods', owed,      '#0f172a'],
                  ['Paid',                    paid,      '#15803d'],
                  ['Remaining',               remaining, remaining > 0 ? '#b45309' : '#15803d'],
                ] as Array<[string, number, string]>).map(([label, v, colour]) => (
                  <div key={label} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: colour, marginTop: 2 }}>{M(v)}</div>
                  </div>
                ))}
              </div>

              {(shipment.supplierPayments || []).length > 0 ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 9, overflow: 'hidden' }}>
                  {(shipment.supplierPayments || []).map((pmt, i) => (
                    <div key={pmt.id} className={`po-row${i === 0 ? ' po-row-new' : ''}`}
                      style={{ display: 'grid', gridTemplateColumns: '82px 1fr 110px 32px',
                               gap: 8, alignItems: 'center', padding: '9px 12px', fontSize: 12,
                               borderTop: i === 0 ? 'none' : '1px solid #f1f5f9' }}>
                      <span style={{ color: '#64748b' }}>{pmt.date}</span>
                      <span style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pmt.description || '—'}
                        {pmt.transactionRef && (
                          <span style={{ color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}> · {pmt.transactionRef}</span>
                        )}
                        {pmt.bankName && <span style={{ color: '#94a3b8' }}> · {pmt.bankName}</span>}
                      </span>
                      <span style={{ textAlign: 'right', fontWeight: 700, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>
                        {M(pmt.amount)}
                      </span>
                      {/* A payment from a ledger entry is reversed by deleting that
                          entry, not from here — otherwise the two would disagree. */}
                      {!pmt.transactionId ? (
                        <button type="button" onClick={() => removeSupplierPayment(pmt.id)} title="Remove"
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}>
                          <Trash2 size={13} />
                        </button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 4px' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                                 display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                 backgroundColor: T.hair, border: `1px solid ${T.border}` }}>
                    <Banknote size={15} color={T.muted} />
                  </span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.body }}>Nothing paid yet</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
                      {M(owed)} outstanding for the goods
                    </div>
                  </div>
                </div>
              )}
          </>
        </div>

        {/* Receiving */}
        <div className="po-card" style={{ ...card('receiving'), '--po-hover': TINT.receiving.hover, '--po-line-hover': TINT.receiving.line } as React.CSSProperties}>
          <div style={{ ...S.h, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <PackageCheck size={14} /> Goods received
              {locked && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                               backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                  Finalised
                </span>
              )}
            </span>

            <span style={{ display: 'inline-flex', gap: 8 }}>
              {/* The note is only offered once receiving is finalised. A
                  downloadable draft would be signed and filed, and the numbers
                  on it can still change. */}
              {locked && (
                <button type="button" onClick={() => downloadGoodsReceivedPdf(shipment, c)}
                  className="po-btn" style={btn('secondary')}>
                  <FileDown size={13} /> Download note
                </button>
              )}

              {locked ? (
                <button type="button" onClick={() => setReopening(true)} className="po-btn" style={btn('ghost')}>
                  Reopen
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmFinal(true)}
                  disabled={!finaliseCheck.allowed || dirty}
                  title={dirty ? 'Save your changes first' : finaliseCheck.reason || 'Finalise the receipt'}
                  className="po-btn" style={btn('primary', !finaliseCheck.allowed || dirty)}>
                  <Check size={13} /> Finalise receipt
                </button>
              )}
            </span>
          </div>

          <p style={{ fontSize: 11, color: '#94a3b8', margin: '-6px 0 12px' }}>
            {locked
              ? `Received ${shipment.receivingFinalisedAt ? new Date(shipment.receivingFinalisedAt).toLocaleString('en-GB') : ''}. The note is available above.`
              : 'Mark the shipment received once the goods have landed. This does not move inventory on its own.'}
          </p>
          <LockedScrollTable maxHeight="60vh">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ ...S.th, textAlign: 'left' }}>Product</th>
                  <th style={S.th}>Model</th>
                  <th style={S.th}>Ordered</th>
                </tr>
              </thead>
              <tbody>
                {c.lines.map(l => (
                  <tr key={l.id} className="po-trow">
                    <td style={{ ...S.td, textAlign: 'left', fontWeight: 600 }}>
                      {l.productName}
                    </td>
                    <td style={{ ...S.td, color: '#94a3b8' }}>{l.modelName || '—'}</td>
                    <td style={S.td}>{l.quantity} {l.uom}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={2} style={{ ...S.td, textAlign: 'left', fontWeight: 700 }}>Total</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{c.totalQuantity}</td>
                </tr>
              </tbody>
            </table>
          </LockedScrollTable>
        </div>

        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: T.gap, minWidth: 0 }}>
        {/* Overview */}
        <div className="po-card" style={{ ...card('overview'), '--po-hover': TINT.overview.hover, '--po-line-hover': TINT.overview.line } as React.CSSProperties}>
          <div style={S.h}><Ship size={14} /> Shipment overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
            {/* Dispatch, expected arrival, tracking and the supplier's order
                number were shown because the fields existed, not because anyone
                read them. None is filled in on any shipment in the system. */}
            <Field label="Brand"       value={shipment.brandName} />
            <Field label="Supplier"    value={shipment.supplierName} />
            <Field label="Origin"      value={shipment.originCountry} />
            <Field label="Destination" value={shipment.destinationCountry} />
            <Field label="Order date"  value={shipment.orderDate} />
          </div>
        </div>

        {/* Progress.
            A list rather than a row of pills: the stages happen in order, and a
            wrapped row of chips shows no order at all. A grey stage now sits in
            sequence, so it reads as what is still missing. */}
        <div className="po-card" style={{ ...card('progress'), '--po-hover': TINT.progress.hover, '--po-line-hover': TINT.progress.line } as React.CSSProperties}>
          <div style={{ ...S.h, justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Truck size={14} /> Progress
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.muted }}>
              {stageDone} / {flow.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {/* A hairline through the circles. Six discs in a column are six
                separate things; threaded, they are one sequence. */}
            <span aria-hidden style={{ position: 'absolute', left: 8, top: 14, bottom: 14,
                                       width: 1, backgroundColor: T.border }} />
            {flow.map((st, i) => {
              const ok = st.state === 'Completed';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9,
                                      padding: '7px 0', position: 'relative' }}>
                  <span key={`${i}-${ok}`} className={ok ? 'po-pop' : undefined}
                    style={{ width: 17, height: 17, borderRadius: 20, flexShrink: 0, zIndex: 1,
                             display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                             backgroundColor: ok ? T.okBg : T.surface,
                             border: `1px solid ${ok ? T.okLine : T.border}` }}>
                    {ok ? <Check size={10} color={T.ok} /> : <Clock size={10} color={T.faint} />}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: ok ? 600 : 400, color: ok ? T.ink : T.muted }}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Stacked full width in a narrow column, and only what is available
              right now — a disabled button someone cannot use is noise. */}
          {/* Mark arrived is gone. Arrival was a date nobody filled in, and the
              stage it fed could never complete once the button went — a stage
              nobody can finish reads as something forgotten rather than
              something not offered.

              Each charge kind is completed on its own tile. This card carries
              only the one action that spans them all. */}
          {/* One button per kind, the shape Mark arrived had. They sit here
              rather than on the tiles because this is the card that shows what
              is done and what is not — the action belongs beside the state it
              changes. */}
          {!costingLocked && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 12 }}>
              {CHARGE_KINDS.map(kind => {
                const closed = isChargeKindClosed(shipment, kind);
                const savingThis = isBusy(`charge:${kind}`);
                return (
                  <button key={kind} type="button" disabled={savingThis}
                    onClick={() => toggleChargeKind(kind, !closed)}
                    title={closed ? `Reopen ${kind.toLowerCase()} — another invoice arrived`
                                  : `No more ${kind.toLowerCase()} is expected on this shipment`}
                    style={{ ...btn(closed ? 'ghost' : 'secondary', savingThis),
                             justifyContent: 'center', fontSize: 11.5, padding: '6px 8px' }}>
                    {closed ? <><Check size={12} /> {kind} paid</> : `${kind} paid`}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            {costingLocked ? (
              <button type="button" onClick={() => setReopenCostingOn(true)}
                className="po-btn" style={{ ...btn('secondary'), width: '100%', justifyContent: 'center' }}>
                Reopen costing
              </button>
            ) : (
              <button type="button" disabled={saving || !c.reconciles || dirty || !costingCheck.allowed}
                onClick={() => setConfirmCosting(true)}
                title={dirty ? 'Save your changes first'
                     : !c.reconciles ? 'The closure check must pass first'
                     : costingCheck.reason || 'Finalise the costing'}
                className="po-btn" style={{ ...btn('ok', saving || !c.reconciles || dirty || !costingCheck.allowed),
                         width: '100%', justifyContent: 'center' }}>
                <Lock size={13} /> Finalise costing
              </button>
            )}

            {/* Naming what is still open turns a disabled button from a dead end
                into an instruction. */}
            {!costingLocked && !costingCheck.allowed && (
              <p style={{ fontSize: 11, color: T.muted, margin: '7px 0 0', textAlign: 'center' }}>
                {costingCheck.reason}
              </p>
            )}
          </div>
        </div>

        {/* Attachments — the proforma, the bill of lading, the customs
          paperwork and the delivery photos. Until now they lived in email,
          and someone checking a delivery had to go and find them. */}
        <div className="po-card" style={{ ...card('documents'), '--po-hover': TINT.documents.hover, '--po-line-hover': TINT.documents.line } as React.CSSProperties}>
        <div style={{ ...S.h, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Paperclip size={14} /> Documents
            <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>
              {(shipment.attachments || []).length || 'none'}
            </span>
          </span>

          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {/* The kind is chosen before the file dialog opens, so the upload
                knows what it is without a second prompt afterwards. */}
            <select value={attachKind} onChange={e => setAttachKind(e.target.value as AttachmentKind)}
              style={{ padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0',
                       fontSize: 12, cursor: 'pointer', backgroundColor: '#fff' }}>
              {ATTACHMENT_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>

            <input ref={fileInputRef} type="file" multiple hidden
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.doc,.docx,.csv"
              onChange={e => onPickFiles(e.target.files)} />

            <button type="button" disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #e2e8f0',
                       backgroundColor: '#fff', color: '#334155', fontWeight: 700, fontSize: 12,
                       cursor: uploading ? 'wait' : 'pointer',
                       display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {uploading
                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Uploading…</>
                : <><Upload size={13} /> Attach</>}
            </button>
          </span>
        </div>

        {(shipment.attachments || []).length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 4px' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                           display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                           backgroundColor: T.hair, border: `1px solid ${T.border}` }}>
              <Paperclip size={15} color={T.muted} />
            </span>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.body }}>Nothing attached</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
                PDF, images, Excel or Word, up to {Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB each
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
            {(shipment.attachments || []).map(a => (
              <div key={a.id}
                style={{ border: '1px solid #e2e8f0', borderRadius: 9, overflow: 'hidden', backgroundColor: '#fff' }}>
                {/* Images preview; everything else gets its kind on a tile.
                    A thumbnail is how someone spots the right delivery photo
                    without opening four of them. */}
                {isImage(a) ? (
                  <a href={a.url} target="_blank" rel="noopener noreferrer">
                    <img src={a.url} alt={a.name}
                      style={{ width: '100%', height: 104, objectFit: 'cover', display: 'block' }} />
                  </a>
                ) : (
                  <a href={a.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                             height: 104, backgroundColor: '#f8fafc', textDecoration: 'none' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8',
                                   textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      {(a.name.split('.').pop() || 'file').toUpperCase()}
                    </span>
                  </a>
                )}

                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {a.kind}
                  </div>
                  <div title={a.name}
                    style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginTop: 2,
                             overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{formatBytes(a.sizeBytes)}</span>
                    <span style={{ display: 'inline-flex', gap: 8 }}>
                      <a href={a.url} download={a.name} title="Download"
                        style={{ color: '#2563eb', display: 'inline-flex' }}>
                        <FileDown size={13} />
                      </a>
                      <button type="button" onClick={() => onRemoveAttachment(a.id)} title="Remove"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 0, display: 'inline-flex' }}>
                        <Trash2 size={13} />
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>

        {shipment.notes && (
        <div className="po-card" style={{ ...card('notes'), '--po-hover': TINT.notes.hover, '--po-line-hover': TINT.notes.line } as React.CSSProperties}>
            <div style={S.h}><FileText size={14} /> Notes</div>
            <p style={{ fontSize: 12.5, color: T.body, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{shipment.notes}</p>
          </div>
        )}
        </div>
        </div>
      </div>

      {/* Finalise confirmation. States what becomes read-only and that
          reopening exists — a lock with no visible way out gets worked around
          rather than used. */}
      {confirmFinal && (
        <div role="dialog" aria-modal="true"
          className="po-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,.42)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          onClick={() => setConfirmFinal(false)}>
          <div className="po-modal" style={{ ...S.card, width: 430, backgroundColor: T.surface }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Finalise this receipt?</div>
              <button type="button" onClick={() => setConfirmFinal(false)} aria-label="Close"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 12,
                          color: '#475569', marginBottom: 14, fontVariantNumeric: 'tabular-nums' }}>
              <span>Units ordered</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{c.totalQuantity}</span>
              <span>Landed total</span><span style={{ fontWeight: 800, color: '#0f172a' }}>{M(c.landedTotal)}</span>
            </div>

            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>
              This marks the shipment as received, and the goods received note
              becomes available to download.
            </p>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
              Reopening is possible and asks for a reason, which is kept with the shipment.
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmFinal(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                         backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={finalise} disabled={isBusy('finaliseReceiving')}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', backgroundColor: '#0f172a',
                         color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                         display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                Finalise
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen. The reason is required and appended to the shipment notes, so
          a restated receipt carries its own explanation. */}
      {reopening && (
        <div role="dialog" aria-modal="true"
          className="po-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,.42)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          onClick={() => setReopening(false)}>
          <div className="po-modal" style={{ ...S.card, width: 420, backgroundColor: T.surface }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Reopen receiving</div>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
              Quantities become editable again and the note goes back to draft.
              The reason is kept with the shipment.
            </p>
            <textarea
              value={reopenReason}
              onChange={e => setReopenReason(e.target.value)}
              placeholder="Five units arrived damaged and were returned to the supplier"
              rows={3}
              className="po-inp" style={{ ...S.inp, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" onClick={() => { setReopening(false); setReopenReason(''); }}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                         backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={reopen} disabled={isBusy('reopenReceiving') || !reopenReason.trim()}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                         backgroundColor: reopenReason.trim() ? '#b45309' : '#cbd5e1',
                         color: '#fff', fontSize: 13, fontWeight: 700,
                         cursor: reopenReason.trim() && !busy ? 'pointer' : 'not-allowed' }}>
                Reopen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add a charge by hand. Once Transactions is wired, the same shape is
          written from the payment form with a transactionId attached. */}
      {addingCharge && (
        <div role="dialog" aria-modal="true"
          className="po-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,.42)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          onClick={() => setAddingCharge(false)}>
          <div className="po-modal" style={{ ...S.card, width: 420, backgroundColor: T.surface }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Add import charge</div>
              <button type="button" onClick={() => setAddingCharge(false)} aria-label="Close"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={S.label}>Kind</label>
                <select value={chargeDraft.kind}
                  onChange={e => setChargeDraft(d => ({ ...d, kind: e.target.value as ChargeKind }))}
                  className="po-inp" style={{ ...S.inp, cursor: 'pointer' }}>
                  {CHARGE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Date</label>
                <input type="date" value={chargeDraft.date}
                  onChange={e => setChargeDraft(d => ({ ...d, date: e.target.value }))} className="po-inp" style={S.inp} />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={S.label}>Amount</label>
              {/* The currency sits inside the field. A bare 0.00 beside a label
                  that has scrolled away is a number with no unit. */}
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                               fontSize: 12, fontWeight: 700, color: T.muted, pointerEvents: 'none' }}>AED</span>
                <input type="number" min={0} step="any" autoFocus
                  value={chargeDraft.amount}
                  onChange={e => setChargeDraft(d => ({ ...d, amount: e.target.value }))}
                  placeholder="0.00" className="po-inp"
                  style={{ ...S.inp, textAlign: 'right', paddingLeft: 44,
                           fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Description</label>
              <input type="text" value={chargeDraft.description}
                onChange={e => setChargeDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="Duty paid to clearing agent" className="po-inp" style={S.inp} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setAddingCharge(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                         backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={addCharge} disabled={isBusy('addCharge') || !(parseFloat(chargeDraft.amount) > 0)}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                         backgroundColor: parseFloat(chargeDraft.amount) > 0 ? '#0f172a' : '#cbd5e1',
                         color: '#fff', fontSize: 13, fontWeight: 700,
                         cursor: parseFloat(chargeDraft.amount) > 0 && !busy ? 'pointer' : 'not-allowed' }}>
                Add charge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record a supplier payment by hand. */}
      {addingPayment && (
        <div role="dialog" aria-modal="true"
          className="po-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,.42)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          onClick={() => setAddingPayment(false)}>
          <div className="po-modal" style={{ ...S.card, width: 400, backgroundColor: T.surface }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Record supplier payment</div>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
              {M(remaining)} outstanding for the goods received.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={S.label}>Amount</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                                 fontSize: 12, fontWeight: 700, color: T.muted, pointerEvents: 'none' }}>AED</span>
                  <input type="number" min={0} max={remaining} step="any" autoFocus
                    value={payDraft.amount}
                    onChange={e => setPayDraft(d => ({ ...d, amount: e.target.value }))}
                    placeholder="0.00" className="po-inp"
                    style={{ ...S.inp, textAlign: 'right', paddingLeft: 44,
                             fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }} />
                </div>
              </div>
              <div>
                <label style={S.label}>Date</label>
                <input type="date" value={payDraft.date}
                  onChange={e => setPayDraft(d => ({ ...d, date: e.target.value }))} className="po-inp" style={S.inp} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Description</label>
              <input type="text" value={payDraft.description}
                onChange={e => setPayDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="Part payment by bank transfer" className="po-inp" style={S.inp} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setAddingPayment(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                         backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={addSupplierPayment} disabled={isBusy('addSupplierPayment') || !(parseFloat(payDraft.amount) > 0)}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                         backgroundColor: parseFloat(payDraft.amount) > 0 ? '#15803d' : '#cbd5e1',
                         color: '#fff', fontSize: 13, fontWeight: 700,
                         cursor: parseFloat(payDraft.amount) > 0 && !busy ? 'pointer' : 'not-allowed' }}>
                Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finalise costing. Same shape as the receiving confirmation: it says
          what becomes read-only and that reopening exists. */}
      {confirmCosting && (
        <div role="dialog" aria-modal="true"
          className="po-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,.42)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          onClick={() => setConfirmCosting(false)}>
          <div className="po-modal" style={{ ...S.card, width: 430, backgroundColor: T.surface }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Finalise this costing?</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 12,
                          color: '#475569', marginBottom: 14, fontVariantNumeric: 'tabular-nums' }}>
              <span>Purchase net</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{M(c.purchaseNetBase)}</span>
              <span>Import charges</span><span style={{ fontWeight: 700, color: '#0f172a' }}>{M(ct.total)}</span>
              <span>Landed total</span><span style={{ fontWeight: 800, color: '#0f172a' }}>{M(c.landedTotal)}</span>
              <span>Closure check</span>
              <span style={{ fontWeight: 700, color: c.reconciles ? '#15803d' : '#b91c1c' }}>
                {c.reconciles ? 'balanced' : 'FAILED'}
              </span>
            </div>

            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 6px' }}>
              After this, import charges on this shipment can no longer be added or removed,
              and it stops appearing in the Transactions charge picker.
            </p>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
              Reopening is possible and asks for a reason, which is kept with the shipment.
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmCosting(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                         backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={finaliseCosting} disabled={isBusy('finaliseCosting') || !c.reconciles}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                         backgroundColor: c.reconciles ? '#15803d' : '#cbd5e1', color: '#fff',
                         fontSize: 13, fontWeight: 700, cursor: c.reconciles && !busy ? 'pointer' : 'not-allowed',
                         display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Lock size={14} />}
                Finalise
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen costing. A clearing agent invoicing six weeks late is normal,
          and refusing the bill entirely means it lands on the wrong shipment. */}
      {reopenCostingOn && (
        <div role="dialog" aria-modal="true"
          className="po-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,.42)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          onClick={() => setReopenCostingOn(false)}>
          <div className="po-modal" style={{ ...S.card, width: 420, backgroundColor: T.surface }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Reopen costing</div>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
              Charges become editable again and the shipment reappears in the Transactions
              charge picker. The landed cost will be restated. The reason is kept with the shipment.
            </p>
            <textarea value={costingReason} rows={3}
              onChange={e => setCostingReason(e.target.value)}
              placeholder="Clearing agent invoiced a storage fee six weeks after arrival"
              className="po-inp" style={{ ...S.inp, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" onClick={() => { setReopenCostingOn(false); setCostingReason(''); }}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                         backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={reopenCosting} disabled={isBusy('reopenCosting') || !costingReason.trim()}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                         backgroundColor: costingReason.trim() ? '#b45309' : '#cbd5e1', color: '#fff',
                         fontSize: 13, fontWeight: 700,
                         cursor: costingReason.trim() && !busy ? 'pointer' : 'not-allowed' }}>
                Reopen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
