// Purchased Orders — demo seed data
//
// Three shipments taken from real documents so a demo shows recognisable
// numbers rather than invented ones:
//
//   1. NOKTA    — from the "NOKTA COSTING" sheet (12 priced models, 175 units)
//   2. GARRETT  — from the "GARRETT COSTING" sheet (4 models, 45 units)
//   3. FISHER   — from proforma 481224, First Texas Products (9 lines, 123 units)
//
// The costing sheets were kept in PKR at 300 PKR per USD. The system's base is
// AED, so the charges below are the SAME economics expressed in the supplier's
// own currency (USD) — e.g. Nokta customs of PKR 766,025 is USD 2,553.42 —
// and each shipment converts to AED at its own frozen exchange rate.
//
// Seeding is idempotent: a shipment number that already exists is skipped, so
// pressing the button twice cannot create duplicates.

import { PurchasedOrderFirebaseService } from './purchasedOrderFirebaseService';
import { CreateShipmentDTO, ShipmentLine, UnitOfMeasure } from './types';

const AED_PER_USD = 3.67;

let seq = 0;
const line = (
  productName: string, modelName: string,
  quantity: number, unitPrice: number,
  received = 0, discountPercent = 0, uom: UnitOfMeasure = 'EA',
): ShipmentLine => ({
  id: `seed-${Date.now().toString(36)}-${seq++}`,
  productName, modelName, uom,
  quantity, unitPrice, discountPercent, receivedQuantity: received,
});

/** Date n days before today, as YYYY-MM-DD. */
const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export function buildDemoShipments(): CreateShipmentDTO[] {
  return [
    // ── 1. NOKTA — arrived, customs and freight applied, costing still open.
    // This is the shipment that should sort to the top of the list: the stock
    // is in the warehouse and sellable, but its cost is not yet finalised.
    {
      shipmentNumber: 'SHP-NOKTA-26-001',
      supplierOrderNumber: 'NOK-2026-0114',
      brandName: 'NOKTA',
      supplierName: 'Nokta Detectors',
      originCountry: 'Turkey',
      destinationCountry: 'UAE',
      orderDate: daysAgo(48),
      shipmentDate: daysAgo(36),
      expectedArrivalDate: daysAgo(12),
      actualArrivalDate: daysAgo(9),
      shipMethod: 'Sea',
      freightTerms: 'Collect',
      trackingNumber: 'MSCU-7741903',
      currency: 'USD',
      exchangeRate: AED_PER_USD,
      status: 'Customs Cleared',
      customsStatus: 'Applied',
      freightStatus: 'Applied',
      costingStatus: 'Pending',
      // PKR 766,025 and PKR 499,416 from the sheet, at 300 PKR per USD.
      customsAmount: 2553.42,
      freightAmount: 1664.72,
      otherCharges: 0,
      salesTaxAmount: 0,
      lines: [
        line('Nokta Findx',                       'Findx',            25, 90),
        line('Nokta Findx Pro',                   'Findx Pro',        25, 102),
        line('Nokta Score',                       'Score',            15, 215),
        line('Nokta Score 3 Pro Pack',            'Score 3 Pro Pack', 10, 303),
        line('Nokta Simplex Lite with SX28 Coil', 'Simplex Lite',     15, 155),
        line('Nokta Simplex Ultra',               'Simplex Ultra',    15, 180),
        line('Nokta The Legend',                  'The Legend',       10, 350),
        line('Nokta Impact Pro',                  'Impact Pro',       30, 350),
        line('IM45 Search Coil 15 x 17.5 Black',  'IM45 Coil',         5, 145),
        line('Nokta Pointer',                     'Pointer',          10, 50),
        line('Pulsedive Scuba Detector Yellow',   'Pulsedive',        10, 115),
        line('Nokta Accupoint Pinpointer',        'Accupoint',         5, 85),
      ],
      notes:
        'Consolidated Q1 order. Costing sheet reconciled against the supplier '
        + 'commercial invoice; customs assessed on landed value.',
    },

    // ── 2. GARRETT — arrived and cleared, costing finalised, partly received.
    {
      shipmentNumber: 'SHP-GARRETT-26-002',
      supplierOrderNumber: 'GAR-88213',
      brandName: 'GARRETT',
      supplierName: 'Garrett Electronics Inc.',
      originCountry: 'USA',
      destinationCountry: 'UAE',
      orderDate: daysAgo(70),
      shipmentDate: daysAgo(58),
      expectedArrivalDate: daysAgo(34),
      actualArrivalDate: daysAgo(31),
      shipMethod: 'Air',
      freightTerms: 'Prepaid',
      trackingNumber: 'AWB-176-44820915',
      currency: 'USD',
      exchangeRate: AED_PER_USD,
      status: 'Costing Complete',
      customsStatus: 'Applied',
      freightStatus: 'Applied',
      costingStatus: 'Complete',
      // PKR 186,330 and PKR 121,479 from the sheet, at 300 PKR per USD.
      customsAmount: 621.10,
      freightAmount: 404.93,
      otherCharges: 0,
      salesTaxAmount: 0,
      lines: [
        line('Garrett ACE 400I', 'ACE 400I',  5, 252.67,  5),
        line('Garrett ACE 300I', 'ACE 300I', 15, 190.55, 15),
        line('Garrett ACE 200I', 'ACE 200I', 15, 127.03,  8),
        line('Garrett ACE Apex', 'ACE Apex', 10, 351.49,  0),
      ],
      notes: 'Air freight prepaid by supplier. 28 of 45 units received; balance at the forwarder.',
    },

    // ── 3. FISHER / TEKNETICS — proforma 481224, still in transit.
    // Charges are zero because the proforma quotes none yet; they arrive with
    // the clearing agent's invoice. Entering the shipment before the charges
    // are known is the normal case, which is why costing stays Pending.
    {
      shipmentNumber: 'SHP-FISHER-26-003',
      supplierOrderNumber: '481224',
      brandName: 'FISHER',
      supplierName: 'First Texas Products LLC',
      originCountry: 'USA',
      destinationCountry: 'UAE',
      orderDate: daysAgo(14),
      shipmentDate: daysAgo(6),
      expectedArrivalDate: daysAgo(-11),
      shipMethod: 'Sea',
      freightTerms: 'Collect',
      trackingNumber: 'TO BE DETERMINED',
      currency: 'USD',
      exchangeRate: AED_PER_USD,
      status: 'In Transit',
      customsStatus: 'Not Applied',
      freightStatus: 'Not Applied',
      costingStatus: 'Pending',
      customsAmount: 0,
      freightAmount: 0,
      otherCharges: 0,
      salesTaxAmount: 0,
      lines: [
        line('Fisher F11 MD',            'F11',         20, 118),
        line('Fisher F22 MD',            'F22',         15, 142),
        line('Fisher F44 MD',            'F44',         15, 159),
        line('Fisher F75 MD',            'F75',         10, 359),
        line('Fisher Goldbug MD',        'Goldbug',      3, 157),
        line('Teknetics Eurotek MD',     'Eurotek',     20,  95),
        line('Teknetics Eurotek Pro MD', 'Eurotek Pro', 15, 138),
        line('Teknetics Alpha 2000 MD',  'Alpha 2000',  15, 102),
        line('Teknetics T2 MD',          'T2',          10, 264),
      ],
      notes:
        'Proforma 481224. Sale amount USD 19,076.00, freight collect. '
        + 'Customs and freight to be entered when the clearing agent invoices.',
    },
  ];
}

export interface SeedResult { created: number; skipped: number; errors: string[] }

/**
 * Create the demo shipments, skipping any whose number already exists.
 *
 * Existing numbers are read once up front rather than per shipment — three
 * extra full-collection reads would be wasteful, and the create path checks
 * for a clash again anyway.
 */
export async function seedDemoShipments(): Promise<SeedResult> {
  const result: SeedResult = { created: 0, skipped: 0, errors: [] };

  const existing = await PurchasedOrderFirebaseService.fetchAll();
  const taken = new Set(existing.map(s => s.shipmentNumber.trim().toLowerCase()));

  for (const dto of buildDemoShipments()) {
    if (taken.has(dto.shipmentNumber.trim().toLowerCase())) {
      result.skipped++;
      continue;
    }
    try {
      await PurchasedOrderFirebaseService.create(dto);
      result.created++;
    } catch (err: any) {
      result.errors.push(`${dto.shipmentNumber}: ${err?.message || 'failed'}`);
    }
  }

  console.log('[PO] seed complete', result);
  return result;
}
