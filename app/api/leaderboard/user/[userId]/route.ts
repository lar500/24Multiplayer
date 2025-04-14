// app/api/leaderboard/user/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSharedLeaderboard } from '../../../../utils/sharedLeaderboard';
import type { SpeedrunRecord } from '../../../../utils/leaderboard';

// Define the exact type structure that Next.js expects
type Params = {
  userId: string;
};

export async function GET(
  _request: NextRequest,
  context: { params: Params }
) {
  try {
    const { userId } = context.params;
    
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