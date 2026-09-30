// Invoice Module - Report Wrapper
import React from 'react';
import { useInvoiceReportViewModel } from '../viewModels/useInvoiceReportViewModel';
import { InvoiceReportView } from './InvoiceReportView';

export function InvoiceReportWrapper() {
  const vm = useInvoiceReportViewModel();
  return <InvoiceReportView {...vm} />;
}