import { NextResponse } from 'next/server';
import type { SpeedrunRecord } from '../../utils/leaderboard';
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
      Object.values(data).forEach((record: unknown) => {
        if (isSpeedrunRecord(record)) {
          records.push(record);
        }
      });
    }

    // Sort records by totalTime (ascending - fastest times first)
    records.sort((a, b) => a.totalTime - b.totalTime);

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

// Type guard to check if an object is a SpeedrunRecord
function isSpeedrunRecord(obj: unknown): obj is SpeedrunRecord {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'userId' in obj &&
    'name' in obj &&
    'date' in obj &&
    'totalTime' in obj &&
    'splits' in obj &&
    Array.isArray((obj as SpeedrunRecord).splits)
  );
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

    // Save to Firebase
    console.log('[API] Attempting to save to Firebase...');
    const success = await saveToFirebaseLeaderboard(record);
    console.log('[API] Firebase save result:', { success });
    
    if (!success) {
      console.error('[API] Failed to save to Firebase');
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