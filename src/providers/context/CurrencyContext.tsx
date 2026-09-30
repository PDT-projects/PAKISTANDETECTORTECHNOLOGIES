// System-wide currency setting.
//
// This is symbol-only, by design: switching the currency relabels every
// amount already stored in the app (AED 1,000 → USD 1,000) without
// converting the underlying number. There is deliberately no exchange-rate
// math here — that lives in currencyUtils.ts's rate-based converter, which
// is a separate, opt-in tool for screens that explicitly need FX conversion.
//
// The setting lives in Firestore (`settings/currency`, mirroring the
// `settings/cashOpening` pattern already used for the Cash-in-Hand opening
// balance) and is read through a live subscription, so a super_admin
// changing it in User Management updates every open screen — including
// other users' sessions — without anyone needing to refresh.

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../api/firebase/firebase';
import { syncGlobalCurrencyCode } from '../../shared/currency/globalCurrency';

export type CurrencyCode = 'AED' | string;

const SETTINGS_DOC = doc(db, 'settings', 'currency');
const DEFAULT_CURRENCY: CurrencyCode = 'AED';

type CurrencyContextValue = {
  /** The system-wide currency code (e.g. 'AED', 'USD'). */
  primary: CurrencyCode;
  /** True until the first Firestore read resolves — lets a consumer avoid a flash of the default. */
  isLoading: boolean;
  /** Change the system-wide currency for everyone. Persists to Firestore. */
  setPrimary: (c: CurrencyCode) => Promise<void>;
  // Reserved for a future multi-currency display mode (e.g. showing a
  // secondary currency alongside the primary). Not used anywhere yet.
  extras: CurrencyCode[];
  setExtras: (c: CurrencyCode[]) => void;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [primary, setPrimaryState] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [isLoading, setIsLoading] = useState(true);
  const [extras, setExtras] = useState<CurrencyCode[]>([]);

  useEffect(() => {
    // `settings/{docId}` requires auth (firestore.rules: `allow read, write:
    // if isAuth()`), but this provider is mounted above AuthProvider in the
    // tree (see main.tsx / App.tsx) so it renders — and this effect fires —
    // before Firebase Auth has restored the session on a fresh page load.
    // Firestore's own auto-retry does NOT cover this: an onSnapshot listener
    // that receives permission-denied is torn down for good, so subscribing
    // immediately here would silently die on every cold load and never
    // recover even after the user is signed in. Gating on onAuthStateChanged
    // — and re-subscribing on every auth change — avoids that.
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSnapshot?.();
      unsubscribeSnapshot = null;

      if (!user) {
        // Signed out (or not yet signed in) — nothing we're allowed to read.
        // Keep whatever value is already in state; just stop showing "loading".
        setIsLoading(false);
        return;
      }

      unsubscribeSnapshot = onSnapshot(
        SETTINGS_DOC,
        (snap) => {
          const code = snap.exists() ? (snap.data() as any)?.code : undefined;
          const resolved = typeof code === 'string' && code ? code : DEFAULT_CURRENCY;
          setPrimaryState(resolved);
          // Keep globalCurrency.ts's plain (non-hook) mirror in sync directly
          // from this confirmed-reliable subscription — see globalCurrency.ts's
          // file-level comment for why this is its primary source of truth.
          syncGlobalCurrencyCode(resolved);
          setIsLoading(false);
        },
        (err) => {
          console.error('[CurrencyContext] settings/currency subscription failed:', err);
          setIsLoading(false);
        },
      );
    });

    return () => {
      unsubscribeSnapshot?.();
      unsubscribeAuth();
    };
  }, []);

  const setPrimary = async (c: CurrencyCode) => {
    // Optimistic local update — the onSnapshot above will confirm it, but
    // this keeps the change feeling instant for the admin who made it.
    setPrimaryState(c);
    syncGlobalCurrencyCode(c);
    await setDoc(SETTINGS_DOC, { code: c, updatedAt: new Date().toISOString() }, { merge: true });
  };

  return (
    <CurrencyContext.Provider value={{ primary, isLoading, setPrimary, extras, setExtras }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}

export default CurrencyProvider;
