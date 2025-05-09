import type { SpeedrunRecord } from './leaderboard';
import { database } from './firebase';
import { ref, get, set, query, orderByChild, limitToFirst } from 'firebase/database';

// Get all records from the global leaderboard
export async function getSharedLeaderboard(): Promise<SpeedrunRecord[]> {
  try {
    const leaderboardRef = ref(database, 'leaderboard');
    const leaderboardQuery = query(leaderboardRef, orderByChild('totalTime'), limitToFirst(100));
    const snapshot = await get(leaderboardQuery);
    
    if (!snapshot.exists()) {
      return [];
    }

    const records: SpeedrunRecord[] = [];
    snapshot.forEach((childSnapshot) => {
      records.push(childSnapshot.val());
    });

    return records;
  } catch (error) {
    console.error('Error fetching shared leaderboard:', error);
    return [];
  }
}

// Add a new record to the global leaderboard
export async function saveToSharedLeaderboard(record: SpeedrunRecord): Promise<boolean> {
  try {
    // Validate the record
    if (!record.id || !record.userId || !record.name || !record.date || !record.totalTime || !Array.isArray(record.splits)) {
      console.error('Invalid record format');
      return false;
    }

    const recordRef = ref(database, `leaderboard/${record.id}`);
    await set(recordRef, record);
    return true;
  } catch (error) {
    console.error('Error saving to shared leaderboard:', error);
    return false;
  }
}

// Get user's personal records from the shared leaderboard
export async function getUserSharedLeaderboard(userId: string): Promise<SpeedrunRecord[]> {
  try {
    const leaderboardRef = ref(database, 'leaderboard');
    const userQuery = query(
      leaderboardRef,
      orderByChild('userId'),
      limitToFirst(100)
    );
    const snapshot = await get(userQuery);
    
    if (!snapshot.exists()) {
      return [];
    }

    const records: SpeedrunRecord[] = [];
    snapshot.forEach((childSnapshot) => {
      const record = childSnapshot.val();
      if (record.userId === userId) {
        records.push(record);
      }
    });

    return records.sort((a, b) => a.totalTime - b.totalTime);
  } catch (error) {
    console.error('Error fetching user shared leaderboard:', error);
    return [];
  }
} 