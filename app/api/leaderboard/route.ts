import { NextResponse } from 'next/server';
import type { SpeedrunRecord } from '../../utils/leaderboard';
import { saveToSharedLeaderboard } from '../../utils/sharedLeaderboard';
import { saveToFirebaseLeaderboard } from '../../utils/firebaseLeaderboard';

// Get all records from the global leaderboard
export async function GET() {
  console.log('[API] ===== Starting GET request for leaderboard =====');
  
  try {
    const databaseUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Firebase database URL not configured');
    }

    console.log('[API] Attempting to fetch from Firebase REST API...');
    const response = await fetch(`${databaseUrl}/leaderboard.json`);
    
    if (!response.ok) {
      throw new Error(`Firebase REST API responded with ${response.status}`);
    }

    const data = await response.json();
    console.log('[API] Firebase response:', { data });

    const records: SpeedrunRecord[] = [];
    if (data) {
      Object.values(data).forEach((record: any) => {
        records.push(record as SpeedrunRecord);
      });
    }

    console.log('[API] Processed records:', { 
      recordCount: records.length,
      records: records
    });

    return NextResponse.json(
      { records },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
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