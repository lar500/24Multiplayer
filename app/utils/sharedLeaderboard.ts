import fs from 'fs';
import path from 'path';
import type { SpeedrunRecord } from './leaderboard';

// Path to the JSON file that will store the global leaderboard
const LEADERBOARD_FILE = path.join(process.cwd(), 'data', 'global_leaderboard.json');

// Ensure the data directory exists
const ensureDataDir = () => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

// Initialize the leaderboard file if it doesn't exist
const initializeLeaderboard = () => {
  ensureDataDir();
  if (!fs.existsSync(LEADERBOARD_FILE)) {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify([]));
  }
};

// Load the leaderboard from file
const loadLeaderboard = () => {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const data = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error loading leaderboard from file:', error);
    return [];
  }
};

// Save the leaderboard to file
const saveLeaderboard = (records: SpeedrunRecord[]) => {
  try {
    ensureDataDir();
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(records, null, 2));
  } catch (error) {
    console.error('Error saving leaderboard to file:', error);
  }
};

// Initialize the leaderboard
initializeLeaderboard();

// Get all records from the global leaderboard
export async function getSharedLeaderboard(): Promise<SpeedrunRecord[]> {
  try {
    const records = loadLeaderboard();
    // Sort records by total time
    return [...records].sort((a, b) => a.totalTime - b.totalTime);
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

    // Get current records
    const records = loadLeaderboard();
    
    // Add the new record
    records.push(record);
    
    // Save all records
    saveLeaderboard(records);

    return true;
  } catch (error) {
    console.error('Error saving to shared leaderboard:', error);
    return false;
  }
}

// Get user's personal records from the shared leaderboard
export async function getUserSharedLeaderboard(userId: string): Promise<SpeedrunRecord[]> {
  try {
    const records = loadLeaderboard();
    
    // Filter records by user ID
    const userRecords = records.filter((record: SpeedrunRecord) => record.userId === userId);
    
    // Sort records by total time
    return [...userRecords].sort((a, b) => a.totalTime - b.totalTime);
  } catch (error) {
    console.error('Error fetching user shared leaderboard:', error);
    return [];
  }
} 