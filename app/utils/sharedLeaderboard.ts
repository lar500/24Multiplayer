import type { SpeedrunRecord } from './leaderboard';
import connectDB from './mongodb';
import { Leaderboard } from '../models/Leaderboard';

// Get all records from the global leaderboard
export async function getSharedLeaderboard(): Promise<SpeedrunRecord[]> {
  try {
    await connectDB();
    const records = await Leaderboard.find().sort({ totalTime: 1 });
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

    await connectDB();
    await Leaderboard.create(record);
    return true;
  } catch (error) {
    console.error('Error saving to shared leaderboard:', error);
    return false;
  }
}

// Get user's personal records from the shared leaderboard
export async function getUserSharedLeaderboard(userId: string): Promise<SpeedrunRecord[]> {
  try {
    await connectDB();
    const records = await Leaderboard.find({ userId }).sort({ totalTime: 1 });
    return records;
  } catch (error) {
    console.error('Error fetching user shared leaderboard:', error);
    return [];
  }
} 