import { useState } from 'react';
import type { Transaction } from '../../modules/transactions/models/types';
import type { Bank } from '../../modules/banking/models/types';
import { Plus, Eye, Trash2, X, Printer, Download, Upload, FileText, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';
import { LockedScrollTable } from '../../shared/components/LockedScrollTable';
import { exportReportToPdf, exportReportToExcel } from '../../shared/reportExport/reportExport';

type BillsProps = {
  transactions: Transaction[];
  setTransactions: (transactions: Transaction[]) => void;
  banks: Bank[];
  setBanks: (banks: Bank[]) => void;
};

const billCategories = {
  'Electricity': ['LESCO', 'IESCO', 'K-Electric', 'Generator Fuel'],
  'Internet': ['PTCL', 'StormFiber', 'Nayatel'],
  'Utilities': ['Sui Gas', 'Water Board', 'Sanitation']
};

const predefinedVendors = [
  'LESCO', 'IESCO', 'K-Electric', 'PTCL', 'StormFiber', 'Nayatel',
  'Sui Gas', 'Water Board', 'City Sanitation', 'Generator Supplier',
  'Office Landlord', 'Maintenance Company'
];

const companies = [
  'Pakistan Detectors Technologies: Dubai',
  'Pakistan Detectors Technologies: Saudi Arabia',
  'Pakistan Detectors Technologies: Chad',
  'Pakistan Detectors Technologies: Abu Dhabi',
  'Pakistan Detectors Technologies: Sharjah',
  'Pakistan Detectors Technologies: Oman',
  'Pakistan Detectors Technologies: Qatar',
  'Pakistan Detectors Technologies: Kuwait',
  'Pakistan Detectors Technologies: Bullion RND/ SITE office'
];

type BillTransaction = {
  id: string;
  amount: number;
  paidBy: string; // Person/company who paid (e.g., "Pakistan Detectors - Dubai")
  paidTo: string; // Vendor receiving payment
  transactionBy: string; // Person who processed the transaction
  mode: 'Cash' | 'Bank' | 'Cheque'; // Payment method
  bankName?: string;
  imageUrl?: string;
  paymentStatus?: 'Full' | 'Partial';
  remainingAmount?: number;
  billMonth?: string; // Month for which the bill is being paid
};

export function Bills({ transactions, setTransactions, banks, setBanks }: BillsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewBill, setViewBill] = useState<Transaction | null>(null);
  const [viewSlip, setViewSlip] = useState<Transaction | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  const [formData, setFormData] = useState({
    company: companies[0],
    billCategory: 'Electricity' as keyof typeof billCategories,
    date: new Date().toISOString().split('T')[0],
    note: ''
  });

  const [billTransactions, setBillTransactions] = useState<BillTransaction[]>([{
    id: Date.now().toString(),
    amount: 0,
    paidBy: 'Pakistan Detectors - Dubai',
    paidTo: '',
    transactionBy: '',
    mode: 'Cash',
    bankName: '',
    imageUrl: '',
    paymentStatus: 'Full',
    remainingAmount: 0,
    billMonth: new Date().toISOString().slice(0, 7) // Default to current month
  }]);

  // Filter bills from all transactions
  const allBills = transactions.filter(t => t.mainCategory === 'Bills');

  const handleAdd = () => {
    setFormData({
      company: companies[0],
      billCategory: 'Electricity',
      date: new Date().toISOString().split('T')[0],
      note: ''
    });
    setBillTransactions([{
      id: Date.now().toString(),
      amount: 0,
      paidBy: formData.company.split(': ')[1] || formData.company,
      paidTo: '',
      transactionBy: '',
      mode: 'Cash',
      bankName: '',
      imageUrl: '',
      paymentStatus: 'Full',
      remainingAmount: 0,
      billMonth: new Date().toISOString().slice(0, 7) // Default to current month
    }]);
    setIsModalOpen(true);
  };

  const addBillTransaction = () => {
    setBillTransactions([...billTransactions, {
      id: Date.now().toString(),
      amount: 0,
      paidBy: formData.company.split(': ')[1] || formData.company,
      paidTo: '',
      transactionBy: '',
      mode: 'Cash',
      bankName: '',
      imageUrl: '',
      paymentStatus: 'Full',
      remainingAmount: 0
    }]);
  };

  const removeBillTransaction = (id: string) => {
    if (billTransactions.length > 1) {
      setBillTransactions(billTransactions.filter(t => t.id !== id));
    }
  };

  const updateBillTransaction = (id: string, field: keyof BillTransaction, value: any) => {
    setBillTransactions(billTransactions.map(t => {
      const updated = t.id === id ? { ...t, [field]: value } : t;
      // Clear bank name if switching to Cash
      if (field === 'mode' && value === 'Cash') {
        updated.bankName = '';
      }
      return updated;
    }));
  };

  const handleImageUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file type
      if (!file.type.match(/image\/(jpg|jpeg|png)/)) {
        toast.error('Please upload a JPG or PNG image');
        return;
      }
      // Create a data URL for preview
      const reader = new FileReader();
      reader.onloadend = () => {
        updateBillTransaction(id, 'imageUrl', reader.result as string);
        toast.success('Image uploaded');
      };
      reader.readAsDataURL(file);
    }
  };

  const calculateTotal = () => {
    return billTransactions.reduce((sum, t) => sum + t.amount, 0);
  };

  const handleSave = () => {
    // Validate all transactions
    for (const billTxn of billTransactions) {
      if (!billTxn.paidBy || !billTxn.paidTo || !billTxn.amount) {
        toast.error('Please fill in all required fields for each transaction');
        return;
      }

      // Check if paying via bank and validate balance
      if ((billTxn.mode === 'Bank' || billTxn.mode === 'Cheque') && !billTxn.bankName) {
        toast.error('Please select a bank for bank/cheque transactions');
        return;
      }

      if ((billTxn.mode === 'Bank' || billTxn.mode === 'Cheque') && billTxn.bankName) {
        const bank = banks.find(b => b.name === billTxn.bankName);
        if (bank && bank.balance < billTxn.amount) {
          toast.error(`Insufficient balance in ${bank.name}`);
          return;
        }
      }
    }

    // Create individual transaction records for each bill transaction
    const newTransactions: Transaction[] = billTransactions.map((billTxn) => ({
      id: Date.now().toString() + Math.random().toString(),
      transactionId: `TXN-${Date.now()}${Math.random().toString().slice(-4)}`,
      date: formData.date,
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      company: formData.company,
      mainCategory: 'Bills',
      subCategory: formData.billCategory,
      amount: billTxn.amount,
      mode: billTxn.mode,
      bankName: billTxn.bankName,
      paidBy: billTxn.paidBy,
      paidTo: billTxn.paidTo,
      transactionBy: billTxn.transactionBy,
      billMonth: billTxn.billMonth,
      note: formData.note,
      imageUrl: billTxn.imageUrl,
      paymentStatus: billTxn.paymentStatus,
      remainingAmount: billTxn.remainingAmount
    }));

    // Update bank balances
    const updatedBanks = [...banks];
    for (const billTxn of billTransactions) {
      if ((billTxn.mode === 'Bank' || billTxn.mode === 'Cheque') && billTxn.bankName) {
        const bankIndex = updatedBanks.findIndex(b => b.name === billTxn.bankName);
        if (bankIndex !== -1) {
          updatedBanks[bankIndex] = {
            ...updatedBanks[bankIndex],
            balance: updatedBanks[bankIndex].balance - billTxn.amount
          };
        }
      }
    }
    setBanks(updatedBanks);

    setTransactions([...transactions, ...newTransactions]);
    toast.success(`${newTransactions.length} bill transaction(s) added successfully`);
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this bill?')) {
      setTransactions(transactions.filter(t => t.id !== id));
      toast.success('Bill deleted successfully');
    }
  };

  const handlePrint = (bill: Transaction) => {
    toast.success(`Printing bill slip`);
    window.print();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Bills</h2>
          <p className="text-sm text-gray-600 mt-1">Manage utility bills and recurring payments</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            const headers = ['Date', 'Month', 'Company', 'Category', 'Paid To', 'Paid By', 'Method', 'Amount'];
            const rows = allBills.map(bill => [
              new Date(bill.date).toLocaleDateString('en-PK'), bill.billMonth || '-',
              bill.company.split(': ')[1] || bill.company, bill.subCategory,
              bill.paidTo || '-', bill.paidBy || '-',
              `${bill.mode}${bill.bankName ? ` (${bill.bankName})` : ''}`, bill.amount,
            ]);
            exportReportToExcel({
              title: 'Bills',
              subtitle: `${allBills.length} bills`,
              columns: headers.map(h => ({ header: h })),
              rows,
              filename: `bills-${new Date().toISOString().slice(0, 10)}`,
            });
          }}
          className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={16} /> Excel
        </button>
        <button
          onClick={() => {
            const headers = ['Date', 'Month', 'Company', 'Category', 'Paid To', 'Paid By', 'Method', 'Amount'];
            const rows = allBills.map(bill => [
              new Date(bill.date).toLocaleDateString('en-PK'), bill.billMonth || '-',
              bill.company.split(': ')[1] || bill.company, bill.subCategory,
              bill.paidTo || '-', bill.paidBy || '-',
              `${bill.mode}${bill.bankName ? ` (${bill.bankName})` : ''}`, bill.amount,
            ]);
            exportReportToPdf({
              title: 'Bills',
              subtitle: `${allBills.length} bills`,
              columns: headers.map(h => ({ header: h })),
              rows,
              filename: `bills-${new Date().toISOString().slice(0, 10)}`,
            });
          }}
          className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download size={16} /> PDF
        </button>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 bg-[#4f46e5] text-white px-4 py-2 rounded-lg hover:bg-[#4338ca] transition-colors"
        >
          <Plus size={20} />
          Add Bill
        </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <LockedScrollTable maxHeight="65vh">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid To</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {allBills.map((bill) => (
                <tr key={bill.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(bill.date).toLocaleDateString('en-PK')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {bill.billMonth || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{bill.company.split(': ')[1] || bill.company}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{bill.subCategory}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[#4f46e5]">{bill.paidTo || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{bill.paidBy || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {bill.mode}{bill.bankName ? ` (${bill.bankName})` : ''}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{formatCurrency(bill.amount)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewBill(bill)}
                        className="p-2 text-[#4f46e5] hover:bg-[#4f46e5]/10 rounded-lg transition-colors"
                        title="View"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => setViewSlip(bill)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="View Slip"
                      >
                        <FileText size={16} />
                      </button>
                      <button
                        onClick={() => handlePrint(bill)}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Print"
                      >
                        <Printer size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(bill.id)}
                        className="p-2 text-[#ef4444] hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {allBills.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    No bills found. Click "Add Bill" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </LockedScrollTable>
      </div>

      {/* Add Bill Modal */}
      {isModalOpen && (
        <div className={`fixed inset-0 z-50 ${isFullScreen ? 'bg-white' : 'bg-black/50 flex items-center justify-center p-4'}`}>
          <div className={`bg-white ${isFullScreen ? 'w-full h-full flex flex-col' : 'rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col'}`}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-xl font-bold">Add Bill</h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsFullScreen(!isFullScreen)} 
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
                >
                  {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className={`${isFullScreen ? 'flex-1 overflow-y-auto' : 'overflow-y-auto'} p-6 space-y-6`}>
              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
                  <select
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
                  >
                    {companies.map(company => (
                      <option key={company} value={company}>{company.split(': ')[1] || company}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bill Category *</label>
                  <select
                    value={formData.billCategory}
                    onChange={(e) => setFormData({ ...formData, billCategory: e.target.value as keyof typeof billCategories })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
                  >
                    {Object.keys(billCategories).map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                  <input
                    type="text"
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
                    placeholder="Additional notes"
                  />
                </div>
              </div>

              {/* Bill Transactions */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900">Bill Transactions</h4>
                  <button
                    onClick={addBillTransaction}
                    className="flex items-center gap-1 text-sm bg-[#4f46e5] text-white px-3 py-1.5 rounded-lg hover:bg-[#4338ca] transition-colors"
                  >
                    <Plus size={16} />
                    Add Transaction
                  </button>
                </div>

                <div className="space-y-4">
                  {billTransactions.map((txn, index) => (
                    <div key={txn.id} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700">Transaction {index + 1}</span>
                        {billTransactions.length > 1 && (
                          <button
                            onClick={() => removeBillTransaction(txn.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
                          <input
                            type="number"
                            value={txn.amount || ''}
                            onChange={(e) => updateBillTransaction(txn.id, 'amount', Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5] text-sm"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Payment Status *</label>
                          <select
                            value={txn.paymentStatus || 'Full'}
                            onChange={(e) => updateBillTransaction(txn.id, 'paymentStatus', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5] text-sm"
                          >
                            <option value="Full">Full Payment</option>
                            <option value="Partial">Partial Payment</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Bill Month *</label>
                          <input
                            type="month"
                            value={txn.billMonth || ''}
                            onChange={(e) => updateBillTransaction(txn.id, 'billMonth', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5] text-sm"
                          />
                        </div>
                      </div>

                      {txn.paymentStatus === 'Partial' && (
                        <div className="mt-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Remaining Amount *</label>
                          <input
                            type="number"
                            value={txn.remainingAmount || ''}
                            onChange={(e) => updateBillTransaction(txn.id, 'remainingAmount', Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5] text-sm"
                            placeholder="Enter remaining amount"
                          />
                          {txn.amount && txn.remainingAmount && (
                            <p className="text-xs text-gray-600 mt-1">
                              Paid: {formatCurrency(txn.amount - txn.remainingAmount)} | Remaining: {formatCurrency(txn.remainingAmount)}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Paid To (Vendor) *</label>
                          <select
                            value={txn.paidTo}
                            onChange={(e) => updateBillTransaction(txn.id, 'paidTo', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5] text-sm"
                          >
                            <option value="">Select vendor</option>
                            {predefinedVendors.map(vendor => (
                              <option key={vendor} value={vendor}>{vendor}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Paid By (Person/Company) *</label>
                          <input
                            type="text"
                            value={txn.paidBy}
                            onChange={(e) => updateBillTransaction(txn.id, 'paidBy', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5] text-sm"
                            placeholder="e.g., Pakistan Detectors - Dubai"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Transaction By</label>
                          <input
                            type="text"
                            value={txn.transactionBy}
                            onChange={(e) => updateBillTransaction(txn.id, 'transactionBy', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5] text-sm"
                            placeholder="e.g., Sir ABC, Manager Ahmed"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method *</label>
                          <select
                            value={txn.mode}
                            onChange={(e) => updateBillTransaction(txn.id, 'mode', e.target.value as 'Cash' | 'Bank' | 'Cheque')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5] text-sm"
                          >
                            <option value="Cash">Cash</option>
                            <option value="Bank">Bank Transfer</option>
                            <option value="Cheque">Cheque</option>
                          </select>
                        </div>
                        {(txn.mode === 'Bank' || txn.mode === 'Cheque') && (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Bank Name *</label>
                            <select
                              value={txn.bankName}
                              onChange={(e) => updateBillTransaction(txn.id, 'bankName', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5] text-sm"
                            >
                              <option value="">Select bank</option>
                              {banks.map(bank => (
                                <option key={bank.id} value={bank.name}>
                                  {bank.name} (Balance: {formatCurrency(bank.balance)})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Receipt Image (JPG/PNG)</label>
                          <div className="flex items-center gap-2">
                            <label className="flex-1 flex items-center justify-center px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                              <Upload size={16} className="mr-2" />
                              <span className="text-sm">{txn.imageUrl ? 'Change Image' : 'Upload Image'}</span>
                              <input
                                type="file"
                                accept="image/jpeg,image/jpg,image/png"
                                onChange={(e) => handleImageUpload(txn.id, e)}
                                className="hidden"
                              />
                            </label>
                            {txn.imageUrl && (
                              <button
                                onClick={() => updateBillTransaction(txn.id, 'imageUrl', '')}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                title="Remove image"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                          {txn.imageUrl && (
                            <img src={txn.imageUrl} alt="Receipt" className="mt-2 h-20 w-20 object-cover rounded border" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="bg-[#4f46e5]/10 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-gray-900">Total Amount:</span>
                  <span className="text-2xl font-bold text-[#4f46e5]">{formatCurrency(calculateTotal())}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 flex-shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-[#4f46e5] text-white rounded-lg hover:bg-[#4338ca] transition-colors"
              >
                Save Bill(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Bill Details Modal */}
      {viewBill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold">Bill Details</h3>
              <button onClick={() => setViewBill(null)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="font-medium text-gray-900">{new Date(viewBill.date).toLocaleDateString('en-PK')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Company</p>
                  <p className="font-medium text-gray-900">{viewBill.company.split(': ')[1] || viewBill.company}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Category</p>
                  <p className="font-medium text-gray-900">{viewBill.subCategory}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Paid To</p>
                  <p className="font-medium text-[#4f46e5]">{viewBill.paidTo || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Paid By</p>
                  <p className="font-medium text-gray-900">{viewBill.paidBy || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Transaction By</p>
                  <p className="font-medium text-gray-900">{viewBill.transactionBy || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment Method</p>
                  <p className="font-medium text-gray-900">
                    {viewBill.mode}{viewBill.bankName ? ` (${viewBill.bankName})` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Amount</p>
                  <p className="font-semibold text-lg text-[#4f46e5]">{formatCurrency(viewBill.amount)}</p>
                </div>
              </div>
              {viewBill.note && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-1">Note</p>
                  <p className="font-medium text-gray-900">{viewBill.note}</p>
                </div>
              )}
              {viewBill.imageUrl && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-2">Receipt Image</p>
                  <img src={viewBill.imageUrl} alt="Receipt" className="max-w-full h-auto rounded border" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Slip Modal */}
      {viewSlip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold">Bill Payment Slip</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrint(viewSlip)}
                  className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                >
                  <Printer size={20} />
                </button>
                <button onClick={() => setViewSlip(null)} className="text-gray-500 hover:text-gray-700">
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="p-8">
              {/* Company Header */}
              <div className="text-center border-b pb-4 mb-6">
                <h2 className="text-2xl font-bold text-[#4f46e5]">Pakistan Detectors Technologies</h2>
                <p className="text-sm text-gray-600 mt-1">{viewSlip.company.split(': ')[1] || viewSlip.company}</p>
                <p className="text-lg font-semibold mt-3">BILL PAYMENT SLIP</p>
              </div>

              {/* Bill Details */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-600">Date:</p>
                  <p className="font-semibold text-gray-900">{new Date(viewSlip.date).toLocaleDateString('en-PK')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Category:</p>
                  <p className="font-semibold text-gray-900">{viewSlip.subCategory}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Paid To:</p>
                  <p className="font-semibold text-[#4f46e5]">{viewSlip.paidTo || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Paid By:</p>
                  <p className="font-semibold text-gray-900">{viewSlip.paidBy || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Transaction By:</p>
                  <p className="font-semibold text-gray-900">{viewSlip.transactionBy || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment Method:</p>
                  <p className="font-semibold text-gray-900">
                    {viewSlip.mode}{viewSlip.bankName ? ` (${viewSlip.bankName})` : ''}
                  </p>
                </div>
              </div>

              {/* Amount */}
              <div className="bg-[#4f46e5]/10 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-900">Amount Paid:</span>
                  <span className="text-2xl font-bold text-[#4f46e5]">{formatCurrency(viewSlip.amount)}</span>
                </div>
              </div>

              {viewSlip.note && (
                <div className="border-t pt-4 mb-6">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Note:</p>
                  <p className="text-sm text-gray-600">{viewSlip.note}</p>
                </div>
              )}

              {viewSlip.imageUrl && (
                <div className="border-t pt-4 mb-6">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Receipt:</p>
                  <img src={viewSlip.imageUrl} alt="Receipt" className="max-w-full h-auto rounded border" />
                </div>
              )}

              {/* Footer */}
              <div className="border-t pt-4 text-center text-sm text-gray-500">
                <p>Generated on {new Date().toLocaleDateString('en-PK')} at {new Date().toLocaleTimeString('en-PK')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}