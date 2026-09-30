// Invoice Module - ViewModel Layer
// useDeletedInvoicesViewModel - lists soft-deleted invoices (cannot be deleted again)

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeletedInvoice } from '../models/types';
import { InvoiceLifecycleService } from '../models/InvoiceLifecycleService';

export function useDeletedInvoicesViewModel() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<DeletedInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setIsLoading(true);
    InvoiceLifecycleService.fetchDeletedInvoices()
      .then(setRecords)
      .catch(e => setError(e.message || 'Failed to load deleted invoices'))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const s = search.toLowerCase();
    return records.filter(r =>
      r.invoiceNumber.toLowerCase().includes(s) ||
      r.customerName.toLowerCase().includes(s) ||
      r.customerPhone.includes(s)
    );
  }, [records, search]);

  const onBack = useCallback(() => navigate('/invoices'), [navigate]);

  return { filteredRecords, isLoading, error, search, setSearch, onBack, totalCount: records.length };
}