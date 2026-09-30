// Inventory Module - Component
// CostingTable - Dynamic table for managing multiple models in multi-model costing

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { LockedScrollTable } from '../../../shared/components/LockedScrollTable';
import { CostingModel } from '../models/types';
import { getGlobalCurrencySymbol } from '../../../shared/currency/globalCurrency';

interface CostingTableProps {
  models: CostingModel[];
  onAddModel: () => void;
  onUpdateModelField: (modelId: string, field: keyof CostingModel, value: string | number) => void;
  onRemoveModel: (modelId: string) => void;
}

export function CostingTable({ models, onAddModel, onUpdateModelField, onRemoveModel }: CostingTableProps) {
  const fmt = (n?: number) =>
    (n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // percentage is stored as 0–1 ratio (e.g. 0.347826) and displayed as-is with 6 decimal places.
  // Do NOT multiply by 100 — it is NOT a percentage in the classic sense.
  const fmtPct = (n?: number) =>
    (n ?? 0).toLocaleString('en-PK', { minimumFractionDigits: 6, maximumFractionDigits: 6 });

  const HEADERS = [
    'Model Name',
    'Units',
    'Unit Cost (USD)',
    'Total (USD)',
    'Percentage',
    'Custom/Model',
    'Custom/Unit',
    'Freight/Model',
    'Freight/Unit',
    `Cost (${getGlobalCurrencySymbol()})`,
    'Total Unit Cost',
    'Inventory Value',
    'Actions',
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header row */}
      <div
        style={{
          backgroundColor: '#fef3c7',
          padding: 16,
          borderRadius: 8,
          border: '2px solid #f59e0b',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ fontSize: 20, fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
          Model Costing Details
        </h3>
        <button
          type="button"
          onClick={onAddModel}
          style={{
            backgroundColor: '#2563eb',
            color: 'white',
            fontWeight: 'bold',
            fontSize: 18,
            padding: '16px 32px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus size={28} /> Add Model
        </button>
      </div>

      {models.length === 0 ? (
        <div
          style={{
            backgroundColor: '#f9fafb',
            padding: 32,
            textAlign: 'center',
            borderRadius: 8,
            border: '2px dashed #d1d5db',
          }}
        >
          <p style={{ color: '#6b7280', marginBottom: 8, fontSize: 16 }}>No models added yet</p>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>Click "Add Model" to add your first model</p>
        </div>
      ) : (
        <LockedScrollTable maxHeight="500px">
          <table
            style={{ width: '100%', minWidth: 1800, borderCollapse: 'collapse', fontSize: 14 }}
          >
            <thead>
              <tr>
                {HEADERS.map((h, i) => (
                  <th
                    key={h}
                    style={{
                      backgroundColor: i === 11 ? '#dbeafe' : '#e5e7eb',
                      padding: '12px 16px',
                      textAlign: i >= 1 && i <= 11 ? 'right' : 'left',
                      fontWeight: 'bold',
                      border: '1px solid #d1d5db',
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      minWidth: i === 0 ? 200 : i === 12 ? 120 : 140,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((model, idx) => (
                <tr key={model.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                  {/* Model Name */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db' }}>
                    <input
                      type="text"
                      value={model.modelName}
                      onChange={e => onUpdateModelField(model.id, 'modelName', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                      }}
                      placeholder="Enter model name"
                    />
                  </td>

                  {/* Units */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db', textAlign: 'right' }}>
                    <input
                      type="number"
                      value={model.units || ''}
                      onChange={e => onUpdateModelField(model.id, 'units', Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        textAlign: 'right',
                      }}
                      placeholder="0"
                      min={1}
                    />
                  </td>

                  {/* Unit Cost USD */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db', textAlign: 'right' }}>
                    <input
                      type="number"
                      value={model.unitCostUSD || ''}
                      onChange={e => onUpdateModelField(model.id, 'unitCostUSD', Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        textAlign: 'right',
                      }}
                      placeholder="0.00"
                      min={0}
                      step="0.01"
                    />
                  </td>

                  {/* Total USD — calculated */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db', textAlign: 'right', fontWeight: 600 }}>
                    ${fmt(model.totalCostUSD)}
                  </td>

                  {/* Percentage — stored as 0–1 ratio, displayed as-is (e.g. 0.347826) */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db', textAlign: 'right' }}>
                    {fmtPct(model.percentage)}
                  </td>

                  {/* Custom / Model */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db', textAlign: 'right' }}>
                    {fmt(model.customPerModel)}
                  </td>

                  {/* Custom / Unit */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db', textAlign: 'right' }}>
                    {fmt(model.customPerUnit)}
                  </td>

                  {/* Freight / Model */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db', textAlign: 'right' }}>
                    {fmt(model.freightPerModel)}
                  </td>

                  {/* Freight / Unit */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db', textAlign: 'right' }}>
                    {fmt(model.freightPerUnit)}
                  </td>

                  {/* Cost — follows the Admin's global currency setting */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db', textAlign: 'right', fontWeight: 500 }}>
                    {getGlobalCurrencySymbol()} {fmt(model.unitCostPKR)}
                  </td>

                  {/* Total Unit Cost */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db', textAlign: 'right', fontWeight: 'bold' }}>
                    {getGlobalCurrencySymbol()} {fmt(model.totalLandedUnitCost)}
                  </td>

                  {/* Inventory Value */}
                  <td
                    style={{
                      padding: '12px 16px',
                      border: '1px solid #d1d5db',
                      textAlign: 'right',
                      fontWeight: 'bold',
                      color: '#1d4ed8',
                      backgroundColor: '#eff6ff',
                    }}
                  >
                    {getGlobalCurrencySymbol()} {fmt(model.totalShipmentValuePKR)}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 16px', border: '1px solid #d1d5db', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => onRemoveModel(model.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '8px 16px',
                        backgroundColor: '#fee2e2',
                        color: '#dc2626',
                        borderRadius: 6,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      <Trash2 size={16} /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Summary footer row showing percentage sum = 1 */}
            {models.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: '#f0fdf4', fontWeight: 'bold' }}>
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db' }}>Total</td>
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db', textAlign: 'right' }}>
                    {models.reduce((s, m) => s + m.units, 0).toLocaleString('en-PK')}
                  </td>
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db' }} />
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db', textAlign: 'right' }}>
                    ${fmt(models.reduce((s, m) => s + m.totalCostUSD, 0))}
                  </td>
                  {/* Percentage sum — always 1.000000 */}
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db', textAlign: 'right', color: '#16a34a' }}>
                    {fmtPct(models.reduce((s, m) => s + m.percentage, 0))}
                  </td>
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db', textAlign: 'right' }}>
                    {fmt(models.reduce((s, m) => s + m.customPerModel, 0))}
                  </td>
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db' }} />
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db', textAlign: 'right' }}>
                    {fmt(models.reduce((s, m) => s + m.freightPerModel, 0))}
                  </td>
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db' }} />
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db' }} />
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db' }} />
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db', textAlign: 'right', color: '#1d4ed8' }}>
                    {getGlobalCurrencySymbol()} {fmt(models.reduce((s, m) => s + m.totalShipmentValuePKR, 0))}
                  </td>
                  <td style={{ padding: '10px 16px', border: '1px solid #d1d5db' }} />
                </tr>
              </tfoot>
            )}
          </table>
        </LockedScrollTable>
      )}

      {models.length > 0 && (
        <div
          style={{
            marginTop: 16,
            display: 'flex',
            justifyContent: 'space-between',
            color: '#6b7280',
            fontSize: 14,
          }}
        >
          <p>Total Models: {models.length}</p>
          <p>💡 Use horizontal scroll to view all columns</p>
        </div>
      )}
    </div>
  );
}