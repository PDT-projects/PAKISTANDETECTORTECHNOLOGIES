// Transactions Module - Transaction Delete Wrapper + View (inline)
// Fully self-contained — fetches transaction from Firestore by URL param

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, AlertTriangle, X, TrendingUp, TrendingDown, Wallet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Transaction } from '../models/types';
import { TransactionFirebaseService } from '../models/transactionFirebaseService';
import { formatCurrency, formatDate, getCategoryColor } from '../models/transactionsService';

export function TransactionDeleteWrapper() {
  const { id }        = useParams<{ id: string }>();
  const navigate      = useNavigate();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading,   setIsLoading]   = useState(true);
  const [isDeleting,  setIsDeleting]  = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (!id) { navigate('/transactions'); return; }
    TransactionFirebaseService.fetchTransactionById(id)
      .then(tx => { setTransaction(tx); setIsLoading(false); })
      .catch(() => { toast.error('Failed to load transaction'); setIsLoading(false); });
  }, [id]);

  const handleDelete = async () => {
    if (!transaction || !id) return;
    if (confirmText !== 'DELETE') { toast.error('Type DELETE to confirm'); return; }
    setIsDeleting(true);
    try {
      await TransactionFirebaseService.deleteTransaction(id);
      toast.success('Transaction deleted successfully');
      navigate('/transactions');
    } catch {
      toast.error('Failed to delete transaction');
      setIsDeleting(false);
    }
  };

  const catIcon = (cat: string) => {
    if (cat === 'Cash Inflow')  return <TrendingUp  className="w-6 h-6 text-green-600" />;
    if (cat === 'Cash Outflow') return <TrendingDown className="w-6 h-6 text-red-600" />;
    return <Wallet className="w-6 h-6 text-blue-600" />;
  };

  const modeBadge = (mode: string) => {
    const c: Record<string, string> = { Cash: 'bg-gray-100 text-gray-800', Bank: 'bg-blue-100 text-blue-800', Cheque: 'bg-purple-100 text-purple-800' };
    return c[mode] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <X className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Transaction Not Found</h2>
          <p className="text-gray-500 mb-4">This transaction doesn't exist or has been deleted.</p>
          <button onClick={() => navigate('/transactions')}
            className="px-4 py-2 bg-[#4f46e5] text-white rounded-lg hover:bg-[#4338ca]">
            Back to Transactions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/transactions')} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Delete Transaction</h2>
          <p className="text-gray-500 text-sm mt-0.5">Permanently remove this record</p>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
          <div>
            <p className="font-semibold text-red-900">This action cannot be undone</p>
            <p className="text-sm text-red-700">Deleting this transaction will permanently remove it and affect financial reports.</p>
          </div>
        </div>
      </div>

      {/* Transaction details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5 shadow-sm">
        <div className="flex items-center gap-4 mb-5 pb-4 border-b border-gray-100">
          <div className="p-3 bg-gray-100 rounded-xl">{catIcon(transaction.mainCategory)}</div>
          <div className="flex-1">
            <p className="font-mono text-sm text-indigo-600">{transaction.transactionId}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getCategoryColor(transaction.mainCategory)}`}>
                {transaction.mainCategory}
              </span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${modeBadge(transaction.mode)}`}>
                {transaction.mode}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Amount</p>
            <p className={`text-2xl font-bold ${transaction.mainCategory === 'Cash Inflow' ? 'text-green-600' : 'text-red-600'}`}>
              {transaction.mainCategory === 'Cash Inflow' ? '+' : '−'}{formatCurrency(transaction.amount || 0)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            ['Date',         formatDate(transaction.date)],
            ['Company',      transaction.company.split(': ')[1] || transaction.company],
            ['Sub Category', transaction.subCategory],
            ['Payment Mode', transaction.mode],
            ['Paid By',      transaction.paidBy || '—'],
            ['Paid To',      transaction.paidTo || '—'],
          ].map(([l, v]) => (
            <div key={l} className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-400 mb-0.5">{l}</p>
              <p className="font-medium text-gray-900 text-sm">{v}</p>
            </div>
          ))}
        </div>
        {transaction.note && (
          <div className="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
            <p className="text-xs text-gray-400 mb-0.5">Note</p>
            <p className="text-sm text-gray-800">{transaction.note}</p>
          </div>
        )}
      </div>

      {/* Confirmation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-3">Confirm Deletion</h3>
        <p className="text-gray-600 text-sm mb-4">
          Type <strong className="text-red-600">DELETE</strong> to confirm:
        </p>
        <input 
          type="text" 
          value={confirmText} 
          onChange={e => setConfirmText(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:outline-none mb-5 text-sm"
          placeholder="Type DELETE to confirm" 
        />
        <div className="flex items-center justify-end gap-3">
          <button onClick={() => navigate('/transactions')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-200! text-black! rounded-lg hover:bg-gray-300! font-medium">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={isDeleting || confirmText !== 'DELETE'}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-200! text-black! rounded-lg hover:bg-gray-300! disabled:bg-gray-300! disabled:text-gray-500! font-medium">
            {isDeleting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Deleting...
              </>
            ) : (
              <>
                <Trash2 size={16} /> Delete Transaction
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
