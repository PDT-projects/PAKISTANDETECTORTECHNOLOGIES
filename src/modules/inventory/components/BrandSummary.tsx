// Inventory Module - Component
// BrandSummary - Footer component showing total calculations for multi-model costing

import React from 'react';
import { DollarSign, TrendingUp, Shield, Truck, Calculator } from 'lucide-react';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';

interface BrandSummaryProps {
  totalUnitCostUSD: number;
  shipmentTotalUSD: number;
  consignmentValue: number;
  totalValueOfBrand: number;
  totalCustomsValue: number;
  totalFreightValue: number;
}

export function BrandSummary({ totalUnitCostUSD, shipmentTotalUSD, consignmentValue, totalValueOfBrand, totalCustomsValue, totalFreightValue }: BrandSummaryProps) {
  const fmt = (v: number) => v.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Unit Cost / Shipment Total are genuinely USD — the shipment's own invoice
  // currency, not the local display currency, so those two keep the $ sign
  // regardless of what the Admin has picked for everything else.
  const sym = getGlobalCurrencySymbol();

  return (
    <div style={{ backgroundColor: '#eff6ff', padding: 24, borderRadius: 12, border: '2px solid #3b82f6', marginTop: 24, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Calculator style={{ width: 20, height: 20, color: '#2563eb' }} />
        <h3 style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', margin: 0 }}>Brand Summary</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 16 }}>
        {[
          { icon: DollarSign, color: '#0891b2', label: 'Total Unit Cost (USD)', value: `$${fmt(totalUnitCostUSD)}` },
          { icon: DollarSign, color: '#16a34a', label: 'Shipment Total (USD)', value: `$${fmt(shipmentTotalUSD)}` },
          { icon: TrendingUp, color: '#2563eb', label: `Consignment Value (${sym})`, value: `${sym} ${fmt(consignmentValue)}` },
          { icon: Shield, color: '#ea580c', label: `Total Customs (${sym})`, value: `${sym} ${fmt(totalCustomsValue)}` },
          { icon: Truck, color: '#9333ea', label: `Total Freight (${sym})`, value: `${sym} ${fmt(totalFreightValue)}` },
        ].map(({ icon: Icon, color, label, value }) => (
          <div key={label} style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon style={{ width: 16, height: 16, color }} />
              <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, margin: 0 }}>{label}</p>
            </div>
            <p style={{ fontSize: 24, fontWeight: 'bold', color: '#111827', margin: 0 }}>{value}</p>
          </div>
        ))}
        <div style={{ backgroundColor: '#1d4ed8', padding: 20, borderRadius: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.15)', color: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Calculator style={{ width: 16, height: 16, color: '#bfdbfe' }} />
            <p style={{ fontSize: 14, color: '#bfdbfe', fontWeight: 600, margin: 0 }}>Total Brand Value ({sym})</p>
          </div>
          <p style={{ fontSize: 28, fontWeight: 'bold', color: 'white', margin: 0 }}>{sym} {fmt(totalValueOfBrand)}</p>
        </div>
      </div>
      <div style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 14 }}>
          <span><span style={{ color: '#6b7280', fontWeight: 500 }}>Exchange Impact: </span><strong>{sym} {fmt(consignmentValue - shipmentTotalUSD)}</strong></span>
          <span><span style={{ color: '#6b7280', fontWeight: 500 }}>Total Additional Costs: </span><strong>{sym} {fmt(totalCustomsValue + totalFreightValue)}</strong></span>
          <span><span style={{ color: '#6b7280', fontWeight: 500 }}>Final Landed Value: </span><strong style={{ color: '#16a34a' }}>{sym} {fmt(totalValueOfBrand)}</strong></span>
        </div>
      </div>
    </div>
  );
}