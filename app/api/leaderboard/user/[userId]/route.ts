import { NextRequest, NextResponse } from 'next/server';
import { getSharedLeaderboard } from '../../../../utils/sharedLeaderboard';
import type { SpeedrunRecord } from '../../../../utils/leaderboard';

type RouteContext = {
  params: {
    userId: string;
  };
};

// Get user-specific records from the global leaderboard
export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const userId = params.userId;
    
    // Get all records from the shared leaderboard
    const allRecords = await getSharedLeaderboard();
    
    // Filter records for the specific user
    const userRecords = allRecords.filter((record: SpeedrunRecord) => record.userId === userId);
    
    return NextResponse.json({ records: userRecords });
  } catch (error) {
    console.error('Error fetching user leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user leaderboard' },
      { status: 500 }
    );
  }
} 