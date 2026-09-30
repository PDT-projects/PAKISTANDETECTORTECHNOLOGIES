// Invoice Module - Delete ViewModel

import { useCallback, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Invoice } from '../models/types';
import { InvoiceLifecycleService } from '../models/InvoiceLifecycleService';
import { useAuth } from '../../../providers/context/AuthContext';
import { formatCurrency, formatDate } from '../models/invoiceService';

export interface UseInvoiceDeleteViewModelReturn {
  invoice: Invoice | null;
  isDeleting: boolean;
  handleDelete: () => void;
  handleCancel: () => void;
  formatCurrency: (amount: number) => string;
  formatDate: (dateString: string) => string;
}

export function useInvoiceDeleteViewModel(invoices: Invoice[]): UseInvoiceDeleteViewModelReturn {
  const navigate = useNavigate();
  const { id }   = useParams<{ id: string }>();
  const { user } = useAuth();
  const invoice  = invoices.find(i => i.id === id) || null;
  const [isDeleting, setIsDeleting] = useState(false);
  // softDeleteInvoice is a multi-step async chain (restore serials, remove
  // linked transactions, archive, then delete the original) that can easily
  // take a second or more. The Delete button had nothing stopping a second
  // click from firing handleDelete again before the first call's deleteDoc
  // completed — the invoice still existed for that second call to read, so
  // it archived its own copy too, leaving TWO rows in Deleted Invoices for
  // one invoice. A ref (not just the state) guards the async body itself,
  // since state set inside handleDelete won't be visible to a second call
  // that starts before this render commits.
  const inFlightRef = useRef(false);

  const handleDelete = useCallback(async () => {
    if (!id || !invoice) { navigate('/invoices'); return; }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsDeleting(true);
    try {
      // All reversal logic lives in the service now:
      //   - sold serials go back to inventory + Sold status/date/invoice-number cleared
      //   - every linked transaction (payments + misc expenses) removed from ledger
      //   - invoice archived to deleted_invoices, cannot be undone
      const summary = await InvoiceLifecycleService.softDeleteInvoice(
        id,
        user ? { uid: user.uid, email: user.email || '' } : undefined
      );

      // Build a summary toast so the user sees exactly what was reversed.
      const parts: string[] = [];
      if (summary.serialsRestored > 0) {
        parts.push(`${summary.serialsRestored} serial${summary.serialsRestored === 1 ? '' : 's'} returned to stock`);
      }
      if (summary.transactionsRemoved > 0) {
        parts.push(`${summary.transactionsRemoved} transaction${summary.transactionsRemoved === 1 ? '' : 's'} reversed`);
      }
      const detail = parts.length > 0 ? ` — ${parts.join(', ')}` : '';
      toast.success(`Invoice moved to Deleted Invoices${detail}`);
      navigate('/invoices');
      // No need to clear inFlightRef/isDeleting on success — this view is
      // about to be navigated away from.
    } catch (err) {
      console.error('[InvoiceDelete] softDeleteInvoice failed:', err);
      toast.error('Failed to delete invoice');
      // Failed — release the guard so the user can retry instead of being
      // stuck on a permanently-disabled button.
      inFlightRef.current = false;
      setIsDeleting(false);
    }
  }, [id, invoice, navigate, user]);

  const handleCancel = useCallback(() => navigate('/invoices'), [navigate]);

  return { invoice, isDeleting, handleDelete, handleCancel, formatCurrency, formatDate };
}