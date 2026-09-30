// Inventory Module - Component
// MultiModelInventoryTable - Table for displaying and editing selected models with sale prices

import React from 'react';
import { Plus, Trash2, Edit3 } from 'lucide-react';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

interface MultiModelRow {
  modelId: string;
  modelName: string;
  costPrice: number;
  salePrice: number;
  quantity: number;
}

interface MultiModelInventoryTableProps {
  models: MultiModelRow[];
  onUpdateModel: (index: number, field: 'salePrice' | 'quantity', value: number) => void;
  onAddModel: () => void;
  onRemoveModel: (index: number) => void;
  onEditModel: (index: number) => void;
}

export const MultiModelInventoryTable: React.FC<MultiModelInventoryTableProps> = ({
  models, onUpdateModel, onAddModel, onRemoveModel, onEditModel,
}) => {
  // Follows the Admin's global currency setting — symbol-only, no conversion.
  const { symbol: currencySymbol } = useGlobalCurrency();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold text-gray-900">Selected Models</h4>
        <button onClick={onAddModel}
          className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          <Plus className="h-4 w-4" /> Add Model
        </button>
      </div>

      {models.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No models selected. Add models using the brand/model dropdown above.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-semibold text-gray-900 w-48">Model</th>
                <th className="text-right p-3 font-semibold text-gray-900">DC Cost ({currencySymbol})</th>
                <th className="text-right p-3 font-semibold text-gray-900">Sale Price</th>
                <th className="text-right p-3 font-semibold text-gray-900">Qty</th>
                <th className="text-right p-3 font-semibold text-gray-900 w-24">Total Sale</th>
                <th className="w-16 p-3"></th>
              </tr>
            </thead>
            <tbody>
              {models.map((model, index) => (
                <tr key={model.modelId} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="p-3 font-medium">{model.modelName}</td>
                  <td className="p-3 text-right">
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                      {currencySymbol} {model.costPrice.toLocaleString()}
                    </span>
                  </td>
                  <td className="p-3">
                    <input type="number" value={model.salePrice}
                      onChange={e => onUpdateModel(index, 'salePrice', parseFloat(e.target.value) || 0)}
                      min="0" step="0.01"
                      className="w-24 text-right border rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </td>
                  <td className="p-3">
                    <input type="number" value={model.quantity}
                      onChange={e => onUpdateModel(index, 'quantity', parseInt(e.target.value) || 0)}
                      min="1"
                      className="w-20 text-right border rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </td>
                  <td className="p-3 text-right font-semibold text-lg text-green-600">
                    {currencySymbol} {(model.salePrice * model.quantity).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => onEditModel(index)} title="Edit"
                        className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button onClick={() => onRemoveModel(index)} title="Remove"
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-bold bg-gray-50">
                <td colSpan={4} className="p-3 text-right">Grand Total:</td>
                <td className="p-3 text-right text-2xl text-green-700">
                  {currencySymbol} {models.reduce((sum, m) => sum + m.salePrice * m.quantity, 0).toLocaleString()}
                </td>
                <td className="p-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};