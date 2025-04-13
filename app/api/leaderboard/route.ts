import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type { SpeedrunRecord } from '../../utils/leaderboard';

// Path to the JSON file that will store the global leaderboard
const LEADERBOARD_FILE = path.join(process.cwd(), 'data', 'global_leaderboard.json');

// In-memory storage for the leaderboard (replace with a database in production)
let globalLeaderboard: SpeedrunRecord[] = [];

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
      globalLeaderboard = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading leaderboard from file:', error);
  }
};

// Save the leaderboard to file
const saveLeaderboard = () => {
  try {
    ensureDataDir();
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(globalLeaderboard));
  } catch (error) {
    console.error('Error saving leaderboard to file:', error);
  }
};

// Initialize and load the leaderboard
initializeLeaderboard();
loadLeaderboard();

// Get all records from the global leaderboard
export async function GET() {
  try {
    // Sort records by total time
    const sortedRecords = [...globalLeaderboard].sort((a, b) => a.totalTime - b.totalTime);
    return NextResponse.json({ records: sortedRecords });
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
    if (!record.id || !record.name || !record.date || !record.totalTime || !Array.isArray(record.splits)) {
      return NextResponse.json(
        { error: 'Invalid record format' },
        { status: 400 }
      );
    }

    // Add the record to the leaderboard
    globalLeaderboard.push(record);
    
    // Sort records by total time
    globalLeaderboard.sort((a, b) => a.totalTime - b.totalTime);
    
    // Keep only the top 100 records
    globalLeaderboard = globalLeaderboard.slice(0, 100);

    // Save to file
    saveLeaderboard();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving to leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to save to leaderboard' },
      { status: 500 }
    );
  }
} 