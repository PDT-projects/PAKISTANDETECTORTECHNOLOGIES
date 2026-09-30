// Inventory Module - View Layer
// InventoryCostingDetailsView - Step 3: Costing Details

import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Calculator, Check } from 'lucide-react';
import { UseInventoryCostingDetailsViewModelReturn } from '../viewModels/useInventoryCostingDetailsViewModel';
import { CostingGlobalInputs } from '../components/CostingGlobalInputs';
import { CostingTable } from '../components/CostingTable';
import { BrandSummary } from '../components/BrandSummary';
import { useGlobalCurrency } from '../../../shared/currency/useGlobalCurrency';

interface InventoryCostingDetailsViewProps extends UseInventoryCostingDetailsViewModelReturn {}

const STEPS = [
  { number: 1, label: 'Type' },
  { number: 2, label: 'Costing' },
  { number: 3, label: 'Details' },
  { number: 4, label: 'Products' },
  { number: 5, label: 'Payment' },
];

const Stepper = ({ current }: { current: number }) => (
  <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 32px' }}>
    <div style={{ display: 'flex', alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
      {STEPS.map((step, i) => {
        const active = step.number === current;
        const done   = step.number < current;
        const last   = i === STEPS.length - 1;
        return (
          <React.Fragment key={step.number}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13, flexShrink: 0,
                backgroundColor: done || active ? '#0f172a' : '#e5e7eb',
                color: done || active ? '#fff' : '#9ca3af',
                boxShadow: active ? '0 0 0 4px rgba(15,23,42,0.12)' : 'none',
              }}>
                {done ? <Check size={14} strokeWidth={3} /> : step.number}
              </div>
              <span style={{ marginTop: 5, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: done || active ? '#0f172a' : '#94a3b8', whiteSpace: 'nowrap' }}>
                {step.label}
              </span>
            </div>
            {!last && (
              <div style={{ flex: 1, height: 2, borderRadius: 99, margin: '0 6px', marginBottom: 20, backgroundColor: done ? '#0f172a' : '#e5e7eb', transition: 'background-color 0.3s' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

export const InventoryCostingDetailsView: React.FC<InventoryCostingDetailsViewProps> = ({
  costingInfo, costingOption, inventoryType, validationErrors, isValid, isSaving, saveError,
  setCostingBrandName, setUsdRate, setTotalCustomsValue, setTotalFreightValue,
  addModel, updateModelField, removeModel, handleNext, handleBack,
  showCostingFields, costingSummary,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Subscribed purely so this whole step (Global Inputs, the Costing Table and
  // the Brand Summary footer) re-renders the instant the Admin changes the
  // global currency — those children read getGlobalCurrencySymbol() directly
  // and always have the live value, but without this the step wouldn't repaint
  // until something else triggered a re-render.
  useGlobalCurrency();

  useEffect(() => {
    if (!showCostingFields) {
      const type = searchParams.get('type') || 'payment';
      navigate(`/inventory/create-new/details?type=${type}&costing=without`, { replace: true });
    }
  }, [showCostingFields, navigate, searchParams]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Calculator size={17} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Costing Details</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Enter costing information for your products</div>
          </div>
        </div>
      </div>

      <Stepper current={3} />

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>

          <div style={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
              <Calculator size={18} color="#7c3aed" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Multi-Model Costing Information</span>
            </div>

            <CostingGlobalInputs
              brandName={costingInfo?.brandName || ''}
              usdRate={costingInfo?.usdRate || 0}
              totalCustomsValue={costingInfo?.totalCustomsValue || 0}
              totalFreightValue={costingInfo?.totalFreightValue || 0}
              onBrandNameChange={setCostingBrandName}
              onUsdRateChange={setUsdRate}
              onCustomsChange={setTotalCustomsValue}
              onFreightChange={setTotalFreightValue}
            />
            <CostingTable
              models={costingInfo?.models || []}
              onAddModel={addModel}
              onUpdateModelField={updateModelField}
              onRemoveModel={removeModel}
            />
            <BrandSummary
              totalUnitCostUSD={costingSummary.totalUnitCostUSD}
              shipmentTotalUSD={costingSummary.shipmentTotalUSD}
              consignmentValue={costingSummary.consignmentValue}
              totalValueOfBrand={costingSummary.totalValueOfBrand}
              totalCustomsValue={costingInfo?.totalCustomsValue || 0}
              totalFreightValue={costingInfo?.totalFreightValue || 0}
            />

            {validationErrors.models && (
              <p style={{ color: '#ef4444', fontSize: 12, marginTop: 10 }}>{validationErrors.models}</p>
            )}
            {saveError && (
              <div style={{ marginTop: 14, padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                <p style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{saveError}</p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
            <button onClick={handleBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
              <ArrowLeft size={16} /> Back
            </button>
            <button
              onClick={handleNext}
              disabled={isSaving || !isValid}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 8, border: 'none',
                backgroundColor: isSaving || !isValid ? '#e5e7eb' : '#0f172a',
                color: isSaving || !isValid ? '#9ca3af' : '#fff',
                fontWeight: 700, fontSize: 13, cursor: isSaving || !isValid ? 'not-allowed' : 'pointer',
                boxShadow: isValid ? '0 2px 8px rgba(15,23,42,0.20)' : 'none',
              }}
            >
              {isSaving
                ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Saving...</>
                : <>Next: Product Details <ArrowRight size={16} /></>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};