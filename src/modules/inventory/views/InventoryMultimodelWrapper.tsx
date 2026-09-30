// Inventory Module - Wrapper
// FIX: import paths corrected to match actual file names on disk
//      (useInventoryMultimodelViewModel.ts / InventoryMultimodelView.tsx —
//      lowercase "model"). The old paths used "MultiModel" casing, which
//      resolves locally on case-insensitive filesystems (Mac/Windows) but
//      fails to build on case-sensitive ones (Linux/most CI, Vercel, Netlify).

import React from 'react';
import { useInventoryMultiModelViewModel } from '../viewModels/useInventoryMultimodelViewModel';
import { InventoryMultiModelView } from './InventoryMultimodelView';

export const InventoryMultiModelWrapper: React.FC = () => {
  const viewModel = useInventoryMultiModelViewModel();
  return <InventoryMultiModelView {...viewModel} />;
};