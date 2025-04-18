// app/api/rooms/[roomId]/route.ts

import { NextResponse } from "next/server";
import { createClient } from "redis";
import { Solver } from "../../../utils/solver";

// —— Types —— //
// A single puzzle (array of 4 numbers)
type Puzzle = ReturnType<typeof Solver.generatePuzzle>;

// A player in the room
type Player = {
  id: string;
  name: string;
  ready: boolean;
  score: number;
};

// Last solution record
type LastSolution = {
  playerName: string;
  solution: string;
  time: number; // timestamp in ms
};

// Full game state
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

// Redis client singleton
let redisClient: ReturnType<typeof createClient> | null = null;
async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL! });
    redisClient.on("error", (err) => console.error("Redis Error", err));
    await redisClient.connect();
  }
  return redisClient;
}

// Helper: load or init state
async function loadState(roomId: string, targetScore?: number): Promise<GameState> {
  const redis = await getRedis();
  const key = `room:${roomId}`;
  const raw = await redis.get(key);
  if (raw) {
    return JSON.parse(raw) as GameState;
  }
  // initialize new state
  const initialQueue = Array.from({ length: 10 }, () => Solver.generatePuzzle());
  const state: GameState = {
    roomId,
    players: [],
    isActive: false,
    currentPuzzle: [] as Puzzle,
    puzzleQueue: initialQueue,
    targetScore: targetScore || 5,
    gameOver: false,
    winner: null,
    winnerDetails: null,
    lastSolution: null,
  };
  await redis.set(key, JSON.stringify(state));
  return state;
}

// Save updated state
async function saveState(state: GameState) {
  const redis = await getRedis();
  await redis.set(`room:${state.roomId}`, JSON.stringify(state));
}

export async function GET(
  _: Request,
  { params }: { params: { roomId: string } }
) {
  try {
    const state = await loadState(params.roomId);
    return NextResponse.json(state);
  } catch (err: any) {
    console.error("GET /api/rooms/[roomId] error", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { roomId: string } }
) {
  try {
    const { action, playerId, playerName, targetScore, solution } =
      (await request.json()) as {
        action: 'join' | 'ready' | 'submit';
        playerId: string;
        playerName?: string;
        targetScore?: number;
        solution?: string;
      };

    const state = await loadState(params.roomId, targetScore);

    if (action === 'join') {
      // add or update player
      const idx = state.players.findIndex((p) => p.id === playerId);
      if (idx >= 0) {
        state.players[idx].name = playerName!;
      } else {
        state.players.push({ id: playerId, name: playerName!, ready: false, score: 0 });
      }
    } else if (action === 'ready') {
      const p = state.players.find((p) => p.id === playerId);
      if (p) p.ready = true;
      // start game if all ready
      if (state.players.length >= 2 && state.players.every((p) => p.ready)) {
        state.isActive = true;
        state.currentPuzzle = state.puzzleQueue.shift()!;
      }
    } else if (action === 'submit') {
      const p = state.players.find((p) => p.id === playerId);
      if (p && state.isActive && !state.gameOver) {
        p.score += 1;
        state.lastSolution = { playerName: p.name, solution: solution!, time: Date.now() };
        if (p.score >= state.targetScore) {
          state.gameOver = true;
          state.winner = p.id;
          state.winnerDetails = { ...p };
        } else {
          state.currentPuzzle = state.puzzleQueue.shift()!;
          state.puzzleQueue.push(Solver.generatePuzzle());
        }
      }
    }

    await saveState(state);
    return NextResponse.json(state);
  } catch (err: any) {
    console.error("POST /api/rooms/[roomId] error", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}