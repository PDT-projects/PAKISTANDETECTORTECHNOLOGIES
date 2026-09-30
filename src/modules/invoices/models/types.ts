// Invoice Module - Model Layer (UPDATED)
// Added:
//   • Payment history model (invoices are Unpaid on creation; payments are
//     recorded later from the list → status becomes Partial / Paid)
//   • Per-product cost snapshot (supplierCost / purchaseCost) captured at sale
//     time so the list can show Supplier Cost, Purchase Cost & Misc Expense
//   • CustomerRecord for the persistent `customers` collection

export type InvoiceCurrency = 'PKR' | 'CAD' | 'SAR' | 'AED';

export type PaymentMode = 'Cash' | 'Bank' | 'Cheque';

// ── A single payment recorded against an invoice ────────────────────────────
export interface InvoicePayment {
  id: string;                 // local uuid / timestamp id
  amount: number;             // amount received in this payment (AED)
  mode: PaymentMode;          // Cash | Bank | Cheque
  date: string;               // YYYY-MM-DD — when the payment was received
  bankId?: string;
  bankName?: string;
  bankAccountNumber?: string;
  chequeNumber?: string;
  chequeBank?: string;
  chequeDate?: string;
  note?: string;
  recordedBy?: string;        // uid/email of the user who logged it
  recordedByEmail?: string;
  recordedAt?: string;        // ISO timestamp the record was written
}

export interface InvoiceProduct {
  id: string;
  productId: string;
  productName: string;
  brandName: string;
  modelName: string;
  category: string;
  description: string;
  quantity: number;
  price: number;              // sell price per unit (AED)
  total: number;              // price * quantity
  serialNumbers: string[];
  serialCities?: { [serialNumber: string]: string };
  currency: InvoiceCurrency;
  imageUrls?: string[];

  // ── Cost snapshot (captured at sale time from the inventory product) ──
  // Per-unit costs. Aggregated across quantity by the invoiceService helpers.
  supplierCost?: number;      // per-unit supplier cost (AED)
  purchaseCost?: number;      // per-unit landed/purchase cost (AED)
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  customerCNIC: string;
  customerProvince: string;
  customerCity: string;
  /**
   * Whether product images appear on this invoice's PDF.
   *
   * Optional and read as `!== false`, so an invoice issued before this setting
   * existed keeps showing images. Making it required, or defaulting to false,
   * would silently change every invoice already in the system.
   */
  showProductImages?: boolean;
  customerAddress?: string;
  warrantyLocation?: string;
  products: InvoiceProduct[];
  exchangeWarrantyNote: string;
  deliveryStatus: 'Self-collect' | 'LCS' | 'Daewoo' | 'Delivered';
  deliveryReceivedStatus: 'Pending' | 'In Process' | 'Received';
  totalAmount: number;

  // Payment lifecycle. Every new invoice starts 'Unpaid'; recording payments
  // moves it to 'Partial' and finally 'Paid'. 'Returned' is set by Inventory.
  status: 'Paid' | 'Unpaid' | 'Partial' | 'Returned';

  salesperson?: string;
  salespersonLocation?: string;
  branch?: string;
  clientDealBy?: string;
  referralBy?: string;
  createdBy?: string;

  // ── Payment tracking ──
  payments?: InvoicePayment[];      // full history of received payments
  paidAmount?: number;              // sum of payments (AED)
  remainingAmount?: number;         // totalAmount - paidAmount
  paymentStatus?: 'Full' | 'Partial' | 'Unpaid';
  // Denormalised "latest payment" fields for quick list rendering:
  paymentMode?: 'Cash' | 'Online' | 'Cheque';
  lastPaymentDate?: string;
  bankId?: string;
  bankName?: string;
  bankAccountNumber?: string;
  chequeNumber?: string;
  chequeBank?: string;
  chequeDate?: string;

  collectionMethod?: 'Self Collection' | 'TCS' | 'LCS' | 'Daewoo' | 'Others';

  // ── Expense / deduction fields (the "miscellaneous expense") ──
  deductionCharges: number;
  cargoAmount?: number;
  cargoCurrency?: InvoiceCurrency;
  customsAmount?: number;
  customsCurrency?: InvoiceCurrency;
  agentAmount?: number;
  agentCurrency?: InvoiceCurrency;
  agentDetails?: string;

  // ── Cost snapshot totals (denormalised at save; helpers can recompute) ──
  supplierCostTotal?: number;       // Σ product.supplierCost * qty
  purchaseCostTotal?: number;       // Σ product.purchaseCost * qty
  miscExpense?: number;             // deduction + cargo + customs + agent

  digitalStamp?: boolean;
  imageUrl?: string;
  pdfUrl?: string;
  paidBy?: string;
  paidTo?: string;
  productLocation?: string;
  selectedCurrencies?: InvoiceCurrency[];

  // ────────────────────────────────────────────────────────────────────
  // Liquidity Linkage Fields
  // ────────────────────────────────────────────────────────────────────
  originalLiquiditySource?: 'bank' | 'cash';
  originalLiquidityDocId?: string;
  originalLiquidityAmount?: number;
  remainingLiquidityAmount?: number;
  originalBankTxnId?: string;

  createdAt?: string;
  updatedAt?: string;

  // ── Return tracking (set when a sold serial is returned via Inventory) ──
  returnedSerials?: string[];
  returnedAt?: string;

  /**
   * Set on an invoice the Purchased Orders module created for itself — the
   * $0-revenue "adjustment" invoice it books when an import charge arrives
   * after every unit of a shipment line has already been sold, with nowhere
   * left to carry the cost (see orphanedChargeAbsorption.ts).
   *
   * Previously the only trace of which shipment caused one of these was a
   * sentence buried in exchangeWarrantyNote, readable only by opening the
   * invoice — the list itself gave no clue. These two fields let the list
   * show it directly, and let anything else look the shipment up without
   * parsing free text.
   */
  sourceShipmentId?: string;
  sourceShipmentNumber?: string;
}

export interface DeletedInvoice extends Invoice {
  deletedAt: string;
  deletedBy?: string;
  deletedByEmail?: string;
}

export interface CreateInvoiceDTO {
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
  products: InvoiceProduct[];
  exchangeWarrantyNote: string;
  deliveryStatus: 'Self-collect' | 'LCS' | 'Daewoo' | 'Delivered';
  // New invoices default to Unpaid — payment is recorded later from the list.
  status: 'Paid' | 'Unpaid' | 'Partial';
  salesperson?: string;
  salespersonLocation?: string;
  branch?: string;
  clientDealBy?: string;
  referralBy?: string;
  createdBy?: string;

  payments?: InvoicePayment[];
  paidAmount?: number;
  remainingAmount?: number;
  paymentStatus?: 'Full' | 'Partial' | 'Unpaid';

  collectionMethod?: 'Self Collection' | 'TCS' | 'LCS' | 'Daewoo' | 'Others';
  deductionCharges: number;
  cargoAmount?: number;
  cargoCurrency?: InvoiceCurrency;
  customsAmount?: number;
  customsCurrency?: InvoiceCurrency;
  agentAmount?: number;
  agentCurrency?: InvoiceCurrency;
  agentDetails?: string;
  supplierCostTotal?: number;
  purchaseCostTotal?: number;
  miscExpense?: number;
  digitalStamp?: boolean;

  /** See the matching fields on Invoice. */
  sourceShipmentId?: string;
  sourceShipmentNumber?: string;
}

export interface UpdateInvoiceDTO extends CreateInvoiceDTO {
  id: string;
}

export interface InvoiceFilters {
  searchTerm: string;
  statusFilter: string[];
  dateFrom: string;
  dateTo: string;
  cityFilter: string[];
  salespersonFilter: string[];
  // Brand and model are stored separately on every invoice line but were only
  // ever shown joined into productName, so neither could be filtered on. A
  // brand filter is what someone reaches for when asked "how many Noktas did we
  // sell in August".
  brandFilter: string[];
  modelFilter: string[];
}

export interface InvoiceStats {
  totalCount: number;
  paidCount: number;
  unpaidCount: number;
  partialCount: number;
  totalAmount: number;
  totalDeductionCharges: number;
  netAmount: number;
  // New aggregate fields (additive — existing consumers unaffected):
  totalMiscExpense: number;
  totalSupplierCost: number;
  totalPurchaseCost: number;
  totalPaid: number;
  totalRemaining: number;
}

// Summary of a selected/filtered subset for the list "sum" bar.
export interface InvoiceSelectionSummary {
  count: number;
  totalAmount: number;
  miscExpense: number;
  supplierCost: number;
  purchaseCost: number;
  netAmount: number;
  paidAmount: number;
  remainingAmount: number;
}

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}

export interface ProductInfo {
  id: string;
  brandName: string;
  modelName: string;
  category: string;
  sellPrice: number;
  // Cost fields read from the inventory product (names confirmed by inventory
  // module). Optional so a missing field simply yields 0 rather than crashing.
  supplierCost?: number;
  purchaseCost?: number;
  stock: number;
  serialNumbers: string[];
  serialCities: { [serialNumber: string]: string };
  serialStatus?: { [serialNumber: string]: 'Available' | 'In Transit' | 'Damaged' | 'Returned' | 'Sold' };
  description: string;
  imageUrls?: string[];
}

export interface CustomerSuggestion {
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  customerCNIC: string;
  customerProvince: string;
  customerCity: string;
  customerAddress?: string;
  warrantyLocation?: string;
  exchangeWarrantyNote: string;
}

// Persistent customer record (the `customers` collection). Keyed by phone.
export interface CustomerRecord extends CustomerSuggestion {
  id?: string;
  invoiceCount?: number;
  lastInvoiceDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProvinceCities {
  [province: string]: string[];
}