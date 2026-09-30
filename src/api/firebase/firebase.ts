import { initializeFirestore } from "firebase/firestore";
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";

// Your web app's Firebase configuration.
// Reads from Vite env vars (VITE_FIREBASE_*) when they're set, so a
// per-company clone can point at its own Firebase project just by building
// with a different .env file - see .env.example. If no env vars are set
// (the normal case today), it falls back to these exact original values,
// so THIS deployment (Bullion Electronics) is completely unaffected.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDEqW2ciPiAkm8dZIqbWqmT92j20wouMXI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "bullionelectronicssoftware.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "bullionelectronicssoftware",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "bullionelectronicssoftware.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "777810167749",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:777810167749:web:9dd883ecf490423eeb6dac"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firestore's default transport (WebChannel over QUIC/HTTP3) fails outright
// on some networks - corporate firewalls, some antivirus software, certain
// ISPs/proxies that interfere with QUIC/UDP - surfacing as repeated
// net::ERR_QUIC_PROTOCOL_ERROR.QUIC_TOO_MANY_RTOS on the Listen channel in
// the browser console. When that happens, writes can still go through (plain
// HTTPS requests), but the live onSnapshot channel that pushes updates back
// never recovers - so changes never appear to take effect, anywhere in the
// app, until a full reload happens to catch a fresh read. Auto-detecting
// long-polling sidesteps QUIC entirely on networks where it's unreliable,
// while still using the normal fast transport everywhere else.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

export const functions = getFunctions(app);
export { app };
