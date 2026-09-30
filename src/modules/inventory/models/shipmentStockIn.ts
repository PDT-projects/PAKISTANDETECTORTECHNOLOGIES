// Stock in from a shipment
//
// The bridge between a purchase order and inventory. It exists as its own file
// rather than inside either module because it is the only place that knows both
// — and a function that writes to two collections should be findable by name
// rather than buried in whichever service happened to host it.
//
// COST LAYERS
// -----------
// Each stock-in freezes the landed unit cost of the day. Import charges paid
// afterwards cannot reach units that have already left — some are on sold
// invoices — so they land on whatever is still on the shipment and its per-unit
// cost rises.
//
// The frozen figure goes on the serial, in `serialCostPrice`. The product's own
// `costPrice` stays as the weighted average, so everything reading it today
// keeps working; the map is what a sale reads when it wants the true cost of
// the unit it sold.

import {
  Shipment, CostedLine,
} from '../../purchased-orders/models/types';
import {
  calculateShipmentCosting, remainingToStock, remainingLandedUnitCost,
  stockedQuantity, round2,
} from '../../purchased-orders/models/purchasedOrderService';
import { PurchasedOrderFirebaseService } from '../../purchased-orders/models/purchasedOrderFirebaseService';
import { InventoryFirebaseService } from './InventoryFirebaseService';
import { Product } from './types';

/** One line of a shipment as the stock-in screen needs to show it. */
export interface StockInLine {
  lineId: string;
  productName: string;
  modelName: string;
  ordered: number;
  stocked: number;
  remaining: number;
  /** What each remaining unit costs now, charges to date included. */
  landedUnitCost: number;
  /** Charges per unit, for the product's costing fields and for display. */
  customsPerUnit: number;
  freightPerUnit: number;
  taxPerUnit: number;
  otherPerUnit: number;
  /** Goods only, before any charge. */
  goodsPerUnit: number;
}

/**
 * What a shipment offers to the stock-in screen.
 *
 * Lines with nothing left are dropped: a row reading "0 remaining" is a row
 * nobody can act on, and four of them hide the one that matters.
 */
export function stockInLines(s: Shipment): StockInLine[] {
  const c = calculateShipmentCosting(s);

  return c.lines
    .map((l: CostedLine) => {
      const remaining = remainingToStock(l);
      const qty       = Number(l.quantity) || 0;
      return {
        lineId:        l.id,
        productName:   l.productName,
        modelName:     l.modelName || '',
        ordered:       qty,
        stocked:       stockedQuantity(l),
        remaining,
        landedUnitCost: remaining > 0 ? remainingLandedUnitCost(l) : l.landedUnitCost,
        // Per unit of the whole line, not of the remainder. These describe how
        // the charge was allocated; the remainder's higher cost is the landed
        // figure above.
        customsPerUnit: qty > 0 ? round2(l.customsShare / qty) : 0,
        freightPerUnit: qty > 0 ? round2(l.freightShare / qty) : 0,
        taxPerUnit:     qty > 0 ? round2(l.taxShare     / qty) : 0,
        otherPerUnit:   qty > 0 ? round2(l.otherShare   / qty) : 0,
        goodsPerUnit:   qty > 0 ? round2(l.netTotalBase / qty) : 0,
      };
    })
    .filter(l => l.remaining > 0);
}

/**
 * The lowest a sell price is allowed to be.
 *
 * Selling below landed cost is a loss on every unit, and it is the kind of loss
 * that hides — the invoice looks normal and the margin only shows up in a
 * month-end report. The floor is the cost itself; the default adds the margin.
 */
export const sellPriceFloor = (landedUnitCost: number): number => round2(landedUnitCost);

/** Default sell price at a given margin. */
export function suggestedSellPrice(landedUnitCost: number, marginPercent: number): number {
  const m = Number(marginPercent) || 0;
  return round2(landedUnitCost * (1 + m / 100));
}

/** Whether a sell price is allowed against a landed cost. */
export function checkSellPrice(sellPrice: number, landedUnitCost: number): {
  allowed: boolean; reason?: string;
} {
  const sp = Number(sellPrice) || 0;
  if (sp <= 0) return { allowed: false, reason: 'Enter a sell price' };
  if (sp < sellPriceFloor(landedUnitCost)) {
    return {
      allowed: false,
      reason: `Sell price cannot be below the landed cost of ${landedUnitCost.toFixed(2)}`,
    };
  }
  return { allowed: true };
}

export interface StockInRequest {
  shipmentId: string;
  lineId: string;
  serials: string[];
  sellPrice: number;
  location: string;
  category?: string;
  warrantyYears?: number;
  description?: string;
  stockedBy?: string;
}

/**
 * Take units off a shipment line and into stock.
 *
 * The order matters. Inventory is written first: if the shipment update then
 * fails, the stock exists and the shipment still shows it as available, which a
 * second attempt corrects. Reversed, the shipment would show units gone that
 * never reached inventory, and nothing on either screen would say so.
 *
 * Matching is on brand and model only — not cost. The existing duplicate check
 * includes costPrice, which would make a second batch at a higher landed cost
 * look like a different product and split Findx into two rows in every list.
 * The cost difference belongs on the serial, which is what serialCostPrice is
 * for.
 */
export async function stockInFromShipment(req: StockInRequest): Promise<{
  productId: string; landedUnitCost: number; created: boolean;
}> {
  const shipment = await PurchasedOrderFirebaseService.fetchById(req.shipmentId);
  if (!shipment) throw new Error('Shipment not found');

  const line = stockInLines(shipment).find(l => l.lineId === req.lineId);
  if (!line) throw new Error('That line has nothing left to stock in');

  const serials = req.serials.map(s => s.trim()).filter(Boolean);
  if (serials.length === 0) throw new Error('Enter at least one serial number');
  if (serials.length > line.remaining) {
    throw new Error(`Only ${line.remaining} unit${line.remaining === 1 ? '' : 's'} remain on this line`);
  }
  if (new Set(serials).size !== serials.length) {
    throw new Error('The same serial number appears twice');
  }

  const check = checkSellPrice(req.sellPrice, line.landedUnitCost);
  if (!check.allowed) throw new Error(check.reason!);

  const cost = line.landedUnitCost;

  // Brand and model only. Cost is deliberately not part of the match.
  const existing = (await InventoryFirebaseService.fetchAllProducts()).find(
    (p: Product) =>
      p.brandName === shipment.brandName &&
      p.modelName === (line.modelName || line.productName) &&
      p.status !== 'Sold',
  );

  const costingFields = {
    costingCustomPerUnit:  line.customsPerUnit,
    costingFreightPerUnit: line.freightPerUnit,
    costingUnitCostPKR:    line.goodsPerUnit,
    costingTotalUnitCost:  cost,
    costingUnits:          serials.length,
  };

  let productId: string;
  let created = false;

  if (existing) {
    await InventoryFirebaseService.addSerialsToProduct(existing.id, {
      serials,
      landedUnitCost: cost,
      shipmentId: req.shipmentId,
      shipmentNumber: shipment.shipmentNumber,
      location: req.location,
      sellPrice: req.sellPrice,
      costingFields,
    });
    productId = existing.id;
  } else {
    const p = await InventoryFirebaseService.createProduct({
      brandName:   shipment.brandName,
      brandId:     shipment.brandId,
      modelName:   line.modelName || line.productName,
      category:    req.category || '',
      costPrice:   cost,
      sellPrice:   req.sellPrice,
      buyType:     'Import',
      warrantyYears: req.warrantyYears ?? 0,
      stock:       serials.length,
      location:    req.location,
      serialNumbers: serials,
      serialCities:  Object.fromEntries(serials.map(s => [s, req.location])),
      description: req.description || '',
      status:      'Available',
      // The shipment holds the supplier position — what is owed, what has been
      // paid. Copying it here would be a second record of one debt, and the two
      // would drift the first time either changed.
      ownershipType: 'Owned',
      serialCostPrice:  Object.fromEntries(serials.map(s => [s, cost])),
      serialShipmentId: Object.fromEntries(serials.map(s => [s, req.shipmentId])),
      ...costingFields,
    } as any);
    productId = p.id;
    created = true;
  }

  await PurchasedOrderFirebaseService.recordStockBatch(req.shipmentId, req.lineId, {
    quantity: serials.length,
    landedUnitCost: cost,
    productId,
    stockedBy: req.stockedBy,
  });

  return { productId, landedUnitCost: cost, created };
}
