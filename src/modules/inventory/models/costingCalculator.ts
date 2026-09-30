// Inventory Module - Costing Calculator
// Mathematical engine for multi-model landed cost calculations
//
// FORMULA REFERENCE:
// totalCostUSD          = units × unitCostUSD
// percentage            = model's totalCostUSD / Σ(all models' totalCostUSD)
//                         → pure ratio 0–1; all models sum to EXACTLY 1
//                         → displayed as-is (e.g. 0.347826), NOT multiplied by 100
// customPerModel        = percentage × totalCustomsValue
// customPerUnit         = customPerModel / units
// freightPerModel       = percentage × totalFreightValue
// freightPerUnit        = freightPerModel / units
// unitCostPKR           = unitCostUSD × usdRate
// totalLandedUnitCost   = unitCostPKR + customPerUnit + freightPerUnit   ("Total Unit Cost")
// totalShipmentValuePKR = totalLandedUnitCost × units                    ("Inventory Value")
// consignmentValue      = Σ(all models' totalCostUSD) × usdRate

import { CostingModel, CostingInfo } from './types';

export function generateModelId(): string {
  return `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createEmptyCostingModel(): CostingModel {
  return {
    id: generateModelId(),
    modelName: '',
    units: 0,
    unitCostUSD: 0,
    totalCostUSD: 0,
    percentage: 0,
    customPerModel: 0,
    customPerUnit: 0,
    freightPerModel: 0,
    freightPerUnit: 0,
    unitCostPKR: 0,
    totalLandedUnitCost: 0,
    totalShipmentValuePKR: 0,
  };
}

/**
 * Recalculates a single model's derived fields.
 *
 * percentage = model's totalCostUSD / Σ(all models' totalCostUSD)
 * Stored as pure ratio 0–1 (e.g. 0.347826). Displayed as-is — do NOT ×100.
 * Summing across all models always equals exactly 1.
 */
export function calculateModelCosts(
  model: CostingModel,
  _totalUnitCostUSD: number,
  shipmentTotalUSD: number,
  usdRate: number,
  totalCustomsValue: number,
  totalFreightValue: number
): CostingModel {
  // totalCostUSD = units × unitCostUSD
  const totalCostUSD = model.units * model.unitCostUSD;

  // percentage = this model's totalCostUSD / Σ(all models' totalCostUSD)
  // Always sums to exactly 1 across all models.
  const percentage = shipmentTotalUSD > 0 ? totalCostUSD / shipmentTotalUSD : 0;

  const customPerModel = percentage * totalCustomsValue;
  const customPerUnit  = model.units > 0 ? customPerModel / model.units : 0;

  const freightPerModel = percentage * totalFreightValue;
  const freightPerUnit  = model.units > 0 ? freightPerModel / model.units : 0;

  const unitCostPKR = model.unitCostUSD * usdRate;

  const totalLandedUnitCost = unitCostPKR + customPerUnit + freightPerUnit;

  const totalShipmentValuePKR = totalLandedUnitCost * model.units;

  return {
    ...model,
    totalCostUSD:          roundToTwo(totalCostUSD),
    percentage:            roundToSix(percentage),   // e.g. 0.347826 — display as-is, never ×100
    customPerModel:        roundToTwo(customPerModel),
    customPerUnit:         roundToTwo(customPerUnit),
    freightPerModel:       roundToTwo(freightPerModel),
    freightPerUnit:        roundToTwo(freightPerUnit),
    unitCostPKR:           roundToTwo(unitCostPKR),
    totalLandedUnitCost:   roundToTwo(totalLandedUnitCost),
    totalShipmentValuePKR: roundToTwo(totalShipmentValuePKR),
  };
}

export function calculateBrandSummary(
  models: CostingModel[],
  usdRate: number,
  totalCustomsValue: number,
  totalFreightValue: number
): {
  totalUnitCostUSD: number;
  shipmentTotalUSD: number;
  consignmentValue: number;
  totalValueOfBrand: number;
} {
  const shipmentTotalUSD = models.reduce((sum, m) => sum + m.units * m.unitCostUSD, 0);
  const consignmentValue = shipmentTotalUSD * usdRate;
  const totalValueOfBrand = consignmentValue + totalCustomsValue + totalFreightValue;
  const totalUnitCostUSD = models.reduce((sum, m) => sum + m.unitCostUSD, 0);

  return {
    totalUnitCostUSD:  roundToTwo(totalUnitCostUSD),
    shipmentTotalUSD:  roundToTwo(shipmentTotalUSD),
    consignmentValue:  roundToTwo(consignmentValue),
    totalValueOfBrand: roundToTwo(totalValueOfBrand),
  };
}

export function recalculateAllModels(
  models: CostingModel[],
  usdRate: number,
  totalCustomsValue: number,
  totalFreightValue: number
): {
  models: CostingModel[];
  summary: {
    totalUnitCostUSD: number;
    shipmentTotalUSD: number;
    consignmentValue: number;
    totalValueOfBrand: number;
  };
} {
  const shipmentTotalUSD = models.reduce((sum, m) => sum + m.units * m.unitCostUSD, 0);
  const totalUnitCostUSD = models.reduce((sum, m) => sum + m.unitCostUSD, 0);

  const recalculatedModels = models.map(model =>
    calculateModelCosts(model, totalUnitCostUSD, shipmentTotalUSD, usdRate, totalCustomsValue, totalFreightValue)
  );

  const summary = calculateBrandSummary(recalculatedModels, usdRate, totalCustomsValue, totalFreightValue);

  return { models: recalculatedModels, summary };
}

export function createInitialCostingInfo(): CostingInfo {
  return {
    brandName: '',
    usdRate: 0,
    totalCustomsValue: 0,
    totalFreightValue: 0,
    models: [],
    totalUnitCostUSD: 0,
    shipmentTotalUSD: 0,
    consignmentValue: 0,
    totalValueOfBrand: 0,
  };
}

export function formatCurrency(value: number): string {
  return roundToTwo(value).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function roundToSix(num: number): number {
  return Math.round((num + Number.EPSILON) * 1_000_000) / 1_000_000;
}