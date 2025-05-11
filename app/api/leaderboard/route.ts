import { NextResponse } from 'next/server';
import type { SpeedrunRecord } from '../../utils/leaderboard';
import { getSharedLeaderboard, saveToSharedLeaderboard } from '../../utils/sharedLeaderboard';
import { getFirebaseLeaderboard, saveToFirebaseLeaderboard } from '../../utils/firebaseLeaderboard';
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Log config (without sensitive values)
console.log('[API] Initializing Firebase with config:', {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey ? '***' : undefined,
  appId: firebaseConfig.appId ? '***' : undefined
});

// Validate required config
const requiredFields = ['apiKey', 'databaseURL', 'projectId'];
const missingFields = requiredFields.filter(field => !firebaseConfig[field as keyof typeof firebaseConfig]);
if (missingFields.length > 0) {
  console.error('[API] Missing required Firebase config fields:', missingFields);
  throw new Error(`Missing required Firebase config fields: ${missingFields.join(', ')}`);
}

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log('[API] Firebase app initialized successfully');
} catch (error) {
  console.error('[API] Failed to initialize Firebase app:', error);
  throw error;
}

// Initialize Realtime Database
let database;
try {
  database = getDatabase(app);
  console.log('[API] Firebase database initialized successfully');
} catch (error) {
  console.error('[API] Failed to initialize Firebase database:', error);
  throw error;
}

// Get all records from the global leaderboard
export async function GET() {
  console.log('[API] ===== Starting GET request for leaderboard =====');
  
  try {
    // Try Firebase first
    console.log('[API] Attempting to fetch from Firebase...');
    let records = await getFirebaseLeaderboard();
    console.log('[API] Firebase response:', { 
      recordCount: records.length,
      records: records // Log the actual records for debugging
    });
    
    // If Firebase returns no records, try MongoDB
    if (records.length === 0) {
      console.log('[API] No records in Firebase, trying MongoDB...');
      records = await getSharedLeaderboard();
      console.log('[API] MongoDB response:', { 
        recordCount: records.length,
        records: records // Log the actual records for debugging
      });
    }
    
    console.log('[API] Final records to return:', { 
      recordCount: records.length,
      records: records // Log the actual records for debugging
    });
    
    // Add CORS headers
    const response = NextResponse.json(
      { records },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
    
    console.log('[API] Response being sent:', {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.clone().json()
    });
    
    return response;
  } catch (error) {
    console.error('[API] Error fetching leaderboard:', error);
    if (error instanceof Error) {
      console.error('[API] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } finally {
    console.log('[API] ===== Completed GET request for leaderboard =====');
  }
}

// Add a new record to the global leaderboard
export async function POST(request: Request) {
  console.log('[API] ===== Starting POST request for leaderboard =====');
  try {
    const record: SpeedrunRecord = await request.json();
    console.log('[API] Received record:', {
      id: record.id,
      name: record.name,
      totalTime: record.totalTime,
      date: record.date,
      userId: record.userId,
      splitsLength: record.splits.length
    });
    
    // Validate the record
    if (!record.id || !record.userId || !record.name || !record.date || !record.totalTime || !Array.isArray(record.splits)) {
      console.error('[API] Invalid record format:', {
        hasId: !!record.id,
        hasUserId: !!record.userId,
        hasName: !!record.name,
        hasDate: !!record.date,
        hasTotalTime: !!record.totalTime,
        hasSplits: Array.isArray(record.splits)
      });
      return NextResponse.json(
        { error: 'Invalid record format' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        }
      );
    }

    // Try to save to Firebase first
    console.log('[API] Attempting to save to Firebase...');
    let success = await saveToFirebaseLeaderboard(record);
    console.log('[API] Firebase save result:', { success });
    
    // If Firebase save fails, try MongoDB
    if (!success) {
      console.log('[API] Firebase save failed, trying MongoDB...');
      success = await saveToSharedLeaderboard(record);
      console.log('[API] MongoDB save result:', { success });
    }
    
    if (!success) {
      console.error('[API] Both Firebase and MongoDB saves failed');
      return NextResponse.json(
        { error: 'Failed to save to leaderboard' },
        { 
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        }
      );
    }

    console.log('[API] Successfully saved record');
    const response = NextResponse.json(
      { success: true },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
    
    console.log('[API] Response being sent:', {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    return response;
  } catch (error) {
    console.error('[API] Error saving to leaderboard:', error);
    if (error instanceof Error) {
      console.error('[API] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return NextResponse.json(
      { error: 'Failed to save to leaderboard' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } finally {
    console.log('[API] ===== Completed POST request for leaderboard =====');
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  );
} 