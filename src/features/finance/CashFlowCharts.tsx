// CashFlowCharts.tsx
// All charts derived from real Firestore transactions — no mock data fallback.

import { useState, useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

type Transaction = {
  id: string; date: string; mainCategory: string;
  subCategory: string; amount: number; mode?: string;
};

type CashFlowChartsProps = { transactions: Transaction[] };

const COLORS = ['#4f46e5', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4'];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(v);

export function CashFlowCharts({ transactions }: CashFlowChartsProps) {
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (!dateRange.start && !dateRange.end) return true;
      const d = new Date(t.date);
      if (dateRange.start && d < new Date(dateRange.start)) return false;
      if (dateRange.end   && d > new Date(dateRange.end))   return false;
      return true;
    });
  }, [transactions, dateRange]);

  // Monthly aggregation
  const monthlyData = useMemo(() => {
    const map = new Map<string, { inflow: number; outflow: number }>();
    filtered.forEach(t => {
      const key = new Date(t.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      if (!map.has(key)) map.set(key, { inflow: 0, outflow: 0 });
      const e = map.get(key)!;
      if (t.mainCategory === 'Cash Inflow') e.inflow += t.amount;
      else e.outflow += t.amount;
    });
    return Array.from(map.entries())
      .map(([month, v]) => ({ month, ...v, net: v.inflow - v.outflow }))
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
  }, [filtered]);

  // Daily (last 30 days)
  const dailyData = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const map = new Map<string, { inflow: number; outflow: number }>();
    filtered
      .filter(t => new Date(t.date) >= cutoff)
      .forEach(t => {
        const key = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (!map.has(key)) map.set(key, { inflow: 0, outflow: 0 });
        const e = map.get(key)!;
        if (t.mainCategory === 'Cash Inflow') e.inflow += t.amount;
        else e.outflow += t.amount;
      });
    return Array.from(map.entries())
      .map(([day, v]) => ({ day, ...v, net: v.inflow - v.outflow }));
  }, [filtered]);

  // Top expense categories
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    filtered
      .filter(t => t.mainCategory !== 'Cash Inflow')
      .forEach(t => {
        const cat = t.subCategory || 'Other';
        map.set(cat, (map.get(cat) ?? 0) + t.amount);
      });
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [filtered]);

  // Summary totals
  const totalInflow  = filtered.filter(t => t.mainCategory === 'Cash Inflow').reduce((s, t) => s + t.amount, 0);
  const totalOutflow = filtered.filter(t => t.mainCategory !== 'Cash Inflow').reduce((s, t) => s + t.amount, 0);
  const netFlow      = totalInflow - totalOutflow;
  const avgDaily     = dailyData.length > 0 ? dailyData.reduce((s, d) => s + d.net, 0) / dailyData.length : 0;

  const isEmpty = filtered.length === 0;

  const EmptyState = ({ height = 400 }: { height?: number }) => (
    <div className="flex items-center justify-center text-gray-400" style={{ height }}>
      No data for selected period
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <h3 className="font-semibold text-lg mb-4">Date Range Filter</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input type="date" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input type="date" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]" />
          </div>
        </div>
        {(dateRange.start || dateRange.end) && (
          <button onClick={() => setDateRange({ start: '', end: '' })}
            className="mt-3 text-sm text-[#4f46e5] hover:underline">
            Clear filter
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Inflow',    value: totalInflow,  color: 'text-green-600' },
          { label: 'Total Outflow',   value: totalOutflow, color: 'text-red-600'   },
          { label: 'Net Cash Flow',   value: netFlow,      color: netFlow >= 0 ? 'text-green-600' : 'text-red-600' },
          { label: 'Avg Daily (30d)', value: avgDaily,     color: 'text-blue-600'  },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      {/* Net Cash Flow Trend */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg mb-4">Net Cash Flow Trend (Monthly)</h3>
        {isEmpty || monthlyData.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Net Cash Flow']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              <Legend />
              <Line type="monotone" dataKey="net" stroke="#4f46e5" strokeWidth={3} name="Net Cash Flow"
                dot={{ fill: '#4f46e5', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Inflow vs Outflow Area */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg mb-4">Inflow vs Outflow Over Time</h3>
        {isEmpty || monthlyData.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              <Legend />
              <Area type="monotone" dataKey="inflow"  stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Inflow" />
              <Area type="monotone" dataKey="outflow" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Outflow" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Daily Cash Flow */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg mb-4">Daily Cash Flow (Last 30 Days)</h3>
        {dailyData.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              <Legend />
              <Bar dataKey="inflow"  fill="#10b981" name="Inflow"  radius={[2, 2, 0, 0]} />
              <Bar dataKey="outflow" fill="#ef4444" name="Outflow" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top Expense Categories */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg mb-4">Top Expense Categories</h3>
        {categoryData.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={categoryData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" stroke="#9ca3af" tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis dataKey="category" type="category" stroke="#9ca3af" width={140} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Amount']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              <Bar dataKey="amount" fill="#ef4444" name="Expense Amount" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}