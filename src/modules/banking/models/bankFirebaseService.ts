// Banking Module - Firebase Service for Banks

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where
} from 'firebase/firestore';
import { db } from '../../../api/firebase/firebase';
import { Bank } from './types';

const BANKS_COLLECTION = 'banks';

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

export class BankFirebaseService {

  static async fetchAllBanks(): Promise<Bank[]> {
    try {
      console.log('🔥 Fetching all banks from Firestore...');
      const q = query(collection(db, BANKS_COLLECTION), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      const banks = snapshot.docs.map(d => ({
        id: d.id,
        name: d.data().name || '',
        accountNumber: d.data().accountNumber || '',
        balance: d.data().balance || 0,
        currency: (d.data().currency as 'AED' | 'PKR') || 'AED',
      } as Bank));
      console.log(`✅ Fetched ${banks.length} banks`);
      return banks;
    } catch (error) {
      console.error('❌ Error fetching banks:', error);
      throw new Error('Failed to fetch banks from Firestore');
    }
  }

  static async fetchBankById(id: string): Promise<Bank | null> {
    try {
      const snapshot = await getDoc(doc(db, BANKS_COLLECTION, id));
      if (!snapshot.exists()) return null;
      const data = snapshot.data();
      return { id: snapshot.id, name: data.name, accountNumber: data.accountNumber, balance: data.balance };
    } catch (error) {
      console.error('❌ Error fetching bank:', error);
      throw new Error('Failed to fetch bank from Firestore');
    }
  }

  static async createBank(bank: Omit<Bank, 'id'>): Promise<Bank> {
    try {
      const payload = stripUndefined({ ...bank, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      const docRef = await addDoc(collection(db, BANKS_COLLECTION), payload);
      console.log('✅ Bank created:', docRef.id);
      return { id: docRef.id, ...bank };
    } catch (error) {
      console.error('❌ Error creating bank:', error);
      throw new Error('Failed to create bank in Firestore');
    }
  }

  static async updateBank(bank: Bank): Promise<Bank> {
    try {
      await updateDoc(doc(db, BANKS_COLLECTION, bank.id), {
        name: bank.name,
        accountNumber: bank.accountNumber,
        balance: bank.balance,
        currency: bank.currency || 'AED',
        updatedAt: new Date().toISOString()
      });
      console.log('✅ Bank updated:', bank.id);
      return bank;
    } catch (error) {
      console.error('❌ Error updating bank:', error);
      throw new Error('Failed to update bank in Firestore');
    }
  }

  static async updateBankBalance(id: string, newBalance: number): Promise<void> {
    try {
      await updateDoc(doc(db, BANKS_COLLECTION, id), {
        balance: newBalance,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error updating bank balance:', error);
      throw new Error('Failed to update bank balance in Firestore');
    }
  }

  static async deleteBank(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, BANKS_COLLECTION, id));
      console.log('✅ Bank deleted:', id);
    } catch (error) {
      console.error('❌ Error deleting bank:', error);
      throw new Error('Failed to delete bank from Firestore');
    }
  }

  static async updateMultipleBanks(banks: Bank[]): Promise<void> {
    for (const bank of banks) {
      await this.updateBank(bank);
    }
  }

  // ==================== BANK TRANSACTIONS ====================
  
  static async addBankTransaction(txn: {
    bankId: string;
    bankName: string;
    date: string;
    type: 'debit' | 'credit';
    amount: number;
    description: string;
    reference?: string;
    inventoryId?: string;
    category?: string;
    note?: string;
  }): Promise<void> {
    try {
      const payload = {
        ...txn,
        createdAt: new Date().toISOString(),
        amount: Math.abs(txn.amount) // Ensure positive
      };
      await addDoc(collection(db, 'bank_transactions'), payload);
      console.log(`✅ Bank transaction saved: ${txn.bankId} ${txn.type} PKR ${txn.amount.toLocaleString()}`);
    } catch (error) {
      console.error('❌ Error saving bank transaction:', error);
      throw new Error('Failed to save bank transaction');
    }
  }

  static async fetchBankTransactions(bankId?: string): Promise<any[]> {
    try {
      let q = query(collection(db, 'bank_transactions'), orderBy('date', 'desc'));
      if (bankId) {
        q = query(q, where('bankId', '==', bankId));
      }
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error('❌ Error fetching bank transactions:', error);
      return [];
    }
  }
}