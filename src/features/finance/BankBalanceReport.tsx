// Balance Sheet Report — expandable tree
//
// Excel-outline style with three top-level sections:
//   • Assets       — Cash + Banks + Accounts Receivable + Inventory +
//                    Loans Receivable
//   • Liabilities  — Accounts Payable + Loans Payable + Pending Bills
//   • Equity       — Owner's equity (Assets − Liabilities)
//
// Each category with underlying detail (per bank, per loan, per invoice)
// expands to show individual rows.
//
// Filters: date preset chips + custom From/To. All filters apply to the
// underlying transactions used to compute the sheet.
//
// Exports: CSV (nested) and PDF (jsPDF, printable A4 layout).

import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  ChevronRight, TrendingUp, TrendingDown, Scale, Calendar,
  Download, Layers, Minimize2, Maximize2, FileText,
  Wallet, Landmark, Package, HandCoins, Receipt,
} from 'lucide-react';
import { getTransactionTotals } from '../../modules/transactions/models/transactionsService';
import { Transaction } from '../../modules/transactions/models/types';
import { useGlobalCurrency } from '../../shared/currency/useGlobalCurrency';
import { getGlobalCurrencySymbol, getGlobalCurrency } from '../../shared/currency/globalCurrency';
import { CurrencyCode } from './currencyUtils';

// ── Types ──────────────────────────────────────────────────────────────────
type Bank    = { id: string; name: string; balance: number; accountNumber?: string; };
type Loan    = { id: string; type: 'Payable' | 'Receivable'; remaining: number; loanAmount: number; paid: number; status: string; borrowerName?: string; lenderName?: string; };
type Product = { id: string; costPrice: number; stock: number; };
type Bill    = { id: string; amount: number; status: string; description?: string; };

interface Props {
  transactions: Transaction[];
  banks: Bank[];
  loans: Loan[];
  products: Product[];
  bills?: Bill[];
  onBack?: () => void;
}

// ── Formatters ─────────────────────────────────────────────────────────────
const CURRENCY = () => getGlobalCurrencySymbol();
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
  meta?: string;
  children?: TreeNode[];
  level: 0 | 1 | 2;
  tone: 'asset' | 'liability' | 'equity';
  icon?: React.ReactNode;
}

export function BalanceSheetReport({ transactions, banks, loans, products, bills = [], onBack }: Props) {
  useGlobalCurrency(); // subscribe so this view re-renders on currency change


  // ── Date-range filter with quick presets ──────────────────────────────
  type Preset = 'all' | 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear' | 'custom';
  const [preset, setPreset] = useState<Preset>('all');
  const [from, setFrom] = useState<string>('2000-01-01');
  const [to, setTo]     = useState<string>(() => new Date().toISOString().slice(0, 10));

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'custom') return;
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    let f: Date, t: Date;
    switch (p) {
      case 'thisMonth':   f = new Date(now.getFullYear(), now.getMonth(), 1); t = now; break;
      case 'lastMonth':   f = new Date(now.getFullYear(), now.getMonth() - 1, 1); t = new Date(now.getFullYear(), now.getMonth(), 0); break;
      case 'last3Months': f = new Date(now.getFullYear(), now.getMonth() - 2, 1); t = now; break;
      case 'thisYear':    f = new Date(now.getFullYear(), 0, 1); t = now; break;
      case 'all':         f = new Date(2000, 0, 1); t = now; break;
      default: return;
    }
    setFrom(iso(f)); setTo(iso(t));
  };
  const onFromChange = (v: string) => { setFrom(v); setPreset('custom'); };
  const onToChange   = (v: string) => { setTo(v);   setPreset('custom'); };

  // ── Transactions filtered by approval + date range ────────────────────
  const liquid = useMemo(() => {
    return (transactions || []).filter(t => {
      const approved = t.approvalStatus === 'approved' || t.approvalStatus === 'not_required' || !t.approvalStatus;
      if (!approved) return false;
      const d = (t.date || '').slice(0, 10);
      if (!d) return true;
      return d >= from && d <= to;
    });
  }, [transactions, from, to]);

  // ── Compute the balance sheet + detail rows for each category ─────────
  const sheet = useMemo(() => {
    // Assets — Cash in hand
    const cashIn = liquid.filter(t => t.mainCategory === 'Cash Inflow' && t.mode === 'Cash')
      .reduce((s, t) => s + getTransactionTotals(t).totalPaid, 0);
    const cashOut = liquid.filter(t => t.mainCategory === 'Cash Outflow' && t.mode === 'Cash')
      .reduce((s, t) => s + getTransactionTotals(t).totalPaid, 0);
    const cashInHand = Math.max(0, cashIn - cashOut);

    // Bank detail — per-bank rows
    const bankRows: TreeNode[] = banks.map((b): TreeNode => ({
      id: `bank-${b.id}`,
      label: b.name || 'Bank',
      amount: Number(b.balance) || 0,
      meta: b.accountNumber ? `Acct ${b.accountNumber}` : undefined,
      level: 2, tone: 'asset',
    }));
    const bankBalance = bankRows.reduce((s, r) => s + r.amount, 0);

    // Accounts receivable — pending inflow (partial + cheque uncleared)
    const arTxs = liquid.filter(t =>
      t.mainCategory === 'Cash Inflow' && (t.remainingAmount ?? 0) > 0
    );
    const arDetail: TreeNode[] = arTxs.map((t): TreeNode => ({
      id: `ar-${t.id || t.transactionId}`,
      label: t.detailCategory || t.paidBy || t.note || 'Receivable',
      amount: Number(t.remainingAmount) || 0,
      meta: `${fmtDate(t.date)}${t.subCategory ? ' · ' + t.subCategory : ''}`,
      level: 2, tone: 'asset',
    })).sort((a, b) => b.amount - a.amount);
    const accountsReceivable = arDetail.reduce((s, r) => s + r.amount, 0);

    // Inventory value
    const inventoryValue = products.reduce((s, p) => s + (p.costPrice || 0) * (p.stock || 0), 0);

    // Loans receivable — per loan
    const loanRxRows: TreeNode[] = loans
      .filter(l => l.type === 'Receivable' && l.status !== 'Full')
      .map((l): TreeNode => ({
        id: `loanrx-${l.id}`,
        label: l.borrowerName || l.lenderName || 'Borrower',
        amount: Number(l.remaining) || 0,
        meta: `Paid ${fmt(l.paid || 0)} of ${fmt(l.loanAmount || 0)}`,
        level: 2, tone: 'asset',
      })).sort((a, b) => b.amount - a.amount);
    const loansReceivable = loanRxRows.reduce((s, r) => s + r.amount, 0);

    const totalAssets = cashInHand + bankBalance + accountsReceivable + inventoryValue + loansReceivable;

    // Liabilities — Accounts payable (pending outflow)
    const apTxs = liquid.filter(t =>
      t.mainCategory === 'Cash Outflow' && (t.remainingAmount ?? 0) > 0
    );
    const apDetail: TreeNode[] = apTxs.map((t): TreeNode => ({
      id: `ap-${t.id || t.transactionId}`,
      label: t.detailCategory || t.paidTo || t.note || 'Payable',
      amount: Number(t.remainingAmount) || 0,
      meta: `${fmtDate(t.date)}${t.subCategory ? ' · ' + t.subCategory : ''}`,
      level: 2, tone: 'liability',
    })).sort((a, b) => b.amount - a.amount);
    const accountsPayable = apDetail.reduce((s, r) => s + r.amount, 0);

    // Loans payable
    const loanPxRows: TreeNode[] = loans
      .filter(l => l.type === 'Payable' && l.status !== 'Full')
      .map((l): TreeNode => ({
        id: `loanpx-${l.id}`,
        label: l.lenderName || l.borrowerName || 'Lender',
        amount: Number(l.remaining) || 0,
        meta: `Paid ${fmt(l.paid || 0)} of ${fmt(l.loanAmount || 0)}`,
        level: 2, tone: 'liability',
      })).sort((a, b) => b.amount - a.amount);
    const loansPayable = loanPxRows.reduce((s, r) => s + r.amount, 0);

    // Pending bills
    const billRows: TreeNode[] = (bills || [])
      .filter(b => b.status === 'Pending' || b.status === 'Overdue')
      .map((b): TreeNode => ({
        id: `bill-${b.id}`,
        label: b.description || 'Bill',
        amount: Number(b.amount) || 0,
        meta: b.status,
        level: 2, tone: 'liability',
      })).sort((a, b) => b.amount - a.amount);
    const pendingBills = billRows.reduce((s, r) => s + r.amount, 0);

    const totalLiabilities = accountsPayable + loansPayable + pendingBills;
    const totalEquity      = totalAssets - totalLiabilities;

    // Assets section tree
    const assets: TreeNode = {
      id: 'sec-assets', label: 'Assets', amount: totalAssets, level: 0, tone: 'asset',
      children: [
        { id: 'a-cash',    label: 'Cash in Hand',        amount: cashInHand,          level: 1, tone: 'asset', icon: <Wallet size={13} /> },
        { id: 'a-banks',   label: 'Bank Balances',       amount: bankBalance,         level: 1, tone: 'asset', icon: <Landmark size={13} />,
          meta: `${bankRows.length} ${bankRows.length === 1 ? 'account' : 'accounts'}`,
          children: bankRows.length > 0 ? bankRows : undefined },
        { id: 'a-ar',      label: 'Accounts Receivable', amount: accountsReceivable,  level: 1, tone: 'asset', icon: <HandCoins size={13} />,
          meta: `${arDetail.length} ${arDetail.length === 1 ? 'entry' : 'entries'}`,
          children: arDetail.length > 0 ? arDetail : undefined },
        { id: 'a-inv',     label: 'Inventory Value',     amount: inventoryValue,      level: 1, tone: 'asset', icon: <Package size={13} /> },
        { id: 'a-loanrx',  label: 'Loans Receivable',    amount: loansReceivable,     level: 1, tone: 'asset', icon: <HandCoins size={13} />,
          meta: `${loanRxRows.length} ${loanRxRows.length === 1 ? 'loan' : 'loans'}`,
          children: loanRxRows.length > 0 ? loanRxRows : undefined },
      ],
    };

    // Liabilities section
    const liabilities: TreeNode = {
      id: 'sec-liab', label: 'Liabilities', amount: totalLiabilities, level: 0, tone: 'liability',
      children: [
        { id: 'l-ap',      label: 'Accounts Payable',    amount: accountsPayable,     level: 1, tone: 'liability', icon: <Receipt size={13} />,
          meta: `${apDetail.length} ${apDetail.length === 1 ? 'entry' : 'entries'}`,
          children: apDetail.length > 0 ? apDetail : undefined },
        { id: 'l-loanpx',  label: 'Loans Payable',       amount: loansPayable,        level: 1, tone: 'liability', icon: <HandCoins size={13} />,
          meta: `${loanPxRows.length} ${loanPxRows.length === 1 ? 'loan' : 'loans'}`,
          children: loanPxRows.length > 0 ? loanPxRows : undefined },
        { id: 'l-bills',   label: 'Pending Bills',       amount: pendingBills,        level: 1, tone: 'liability', icon: <FileText size={13} />,
          meta: `${billRows.length} ${billRows.length === 1 ? 'bill' : 'bills'}`,
          children: billRows.length > 0 ? billRows : undefined },
      ],
    };

    // Equity section
    const equity: TreeNode = {
      id: 'sec-equity', label: 'Equity', amount: totalEquity, level: 0, tone: 'equity',
      children: [
        { id: 'e-owner', label: "Owner's Equity", amount: totalEquity, level: 1, tone: 'equity',
          meta: 'Assets − Liabilities' },
      ],
    };

    // Balance check
    const totalLiabAndEquity = totalLiabilities + totalEquity;
    const isBalanced = Math.abs(totalAssets - totalLiabAndEquity) < 1;

    // Collect all expandable ids for Expand/Collapse All
    const allExpandableIds: string[] = [];
    const collect = (n: TreeNode) => {
      if (n.children && n.children.length > 0) {
        allExpandableIds.push(n.id);
        n.children.forEach(collect);
      }
    };
    [assets, liabilities, equity].forEach(collect);

    return {
      assets, liabilities, equity,
      totalAssets, totalLiabilities, totalEquity, totalLiabAndEquity, isBalanced,
      allExpandableIds,
    };
  }, [liquid, banks, loans, products, bills]);

  // ── Expand state ──────────────────────────────────────────────────────
  // Sections open by default, categories collapsed — same feel as the P&L.
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    new Set(['sec-assets', 'sec-liab', 'sec-equity'])
  );
  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const expandAll   = () => setExpanded(new Set(['sec-assets', 'sec-liab', 'sec-equity', ...sheet.allExpandableIds]));
  const collapseAll = () => setExpanded(new Set());

  // ── CSV export ────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    const rows: string[] = [];
    rows.push(`Balance Sheet,${from} to ${to}`);
    rows.push('');
    const dump = (n: TreeNode, indent = 0) => {
      const pad = '  '.repeat(indent);
      rows.push(`${pad}${n.label},${n.amount.toFixed(2)}`);
      if (n.children) n.children.forEach(c => dump(c, indent + 1));
    };
    dump(sheet.assets);
    rows.push('');
    dump(sheet.liabilities);
    rows.push('');
    dump(sheet.equity);
    rows.push('');
    rows.push(`Total Liabilities + Equity,${sheet.totalLiabAndEquity.toFixed(2)}`);
    rows.push(`Balanced,${sheet.isBalanced ? 'yes' : 'no'}`);

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `balance-sheet-${from}-to-${to}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // ── PDF export ────────────────────────────────────────────────────────
  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    const marginX = 15;
    let y = 20;

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('BALANCE SHEET', pageW / 2, 9, { align: 'center' });

    y = 22;
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Period: ${fmtDate(from)}  to  ${fmtDate(to)}`, marginX, y);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageW - marginX, y, { align: 'right' });
    y += 4;
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, y, pageW - marginX, y);
    y += 5;

    // Section drawer
    const drawSection = (title: string, node: TreeNode, headerColor: [number, number, number], amountColor: [number, number, number]) => {
      // Section title bar
      doc.setFillColor(...headerColor);
      doc.rect(marginX, y, pageW - marginX * 2, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text(title, marginX + 3, y + 5);
      doc.text(`${CURRENCY()} ${fmt(node.amount)}`, pageW - marginX - 3, y + 5, { align: 'right' });
      y += 10;

      // Category rows
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      if (node.children) {
        for (const cat of node.children) {
          // Page break if needed
          if (y > pageH - 30) { doc.addPage(); y = 20; }
          doc.setFont('helvetica', 'bold');
          doc.text(cat.label, marginX + 4, y);
          doc.setTextColor(...amountColor);
          doc.text(`${CURRENCY()} ${fmt(cat.amount)}`, pageW - marginX - 3, y, { align: 'right' });
          doc.setTextColor(30, 41, 59);
          y += 5;

          // Detail rows
          if (cat.children) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            for (const d of cat.children) {
              if (y > pageH - 20) { doc.addPage(); y = 20; }
              doc.setTextColor(100, 116, 139);
              const label = d.label + (d.meta ? `  (${d.meta})` : '');
              const wrapped = doc.splitTextToSize(label, pageW - marginX * 2 - 45);
              doc.text(wrapped, marginX + 10, y);
              doc.setTextColor(51, 65, 85);
              doc.text(`${CURRENCY()} ${fmt(d.amount)}`, pageW - marginX - 3, y, { align: 'right' });
              y += wrapped.length * 3.8 + 1;
            }
            doc.setFontSize(9);
          }
          y += 1;
        }
      }
      y += 3;
    };

    drawSection('ASSETS',      sheet.assets,      [5, 150, 105],  [5, 150, 105]);
    drawSection('LIABILITIES', sheet.liabilities, [220, 38, 38],  [220, 38, 38]);
    drawSection('EQUITY',      sheet.equity,      [37, 99, 235],  [37, 99, 235]);

    // Balance check footer
    if (y > pageH - 30) { doc.addPage(); y = 20; }
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(marginX, y, pageW - marginX, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Total Assets', marginX, y);
    doc.text(`${CURRENCY()} ${fmt(sheet.totalAssets)}`, pageW - marginX, y, { align: 'right' });
    y += 6;
    doc.text('Total Liabilities + Equity', marginX, y);
    doc.text(`${CURRENCY()} ${fmt(sheet.totalLiabAndEquity)}`, pageW - marginX, y, { align: 'right' });
    y += 8;
    // Balanced/Off badge
    const balColor: [number, number, number] = sheet.isBalanced ? [5, 150, 105] : [220, 38, 38];
    doc.setFillColor(...balColor);
    doc.rect(marginX, y, pageW - marginX * 2, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(sheet.isBalanced ? '✓ BALANCED' : '✗ NOT BALANCED', pageW / 2, y + 6, { align: 'center' });

    doc.save(`balance-sheet-${from}-to-${to}.pdf`);
  };

  // ── UI ────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    padding: '7px 11px', border: '1px solid #e2e8f0', borderRadius: 7,
    fontSize: 12.5, outline: 'none', backgroundColor: '#fff',
  };
  const miniBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '7px 12px', borderRadius: 7, border: '1px solid #e2e8f0',
    backgroundColor: '#fff', fontSize: 11.5, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 4 }}>Quick range</label>
          {([
            ['all',         'All time'],
            ['thisMonth',   'This month'],
            ['lastMonth',   'Last month'],
            ['last3Months', 'Last 3 months'],
            ['thisYear',    'This year'],
          ] as [Preset, string][]).map(([id, label]) => {
            const active = preset === id;
            return (
              <button key={id} onClick={() => applyPreset(id)}
                style={{
                  padding: '5px 11px', borderRadius: 99,
                  border: active ? 'none' : '1px solid #e2e8f0',
                  backgroundColor: active ? '#0f172a' : '#fff',
                  color: active ? '#fff' : '#334155',
                  fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>{label}</button>
            );
          })}
          {preset === 'custom' && <span style={{ padding: '5px 11px', borderRadius: 99, backgroundColor: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 700 }}>Custom range</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Calendar size={15} color="#64748b" />
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>From</label>
          <input type="date" value={from} onChange={e => onFromChange(e.target.value)} max={to} style={inp} />
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>To</label>
          <input type="date" value={to} onChange={e => onToChange(e.target.value)} min={from} style={inp} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={expandAll} style={{ ...miniBtn, color: '#334155' }}><Maximize2 size={12} /> Expand All</button>
            <button onClick={collapseAll} style={{ ...miniBtn, color: '#334155' }}><Minimize2 size={12} /> Collapse All</button>
            <button onClick={handleExportCsv} style={{ ...miniBtn, color: '#334155' }}><Download size={12} /> Export CSV</button>
            <button onClick={handleExportPdf} style={{ ...miniBtn, backgroundColor: '#0f172a', color: '#fff', border: 'none' }}><FileText size={12} /> Generate PDF</button>
          </div>
        </div>
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
        <Tile icon={<TrendingUp size={18} />}   label="Total Assets"      value={sheet.totalAssets}      fg="#059669" bg="#ecfdf5" />
        <Tile icon={<TrendingDown size={18} />} label="Total Liabilities" value={sheet.totalLiabilities} fg="#dc2626" bg="#fef2f2" />
        <Tile icon={<Scale size={18} />}         label="Owner's Equity"    value={sheet.totalEquity}      fg={sheet.totalEquity >= 0 ? '#059669' : '#dc2626'} bg={sheet.totalEquity >= 0 ? '#ecfdf5' : '#fef2f2'} />
        <Tile icon={<Scale size={18} />}         label={sheet.isBalanced ? 'Balanced' : 'Off Balance'} value={Math.abs(sheet.totalAssets - sheet.totalLiabAndEquity)} fg={sheet.isBalanced ? '#059669' : '#dc2626'} bg={sheet.isBalanced ? '#ecfdf5' : '#fef2f2'} highlight />
      </div>

      {/* Statement */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(90deg, #f8fafc 0%, #ffffff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} color="#334155" /> Balance Sheet
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              As of {fmtDate(to)} — for the period {fmtDate(from)} → {fmtDate(to)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LegendBadge color="#059669" label="Assets" />
            <LegendBadge color="#dc2626" label="Liabilities" />
            <LegendBadge color="#2563eb" label="Equity" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '10px 22px', backgroundColor: '#fafbfc', borderBottom: '1px solid #e2e8f0', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          <span>Category</span>
          <span style={{ textAlign: 'right', minWidth: 160 }}>Amount ({CURRENCY()})</span>
        </div>

        <div>
          <TreeBranch node={sheet.assets}      expanded={expanded} toggle={toggle} depth={0} />
          <SubtotalRow label="Total Assets" value={sheet.totalAssets} tone="asset" />

          <TreeBranch node={sheet.liabilities} expanded={expanded} toggle={toggle} depth={0} />
          <SubtotalRow label="Total Liabilities" value={sheet.totalLiabilities} tone="liability" />

          <TreeBranch node={sheet.equity}      expanded={expanded} toggle={toggle} depth={0} />
          <SubtotalRow label="Total Equity" value={sheet.totalEquity} tone="equity" />

          <div style={{
            padding: '14px 22px',
            backgroundColor: sheet.isBalanced ? '#0f172a' : '#7f1d1d',
            color: '#fff',
            display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>
              {sheet.isBalanced
                ? '✓ Balanced — Assets = Liabilities + Equity'
                : `✗ Off balance by AED ${fmt(Math.abs(sheet.totalAssets - sheet.totalLiabAndEquity))}`}
            </span>
            <span style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums', minWidth: 180, textAlign: 'right', color: sheet.isBalanced ? '#6ee7b7' : '#fca5a5' }}>
              <span style={{ opacity: 0.7, fontSize: '0.82em', marginRight: 4 }}>{CURRENCY()}</span>
              {fmt(sheet.totalLiabAndEquity)}
            </span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '6px 8px 12px' }}>
        Assets, Liabilities and Equity are computed from live ledger data for the selected date range. Pending-approval and rejected transactions are excluded.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Presentational sub-components
// ─────────────────────────────────────────────────────────────────────────
const toneColor = (t: TreeNode['tone']) => ({ asset: '#059669', liability: '#dc2626', equity: '#2563eb' }[t]);
const toneBg    = (t: TreeNode['tone']) => ({ asset: '#ecfdf5', liability: '#fef2f2', equity: '#eff6ff' }[t]);

const Tile: React.FC<{
  icon: React.ReactNode; label: string; value: number;
  fg: string; bg: string; highlight?: boolean;
}> = ({ icon, label, value, fg, bg, highlight }) => (
  <div style={{
    backgroundColor: highlight ? fg : '#fff', borderRadius: 12, padding: '16px 18px',
    border: highlight ? 'none' : '1px solid #e2e8f0',
    display: 'flex', alignItems: 'center', gap: 14,
    boxShadow: highlight ? '0 6px 16px -6px rgba(15,23,42,0.15)' : '0 1px 2px rgba(0,0,0,0.03)',
  }}>
    <div style={{
      width: 42, height: 42, borderRadius: 11,
      backgroundColor: highlight ? 'rgba(255,255,255,0.18)' : bg,
      color: highlight ? '#fff' : fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{icon}</div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: highlight ? 'rgba(255,255,255,0.85)' : '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: highlight ? '#fff' : fg, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginTop: 2 }}>
        <span style={{ fontSize: 11, opacity: 0.7, marginRight: 3 }}>{CURRENCY()}</span>{fmt(value)}
      </div>
    </div>
  </div>
);

const LegendBadge: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
    <span style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: color, display: 'inline-block' }} />
    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
  </div>
);

const TreeBranch: React.FC<{
  node: TreeNode;
  expanded: Set<string>;
  toggle: (id: string) => void;
  depth: number;
}> = ({ node, expanded, toggle, depth }) => {
  const isOpen = expanded.has(node.id);
  const hasChildren = !!node.children && node.children.length > 0;
  return (
    <>
      <TreeRow node={node} expanded={expanded} toggle={toggle} />
      {isOpen && hasChildren && node.children!.map(c => (
        <TreeBranch key={c.id} node={c} expanded={expanded} toggle={toggle} depth={depth + 1} />
      ))}
    </>
  );
};

const TreeRow: React.FC<{
  node: TreeNode;
  expanded: Set<string>;
  toggle: (id: string) => void;
}> = ({ node, expanded, toggle }) => {
  const isOpen = expanded.has(node.id);
  const hasChildren = !!node.children && node.children.length > 0;
  const color = toneColor(node.tone);
  const bgTone = toneBg(node.tone);

  let rowStyle: React.CSSProperties;
  if (node.level === 0) {
    rowStyle = { backgroundColor: bgTone, padding: '14px 22px', fontSize: 13.5, fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #e2e8f0' };
  } else if (node.level === 1) {
    const isEmpty = !hasChildren && node.amount === 0;
    rowStyle = { backgroundColor: isOpen ? '#f8fafc' : '#fff', padding: '10px 22px 10px 42px', fontSize: 12.5, fontWeight: 700, color: '#334155', borderBottom: '1px solid #f1f5f9', opacity: isEmpty ? 0.55 : 1 };
  } else {
    rowStyle = { backgroundColor: '#fff', padding: '8px 22px 8px 66px', fontSize: 12, fontWeight: 500, color: '#475569', borderBottom: '1px solid #f8fafc' };
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
        if (clickable) (e.currentTarget as HTMLDivElement).style.backgroundColor = node.level === 0 ? bgTone : '#f1f5f9';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = rowStyle.backgroundColor as string;
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {hasChildren ? (
          <ChevronRight size={node.level === 0 ? 15 : 13}
            style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', color, flexShrink: 0 }} />
        ) : (
          <span style={{ width: 13, display: 'inline-block', flexShrink: 0 }} />
        )}
        {node.icon && <span style={{ color, display: 'flex' }}>{node.icon}</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</span>
        {node.meta && (
          <span style={{
            fontSize: node.level === 0 ? 11 : 10,
            fontWeight: 500, color: '#94a3b8', marginLeft: 4, whiteSpace: 'nowrap',
            fontStyle: node.level === 2 ? 'italic' : 'normal',
          }}>
            {node.level === 2 ? node.meta : `· ${node.meta}`}
          </span>
        )}
      </div>
      <span style={{
        textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        fontWeight: node.level === 0 ? 800 : node.level === 1 ? 700 : 600,
        color,
        fontSize: node.level === 0 ? 14 : node.level === 1 ? 13 : 12,
        minWidth: 160, paddingLeft: 8,
      }}>
        <span style={{ opacity: 0.55, fontSize: '0.82em', marginRight: 4 }}>{CURRENCY()}</span>
        {fmt(node.amount)}
      </span>
    </div>
  );
};

const SubtotalRow: React.FC<{ label: string; value: number; tone: TreeNode['tone'] }> = ({ label, value, tone }) => {
  const color = toneColor(tone);
  return (
    <div style={{
      backgroundColor: '#f1f5f9',
      padding: '12px 22px',
      borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1',
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
    }}>
      <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 800, color,
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        minWidth: 160, textAlign: 'right', paddingLeft: 8,
      }}>
        <span style={{ opacity: 0.7, fontSize: '0.82em', marginRight: 4 }}>{CURRENCY()}</span>{fmt(value)}
      </span>
    </div>
  );
};