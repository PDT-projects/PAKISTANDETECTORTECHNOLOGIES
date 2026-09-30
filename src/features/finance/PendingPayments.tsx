import { useState, useMemo } from 'react';
import type { Transaction, PartialPayment } from '../../modules/transactions/models/types';
import type { Bank } from '../../modules/banking/models/types';
import {   Eye, Edit, Trash2, X, Check, AlertCircle, Clock, DollarSign, Plus, Filter, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';

type PendingPaymentsProps = {
  transactions: Transaction[];
  setTransactions: (transactions: Transaction[]) => void;
  banks: Bank[];
};

type PaymentModalData = {
  amount: number;
  bankId: string;
  method: 'Cash' | 'Cheque' | 'Bank';
  chequeNumber?: string;
};


export function PendingPayments({ transactions, setTransactions, banks }: PendingPaymentsProps) {
  const [viewTransaction, setViewTransaction] = useState<Transaction | null>(null);
  const [paymentModal, setPaymentModal] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Uncleared' | 'PartiallyPaid'>('All');

  const [paymentData, setPaymentData] = useState<PaymentModalData>({
    amount: 0,
    bankId: '',
    method: 'Cash'
  });


    // Calculate remaining amount for a transaction
   const getTransactionTotals = (t: Transaction) => {
    const totalPaid = t.partialPayments?.reduce((sum, p) => sum + p.amount, 0) ?? 0;
    return {
      totalPaid,
      remainingAmount: t.amount - totalPaid
    };
  };



  // Filter to show only pending transactions (not fully paid and cleared)
    const pendingTransactions = useMemo(() => {
    return transactions.filter(t => {
      const { remainingAmount } = getTransactionTotals(t);
      const hasUncleared = t.partialPayments?.some(
        p => !p.isCleared && p.method !== 'Bank'
      );
      return remainingAmount > 0 || hasUncleared;
    });
  }, [transactions]);

  // Filter based on selected status
    const filteredTransactions = useMemo(() => {
    return pendingTransactions.filter(t => {
      const { remainingAmount } = getTransactionTotals(t);
      const hasUncleared = t.partialPayments?.some(
        p => !p.isCleared && p.method !== 'Bank'
      );

      if (filterStatus === 'All') return true;
      if (filterStatus === 'Uncleared') return hasUncleared;
      if (filterStatus === 'PartiallyPaid') return remainingAmount > 0;
      return true;
    });
  }, [pendingTransactions, filterStatus]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0
    }).format(amount);


  const formatDateTime = (date: string, time?: string) => {
    const d = new Date(date);
    const dateStr = d.toLocaleDateString('en-PK');
    return time ? `${dateStr} ${time}` : dateStr;
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Cash Inflow':
        return 'bg-green-100 text-green-800';
      case 'Cash Outflow':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getPaymentStatusColor = (transaction: Transaction) => {
    const { remainingAmount } = getTransactionTotals(transaction);
    const hasUnclearedPayments = transaction.partialPayments?.some(p => !p.isCleared);
    
    if (remainingAmount === 0 && !hasUnclearedPayments) {
      return 'bg-green-100 text-green-800 border-green-200';
    }
    if (hasUnclearedPayments) {
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
    return 'bg-orange-100 text-orange-800 border-orange-200';
  };

   const addPartialPayment = (transactionId: string) => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    const { remainingAmount } = getTransactionTotals(transaction);

    if (paymentData.amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    if (paymentData.amount > remainingAmount) {
      toast.error('Amount exceeds remaining balance');
      return;
    }

    if (paymentData.method === 'Bank' && !paymentData.bankId) {
      toast.error('Select a bank');
      return;
    }

    if (paymentData.method === 'Cheque' && !paymentData.chequeNumber) {
      toast.error('Enter cheque number');
      return;
    }

    // Create new partial payment

    const newPayment: PartialPayment = {
      id: `PAY-${Date.now()}`,
      amount: paymentData.amount,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0],
      method: paymentData.method,
      bankId: paymentData.method === 'Bank' ? paymentData.bankId : undefined,
      chequeNumber: paymentData.method === 'Cheque' ? paymentData.chequeNumber : undefined,
      isCleared: paymentData.method === 'Bank' // 🔹 bank auto-cleared
    };

    setTransactions(
      transactions.map(t => {
        if (t.id !== transactionId) return t;

        const updatedPayments = [...(t.partialPayments ?? []), newPayment];
        const totalPaid = updatedPayments.reduce((s, p) => s + p.amount, 0);
        const remaining = t.amount - totalPaid;

        return {
          ...t,
          partialPayments: updatedPayments,
          totalPaid,
          remainingAmount: remaining,
          isFullyCleared:
            remaining === 0 &&
            updatedPayments.every(p => p.isCleared || p.method === 'Bank')
        };
      })
    );

    toast.success('Payment added');
    setPaymentModal(false);
    setPaymentData({ amount: 0, bankId: '', method: 'Cash' });
  };    


const markPaymentAsCleared = (transactionId: string, paymentId: string) => {
    setTransactions(
      transactions.map(t => {
        if (t.id !== transactionId) return t;

        const updatedPayments =
          t.partialPayments?.map(p =>
            p.id === paymentId ? { ...p, isCleared: true } : p
          ) ?? [];

        const totalPaid = updatedPayments.reduce((s, p) => s + p.amount, 0);
        const remaining = t.amount - totalPaid;

        return {
          ...t,
          partialPayments: updatedPayments,
          totalPaid,
          remainingAmount: remaining,
          isFullyCleared: remaining === 0 && updatedPayments.every(p => p.isCleared)
        };
      })
    );

    toast.success('Payment marked as cleared');
  };

  const deleteTransaction = (id: string) => {
    if (confirm('Are you sure you want to delete this pending payment transaction?')) {
      setTransactions(transactions.filter(t => t.id !== id));
      toast.success('Transaction deleted successfully');
    }
  };

  const handlePrint = (transaction: Transaction) => {
    toast.success('Printing pending payment slip');
    window.print();
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Pending Payments</h2>
        <p className="text-sm text-gray-600 mt-1">
          Transactions with unpaid or uncleared amounts
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Pending</p>
              <p className="text-2xl font-bold mt-1">
                {formatCurrency(
                  filteredTransactions.reduce((sum, t) => {
                    const { remainingAmount } = getTransactionTotals(t);
                    return sum + remainingAmount;
                  }, 0)
                )}
              </p>
            </div>
            <DollarSign className="text-red-500" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Uncleared Payments</p>
              <p className="text-2xl font-bold mt-1">
                {filteredTransactions.filter(t => t.partialPayments?.some(p => !p.isCleared)).length}
              </p>
            </div>
            <Clock className="text-yellow-500" size={32} />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Transactions</p>
              <p className="text-2xl font-bold mt-1">{filteredTransactions.length}</p>
            </div>
            <AlertCircle className="text-orange-500" size={32} />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={18} className="text-gray-600" />
          <h3 className="font-medium text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
            >
              <option value="All">All Pending</option>
              <option value="PartiallyPaid">Partially Paid</option>
              <option value="Uncleared">Uncleared Payments</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="mx-auto text-gray-400 mb-2" size={32} />
            <p className="text-gray-600">No pending payments found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Transaction ID</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Date & Time</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Category</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Amount</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Paid</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Remaining</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Status</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-[#4f46e5]">{transaction.transactionId}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {formatDateTime(transaction.date, transaction.time)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(transaction.mainCategory)}`}>
                        {transaction.mainCategory}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {formatCurrency(transaction.amount)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {formatCurrency(transaction.totalPaid || 0)}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-red-600">
                      {formatCurrency(getTransactionTotals(transaction).remainingAmount)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPaymentStatusColor(transaction)}`}>
                        {transaction.partialPayments?.some(p => !p.isCleared)
                          ? 'Uncleared'
                          : getTransactionTotals(transaction).remainingAmount > 0
                          ? 'Partially Paid'
                          : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedTransactionId(transaction.id);
                            setPaymentModal(true);
                            setPaymentData({ amount: 0, bankId: '', method: 'Cash' });
                          }}
                          className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-xs font-medium"
                          title="Add Payment"
                        >
                          💳 Pay
                        </button>
                        <button
                          onClick={() => setViewTransaction(transaction)}
                          className="p-1 text-gray-600 hover:text-[#4f46e5] hover:bg-gray-100 rounded transition-colors"
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handlePrint(transaction)}
                          className="p-1 text-gray-600 hover:text-[#4f46e5] hover:bg-gray-100 rounded transition-colors"
                          title="Print"
                        >
                          <Printer size={16} />
                        </button>
                        <button
                          onClick={() => deleteTransaction(transaction.id)}
                          className="p-1 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Details Modal */}
      {viewTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
              <h3 className="text-lg font-bold">
                Payment Details - {viewTransaction.transactionId}
              </h3>
              <button
                onClick={() => setViewTransaction(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Transaction ID</p>
                  <p className="font-medium">{viewTransaction.transactionId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Date & Time</p>
                  <p className="font-medium">
                    {formatDateTime(viewTransaction.date, viewTransaction.time)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Category</p>
                  <p className="font-medium">{viewTransaction.mainCategory}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Sub Category</p>
                  <p className="font-medium">{viewTransaction.subCategory}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Payment Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-blue-50 rounded">
                    <p className="text-xs text-gray-600">Total Amount</p>
                    <p className="text-lg font-bold text-blue-600">
                      {formatCurrency(viewTransaction.amount)}
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 rounded">
                    <p className="text-xs text-gray-600">Amount Paid</p>
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(getTransactionTotals(viewTransaction).totalPaid)}
                    </p>
                  </div>
                  <div className="p-3 bg-red-50 rounded col-span-2">
                    <p className="text-xs text-gray-600">Remaining Amount</p>
                    <p className="text-lg font-bold text-red-600">
                      {formatCurrency(getTransactionTotals(viewTransaction).remainingAmount)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Partial Payments */}
              {viewTransaction.partialPayments && viewTransaction.partialPayments.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Partial Payments History</h4>
                  <div className="space-y-2">
                    {viewTransaction.partialPayments.map((payment) => (
                      <div key={payment.id} className="p-3 bg-gray-50 rounded border border-gray-200">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-medium">
                              {formatCurrency(payment.amount)} via {payment.method}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              {formatDateTime(payment.date, payment.time)}
                            </p>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded font-medium ${
                            payment.isCleared
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {payment.isCleared ? 'Cleared' : 'Pending'}
                          </span>
                        </div>
                        {!payment.isCleared && payment.method !== 'Bank' && (
                          <button
                            onClick={() => markPaymentAsCleared(viewTransaction.id, payment.id)}
                            className="mt-2 text-xs bg-[#4f46e5] text-white px-3 py-1 rounded hover:bg-[#4f46e5]/90 transition-colors flex items-center gap-1"
                          >
                            <Check size={12} /> Mark as Cleared
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Info */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Additional Information</h4>
                <div className="space-y-2 text-sm">
                  {viewTransaction.paidBy && (
                    <div><span className="text-gray-600">Paid By:</span> {viewTransaction.paidBy}</div>
                  )}
                  {viewTransaction.paidTo && (
                    <div><span className="text-gray-600">Paid To:</span> {viewTransaction.paidTo}</div>
                  )}
                  {viewTransaction.accountablePerson && (
                    <div><span className="text-gray-600">Accountable Person:</span> {viewTransaction.accountablePerson}</div>
                  )}
                  <div><span className="text-gray-600">Mode:</span> {viewTransaction.mode}</div>
                  {viewTransaction.bankName && (
                    <div><span className="text-gray-600">Bank:</span> {viewTransaction.bankName}</div>
                  )}
                  {viewTransaction.note && (
                    <div className="pt-2 border-t"><span className="text-gray-600">Note:</span> {viewTransaction.note}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-gray-50 border-t border-gray-200 p-6 flex gap-3 justify-end">
              <button
                onClick={() => setViewTransaction(null)}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModal && selectedTransactionId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="border-b border-gray-200 p-6 flex justify-between items-center">
              <h3 className="text-lg font-bold">Add Payment</h3>
              <button
                onClick={() => {
                  setPaymentModal(false);
                  setSelectedTransactionId(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {selectedTransactionId && (
                <>
                  <div className="p-3 bg-blue-50 rounded border border-blue-200">
                    <p className="text-xs text-gray-600">Remaining Amount</p>
                    <p className="text-xl font-bold text-blue-600">
                      {formatCurrency(
                        getTransactionTotals(
                          transactions.find(t => t.id === selectedTransactionId)!
                        ).remainingAmount
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount to Pay *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={paymentData.amount || ''}
                      onChange={(e) =>
                        setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })
                      }
                      placeholder="Enter amount"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Method *
                    </label>
                    <select
                      value={paymentData.method}
                      onChange={(e) =>
                        setPaymentData({
                          ...paymentData,
                          method: e.target.value as 'Cash' | 'Cheque' | 'Bank'
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Bank">Bank Transfer</option>
                    </select>
                  </div>

                  {paymentData.method === 'Cheque' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cheque Number *
                      </label>
                      <input
                        type="text"
                        value={paymentData.chequeNumber || ''}
                        onChange={(e) =>
                          setPaymentData({ ...paymentData, chequeNumber: e.target.value })
                        }
                        placeholder="Enter cheque number"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
                      />
                    </div>
                  )}

            
                {paymentData.method === 'Bank' && (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Select Bank *
    </label>
    <select
      value={paymentData.bankId}
      onChange={(e) =>
        setPaymentData({ ...paymentData, bankId: e.target.value })
      }
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5] text-black bg-white"
    >
      <option value="">-- Select Bank --</option>
      {banks.map(bank => (
        <option key={bank.id} value={bank.id}>
          {bank.name} – {formatCurrency(bank.balance)}
        </option>
      ))}
    </select>
  </div>
)}

                </>
              )}
            </div>

            <div className="bg-gray-50 border-t border-gray-200 p-6 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setPaymentModal(false);
                  setSelectedTransactionId(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => addPartialPayment(selectedTransactionId)}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors font-medium flex items-center gap-2"
              >
                <Plus size={16} /> Add Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
