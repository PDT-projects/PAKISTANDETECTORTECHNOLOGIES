// ReportsPage.tsx
// Standalone reports hub — accessible to users who have report permissions
// but may NOT have Dashboard access. Lives at /reports route.
//
// ── This file is now a thin wrapper around <ReportsHub> ──
// To add/remove/change any report, edit ReportsHub.tsx only.

import { Loader2 } from 'lucide-react';
import { useDashboardData } from './UseDashboardData';
import { ReportsHub } from './ReportsHub';

export function ReportsPage() {
  const { transactions, banks, loans, invoices, commissions, products, loading } = useDashboardData();

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 320, gap: 16 }}>
        <Loader2 size={36} color="#4f46e5" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ color: '#6b7280', fontSize: 14 }}>Loading reports…</p>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 24, minHeight: '100%', backgroundColor: '#f8fafc' }}>
      <ReportsHub
        transactions={transactions}
        banks={banks}
        loans={loans}
        invoices={invoices}
        commissions={commissions}
        products={products}
        backLabel="Back to Reports"
      />
    </div>
  );
}