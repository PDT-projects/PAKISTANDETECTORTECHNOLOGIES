// models/inventoryPayableConfig.types.ts
// Stores which inventory products have a fixed AED payable amount
// that should be automatically recorded when an invoice is created.

export interface InventoryPayableConfig {
  id: string;               // Firestore doc ID
  productId: string;        // matches Product.id from inventory
  productName: string;      // brandName + modelName (display only)
  brandName: string;
  modelName: string;
  fixedAmountAed: number;   // the fixed AED amount to record per sale
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryPayableConfigDTO {
  productId: string;
  productName: string;
  brandName: string;
  modelName: string;
  fixedAmountAed: number;
  notes?: string;
}