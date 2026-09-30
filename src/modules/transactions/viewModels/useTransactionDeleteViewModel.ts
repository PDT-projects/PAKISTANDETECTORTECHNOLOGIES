// Transactions Module - Delete ViewModel
// Fetches transaction from Firestore by ID, handles confirmation + deletion

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Transaction } from '../models/types';
import { TransactionFirebaseService } from '../models/transactionFirebaseService';
import { formatCurrency, formatDate } from '../models/transactionsService';

export interface UseTransactionDeleteViewModelReturn {
  transaction:   Transaction | null;
  isLoading:     boolean;
  isDeleting:    boolean;
  confirmText:   string;
  setConfirmText:(text: string) => void;
  handleDelete:  () => Promise<void>;
  handleCancel:  () => void;
  formatCurrency:(amount: number) => string;
  formatDate:    (dateString: string) => string;
}

export function useTransactionDeleteViewModel(): UseTransactionDeleteViewModelReturn {
  const navigate             = useNavigate();
  const { id }               = useParams<{ id: string }>();
  const [transaction,  setTransaction]  = useState<Transaction | null>(null);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isDeleting,   setIsDeleting]   = useState(false);
  const [confirmText,  setConfirmText]  = useState('');

  // Load transaction from Firestore on mount
  useEffect(() => {
    if (!id) { navigate('/transactions'); return; }
    TransactionFirebaseService.fetchTransactionById(id)
      .then(tx => {
        setTransaction(tx);
        setIsLoading(false);
      })
      .catch(() => {
        toast.error('Failed to load transaction');
        setIsLoading(false);
      });
  }, [id, navigate]);

  const handleDelete = useCallback(async () => {
    if (!transaction || !id) return;

    if (confirmText !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }

    setIsDeleting(true);
    try {
      await TransactionFirebaseService.deleteTransaction(id);
      toast.success('Transaction deleted successfully');
      navigate('/transactions');
    } catch {
      toast.error('Failed to delete transaction');
      setIsDeleting(false);
    }
  }, [transaction, id, confirmText, navigate]);

  const handleCancel = useCallback(() => navigate('/transactions'), [navigate]);

  return {
    transaction,
    isLoading,
    isDeleting,
    confirmText,
    setConfirmText,
    handleDelete,
    handleCancel,
    formatCurrency,
    formatDate,
  };
}