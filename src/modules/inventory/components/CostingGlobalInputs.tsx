// Inventory Module - Component
// CostingGlobalInputs - Global input fields for multi-model costing
// UPDATED: Brand field is now a Firestore-backed dropdown (brand only).
//          No model selector here — models are added by the user in the costing table.

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';

interface CostingGlobalInputsProps {
  brandName: string;
  usdRate: number;
  totalCustomsValue: number;
  totalFreightValue: number;
  onBrandNameChange: (value: string) => void;
  onUsdRateChange: (value: number) => void;
  onCustomsChange: (value: number) => void;
  onFreightChange: (value: number) => void;
}

// Known brands as fallback / supplement
const KNOWN_BRANDS = [
  'AKAAS DETECTORS', 'Andralian', 'Black Dog Xtreme', 'Bounty Hunter VLF',
  'China', 'DHFHJ', 'Detector', 'Detek', 'EKibi', 'Fisher', 'GEO',
  'GROGROUND', 'GOLD XTRA', 'GTR TURKEY', 'Garrett', 'Gold Star',
  'Gold Stinger X5', 'Hira Dedector', 'JOKER', 'Lorenz', 'Minelab',
  'Multimax', 'Nokta', 'Nokta Makro', 'OKM', 'OKM EXP 6000 PROFESSIONAL PLUS',
  'PMX', 'Practice', 'Quest', 'Reaper 2', 'Super Wand', 'Teknetics',
  'WHITES', 'X5 ID Maxx', 'XP',
];

export function CostingGlobalInputs({
  brandName, usdRate, totalCustomsValue, totalFreightValue,
  onBrandNameChange, onUsdRateChange, onCustomsChange, onFreightChange,
}: CostingGlobalInputsProps) {
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';
  const helpCls  = 'text-xs text-gray-500 mt-1';

  // ── Fetch brands from Firestore ──────────────────────────────────────────
  const [brands, setBrands]       = useState<string[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [addingNew, setAddingNew] = useState(false);
  const [newBrand, setNewBrand]   = useState('');

  useEffect(() => {
    getDocs(query(collection(db, 'brands'), orderBy('name')))
      .then(snap => {
        const fromDb = snap.docs.map(d => (d.data() as any).name as string).filter(Boolean);
        const merged = [...new Set([...fromDb, ...KNOWN_BRANDS])].sort();
        setBrands(merged);
      })
      .catch(() => setBrands([...KNOWN_BRANDS].sort()))
      .finally(() => setBrandsLoading(false));
  }, []);

  const applyNewBrand = () => {
    const trimmed = newBrand.trim();
    if (!trimmed) return;
    setBrands(prev => [...new Set([...prev, trimmed])].sort());
    onBrandNameChange(trimmed);
    setNewBrand('');
    setAddingNew(false);
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Global Costing Inputs</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        {/* ── Brand dropdown (brand only — no model) ── */}
        <div>
          <label className={labelCls}>Brand *</label>

          {addingNew ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus
                type="text"
                value={newBrand}
                onChange={e => setNewBrand(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') applyNewBrand();
                  if (e.key === 'Escape') { setAddingNew(false); setNewBrand(''); }
                }}
                placeholder="New brand name…"
                className="flex-1 px-3 py-2 border-2 border-indigo-400 rounded-md text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={applyNewBrand}
                disabled={!newBrand.trim()}
                className="px-3 py-2 bg-indigo-600 text-white rounded-md text-sm font-semibold disabled:opacity-50"
              >
                Use
              </button>
              <button
                type="button"
                onClick={() => { setAddingNew(false); setNewBrand(''); }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600"
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={brandName}
                onChange={e => {
                  if (e.target.value === '__add_new__') { setAddingNew(true); return; }
                  onBrandNameChange(e.target.value);
                }}
                disabled={brandsLoading}
                className={inputCls}
                style={{ flex: 1 }}
              >
                <option value="">— Select brand —</option>
                {brands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
                <option value="__add_new__">➕ Add new brand…</option>
              </select>
            </div>
          )}

          {brandName && !addingNew && (
            <p className={helpCls}>
              Selected: <strong>{brandName}</strong>
            </p>
          )}
        </div>

        {/* ── USD Rate ── */}
        <div>
          <label htmlFor="usdRate" className={labelCls}>USD Rate ({getGlobalCurrencySymbol()})</label>
          <input id="usdRate" type="number" className={inputCls}
            value={usdRate || ''} onChange={e => onUsdRateChange(Number(e.target.value))}
            placeholder="e.g., 3.67" />
          <p className={helpCls}>1 USD = ? {getGlobalCurrencySymbol()}</p>
        </div>

        {/* ── Customs Duty ── */}
        <div>
          <label htmlFor="customsValue" className={labelCls}>Total Customs Duty ({getGlobalCurrencySymbol()})</label>
          <input id="customsValue" type="number" className={inputCls}
            value={totalCustomsValue || ''} onChange={e => onCustomsChange(Number(e.target.value))}
            placeholder="e.g., 500" />
          <p className={helpCls}>Total customs duty for shipment</p>
        </div>

        {/* ── Freight Charges ── */}
        <div>
          <label htmlFor="freightValue" className={labelCls}>Total Freight Charges ({getGlobalCurrencySymbol()})</label>
          <input id="freightValue" type="number" className={inputCls}
            value={totalFreightValue || ''} onChange={e => onFreightChange(Number(e.target.value))}
            placeholder="e.g., 250" />
          <p className={helpCls}>Total freight/logistics cost</p>
        </div>

      </div>
    </div>
  );
}