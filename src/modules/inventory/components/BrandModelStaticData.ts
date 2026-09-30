import { BrandModel, ModelEntry } from '../models/BrandModelService';

export const STATIC_BRANDS: BrandModel[] = [
  { 
    id: 'aka', 
    name: 'AKA', 
    models: [
      {id:'aka-signum', brandId: 'aka', name:'Signum HM'},
      {id:'aka-mfd', brandId: 'aka', name:'AKA Signum MFD'},
      {id:'aka-coil', brandId: 'aka', name:'AKA-SIGNUM Coil 15"'},
      {id:'aka-hf', brandId: 'aka', name:'HF RANDOM'},
      {id:'aka-intr', brandId: 'aka', name:'AKA INTRONIKA'},
      {id:'aka-pulse', brandId: 'aka', name:'Smart Pulse'}
    ] 
  },
  { 
    id: 'as', 
    name: 'AS DETECTORS', 
    models: [{id:'as-multi', brandId: 'as', name:'Multi max'}]
  },
  { 
    id: 'and', 
    name: 'Andralian', 
    models: [{id:'and-1', brandId: 'and', name:'Andralian'}]
  },
  { 
    id: 'bd', 
    name: 'Black Dog Xtreme', 
    models: [{id:'bd-black', brandId: 'bd', name:'Black Dog'}]
  },
  { 
    id: 'bh', 
    name: 'Bounty Hunter VLF', 
    models: [{id:'bh-bounty', brandId: 'bh', name:'Bounty Hunter'}]
  },
  // ... (add all 33 from service - abbreviated)
  { 
    id: 'gr', 
    name: 'Garrett', 
    models: [
      {id:'gr-400i', brandId: 'gr', name:'Garrett Metal Detector 400i'},
      {id:'gr-atgold', brandId: 'gr', name:'Garrett Metal Detector-AT Gold'},
      // ... all 12
    ]
  }
];

