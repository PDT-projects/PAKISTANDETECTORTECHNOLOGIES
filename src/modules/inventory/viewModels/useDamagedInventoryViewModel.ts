// Inventory Module - ViewModel Layer
// useDamagedInventoryViewModel - lists items returned as Damaged

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DamagedProduct } from '../models/types';
import { InventoryFirebaseService } from '../models/InventoryFirebaseService';

export function useDamagedInventoryViewModel() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<DamagedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setIsLoading(true);
    InventoryFirebaseService.fetchDamagedProducts()
      .then(setRecords)
      .catch(e => setError(e.message || 'Failed to load damaged inventory'))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const s = search.toLowerCase();
    return records.filter(r =>
      r.brandName.toLowerCase().includes(s) ||
      r.modelName.toLowerCase().includes(s) ||
      r.serialNumber.toLowerCase().includes(s)
    );
  }, [records, search]);

  const onBack = useCallback(() => navigate('/inventory'), [navigate]);

  return { records, filteredRecords, isLoading, error, search, setSearch, onBack, totalCount: records.length };
}