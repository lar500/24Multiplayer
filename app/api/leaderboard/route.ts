import { NextResponse } from 'next/server';
import type { SpeedrunRecord } from '../../utils/leaderboard';
import { getSharedLeaderboard, saveToSharedLeaderboard } from '../../utils/sharedLeaderboard';

// Get all records from the global leaderboard
export async function GET() {
  try {
    // Get records from the shared leaderboard
    const records = await getSharedLeaderboard();
    return NextResponse.json({ records });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
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
        { status: 400 }
      );
    }

    // Save to the shared leaderboard
    const success = await saveToSharedLeaderboard(record);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to save to leaderboard' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving to leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to save to leaderboard' },
      { status: 500 }
    );
  }
} 