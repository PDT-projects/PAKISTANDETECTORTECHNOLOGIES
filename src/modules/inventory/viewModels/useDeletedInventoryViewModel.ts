// Inventory Module - ViewModel Layer
// useDeletedInventoryViewModel - Fetches and manages soft-deleted inventory records
// NEW FILE: This ViewModel was missing, causing the Deleted Inventory card to not open correctly.

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { InventoryFirebaseService, DeletedProduct } from '../models/InventoryFirebaseService';

interface UseDeletedInventoryViewModelReturn {
  records: DeletedProduct[];
  filteredRecords: DeletedProduct[];
  isLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  viewItem: DeletedProduct | null;
  setViewItem: (item: DeletedProduct | null) => void;
  onBack: () => void;
  totalCount: number;
}

export function useDeletedInventoryViewModel(): UseDeletedInventoryViewModelReturn {
  const navigate = useNavigate();

  const [records,  setRecords]  = useState<DeletedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [search,   setSearch]   = useState('');
  const [viewItem, setViewItem] = useState<DeletedProduct | null>(null);

  useEffect(() => {
    setIsLoading(true);
    InventoryFirebaseService.fetchDeletedProducts()
      .then(data => {
        setRecords(data);
        console.log(`✅ Loaded ${data.length} deleted inventory records`);
      })
      .catch(e => {
        console.error('❌ Error loading deleted products:', e);
        setError(e.message || 'Failed to load deleted inventory');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const s = search.toLowerCase();
    return records.filter(r =>
      r.brandName.toLowerCase().includes(s) ||
      r.modelName.toLowerCase().includes(s) ||
      r.category.toLowerCase().includes(s) ||
      r.deletedByEmail.toLowerCase().includes(s) ||
      r.deletedByName.toLowerCase().includes(s)
    );
  }, [records, search]);

  const onBack = useCallback(() => navigate('/inventory'), [navigate]);

  return {
    records,
    filteredRecords,
    isLoading,
    error,
    search,
    setSearch,
    viewItem,
    setViewItem,
    onBack,
    totalCount: records.length,
  };
}