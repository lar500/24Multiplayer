"use client";

export default function MigratePage() {
  async function migrateLeaderboard() {
    try {
      console.log("Starting leaderboard migration...");

      // Get all records from Firebase using REST API
      const response = await fetch("/api/leaderboard");
      if (!response.ok) {
        throw new Error(`Failed to fetch from Firebase: ${response.status}`);
      }

      const data = await response.json();
      if (!data.records || data.records.length === 0) {
        console.log("No records found in Firebase");
        return;
      }

      const records = data.records;
      console.log(`Found ${records.length} records to migrate`);
      document.getElementById(
        "status"
      )!.textContent = `Found ${records.length} records to migrate...`;

      // Save each record to the new leaderboard
      for (const record of records) {
        try {
          const saveResponse = await fetch("/api/leaderboard", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(record),
          });

          if (!saveResponse.ok) {
            console.error(
              `Failed to migrate record ${record.id}:`,
              await saveResponse.text()
            );
            continue;
          }

          console.log(`Successfully migrated record ${record.id}`);
          document.getElementById(
            "status"
          )!.textContent = `Migrated record ${record.id}...`;
        } catch (error) {
          console.error(`Error migrating record ${record.id}:`, error);
        }
      }

      console.log("Migration completed");
      document.getElementById("status")!.textContent =
        "Migration completed successfully!";
    } catch (error) {
      console.error("Migration failed:", error);
      document.getElementById("status")!.textContent =
        "Migration failed: " + (error as Error).message;
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl p-6">
        <h1 className="text-2xl font-bold mb-4">Leaderboard Migration</h1>
        <div id="status" className="mb-4 text-gray-600">
          Click the button below to start migration...
        </div>
        <button
          onClick={() => migrateLeaderboard()}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Start Migration
        </button>
      </div>
    </div>
  );
}
