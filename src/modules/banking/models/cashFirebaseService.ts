// Banking Module - Firebase Service for Cash Transactions

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { CashTransaction } from './types';

const CASH_COLLECTION = 'cash_transactions';
const CASH_BALANCE_COLLECTION = 'cashInHand';

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

export interface CashInHandRecord {
  id: string;
  location: string;
  balance: number;
  lastUpdated: string;
  updatedBy: string;
}

export class CashFirebaseService {

  // ==================== CASH TRANSACTIONS ====================

  static async fetchAllCashTransactions(): Promise<CashTransaction[]> {
    try {
      console.log('🔥 Fetching all cash transactions from Firestore...');
      const q = query(collection(db, CASH_COLLECTION), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      const txns = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CashTransaction));
      console.log(`✅ Fetched ${txns.length} cash transactions`);
      return txns;
    } catch (error) {
      console.error('❌ Error fetching cash transactions:', error);
      throw new Error('Failed to fetch cash transactions from Firestore');
    }
  }

  static async createCashTransaction(txn: Omit<CashTransaction, 'id'>): Promise<CashTransaction> {
    try {
      const payload = stripUndefined({ ...txn, createdAt: new Date().toISOString() });
      const docRef = await addDoc(collection(db, CASH_COLLECTION), payload);
      console.log('✅ Cash transaction created:', docRef.id);
      return { id: docRef.id, ...txn };
    } catch (error) {
      console.error('❌ Error creating cash transaction:', error);
      throw new Error('Failed to create cash transaction in Firestore');
    }
  }

  static async deleteCashTransaction(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, CASH_COLLECTION, id));
      console.log('✅ Cash transaction deleted:', id);
    } catch (error) {
      console.error('❌ Error deleting cash transaction:', error);
      throw new Error('Failed to delete cash transaction from Firestore');
    }
  }

  // 🔧 ALIAS for inventory integration (matches BankFirebaseService.addBankTransaction)
  static async addCashTransaction(txn: Omit<CashTransaction, 'id'>): Promise<void> {
    console.log('🔥 Saving cash transaction (inventory):', txn);
    await this.createCashTransaction(txn);
    console.log('✅ Cash transaction (inventory) saved');
  }


  // ==================== CASH IN HAND BALANCE ====================

  static async fetchAllCashRecords(): Promise<CashInHandRecord[]> {
    try {
      const q = query(collection(db, CASH_BALANCE_COLLECTION), orderBy('location', 'asc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CashInHandRecord));
    } catch (error) {
      console.error('❌ Error fetching cash records:', error);
      throw new Error('Failed to fetch cash records from Firestore');
    }
  }

  static async fetchCashByLocation(location: string): Promise<CashInHandRecord | null> {
    try {
      const q = query(collection(db, CASH_BALANCE_COLLECTION), where('location', '==', location));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      const d = snapshot.docs[0];
      return { id: d.id, ...d.data() } as CashInHandRecord;
    } catch (error) {
      console.error('❌ Error fetching cash by location:', error);
      throw new Error('Failed to fetch cash record by location');
    }
  }

  static async getOrCreateCashForLocation(location: string, updatedBy: string = 'System'): Promise<CashInHandRecord> {
    let record = await this.fetchCashByLocation(location);
    if (record) return record;
    const payload = {
      location,
      balance: 0,
      updatedBy,
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    const docRef = await addDoc(collection(db, CASH_BALANCE_COLLECTION), payload);
    return { id: docRef.id, location, balance: 0, lastUpdated: new Date().toISOString(), updatedBy };
  }

  static async updateCashBalance(id: string, newBalance: number, updatedBy: string = 'System'): Promise<void> {
    try {
      await updateDoc(doc(db, CASH_BALANCE_COLLECTION, id), {
        balance: newBalance,
        updatedBy,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error updating cash balance:', error);
      throw new Error('Failed to update cash balance in Firestore');
    }
  }

  static async deleteCashRecord(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, CASH_BALANCE_COLLECTION, id));
    } catch (error) {
      console.error('❌ Error deleting cash record:', error);
      throw new Error('Failed to delete cash record from Firestore');
    }
  }

  /**
   * Live subscription to the Cash-in-Hand records — same query as
   * fetchAllCashRecords(), but pushed on every change instead of read once.
   * Any screen using this (Transactions "Opening Bal" tile, the Account
   * dropdown in Add Transaction) updates the instant the opening balance is
   * saved, with no manual refresh or page reload needed.
   */
  static subscribeToCashRecords(callback: (records: CashInHandRecord[]) => void): Unsubscribe {
    const q = query(collection(db, CASH_BALANCE_COLLECTION), orderBy('location', 'asc'));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as CashInHandRecord))),
      (error) => console.error('❌ cashInHand subscription failed:', error),
    );
  }

  /** Live subscription to the cash ledger (`cash_transactions`), mirroring subscribeToCashRecords(). */
  static subscribeToCashTransactions(callback: (txns: CashTransaction[]) => void): Unsubscribe {
    const q = query(collection(db, CASH_COLLECTION), orderBy('date', 'desc'));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as CashTransaction))),
      (error) => console.error('❌ cash_transactions subscription failed:', error),
    );
  }

  /**
   * Set the opening balance for the PRIMARY Cash-in-Hand record — the same
   * record (`records[0]`, ordered by location) that the Balance Sheet Report,
   * the Dashboard and the Transactions module's "Opening Bal" tile all read
   * as the single company-wide cash opening balance. Creates that record if
   * none exists yet, instead of writing to a separate, unread location.
   */
  static async setPrimaryCashOpening(amount: number, updatedBy: string = 'System'): Promise<void> {
    const records = await this.fetchAllCashRecords();
    if (records.length > 0) {
      await this.updateCashBalance(records[0].id, amount, updatedBy);
    } else {
      const record = await this.getOrCreateCashForLocation('Head Office - Dubai', updatedBy);
      await this.updateCashBalance(record.id, amount, updatedBy);
    }
  }
}