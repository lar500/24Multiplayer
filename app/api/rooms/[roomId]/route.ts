// app/api/rooms/[roomId]/route.ts

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
let isConnecting = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

async function getRedis() {
  // If already connected, return the client
  if (redisClient?.isOpen) {
    return redisClient;
  }

  // If someone else is already connecting, wait for that to finish
  if (isConnecting) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (redisClient?.isOpen) {
      return redisClient;
    }
  }

  connectionAttempts++;
  isConnecting = true;

  try {
    // Check for max connection attempts
    if (connectionAttempts > MAX_CONNECTION_ATTEMPTS) {
      console.error(`Max Redis connection attempts (${MAX_CONNECTION_ATTEMPTS}) reached.`);
      throw new Error("Max Redis connection attempts reached");
    }

    // Ensure REDIS_URL is set in your environment variables
    if (!process.env.REDIS_URL) {
      throw new Error("REDIS_URL environment variable is not set.");
    }

    // Create a new client if needed
    if (!redisClient) {
      redisClient = createClient({ url: process.env.REDIS_URL });
      
      redisClient.on("error", (err) => {
        console.error("Redis Client Error", err);
        // Reset client on serious errors
        if (err.message.includes("connection") || err.message.includes("ECONNREFUSED")) {
          redisClient = null;
        }
      });
    }

    // Connect if not already connected
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log("Redis connected successfully");
    }

    return redisClient;
  } catch (error) {
    console.error("Redis connection error:", error);
    // Reset client on connection error
    redisClient = null;
    throw error;
  } finally {
    isConnecting = false;
  }
}

// —— State helpers —— //
async function loadState(
  roomId: string,
  targetScore?: number
): Promise<GameState> {
  try {
    const redis = await getRedis();
    const key = `room:${roomId}`;
    const raw = await redis.get(key);
    if (raw) {
      try {
        return JSON.parse(raw) as GameState;
      } catch (e) {
        console.error("Failed to parse state from Redis:", e);
        // Handle potential corrupted data - return initial state
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
    
    // Save initial state immediately to handle race conditions
    await redis.set(key, JSON.stringify(state));
    return state;
  } catch (error) {
    // If Redis is unavailable, return an in-memory state as fallback
    console.error(`Failed to load state for room ${roomId}:`, error);
    
    const initialQueue = Array.from({ length: 10 }, () =>
      Solver.generatePuzzle()
    );
    return {
      roomId,
      players: [],
      isActive: false,
      currentPuzzle: [] as Puzzle,
      puzzleQueue: initialQueue,
      targetScore: targetScore ?? 5,
      gameOver: false,
      winner: null,
      winnerDetails: null,
      lastSolution: null,
    };
  }
}

async function saveState(state: GameState) {
  try {
    const redis = await getRedis();
    await redis.set(`room:${state.roomId}`, JSON.stringify(state));
  } catch (err) {
    console.error(`Failed to save state for room ${state.roomId}:`, err);
    // Just log the error, don't throw - allow the API to return successful response
    // even if Redis save failed
  }
}

// —— GET handler —— //
export async function GET(
  { params }: { params: { roomId: string } }
) {
  const { roomId } = params;
  try {
    const state = await loadState(roomId);
    return NextResponse.json(state);
  } catch (err: unknown) {
    console.error(`GET /api/rooms/${roomId} error:`, err);
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
  { params }: { params: { roomId: string } }
) {
  const { roomId } = params;
  let state: GameState | null = null;

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

    state = await loadState(roomId, targetScore);
    const playerIndex = state.players.findIndex((p) => p.id === playerId);

    if (action === "join") {
      if (playerIndex >= 0) {
        // Player rejoins or updates name
        state.players[playerIndex].name = playerName!;
        state.players[playerIndex].ready = false;
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
          console.warn(`Puzzle queue empty for room ${roomId}, regenerating.`);
          state.puzzleQueue = Array.from({ length: 10 }, () => Solver.generatePuzzle());
        }
        state.currentPuzzle = state.puzzleQueue.shift()!;
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

      if (!state.isActive || state.gameOver) {
        return NextResponse.json({ error: "Game is not active or already over" }, { status: 400 });
      }

      player.score += 1;
      state.lastSolution = {
        playerName: player.name,
        solution: solution!,
        time: Date.now(),
      };

      if (player.score >= state.targetScore) {
        state.gameOver = true;
        state.winner = player.id;
        state.winnerDetails = { ...player };
        state.isActive = false;
      } else {
        if (state.puzzleQueue.length === 0) {
          console.warn(`Puzzle queue empty during play for room ${roomId}, regenerating.`);
          state.puzzleQueue.push(Solver.generatePuzzle());
        }
        state.currentPuzzle = state.puzzleQueue.shift()!;
        state.puzzleQueue.push(Solver.generatePuzzle());
        if (!state.currentPuzzle) {
          console.error(`Failed to get next puzzle from queue for room ${roomId}`);
          state.gameOver = true;
          state.isActive = false;
          return NextResponse.json({ error: "Game ended: No more puzzles available" }, { status: 500 });
        }
      }
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await saveState(state);
    return NextResponse.json(state);
  } catch (err: unknown) {
    console.error(`POST /api/rooms/${roomId} error:`, err);
    if (err instanceof Error && err.message.includes("Redis")) {
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}