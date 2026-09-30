// migrateBanksToAED.js
// Node script to convert bank records stored with PKR currency into AED in Firestore.
// Usage:
// 1) Install dependencies: npm install firebase-admin
// 2) Set env var GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path
// 3) Optionally override rates via env: PKR_RATE and AED_RATE
// 4) Run: node scripts/migrateBanksToAED.js

const admin = require('firebase-admin');

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';
let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
} catch (err) {
  console.error('Failed to load service account JSON. Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccountKey.json next to this script.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const PKR_RATE = parseFloat(process.env.PKR_RATE) || 279.5; // fallback PKR per USD
const AED_RATE = parseFloat(process.env.AED_RATE) || 3.67;   // fallback AED per USD
// convertFromPKR -> AED = (amount / PKR_rate) * AED_rate
function convertFromPKRToAED(amount) {
  return (amount / PKR_RATE) * AED_RATE;
}

async function migrate() {
  console.log('Starting bank migration: converting PKR accounts to AED...');
  const banksRef = db.collection('banks');
  const snapshot = await banksRef.get();
  if (snapshot.empty) {
    console.log('No bank documents found. Exiting.');
    return;
  }

  const updates = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const currency = data.currency || 'AED';
    const balance = Number(data.balance || 0);
    if (currency === 'PKR') {
      const newBal = Number(convertFromPKRToAED(balance).toFixed(2));
      updates.push({ id: doc.id, old: { currency, balance }, new: { currency: 'AED', balance: newBal } });
    }
  });

  if (updates.length === 0) {
    console.log('No PKR banks to migrate. Exiting.');
    return;
  }

  console.log(`Found ${updates.length} PKR bank(s). Applying updates...`);
  for (const u of updates) {
    try {
      await banksRef.doc(u.id).update({ balance: u.new.balance, currency: u.new.currency, updatedAt: new Date().toISOString() });
      console.log(`Updated ${u.id}: ${u.old.currency} ${u.old.balance} -> ${u.new.currency} ${u.new.balance}`);
    } catch (err) {
      console.error(`Failed to update ${u.id}:`, err.message || err);
    }
  }

  console.log('Migration completed.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
