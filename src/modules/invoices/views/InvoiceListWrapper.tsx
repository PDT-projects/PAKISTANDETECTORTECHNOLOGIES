// Invoice Module - List Wrapper

import React from 'react';
import { useInvoiceListViewModel } from '../viewModels/useInvoiceListViewModel';
import { InvoiceListView } from './InvoiceListView';

export function InvoiceListWrapper() {
  const vm = useInvoiceListViewModel();

  return (
    <InvoiceListView
      {...vm}
      onSalespersonFilter={vm.onSalespersonFilter}
      onBrandFilter={vm.onBrandFilter}
      onModelFilter={vm.onModelFilter}
      brandOptions={vm.brandOptions}
      modelOptions={vm.modelOptions}
    />
  );
}