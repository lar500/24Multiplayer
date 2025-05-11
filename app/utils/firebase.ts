import { initializeApp } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';
import { getAnalytics, Analytics } from 'firebase/analytics';

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  // Removed measurementId from local config to prevent mismatch
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
export let database: Database;
try {
  database = getDatabase(app);
  console.log('[Firebase] Database initialized successfully');
} catch (error) {
  console.error('[Firebase] Failed to initialize database:', error);
  throw error;
}

// Initialize Analytics (only in browser and only if not blocked)
export let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  try {
    // Check if analytics is blocked
    const isAnalyticsBlocked = window.navigator.userAgent.includes('Firefox') || 
                             window.navigator.userAgent.includes('Safari') && 
                             !window.navigator.userAgent.includes('Chrome');
    
    if (!isAnalyticsBlocked) {
      analytics = getAnalytics(app);
      console.log('[Firebase] Analytics initialized successfully');
    } else {
      console.log('[Firebase] Analytics initialization skipped (blocked by browser)');
    }
  } catch (error) {
    console.log('[Firebase] Analytics initialization skipped:', error);
    // Don't throw here, analytics is optional
  }
} 