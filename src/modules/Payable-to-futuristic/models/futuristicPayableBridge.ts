// models/futuristicPayableBridge.ts
//
// Called by useInvoiceFormViewModel.ts -> handleSave(), right after a new
// invoice is created. For each product on the invoice, checks if there is an
// InventoryPayableConfig entry (inventory_payable_configs collection). If
// found, auto-writes a payable entry to `payable_to_futuristic` using the
// fixed AED amount configured for that inventory item.
//
// This call is fire-and-forget from the invoice side (see .then()/.catch()
// at the call site) — errors here are logged but never block invoice saving.
//
// HARDENED: every product is logged with its productId so a mismatch with
// inventory_payable_configs is visible in the console instead of failing
// silently. productId is trimmed before lookup.

import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { fetchConfigForProduct } from './inventoryPayableConfigService';
import { resolvePayableAed } from './inventoryPayableConfig.types';
import { aedToAllCurrencies, ZERO_AMOUNTS } from './payableToFuturistic';

const PAYABLE_COLLECTION = 'payable_to_futuristic';

export interface BridgeInvoiceProduct {
  productId:   string;
  productName?: string;
  brandName?:  string;
  modelName?:  string;
  quantity?:   number;
  /** Per-unit sale price in AED for this invoice line. Used to pick the
   *  matching commission slab. If omitted, the config's flat fixed amount
   *  is used. Pass the unit price (not the line total). */
  salePrice?:  number;
}

export interface CreateFuturisticPayablesParams {
  invoiceId:     string;
  invoiceNumber: string;
  saleDate?:     string;
  location?:     string;
  products:      BridgeInvoiceProduct[];
}

/**
 * Auto-create payable entries for any invoice product that has a configured
 * fixed AED payable amount (set in the "Configure Inventory" tab).
 *
 * Called as: createFuturisticPayablesFromInvoice({ invoiceId, invoiceNumber, saleDate, products: selectedProducts })
 *
 * @returns the number of payable entries created
 */
export async function createFuturisticPayablesFromInvoice(
  params: CreateFuturisticPayablesParams
): Promise<number> {
  const { invoiceId, invoiceNumber, saleDate, location, products } = params;

  console.log(
    `[PayableBridge] START invoice=${invoiceNumber} (${invoiceId}) — ${products?.length ?? 0} product row(s)`
  );

  if (!products || products.length === 0) {
    console.log('[PayableBridge] No products on invoice — nothing to do');
    return 0;
  }

  const now = new Date().toISOString();
  let createdCount = 0;

  for (const product of products) {
    const cleanProductId = (product.productId || '').trim();

    console.log(
      `[PayableBridge] Checking product → productId="${cleanProductId}" brand="${product.brandName}" model="${product.modelName}" qty=${product.quantity}`
    );

    if (!cleanProductId) {
      console.warn('[PayableBridge] Skipping product row — productId is empty/missing');
      continue;
    }

    try {
      const config = await fetchConfigForProduct(cleanProductId);

      if (!config) {
        console.log(
          `[PayableBridge] No payable config configured for productId="${cleanProductId}" — skipping (this is normal if you haven't set one up in "Configure Inventory")`
        );
        continue;
      }

      const qty         = product.quantity ?? 1;
      const perUnitAed  = resolvePayableAed(config, product.salePrice);
      const totalAed    = perUnitAed * qty;
      const amounts     = aedToAllCurrencies(totalAed);

      const matchedSlab = (config.slabs?.length ?? 0) > 0 && product.salePrice != null
        && perUnitAed !== config.fixedAmountAed;
      console.log(
        `[PayableBridge] productId="${cleanProductId}" salePrice=${product.salePrice ?? 'n/a'} → ` +
        `perUnit AED ${perUnitAed} ${matchedSlab ? '(slab match)' : '(flat fallback)'} × qty ${qty} = AED ${totalAed}`
      );

      const defaultDue = new Date();
      defaultDue.setDate(defaultDue.getDate() + 30);

      const payableData = {
        // Link back to invoice
        invoiceId,
        invoiceNumber,
        saleDate: saleDate ?? now.split('T')[0],

        // Product info
        productId: cleanProductId,
        modelName: product.modelName || config.modelName,
        brandName: product.brandName || config.brandName,
        location:  location || '',

        // Amounts
        amounts,
        usdPrice:    amounts.usd,
        paidAmounts: ZERO_AMOUNTS,

        // Metadata
        description: `${config.modelName} — Invoice #${invoiceNumber}`,
        status:      'pending' as const,
        dueDate:     defaultDue.toISOString().split('T')[0],
        notes:       `Auto-generated from invoice #${invoiceNumber}. Payable: AED ${perUnitAed}/unit${matchedSlab ? ` (slab @ sale price AED ${product.salePrice})` : ''}${qty > 1 ? ` × ${qty} units` : ''}.`,
        isManual:    false,
        source:      'auto-invoice',

        createdAt: now,
        updatedAt: now,
      };

      const ref = await addDoc(collection(db, PAYABLE_COLLECTION), payableData);
      createdCount += 1;

      console.log(
        `[PayableBridge] ✅ Created payable doc ${ref.id} — AED ${totalAed} for productId="${cleanProductId}" on invoice ${invoiceNumber}`
      );
    } catch (err) {
      // Never block invoice creation — log and continue with next product
      console.error(
        `[PayableBridge] ⚠️ Failed to create payable for productId="${cleanProductId}":`,
        err
      );
    }
  }

  console.log(`[PayableBridge] DONE invoice=${invoiceNumber} — created ${createdCount} payable entr${createdCount === 1 ? 'y' : 'ies'}`);

  return createdCount;
}