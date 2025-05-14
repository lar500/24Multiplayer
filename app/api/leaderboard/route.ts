import { NextResponse } from 'next/server';
import type { SpeedrunRecord } from '../../utils/leaderboard';
import { getSharedLeaderboard, saveToSharedLeaderboard } from '../../utils/sharedLeaderboard';
import { saveToFirebaseLeaderboard } from '../../utils/firebaseLeaderboard';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase, DataSnapshot } from 'firebase-admin/database';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    });
    console.log('[API] Firebase Admin initialized successfully');
  } catch (error) {
    console.error('[API] Failed to initialize Firebase Admin:', error);
  }
}

// Get all records from the global leaderboard
export async function GET() {
  console.log('[API] ===== Starting GET request for leaderboard =====');
  
  try {
    // Get the database instance
    const database = getDatabase();
    console.log('[API] Got database instance');
    
    const leaderboardRef = database.ref('leaderboard');
    console.log('[API] Created leaderboard reference');
    
    // Try Firebase first with a timeout
    console.log('[API] Attempting to fetch from Firebase...');
    try {
      const snapshot = await leaderboardRef.get();
      console.log('[API] Got snapshot:', { exists: snapshot.exists() });
      
      let records: SpeedrunRecord[] = [];
      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          records.push(childSnapshot.val() as SpeedrunRecord);
        });
      }
      
      console.log('[API] Firebase response:', { 
        recordCount: records.length,
        records: records
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
      
      return response;
    } catch (firebaseError) {
      console.error('[API] Firebase error:', firebaseError);
      throw firebaseError;
    }
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