import type { SpeedrunRecord } from '../app/utils/leaderboard';

async function migrateLeaderboard() {
  try {
    console.log('Starting leaderboard migration...');
    
    // Get Firebase database URL from environment
    const databaseUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Firebase database URL not configured');
    }

    // Get all records from Firebase using REST API
    const response = await fetch(`${databaseUrl}/leaderboard.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch from Firebase: ${response.status}`);
    }

    const data = await response.json();
    if (!data) {
      console.log('No records found in Firebase');
      return;
    }

    const records: SpeedrunRecord[] = Object.values(data);
    console.log(`Found ${records.length} records to migrate`);

    // Save each record to the new leaderboard
    for (const record of records) {
      try {
        const saveResponse = await fetch('/api/leaderboard', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(record),
        });

        if (!saveResponse.ok) {
          console.error(`Failed to migrate record ${record.id}:`, await saveResponse.text());
          continue;
        }

        console.log(`Successfully migrated record ${record.id}`);
      } catch (error) {
        console.error(`Error migrating record ${record.id}:`, error);
      }
    }

    console.log('Migration completed');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run the migration
migrateLeaderboard(); 