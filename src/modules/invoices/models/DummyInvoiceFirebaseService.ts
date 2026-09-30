// Dummy Invoice Module - Firebase Service
// Saves to 'dummy_invoices' collection (separate from live invoices)
// Invoice numbers: DUM-DDMMYY-001, PRF-..., BOK-..., QUO-...

import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, runTransaction, Timestamp,
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';

export type DummyInvoiceType = 'Dummy' | 'Proforma' | 'Booking' | 'Quotation';

const COLLECTION = 'dummy_invoices';
const COUNTER_COLLECTION = 'dummy_invoice_counters';

const PREFIX: Record<DummyInvoiceType, string> = {
  Dummy:     'DUM',
  Proforma:  'PRF',
  Booking:   'BOK',
  Quotation: 'QUO',
};

export async function generateDummyInvoiceNumber(type: DummyInvoiceType): Promise<string> {
  const today = new Date();
  const dd    = String(today.getDate()).padStart(2, '0');
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const yy    = String(today.getFullYear()).slice(-2);
  const dateKey = `${dd}${mm}${yy}`;
  const prefix  = PREFIX[type];
  const counterId = `${prefix}-${dateKey}`;

  const counterRef = doc(db, COUNTER_COLLECTION, counterId);
  let seq = 1;

  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(counterRef);
      if (snap.exists()) {
        seq = (snap.data().seq || 0) + 1;
        tx.update(counterRef, { seq });
      } else {
        seq = 1;
        // Use set with merge to avoid already-exists conflict
        tx.set(counterRef, { date: dateKey, prefix, seq: 1 }, { merge: true });
      }
    });
  } catch (err) {
    // Fallback: just use timestamp-based suffix if transaction fails
    console.warn('[DummyInvoice] Counter transaction failed, using fallback:', err);
    seq = Date.now() % 1000;
  }

  return `${prefix}-${dateKey}-${String(seq).padStart(3, '0')}`;
}

export interface DummyInvoice {
  id: string;
  invoiceType:   DummyInvoiceType;
  invoiceNumber: string;
  date:          string;
  validUntil?:   string;
  // Customer
  customerName:     string;
  customerPhone:    string;
  customerPhone2?:  string;
  customerCNIC?:    string;
  customerCity?:    string;
  customerProvince?: string;
  customerAddress?: string;
  // Products — all manual, no inventory
  products: DummyInvoiceProduct[];
  totalAmount: number;
  // Sales
  salesperson?: string;
  notes?:       string;
  // Attachment + stamp — independent of the real invoice's inventory-sourced
  // product images: a dummy invoice has no linked product to pull a photo
  // from, so this is a single image the user attaches directly (stored as a
  // resized base64 data URL — no Storage bucket needed for a lightweight
  // draft-only record). digitalStamp reuses the same PDF rendering path as
  // real invoices (see invoicePdfService.ts's wantsLogo()).
  imageDataUrl?: string;
  digitalStamp?: boolean;
  // Meta
  createdAt: string;
  updatedAt: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Expired' | 'Converted';
}

export interface DummyInvoiceProduct {
  id:          string;
  productName: string;
  description: string;
  quantity:    number;
  unitPrice:   number;
  total:       number;
}

export class DummyInvoiceFirebaseService {
  static async fetchAll(): Promise<DummyInvoice[]> {
    try {
      const q    = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as DummyInvoice));
    } catch (err) {
      console.error('[DummyInvoice] fetchAll error:', err);
      return [];
    }
  }

  static async fetchById(id: string): Promise<DummyInvoice | null> {
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as DummyInvoice) : null;
    } catch { return null; }
  }

  static async create(data: Omit<DummyInvoice, 'id'>): Promise<DummyInvoice> {
    const now = new Date().toISOString();
    const payload = { ...data, createdAt: now, updatedAt: now };
    const ref = await addDoc(collection(db, COLLECTION), payload);
    return { id: ref.id, ...payload };
  }

  static async update(id: string, data: Partial<DummyInvoice>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  }

  static async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
  }
}