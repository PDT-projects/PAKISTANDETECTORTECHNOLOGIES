// Accounts Receivable Report
//
// STRICTLY loan-based per ERP schema:
//   • Cash Outflow + subCategory = "Loan Given"     → we extend credit to them (+)
//   • Cash Inflow  + subCategory = "Loan Recovered" → they pay us back (−)
//
// For each counterparty (borrower) we compute a running net position:
//     Net Owed to Us = Given − Recovered
//   • Positive → they still owe us that much
//   • Negative → they've overpaid us (rare; effectively becomes payable)
//
// Aging: for each borrower with a positive net, we consume their recoveries
// against their Loan Given transactions FIFO (oldest first) — the date of
// the earliest still-unrecovered Loan Given is used to compute age.
//
// Sales-invoice receivables are NOT included here (handled by a separate
// invoice-aging report if needed).

import React, { useMemo, useState } from 'react';
import {
  ChevronRight, TrendingUp, Users, Clock, AlertTriangle,
  Download, Calendar, Layers, Minimize2, Maximize2,
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

// Classification strings that map to Accounts Receivable.
// Match is case-insensitive, trimmed, and uses SUBSTRING matching.
//
// AR goes UP when we lend money out (Cash Outflow):
const AR_INCREASE_KEYWORDS = [
  'loan given', 'loan issued', 'loan disbursed',
  'loan receivable', 'loans receivable',
];
// AR goes DOWN when the money comes back (Cash Inflow):
const AR_DECREASE_KEYWORDS = [
  'loan recovered', 'loan recovery', 'loan collected', 'loan repayment received',
  'account receivable', 'accounts receivable',
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
const daysSince = (iso: string): number => {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
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

const detectDirection = (t: any): 'inflow' | 'outflow' | null => {
  const strs = allStrings(t).map(x => x.value.toLowerCase());
  const hasIn  = strs.some(s => s === 'in'  || s === 'inflow'  || s.includes('cash inflow')  || s === 'credit');
  const hasOut = strs.some(s => s === 'out' || s === 'outflow' || s.includes('cash outflow') || s === 'debit');
  if (hasIn && !hasOut)  return 'inflow';
  if (hasOut && !hasIn)  return 'outflow';
  const main = norm((t as any).mainCategory) || norm((t as any).type) || norm((t as any).flow);
  if (main.includes('inflow'))  return 'inflow';
  if (main.includes('outflow')) return 'outflow';
  return null;
};

const matchesAny = (strings: string[], keywords: string[]): boolean =>
  strings.some(s => keywords.some(k => s.includes(k)));

interface ArTx {
  id: string;
  date: string;
  direction: 'given' | 'recovered';   // given = new receivable (+), recovered = paying us back (−)
  amount: number;
  counterparty: string;
  subCategory: string;
  mode?: string;
  note?: string;
}

type Bucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

// FIFO consumption: given transactions sorted oldest→newest are consumed by
// total recovered. Returns the earliest still-unrecovered date, or '' if all
// recovered.
function oldestUnrecoveredDate(txs: ArTx[], totalRecovered: number): string {
  const givens = txs
    .filter(x => x.direction === 'given')
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  let remaining = totalRecovered;
  for (const g of givens) {
    if (remaining >= g.amount) { remaining -= g.amount; continue; }
    return g.date;
  }
  return ''; // all fully recovered
}

const bucketOf = (ageDays: number): Bucket =>
  ageDays === 0 ? 'current' :
  ageDays <= 30 ? '1-30'    :
  ageDays <= 60 ? '31-60'   :
  ageDays <= 90 ? '61-90'   : '90+';

export function AccountsReceivableReport({ transactions }: Props) {
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

  // Filter → group by counterparty (borrower) → aging
  const { byCounterparty, totals, aging } = useMemo(() => {
    const arTxs: ArTx[] = [];

    for (const t of transactions || []) {
      const ap = (t as any).approvalStatus;
      if (ap === 'pending_approval' || ap === 'rejected') continue;

      const direction = detectDirection(t);
      if (!direction) continue;

      const cands = allStrings(t)
        .map(x => x.value.toLowerCase())
        .filter(Boolean);

      let arDirection: 'given' | 'recovered' | null = null;
      if (direction === 'outflow' && matchesAny(cands, AR_INCREASE_KEYWORDS)) arDirection = 'given';
      if (direction === 'inflow'  && matchesAny(cands, AR_DECREASE_KEYWORDS)) arDirection = 'recovered';
      if (!arDirection) continue;

      const d = String((t as any).date || '').slice(0, 10);
      if (d < from || d > to) continue;

      // Borrower is the person we gave money to (outflow: paidTo) or
      // the person paying us back (inflow: paidBy).
      const counterparty = (arDirection === 'given' ? (t as any).paidTo : (t as any).paidBy)
                        || (t as any).company
                        || (t as any).note
                        || 'Unknown counterparty';

      arTxs.push({
        id: (t as any).id || `${(t as any).transactionId}-${(t as any).date}`,
        date: d,
        direction: arDirection,
        amount: Number((t as any).amount) || 0,
        counterparty: String(counterparty),
        subCategory: String((t as any).category || (t as any).subCategory || ''),
        mode: (t as any).mode,
        note: (t as any).note,
      });
    }
    arTxs.sort((a, b) => (a.date < b.date ? 1 : -1));

    // Group by counterparty
    const map: Record<string, ArTx[]> = {};
    for (const x of arTxs) (map[x.counterparty] ||= []).push(x);

    const byCounterparty = Object.keys(map).map(name => {
      const txs = map[name];
      const given     = txs.filter(x => x.direction === 'given').reduce((s, x) => s + x.amount, 0);
      const recovered = txs.filter(x => x.direction === 'recovered').reduce((s, x) => s + x.amount, 0);
      const net = given - recovered;
      const agingDate = net > 0 ? oldestUnrecoveredDate(txs, recovered) : '';
      const ageDays   = agingDate ? daysSince(agingDate) : 0;
      const bucket    = net > 0 ? bucketOf(ageDays) : null;
      return { name, txs, given, recovered, net, ageDays, bucket, agingDate };
    }).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

    const totalGiven      = byCounterparty.reduce((s, c) => s + c.given, 0);
    const totalRecovered  = byCounterparty.reduce((s, c) => s + c.recovered, 0);
    const netOutstanding  = totalGiven - totalRecovered;
    const stillOwedToUs   = byCounterparty.reduce((s, c) => s + Math.max(0, c.net), 0);

    const aging: Record<Bucket, number> = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const c of byCounterparty) {
      if (c.bucket && c.net > 0) aging[c.bucket] += c.net;
    }

    return {
      byCounterparty,
      totals: {
        counterparties: byCounterparty.length,
        totalGiven, totalRecovered, netOutstanding, stillOwedToUs,
        overdue:  aging['1-30'] + aging['31-60'] + aging['61-90'] + aging['90+'],
        critical: aging['90+'],
      },
      aging,
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
    rows.push(`Accounts Receivable (Loans),${from} to ${to}`);
    rows.push('');
    rows.push('Borrower,Date,Direction,Sub Category,Amount,Age Days,Mode,Note');
    for (const c of byCounterparty) {
      for (const x of c.txs) {
        rows.push([c.name, x.date, x.direction, x.subCategory, x.amount.toFixed(2), String(c.ageDays), x.mode || '', (x.note || '').replace(/[,\n]/g, ' ')].join(','));
      }
    }
    rows.push('');
    rows.push(`Total Loans Given,${totals.totalGiven.toFixed(2)}`);
    rows.push(`Total Recovered,${totals.totalRecovered.toFixed(2)}`);
    rows.push(`Net Outstanding,${totals.netOutstanding.toFixed(2)}`);
    rows.push(`Still Owed To Us (positive nets only),${totals.stillOwedToUs.toFixed(2)}`);
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `accounts-receivable-${from}-to-${to}.csv`;
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
          Only loan-based receivable transactions are shown:
          &nbsp;<strong>Cash Outflow</strong> with category <em>"Loan Given"</em> or <em>"Loan Receivable"</em> (money extended)
          &nbsp;·&nbsp; <strong>Cash Inflow</strong> with category <em>"Loan Recovered"</em> or <em>"Account Receivable"</em> (money returned).
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
        <Tile icon={<TrendingUp size={18} />}    label="Total Outstanding"   value={totals.stillOwedToUs} fg="#c2410c" bg="#fff7ed" />
        <Tile icon={<Users size={18} />}         label="Borrowers"           value={totals.counterparties} fg="#334155" bg="#f1f5f9" plain />
        <Tile icon={<Clock size={18} />}         label="Overdue (>0 days)"   value={totals.overdue} fg="#dc2626" bg="#fef2f2" />
        <Tile icon={<AlertTriangle size={18} />} label="Critical (>90 days)" value={totals.critical} fg="#b91c1c" bg="#fef2f2" highlight />
      </div>

      {/* Aging breakdown */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', fontSize: 12.5, fontWeight: 800, color: '#334155', backgroundColor: '#fafbfc' }}>
          Aging Breakdown (by oldest unrecovered Loan Given)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 0 }}>
          {([['current', 'Current', '#059669'], ['1-30', '1–30 days', '#0284c7'], ['31-60', '31–60 days', '#c2410c'], ['61-90', '61–90 days', '#dc2626'], ['90+', '90+ days', '#991b1b']] as [Bucket, string, string][]).map(([k, label, color], i) => (
            <div key={k} style={{ padding: '14px 16px', borderRight: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ opacity: 0.55, fontSize: '0.75em', marginRight: 3 }}>{CURRENCY()}</span>{fmt(aging[k])}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-borrower list */}
      <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(90deg, #f8fafc 0%, #ffffff 100%)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={16} color="#334155" />
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Receivables by Borrower</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '10px 22px', backgroundColor: '#fafbfc', borderBottom: '1px solid #e2e8f0', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          <span>Borrower / Transaction</span>
          <span style={{ textAlign: 'right', minWidth: 180 }}>Net Owed to Us ({CURRENCY()})</span>
        </div>

        {byCounterparty.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
            No loan-based receivable transactions in this range.
            <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 6 }}>
              Add a <strong>Cash Outflow</strong> with category "Loan Given" / "Loan Receivable", or a <strong>Cash Inflow</strong> with category "Loan Recovered" / "Account Receivable" to see data here.
            </div>
          </div>
        ) : byCounterparty.map(c => {
          const isOpen  = expanded.has(c.name);
          const owed    = c.net > 0;
          const overpaid = c.net < 0;
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
                  <ChevronRight size={14} style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', color: owed ? '#c2410c' : '#059669' }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{c.name}</span>
                  <span style={{ fontSize: 10.5, color: '#94a3b8', marginLeft: 4 }}>
                    · {c.txs.length} {c.txs.length === 1 ? 'entry' : 'entries'} · Given AED {fmt(c.given)} · Recovered AED {fmt(c.recovered)}
                    {owed && c.ageDays > 0 && <> · oldest {c.ageDays}d</>}
                  </span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: owed ? (c.ageDays > 60 ? '#dc2626' : '#c2410c') : overpaid ? '#059669' : '#64748b', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 180, textAlign: 'right' }}>
                  {c.net === 0 ? '' : owed ? '+' : '−'}
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
                      backgroundColor: x.direction === 'given' ? '#fff7ed' : '#ecfdf5',
                      color:            x.direction === 'given' ? '#c2410c' : '#059669',
                      marginRight: 8, textTransform: 'uppercase', letterSpacing: '.05em',
                    }}>{x.direction === 'given' ? 'Loan Given' : 'Loan Recovered'}</span>
                    <span style={{ fontStyle: 'italic', color: '#94a3b8', fontSize: 11 }}>
                      {fmtDate(x.date)}{x.mode ? ' · ' + x.mode : ''}{x.note ? ' · ' + x.note : ''}
                    </span>
                  </div>
                  <span style={{
                    fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                    color: x.direction === 'given' ? '#c2410c' : '#059669',
                    textAlign: 'right', minWidth: 180,
                  }}>
                    {x.direction === 'given' ? '+' : '−'}
                    <span style={{ opacity: 0.55, fontSize: '0.82em', marginRight: 3 }}>{CURRENCY()}</span>{fmt(x.amount)}
                  </span>
                </div>
              ))}
            </React.Fragment>
          );
        })}

        {byCounterparty.length > 0 && (
          <div style={{ padding: '14px 22px', backgroundColor: '#0f172a', color: '#fff', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>Total Accounts Receivable (Still Owed to Us)</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: '#6ee7b7', fontVariantNumeric: 'tabular-nums', minWidth: 180, textAlign: 'right' }}>
              <span style={{ opacity: 0.7, fontSize: '0.82em', marginRight: 4 }}>{CURRENCY()}</span>{fmt(totals.stillOwedToUs)}
            </span>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '6px 8px 12px' }}>
        Loans given (outflow) increase what's owed to us. Recoveries (inflow) reduce it. Aging uses the oldest still-unrecovered Loan Given per borrower (FIFO).
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