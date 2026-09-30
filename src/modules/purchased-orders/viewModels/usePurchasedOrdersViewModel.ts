// Purchased Orders — list ViewModel
//
// Holds the shipment list, the filters and the derived summary. All of the
// arithmetic lives in purchasedOrderService; this file only orchestrates.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { PurchasedOrderFirebaseService } from '../models/purchasedOrderFirebaseService';
import {
  filterShipments, summariseShipments, shipmentPriority,
} from '../models/purchasedOrderService';
import { Shipment, ShipmentFilters, ShipmentSummary } from '../models/types';

export interface UsePurchasedOrdersReturn {
  shipments: Shipment[];
  visible: Shipment[];
  brands: string[];
  summary: ShipmentSummary;
  filters: ShipmentFilters;
  isLoading: boolean;
  error: string;
  setSearch:  (v: string) => void;
  setBrand:   (v: string) => void;
  setStatus:  (v: string) => void;
  setCosting: (v: string) => void;
  clearFilters: () => void;
  refresh: () => Promise<void>;
  removeShipment: (id: string) => Promise<void>;
}

const EMPTY: ShipmentFilters = { search: '', brand: 'ALL', status: 'ALL', costing: 'ALL' };

export function usePurchasedOrdersViewModel(): UsePurchasedOrdersReturn {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [filters, setFilters]     = useState<ShipmentFilters>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setShipments(await PurchasedOrderFirebaseService.fetchAll());
    } catch (err: any) {
      setError(err?.message || 'Failed to load shipments');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const list = await PurchasedOrderFirebaseService.fetchAll();
        if (!cancelled) setShipments(list);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load shipments');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * Brand tabs come from the shipments actually on file, never a hardcoded
   * list — a new brand appears the moment its first shipment is saved.
   */
  const brands = useMemo(
    () => [...new Set(shipments.map(s => s.brandName).filter(Boolean))].sort(),
    [shipments],
  );

  /**
   * Sorted by what needs attention first, then newest. A shipment sitting in
   * the warehouse with unfinished costing outranks one still at sea, however
   * recently the latter was entered.
   */
  const visible = useMemo(() => {
    const list = filterShipments(shipments, filters);
    return [...list].sort((a, b) => {
      const p = shipmentPriority(a) - shipmentPriority(b);
      if (p !== 0) return p;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [shipments, filters]);

  const summary = useMemo(() => summariseShipments(shipments), [shipments]);

  const removeShipment = useCallback(async (id: string) => {
    try {
      await PurchasedOrderFirebaseService.remove(id);
      setShipments(prev => prev.filter(s => s.id !== id));
      toast.success('Shipment deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete shipment');
    }
  }, []);

  return {
    shipments, visible, brands, summary, filters, isLoading, error,
    setSearch:  (v) => setFilters(p => ({ ...p, search: v })),
    setBrand:   (v) => setFilters(p => ({ ...p, brand: v })),
    setStatus:  (v) => setFilters(p => ({ ...p, status: v })),
    setCosting: (v) => setFilters(p => ({ ...p, costing: v })),
    clearFilters: () => setFilters(EMPTY),
    refresh,
    removeShipment,
  };
}
