// Inventory Module - Model Layer
// Type definitions for Inventory and Product Transfer
// Change: added `location` field to Product, CreateProductDTO, UpdateProductDTO, ProductFormData
// Change: added `stockInDateManual` field to ProductFormData

export type ProductStatus = 'New' | 'In Transit' | 'On-Order' | 'Receivable' | 'Available' | 'Sold' | 'Damaged' | 'Returned' | 'Used';
export type BuyType = 'Import' | 'Export';
export type SerialStatus = 'Available' | 'In Transit' | 'Damaged' | 'Returned' | 'Sold';
export type PaymentStatus = 'Pending' | 'Partial' | 'Complete';

// Whether a product batch is owned outright or held on credit from a supplier
export type OwnershipType = 'Credit' | 'Owned';
// Supplier payment status for credit tracking (distinct from ProductFormData.paymentStatus)
export type SupplierPaymentStatus = 'Unpaid' | 'Partial' | 'Cleared';
export type PaymentChannel = 'Cash' | 'Bank' | 'Cheque' | 'Credit';
export type CostingOption = 'with' | 'without';
export type InventoryEntryType = 'in-stock' | 'on-order' | 'credit' | 'payment';
export type InventoryEntryStep = 'details' | 'payment' | 'confirmation';

// Canonical location list — single source of truth used across inventory + transfers
// No built-in defaults — every location is something the business actually
// added (via LocationSelector, saved to appConfig/inventoryLocations).
// A hardcoded starter list here would survive "Clear Custom Lists" and
// Factory Reset forever, since neither touches this file — exactly the
// stale-location problem those two actions exist to fix.
export const INVENTORY_LOCATIONS = [] as const;
export type InventoryLocation = typeof INVENTORY_LOCATIONS[number];

export interface CostingModel {
  id: string;
  modelName: string;
  units: number;
  unitCostUSD: number;
  totalCostUSD: number;
  percentage: number;
  customPerModel: number;
  customPerUnit: number;
  freightPerModel: number;
  freightPerUnit: number;
  unitCostPKR: number;
  totalLandedUnitCost: number;
  totalShipmentValuePKR: number;
}

export interface CostingInfo {
  brandName: string;
  usdRate: number;
  totalCustomsValue: number;
  totalFreightValue: number;
  models: CostingModel[];
  totalUnitCostUSD: number;
  shipmentTotalUSD: number;
  consignmentValue: number;
  totalValueOfBrand: number;
}

export interface Product {
  id: string;
  brandName: string;
  modelName: string;
  category: string;
  costPrice?: number;
  sellPrice: number;
  buyType: BuyType;
  warrantyYears: number;
  stock: number;
  // Primary stocking location — set at entry time, updated on transfer receipt
  location?: string;
  transactionId?: string;
  serialNumbers: string[];
  serialCities: { [serialNumber: string]: string };
  serialStatus?: { [serialNumber: string]: SerialStatus };
  description: string;
  status: ProductStatus;
  isDamaged?: boolean;

  // ── Report / ownership tracking ──────────────────────────────────────────
  ownershipType?: OwnershipType;            // 'Credit' or 'Owned' — set once at entry, per product
  supplierCost?: number;                    // fixed at entry when ownershipType === 'Credit'
  supplierPaymentStatus?: SupplierPaymentStatus;
  supplierPaidAmount?: number;
  supplierRemainingAmount?: number;
  supplierPaymentChannel?: PaymentChannel;
  // Per-serial tracking maps (keyed by serial number)
  serialStockInDates?: { [serialNumber: string]: string };
  serialStockInDatesManual?: { [serialNumber: string]: string };
  serialSoldDates?: { [serialNumber: string]: string };
  serialInvoiceNumbers?: { [serialNumber: string]: string };
  /**
   * The invoice's payment status, per serial.
   *
   * "Sold Goods Payment" on the report is money coming in from a customer. It
   * was reading supplierPaymentStatus — money going out to a supplier, and only
   * present on Credit stock — so on Owned stock the column was always blank. It
   * was named for one thing and read another.
   */
  serialInvoicePaymentStatus?: { [serialNumber: string]: 'Paid' | 'Partial' | 'Unpaid' };
  /** Supplier cost snapshotted on the invoice line that sold this unit. */
  serialInvoiceSupplierCost?:  { [serialNumber: string]: number };
    /**
   * Landed cost of each serial, frozen at stock-in.
   *
   * costPrice stays as the product-level weighted average so everything reading
   * it today keeps working. This map is what a sale reads when it wants the
   * true cost of the unit it sold — two units of the same model bought on
   * different shipments cost different amounts, and averaging hides that.
   */
  serialCostPrice?:  { [serialNumber: string]: number };
  /** Which shipment each serial came off. */
  serialShipmentId?: { [serialNumber: string]: string };

  // Payable configuration (optional)
  enablePayable?: boolean;
  fixedPayableAmount?: number;
  fixedPayableCurrency?: string;

  createdAt?: string;
  updatedAt?: string;
  brandId?: string;
  modelId?: string;
  costingId?: string;
  billId?: string;
  receivableStatus?: 'Pending' | 'Received';
  expectedReceiveDate?: string;
  costingOption?: CostingOption;
  costing?: CostingInfo;
  costingUnits?: number;
  costingUnitCostUSD?: number;
  costingTotalCostUSD?: number;
  costingPercentage?: number;
  costingCustomPerModel?: number;
  costingCustomPerUnit?: number;
  costingFreightPerModel?: number;
  costingFreightPerUnit?: number;
  costingUnitCostPKR?: number;
  costingTotalUnitCost?: number;
  costingTotalShipmentValuePKR?: number;
  costingUsdRate?: number;
  costingTotalCustomsValue?: number;
  costingTotalFreightValue?: number;
  costingShipmentTotalUSD?: number;
    costingConsignmentValue?: number;
  costingTotalValueOfBrand?: number;
  costingModelsJson?: string;
  /** Firebase Storage download URLs for this product's photos. */
  imageUrls?: string[];
}




export interface ReceivableProduct extends Product {


  billId: string;
  receivableStatus: 'Pending' | 'Received';
  expectedReceiveDate: string;
}

export interface BrandModel {
  id: string;
  brandName: string;
  modelName: string;
  category: string;
  createdAt?: string;
}

export interface BrandWithModels {
  brandName: string;
  models: string[];
}

export interface CreateProductDTO {
  brandName: string;
  modelName: string;
  category: string;
  costPrice?: number;
  sellPrice: number;
  buyType: BuyType;
  warrantyYears: number;
  stock: number;
  location?: string;           // ← new: primary stocking location
  transactionId?: string;
  serialNumbers: string[];
  serialCities: { [serialNumber: string]: string };
  description: string;
  status: ProductStatus;
  isDamaged: boolean;
  billId?: string;
  receivableStatus?: 'Pending' | 'Received';
  expectedReceiveDate?: string;
  costingOption?: CostingOption;
  costing?: CostingInfo;
  ownershipType?: OwnershipType;
  supplierCost?: number;
  supplierPaymentStatus?: SupplierPaymentStatus;
  supplierPaidAmount?: number;
  supplierPaymentChannel?: PaymentChannel;
    serialStockInDates?: { [serialNumber: string]: string };
  serialStockInDatesManual?: { [serialNumber: string]: string };
  serialSoldDates?: { [serialNumber: string]: string };
  serialInvoiceNumbers?: { [serialNumber: string]: string };
  /**
   * The invoice's payment status, per serial.
   */
  serialInvoicePaymentStatus?: { [serialNumber: string]: 'Paid' | 'Partial' | 'Unpaid' };
  /** Supplier cost snapshotted on the invoice line that sold this unit. */
  serialInvoiceSupplierCost?:  { [serialNumber: string]: number };

  // Written when the product is created from a shipment stock-in. The cost sits
  // on the serial because two units of the same model bought on different
  // shipments cost different amounts, and averaging on the way in hides that.
  serialCostPrice?:  { [serialNumber: string]: number };
  serialShipmentId?: { [serialNumber: string]: string };

  // The ids beside the names, so a product created from a shipment carries the
  // brand's identity rather than only its text.
  brandId?: string;
  modelId?: string;

  imageUrls?: string[];
}
export interface ProductFormData {
  currentStep: InventoryEntryStep | number;
  costingOption?: CostingOption;
  brandName: string;
  brandId?: string;
  modelName: string;
  modelId?: string;
  category: string;
  costPrice?: number;
  sellPrice: number;
  buyType: BuyType;
  warrantyYears: number;
  stock: number;
  location?: string;           // ← new: primary stocking location
  description: string;
  status: ProductStatus;
  isDamaged: boolean;
  serialNumbers: string[];
  serialCities: { [serialNumber: string]: string };
  stockInDateManual?: string;  // ← new: manual stock-in date override (applied to all serials in this batch)
  costing?: CostingInfo;
  paymentStatus?: 'paid' | 'unpaid' | 'partial';
  transactionId?: string;
  paidAmount?: number;
  paymentMethod?: 'Cash' | 'Bank' | 'Cheque' | 'Credit';
  bankId?: string;
  bankName?: string;
  imageUrls?: string[];
}


export interface ProductTransfer {
  id: string;
  productId: string;
  productName: string;
  brandName?: string;
  modelName?: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  serialNumbers: string[];
  date: string;
  transferDate?: string;
  status: 'Pending' | 'In Transit' | 'Completed' | 'Cancelled' | 'Received';
  transferredBy?: string;
  note?: string;
  notes?: string;
  createdAt?: string;
  receivedAt?: string;
  // Who confirmed receipt at the destination — captured in the "Mark as
  // Received" prompt. Previously asked for and required on that form but
  // never actually reached this type or Firestore (see TransferFirebaseService
  // .updateTransferStatus / useProductTransferViewModel.handleMarkReceived),
  // so it was silently discarded on every transfer ever received.
  receiverName?: string;
  receiptName?: string;
  receiptType?: string;
  receiptDataUrl?: string;
  // Entered on the transfer form and used by ProductTransferView to show the
  // per-unit cost of moving stock. They were passed to createTransfer but
  // never listed in its write, so the value was discarded on every transfer.
  shipmentCost?: number;
  costPerUnit?: number;
  transferItems?: any;
}
export interface UpdateProductDTO {
  brandName?: string;
  modelName?: string;
  category?: string;
  costPrice?: number;
  sellPrice?: number;
  buyType?: BuyType;
  warrantyYears?: number;
  stock?: number;
  location?: string;           // ← new
  transactionId?: string;
  serialNumbers?: string[];
  serialCities?: { [serialNumber: string]: string };
  serialStatus?: { [serialNumber: string]: SerialStatus };
  description?: string;
  status?: ProductStatus;
  isDamaged?: boolean;
  costingOption?: CostingOption;
  costing?: CostingInfo;
  ownershipType?: OwnershipType;
  supplierCost?: number;
  supplierPaymentStatus?: SupplierPaymentStatus;
  supplierPaidAmount?: number;
  supplierPaymentChannel?: PaymentChannel;
  serialStockInDates?: { [serialNumber: string]: string };
  serialStockInDatesManual?: { [serialNumber: string]: string };
  serialSoldDates?: { [serialNumber: string]: string };
  serialInvoiceNumbers?: { [serialNumber: string]: string };
  /**
   * The invoice's payment status, per serial.
   */
  serialInvoicePaymentStatus?: { [serialNumber: string]: 'Paid' | 'Partial' | 'Unpaid' };
  /** Supplier cost snapshotted on the invoice line that sold this unit. */
  serialInvoiceSupplierCost?:  { [serialNumber: string]: number };
  serialCostPrice?:  { [serialNumber: string]: number };
  serialShipmentId?: { [serialNumber: string]: string };
  imageUrls?: string[];
}

export interface CreateTransferDTO {
  productId: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  serialNumbers: string[];
  transferDate: string;
  notes?: string;
  shipmentCost?: number;
  costPerUnit?: number;
  transferItems?: any;
}

export interface ProductFilters {
  brandSearch: string;
  modelSearch: string;
  categoryFilter: string;
  statusFilter: ProductStatus | '';
  buyTypeFilter: BuyType | '';
  locationFilter: string;      // ← new: filter by location
  minPrice: number | null;
  maxPrice: number | null;
  hasStock: boolean | null;
}

export interface TransferFilters {
  productSearch: string;
  fromLocation: string;
  toLocation: string;
  statusFilter: ProductTransfer['status'] | '';
  dateFrom: string;
  dateTo: string;
}

export interface ProductStats {
  totalProducts: number;
  totalStock: number;
  totalValue: number;
  newProducts: number;
  inTransit: number;
  available: number;
  categories: { [key: string]: number };
}

export interface TransferStats {
  totalTransfers: number;
  pendingTransfers: number;
  completedTransfers: number;
  inTransitTransfers: number;
  totalQuantityMoved: number;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  fieldErrors?: { [key: string]: string };
}

// ── Inventory Report (one row per serial number) — matches the sheet columns
export interface InventoryReportRow {
  productId: string;
  brandName: string;
  modelName: string;
  serialNumber: string;
  stockInDateAuto: string;      // system-set (entry / return date)
  stockInDateManual?: string;   // manual override, if entered
  type: string;                 // = product.category (Detection Equipment, etc.)
  location: string;
  ownershipType: OwnershipType | '';
  condition: string;            // = product.status (New/Used/Damaged/Returned...)
  currentStatus: 'In Stock' | 'Sold';
  soldDate?: string;
  invoiceNumber?: string;
  supplierCost?: number;      // set when ownershipType === 'Credit'
  purchasingCost?: number;    // set when ownershipType === 'Owned'
  supplierPaymentStatus?: SupplierPaymentStatus; // display-mapped: Cleared→Clear, Unpaid→Pending
  supplierPaidAmount?: number;
  supplierRemainingAmount?: number;
  supplierPaymentChannel?: PaymentChannel;
}

// ── Damaged Inventory (returned items marked damaged) ────────────────────────
export interface DamagedProduct {
  id: string;
  productId: string;         // originating product id
  brandName: string;
  modelName: string;
  serialNumber: string;
  location: string;
  reason?: string;
  damagedAt: string;
  damagedBy?: string;
}

export interface CreatePaymentDTO {
  productId: string;
  amount: number;
  paymentMethod: 'Cash' | 'Bank' | 'Cheque' | 'Credit';
  bankId?: string;
  transactionId?: string;
  notes?: string;
}