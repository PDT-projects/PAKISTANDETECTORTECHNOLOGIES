// Invoice Module - Additive Service
// CustomerFirebaseService.ts
//
// Persists customer contact info to a dedicated `customers` collection so that
// every new invoice can pre-fill a returning customer's full details, instead
// of only deriving them from past invoices in memory.
//
// Kept separate from InvoiceFirebaseService.ts (not fully available here) to
// follow this module's convention of not rewriting the main service blindly.

import {
  collection, doc, getDoc, getDocs, setDoc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { CustomerRecord, CustomerSuggestion, Invoice } from './types';

const CUSTOMERS_COLLECTION = 'customers';

// A phone number makes a stable, human-meaningful document id. Strip anything
// that Firestore doc ids can't contain (slashes, whitespace, etc.).
function phoneKey(phone: string): string {
  return (phone || '').replace(/[^0-9a-zA-Z]/g, '');
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined) out[k] = v; });
  return out as T;
}

export class CustomerFirebaseService {

  /** All saved customers, most-recently-updated first. */
  static async fetchAllCustomers(): Promise<CustomerRecord[]> {
    try {
      const q = query(collection(db, CUSTOMERS_COLLECTION), orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as CustomerRecord) }));
    } catch (error) {
      console.error('❌ Error fetching customers:', error);
      // Non-fatal: the form can still fall back to invoice-derived suggestions.
      return [];
    }
  }

  static async fetchCustomerByPhone(phone: string): Promise<CustomerRecord | null> {
    const key = phoneKey(phone);
    if (!key) return null;
    try {
      const snap = await getDoc(doc(db, CUSTOMERS_COLLECTION, key));
      if (!snap.exists()) return null;
      return { id: snap.id, ...(snap.data() as CustomerRecord) };
    } catch (error) {
      console.error(`❌ Error fetching customer ${phone}:`, error);
      return null;
    }
  }

  /**
   * Insert-or-update a customer keyed by phone number. Called on every invoice
   * save so the customer's latest contact info is always available next time.
   */
  static async upsertCustomer(customer: CustomerSuggestion, meta?: { invoiceDate?: string }): Promise<void> {
    const key = phoneKey(customer.customerPhone);
    if (!key) return; // no phone → nothing stable to key on

    const ref  = doc(db, CUSTOMERS_COLLECTION, key);
    const now  = new Date().toISOString();

    let existing: CustomerRecord | null = null;
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) existing = snap.data() as CustomerRecord;
    } catch { /* treat as new */ }

    const payload: CustomerRecord = stripUndefined({
      customerName:         customer.customerName,
      customerPhone:        customer.customerPhone,
      customerPhone2:       customer.customerPhone2,
      customerCNIC:         customer.customerCNIC,
      customerProvince:     customer.customerProvince,
      customerCity:         customer.customerCity,
      customerAddress:      customer.customerAddress,
      warrantyLocation:     customer.warrantyLocation,
      exchangeWarrantyNote: customer.exchangeWarrantyNote,
      invoiceCount:         (existing?.invoiceCount || 0) + 1,
      lastInvoiceDate:      meta?.invoiceDate || existing?.lastInvoiceDate || now,
      createdAt:            existing?.createdAt || now,
      updatedAt:            now,
    });

    try {
      await setDoc(ref, payload, { merge: true });
    } catch (error) {
      console.error('❌ Error saving customer:', error);
      // Non-fatal — invoice save should not fail because of this.
    }
  }

  /**
   * Convenience helper: pull the CustomerSuggestion shape out of a full Invoice
   * so callers (the form save path) can persist without extra mapping.
   */
  static customerFromInvoice(inv: Partial<Invoice>): CustomerSuggestion {
    return {
      customerName:         inv.customerName || '',
      customerPhone:        inv.customerPhone || '',
      customerPhone2:       inv.customerPhone2,
      customerCNIC:         inv.customerCNIC || '',
      customerProvince:     inv.customerProvince || '',
      customerCity:         inv.customerCity || '',
      customerAddress:      inv.customerAddress,
      warrantyLocation:     inv.warrantyLocation,
      exchangeWarrantyNote: inv.exchangeWarrantyNote || '',
    };
  }
}