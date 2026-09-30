// Invoice Module - Form ViewModel  (cleaned + performance pass)
//
// KEY CHANGES vs previous version
//   1. PERFORMANCE: the form no longer blocks on fetchAllInvoices() (which
//      pulled every invoice ever created just to power the customer
//      autocomplete + duplicate-number check). The form now renders as soon as
//      a few fast reads resolve; products / employees / banks / customers load
//      in the background. Duplicate-number check is a targeted query at save.
//   2. Removed the external currency-rate API call (AED-only now).
//   3. Invoices are created UNPAID — no payment section is written here.
//      Payments are recorded later from the invoice list.
//   4. Customer contact info is upserted to the `customers` collection on save.
//   5. Salespersons can be added inline and persist (appConfig/salespersons).
//   6. Product rows snapshot supplierCost / purchaseCost from inventory.
//
// Interface is a SUPERSET of the previous one (new fields are additive) so the
// existing InvoiceFormView keeps compiling until the restyled view ships.

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  doc, getDoc, setDoc, runTransaction, collection, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { Invoice, InvoiceProduct, ProductInfo, CustomerRecord } from '../models/types';
import { sanitizeNameInput, sanitizePhoneInput } from '../../../utils/validators';
import {
  createEmptyInvoiceProduct, updateProductWithSelection, updateProductQuantity,
  updateProductPrice, updateSerialNumber,
  validateInvoice, calculateTotal,
  calculateMiscExpense, calculateSupplierCost, calculatePurchaseCost,
  salespersonLocations, deliveryStatuses, collectionMethods,
  formatCurrency, InvoiceCurrency, CURRENCY_RATE_FALLBACK,
} from '../models/invoiceService';
import { InvoiceFirebaseService } from '../models/InvoiceFirebaseService';
import { CustomerFirebaseService } from '../models/CustomerFirebaseService';
import { generateInvoicePdf, downloadInvoicePdf } from '../models/invoicePdfService';
import { InventoryFirebaseService } from '../../inventory/models/InventoryFirebaseService';
import { EmployeeFirebaseService } from '../../employee/models/employeeFirebaseService';
import { BankFirebaseService } from '../../banking/models/bankFirebaseService';
import { TxCompany } from '../../transactions/models/TransactionBridgeService';
import { createFuturisticPayablesFromInvoice } from '../../Payable-to-futuristic/models/futuristicPayableBridge';

// Default branches — always available even before Firestore loads
export const DEFAULT_BRANCHES = ['Saudia', 'Chad'];
const COMPANY_PREFIX = 'Bullion Electronics - ';

export function makeBranchValue(branch: string): TxCompany {
  return `${COMPANY_PREFIX}${branch}` as TxCompany;
}
export function branchFromValue(value: string): string {
  return value.replace(COMPANY_PREFIX, '');
}
export function getCurrencyFromBranch(branch: string): InvoiceCurrency {
  switch (branch) {
    case 'Saudia': return 'SAR';
    case 'Chad': return 'CAD';
    default: return 'AED';
  }
}

interface Employee { id: string; name: string; position: string; status: 'active' | 'inactive'; }
interface Bank { id: string; name: string; accountNumber: string; balance: number; }

export interface UseInvoiceFormViewModelReturn {
  formData: Partial<Invoice>;
  selectedProducts: InvoiceProduct[];
  customerSuggestions: Invoice[];
  showSuggestions: boolean;
  isEditing: boolean;
  isLoading: boolean;
  isSaving: boolean;
  pdfGenerating: boolean;
  isDownloadingPdf: boolean;
  savedCountries: string[];
  savedCitiesForCountry: (country: string) => string[];
  handleAddCountryCity: (country: string, city: string) => Promise<void>;
  salespersonLocations: string[];
  deliveryStatuses: string[];
  collectionMethods: string[];
  availableProducts: ProductInfo[];
  productsLoading: boolean;
  activeEmployees: Employee[];
  banks: Bank[];
  // Salesperson persistence (NEW):
  savedSalespersons: string[];
  handleAddSalesperson: (name: string) => Promise<void>;
  setFormData: (data: Partial<Invoice>) => void;
  handleCustomerSearch: (value: string, field: 'customerName' | 'customerPhone') => void;
  handleCustomerSelect: (customer: Invoice) => void;
  addProduct: () => void;
  removeProduct: (id: string) => void;
  updateProduct: (id: string, field: string, value: any) => void;
  updateSerial: (productId: string, index: number, value: string) => void;
  getAvailableSerialsForProduct: (productId: string, rowId: string) => string[];
  handleSave: () => void;
  handleCancel: () => void;
  handleDownloadPdf: () => void;
  calculateTotal: () => number;
  formatCurrency: (amount: number) => string;
  invoiceCompany: TxCompany;
  setInvoiceCompany: (v: TxCompany) => void;
  branches: string[];
  handleAddBranch: (name: string) => Promise<void>;
  salespersonLocationsList: string[];
  handleAddSalespersonLocation: (name: string) => Promise<void>;
  selectedCurrencies: InvoiceCurrency[];
  toggleCurrency: (c: InvoiceCurrency) => void;
  currencyRates: Record<InvoiceCurrency, number>;
}

// ── Sequential invoice number generator ───────────────────────────────────────
async function generateSequentialInvoiceNumber(): Promise<string> {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const today = `${dd}${mm}${yy}`;
  const counterRef = doc(db, 'invoiceCounters', 'global');
  const seq = await runTransaction(db, async tx => {
    const snap = await tx.get(counterRef);
    if (!snap.exists() || snap.data().date !== today) {
      tx.set(counterRef, { date: today, seq: 1 });
      return 1;
    }
    const next = (snap.data().seq as number) + 1;
    tx.update(counterRef, { seq: next });
    return next;
  });
  return `INV-${today}-${String(seq).padStart(3, '0')}`;
}

// ── Country/City persistence ──────────────────────────────────────────────────
async function loadCountryCities(): Promise<Record<string, string[]>> {
  try {
    const snap = await getDoc(doc(db, 'appConfig', 'countryCities'));
    return snap.exists() ? (snap.data() as Record<string, string[]>) : {};
  } catch (err) {
    console.error('[CountryCities] load failed:', err);
    return {};
  }
}
async function saveCountryCities(data: Record<string, string[]>): Promise<void> {
  await setDoc(doc(db, 'appConfig', 'countryCities'), data, { merge: true });
}

// ── Cost extraction seam ──────────────────────────────────────────────────────
// Reads supplier/purchase cost from an inventory product. The exact field names
// live in the inventory module; this fallback chain is non-destructive (missing
// fields yield 0). >>> CONFIRM these names with inventory and trim the chain. <<<
function extractCost(p: any): { supplierCost: number; purchaseCost: number } {
  const isCredit = p.ownershipType === 'Credit';
  const isOwned = !p.ownershipType || p.ownershipType === 'Owned';
  const costFallback = Number(p.costPrice ?? p.cost ?? 0) || 0;

  const rawSupplier = Number(p.supplierCost ?? p.supplierPrice ?? p.supplierRate ?? 0) || 0;
  const rawPurchase = Number(p.purchaseCost ?? p.purchasePrice ?? p.landedCost ?? p.buyingPrice ?? 0) || 0;

  if (isCredit) {
    // Credit: supplier cost only — fall back to costPrice if not explicitly set
    return { supplierCost: rawSupplier || costFallback, purchaseCost: 0 };
  }
  if (isOwned) {
    // Owned: purchase cost only — fall back to costPrice if not explicitly set
    return { supplierCost: 0, purchaseCost: rawPurchase || costFallback };
  }
  // Unknown ownership — use whichever is set, prefer purchase cost
  if (rawSupplier > 0 && rawPurchase === 0) return { supplierCost: rawSupplier, purchaseCost: 0 };
  return { supplierCost: 0, purchaseCost: rawPurchase || costFallback };
}

// ── Product-row serialiser (guarantees imageUrls + cost are always present) ────
function mapToInvoiceProductRow(ip: InvoiceProduct): InvoiceProduct {
  return {
    id: ip.id,
    productId: ip.productId,
    productName: ip.productName,
    brandName: ip.brandName,
    modelName: ip.modelName,
    category: ip.category,
    description: ip.description,
    quantity: ip.quantity,
    price: ip.price,
    total: ip.total,
    serialNumbers: ip.serialNumbers || [],
    serialCities: ip.serialCities || {},
    currency: ip.currency || 'AED',
    imageUrls: Array.isArray(ip.imageUrls) && ip.imageUrls.length > 0 ? ip.imageUrls : [],
    supplierCost: ip.supplierCost || 0,
    purchaseCost: ip.purchaseCost || 0,
  };
}

function mapRawToProductInfo(p: any): ProductInfo {
  const { supplierCost, purchaseCost } = extractCost(p);
  // Be defensive about which field holds the image URLs — different code
  // paths (multi-model view, wizard, quick-add modal) have historically
  // saved under slightly different keys.
  let imageUrls: string[] = [];
  if (Array.isArray(p.imageUrls) && p.imageUrls.length > 0) imageUrls = p.imageUrls;
  else if (Array.isArray(p.images) && p.images.length > 0) imageUrls = p.images;
  else if (Array.isArray(p.photos) && p.photos.length > 0) imageUrls = p.photos;
  else if (Array.isArray(p.pictures) && p.pictures.length > 0) imageUrls = p.pictures;
  else if (typeof p.imageUrl === 'string' && p.imageUrl) imageUrls = [p.imageUrl];
  else if (typeof p.image === 'string' && p.image) imageUrls = [p.image];

  return {
    id: p.id,
    brandName: p.brandName || p.brand || '',
    modelName: p.modelName || p.model || '',
    category: p.category || '',
    sellPrice: p.sellPrice || p.salePrice || p.price || 0,
    supplierCost,
    purchaseCost,
    stock: typeof p.stock === 'number' ? p.stock : (p.serialNumbers?.length ?? 0),
    serialNumbers: p.serialNumbers || [],
    serialCities: p.serialCities || {},
    serialStatus: p.serialStatus || {},
    description: p.description || '',
    imageUrls,
  };
}

// Map a persistent customer record into the minimal Invoice-shaped object the
// existing autocomplete dropdown consumes.
function customerToSuggestion(c: CustomerRecord): Invoice {
  return {
    customerName: c.customerName, customerPhone: c.customerPhone,
    customerPhone2: c.customerPhone2, customerCNIC: c.customerCNIC,
    customerProvince: c.customerProvince, customerCity: c.customerCity,
    customerAddress: c.customerAddress, warrantyLocation: c.warrantyLocation,
    exchangeWarrantyNote: c.exchangeWarrantyNote || '',
  } as unknown as Invoice;
}

// ── Main ViewModel ─────────────────────────────────────────────────────────────
export function useInvoiceFormViewModel(): UseInvoiceFormViewModelReturn {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [allProducts, setAllProducts] = useState<ProductInfo[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [activeEmployees, setActiveEmployees] = useState<Employee[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [savedCustomers, setSavedCustomers] = useState<CustomerRecord[]>([]);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [invoiceCompany, setInvoiceCompany] = useState<TxCompany>(makeBranchValue(DEFAULT_BRANCHES[0]));
  const [branches, setBranches] = useState<string[]>(DEFAULT_BRANCHES);
  const [salespersonLocationsList, setSalespersonLocationsList] = useState<string[]>(salespersonLocations);
  const [savedSalespersons, setSavedSalespersons] = useState<string[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<InvoiceCurrency[]>(['AED']);
  const [countryCities, setCountryCities] = useState<Record<string, string[]>>({});

  const savedCountries = useMemo(() => Object.keys(countryCities).sort(), [countryCities]);
  const savedCitiesForCountry = useCallback(
    (country: string) => countryCities[country] || [], [countryCities],
  );

  const [formData, setFormDataState] = useState<Partial<Invoice>>({
    date: new Date().toISOString().split('T')[0],
    customerName: '', customerPhone: '', customerPhone2: '',
    customerCNIC: '', customerProvince: '', customerCity: '',
    customerAddress: '', warrantyLocation: '',
    exchangeWarrantyNote: '', deliveryStatus: 'Self-collect',
    status: 'Unpaid', salesperson: '', salespersonLocation: '',
    clientDealBy: '', referralBy: '', createdBy: '',
    collectionMethod: 'Self Collection',
    deductionCharges: 0,
    cargoAmount: 0, cargoCurrency: 'AED', customsAmount: 0, customsCurrency: 'AED',
    agentDetails: '', agentAmount: 0, agentCurrency: 'AED',
    digitalStamp: false,
  });

  const [selectedProducts, setSelectedProducts] = useState<InvoiceProduct[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<Invoice[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ── FAST initial load — only the essentials block render ───────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [countryCitiesData, invoiceNumber, branchSnap, spLocSnap, spSnap, existing] =
          await Promise.all([
            loadCountryCities(),
            !id ? generateSequentialInvoiceNumber().catch(() => 'INV-DRAFT') : Promise.resolve(''),
            getDoc(doc(db, 'appConfig', 'branches')).catch(() => null),
            getDoc(doc(db, 'appConfig', 'salespersonLocations')).catch(() => null),
            getDoc(doc(db, 'appConfig', 'salespersons')).catch(() => null),
            id ? InvoiceFirebaseService.fetchInvoiceById(id).catch(() => null) : Promise.resolve(null),
          ]);
        if (cancelled) return;

        setCountryCities(countryCitiesData);

        if (branchSnap && branchSnap.exists()) {
          const saved = (branchSnap.data().list as string[]) || DEFAULT_BRANCHES;
          setBranches([...new Set([...DEFAULT_BRANCHES, ...saved])].sort());
        }
        if (spLocSnap && spLocSnap.exists()) {
          const saved = (spLocSnap.data().list as string[]) || salespersonLocations;
          setSalespersonLocationsList([...new Set([...salespersonLocations, ...saved])].sort());
        }
        if (spSnap && spSnap.exists()) {
          setSavedSalespersons(((spSnap.data().list as string[]) || []).sort());
        }

        if (id && existing) {
          setEditingInvoice(existing);
          setFormDataState({ ...existing });
          setSelectedProducts((existing.products || []).map(p => ({ ...p })));
          setSelectedCurrencies(existing.selectedCurrencies || ['AED']);
          if (existing.customerProvince && existing.customerCity) {
            setCountryCities(prev => {
              const key = existing.customerProvince;
              const cities = [...new Set([...(prev[key] || []), existing.customerCity])];
              return { ...prev, [key]: cities };
            });
          }
        } else if (!id) {
          setFormDataState(prev => ({ ...prev, invoiceNumber }));
        }
      } catch (err) {
        console.error('Form load failed:', err);
        toast.error('Failed to load form data');
      } finally {
        if (!cancelled) setIsLoading(false);   // form renders now
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  // ── Background loads — never block the form ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);
    InventoryFirebaseService.fetchAllProducts()
      .then(raw => {
        if (cancelled) return;
        const infos = (raw as any[])
          .filter(p => p.receivableStatus !== 'Pending')
          .map(mapRawToProductInfo);
        setAllProducts(infos);
        // Diagnostic: how many products have images? Which don't?
        const withImg = infos.filter(p => p.imageUrls && p.imageUrls.length > 0);
        const withoutImg = infos.filter(p => !p.imageUrls || p.imageUrls.length === 0);
        console.log(`[Invoice] Loaded ${infos.length} products —`,
          `${withImg.length} have images, ${withoutImg.length} have none.`);
        if (withoutImg.length > 0 && withoutImg.length <= 20) {
          console.log('[Invoice] Products without images:',
            withoutImg.map(p => `${p.brandName} ${p.modelName} (${p.id})`));
        }
      })
      .catch(err => {
        console.error('fetchAllProducts failed:', err);
        toast.error('Could not load products — check Firestore rules');
      })
      .finally(() => { if (!cancelled) setProductsLoading(false); });

    EmployeeFirebaseService.fetchAllEmployees()
      .then(emps => { if (!cancelled) setActiveEmployees((emps as any[]).filter(e => e.status === 'active')); })
      .catch(() => { });
    BankFirebaseService.fetchAllBanks()
      .then(list => { if (!cancelled) setBanks(list as any[]); })
      .catch(() => { });
    CustomerFirebaseService.fetchAllCustomers()
      .then(list => { if (!cancelled) setSavedCustomers(list); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, []);

  // When products arrive after an edit-load, back-fill imageUrls/costs on rows.
  useEffect(() => {
    if (!editingInvoice || allProducts.length === 0) return;
    setSelectedProducts(prev => prev.map(ip => {
      const needsImg = !Array.isArray(ip.imageUrls) || ip.imageUrls.length === 0;
      const needsCost = !ip.supplierCost && !ip.purchaseCost;
      if (!needsImg && !needsCost) return ip;
      const src = allProducts.find(p => p.id === ip.productId);
      if (!src) return ip;
      return {
        ...ip,
        imageUrls: needsImg ? (src.imageUrls || []) : ip.imageUrls,
        supplierCost: needsCost ? (src.supplierCost || 0) : ip.supplierCost,
        purchaseCost: needsCost ? (src.purchaseCost || 0) : ip.purchaseCost,
      };
    }));
  }, [allProducts, editingInvoice]);

  const isEditing = !!editingInvoice;

  const setFormData = useCallback((data: Partial<Invoice>) => {
    setFormDataState(prev => ({ ...prev, ...data }));
  }, []);

  // ── Add country+city and persist ──────────────────────────────────────────
  const handleAddCountryCity = useCallback(async (country: string, city: string) => {
    const c = country.trim(); const ci = city.trim();
    if (!c) return;
    const isCountryOnly = ci === '__COUNTRY_ONLY__' || ci === '';
    const existingCities = countryCities[c] || [];
    const newCities = isCountryOnly ? existingCities : [...new Set([...existingCities, ci])].sort();
    const updated = { ...countryCities, [c]: newCities };
    setCountryCities(updated);
    if (!isCountryOnly) setFormData({ customerProvince: c, customerCity: ci });
    try {
      await saveCountryCities(updated);
      toast.success(isCountryOnly ? `Country "${c}" saved — now add a city` : `"${ci}, ${c}" saved for future invoices`);
    } catch (err: any) {
      console.error('[CountryCities] Firestore save failed:', err?.message);
      toast.error('Saved locally but database write failed');
    }
  }, [countryCities, setFormData]);

  const handleAddBranch = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = [...new Set([...branches, trimmed])].sort();
    setBranches(updated);
    setInvoiceCompany(makeBranchValue(trimmed));
    try {
      await setDoc(doc(db, 'appConfig', 'branches'), { list: updated }, { merge: true });
      toast.success(`Branch "${trimmed}" saved`);
    } catch { toast.error('Branch added locally but could not save to database'); }
  }, [branches]);

  const handleAddSalespersonLocation = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = [...new Set([...salespersonLocationsList, trimmed])].sort();
    setSalespersonLocationsList(updated);
    try {
      await setDoc(doc(db, 'appConfig', 'salespersonLocations'), { list: updated }, { merge: true });
      toast.success(`Location "${trimmed}" saved`);
    } catch { toast.error('Location added locally but could not save to database'); }
  }, [salespersonLocationsList]);

  // ── Salesperson persistence (NEW) ──────────────────────────────────────────
  const handleAddSalesperson = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = [...new Set([...savedSalespersons, trimmed])].sort();
    setSavedSalespersons(updated);
    setFormData({ salesperson: trimmed });
    try {
      await setDoc(doc(db, 'appConfig', 'salespersons'), { list: updated }, { merge: true });
      toast.success(`Salesperson "${trimmed}" saved for future invoices`);
    } catch { toast.error('Salesperson added locally but could not save to database'); }
  }, [savedSalespersons, setFormData]);

  const toggleCurrency = useCallback((c: InvoiceCurrency) => {
    setSelectedCurrencies(prev =>
      prev.includes(c) ? (prev.length > 1 ? prev.filter(x => x !== c) : prev) : [...prev, c]);
  }, []);

  const handleSetInvoiceCompany = useCallback((v: TxCompany) => {
    setInvoiceCompany(v);
    try {
      const currency = getCurrencyFromBranch(branchFromValue(v));
      setSelectedCurrencies(prev => (prev[0] === currency ? prev : [currency, ...prev.filter(c => c !== currency)]));
    } catch { /* non-blocking */ }
  }, []);

  // ── Customer search / select (from the small customers collection) ─────────
  const handleCustomerSearch = useCallback((value: string, field: 'customerName' | 'customerPhone') => {
    // Sanitize at the ViewModel level — the deepest enforcement point.
    // This ensures no matter what the View passes in, invalid chars never
    // reach state (handles race conditions, browser autofill, paste events).
    const clean = field === 'customerName'
      ? sanitizeNameInput(value)
      : sanitizePhoneInput(value);
    setFormData({ [field]: clean });
    if (clean.length >= 2) {
      const v = clean.toLowerCase();
      const matches = savedCustomers
        .filter(c => field === 'customerName'
          ? (c.customerName || '').toLowerCase().includes(v)
          : (c.customerPhone || '').includes(clean))
        .slice(0, 8)
        .map(customerToSuggestion);
      setCustomerSuggestions(matches);
      setShowSuggestions(matches.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [savedCustomers, setFormData]);

  const handleCustomerSelect = useCallback((customer: Invoice) => {
    // Also sanitize saved customer data in case legacy records have mixed content.
    setFormData({
      customerName: sanitizeNameInput(customer.customerName || ''),
      customerPhone: sanitizePhoneInput(customer.customerPhone || ''),
      customerPhone2: sanitizePhoneInput(customer.customerPhone2 || ''),
      customerCNIC: customer.customerCNIC,
      customerProvince: customer.customerProvince, customerCity: customer.customerCity,
      customerAddress: customer.customerAddress || '', warrantyLocation: customer.warrantyLocation || '',
      exchangeWarrantyNote: customer.exchangeWarrantyNote,
    });
    setShowSuggestions(false);
  }, [setFormData]);

  // ── Products ───────────────────────────────────────────────────────────────
  const addProduct = useCallback(() => {
    const product = createEmptyInvoiceProduct();
    product.currency = 'AED';
    setSelectedProducts(p => [...p, product]);
  }, []);

  const removeProduct = useCallback(
    (pid: string) => setSelectedProducts(p => p.filter(x => x.id !== pid)), []);

  const updateProduct = useCallback((pid: string, field: string, value: any) => {
    setSelectedProducts(prev => prev.map(p => {
      if (p.id !== pid) return p;
      switch (field) {
        case 'productId': {
          const updated = updateProductWithSelection(p, value, allProducts);
          const pInfo = allProducts.find(x => x.id === value);
          console.log(`[Invoice] Picked product "${pInfo?.brandName} ${pInfo?.modelName}" (${value}) — imageUrls:`, pInfo?.imageUrls);
          return {
            ...updated,
            currency: 'AED',
            imageUrls: Array.isArray(pInfo?.imageUrls) ? pInfo!.imageUrls : [],
            supplierCost: pInfo?.supplierCost || 0,
            purchaseCost: pInfo?.purchaseCost || 0,
          };
        }
        case 'quantity': return updateProductQuantity(p, value);
        case 'price': return updateProductPrice(p, value);
        case 'currency': return { ...p, currency: value };
        default: return { ...p, [field]: value };
      }
    }));
  }, [allProducts]);

  const updateSerial = useCallback((productId: string, index: number, value: string) => {
    setSelectedProducts(prev => prev.map(p => p.id !== productId ? p : updateSerialNumber(p, index, value)));
  }, []);

  const getAvailableSerialsForProduct = useCallback((productId: string, rowId: string): string[] => {
    const p = allProducts.find(x => x.id === productId);
    if (!p) return [];
    const usedElsewhere = new Set<string>();
    selectedProducts.forEach(row => {
      if (row.id === rowId || row.productId !== productId) return;
      (row.serialNumbers || []).forEach(s => { if (s.trim()) usedElsewhere.add(s); });
    });
    return (p.serialNumbers || []).filter(s => {
      if (!s.trim() || usedElsewhere.has(s)) return false;
      const status = p.serialStatus?.[s] || 'Available';
      return status === 'Available' || status === 'Returned';
    });
  }, [allProducts, selectedProducts]);

  const total = useMemo(() => calculateTotal(selectedProducts), [selectedProducts]);

  // ── PDF helpers ────────────────────────────────────────────────────────────
  const toCustomerInvoice = useCallback((inv: Invoice): Invoice => ({
    ...inv,
    salesperson: undefined, salespersonLocation: undefined, clientDealBy: undefined,
    referralBy: undefined, createdBy: undefined, paymentMode: undefined,
    bankId: undefined, bankName: undefined, bankAccountNumber: undefined,
    chequeNumber: undefined, chequeBank: undefined, chequeDate: undefined,
    collectionMethod: undefined,
  }), []);

    const generateAndSavePdf = useCallback(async (savedInvoice: Invoice): Promise<void> => {
    setPdfGenerating(true);
    try {
      console.log('🔎 [DEBUG] allProducts.length =', allProducts.length,
                  '| with images =', allProducts.filter((p: any) => p.imageUrls?.length > 0).length,
                  '| row imageUrls =', (savedInvoice.products?.[0] as any)?.imageUrls);
      const pdfBlob = await generateInvoicePdf(savedInvoice, { enrichWithProducts: allProducts });
            // No `as any` and no optional call. Both used to hide the fact that these
      // methods did not exist: the cast silenced the type error and `?.()`
      // swallowed it at runtime, so the upload silently never happened.
      const pdfUrl = await InvoiceFirebaseService.uploadInvoicePdf(savedInvoice.id, pdfBlob);
      await InvoiceFirebaseService.savePdfUrl(savedInvoice.id, pdfUrl);
    } catch (err) {
      console.error('PDF cloud upload failed:', err);
      toast.error('Invoice saved but PDF cloud upload failed.');
    } finally {
      setPdfGenerating(false);
    }
  }, [allProducts]);

  const handleDownloadPdf = useCallback(async () => {
    setIsDownloadingPdf(true);
    try {
      // Enrich rows the same way handleSave does — so images show up in a
      // preview PDF even before saving.
      const productRows = selectedProducts.map(mapToInvoiceProductRow).map(row => {
        const hasImages = Array.isArray(row.imageUrls) && row.imageUrls.length > 0;
        if (hasImages || !row.productId) return row;
        const src = allProducts.find(p => p.id === row.productId);
        const srcImages = src && Array.isArray(src.imageUrls) ? src.imageUrls : [];
        return srcImages.length > 0 ? { ...row, imageUrls: srcImages } : row;
      });
      const invoiceData: Partial<Invoice> = {
        ...formData,
        products: productRows,
        totalAmount: total,
      };
      await downloadInvoicePdf(toCustomerInvoice(invoiceData as Invoice), { enrichWithProducts: allProducts });
    } catch {
      toast.error('PDF download failed');
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [formData, selectedProducts, total, toCustomerInvoice, allProducts]);

  // ── Save (always UNPAID; payments recorded later from the list) ────────────
  const handleSave = useCallback(async () => {
    // Final sanitization pass — removes any chars that slipped through paste,
    // browser autofill, or rapid typing before the validation runs.
    const sanitizedFormData = {
      ...formData,
      customerName: sanitizeNameInput(formData.customerName || ''),
      customerPhone: sanitizePhoneInput(formData.customerPhone || ''),
      customerPhone2: sanitizePhoneInput(formData.customerPhone2 || ''),
    };
    const validation = validateInvoice(sanitizedFormData, selectedProducts);
    if (!validation.isValid) { toast.error(validation.error || 'Validation failed'); return; }
    // Propagate sanitized values back to formData before the write.
    setFormData({
      customerName: sanitizedFormData.customerName,
      customerPhone: sanitizedFormData.customerPhone,
      customerPhone2: sanitizedFormData.customerPhone2,
    });

    const proposedNumber = formData.invoiceNumber?.trim();
    if (proposedNumber) {
      try {
        const dupSnap = await getDocs(query(
          collection(db, 'invoices'), where('invoiceNumber', '==', proposedNumber),
        ));
        const conflict = dupSnap.docs.some(d => !isEditing || d.id !== editingInvoice?.id);
        if (conflict) {
          toast.error(`Invoice number "${proposedNumber}" is already in use.`, { duration: 6000 });
          return;
        }
      } catch (err) { console.warn('Duplicate-number check failed (continuing):', err); }
    }

    setIsSaving(true);
    try {
      // Product rows. As a safety net, if any row is missing imageUrls (e.g.
      // due to an older code path, an edit-load timing issue, or accidental
      // strip somewhere), re-hydrate from the live inventory record so the
      // PDF always has product images to render.
      const productRows = selectedProducts.map(mapToInvoiceProductRow).map(row => {
        const hasImages = Array.isArray(row.imageUrls) && row.imageUrls.length > 0;
        if (hasImages || !row.productId) return row;
        const src = allProducts.find(p => p.id === row.productId);
        const srcImages = src && Array.isArray(src.imageUrls) ? src.imageUrls : [];
        if (srcImages.length === 0) return row;
        console.log(`[Invoice] Enriched row ${row.productName} with ${srcImages.length} image(s) from inventory`);
        return { ...row, imageUrls: srcImages };
      });
      const baseInvoice = {
        totalAmount: total, products: productRows,
        deductionCharges: formData.deductionCharges || 0,
        cargoAmount: formData.cargoAmount || 0, customsAmount: formData.customsAmount || 0,
        agentAmount: formData.agentAmount || 0,
      } as Partial<Invoice>;

      const invoiceData: Omit<Invoice, 'id'> = {
        invoiceNumber: formData.invoiceNumber!,
        date: formData.date!,
        customerName: sanitizedFormData.customerName!,
        customerPhone: sanitizedFormData.customerPhone!,
        customerPhone2: sanitizedFormData.customerPhone2,
        customerCNIC: formData.customerCNIC!,
        customerProvince: formData.customerProvince || '',
        customerCity: formData.customerCity || '',
        customerAddress: formData.customerAddress,
        warrantyLocation: formData.warrantyLocation,
        products: productRows,
        exchangeWarrantyNote: formData.exchangeWarrantyNote || '',
        deliveryStatus: formData.deliveryStatus || 'Self-collect',
        deliveryReceivedStatus: editingInvoice?.deliveryReceivedStatus || 'Pending',
        totalAmount: total,
        // Always created UNPAID — payment happens from the list afterwards.
        status: editingInvoice ? (editingInvoice.status || 'Unpaid') : 'Unpaid',
        payments: editingInvoice?.payments || [],
        paidAmount: editingInvoice?.paidAmount || 0,
        remainingAmount: editingInvoice ? (editingInvoice.remainingAmount ?? total) : total,
        paymentStatus: editingInvoice?.paymentStatus || 'Unpaid',
        salesperson: formData.salesperson,
        salespersonLocation: formData.salespersonLocation,
        clientDealBy: formData.clientDealBy,
        referralBy: formData.referralBy,
        createdBy: formData.createdBy,
        collectionMethod: formData.collectionMethod,
        deductionCharges: formData.deductionCharges || 0,
        cargoAmount: formData.cargoAmount || 0,
        cargoCurrency: formData.cargoCurrency || 'AED',
        customsAmount: formData.customsAmount || 0,
        customsCurrency: formData.customsCurrency || 'AED',
        agentDetails: formData.agentDetails || '',
        agentAmount: formData.agentAmount || 0,
        agentCurrency: formData.agentCurrency || 'AED',
        supplierCostTotal: calculateSupplierCost(baseInvoice),
        purchaseCostTotal: calculatePurchaseCost(baseInvoice),
        miscExpense: calculateMiscExpense(baseInvoice),
        digitalStamp: formData.digitalStamp,
        branch: branchFromValue(invoiceCompany),
        selectedCurrencies: selectedCurrencies,
      } as any;

      let saved: Invoice;

      if (isEditing && editingInvoice) {
        await InvoiceFirebaseService.updateInvoice(editingInvoice.id, invoiceData as any);
        saved = { ...invoiceData, id: editingInvoice.id };
        toast.success('Invoice updated — downloading PDF…');
      } else {
        // Deduct inventory serials — mark Sold (keep serial in serialNumbers
        // so the Inventory Report can still render the row with a Sold badge).
        //
        // Route through InventoryFirebaseService.markSerialsSold — a single
        // canonical write-point that updates:
        //   - serialStatus[serial] = 'Sold'
        //   - serialSoldDates[serial] = <ISO>
        //   - serialInvoiceNumbers[serial] = <invoice number>
        // in one shot, so the Inventory dashboard's "Invoice #" column
        // populates correctly for every future invoice.
        const invoiceNumberForLink = formData.invoiceNumber!;
        const soldNow = new Date().toISOString();
        for (const ip of selectedProducts) {
          if (!ip.productId || !ip.serialNumbers?.length) continue;
          const soldSerials = ip.serialNumbers.filter(s => s.trim() !== '');
          if (soldSerials.length === 0) continue;
          try {
            await InventoryFirebaseService.markSerialsSold(
              ip.productId,
              soldSerials.map(s => ({ serial: s, invoiceNumber: invoiceNumberForLink, soldDate: soldNow })),
              soldNow,
            );
            // Stock is a separate available-count field the dashboard shows;
            // markSerialsSold intentionally doesn't touch it (that would
            // race with concurrent invoice saves). Decrement here as a
            // dedicated single-field update.
            const product = await InventoryFirebaseService.fetchProductById(ip.productId);
            if (product) {
              await InventoryFirebaseService.updateProduct(ip.productId, {
                stock: Math.max(0, (product.stock || 0) - ip.quantity),
              } as any);
            }
          } catch (err) {
            console.error('Inventory update failed for', ip.productId, err);
          }
        }

        const created = await InvoiceFirebaseService.createInvoice(invoiceData as any);
        saved = created;

        createFuturisticPayablesFromInvoice({
          invoiceId: created.id, invoiceNumber: invoiceData.invoiceNumber,
          saleDate: invoiceData.date, products: selectedProducts,
        }).catch(err => console.error('[FuturisticPayable] BRIDGE ERROR:', err));

        // Persist the customer for fast pre-fill next time.
        CustomerFirebaseService.upsertCustomer(
          CustomerFirebaseService.customerFromInvoice(invoiceData),
          { invoiceDate: invoiceData.date },
        ).catch(err => console.warn('[Customers] upsert failed (non-blocking):', err));

        if (invoiceData.customerProvince && invoiceData.customerCity) {
          const country = invoiceData.customerProvince, city = invoiceData.customerCity;
          const updated = { ...countryCities, [country]: [...new Set([...(countryCities[country] || []), city])].sort() };
          setCountryCities(updated);
          saveCountryCities(updated).catch(console.warn);
        }

        // NOTE: no transaction is booked here — invoices are Unpaid on creation.
        toast.success('Invoice created — downloading PDF…');
      }
try { await downloadInvoicePdf(toCustomerInvoice(saved), { enrichWithProducts: allProducts }); }
      catch { toast.error('Invoice saved but PDF download failed'); }
      generateAndSavePdf(saved);
      // Commission only fires once an invoice is actually Paid (won't trigger here).
      if (saved.status === 'Paid' && saved.salesperson) {
      }

      await new Promise<void>(resolve => setTimeout(resolve, 300));
      navigate('/invoices');
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('Failed to save invoice');
    } finally {
      setIsSaving(false);
    }
  }, [formData, selectedProducts, total, isEditing, editingInvoice, countryCities, navigate, generateAndSavePdf, toCustomerInvoice, invoiceCompany, selectedCurrencies, allProducts]);

  const handleCancel = useCallback(() => navigate('/invoices'), [navigate]);

  return {
    formData, selectedProducts, customerSuggestions, showSuggestions,
    isEditing, isLoading, isSaving, pdfGenerating, isDownloadingPdf,
    savedCountries, savedCitiesForCountry, handleAddCountryCity,
    salespersonLocations: salespersonLocationsList,
    deliveryStatuses: deliveryStatuses as string[],
    collectionMethods: collectionMethods as string[],
    availableProducts: allProducts, productsLoading,
    activeEmployees, banks,
    savedSalespersons, handleAddSalesperson,
    setFormData, handleCustomerSearch, handleCustomerSelect,
    addProduct, removeProduct, updateProduct, updateSerial,
    getAvailableSerialsForProduct,
    handleSave, handleCancel, handleDownloadPdf,
    calculateTotal: () => total,
    formatCurrency,
    invoiceCompany, setInvoiceCompany: handleSetInvoiceCompany,
    branches, handleAddBranch,
    salespersonLocationsList, handleAddSalespersonLocation,
    selectedCurrencies, toggleCurrency,
    currencyRates: CURRENCY_RATE_FALLBACK,
  };
}