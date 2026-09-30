// =====================================================================================
// MANUAL PRODUCT ADDITION AND AMANAT WORKFLOW - PSEUDO CODE IMPLEMENTATION
// =====================================================================================
// Framework-agnostic logic for Manual Product Addition and Amanat workflow
// This file contains the business logic and validation rules for the inventory system

// =====================================================================================
// 1. MANUAL PRODUCT ADDITION AT INVOICE LEVEL
// =====================================================================================

/**
 * Validates if a product can be manually added to an invoice
 * @param productName - Name of the product to add
 * @param productCosting - Array of existing product costing records
 * @returns boolean indicating if manual addition is allowed
 */
function canAddManualProduct(productName: string, productCosting: ProductCosting[]): boolean {
  // Rule: Manual addition is only allowed if product does not exist in ProductCosting
  const existingProduct = productCosting.find(p =>
    p.brandName.toLowerCase() === productName.toLowerCase()
  );

  if (existingProduct) {
    throw new Error(`Product "${productName}" already exists in ProductCosting. Cannot add manually.`);
  }

  return true;
}

/**
 * Creates a manual product entry for invoice
 * @param productData - Product details from invoice form
 * @param invoiceId - ID of the invoice being created
 * @param userId - ID of the user creating the invoice
 * @returns Product object with manual flag set
 */
function createManualProductForInvoice(
  productData: {
    brandName: string;
    modelName: string;
    category: string;
    costPrice: number;
    sellPrice: number;
    quantity: number;
    description?: string;
  },
  invoiceId: string,
  userId: string
): Product {
  // Validate manual addition is allowed
  if (!canAddManualProduct(productData.brandName, productCosting)) {
    throw new Error("Manual product addition not allowed");
  }

  // Generate unique product ID
  const productId = `MANUAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Generate serial numbers for the quantity
  const serialNumbers: string[] = [];
  const serialCities: { [serial: string]: string } = {};

  for (let i = 1; i <= productData.quantity; i++) {
    const serial = `${productData.brandName.substring(0, 3).toUpperCase()}-${productId.substring(-6)}-${i.toString().padStart(3, '0')}`;
    serialNumbers.push(serial);
    serialCities[serial] = 'Unknown'; // Will be updated when invoice is processed
  }

  // Create product object
  const product: Product = {
    id: productId,
    brandName: productData.brandName,
    modelName: productData.modelName,
    category: productData.category,
    costPrice: productData.costPrice,
    sellPrice: productData.sellPrice,
    buyType: 'Manual', // Special buy type for manual entries
    warrantyYears: 1, // Default warranty
    stock: productData.quantity,
    serialNumbers: serialNumbers,
    serialCities: serialCities,
    description: productData.description || '',
    status: 'New',
    isManual: true, // Flag for manual products
    createdDate: new Date().toISOString()
  };

  // Log audit entry
  logInventoryAudit({
    action: 'Manual Entry',
    productId: product.id,
    productName: product.brandName,
    brandName: product.brandName,
    modelName: product.modelName,
    serialNumbers: product.serialNumbers,
    quantity: product.stock,
    performedBy: userId,
    notes: `Manual product added for invoice ${invoiceId}`,
    relatedInvoiceId: invoiceId
  });

  return product;
}

// =====================================================================================
// 2. MANUAL PRODUCT ADDITION AT QUOTATION LEVEL (AMANAT)
// =====================================================================================

/**
 * Creates a manual product entry for quotation (Amanat)
 * @param productData - Product details from quotation form
 * @param quotationId - ID of the quotation being created
 * @param userId - ID of the user creating the quotation
 * @returns Product object with Amanat flag set
 */
function createManualProductForQuotation(
  productData: {
    brandName: string;
    modelName: string;
    category: string;
    costPrice: number;
    sellPrice: number;
    quantity: number;
    description?: string;
  },
  quotationId: string,
  userId: string
): Product {
  // Validate manual addition is allowed
  if (!canAddManualProduct(productData.brandName, productCosting)) {
    throw new Error("Manual product addition not allowed");
  }

  // Generate unique product ID
  const productId = `AMANAT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Generate serial numbers for the quantity
  const serialNumbers: string[] = [];
  const serialCities: { [serial: string]: string } = {};

  for (let i = 1; i <= productData.quantity; i++) {
    const serial = `AMT-${productData.brandName.substring(0, 3).toUpperCase()}-${productId.substring(-6)}-${i.toString().padStart(3, '0')}`;
    serialNumbers.push(serial);
    serialCities[serial] = 'Amanat'; // Special location for Amanat products
  }

  // Create product object with Amanat flags
  const product: Product = {
    id: productId,
    brandName: productData.brandName,
    modelName: productData.modelName,
    category: productData.category,
    costPrice: productData.costPrice,
    sellPrice: productData.sellPrice,
    buyType: 'Amanat', // Special buy type for Amanat entries
    warrantyYears: 1, // Default warranty
    stock: productData.quantity,
    serialNumbers: serialNumbers,
    serialCities: serialCities,
    description: productData.description || '',
    status: 'New',
    isManual: true, // Flag for manual products
    isAmanat: true, // Flag for Amanat products
    createdDate: new Date().toISOString()
  };

  // Log audit entry
  logInventoryAudit({
    action: 'Manual Entry',
    productId: product.id,
    productName: product.brandName,
    brandName: product.brandName,
    modelName: product.modelName,
    serialNumbers: product.serialNumbers,
    quantity: product.stock,
    performedBy: userId,
    notes: `Amanat product added for quotation ${quotationId}`,
    relatedInvoiceId: quotationId // Using invoiceId field for quotation reference
  });

  return product;
}

// =====================================================================================
// 3. AUTO-INVOICE GENERATION FOR DELIVERED AMANAT
// =====================================================================================

/**
 * Converts a quotation to invoice when Amanat items are delivered
 * @param quotationId - ID of the quotation to convert
 * @param userId - ID of the user performing the conversion
 * @returns Invoice object created from quotation
 */
function convertQuotationToInvoice(quotationId: string, userId: string): Invoice {
  // Find the quotation
  const quotation = quotations.find(q => q.id === quotationId);
  if (!quotation) {
    throw new Error(`Quotation ${quotationId} not found`);
  }

  // Validate quotation can be converted
  if (quotation.status !== 'Approved') {
    throw new Error(`Quotation ${quotationId} must be approved before conversion`);
  }

  if (quotation.convertedToInvoiceId) {
    throw new Error(`Quotation ${quotationId} has already been converted to invoice ${quotation.convertedToInvoiceId}`);
  }

  // Generate invoice number
  const invoiceNumber = generateInvoiceNumber();

  // Create invoice from quotation
  const invoice: Invoice = {
    id: `INV-${Date.now()}`,
    invoiceNumber: invoiceNumber,
    date: new Date().toISOString().split('T')[0], // Today's date
    customerName: quotation.customerName,
    customerPhone: quotation.customerPhone,
    customerPhone2: quotation.customerPhone2,
    customerCNIC: quotation.customerCNIC,
    customerProvince: quotation.customerProvince,
    customerCity: quotation.customerCity,
    customerAddress: quotation.customerAddress,
    warrantyLocation: quotation.warrantyLocation,
    products: quotation.products, // Copy products from quotation
    exchangeWarrantyNote: quotation.exchangeWarrantyNote,
    deliveryStatus: 'Delivered', // Auto-set as delivered
    deliveryReceivedStatus: 'Received',
    totalAmount: quotation.totalAmount,
    status: 'Unpaid', // New invoice starts as unpaid
    salesperson: quotation.salesperson,
    salespersonLocation: quotation.salespersonLocation,
    referFrom: quotation.referFrom,
    referTo: quotation.referTo,
    createdBy: userId,
    collectionMethod: 'Self Collection',
    deductionCharges: 0
  };

  // Update product flags and inventory
  quotation.products.forEach(quoteProduct => {
    const product = products.find(p => p.id === quoteProduct.productId);
    if (product && product.isAmanat) {
      // Update flags: Amanat → false, Manual remains true
      product.isAmanat = false;

      // Update serial cities to actual delivery location
      product.serialNumbers.forEach(serial => {
        if (product.serialCities[serial] === 'Amanat') {
          product.serialCities[serial] = quotation.customerCity;
        }
      });

      // Log the conversion
      logInventoryAudit({
        action: 'Status Changed',
        productId: product.id,
        productName: product.brandName,
        brandName: product.brandName,
        modelName: product.modelName,
        serialNumbers: product.serialNumbers,
        oldStatus: 'Amanat',
        newStatus: 'Manual',
        quantity: product.stock,
        performedBy: userId,
        notes: `Amanat product converted to manual on invoice ${invoiceNumber}`,
        relatedInvoiceId: invoice.id
      });
    }
  });

  // Update quotation status
  quotation.status = 'Converted';
  quotation.convertedToInvoiceId = invoice.id;
  quotation.convertedAt = new Date().toISOString();

  // Log the conversion
  logInventoryAudit({
    action: 'Manual Entry',
    productId: '',
    productName: 'Quotation Conversion',
    brandName: '',
    modelName: '',
    serialNumbers: [],
    quantity: 0,
    performedBy: userId,
    notes: `Quotation ${quotation.quotationNumber} converted to invoice ${invoiceNumber}`,
    relatedInvoiceId: invoice.id
  });

  return invoice;
}

// =====================================================================================
// 4. REPORTING & AUDITING
// =====================================================================================

/**
 * Generates inventory report with manual and Amanat product distinctions
 * @param products - Array of all products
 * @param filter - Optional filter for product types
 * @returns Formatted inventory report
 */
function generateInventoryReport(products: Product[], filter?: {
  includeManual?: boolean;
  includeAmanat?: boolean;
  includeStandard?: boolean;
}) {
  const report = {
    standardProducts: [] as Product[],
    manualProducts: [] as Product[],
    amanatProducts: [] as Product[],
    summary: {
      totalStandardValue: 0,
      totalManualValue: 0,
      totalAmanatValue: 0,
      totalProducts: 0
    }
  };

  products.forEach(product => {
    const productValue = product.sellPrice * product.stock;

    if (product.isAmanat) {
      if (filter?.includeAmanat !== false) {
        report.amanatProducts.push(product);
        report.summary.totalAmanatValue += productValue;
      }
    } else if (product.isManual) {
      if (filter?.includeManual !== false) {
        report.manualProducts.push(product);
        report.summary.totalManualValue += productValue;
      }
    } else {
      if (filter?.includeStandard !== false) {
        report.standardProducts.push(product);
        report.summary.totalStandardValue += productValue;
      }
    }

    report.summary.totalProducts++;
  });

  return report;
}

/**
 * Generates audit report for manual additions and Amanat conversions
 * @param auditLogs - Array of inventory audit logs
 * @param dateRange - Optional date range filter
 * @returns Filtered audit report
 */
function generateAuditReport(auditLogs: InventoryAuditLog[], dateRange?: {
  startDate: string;
  endDate: string;
}) {
  let filteredLogs = auditLogs;

  // Filter by date range if provided
  if (dateRange) {
    filteredLogs = auditLogs.filter(log => {
      const logDate = new Date(log.timestamp);
      const start = new Date(dateRange.startDate);
      const end = new Date(dateRange.endDate);
      return logDate >= start && logDate <= end;
    });
  }

  // Filter for manual entries and Amanat conversions
  const manualEntries = filteredLogs.filter(log =>
    log.action === 'Manual Entry' || log.notes?.includes('Amanat')
  );

  const statusChanges = filteredLogs.filter(log =>
    log.action === 'Status Changed' &&
    (log.oldStatus === 'Amanat' || log.newStatus === 'Manual')
  );

  return {
    manualEntries,
    statusChanges,
    summary: {
      totalManualEntries: manualEntries.length,
      totalStatusChanges: statusChanges.length,
      dateRange: dateRange || 'All time'
    }
  };
}

// =====================================================================================
// UTILITY FUNCTIONS
// =====================================================================================

/**
 * Generates unique invoice number
 */
function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');

  // Get next sequence number (would typically come from database)
  const sequence = (invoices.length + 1).toString().padStart(4, '0');

  return `INV-${year}${month}${day}-${sequence}`;
}

/**
 * Logs inventory audit entry
 */
function logInventoryAudit(entry: Omit<InventoryAuditLog, 'id' | 'timestamp'>): void {
  const auditLog: InventoryAuditLog = {
    id: `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    ...entry
  };

  inventoryAuditLogs.push(auditLog);
}

// =====================================================================================
// VALIDATION RULES
// =====================================================================================

/**
 * Validates product data before manual creation
 */
function validateProductData(productData: any): void {
  if (!productData.brandName?.trim()) {
    throw new Error("Brand name is required");
  }

  if (!productData.modelName?.trim()) {
    throw new Error("Model name is required");
  }

  if (!productData.category?.trim()) {
    throw new Error("Category is required");
  }

  if (productData.costPrice < 0) {
    throw new Error("Cost price cannot be negative");
  }

  if (productData.sellPrice < productData.costPrice) {
    throw new Error("Sell price cannot be less than cost price");
  }

  if (productData.quantity <= 0) {
    throw new Error("Quantity must be greater than 0");
  }
}

/**
 * Validates quotation data before Amanat creation
 */
function validateQuotationData(quotationData: any): void {
  if (!quotationData.customerName?.trim()) {
    throw new Error("Customer name is required");
  }

  if (!quotationData.customerPhone?.trim()) {
    throw new Error("Customer phone is required");
  }

  if (!quotationData.customerCNIC?.trim()) {
    throw new Error("Customer CNIC is required");
  }

  if (quotationData.products.length === 0) {
    throw new Error("At least one product is required");
  }

  quotationData.products.forEach((product: any, index: number) => {
    try {
      validateProductData(product);
    } catch (error) {
      throw new Error(`Product ${index + 1}: ${error.message}`);
    }
  });
}

// =====================================================================================
// EXCEPTION HANDLING
// =====================================================================================

/**
 * Handles errors during manual product operations
 */
function handleManualProductError(error: Error, operation: string): void {
  console.error(`Error in ${operation}:`, error.message);

  // Log error to audit trail
  logInventoryAudit({
    action: 'Manual Entry',
    productId: '',
    productName: 'Error',
    brandName: '',
    modelName: '',
    serialNumbers: [],
    quantity: 0,
    performedBy: 'System',
    notes: `Error in ${operation}: ${error.message}`
  });

  // Re-throw with user-friendly message
  throw new Error(`Failed to ${operation.toLowerCase()}: ${error.message}`);
}

// =====================================================================================
// INTEGRATION POINTS
// =====================================================================================

/**
 * Invoice creation workflow with manual product support
 */
function createInvoiceWithManualProducts(invoiceData: any, userId: string): Invoice {
  try {
    // Validate invoice data
    validateInvoiceData(invoiceData);

    // Process manual products
    const processedProducts: InvoiceProduct[] = [];
    const newProducts: Product[] = [];

    for (const productData of invoiceData.products) {
      if (productData.isManual) {
        // Create manual product
        const manualProduct = createManualProductForInvoice(productData, '', userId);
        newProducts.push(manualProduct);

        // Add to invoice products
        processedProducts.push({
          ...productData,
          productId: manualProduct.id
        });
      } else {
        // Use existing product
        processedProducts.push(productData);
      }
    }

    // Create invoice
    const invoice: Invoice = {
      id: `INV-${Date.now()}`,
      invoiceNumber: generateInvoiceNumber(),
      date: invoiceData.date,
      customerName: invoiceData.customerName,
      customerPhone: invoiceData.customerPhone,
      customerPhone2: invoiceData.customerPhone2,
      customerCNIC: invoiceData.customerCNIC,
      customerProvince: invoiceData.customerProvince,
      customerCity: invoiceData.customerCity,
      customerAddress: invoiceData.customerAddress,
      warrantyLocation: invoiceData.warrantyLocation,
      products: processedProducts,
      exchangeWarrantyNote: invoiceData.exchangeWarrantyNote,
      deliveryStatus: invoiceData.deliveryStatus,
      deliveryReceivedStatus: 'Pending',
      totalAmount: invoiceData.totalAmount,
      status: 'Unpaid',
      salesperson: invoiceData.salesperson,
      salespersonLocation: invoiceData.salespersonLocation,
      referFrom: invoiceData.referFrom,
      referTo: invoiceData.referTo,
      createdBy: userId,
      collectionMethod: invoiceData.collectionMethod || 'Self Collection',
      deductionCharges: invoiceData.deductionCharges || 0
    };

    // Update invoice ID in manual products
    newProducts.forEach(product => {
      const auditIndex = inventoryAuditLogs.findIndex(log =>
        log.productId === product.id && log.relatedInvoiceId === ''
      );
      if (auditIndex !== -1) {
        inventoryAuditLogs[auditIndex].relatedInvoiceId = invoice.id;
      }
    });

    return invoice;

  } catch (error) {
    handleManualProductError(error, 'create invoice with manual products');
  }
}

/**
 * Quotation creation workflow with Amanat product support
 */
function createQuotationWithAmanatProducts(quotationData: any, userId: string): Quotation {
  try {
    // Validate quotation data
    validateQuotationData(quotationData);

    // Process Amanat products
    const processedProducts: InvoiceProduct[] = [];
    const newProducts: Product[] = [];

    for (const productData of quotationData.products) {
      if (productData.isAmanat) {
        // Create Amanat product
        const amanatProduct = createManualProductForQuotation(productData, '', userId);
        newProducts.push(amanatProduct);

        // Add to quotation products
        processedProducts.push({
          ...productData,
          productId: amanatProduct.id
        });
      } else {
        // Use existing product
        processedProducts.push(productData);
      }
    }

    // Create quotation
    const quotation: Quotation = {
      id: `QUOT-${Date.now()}`,
      quotationNumber: generateQuotationNumber(),
      date: quotationData.date,
      customerName: quotationData.customerName,
      customerPhone: quotationData.customerPhone,
      customerPhone2: quotationData.customerPhone2,
      customerCNIC: quotationData.customerCNIC,
      customerProvince: quotationData.customerProvince,
      customerCity: quotationData.customerCity,
      customerAddress: quotationData.customerAddress,
      warrantyLocation: quotationData.warrantyLocation,
      products: processedProducts,
      exchangeWarrantyNote: quotationData.exchangeWarrantyNote,
      deliveryStatus: quotationData.deliveryStatus,
      totalAmount: quotationData.totalAmount,
      status: 'Pending',
      salesperson: quotationData.salesperson,
      salespersonLocation: quotationData.salespersonLocation,
      referFrom: quotationData.referFrom,
      referTo: quotationData.referTo,
      createdBy: userId,
      isAmanat: true
    };

    // Update quotation ID in Amanat products
    newProducts.forEach(product => {
      const auditIndex = inventoryAuditLogs.findIndex(log =>
        log.productId === product.id && log.relatedInvoiceId === ''
      );
      if (auditIndex !== -1) {
        inventoryAuditLogs[auditIndex].relatedInvoiceId = quotation.id;
      }
    });

    return quotation;

  } catch (error) {
    handleManualProductError(error, 'create quotation with Amanat products');
  }
}

/**
 * Generates unique quotation number
 */
function generateQuotationNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');

  // Get next sequence number
  const sequence = (quotations.length + 1).toString().padStart(4, '0');

  return `QUOT-${year}${month}${day}-${sequence}`;
}

// =====================================================================================
// TYPE DEFINITIONS (for reference)
// =====================================================================================

interface Product {
  id: string;
  brandName: string;
  modelName: string;
  category: string;
  costPrice: number;
  sellPrice: number;
  buyType: string;
  warrantyYears: number;
  stock: number;
  serialNumbers: string[];
  serialCities: { [serial: string]: string };
  serialStatus?: { [serial: string]: string };
  description: string;
  status: string;
  createdDate?: string;
  isManual?: boolean;
  isAmanat?: boolean;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerPhone: string;
  products: InvoiceProduct[];
  totalAmount: number;
  status: string;
  // ... other invoice fields
}

interface Quotation {
  id: string;
  quotationNumber: string;
  date: string;
  customerName: string;
  customerPhone: string;
  products: InvoiceProduct[];
  totalAmount: number;
  status: string;
  isAmanat?: boolean;
  convertedToInvoiceId?: string;
  convertedAt?: string;
  // ... other quotation fields
}

interface InventoryAuditLog {
  id: string;
  timestamp: string;
  action: string;
  productId: string;
  productName: string;
  brandName: string;
  modelName: string;
  serialNumbers: string[];
  quantity: number;
  performedBy: string;
  notes?: string;
  relatedInvoiceId?: string;
}

// Global variables (would be injected in real implementation)
declare var products: Product[];
declare var quotations: Quotation[];
declare var invoices: Invoice[];
declare var inventoryAuditLogs: InventoryAuditLog[];
declare var productCosting: ProductCosting[];

interface ProductCosting {
  brandName: string;
  modelName: string;
  // ... other costing fields
}

interface InvoiceProduct {
  productId: string;
  productName: string;
  brandName: string;
  modelName: string;
  quantity: number;
  price: number;
  total: number;
  serialNumbers: string[];
  currency: string;
  isManual?: boolean;
  isAmanat?: boolean;
}

// Additional validation functions
function validateInvoiceData(invoiceData: any): void {
  if (!invoiceData.customerName?.trim()) {
    throw new Error("Customer name is required");
  }
  if (!invoiceData.customerPhone?.trim()) {
    throw new Error("Customer phone is required");
  }
  if (!invoiceData.customerCNIC?.trim()) {
    throw new Error("Customer CNIC is required");
  }
  if (invoiceData.products.length === 0) {
    throw new Error("At least one product is required");
  }
}
