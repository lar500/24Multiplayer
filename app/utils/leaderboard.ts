// Define the SpeedrunRecord type
export interface SpeedrunRecord {
  id: string
  userId: string
  name: string
  date: string
  totalTime: number
  splits: number[]
  score?: number
  gameType?: "speedrun" | "multiplayer"
  isMultiplayer?: boolean
  roomId?: string
  targetScore?: number
}

// Save a record to the global leaderboard
export async function saveToGlobalLeaderboard(record: SpeedrunRecord): Promise<boolean> {
  try {
    console.log("[Leaderboard] Starting save to global leaderboard:", {
      id: record.id,
      name: record.name,
      totalTime: record.totalTime,
      date: record.date,
      userId: record.userId,
      splitsLength: record.splits.length
    });

    // Add retry logic for better reliability
    let retries = 3;
    let success = false;

    while (retries > 0 && !success) {
      try {
        console.log(`[Leaderboard] Attempt ${4 - retries} of 3 to save record`);
        const response = await fetch("/api/leaderboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(record),
        });

        console.log("[Leaderboard] Save response:", {
          status: response.status,
          statusText: response.statusText
        });

        if (!response.ok) {
          console.error("[Leaderboard] Failed to save to global leaderboard:", response.status, response.statusText);
          retries--;
          if (retries > 0) {
            console.log(`[Leaderboard] Retrying... (${retries} attempts left)`);
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retrying
          }
          continue;
        }

        const data = await response.json();
        console.log("[Leaderboard] Save response data:", data);
        success = data.success;

        if (success) {
          console.log("[Leaderboard] Successfully saved record to global leaderboard!");
          return true;
        } else {
          console.error("[Leaderboard] Server returned success: false");
          retries--;
        }
      } catch (fetchError) {
        console.error("[Leaderboard] Fetch error when saving to global leaderboard:", fetchError);
        retries--;
        if (retries > 0) {
          console.log(`[Leaderboard] Retrying... (${retries} attempts left)`);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retrying
        }
      }
    }

    if (!success) {
      console.error("[Leaderboard] All save attempts failed");
    }
    return success;
  } catch (error) {
    console.error("[Leaderboard] Error saving to global leaderboard:", error);
    return false;
  }
}

// Get the global leaderboard
export async function getGlobalLeaderboard(): Promise<SpeedrunRecord[]> {
  try {
    console.log("Fetching global leaderboard...")

    // Add retry logic for better reliability
    let retries = 3

    while (retries > 0) {
      try {
        const response = await fetch("/api/leaderboard")

        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()

        if (data.error) {
          throw new Error(data.error)
        }

        console.log(`Successfully retrieved ${data.records?.length || 0} leaderboard records`)
        return data.records || []
      } catch (fetchError) {
        console.error(`Error fetching global leaderboard (${retries} retries left):`, fetchError)
        retries--
        if (retries > 0) {
          console.log("Waiting before retry...")
          await new Promise((resolve) => setTimeout(resolve, 1000)) // Wait 1 second before retrying
        }
      }
    }

    console.error("All retries failed when fetching global leaderboard")
    return []
  } catch (error) {
    console.error("Error in getGlobalLeaderboard:", error)
    return []
  }
}

// Get a user's personal leaderboard
export async function getUserLeaderboard(
  userId: string,
  gameType?: "speedrun" | "multiplayer",
): Promise<SpeedrunRecord[]> {
  try {
    if (!userId) {
      throw new Error("User ID is required")
    }

    const response = await fetch(`/api/leaderboard/user/${userId}`)

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(data.error)
    }

    let records = data.records || []

    // Filter by game type if specified
    if (gameType) {
      records = records.filter(
        (record: SpeedrunRecord) =>
          record.gameType === gameType || (gameType === "multiplayer" && record.isMultiplayer === true),
      )
    }

    return records
  } catch (error) {
    console.error("Error fetching user leaderboard:", error)
    return []
  }
}

// Save a multiplayer game result to the leaderboard
export async function saveMultiplayerResult(
  playerName: string,
  score: number,
  roomId: string,
  targetScore: number,
  gameTime?: number,
): Promise<boolean> {
  try {
    const record: SpeedrunRecord = {
      id: `mp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      userId: localStorage.getItem("userId") || `guest-${Date.now()}`,
      name: playerName,
      date: new Date().toISOString(),
      totalTime: gameTime || Date.now(),
      splits: [],
      score: score,
      gameType: "multiplayer",
      isMultiplayer: true,
      roomId: roomId,
      targetScore: targetScore,
    }

    return await saveToGlobalLeaderboard(record)
  } catch (error) {
    console.error("Error saving multiplayer result:", error)
    return false
  }
}
