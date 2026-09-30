// Invoice Module - Report ViewModel

import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Invoice, InvoiceStats } from '../models/types';
import {
  filterInvoices, calculateInvoiceStats, formatCurrency,
  exportInvoicesToCSV, downloadCSV,
} from '../models/invoiceService';
import { InvoiceFirebaseService } from '../models/InvoiceFirebaseService';

export interface UseInvoiceReportViewModelReturn {
  invoices: Invoice[];
  filteredInvoices: Invoice[];
  stats: InvoiceStats;
  isLoading: boolean;
  dateFrom: string;
  dateTo: string;
  selectedCity: string[];
  selectedSalesperson: string[];
  selectedStatus: string[];
  viewInvoice: Invoice | null;
  cities: string[];
  salespersons: string[];
  statuses: string[];
  setDateFrom: (date: string) => void;
  setDateTo: (date: string) => void;
  setSelectedCity: (city: string[]) => void;
  setSelectedSalesperson: (s: string[]) => void;
  setSelectedStatus: (s: string[]) => void;
  handleViewInvoice: (invoice: Invoice) => void;
  handleCloseView: () => void;
  handleClearFilters: () => void;
  handleExportCSV: () => void;
  formatCurrency: (amount: number) => string;
  formatDate: (dateString: string) => string;
}

export function useInvoiceReportViewModel(): UseInvoiceReportViewModelReturn {
  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [selectedCity,        setSelectedCity]        = useState<string[]>([]);
  const [selectedSalesperson, setSelectedSalesperson] = useState<string[]>([]);
  const [selectedStatus,      setSelectedStatus]      = useState<string[]>([]);
  const [viewInvoice,         setViewInvoice]         = useState<Invoice | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const data = await InvoiceFirebaseService.fetchAllInvoices();
        setInvoices(data);
      } catch {
        toast.error('Failed to load invoices for report');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const cities = useMemo(() =>
    [...new Set(invoices.map(i => i.customerCity).filter(Boolean))].sort(), [invoices]);

  const salespersons = useMemo(() =>
    [...new Set(invoices.map(i => i.salesperson).filter(Boolean) as string[])].sort(), [invoices]);

  const statuses = ['Paid', 'Unpaid'];

  const filteredInvoices = useMemo(() => {
    let result = [...invoices];
    if (dateFrom) result = result.filter(i => i.date >= dateFrom);
    if (dateTo)   result = result.filter(i => i.date <= dateTo);
    if (selectedCity.length > 0)        result = result.filter(i => selectedCity.includes(i.customerCity || ''));
    if (selectedSalesperson.length > 0) result = result.filter(i => selectedSalesperson.includes(i.salesperson || ''));
    if (selectedStatus.length > 0)      result = result.filter(i => selectedStatus.includes(i.status));
    return result;
  }, [invoices, dateFrom, dateTo, selectedCity, selectedSalesperson, selectedStatus]);

  const stats = useMemo(() => calculateInvoiceStats(filteredInvoices), [filteredInvoices]);

  const handleViewInvoice  = useCallback((invoice: Invoice) => setViewInvoice(invoice), []);
  const handleCloseView    = useCallback(() => setViewInvoice(null), []);
  const handleClearFilters = useCallback(() => {
    setDateFrom(''); setDateTo(''); setSelectedCity([]);
    setSelectedSalesperson([]); setSelectedStatus([]);
  }, []);
  const handleExportCSV = useCallback(() => {
    const csv = exportInvoicesToCSV(filteredInvoices);
    downloadCSV(csv, `invoice-report-${new Date().toISOString().split('T')[0]}.csv`);
  }, [filteredInvoices]);

  const formatDate = useCallback((d: string) =>
    d ? new Date(d).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' }) : '', []);

  return {
    invoices, filteredInvoices, stats, isLoading,
    dateFrom, dateTo, selectedCity, selectedSalesperson, selectedStatus, viewInvoice,
    cities, salespersons, statuses,
    setDateFrom, setDateTo, setSelectedCity, setSelectedSalesperson, setSelectedStatus,
    handleViewInvoice, handleCloseView, handleClearFilters, handleExportCSV,
    formatCurrency, formatDate,
  };
}