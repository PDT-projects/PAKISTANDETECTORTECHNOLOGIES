// Payables & Receivables — full record register
//
// FIELD MAPPING — the trap in this schema
// ───────────────────────────────────────
// The Transaction field names do not mean what they say:
//
//   t.subCategory        → holds the CATEGORY      ("Account Receivable")
//   t.subCategoryDetail  → holds the SUB-CATEGORY  ("loan to sana")
//
// Reading subCategory for both columns makes the Sub-Category column repeat the
// category on every row and hides the counterparty names entirely. The names are
// the whole point of the column, so this mapping is load-bearing.
//
// RECEIVED vs PAID
// ────────────────
// Driven by the cash direction, never by the side. An Outflow is money leaving,
// so it fills Amount Paid; an Inflow fills Amount Received. Putting an Outflow's
// figure under Amount Received makes every lending row read as income.
//
// SIDE vs EFFECT
// ──────────────
// SIDE (receivable/payable) comes from the category text. EFFECT (does the
// balance rise or fall) comes from the cash direction:
//
//   ┌─────────────┬──────────────┬──────────────┐
//   │             │ Cash Outflow │ Cash Inflow  │
//   ├─────────────┼──────────────┼──────────────┤
//   │ receivable  │  INCREASE    │  DECREASE    │  we lend → they repay
//   │ payable     │  DECREASE    │  INCREASE    │  we repay → they lend
//   └─────────────┴──────────────┴──────────────┘
//
// AMOUNT BASIS
// ────────────
// Money that actually moved (totalPaid / amountPaid) — the same basis as
// computeCashInHandBalance and the Sub Category hint in QuickTransactionModal.
// An entry of Total 20,000 / Received 10,000 moves cash by 10,000, so it must
// move this ledger by 10,000 too, or one entry shifts two numbers differently.
//
// SOURCES
// ───────
//   1. Transactions whose category resolves to a receivable/payable side.
//   2. Invoices still carrying a balance — a receivable from the day it is
//      issued. Fully-paid invoices are skipped: their payments already appear
//      as transactions, so counting both would double them.
//
//   3. Supplier cost on invoices — what we owe the producer for the goods we
//      just sold. One invoice raises TWO obligations: the customer owes us the
//      sale price, and we owe the supplier the cost of those goods. Both belong
//      on this page.
//
//      Read straight off the invoice (supplierCostTotal / supplierPayments),
//      the same fields the "Sold Goods Payment" flow in the transaction form
//      writes to. No separate collection, no bridge, no second setup step —
//      if the invoice records a supplier cost, the payable exists.
//
//      Each supplier payment becomes its own row, so the expanded view shows a
//      real history rather than one aggregate figure. Grouped PER INVOICE, so
//      expanding INV-1002 shows only that invoice's position.

import React, { useMemo, useState } from 'react';
import { Download, RotateCcw, ChevronDown, ChevronRight, Calendar, X } from 'lucide-react';
import { Transaction } from '../../modules/transactions/models/types';
import { useCurrency } from '../../providers/context/CurrencyContext';

interface Props {
  transactions: Transaction[];
  invoices?:    any[];
  /** All bank accounts, including ones with no activity yet. Needed so the
   *  Account filter can list an account that exists but has no records — a
   *  dropdown built only from the data silently hides those. */
  banks?:       any[];
  /** Accepted for ReportsHub compatibility — the hub renders its own back
   *  button above this view, so the page does not render a second one. */
  onBack?:      () => void;
  /** Accepted for ReportsHub compatibility; the register has no tabs. */
  defaultTab?:  string;
}

type Side = 'receivable' | 'payable';

interface Row {
  key:           string;
  date:          string;
  /** Tie-breaker for same-day entries. The document id is random, so ordering
   *  by it puts a repayment before the loan it repays and the running balance
   *  opens with a figure that never existed. Time + the sequence baked into
   *  TXN-240826-005 restores the order things actually happened in. */
  seq:           string;
  flow:          'Inflow' | 'Outflow' | '';
  category:      string;
  subCategory:   string;   // the NAME — loan to sana, abc …
  invoiceDetails: string;
  amount:        number;
  received:      number;
  paid:          number;
  remRecv:       number;
  remPay:        number;
  /** FINAL balance for this counterparty — same on every row of the group.
   *  The register is read row by row, and a row that showed the mid-sequence
   *  figure said "Outstanding · 15,200" on an invoice that had already been
   *  paid in full, contradicting both the summary cards and its own expanded
   *  panel. */
  totalRecv:     number;
  totalPay:      number;
  /** Balance immediately after THIS entry. Used only by the expanded panel,
   *  where a running figure is the whole point. */
  runRecv:       number;
  runPay:        number;
  dueDate:       string;
  status:        string;
  partialTxn:    boolean;   // this entry's own amount was only part-settled
  remarks:       string;
  txnType:       string;
  refNo:         string;
  counterparty:  string;
  account:       string;
  branch:        string;
  side:          Side;
}

// ── Classification ──────────────────────────────────────────────────────────
const sideOf = (v: unknown): Side | null => {
  const c = String(v || '').trim().toLowerCase();
  if (c.includes('receivable')) return 'receivable';
  if (c.includes('payable'))    return 'payable';
  return null;
};

const isCommitted = (t: any): boolean => {
  const s = t?.approvalStatus;
  return !s || s === 'approved' || s === 'not_required';
};

const movedAmount = (t: any): number => {
  const hasFields =
    t?.totalPaid !== undefined || t?.amountPaid !== undefined || t?.paymentStatus !== undefined;
  if (!hasFields) return Number(t?.amount) || 0;
  return Number(t?.totalPaid ?? t?.amountPaid ?? 0) || 0;
};

/** subCategoryDetail is picked from a dropdown, so it is spelled consistently. */
const nameOf = (t: any): string => {
  const detail = String(t?.subCategoryDetail || '').trim();
  if (detail) return detail;
  const free = String(t?.paidBy || t?.paidTo || t?.remitterName || '').trim();
  return free || 'Unassigned';
};

const iso = (d: unknown): string => {
  const s = String(d || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const p = new Date(s);
  return isNaN(p.getTime()) ? '' : p.toISOString().slice(0, 10);
};

// `currency` used to be hardcoded 'AED'. It's now the system-wide currency
// code (see CurrencyContext) — every caller below passes it explicitly
// (no default) so a forgotten call site fails typecheck instead of quietly
// showing AED. Symbol-only: the numbers themselves are never converted.
const aed = (n: number, currency: string): string =>
  `${currency} ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Register construction ───────────────────────────────────────────────────
function buildRows(transactions: Transaction[], invoices: any[], currency: string): Row[] {
  const raw: Row[] = [];

  for (const t of (transactions || []) as any[]) {
    if (!isCommitted(t)) continue;

    const side = sideOf(t.subCategory) || sideOf(t.detailCategory);
    if (!side) continue;

    const moved = movedAmount(t);
    if (moved === 0) continue;

    const isInflow = t.mainCategory === 'Cash Inflow';
    const raises   = side === 'receivable' ? !isInflow : isInflow;
    const signed   = raises ? moved : -moved;

    const face      = Number(t.amount) || 0;
    const isPartial = t.paymentStatus === 'Partial';
    const pending   = isPartial ? Math.max(0, face - moved) : 0;

    raw.push({
      key:            `t-${t.id || t.transactionId}`,
      date:           iso(t.date),
      seq:            `${String(t.time || '')}|${String(t.transactionId || '')}`,
      flow:           isInflow ? 'Inflow' : 'Outflow',
      category:       String(t.subCategory || '—'),        // see FIELD MAPPING
      subCategory:    nameOf(t),                            // see FIELD MAPPING
      invoiceDetails: t.linkedType === 'invoice' && pending > 0
                        ? `${t.linkedId || ''} · ${aed(pending, currency)} pending`
                        : '',
      amount:         face,
      received:       isInflow  ? moved : 0,                // see RECEIVED vs PAID
      paid:           !isInflow ? moved : 0,
      remRecv:        side === 'receivable' ? signed : 0,
      remPay:         side === 'payable'    ? signed : 0,
      totalRecv:      0,
      totalPay:       0,
      runRecv:        0,
      runPay:         0,
      dueDate:        iso(t.dueDate),
      status:         '',            // set after running totals — see below
      partialTxn:     isPartial,
      remarks:        String(t.note || t.detailCategory || ''),
      txnType:        t.linkedType === 'invoice'   ? 'Invoice'
                    : t.linkedType === 'inventory' ? 'Inventory'
                    : 'Manual',
      refNo:          String(t.linkedId || t.transactionId || ''),
      counterparty:   nameOf(t),
      account:        String(t.accountName || t.bankName || (t.mode === 'Cash' ? 'Cash in Hand' : '') || '—'),
      branch:         String(t.branchName || t.company || '—'),
      side,
    });
  }

  for (const inv of (invoices || []) as any[]) {
    const total = Number(inv?.totalAmount) || 0;
    if (total === 0) continue;
    const paid        = Number(inv?.paidAmount) || 0;
    const outstanding = total - paid;
    if (outstanding <= 0.01) continue;

    const name  = String(inv?.customerName || '').trim() || 'Unknown';
    const phone = String(inv?.customerPhone || '').trim();

    raw.push({
      key:            `i-${inv.id || inv.invoiceNumber}`,
      date:           iso(inv.date || inv.invoiceDate || inv.createdAt),
      seq:            `|${String(inv.invoiceNumber || '')}`,
      flow:           '',
      category:       'A/C Receivable',
      subCategory:    name,
      invoiceDetails: `${inv.invoiceNumber || ''} · ${name} · ${aed(outstanding, currency)} pending`,
      amount:         total,
      received:       paid,
      paid:           0,
      remRecv:        outstanding,
      remPay:         0,
      totalRecv:      0,
      totalPay:       0,
      runRecv:        0,
      runPay:         0,
      dueDate:        iso(inv.dueDate),
      status:         '',
      partialTxn:     paid > 0,
      remarks:        phone ? `Invoice · ${phone}` : 'Invoice',
      txnType:        'Invoice',
      refNo:          String(inv.invoiceNumber || ''),
      // Phone keeps two same-named customers apart.
      counterparty:   phone ? `${name} (${phone})` : name,
      account:        '—',
      branch:         String(inv.branch || inv.location || '—'),
      side:           'receivable',
    });
  }

  // ── Source 3: supplier cost on invoices — what we owe the producer ────
  for (const inv of (invoices || []) as any[]) {
    // supplierCostTotal is a snapshot written at invoice creation, but older
    // invoices predate it and leave it blank while their product lines still
    // carry the per-unit cost. Reading only the snapshot silently reported
    // those invoices as owing nothing, so fall back to the same sum the
    // snapshot is built from.
    const supplierTotal =
      Number(inv?.supplierCostTotal) ||
      (Array.isArray(inv?.products)
        ? inv.products.reduce(
            (sum: number, p: any) => sum + (Number(p?.supplierCost) || 0) * (Number(p?.quantity) || 0),
            0,
          )
        : 0);
    if (supplierTotal === 0) continue;   // nothing owed on this invoice

    const invNo    = String(inv.invoiceNumber || '').trim();
    const invDate  = iso(inv.date || inv.invoiceDate || inv.createdAt);
    // Per-invoice grouping key: expanding one invoice must not pull in others.
    // Futuristic is the producer these goods come from. Named explicitly
    // rather than "Supplier" so the row says who is actually owed.
    const party    = invNo ? `Futuristic — ${invNo}` : `Futuristic — ${inv.id}`;
    const payments = Array.isArray(inv.supplierPayments) ? inv.supplierPayments : [];

    // The obligation itself, dated with the invoice.
    raw.push({
      key:            `s-${inv.id || invNo}`,
      date:           invDate,
      seq:            `|${invNo}`,
      flow:           '',
      category:       'A/C Payable',
      subCategory:    'Futuristic',
      invoiceDetails: `${invNo} · goods cost · ${aed(supplierTotal, currency)}`,
      amount:         supplierTotal,
      received:       0,
      paid:           0,
      remRecv:        0,
      remPay:         supplierTotal,
      totalRecv:      0,
      totalPay:       0,
      runRecv:        0,
      runPay:         0,
      dueDate:        iso(inv.supplierDueDate),
      status:         '',
      partialTxn:     false,
      remarks:        `Owed to Futuristic for goods on ${invNo}`,
      txnType:        'Invoice',
      refNo:          invNo,
      counterparty:   party,
      account:        '—',
      branch:         String(inv.branch || inv.customerCity || '—'),
      side:           'payable',
    });

    // One row per payment made, so the expanded view is a real history rather
    // than a single netted figure. These are NOT read from the transactions
    // collection: recordSupplierPayment books them under "Sold Goods Payment",
    // which resolves to no side, so counting both would be impossible anyway.
    payments.forEach((p: any, i: number) => {
      const amt = Number(p?.amount) || 0;
      if (amt === 0) return;
      raw.push({
        key:            `sp-${inv.id || invNo}-${p?.id || i}`,
        date:           iso(p?.date) || invDate,
        seq:            `${String(p?.date || '')}|${String(p?.id || i)}`,
        flow:           'Outflow',
        category:       'A/C Payable',
        subCategory:    'Futuristic',
        invoiceDetails: `${invNo} · payment`,
        amount:         amt,
        received:       0,
        paid:           amt,
        remRecv:        0,
        remPay:         -amt,          // payment reduces what we owe
        totalRecv:      0,
        totalPay:       0,
        runRecv:        0,
        runPay:         0,
        dueDate:        '',
        status:         '',
        partialTxn:     false,
        remarks:        String(p?.note || `Paid to Futuristic via ${p?.mode || 'Cash'}`),
        txnType:        'Invoice',
        refNo:          invNo,
        counterparty:   party,
        account:        String(p?.bankName || (p?.mode === 'Cash' ? 'Cash in Hand' : '') || '—'),
        branch:         String(inv.branch || inv.customerCity || '—'),
        side:           'payable',
      });
    });
  }

  // Running totals must be computed in date order, otherwise the balances
  // describe a sequence of events that never happened.
  raw.sort((a, b) =>
    (a.date || '').localeCompare(b.date || '') || a.seq.localeCompare(b.seq) || a.key.localeCompare(b.key));
  const rr = new Map<string, number>();
  const rp = new Map<string, number>();
  for (const r of raw) {
    rr.set(r.counterparty, (rr.get(r.counterparty) || 0) + r.remRecv);
    rp.set(r.counterparty, (rp.get(r.counterparty) || 0) + r.remPay);
    // Balance immediately after this entry — the panel's running column.
    r.runRecv = rr.get(r.counterparty)!;
    r.runPay  = rp.get(r.counterparty)!;
  }

  // Second pass: every row of a group carries that group's CLOSING position.
  // A row showing its mid-sequence figure read "Outstanding · 15,200" on an
  // invoice already paid in full — contradicting the summary cards and its own
  // expanded panel on the same screen.
  for (const r of raw) {
    r.totalRecv = rr.get(r.counterparty) || 0;
    r.totalPay  = rp.get(r.counterparty) || 0;

    const balance = r.totalRecv - r.totalPay;
    r.status = Math.abs(balance) < 0.01
      ? 'Cleared'
      : r.partialTxn ? 'Partial' : 'Outstanding';
  }

  return raw;
}

// ── Column definitions — one source of truth for header, filter and cell ────
type Align = 'left' | 'right';
interface Col {
  id:     string;
  label:  string;
  align:  Align;
  /** Filter value for a row. Empty string means "no value". */
  val:    (r: Row) => string;
  /** Rendered cell. */
  cell:   (r: Row) => React.ReactNode;
}

// Columns that get a filter chip. Deliberately a subset: the table still shows
// every column, but filtering by a free-form value (Remarks) or by a derived
// running figure (Remaining Receivable per row) produces dropdowns with one
// option per row, which narrow nothing. Dates are handled by range pickers
// instead of chips — an exact-date dropdown is almost never what someone wants.
const CHIP_IDS = [
  'flow', 'category', 'subCategory', 'received', 'paid',
  'status', 'refNo', 'account',
] as const;

// ── Component ───────────────────────────────────────────────────────────────
export function AccountsPayableReceivableReport({
  transactions, invoices, banks,
}: Props) {
  const { primary: currency } = useCurrency();
  const [sel, setSel]           = useState<Record<string, string>>({});
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const [expanded, setExpanded] = useState<string | null>(null);

  // Live width of the table's scroll viewport, used to size the expanded panel.
  const scrollBoxRef = React.useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  React.useEffect(() => {
    const el = scrollBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setPanelWidth(el.clientWidth));
    ro.observe(el);
    setPanelWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Any click outside an open panel dismisses it. Without this the panel stays
  // open behind the next one the user reaches for.
  React.useEffect(() => {
    if (!openChip) return;
    const close = () => setOpenChip(null);
    // Deferred so the click that opened the panel doesn't immediately close it.
    const id = window.setTimeout(() => document.addEventListener('click', close), 0);
    return () => { window.clearTimeout(id); document.removeEventListener('click', close); };
  }, [openChip]);

  const allRows = useMemo(
    () => buildRows(transactions, invoices || [], currency),
    [transactions, invoices, currency],
  );

  // Column definitions live inside the component (not at module scope) so
  // the amount columns' `aed(...)` calls close over the current `currency`
  // and relabel every cell the instant an admin switches it.
  const COLS: Col[] = useMemo(() => [
    { id: 'date',        label: 'Date',                 align: 'left',
      val: r => r.date,
      cell: r => r.date || '—' },
    { id: 'flow',        label: 'Flow',                 align: 'left',
      val: r => r.flow,
      cell: r => r.flow
        ? <span style={{ fontWeight: 700, color: r.flow === 'Inflow' ? '#059669' : '#dc2626' }}>{r.flow}</span>
        : '—' },
    { id: 'category',    label: 'Category',             align: 'left',
      val: r => r.category,
      cell: r => <span style={{ fontWeight: 700, color: r.side === 'receivable' ? '#059669' : '#dc2626' }}>
        {r.category}</span> },
    { id: 'subCategory', label: 'Sub-Category',         align: 'left',
      val: r => r.subCategory,
      cell: r => <span style={{ fontWeight: 600, color: '#0f172a' }}>{r.subCategory}</span> },
    { id: 'invoice',     label: 'Invoice Details',      align: 'left',
      val: r => r.invoiceDetails,
      cell: r => r.invoiceDetails
        ? <span style={{ color: '#0369a1' }}>{r.invoiceDetails}</span> : '—' },
    { id: 'amount',      label: 'Amount',               align: 'right',
      val: r => (r.amount ? aed(r.amount, currency) : ''),
      cell: r => aed(r.amount, currency) },
    { id: 'received',    label: 'Amount Received',      align: 'right',
      val: r => (r.received ? aed(r.received, currency) : ''),
      cell: r => <span style={{ fontWeight: r.received ? 700 : 400, color: r.received ? '#059669' : '#94a3b8' }}>
        {aed(r.received, currency)}</span> },
    { id: 'paid',        label: 'Amount Paid',          align: 'right',
      val: r => (r.paid ? aed(r.paid, currency) : ''),
      cell: r => <span style={{ fontWeight: r.paid ? 700 : 400, color: r.paid ? '#dc2626' : '#94a3b8' }}>
        {aed(r.paid, currency)}</span> },
    { id: 'remRecv',     label: 'Remaining Receivable', align: 'right',
      // Shows the counterparty's NET outstanding balance (same value on every
      // row for that party), not this single transaction's own signed delta —
      // a lone inflow/outflow row showing a negative "remaining" confused
      // users into thinking money was owed in reverse.
      val: r => (r.totalRecv ? aed(r.totalRecv, currency) : ''),
      cell: r => <span style={{ color: r.totalRecv < 0 ? '#b91c1c' : r.totalRecv ? '#059669' : '#94a3b8' }}>
        {aed(r.totalRecv, currency)}</span> },
    { id: 'remPay',      label: 'Remaining Payable',    align: 'right',
      val: r => (r.totalPay ? aed(r.totalPay, currency) : ''),
      cell: r => <span style={{ color: r.totalPay < 0 ? '#b91c1c' : r.totalPay ? '#dc2626' : '#94a3b8' }}>
        {aed(r.totalPay, currency)}</span> },
    { id: 'dueDate',     label: 'Due Date',             align: 'left',
      val: r => r.dueDate,
      cell: r => r.dueDate || '—' },
    { id: 'status',      label: 'Payment Status',       align: 'left',
      val: r => r.status,
      cell: r => <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700,
        backgroundColor: r.status === 'Cleared' ? '#ecfdf5' : r.status === 'Partial' ? '#fffbeb' : '#fef2f2',
        color:           r.status === 'Cleared' ? '#047857' : r.status === 'Partial' ? '#b45309' : '#b91c1c',
      }}>{r.status}</span> },
    { id: 'remarks',     label: 'Remarks',              align: 'left',
      val: r => r.remarks,
      cell: r => r.remarks || '—' },
    { id: 'txnType',     label: 'Transaction Type',     align: 'left',
      val: r => r.txnType,
      cell: r => r.txnType },
    { id: 'refNo',       label: 'Reference No.',        align: 'left',
      val: r => r.refNo,
      cell: r => <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#4f46e5' }}>{r.refNo || '—'}</span> },
    { id: 'counterparty', label: 'Counterparty',        align: 'left',
      val: r => r.counterparty,
      cell: r => r.counterparty },
    { id: 'account',     label: 'Account',              align: 'left',
      val: r => r.account,
      cell: r => r.account },
    { id: 'branch',      label: 'Branch',               align: 'left',
      val: r => r.branch,
      cell: r => r.branch },
  ], [currency]);

  // Each dropdown lists only values that actually occur, so no option can ever
  // return an empty table.
  const options = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of COLS) {
      m[c.id] = Array.from(new Set(allRows.map(c.val).filter(v => v && v !== '—'))).sort();
    }
    // Union with every known account so a bank with no entries yet still
    // appears — picking it and seeing nothing is a useful answer.
    const names = [
      'Cash in Hand',
      ...(banks || []).map(b => String(b?.name || '').trim()).filter(Boolean),
    ];
    m.account = Array.from(new Set([...m.account, ...names])).sort();
    return m;
  }, [allRows, banks]);

  // Built from allRows, never from the filtered set. A history that changed
  // shape depending on the active filters would be misleading — the point of
  // opening a row is to see everything that happened with that person.
  const history = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of allRows) {
      const list = m.get(r.counterparty);
      if (list) list.push(r);
      else m.set(r.counterparty, [r]);
    }
    return m;
  }, [allRows]);

  const rows = useMemo(() => allRows.filter(r => {
    // A row with no date can't satisfy a range, so it drops out rather than
    // silently passing every filter.
    if (range.from && (!r.date || r.date < range.from)) return false;
    if (range.to   && (!r.date || r.date > range.to))   return false;
    for (const c of COLS) {
      const want = sel[c.id];
      if (want && c.val(r) !== want) return false;
    }
    return true;
  }), [allRows, sel, range]);

  // Newest first for reading; running totals were already fixed above.
  const view = useMemo(() => [...rows].reverse(), [rows]);

  const totals = useMemo(() => {
    let amount = 0, received = 0, paid = 0, recv = 0, pay = 0;
    for (const r of rows) {
      amount += r.amount; received += r.received; paid += r.paid;
      recv += r.remRecv;  pay += r.remPay;
    }
    return { amount, received, paid, recv, pay };
  }, [rows]);

  const activeCount =
    Object.values(sel).filter(Boolean).length +
    Object.values(range).filter(Boolean).length;

  const handleExport = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      COLS.map(c => esc(c.label)).join(','),
      ...view.map(r => COLS.map(c => esc(c.val(r))).join(',')),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `payables-receivables-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      {/* Compact by design: ReportsHub already prints the report name above
          this, and the filters are what the page is actually used through. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
        <button onClick={handleExport} style={S.primary}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* One range, on the transaction date. A second range for Due Date read
            as being asked for the same thing twice, and due dates are rarely
            filled in on manual entries anyway. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <DateRange
            from={range.from} to={range.to}
            onFrom={v => setRange(p => ({ ...p, from: v }))}
            onTo={v => setRange(p => ({ ...p, to: v }))}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {COLS.filter(c => (CHIP_IDS as readonly string[]).includes(c.id)).map(c => (
            <div key={c.id} style={{ position: 'relative' }}>
              <FilterChip
                label={sel[c.id] ? `${c.label}: ${short(sel[c.id])}` : c.label}
                active={!!sel[c.id]}
                onClick={() => setOpenChip(openChip === c.id ? null : c.id)}
              />
              {openChip === c.id && (
                <ListPanel
                  title={c.label}
                  // Status carries the old scope toggle, so its "no filter"
                  // option is worded as the choice it replaces.
                  allLabel={c.id === 'status' ? 'All records' : 'All'}
                  options={options[c.id]}
                  value={sel[c.id] || ''}
                  onPick={v => { setSel(p => ({ ...p, [c.id]: v })); setOpenChip(null); }}
                />
              )}
            </div>
          ))}

          {activeCount > 0 && (
            <button
              onClick={() => {
                setSel({});
                setRange({ from: '', to: '' });
                setOpenChip(null);
              }}
              style={S.ghost}
            >
              <RotateCcw size={12} /> Reset
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
            Showing {view.length} / {allRows.length} records
          </div>
        </div>
      </div>

      {/* ── Register ─────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
          Payable / Receivable Records
        </div>
        <div ref={scrollBoxRef} style={{ maxHeight: '68vh', overflow: 'auto', position: 'relative' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, minWidth: 2400 }}>
            <thead>
              <tr>
                {/* Expander and Date are frozen: scrolled right, every other
                    column looks the same, and there is no way to tell which row
                    you are reading. */}
                <th style={{ ...S.th, ...S.stickyHead, ...S.freeze0, zIndex: 4, width: 36 }} />
                <th style={{
                  ...S.th, ...S.stickyHead, ...S.freeze1, zIndex: 4, textAlign: 'left',
                  boxShadow: 'inset 0 -1px 0 #e2e8f0, 1px 0 0 #e2e8f0',
                }}>
                  {COLS[0].label}
                </th>
                {COLS.slice(1).map(c => (
                  <th key={c.id} style={{ ...S.th, ...S.stickyHead, textAlign: c.align }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr>
                  <td colSpan={COLS.length + 1} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    {allRows.length === 0
                      ? 'No records yet. A transaction appears here when its Category is Account Receivable or Account Payable, or when an invoice has a balance outstanding.'
                      : 'No records match these filters.'}
                  </td>
                </tr>
              )}
              {view.map((r, i) => {
                const isOpen = expanded === r.key;
                const rowBg  = isOpen ? '#eef2ff' : i % 2 ? '#fafbfc' : '#fff';
                return (
                  <React.Fragment key={r.key}>
                    <tr style={{ backgroundColor: rowBg, borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ ...S.td, ...S.freeze0, textAlign: 'center', backgroundColor: rowBg }}>
                        <button
                          onClick={() => setExpanded(isOpen ? null : r.key)}
                          title={isOpen ? 'Hide history' : `Show all history for ${r.counterparty}`}
                          style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            color: isOpen ? '#4f46e5' : '#94a3b8', padding: 2,
                            display: 'inline-flex', transform: isOpen ? 'rotate(90deg)' : 'none',
                            transition: 'transform .15s',
                          }}
                        >
                          <ChevronRight size={15} />
                        </button>
                      </td>
                      <td style={{ ...S.td, ...S.freeze1, backgroundColor: rowBg, whiteSpace: 'nowrap' }}>
                        {COLS[0].cell(r)}
                      </td>
                      {COLS.slice(1).map(c => (
                        <td key={c.id} style={{
                          ...S.td, textAlign: c.align,
                          ...(c.align === 'right' ? { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } : {}),
                        }}>{c.cell(r)}</td>
                      ))}
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={COLS.length + 1} style={{ padding: 0, backgroundColor: '#f8fafc' }}>
                          <div style={{ position: 'sticky', left: 0, width: panelWidth || undefined }}>
                          <HistoryPanel
                            counterparty={r.counterparty}
                            rows={history.get(r.counterparty) || []}
                          />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            {view.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: '#0f172a' }}>
                  <td style={{ ...S.td, ...S.freeze0, backgroundColor: '#0f172a' }} />
                  {COLS.map(c => {
                    const map: Record<string, number> = {
                      amount: totals.amount, received: totals.received, paid: totals.paid,
                      remRecv: totals.recv, remPay: totals.pay,
                    };
                    return (
                      <td key={c.id} style={{
                        ...S.td, color: '#fff', fontWeight: 800, textAlign: c.align,
                        whiteSpace: 'nowrap',
                      }}>
                        {c.id === 'date' ? 'Filtered Total'
                          : c.id in map ? aed(map[c.id], currency)
                          : ''}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
        Remaining Receivable and Remaining Payable are running balances per counterparty, carried forward in
        date order. Amounts follow money that actually moved, so a partly-received entry contributes
        only what was received — the same basis as the Cash in Hand balance. Pending and rejected
        transactions are excluded.
      </div>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** FROM / TO pair in one bordered pill, matching the reference layout. */
function DateRange({ from, to, onFrom, onTo }: {
  from: string; to: string;
  onFrom: (v: string) => void; onTo: (v: string) => void;
}) {
  const on = !!(from || to);
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', borderRadius: 10,
      border: `1px solid ${on ? '#4f46e5' : '#e2e8f0'}`,
      backgroundColor: '#fff', whiteSpace: 'nowrap',
    }}>
      <Calendar size={14} color={on ? '#4f46e5' : '#94a3b8'} />
      <span style={S.rangeLbl}>From</span>
      <input type="date" value={from} onChange={e => onFrom(e.target.value)} style={S.rangeInput} />
      <span style={S.rangeLbl}>to</span>
      <input type="date" value={to} onChange={e => onTo(e.target.value)} style={S.rangeInput} />
      {on && (
        <button onClick={() => { onFrom(''); onTo(''); }} title="Clear"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', display: 'inline-flex' }}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/** Chip labels sit on one line, so a long value is truncated rather than
 *  allowed to push the whole row into wrapping. */
const short = (v: string): string => (v.length > 16 ? `${v.slice(0, 15)}…` : v);

function FilterChip({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 13px', borderRadius: 99,
        border: `1px solid ${active ? '#4f46e5' : '#e2e8f0'}`,
        backgroundColor: active ? '#4f46e5' : '#fff',
        color: active ? '#fff' : '#334155',
        fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label} <ChevronDown size={12} />
    </button>
  );
}

function ListPanel({ title, options, value, onPick, allLabel = 'All' }: {
  title: string; options: string[]; value: string;
  onPick: (v: string) => void; allLabel?: string | null;
}) {
  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 20,
        minWidth: 220, maxWidth: 340, maxHeight: 320, overflowY: 'auto',
        backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
        boxShadow: '0 12px 28px rgba(15,23,42,0.14)',
      }}
    >
      <div style={{
        padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748b',
        backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0',
        position: 'sticky', top: 0,
      }}>
        {title}
      </div>
      {allLabel !== null && (
        <PanelRow label={allLabel} selected={!value} onClick={() => onPick('')} muted />
      )}
      {options.length === 0 && (
        <div style={{ padding: '12px', fontSize: 12, color: '#94a3b8' }}>No values yet</div>
      )}
      {options.map(o => (
        <PanelRow key={o} label={o} selected={value === o} onClick={() => onPick(o)} />
      ))}
    </div>
  );
}

function PanelRow({ label, selected, onClick, muted }: {
  label: string; selected: boolean; onClick: () => void; muted?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '9px 12px', fontSize: 12, cursor: 'pointer',
        backgroundColor: selected ? '#eef2ff' : '#fff',
        color: muted ? '#64748b' : '#0f172a',
        fontWeight: selected ? 700 : 400,
        borderBottom: '1px solid #f8fafc',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {label}
    </div>
  );
}

/** Everything that ever happened with one counterparty, oldest first, with a
 *  running balance so the closing position is traceable line by line. */
function HistoryPanel({ counterparty, rows }: { counterparty: string; rows: Row[] }) {
  const { primary: currency } = useCurrency();
  // Oldest first here, unlike the main register — a running balance only reads
  // correctly downwards.
  const ordered = [...rows].sort((a, b) =>
    (a.date || '').localeCompare(b.date || '') || a.seq.localeCompare(b.seq) || a.key.localeCompare(b.key));
  const last  = ordered[ordered.length - 1];
  const recv  = last?.runRecv ?? 0;
  const pay   = last?.runPay  ?? 0;
  const net   = recv - pay;

  return (
    <div style={{
      padding: '14px 18px 18px 46px',
      borderTop: '1px solid #e2e8f0',
      // Without border-box the 64px of horizontal padding is ADDED to the
      // measured width, putting the panel right back outside the viewport.
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{counterparty}</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {ordered.length} record{ordered.length === 1 ? '' : 's'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: net >= 0 ? '#047857' : '#dc2626' }}>
          {net === 0
            ? 'Settled — nothing outstanding'
            : net > 0
              ? `${aed(net, currency)} to receive`
              : `${aed(Math.abs(net), currency)} to pay`}
        </span>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 11.5, backgroundColor: '#fff' }}>
        <thead>
          <tr style={{ backgroundColor: '#f1f5f9' }}>
            {['Date', 'Flow', 'Category', 'Sub-Category', 'Reference', 'Amount',
              'Received', 'Paid', 'Remaining Amount', 'Status'].map((h, i) => (
              <th key={h} style={{
                padding: '7px 10px', fontSize: 9.5, fontWeight: 800, color: '#64748b',
                letterSpacing: '.05em', textTransform: 'uppercase',
                textAlign: h === 'Status' ? 'center'
                         : i >= 5 && i <= 7 ? 'right'
                         : 'left',
                whiteSpace: 'nowrap',
                ...(h === 'Remaining Amount' ? { paddingLeft: 28 } : {}),
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map(h => {
            const bal = h.runRecv - h.runPay;   // running, not closing
            const remainingLabel =
              Math.abs(bal) < 0.01 ? '—'
              : bal > 0            ? `${aed(bal, currency)} to receive`
                                   : `${aed(Math.abs(bal), currency)} to pay`;
            // Follows the RUNNING figure in the column beside it. Using the
            // row's closing status here put "Cleared" next to "3,400 to pay"
            // on the same line — the day the money was still owed.
            const rowStatus =
              Math.abs(bal) < 0.01 ? 'Cleared'
              : h.partialTxn       ? 'Partial'
                                   : 'Outstanding';
            return (
              <tr key={h.key} style={{ borderTop: '1px solid #f8fafc' }}>
                <td style={S.hTd}>{h.date || '—'}</td>
                <td style={{ ...S.hTd, fontWeight: 700, color: h.flow === 'Inflow' ? '#059669' : h.flow ? '#dc2626' : '#cbd5e1' }}>
                  {h.flow || '—'}
                </td>
                <td style={S.hTd}>{h.category}</td>
                <td style={S.hTd}>{h.subCategory}</td>
                <td style={{ ...S.hTd, fontFamily: 'monospace', fontSize: 10.5, color: '#4f46e5' }}>{h.refNo || '—'}</td>
                <td style={S.hNum}>{aed(h.amount, currency)}</td>
                <td style={{ ...S.hNum, color: h.received ? '#059669' : '#cbd5e1' }}>{aed(h.received, currency)}</td>
                <td style={{ ...S.hNum, color: h.paid ? '#dc2626' : '#cbd5e1' }}>{aed(h.paid, currency)}</td>
                <td style={{
                  ...S.hTd, fontWeight: 800, paddingLeft: 28,
                  color: Math.abs(bal) < 0.01 ? '#94a3b8' : bal > 0 ? '#047857' : '#dc2626',
                }}>{remainingLabel}</td>
                <td style={{
                  ...S.hTd, textAlign: 'center',
                  color: rowStatus === 'Cleared' ? '#047857'
                       : rowStatus === 'Partial' ? '#b45309' : '#b91c1c',
                  fontWeight: 600,
                }}>{rowStatus}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 7 }}>
        Full history for this counterparty — filters above do not narrow it.
        Remaining Amount is what is still outstanding after each entry, and which
        way it goes. Status follows that figure, so a row reads Cleared only when
        nothing at all is left with this person.
      </div>
    </div>
  );
}

const S = {
  th: {
    padding: '11px 12px', fontSize: 10, fontWeight: 800, color: '#64748b',
    textTransform: 'uppercase' as const, letterSpacing: '.05em', whiteSpace: 'nowrap' as const,
  },
  td: { padding: '11px 12px', color: '#334155', verticalAlign: 'top' as const },

  /** Header row pins to the top of the scroll container. */
  stickyHead: {
    position: 'sticky' as const, top: 0, zIndex: 3,
    backgroundColor: '#f8fafc',
    boxShadow: 'inset 0 -1px 0 #e2e8f0',
  },
  /** Expander column — outermost frozen column. */
  freeze0: {
    position: 'sticky' as const, left: 0, zIndex: 2, width: 36,
  },
  /** Date column, parked immediately right of the 36px expander. Higher
   *  z-index than the scrolling cells so they pass underneath it. */
  freeze1: {
    position: 'sticky' as const, left: 36, zIndex: 2, minWidth: 108,
    boxShadow: '1px 0 0 #e2e8f0',
  },
  hTd: { padding: '7px 10px', color: '#334155', whiteSpace: 'nowrap' as const },
  rangeLbl: {
    fontSize: 10, fontWeight: 800, color: '#64748b',
    letterSpacing: '.06em', textTransform: 'uppercase' as const,
  },
  rangeInput: {
    border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 8px',
    fontSize: 12, color: '#0f172a', backgroundColor: '#fff', outline: 'none',
  },
  hNum: {
    padding: '7px 10px', color: '#334155', textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const,
  },
  ghost: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 13px',
    border: '1px solid #e2e8f0', borderRadius: 9, backgroundColor: '#fff',
    color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  },
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 15px',
    border: 'none', borderRadius: 9, backgroundColor: '#0f172a',
    color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  },
};

export default AccountsPayableReceivableReport;