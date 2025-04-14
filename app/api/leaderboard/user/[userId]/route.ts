// app/api/leaderboard/user/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSharedLeaderboard } from '../../../../utils/sharedLeaderboard';
import type { SpeedrunRecord } from '../../../../utils/leaderboard';

export async function GET(
  _request: NextRequest,
  { params }: { params: { userId: string } }
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