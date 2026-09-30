// Inventory Module - Shared Component
// LocationSelector & SerialLocationSelector
//
// Both variants load custom locations from Firestore (appConfig/inventoryLocations)
// and let the user add a new location inline, which is then persisted back to Firestore.
//
// Usage:
//   <LocationSelector value={value} onChange={onChange} label="Primary Location" />
//   <SerialLocationSelector value={value} onChange={onChange} />

import React from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { INVENTORY_LOCATIONS } from '../models/types';

const DEFAULT_LOCATIONS = [...INVENTORY_LOCATIONS];
const FIRESTORE_DOC     = () => doc(db, 'appConfig', 'inventoryLocations');

// ── Shared hook ────────────────────────────────────────────────────────────────

function useLocationList() {
  const [locations, setLocations] = React.useState<string[]>(DEFAULT_LOCATIONS);

  React.useEffect(() => {
    getDoc(FIRESTORE_DOC())
      .then(snap => {
        if (snap.exists()) {
          const saved = (snap.data().list as string[]) || [];
          setLocations([...new Set([...DEFAULT_LOCATIONS, ...saved])].sort());
        }
      })
      .catch(() => {});
  }, []);

  const addLocation = async (name: string): Promise<string[]> => {
    const updated = [...new Set([...locations, name])].sort();
    setLocations(updated);
    try {
      await setDoc(FIRESTORE_DOC(), { list: updated }, { merge: true });
    } catch (err) {
      console.error('[LocationSelector] Firestore save failed:', err);
    }
    return updated;
  };

  return { locations, addLocation };
}

// ── Shared inline styles ───────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  flex: 1,
  padding: '9px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
  color: '#111827',
  backgroundColor: '#fff',
  boxSizing: 'border-box',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '9px 12px',
  border: '2px solid #334155',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
  color: '#111827',
  backgroundColor: '#fff',
  boxSizing: 'border-box',
};

const saveBtnStyle: React.CSSProperties = {
  padding: '9px 14px',
  backgroundColor: '#1e293b',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const addBtnStyle: React.CSSProperties = {
  padding: '9px 14px',
  border: '1.5px dashed #334155',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  color: '#1e293b',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '9px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 13,
  color: '#6b7280',
  backgroundColor: '#fff',
  cursor: 'pointer',
};

// ── LocationSelector (primary / product-level location) ───────────────────────

interface LocationSelectorProps {
  value: string;
  onChange: (v: string) => void;
  /** Shown above the selector. Defaults to "Stocking Location". */
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  value,
  onChange,
  label = 'Stocking Location',
  placeholder = 'Select location',
  required = false,
}) => {
  const { locations, addLocation } = useLocationList();
  const [addingNew,   setAddingNew]   = React.useState(false);
  const [newLocation, setNewLocation] = React.useState('');
  const [saving,      setSaving]      = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (addingNew) inputRef.current?.focus();
  }, [addingNew]);

  const handleSave = async () => {
    const trimmed = newLocation.trim();
    if (!trimmed) return;
    setSaving(true);
    await addLocation(trimmed);
    onChange(trimmed);
    setNewLocation('');
    setAddingNew(false);
    setSaving(false);
  };

  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
          {label}{required && ' *'}
        </label>
      )}

      {addingNew ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            type="text"
            value={newLocation}
            onChange={e => setNewLocation(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setAddingNew(false);
            }}
            placeholder="e.g. Dubai"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !newLocation.trim()}
            style={{ ...saveBtnStyle, opacity: saving || !newLocation.trim() ? 0.5 : 1 }}
          >
            {saving ? '…' : 'Save'}
          </button>
          <button type="button" onClick={() => setAddingNew(false)} style={cancelBtnStyle}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
            <option value="">{placeholder}</option>
            {locations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
          <button type="button" onClick={() => setAddingNew(true)} style={addBtnStyle}>
            + Add New
          </button>
        </div>
      )}
    </div>
  );
};

// ── SerialLocationSelector (per-serial unit location) ─────────────────────────

interface SerialLocationSelectorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export const SerialLocationSelector: React.FC<SerialLocationSelectorProps> = ({
  value,
  onChange,
  placeholder = 'Location (optional)',
}) => {
  const { locations, addLocation } = useLocationList();
  const [addingNew,   setAddingNew]   = React.useState(false);
  const [newLocation, setNewLocation] = React.useState('');
  const [saving,      setSaving]      = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (addingNew) inputRef.current?.focus();
  }, [addingNew]);

  const handleSave = async () => {
    const trimmed = newLocation.trim();
    if (!trimmed) return;
    setSaving(true);
    await addLocation(trimmed);
    onChange(trimmed);
    setNewLocation('');
    setAddingNew(false);
    setSaving(false);
  };

  return (
    <div style={{ width: '100%' }}>
      {addingNew ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            type="text"
            value={newLocation}
            onChange={e => setNewLocation(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setAddingNew(false);
            }}
            placeholder="e.g. Saudia"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !newLocation.trim()}
            style={{ ...saveBtnStyle, opacity: saving || !newLocation.trim() ? 0.5 : 1 }}
          >
            {saving ? '…' : 'Save'}
          </button>
          <button type="button" onClick={() => setAddingNew(false)} style={cancelBtnStyle}>
            ✕
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
            <option value="">{placeholder}</option>
            {locations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
          <button type="button" onClick={() => setAddingNew(true)} style={addBtnStyle}>
            + Add New
          </button>
        </div>
      )}
    </div>
  );
};