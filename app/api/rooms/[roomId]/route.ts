// app/api/rooms/[roomId]/route.ts

import { NextResponse } from "next/server";
import { createClient } from "redis";
import { Solver } from "../../../utils/solver";

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
const REDIS_TIMEOUT = 2000;

// Initialize Redis connection
async function initializeRedis() {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL environment variable is not set.");
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      connectTimeout: REDIS_TIMEOUT,
      reconnectStrategy: (retries) => {
        if (retries > 3) {
          return new Error("Max reconnection attempts reached");
        }
        return Math.min(retries * 50, 500);
      }
    }
  });

  redisClient.on("error", (err) => {
    console.error("Redis Client Error:", err);
    if (err.message.includes("connection") || err.message.includes("ECONNREFUSED")) {
      redisClient = null;
    }
  });

  redisClient.on("connect", () => {
    console.log("Redis connected successfully");
  });

  redisClient.on("reconnecting", () => {
    console.log("Redis reconnecting...");
  });

  try {
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    redisClient = null;
    throw error;
  }
}

// Get Redis client with automatic initialization
async function getRedis() {
  if (!redisClient?.isOpen) {
    await initializeRedis();
  }
  return redisClient!;
}

// —— State helpers —— //
async function loadState(
  roomId: string,
  targetScore?: number
): Promise<GameState> {
  try {
    const redis = await getRedis();
    const key = `room:${roomId}`;
    
    const raw = await Promise.race([
      redis.get(key),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Redis operation timeout")), REDIS_TIMEOUT)
      )
    ]);

    if (raw) {
      try {
        return JSON.parse(raw) as GameState;
      } catch (e) {
        console.error("Failed to parse state from Redis:", e);
      }
    }

    // Initialize new state
    const initialQueue = Array.from({ length: 5 }, () => Solver.generatePuzzle());
    const state: GameState = {
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
    
    // Save initial state
    await Promise.race([
      redis.set(key, JSON.stringify(state)),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Redis operation timeout")), REDIS_TIMEOUT)
      )
    ]);
    return state;
  } catch (error) {
    console.error(`Failed to load state for room ${roomId}:`, error);
    
    // Return initial state without Redis
    const initialQueue = Array.from({ length: 5 }, () => Solver.generatePuzzle());
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
    await Promise.race([
      redis.set(`room:${state.roomId}`, JSON.stringify(state)),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Redis operation timeout")), REDIS_TIMEOUT)
      )
    ]);
  } catch (err) {
    console.error(`Failed to save state for room ${state.roomId}:`, err);
  }
}

// —— Route handlers —— //
export async function GET(request: Request) {
  const roomId = request.url.split('/').pop();
  if (!roomId) {
    return NextResponse.json({ error: "Room ID is required" }, { status: 400 });
  }

  try {
    const state = await loadState(roomId);
    return NextResponse.json(state);
  } catch (err: unknown) {
    console.error(`GET /api/rooms/${roomId} error:`, err);
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

export async function POST(request: Request) {
  const roomId = request.url.split('/').pop();
  if (!roomId) {
    return NextResponse.json({ error: "Room ID is required" }, { status: 400 });
  }

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
    if (!action) {
      return NextResponse.json({ error: "Missing required field: action" }, { status: 400 });
    }
    if (!playerId) {
      return NextResponse.json({ error: "Missing required field: playerId" }, { status: 400 });
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
      // Check if player name is already taken by another player
      const nameTaken = state.players.some(p => p.name === playerName && p.id !== playerId);
      if (nameTaken) {
        return NextResponse.json({ error: "Player name is already taken" }, { status: 400 });
      }

      if (playerIndex >= 0) {
        // Player rejoins or updates name
        state.players[playerIndex].name = playerName!;
        state.players[playerIndex].ready = false;
      } else {
        // Check if game is already active
        if (state.isActive) {
          return NextResponse.json({ error: "Cannot join: Game is already in progress" }, { status: 400 });
        }
        // Check if game is over
        if (state.gameOver) {
          return NextResponse.json({ error: "Cannot join: Game is over" }, { status: 400 });
        }
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
          state.puzzleQueue = Array.from({ length: 5 }, () => Solver.generatePuzzle());
        }
        state.currentPuzzle = state.puzzleQueue.shift()!;
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
          state.puzzleQueue.push(Solver.generatePuzzle());
        }
        state.currentPuzzle = state.puzzleQueue.shift()!;
        state.puzzleQueue.push(Solver.generatePuzzle());
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