// app/api/room/[roomId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { Solver } from "../../../utils/solver"; // Assuming Solver exists here

// —— Types —— //
type Puzzle = ReturnType<typeof Solver.generatePuzzle>;

type Player = {
  id: string;
  name: string;
  ready: boolean;
  score: number;
};

type LastSolution = {
  playerName: string;
  solution: string;
  time: number;
};

type GameState = {
  roomId: string;
  players: Player[];
  isActive: boolean;
  currentPuzzle: Puzzle;
  puzzleQueue: Puzzle[];
  targetScore: number;
  gameOver: boolean;
  winner: string | null;
  winnerDetails: Player | null;
  lastSolution: LastSolution | null;
};

// —— Redis setup —— //
let redisClient: ReturnType<typeof createClient> | null = null;
async function getRedis() {
  if (!redisClient) {
    // Ensure REDIS_URL is set in your environment variables
    if (!process.env.REDIS_URL) {
      throw new Error("REDIS_URL environment variable is not set.");
    }
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", (err) => console.error("Redis Client Error", err));
    await redisClient.connect();
  }
  return redisClient;
}

// —— State helpers —— //
async function loadState(
  roomId: string,
  targetScore?: number
): Promise<GameState> {
  const redis = await getRedis();
  const key = `room:${roomId}`;
  const raw = await redis.get(key);
  if (raw) {
     try {
        return JSON.parse(raw) as GameState;
     } catch (e) {
        console.error("Failed to parse state from Redis:", e);
        // Handle potential corrupted data - maybe return initial state?
     }
  }


  // Initialize state if not found or if parsing failed
  const initialQueue = Array.from({ length: 10 }, () =>
    Solver.generatePuzzle()
  );
  const state: GameState = {
    roomId,
    players: [],
    isActive: false,
    currentPuzzle: [] as Puzzle, // Assuming Puzzle is an array type, adjust if not
    puzzleQueue: initialQueue,
    targetScore: targetScore ?? 5,
    gameOver: false,
    winner: null,
    winnerDetails: null,
    lastSolution: null,
  };
  // Don't save initial state immediately here, let POST handle initial creation if needed
  // await redis.set(key, JSON.stringify(state));
  return state;
}

async function saveState(state: GameState) {
  try {
      const redis = await getRedis();
      await redis.set(`room:${state.roomId}`, JSON.stringify(state));
  } catch (err) {
      console.error(`Failed to save state for room ${state.roomId}:`, err);
      // Decide how to handle save failures. Maybe throw an error?
  }
}

// —— GET handler —— //
export async function GET(
  _: NextRequest, // Using 'request' for clarity, '_' is also fine if unused
  context: { params: Promise<{ roomId: string }> } // Corrected type
) {
  const roomId = (await context.params).roomId;
  try {
    const state = await loadState(roomId);
    // If loadState returns the initial state because nothing was in Redis,
    // it might be better to return a 404 if the room truly doesn't exist yet,
    // depending on desired behavior. For now, it returns the initial state structure.
    // const raw = await (await getRedis()).get(`room:${roomId}`);
    // if (!raw) {
    //     return NextResponse.json({ error: "Room not found" }, { status: 404 });
    // }
    return NextResponse.json(state);
  } catch (err: unknown) {
    console.error(`GET /api/room/${roomId} error:`, err);
    // Check if error is due to Redis connection and return appropriate status
    if (err instanceof Error && err.message.includes("Redis")) {
       return NextResponse.json(
         { error: "Database connection error" },
         { status: 503 } // Service Unavailable
       );
    }
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

// —— POST handler —— //
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> } // Corrected type
) {
  const roomId = (await context.params).roomId;
  let state: GameState | null = null; // Define state outside try block

  try {
    const body = await request.json();
    const { action, playerId, playerName, targetScore, solution } = body as {
      action: "join" | "ready" | "submit";
      playerId: string;
      playerName?: string;
      targetScore?: number;
      solution?: string;
    };

    // Validate required fields based on action
    if (!action || !playerId) {
        return NextResponse.json({ error: "Missing required fields: action or playerId" }, { status: 400 });
    }
    if (action === "join" && !playerName) {
        return NextResponse.json({ error: "Missing required field for join: playerName" }, { status: 400 });
    }
     if (action === "submit" && !solution) {
        return NextResponse.json({ error: "Missing required field for submit: solution" }, { status: 400 });
    }

    state = await loadState(roomId, targetScore); // Load or initialize state

    const playerIndex = state.players.findIndex((p) => p.id === playerId);

    if (action === "join") {
      if (playerIndex >= 0) {
        // Player rejoins or updates name
        state.players[playerIndex].name = playerName!;
        state.players[playerIndex].ready = false; // Reset ready state on rejoin? Optional.
      } else {
        // New player joins
        state.players.push({
          id: playerId,
          name: playerName!,
          ready: false,
          score: 0,
        });
      }
    } else if (action === "ready") {
       if (playerIndex < 0) {
           return NextResponse.json({ error: "Player not found" }, { status: 404 });
       }
       state.players[playerIndex].ready = true;

       // Check if game should start
       const canStart = state.players.length >= 2 && state.players.every((p) => p.ready);
       if (canStart && !state.isActive) {
           state.isActive = true;
           if (state.puzzleQueue.length === 0) {
              // Regenerate puzzles if queue is empty (shouldn't normally happen with initial load)
              console.warn(`Puzzle queue empty for room ${roomId}, regenerating.`);
              state.puzzleQueue = Array.from({ length: 10 }, () => Solver.generatePuzzle());
           }
           state.currentPuzzle = state.puzzleQueue.shift()!;
           // Ensure currentPuzzle is valid
           if (!state.currentPuzzle) {
               console.error(`Failed to get puzzle from queue for room ${roomId}`);
               return NextResponse.json({ error: "Failed to start game: No puzzles available" }, { status: 500 });
           }
       }
    } else if (action === "submit") {
        if (playerIndex < 0) {
           return NextResponse.json({ error: "Player not found" }, { status: 404 });
        }
        const player = state.players[playerIndex];

        // Add validation: Can only submit if game is active and not over
        if (!state.isActive || state.gameOver) {
            return NextResponse.json({ error: "Game is not active or already over" }, { status: 400 });
        }

        player.score += 1; // Assume solution is correct for now
        state.lastSolution = {
          playerName: player.name,
          solution: solution!,
          time: Date.now(),
        };

        if (player.score >= state.targetScore) {
          state.gameOver = true;
          state.winner = player.id;
          state.winnerDetails = { ...player }; // Copy player details at time of winning
          state.isActive = false; // Game ends
        } else {
          // Provide next puzzle
           if (state.puzzleQueue.length === 0) {
              console.warn(`Puzzle queue empty during play for room ${roomId}, regenerating.`);
              state.puzzleQueue.push(Solver.generatePuzzle()); // Add at least one more
           }
           state.currentPuzzle = state.puzzleQueue.shift()!;
           state.puzzleQueue.push(Solver.generatePuzzle()); // Keep queue populated
           if (!state.currentPuzzle) {
               console.error(`Failed to get next puzzle from queue for room ${roomId}`);
                state.gameOver = true; // End game if no more puzzles
                state.isActive = false;
               // Potentially set winner based on score or handle differently
                return NextResponse.json({ error: "Game ended: No more puzzles available" }, { status: 500 });
           }
        }
    } else {
         return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await saveState(state); // Save the updated state
    return NextResponse.json(state); // Return the new state

  } catch (err: unknown) {
    console.error(`POST /api/room/${roomId} error:`, err);
     // Check if error is due to Redis connection
    if (err instanceof Error && err.message.includes("Redis")) {
       return NextResponse.json(
         { error: "Database connection error" },
         { status: 503 } // Service Unavailable
       );
    }
    // Attempt to save state even if there was an error during processing? Risky.
    // if (state) {
    //     console.warn(`Attempting to save state for room ${roomId} after encountering processing error.`);
    //     await saveState(state);
    // }
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}