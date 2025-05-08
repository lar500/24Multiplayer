import type { SpeedrunRecord } from './leaderboard';
import { database } from './firebase';
import { ref, get, set, query, orderByChild, limitToFirst } from 'firebase/database';

// Get all records from the global leaderboard using Firebase
export async function getFirebaseLeaderboard(): Promise<SpeedrunRecord[]> {
  try {
    console.log('[Firebase] Attempting to fetch leaderboard...');
    const leaderboardRef = ref(database, 'leaderboard');
    console.log('[Firebase] Created leaderboard reference');
    
    const leaderboardQuery = query(leaderboardRef, orderByChild('totalTime'), limitToFirst(100));
    console.log('[Firebase] Created query');
    
    const snapshot = await get(leaderboardQuery);
    console.log('[Firebase] Got snapshot:', snapshot.exists() ? 'exists' : 'empty');
    
    if (!snapshot.exists()) {
      console.log('[Firebase] No records found');
      return [];
    }

    const records: SpeedrunRecord[] = [];
    snapshot.forEach((childSnapshot) => {
      records.push(childSnapshot.val());
    });
    console.log('[Firebase] Retrieved records:', records.length);

    return records;
  } catch (error) {
    console.error('[Firebase] Error fetching leaderboard:', error);
    if (error instanceof Error) {
      console.error('[Firebase] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return [];
  }
}

// Add a new record to the global leaderboard using Firebase
export async function saveToFirebaseLeaderboard(record: SpeedrunRecord): Promise<boolean> {
  try {
    console.log('[Firebase] Attempting to save record:', record);
    
    // Validate the record
    if (!record.id || !record.userId || !record.name || !record.date || !record.totalTime || !Array.isArray(record.splits)) {
      console.error('[Firebase] Invalid record format:', record);
      return false;
    }

    const recordRef = ref(database, `leaderboard/${record.id}`);
    console.log('[Firebase] Created record reference');
    
    await set(recordRef, record);
    console.log('[Firebase] Successfully saved record');
    
    return true;
  } catch (error) {
    console.error('[Firebase] Error saving to leaderboard:', error);
    if (error instanceof Error) {
      console.error('[Firebase] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return false;
  }
}

// Get user's personal records from the Firebase leaderboard
export async function getUserFirebaseLeaderboard(userId: string): Promise<SpeedrunRecord[]> {
  try {
    console.log('[Firebase] Attempting to fetch user records for:', userId);
    
    const leaderboardRef = ref(database, 'leaderboard');
    const userQuery = query(
      leaderboardRef,
      orderByChild('userId'),
      limitToFirst(100)
    );
    const snapshot = await get(userQuery);
    
    if (!snapshot.exists()) {
      console.log('[Firebase] No records found for user');
      return [];
    }

    const records: SpeedrunRecord[] = [];
    snapshot.forEach((childSnapshot) => {
      const record = childSnapshot.val();
      if (record.userId === userId) {
        records.push(record);
      }
    });
    console.log('[Firebase] Retrieved user records:', records.length);

    return records.sort((a, b) => a.totalTime - b.totalTime);
  } catch (error) {
    console.error('[Firebase] Error fetching user leaderboard:', error);
    if (error instanceof Error) {
      console.error('[Firebase] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    return [];
  }
} 