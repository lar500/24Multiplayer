// app/api/socket/route.ts

import { NextResponse } from "next/server";
import { Server as SocketIOServer } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { Solver } from "../../utils/solver"; // adjust path if needed

// Force dynamic (no caching)
export const dynamic = "force-dynamic";

// —— Types —— //
type Puzzle = ReturnType<typeof Solver.generatePuzzle>;

interface Player {
  id: string;
  name: string;
  ready: boolean;
  score: number;
}

interface LastSolution {
  playerName: string;
  solution: string;
  time: number;
}

interface GameState {
  roomId: string;
  creatorId: string;
  players: Player[];
  isActive: boolean;
  currentPuzzle: Puzzle;
  puzzleQueue: Puzzle[];
  targetScore: number;
  gameOver: boolean;
  winner: string | null;
  winnerDetails: Player | null;
  lastSolution: LastSolution | null;
}

// —— In‑Memory Store & Globals —— //
let globalSocketIO: SocketIOServer | null = null;

// —— Main WebSocket Upgrade Handler —— //
export async function GET() {
  // Create a “next” response so the WebSocket upgrade can proceed
  const response = NextResponse.next();

  // Only initialize Socket.IO once
  if (!globalSocketIO) {
    // Optional Redis adapter
    let adapter;
    if (process.env.REDIS_URL) {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      adapter = createAdapter(pubClient, subClient);
    }

    // @ts-expect-error NextResponse.socket.server is not in the official types
    const io = new SocketIOServer(response.socket.server, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
      transports: ["websocket", "polling"],
      pingTimeout: 20000,
      pingInterval: 10000,
      ...(adapter ? { adapter } : {}),
    });
    globalSocketIO = io;

    // Use GameState directly (no empty Room interface)
    const rooms = new Map<string, GameState>();

    io.on("connection", (socket) => {
      console.log("🔌 Socket connected:", socket.id);

      // — join_room —
      socket.on(
        "join_room",
        ({
          roomId,
          playerName,
          targetScore = 5,
        }: {
          roomId: string;
          playerName: string;
          targetScore?: number;
        }) => {
          let state = rooms.get(roomId);
          if (!state) {
            state = {
              roomId,
              creatorId: socket.id,
              players: [],
              isActive: false,
              currentPuzzle: [] as Puzzle,
              puzzleQueue: Array.from({ length: 10 }, () =>
                Solver.generatePuzzle()
              ),
              targetScore,
              gameOver: false,
              winner: null,
              winnerDetails: null,
              lastSolution: null,
            };
            rooms.set(roomId, state);
            console.log(`✨ Created room ${roomId}`);
          }

          const idx = state.players.findIndex((p) => p.id === socket.id);
          if (idx >= 0) {
            state.players[idx].name = playerName;
          } else {
            state.players.push({
              id: socket.id,
              name: playerName,
              ready: false,
              score: 0,
            });
          }

          socket.join(roomId);
          io.to(roomId).emit("game_state_update", state);
        }
      );

      // — player_ready —
      socket.on("player_ready", ({ roomId }: { roomId: string }) => {
        const state = rooms.get(roomId);
        if (!state) return;

        const idx = state.players.findIndex((p) => p.id === socket.id);
        if (idx >= 0) state.players[idx].ready = true;

        const allReady =
          state.players.length >= 2 && state.players.every((p) => p.ready);
        if (allReady && !state.isActive) {
          state.isActive = true;
          state.currentPuzzle = state.puzzleQueue.shift()!;
        }

        io.to(roomId).emit("game_state_update", state);
      });

      // — submit_solution —
      socket.on(
        "submit_solution",
        ({
          roomId,
          solution,
        }: {
          roomId: string;
          solution: string;
        }) => {
          const state = rooms.get(roomId);
          if (!state) return;

          const player = state.players.find((p) => p.id === socket.id);
          if (!player) return;

          player.score += 1;
          state.lastSolution = {
            playerName: player.name,
            solution,
            time: Date.now(),
          };

          if (player.score >= state.targetScore) {
            state.gameOver = true;
            state.winner = player.id;
            state.winnerDetails = { ...player };
            state.isActive = false;
          } else {
            state.currentPuzzle = state.puzzleQueue.shift()!;
            state.puzzleQueue.push(Solver.generatePuzzle());
          }

          io.to(roomId).emit("game_state_update", state);
        }
      );
    });

    console.log("📡 Socket.IO initialized");
  }

  return response;
}
