import { NextResponse } from 'next/server';
import type { SpeedrunRecord } from '../../utils/leaderboard';
import { getSharedLeaderboard, saveToSharedLeaderboard } from '../../utils/sharedLeaderboard';
import { getFirebaseLeaderboard, saveToFirebaseLeaderboard } from '../../utils/firebaseLeaderboard';

// Get all records from the global leaderboard
export async function GET() {
  try {
    // Try Firebase first
    let records = await getFirebaseLeaderboard();
    
    // If Firebase returns no records, try MongoDB
    if (records.length === 0) {
      console.log('No records in Firebase, trying MongoDB...');
      records = await getSharedLeaderboard();
    }
    
    // Add CORS headers
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
    console.error('Error fetching leaderboard:', error);
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
  }
}

// Add a new record to the global leaderboard
export async function POST(request: Request) {
  try {
    const record: SpeedrunRecord = await request.json();
    
    // Validate the record
    if (!record.id || !record.userId || !record.name || !record.date || !record.totalTime || !Array.isArray(record.splits)) {
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
    let success = await saveToFirebaseLeaderboard(record);
    
    // If Firebase save fails, try MongoDB
    if (!success) {
      console.log('Firebase save failed, trying MongoDB...');
      success = await saveToSharedLeaderboard(record);
    }
    
    if (!success) {
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

    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (error) {
    console.error('Error saving to leaderboard:', error);
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