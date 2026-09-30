// Inventory Module - Component
// AddCostingDialog - Modal for linking existing inventory to brand/model costing

import { useState } from 'react';
import { X } from 'lucide-react';
import { BrandModelSelector } from './BrandModelSelector';

interface AddCostingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { brandId: string; brandName: string; modelId: string; modelName: string }) => void;
  productName: string;
}

export function AddCostingDialog({ isOpen, onClose, onSave, productName }: AddCostingDialogProps) {
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedBrandName, setSelectedBrandName] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedModelName, setSelectedModelName] = useState('');

  if (!isOpen) return null;

  const handleSave = () => {
    if (selectedBrandId && selectedModelId) {
      onSave({ brandId: selectedBrandId, brandName: selectedBrandName, modelId: selectedModelId, modelName: selectedModelName });
      setSelectedBrandId(''); setSelectedBrandName(''); setSelectedModelId(''); setSelectedModelName('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Add Costing</h3>
              <p className="text-sm text-gray-500 mt-1">Link to an existing brand and model</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={20} className="text-gray-500" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-700"><span className="font-medium">Product:</span> {productName}</p>
            </div>
            <p className="text-sm text-gray-600">
              Select a brand and model that has existing costing. This will link your inventory item to the selected model's pricing.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Brand & Model *</label>
              <BrandModelSelector
                onBrandChange={(id, name) => { setSelectedBrandId(id); setSelectedBrandName(name); setSelectedModelId(''); setSelectedModelName(''); }}
                onModelChange={(id, name) => { setSelectedModelId(id); setSelectedModelName(name); }}
              />
            </div>
            {selectedModelId && (
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-sm text-green-700"><span className="font-medium">Selected:</span> {selectedBrandName} — {selectedModelName}</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!selectedBrandId || !selectedModelId}
              className="px-4 py-2 bg-[#4f46e5] text-white rounded-lg hover:bg-[#4338ca] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Link Costing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}