// Plain (non-React) mirror of the system-wide currency setting.
//
// useGlobalCurrency.tsx covers React components. This file exists for code
// that reads the currency outside a component render — a module-level
// constant evaluated once (e.g. `const CURRENCY = () => getGlobalCurrencySymbol()`
// in TransactionListView.tsx), or a plain service file with no hooks at all
// (transactionsService.ts's `formatCurrency`).
//
// currentCode's PRIMARY source is syncGlobalCurrencyCode(), called directly
// by CurrencyContext.tsx whenever its own (confirmed-reliable) Firestore
// subscription delivers a value. bootGlobalCurrency()/GlobalCurrencyBoot
// below is a second, independent subscription to the same doc, kept as a
// belt-and-suspenders backup for code that runs before any component using
// useCurrency()/useGlobalCurrency() has rendered — but nothing here depends
// on it firing; the sync call from CurrencyContext is what actually keeps
// this file correct in practice.
//
// Symbol-only: nothing here converts a stored number. formatGlobalCurrency
// only changes the label Intl.NumberFormat prints next to a figure.

import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../api/firebase/firebase';
import { CURRENCIES } from '../../features/finance/currencyUtils';

const SETTINGS_DOC = doc(db, 'settings', 'currency');
const DEFAULT_CODE = 'AED';

/** Short, unambiguous symbol for each currency User Management's dropdown offers. */
const CODE_SYMBOL: Record<string, string> = {
  PKR: 'Rs',
  USD: '$',
  CAD: 'CA$',
  AED: 'AED',
  SAR: 'SAR',
};

let currentCode: string = DEFAULT_CODE;
let unsubscribeDoc: (() => void) | null = null;
let unsubscribeAuth: (() => void) | null = null;

/**
 * Direct setter, called by CurrencyContext.tsx every time its own
 * (confirmed-reliable) Firestore subscription delivers a value — on the
 * initial snapshot and on every later change, plus optimistically inside
 * setPrimary(). This is what actually keeps currentCode correct in the
 * running app; see the file-level comment above for why.
 */
export function syncGlobalCurrencyCode(code: string): void {
  currentCode = code;
}

/**
 * Starts the live Firestore subscription backing every getter below.
 *
 * `settings/{docId}` requires auth (firestore.rules: `allow read, write: if
 * isAuth()`), and this is booted from the very top of App.tsx — before
 * Firebase Auth has restored the session on a fresh page load. Subscribing
 * immediately would hit permission-denied and die for good (Firestore does
 * not retry a listener that failed on permissions, even once the user is
 * signed in moments later), so this waits for onAuthStateChanged and
 * re-subscribes on every auth change instead of subscribing directly.
 *
 * Idempotent — calling it again while already booted just returns the same
 * teardown function instead of registering a second auth listener.
 *
 * Kept as a backup path only — see the file-level comment. Not required for
 * currentCode to stay correct.
 */
export function bootGlobalCurrency(): () => void {
  if (unsubscribeAuth) return teardown;

  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    unsubscribeDoc?.();
    unsubscribeDoc = null;

    if (!user) {
      // Signed out (or not yet signed in) — nothing we're allowed to read.
      // Getters keep returning the last known value (or the AED default).
      return;
    }

    unsubscribeDoc = onSnapshot(
      SETTINGS_DOC,
      (snap) => {
        const code = snap.exists() ? (snap.data() as any)?.code : undefined;
        currentCode = typeof code === 'string' && code ? code : DEFAULT_CODE;
      },
      (err) => {
        console.error('[globalCurrency] settings/currency subscription failed:', err);
      },
    );
  });

  return teardown;
}

function teardown() {
  unsubscribeDoc?.();
  unsubscribeAuth?.();
  unsubscribeDoc = null;
  unsubscribeAuth = null;
}

export function getGlobalCurrency(): { code: string; name: string; symbol: string } {
  const meta = CURRENCIES.find(c => c.code === currentCode);
  return {
    code: currentCode,
    name: meta?.label ?? currentCode,
    symbol: CODE_SYMBOL[currentCode] ?? currentCode,
  };
}

export function getGlobalCurrencySymbol(): string {
  return CODE_SYMBOL[currentCode] ?? currentCode;
}

/** Formats a stored figure in the live global currency. No conversion —
 *  same number, different label. Returns '—' for an undefined amount. */
export function formatGlobalCurrency(amount?: number): string {
  if (amount === undefined) return '—';
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: currentCode,
    minimumFractionDigits: 0,
  }).format(amount);
}
