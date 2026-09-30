// scripts/fixTransactionCurrency.mjs
//
// ONE-TIME cleanup: fixes transactions that were saved BEFORE the currency
// bug fix, where `amount` / `amountPaid` / `remainingAmount` were stored as
// a PKR-converted number instead of the AED value the user actually typed.
//
// This version logs in with your normal app email/password first (same as
// logging into the Bullion System app in the browser), so Firestore's
// security rules allow it to read/write — no service account key needed.
//
// How it decides what to fix:
//   Every affected transaction already has an `originalAmount` field — the
//   real AED value, saved alongside the (wrongly) converted `amount`. This
//   script restores `amount` back to that trustworthy value. It never
//   guesses or re-converts with today's exchange rate.
//
// Safety:
//   - Runs in DRY-RUN mode by default — prints what it WOULD change, writes
//     nothing. Pass --apply to actually write.
//
// Usage:
//   node scripts/fixTransactionCurrency.mjs            # dry run (safe, no writes)
//   node scripts/fixTransactionCurrency.mjs --apply     # actually fix Firestore

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

// Same config as src/api/firebase/firebase.ts — your real project.
const firebaseConfig = {
  apiKey: "AIzaSyDEqW2ciPiAkm8dZIqbWqmT92j20wouMXI",
  authDomain: "bullionelectronicssoftware.firebaseapp.com",
  projectId: "bullionelectronicssoftware",
  storageBucket: "bullionelectronicssoftware.firebasestorage.app",
  messagingSenderId: "777810167749",
  appId: "1:777810167749:web:9dd883ecf490423eeb6dac",
};

const APPLY = process.argv.includes('--apply');

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function login() {
  const rl = readline.createInterface({ input, output });
  const email = await rl.question('Bullion System login email: ');
  const password = await rl.question('Password: ');
  rl.close();
  await signInWithEmailAndPassword(auth, email.trim(), password);
  console.log(`Logged in as ${email.trim()}\n`);
}

async function main() {
  await login();

  const snap = await getDocs(collection(db, 'transactions'));
  console.log(`Scanning ${snap.size} transactions...\n`);

  const toFix = [];
  const skippedNoOriginal = [];

  for (const d of snap.docs) {
    const t = d.data();
    const hasOriginal = typeof t.originalAmount === 'number' && !Number.isNaN(t.originalAmount);

    if (!hasOriginal) {
      if (typeof t.amount === 'number') skippedNoOriginal.push({ id: d.id, transactionId: t.transactionId, amount: t.amount });
      continue;
    }

    const currentAmount = round2(t.amount);
    const correctAmount = round2(t.originalAmount);

    if (Math.abs(currentAmount - correctAmount) < 0.01) continue;

    const currentPaid = typeof t.amountPaid === 'number' ? round2(t.amountPaid) : 0;
    const correctPaid = typeof t.originalAmountPaid === 'number' ? round2(t.originalAmountPaid) : correctAmount;
    const correctRemaining = Math.max(0, round2(correctAmount - correctPaid));

    toFix.push({
      id: d.id,
      transactionId: t.transactionId,
      before: { amount: currentAmount, amountPaid: currentPaid },
      after:  { amount: correctAmount, amountPaid: correctPaid, remainingAmount: correctRemaining },
    });
  }

  console.log(`Found ${toFix.length} transaction(s) to fix.`);
  console.log(`Found ${skippedNoOriginal.length} transaction(s) with no originalAmount — skipped, review manually.\n`);

  for (const f of toFix.slice(0, 20)) {
    console.log(`  ${f.transactionId || f.id}:  amount ${f.before.amount} -> ${f.after.amount}   paid ${f.before.amountPaid} -> ${f.after.amountPaid}`);
  }
  if (toFix.length > 20) console.log(`  ...and ${toFix.length - 20} more`);

  if (skippedNoOriginal.length) {
    console.log(`\nSkipped (no originalAmount, needs manual review):`);
    for (const s of skippedNoOriginal.slice(0, 20)) {
      console.log(`  ${s.transactionId || s.id}:  amount = ${s.amount}`);
    }
    if (skippedNoOriginal.length > 20) console.log(`  ...and ${skippedNoOriginal.length - 20} more`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — nothing was written. Re-run with --apply to fix these ${toFix.length} transaction(s).`);
    return;
  }

  console.log(`\nApplying fixes...`);
  const BATCH_SIZE = 400;
  for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const f of toFix.slice(i, i + BATCH_SIZE)) {
      batch.update(doc(db, 'transactions', f.id), {
        amount:          f.after.amount,
        amountPaid:      f.after.amountPaid,
        remainingAmount: f.after.remainingAmount,
      });
    }
    await batch.commit();
    console.log(`  committed ${Math.min(i + BATCH_SIZE, toFix.length)}/${toFix.length}`);
  }
  console.log(`\nDone. Fixed ${toFix.length} transaction(s).`);
  console.log(`\nNOTE: bank balance fields were updated live using the OLD (wrong) amounts`);
  console.log(`over time, so they may still be off even after this fix. Reconcile each bank's`);
  console.log(`stored balance against its real bank statement and correct it manually if needed.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });