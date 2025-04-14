// Define the type for a speedrun record
export type SpeedrunRecord = {
  id: string;
  userId: string;
  name: string;
  date: string;
  totalTime: number;
  splits: number[];
};

// Save a record to the global leaderboard
export async function saveToGlobalLeaderboard(record: SpeedrunRecord): Promise<boolean> {
  try {
    const response = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record),
    });
    
    if (!response.ok) {
      throw new Error('Failed to save to global leaderboard');
    }
    
    return true;
  } catch (error) {
    console.error('Error saving to global leaderboard:', error);
    return false;
  }
}

// Get all records from the global leaderboard
export async function getGlobalLeaderboard(): Promise<SpeedrunRecord[]> {
  try {
    const response = await fetch('/api/leaderboard');
    
    if (!response.ok) {
      throw new Error('Failed to fetch global leaderboard');
    }
    
    const data = await response.json();
    return data.records;
  } catch (error) {
    console.error('Error fetching global leaderboard:', error);
    return [];
  }
}

// Get user's personal records
export async function getUserLeaderboard(userId: string): Promise<SpeedrunRecord[]> {
  try {
    const response = await fetch(`/api/leaderboard/user/${userId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch user leaderboard');
    }
    
    const data = await response.json();
    return data.records;
  } catch (error) {
    console.error('Error fetching user leaderboard:', error);
    return [];
  }
}

// Format time in milliseconds to mm:ss.ms
export function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor((ms % 1000) / 10);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
} 