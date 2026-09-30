import { useState } from "react";
import { Plus, Eye, Edit, Trash2, Search, Filter } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import { Textarea } from "../../components/ui/textarea";
import { toast } from "sonner";

interface Transaction {
  id: number;
  date: string;
  company: string;
  mainCategory: string;
  subCategory: string;
  amount: number;
  mode: 'Cash' | 'Bank' | 'Cheque';
  bankName?: string;
  note: string;
}

// Category structure based on user requirements
const companies = [
  'Middle East Detectors Technologies - Dubai',
  'Middle East Detectors Technologies - Saudi Arabia',
  'Middle East Detectors Technologies - Chad',
  'Middle East Detectors Technologies - Abu Dhabi',
  'Middle East Detectors Technologies - Sharjah',
  'Middle East Detectors Technologies - Oman',
  'Middle East Detectors Technologies - Qatar',
  'Middle East Detectors Technologies - Kuwait',
  'Middle East Detectors Technologies - Bullion',
  'Middle East Detectors Technologies - RND/SITE Office'
];

const mainCategories = ['Cash Inflow', 'Cash Outflow', 'Loans & Advances'];

const subCategories: Record<string, string[]> = {
  'Cash Inflow': [
    'Product sale received',
    'Payment received - Customers',
    'Payment received - Company',
    'TCS/DHL/LCS payment received',
    'Commission received',
    'Loan received - From Employee',
    'Loan received - From Company',
    'Other'
  ],
  'Cash Outflow': [
    // Salary/Employee related
    'Employee salary',
    'Advance salary',
    'Commission paid - Employee',
    'Commission paid - Dealer',
    'Loan paid to employee',
    // Office Expenses
    'Office Rent',
    'Electricity Bill',
    'Gas Bill',
    'Water Bill',
    'Internet Bill',
    'PTCL Bill',
    'Petrol expense',
    'Kitchen Expense',
    'Grocery Expense',
    'Stationery Expense',
    'Marketing/SEO/VPN',
    'Courier',
    'Bykea/delivery',
    'Parcel received Payment',
    // Other Payments
    'Payment to company',
    'Payment to person',
    'Purchase',
    'Repair payment',
    'Cylinder payment',
    'Medical/hospital bill',
    'Personal expense/Non business',
    'Other payment'
  ],
  'Loans & Advances': [
    'Loan given',
    'Loan received',
    'Official Loan',
    'Personal loan',
    'Other loan - Full',
    'Other loan - Partial'
  ]
};

const banks = [
  'Habib Bank Limited',
  'MCB Bank',
  'Allied Bank',
  'United Bank Limited',
  'Meezan Bank',
  'Bank Alfalah',
  'Standard Chartered',
  'Faysal Bank'
];

const initialTransactions: Transaction[] = [
  {
    id: 1,
    date: '2026-01-19',
    company: 'Middle East Detectors Technologies - Dubai',
    mainCategory: 'Cash Outflow',
    subCategory: 'Employee salary',
    amount: 45000,
    mode: 'Bank',
    bankName: 'Habib Bank Limited',
    note: 'Monthly salary for January 2026'
  },
  {
    id: 2,
    date: '2026-01-19',
    company: 'Middle East Detectors Technologies - Saudi Arabia',
    mainCategory: 'Cash Inflow',
    subCategory: 'Product sale received',
    amount: 125000,
    mode: 'Bank',
    bankName: 'MCB Bank',
    note: 'Sale of Metal Detector Pro Series'
  },
  {
    id: 3,
    date: '2026-01-18',
    company: 'Middle East Detectors Technologies - Chad',
    mainCategory: 'Cash Outflow',
    subCategory: 'Office Rent',
    amount: 75000,
    mode: 'Bank',
    bankName: 'Allied Bank',
    note: 'Office rent for January 2026'
  },
  {
    id: 4,
    date: '2026-01-18',
    company: 'Middle East Detectors Technologies - Dubai',
    mainCategory: 'Cash Inflow',
    subCategory: 'Payment received - Customers',
    amount: 85000,
    mode: 'Cash',
    note: 'Payment from customer for previous order'
  },
  {
    id: 5,
    date: '2026-01-17',
    company: 'Middle East Detectors Technologies - Saudi Arabia',
    mainCategory: 'Cash Outflow',
    subCategory: 'Electricity Bill',
    amount: 12500,
    mode: 'Bank',
    bankName: 'Habib Bank Limited',
    note: 'Electricity bill for December'
  }
];

export function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewTransaction, setViewTransaction] = useState<Transaction | null>(null);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    company: '',
    mainCategory: '',
    subCategory: '',
    amount: '',
    mode: 'Cash' as 'Cash' | 'Bank' | 'Cheque',
    bankName: '',
    note: ''
  });

  const [availableSubCategories, setAvailableSubCategories] = useState<string[]>([]);

  const handleMainCategoryChange = (value: string) => {
    setFormData({ ...formData, mainCategory: value, subCategory: '' });
    setAvailableSubCategories(subCategories[value] || []);
  };

  const handleAddTransaction = () => {
    const newTransaction: Transaction = {
      id: transactions.length + 1,
      date: formData.date,
      company: formData.company,
      mainCategory: formData.mainCategory,
      subCategory: formData.subCategory,
      amount: parseFloat(formData.amount),
      mode: formData.mode,
      bankName: formData.mode === 'Bank' ? formData.bankName : undefined,
      note: formData.note
    };
    setTransactions([newTransaction, ...transactions]);
    setIsAddModalOpen(false);
    resetForm();
    toast.success('Transaction added successfully');
  };

  const handleEditTransaction = () => {
    if (editTransaction) {
      setTransactions(transactions.map(trans => 
        trans.id === editTransaction.id 
          ? { 
              ...editTransaction, 
              ...formData, 
              amount: parseFloat(formData.amount),
              bankName: formData.mode === 'Bank' ? formData.bankName : undefined
            }
          : trans
      ));
      setEditTransaction(null);
      resetForm();
      toast.success('Transaction updated successfully');
    }
  };

  const handleDeleteTransaction = (id: number) => {
    setTransactions(transactions.filter(trans => trans.id !== id));
    toast.success('Transaction deleted successfully');
  };

  const openEditModal = (transaction: Transaction) => {
    setEditTransaction(transaction);
    setFormData({
      date: transaction.date,
      company: transaction.company,
      mainCategory: transaction.mainCategory,
      subCategory: transaction.subCategory,
      amount: transaction.amount.toString(),
      mode: transaction.mode,
      bankName: transaction.bankName || '',
      note: transaction.note
    });
    setAvailableSubCategories(subCategories[transaction.mainCategory] || []);
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      company: '',
      mainCategory: '',
      subCategory: '',
      amount: '',
      mode: 'Cash',
      bankName: '',
      note: ''
    });
    setAvailableSubCategories([]);
  };

  const filteredTransactions = transactions.filter(trans =>
    trans.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
    trans.mainCategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
    trans.subCategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
    trans.note.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-500 mt-1">Record and manage all financial transactions</p>
        </div>
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#4f46e5] hover:bg-[#4338ca]">
              <Plus className="w-4 h-4 mr-2" />
              Add Transaction
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Transaction</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Select Company</Label>
                <Select value={formData.company} onValueChange={(value) => setFormData({ ...formData, company: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select company branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company} value={company}>{company}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mainCategory">Main Category</Label>
                <Select value={formData.mainCategory} onValueChange={handleMainCategoryChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select main category" />
                  </SelectTrigger>
                  <SelectContent>
                    {mainCategories.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subCategory">Sub Category</Label>
                <Select 
                  value={formData.subCategory} 
                  onValueChange={(value) => setFormData({ ...formData, subCategory: value })}
                  disabled={!formData.mainCategory}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sub category" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSubCategories.map((subCat) => (
                      <SelectItem key={subCat} value={subCat}>{subCat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (AED)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="Enter amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mode">Payment Mode</Label>
                <Select value={formData.mode} onValueChange={(value: any) => setFormData({ ...formData, mode: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank">Bank</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(formData.mode === 'Bank' || formData.mode === 'Cheque') && (
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Select value={formData.bankName} onValueChange={(value) => setFormData({ ...formData, bankName: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.map((bank) => (
                        <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="note">Transaction Note</Label>
                <Textarea
                  id="note"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="Enter transaction details or notes"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsAddModalOpen(false); resetForm(); }}>Cancel</Button>
              <Button className="bg-[#4f46e5] hover:bg-[#4338ca]" onClick={handleAddTransaction}>
                Add Transaction
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Total Inflow</p>
              <h3 className="text-2xl font-bold text-[#10b981]">
                AED {transactions
                  .filter(t => t.mainCategory === 'Cash Inflow')
                  .reduce((sum, t) => sum + t.amount, 0)
                  .toLocaleString()}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Total Outflow</p>
              <h3 className="text-2xl font-bold text-[#ef4444]">
                AED {transactions
                  .filter(t => t.mainCategory === 'Cash Outflow')
                  .reduce((sum, t) => sum + t.amount, 0)
                  .toLocaleString()}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Net Balance</p>
              <h3 className="text-2xl font-bold text-[#4f46e5]">
                AED {(transactions
                  .filter(t => t.mainCategory === 'Cash Inflow')
                  .reduce((sum, t) => sum + t.amount, 0) -
                  transactions
                  .filter(t => t.mainCategory === 'Cash Outflow')
                  .reduce((sum, t) => sum + t.amount, 0))
                  .toLocaleString()}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search transactions by company, category, or notes..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Transactions ({filteredTransactions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Main Category</TableHead>
                <TableHead>Sub Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">{transaction.date}</TableCell>
                  <TableCell className="text-sm max-w-xs truncate">{transaction.company.replace('Middle East Detectors Technologies - ', '')}</TableCell>
                  <TableCell>
                    <Badge variant={transaction.mainCategory === 'Cash Inflow' ? 'default' : 'destructive'}>
                      {transaction.mainCategory}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{transaction.subCategory}</TableCell>
                  <TableCell className={`font-semibold ${transaction.mainCategory === 'Cash Inflow' ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                    {transaction.mainCategory === 'Cash Inflow' ? '+' : '-'} AED {transaction.amount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{transaction.mode}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{transaction.bankName || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setViewTransaction(transaction)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Transaction Details</DialogTitle>
                          </DialogHeader>
                          {viewTransaction && (
                            <div className="space-y-4 py-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-gray-500">Date</p>
                                  <p className="font-medium">{viewTransaction.date}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Amount</p>
                                  <p className={`font-bold text-lg ${viewTransaction.mainCategory === 'Cash Inflow' ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                                    AED {viewTransaction.amount.toLocaleString()}
                                  </p>
                                </div>
                                <div className="col-span-2">
                                  <p className="text-sm text-gray-500">Company</p>
                                  <p className="font-medium">{viewTransaction.company}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Main Category</p>
                                  <Badge variant={viewTransaction.mainCategory === 'Cash Inflow' ? 'default' : 'destructive'}>
                                    {viewTransaction.mainCategory}
                                  </Badge>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Sub Category</p>
                                  <p className="font-medium">{viewTransaction.subCategory}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-500">Payment Mode</p>
                                  <Badge variant="outline">{viewTransaction.mode}</Badge>
                                </div>
                                {viewTransaction.bankName && (
                                  <div>
                                    <p className="text-sm text-gray-500">Bank Name</p>
                                    <p className="font-medium">{viewTransaction.bankName}</p>
                                  </div>
                                )}
                                <div className="col-span-2">
                                  <p className="text-sm text-gray-500">Note</p>
                                  <p className="font-medium">{viewTransaction.note}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                      <Dialog open={editTransaction?.id === transaction.id} onOpenChange={(open) => !open && setEditTransaction(null)}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openEditModal(transaction)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Edit Transaction</DialogTitle>
                          </DialogHeader>
                          <div className="grid grid-cols-2 gap-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="edit-date">Date</Label>
                              <Input
                                id="edit-date"
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-company">Select Company</Label>
                              <Select value={formData.company} onValueChange={(value) => setFormData({ ...formData, company: value })}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {companies.map((company) => (
                                    <SelectItem key={company} value={company}>{company}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-mainCategory">Main Category</Label>
                              <Select value={formData.mainCategory} onValueChange={handleMainCategoryChange}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {mainCategories.map((category) => (
                                    <SelectItem key={category} value={category}>{category}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-subCategory">Sub Category</Label>
                              <Select value={formData.subCategory} onValueChange={(value) => setFormData({ ...formData, subCategory: value })}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableSubCategories.map((subCat) => (
                                    <SelectItem key={subCat} value={subCat}>{subCat}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-amount">Amount (AED)</Label>
                              <Input
                                id="edit-amount"
                                type="number"
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-mode">Payment Mode</Label>
                              <Select value={formData.mode} onValueChange={(value: any) => setFormData({ ...formData, mode: value })}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Cash">Cash</SelectItem>
                                  <SelectItem value="Bank">Bank</SelectItem>
                                  <SelectItem value="Cheque">Cheque</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {(formData.mode === 'Bank' || formData.mode === 'Cheque') && (
                              <div className="space-y-2 col-span-2">
                                <Label htmlFor="edit-bankName">Bank Name</Label>
                                <Select value={formData.bankName} onValueChange={(value) => setFormData({ ...formData, bankName: value })}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {banks.map((bank) => (
                                      <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <div className="space-y-2 col-span-2">
                              <Label htmlFor="edit-note">Transaction Note</Label>
                              <Textarea
                                id="edit-note"
                                value={formData.note}
                                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                                rows={3}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => { setEditTransaction(null); resetForm(); }}>Cancel</Button>
                            <Button className="bg-[#4f46e5] hover:bg-[#4338ca]" onClick={handleEditTransaction}>
                              Save Changes
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeleteTransaction(transaction.id)}
                      >
                        <Trash2 className="w-4 h-4 text-[#ef4444]" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}