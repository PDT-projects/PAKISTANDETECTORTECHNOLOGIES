// Late Shipment Charge Allocation
//
// THE PROBLEM: a shipment's per-unit landed cost (which bakes in import
// charges) is calculated using each line's proportional share of the
// shipment's total value, but that calculation only ever runs ONCE, at
// stock-in time, and gets snapshotted onto each serial. It never re-runs
// later. So when a charge arrives after stock-in, that line's share of the
// new charge has nowhere it can be silently baked into the existing numbers
// — whether the line's units are still sitting unsold in inventory, or have
// already gone out on a real sales invoice.
//
// THE FIX (this file): whenever a charge is added, this walks every line of
// the shipment that has already been fully stocked in, computes that line's
// value-proportional share of the NEW charge (the exact same "share"
// formula the costing engine already uses), and — regardless of whether the
// line's units are unsold or already sold — creates a small dummy Product
// carrying exactly that line's share, and immediately sells it via a
// $0-revenue, clearly-labelled internal adjustment invoice, so the cost
// still reaches Purchase Cost / COGS through the same pipeline a real sale
// uses, and always leaves a traceable ADJ-xxxx invoice behind.
//
// Earlier versions of this file split behaviour by sold/unsold status —
// topping up the still-unsold unit's own recorded cost directly instead of
// creating an adjustment invoice for it. That path was removed: the direct
// top-up was invisible everywhere the app actually reads a unit's cost
// (invoice creation, the Inventory Report, the Balance Sheet all read the
// product's own costPrice, never the per-serial top-up), and per an
// explicit decision to treat every late charge on a stocked-in line the
// same way, so a paid charge always leaves a document you can go find and
// point at, rather than a silent number change buried in the product.

import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { InventoryFirebaseService } from '../../inventory/models/InventoryFirebaseService';
import { InvoiceFirebaseService } from '../../invoices/models/InvoiceFirebaseService';
import { calculateShipmentCosting, resolveLineProductId } from './purchasedOrderService';
import type { Shipment } from './types';

const PRODUCTS_COLLECTION = 'products';

async function generateAdjustmentInvoiceNumber(): Promise<string> {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const today = `${dd}${mm}${yy}`;
  const counterRef = doc(db, 'invoiceCounters', 'adjustments');
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
  return `ADJ-${today}-${String(seq).padStart(3, '0')}`;
}

async function createDummyAdjustment(
  shipment: Shipment,
  lineLabel: string,
  amount: number,
  chargeDescription: string,
): Promise<string> {
  const now = new Date().toISOString();
  const serial = `ADJ-${shipment.id.slice(0, 8)}-${Date.now().toString(36)}`;
  const shipLabel = shipment.shipmentNumber || shipment.id;
  const note = `Auto-generated: absorbs AED ${amount.toFixed(2)} in import charges ` +
    `(${chargeDescription || 'no description'}) allocated to "${lineLabel}" on Shipment ${shipLabel}, ` +
    `whose stock was already fully sold. Keeps the true landed cost reflected in profit reporting.`;

  const product = await InventoryFirebaseService.createProduct({
    brandName: 'System',
    modelName: `Import Charge Adjustment (${lineLabel})`,
    category: 'Adjustment',
    sellPrice: 0,
    costPrice: amount,
    buyType: 'Import',
    warrantyYears: 0,
    stock: 1,
    serialNumbers: [serial],
    serialCities: {},
    description: note,
    status: 'Available',
    isDamaged: false,
    ownershipType: 'Owned',
    serialCostPrice: { [serial]: amount },
    serialShipmentId: { [serial]: shipment.id },
  });

  const invoiceNumber = await generateAdjustmentInvoiceNumber();

  await InvoiceFirebaseService.createInvoice({
    invoiceNumber,
    date: now.slice(0, 10),
    customerName: 'Internal - Import Charge Adjustment',
    customerPhone: '-',
    customerCNIC: '-',
    customerProvince: '-',
    customerCity: '-',
    products: [{
      id: `${product.id}-line`,
      productId: product.id,
      productName: `${product.brandName} ${product.modelName}`,
      brandName: product.brandName,
      modelName: product.modelName,
      category: product.category,
      description: note,
      quantity: 1,
      price: 0,
      total: 0,
      serialNumbers: [serial],
      currency: 'AED',
      purchaseCost: amount,
    }],
    exchangeWarrantyNote: note,
    deliveryStatus: 'Self-collect',
    status: 'Paid',
    deductionCharges: 0,
    // Previously the shipment reference only existed inside `note` above —
    // readable, but only after opening this exact invoice. These two fields
    // let the Invoices list show "Shipment: SHP-..." directly, and let
    // anything else find the shipment without parsing free text.
    sourceShipmentId: shipment.id,
    sourceShipmentNumber: shipLabel,
  } as any);

  await InventoryFirebaseService.markSerialsSold(
    product.id,
    [{ serial, invoiceNumber, soldDate: now, paymentStatus: 'Paid' }],
    now,
  );

  return invoiceNumber;
}

export interface ChargeAllocationResult {
  /** Invoice numbers of any dummy adjustment invoices created — one per
   *  stocked-in line that had a share of this charge to absorb, whether its
   *  unit(s) were unsold or already sold. Empty if no line had been stocked
   *  in yet (nothing to absorb — the live costing engine picks the charge up
   *  automatically once it is). */
  adjustmentInvoiceNumbers: string[];
}

/**
 * Call after successfully adding a charge to a shipment. Walks every line,
 * gives each its value-proportional share of the new charge (matching the
 * shipment's own costing formula), and — for any line that has already been
 * stocked in — absorbs that share via a dummy adjustment invoice. This is
 * the same treatment whether the line's unit(s) are still sitting unsold in
 * inventory or have already gone out on a real sale: neither case touches
 * the unit's own recorded cost, so every late charge leaves the same kind of
 * traceable ADJ-xxxx record behind.
 */
export async function allocateNewChargeAcrossShipment(
  shipment: Shipment,
  chargeAmount: number,
  chargeDescription: string,
): Promise<ChargeAllocationResult> {
  const result: ChargeAllocationResult = { adjustmentInvoiceNumbers: [] };
  const lines = shipment.lines || [];
  if (lines.length === 0 || !(chargeAmount > 0)) return result;

  // Reuse the shipment's own costing engine to get each line's exact value
  // share — the same number that decided how the ORIGINAL charges split.
  const costing = calculateShipmentCosting(shipment);
  const costedByLineId = new Map(costing.lines.map(c => [c.id, c]));

  for (const line of lines) {
    const costedLine = costedByLineId.get(line.id);
    const share = costedLine?.share ?? 0;
    const lineAmount = chargeAmount * share;
    if (!(lineAmount > 0)) continue;

    const lineLabel = `${line.productName} ${line.modelName}`.trim();

    // `line.linkedProductId` is the field meant to carry the stocked-in
    // product id, but historically nothing ever wrote it (see
    // resolveLineProductId's own doc comment) — so read it through the
    // resolver, which falls back to the line's stockBatches, instead of the
    // raw field directly.
    const productId = resolveLineProductId(line);
    if (!productId) {
      // Not stocked in yet — nothing to do. The live costing engine will
      // pick up this charge automatically (it reads charges[] fresh) the
      // next time this line is stocked in, same as always.
      continue;
    }

    try {
      const snap = await getDoc(doc(db, PRODUCTS_COLLECTION, productId));
      if (!snap.exists()) continue;
      const p = snap.data() as any;
      const serialNumbers: string[] = p.serialNumbers || [];
      if (serialNumbers.length === 0) continue; // nothing actually stocked in on this product record

      // Stocked in — whether its units are unsold or already sold, this
      // line's share always goes out via a dummy adjustment invoice now,
      // never onto the real unit's own recorded cost.
      const invNo = await createDummyAdjustment(shipment, lineLabel, lineAmount, chargeDescription);
      result.adjustmentInvoiceNumbers.push(invNo);
    } catch (err) {
      console.error(`[allocateNewChargeAcrossShipment] failed for line "${lineLabel}":`, err);
      // Don't let one bad line stop the others.
    }
  }

  return result;
}
