import { initializeApp } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';
import { getAnalytics, Analytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Log config (without sensitive values)
console.log('[Firebase] Initializing with config:', {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey ? '***' : undefined,
  appId: firebaseConfig.appId ? '***' : undefined
});

// Validate required config
const requiredFields = ['apiKey', 'databaseURL', 'projectId'];
const missingFields = requiredFields.filter(field => !firebaseConfig[field as keyof typeof firebaseConfig]);
if (missingFields.length > 0) {
  console.error('[Firebase] Missing required config fields:', missingFields);
  throw new Error(`Missing required Firebase config fields: ${missingFields.join(', ')}`);
}

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log('[Firebase] App initialized successfully');
} catch (error) {
  console.error('[Firebase] Failed to initialize app:', error);
  throw error;
}

// Initialize Realtime Database
let database: Database;
try {
  database = getDatabase(app);
  console.log('[Firebase] Database initialized successfully');
} catch (error) {
  console.error('[Firebase] Failed to initialize database:', error);
  throw error;
}

export { database };

// Initialize Analytics (only in browser)
export let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
    console.log('[Firebase] Analytics initialized successfully');
  } catch (error) {
    console.error('[Firebase] Failed to initialize analytics:', error);
    // Don't throw here, analytics is optional
  }
} 