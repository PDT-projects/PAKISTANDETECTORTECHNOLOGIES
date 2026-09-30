import { useState } from 'react';
import { Calculator, Check, Edit, X, FileText, Percent, DollarSign, Calendar, MapPin, User, Maximize2, Minimize2, TrendingUp, Award, Target, BarChart3, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { LockedScrollTable } from '../../shared/components/LockedScrollTable';
import { getGlobalCurrencySymbol } from '../../shared/currency/globalCurrency';

type Commission = {
  id: string;
  salesperson: string;
  salespersonName: string;
  city: string;
  month: string; // Format: "YYYY-MM"
  totalSales: number;
  appliedSlabFrom: number;
  appliedSlabTo: number;
  commissionPercentage: number;
  calculatedCommissionAmount: number;
  overriddenCommissionPercentage?: number;
  overriddenCommissionAmount?: number;
  status: 'Calculated' | 'Adjusted' | 'Confirmed';
  calculatedBy: string;
  confirmedBy?: string;
  calculatedAt: string;
  confirmedAt?: string;
  isLocked: boolean;
};

type CommissionSlab = {
  id: string;
  salesperson: string;
  city: string;
  fromAmount: number;
  toAmount: number;
  commissionPercentage: number;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  customerCNIC: string;
  customerProvince: string;
  customerCity: string;
  customerAddress?: string;
  warrantyLocation?: string;
  products: any[];
  exchangeWarrantyNote: string;
  deliveryStatus: 'Self-collect' | 'LCS' | 'Daewoo' | 'Delivered';
  deliveryReceivedStatus: 'Pending' | 'In Process' | 'Received';
  totalAmount: number;
  status: 'Paid' | 'Unpaid';
  salesperson?: string;
  salespersonLocation?: string;
  referFrom?: string;
  referTo?: string;
  createdBy?: string;
  paymentMode?: 'Cash' | 'Online';
  bankId?: string;
  bankName?: string;
  bankAccountNumber?: string;
  paymentStatus?: 'Full' | 'Partial';
  paidAmount?: number;
  remainingAmount?: number;
  collectionMethod?: 'Self Collection' | 'TCS' | 'LCS' | 'Daewoo' | 'Others';
  deductionCharges: number;
  imageUrl?: string;
  paidBy?: string;
  paidTo?: string;
};

type CommissionCalculationProps = {
  commissions: Commission[];
  setCommissions: (commissions: Commission[]) => void;
  commissionSlabs: CommissionSlab[];
  invoices: Invoice[];
  employees: any[];
  setActiveModule: (module: string) => void;
};

const cities = ['Karachi', 'Lahore', 'Islamabad', 'Bullion RND/SITE'];

export function CommissionCalculation({
  commissions,
  setCommissions,
  commissionSlabs,
  invoices,
  employees,
  setActiveModule
}: CommissionCalculationProps) {
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [commissionData, setCommissionData] = useState<Commission[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ percentage: number; amount: number }>({ percentage: 0, amount: 0 });
  const [showModal, setShowModal] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Calculate commission for selected city and month
  const calculateCommission = () => {
    if (!selectedCity || !selectedMonth) {
      toast.error('Please select both city and month');
      return;
    }

    console.log('Selected City:', selectedCity);
    console.log('Selected Month:', selectedMonth);
    console.log('All Invoices:', invoices);
    console.log('Commission Slabs:', commissionSlabs);

    // Filter invoices for the selected city and month
    const monthInvoices = invoices.filter(invoice => {
      const invoiceDate = new Date(invoice.date);
      const invoiceMonth = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;
      console.log(`Invoice ${invoice.id}: Date=${invoice.date}, Month=${invoiceMonth}, City=${invoice.customerCity}, Status=${invoice.status}, Salesperson=${invoice.salesperson}`);
      return invoice.customerCity === selectedCity && invoiceMonth === selectedMonth && invoice.status === 'Paid';
    });

    console.log('Filtered Invoices:', monthInvoices);

    // Group sales by salesperson
    const salesBySalesperson: { [key: string]: number } = {};
    monthInvoices.forEach(invoice => {
      if (invoice.salesperson) {
        salesBySalesperson[invoice.salesperson] = (salesBySalesperson[invoice.salesperson] || 0) + invoice.totalAmount;
      }
    });

    console.log('Sales by Salesperson:', salesBySalesperson);

    // Calculate commission for each salesperson
    const calculatedCommissions: Commission[] = [];
    Object.entries(salesBySalesperson).forEach(([salespersonId, totalSales]) => {
      const employee = employees.find(emp => emp.id === salespersonId);
      console.log(`Processing salesperson ${salespersonId}: Employee found =`, employee);
      if (!employee) return;

      // Find applicable commission slab
      const applicableSlab = commissionSlabs
        .filter(slab => slab.salesperson === salespersonId && slab.city === selectedCity)
        .find(slab => totalSales >= slab.fromAmount && totalSales <= slab.toAmount);

      console.log(`Applicable slab for ${salespersonId} in ${selectedCity}:`, applicableSlab);

      if (!applicableSlab) {
        toast.error(`No commission slab found for ${employee.name} in ${selectedCity}`);
        return;
      }

      const commissionAmount = (totalSales * applicableSlab.commissionPercentage) / 100;

      const commission: Commission = {
        id: `COM-${Date.now()}-${salespersonId}`,
        salesperson: salespersonId,
        salespersonName: employee.name,
        city: selectedCity,
        month: selectedMonth,
        totalSales,
        appliedSlabFrom: applicableSlab.fromAmount,
        appliedSlabTo: applicableSlab.toAmount,
        commissionPercentage: applicableSlab.commissionPercentage,
        calculatedCommissionAmount: commissionAmount,
        status: 'Calculated',
        calculatedBy: 'Admin', // In a real app, this would be the current user
        calculatedAt: new Date().toISOString(),
        isLocked: false
      };

      calculatedCommissions.push(commission);
    });

    console.log('Calculated Commissions:', calculatedCommissions);

    if (calculatedCommissions.length === 0) {
      toast.error('No sales data found for the selected city and month');
      return;
    }

    setCommissionData(calculatedCommissions);
    setShowModal(true);
  };

  // Confirm commission
  const confirmCommission = (commissionId: string) => {
    const updatedCommissions = commissionData.map(commission => {
      if (commission.id === commissionId) {
        return {
          ...commission,
          status: 'Confirmed' as const,
          confirmedBy: 'Admin', // In a real app, this would be the current user
          confirmedAt: new Date().toISOString(),
          isLocked: true
        };
      }
      return commission;
    });

    setCommissionData(updatedCommissions);

    // Save to main commissions array
    const commissionToSave = updatedCommissions.find(c => c.id === commissionId);
    if (commissionToSave) {
      setCommissions([...commissions, commissionToSave]);
    }

    toast.success('Commission confirmed and locked');
  };

  // Edit commission
  const startEdit = (commission: Commission) => {
    setIsEditing(commission.id);
    setEditValues({
      percentage: commission.overriddenCommissionPercentage || commission.commissionPercentage,
      amount: commission.overriddenCommissionAmount || commission.calculatedCommissionAmount
    });
  };

  const saveEdit = (commissionId: string) => {
    const updatedCommissions = commissionData.map(commission => {
      if (commission.id === commissionId) {
        return {
          ...commission,
          overriddenCommissionPercentage: editValues.percentage,
          overriddenCommissionAmount: editValues.amount,
          status: 'Adjusted' as const
        };
      }
      return commission;
    });

    setCommissionData(updatedCommissions);
    setIsEditing(null);
    toast.success('Commission adjusted successfully');
  };

  const cancelEdit = () => {
    setIsEditing(null);
  };

  // Cancel calculation
  const cancelCalculation = () => {
    setCommissionData([]);
    setSelectedCity('');
    setSelectedMonth('');
    setShowModal(false);
    toast.info('Commission calculation cancelled');
  };

  // Handle modal confirm
  const handleModalConfirm = () => {
    // Confirm all commissions
    const confirmedCommissions = commissionData.map(commission => ({
      ...commission,
      status: 'Confirmed' as const,
      confirmedBy: 'Admin',
      confirmedAt: new Date().toISOString(),
      isLocked: true
    }));

    setCommissions([...commissions, ...confirmedCommissions]);
    setShowModal(false);
    setCommissionData([]);
    setSelectedCity('');
    setSelectedMonth('');
    toast.success('Commission confirmed and saved');
  };

  // Handle modal cancel
  const handleModalCancel = () => {
    setShowModal(false);
    setCommissionData([]);
    setSelectedCity('');
    setSelectedMonth('');
  };

  const formatCurrency = (amount: number) => {
    const symbol = getGlobalCurrencySymbol();
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
    return `${symbol} ${formatted}`;
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveModule('salary')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"
            title="Back to Salary"
          >
            <ArrowLeft size={20} />
            Back
          </button>
          <div>
            <h2 className="text-2xl font-bold">Commission Calculation</h2>
            <p className="text-sm text-gray-600 mt-1">Calculate and manage salesperson commissions</p>
          </div>
        </div>
      </div>

      {/* Selection Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <MapPin size={16} className="inline mr-2" />
              City / Territory
            </label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
            >
              <option value="">Select City</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar size={16} className="inline mr-2" />
              Month & Year
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={calculateCommission}
              className="w-full bg-[#4f46e5] text-white px-6 py-2 rounded-lg hover:bg-[#4338ca] transition-colors flex items-center justify-center gap-2"
            >
              <Calculator size={20} />
              Calculate Commission
            </button>
          </div>
        </div>
      </div>

      {/* Commission Summary Table */}
      {commissionData.length > 0 && !showModal && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Commission Summary - {selectedCity} ({formatMonth(selectedMonth)})</h3>
          </div>

          <LockedScrollTable maxHeight="65vh">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                    <User size={14} className="inline mr-1" />
                    Salesperson
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                    <MapPin size={14} className="inline mr-1" />
                    City
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                    <Calendar size={14} className="inline mr-1" />
                    Month
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                    <DollarSign size={14} className="inline mr-1" />
                    Total Sales
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                    Applied Slab
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                    <Percent size={14} className="inline mr-1" />
                    Commission %
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                    <DollarSign size={14} className="inline mr-1" />
                    Commission Amount
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {commissionData.map((commission) => (
                  <tr key={commission.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {commission.salespersonName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{commission.city}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatMonth(commission.month)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(commission.totalSales)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {formatCurrency(commission.appliedSlabFrom)} - {formatCurrency(commission.appliedSlabTo)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {isEditing === commission.id ? (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editValues.percentage}
                          onChange={(e) => setEditValues({ ...editValues, percentage: Number(e.target.value) })}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-right"
                        />
                      ) : (
                        `${commission.overriddenCommissionPercentage || commission.commissionPercentage}%`
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {isEditing === commission.id ? (
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={editValues.amount}
                          onChange={(e) => setEditValues({ ...editValues, amount: Number(e.target.value) })}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                        />
                      ) : (
                        formatCurrency(commission.overriddenCommissionAmount || commission.calculatedCommissionAmount)
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        commission.status === 'Confirmed'
                          ? 'bg-green-100 text-green-800'
                          : commission.status === 'Adjusted'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {commission.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <div className="flex items-center justify-center gap-2">
                        {commission.status !== 'Confirmed' && (
                          <>
                            {isEditing === commission.id ? (
                              <>
                                <button
                                  onClick={() => saveEdit(commission.id)}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                  title="Save"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                                  title="Cancel"
                                >
                                  <X size={16} />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => startEdit(commission)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                title="Edit"
                              >
                                <Edit size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => confirmCommission(commission.id)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Confirm"
                            >
                              <Check size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </LockedScrollTable>

          {/* Action Buttons */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={cancelCalculation}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Commission Report Section */}
      {commissions.length > 0 && (
        <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <FileText size={20} />
              Commission Report
            </h3>
          </div>

          <LockedScrollTable maxHeight="65vh">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Salesperson</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Sales</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Commission %</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Commission Amount</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {commissions.map((commission) => (
                  <tr key={commission.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {commission.salespersonName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{commission.city}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatMonth(commission.month)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(commission.totalSales)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {commission.overriddenCommissionPercentage || commission.commissionPercentage}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(commission.overriddenCommissionAmount || commission.calculatedCommissionAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        commission.status === 'Confirmed'
                          ? 'bg-green-100 text-green-800'
                          : commission.status === 'Adjusted'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {commission.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </LockedScrollTable>
        </div>
      )}

      {/* Commission Modal */}
      {showModal && (
        <div className={`fixed inset-0 bg-black bg-opacity-50 flex ${isFullScreen ? 'items-start' : 'items-center justify-center'} z-50`}>
          <div className={`bg-gray-50 rounded-lg shadow-xl ${isFullScreen ? 'w-full h-full' : 'max-w-4xl w-full mx-4 max-h-[90vh]'} overflow-hidden`}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Commission Summary - {selectedCity} ({formatMonth(selectedMonth)})</h3>
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
              >
                {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </button>
            </div>

            <div className={`p-6 overflow-y-auto ${isFullScreen ? 'max-h-[calc(100vh-200px)]' : 'max-h-[60vh]'}`}>
              <LockedScrollTable maxHeight="65vh">
                <table className="w-full min-w-max">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                        <User size={14} className="inline mr-1" />
                        Salesperson
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                        <MapPin size={14} className="inline mr-1" />
                        City
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                        <Calendar size={14} className="inline mr-1" />
                        Month
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                        <DollarSign size={14} className="inline mr-1" />
                        Total Sales
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">
                        Applied Slab
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">
                        <Percent size={14} className="inline mr-1" />
                        Commission %
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">
                        <DollarSign size={14} className="inline mr-1" />
                        Commission Amount
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]">Status</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {commissionData.map((commission) => (
                      <tr key={commission.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {commission.salespersonName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{commission.city}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatMonth(commission.month)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {formatCurrency(commission.totalSales)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                          {formatCurrency(commission.appliedSlabFrom)} - {formatCurrency(commission.appliedSlabTo)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {isEditing === commission.id ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={editValues.percentage}
                              onChange={(e) => setEditValues({ ...editValues, percentage: Number(e.target.value) })}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-right"
                            />
                          ) : (
                            `${commission.overriddenCommissionPercentage || commission.commissionPercentage}%`
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {isEditing === commission.id ? (
                            <input
                              type="number"
                              min="0"
                              step="100"
                              value={editValues.amount}
                              onChange={(e) => setEditValues({ ...editValues, amount: Number(e.target.value) })}
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                            />
                          ) : (
                            formatCurrency(commission.overriddenCommissionAmount || commission.calculatedCommissionAmount)
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            commission.status === 'Confirmed'
                              ? 'bg-green-100 text-green-800'
                              : commission.status === 'Adjusted'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {commission.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                          <div className="flex items-center justify-center gap-2">
                            {commission.status !== 'Confirmed' && (
                              <>
                                {isEditing === commission.id ? (
                                  <>
                                    <button
                                      onClick={() => saveEdit(commission.id)}
                                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                                      title="Save"
                                    >
                                      <Check size={16} />
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                                      title="Cancel"
                                    >
                                      <X size={16} />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => startEdit(commission)}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                    title="Edit"
                                  >
                                    <Edit size={16} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </LockedScrollTable>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={handleModalCancel}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleModalConfirm}
                className="px-4 py-2 bg-[#4f46e5] text-white rounded-lg hover:bg-[#4338ca] transition-colors"
              >
                Confirm All Commissions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
