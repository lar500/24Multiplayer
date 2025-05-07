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
const REDIS_RETRY_DELAY = 500;

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
        return Math.min(retries * REDIS_RETRY_DELAY, 1000);
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

// Get Redis client with automatic initialization and retry
async function getRedis() {
  let retries = 0;
  while (retries < 3) {
    try {
      if (!redisClient?.isOpen) {
        await initializeRedis();
      }
      return redisClient!;
    } catch (error) {
      retries++;
      if (retries === 3) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, REDIS_RETRY_DELAY));
    }
  }
  throw new Error("Failed to get Redis client after retries");
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
        const state = JSON.parse(raw) as GameState;
        // Ensure players is always an array
        if (!Array.isArray(state.players)) {
          console.warn(`[loadState] Players is not an array, fixing:`, state.players);
          state.players = [];
        }
        // Ensure all required fields are present
        const validatedState: GameState = {
          roomId: state.roomId || roomId,
          players: Array.isArray(state.players) ? state.players.map(p => ({
            id: p.id,
            name: p.name,
            ready: !!p.ready,
            score: Number(p.score) || 0
          })) : [],
          isActive: !!state.isActive,
          currentPuzzle: Array.isArray(state.currentPuzzle) ? state.currentPuzzle : [],
          puzzleQueue: Array.isArray(state.puzzleQueue) ? state.puzzleQueue : [],
          targetScore: Number(state.targetScore) || targetScore || 5,
          gameOver: !!state.gameOver,
          winner: state.winner || null,
          winnerDetails: state.winnerDetails ? {
            id: state.winnerDetails.id,
            name: state.winnerDetails.name,
            ready: !!state.winnerDetails.ready,
            score: Number(state.winnerDetails.score) || 0
          } : null,
          lastSolution: state.lastSolution ? {
            playerName: state.lastSolution.playerName,
            solution: state.lastSolution.solution,
            time: Number(state.lastSolution.time) || Date.now()
          } : null
        };
        console.log(`[loadState] Loaded and validated state from Redis:`, validatedState);
        return validatedState;
      } catch (e) {
        console.error("[loadState] Failed to parse state from Redis:", e);
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
    console.log(`[loadState] Created new state:`, state);
    return state;
  } catch (error) {
    console.error(`[loadState] Failed to load state for room ${roomId}:`, error);
    throw error;
  }
}

async function saveState(state: GameState) {
  try {
    const redis = await getRedis();
    const key = `room:${state.roomId}`;
    
    // Create a clean copy of the state for serialization
    const stateToSave: GameState = {
      roomId: state.roomId,
      players: state.players.map(p => ({
        id: p.id,
        name: p.name,
        ready: !!p.ready,
        score: Number(p.score) || 0
      })),
      isActive: !!state.isActive,
      currentPuzzle: Array.isArray(state.currentPuzzle) ? state.currentPuzzle : [],
      puzzleQueue: Array.isArray(state.puzzleQueue) ? state.puzzleQueue : [],
      targetScore: Number(state.targetScore) || 5,
      gameOver: !!state.gameOver,
      winner: state.winner || null,
      winnerDetails: state.winnerDetails ? {
        id: state.winnerDetails.id,
        name: state.winnerDetails.name,
        ready: !!state.winnerDetails.ready,
        score: Number(state.winnerDetails.score) || 0
      } : null,
      lastSolution: state.lastSolution ? {
        playerName: state.lastSolution.playerName,
        solution: state.lastSolution.solution,
        time: Number(state.lastSolution.time) || Date.now()
      } : null
    };
    
    console.log(`[saveState] Prepared state for saving:`, stateToSave);
    const serializedState = JSON.stringify(stateToSave);
    console.log(`[saveState] Serialized state:`, serializedState);
    
    await Promise.race([
      redis.set(key, serializedState),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Redis operation timeout")), REDIS_TIMEOUT)
      )
    ]);
    
    // Verify the state was saved correctly
    const saved = await redis.get(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      console.log(`[saveState] Verified saved state:`, parsed);
      if (!parsed.players || !Array.isArray(parsed.players)) {
        console.error(`[saveState] Saved state is invalid:`, parsed);
        throw new Error("State verification failed");
      }
    }
  } catch (err) {
    console.error(`[saveState] Failed to save state for room ${state.roomId}:`, err);
    throw err;
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

    console.log(`[POST] Received ${action} request:`, { roomId, playerId, playerName });

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

    try {
      state = await loadState(roomId, targetScore);
      console.log(`[POST] Loaded state for room ${roomId}:`, state);
    } catch (error) {
      console.error(`[POST] Failed to load state:`, error);
      return NextResponse.json(
        { error: "Failed to load game state" },
        { status: 500 }
      );
    }

    // Ensure players is always an array
    if (!Array.isArray(state.players)) {
      console.warn(`[POST] Players is not an array, fixing:`, state.players);
      state.players = [];
    }

    const playerIndex = state.players.findIndex((p) => p.id === playerId);

    if (action === "join") {
      console.log(`[POST] Processing join request for player ${playerId}`);
      
      // Check if player name is already taken by another player
      const nameTaken = state.players.some(p => p.name === playerName && p.id !== playerId);
      if (nameTaken) {
        return NextResponse.json({ error: "Player name is already taken" }, { status: 400 });
      }

      if (playerIndex >= 0) {
        // Player rejoins or updates name
        console.log(`[POST] Updating existing player ${playerId}`);
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
        console.log(`[POST] Adding new player ${playerId}`);
        const newPlayer = {
          id: playerId,
          name: playerName!,
          ready: false,
          score: 0,
        };
        state.players.push(newPlayer);
        console.log(`[POST] Added player to state:`, newPlayer);
      }

      try {
        // Save state immediately after modifying
        await saveState(state);
        console.log(`[POST] Saved state after join:`, state);
        
        // Verify the player is in the state
        const playerInState = state.players.find(p => p.id === playerId);
        if (!playerInState) {
          console.error(`[POST] Player not found in state after join:`, state);
          throw new Error("Failed to add player to state");
        }
      } catch (error) {
        console.error(`[POST] Failed to save state after join:`, error);
        return NextResponse.json(
          { error: "Failed to save game state" },
          { status: 500 }
        );
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

    try {
      // Save state after all operations
      await saveState(state);
      console.log(`[POST] Final state after ${action}:`, state);
      
      // Verify state before sending response
      if (!state.players || !Array.isArray(state.players)) {
        console.error(`[POST] Invalid state before response:`, state);
        throw new Error("Invalid state structure");
      }
      
      // Create a clean copy of the state for the response
      const responseState = {
        ...state,
        players: [...state.players]
      };
      
      return NextResponse.json(responseState);
    } catch (error) {
      console.error(`[POST] Failed to save final state:`, error);
      return NextResponse.json(
        { error: "Failed to save game state" },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error(`[POST] Error processing request for room ${roomId}:`, err);
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