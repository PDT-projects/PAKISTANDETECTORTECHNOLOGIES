// Income Statement Report — expandable tree
//
// Standard P&L layout with an Excel-style outline: each section can be
// expanded to reveal its sub-categories, and each sub-category can be
// expanded to reveal the individual transactions (or per-invoice rows
// for COGS) that make it up.
//
// Levels of hierarchy:
//   0 · Section        Revenue / Cost of Goods Sold / Operating Expenses
//   1 · Sub-category   e.g. "Sales Invoice", "Payrolls", "Utility Bills"
//                      or for COGS: "Supplier Cost", "Purchase Cost"
//   2 · Detail row     one individual transaction or invoice line
//
// Balance-sheet items (Account Payable/Receivable, Loans, Purchase Order)
// stay excluded from the P&L math but appear in an informational footer
// so nothing goes silently missing from the ledger.

import React, { useMemo, useState } from 'react';
import { useCurrency } from '../../providers/context/CurrencyContext';
import {
  ChevronRight, TrendingUp, TrendingDown, Package, Percent,
  Download, Calendar, Layers, Minimize2, Maximize2, DollarSign,
} from 'lucide-react';
import { Transaction, SOLD_GOODS_PAYMENT_CATEGORY } from '../../modules/transactions/models/types';

interface Props {
  transactions: Transaction[];
  invoices:     any[];
  onBack?:      () => void;
}

// Balance-sheet items excluded from P&L calculations
const EXCLUDED_CATEGORIES = new Set<string>([
  'Account Payable',
  'Account Receivable',
  'Loan Receivable',
  'Loan Received',
  'Purchase Order',
]);

// Complete list of Operating Expense sub-categories the P&L should ALWAYS
// display — even when no transaction has been booked against them yet.
// This makes the statement look "complete" so the reader can see the full
// chart of expense accounts at a glance. New categories that appear in the
// ledger but aren't in this list still show up (appended at the end).
const KNOWN_OPEX_CATEGORIES: string[] = [
  'Invoice Misc Expense',
  'Payrolls',
  'Utility Bills & Rents',
  'Grocery & Stationery',
  'Advertising and Marketing',
  'Supplier Payment',
  // 'Supplier Cost' (and its pre-rename label 'Sold Goods Payment') moved OUT
  // of this list: it's money paid to the supplier for goods sold — a direct
  // Cost of Goods Sold item, not an operating expense. See
  // COGS_TRANSACTION_CATEGORIES below, which now routes it into COGS instead.
  'Logistics & Freight',
  'Bank Charges',
  'Travelling/Accommodations & Food',
  'Zakat & Donations',
  'Tax & Consultations',
  'Other Expenses',
];

// Complete list of Revenue sub-categories the P&L should ALWAYS display.
const KNOWN_REVENUE_CATEGORIES: string[] = [
  'Sales Invoice',
];

// CURRENCY used to be a hardcoded module constant — now each component below
// reads it from the system-wide currency setting (admin-controlled, see
// CurrencyContext) so switching currency relabels every amount here too.
// This is symbol-only: the underlying numbers are never converted.
const fmt = (n: number) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch { return iso; }
};

// ── Tree node type ─────────────────────────────────────────────────────────
interface TreeNode {
  id: string;
  label: string;
  amount: number;
  meta?: string;         // e.g. "12 transactions" or the date/customer
  children?: TreeNode[]; // undefined = leaf
  level: 0 | 1 | 2;
  tone: 'revenue' | 'cogs' | 'opex';
}

export function IncomeStatementReport({ transactions, invoices }: Props) {
  const { primary: CURRENCY } = useCurrency();
  // ── Date-range filter with quick presets ──────────────────────────────
  type Preset = 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisQuarter' | 'thisYear' | 'allTime' | 'custom';
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Compute [from, to] for a preset and apply it.
  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'custom') return;   // leave from/to as-is; user will edit manually
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    let f: Date, t: Date;
    switch (p) {
      case 'thisMonth':
        f = new Date(now.getFullYear(), now.getMonth(), 1);
        t = now;
        break;
      case 'lastMonth':
        f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        t = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'last3Months':
        f = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        t = now;
        break;
      case 'thisQuarter': {
        const q = Math.floor(now.getMonth() / 3);
        f = new Date(now.getFullYear(), q * 3, 1);
        t = now;
        break;
      }
      case 'thisYear':
        f = new Date(now.getFullYear(), 0, 1);
        t = now;
        break;
      case 'allTime':
        f = new Date(2000, 0, 1);
        t = now;
        break;
      default:
        return;
    }
    setFrom(iso(f));
    setTo(iso(t));
  };

  // When user edits the dates directly, mark preset as "custom"
  const onFromChange = (v: string) => { setFrom(v); setPreset('custom'); };
  const onToChange   = (v: string) => { setTo(v);   setPreset('custom'); };

  // ── Filter data by date range ──────────────────────────────────────────
  const { txInRange, invInRange } = useMemo(() => {
    const inRange = (dateStr: string) => {
      if (!dateStr) return false;
      const d = dateStr.slice(0, 10);
      return d >= from && d <= to;
    };
    const txInRange = (transactions || []).filter(t => {
      if (!inRange(t.date)) return false;
      const ap = (t as any).approvalStatus;
      if (ap === 'pending_approval' || ap === 'rejected') return false;
      return true;
    });
    const invInRange = (invoices || []).filter(i => inRange(i.date) && i.status !== 'deleted');
    return { txInRange, invInRange };
  }, [transactions, invoices, from, to]);

  // ── Build the tree ─────────────────────────────────────────────────────
  const { revenueSection, cogsSection, opexSection, excludedNodes,
          totalRevenue, cogsTotal, totalExpense, grossProfit, operatingIncome,
          grossMargin, netMargin, allExpandableIds } = useMemo(() => {

    // Group inflow + outflow transactions by subCategory, keeping the
    // individual transactions inside for the detail level.
    const revenueBuckets: Record<string, Transaction[]> = {};
    const opexBuckets:    Record<string, Transaction[]> = {};
    const cogsBuckets:    Record<string, Transaction[]> = {};
    const excludedBuckets:Record<string, Transaction[]> = {};

    // Outflow sub-categories that are an actual Cost of Goods Sold, not an
    // Operating Expense — routed into COGS instead. Currently just the
    // supplier-payment category (SOLD_GOODS_PAYMENT_CATEGORY = 'Supplier
    // Cost' — money paid to the supplier for goods sold via a specific
    // invoice; see types.ts). 'Sold Goods Payment' is its pre-rename label —
    // older rows can still carry that exact string.
    const COGS_TRANSACTION_CATEGORIES = new Set<string>([
      SOLD_GOODS_PAYMENT_CATEGORY,
      'Sold Goods Payment',
    ]);

    for (const t of txInRange) {
      const cat  = t.subCategory || (t as any).category || 'Uncategorized';
      const main = t.mainCategory;

      if (EXCLUDED_CATEGORIES.has(cat)) {
        (excludedBuckets[cat] ||= []).push(t);
        continue;
      }
      if (main === 'Cash Inflow') (revenueBuckets[cat] ||= []).push(t);
      if (main === 'Cash Outflow') {
        if (COGS_TRANSACTION_CATEGORIES.has(cat)) (cogsBuckets[cat] ||= []).push(t);
        else                                      (opexBuckets[cat] ||= []).push(t);
      }
    }

    // Turn each bucket into a TreeNode with children = detail rows
    const bucketToNode = (
      cat: string,
      txs: Transaction[],
      tone: TreeNode['tone'],
    ): TreeNode => {
      const total = txs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const children: TreeNode[] = txs
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((t, i) => ({
          id: `tx-${t.id || `${cat}-${i}`}`,
          label: t.detailCategory || t.note || `${fmtDate(t.date)} · Transaction`,
          amount: Number(t.amount) || 0,
          meta: `${fmtDate(t.date)}${t.mode ? ' · ' + t.mode : ''}${t.paidBy ? ' · ' + t.paidBy : ''}${t.paidTo ? ' · ' + t.paidTo : ''}`,
          level: 2,
          tone,
        }));
      return {
        id: `${tone}-cat-${cat}`,
        label: cat,
        amount: total,
        meta: txs.length === 0
          ? 'no activity'
          : `${txs.length} ${txs.length === 1 ? 'transaction' : 'transactions'}`,
        level: 1,
        tone,
        children,
      };
    };

    // Union of KNOWN category list + any category actually seen in the
    // period. Known ones always render (with zero + "no activity") so the
    // chart-of-accounts view is complete. Unknown ones append at the end.
    const mergeCategories = (known: string[], seen: string[]): string[] => {
      const out: string[] = [];
      const usedSet = new Set<string>();
      for (const k of known)  { if (!usedSet.has(k)) { out.push(k); usedSet.add(k); } }
      for (const s of seen)   { if (!usedSet.has(s)) { out.push(s); usedSet.add(s); } }
      return out;
    };

    // Sort: first the categories with activity (descending by amount), then
    // the zero-activity known ones in their declared order.
    const orderNodes = (nodes: TreeNode[]): TreeNode[] => {
      const withData = nodes.filter(n => (n.children?.length || 0) > 0);
      const empty    = nodes.filter(n => (n.children?.length || 0) === 0);
      withData.sort((a, b) => b.amount - a.amount);
      return [...withData, ...empty];
    };

    const revenueCategories = mergeCategories(KNOWN_REVENUE_CATEGORIES, Object.keys(revenueBuckets));
    const revenueCatNodes = orderNodes(revenueCategories.map(k =>
      bucketToNode(k, revenueBuckets[k] || [], 'revenue')
    ));

    const opexCategories = mergeCategories(KNOWN_OPEX_CATEGORIES, Object.keys(opexBuckets));
    const opexCatNodes = orderNodes(opexCategories.map(k =>
      bucketToNode(k, opexBuckets[k] || [], 'opex')
    ));

    const excludedCatNodes = (Object.keys(excludedBuckets) as string[])
      .map(k => bucketToNode(k, excludedBuckets[k], 'opex'))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    const totalRevenue = revenueCatNodes.reduce((s, n) => s + n.amount, 0);
    const totalExpense = opexCatNodes.reduce((s, n) => s + n.amount, 0);

    // COGS section — build from invoices.
    //
    // This used to also show a "Supplier Cost" row (from inv.supplierCostTotal)
    // alongside Purchase Cost. Removed: that figure is what's owed TO the
    // supplier for goods bought against payment — a payable, not a cost the
    // business has recognized as an expense yet — so showing it here inflated
    // COGS and understated Gross Profit for invoices that hadn't actually
    // been paid for. Purchase Cost (inv.purchaseCostTotal) is the actual
    // recognized cost of goods sold and is what COGS is built from now.
    let purchaseTotal = 0;
    const purchaseChildren: TreeNode[] = [];
    for (const inv of invInRange) {
      const pc = Number(inv.purchaseCostTotal) || 0;
      const invLabel = `${inv.invoiceNumber || 'INV-?'} · ${inv.customerName || 'Customer'}`;
      const invMeta  = fmtDate(inv.date);
      if (pc > 0) {
        purchaseTotal += pc;
        purchaseChildren.push({
          id: `cogs-pur-${inv.id || inv.invoiceNumber}`,
          label: invLabel, amount: pc, meta: invMeta, level: 2, tone: 'cogs',
        });
      }
    }
    purchaseChildren.sort((a, b) => b.amount - a.amount);

    // "Supplier Cost" — actual payments made to the supplier for goods sold
    // (COGS_TRANSACTION_CATEGORIES transactions, moved back here from
    // Operating Expenses per user correction: this is money paid for the
    // goods sold, a direct cost of goods sold, not an operating expense).
    // NOTE: this is NOT the same figure the old removed COGS row used
    // (inv.supplierCostTotal, an unpaid/accrued liability on the invoice) —
    // that stays removed for the reason in the comment above. This is the
    // actual recognized, paid transaction ledger for the same category name.
    const supplierCostTxns = [
      ...(cogsBuckets[SOLD_GOODS_PAYMENT_CATEGORY] || []),
      ...(cogsBuckets['Sold Goods Payment'] || []),
    ];
    const supplierCostNode = bucketToNode('Supplier Cost', supplierCostTxns, 'cogs');

    const cogsCatNodes: TreeNode[] = orderNodes([
      {
        id: 'cogs-cat-purchase',
        label: 'Purchase Cost',
        amount: purchaseTotal,
        meta: purchaseChildren.length === 0
          ? 'no invoices'
          : `${purchaseChildren.length} ${purchaseChildren.length === 1 ? 'invoice' : 'invoices'}`,
        level: 1, tone: 'cogs', children: purchaseChildren,
      },
      supplierCostNode,
    ]);
    const cogsTotal = purchaseTotal + supplierCostNode.amount;

    // Section-level nodes
    const revenueSection: TreeNode = {
      id: 'section-revenue',
      label: 'Revenue', amount: totalRevenue,
      meta: `${revenueCatNodes.length} ${revenueCatNodes.length === 1 ? 'category' : 'categories'}`,
      level: 0, tone: 'revenue', children: revenueCatNodes,
    };
    const cogsSection: TreeNode = {
      id: 'section-cogs',
      label: 'Cost of Goods Sold', amount: cogsTotal,
      meta: `${cogsCatNodes.length} ${cogsCatNodes.length === 1 ? 'category' : 'categories'}`,
      level: 0, tone: 'cogs', children: cogsCatNodes,
    };
    const opexSection: TreeNode = {
      id: 'section-opex',
      label: 'Operating Expenses', amount: totalExpense,
      meta: `${opexCatNodes.length} ${opexCatNodes.length === 1 ? 'category' : 'categories'}`,
      level: 0, tone: 'opex', children: opexCatNodes,
    };

    // Aggregates
    const grossProfit     = totalRevenue - cogsTotal;
    const grossMargin     = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const operatingIncome = grossProfit - totalExpense;
    const netMargin       = totalRevenue > 0 ? (operatingIncome / totalRevenue) * 100 : 0;

    // Collect every expandable ID (for Expand All / Collapse All)
    const collect = (n: TreeNode, acc: string[]): void => {
      if (n.children && n.children.length > 0) {
        acc.push(n.id);
        n.children.forEach(c => collect(c, acc));
      }
    };
    const allExpandableIds: string[] = [];
    [revenueSection, cogsSection, opexSection].forEach(s => collect(s, allExpandableIds));

    return {
      revenueSection, cogsSection, opexSection,
      excludedNodes: excludedCatNodes,
      totalRevenue, cogsTotal, totalExpense,
      grossProfit, operatingIncome, grossMargin, netMargin,
      allExpandableIds,
    };
  }, [txInRange, invInRange]);

  // ── Expand/collapse state ─────────────────────────────────────────────
  // Only the three top-level SECTIONS (Revenue / COGS / OpEx) are open on
  // first render — categories start collapsed so the report presents as a
  // clean summary. Click any category chevron to drill into its
  // transactions / per-invoice details.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['section-revenue', 'section-cogs', 'section-opex'])
  );

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const expandAll   = () => setExpanded(new Set(['section-revenue', 'section-cogs', 'section-opex', ...allExpandableIds]));
  const collapseAll = () => setExpanded(new Set());

  // ── CSV export ────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows: string[] = [];
    rows.push(`Income Statement,${from} to ${to}`);
    rows.push('');

    const dump = (n: TreeNode, indent = 0) => {
      const pad = '  '.repeat(indent);
      rows.push(`${pad}${n.label},${n.amount.toFixed(2)}`);
      if (n.children) n.children.forEach(c => dump(c, indent + 1));
    };
    dump(revenueSection);
    rows.push('');
    dump(cogsSection);
    rows.push('');
    rows.push(`Gross Profit,${grossProfit.toFixed(2)}`);
    rows.push(`Gross Margin %,${grossMargin.toFixed(2)}`);
    rows.push('');
    dump(opexSection);
    rows.push('');
    rows.push(`${operatingIncome >= 0 ? 'Net Profit' : 'Net Loss'},${operatingIncome.toFixed(2)}`);
    rows.push(`Net Margin %,${netMargin.toFixed(2)}`);

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `income-statement-${from}-to-${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const inp: React.CSSProperties = {
    padding: '7px 11px', border: '1px solid #e2e8f0', borderRadius: 7,
    fontSize: 12.5, outline: 'none', backgroundColor: '#fff',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>

      {/* ── Filters + actions ────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '14px 16px', backgroundColor: '#fff',
        borderRadius: 12, border: '1px solid #e2e8f0',
      }}>
        {/* Preset chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 4 }}>
            Quick range
          </label>
          {([
            ['thisMonth',   'This month'],
            ['lastMonth',   'Last month'],
            ['last3Months', 'Last 3 months'],
            ['thisQuarter', 'This quarter'],
            ['thisYear',    'This year'],
            ['allTime',     'All time'],
          ] as [Preset, string][]).map(([id, label]) => {
            const active = preset === id;
            return (
              <button
                key={id}
                onClick={() => applyPreset(id)}
                style={{
                  padding: '5px 11px', borderRadius: 99,
                  border: active ? 'none' : '1px solid #e2e8f0',
                  backgroundColor: active ? '#0f172a' : '#fff',
                  color: active ? '#fff' : '#334155',
                  fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  whiteSpace: 'nowrap', transition: 'all 0.12s ease',
                }}
              >
                {label}
              </button>
            );
          })}
          {preset === 'custom' && (
            <span style={{
              padding: '5px 11px', borderRadius: 99, backgroundColor: '#fef3c7',
              color: '#92400e', fontSize: 11, fontWeight: 700,
            }}>
              Custom range
            </span>
          )}
        </div>

        {/* Custom date pickers + action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Calendar size={15} color="#64748b" />
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>From</label>
          <input type="date" value={from} onChange={e => onFromChange(e.target.value)} max={to} style={inp} />
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>To</label>
          <input type="date" value={to}   onChange={e => onToChange(e.target.value)}   min={from} style={inp} />

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={expandAll} title="Expand every category"
              style={{ ...miniBtn, color: '#334155' }}>
              <Maximize2 size={12} /> Expand All
            </button>
            <button onClick={collapseAll} title="Collapse everything"
              style={{ ...miniBtn, color: '#334155' }}>
              <Minimize2 size={12} /> Collapse All
            </button>
            <button onClick={handleExport} title="Export as CSV"
              style={{ ...miniBtn, backgroundColor: '#0f172a', color: '#fff', border: 'none' }}>
              <Download size={12} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary tiles ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
        <SummaryTile icon={<TrendingUp size={18} />}   label="Revenue"   value={totalRevenue}    fg="#059669" bg="#ecfdf5" />
        <SummaryTile icon={<Package size={18} />}       label="COGS"      value={cogsTotal}       fg="#c2410c" bg="#fff7ed" />
        <SummaryTile icon={<TrendingDown size={18} />} label="Op. Expenses" value={totalExpense}  fg="#dc2626" bg="#fef2f2" />
        <SummaryTile icon={<Percent size={18} />}
          label={operatingIncome >= 0 ? 'Net Income' : 'Net Loss'}
          value={operatingIncome}
          fg={operatingIncome >= 0 ? '#059669' : '#dc2626'}
          bg={operatingIncome >= 0 ? '#ecfdf5' : '#fef2f2'}
          showSign highlight />
      </div>

      {/* ── The statement ────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: '#fff', borderRadius: 12,
        border: '1px solid #e2e8f0', overflow: 'hidden',
      }}>
        {/* Header strip */}
        <div style={{
          padding: '14px 22px', borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(90deg, #f8fafc 0%, #ffffff 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} color="#334155" />
              Income Statement
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              For the period {fmtDate(from)} → {fmtDate(to)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LegendBadge color="#059669" label="Revenue" />
            <LegendBadge color="#c2410c" label="COGS" />
            <LegendBadge color="#dc2626" label="Expenses" />
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 10,
          padding: '10px 22px', backgroundColor: '#fafbfc',
          borderBottom: '1px solid #e2e8f0',
          fontSize: 10, fontWeight: 800, color: '#94a3b8',
          textTransform: 'uppercase', letterSpacing: '.08em',
        }}>
          <span>Category</span>
          <span style={{ textAlign: 'right', minWidth: 160 }}>Amount ({CURRENCY})</span>
        </div>

        {/* Tree body */}
        <div>
          {/* Revenue */}
          <TreeSection node={revenueSection} expanded={expanded} toggle={toggle}
                        emptyMessage="No revenue in this period." />

          {/* COGS */}
          <TreeSection node={cogsSection} expanded={expanded} toggle={toggle}
                        emptyMessage="No cost of goods sold in this period." />

          {/* Gross Profit total row */}
          <TotalRow label="Gross Profit"
                    value={grossProfit}
                    marginPct={grossMargin}
                    tone={grossProfit >= 0 ? 'positive' : 'negative'} />

          {/* Op Ex */}
          <TreeSection node={opexSection} expanded={expanded} toggle={toggle}
                        emptyMessage="No operating expenses in this period." />

          {/* Net Profit / Net Loss — the headline number */}
          <TotalRow label={operatingIncome >= 0 ? 'Net Profit' : 'Net Loss'}
                    value={operatingIncome}
                    marginPct={netMargin}
                    tone={operatingIncome >= 0 ? 'positive' : 'negative'}
                    highlight />
        </div>
      </div>

      {/* ── Balance-sheet items footer ───────────────────────────────── */}
      {excludedNodes.length > 0 && (
        <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 22px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafbfc' }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarSign size={13} color="#64748b" />
              Balance Sheet Items · informational only
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Payables, receivables, loans and inventory purchases — asset / liability movements that don't affect the P&L.
            </div>
          </div>
          <div>
            {excludedNodes.map(n => (
              <TreeBranch key={n.id} node={n} expanded={expanded} toggle={toggle} depth={0} isBalanceSheet />
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '6px 8px 12px' }}>
        Numbers refresh live from the ledger. Pending-approval and rejected transactions are excluded.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Presentational sub-components
// ─────────────────────────────────────────────────────────────────────────

const miniBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '7px 12px', borderRadius: 7, border: '1px solid #e2e8f0',
  backgroundColor: '#fff', fontSize: 11.5, fontWeight: 700,
  cursor: 'pointer', whiteSpace: 'nowrap',
};

const toneColor = (tone: TreeNode['tone']) => ({
  revenue: '#059669',
  cogs:    '#c2410c',
  opex:    '#dc2626',
}[tone]);
const toneBg = (tone: TreeNode['tone']) => ({
  revenue: '#ecfdf5',
  cogs:    '#fff7ed',
  opex:    '#fef2f2',
}[tone]);

const SummaryTile: React.FC<{
  icon: React.ReactNode; label: string; value: number;
  fg: string; bg: string; showSign?: boolean; highlight?: boolean;
}> = ({ icon, label, value, fg, bg, showSign, highlight }) => {
  const { primary: CURRENCY } = useCurrency();
  const sign  = showSign ? (value >= 0 ? '' : '−') : '';
  const shown = showSign ? Math.abs(value) : value;
  return (
    <div style={{
      backgroundColor: highlight ? fg : '#fff',
      borderRadius: 12, padding: '16px 18px',
      border: highlight ? 'none' : '1px solid #e2e8f0',
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: highlight ? '0 6px 16px -6px rgba(15,23,42,0.15)' : '0 1px 2px rgba(0,0,0,0.03)',
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 11,
        backgroundColor: highlight ? 'rgba(255,255,255,0.18)' : bg,
        color: highlight ? '#fff' : fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: highlight ? 'rgba(255,255,255,0.85)' : '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: highlight ? '#fff' : fg, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginTop: 2 }}>
          {sign}<span style={{ fontSize: 11, opacity: 0.7, marginRight: 3 }}>{CURRENCY}</span>{fmt(shown)}
        </div>
      </div>
    </div>
  );
};

const LegendBadge: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
    <span style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: color, display: 'inline-block' }} />
    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
  </div>
);

const TreeSection: React.FC<{
  node: TreeNode;
  expanded: Set<string>;
  toggle: (id: string) => void;
  emptyMessage: string;
}> = ({ node, expanded, toggle, emptyMessage }) => {
  return (
    <>
      <TreeRow node={node} expanded={expanded} toggle={toggle} depth={0} />
      {expanded.has(node.id) && (node.children && node.children.length > 0
        ? node.children.map(c => (
            <TreeBranch key={c.id} node={c} expanded={expanded} toggle={toggle} depth={1} />
          ))
        : (
          <div style={{
            padding: '12px 22px 12px 60px', fontSize: 12, color: '#94a3b8',
            fontStyle: 'italic', backgroundColor: '#fafbfc',
          }}>
            {emptyMessage}
          </div>
        )
      )}
    </>
  );
};

// Recursive branch renderer — renders the row for `node`, then if expanded
// and it has children, renders each child recursively. This is what makes
// the tree actually expand all levels (level 1 → level 2 detail rows).
// If a node has no children and IS a header-level row (level 0 or 1), we
// render nothing extra — the "no activity" hint is baked into the row meta.
const TreeBranch: React.FC<{
  node: TreeNode;
  expanded: Set<string>;
  toggle: (id: string) => void;
  depth: number;
  isBalanceSheet?: boolean;
}> = ({ node, expanded, toggle, depth, isBalanceSheet }) => {
  const isOpen = expanded.has(node.id);
  const hasChildren = !!node.children && node.children.length > 0;
  return (
    <>
      <TreeRow node={node} expanded={expanded} toggle={toggle} depth={depth} isBalanceSheet={isBalanceSheet} />
      {isOpen && hasChildren && node.children!.map(c => (
        <TreeBranch key={c.id} node={c} expanded={expanded} toggle={toggle} depth={depth + 1} isBalanceSheet={isBalanceSheet} />
      ))}
    </>
  );
};

const TreeRow: React.FC<{
  node: TreeNode;
  expanded: Set<string>;
  toggle: (id: string) => void;
  depth: number;
  isBalanceSheet?: boolean;
}> = ({ node, expanded, toggle, depth, isBalanceSheet }) => {
  const { primary: CURRENCY } = useCurrency();
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const color = toneColor(node.tone);
  const bgTone = toneBg(node.tone);

  // Styling per level
  let rowStyle: React.CSSProperties;
  if (node.level === 0) {
    // Section header — bold, tinted, bigger
    rowStyle = {
      backgroundColor: bgTone,
      padding: '14px 22px', fontSize: 13.5, fontWeight: 800,
      color: '#0f172a',
      borderBottom: '1px solid #e2e8f0',
    };
  } else if (node.level === 1) {
    // Category — medium, indented. Fade zero-activity ones so the
    // reader's eye lands on the categories that actually moved money.
    const isEmpty = !hasChildren;
    rowStyle = {
      backgroundColor: isOpen ? '#f8fafc' : '#fff',
      padding: '10px 22px 10px 42px', fontSize: 12.5, fontWeight: 700,
      color: '#334155',
      borderBottom: '1px solid #f1f5f9',
      opacity: isEmpty ? 0.5 : 1,
    };
  } else {
    // Detail — small, deep indent, muted
    rowStyle = {
      backgroundColor: '#fff',
      padding: '8px 22px 8px 66px', fontSize: 12, fontWeight: 500,
      color: '#475569',
      borderBottom: '1px solid #f8fafc',
    };
  }

  const clickable = hasChildren;

  return (
    <div
      onClick={clickable ? () => toggle(node.id) : undefined}
      style={{
        ...rowStyle,
        display: 'grid', gridTemplateColumns: '1fr auto', gap: 10,
        alignItems: 'center',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'background-color 0.12s ease',
      }}
      onMouseEnter={e => {
        if (clickable) {
          (e.currentTarget as HTMLDivElement).style.backgroundColor =
            node.level === 0 ? bgTone : '#f1f5f9';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = rowStyle.backgroundColor as string;
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {hasChildren ? (
          <ChevronRight size={node.level === 0 ? 15 : 13}
            style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', color: color, flexShrink: 0 }} />
        ) : (
          <span style={{ width: 13, display: 'inline-block', flexShrink: 0 }} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</span>
        {node.meta && (
          <span style={{
            fontSize: node.level === 0 ? 11 : 10, fontWeight: 500,
            color: '#94a3b8', marginLeft: 4, whiteSpace: 'nowrap',
            fontStyle: node.level === 2 ? 'italic' : 'normal',
          }}>
            {node.level === 2 ? node.meta : `· ${node.meta}`}
          </span>
        )}
      </div>
      <span style={{
        textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        fontWeight: node.level === 0 ? 800 : node.level === 1 ? 700 : 600,
        color: isBalanceSheet
          ? (node.amount >= 0 ? '#059669' : '#dc2626')
          : color,
        fontSize: node.level === 0 ? 14 : node.level === 1 ? 13 : 12,
        minWidth: 160, paddingLeft: 8,
      }}>
        {node.level === 2 && node.tone !== 'revenue' ? '−' : ''}
        <span style={{ opacity: 0.55, fontSize: '0.82em', marginRight: 4 }}>{CURRENCY}</span>
        {fmt(Math.abs(node.amount))}
      </span>
    </div>
  );
};

const TotalRow: React.FC<{
  label: string;
  value: number;
  marginPct?: number;
  tone: 'positive' | 'negative';
  highlight?: boolean;
}> = ({ label, value, marginPct, tone, highlight }) => {
  const { primary: CURRENCY } = useCurrency();
  const color = tone === 'positive' ? '#059669' : '#dc2626';
  const positive = value >= 0;
  return (
    <div style={{
      backgroundColor: highlight ? '#0f172a' : '#f1f5f9',
      padding: '14px 22px',
      borderTop:    highlight ? '2px solid #0f172a' : '1px solid #cbd5e1',
      borderBottom: highlight ? '2px solid #0f172a' : '1px solid #cbd5e1',
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: highlight ? '#fff' : '#0f172a' }}>{label}</span>
        {marginPct != null && (
          <span style={{
            padding: '3px 8px', borderRadius: 99,
            backgroundColor: highlight ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.06)',
            color: highlight ? '#e2e8f0' : '#334155',
            fontSize: 10.5, fontWeight: 700,
          }}>
            Margin {marginPct.toFixed(1)}%
          </span>
        )}
      </div>
      <span style={{
        fontSize: 16, fontWeight: 800,
        color: highlight ? (positive ? '#6ee7b7' : '#fca5a5') : color,
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        minWidth: 160, textAlign: 'right', paddingLeft: 8,
      }}>
        {!positive ? '−' : ''}
        <span style={{ opacity: 0.7, fontSize: '0.82em', marginRight: 4 }}>{CURRENCY}</span>
        {fmt(Math.abs(value))}
      </span>
    </div>
  );
};