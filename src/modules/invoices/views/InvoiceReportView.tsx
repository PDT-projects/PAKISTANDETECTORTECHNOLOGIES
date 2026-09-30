// Invoice Module - Report View
// UPDATED: Commission calculated from internal details (deductionCharges + importCharges)

import React, { useState } from 'react';

// ── Currency helpers ──────────────────────────────────────────────────────────
type DisplayCurrency = 'PKR' | 'AED';
const AED_TO_PKR = 76.03;
import { Download, FileText, Filter, X, Eye, Loader2, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import { Invoice, InvoiceStats } from '../models/types';

// ── Commission calculation ─────────────────────────────────────────────────────
// Net sale   = totalAmount - deductionCharges
// Import     = cargoAmount + customsAmount + agentAmount
// Gross comm = Net sale - Import
// Commission = Gross comm × commissionRate  (default 5% if not provided)
const DEFAULT_COMMISSION_RATE = 0.05;

export interface InvoiceCommission {
  invoiceId: string;
  totalAmount: number;
  deductionCharges: number;
  importCharges: number;       // cargo + customs + agent
  netSale: number;             // totalAmount - deductionCharges
  commissionBase: number;      // netSale - importCharges
  commissionRate: number;      // 0–1 fraction
  commissionAmount: number;    // commissionBase × commissionRate
}

function calcCommission(inv: Invoice, rate = DEFAULT_COMMISSION_RATE): InvoiceCommission {
  const deduction    = inv.deductionCharges || 0;
  const importChgs   = (inv.cargoAmount || 0) + (inv.customsAmount || 0) + (inv.agentAmount || 0);
  const netSale      = inv.totalAmount - deduction;
  const commBase     = Math.max(0, netSale - importChgs);
  return {
    invoiceId:        inv.id,
    totalAmount:      inv.totalAmount,
    deductionCharges: deduction,
    importCharges:    importChgs,
    netSale,
    commissionBase:   commBase,
    commissionRate:   rate,
    commissionAmount: Math.round(commBase * rate),
  };
}

interface CommissionStats {
  totalNetSale: number;
  totalImportCharges: number;
  totalDeductions: number;
  totalCommissionBase: number;
  totalCommission: number;
  commissionRate: number;
}

function calcCommissionStats(invoices: Invoice[], rate = DEFAULT_COMMISSION_RATE): CommissionStats {
  let totalDeductions   = 0;
  let totalImportChgs   = 0;
  let totalNetSale      = 0;
  let totalCommBase     = 0;
  invoices.forEach(inv => {
    const c = calcCommission(inv, rate);
    totalDeductions   += c.deductionCharges;
    totalImportChgs   += c.importCharges;
    totalNetSale      += c.netSale;
    totalCommBase     += c.commissionBase;
  });
  return {
    totalNetSale,
    totalImportCharges: totalImportChgs,
    totalDeductions,
    totalCommissionBase: totalCommBase,
    totalCommission: Math.round(totalCommBase * rate),
    commissionRate: rate,
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  invoices: Invoice[];
  filteredInvoices: Invoice[];
  stats: InvoiceStats;
  isLoading: boolean;
  dateFrom: string;
  dateTo: string;
  selectedCity: string[];
  selectedSalesperson: string[];
  selectedStatus: string[];
  viewInvoice: Invoice | null;
  cities: string[];
  salespersons: string[];
  statuses: string[];
  setDateFrom: (date: string) => void;
  setDateTo: (date: string) => void;
  setSelectedCity: (city: string[]) => void;
  setSelectedSalesperson: (s: string[]) => void;
  setSelectedStatus: (s: string[]) => void;
  handleViewInvoice: (invoice: Invoice) => void;
  handleCloseView: () => void;
  handleClearFilters: () => void;
  handleExportCSV: () => void;
  formatCurrency: (amount: number) => string;
  formatDate: (dateString: string) => string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Multi-select filter dropdown (inline) ────────────────────────────────────
function InvoiceMultiFilter({
  label, selected, onChange, options, displayName,
}: {
  label: string;
  selected: string[];
  onChange: (v: string[]) => void;
  options: string[];
  displayName?: (v: string) => string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const display = displayName ?? ((v: string) => v);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter(v => v !== opt) : [...selected, opt]);

  const has = selected.length > 0;

  return (
    <div ref={ref} className="flex flex-col gap-1 relative min-w-[130px] flex-1">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border cursor-pointer text-left transition-all outline-none ${has ? 'border-gray-800 bg-gray-50 text-gray-900 font-semibold' : 'border-gray-300 bg-white text-gray-400'}`}
      >
        <span className="truncate flex-1">
          {has ? (selected.length === 1 ? display(selected[0]) : `${selected.length} selected`) : 'All'}
        </span>
        <ChevronDown size={13} className={`shrink-0 ml-1 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-[999] mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-[180px] max-w-[240px]">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <button type="button" onClick={() => onChange(options)} className="text-[11px] font-bold text-gray-700 hover:text-gray-900 border-none bg-none cursor-pointer p-0">Select all</button>
            <span className="text-gray-200">|</span>
            <button type="button" onClick={() => onChange([])} className="text-[11px] font-bold text-gray-400 hover:text-gray-600 border-none bg-none cursor-pointer p-0">Clear</button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {options.length === 0
              ? <div className="px-3 py-3 text-xs text-gray-400">No options</div>
              : options.map(opt => {
                  const checked = selected.includes(opt);
                  return (
                    <div key={opt} onClick={() => toggle(opt)}
                      className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm select-none transition-colors ${checked ? 'bg-gray-50 text-gray-900 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}>
                      <span className="shrink-0 flex items-center justify-center rounded"
                        style={{ width: 15, height: 15, border: `2px solid ${checked ? '#111827' : '#d1d5db'}`, backgroundColor: checked ? '#111827' : '#fff', transition: 'all 0.12s' }}>
                        {checked && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                      <span className="truncate">{display(opt)}</span>
                    </div>
                  );
                })}
          </div>
        </div>
      )}

      {has && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {selected.map(v => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-900 text-white">
              <span className="truncate max-w-[80px]">{display(v)}</span>
              <span onClick={e => { e.stopPropagation(); toggle(v); }} className="cursor-pointer flex items-center">
                <X size={8} color="white" />
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function InvoiceReportView({
  invoices, filteredInvoices, stats, isLoading,
  dateFrom, dateTo, selectedCity, selectedSalesperson, selectedStatus,
  viewInvoice, cities, salespersons, statuses,
  setDateFrom, setDateTo, setSelectedCity, setSelectedSalesperson, setSelectedStatus,
  handleViewInvoice, handleCloseView, handleClearFilters, handleExportCSV,
  formatCurrency, formatDate,
}: Props) {
  const hasFilters = dateFrom || dateTo || selectedCity.length > 0 || selectedSalesperson.length > 0 || selectedStatus.length > 0;

  // Commission rate can be adjusted by the user (shown as %)
  const [commRate, setCommRate] = useState(DEFAULT_COMMISSION_RATE);
  const [showCommSection, setShowCommSection] = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('PKR');

  const formatDisplay = (pkrAmount: number): string => {
    if (displayCurrency === 'AED') {
      const aed = pkrAmount / AED_TO_PKR;
      return `د.إ ${new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(aed)} AED`;
    }
    return formatDisplay(pkrAmount);
  };

  const commStats = calcCommissionStats(filteredInvoices, commRate);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoice Reports</h2>
          <p className="text-gray-600">Generate and export invoice reports</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Currency Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
            {(['PKR', 'AED'] as DisplayCurrency[]).map(cur => (
              <button
                key={cur}
                onClick={() => setDisplayCurrency(cur)}
                style={displayCurrency === cur ? { backgroundColor: '#374151', color: '#ffffff' } : {}}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  displayCurrency === cur ? 'shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {cur === 'PKR' ? '₨ PKR' : 'د.إ AED'}
              </button>
            ))}
          </div>
          <button onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-[#4f46e5] text-white rounded-lg hover:bg-[#4338ca] transition-colors">
            <Download size={20} /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Invoices', value: stats.totalCount,                    color: 'text-gray-900' },
          { label: 'Paid',           value: stats.paidCount,                     color: 'text-green-600' },
          { label: 'Unpaid',         value: stats.unpaidCount,                   color: 'text-red-600' },
          { label: 'Total Amount',   value: formatDisplay(stats.totalAmount),   color: 'text-gray-900' },
        ].map(s => (
          <div key={s.label} className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Commission Summary ── */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowCommSection(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-indigo-500" />
            <h3 className="font-semibold text-gray-900">Commission Breakdown</h3>
            <span className="text-xs text-gray-400">— based on filtered invoices</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Commission rate adjuster */}
            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
              <label className="text-xs text-gray-500 font-medium">Rate:</label>
              <input
                type="number" min="0" max="100" step="0.5"
                value={+(commRate * 100).toFixed(2)}
                onChange={e => setCommRate(Math.min(100, Math.max(0, Number(e.target.value))) / 100)}
                className="w-16 px-2 py-0.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <span className="text-xs text-gray-500">%</span>
            </div>
            {showCommSection ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          </div>
        </button>

        {showCommSection && (
          <div className="border-t border-gray-200 p-4">
            <div className="grid grid-cols-5 gap-4 mb-4">
              {[
                { label: 'Total Sales',        value: formatDisplay(filteredInvoices.reduce((s,i) => s + i.totalAmount, 0)), color: 'text-gray-900' },
                { label: 'Delivery Deductions',value: formatDisplay(commStats.totalDeductions),    color: 'text-red-600'   },
                { label: 'Net Sales',          value: formatDisplay(commStats.totalNetSale),       color: 'text-gray-900'  },
                { label: 'Import Charges',     value: formatDisplay(commStats.totalImportCharges), color: 'text-orange-600'},
                { label: `Commission (${(commRate * 100).toFixed(1)}%)`, value: formatDisplay(commStats.totalCommission), color: 'text-indigo-700' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              Formula: Commission = (Total – Delivery Deductions – Import Charges) × {(commRate * 100).toFixed(1)}%
              {displayCurrency === 'AED' && <span className="ml-2 text-gray-300">· Rate: 1 AED = {AED_TO_PKR} PKR</span>}
            </p>
          </div>
        )}
      </div>

      {/* Filters — always visible, all multi-select */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={18} className="text-[#4f46e5]" />
          <h3 className="font-semibold text-gray-900">Filters</h3>
          {hasFilters && (
            <button onClick={handleClearFilters} className="ml-auto text-sm text-red-500 hover:text-red-700">Clear All</button>
          )}
        </div>
        <div className="flex flex-wrap gap-4 items-start">
          {/* Date From */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">From Date</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4f46e5] focus:outline-none bg-white text-gray-900" />
          </div>
          {/* Date To */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">To Date</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4f46e5] focus:outline-none bg-white text-gray-900" />
          </div>
          {/* City multi-select */}
          <InvoiceMultiFilter
            label="City / Country"
            selected={selectedCity}
            onChange={setSelectedCity}
            options={cities}
          />
          {/* Salesperson multi-select */}
          <InvoiceMultiFilter
            label="Salesperson"
            selected={selectedSalesperson}
            onChange={setSelectedSalesperson}
            options={salespersons}
          />
          {/* Status multi-select */}
          <InvoiceMultiFilter
            label="Status"
            selected={selectedStatus}
            onChange={setSelectedStatus}
            options={statuses}
          />
        </div>
      </div>

      <p className="text-sm text-gray-500">Showing {filteredInvoices.length} of {invoices.length} invoices</p>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Invoice #', 'Date', 'Customer', 'City', 'Salesperson', 'Products', 'Amount', 'Deduction', 'Import', 'Commission', 'Status', ''].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredInvoices.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-500">
                <FileText className="mx-auto mb-3 text-gray-300" size={40} />
                <p>No invoices match the selected filters</p>
                {hasFilters && <button onClick={handleClearFilters} className="mt-2 text-[#4f46e5] text-sm hover:underline">Clear filters</button>}
              </td></tr>
            ) : filteredInvoices.map(inv => {
              const comm = calcCommission(inv, commRate);
              return (
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3 font-medium text-[#4f46e5] text-sm">{inv.invoiceNumber}</td>
                  <td className="px-3 py-3 text-xs text-gray-600">{formatDate(inv.date)}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-gray-900 text-sm">{inv.customerName}</p>
                    <p className="text-xs text-gray-500">{inv.customerPhone}</p>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600">{inv.customerCity || '—'}</td>
                  <td className="px-3 py-3 text-xs text-gray-600">{inv.salesperson || '—'}</td>
                  <td className="px-3 py-3 text-xs text-gray-600">{inv.products.length} item(s)</td>
                  <td className="px-3 py-3 text-sm font-medium text-gray-900">{formatDisplay(inv.totalAmount)}</td>
                  <td className="px-3 py-3 text-xs text-red-600">
                    {comm.deductionCharges > 0 ? `−${formatDisplay(comm.deductionCharges)}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-orange-600">
                    {comm.importCharges > 0 ? `−${formatDisplay(comm.importCharges)}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs font-semibold text-indigo-700">
                    {formatDisplay(comm.commissionAmount)}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${inv.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={() => handleViewInvoice(inv)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="View">
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* View Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold">Invoice Details</h3>
              <button onClick={handleCloseView} className="p-2 hover:bg-gray-100 rounded-lg"><X size={22} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-gray-500">Invoice #</p><p className="font-semibold">{viewInvoice.invoiceNumber}</p></div>
                <div><p className="text-gray-500">Date</p><p className="font-semibold">{formatDate(viewInvoice.date)}</p></div>
                <div>
                  <p className="text-gray-500">Customer</p>
                  <p className="font-semibold">{viewInvoice.customerName}</p>
                  <p className="text-gray-500 text-xs">{viewInvoice.customerPhone}</p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${viewInvoice.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {viewInvoice.status}
                  </span>
                </div>
                {viewInvoice.salesperson && <div><p className="text-gray-500">Salesperson</p><p className="font-semibold">{viewInvoice.salesperson}</p></div>}
                {viewInvoice.customerCity && (
                  <div>
                    <p className="text-gray-500">Location</p>
                    <p className="font-semibold">
                      {[viewInvoice.customerCity, viewInvoice.customerProvince].filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
                {viewInvoice.paymentMode && <div><p className="text-gray-500">Payment Mode</p><p className="font-semibold">{viewInvoice.paymentMode}</p></div>}
                {viewInvoice.collectionMethod && <div><p className="text-gray-500">Collection</p><p className="font-semibold">{viewInvoice.collectionMethod}</p></div>}
              </div>

              {/* Products */}
              <div className="border-t pt-4">
                <p className="font-semibold mb-3">Products</p>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr></thead>
                  <tbody>{viewInvoice.products.map((p, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-3 py-2">{p.productName}</td>
                      <td className="px-3 py-2">{p.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatDisplay(p.price)}</td>
                      <td className="px-3 py-2 text-right">{formatDisplay(p.total)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>

              {/* Commission breakdown for this invoice */}
              {(() => {
                const c = calcCommission(viewInvoice, commRate);
                const importChgs = (viewInvoice.cargoAmount || 0) + (viewInvoice.customsAmount || 0) + (viewInvoice.agentAmount || 0);
                return (
                  <div className="border-t pt-4 space-y-2 bg-indigo-50 rounded-lg p-3">
                    <p className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5">
                      <TrendingUp size={14} /> Commission Breakdown
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between"><span className="text-gray-600">Total Amount</span><span className="font-medium">{formatDisplay(c.totalAmount)}</span></div>
                      {c.deductionCharges > 0 && <div className="flex justify-between"><span className="text-gray-600">Delivery Deduction</span><span className="text-red-600 font-medium">−{formatDisplay(c.deductionCharges)}</span></div>}
                      {importChgs > 0 && (
                        <>
                          {viewInvoice.cargoAmount   ? <div className="flex justify-between"><span className="text-gray-600">Cargo</span><span className="text-orange-600 font-medium">−{formatDisplay(viewInvoice.cargoAmount)}</span></div> : null}
                          {viewInvoice.customsAmount ? <div className="flex justify-between"><span className="text-gray-600">Customs</span><span className="text-orange-600 font-medium">−{formatDisplay(viewInvoice.customsAmount)}</span></div> : null}
                          {viewInvoice.agentAmount   ? <div className="flex justify-between"><span className="text-gray-600">Agent ({viewInvoice.agentDetails || ''})</span><span className="text-orange-600 font-medium">−{formatDisplay(viewInvoice.agentAmount)}</span></div> : null}
                        </>
                      )}
                      <div className="flex justify-between border-t pt-1 col-span-2"><span className="text-gray-700 font-medium">Commission Base</span><span className="font-semibold">{formatDisplay(c.commissionBase)}</span></div>
                      <div className="flex justify-between col-span-2">
                        <span className="text-indigo-700 font-semibold">Commission ({(commRate * 100).toFixed(1)}%)</span>
                        <span className="text-indigo-700 font-bold text-sm">{formatDisplay(c.commissionAmount)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="border-t pt-4 flex justify-between items-center">
                <p className="text-lg font-bold">Total Amount</p>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#4f46e5]">{formatDisplay(viewInvoice.totalAmount)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    ≈ {displayCurrency === 'PKR'
                      ? `د.إ ${(viewInvoice.totalAmount / AED_TO_PKR).toFixed(2)} AED`
                      : `₨ ${Math.round(viewInvoice.totalAmount * AED_TO_PKR).toLocaleString('en-PK')} PKR`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}