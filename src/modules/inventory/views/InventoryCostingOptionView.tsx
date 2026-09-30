// Inventory Module - View Layer
// InventoryCostingOptionView - Step 2: Choose costing option

import React from 'react';
import { Calculator, Package, ArrowLeft, Check } from 'lucide-react';
import { UseInventoryCostingOptionViewModelReturn } from '../viewModels/useInventoryCostingOptionViewModel';

interface InventoryCostingOptionViewProps extends UseInventoryCostingOptionViewModelReturn {}

const STEPS = [
  { number: 1, label: 'Type' },
  { number: 2, label: 'Costing' },
  { number: 3, label: 'Details' },
  { number: 4, label: 'Payment' },
];

const Stepper = ({ current }: { current: number }) => (
  <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 32px' }}>
    <div style={{ display: 'flex', alignItems: 'center', maxWidth: 560, margin: '0 auto' }}>
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
              <span style={{ marginTop: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: done || active ? '#0f172a' : '#94a3b8', whiteSpace: 'nowrap' }}>
                {step.label}
              </span>
            </div>
            {!last && (
              <div style={{ flex: 1, height: 2, borderRadius: 99, margin: '0 8px', marginBottom: 20, backgroundColor: done ? '#0f172a' : '#e5e7eb', transition: 'background-color 0.3s' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

export const InventoryCostingOptionView: React.FC<InventoryCostingOptionViewProps> = ({
  selectedOption, selectOptionAndContinue, handleBack,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: '#f8fafc' }}>

    {/* Header */}
    <div style={{ flexShrink: 0, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={handleBack} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}>
          <ArrowLeft size={17} />
        </button>
        <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Calculator size={17} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Costing Options</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Step 2 of 4 — Include costing information?</div>
        </div>
      </div>
    </div>

    <Stepper current={2} />

    {/* Content */}
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 20 }}>Do you want to include costing information?</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, maxWidth: 900 }}>
        {[
          {
            opt: 'with' as const,
            icon: Calculator, iconColor: '#0f172a', activeBorder: '#334155', activeBg: '#f1f5f9', activeIconBg: '#e2e8f0', activeGlow: 'rgba(15,23,42,0.08)',
            activeCheck: '#0f172a', title: 'With Costing', sub: 'Detailed breakdown',
            desc: 'Include detailed cost breakdown with USD rate, customs, freight expenses, and full payment tracking per shipment.',
            badge: '● Full Tracking', badgeBg: '#e2e8f0', badgeColor: '#1e293b',
          },
          {
            opt: 'without' as const,
            icon: Package, iconColor: '#ea580c', activeBorder: '#f97316', activeBg: '#fff7ed', activeIconBg: '#ffedd5', activeGlow: 'rgba(249,115,22,0.15)',
            activeCheck: '#f97316', title: 'Without Costing', sub: 'Simple quick entry',
            desc: 'Skip cost details and go straight to product entry. Best for quick stock additions where cost tracking is not needed.',
            badge: '● Quick Entry', badgeBg: '#ffedd5', badgeColor: '#c2410c',
          },
        ].map(({ opt, icon: Icon, iconColor, activeBorder, activeBg, activeIconBg, activeGlow, activeCheck, title, sub, desc, badge, badgeBg, badgeColor }) => {
          const sel = selectedOption === opt;
          return (
            <button
              key={opt}
              onClick={() => selectOptionAndContinue(opt)}
              style={{
                display: 'flex', flexDirection: 'column', padding: 22, textAlign: 'left', cursor: 'pointer',
                border: `2px solid ${sel ? activeBorder : '#e2e8f0'}`,
                borderRadius: 14, backgroundColor: sel ? activeBg : '#fff',
                boxShadow: sel ? `0 0 0 3px ${activeGlow}` : '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all 0.2s', width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ padding: 10, borderRadius: 10, backgroundColor: sel ? activeIconBg : '#f1f5f9', flexShrink: 0 }}>
                  <Icon size={24} color={iconColor} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{title}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{sub}</div>
                </div>
                {sel && (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: activeCheck, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={12} color="#fff" strokeWidth={3} />
                  </div>
                )}
              </div>
              <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, flex: 1, margin: '0 0 14px 0' }}>{desc}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 10, fontWeight: 700, backgroundColor: badgeBg, color: badgeColor }}>{badge}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: sel ? iconColor : '#9ca3af' }}>Select →</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);