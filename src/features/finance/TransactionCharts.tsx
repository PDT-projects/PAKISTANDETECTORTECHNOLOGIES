// TransactionCharts.tsx
// All charts derived from real Firestore transaction data — mockData imports removed.

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

type Transaction = {
  id: string; date: string;
  mainCategory: string; subCategory: string; amount: number;
};

type TransactionChartsProps = { transactions: Transaction[] };

const COLORS = ['#10b981', '#ef4444', '#4f46e5', '#f59e0b', '#8b5cf6'];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(v);

export function TransactionCharts({ transactions }: TransactionChartsProps) {
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const filtered = useMemo(() => transactions.filter(t => {
    if (!dateRange.start && !dateRange.end) return true;
    const d = new Date(t.date);
    if (dateRange.start && d < new Date(dateRange.start)) return false;
    if (dateRange.end   && d > new Date(dateRange.end))   return false;
    return true;
  }), [transactions, dateRange]);

  // Monthly aggregation
  const monthlyData = useMemo(() => {
    const map = new Map<string, { inflow: number; outflow: number; inflowCount: number; outflowCount: number }>();
    filtered.forEach(t => {
      const key = new Date(t.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      if (!map.has(key)) map.set(key, { inflow: 0, outflow: 0, inflowCount: 0, outflowCount: 0 });
      const e = map.get(key)!;
      if (t.mainCategory === 'Cash Inflow') { e.inflow += t.amount; e.inflowCount++; }
      else { e.outflow += t.amount; e.outflowCount++; }
    });
    return Array.from(map.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
  }, [filtered]);

  // Daily (last 30 days)
  const dailyData = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const map = new Map<string, { inflow: number; outflow: number; count: number }>();
    filtered
      .filter(t => new Date(t.date) >= cutoff)
      .forEach(t => {
        const key = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (!map.has(key)) map.set(key, { inflow: 0, outflow: 0, count: 0 });
        const e = map.get(key)!;
        if (t.mainCategory === 'Cash Inflow') e.inflow += t.amount; else e.outflow += t.amount;
        e.count++;
      });
    return Array.from(map.entries()).map(([day, v]) => ({ day, ...v }));
  }, [filtered]);

  // Inflow vs expense pie
  const incomeExpenseData = useMemo(() => [
    { name: 'Income',  value: filtered.filter(t => t.mainCategory === 'Cash Inflow').reduce((s, t) => s + t.amount, 0) },
    { name: 'Expense', value: filtered.filter(t => t.mainCategory !== 'Cash Inflow').reduce((s, t) => s + t.amount, 0) },
  ], [filtered]);

  const EmptyState = () => (
    <div className="flex items-center justify-center h-[400px] text-gray-400">
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
            className="mt-3 text-sm text-[#4f46e5] hover:underline">Clear filter</button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600 mb-1">Total Transactions</p>
          <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
          <p className="text-xs text-gray-500 mt-1">In selected period</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600 mb-1">Total Income</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(incomeExpenseData[0].value)}</p>
          <p className="text-xs text-gray-500 mt-1">Cash inflow</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600 mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(incomeExpenseData[1].value)}</p>
          <p className="text-xs text-gray-500 mt-1">Cash outflow</p>
        </div>
      </div>

      {/* Monthly Bar Chart */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg mb-4">Monthly Transaction Summary</h3>
        {monthlyData.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              <Legend />
              <Bar dataKey="inflow"  fill="#10b981" name="Inflow"  radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflow" fill="#ef4444" name="Outflow" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Daily Line Chart */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg mb-4">Daily Transaction Amounts (Last 30 Days)</h3>
        {dailyData.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name]}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              <Legend />
              <Line type="monotone" dataKey="inflow"  stroke="#10b981" strokeWidth={2} name="Inflow" />
              <Line type="monotone" dataKey="outflow" stroke="#ef4444" strokeWidth={2} name="Outflow" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Pie Chart */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h3 className="font-bold text-lg mb-4">Income vs Expense Distribution</h3>
        {incomeExpenseData[0].value === 0 && incomeExpenseData[1].value === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={incomeExpenseData}
                cx="50%" cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={120} dataKey="value"
              >
                {incomeExpenseData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Amount']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}