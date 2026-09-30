// models/inventoryPayableConfig.types.ts
// Stores which inventory products have a fixed AED payable amount
// that should be automatically recorded when an invoice is created.

/**
 * A single commission slab (price band).
 * If an invoice product's sale price falls within [minSalePrice, maxSalePrice],
 * the payable recorded is `payableAmountAed` (always stored in AED).
 * Use maxSalePrice = null for an open-ended top band (e.g. "10000 and above").
 */
export interface PayableSlab {
  minSalePrice: number;        // inclusive lower bound of the sale price band (AED)
  maxSalePrice: number | null; // inclusive upper bound, or null for "and above"
  payableAmountAed: number;    // fixed AED payable when sale price lands in this band
}

export interface InventoryPayableConfig {
  id: string;               // Firestore doc ID
  productId: string;        // matches Product.id from inventory
  productName: string;      // brandName + modelName (display only)
  brandName: string;
  modelName: string;
  fixedAmountAed: number;   // fallback flat AED amount (used when slabs is empty or no band matches)
  inputCurrency: 'AED' | 'USD'; // which currency the user entered the flat amount in (display only)
  inputAmount: number;          // the raw flat amount the user typed (before conversion)
  slabs: PayableSlab[];     // price-based commission slabs; empty array = use fixedAmountAed
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryPayableConfigDTO {
  productId: string;
  productName: string;
  brandName: string;
  modelName: string;
  fixedAmountAed: number;   // always AED, regardless of input currency
  inputCurrency: 'AED' | 'USD';
  inputAmount: number;
  slabs: PayableSlab[];
  notes?: string;
}

/**
 * Given a configured product and the sale price of one invoice line,
 * return the AED payable amount: the matching slab if any, else the flat fallback.
 */
export function resolvePayableAed(
  config: Pick<InventoryPayableConfig, 'fixedAmountAed' | 'slabs'>,
  salePriceAed: number | null | undefined,
): number {
  const slabs = config.slabs ?? [];
  if (slabs.length > 0 && salePriceAed != null && !isNaN(salePriceAed)) {
    const match = slabs.find((s) => {
      const aboveMin = salePriceAed >= s.minSalePrice;
      const belowMax = s.maxSalePrice == null || salePriceAed <= s.maxSalePrice;
      return aboveMin && belowMax;
    });
    if (match) return match.payableAmountAed;
  }
  return config.fixedAmountAed;
}