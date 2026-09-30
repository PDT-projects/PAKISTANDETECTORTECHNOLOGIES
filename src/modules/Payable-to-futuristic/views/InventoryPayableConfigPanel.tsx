// views/InventoryPayableConfigPanel.tsx
// Panel embedded inside PayableToFuturisticView (second tab).
// Lets users pick an inventory item and set its fixed AED payable amount.
// When an invoice is created with that product, the amount auto-appears
// in the Payable to Futuristic module.
//
// UPDATED: Amount can be entered in AED or USD. The stored value is always
//          AED (converted at 1 USD = 3.67 AED). Both currencies are shown
//          in the configs table.

import React from 'react';
import {
  Settings, Plus, Trash2, Loader2, AlertCircle,
  CheckCircle2, Package, ChevronRight, DollarSign, Layers,
} from 'lucide-react';
import { useInventoryPayableConfigViewModel } from '../viewModels/useInventoryPayableConfigViewModel';
import { aedToAllCurrencies } from '../models/payableToFuturistic';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';

const USD_TO_AED = 3.67;

const S = {
  charcoal: { backgroundColor: '#1e293b', color: '#ffffff' } as React.CSSProperties,
};

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const InventoryPayableConfigPanel: React.FC = () => {
  const {
    products, productsLoading,
    configs, configsLoading, configsError,
    selectedProductId, inputCurrency, inputAmount, notes,
    setSelectedProductId, setInputCurrency, setInputAmount, setNotes,
    useSlabs, setUseSlabs, slabs, addSlab, updateSlab, removeSlab,
    previewAed,
    submitConfig, deleteConfig,
    actionLoading, actionError, successMessage,
  } = useInventoryPayableConfigViewModel();

  const previewAmounts = previewAed !== null ? aedToAllCurrencies(previewAed) : null;
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div style={{ ...S.charcoal, padding: 10, borderRadius: 12 }}>
          <Settings size={18} color="#fff" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-800">Configure Inventory Payables</h2>
          <p className="text-xs text-gray-500">
            Set a fixed amount per inventory item. When an invoice is created with that
            item, the amount is automatically added to this payable module.
          </p>
        </div>
      </div>

      {/* ── Add / Edit Form ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Add / Update Configuration
        </p>

        {/* Inventory dropdown */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            Inventory Item <span className="text-red-400">*</span>
          </label>
          {productsLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
              <Loader2 size={13} className="animate-spin" /> Loading inventory…
            </div>
          ) : products.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} /> No inventory items found. Add inventory first.
            </div>
          ) : (
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
            >
              <option value="">— Select inventory item —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brandName} {p.modelName}
                  {p.location ? ` · ${p.location}` : ''}
                  {p.stock > 0 ? ` (${p.stock} in stock)` : ''}
                </option>
              ))}
            </select>
          )}
          {selectedProduct && (
            <div className="mt-2 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
              <Package size={12} />
              <span>
                <strong>{selectedProduct.brandName} {selectedProduct.modelName}</strong>
                {selectedProduct.location && <> · {selectedProduct.location}</>}
                {' '}&mdash; Status: {selectedProduct.status}
                {' '}&mdash; <code className="text-[10px] bg-blue-100 px-1 rounded">ID: {selectedProduct.id}</code>
              </span>
            </div>
          )}
        </div>

        {/* Pricing mode toggle: flat vs price-based slabs */}
        <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-gray-500" />
            <div>
              <p className="text-xs font-semibold text-gray-700">Price-based slabs</p>
              <p className="text-[11px] text-gray-400">
                Set different payable amounts by invoice sale price instead of one flat amount.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={useSlabs}
            onClick={() => setUseSlabs(!useSlabs)}
            className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
            style={{ backgroundColor: useSlabs ? '#1e293b' : '#cbd5e1' }}
          >
            <span
              className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              style={{ transform: useSlabs ? 'translateX(24px)' : 'translateX(4px)' }}
            />
          </button>
        </div>

        {/* Currency toggle + amount */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
            {useSlabs ? 'Fallback Amount (optional)' : <>Fixed Amount <span className="text-red-400">*</span></>}
          </label>
          {useSlabs && (
            <p className="text-[11px] text-gray-400 mb-2">
              Used only when an invoice's sale price matches none of the slabs below. Leave blank to skip those sales.
            </p>
          )}

          {/* Currency toggle pills */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500">Enter in:</span>
            <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-lg">
              {(['AED', 'USD'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setInputCurrency(c); setInputAmount(''); }}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all"
                  style={
                    inputCurrency === c
                      ? { backgroundColor: '#1e293b', color: '#fff' }
                      : { backgroundColor: 'transparent', color: '#64748b' }
                  }
                >
                  {c}
                </button>
              ))}
            </div>
            {inputCurrency === 'USD' && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <DollarSign size={11} />
                1 USD = {USD_TO_AED} AED
              </span>
            )}
          </div>

          {/* Amount input */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
              {inputCurrency === 'USD' ? '$' : 'AED'}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder=""
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              className="w-full border border-gray-200 rounded-xl pl-12 pr-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
            />
          </div>

          {/* Preview strip */}
          {previewAmounts && (
            <div className="mt-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-slate-600">
                Will be stored as:{' '}
                <span className="text-slate-900">AED {fmt(previewAmounts.aed)}</span>
              </p>
              <div className="flex gap-2 flex-wrap">
                {inputCurrency === 'AED' && (
                  <span className="text-xs text-slate-500">
                    ≈ <strong>${fmt(previewAmounts.usd)}</strong> USD
                  </span>
                )}
                {inputCurrency === 'USD' && (
                  <span className="text-xs text-slate-500">
                    = <strong>AED {fmt(previewAmounts.aed)}</strong>
                  </span>
                )}
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded px-2 py-0.5">AED {fmt(previewAmounts.aed)}</span>
                <span className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded px-2 py-0.5">SAR {fmt(previewAmounts.sar)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Slab editor */}
        {useSlabs && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <Layers size={12} /> Sale Price Slabs ({getGlobalCurrencySymbol()})
              </span>
              <button
                type="button"
                onClick={addSlab}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition"
              >
                <Plus size={11} /> Add slab
              </button>
            </div>

            {slabs.length === 0 ? (
              <div className="px-3 py-5 text-center text-xs text-gray-400">
                No slabs yet. Add a band like “sale price 0–1000 → AED 100”.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {/* header row */}
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 py-1.5 bg-white">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Sale price from</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Sale price to</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Payable ({getGlobalCurrencySymbol()})</span>
                  <span className="w-6" />
                </div>
                {slabs.map((slab, i) => {
                  const openEnded = slab.maxSalePrice === null;
                  return (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 py-2 items-center">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={slab.minSalePrice}
                        onChange={(e) => updateSlab(i, { minSalePrice: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={openEnded}
                          placeholder={openEnded ? '∞' : ''}
                          value={openEnded || slab.maxSalePrice == null ? '' : slab.maxSalePrice}
                          onChange={(e) => updateSlab(i, { maxSalePrice: parseFloat(e.target.value) || 0 })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition disabled:bg-gray-50 disabled:text-gray-400"
                        />
                        <button
                          type="button"
                          title={openEnded ? 'Set an upper limit' : 'Make open-ended (and above)'}
                          onClick={() => updateSlab(i, { maxSalePrice: openEnded ? slab.minSalePrice : null })}
                          className="text-[10px] px-1.5 py-1 rounded border transition flex-shrink-0"
                          style={openEnded
                            ? { backgroundColor: '#1e293b', color: '#fff', borderColor: '#1e293b' }
                            : { backgroundColor: '#fff', color: '#64748b', borderColor: '#e5e7eb' }}
                        >
                          ∞
                        </button>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={slab.payableAmountAed}
                        onChange={(e) => updateSlab(i, { payableAmountAed: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
                      />
                      <button
                        type="button"
                        onClick={() => removeSlab(i)}
                        className="text-red-500 hover:text-red-700 transition p-1"
                        title="Remove slab"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50 border-t border-gray-100">
              Toggle <span className="font-semibold">∞</span> on the last slab for an open-ended “and above” band. Bands must not overlap.
            </p>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Notes (optional)</label>
          <input
            type="text"
            placeholder="e.g. Half of fixed cost per unit"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
          />
        </div>

        {/* Feedback */}
        {actionError && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={13} /> {actionError}
          </div>
        )}
        {successMessage && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <CheckCircle2 size={13} /> {successMessage}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={submitConfig}
          disabled={actionLoading}
          style={S.charcoal}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-60"
        >
          {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Save Configuration
        </button>
      </div>

      {/* ── Existing Configs Table ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Configured Items ({configs.length})
          </span>
          <span className="text-xs text-gray-400">
            Auto-triggers on invoice creation
          </span>
        </div>

        {configsLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : configsError ? (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 m-4 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={13} /> {configsError}
          </div>
        ) : configs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Settings size={36} className="mb-3 opacity-20" />
            <p className="text-sm font-medium text-gray-500">No configurations yet</p>
            <p className="text-xs text-gray-400 mt-1">Add one above to enable auto-payables on invoicing.</p>
          </div>
        ) : (
          <LockedScrollTable maxHeight="65vh">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Inventory Item</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product ID</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount ({getGlobalCurrencySymbol()})</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Entered As</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Equiv. USD</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {configs.map((cfg) => {
                  const equiv = aedToAllCurrencies(cfg.fixedAmountAed);
                  return (
                    <tr key={cfg.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Package size={13} className="text-gray-400 flex-shrink-0" />
                          <div>
                            <span className="text-sm font-medium text-gray-800">{cfg.productName}</span>
                            <p className="text-xs text-gray-400">{cfg.brandName} · {cfg.modelName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{cfg.productId}</code>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cfg.slabs && cfg.slabs.length > 0 ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded px-2 py-0.5">
                              <Layers size={10} /> {cfg.slabs.length} slab{cfg.slabs.length !== 1 ? 's' : ''}
                            </span>
                            {cfg.slabs.map((s, i) => (
                              <span key={i} className="text-[10px] text-gray-500 whitespace-nowrap">
                                {fmt(s.minSalePrice)}–{s.maxSalePrice == null ? '∞' : fmt(s.maxSalePrice)} → AED {fmt(s.payableAmountAed)}
                              </span>
                            ))}
                            {cfg.fixedAmountAed > 0 && (
                              <span className="text-[10px] text-gray-400">fallback AED {fmt(cfg.fixedAmountAed)}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm font-bold text-gray-800">AED {fmt(cfg.fixedAmountAed)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {/* Show what the user originally typed */}
                        {cfg.inputCurrency === 'USD' ? (
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded px-2 py-0.5">
                            ${fmt(cfg.inputAmount)} USD
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">AED</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-gray-500">${fmt(equiv.usd)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500">{cfg.notes || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => deleteConfig(cfg.id)}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition text-red-600 border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 size={11} /> Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </LockedScrollTable>
        )}
      </div>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <details className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden group">
        <summary className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors list-none flex items-center gap-2 select-none">
          <ChevronRight size={13} className="group-open:rotate-90 transition-transform" />
          How auto-payables work
        </summary>
        <div className="px-5 pb-4 pt-2 space-y-2 text-xs text-gray-500 leading-relaxed">
          <p>
            <strong className="text-gray-700">1. Configure:</strong> Select an inventory item and set its fixed payable amount (AED or USD — always stored as AED).
          </p>
          <p>
            <strong className="text-gray-700">2. Invoice:</strong> When any invoice is created that includes this inventory item, the system automatically records the fixed AED amount as a payable entry.
          </p>
          <p>
            <strong className="text-gray-700">3. Track:</strong> The entry appears in the <strong className="text-gray-700">Invoices &amp; Payables</strong> tab, linked to the invoice number, with pending status.
          </p>
          <p>
            <strong className="text-gray-700">4. Pay:</strong> Use the <em>Pay</em> button on any entry to record full or partial payment via Bank or Cash — the account balance is automatically deducted.
          </p>
          <p className="text-gray-400 italic">
            Updating or removing a config only affects future invoices — existing payable entries are not changed.
          </p>
        </div>
      </details>

    </div>
  );
};