import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyCrCOR6jlWXedciFHGoouswUMiCMEH9W2c",
  authDomain: "multiplayer-2c9a8.firebaseapp.com",
  databaseURL: "https://multiplayer-2c9a8-default-rtdb.firebaseio.com",
  projectId: "multiplayer-2c9a8",
  storageBucket: "multiplayer-2c9a8.firebasestorage.app",
  messagingSenderId: "839441381659",
  appId: "1:839441381659:web:8596059715e38500b03bbe",
  measurementId: "G-Q8F4D8Y4CB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database
export const database = getDatabase(app);

// Initialize Analytics (only in browser)
let analytics = null;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
} 