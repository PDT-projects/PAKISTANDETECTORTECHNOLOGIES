import React from 'react';
import { useDummyInvoiceFormViewModel } from '../viewModels/useDummyInvoiceFormViewModel';
import { DummyInvoiceFormView } from './DummyInvoiceFormView';

export function DummyInvoiceFormWrapper() {
  const vm = useDummyInvoiceFormViewModel();
  return <DummyInvoiceFormView {...vm} />;
}