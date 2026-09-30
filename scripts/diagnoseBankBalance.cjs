/**
 * diagnoseBankBalance.cjs
 * ─────────────────────────────────────────────────────────────────────────
 * READ-ONLY. Changes nothing. Prints:
 *   1) Every doc in the `banks` collection (id, name, opening balance).
 *   2) Every transaction that looks like it belongs to a bank named
 *      "ASKARI BANK" (or whatever name you pass), showing exactly which
 *      bankId/accountId field it's tagged with.
 * This reveals whether there are duplicate bank docs, or transactions
 * pointing at a bankId that doesn't match the bank doc actually shown
 * in the UI.
 *
 * USAGE:
 *   node scripts/diagnoseBankBalance.cjs "ASKARI BANK"
 * ─────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');
const { initializeApp, cert }     = require('firebase-admin/app');
const { getFirestore }            = require('firebase-admin/firestore');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('\n❌  serviceAccountKey.json not found in scripts/\n');
  process.exit(1);
}
initializeApp({ credential: cert(require(SERVICE_ACCOUNT_PATH)) });
const db = getFirestore();

const targetName = (process.argv[2] || 'ASKARI BANK').toLowerCase();

(async () => {
  console.log(`\n🔎  Looking for bank docs matching name: "${targetName}"\n`);

  const banksSnap = await db.collection('banks').get();
  const matches = [];
  banksSnap.docs.forEach(d => {
    const data = d.data();
    const name = String(data.name || '').toLowerCase();
    if (name.includes(targetName)) matches.push({ id: d.id, ...data });
  });

  if (matches.length === 0) {
    console.log('  No bank docs matched that name at all.');
  } else {
    console.log(`  Found ${matches.length} bank doc(s) with that name:`);
    matches.forEach(m => {
      console.log(`    id=${m.id}  name="${m.name}"  balance(opening)=${m.balance}`);
    });
    if (matches.length > 1) {
      console.log('\n  ⚠️  MORE THAN ONE bank doc with this name — this is almost');
      console.log('      certainly the bug: different screens may be reading from');
      console.log('      different doc IDs.\n');
    }
  }

  console.log(`\n🔎  Scanning transactions for bankId/accountId referencing this bank...\n`);
  const txSnap = await db.collection('transactions').get();
  const bankIdCounts = new Map();
  let scanned = 0;
  txSnap.docs.forEach(d => {
    const t = d.data();
    const bName = String(t.bankName || t.accountName || '').toLowerCase();
    if (!bName.includes(targetName)) return;
    scanned++;
    const usedId = t.accountId || t.bankId || '(none)';
    const key = `${usedId}  [accountId=${t.accountId || '—'}, bankId=${t.bankId || '—'}, accountType=${t.accountType || '—'}, mode=${t.mode || '—'}]`;
    bankIdCounts.set(key, (bankIdCounts.get(key) || 0) + 1);
  });

  console.log(`  ${scanned} transaction(s) reference a bank named like "${targetName}":`);
  bankIdCounts.forEach((count, key) => {
    console.log(`    ${count}x  →  id used: ${key}`);
  });

  console.log('\n✅  Diagnosis complete. Compare the bank doc id(s) above against');
  console.log('    the id(s) actually referenced by the transactions.');
  console.log('    If they don\'t match, that mismatch is the bug.\n');

  process.exit(0);
})().catch(err => {
  console.error('\n❌  Error:', err);
  process.exit(1);
});