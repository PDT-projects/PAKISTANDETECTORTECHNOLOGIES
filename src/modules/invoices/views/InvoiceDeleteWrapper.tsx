// Invoice Module - Delete Wrapper
//
// UPDATED: tracks a `loading` flag while the invoice list is being fetched
// so the view can show a spinner instead of a false "Invoice Not Found"
// popup during the first render (which used to flash briefly before the
// invoices arrived).

import React, { useState, useEffect } from 'react';
import { useInvoiceDeleteViewModel } from '../viewModels/useInvoiceDeleteViewModel';
import { InvoiceDeleteView } from './InvoiceDeleteView';
import { Invoice } from '../models/types';
import { InvoiceFirebaseService } from '../models/InvoiceFirebaseService';

export function InvoiceDeleteWrapper() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    InvoiceFirebaseService.fetchAllInvoices()
      .then(list => { if (!cancelled) setInvoices(list); })
      .catch(() => { /* silent — the view will render Not Found once loading flips false */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const vm = useInvoiceDeleteViewModel(invoices);
  return <InvoiceDeleteView {...vm} isLoading={loading} />;
}