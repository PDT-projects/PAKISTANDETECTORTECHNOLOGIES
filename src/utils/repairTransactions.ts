// // ONE-TIME REPAIR SCRIPT
// // Run this ONCE from your browser console or as a temporary button in your app.
// // It finds invoice-linked transactions where amount > 50000 (clearly inflated
// // by the old PKR conversion bug) and divides them back down to correct AED.

// import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
// import { db } from '../api/firebase/firebase';

// const PKR_TO_AED = 3.67 / 279.5; // ~0.01313

// export async function repairInflatedTransactions() {
//   const snap = await getDocs(collection(db, 'transactions'));
//   let fixed = 0;
//   for (const d of snap.docs) {
//     const data = d.data();
//     // Only fix invoice-linked transactions with clearly inflated amounts
//     if (data.linkedType === 'invoice' && (data.amount || 0) > 50000) {
//       const corrected = Math.round(data.amount * PKR_TO_AED * 100) / 100;
//       await updateDoc(doc(db, 'transactions', d.id), {
//         amount:     corrected,
//         amountPaid: corrected,
//         remainingAmount: 0,
//       });
//       console.log(`✅ Fixed ${d.id}: ${data.amount} → ${corrected}`);
//       fixed++;
//     }
//   }
//   console.log(`Done. Fixed ${fixed} transactions.`);
// }