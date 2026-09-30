// components/StatusBadge.tsx
import React from 'react';
import type { PayableStatus } from '../models/payableToFuturistic';

const CONFIG: Record<PayableStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  partial: {
    label: 'Partial',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  paid: {
    label: 'Paid',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
};

export const StatusBadge: React.FC<{ status: PayableStatus }> = ({ status }) => {
  const { label, className } = CONFIG[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
};