// ReportsHub.tsx
// ── SINGLE SOURCE OF TRUTH for all reports ──
// Both Dashboard.tsx (Reports tab) and ReportsPage.tsx import this component.
// To add/remove/update any report: edit THIS file only. Changes reflect everywhere.

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  FileText, BarChart2, Scale,
  ChevronRight, Receipt, Package,
} from 'lucide-react';
import { useUserPermissions } from '../../modules/user-management/hooks/useUserPermissions';
import type { Screen } from '../../modules/user-management/models/userService';

// Only these three reports are wired up now. Everything else was removed
// per product decision — trimmed to just the core financial statements
// and the receivable/payable position.
//
// AR and AP were previously two separate cards backed by two separate files.
// They are one report now: they read the same ledger from opposite sides, and
// keeping them apart meant a counterparty who both owed us money and was owed
// money by us appeared twice with no way to see the net.
import { BalanceSheetReport }               from './BalanceSheetReport';
import { IncomeStatementReport }            from './Incomestatementreport';
import { AccountsPayableReceivableReport }  from './Accountspayablereceivablereport';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportsHubProps {
  // Data passed in from parent (already fetched by useDashboardData)
  transactions: any[];
  banks:        any[];
  loans:        any[];
  invoices:     any[];
  commissions:  any[];
  products:     any[];
  // Optional: override the back button label (Dashboard uses "← Back to Reports Hub")
  /** Accepted for call-site compatibility; the header no longer renders a back
   *  button, since the sidebar's Reports entry already returns here. */
  backLabel?:   string;
}

// ── Master config — ADD / EDIT / REMOVE reports here only ────────────────────

const SCREEN_MAP: Record<string, Screen> = {
  'income-statement':             'Profit Loss Report',
  'balance-sheet':                'Balance Sheet Report',
  // Reuses the balance sheet permission, as the two separate AR/AP cards did.
  // If you want a dedicated permission, add the literal to the `Screen` union
  // in user-management/models/userService first — this map is typed against it.
  'accounts-receivable-payable':  'Balance Sheet Report',
};

const ALL_REPORT_CARDS = [
  { id: 'income-statement',            name: 'Income Statement',              description: 'Revenue, COGS, gross profit & operating expenses in P&L format',            icon: BarChart2, accent: '#0f766e', lightBg: '#f0fdfa', tag: 'Finance' },
  { id: 'balance-sheet',               name: 'Balance Sheet',                 description: 'Assets, liabilities & equity position',                                     icon: FileText,  accent: '#2563eb', lightBg: '#eff6ff', tag: 'Finance' },
  { id: 'accounts-receivable-payable', name: 'Receivables & Payables',        description: 'What is owed to us and what we owe, by counterparty — with aging and net position', icon: Scale,     accent: '#4f46e5', lightBg: '#eef2ff', tag: 'Cash In / Out' },
];

// ── Report renderer — maps id → component ────────────────────────────────────

function renderReport(
  id: string,
  props: ReportsHubProps,
  onBack: () => void,
): React.ReactNode {
  const { transactions, banks, loans, invoices, products } = props;
  switch (id) {
    case 'income-statement':            return <IncomeStatementReport           transactions={transactions} invoices={invoices} onBack={onBack} />;
    case 'balance-sheet':               return <BalanceSheetReport              transactions={transactions} banks={banks} loans={loans} products={products} invoices={invoices} onBack={onBack} />;
    case 'accounts-receivable-payable': return <AccountsPayableReceivableReport transactions={transactions} invoices={invoices} banks={banks} onBack={onBack} defaultTab="combined" />;
    default:                            return null;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReportsHub(props: ReportsHubProps) {
  const { transactions, products } = props;
  const { hasPermission } = useUserPermissions();
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

  // Which report is open is component state, not part of the URL, so pressing
  // the sidebar's Reports entry from inside a report did nothing.
  const location = useLocation();
  useEffect(() => { setSelectedReport(null); }, [location.key]);

  const accessibleCards = ALL_REPORT_CARDS.filter(card => {
    const screen = SCREEN_MAP[card.id];
    return screen ? hasPermission(screen) : false;
  });

  // ── Report detail view ────────────────────────────────────────────────────
  if (selectedReport) {
    const card = accessibleCards.find(c => c.id === selectedReport);
    return (
      <div style={{ padding: 0 }}>
        {renderReport(selectedReport, props, () => setSelectedReport(null))}
      </div>
    );
  }

  // ── Hub grid ──────────────────────────────────────────────────────────────
  return (
    <div style={{ margin: '0 -24px -24px', backgroundColor: '#f8fafc' }}>

      {/* White header band */}
      <div style={{
        backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0',
        padding: '24px 32px 28px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', backgroundColor: '#f1f5f9', zIndex: 0 }} />
        <div style={{ position: 'absolute', bottom: -50, right: 110, width: 120, height: 120, borderRadius: '50%', backgroundColor: '#f8fafc', zIndex: 0 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BarChart2 size={18} color="#fff" />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Reports Hub</h2>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>Select any report below to view live data</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
            {[
              { label: 'Reports Available', value: accessibleCards.length, icon: FileText },
              { label: 'Transactions',      value: transactions.length,    icon: Receipt  },
              { label: 'Products',          value: products.length,        icon: Package  },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px',
                backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0',
              }}>
                <Icon size={14} color="#334155" />
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: 500 }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ padding: '28px 32px' }}>
        {accessibleCards.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 12 }}>
            <BarChart2 size={48} color="#d1d5db" />
            <p style={{ fontSize: 15, fontWeight: 600, color: '#6b7280', margin: 0 }}>No reports available</p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Contact your administrator to request report access.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {accessibleCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  onClick={() => setSelectedReport(card.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', padding: '20px 22px',
                    backgroundColor: '#fff', borderRadius: 14, textAlign: 'left',
                    border: '1px solid #e2e8f0', cursor: 'pointer', width: '100%',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.05)', transition: 'all 0.18s ease',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget;
                    el.style.boxShadow = `0 8px 24px rgba(0,0,0,0.1), 0 0 0 2px ${card.accent}22`;
                    el.style.transform = 'translateY(-2px)';
                    el.style.borderColor = `${card.accent}44`;
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget;
                    el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)';
                    el.style.transform = 'translateY(0)';
                    el.style.borderColor = '#e2e8f0';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 11, backgroundColor: card.lightBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={22} color={card.accent} />
                    </div>
                    <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, backgroundColor: card.lightBg, color: card.accent, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                      {card.tag}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>{card.name}</div>
                    <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.55, margin: 0 }}>{card.description}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 16, fontSize: 12, fontWeight: 600, color: card.accent }}>
                    View Report <ChevronRight size={14} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}