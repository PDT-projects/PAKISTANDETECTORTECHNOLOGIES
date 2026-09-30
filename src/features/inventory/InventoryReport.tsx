import { useMemo, useState, useRef, useEffect } from 'react';
import type { Product } from '../../modules/inventory/models/types';
import { Package, MapPin, Calendar, Filter, Download, BarChart3, Eye, X, Hash, DollarSign, FileText, TrendingUp, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type InventoryReportProps = {
  products: Product[];
};

const CITIES = ['Dubai', 'Abu Dhabi', 'Saudi Arabia'];

// ── Multi-select dropdown component ──────────────────────────────────────────
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = 'All',
  disabled = false,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const displayText =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full border rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 transition-colors
          ${disabled ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white border-gray-300 hover:border-slate-600 cursor-pointer'}
          ${open ? 'border-slate-700 ring-1 ring-slate-400' : ''}`}
      >
        <span className={selected.length === 0 ? 'text-gray-400' : 'text-gray-900 font-medium'}>
          {displayText}
        </span>
        <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Selected pills */}
      {selected.length > 1 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selected.map(v => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-slate-800 text-xs rounded-full"
            >
              {v}
              <button onClick={() => toggle(v)} className="hover:text-slate-900">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">No options available</p>
          ) : (
            <>
              <button
                onClick={() => onChange([])}
                className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-100"
              >
                Clear all
              </button>
              {options.map(opt => (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="accent-slate-800 w-4 h-4 rounded"
                  />
                  <span className="text-gray-800">{opt}</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function InventoryReport({ products }: InventoryReportProps) {
  // filters
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showVisualization, setShowVisualization] = useState(false);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);

  // ── Derived filter options ──────────────────────────────────────────────────
  const brands = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => s.add(p.brandName));
    return Array.from(s).sort();
  }, [products]);

  // Models filtered to only those belonging to currently selected brands
  const availableModels = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => {
      if (selectedBrands.length === 0 || selectedBrands.includes(p.brandName)) {
        s.add(p.modelName);
      }
    });
    return Array.from(s).sort();
  }, [products, selectedBrands]);

  // When brands change, drop any model selections that are no longer valid
  useEffect(() => {
    setSelectedModels(prev => prev.filter(m => availableModels.includes(m)));
  }, [availableModels]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => s.add(p.category));
    return Array.from(s).sort();
  }, [products]);

  // ── Cities derived from actual product data (not hardcoded) ─────────────────
  // Collects every distinct city that appears in any product's serialCities map,
  // so locations beyond the default three are never silently dropped.
  const cities = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => {
      const sc = p.serialCities || {};
      Object.values(sc).forEach(c => {
        if (c && String(c).trim()) s.add(String(c).trim());
      });
    });
    // Preserve preferred ordering for known cities, then append the rest A→Z.
    const known = CITIES.filter(c => s.has(c));
    const extras = Array.from(s).filter(c => !CITIES.includes(c)).sort();
    return [...known, ...extras];
  }, [products]);

  // ── Date-filtered base products ────────────────────────────────────────────
  const dateFilteredProducts = useMemo(() => {
    if (!startDate && !endDate) return products;
    return products.filter(p => {
      const created = p.createdAt ? new Date(p.createdAt) : null;
      if (!created) return true;
      if (startDate && created < new Date(startDate)) return false;
      if (endDate && created > new Date(endDate + 'T23:59:59')) return false;
      return true;
    });
  }, [products, startDate, endDate]);

  // ── City-wise inventory ────────────────────────────────────────────────────
  const cityInventory = useMemo(() => {
    const citiesToShow = selectedCities.length > 0 ? selectedCities : cities;

    return citiesToShow.map(city => {
      const cityProducts = dateFilteredProducts.map(product => {
        const serialStatus = product.serialStatus || {};

        const serialsInCity = product.serialNumbers.filter(serial => {
          const status = serialStatus[serial] || 'Available';
          return (product.serialCities || {})[serial] === city && status !== 'In Transit';
        });

        const availableInCity = serialsInCity.filter(s => (serialStatus[s] || 'Available') === 'Available');
        const returnedInCity = serialsInCity.filter(s => serialStatus[s] === 'Returned');
        const damagedInCity = serialsInCity.filter(s => serialStatus[s] === 'Damaged');
        const inTransitForProduct = product.serialNumbers.filter(s => serialStatus[s] === 'In Transit');

        return {
          ...product,
          cityStock: serialsInCity.length,
          citySerials: serialsInCity,
          cityAvailable: availableInCity.length,
          cityReturned: returnedInCity.length,
          cityDamaged: damagedInCity.length,
          cityInTransit: inTransitForProduct.length,
        };
      }).filter(p => {
        if (selectedBrands.length > 0 && !selectedBrands.includes(p.brandName)) return false;
        if (selectedModels.length > 0 && !selectedModels.includes(p.modelName)) return false;
        if (selectedCategory && p.category !== selectedCategory) return false;
        return p.cityStock > 0;
      });

      const totalStock = cityProducts.reduce((s, p) => s + p.cityStock, 0);
      const totalValue = cityProducts.reduce((s, p) => s + p.cityStock * p.costPrice, 0);
      const totalInTransit = cityProducts.reduce((s, p) => s + p.cityInTransit, 0);

      return { city, products: cityProducts, totalStock, totalValue, totalInTransit };
    });
  }, [dateFilteredProducts, selectedCities, selectedBrands, selectedModels, selectedCategory, cities]);

  // ── Overall totals ─────────────────────────────────────────────────────────
  const overallTotals = useMemo(() => {
    return cityInventory.reduce(
      (acc, inv) => ({
        totalStock: acc.totalStock + inv.totalStock,
        totalValue: acc.totalValue + inv.totalValue,
        totalProducts: acc.totalProducts + inv.products.length,
        totalInTransit: acc.totalInTransit + inv.totalInTransit,
      }),
      { totalStock: 0, totalValue: 0, totalProducts: 0, totalInTransit: 0 }
    );
  }, [cityInventory]);

  // ── Visualization data ─────────────────────────────────────────────────────
  const visualizationData = useMemo(() => {
    const stockByCity = cityInventory.map(inv => ({ city: inv.city, stock: inv.totalStock, value: inv.totalValue }));

    const stockByBrand = dateFilteredProducts.reduce((acc, p) => {
      acc[p.brandName] = (acc[p.brandName] || 0) + p.serialNumbers.length;
      return acc;
    }, {} as Record<string, number>);
    const brandStockData = Object.entries(stockByBrand).map(([brand, stock]) => ({ brand, stock })).sort((a, b) => b.stock - a.stock);

    const stockByCategory = dateFilteredProducts.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + p.serialNumbers.length;
      return acc;
    }, {} as Record<string, number>);
    const categoryStockData = Object.entries(stockByCategory).map(([category, stock]) => ({ category, stock })).sort((a, b) => b.stock - a.stock);

    const topProducts = dateFilteredProducts
      .map(p => ({ product: `${p.brandName} ${p.modelName}`, stock: p.serialNumbers.length, value: p.serialNumbers.length * p.costPrice }))
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 10);

    const statusCounts = dateFilteredProducts.reduce((acc, p) => {
      const ss = p.serialStatus || {};
      p.serialNumbers.forEach(s => { const st = ss[s] || 'Available'; acc[st] = (acc[st] || 0) + 1; });
      return acc;
    }, {} as Record<string, number>);
    const statusData = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    return { stockByCity, brandStockData, categoryStockData, topProducts, statusData };
  }, [cityInventory, dateFilteredProducts]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', minimumFractionDigits: 0 }).format(amount);

  const hasActiveFilters =
    selectedCities.length > 0 ||
    selectedBrands.length > 0 ||
    selectedModels.length > 0 ||
    selectedCategory !== '' ||
    startDate !== '' ||
    endDate !== '';

  const clearFilters = () => {
    setSelectedCities([]);
    setSelectedBrands([]);
    setSelectedModels([]);
    setSelectedCategory('');
    setStartDate('');
    setEndDate('');
  };

  const handleExportCSV = () => {
    const headers = ['City', 'Brand', 'Model', 'Category', 'Stock', 'Cost Price', 'Sell Price', 'Total Value', 'Serial Numbers'];
    const rows: string[] = [];
    cityInventory.forEach(inv => {
      inv.products.forEach(product => {
        rows.push([
          inv.city, product.brandName, product.modelName, product.category,
          product.cityStock.toString(), product.costPrice.toString(), product.sellPrice.toString(),
          (product.cityStock * product.costPrice).toString(), product.citySerials.join('; ')
        ].join(','));
      });
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Report exported successfully');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Inventory Report</h2>
            <p className="text-sm text-gray-600 mt-1">City-wise product inventory for Middle East Detectors Technologies</p>
          </div>
          <button
            onClick={() => setShowVisualization(!showVisualization)}
            className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 border border-blue-300 rounded-lg hover:bg-blue-200 flex items-center gap-2"
          >
            <BarChart3 size={16} />
            {showVisualization ? 'Hide' : 'Show'} Visualization
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Package size={20} className="text-blue-600" /></div>
            <p className="text-sm font-semibold text-gray-700">Total Available/Returned</p>
          </div>
          <p className="text-3xl font-bold text-[#1e293b]">{overallTotals.totalStock} units</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-100 rounded-lg"><BarChart3 size={20} className="text-green-600" /></div>
            <p className="text-sm font-semibold text-gray-700">Total Value</p>
          </div>
          <p className="text-3xl font-bold text-[#10b981]">{formatCurrency(overallTotals.totalValue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-slate-100 rounded-lg"><MapPin size={20} className="text-slate-700" /></div>
            <p className="text-sm font-semibold text-gray-700">Cities / In Transit</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {selectedCities.length > 0 ? selectedCities.length : cities.length} cities
          </p>
          <p className="text-sm text-gray-500 mt-2">In Transit: {overallTotals.totalInTransit} units</p>
        </div>
      </div>

      {/* Visualization Section */}
      {showVisualization && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-slate-100 rounded-xl"><BarChart3 size={24} className="text-slate-700" /></div>
            <h3 className="text-2xl font-bold text-gray-900">Inventory Analytics</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-4">Stock Distribution by City</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={visualizationData.stockByCity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="city" /><YAxis />
                  <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} units`, 'Stock']} />
                  <Bar dataKey="stock" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-4">Inventory Value by City</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={visualizationData.stockByCity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="city" /><YAxis />
                  <Tooltip formatter={(v) => [`${formatCurrency(Number(v))}`, 'Value']} />
                  <Bar dataKey="value" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-4">Stock by Brand</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={visualizationData.brandStockData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="brand" /><YAxis />
                  <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} units`, 'Stock']} />
                  <Bar dataKey="stock" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-4">Stock by Category</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={visualizationData.categoryStockData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" /><YAxis />
                  <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} units`, 'Stock']} />
                  <Bar dataKey="stock" fill="#334155" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-4">Top 10 Products by Stock</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={visualizationData.topProducts} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="product" type="category" width={100} />
                  <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} units`, 'Stock']} />
                  <Bar dataKey="stock" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-4">Inventory Status Distribution</h4>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={visualizationData.statusData} cx="50%" cy="50%" outerRadius={80} dataKey="count">
                    {visualizationData.statusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#334155'][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-600" />
            <h3 className="font-semibold text-gray-900">Filters</h3>
            {hasActiveFilters && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-slate-800">
                Active
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <X size={12} /> Clear all filters
            </button>
          )}
        </div>

        {/* Row 1: Date range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-100">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Calendar size={14} className="text-gray-500" /> Start Date
            </label>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Calendar size={14} className="text-gray-500" /> End Date
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={e => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-600"
            />
          </div>
        </div>

        {/* Row 2: Location, Brand, Model, Category */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MultiSelect
            label="Location"
            options={cities}
            selected={selectedCities}
            onChange={setSelectedCities}
            placeholder="All Locations"
          />
          <MultiSelect
            label="Brand"
            options={brands}
            selected={selectedBrands}
            onChange={setSelectedBrands}
            placeholder="All Brands"
          />
          <MultiSelect
            label={`Model${selectedBrands.length > 0 ? ` (${selectedBrands.join(', ')})` : ''}`}
            options={availableModels}
            selected={selectedModels}
            onChange={setSelectedModels}
            placeholder="All Models"
            disabled={availableModels.length === 0}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-600"
            >
              <option value="">All Categories</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
        </div>

        {/* Active filter summary */}
        {hasActiveFilters && (
          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
            {startDate && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                From: {startDate}
                <button onClick={() => setStartDate('')}><X size={10} /></button>
              </span>
            )}
            {endDate && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                To: {endDate}
                <button onClick={() => setEndDate('')}><X size={10} /></button>
              </span>
            )}
            {selectedCities.map(c => (
              <span key={c} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 text-slate-700 text-xs rounded-full">
                📍 {c}
                <button onClick={() => setSelectedCities(selectedCities.filter(v => v !== c))}><X size={10} /></button>
              </span>
            ))}
            {selectedBrands.map(b => (
              <span key={b} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-full">
                {b}
                <button onClick={() => setSelectedBrands(selectedBrands.filter(v => v !== b))}><X size={10} /></button>
              </span>
            ))}
            {selectedModels.map(m => (
              <span key={m} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 text-slate-800 text-xs rounded-full">
                {m}
                <button onClick={() => setSelectedModels(selectedModels.filter(v => v !== m))}><X size={10} /></button>
              </span>
            ))}
            {selectedCategory && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full">
                {selectedCategory}
                <button onClick={() => setSelectedCategory('')}><X size={10} /></button>
              </span>
            )}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 text-sm font-medium text-white bg-[#10b981] rounded-lg hover:bg-[#059669] flex items-center gap-2"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* City-wise Inventory */}
      <div className="space-y-8">
        {cityInventory.map(inv => (
          <div key={inv.city} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="p-6" style={{ background: 'linear-gradient(to right, #1e293b, #334155)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-xl"><MapPin size={28} className="text-white" /></div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">{inv.city}</h3>
                    <p className="text-base text-white/90 mt-1">
                      {inv.products.length} product{inv.products.length !== 1 ? 's' : ''} • {inv.totalStock} units
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-white/80">Total Value</p>
                  <p className="text-3xl font-bold text-white">{formatCurrency(inv.totalValue)}</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Brand / Model</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock (Status)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sell Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Serial Numbers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {inv.products.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        No products in stock for this city
                      </td>
                    </tr>
                  ) : (
                    inv.products.map(product => (
                      <tr
                        key={product.id}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => setViewProduct(product)}
                      >
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">{product.brandName}</p>
                          <p className="text-sm text-gray-600">{product.modelName}</p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.category}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                              <Package size={12} />{product.cityStock} units
                            </span>
                            <span className="text-[11px] text-gray-500">
                              Available: {product.cityAvailable} • Returned: {product.cityReturned} • Damaged: {product.cityDamaged} • In Transit: {product.cityInTransit}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{formatCurrency(product.costPrice)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">{formatCurrency(product.sellPrice)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-[#1e293b]">{formatCurrency(product.cityStock * product.costPrice)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 flex items-center justify-between">
                          <div className="max-w-xs">
                            {product.citySerials.slice(0, 3).map(serial => (
                              <span key={serial} className="inline-block mr-2 mb-1 px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">{serial}</span>
                            ))}
                            {product.citySerials.length > 3 && (
                              <span className="text-xs text-gray-500">+{product.citySerials.length - 3} more</span>
                            )}
                          </div>
                          <Eye size={16} className="text-gray-400 ml-2" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {inv.products.length > 0 && (
                  <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={2} className="px-6 py-3 text-sm font-bold text-gray-900">{inv.city} Total</td>
                      <td className="px-6 py-3 text-sm font-bold text-[#1e293b]">{inv.totalStock} units</td>
                      <td colSpan={2}></td>
                      <td className="px-6 py-3 text-sm font-bold text-[#1e293b]">{formatCurrency(inv.totalValue)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Overall Summary */}
      {cityInventory.length > 1 && (
        <div className="mt-6 rounded-lg p-6 text-white" style={{ background: 'linear-gradient(to right, #1e293b, #334155)' }}>
          <h3 className="text-lg font-bold mb-4">Overall Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-white/80">Total Cities</p>
              <p className="text-2xl font-bold">{cityInventory.length}</p>
            </div>
            <div>
              <p className="text-sm text-white/80">Total Stock</p>
              <p className="text-2xl font-bold">{overallTotals.totalStock} units</p>
            </div>
            <div>
              <p className="text-sm text-white/80">Total Inventory Value</p>
              <p className="text-2xl font-bold">{formatCurrency(overallTotals.totalValue)}</p>
            </div>
          </div>
        </div>
      )}

      {/* View Product Details Modal */}
      {viewProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold">Product Details</h3>
              <button onClick={() => setViewProduct(null)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="text-white rounded-lg p-6" style={{ background: 'linear-gradient(to right, #1e293b, #334155)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-2xl font-bold">{viewProduct.brandName} {viewProduct.modelName}</h4>
                    <p className="text-sm opacity-90 mt-1">{viewProduct.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-90">Total Stock</p>
                    <p className="text-3xl font-bold">{viewProduct.serialNumbers.length} units</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h5 className="font-semibold text-gray-900 mb-3">Pricing Information</h5>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cost Price:</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(viewProduct.costPrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Sell Price:</span>
                      <span className="font-semibold text-green-600">{formatCurrency(viewProduct.sellPrice)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-600">Profit Margin:</span>
                      <span className={`font-semibold ${viewProduct.sellPrice > viewProduct.costPrice ? 'text-green-600' : 'text-red-600'}`}>
                        {viewProduct.costPrice > 0 ? (((viewProduct.sellPrice - viewProduct.costPrice) / viewProduct.costPrice) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h5 className="font-semibold text-gray-900 mb-3">Stock Information</h5>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Serial Numbers:</span>
                      <span className="font-semibold text-gray-900">{viewProduct.serialNumbers.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Value:</span>
                      <span className="font-semibold text-[#1e293b]">{formatCurrency(viewProduct.serialNumbers.length * viewProduct.costPrice)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 mb-4">Serial Numbers by City</h5>
                <div className="space-y-4">
                  {(() => {
                    const productCities = Array.from(
                      new Set(Object.values(viewProduct.serialCities || {}).map(c => String(c).trim()).filter(Boolean))
                    );
                    const ordered = [
                      ...CITIES.filter(c => productCities.includes(c)),
                      ...productCities.filter(c => !CITIES.includes(c)).sort(),
                    ];
                    return ordered;
                  })().map(city => {
                    const citySerials = viewProduct.serialNumbers.filter(serial => {
                      const status = (viewProduct.serialStatus || {})[serial] || 'Available';
                      return (viewProduct.serialCities || {})[serial] === city && status !== 'In Transit';
                    });
                    const available = citySerials.filter(s => ((viewProduct.serialStatus || {})[s] || 'Available') === 'Available');
                    const returned = citySerials.filter(s => (viewProduct.serialStatus || {})[s] === 'Returned');
                    const damaged = citySerials.filter(s => (viewProduct.serialStatus || {})[s] === 'Damaged');
                    const inTransit = viewProduct.serialNumbers.filter(s => (viewProduct.serialStatus || {})[s] === 'In Transit');
                    if (citySerials.length === 0 && inTransit.length === 0) return null;
                    return (
                      <div key={city} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h6 className="font-medium text-gray-900 flex items-center gap-2">
                            <MapPin size={16} className="text-gray-500" />{city}
                          </h6>
                          <span className="text-sm text-gray-600">{citySerials.length} units in city</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div className="text-center"><p className="text-xs text-gray-500">Available</p><p className="text-lg font-semibold text-green-600">{available.length}</p></div>
                          <div className="text-center"><p className="text-xs text-gray-500">Returned</p><p className="text-lg font-semibold text-blue-600">{returned.length}</p></div>
                          <div className="text-center"><p className="text-xs text-gray-500">Damaged</p><p className="text-lg font-semibold text-red-600">{damaged.length}</p></div>
                          <div className="text-center"><p className="text-xs text-gray-500">In Transit</p><p className="text-lg font-semibold text-orange-600">{inTransit.length}</p></div>
                        </div>
                        {citySerials.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Serial Numbers:</p>
                            <div className="flex flex-wrap gap-2">
                              {citySerials.map(serial => {
                                const status = (viewProduct.serialStatus || {})[serial] || 'Available';
                                const statusColor = { 'Available': 'bg-green-100 text-green-800', 'Returned': 'bg-blue-100 text-blue-800', 'Damaged': 'bg-red-100 text-red-800', 'In Transit': 'bg-orange-100 text-orange-800' }[status] || 'bg-gray-100 text-gray-800';
                                return <span key={serial} className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${statusColor}`}>{serial}</span>;
                              })}
                            </div>
                          </div>
                        )}
                        {inTransit.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-sm font-medium text-orange-700 mb-2">In Transit Serial Numbers:</p>
                            <div className="flex flex-wrap gap-2">
                              {inTransit.map(serial => (
                                <span key={serial} className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">{serial}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {viewProduct.description && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h5 className="font-semibold text-gray-900 mb-2">Description</h5>
                  <p className="text-gray-700">{viewProduct.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}