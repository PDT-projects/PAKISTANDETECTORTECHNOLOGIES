// Accounts Payable Report
//
// STRICTLY loan-based per ERP schema:
//   • Cash Inflow  + subCategory = "Loan Received"                 → we take on new debt (+)
//   • Cash Outflow + subCategory = "Loan Repaid" | "Loan Returned" → we pay down existing debt (−)
//
// For each counterparty (lender) we compute a running net position:
//     Net Owed = Received − Repaid
//   • Positive → we still owe them that much
//   • Negative → we've overpaid (rare; effectively they now owe us)
//
// Nothing else is included — sales invoices, generic "Account Payable"
// entries, supplier payments, etc. are handled by other reports.

import React, { useMemo, useState } from 'react';
import {
  ChevronRight, TrendingDown, Users, Download, Calendar,
  Layers, Minimize2, Maximize2, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { Transaction } from '../../modules/transactions/models/types';
import { useGlobalCurrency } from '../../shared/currency/useGlobalCurrency';
import { getGlobalCurrencySymbol, getGlobalCurrency } from '../../shared/currency/globalCurrency';
import { CurrencyCode } from './currencyUtils';

interface Props {
  transactions: Transaction[];
  invoices?:    any[];   // kept for backward-compat with the reports hub — unused
  onBack?:      () => void;
}

const CURRENCY = () => getGlobalCurrencySymbol();

// Classification strings that map to Accounts Payable.
// Match is case-insensitive, trimmed, and uses SUBSTRING matching so values
// like "Loan Received from HBL" still count.
//
// AP goes UP when we take on debt (Cash Inflow):
const AP_INCREASE_KEYWORDS = [
  'loan received', 'loan borrowed', 'loan taken',
  'account payable', 'accounts payable',
];
// AP goes DOWN when we pay debt down (Cash Outflow):
const AP_DECREASE_KEYWORDS = [
  'loan repaid', 'loan returned', 'loan repayment', 'loan payback',
  'loan payable', 'loans payable',
];

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
const norm = (s: any) => String(s ?? '').trim().toLowerCase();

// Pull EVERY string value on a transaction, including nested {name/label/value}
// objects. This gives the classifier the widest possible surface to work with.
const allStrings = (t: any): { field: string; value: string }[] => {
  const out: { field: string; value: string }[] = [];
  if (!t || typeof t !== 'object') return out;
  for (const k of Object.keys(t)) {
    const v = (t as any)[k];
    if (typeof v === 'string' && v.trim()) {
      out.push({ field: k, value: v.trim() });
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = String(v.name || v.label || v.value || v.title || '').trim();
      if (inner) out.push({ field: k, value: inner });
    }
  }
  return out;
};

// Direction detection — scan common fields, then fall back to any string that
// looks like "inflow" or "outflow".
const detectDirection = (t: any): 'inflow' | 'outflow' | null => {
  const strs = allStrings(t).map(x => x.value.toLowerCase());
  const hasIn  = strs.some(s => s === 'in'  || s === 'inflow'  || s.includes('cash inflow')  || s === 'credit');
  const hasOut = strs.some(s => s === 'out' || s === 'outflow' || s.includes('cash outflow') || s === 'debit');
  if (hasIn && !hasOut)  return 'inflow';
  if (hasOut && !hasIn)  return 'outflow';
  // If both or neither, fall back to specific fields
  const main = norm((t as any).mainCategory) || norm((t as any).type) || norm((t as any).flow);
  if (main.includes('inflow'))  return 'inflow';
  if (main.includes('outflow')) return 'outflow';
  return null;
};

const matchesAny = (strings: string[], keywords: string[]): boolean =>
  strings.some(s => keywords.some(k => s.includes(k)));

interface ApTx {
  id: string;
  date: string;
  direction: 'borrowed' | 'repaid';   // borrowed = new debt (+), repaid = paying down (−)
  amount: number;
  counterparty: string;
  subCategory: string;
  mode?: string;
  note?: string;
}

export function AccountsPayableReport({ transactions }: Props) {
  useGlobalCurrency(); // subscribe so this view re-renders on currency change

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

  // Filter to loan-payable transactions and group by counterparty (lender)
  const { byCounterparty, totals } = useMemo(() => {
    const apTxs: ApTx[] = [];

    for (const t of transactions || []) {
      // Approval gate — align with balance sheet: only skip explicit rejections
      // or pending approvals.
      const ap = (t as any).approvalStatus;
      if (ap === 'pending_approval' || ap === 'rejected') continue;

      const direction = detectDirection(t);
      if (!direction) continue;

      // Get all candidate classification strings for the substring match
      const cands = allStrings(t)
        .map(x => x.value.toLowerCase())
        .filter(Boolean);

      let apDirection: 'borrowed' | 'repaid' | null = null;
      if (direction === 'inflow'  && matchesAny(cands, AP_INCREASE_KEYWORDS)) apDirection = 'borrowed';
      if (direction === 'outflow' && matchesAny(cands, AP_DECREASE_KEYWORDS)) apDirection = 'repaid';
      if (!apDirection) continue;

      const d = String(t.date || '').slice(0, 10);
      if (d < from || d > to) continue;

      // Lender is the person who gave us the money (inflow: paidBy) or
      // the person we're paying back (outflow: paidTo).
      const counterparty = (apDirection === 'repaid' ? (t as any).paidTo : (t as any).paidBy)
                        || (t as any).company
                        || (t as any).note
                        || 'Unknown counterparty';

      apTxs.push({
        id: (t as any).id || `${(t as any).transactionId}-${(t as any).date}`,
        date: d,
        direction: apDirection,
        amount: Number((t as any).amount) || 0,
        counterparty: String(counterparty),
        subCategory: String((t as any).category || (t as any).subCategory || ''),
        mode: (t as any).mode,
        note: (t as any).note,
      });
    }
    apTxs.sort((a, b) => (a.date < b.date ? 1 : -1));

    // Group by counterparty
    const map: Record<string, ApTx[]> = {};
    for (const x of apTxs) (map[x.counterparty] ||= []).push(x);

    const byCounterparty = Object.keys(map).map(name => {
      const txs = map[name];
      const borrowed = txs.filter(x => x.direction === 'borrowed').reduce((s, x) => s + x.amount, 0);
      const repaid   = txs.filter(x => x.direction === 'repaid').reduce((s, x) => s + x.amount, 0);
      // Positive net = we still owe them. Negative = we've overpaid.
      const net = borrowed - repaid;
      return { name, txs, borrowed, repaid, net };
    }).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

    const totalBorrowed = byCounterparty.reduce((s, c) => s + c.borrowed, 0);
    const totalRepaid   = byCounterparty.reduce((s, c) => s + c.repaid, 0);
    const netOwed       = totalBorrowed - totalRepaid;
    // Total that we STILL owe out = sum of positive nets only (ignore overpayments)
    const stillOwed     = byCounterparty.reduce((s, c) => s + Math.max(0, c.net), 0);

    return {
      byCounterparty,
      totals: {
        counterparties: byCounterparty.length,
        totalBorrowed, totalRepaid, netOwed, stillOwed,
      },
    };
  }, [transactions, from, to]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const expandAll   = () => setExpanded(new Set(byCounterparty.map(c => c.name)));
  const collapseAll = () => setExpanded(new Set());

  const handleExport = () => {
    const rows: string[] = [];
    rows.push(`Accounts Payable (Loans),${from} to ${to}`);
    rows.push('');
    rows.push('Counterparty,Date,Direction,Sub Category,Amount,Mode,Note');
    for (const c of byCounterparty) {
      for (const x of c.txs) {
        rows.push([c.name, x.date, x.direction, x.subCategory, x.amount.toFixed(2), x.mode || '', (x.note || '').replace(/[,\n]/g, ' ')].join(','));
      }
    }
    rows.push('');
    rows.push(`Total Borrowed,${totals.totalBorrowed.toFixed(2)}`);
    rows.push(`Total Repaid,${totals.totalRepaid.toFixed(2)}`);
    rows.push(`Net Owed,${totals.netOwed.toFixed(2)}`);
    rows.push(`Still Owed (positive nets only),${totals.stillOwed.toFixed(2)}`);
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `accounts-payable-${from}-to-${to}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Schema note */}
      <div style={{
        padding: '10px 14px', borderRadius: 10, backgroundColor: '#f0f9ff',
        border: '1px solid #bae6fd', display: 'flex', alignItems: 'flex-start', gap: 8,
      }}>
        <span style={{ fontSize: 13, lineHeight: 1 }}>ℹ️</span>
        <div style={{ fontSize: 11.5, color: '#0c4a6e', lineHeight: 1.5 }}>
          Only loan-based payable transactions are shown:
          &nbsp;<strong>Cash Inflow</strong> with category <em>"Loan Received"</em> or <em>"Account Payable"</em> (new debt)
          &nbsp;·&nbsp; <strong>Cash Outflow</strong> with category <em>"Loan Repaid"</em>, <em>"Loan Returned"</em>, or <em>"Loan Payable"</em> (paying down).
        </div>
      </div>

      {/* Filters + actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 4 }}>Transaction date</label>
          {([['all', 'All time'], ['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['last3Months', 'Last 3 months'], ['thisYear', 'This year']] as [Preset, string][]).map(([id, label]) => {
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
            <button onClick={handleExport} style={{ ...miniBtn, backgroundColor: '#0f172a', color: '#fff', border: 'none' }}><Download size={12} /> Export CSV</button>
          </div>
        </div>
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
        <Tile icon={<ArrowDownRight size={18} />} label="Total Borrowed"  value={totals.totalBorrowed} fg="#dc2626" bg="#fef2f2" />
        <Tile icon={<TrendingDown size={18} />}   label="Total Repaid"    value={totals.totalRepaid}   fg="#059669" bg="#ecfdf5" />
        <Tile icon={<Users size={18} />}          label="Lenders"         value={totals.counterparties} fg="#334155" bg="#f1f5f9" plain />
        <Tile
          icon={totals.stillOwed > 0 ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
          label={totals.stillOwed > 0 ? 'Still Owed' : 'Fully Settled'}
          value={totals.stillOwed}
          fg={totals.stillOwed > 0 ? '#b91c1c' : '#059669'}
          bg={totals.stillOwed > 0 ? '#fef2f2' : '#ecfdf5'}
          highlight />
      </div>

      {/* Per-counterparty list */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(90deg, #f8fafc 0%, #ffffff 100%)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={16} color="#334155" />
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Payables by Lender</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '10px 22px', backgroundColor: '#fafbfc', borderBottom: '1px solid #e2e8f0', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          <span>Lender / Transaction</span>
          <span style={{ textAlign: 'right', minWidth: 180 }}>Net Owed ({CURRENCY()})</span>
        </div>

        {byCounterparty.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
            No loan-based payable transactions in this range.
            <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6 }}>
              Add a <strong>Cash Inflow</strong> with category "Loan Received" / "Account Payable", or a <strong>Cash Outflow</strong> with category "Loan Repaid" / "Loan Payable" to see data here.
            </div>
          </div>
        ) : byCounterparty.map(c => {
          const isOpen = expanded.has(c.name);
          const stillOwe = c.net > 0;      // positive = we still owe them
          const overpaid = c.net < 0;      // we've paid back more than we borrowed
          return (
            <React.Fragment key={c.name}>
              <div
                onClick={() => toggle(c.name)}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 10,
                  alignItems: 'center', padding: '12px 22px',
                  backgroundColor: isOpen ? '#f8fafc' : '#fff',
                  borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                  transition: 'background-color 0.12s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ChevronRight size={14} style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', color: stillOwe ? '#dc2626' : '#059669' }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{c.name}</span>
                  <span style={{ fontSize: 10.5, color: '#94a3b8', marginLeft: 4 }}>
                    · {c.txs.length} {c.txs.length === 1 ? 'entry' : 'entries'} · Borrowed AED {fmt(c.borrowed)} · Repaid AED {fmt(c.repaid)}
                  </span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: stillOwe ? '#dc2626' : overpaid ? '#059669' : '#64748b', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 180, textAlign: 'right' }}>
                  {c.net === 0 ? '' : stillOwe ? '−' : '+'}
                  <span style={{ opacity: 0.6, fontSize: '0.82em', marginRight: 3 }}>{CURRENCY()}</span>{fmt(Math.abs(c.net))}
                  {c.net === 0 && <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, color: '#94a3b8' }}>SETTLED</span>}
                </span>
              </div>

              {isOpen && c.txs.map(x => (
                <div key={x.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 10,
                  alignItems: 'center', padding: '8px 22px 8px 60px',
                  backgroundColor: '#fff', borderBottom: '1px solid #f8fafc',
                  fontSize: 12, color: '#475569',
                }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 800,
                      backgroundColor: x.direction === 'borrowed' ? '#fef2f2' : '#ecfdf5',
                      color:            x.direction === 'borrowed' ? '#dc2626' : '#059669',
                      marginRight: 8, textTransform: 'uppercase', letterSpacing: '.05em',
                    }}>{x.direction === 'borrowed' ? 'Loan Received' : 'Loan Repaid'}</span>
                    <span style={{ fontStyle: 'italic', color: '#94a3b8', fontSize: 11 }}>
                      {fmtDate(x.date)}{x.mode ? ' · ' + x.mode : ''}{x.note ? ' · ' + x.note : ''}
                    </span>
                  </div>
                  <span style={{
                    fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                    color: x.direction === 'borrowed' ? '#dc2626' : '#059669',
                    textAlign: 'right', minWidth: 180,
                  }}>
                    {x.direction === 'borrowed' ? '+' : '−'}
                    <span style={{ opacity: 0.55, fontSize: '0.82em', marginRight: 3 }}>{CURRENCY()}</span>{fmt(x.amount)}
                  </span>
                </div>
              ))}
            </React.Fragment>
          );
        })}

        {byCounterparty.length > 0 && (
          <div style={{ padding: '14px 22px', backgroundColor: '#0f172a', color: '#fff', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>
              {totals.stillOwed > 0 ? 'Total Accounts Payable (Still Owed)' : 'Fully Settled'}
            </span>
            <span style={{ fontSize: 16, fontWeight: 900, color: totals.stillOwed > 0 ? '#fca5a5' : '#6ee7b7', fontVariantNumeric: 'tabular-nums', minWidth: 180, textAlign: 'right' }}>
              <span style={{ opacity: 0.7, fontSize: '0.82em', marginRight: 4 }}>{CURRENCY()}</span>
              {fmt(totals.stillOwed)}
            </span>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '6px 8px 12px' }}>
        Loans received (inflow) increase what we owe. Loans repaid (outflow) reduce it. Net = Borrowed − Repaid.
      </div>
    </div>
  );
}

const Tile: React.FC<{
  icon: React.ReactNode; label: string; value: number;
  fg: string; bg: string; plain?: boolean; highlight?: boolean;
}> = ({ icon, label, value, fg, bg, plain, highlight }) => (
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
        {!plain && <span style={{ fontSize: 11, opacity: 0.7, marginRight: 3 }}>{CURRENCY()}</span>}
        {plain ? value : fmt(value)}
      </div>
    </div>
  </div>
);